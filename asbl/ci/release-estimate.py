#!/usr/bin/env python3
"""The release round's one calculation: how long each lane takes, read from the last release runs' marks, and when each
part of a round would start and end on which machine, for the chosen Advanced (Parallelization) values.

Called by asbl/ci/release-machines.sh (its `lanes`, `files` and `schedule` subcommands), which release-rehearsal.sh and
release-orchestrator.sh source; a person or an AI agent runs it through that script. Read only: it reads run folders and
Playwright JSON reports, and writes nothing.

  release-estimate.py lanes    --runs <RUN_RECORD_DIR>
      one "<lane> <minutes> <where from>" line per lane: build auth full-web full-docker-server linux-proof pack prepare
      docker-proof server-light electron-light robot
  release-estimate.py files    --runs <RUN_RECORD_DIR> --target web|docker-server
      the time per spec file of that target's newest passed full set: "<minutes> <file>" lines, longest first, then
      "SETUP <minutes>" (the lane's time before Playwright) and "RATIO <wall/test time>" (Playwright's overhead)
  release-estimate.py schedule --runs <RUN_RECORD_DIR> --target <t> --jobs N --vms "<names>" --layout <name>="<lanes>"...
                               [--steps together|in-order] [--server-gb G] [--vm-gb G] [--vms-off "<names>"]
      the round's parts per machine with their expected start, end and minutes, the total and the memory it needs
  release-estimate.py estimates --runs <RUN_RECORD_DIR> --target <t> --vms-named "<names>" --layout <M>:<name>="<lanes>"...
                               [--steps together|in-order] [--server-gb G] [--vm-gb G] [--min-free-gb G]
                               [--refused <N>:<M>="<why>"]...
      the 16 Advanced (Parallelization) choices, N and M from 1 to 4, as JSON on stdout (release-rehearsal.sh estimate
      writes it to RELEASE_ESTIMATES_FILE, which the job's form reads): for each, the parts with their times, the Gantt
      chart's lines, the total and the gain against 1 and 1, the memory it needs, and why the press refuses it (the
      rules of release-machines.sh check, given by --refused)
  release-estimate.py block    --estimates <that JSON> --jobs N --vms M [--meminfo /proc/meminfo]
      the block the job's form draws under the two choices: what the press refuses, the memory line (the host's
      available memory now), the Gantt chart, the total and the gain. asbl/ci/jenkins/release-estimate-block.groovy
      draws the same text from the same JSON in the form (keep the two in step: asbl/ci/tests/test-estimate.sh)

Where the times come from: the real (not dry-run) orchestrator run folders under --runs (<UTC>-release-orchestrator-*),
newest first; each lane takes its time from the newest run in which it passed (its exit code 0), as the PART lines of
run.log and the marks of the part logs (######## ... END rc=0 ... took=<s>s) give it. A lane no run has passed takes the
16.6.2 release's time (DEFAULT_MINUTES, measured 2026-11-04). The full set's time per file comes from the Playwright JSON
the lane's log names (E2E_JSON_REPORT=), so subsets can be estimated (and balanced: shard_files).
"""
import argparse
import glob
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

# The 16.6.2 release's lane times (round 20261103T231939Z, plan 16.6.3 TODO 1), used for a lane no run has passed yet
DEFAULT_MINUTES = {
    "build": 34, "auth": 20, "full-web": 640, "full-docker-server": 620, "linux-proof": 55, "pack": 77, "prepare": 58,
    "docker-proof": 230, "server-light": 119, "electron-light": 83, "robot": 41,
}
VM_LANES = ("pack", "docker-proof", "server-light", "electron-light", "robot")
E2E_VM_LANES = ("docker-proof", "server-light", "electron-light")   # each needs the VM's e2e package (the prepare)
LICENCE_SPECS = ("specs/components/license.spec.ts", "specs/areas/processing-license.spec.ts")
RUNS_TO_READ = 12   # the newest real runs read for the lane times


def parse_utc(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def read_text(path):
    try:
        with open(path, "rb") as f:
            return f.read().decode("utf-8", "replace").replace("\r", "")
    except OSError:
        return ""


def real_run_folders(runs):
    folders = [d for d in glob.glob(os.path.join(runs, "*-release-orchestrator-*"))
               if os.path.isdir(d) and not d.endswith("-dry-run")]
    return sorted(folders, reverse=True)[:RUNS_TO_READ]


def part_minutes(run_log):
    """{part id: minutes} from run.log's PART <id> START <utc> / PART <id> END rc=<rc> <utc> lines"""
    starts, minutes = {}, {}
    for m in re.finditer(r"^PART +(\S+) START (\S+)", run_log, re.M):
        starts[m.group(1)] = parse_utc(m.group(2))
    for m in re.finditer(r"^PART +(\S+) END rc=\S+ (\S+)", run_log, re.M):
        if m.group(1) in starts:
            minutes[m.group(1)] = (parse_utc(m.group(2)) - starts[m.group(1)]).total_seconds() / 60
    return minutes


def passed(folder, part):
    return read_text(os.path.join(folder, part + ".rc")).strip() == "0"


def mark_minutes(log, label):
    """the minutes of a mark that ended rc=0 in a log (its took=<s>s), or None"""
    m = re.search(r"^######## " + re.escape(label) + r" END rc=0 .*?took=(\d+)s", log, re.M)
    return int(m.group(1)) / 60 if m else None


def prepare_minutes(log):
    """the VM's e2e package prepared inside a log: from '>>> npmwc started' to '<<< prepare finished EXIT=0', or 0"""
    start = re.search(r"^>>> npmwc started .*?(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)", log, re.M)
    end = re.search(r"^<<< prepare finished +EXIT=0 +(\S+)", log, re.M)
    if not start or not end:
        return 0.0
    return max(0.0, (parse_utc(end.group(1)) - parse_utc(start.group(1))).total_seconds() / 60)


def section(log, label):
    m = re.search(r"^######## " + re.escape(label) + r" START.*?^######## " + re.escape(label) + r" END[^\n]*", log,
                  re.M | re.S)
    return m.group(0) if m else ""


def lanes_of_run(folder):
    """{lane: minutes} of the lanes that passed in one run folder (16.6.2's part names and marks)"""
    found = {}
    run_log = read_text(os.path.join(folder, "run.log"))
    parts = part_minutes(run_log)
    for part, minutes in parts.items():
        if not passed(folder, part):
            continue
        if part in ("step1-build", "build") and minutes > 5:        # a build that found one already takes seconds
            found["build"] = minutes
        elif part.startswith("lane2-") and part.endswith("-auth"):
            found["auth"] = minutes
        elif re.match(r"lane1-(web|docker-server)-full$", part):
            found["full-" + part[len("lane1-"):-len("-full")]] = minutes
        elif part == "windows-pack":
            found["pack"] = minutes
    linux = read_text(os.path.join(folder, "docker-linux.log"))
    if passed(folder, "docker-linux") or mark_minutes(linux, "DOCKER RELEASE STEP 3/6") is not None:
        v = mark_minutes(linux, "DOCKER RELEASE STEP 3/6")
        if v is not None:
            found["linux-proof"] = v
        v = mark_minutes(linux, "DOCKER RELEASE STEP 2/6")
        if v is not None and v > 5 and "build" not in found:
            found["build"] = v
    docker = read_text(os.path.join(folder, "docker-windows.log"))
    v = mark_minutes(docker, "DOCKER RELEASE STEP 4/6")
    if v is not None:
        prep = prepare_minutes(docker)
        found["docker-proof"] = v - prep
        if prep > 5:
            found["prepare"] = prep
    # one VM: the after-pack half's log; more VMs: each lane's own part (windows-<lane>.log) and each VM's prepare part
    after = read_text(os.path.join(folder, "windows-after-pack.log"))
    for lane, label in (("server-light", "RELEASE STEP 2/5"), ("electron-light", "RELEASE STEP 3/5"),
                        ("robot", "RELEASE STEP 4/5")):
        log = after if mark_minutes(after, label) is not None else read_text(os.path.join(folder, "windows-%s.log" % lane))
        v = mark_minutes(log, label)
        if v is not None:
            prep = prepare_minutes(section(log, label))
            found[lane] = v - prep
            if prep > 5 and "prepare" not in found:
                found["prepare"] = prep
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if "prepare" not in found and re.match(r"windows-prepare-[a-z0-9]+\.log$", name):
            prep = prepare_minutes(read_text(os.path.join(folder, name)))
            if prep > 5:   # a stamp of this commit already there takes seconds
                found["prepare"] = prep
    return found


def lane_minutes(runs):
    """{lane: (minutes, where from)}: each lane from the newest real run it passed in, else the 16.6.2 default"""
    result = {}
    for folder in real_run_folders(runs):
        for lane, minutes in lanes_of_run(folder).items():
            result.setdefault(lane, (minutes, os.path.basename(folder)))
    for lane, minutes in DEFAULT_MINUTES.items():
        result.setdefault(lane, (float(minutes), "default (the 16.6.2 release)"))
    return result


def playwright_files(report):
    """({file: minutes}, wall minutes) of one Playwright JSON report: each file's results' durations, retries included"""
    data = json.loads(read_text(report))
    per_file = {}

    def walk(suite, file_name):
        file_name = suite.get("file") or file_name
        for spec in suite.get("specs", []):
            f = spec.get("file") or file_name
            for test in spec.get("tests", []):
                for r in test.get("results", []):
                    per_file[f] = per_file.get(f, 0.0) + r.get("duration", 0) / 60000
        for child in suite.get("suites", []):
            walk(child, file_name)

    for top in data.get("suites", []):
        walk(top, None)
    return per_file, data.get("stats", {}).get("duration", 0) / 60000


def full_set_files(runs, target):
    """the newest passed full set of a target: ({file: minutes}, setup minutes, ratio, where from), or None"""
    for folder in real_run_folders(runs):
        parts = part_minutes(read_text(os.path.join(folder, "run.log")))
        lane_parts = [p for p in parts if re.match(r"lane1-%s-full(-\d+of\d+)?$" % re.escape(target), p) and passed(folder, p)]
        if not lane_parts:
            continue
        per_file, wall_total, test_total, setups = {}, 0.0, 0.0, []
        for part in lane_parts:
            m = re.search(r"E2E_JSON_REPORT=(\S+)", read_text(os.path.join(folder, part + ".log")))
            if not m or not os.path.isfile(m.group(1)):
                break
            files, wall = playwright_files(m.group(1))
            for f, minutes in files.items():
                per_file[f] = per_file.get(f, 0.0) + minutes
            wall_total += wall
            test_total += sum(files.values())
            setups.append(max(0.0, parts[part] - wall))
        else:
            if per_file and test_total > 0:
                return per_file, sum(setups) / len(setups), wall_total / test_total, os.path.basename(folder)
    return None


def shard_files(per_file, n, files=None):
    """N subsets of the spec files, balanced by their times, longest first onto the least loaded subset; the licence
    specs go together (one activation at a time), a file is never split. files: the files to place (default: those of
    per_file); a file with no time takes the mean of the known ones. Returns [(minutes, [files])], longest first."""
    files = list(per_file) if files is None else list(files)
    known = [per_file[f] for f in files if f in per_file]
    mean = sum(known) / len(known) if known else 1.0
    licence = [f for f in files if f in LICENCE_SPECS]
    items = [(sum(per_file.get(f, mean) for f in licence), licence)] if licence else []
    items += [(per_file.get(f, mean), [f]) for f in files if f not in LICENCE_SPECS]
    items.sort(key=lambda item: (-item[0], item[1]))
    bins = [[0.0, []] for _ in range(n)]
    for minutes, group in items:
        target_bin = min(bins, key=lambda b: (b[0], len(b[1])))
        target_bin[0] += minutes
        target_bin[1].extend(group)
    return sorted(((b[0], b[1]) for b in bins), key=lambda b: -b[0])


def hm(minutes):
    minutes = int(round(minutes))
    return "%d:%02d" % (minutes // 60, minutes % 60)


def about(minutes):
    minutes = int(round(minutes / 5.0)) * 5
    return "%d h %02d" % (minutes // 60, minutes % 60)


def plan_round(lanes, full, target, n, vms, layouts, steps):
    """the parts of a round: [(machine, part, start, end, note)], minutes from the round's start (after step 0)"""
    m = {k: v[0] for k, v in lanes.items()}
    rows = []
    build_end = m["build"]
    rows.append(("host", "build", 0.0, build_end, "the Linux build, once for every part"))
    if full is not None:
        per_file, setup, ratio = full["files"], full["setup"], full["ratio"]
        subsets = [(setup + minutes * ratio, group) for minutes, group in shard_files(per_file, n)]
    else:
        subsets = [(m["full-" + target] / n, [])] * n
    if steps == "in-order":
        # 16.6.2: step 1 (the build, the auth file, the full set), then steps 2 and 3 side by side
        auth_end = build_end + m["auth"]
        step1_end = auth_end + subsets[0][0]
        rows.append(("host", "auth", build_end, auth_end, "step 1"))
        rows.append(("host", "e2e full", auth_end, step1_end, "step 1, whole"))
        rows.append(("host", "Linux proof", step1_end, step1_end + m["linux-proof"], "step 2"))
        offset = step1_end
    else:
        # the steps together on this host's one Docker engine, which runs one DataPallas e2e set at a time (the shipped
        # compose files fix the container names, the ports and the network): the host's parts one after another, step
        # 2's Linux proof first (the VM's Windows Docker proof needs only the build), then step 1; the VMs from the start
        proof_end = build_end + m["linux-proof"]
        auth_end = proof_end + m["auth"]
        rows.append(("host", "Linux proof", build_end, proof_end, "step 2"))
        rows.append(("host", "auth", proof_end, auth_end, "step 1"))
        clock = auth_end
        for k, (minutes, group) in enumerate(subsets, 1):
            label = "e2e full %d/%d" % (k, n) if n > 1 else "e2e full"
            note = "step 1, %d spec files, one subset at a time" % len(group) if n > 1 else "step 1, whole"
            rows.append(("host", label, clock, clock + minutes, note))
            clock += minutes
        offset = 0.0
    # the VMs: each runs its lanes in order, each when its inputs exist; the prepare before its first e2e lane, seconds
    # after a green pack on the same VM (it stamps its NoExe package as the VM's e2e package)
    pack_vm = next((v for v in vms if "pack" in layouts[v]), vms[0])
    clock = {v: offset for v in vms}
    pack_end = None
    pending = {v: list(layouts[v]) for v in vms}
    prepared = {v: False for v in vms}
    progress = True
    while progress and any(pending.values()):
        progress = False
        for v in vms:
            while pending[v]:
                lane = pending[v][0]
                ready = clock[v]
                if lane == "docker-proof":
                    ready = max(ready, build_end)   # the image and the docker zip of the Linux build
                if lane in ("server-light", "robot"):
                    if pack_end is None:
                        break   # waits for the pack, on another VM (or later on this one)
                    ready = max(ready, pack_end)
                if lane in E2E_VM_LANES and not prepared[v]:
                    start = clock[v]
                    if v == pack_vm and pack_end is not None:
                        minutes, note = 0, "kept by the green pack before it: seconds"
                    else:
                        minutes, note = m["prepare"], "the VM's e2e package, once per pin"
                    rows.append(("VM " + v, "prepare", start, start + minutes, note))
                    clock[v] = start + minutes
                    prepared[v] = True
                    ready = max(ready, clock[v])
                end = ready + m[lane]
                note = ""
                if lane == "server-light" and v != pack_vm:
                    note = "waits for the pack's datapallas-server.zip" if ready > clock[v] else ""
                rows.append(("VM " + v, lane, ready, end, note))
                clock[v] = end
                if lane == "pack":
                    pack_end = end
                pending[v].pop(0)
                progress = True
    return rows


CHART_COLUMNS = 48   # the widest bar area of the chart, in characters
MINUTES_PER_COLUMN = (5, 10, 15, 20, 30, 45, 60, 90, 120)
CHART_LEAD = 31   # "VM a   server-light" and its padding: the machine (6), a space, the part (24)


def duration(minutes):
    minutes = int(round(minutes))
    return "%d min" % minutes if minutes < 60 else "%d h %02d" % (minutes // 60, minutes % 60)


def chart(rows):
    """the Gantt chart of a round's parts: an hour axis, then one line per part with its bar from its start to its end
    ('#'), after the dots of its wait on its machine for its inputs ('.'). Returns (lines, minutes per column)"""
    span = max([end for _, _, _, end, _ in rows] + [1.0])
    mpc = next((c for c in MINUTES_PER_COLUMN if math.ceil(span / c) <= CHART_COLUMNS), MINUTES_PER_COLUMN[-1])
    width = int(math.ceil(span / mpc))
    step = next(k for k in (1, 2, 3, 4, 6, 12, 24) if k * 60 / mpc >= 6)
    labels, ticks = [" "] * (width + 8), ["-"] * (width + 1)
    hour = 0
    while hour * 60 <= span:
        col = int(round(hour * 60 / mpc))
        text = "%dh" % hour
        labels[col:col + len(text)] = list(text)
        ticks[col] = "|"
        hour += step
    lines = [" " * CHART_LEAD + "".join(labels).rstrip(), " " * CHART_LEAD + "".join(ticks)]
    machine_end = {}
    for machine, part, start, end, note in rows:
        c0, c1 = int(round(start / mpc)), int(round(end / mpc))
        if end > start and c1 <= c0:
            c1 = c0 + 1   # a short part still shows
        w0 = int(round(machine_end.get(machine, start) / mpc))
        bar = [" "] * max(width, c1)
        for c in range(min(w0, c0), c0):
            bar[c] = "."
        for c in range(c0, c1):
            bar[c] = "#"
        machine_end[machine] = max(machine_end.get(machine, 0.0), end)
        lines.append("%-6s %-24s%s  %s%s" % (machine, part, "".join(bar).ljust(width), duration(end - start),
                                             "  (" + note + ")" if note else ""))
    lines.append(" " * CHART_LEAD + "# runs   . waits on its machine for its inputs (the build, the pack)   one column: %d min" % mpc)
    return lines, mpc


def estimates(args):
    """the 16 choices as one JSON document (release-estimate.py estimates, above)"""
    lanes = lane_minutes(args.runs)
    full = full_set_files(args.runs, args.target)
    full_info = {"files": full[0], "setup": full[1], "ratio": full[2], "from": full[3]} if full is not None else None
    named = args.vms_named.split()
    layouts, refused = {}, {}
    for item in args.layout:
        key, _, lanes_text = item.partition("=")
        m_text, _, name = key.partition(":")
        layouts.setdefault(int(m_text), {})[name] = lanes_text.split()
    for item in args.refused:
        key, _, why = item.partition("=")
        n_text, _, m_text = key.partition(":")
        refused.setdefault((int(n_text), int(m_text)), []).append(why)
    server_gb, vm_gb = int(args.server_gb), int(args.vm_gb)
    pairs, base = [], None
    for n in range(1, 5):
        for m in range(1, 5):
            vms = named[:m]
            missing = m - len(vms)
            servers = n + 1   # the memory rule counts N + 1 host test servers, as release-machines.sh's check does
            started = vms[1:]   # the VMs a round starts: every VM but the first, which runs for the dev gates
            if m == 1:
                vm_text = "no VM to start (VM a only)"
            elif missing:
                vm_text = "%d VM%s at %d GB (%s not created yet)" % (m - 1, "" if m == 2 else "s", vm_gb,
                                                                     "%d of them" % missing if m > 2 else "it is")
            else:
                vm_text = "VM%s %s at %d GB" % ("" if m == 2 else "s", ", ".join(started), vm_gb)
            entry = {
                "jobs": n, "vms": m, "refused": refused.get((n, m), []),
                "need_gb": servers * server_gb + (m - 1) * vm_gb,
                "need_text": "%d host test servers x %d GB; %s" % (servers, server_gb, vm_text),
            }
            why_not = ""
            if missing or any(v not in layouts.get(m, {}) for v in vms):
                why_not = "the layout for %d VMs needs %d VMs named in RELEASE_WINDOWS_VMS (%s)" % (m, m, " ".join(named))
            elif args.steps == "in-order" and (n, m) != (1, 1):
                why_not = "RELEASE_STEPS=in-order runs 16.6.2's order with nothing split: only 1 and 1"
            if why_not:
                entry.update(rows=[], chart=[], minutes_per_column=0, total_min=None,
                             total_line="Total   not estimated: " + why_not)
            else:
                rows = plan_round(lanes, full_info, args.target, n, vms, layouts[m], args.steps)
                total = max(end for _, _, _, end, _ in rows)
                lines, mpc = chart(rows)
                if base is None:
                    base = total   # 1 and 1 comes first
                gain = base - total
                if (n, m) == (1, 1):
                    gain_text = "(the defaults)"
                elif abs(gain) < 5:
                    gain_text = "(the same as with 1 and 1)"
                elif gain > 0:
                    gain_text = "(with 1 and 1: about %s; you gain about %s)" % (about(base), about(gain))
                else:
                    gain_text = "(with 1 and 1: about %s; about %s longer)" % (about(base), about(-gain))
                entry.update(rows=[[machine, part, round(start, 1), round(end, 1), note]
                                   for machine, part, start, end, note in rows],
                             chart=lines, minutes_per_column=mpc, total_min=round(total, 1),
                             total_line="Total   about %s   %s" % (about(total), gain_text))
            pairs.append(entry)
    where = sorted({src for _, src in lanes.values()})
    written = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "written": written, "steps": args.steps, "target": args.target, "server_gb": server_gb, "vm_gb": vm_gb,
        "min_free_gb": int(args.min_free_gb), "vms_named": named, "pairs": pairs,
        "from_line": "From    the estimate of %s (release-rehearsal.sh estimate): the lane times of %s; the time per "
                     "file of %s" % (written, ", ".join(where), full_info["from"] if full_info else "none"),
    }


def available_gb(meminfo):
    """the host's available memory now, whole GB (as release-machines.sh's memory rule reads it), or None"""
    m = re.search(r"^MemAvailable:\s+(\d+)", read_text(meminfo), re.M)
    return int(m.group(1)) // 1048576 if m else None


def block(data, n, m, meminfo):
    """the block of one choice, as the job's form draws it (asbl/ci/jenkins/release-estimate-block.groovy)"""
    lines = []
    pair = next((p for p in data["pairs"] if p["jobs"] == n and p["vms"] == m), None)
    if pair is None:
        lines.append("No estimate for N=%d M=%d: run bash asbl/ci/jenkins/release-rehearsal.sh estimate on the host" % (n, m))
    else:
        lines += ["REFUSED at the press: " + why for why in pair["refused"]]
        lines.append("Memory  needs +%d GB: %s" % (pair["need_gb"], pair["need_text"]))
        available = available_gb(meminfo)
        if available is None:
            lines.append("        available now: unknown (%s could not be read)" % meminfo)
        else:
            left = available - pair["need_gb"]
            warn = "    WARNING: under the %d GB rule (the press refuses it)" % data["min_free_gb"] if left < data["min_free_gb"] else ""
            lines.append("        available now %d GB -> %d GB would stay free%s" % (available, left, warn))
        lines += pair["chart"]
        lines.append(pair["total_line"])
    lines.append(data["from_line"])
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("what", choices=("lanes", "files", "schedule", "estimates", "block"))
    ap.add_argument("--runs", help="every subcommand but block: the run folders whose marks give the times")
    ap.add_argument("--target", default="docker-server", choices=("web", "docker-server"))
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--vms", default="a")
    ap.add_argument("--layout", action="append", default=[])
    ap.add_argument("--steps", default="together", choices=("together", "in-order"))
    ap.add_argument("--server-gb", type=float, default=5)
    ap.add_argument("--vm-gb", type=float, default=12)
    ap.add_argument("--vms-off", default=None, help="the VMs the round would start (default: every VM but the first)")
    ap.add_argument("--vms-named", default="a", help="estimates: the VMs that exist (RELEASE_WINDOWS_VMS)")
    ap.add_argument("--min-free-gb", type=float, default=16)
    ap.add_argument("--refused", action="append", default=[], help='estimates: <N>:<M>="<why the press refuses it>"')
    ap.add_argument("--estimates", help="block: the JSON estimates wrote")
    ap.add_argument("--meminfo", default="/proc/meminfo")
    args = ap.parse_args()
    if args.what == "block":
        try:
            with open(args.estimates, "rb") as f:
                data = json.loads(f.read().decode("utf-8"))
        except (OSError, ValueError) as e:
            print("The estimate could not be read from %s: %s (bash asbl/ci/jenkins/release-rehearsal.sh estimate writes "
                  "it, after each round)" % (args.estimates, e))
            return 1
        print(block(data, args.jobs, int(args.vms), args.meminfo))
        return 0
    if not args.runs:
        ap.error("--runs is required")
    if args.what == "estimates":
        print(json.dumps(estimates(args), indent=1, sort_keys=True))
        return 0
    lanes = lane_minutes(args.runs)
    if args.what == "lanes":
        for lane in DEFAULT_MINUTES:
            print("%-20s %6.1f  %s" % (lane, lanes[lane][0], lanes[lane][1]))
        return 0
    full = full_set_files(args.runs, args.target)
    if args.what == "files":
        if full is None:
            print("NONE no passed full set of %s in %s" % (args.target, args.runs))
            return 1
        per_file, setup, ratio, where = full
        for f, minutes in sorted(per_file.items(), key=lambda kv: -kv[1]):
            print("%7.1f %s" % (minutes, f))
        print("SETUP %.1f\nRATIO %.4f\nFROM %s" % (setup, ratio, where))
        return 0
    vms = args.vms.split()
    layouts = {}
    for item in args.layout:
        name, _, lanes_text = item.partition("=")
        layouts[name] = lanes_text.split()
    full_info = None
    if full is not None:
        full_info = {"files": full[0], "setup": full[1], "ratio": full[2], "from": full[3]}
    rows = plan_round(lanes, full_info, args.target, args.jobs, vms, layouts, args.steps)
    total = max(end for _, _, _, end, _ in rows)
    last = max(rows, key=lambda r: r[3])
    off = vms[1:] if args.vms_off is None else args.vms_off.split()
    servers = args.jobs + 1   # the memory rule counts N + 1 host test servers, as release-machines.sh's check does
    print("SCHEDULE  steps %s; the full set (%s) %s; %d Windows VM%s (%s); minutes from the round's start, after step 0"
          % (args.steps, args.target, "in %d jobs" % args.jobs if args.jobs > 1 else "whole", len(vms),
             "" if len(vms) == 1 else "s", " ".join(vms)))
    for machine, part, start, end, note in rows:
        print("  %-6s %-30s %5s -> %5s  %4d min%s" % (machine, part, hm(start), hm(end), round(end - start),
                                                        "  (" + note + ")" if note else ""))
    print("TOTAL     about %s (the last part to end: %s %s)" % (about(total), last[0], last[1]))
    print("MEMORY    %d host test server%s x %g GB = %g GB; VMs the round starts: %s"
          % (servers, "" if servers == 1 else "s", args.server_gb, servers * args.server_gb,
             ("%s x %g GB = %g GB" % (" ".join(off), args.vm_gb, len(off) * args.vm_gb)) if off else "none"))
    where = sorted({src for _, src in lanes.values()})
    print("FROM      the lane times of %s; the time per file of %s" % (", ".join(where),
                                                                     full_info["from"] if full_info else "none (the whole lane's)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

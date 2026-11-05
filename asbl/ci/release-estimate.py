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

Where the times come from: the real (not dry-run) orchestrator run folders under --runs (<UTC>-release-orchestrator-*),
newest first; each lane takes its time from the newest run in which it passed (its exit code 0), as the PART lines of
run.log and the marks of the part logs (######## ... END rc=0 ... took=<s>s) give it. A lane no run has passed takes the
16.6.2 release's time (DEFAULT_MINUTES, measured 2026-11-04). The full set's time per file comes from the Playwright JSON
the lane's log names (E2E_JSON_REPORT=), so subsets can be estimated (and balanced: shard_files).
"""
import argparse
import glob
import json
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
    after = read_text(os.path.join(folder, "windows-after-pack.log"))
    for lane, label in (("server-light", "RELEASE STEP 2/5"), ("electron-light", "RELEASE STEP 3/5"),
                        ("robot", "RELEASE STEP 4/5")):
        v = mark_minutes(after, label)
        if v is not None:
            prep = prepare_minutes(section(after, label))
            found[lane] = v - prep
            if prep > 5 and "prepare" not in found:
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
        rows.append(("host", "auth (instance 0)", build_end, auth_end, "step 1"))
        rows.append(("host", "e2e full (instance 0)", auth_end, step1_end, "step 1, whole"))
        rows.append(("host", "Linux proof (instance 0)", step1_end, step1_end + m["linux-proof"], "step 2"))
        offset = step1_end
    else:
        for k, (minutes, group) in enumerate(subsets, 1):
            label = "e2e full %d/%d (instance %d)" % (k, n, k - 1) if n > 1 else "e2e full (instance 0)"
            rows.append(("host", label, build_end, build_end + minutes, "%d spec files" % len(group) if group else "whole"))
        auth_end = build_end + m["auth"]
        rows.append(("host", "auth (instance %d)" % n, build_end, auth_end, "step 1's auth file, on step 2's server"))
        rows.append(("host", "Linux proof (instance %d)" % n, auth_end, auth_end + m["linux-proof"], "step 2"))
        offset = 0.0
    # the VMs: each runs its lanes in order, each when its inputs exist; the prepare before its first e2e lane
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
                    rows.append(("VM " + v, "prepare", start, start + m["prepare"], "the VM's e2e package, once per pin"))
                    clock[v] = start + m["prepare"]
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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("what", choices=("lanes", "files", "schedule"))
    ap.add_argument("--runs", required=True)
    ap.add_argument("--target", default="docker-server", choices=("web", "docker-server"))
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--vms", default="a")
    ap.add_argument("--layout", action="append", default=[])
    ap.add_argument("--steps", default="together", choices=("together", "in-order"))
    ap.add_argument("--server-gb", type=float, default=5)
    ap.add_argument("--vm-gb", type=float, default=12)
    ap.add_argument("--vms-off", default=None, help="the VMs the round would start (default: every VM but the first)")
    args = ap.parse_args()
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

#!/usr/bin/env python3
"""The release round's one calculation: how long each lane takes, read from the last release runs' marks, and when each
part of a round would start and end on which machine, for the chosen Advanced (Parallelization) values.

Called by asbl/ci/release-machines.sh (its `lanes`, `files` and `schedule` subcommands), which release-rehearsal.sh and
release-orchestrator.sh source; a person or an AI agent runs it through that script. Read only: it reads run folders and
Playwright JSON reports, and writes nothing.

  release-estimate.py lanes    --runs <RUN_RECORD_DIR>
      one "<lane> <minutes> <where from>" line per lane: build auth full-web full-docker-server linux-proof pack prepare
      docker-proof server-light electron-light robot runner-start runner-images
  release-estimate.py files    --runs <RUN_RECORD_DIR> --target web|docker-server
      the time per spec file of that target's newest passed full set: "<minutes> <file>" lines, longest first, then
      "SETUP <minutes>" (the lane's time before Playwright) and "RATIO <wall/test time>" (Playwright's overhead)
  release-estimate.py schedule --runs <RUN_RECORD_DIR> --target <t> --jobs N --vms "<names>" --layout <name>="<lanes>"...
                               [--steps together|in-order] [--runners yes|no] [--server-gb G] [--vm-gb G]
                               [--vms-off "<names>"]
      the round's parts per machine with their expected start, end and minutes, the total and the memory it needs
  release-estimate.py estimates --runs <RUN_RECORD_DIR> --target <t> --vms-named "<names>" --layout <M>:<name>="<lanes>"...
                               [--steps together|in-order] [--runners yes|no] [--server-gb G] [--vm-gb G]
                               [--min-free-gb G] [--refused <N>:<M>="<why>"]...
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
the lane's log names (E2E_JSON_REPORT=), so subsets can be estimated (and balanced: shard_files); a full set run in
runners (E2E_MERGED_LOG=) gives each runner's own report, with its own setup. The Linux proof's time comes from its own
part's log when it has one (docker-linux-proof.log, with the runners), else from the linux part's (docker-linux.log).

The runners (--runners yes, the machines file's RELEASE_RUNNERS, with the steps together): step 1's full set runs in N
runners at once, each a Docker engine of its own on this host (asbl/ci/e2e-runners.sh), all started at the build's end;
each runs its list of asbl/ci/full-set-runners.txt (1 job: the whole full set in runner 1), its time the setup plus
Playwright's ratio times its files' test minutes, after its start: its engine, this checkout and the CI caches copied in
(runner-start), then the images (runner-images), from the RUNNER <n> marks of the newest real run that has them, else
DEFAULT_MINUTES. This host's own engine meanwhile runs the auth file once the runners' caches are copied in (this
host's lanes write the checkout and the caches), then step 2's Linux proof. The rows of a runner say "runner <n>" where
a machine's name goes. --runners no (or the steps in order): the full set whole on this host's engine, after the Linux
proof and the auth file, as before the runners.

The names (PART_NAMES): each part says which test set it runs and where, the same name on every machine (Linux, Win VM
<name>); its note says its step and its counts, and under the chart "What each part runs" says what each name runs, with
the counts of the newest runs that passed it (result.txt, test_counts) and the lists of this checkout (light-set.txt, the
Robot suites).
"""
import argparse
import glob
import importlib.util
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

# The 16.6.2 release's lane times (round 20261103T231939Z, plan 16.6.3 TODO 1), used for a lane no run has passed yet.
# runner-start (a runner's engine, this checkout and the CI caches copied in: what this host's auth file waits for) and
# runner-images (its images copied by id) are not measured: no runner ran before the 16.6.3 release. They are a first
# start's guess from what it copies (this host's sizes on 2026-11-05: the checkout 9 GB, the caches 12 GB, the images of
# the runner's list 10 GB); a later start copies only what changed. The 16.6.3 release's RUNNER <n> marks replace them.
DEFAULT_MINUTES = {
    "build": 34, "auth": 20, "full-web": 640, "full-docker-server": 620, "linux-proof": 55, "pack": 77, "prepare": 58,
    "docker-proof": 230, "server-light": 119, "electron-light": 83, "robot": 41, "runner-start": 15, "runner-images": 10,
}
DEFAULT_FROM = {"runner-start": "default (not measured yet: no runner has run)",
                "runner-images": "default (not measured yet: no runner has run)"}
VM_LANES = ("pack", "docker-proof", "server-light", "electron-light", "robot")
E2E_VM_LANES = ("docker-proof", "server-light", "electron-light")   # each needs the VM's e2e package (the prepare)
LICENCE_SPECS = ("specs/components/license.spec.ts", "specs/areas/processing-license.spec.ts")
RUNS_TO_READ = 12   # the newest real runs read for the lane times

# The names a person reads in the chart, the schedule and the job's form (Virgil, 2026-11-05: "from the name I should
# 'get it'"): the test set, and where it runs. The same tests carry the same name on every machine: "light set on
# docker-server" on Linux and on a Windows VM are the same light set, once on each. what_each_part_runs() lists what
# each name runs, with its counts.
LINUX_HOST = "Linux"
PART_NAMES = {
    "build": "build + JUnit", "linux-proof": "light set on docker-server", "auth": "auth file on docker-server",
    "pack": "Windows pack", "prepare": "e2e package (NoExe)", "docker-proof": "light set on docker-server",
    "server-light": "light set on server zip", "electron-light": "light set on Electron", "robot": "Robot UAT",
}
HERE = os.path.dirname(os.path.abspath(__file__))
LIGHT_SET_FILE = os.path.join(HERE, "light-set.txt")
ROBOT_SUITES_DIR = os.path.join(HERE, "..", "src", "uat", "tests")


def windows_vm(name):
    return "Win VM " + name


def full_set_name(target):
    return "full set on " + target


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
            # in runners (E2E_MERGED_LOG=) the part took the slowest runner's time, not the lane's on one engine
            if not re.search(r"^E2E_MERGED_LOG=", read_text(os.path.join(folder, part + ".log")), re.M):
                found["full-" + part[len("lane1-"):-len("-full")]] = minutes
        elif part == "windows-pack":
            found["pack"] = minutes
    # the runners' start, from their marks in step 1's full lane log (asbl/ci/e2e-runners.sh), whatever its tests gave:
    # the slowest runner's engine, checkout and caches (what this host's auth file waits for), and its images
    for part in parts:
        if re.match(r"lane1-(web|docker-server)-full$", part):
            log = read_text(os.path.join(folder, part + ".log"))
            starts, images = [], []
            for n in sorted(set(re.findall(r"^######## RUNNER (\d+) ENGINE END rc=0 ", log, re.M))):
                copies = [mark_minutes(log, "RUNNER %s %s" % (n, what)) for what in ("ENGINE", "CHECKOUT", "CACHES")]
                image = mark_minutes(log, "RUNNER %s IMAGES" % n)
                if None not in copies and image is not None:
                    starts.append(sum(copies))
                    images.append(image)
            if starts:
                found["runner-start"], found["runner-images"] = max(starts), max(images)
    # the build's mark in the linux part's log; the Linux proof's in its own part's log with the runners
    # (docker-linux-proof.log), else in the linux part's, after the build
    linux = read_text(os.path.join(folder, "docker-linux.log"))
    proof_log = os.path.join(folder, "docker-linux-proof.log")
    v = mark_minutes(read_text(proof_log) if os.path.isfile(proof_log) else linux, "DOCKER RELEASE STEP 3/6")
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
        result.setdefault(lane, (float(minutes), DEFAULT_FROM.get(lane, "default (the 16.6.2 release)")))
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


def playwright_start(report):
    """the time Playwright started, from a Playwright JSON report's stats.startTime, or None"""
    try:
        text = json.loads(read_text(report)).get("stats", {}).get("startTime") or ""
        return datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def lane_reports(folder, part):
    """[(Playwright JSON, setup minutes or None)] of one full set part: the report its log names (its setup: the part's
    time but Playwright's, None here); in runners (E2E_MERGED_LOG=, asbl/ci/e2e-runners.sh full-set) each runner's own
    report, as the merged log names the runners' logs (one runner: the merged log is its own), its setup from its lane's
    PIPELINE_START to Playwright's start, so the runners' start and copies are not in it (runner-start, runner-images).
    None when a log or a report is gone."""
    log = read_text(os.path.join(folder, part + ".log"))
    merged = re.search(r"^E2E_MERGED_LOG=(\S+)", log, re.M)
    if not merged:
        m = re.search(r"E2E_JSON_REPORT=(\S+)", log)
        return [(m.group(1), None)] if m and os.path.isfile(m.group(1)) else None
    logs = re.findall(r"^E2E_RUNNER \d+ log=(\S+)", read_text(merged.group(1)), re.M) or [merged.group(1)]
    found = []
    for runner_log in logs:
        text = read_text(runner_log)
        m = re.search(r"E2E_JSON_REPORT=(\S+)", text)
        report = m.group(1) if m and os.path.isfile(m.group(1)) else runner_log[:-len(".log")] + "-playwright.json"
        start = re.search(r"^PIPELINE_START (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)", text, re.M)
        playwright = playwright_start(report) if os.path.isfile(report) else None
        if not start or playwright is None:
            return None
        began = datetime.strptime(start.group(1), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        found.append((report, max(0.0, (playwright - began).total_seconds() / 60)))
    return found


def playwright_counts(report):
    """(tests, skipped, spec files) of one Playwright JSON report"""
    data = json.loads(read_text(report) or "{}")
    files, counted = set(), {"tests": 0, "skipped": 0}

    def walk(suite, file_name):
        file_name = suite.get("file") or file_name
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                files.add(spec.get("file") or file_name)
                counted["tests"] += 1
                counted["skipped"] += test.get("status") == "skipped"
        for child in suite.get("suites", []):
            walk(child, file_name)

    for top in data.get("suites", []):
        walk(top, None)
    return counted["tests"], counted["skipped"], len(files)


def test_counts(runs, target):
    """what the names count, each from the newest run its part passed in (that run's result.txt): {part: (tests,
    skipped, spec files)} from the Playwright JSON of each e2e part, "junit": the build's JUnit tests (dp-ci.sh's
    "JUnit summary"), "robot": the Robot UAT's tests (its ROBOT_RESULT line). A part no run passed has no count."""
    e2e_parts = {"full": r"lane1-%s-full$" % re.escape(target), "auth": r"lane2-.+-auth$", "linux-proof": r"linux-proof$",
                 "docker-proof": r"windows-docker-proof$", "server-light": r"server-light$",
                 "electron-light": r"electron-light$"}
    counts = {}
    for folder in real_run_folders(runs):
        for line in read_text(os.path.join(folder, "result.txt")).splitlines():
            field = line.split("\t")
            if len(field) < 5 or field[0] != "part" or field[3] != "PASS":
                continue
            part, log, reports = field[1], field[4], (field[5].split() if len(field) > 5 else [])
            for key, pattern in e2e_parts.items():
                if key not in counts and re.match(pattern, part):
                    report = next((r for r in reports if r.endswith("-playwright.json") and os.path.isfile(r)), None)
                    if report:
                        counts[key] = playwright_counts(report)
            if part == "robot" and "robot" not in counts:
                m = re.search(r"ROBOT_RESULT passed=(\d+) failed=0 skipped=0", read_text(log))
                if m:
                    counts["robot"] = int(m.group(1))
            if part in ("step1-build", "build") and "junit" not in counts:
                m = re.search(r"^--- JUnit summary[^\n]*\nTests run: (\d+), Failures: 0, Errors: 0", read_text(log), re.M)
                if m:
                    counts["junit"] = int(m.group(1))
        # a run before 16.6.2 has no result.txt: step 1's lanes name their report in their own log
        for key in ("full", "auth"):
            for name in sorted(os.listdir(folder)) if key not in counts and os.path.isdir(folder) else []:
                part = name[:-len(".log")]
                if name.endswith(".log") and re.match(e2e_parts[key], part) and passed(folder, part):
                    m = re.search(r"E2E_JSON_REPORT=(\S+)", read_text(os.path.join(folder, name)))
                    if m and os.path.isfile(m.group(1)):
                        counts[key] = playwright_counts(m.group(1))
                        break
    return counts


def light_set_entries():
    """[(entry name, lane limit)] of asbl/ci/light-set.txt: all, server (every server target) or electron"""
    entries = []
    for line in read_text(LIGHT_SET_FILE).splitlines():
        field = [f.strip() for f in line.split("|")]
        if len(field) >= 3 and field[0] and not field[0].startswith("#"):
            entries.append((field[0], field[1]))
    return entries


def tests_text(counts, key, same=False):
    """': 42 tests' (': the same 42 tests'; ': 647 tests, 4 skipped'), or '' when no run counted them"""
    if key not in counts:
        return ""
    tests, skipped, _ = counts[key]
    return ": %s%d tests%s" % ("the same " if same else "", tests, ", %d skipped" % skipped if skipped else "")


def wrapped(name, text, width=118):
    """one entry of what_each_part_runs: the name, then the text wrapped under itself"""
    lines, line = [], ""
    for word in text.split():
        if line and len(line) + 1 + len(word) > width - 32:
            lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    lines.append(line)
    return ["  %-29s %s" % (name if i == 0 else "", text_line) for i, text_line in enumerate(lines)]


def what_each_part_runs(rows, counts, target, groups=None, lanes=None):
    """the lines under the chart: what each name in it runs, with its counts and lists (Virgil, 2026-11-05: "say
    exactly which test set they run and in the description how many tests and which ones"); groups: the runners'
    [(minutes, [files])] when the full set runs in runners (runner_groups), lanes: their start's times"""
    names = [part for _, part, _, _, _ in rows]
    lines =["What each part runs (the counts: the newest runs that passed it; the lists: this checkout):"]
    if PART_NAMES["build"] in names:
        lines += wrapped(PART_NAMES["build"], "dp-ci.sh build on Linux, once per commit: %s JUnit tests, then "
                         "datapallas-server-docker.zip, the NoExe package the e2e copies its test folder from, and the "
                         "image flowkraft/datapallas-server:<version>-<commit>, scanned by Trivy. One build for every "
                         "part on Linux (web and docker-server alike) and for the Windows Docker light set."
                         % (counts["junit"] if "junit" in counts else "the"))
    light = [n for n in names if n.startswith("light set on ")]
    if light:
        entries = light_set_entries()
        server = [e for e, limit in entries if limit in ("all", "server")]
        electron = [e for e, limit in entries if limit in ("all", "electron")]
        server_tests = next((counts[k] for k in ("linux-proof", "docker-proof", "server-light") if k in counts), None)
        lines += wrapped("light set", "asbl/ci/light-set.txt, one or a few tests of each area. On docker-server and "
                         "the server zip: %s%d entries: %s." % ("%d tests from " % server_tests[0] if server_tests else "",
                                                               len(server), "; ".join(server)))
        if PART_NAMES["electron-light"] in light:
            only_electron = [e for e, limit in entries if limit == "electron"]
            only_server = [e for e, limit in entries if limit == "server"]
            lines += wrapped("", "On Electron: %s%d entries: the same %d but %s, plus %s." % (
                "%d tests from " % counts["electron-light"][0] if "electron-light" in counts else "", len(electron),
                len(server), " and ".join(only_server) or "none", " and ".join(only_electron) or "none"))
        if PART_NAMES["linux-proof"] in light:
            lines += wrapped("  ... on docker-server", "datapallas-server-docker.zip and the build's image, installed as "
                             "the self-host page says: on Linux (step 2, then the page's one-command docker run), and in a "
                             "Windows VM's Docker Desktop (step 2, the image copied over, no registry).")
        if PART_NAMES["server-light"] in light:
            lines += wrapped("  ... on server zip", "the pack's datapallas-server.zip on the VM's Java 17, installed as "
                             "the installation page says (startServer.bat).")
        if PART_NAMES["electron-light"] in light:
            lines += wrapped("  ... on Electron", "the desktop app on the VM, from its e2e package.")
    if PART_NAMES["auth"] in names:
        lines += wrapped(PART_NAMES["auth"], "auth-authorization-server.spec.ts alone%s: it creates accounts and changes "
                         "roles, so it gets a server of its own." % tests_text(counts, "auth").replace(":", ","))
    if any(n.startswith(full_set_name(target)) for n in names):
        tests, skipped, files = counts.get("full", (None, 0, None))
        lines += wrapped(full_set_name(target), "every spec file but the auth file and the Electron-only upgrade "
                         "(let-me-update-migrate-configuration)%s, on %s. Step 0 alternates the full set between web and "
                         "docker-server from one release to the next." % (
                             (": %d spec files, %d tests%s" % (files, tests, " (%d skipped)" % skipped if skipped else ""))
                             if tests is not None else "",
                             "the NoExe package's server, as npm run custom:start-server-and-e2e-web starts it"
                             if target == "web" else "the shipped docker zip and image"))
        if groups and any(machine.startswith("runner ") for machine, _, _, _, _ in rows):
            sources = sorted({lanes[k][1] for k in ("runner-start", "runner-images")}) if lanes else []
            lines += wrapped("  ... in runners", "each runner a Docker engine of its own on this host "
                             "(asbl/ci/e2e-runners.sh), all started at the build's end: its engine, this checkout and the "
                             "CI caches copied in (%s min), then the images of its list by id (%s min)%s. Its memory "
                             "is capped at RELEASE_RUNNER_LIMIT_GB. %s" % (
                                 round(lanes["runner-start"][0]) if lanes else "?",
                                 round(lanes["runner-images"][0]) if lanes else "?",
                                 "; these two times: %s" % ", ".join(sources) if sources else "",
                                 "The whole full set in runner 1." if len(groups) == 1 else
                                 "Their lists: asbl/ci/full-set-runners.txt for %d jobs." % len(groups)))
            if len(groups) > 1:
                for k, (_, files) in enumerate(groups, 1):
                    lines += wrapped("  ... runner %d" % k, "%d spec files: %s." % (len(files), ", ".join(
                        os.path.basename(f)[:-len(".spec.ts")] if f.endswith(".spec.ts") else f for f in files))
                                     if files else "a 1/%d share of the files (no runner lists, no file times)" % len(groups))
    if PART_NAMES["pack"] in names:
        # both .bat files start with NoExeAssembler, whose own `mvn clean install` (no -DskipTests) runs the JUnit
        lines += wrapped(PART_NAMES["pack"], "asbl\\pack-datapallas.bat on the VM (AssemblerTest#"
                         "assembleDataPallasAndDataPallasServer): first the NoExe package (NoExeAssembler: mvn clean "
                         "install of every module but asbl, with their JUnit), then the release's datapallas.zip, "
                         "datapallas-server.zip and datapallas-src.zip.")
    if PART_NAMES["prepare"] in names:
        lines += wrapped(PART_NAMES["prepare"], "asbl\\pack-prepare-for-e2e.bat on the VM (AssemblerTest#prepareForE2E: "
                         "NoExeAssembler alone, the same mvn clean install with the JUnit), after npm ci in "
                         "frend\\rb-webcomponents: asbl\\target\\package\\verified-db-noexe, the folder the VM's light sets "
                         "copy their testground from. Built at the start of the round, before the VM's first light set, "
                         "only when its stamp (.built-from) is not the pinned commit. On the pack's VM the green pack "
                         "already built it: only the stamp is written, seconds.")
    if PART_NAMES["robot"] in names:
        suites = sorted(f[:-len(".robot")] for f in os.listdir(ROBOT_SUITES_DIR) if f.endswith(".robot")) \
            if os.path.isdir(ROBOT_SUITES_DIR) else []
        lines += wrapped(PART_NAMES["robot"], "%s in %d Robot Framework suites, on the pack's zips as a user installs "
                         "them: %s." % ("%d tests" % counts["robot"] if "robot" in counts else "The tests", len(suites),
                                        ", ".join(suites)))
    return lines


def full_set_files(runs, target):
    """the newest passed full set of a target: ({file: minutes}, setup minutes, ratio, where from), or None"""
    for folder in real_run_folders(runs):
        parts = part_minutes(read_text(os.path.join(folder, "run.log")))
        lane_parts = [p for p in parts if re.match(r"lane1-%s-full(-\d+of\d+)?$" % re.escape(target), p) and passed(folder, p)]
        if not lane_parts:
            continue
        per_file, wall_total, test_total, setups = {}, 0.0, 0.0, []
        for part in lane_parts:
            reports = lane_reports(folder, part)
            if not reports:
                break
            for report, setup in reports:
                files, wall = playwright_files(report)
                for f, minutes in files.items():
                    per_file[f] = per_file.get(f, 0.0) + minutes
                wall_total += wall
                test_total += sum(files.values())
                setups.append(max(0.0, parts[part] - wall) if setup is None else setup)
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


_RUNNER_LISTS = {}


def runner_lists(n):
    """the files of each of N runners, as the round runs them (asbl/ci/full-set-runners.py: its lists for 2 to 4 jobs,
    the whole full set for 1, checked against this checkout's full set), or (None, why) when they cannot be read"""
    if n not in _RUNNER_LISTS:
        try:
            spec = importlib.util.spec_from_file_location("full_set_runners", os.path.join(HERE, "full-set-runners.py"))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            s = module.load(argparse.Namespace(lists=module.DEFAULT_LISTS, checkout=module.DEFAULT_CHECKOUT), quiet=True)
            _RUNNER_LISTS[n] = ([module.runner_files(s, n, k) for k in range(1, n + 1)], None)
        except Exception as e:   # refused lists, a file not there: the estimate still draws (balanced by time instead)
            _RUNNER_LISTS[n] = (None, "%s: %s" % (type(e).__name__, e))
    return _RUNNER_LISTS[n]


def runner_groups(full, lanes, target, n):
    """[(minutes, [files])] of the N runners, in runner order: each its list's setup plus Playwright's ratio times its
    files' test minutes (a file with no time takes the mean of those with one), as the orchestrator's RUNNERS block counts
    them; without file times, the lane's time shared by the files' count. Lists that cannot be read: N subsets balanced
    by time (shard_files), the note says so. Returns (groups, why the lists were not used or None)"""
    lists, why = runner_lists(n)
    m_full = lanes["full-" + target][0]
    if full is not None:
        per_file, setup, ratio = full["files"], full["setup"], full["ratio"]
        mean = sum(per_file.values()) / len(per_file)
        if lists is None:
            return [(setup + minutes * ratio, group) for minutes, group in shard_files(per_file, n)], why
        return [(setup + ratio * sum(per_file.get(f, mean) for f in files), files) for files in lists], None
    if lists is None:
        return [(m_full / n, [])] * n, why
    total = sum(len(files) for files in lists) or 1
    return [(m_full * len(files) / total, files) for files in lists], None


def hm(minutes):
    minutes = int(round(minutes))
    return "%d:%02d" % (minutes // 60, minutes % 60)


def about(minutes):
    minutes = int(round(minutes / 5.0)) * 5
    return "%d h %02d" % (minutes // 60, minutes % 60)


def plan_round(lanes, full, target, n, vms, layouts, steps, counts=None, runners=True):
    """the parts of a round: [(machine, part, start, end, note)], minutes from the round's start (after step 0); the
    machines and parts by the names a person reads (PART_NAMES), each note with what the part counts (test_counts).
    runners: step 1's full set in N runners (the steps together, RELEASE_RUNNERS=yes); else on this host's engine"""
    m = {k: v[0] for k, v in lanes.items()}
    counts = counts or {}
    host = LINUX_HOST
    rows = []
    build_end = m["build"]
    junit = ("%d JUnit tests" % counts["junit"]) if "junit" in counts else "the JUnit"
    rows.append((host, PART_NAMES["build"], 0.0, build_end, junit + ", then the zips and the image"))
    proof = (host, PART_NAMES["linux-proof"], "step 2, Docker on Linux" + tests_text(counts, "linux-proof"))
    auth = (host, PART_NAMES["auth"], "step 1" + tests_text(counts, "auth"))
    if full is not None:
        per_file, setup, ratio = full["files"], full["setup"], full["ratio"]
        subsets = [(setup + minutes * ratio, group) for minutes, group in shard_files(per_file, n)]
    else:
        subsets = [(m["full-" + target] / n, [])] * n
    if steps == "together" and runners:
        # the runners: N Docker engines of their own on this host, all started at the build's end mark, each its list
        # after its start (its engine, this checkout and the caches, then the images); this host's engine meanwhile:
        # the auth file once every runner's caches are copied in (this host's lanes write both), then the Linux proof
        groups, why = runner_groups(full, lanes, target, n)
        copied = build_end + m["runner-start"]
        for k, (minutes, files) in enumerate(groups, 1):
            if n == 1:
                what = "whole" + tests_text(counts, "full")
            elif not files:
                what = "a 1/%d share of the files" % n
            elif why:
                what = "%d spec files, balanced by time (the runner lists: %s)" % (len(files), why)
            else:
                what = "its list for %d jobs: %d spec files" % (n, len(files))
            rows.append(("runner %d" % k, full_set_name(target), build_end, copied + m["runner-images"] + minutes,
                         "step 1, %s; after its start (%d min) and its images (%d min)"
                         % (what, round(m["runner-start"]), round(m["runner-images"]))))
        auth_end = copied + m["auth"]
        rows.append((auth[0], auth[1], copied, auth_end, auth[2] + "; once the runners have the checkout and the caches"))
        rows.append((proof[0], proof[1], auth_end, auth_end + m["linux-proof"], proof[2]))
        offset = 0.0
    elif steps == "in-order":
        # 16.6.2: step 1 (the build, the auth file, the full set), then steps 2 and 3 side by side
        auth_end = build_end + m["auth"]
        step1_end = auth_end + subsets[0][0]
        rows.append((auth[0], auth[1], build_end, auth_end, auth[2]))
        rows.append((host, full_set_name(target), auth_end, step1_end, "step 1, whole" + tests_text(counts, "full")))
        rows.append((proof[0], proof[1], step1_end, step1_end + m["linux-proof"], proof[2]))
        offset = step1_end
    else:
        # the steps together on this host's one Docker engine, which runs one DataPallas e2e set at a time (the shipped
        # compose files fix the container names, the ports and the network): the host's parts one after another, step
        # 2's Linux proof first (the VM's Windows Docker proof needs only the build), then step 1; the VMs from the start
        proof_end = build_end + m["linux-proof"]
        auth_end = proof_end + m["auth"]
        rows.append((proof[0], proof[1], build_end, proof_end, proof[2]))
        rows.append((auth[0], auth[1], proof_end, auth_end, auth[2]))
        clock = auth_end
        for k, (minutes, group) in enumerate(subsets, 1):
            label = full_set_name(target) + (" %d/%d" % (k, n) if n > 1 else "")
            # no file times in the records: the subsets are only the lane's time split in N, no file names
            subset = "%d spec files" % len(group) if group else "a 1/%d share of the files" % n
            note = ("step 1, %s, one subset at a time" % subset if n > 1
                    else "step 1, whole" + tests_text(counts, "full"))
            rows.append((host, label, clock, clock + minutes, note))
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
                        minutes, note = 0, "already built by the pack: seconds"
                    else:
                        minutes, note = m["prepare"], "pack-prepare-for-e2e.bat, once per pin"
                    rows.append((windows_vm(v), PART_NAMES["prepare"], start, start + minutes, note))
                    clock[v] = start + minutes
                    prepared[v] = True
                    ready = max(ready, clock[v])
                end = ready + m[lane]
                note = {
                    "pack": "step 3, pack-datapallas.bat: the 3 Windows zips",
                    "docker-proof": "step 2, Docker on Windows" + tests_text(counts, "docker-proof", same=True),
                    "server-light": "step 3" + tests_text(counts, "server-light", same=True),
                    "electron-light": "step 3" + tests_text(counts, "electron-light"),
                    "robot": "step 3" + (": %d tests" % counts["robot"] if "robot" in counts else ""),
                }[lane]
                if lane == "server-light" and v != pack_vm and ready > clock[v]:
                    note += "; waits for the pack"
                rows.append((windows_vm(v), PART_NAMES[lane], ready, end, note))
                clock[v] = end
                if lane == "pack":
                    pack_end = end
                pending[v].pop(0)
                progress = True
    return rows


CHART_COLUMNS = 48   # the widest bar area of the chart, in characters
MINUTES_PER_COLUMN = (5, 10, 15, 20, 30, 45, 60, 90, 120)
MACHINE_WIDTH, PART_WIDTH = 8, 30   # "Win VM a", "full set on docker-server 4/4"
ROW_HEAD = "%%-%ds %%-%ds" % (MACHINE_WIDTH, PART_WIDTH)   # a row's machine and part, before its bar
CHART_LEAD = MACHINE_WIDTH + 1 + PART_WIDTH


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
        lines.append((ROW_HEAD + "%s  %s%s") % (machine, part, "".join(bar).ljust(width), duration(end - start),
                                                "  (" + note + ")" if note else ""))
    lines.append(" " * CHART_LEAD + "# runs   . waits on its machine for its inputs (the build, the pack, the runners' copies)   "
                 "one column: %d min" % mpc)
    return lines, mpc


def steps_key(steps):
    """the key under the chart for the "step N" in the notes: the release step a part belongs to, not its order"""
    order = ("step 1 first, then steps 2 and 3 together" if steps == "in-order" else "the three steps start together")
    return [" " * CHART_LEAD + "step 1, 2, 3 = the release step a part belongs to, not its order:",
            " " * CHART_LEAD + order + "; each machine runs its parts top to bottom"]


def estimates(args):
    """the 16 choices as one JSON document (release-estimate.py estimates, above)"""
    lanes = lane_minutes(args.runs)
    counts = test_counts(args.runs, args.target)
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
    use_runners = args.runners == "yes" and args.steps == "together"
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
                "need_text": "%d host test servers x %d GB%s; %s" % (servers, server_gb, engines_text(n, use_runners),
                                                                    vm_text),
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
                rows = plan_round(lanes, full_info, args.target, n, vms, layouts[m], args.steps, counts, use_runners)
                total = max(end for _, _, _, end, _ in rows)
                lines, mpc = chart(rows)
                lines += steps_key(args.steps)
                groups = runner_groups(full_info, lanes, args.target, n)[0] if use_runners else None
                lines += what_each_part_runs(rows, counts, args.target, groups, lanes)
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


def engines_text(n, runners):
    """what the memory rule's N + 1 host test servers are, with the runners: " (runner 1 and this host's engine)" """
    if not runners:
        return ""
    return " (%s and this host's engine)" % ("runner 1" if n == 1 else "runners 1, 2" if n == 2 else
                                             "runners 1 to %d" % n)


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
    ap.add_argument("--runners", default="yes", choices=("yes", "no"),
                    help="the machines file's RELEASE_RUNNERS: yes, step 1's full set in N runners (the steps together)")
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
    counts = test_counts(args.runs, args.target)
    use_runners = args.runners == "yes" and args.steps == "together"
    rows = plan_round(lanes, full_info, args.target, args.jobs, vms, layouts, args.steps, counts, use_runners)
    total = max(end for _, _, _, end, _ in rows)
    last = max(rows, key=lambda r: r[3])
    off = vms[1:] if args.vms_off is None else args.vms_off.split()
    servers = args.jobs + 1   # the memory rule counts N + 1 host test servers, as release-machines.sh's check does
    if use_runners:
        where = ("whole, in runner 1" if args.jobs == 1 else "in %d runners at once" % args.jobs) + \
                ", from the build's end"
    else:
        where = ("in %d jobs" % args.jobs if args.jobs > 1 else "whole") + ", on this host's engine"
    print("SCHEDULE  steps %s; the full set (%s) %s; %d Windows VM%s (%s); minutes from the round's start, after step 0"
          % (args.steps, args.target, where, len(vms), "" if len(vms) == 1 else "s", " ".join(vms)))
    for machine, part, start, end, note in rows:
        print(("  " + ROW_HEAD + " %5s -> %5s  %4d min%s") % (machine, part, hm(start), hm(end), round(end - start),
                                                               "  (" + note + ")" if note else ""))
    print("TOTAL     about %s (the last part to end: %s %s)" % (about(total), last[0], last[1]))
    print("MEMORY    %d host test server%s x %g GB = %g GB%s; VMs the round starts: %s"
          % (servers, "" if servers == 1 else "s", args.server_gb, servers * args.server_gb,
             engines_text(args.jobs, use_runners),
             ("%s x %g GB = %g GB" % (" ".join(off), args.vm_gb, len(off) * args.vm_gb)) if off else "none"))
    where = sorted({src for _, src in lanes.values()})
    print("FROM      the lane times of %s; the time per file of %s" % (", ".join(where),
                                                                     full_info["from"] if full_info else "none (the whole lane's)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

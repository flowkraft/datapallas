#!/bin/bash
# The live estimate of the release round's Advanced (Parallelization) choices: release-rehearsal.sh estimate (the 16
# choices as JSON: asbl/ci/release-estimate.py estimates, through release-machines.sh), estimate <N> <M> (the block), and
# the form's script asbl/ci/jenkins/release-estimate-block.groovy, on the last release runs' real marks (only read) with
# the example machines file (asbl/ci/release-layout.example.conf). The cases:
#   1. estimate writes the 16 choices, one ESTIMATE line each, in a file the form may read (644);
#   2. for each of the 16: the block draws (what the press refuses, the memory line, the chart, the total, where from);
#      each part's times are the schedule's (release-machines.sh's machines_schedule) and its bar starts and ends there,
#      to half a column; the total is the last end; the gain is against 1 and 1; the memory is N + 1 host test servers
#      (each runner and the host lanes' runner, named) and M - 1 VMs; none is REFUSED at the press with 100 GB (N above 1
#      runs in runners, RELEASE_RUNNERS=yes);
#   3. 1 and 1, and 4 and 4, match a count by hand within 5 minutes, from the lane times (release-machines.sh lanes),
#      the time per file (release-estimate.py files) and the runner lists (asbl/ci/full-set-runners.py files): each
#      runner from the build's end, after its start and its images, its list's setup plus ratio times its files'
#      minutes; this host's auth file once the runners have their copies, then the Linux proof; each VM other than the
#      pack's on a copy of the pack's e2e package, from its NoExeAssembler's end (pack-noexe) plus the copy
#      (package-copy), in the rows of 4 and 4 and of 4 and 3, never a prepare of its own; and with RELEASE_RUNNERS=no,
#      1 and 1 as before the runners (this host's parts in a row, the full set last);
#   4. the memory line follows the host's memory (a stand-in /proc/meminfo): no warning with exactly RELEASE_MIN_FREE_GB
#      left, a warning with 1 GB less, "unknown" without the file;
#   5. WIN_VM_MEMORY_GB=10 holds a VM's count at 10 GB; with RELEASE_WINDOWS_VMS="a b", 3 and 4 VMs are "not created
#      yet" and not drawn;
#   6. the form's Groovy script, run by the Groovy of this host's Jenkins image in a throwaway container (no network,
#      the scratch folder read-only), draws exactly what the shell draws, for the 16 choices and the cases of 4 and 5,
#      and one line, not an error, without its JSON;
#   7. the names say which test set and where (the light set's the same on Linux and on the VM; each runner's rows
#      "runner <n>"), and under the chart what each part runs, with every entry of asbl/ci/light-set.txt and each
#      runner's list.
# Every file it writes is a scratch one: the run folders are only read, no settings file of this host is read, and the
# Jenkins home's estimates file is not touched. Takes about 40 seconds.
# Callers: a person or an agent, from the shell, after changing the estimate (release-estimate.py's model, estimates or
# block; release-machines.sh's machines_estimates; release-rehearsal.sh estimate; the block's Groovy).
#   bash asbl/ci/tests/test-estimate.sh
#   TEST_ESTIMATE_RUNS=<the run folders to read> [/var/kraft-internalsystems/logs/datapallas-ci/runs]
#   TEST_ESTIMATE_JENKINS_IMAGE=<the Jenkins image whose Groovy runs the block> [the image the container ints-jenkins
#   runs, by its id: never pulled]
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
ROUND=asbl/ci/jenkins/release-rehearsal.sh
RUNS="${TEST_ESTIMATE_RUNS:-/var/kraft-internalsystems/logs/datapallas-ci/runs}"
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-estimate.XXXXXX") || exit 2
chmod 755 "$SCRATCH"   # the Groovy container's user reads it
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}
has() {  # has <text> <text>: the text is in it, or what it holds is printed
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -15)"; return 1
}
python_checks() {  # python_checks <script>: its PASS and FAIL lines, each FAIL counted; a script that breaks is a FAIL
  local out rc
  out=$(python3 -I "$1" "$SCRATCH" 2>&1); rc=$?
  printf '%s\n' "$out"
  FAILED_CASES=$((FAILED_CASES + $(grep -c '^FAIL' <<< "$out")))
  [ "$rc" = 0 ] || { echo "FAIL  $(basename "$1") broke (exit $rc)"; FAILED_CASES=$((FAILED_CASES + 1)); }
}
meminfo_gb() { printf 'MemTotal:       131899000 kB\nMemAvailable:   %s kB\n' $(($1 * 1048576)) > "$2"; }   # <GB> <file>
json_field() { python3 -I -c 'import json, sys
d = json.load(open(sys.argv[1]))
p = [p for p in d["pairs"] if p["jobs"] == int(sys.argv[2]) and p["vms"] == int(sys.argv[3])][0] if len(sys.argv) > 4 else d
print(p[sys.argv[-1]])' "$@"; }   # json_field <file> [<N> <M>] <field>

[ -d "$RUNS" ] || { echo "FAIL  no run folders in $RUNS (TEST_ESTIMATE_RUNS)"; exit 1; }
cp asbl/ci/release-layout.example.conf "$SCRATCH/conf" && chmod 600 "$SCRATCH/conf" || exit 2
unset RELEASE_STEPS RELEASE_SERVER_GB RELEASE_RUNNERS RELEASE_RUNNER_LIMIT_GB RELEASE_WINDOWS_VMS WIN_VM_MEMORY_GB WIN_VM_DEFAULT_PEAK_GB WIN_VM_DOCKER_MEMORY_GB RELEASE_CI_CONTAINER_LIMIT_GB RELEASE_MIN_FREE_GB RELEASE_ESTIMATES_FROM
export RELEASE_REHEARSAL_CONF="$SCRATCH/conf" RUN_RECORD_DIR="$RUNS" RELEASE_MEMINFO="$SCRATCH/meminfo"
export RELEASE_ESTIMATES_FILE="$SCRATCH/estimates/release-estimates.json"
JSON="$RELEASE_ESTIMATES_FILE"
meminfo_gb 100 "$RELEASE_MEMINFO"

# ---- 1. the 16 choices written ----
out=$(bash "$ROUND" estimate); rc=$?
check "estimate: exit 0, the file written, one ESTIMATE line per choice (16)" \
  bash -c '[ "$1" = 0 ] && [ -s "$2" ] && [ "$(grep -c "^ESTIMATE  N=[1-4] M=[1-4]  " <<< "$3")" = 16 ]' _ "$rc" "$JSON" "$out"
check "estimate: the file is one the form may read (644)" same 644 "$(stat -c %a "$JSON" 2>/dev/null)"
check "estimate: no choice said to be refused at the press (N above 1 runs in runners)" \
  bash -c '! grep -q "^ESTIMATE  .*REFUSED" <<< "$1"' _ "$out"

# ---- what the checks compare with: the schedule of each choice, the lane times, the time per file, each block ----
target=$(json_field "$JSON" target)
bash asbl/ci/release-machines.sh lanes > "$SCRATCH/lanes.txt"
python3 -I asbl/ci/release-estimate.py files --runs "$RUNS" --target "$target" > "$SCRATCH/files.txt"
python3 -I asbl/ci/full-set-runners.py files 1 1 > "$SCRATCH/runner-1-1.txt"
for k in 1 2 3 4; do python3 -I asbl/ci/full-set-runners.py files 4 "$k" > "$SCRATCH/runner-4-$k.txt"; done
RELEASE_RUNNERS=no RELEASE_ESTIMATES_FILE="$SCRATCH/estimates-no-runners.json" bash "$ROUND" estimate > /dev/null
bash -c '. asbl/ci/release-machines.sh && machines_load && for m in 1 4; do for v in $(machines_vms_for "$m"); do
  echo "$m:$v=$(machines_lanes_of "$m" "$v")"; done; done' > "$SCRATCH/layouts.txt"
for n in 1 2 3 4; do
  for m in 1 2 3 4; do
    bash -c '. asbl/ci/release-machines.sh && machines_load && machines_schedule "$1" "$2" "$3"' _ "$n" "$m" "$target" \
      > "$SCRATCH/schedule-$n-$m.txt"
    RELEASE_ESTIMATES_FROM="$JSON" bash "$ROUND" estimate "$n" "$m" > "$SCRATCH/block-$n-$m.txt"
  done
done

# ---- 2 and 3. each choice's block, bars, total, gain and memory; 1 and 1 and 4 and 4 by hand ----
cat > "$SCRATCH/checks.py" <<'PYEOF'
import json, os, re, sys
S = sys.argv[1]
data = json.load(open(os.path.join(S, "estimates", "release-estimates.json")))


def check(what, problems):
    print(("PASS  " if not problems else "FAIL  ") + what)
    for p in problems[:6]:
        print("      " + p)


def about(minutes):
    minutes = int(round(minutes / 5.0)) * 5
    return "%d h %02d" % (minutes // 60, minutes % 60)


def hm(minutes):
    minutes = int(round(minutes))
    return "%d:%02d" % (minutes // 60, minutes % 60)


pairs = {(p["jobs"], p["vms"]): p for p in data["pairs"]}
check("the estimates hold the 16 choices, N and M from 1 to 4",
      [] if sorted(pairs) == [(n, m) for n in range(1, 5) for m in range(1, 5)] else ["choices: %s" % sorted(pairs)])
base = pairs[(1, 1)]["total_min"]
bad = {k: [] for k in ("drawn", "schedule", "bars", "total", "gain", "memory", "refused", "block")}
for (n, m), p in sorted(pairs.items()):
    tag = "N=%d M=%d" % (n, m)
    rows, chart, mpc = p["rows"], p["chart"], p["minutes_per_column"]
    # the chart: its axis (2 lines), one line per part, its key, the key of "step N" (2 lines), then what each part runs
    step_key = " ".join(" ".join(chart[len(rows) + 3:len(rows) + 5]).split())
    if not rows or len(chart) < len(rows) + 6 or not chart[len(rows) + 5].startswith("What each part runs") or not mpc or \
            step_key != ("step 1, 2, 3 = the release step a part belongs to, not its order: the three steps start together; "
                         "each machine runs its parts top to bottom"):
        bad["drawn"].append("%s: %d parts, %d chart lines" % (tag, len(rows), len(chart)))
        continue
    # the times of each part: the schedule's
    schedule = []
    for line in open(os.path.join(S, "schedule-%d-%d.txt" % (n, m))):
        found = re.match(r"^  (Linux|runner \d|Win VM \S+)\s+(.+?)\s+(\d+:\d\d) ->\s+(\d+:\d\d)\s", line)
        if found:
            schedule.append(found.groups())
    # the schedule prints whole minutes, the estimates keep tenths: half a minute apart at most
    minutes = lambda text: int(text.split(":")[0]) * 60 + int(text.split(":")[1])
    if [(r[0], r[1]) for r in rows] != [s[:2] for s in schedule] or any(
            abs(r[2] - minutes(s[2])) > 0.55 or abs(r[3] - minutes(s[3])) > 0.55 for r, s in zip(rows, schedule)):
        bad["schedule"].append("%s: %s, the schedule: %s" % (tag, [(r[0], r[1], hm(r[2]), hm(r[3])) for r in rows], schedule))
    # each bar from its start to its end, to half a column
    last_mark = 0
    for i, (machine, part, start, end, note) in enumerate(rows):
        line, head = chart[2 + i], "%-8s %-30s" % (machine, part)
        if not line.startswith(head):
            bad["bars"].append("%s: line %d is not %s's: %s" % (tag, i, part, line))
            continue
        area = re.match(r"^([ .#]*)  \d", line[len(head):])   # the bar, before its duration
        marks = [c for c, ch in enumerate(area.group(1) if area else "") if ch == "#"]
        if end - start < 0.05:
            if marks:
                bad["bars"].append("%s %s %s: no time, yet a bar" % (tag, machine, part))
            continue
        if not marks:
            bad["bars"].append("%s %s %s: no bar: %s" % (tag, machine, part, line))
            continue
        first, after = marks[0], marks[-1] + 1
        if marks != list(range(first, after)):
            bad["bars"].append("%s %s %s: the bar has a gap" % (tag, machine, part))
        if abs(first * mpc - start) > mpc / 2.0 + 0.01:
            bad["bars"].append("%s %s %s: starts at column %d (%d min), the part at %.1f" % (tag, machine, part, first, first * mpc, start))
        if abs(after * mpc - end) > mpc / 2.0 + 0.01 and not (after == first + 1 and end - start < mpc):
            bad["bars"].append("%s %s %s: ends at column %d (%d min), the part at %.1f" % (tag, machine, part, after, after * mpc, end))
        last_mark = max(last_mark, after)
    # the total: the last end, also in the chart
    total = max(r[3] for r in rows)
    if abs(p["total_min"] - total) > 0.11 or abs(last_mark * mpc - total) > mpc / 2.0 + 0.01:
        bad["total"].append("%s: total %s, last end %.1f, last bar column %d" % (tag, p["total_min"], total, last_mark))
    # the gain, against 1 and 1
    if (n, m) == (1, 1):
        gain = "(the defaults)"
    elif abs(base - total) < 5:
        gain = "(the same as with 1 and 1)"
    elif base > total:
        gain = "(with 1 and 1: about %s; you gain about %s)" % (about(base), about(base - total))
    else:
        gain = "(with 1 and 1: about %s; about %s longer)" % (about(base), about(total - base))
    if p["total_line"] != "Total   about %s   %s" % (about(total), gain):
        bad["gain"].append("%s: %s, expected about %s %s" % (tag, p["total_line"], about(total), gain))
    # the memory: N + 1 host test servers (each runner and the host lanes' runner), VM a's growth, M - 1 VMs
    counted = data["counted"]
    need = n * counted["runner"] + counted["host-lanes"] + (counted["vm"] - data["vm_idle_gb"]) + (m - 1) * counted["vm"]
    engines = {1: "runner 1", 2: "runners 1, 2"}.get(n, "runners 1 to %d" % n)
    if p["need_gb"] != need or not p["need_text"].startswith("%s at %d GB" % (engines, counted["runner"])) or \
            "the host lanes' runner at %d GB" % counted["host-lanes"] not in p["need_text"]:
        bad["memory"].append("%s: needs %s (%s), expected %d" % (tag, p["need_gb"], p["need_text"], need))
    # refused at the press: none (N above 1 runs in runners)
    if p["refused"]:
        bad["refused"].append("%s: %s" % (tag, p["refused"]))
    # the block, line by line
    block = open(os.path.join(S, "block-%d-%d.txt" % (n, m))).read().rstrip("\n").split("\n")
    available = 100 - need
    expected = (["REFUSED at the press: " + r for r in p["refused"]] +
                ("Memory  needs +%d GB: %s" % (need, p["need_text"])).split("\n") +
                ["        available now 100 GB -> %d GB would stay free%s" % (
                     available, "    REFUSED by memory: under the %d GB rule, but you can still press" % data["min_free_gb"]
                     if available < data["min_free_gb"] else "")] +
                chart + [p["total_line"]])
    if block[:-1] != expected or not block[-1].startswith("From    the estimate of " + data["written"]) \
            or "the lane times of" not in block[-1]:
        bad["block"].append("%s: %s" % (tag, [(a, b) for a, b in zip(block, expected + ["From ..."]) if a != b][:2] or block[-1]))
check("the 16 blocks draw: a chart for each choice (" + ", ".join(
    "%d/%d %s min per column" % (n, m, pairs[(n, m)]["minutes_per_column"]) for n, m in ((1, 1), (4, 4))) + ")", bad["drawn"])
check("each part's times are the schedule's (release-machines.sh machines_schedule), for the 16", bad["schedule"])
check("each bar starts and ends at its part's times, to half a column, for the 16", bad["bars"])
check("the total is the last end (also the chart's last column), for the 16", bad["total"])
check("the gain is against 1 and 1 (about %s), for the 16" % about(base), bad["gain"])
check("the memory: each runner and the host lanes' runner at what it counts (default %d GB), VM a's growth and M - 1 VMs x %d GB, for the 16"
      % (data["server_gb"], data["vm_gb"]), bad["memory"])
check("none REFUSED at the press (N above 1 runs in runners)", bad["refused"])
check("each block: the refusals, the memory against 100 GB, the chart, the total, where from", bad["block"])

# by hand: the lane times (release-machines.sh lanes) and the time per file (release-estimate.py files)
lanes = {}
for line in open(os.path.join(S, "lanes.txt")):
    f = line.split()
    if len(f) >= 2:
        lanes[f[0]] = float(f[1])
per_file, setup, ratio = {}, None, None
for line in open(os.path.join(S, "files.txt")):
    f = line.split()
    if len(f) == 2 and f[0] == "SETUP":
        setup = float(f[1])
    elif len(f) == 2 and f[0] == "RATIO":
        ratio = float(f[1])
    elif len(f) == 2 and re.match(r"^\d+(\.\d+)?$", f[0]):
        per_file[f[1]] = float(f[0])
runner_lists = {(n, k): [x.strip() for x in open(os.path.join(S, "runner-%d-%d.txt" % (n, k))) if x.strip()]
                for n, k in ((1, 1), (4, 1), (4, 2), (4, 3), (4, 4))}
layouts = dict(line.strip().split("=", 1) for line in open(os.path.join(S, "layouts.txt")) if "=" in line)
copied = lanes["build"] + lanes["runner-start"]   # the runners have the checkout and the caches: the auth file starts
host = copied + lanes["auth"] + lanes["linux-proof"]


def runner_end(files):
    """a runner's end: from the build's end, its start and its images, then its list (a file with no time: the mean)"""
    mean = sum(per_file.values()) / len(per_file)
    return copied + lanes["runner-images"] + setup + ratio * sum(per_file.get(f, mean) for f in files)


if setup is None or ratio is None or not per_file:
    check("1 and 1, and 4 and 4, by hand", ["no time per file read (release-estimate.py files)"])
else:
    problems = []
    if layouts.get("1:a") != "pack docker-proof server-light electron-light robot":
        problems.append("the example's layout for 1 VM changed: %s (count it again by hand)" % layouts.get("1:a"))
    by_hand = max(runner_end(runner_lists[(1, 1)]), host,
                  lanes["pack"] + lanes["docker-proof"] + lanes["server-light"] + lanes["electron-light"] + lanes["robot"])
    if abs(pairs[(1, 1)]["total_min"] - by_hand) > 5:
        problems.append("1 and 1: the estimate %.1f min, by hand %.1f" % (pairs[(1, 1)]["total_min"], by_hand))
    check("1 and 1 by hand: runner 1 the whole full set (%d files) from the build's end after its start and images; this "
          "host's auth file and Linux proof beside it; VM a's lanes in a row, its prepare kept by the pack: %.0f min, the "
          "estimate %.0f" % (len(runner_lists[(1, 1)]), by_hand, pairs[(1, 1)]["total_min"]), problems)
    problems = []
    want = {"4:a": "pack robot", "4:b": "server-light", "4:c": "electron-light", "4:d": "docker-proof"}
    if any(layouts.get(k) != v for k, v in want.items()):
        problems.append("the example's layout for 4 VMs changed: %s (count it again by hand)" % layouts)
    ends = [runner_end(runner_lists[(4, k)]) for k in (1, 2, 3, 4)]
    copy_end = lanes["pack-noexe"] + lanes["package-copy"]   # the pack starts at 0: VM a runs nothing before it
    by_hand = max(ends + [host,
                          lanes["pack"] + lanes["robot"],
                          max(copy_end, lanes["pack"]) + lanes["server-light"],
                          copy_end + lanes["electron-light"],
                          max(copy_end, lanes["build"]) + lanes["docker-proof"]])
    if abs(pairs[(4, 4)]["total_min"] - by_hand) > 5:
        problems.append("4 and 4: the estimate %.1f min, by hand %.1f" % (pairs[(4, 4)]["total_min"], by_hand))
    check("4 and 4 by hand: 4 runners with their lists (%s files, ending %s); VM a pack and Robot, b after the pack, c "
          "and d on the pack's copy (%.0f + %.0f min): %.0f min, the estimate %.0f"
          % ("/".join(str(len(runner_lists[(4, k)])) for k in (1, 2, 3, 4)), "/".join(hm(e) for e in ends),
             lanes["pack-noexe"], lanes["package-copy"], by_hand, pairs[(4, 4)]["total_min"]), problems)
    # the rows of the copy: 4 and 4 (VMs b c d), 4 and 3 (VMs b c; VM a prepares after its pack, kept by it)
    problems = []
    for vms, others in ((4, "b c d"), (3, "b c")):
        rows = {(r[0], r[1]): r for r in pairs[(4, vms)]["rows"]}
        pack = rows.get(("Win VM a", "Windows pack"))
        for v in others.split():
            r = rows.get(("Win VM " + v, "e2e package (from the pack)"))
            if pack is None or r is None:
                problems.append("4 and %d: no copy row on VM %s: %s" % (vms, v, sorted(rows)))
            elif abs(r[2] - (pack[2] + lanes["pack-noexe"])) > 0.5 or abs(r[3] - r[2] - lanes["package-copy"]) > 0.5:
                problems.append("4 and %d, VM %s: the copy %.1f -> %.1f, the pack from %.1f" % (vms, v, r[2], r[3], pack[2]))
            if ("Win VM " + v, "e2e package (NoExe)") in rows:
                problems.append("4 and %d: a prepare of its own on VM %s" % (vms, v))
    check("4 and 4, 4 and 3: each VM other than the pack's takes its copy %.0f min into the pack, for %.0f min; no prepare "
          "of its own" % (lanes["pack-noexe"], lanes["package-copy"]), problems)
    # RELEASE_RUNNERS=no: as before the runners, this host's parts one after another, the full set whole and last
    no_runners = {(p["jobs"], p["vms"]): p for p in json.load(open(os.path.join(S, "estimates-no-runners.json")))["pairs"]}
    by_hand = max(lanes["build"] + lanes["linux-proof"] + lanes["auth"] + lanes["full-" + data["target"]],
                  lanes["pack"] + lanes["docker-proof"] + lanes["server-light"] + lanes["electron-light"] + lanes["robot"])
    p11 = no_runners[(1, 1)]
    problems = [] if abs(p11["total_min"] - by_hand) <= 5 else ["the estimate %.1f min, by hand %.1f" % (p11["total_min"], by_hand)]
    if any(r[0].startswith("runner") for r in p11["rows"]) or not p11["need_text"].startswith("2 host test servers x %d GB; " % data["server_gb"]):
        problems.append("a runner drawn, or the runners named: %s" % p11["need_text"])
    if not any("RELEASE_RUNNERS=no" in r for r in no_runners[(4, 1)]["refused"]):
        problems.append("4 and 1 not refused: %s" % no_runners[(4, 1)]["refused"])
    check("RELEASE_RUNNERS=no, 1 and 1 by hand: the host's build, Linux proof, auth and full set in a row, no runner: "
          "%.0f min, the estimate %.0f; 4 and 1 refused" % (by_hand, p11["total_min"]), problems)

# the names (Virgil, 2026-11-05): the test set and where it runs, the same name on every machine, and under the chart
# what each name runs, with the light set's entries from asbl/ci/light-set.txt
problems = []
p = pairs[(1, 1)]
parts = [(r[0], r[1]) for r in p["rows"]]
for expected in (("runner 5", "light set on docker-server"), ("Win VM a", "light set on docker-server"),
                 ("Win VM a", "light set on server zip"), ("Win VM a", "light set on Electron")):
    if expected not in parts:
        problems.append("no %s part %r: %s" % (expected[0], expected[1], parts))
legend = p["chart"][len(p["rows"]) + 3:]
for name in ["light set"] + [part for _, part in parts if not part.startswith("light set on ")]:
    if not any(line.startswith("  %-29s " % name) for line in legend):
        problems.append("what each part runs does not name %r" % name)
entries = [line.split("|")[0].strip() for line in open("asbl/ci/light-set.txt", encoding="utf-8")
           if line.count("|") >= 2 and not line.startswith("#")]
listed = " ".join(" ".join(legend).split())   # the wrapped lines as one text
if not entries or any(e not in listed for e in entries):
    problems.append("the light set's entries are not all listed: %s" % [e for e in entries if e not in listed])
check("the names say which test set and where, the light set's alike on Linux and the VM; under the chart what each "
      "part runs (%d lines, the %d light set entries)" % (len(legend), len(entries)), problems)
problems = []
p = pairs[(4, 4)]
runners = [r for r in p["rows"] if r[0].startswith("runner ") and r[0] != "runner 5"]
if [r[0] for r in runners] != ["runner 1", "runner 2", "runner 3", "runner 4"] or \
        any(r[1] != "full set on " + data["target"] for r in runners):
    problems.append("4 and 4's runner rows: %s" % [(r[0], r[1]) for r in runners])
legend = " ".join(" ".join(p["chart"][len(p["rows"]) + 3:]).split())
for k in (1, 2, 3, 4):
    names = [os.path.basename(f)[:-len(".spec.ts")] for f in runner_lists[(4, k)]]
    if "... runner %d %d spec files: " % (k, len(names)) not in legend or any(n not in legend for n in names):
        problems.append("runner %d's list is not under the chart" % k)
if "... in runners each runner a Docker engine of its own" not in legend:
    problems.append("what the runners are is not under the chart")
one = " ".join(" ".join(pairs[(1, 1)]["chart"]).split())
if "The whole full set in runner 1." not in one or [r[0] for r in pairs[(1, 1)]["rows"] if r[0].startswith("runner") and r[0] != "runner 5"] != ["runner 1"]:
    problems.append("1 and 1: not the whole full set in runner 1")
check("each runner's rows say runner <n>, the part name the full set's; under the chart each runner's list (4 and 4), "
      "the whole full set in runner 1 (1 and 1)", problems)
PYEOF
python_checks "$SCRATCH/checks.py"

# ---- 4. the memory line follows the host's memory ----
need=$(json_field "$JSON" 4 4 need_gb); min_free=$(json_field "$JSON" min_free_gb)
meminfo_gb $((need + min_free)) "$SCRATCH/meminfo-edge"; meminfo_gb $((need + min_free - 1)) "$SCRATCH/meminfo-low"
RELEASE_ESTIMATES_FROM="$JSON" RELEASE_MEMINFO="$SCRATCH/meminfo-edge" bash "$ROUND" estimate 4 4 > "$SCRATCH/shell-edge.txt"
RELEASE_ESTIMATES_FROM="$JSON" RELEASE_MEMINFO="$SCRATCH/meminfo-low" bash "$ROUND" estimate 4 4 > "$SCRATCH/shell-low.txt"
RELEASE_ESTIMATES_FROM="$JSON" RELEASE_MEMINFO="$SCRATCH/no-meminfo" bash "$ROUND" estimate 1 1 > "$SCRATCH/shell-unknown.txt"
check "4 and 4 with exactly ${min_free} GB left: no warning" \
  bash -c 'grep -qx "        available now $2 GB -> $3 GB would stay free" "$1"' _ "$SCRATCH/shell-edge.txt" $((need + min_free)) "$min_free"
check "4 and 4 with $((min_free - 1)) GB left: the warning" \
  has "available now $((need + min_free - 1)) GB -> $((min_free - 1)) GB would stay free    REFUSED by memory: under the $min_free GB rule, but you can still press" "$(cat "$SCRATCH/shell-low.txt")"
check "no /proc/meminfo: the available memory unknown, the rest drawn" \
  bash -c 'grep -qxF "        available now: unknown ($2 could not be read)" "$1" && grep -q "^Total   about" "$1"' _ "$SCRATCH/shell-unknown.txt" "$SCRATCH/no-meminfo"

# ---- the memory peaks: real ones when a round recorded them, the defaults until then ----
PEAKS="$SCRATCH/peak-runs"; mkdir -p "$PEAKS"
peak_run() { mkdir -p "$PEAKS/$1-release-orchestrator-execution-1-version-9.9.9${3:-}"; printf '%b' "$2" > "$PEAKS/$1-release-orchestrator-execution-1-version-9.9.9${3:-}/memory.log"; }   # <stamp> <lines> [<dry suffix>]
peaks() { python3 -I asbl/ci/release-estimate.py peaks --runs "$PEAKS" --server-gb 9 --vm-gb "${1:-24}" --vm-default-gb 12; }
check "no round recorded anything: the defaults" same "9 9 12" "$(peaks)"
peak_run 20261101T000000Z '2026-11-01T00:00:00Z\thost\tcontainer dp-ci-runner-1\tcpu=1% mem=512MiB / 10GiB mem_percent=5%\n2026-11-01T00:05:00Z\thost\tcontainer dp-ci-runner-1\tcpu=1% mem=9.2GiB / 10GiB mem_percent=92%\n2026-11-01T00:05:00Z\twindows-vm\tmemory\tcommitted=1 commit_peak=1 commit_limit=1 physical_total=12884901888 physical_available=1610612736\n'
check "a round before the host's VM lines: a runner's highest sample, rounded up; a VM at what Windows used" same "10 9 11" "$(peaks)"
peak_run 20261102T000000Z '2026-11-02T00:00:00Z\thost\tvm a\trss_kb=25165824\n2026-11-02T00:30:00Z\thost\tvm a\trss_kb=14680064\n2026-11-02T00:30:00Z\thost\tcontainer dp-ci-runner-5\tcpu=1% mem=700MiB / 24GiB mem_percent=3%\n2026-11-02T00:30:00Z\twindows-vm\tmemory\tcommitted=1 commit_peak=1 commit_limit=1 physical_total=25769803776 physical_available=17179869184\n'
check "a VM at what it held of this host, past its boot; the host lanes' runner on its own" same "10 1 14" "$(peaks)"
check "  a VM never counts above the ceiling it has now" same "10 1 10" "$(peaks 10)"
peak_run 20261102T120000Z '2026-11-02T00:00:00Z\thost\tcontainer dp-ci-runner-1\tcpu=1% mem=30GiB / 32GiB mem_percent=93%\n' -dry-run
check "  a dry run counts for nothing" same "10 1 14" "$(peaks)"
for day in 03 04 05 06 07; do peak_run "202611${day}T000000Z" "2026-11-${day}T00:00:00Z\thost\tcontainer dp-ci-runner-2\tcpu=1% mem=3GiB / 24GiB mem_percent=12%\n"; done
check "  five newer rounds of a runner: the old peak stops counting; the others keep theirs" same "3 1 14" "$(peaks)"
check "one run's own peaks, for its SUMMARY" same "the host lanes' runner 0.7 GB; the VMs 14.0 GB" \
  "$(python3 -I asbl/ci/release-estimate.py run-peaks --runs "$PEAKS/20261102T000000Z-release-orchestrator-execution-1-version-9.9.9")"

# ---- 5. WIN_VM_MEMORY_GB=10; two VMs named ----
WIN_VM_MEMORY_GB=10 RELEASE_ESTIMATES_FILE="$SCRATCH/estimates-vm10.json" bash "$ROUND" estimate > /dev/null
check "WIN_VM_MEMORY_GB=10: a VM counts at 10 GB, whatever its peak" same 10 \
  "$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["counted"]["vm"])' "$SCRATCH/estimates-vm10.json")"
RELEASE_ESTIMATES_FROM="$SCRATCH/estimates-vm10.json" bash "$ROUND" estimate 4 4 > "$SCRATCH/shell-vm10.txt"
check "WIN_VM_MEMORY_GB=10: the block says it" has "VM a can grow by 4 GB" "$(cat "$SCRATCH/shell-vm10.txt")"
check "  and the VMs to start" has "; VMs b, c, d at 10 GB" "$(cat "$SCRATCH/shell-vm10.txt")"
check "the memory line's second line: the ceilings" has "        ceilings: a runner up to 24 GB, dp-ci in it up to 12 GB; a VM up to 10 GB, Docker in it up to 16 GB" "$(cat "$SCRATCH/shell-vm10.txt")"
RELEASE_WINDOWS_VMS="a b" RELEASE_ESTIMATES_FILE="$SCRATCH/estimates-ab.json" bash "$ROUND" estimate > /dev/null
check "RELEASE_WINDOWS_VMS=\"a b\": 3 and 4 VMs not created yet, refused and not drawn; 1 and 2 VMs drawn" python3 -I -c 'import json, sys
d = json.load(open(sys.argv[1]))
ok = all((not p["rows"] and p["total_line"].startswith("Total   not estimated") and any("not created yet" in r for r in p["refused"]))
         if p["vms"] > 2 else bool(p["rows"]) for p in d["pairs"])
sys.exit(0 if ok and len(d["pairs"]) == 16 else 1)' "$SCRATCH/estimates-ab.json"
RELEASE_ESTIMATES_FROM="$SCRATCH/estimates-ab.json" bash "$ROUND" estimate 1 3 > "$SCRATCH/shell-ab-1-3.txt"
RELEASE_ESTIMATES_FROM="$SCRATCH/estimates-ab.json" bash "$ROUND" estimate 1 2 > "$SCRATCH/shell-ab-1-2.txt"
check "RELEASE_WINDOWS_VMS=\"a b\", 3 VMs: the block says not created yet, with its memory" \
  bash -c 'grep -q "^REFUSED at the press: USE_N_NUMBER_OF_WINDOWS_VMS=3, .*not created yet" "$1" &&
    grep -qE "^Memory  needs \+[0-9]+ GB: .*; 2 VMs at [0-9]+ GB \(1 of them not created yet\)$" "$1" &&
    grep -q "^Total   not estimated" "$1"' _ "$SCRATCH/shell-ab-1-3.txt"
RELEASE_ESTIMATES_FROM="$SCRATCH/no-estimates.json" bash "$ROUND" estimate 1 1 > "$SCRATCH/shell-nojson.txt"
check "no estimates file: one line saying so" \
  bash -c '[ "$(wc -l < "$1")" = 1 ] && grep -q "^The estimate could not be read from $2: " "$1"' _ "$SCRATCH/shell-nojson.txt" "$SCRATCH/no-estimates.json"
# no RELEASE_ESTIMATES_FROM, as the Jenkinsfile's first lines run it: computed now into a temporary file, removed at exit
mkdir -p "$SCRATCH/tmp-now"
TMPDIR="$SCRATCH/tmp-now" bash "$ROUND" estimate 1 1 > "$SCRATCH/shell-now.txt" 2>&1
check "estimate 1 1 computed now: the same block (but its time), no error, its temporary file removed" \
  bash -c '[ "$(grep -v "^From " "$1")" = "$(grep -v "^From " "$2")" ] && [ -z "$(ls -A "$3")" ]' _ \
  "$SCRATCH/shell-now.txt" "$SCRATCH/block-1-1.txt" "$SCRATCH/tmp-now" ||
  { diff "$SCRATCH/block-1-1.txt" "$SCRATCH/shell-now.txt" | head -5; ls -A "$SCRATCH/tmp-now"; }

# ---- 6. the form's Groovy draws what the shell draws ----
image="${TEST_ESTIMATE_JENKINS_IMAGE:-$(docker inspect -f '{{.Image}}' ints-jenkins 2>/dev/null)}"
cp asbl/ci/jenkins/release-estimate-block.groovy "$SCRATCH/block.groovy"
{
  for n in 1 2 3 4; do for m in 1 2 3 4; do echo "block-$n-$m $n $m $JSON $RELEASE_MEMINFO"; done; done
  echo "shell-edge 4 4 $JSON $SCRATCH/meminfo-edge"
  echo "shell-low 4 4 $JSON $SCRATCH/meminfo-low"
  echo "shell-unknown 1 1 $JSON $SCRATCH/no-meminfo"
  echo "shell-vm10 4 4 $SCRATCH/estimates-vm10.json $RELEASE_MEMINFO"
  echo "shell-ab-1-3 1 3 $SCRATCH/estimates-ab.json $RELEASE_MEMINFO"
  echo "shell-ab-1-2 1 2 $SCRATCH/estimates-ab.json $RELEASE_MEMINFO"
  echo "shell-nojson 1 1 $SCRATCH/no-estimates.json $RELEASE_MEMINFO"
} > "$SCRATCH/groovy-cases.txt"
cat > "$SCRATCH/wrapper.groovy" <<'GROOVY'
// each case of groovy-cases.txt (<name> <N> <M> <estimates JSON> <meminfo>): the block script with the bindings Active
// Choices gives it, its HTML printed after a @@@CASE line
String dir = args[0]
String script = new File(dir + '/block.groovy').getText('UTF-8')
new File(dir + '/groovy-cases.txt').eachLine { String line ->
  List f = line.split(' ') as List
  Binding binding = new Binding()
  binding.setVariable('SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS', f[1])
  binding.setVariable('USE_N_NUMBER_OF_WINDOWS_VMS', f[2])
  binding.setVariable('RELEASE_ESTIMATES_FILE', f[3])
  binding.setVariable('RELEASE_MEMINFO', f[4])
  println('@@@CASE ' + f[0])
  println(new GroovyShell(binding).evaluate(script))
}
println('@@@END')
GROOVY
if [ -z "$image" ]; then
  check "the Groovy of the Jenkins image: found (ints-jenkins, or TEST_ESTIMATE_JENKINS_IMAGE)" false
else
  docker run --rm --pull never --network none --memory 1g -v "$SCRATCH:$SCRATCH:ro" --entrypoint sh "$image" -c \
    'unzip -p /usr/share/jenkins/jenkins.war "WEB-INF/lib/groovy-all-*.jar" > /tmp/groovy.jar &&
     exec java -cp /tmp/groovy.jar groovy.ui.GroovyMain "$1/wrapper.groovy" "$1"' _ "$SCRATCH" \
    > "$SCRATCH/groovy.out" 2> "$SCRATCH/groovy.err"
  echo "      (the Groovy of the image ${image:0:19}, exit $?$( [ -s "$SCRATCH/groovy.err" ] && echo ": $(tail -1 "$SCRATCH/groovy.err")"))"
  cat > "$SCRATCH/compare.py" <<'PYEOF'
import html, os, re, sys
S = sys.argv[1]
text = open(os.path.join(S, "groovy.out"), encoding="utf-8").read()
drawn = {}
for found in re.finditer(r"^@@@CASE (\S+)\n(.*?)(?=^@@@)", text, re.M | re.S):
    drawn[found.group(1)] = found.group(2)
cases = [line.split()[0] for line in open(os.path.join(S, "groovy-cases.txt"))]


def check(what, names):
    problems = []
    for name in names:
        page = drawn.get(name)
        shell = open(os.path.join(S, name + ".txt"), encoding="utf-8").read().rstrip("\n")
        inner = re.match(r'^<pre style="[^"]*">(.*)</pre>\n?$', page or "", re.S)
        if inner is None:
            problems.append("%s: not one <pre>: %r" % (name, (page or "nothing")[:200]))
            continue
        groovy = html.unescape(inner.group(1))
        if name == "shell-nojson":
            prefix = shell.split(": ")[0] + ": "
            if not groovy.startswith(prefix) or "\n" in groovy:
                problems.append("%s: %r, not one line starting %r" % (name, groovy, prefix))
        elif groovy != shell:
            diff = [(i, a, b) for i, (a, b) in enumerate(zip(groovy.split("\n"), shell.split("\n"))) if a != b]
            problems.append("%s: lines differ, first: %s (groovy %d lines, shell %d)" % (
                name, diff[:1], groovy.count("\n") + 1, shell.count("\n") + 1))
    print(("PASS  " if not problems else "FAIL  ") + what)
    for p in problems[:4]:
        print("      " + p)


check("groovy draws what the shell draws: the 16 choices", [c for c in cases if c.startswith("block-")])
check("groovy draws what the shell draws: the memory exactly at the rule, under it, unknown",
      ["shell-edge", "shell-low", "shell-unknown"])
check("groovy draws what the shell draws: WIN_VM_MEMORY_GB=10; two VMs named (3 not created yet, 2 drawn)",
      ["shell-vm10", "shell-ab-1-3", "shell-ab-1-2"])
check("groovy without its estimates file: one line saying so, no error", ["shell-nojson"])
PYEOF
  python_checks "$SCRATCH/compare.py"
fi

echo
[ "$FAILED_CASES" = 0 ] && { echo "ALL PASSED"; exit 0; }
echo "$FAILED_CASES FAILED"; exit 1

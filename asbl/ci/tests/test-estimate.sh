#!/bin/bash
# The live estimate of the release round's Advanced (Parallelization) choices: release-rehearsal.sh estimate (the 16
# choices as JSON: asbl/ci/release-estimate.py estimates, through release-machines.sh), estimate <N> <M> (the block), and
# the form's script asbl/ci/jenkins/release-estimate-block.groovy, on the last release runs' real marks (only read) with
# the example machines file (asbl/ci/release-layout.example.conf). The cases:
#   1. estimate writes the 16 choices, one ESTIMATE line each, in a file the form may read (644);
#   2. for each of the 16: the block draws (what the press refuses, the memory line, the chart, the total, where from);
#      each part's times are the schedule's (release-machines.sh's machines_schedule) and its bar starts and ends there,
#      to half a column; the total is the last end; the gain is against 1 and 1; the memory is N + 1 host test servers
#      and M - 1 VMs; N above 1 is REFUSED at the press (one Docker engine), N = 1 is not;
#   3. 1 and 1, and 4 and 4, match a count by hand from the lane times (release-machines.sh lanes) and the time per
#      file (release-estimate.py files) within 5 minutes;
#   4. the memory line follows the host's memory (a stand-in /proc/meminfo): no warning with exactly RELEASE_MIN_FREE_GB
#      left, a warning with 1 GB less, "unknown" without the file;
#   5. WIN_VM_MEMORY_GB=10 makes 4 and 4 need 6 GB less; with RELEASE_WINDOWS_VMS="a b", 3 and 4 VMs are "not created
#      yet" and not drawn;
#   6. the form's Groovy script, run by the Groovy of this host's Jenkins image in a throwaway container (no network,
#      the scratch folder read-only), draws exactly what the shell draws, for the 16 choices and the cases of 4 and 5,
#      and one line, not an error, without its JSON.
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
unset RELEASE_STEPS RELEASE_SERVER_GB RELEASE_WINDOWS_VMS WIN_VM_MEMORY_GB RELEASE_MIN_FREE_GB RELEASE_ESTIMATES_FROM
export RELEASE_REHEARSAL_CONF="$SCRATCH/conf" RUN_RECORD_DIR="$RUNS" RELEASE_MEMINFO="$SCRATCH/meminfo"
export RELEASE_ESTIMATES_FILE="$SCRATCH/estimates/release-estimates.json"
JSON="$RELEASE_ESTIMATES_FILE"
meminfo_gb 100 "$RELEASE_MEMINFO"

# ---- 1. the 16 choices written ----
out=$(bash "$ROUND" estimate); rc=$?
check "estimate: exit 0, the file written, one ESTIMATE line per choice (16)" \
  bash -c '[ "$1" = 0 ] && [ -s "$2" ] && [ "$(grep -c "^ESTIMATE  N=[1-4] M=[1-4]  " <<< "$3")" = 16 ]' _ "$rc" "$JSON" "$out"
check "estimate: the file is one the form may read (644)" same 644 "$(stat -c %a "$JSON" 2>/dev/null)"
check "estimate: N above 1 said to be refused at the press, N = 1 not" \
  bash -c '[ "$(grep -c "^ESTIMATE  N=[234] .*REFUSED at the press" <<< "$1")" = 12 ] && ! grep -q "^ESTIMATE  N=1 .*REFUSED" <<< "$1"' _ "$out"

# ---- what the checks compare with: the schedule of each choice, the lane times, the time per file, each block ----
target=$(json_field "$JSON" target)
bash asbl/ci/release-machines.sh lanes > "$SCRATCH/lanes.txt"
python3 -I asbl/ci/release-estimate.py files --runs "$RUNS" --target "$target" > "$SCRATCH/files.txt"
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
    if not rows or len(chart) != len(rows) + 3 or not mpc:
        bad["drawn"].append("%s: %d parts, %d chart lines" % (tag, len(rows), len(chart)))
        continue
    # the times of each part: the schedule's
    schedule = []
    for line in open(os.path.join(S, "schedule-%d-%d.txt" % (n, m))):
        found = re.match(r"^  (host|VM \S+)\s+(.+?)\s+(\d+:\d\d) ->\s+(\d+:\d\d)\s", line)
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
        line, head = chart[2 + i], "%-6s %-24s" % (machine, part)
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
    # the memory: N + 1 host test servers, M - 1 VMs
    need = (n + 1) * data["server_gb"] + (m - 1) * data["vm_gb"]
    if p["need_gb"] != need or not p["need_text"].startswith("%d host test servers x %d GB; " % (n + 1, data["server_gb"])):
        bad["memory"].append("%s: needs %s (%s), expected %d" % (tag, p["need_gb"], p["need_text"], need))
    # refused at the press: N above 1 only
    if (n > 1) != bool(p["refused"]) or (n > 1 and not all("not possible yet" in r for r in p["refused"])):
        bad["refused"].append("%s: %s" % (tag, p["refused"]))
    # the block, line by line
    block = open(os.path.join(S, "block-%d-%d.txt" % (n, m))).read().rstrip("\n").split("\n")
    available = 100 - need
    expected = (["REFUSED at the press: " + r for r in p["refused"]] +
                ["Memory  needs +%d GB: %s" % (need, p["need_text"]),
                 "        available now 100 GB -> %d GB would stay free%s" % (
                     available, "    WARNING: under the %d GB rule (the press refuses it)" % data["min_free_gb"]
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
check("the memory: N + 1 host test servers x %d GB and M - 1 VMs x %d GB, for the 16" % (data["server_gb"], data["vm_gb"]), bad["memory"])
check("N above 1 REFUSED at the press (one Docker engine), N = 1 not", bad["refused"])
check("each block: the refusals, the memory against 100 GB, the chart, the total, where from", bad["block"])

# by hand: the lane times (release-machines.sh lanes) and the time per file (release-estimate.py files)
lanes = {}
for line in open(os.path.join(S, "lanes.txt")):
    f = line.split()
    if len(f) >= 2:
        lanes[f[0]] = float(f[1])
files, setup, ratio = [], None, None
for line in open(os.path.join(S, "files.txt")):
    f = line.split()
    if len(f) == 2 and f[0] == "SETUP":
        setup = float(f[1])
    elif len(f) == 2 and f[0] == "RATIO":
        ratio = float(f[1])
    elif len(f) == 2 and re.match(r"^\d+(\.\d+)?$", f[0]):
        files.append(float(f[0]))
layouts = dict(line.strip().split("=", 1) for line in open(os.path.join(S, "layouts.txt")) if "=" in line)
host = lanes["build"] + lanes["linux-proof"] + lanes["auth"]
problems = []
if layouts.get("1:a") != "pack docker-proof server-light electron-light robot":
    problems.append("the example's layout for 1 VM changed: %s (count it again by hand)" % layouts.get("1:a"))
by_hand = max(host + lanes["full-" + data["target"]],
              lanes["pack"] + lanes["docker-proof"] + lanes["server-light"] + lanes["electron-light"] + lanes["robot"])
if abs(pairs[(1, 1)]["total_min"] - by_hand) > 5:
    problems.append("1 and 1: the estimate %.1f min, by hand %.1f" % (pairs[(1, 1)]["total_min"], by_hand))
check("1 and 1 by hand: the host's build, Linux proof, auth and full set in a row; VM a's lanes in a row, its prepare "
      "kept by the pack: %.0f min, the estimate %.0f" % (by_hand, pairs[(1, 1)]["total_min"]), problems)
problems = []
want = {"4:a": "pack robot", "4:b": "server-light", "4:c": "electron-light", "4:d": "docker-proof"}
if any(layouts.get(k) != v for k, v in want.items()):
    problems.append("the example's layout for 4 VMs changed: %s (count it again by hand)" % layouts)
if setup is None or ratio is None or not files:
    check("4 and 4 by hand", problems + ["no time per file read (release-estimate.py files)"])
else:
    by_hand = max(host + 4 * setup + ratio * sum(files),   # the 4 subsets one at a time, each with its setup
                  lanes["pack"] + lanes["robot"],
                  max(lanes["prepare"], lanes["pack"]) + lanes["server-light"],
                  lanes["prepare"] + lanes["electron-light"],
                  max(lanes["prepare"], lanes["build"]) + lanes["docker-proof"])
    if abs(pairs[(4, 4)]["total_min"] - by_hand) > 5:
        problems.append("4 and 4: the estimate %.1f min, by hand %.1f" % (pairs[(4, 4)]["total_min"], by_hand))
    check("4 and 4 by hand: the host's parts with 4 subsets of %d files (4 setups of %.1f min, ratio %.3f); VM a pack "
          "and Robot, b after the pack, c and d after their prepare: %.0f min, the estimate %.0f"
          % (len(files), setup, ratio, by_hand, pairs[(4, 4)]["total_min"]), problems)
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
  has "available now $((need + min_free - 1)) GB -> $((min_free - 1)) GB would stay free    WARNING: under the $min_free GB rule (the press refuses it)" "$(cat "$SCRATCH/shell-low.txt")"
check "no /proc/meminfo: the available memory unknown, the rest drawn" \
  bash -c 'grep -qxF "        available now: unknown ($2 could not be read)" "$1" && grep -q "^Total   about" "$1"' _ "$SCRATCH/shell-unknown.txt" "$SCRATCH/no-meminfo"

# ---- 5. WIN_VM_MEMORY_GB=10; two VMs named ----
WIN_VM_MEMORY_GB=10 RELEASE_ESTIMATES_FILE="$SCRATCH/estimates-vm10.json" bash "$ROUND" estimate > /dev/null
check "WIN_VM_MEMORY_GB=10: 4 and 4 need 6 GB less ($need GB with 12)" \
  same $((need - 6)) "$(json_field "$SCRATCH/estimates-vm10.json" 4 4 need_gb)"
RELEASE_ESTIMATES_FROM="$SCRATCH/estimates-vm10.json" bash "$ROUND" estimate 4 4 > "$SCRATCH/shell-vm10.txt"
check "WIN_VM_MEMORY_GB=10: the block says it" has "Memory  needs +$((need - 6)) GB: 5 host test servers x 5 GB; VMs b, c, d at 10 GB" "$(cat "$SCRATCH/shell-vm10.txt")"
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
    grep -qx "Memory  needs +34 GB: 2 host test servers x 5 GB; 2 VMs at 12 GB (1 of them not created yet)" "$1" &&
    grep -q "^Total   not estimated" "$1"' _ "$SCRATCH/shell-ab-1-3.txt"
RELEASE_ESTIMATES_FROM="$SCRATCH/no-estimates.json" bash "$ROUND" estimate 1 1 > "$SCRATCH/shell-nojson.txt"
check "no estimates file: one line saying so" \
  bash -c '[ "$(wc -l < "$1")" = 1 ] && grep -q "^The estimate could not be read from $2: " "$1"' _ "$SCRATCH/shell-nojson.txt" "$SCRATCH/no-estimates.json"

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

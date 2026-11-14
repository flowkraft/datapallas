#!/bin/bash
# The runner lists (asbl/ci/full-set-runners.txt) and asbl/ci/full-set-runners.py, on real data, read only. The cases:
#   1. the lists at this checkout: for 2, 3 and 4 jobs the runners hold exactly the full set's files (dp-ci.sh's full
#      mode: every *.spec.ts but the auth file and the Electron-only file), none twice, those two in none, and the specs
#      that use the test licence key in one runner;
#   2. on the 16.6.2 release's web full set report, every layout's runners count its 647 tests (643 passed, 4 skipped)
#      with none lost, and with the auth file's own report (138) 785;
#   3. each runner within 15% of its layout's mean, on the web 16.6.2 and docker-server 16.6.1 full sets;
#   4. a copy of the lists with a file in two runners, a licence spec moved out of its runner, or the auth file added:
#      each refused (exit 2), naming the file; a listed file that is gone: a WARN only;
#   5. a spec file added to a scratch copy of the specs lands in the rest of every layout; each runner's pattern, inside
#      dp-ci.sh's own full-mode regex for a runner, picks exactly its files, never the auth or the Electron-only file;
#   6. the merge: a real report cut into N parts by the lists, each with its runner's log, merges back to its counts, its
#      summary lines (the E2E_RESULT line, the Playwright result block, PIPELINE_RESULT) and its flaky.txt lines; a red
#      runner, and one that never ran, make the lane red and are named; an existing merged log is refused.
# Real data, read only (each report's log is beside it, <report without -playwright.json>.log):
#   RUNNER_LISTS_WEB_REPORT            [the 16.6.2 release's web full set]
#   RUNNER_LISTS_DOCKER_SERVER_REPORT  [the 16.6.1 release's docker-server full set]
#   RUNNER_LISTS_AUTH_REPORT           [the 16.6.2 release's auth file]
# Writes only in a scratch folder. Takes about 20 seconds.
# Callers: a person or an agent, from the shell, after changing the lists, full-set-runners.py or dp-ci.sh's full mode.
#   bash asbl/ci/tests/test-runner-lists.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
LOG_DIR=/var/kraft-internalsystems/logs/datapallas-ci
WEB_REPORT="${RUNNER_LISTS_WEB_REPORT:-$LOG_DIR/20261104T001318Z-e2e-39198f4d-playwright.json}"
DS_REPORT="${RUNNER_LISTS_DOCKER_SERVER_REPORT:-$LOG_DIR/20261031T195753Z-e2e-bc6ee866-playwright.json}"
AUTH_REPORT="${RUNNER_LISTS_AUTH_REPORT:-$LOG_DIR/20261103T235343Z-e2e-39198f4d-playwright.json}"
for f in "$WEB_REPORT" "$DS_REPORT" "$AUTH_REPORT" "${WEB_REPORT%-playwright.json}.log" "${DS_REPORT%-playwright.json}.log"; do
  [ -f "$f" ] || { echo "FAIL  the real data $f is missing (the settings in this file's header)"; exit 1; }
done
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-runner-lists.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
TOOL="python3 $REPO_ROOT/asbl/ci/full-set-runners.py"
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}
has() {  # has <text> <text to search>
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}

# ---- the test's own reading of reports and regexes (not the tool's) ----
cat > "$SCRATCH/helpers.py" <<'PY'
import glob, json, os, re, sys

def tests(report):
    """(file, test) pairs of a Playwright report, in order."""
    out = []
    def walk(suite, file_name):
        file_name = suite.get("file") or file_name
        for spec in suite.get("specs", []):
            for t in spec.get("tests", []):
                out.append((spec.get("file") or file_name, t))
        for child in suite.get("suites", []):
            walk(child, file_name)
    for top in report.get("suites", []):
        walk(top, None)
    return out

def lists(paths):
    return [set(l.strip() for l in open(p) if l.strip()) for p in paths]

cmd = sys.argv[1]
if cmd == "count":      # count <report> <runner files>...: the report's tests per runner, added up
    report = json.load(open(sys.argv[2]))
    runners = lists(sys.argv[3:])
    total = passed = skipped = other = lost = twice = 0
    for f, t in tests(report):
        n = sum(1 for r in runners if f in r)
        if n == 0: lost += 1; continue
        if n > 1: twice += 1
        total += 1
        s = t.get("status")
        if s == "expected": passed += 1
        elif s == "skipped": skipped += 1
        else: other += 1
    print("tests=%d passed=%d skipped=%d other=%d lost=%d twice=%d" % (total, passed, skipped, other, lost, twice))
elif cmd == "tests":    # tests <report>: its number of tests
    print(len(tests(json.load(open(sys.argv[2])))))
elif cmd == "stats":    # stats <report>: its counts
    s = json.load(open(sys.argv[2]))["stats"]
    print("expected=%s unexpected=%s flaky=%s skipped=%s" % (s["expected"], s["unexpected"], s["flaky"], s["skipped"]))
elif cmd == "cut":      # cut <report> <real log> <out dir> <runner files>...: one report and one log per runner
    report, real_log, out = json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4]
    runners = lists(sys.argv[5:])
    head = {}
    for line in open(real_log, encoding="utf-8", errors="replace"):
        for key in ("PIPELINE_START ", "E2E_RETRIES=", "E2E_TARGET=", "E2E_CAPS "):
            if line.startswith(key) and key not in head: head[key] = line.rstrip("\n")
    start = re.match(r"PIPELINE_START (\S+)\s+task=\S+\s+commit=(\S+)", head["PIPELINE_START "])
    for i, files in enumerate(runners, 1):
        folder = os.path.join(out, "runners", str(i)); os.makedirs(folder)
        log = os.path.join(folder, "20261105T000000Z-e2e-%s.log" % start.group(2))
        part = dict(report)
        part["suites"] = [s for s in report["suites"] if s.get("file") in files]
        st = dict(expected=0, unexpected=0, flaky=0, skipped=0)
        ms = 0
        for f, t in tests(part):
            st[t.get("status")] += 1
            ms += sum(r.get("duration", 0) for r in t.get("results", []))
        part["stats"] = dict(report["stats"], duration=ms, **st)
        json.dump(part, open(log[:-4] + "-playwright.json", "w"))
        retries = re.sub(r"E2E_JSON_REPORT=\S+", "E2E_JSON_REPORT=" + log[:-4] + "-playwright.json", head["E2E_RETRIES="])
        lines = [head["PIPELINE_START "], "E2E_SET=full", retries, head.get("E2E_CAPS ", ""), head["E2E_TARGET="],
                 "Running %d tests using 1 worker" % sum(st.values()), "--- Playwright result ---",
                 "  %d passed (1.0h)" % st["expected"], "Playwright exit code: 0",
                 "E2E_RESULT mode=full spec='x' grep='' passed=%d failed=%d flaky=%d skipped=%d didnotrun=0 exit=0 target=%s"
                 % (st["expected"], st["unexpected"], st["flaky"], st["skipped"], head["E2E_TARGET="].split("=", 1)[1]),
                 "PIPELINE_RESULT=SUCCESS  2026-11-05T01:00:00Z"]
        open(log, "w").write("\n".join(l for l in lines if l) + "\n")
        print(log)
elif cmd == "redden":   # redden <runner log> <count>: <count> of its passed tests failed, its log red
    log, count = sys.argv[2], int(sys.argv[3])
    path = log[:-4] + "-playwright.json"
    report = json.load(open(path))
    done = 0
    for f, t in tests(report):
        if done < count and t.get("status") == "expected":
            t["status"] = "unexpected"
            for r in t.get("results", []): r["status"] = "failed"
            done += 1
    report["stats"]["expected"] -= done; report["stats"]["unexpected"] += done
    json.dump(report, open(path, "w"))
    text = open(log).read()
    text = re.sub(r"passed=(\d+) failed=0", lambda m: "passed=%d failed=%d" % (int(m.group(1)) - done, done), text)
    text = text.replace(" exit=0 ", " exit=1 ").replace("Playwright exit code: 0", "Playwright exit code: 1")
    text = text.replace("PIPELINE_RESULT=SUCCESS", "PIPELINE_RESULT=FAILED_AT_STEP_4")
    open(log, "w").write(text)
elif cmd == "regex":    # regex <checkout> (<pattern file> <runner files>)...: dp-ci.sh's runner regex picks its files
    checkout = sys.argv[2]
    dp = open(os.path.join(checkout, "asbl/ci/dp-ci.sh"), encoding="utf-8").read()
    m = re.search(r'export E2E_SPEC="(\^[^"]*\(\?:\$E2E_RUNNER_FILES\)[^"]*)"', dp)
    template = m.group(1).replace("\\$", "$")
    root = os.path.join(checkout, "frend/reporting/e2e")
    every = sorted(p for p in glob.glob(root + "/**/*.spec.ts", recursive=True) if "/node_modules/" not in p)
    bad = []
    pairs = sys.argv[3:]
    picked_by = {}
    for pattern_file, files_file in zip(pairs[0::2], pairs[1::2]):
        pattern = open(pattern_file).read().strip()
        rx = re.compile(template.replace("$E2E_RUNNER_FILES", pattern))
        picked = set(os.path.relpath(p, root) for p in every if rx.search(p))
        want = set(l.strip() for l in open(files_file) if l.strip())
        for f in picked: picked_by.setdefault(f, []).append(files_file)
        if picked != want:
            bad.append("%s: picks %s, lists %s" % (files_file, sorted(picked - want), sorted(want - picked)))
    bad += ["%s picked by %d runners" % (f, len(r)) for f, r in picked_by.items() if len(r) > 1]
    print("OK" if not bad else "\n".join(bad))
PY
H="python3 $SCRATCH/helpers.py"

# independently of the tool: the full set at this checkout (every *.spec.ts but the two that run on their own)
FULL=$(cd frend/reporting/e2e && find . -name node_modules -prune -o -name '*.spec.ts' -print | sed 's|^\./||' |
  grep -vE 'auth-authorization-server|let-me-update-migrate-configuration' | sort)
FULL_COUNT=$(printf '%s\n' "$FULL" | grep -c .)
runner_files() {  # runner_files <jobs> <runner> [tool options]: the tool's list into $SCRATCH/files-<jobs>-<runner>
  local jobs=$1 runner=$2; shift 2
  $TOOL files "$jobs" "$runner" "$@" > "$SCRATCH/files-$jobs-$runner" 2>/dev/null
}

# ---- 1. the lists at this checkout ----
OUT=$($TOOL check 2>&1); RC=$?
check "1: check passes at this checkout (exit 0)" same 0 "$RC"
check "1: the full set is $FULL_COUNT files, the two that run on their own left out" \
  has "FULL SET  $FULL_COUNT spec files" "$OUT"
check "1: the specs that use the test licence key, found by reading them" \
  has "LICENCE   the specs that use the test licence key: specs/areas/processing-license.spec.ts, specs/components/license.spec.ts, specs/components/pause-cancel-resume-jobs.spec.ts" "$OUT"
for jobs in 2 3 4; do
  for r in $(seq 1 "$jobs"); do runner_files "$jobs" "$r"; done
  ALL=$(cat "$SCRATCH"/files-"$jobs"-* | sort)
  check "1: $jobs jobs: the runners hold exactly the full set, none twice" same "$FULL" "$ALL"
  check "1: $jobs jobs: the auth file and the Electron-only file in no runner" \
    same 0 "$(cat "$SCRATCH"/files-"$jobs"-* | grep -cE 'auth-authorization-server|let-me-update-migrate-configuration')"
  check "1: $jobs jobs: the three licence specs in one runner" \
    same 1 "$(grep -lE 'processing-license|components/license|pause-cancel-resume-jobs' "$SCRATCH"/files-"$jobs"-* | wc -l)"
done
check "1: 4 jobs: runner 1 is canvas-dashboard-demos and explore-data-use-cases" \
  same "specs/features/canvas-dashboard-demos.spec.ts specs/features/explore-data-use-cases.spec.ts" "$(paste -sd' ' "$SCRATCH/files-4-1")"

# ---- 2. the 16.6.2 web full set's tests in every layout, and the auth file's ----
AUTH_TESTS=$($H tests "$AUTH_REPORT")
check "2: the auth file's own report holds 138 tests" same 138 "$AUTH_TESTS"
for jobs in 2 3 4; do
  # shellcheck disable=SC2046
  COUNTS=$($H count "$WEB_REPORT" $(seq -f "$SCRATCH/files-$jobs-%g" 1 "$jobs"))
  check "2: $jobs jobs: 647 tests (643 passed, 4 skipped), none lost, none twice" \
    same "tests=647 passed=643 skipped=4 other=0 lost=0 twice=0" "$COUNTS"
  check "2: $jobs jobs: with the auth file 785 in all" same 785 "$(( $(echo "$COUNTS" | sed 's/^tests=\([0-9]*\).*/\1/') + AUTH_TESTS ))"
done

# ---- 3. each runner within 15% of its layout's mean ----
for jobs in 2 3 4; do
  OUT=$($TOOL times "$jobs" --report "$WEB_REPORT" --report "$DS_REPORT" 2>&1); RC=$?
  check "3: $jobs jobs: every runner within 15% of the mean on web 16.6.2 and docker-server 16.6.1 ($(echo "$OUT" | tail -1 | sed 's/.*runner is \([0-9.]*%\).*/farthest \1/'))" \
    same "0 0" "$RC $(echo "$OUT" | grep -c ' OFF ')"
done

# ---- 4. the lists refused, naming the file ----
refused_with() {  # refused_with <added line> <text in the refusal>
  cp asbl/ci/full-set-runners.txt "$SCRATCH/lists"; echo "$1" >> "$SCRATCH/lists"
  local out rc; out=$($TOOL check --lists "$SCRATCH/lists" 2>&1); rc=$?
  same 2 "$rc" && has "$2" "$out"
}
check "4: a file in two runners: refused, named" \
  refused_with "4 2 specs/features/canvas-dashboard-demos.spec.ts" "REFUSED  4 jobs: specs/features/canvas-dashboard-demos.spec.ts is in runner 1 and in runner 2"
check "4: a licence spec moved out of its runner: refused, named" \
  refused_with "4 1 specs/components/pause-cancel-resume-jobs.spec.ts" "specs/components/pause-cancel-resume-jobs.spec.ts (runner 1) elsewhere"
check "4: the auth file added: refused, named" \
  refused_with "3 2 specs/features/auth-authorization-server.spec.ts" "REFUSED  3 jobs: specs/features/auth-authorization-server.spec.ts (runner 2) is not in the full set"
check "4: the Electron-only file added: refused, named" \
  refused_with "2 2 specs/features/let-me-update-migrate-configuration.spec.ts" "specs/features/let-me-update-migrate-configuration.spec.ts (runner 2) is not in the full set"
cp asbl/ci/full-set-runners.txt "$SCRATCH/lists"; echo "4 1 specs/features/zz-gone.spec.ts" >> "$SCRATCH/lists"
OUT=$($TOOL check --lists "$SCRATCH/lists" 2>&1); RC=$?
check "4: a listed file that is gone: a WARN, the check passes" \
  bash -c '[ "$1" = 0 ] && case "$2" in *"WARN  4 jobs: specs/features/zz-gone.spec.ts (runner 1) is no spec file"*) true ;; *) false ;; esac' _ "$RC" "$OUT"

# ---- 5. a new spec file lands in the rest; each runner's pattern picks its files ----
CO="$SCRATCH/checkout"; mkdir -p "$CO/asbl/ci" "$CO/frend/reporting/e2e"
cp asbl/ci/dp-ci.sh asbl/ci/full-set-runners.py asbl/ci/full-set-runners.txt "$CO/asbl/ci/"
cp -r frend/reporting/e2e/specs "$CO/frend/reporting/e2e/"
printf "import { test } from '@playwright/test';\ntest('a new area', async () => {});\n" > "$CO/frend/reporting/e2e/specs/features/zz-new-area.spec.ts"
NEW=specs/features/zz-new-area.spec.ts
check "5: with the new file, the check passes, $((FULL_COUNT + 1)) files" \
  has "FULL SET  $((FULL_COUNT + 1)) spec files" "$(python3 "$CO/asbl/ci/full-set-runners.py" check 2>&1)"
for jl in "4 4" "3 3" "2 1"; do
  set -- $jl
  check "5: $1 jobs: the new file runs in the rest (runner $2)" \
    same "$NEW" "$(python3 "$CO/asbl/ci/full-set-runners.py" files "$1" "$2" | grep -F "$NEW")"
done
for jobs in 2 3 4; do
  ARGS=()
  for r in $(seq 1 "$jobs"); do
    python3 "$CO/asbl/ci/full-set-runners.py" pattern "$jobs" "$r" > "$SCRATCH/pattern-$jobs-$r"
    python3 "$CO/asbl/ci/full-set-runners.py" files "$jobs" "$r" > "$SCRATCH/new-files-$jobs-$r"
    ARGS+=("$SCRATCH/pattern-$jobs-$r" "$SCRATCH/new-files-$jobs-$r")
  done
  check "5: $jobs jobs: dp-ci.sh's runner regex with each runner's pattern picks exactly its files (the new one in the rest)" \
    same OK "$($H regex "$CO" "${ARGS[@]}")"
done
check "5: 1 job: no pattern (the whole full set)" same "" "$($TOOL pattern 1 1)"

# ---- 6. the merge ----
real_result() { grep -a '^E2E_RESULT mode=full' "$1" | tail -1 | sed 's/.* grep=.. //'; }
merged_result() { grep -a '^E2E_RESULT mode=full' "$1" | tail -1 | sed 's/.* grep=.. //'; }
passed_line() { grep -aE "^(stdout:)? *[0-9]+ passed( \(.*\))? *$" "$1" | tail -1 | grep -oE "[0-9]+" | head -1; }
cut_and_merge() {  # cut_and_merge <name> <report> <jobs>: the report cut by the lists, each part with its log, merged
  local name=$1 report=$2 jobs=$3 dir="$SCRATCH/$1"
  mkdir -p "$dir"
  # shellcheck disable=SC2046
  $H cut "$report" "${report%-playwright.json}.log" "$dir" $(seq -f "$SCRATCH/files-$jobs-%g" 1 "$jobs") > "$dir/logs"
  M="$dir/merged-e2e.log"
  # shellcheck disable=SC2046
  MERGE_OUT=$($TOOL merge "$jobs" "$M" $(cat "$dir/logs") 2>&1); MERGE_RC=$?
}
for jobs in 2 3 4; do
  cut_and_merge "web-$jobs" "$WEB_REPORT" "$jobs"
  check "6: web 16.6.2 cut into $jobs and merged: green, its counts back ($(real_result "${WEB_REPORT%-playwright.json}.log"))" \
    same "0 $(real_result "${WEB_REPORT%-playwright.json}.log")" "$MERGE_RC $(merged_result "$M")"
  check "6: web 16.6.2 in $jobs: the merged report's counts and tests are the real one's" \
    same "$($H stats "$WEB_REPORT") $($H tests "$WEB_REPORT")" "$($H stats "${M%.log}-playwright.json") $($H tests "${M%.log}-playwright.json")"
  check "6: web 16.6.2 in $jobs: the summary lines a reader greps (passed count, exit code, PIPELINE_RESULT, the report)" \
    same "$(passed_line "${WEB_REPORT%-playwright.json}.log") 0 SUCCESS ${M%.log}-playwright.json" \
    "$(passed_line "$M") $(grep -aoP '^Playwright exit code: \K\S+' "$M") $(grep -aoP '^PIPELINE_RESULT=\K\S+' "$M") $(grep -aoP '^E2E_RETRIES=.* E2E_JSON_REPORT=\K\S+' "$M")"
done
cut_and_merge ds-3 "$DS_REPORT" 3
check "6: docker-server 16.6.1 (one flaky test) cut into 3 and merged: its counts back ($(real_result "${DS_REPORT%-playwright.json}.log"))" \
  same "0 $(real_result "${DS_REPORT%-playwright.json}.log")" "$MERGE_RC $(merged_result "$M")"
FLAKY_REAL=$(bash asbl/ci/jenkins/release-orchestrator.sh flaky lane1 "$DS_REPORT" | cut -f1-3)
FLAKY_MERGED=$(bash asbl/ci/jenkins/release-orchestrator.sh flaky lane1 "${M%.log}-playwright.json" | cut -f1-3)
check "6: docker-server 16.6.1 in 3: flaky.txt's lines the same as the real report's ($(echo "$FLAKY_REAL" | grep -c .) line)" \
  bash -c '[ -n "$1" ] && [ "$1" = "$2" ]' _ "$FLAKY_REAL" "$FLAKY_MERGED"
check "6: docker-server 16.6.1 in 3: the flaky test named in the merged log" \
  has "(flaky, 2 tries)" "$(cat "$M")"

# a red runner, and one that never ran
mkdir -p "$SCRATCH/red"
# shellcheck disable=SC2046
$H cut "$WEB_REPORT" "${WEB_REPORT%-playwright.json}.log" "$SCRATCH/red" $(seq -f "$SCRATCH/files-4-%g" 1 4) > "$SCRATCH/red/logs"
mapfile -t RL < "$SCRATCH/red/logs"
$H redden "${RL[1]}" 2
OUT=$($TOOL merge 4 "$SCRATCH/red/merged-e2e.log" "${RL[@]}" 2>&1); RC=$?
M="$SCRATCH/red/merged-e2e.log"
check "6: runner 2 red (2 failed): the lane red, failed=2 exit=1, runner 2 named, its failures listed" \
  bash -c '[ "$1" = 1 ] && grep -q "^E2E_RESULT .* passed=641 failed=2 flaky=0 skipped=4 didnotrun=0 exit=1 target=web$" "$2" &&
    grep -q "^PIPELINE_RESULT=FAILED_IN_RUNNERS " "$2" && grep -q "^E2E_RUNNERS_RED 2 (PIPELINE_RESULT=FAILED_AT_STEP_4, Playwright exit 1)$" "$2" &&
    [ "$(grep -c "^  runner 2: .*(failed, " "$2")" = 2 ] && ! grep -q "^PIPELINE_RESULT=SUCCESS" "$2"' _ "$RC" "$M"
OUT=$($TOOL merge 4 "$SCRATCH/red/notrun-e2e.log" "${RL[0]}" - "${RL[2]}" "${RL[3]}" 2>&1); RC=$?
M="$SCRATCH/red/notrun-e2e.log"
check "6: runner 2 never ran: the lane red, its 7 files NOT_RUN in the log and in the report's errors" \
  bash -c '[ "$1" = 1 ] && grep -q "^E2E_RUNNER 2 log=none result=NOT_RUN (never ran) files=7: specs/" "$2" &&
    grep -q "^E2E_RESULT .* exit=1 target=web$" "$2" && grep -q "^E2E_RUNNERS_RED 2 (never ran)$" "$2" &&
    python3 -c "import json,sys; e=json.load(open(sys.argv[1]))[\"errors\"]; sys.exit(0 if len(e) == 1 and \"runner 2 of 4 never ran\" in e[0][\"message\"] and \"apps-ai-hub.spec.ts\" in e[0][\"message\"] else 1)" "${2%.log}-playwright.json"' _ "$RC" "$M"
OUT=$($TOOL merge 4 "$SCRATCH/red/merged-e2e.log" "${RL[@]}" 2>&1); RC=$?
check "6: a merged log there already: refused, nothing written" same "2 REFUSED" "$RC $(echo "$OUT" | cut -c1-7)"
OUT=$($TOOL merge 4 "$SCRATCH/red/three-e2e.log" "${RL[0]}" "${RL[1]}" "${RL[2]}" 2>&1); RC=$?
check "6: 4 jobs with 3 runner logs: refused, nothing written" \
  bash -c '[ "$1" = 2 ] && [ ! -e "$2" ]' _ "$RC" "$SCRATCH/red/three-e2e.log"

[ "$FAILED_CASES" = 0 ] && { echo "ALL PASS  test-runner-lists"; exit 0; }
echo "FAILED  $FAILED_CASES case(s)  test-runner-lists"; exit 1

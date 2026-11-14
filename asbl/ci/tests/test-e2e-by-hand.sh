#!/bin/bash
# The by-hand half of the job dp-ci-e2e-nightly-or-by-hand (asbl/ci/jenkins/e2e-by-hand.sh) with a stub follow-ci (no
# e2e runs: it exits with the codes the case gives) and a stub fixer. The cases:
#   - the wrong inputs (ON_FAILURES, E2E_MODE, a package in dev mode, no package in production-packaged, no spec nor
#     grep, E2E_PACKAGE on a package, E2E_SPEC with a quarter, next-nightly-pair): refused, nothing run; green: exit 0,
#     no run folder, the loop given the spec and grep in dev mode;
#   - the quarters: on web (the loop, the quarter's regex, retries 1), on datapallas.zip (windows) (with the desktop's
#     own spec, the 16 h cap); a dry run: the command printed, nothing run;
#   - the four package names, each run on its lane, production-packaged;
#   - the packaged lanes (E2E_MODE=production-packaged): docker-server (dp-ci.sh e2e, the image built when there is none to reuse), windows-vm-docker
#     (a regex already written with [\\/] kept), windows-vm-server (a kept pack of the commit under test reused),
#     windows-vm-electron (each / of E2E_SPEC matching either separator; no pack: the lane packs first), red: its run
#     folder names the lane and the VM;
#   - red, report-only: exit 1, its run folder (result.txt as the fixer reads it: run_kind, spec, grep, pin, a FAIL part);
#   - red with no fixer set: report-only, saying so;
#   - red, fix-prove-then-wait-for-review: the fix round in review, its diff waits (the proceed line), exit 1; no diff:
#     nothing to review, exit 1;
#   - red, fix-prove-then-rerun-automatically: the fix round pushes, DONE: the loop again once, its verdict the exit
#     code (green, red again); BLOCKED: no second run;
#   - the quarters for the form (e2e-by-hand.sh quarters): written 644, each quarter with its files of
#     full-set-runners.py; no full set: no counts; on this host's run folders (only read; TEST_BY_HAND_RUNS): counted and
#     timed; a path that cannot be written: exit 1; nothing run.
# Every folder is a scratch one; nothing is committed or pushed. Takes a few seconds.
#   bash asbl/ci/tests/test-e2e-by-hand.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-e2e-by-hand.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
has() {  # has <text> <text to search>
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}

export STUB="$SCRATCH/stub" LOG_DIR="$SCRATCH/logs"; mkdir -p "$STUB" "$LOG_DIR"
# the stub follow-ci: records its call, writes a log (latest.log points at it), exits with the next code in $STUB/rcs
cat > "$STUB/follow" <<'EOF'
#!/bin/bash
echo "$* E2E_SPEC=${E2E_SPEC:-} E2E_GREP=${E2E_GREP:-}" >> "$STUB/follow-calls"
echo "$* | MODE=${E2E_MODE-} TARGET=${E2E_TARGET-} SPEC=${E2E_SPEC-} GREP=${E2E_GREP-} RETRIES=${E2E_RETRIES-} PACKAGE=${E2E_PACKAGE-} KEPT=${RELEASE_KEPT-} PACK=${REBUILD_PACK-} REUSE=${E2E_REUSE_BUILD-}" >> "$STUB/follow-env"
link="$LOG_DIR/latest.log"; case "$*" in *win-e2e.sh*) link="$LOG_DIR/win-e2e-latest.log" ;; esac
n=$(wc -l < "$STUB/follow-calls"); echo "the loop's log" > "$LOG_DIR/loop-$n.log"; ln -sfn "$LOG_DIR/loop-$n.log" "$link"
echo "${WIN_RUN_TIMEOUT-}" >> "$STUB/follow-timeout"
rc=$(head -1 "$STUB/rcs"); sed -i 1d "$STUB/rcs"; exit "${rc:-0}"
EOF
# the stub fixer: start writes a diff and a report in the run's folder when $STUB/makes-diff exists; status prints $STUB/says
cat > "$STUB/fixer" <<'EOF'
#!/bin/bash
echo "$* FIX_MODE=${FIX_MODE:-}" >> "$STUB/fixer-calls"
case "$1" in
  start)  [ ! -f "$STUB/makes-diff" ] || { echo "a diff" > "$2/fix.diff"; echo "# the fix" > "$2/fix-report.md"; }
          echo "FIX_RUN=run-1"; echo "FIX_PLAN=$STUB/plan.md" ;;
  status) echo "FIX_STATUS=$(cat "$STUB/says") > status line (stub)" ;;
esac
EOF
printf '#!/bin/bash\necho "$*" >> "$STUB/dp-ci-calls"\n' > "$STUB/dp-ci"
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf" BY_HAND_FOLLOW_CI="bash $STUB/follow" BY_HAND_POLL=0
export BY_HAND_DP_CI="bash $STUB/dp-ci" BY_HAND_COMMIT=HEAD RELEASE_ARTIFACTS_DIR="$SCRATCH/release-artifacts"
printf 'RELEASE_FIXER="bash %s"\n' "$STUB/fixer" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"
case_run() {  # case_run <name> <the loop's exit codes, space separated> <fixer says> [makes-diff]: a fresh case; then e2e-by-hand.sh
  rm -f "$STUB"/follow-calls "$STUB"/follow-env "$STUB"/follow-timeout "$STUB"/fixer-calls "$STUB"/makes-diff "$STUB"/dp-ci-calls
  printf '%s\n' $2 > "$STUB/rcs"; echo "$3" > "$STUB/says"; [ -z "${4:-}" ] || : > "$STUB/makes-diff"
  export RUN_RECORD_DIR="$SCRATCH/runs-$1"
}
by_hand() { E2E_SPEC=reporting E2E_GREP='the burst' bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1; }
loops() { [ -f "$STUB/follow-calls" ] && wc -l < "$STUB/follow-calls" || echo 0; }
the_run_folder() { ls -d "$RUN_RECORD_DIR"/*-e2e-by-hand 2>/dev/null; }

echo "---- the wrong input; green ----"
check "a wrong ON_FAILURES: refused (exit 2), nothing run" bash -c 'rm -f "$STUB/follow-calls"; ON_FAILURES=fix bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1; [ $? = 2 ] && [ ! -f "$STUB/follow-calls" ]'
check "a wrong E2E_TARGET: refused (exit 2), nothing run" bash -c 'E2E_SPEC=x E2E_MODE=production-packaged E2E_TARGET=windows bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1; [ $? = 2 ] && [ ! -f "$STUB/follow-calls" ]'
check "a package in dev mode: refused (exit 2), nothing run, says production-packaged" bash -c 'out=$(E2E_SPEC=x E2E_TARGET="datapallas.zip (windows)" bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); [ $? = 2 ] &&
  grep -q "E2E_MODE=production-packaged" <<< "$out" && [ ! -f "$STUB/follow-calls" ]'
check "no E2E_SPEC nor E2E_GREP: refused (exit 2), nothing run, no fix round" bash -c 'bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1; [ $? = 2 ] &&
  [ ! -f "$STUB/follow-calls" ] && [ ! -f "$STUB/fixer-calls" ]'
case_run green 0 DONE
out=$(by_hand); rc=$?
check "green: exit 0, BY_HAND_RESULT=green, no run folder" bash -c '[ "$0" = 0 ] && [ "$(tail -1 <<< "$1")" = BY_HAND_RESULT=green ] && [ ! -d "$2" ]' "$rc" "$out" "$RUN_RECORD_DIR"
check "  the loop given the spec and the grep, dev mode, the package as it is" bash -c 'grep -qx "run bash asbl/ci/dp-ci.sh e2e-loop E2E_SPEC=reporting E2E_GREP=the burst" "$0" &&
  grep -qxF "run bash asbl/ci/dp-ci.sh e2e-loop | MODE=dev TARGET=web SPEC=reporting GREP=the burst RETRIES= PACKAGE=package-reuse-as-is KEPT= PACK= REUSE=" "$1"' "$STUB/follow-calls" "$STUB/follow-env"
for wrong in "E2E_SPEC=x E2E_MODE=production-packaged" "E2E_SPEC=x E2E_TARGET=web E2E_MODE=production-packaged" \
             "E2E_SPEC=x E2E_TARGET=electron-linux E2E_MODE=production-packaged" "E2E_SPEC=x E2E_TARGET=docker-server" \
             "E2E_SPEC=x E2E_MODE=production-packaged E2E_TARGET=docker-server E2E_PACKAGE=package-repackage" "E2E_SPEC=x WHAT_TO_RUN=full-set-quarter-1" \
             "WHAT_TO_RUN=next-nightly-pair" "WHAT_TO_RUN=full-set-quarter-5" "E2E_SPEC=x E2E_MODE=packaged" "E2E_SPEC=x DRY_RUN=maybe"; do
  check "refused (exit 2), nothing run: $wrong" bash -c 'rm -f "$STUB/follow-calls"; env $0 bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1; [ $? = 2 ] && [ ! -f "$STUB/follow-calls" ]' "$wrong"
done

echo "---- the quarters; a dry run ----"
case_run quarter 0 DONE
want="run bash asbl/ci/dp-ci.sh e2e-loop | MODE=dev TARGET=web SPEC=$(python3 asbl/ci/full-set-runners.py spec $(python3 asbl/ci/full-set-runners.py files 4 2)) GREP= RETRIES=1 PACKAGE=package-reuse-as-is KEPT= PACK= REUSE="
out=$(WHAT_TO_RUN=full-set-quarter-2 bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); rc=$?
check "quarter 2 on web: green, the loop on the quarter's files (full-set-runners.py), retries 1" bash -c '[ "$0" = 0 ] && grep -qxF "$1" "$2"' "$rc" "$want" "$STUB/follow-env"
case_run quarter-win 0 DONE
WHAT_TO_RUN=full-set-quarter-3 E2E_TARGET='datapallas.zip (windows)' E2E_MODE=production-packaged bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1
check "quarter 3 on datapallas.zip (windows): with the desktop's own spec, retries 1, the 16 h cap" bash -c 'grep -q "let-me-update-migrate-configuration" "$0" &&
  grep -q " RETRIES=1 " "$0" && grep -qx 57600 "$1"' "$STUB/follow-env" "$STUB/follow-timeout"
case_run dry 0 DONE
out=$(E2E_SPEC=reporting DRY_RUN=yes bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); rc=$?
check "a dry run: exit 0, the command printed, nothing run" bash -c '[ "$0" = 0 ] && grep -q "^WOULD   .*E2E_MODE=dev .*e2e-loop$" <<< "$1" &&
  [ "$(tail -1 <<< "$1")" = "BY_HAND_RESULT=dry-run (nothing ran)" ] && [ ! -f "$STUB/follow-calls" ]' "$rc" "$out"

echo "---- the four package names: each on its lane, production-packaged ----"
for pair in "datapallas.zip (windows)|windows-vm-electron|win-e2e.sh e2e" "datapallas-server.zip (windows)|windows-vm-server|win-e2e.sh server-e2e" \
            "datapallas-server-docker.zip (windows)|windows-vm-docker|win-e2e.sh docker-e2e" "datapallas-server-docker.zip (linux)|docker-server|dp-ci.sh e2e"; do
  IFS='|' read -r name lane runs <<< "$pair"
  case_run "map-$lane" 0 DONE
  out=$(E2E_SPEC='/x\.spec\.ts$' E2E_MODE=production-packaged E2E_TARGET="$name" bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); rc=$?
  check "$name: lane $lane ($runs), production-packaged, green" bash -c '[ "$0" = 0 ] && grep -qF "BY_HAND what=spec-and-grep target='"'"'$1'"'"' lane=$2 mode=production-packaged " <<< "$3" &&
    grep -q "^run bash asbl/ci/.*$4 | MODE=production-packaged " "$5"' "$rc" "$name" "$lane" "$out" "$runs" "$STUB/follow-env"
  rm -rf "${RELEASE_ARTIFACTS_DIR:?}"/*
done

echo "---- the packaged lanes ----"
case_run docker 0 DONE
out=$(E2E_SPEC='/features/samples\.spec\.ts$' E2E_GREP=burst E2E_MODE=production-packaged E2E_TARGET=docker-server bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); rc=$?
check "docker-server: green, dp-ci.sh e2e, packaged, the spec as given, the grep, no retries, no e2e package" bash -c '[ "$0" = 0 ] &&
  grep -qxF "run bash asbl/ci/dp-ci.sh e2e | MODE=production-packaged TARGET=docker-server SPEC=/features/samples\.spec\.ts\$ GREP=burst RETRIES= PACKAGE= KEPT= PACK= REUSE=" "$1"' "$rc" "$STUB/follow-env"
check "  no build to reuse: the image built first" bash -c 'grep -qx build-if-needed "$0"' "$STUB/dp-ci-calls"
case_run vm-docker 0 DONE
E2E_SPEC='[\\/]areas[\\/]x\.spec\.ts$' E2E_MODE=production-packaged E2E_TARGET=windows-vm-docker bash asbl/ci/jenkins/e2e-by-hand.sh >/dev/null 2>&1
want='run bash asbl/ci/jenkins/win-e2e.sh docker-e2e | MODE=production-packaged TARGET= SPEC=[\\/]areas[\\/]x\.spec\.ts$ GREP= RETRIES= PACKAGE= KEPT= PACK= REUSE='
check "windows-vm-docker: win-e2e.sh docker-e2e, a regex already written with [\\/] kept as it is" grep -qxF "$want" "$STUB/follow-env"
case_run vm-server 0 DONE
mkdir -p "$RELEASE_ARTIFACTS_DIR/16.6.1-kept"; printf 'commit=%s\nwindows.file=datapallas-server.zip sha256=x\n' "$(git rev-parse HEAD)" > "$RELEASE_ARTIFACTS_DIR/16.6.1-kept/MANIFEST.txt"
out=$(E2E_SPEC='/x\.spec\.ts$' E2E_MODE=production-packaged E2E_TARGET=windows-vm-server bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1)
want='run bash asbl/ci/jenkins/win-e2e.sh server-e2e | MODE=production-packaged TARGET= SPEC=[\\/]x\.spec\.ts$ GREP= RETRIES= PACKAGE= KEPT='"$RELEASE_ARTIFACTS_DIR/16.6.1-kept"' PACK=no REUSE='
check "windows-vm-server: win-e2e.sh server-e2e on the kept pack of the commit under test, reused" bash -c 'grep -q "^BUILD   windows-pack: reuse " <<< "$0" &&
  grep -qxF "$1" "$2"' "$out" "$want" "$STUB/follow-env"
rm -rf "${RELEASE_ARTIFACTS_DIR:?}"/*
case_run vm-electron 2 DONE
out=$(E2E_SPEC='/features/samples\.spec\.ts$' E2E_MODE=production-packaged E2E_TARGET='datapallas.zip (windows)' ON_FAILURES=report-only bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); rc=$?; dir=$(the_run_folder)
want='run bash asbl/ci/jenkins/win-e2e.sh e2e | MODE=production-packaged TARGET= SPEC=[\\/]features[\\/]samples\.spec\.ts$ GREP= RETRIES= PACKAGE= KEPT= PACK=yes REUSE='
check "windows-vm-electron: win-e2e.sh e2e, each / matching either separator; no pack: the lane packs first" grep -qxF "$want" "$STUB/follow-env"
check "  red: exit 1, its run folder names the package, the lane, the VM, its log and the commit under test" bash -c '[ "$0" = 1 ] &&
  grep -qxF "target=datapallas.zip (windows)" "$1/result.txt" && grep -qx lane=windows-vm-electron "$1/result.txt" && grep -qP "^part\twindows-vm-electron\twindows-vm\tFAIL\t$2/loop-1.log\t\trc=2$" "$1/result.txt" &&
  grep -qx "pin=$(git rev-parse HEAD)" "$1/result.txt"' "$rc" "$dir" "$LOG_DIR"

echo "---- red, report-only; no fixer ----"
case_run report 3 DONE
out=$(ON_FAILURES=report-only by_hand); rc=$?; dir=$(the_run_folder)
check "report-only: exit 1, its run folder named, no fix round" bash -c '[ "$0" = 1 ] && grep -qx "BY_HAND_RUN_FOLDER=$2" <<< "$1" &&
  [ ! -f "$STUB/fixer-calls" ] && grep -q "^BY_HAND_RESULT=red (ON_FAILURES=report-only" <<< "$1"' "$rc" "$out" "$dir"
check "  result.txt: red, run_kind, what, mode, spec, grep, target, the tested commit, a FAIL part with the loop's log" bash -c '
  r="$0/result.txt"; grep -qx result=red "$r" && grep -qx run_kind=by-hand "$r" && grep -qx spec=reporting "$r" &&
  grep -qx what=spec-and-grep "$r" && grep -qx mode=dev "$r" &&
  grep -qx "grep=the burst" "$r" && grep -qx target=web "$r" && grep -qx "pin=$(git rev-parse HEAD)" "$r" && grep -qx step1=not-run "$r" &&
  grep -qP "^part\tweb\thost\tFAIL\t$1/loop-1.log\t\trc=3$" "$r" && [ -f "$0/flaky.txt" ]' "$dir" "$LOG_DIR"
case_run nofixer 3 DONE
check "no fixer set: exit 1, report-only, saying so" bash -c 'out=$(RELEASE_REHEARSAL_CONF=/nonexistent E2E_SPEC=reporting bash asbl/ci/jenkins/e2e-by-hand.sh 2>&1); [ $? = 1 ] &&
  grep -q "^BY_HAND_RESULT=red (no fixer set" <<< "$out"'

echo "---- red, fix-prove-then-wait-for-review ----"
case_run review 3 DONE makes-diff
out=$(by_hand); rc=$?; dir=$(the_run_folder)
check "its diff waits: exit 1, the fixer told review, the proceed line, the loop not run again" bash -c '[ "$0" = 1 ] &&
  grep -q "^start $2 1 FIX_MODE=review$" "$3" && grep -q "^FIX_ROUND state=waiting kind=review" <<< "$1" &&
  grep -q "^BY_HAND_RESULT=red: its fix waits for review: bash asbl/ci/jenkins/fix-round.sh proceed|abort $2 <who>$" <<< "$1"' \
  "$rc" "$out" "$dir" "$STUB/fixer-calls"
check "  one loop run" bash -c '[ "$0" = 1 ]' "$(loops)"
case_run review-nodiff 3 DONE
out=$(by_hand); rc=$?
check "no diff: exit 1, nothing to review" bash -c '[ "$0" = 1 ] && grep -q "state=no-fix" <<< "$1" &&
  grep -q "^BY_HAND_RESULT=red: the fix round ended with nothing to review" <<< "$1"' "$rc" "$out"

echo "---- red, fix-prove-then-rerun-automatically ----"
case_run push-green "3 0" DONE
out=$(ON_FAILURES=fix-prove-then-rerun-automatically by_hand); rc=$?
check "DONE, green again: exit 0, the loop run twice, the fixer told push" bash -c '[ "$0" = 0 ] && [ "$2" = 2 ] &&
  grep -q "FIX_MODE=push$" "$3" && [ "$(tail -1 <<< "$1")" = "BY_HAND_RESULT=green after the fix round" ]' "$rc" "$out" "$(loops)" "$STUB/fixer-calls"
case_run push-red "3 4" DONE
out=$(ON_FAILURES=fix-prove-then-rerun-automatically by_hand); rc=$?
check "DONE, red again: exit 1, saying so" bash -c '[ "$0" = 1 ] && [ "$(tail -1 <<< "$1")" = "BY_HAND_RESULT=red again after the fix round (rc=4)" ]' "$rc" "$out"
case_run push-blocked "3 0" BLOCKED
out=$(ON_FAILURES=fix-prove-then-rerun-automatically by_hand); rc=$?
check "BLOCKED: exit 1, no second run" bash -c '[ "$0" = 1 ] && [ "$2" = 1 ] && grep -q "did not end DONE" <<< "$1"' "$rc" "$out" "$(loops)"

echo "---- the quarters for the form (WHAT_TO_RUN's block) ----"
# quarters_ok <file> <counted|uncounted>: 4 quarters, each naming its files of full-set-runners.py (4 jobs) and their count
cat > "$SCRATCH/quarters-ok.py" <<'PYQ'
import json, subprocess, sys
data, counted = json.load(open(sys.argv[1])), sys.argv[2] == "counted"
assert sorted(data["quarters"]) == ["1", "2", "3", "4"], data["quarters"].keys()
for n in "1234":
    files = subprocess.run(["python3", "asbl/ci/full-set-runners.py", "files", "4", n], capture_output=True, text=True, check=True).stdout.split()
    text = data["quarters"][n]
    first = text.split("\n")[0]
    assert first.startswith("full-set-quarter-%s: %d spec files, " % (n, len(files))), first
    assert all(f in text for f in files), n
    assert ("?" not in first and "Time, by estimate: about " in text) if counted else first.endswith(", ? tests"), first
PYQ
rm -f "$STUB/follow-calls"
out=$(E2E_QUARTERS_FILE="$SCRATCH/q/e2e-quarters.json" RUN_RECORD_DIR="$SCRATCH/no-runs" bash asbl/ci/jenkins/e2e-by-hand.sh quarters); rc=$?
check "quarters, no full set yet: written for the form (644), each quarter with its files, no counts, nothing run" bash -c '[ "$0" = 0 ] &&
  [ "$1" = "QUARTERS written to $2" ] && [ "$(stat -c %a "$2")" = 644 ] && [ ! -f "$3" ] && python3 "$4" "$2" uncounted' \
  "$rc" "$out" "$SCRATCH/q/e2e-quarters.json" "$STUB/follow-calls" "$SCRATCH/quarters-ok.py"
check "quarters, a path that cannot be written: exit 1, saying so" bash -c 'out=$(E2E_QUARTERS_FILE=/proc/no/e2e-quarters.json RUN_RECORD_DIR="$0" bash asbl/ci/jenkins/e2e-by-hand.sh quarters 2>/dev/null); [ $? = 1 ] && grep -q "^FAIL  /proc/no/e2e-quarters.json could not be written" <<< "$out"' "$SCRATCH/no-runs"
REAL_RUNS="${TEST_BY_HAND_RUNS:-/var/kraft-internalsystems/logs/datapallas-ci/runs}"
if python3 asbl/ci/release-estimate.py files --runs "$REAL_RUNS" --target web >/dev/null 2>&1 ||
   python3 asbl/ci/release-estimate.py files --runs "$REAL_RUNS" --target docker-server >/dev/null 2>&1; then
  check "quarters, on this host's run folders (only read): each quarter's tests counted and its time estimated" bash -c 'E2E_QUARTERS_FILE="$0" RUN_RECORD_DIR="$1" bash asbl/ci/jenkins/e2e-by-hand.sh quarters >/dev/null && python3 "$2" "$0" counted' \
    "$SCRATCH/q/real.json" "$REAL_RUNS" "$SCRATCH/quarters-ok.py"
else
  echo "SKIP  quarters on real run folders: no passed full set in $REAL_RUNS (TEST_BY_HAND_RUNS)"
fi

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-e2e-by-hand"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-e2e-by-hand"; exit 1

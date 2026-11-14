#!/bin/bash
# The job dp-ci-dev-e2e-one-spec's script (asbl/ci/jenkins/one-spec.sh) with a stub follow-ci (no e2e runs: it exits
# with the codes the case gives) and a stub fixer. The cases:
#   - a wrong ON_FAILURES: refused; green: exit 0, no run folder, the loop given the spec and grep;
#   - red, report-only: exit 1, its run folder (result.txt as the fixer reads it: run_kind, spec, grep, pin, a FAIL part);
#   - red with no fixer set: report-only, saying so;
#   - red, fix-prove-then-wait-for-review: the fix round in review, its diff waits (the proceed line), exit 1; no diff:
#     nothing to review, exit 1;
#   - red, fix-prove-then-rerun-automatically: the fix round pushes, DONE: the loop again once, its verdict the exit
#     code (green, red again); BLOCKED: no second run.
# Every folder is a scratch one; nothing is committed or pushed. Takes a few seconds.
#   bash asbl/ci/tests/test-one-spec.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-one-spec.XXXXXX") || exit 2
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
n=$(wc -l < "$STUB/follow-calls"); echo "the loop's log" > "$LOG_DIR/loop-$n.log"; ln -sfn "$LOG_DIR/loop-$n.log" "$LOG_DIR/latest.log"
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
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf" ONE_SPEC_FOLLOW_CI="bash $STUB/follow" ONE_SPEC_POLL=0
printf 'RELEASE_FIXER="bash %s"\n' "$STUB/fixer" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"
case_run() {  # case_run <name> <the loop's exit codes, space separated> <fixer says> [makes-diff]: a fresh case; then one-spec.sh
  rm -f "$STUB"/follow-calls "$STUB"/fixer-calls "$STUB"/makes-diff
  printf '%s\n' $2 > "$STUB/rcs"; echo "$3" > "$STUB/says"; [ -z "${4:-}" ] || : > "$STUB/makes-diff"
  export RUN_RECORD_DIR="$SCRATCH/runs-$1"
}
one_spec() { E2E_SPEC=reporting E2E_GREP='the burst' bash asbl/ci/jenkins/one-spec.sh 2>&1; }
loops() { [ -f "$STUB/follow-calls" ] && wc -l < "$STUB/follow-calls" || echo 0; }
the_run_folder() { ls -d "$RUN_RECORD_DIR"/*-one-spec 2>/dev/null; }

echo "---- the wrong input; green ----"
check "a wrong ON_FAILURES: refused (exit 2), nothing run" bash -c 'rm -f "$STUB/follow-calls"; ON_FAILURES=fix bash asbl/ci/jenkins/one-spec.sh >/dev/null 2>&1; [ $? = 2 ] && [ ! -f "$STUB/follow-calls" ]'
case_run green 0 DONE
out=$(one_spec); rc=$?
check "green: exit 0, ONE_SPEC_RESULT=green, no run folder" bash -c '[ "$0" = 0 ] && [ "$(tail -1 <<< "$1")" = ONE_SPEC_RESULT=green ] && [ ! -d "$2" ]' "$rc" "$out" "$RUN_RECORD_DIR"
check "  the loop given the spec and the grep" bash -c 'grep -qx "run bash asbl/ci/dp-ci.sh e2e-loop E2E_SPEC=reporting E2E_GREP=the burst" "$0"' "$STUB/follow-calls"

echo "---- red, report-only; no fixer ----"
case_run report 3 DONE
out=$(ON_FAILURES=report-only one_spec); rc=$?; dir=$(the_run_folder)
check "report-only: exit 1, its run folder named, no fix round" bash -c '[ "$0" = 1 ] && grep -qx "ONE_SPEC_RUN_FOLDER=$2" <<< "$1" &&
  [ ! -f "$STUB/fixer-calls" ] && grep -q "^ONE_SPEC_RESULT=red (ON_FAILURES=report-only" <<< "$1"' "$rc" "$out" "$dir"
check "  result.txt: red, run_kind, spec, grep, target, the tested commit, a FAIL part with the loop's log" bash -c '
  r="$0/result.txt"; grep -qx result=red "$r" && grep -qx run_kind=one-spec "$r" && grep -qx spec=reporting "$r" &&
  grep -qx "grep=the burst" "$r" && grep -qx target=web "$r" && grep -qx "pin=$(git rev-parse HEAD)" "$r" && grep -qx step1=not-run "$r" &&
  grep -qP "^part\tweb\thost\tFAIL\t$1/loop-1.log\t\trc=3$" "$r" && [ -f "$0/flaky.txt" ]' "$dir" "$LOG_DIR"
case_run nofixer 3 DONE
check "no fixer set: exit 1, report-only, saying so" bash -c 'out=$(RELEASE_REHEARSAL_CONF=/nonexistent E2E_SPEC=reporting bash asbl/ci/jenkins/one-spec.sh 2>&1); [ $? = 1 ] &&
  grep -q "^ONE_SPEC_RESULT=red (no fixer set" <<< "$out"'

echo "---- red, fix-prove-then-wait-for-review ----"
case_run review 3 DONE makes-diff
out=$(one_spec); rc=$?; dir=$(the_run_folder)
check "its diff waits: exit 1, the fixer told review, the proceed line, the loop not run again" bash -c '[ "$0" = 1 ] &&
  grep -q "^start $2 1 FIX_MODE=review$" "$3" && grep -q "^FIX_ROUND state=waiting kind=review" <<< "$1" &&
  grep -q "^ONE_SPEC_RESULT=red: its fix waits for review: bash asbl/ci/jenkins/fix-round.sh proceed|abort $2 <who>$" <<< "$1"' \
  "$rc" "$out" "$dir" "$STUB/fixer-calls"
check "  one loop run" bash -c '[ "$0" = 1 ]' "$(loops)"
case_run review-nodiff 3 DONE
out=$(one_spec); rc=$?
check "no diff: exit 1, nothing to review" bash -c '[ "$0" = 1 ] && grep -q "state=no-fix" <<< "$1" &&
  grep -q "^ONE_SPEC_RESULT=red: the fix round ended with nothing to review" <<< "$1"' "$rc" "$out"

echo "---- red, fix-prove-then-rerun-automatically ----"
case_run push-green "3 0" DONE
out=$(ON_FAILURES=fix-prove-then-rerun-automatically one_spec); rc=$?
check "DONE, green again: exit 0, the loop run twice, the fixer told push" bash -c '[ "$0" = 0 ] && [ "$2" = 2 ] &&
  grep -q "FIX_MODE=push$" "$3" && [ "$(tail -1 <<< "$1")" = "ONE_SPEC_RESULT=green after the fix round" ]' "$rc" "$out" "$(loops)" "$STUB/fixer-calls"
case_run push-red "3 4" DONE
out=$(ON_FAILURES=fix-prove-then-rerun-automatically one_spec); rc=$?
check "DONE, red again: exit 1, saying so" bash -c '[ "$0" = 1 ] && [ "$(tail -1 <<< "$1")" = "ONE_SPEC_RESULT=red again after the fix round (rc=4)" ]' "$rc" "$out"
case_run push-blocked "3 0" BLOCKED
out=$(ON_FAILURES=fix-prove-then-rerun-automatically one_spec); rc=$?
check "BLOCKED: exit 1, no second run" bash -c '[ "$0" = 1 ] && [ "$2" = 1 ] && grep -q "did not end DONE" <<< "$1"' "$rc" "$out" "$(loops)"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-one-spec"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-one-spec"; exit 1

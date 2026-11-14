#!/bin/bash
# The job dp-ci-dev-e2e-one-spec: the fix-and-retry loop (dp-ci.sh e2e-loop) on one spec file, or some of its tests, then
# what a red run leads to (ON_FAILURES, the same three values as the release and nightly jobs). The job runs this on the
# host over SSH; a person or an agent runs the same from a shell. It never counts for a release.
#
# WHAT IT DOES
#   1. The run: follow-ci.sh run bash asbl/ci/dp-ci.sh e2e-loop, with E2E_SPEC, E2E_GREP, E2E_TARGET and E2E_PACKAGE as
#      given (dp-ci.sh's header says what each does). Green: exit 0.
#   2. Red: its folder <RUN_RECORD_DIR>/<UTC>-one-spec/, result.txt and flaky.txt in the release orchestrator's format
#      (run_kind=one-spec), then by ON_FAILURES:
#      fix-prove-then-wait-for-review   the fix round in a scratch clone (asbl/ci/jenkins/fix-round.sh), waited for. Its
#                                       diff and report then wait for a person:
#                                       bash asbl/ci/jenkins/fix-round.sh proceed|abort <the run's folder> <who>
#      fix-prove-then-rerun-automatically   the fix round pushes its fixes, waited for; when it ended DONE, the same spec
#                                       and grep run again at once, once, and that run's verdict is the exit code
#      report-only                      red, no agent
#      With no fixer set, both fix values act as report-only and say so.
#   The lines a caller reads: ONE_SPEC_RUN_FOLDER=<folder> (a red run), FIX_ROUND state=... (after a fix round, as
#   fix-round.sh status prints it), and the last one, ONE_SPEC_RESULT=green|red ...
#
# INPUTS (environment; the job's parameters, the same names):
#   E2E_SPEC, E2E_GREP, E2E_TARGET [web], E2E_PACKAGE   passed to dp-ci.sh e2e-loop as they are
#   ON_FAILURES [fix-prove-then-wait-for-review]
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci], RUN_RECORD_DIR [<LOG_DIR>/runs],
#   RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf] (the fixer, read by fix-round.sh)
#   For the tests (asbl/ci/tests/test-one-spec.sh): ONE_SPEC_FOLLOW_CI [bash asbl/ci/jenkins/follow-ci.sh] (what runs the
#   loop), ONE_SPEC_POLL [60] (seconds between two looks at a fix round)
#
# EXIT CODES: 0 green (also green again after a fix round); 1 red; 2 a wrong input
#
# EXAMPLES
#   E2E_SPEC=reporting E2E_GREP='burst' bash asbl/ci/jenkins/one-spec.sh
#   E2E_SPEC=reporting ON_FAILURES=report-only bash asbl/ci/jenkins/one-spec.sh
#
# Callers: the Jenkins job dp-ci-dev-e2e-one-spec; a person or an agent. Test: asbl/ci/tests/test-one-spec.sh.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
RUN_RECORD_DIR="${RUN_RECORD_DIR:-$LOG_DIR/runs}"
ON_FAILURES="${ON_FAILURES:-fix-prove-then-wait-for-review}"
ONE_SPEC_FOLLOW_CI="${ONE_SPEC_FOLLOW_CI:-bash asbl/ci/jenkins/follow-ci.sh}"
ONE_SPEC_POLL="${ONE_SPEC_POLL:-60}"
FIX_ROUND="bash asbl/ci/jenkins/fix-round.sh"
# shellcheck source=run-result.sh
. asbl/ci/jenkins/run-result.sh

# run_the_loop: dp-ci.sh e2e-loop once, followed to its end; its exit code, its log in LOOP_LOG
run_the_loop() {
  local t0 rc
  t0=$(date +%s)
  $ONE_SPEC_FOLLOW_CI run bash asbl/ci/dp-ci.sh e2e-loop; rc=$?
  LOOP_LOG=$(newest_log_since "$LOG_DIR/latest.log" "$t0")
  return "$rc"
}

# write_red_run_folder <exit code>: the red run's folder (prints its path)
write_red_run_folder() {
  local rc="$1" run dir tested target json=""
  run=$(date -u +%Y%m%dT%H%M%SZ) target="${E2E_TARGET:-web}"
  dir="$RUN_RECORD_DIR/$run-one-spec"
  mkdir -p "$dir" || return 1
  [ -z "$LOOP_LOG" ] || [ ! -f "${LOOP_LOG%.log}-playwright.json" ] || json="${LOOP_LOG%.log}-playwright.json"
  tested=$(git rev-parse HEAD)   # the loop puts this checkout on origin/main first, then tests it
  write_run_result "$dir" red "a one-spec run (asbl/ci/jenkins/one-spec.sh)" \
    "$(part_line "$target" host "$rc" "${LOOP_LOG:--}" "$json" "rc=$rc")" \
    dry_run=no run_kind=one-spec run="$run" target="$target" spec="${E2E_SPEC:-}" grep="${E2E_GREP:-}" \
    version="$(version_at "$tested")" pin="$tested" kept= step1=not-run summary="${LOOP_LOG:-}" flaky="$dir/flaky.txt" || return 1
  echo "$dir"
}

case "$ON_FAILURES" in
  fix-prove-then-wait-for-review) fix_kind=review ;;
  fix-prove-then-rerun-automatically) fix_kind=push ;;
  report-only) fix_kind="" ;;
  *) echo "FAIL  ON_FAILURES must be fix-prove-then-wait-for-review, fix-prove-then-rerun-automatically or report-only (got '$ON_FAILURES')"; exit 2 ;;
esac
[ "${1:-run}" = run ] || { sed -n '2,/^set -uo pipefail$/p' "$0" | sed '$d'; exit 2; }

run_the_loop; rc=$?
[ "$rc" != 0 ] || { echo "ONE_SPEC_RESULT=green"; exit 0; }
run_folder=$(write_red_run_folder "$rc") || { echo "ONE_SPEC_RESULT=red: its run folder could not be written"; exit 1; }
echo "ONE_SPEC_RUN_FOLDER=$run_folder"
if [ -z "$fix_kind" ]; then echo "ONE_SPEC_RESULT=red (ON_FAILURES=report-only: no fix round; the result: $run_folder/result.txt)"; exit 1; fi
if ! $FIX_ROUND fixer-set >/dev/null; then echo "ONE_SPEC_RESULT=red (no fixer set, RELEASE_FIXER: report-only)"; exit 1; fi
$FIX_ROUND start "$run_folder" "$fix_kind" || { echo "ONE_SPEC_RESULT=red: the fix round could not start (above)"; exit 1; }
last=$(FIX_ROUND_POLL="$ONE_SPEC_POLL" $FIX_ROUND wait "$run_folder"); echo "$last"
if [ "$fix_kind" = review ]; then
  case "$last" in
    "FIX_ROUND state=waiting "*) echo "ONE_SPEC_RESULT=red: its fix waits for review: bash asbl/ci/jenkins/fix-round.sh proceed|abort $run_folder <who>" ;;
    *) echo "ONE_SPEC_RESULT=red: the fix round ended with nothing to review (above)" ;;
  esac
  exit 1
fi
case "$last" in "FIX_ROUND state=done "*) ;; *) echo "ONE_SPEC_RESULT=red: the fix round did not end DONE (above): nothing runs again"; exit 1 ;; esac
echo "ONE_SPEC_RERUN its fixes are on main: the same spec and grep again"
run_the_loop; rc=$?
if [ "$rc" = 0 ]; then echo "ONE_SPEC_RESULT=green after the fix round"; exit 0; fi
echo "ONE_SPEC_RESULT=red again after the fix round (rc=$rc)"; exit 1

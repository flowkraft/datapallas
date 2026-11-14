#!/bin/bash
# A run by hand of the job dp-ci-e2e-nightly-or-by-hand: one spec file or some of its tests, or a quarter of the full set,
# on web (dev) or on a downloadable package tested as shipped (production-packaged); then what a red run leads to (ON_FAILURES, the same three values as
# the release round and the nightly). The job runs this on the host over SSH; a person or an agent runs the same from a
# shell. The job's other half, the nightly, is asbl/ci/jenkins/scheduled-e2e.sh. It never counts for a release.
#
# WHAT IT DOES
#   1. What runs (WHAT_TO_RUN):
#      spec-and-grep         E2E_SPEC (the files) and E2E_GREP (the tests in them); one of the two is needed
#      full-set-quarter-<n>  quarter n (1-4) of the full set, the 4-job layout of asbl/ci/full-set-runners.txt, as the
#                            nightly takes it (on windows-vm-electron with let-me-update-migrate-configuration); E2E_SPEC
#                            stays empty, E2E_GREP may narrow it; retries 1, as the nightly and the release
#   2. How (E2E_MODE) and where (E2E_TARGET):
#      dev   web: the server and the Angular UI built from this tree, in a browser: the fix-and-retry loop, follow-ci.sh
#            run bash asbl/ci/dp-ci.sh e2e-loop, with E2E_PACKAGE as given (dp-ci.sh's header says what each value
#            does: the content the tests start from, never a full rebuild). E2E_TARGET empty or web.
#      production-packaged   E2E_TARGET = the file users download, installed and started as a user does
#      (asbl/ci/jenkins/packaged-lane.sh, as the nightly runs them on the same lanes):
#        datapallas.zip (windows)                 the desktop app, DataPallas.exe, on the Windows VM (lane windows-vm-electron)
#        datapallas-server.zip (windows)          DataPallas Server on the VM's own Java 17 (lane windows-vm-server)
#        datapallas-server-docker.zip (windows)   that bundle in Docker Desktop on the VM (lane windows-vm-docker)
#        datapallas-server-docker.zip (linux)     that bundle and its image on this host (lane docker-server)
#      The build a package's lane takes (the image and zips, or the kept Windows pack) is reused when nothing it ships
#      changed since, else built or packed again, on origin/main. On Windows each / of E2E_SPEC matches either
#      separator. The lane names themselves are taken too (as the nightly, release-rerun.sh and the logs name them).
#   3. Green: exit 0. Red: its folder <RUN_RECORD_DIR>/<UTC>-e2e-by-hand/, result.txt and flaky.txt in the release
#      orchestrator's format (run_kind=by-hand), then by ON_FAILURES:
#      fix-prove-then-wait-for-review   the fix round in a scratch clone (asbl/ci/jenkins/fix-round.sh), waited for. Its
#                                       diff and report then wait for a person:
#                                       bash asbl/ci/jenkins/fix-round.sh proceed|abort <the run's folder> <who>
#      fix-prove-then-rerun-automatically   the fix round pushes its fixes, waited for; when it ended DONE, the same run
#                                       again at once, once, and that run's verdict is the exit code
#      report-only                      red, no agent
#      With no fixer set, both fix values act as report-only and say so.
#   Wrong inputs (a package in dev mode, no package in production-packaged, no spec nor grep, E2E_SPEC with a
#   quarter, E2E_PACKAGE on a package) are refused before anything runs, so none reaches a fix round.
#   The lines a caller reads: BY_HAND_RUN_FOLDER=<folder> (a red run), FIX_ROUND state=... (after a fix round, as
#   fix-round.sh status prints it), BY_HAND_LOG=<the run's log> and BY_HAND_JSON=<its Playwright JSON report> (each run),
#   and the last one, BY_HAND_RESULT=green|red|dry-run ...
#
# INPUTS (environment; the job's parameters, the same names and defaults):
#   WHAT_TO_RUN [spec-and-grep]   spec-and-grep | full-set-quarter-1 ... full-set-quarter-4 (next-nightly-pair is the
#                      nightly's: SCHEDULED_STARTED_BY=<who> bash asbl/ci/jenkins/scheduled-e2e.sh start)
#   E2E_MODE [dev]     dev | production-packaged
#   E2E_TARGET         dev: empty or web; production-packaged: 'datapallas.zip (windows)' |
#                      'datapallas-server.zip (windows)' | 'datapallas-server-docker.zip (windows)' |
#                      'datapallas-server-docker.zip (linux)' (or their lane)
#   E2E_SPEC, E2E_GREP   regexes on the spec files' paths and on the test titles
#   E2E_PACKAGE [package-reuse-as-is]   package-reuse-as-is | package-rsync-simple-file-changes | package-repackage
#                      (dev only)
#   ON_FAILURES [fix-prove-then-wait-for-review]
#   DRY_RUN [no]       yes: the inputs checked, the builds' answers and the command printed; nothing runs or builds
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci], RUN_RECORD_DIR [<LOG_DIR>/runs],
#   RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf] (the fixer, read by fix-round.sh)
#   RELEASE_ARTIFACTS_DIR [<LOG_DIR>/release-artifacts] (the kept Windows packs)
#   For the tests (asbl/ci/tests/test-e2e-by-hand.sh): BY_HAND_FOLLOW_CI [bash asbl/ci/jenkins/follow-ci.sh] (what runs
#   the loop or the lane), BY_HAND_DP_CI [bash asbl/ci/dp-ci.sh] (a lane's image build), BY_HAND_COMMIT (a lane's commit
#   under test, nothing fetched), BY_HAND_POLL [60] (seconds between two looks at a fix round)
#
# EXIT CODES: 0 green (also green again after a fix round, or a dry run); 1 red; 2 a wrong input
#
# THE QUARTERS FOR THE FORM: bash asbl/ci/jenkins/e2e-by-hand.sh quarters writes the 4 quarters' texts (each one's spec
#   files with their tests and test minutes, its tests and its time by estimate: asbl/ci/release-estimate.py quarters,
#   from the newest passed full set) to E2E_QUARTERS_FILE [/var/kraft-internalsystems/apps/cvs/custom-jenkins/home/
#   datapallas/e2e-quarters.json], where the job's form draws the chosen quarter under WHAT_TO_RUN
#   (asbl/ci/jenkins/e2e-quarters-block.groovy). The job runs it after each build; nothing runs, exit 0 written, 1 not.
#
# EXAMPLES
#   E2E_SPEC='/features/samples\.spec\.ts$' E2E_GREP=02_dashboard_demos bash asbl/ci/jenkins/e2e-by-hand.sh
#   E2E_SPEC='/features/samples\.spec\.ts$' E2E_PACKAGE=package-rsync-simple-file-changes bash asbl/ci/jenkins/e2e-by-hand.sh
#   E2E_MODE=production-packaged WHAT_TO_RUN=full-set-quarter-2 E2E_TARGET='datapallas-server-docker.zip (linux)' bash asbl/ci/jenkins/e2e-by-hand.sh
#   E2E_MODE=production-packaged E2E_SPEC='/features/samples\.spec\.ts$' E2E_TARGET='datapallas.zip (windows)' DRY_RUN=yes bash asbl/ci/jenkins/e2e-by-hand.sh
#
# Callers: the Jenkins job dp-ci-e2e-nightly-or-by-hand; a person or an agent. Test: asbl/ci/tests/test-e2e-by-hand.sh.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
RUN_RECORD_DIR="${RUN_RECORD_DIR:-$LOG_DIR/runs}"
RELEASE_ARTIFACTS_DIR="${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}"
E2E_QUARTERS_FILE="${E2E_QUARTERS_FILE:-/var/kraft-internalsystems/apps/cvs/custom-jenkins/home/datapallas/e2e-quarters.json}"
WHAT_TO_RUN="${WHAT_TO_RUN:-spec-and-grep}"
E2E_MODE="${E2E_MODE:-dev}"
E2E_TARGET="${E2E_TARGET:-}"
E2E_SPEC="${E2E_SPEC:-}" E2E_GREP="${E2E_GREP:-}"
E2E_PACKAGE="${E2E_PACKAGE:-package-reuse-as-is}"
DRY_RUN="${DRY_RUN:-no}"
ON_FAILURES="${ON_FAILURES:-fix-prove-then-wait-for-review}"
BY_HAND_FOLLOW_CI="${BY_HAND_FOLLOW_CI:-bash asbl/ci/jenkins/follow-ci.sh}"
BY_HAND_POLL="${BY_HAND_POLL:-60}"
FIX_ROUND="bash asbl/ci/jenkins/fix-round.sh"
# shellcheck source=run-result.sh
. asbl/ci/jenkins/run-result.sh
LANE_DP_CI="${BY_HAND_DP_CI:-bash asbl/ci/dp-ci.sh}" LANE_FOLLOW_CI="$BY_HAND_FOLLOW_CI" LANE_COMMIT="${BY_HAND_COMMIT:-}"
# shellcheck source=packaged-lane.sh
. asbl/ci/jenkins/packaged-lane.sh

refuse() { echo "FAIL  $*"; exit 2; }

# ---- the quarters for the job's form: written, nothing run ----
if [ "${1:-}" = quarters ]; then
  out=$(python3 asbl/ci/release-estimate.py quarters --runs "$RUN_RECORD_DIR") || { echo "FAIL  the quarters could not be counted (above)"; exit 1; }
  { mkdir -p "$(dirname "$E2E_QUARTERS_FILE")" && printf '%s\n' "$out" > "$E2E_QUARTERS_FILE.tmp" && chmod 644 "$E2E_QUARTERS_FILE.tmp" &&
    mv "$E2E_QUARTERS_FILE.tmp" "$E2E_QUARTERS_FILE"; } || { echo "FAIL  $E2E_QUARTERS_FILE could not be written"; exit 1; }
  echo "QUARTERS written to $E2E_QUARTERS_FILE"
  exit 0
fi

# ---- the inputs, all checked before anything runs ----
[ "${1:-run}" = run ] || { sed -n '2,/^set -uo pipefail$/p' "$0" | sed '$d'; exit 2; }
case "$ON_FAILURES" in
  fix-prove-then-wait-for-review) fix_kind=review ;;
  fix-prove-then-rerun-automatically) fix_kind=push ;;
  report-only) fix_kind="" ;;
  *) refuse "ON_FAILURES must be fix-prove-then-wait-for-review, fix-prove-then-rerun-automatically or report-only (got '$ON_FAILURES')" ;;
esac
case "$DRY_RUN" in yes|no) ;; *) refuse "DRY_RUN must be yes or no (got '$DRY_RUN')" ;; esac
# E2E_MODE and E2E_TARGET: dev = web; production-packaged = a downloadable package, tested as shipped, and its lane
packages="'datapallas.zip (windows)', 'datapallas-server.zip (windows)', 'datapallas-server-docker.zip (windows)' or 'datapallas-server-docker.zip (linux)'"
case "$E2E_MODE" in
  dev)
    case "$E2E_TARGET" in
      ""|web) E2E_TARGET=web LANE=web ;;
      *) refuse "E2E_MODE=dev runs on web (this tree): E2E_TARGET empty or web (got '$E2E_TARGET'). A package users download: E2E_MODE=production-packaged" ;;
    esac ;;
  production-packaged)
    case "$E2E_TARGET" in
      "datapallas.zip (windows)") LANE=windows-vm-electron ;;
      "datapallas-server.zip (windows)") LANE=windows-vm-server ;;
      "datapallas-server-docker.zip (windows)") LANE=windows-vm-docker ;;
      "datapallas-server-docker.zip (linux)") LANE=docker-server ;;
      *) is_packaged_lane "$E2E_TARGET" && LANE=$E2E_TARGET ||
           refuse "E2E_MODE=production-packaged needs E2E_TARGET = the package users download: $packages (got '$E2E_TARGET')" ;;
    esac ;;
  *) refuse "E2E_MODE must be dev or production-packaged (got '$E2E_MODE')" ;;
esac
[ "$LANE" = web ] || [ "$E2E_PACKAGE" = package-reuse-as-is ] ||
  refuse "E2E_PACKAGE=$E2E_PACKAGE applies to E2E_MODE=dev only: $E2E_TARGET is tested as shipped and takes no e2e package from this checkout (leave package-reuse-as-is)"
case "$E2E_PACKAGE" in package-reuse-as-is|package-rsync-simple-file-changes|package-repackage) ;;
  *) refuse "E2E_PACKAGE must be package-reuse-as-is, package-rsync-simple-file-changes or package-repackage (got '$E2E_PACKAGE')" ;; esac
retries="" win_timeout=""
case "$WHAT_TO_RUN" in
  spec-and-grep)
    [ -n "$E2E_SPEC$E2E_GREP" ] || refuse "WHAT_TO_RUN=spec-and-grep needs E2E_SPEC (the files) or E2E_GREP (the tests). A quarter of the full set: WHAT_TO_RUN=full-set-quarter-<1-4>" ;;
  full-set-quarter-[1-4])
    [ -z "$E2E_SPEC" ] || refuse "WHAT_TO_RUN=$WHAT_TO_RUN chooses the files itself: leave E2E_SPEC empty (E2E_GREP may narrow the quarter)"
    E2E_SPEC=$(quarter_spec "$LANE" "${WHAT_TO_RUN##*-}") || refuse "the quarter's spec files could not be read (asbl/ci/full-set-runners.py, above)"
    retries=1
    case "$LANE" in windows-*) win_timeout=$WINDOWS_QUARTER_TIMEOUT ;; esac ;;
  next-nightly-pair)
    refuse "next-nightly-pair is the nightly's: SCHEDULED_STARTED_BY=<who> bash asbl/ci/jenkins/scheduled-e2e.sh start (the job runs it)" ;;
  *) refuse "WHAT_TO_RUN must be spec-and-grep, full-set-quarter-1 to full-set-quarter-4, or next-nightly-pair (got '$WHAT_TO_RUN')" ;;
esac
echo "BY_HAND what=$WHAT_TO_RUN target='$E2E_TARGET' lane=$LANE mode=$E2E_MODE spec='$E2E_SPEC' grep='$E2E_GREP'$([ "$LANE" = web ] && echo " package=$E2E_PACKAGE") on_failures=$ON_FAILURES$([ "$DRY_RUN" = yes ] && echo ' (dry run: nothing runs)')"

# run_once: the run, followed to its end; its exit code. RUN_LOG and RUN_JSON (its log and Playwright JSON report, or
# empty), TESTED (the commit it tested)
run_once() {
  local t0 rc under loop_env
  if is_packaged_lane "$LANE"; then
    under=$(commit_under_test) || { echo "FAIL  the commit under test could not be read (git fetch origin)"; RUN_LOG="" RUN_JSON="" TESTED=""; return 1; }
    run_packaged_lane "$LANE" "$E2E_SPEC" "$E2E_GREP" "$retries" "$win_timeout" "$under"; rc=$?
    RUN_LOG=$LANE_LOG RUN_JSON=$LANE_JSON TESTED=$under
  else
    loop_env=(E2E_MODE=dev E2E_TARGET=web E2E_SPEC="$E2E_SPEC" E2E_GREP="$E2E_GREP" E2E_PACKAGE="$E2E_PACKAGE" E2E_RETRIES="$retries")
    if [ "$DRY_RUN" = yes ]; then
      echo "WOULD   $(printf '%q ' "${loop_env[@]}")$BY_HAND_FOLLOW_CI run bash asbl/ci/dp-ci.sh e2e-loop"; RUN_LOG="" RUN_JSON="" TESTED=""; return 0
    fi
    t0=$(date +%s)
    env "${loop_env[@]}" $BY_HAND_FOLLOW_CI run bash asbl/ci/dp-ci.sh e2e-loop; rc=$?
    RUN_LOG=$(newest_log_since "$LOG_DIR/latest.log" "$t0") TESTED=$(git rev-parse HEAD)   # the loop tests this checkout, on origin/main
    RUN_JSON="${RUN_LOG:+${RUN_LOG%.log}-playwright.json}"
  fi
  [ -n "$RUN_JSON" ] && [ -f "$RUN_JSON" ] || RUN_JSON=""
  echo "BY_HAND_LOG=$RUN_LOG"; echo "BY_HAND_JSON=$RUN_JSON"
  return "$rc"
}

# write_red_run_folder <exit code>: the red run's folder (prints its path)
write_red_run_folder() {
  local rc="$1" run dir
  run=$(date -u +%Y%m%dT%H%M%SZ)
  dir="$RUN_RECORD_DIR/$run-e2e-by-hand"
  mkdir -p "$dir" || return 1
  write_run_result "$dir" red "a run by hand (asbl/ci/jenkins/e2e-by-hand.sh)" \
    "$(part_line "$LANE" "$(lane_machine "$LANE")" "$rc" "${RUN_LOG:--}" "$RUN_JSON" "${LANE_WHY:-rc=$rc}")" \
    dry_run=no run_kind=by-hand run="$run" what="$WHAT_TO_RUN" target="$E2E_TARGET" lane="$LANE" mode="$E2E_MODE" spec="$E2E_SPEC" grep="$E2E_GREP" \
    version="$(version_at "$TESTED")" pin="$TESTED" kept= step1=not-run summary="${RUN_LOG:-}" flaky="$dir/flaky.txt" || return 1
  echo "$dir"
}

run_once; rc=$?
[ "$DRY_RUN" != yes ] || { echo "BY_HAND_RESULT=dry-run (nothing ran)"; exit 0; }
[ "$rc" != 0 ] || { echo "BY_HAND_RESULT=green"; exit 0; }
run_folder=$(write_red_run_folder "$rc") || { echo "BY_HAND_RESULT=red: its run folder could not be written"; exit 1; }
echo "BY_HAND_RUN_FOLDER=$run_folder"
if [ -z "$fix_kind" ]; then echo "BY_HAND_RESULT=red (ON_FAILURES=report-only: no fix round; the result: $run_folder/result.txt)"; exit 1; fi
if ! $FIX_ROUND fixer-set >/dev/null; then echo "BY_HAND_RESULT=red (no fixer set, RELEASE_FIXER: report-only)"; exit 1; fi
$FIX_ROUND start "$run_folder" "$fix_kind" || { echo "BY_HAND_RESULT=red: the fix round could not start (above)"; exit 1; }
last=$(FIX_ROUND_POLL="$BY_HAND_POLL" $FIX_ROUND wait "$run_folder"); echo "$last"
if [ "$fix_kind" = review ]; then
  case "$last" in
    "FIX_ROUND state=waiting "*) echo "BY_HAND_RESULT=red: its fix waits for review: bash asbl/ci/jenkins/fix-round.sh proceed|abort $run_folder <who>" ;;
    *) echo "BY_HAND_RESULT=red: the fix round ended with nothing to review (above)" ;;
  esac
  exit 1
fi
case "$last" in "FIX_ROUND state=done "*) ;; *) echo "BY_HAND_RESULT=red: the fix round did not end DONE (above): nothing runs again"; exit 1 ;; esac
echo "BY_HAND_RERUN its fixes are on main: the same run again"
run_once; rc=$?
if [ "$rc" = 0 ]; then echo "BY_HAND_RESULT=green after the fix round"; exit 0; fi
echo "BY_HAND_RESULT=red again after the fix round (rc=$rc)"; exit 1

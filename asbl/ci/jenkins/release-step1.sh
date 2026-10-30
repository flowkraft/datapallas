#!/bin/bash
# Step 1 of a release, one lane, as the job dp-ci-release-step1-e2e-prerelease runs it. The job is a thin wrapper that passes
# its parameters here, so the job, an agent, a person and the release's orchestrator run the same lane the same way, with the
# same log and the same release record. It is also the everyday full e2e of the trunk (E2E_SPEC and E2E_GREP empty).
#
# HOW, in order:
#   0. who started it, first: STARTED_BY=<who>  <UTC time>  :: step 1 <target> (asbl/ci/marks.sh run_record_begin);
#      a run started from the shell also gets its folder, <LOG_DIR>/runs/<UTC>-step-1-<target>/, with its console in run.log;
#   1. the version line: release-state.sh version-check --print (what a release would do now; the lane runs anyway);
#   2. this release's full lane and the lanes step 1 needs: release-state.sh full-lane --step1 (web or docker-server,
#      alternated, chosen once per version while it is still to be released; STEP1_STARTED_BY is written as who chose it);
#   3. the job steps, each marked START/END with the time it took (job-step.sh, asbl/ci/marks.sh): docker-server,
#      windows-vm-docker and windows-vm-server first check in seconds what their lane needs (dp-ci.sh prereq), then JOB STEP
#      1/2 builds origin/main only when there is no build of it yet (dp-ci.sh build-if-needed, about 40 min) and JOB STEP 2/2
#      runs the lane; the other targets have one step, JOB STEP 1/1, the lane. The lane runs through follow-ci.sh, detached
#      (a container, or the Windows driver followed by its pid file): closing the job or the shell stops only the following;
#   4. the lane's verdict: release-state.sh record-step1 <target> <exit code>, step1.<target>-<full|auth|light|targeted>,
#      which steps 2 and 3 of a release require (RELEASE_STEP_START = when step 3 began: an older log is not this run's);
#   5. a run started from the shell: the lane's reports copied into its folder (reports/, the files and names the job's
#      Reports stage pulls; lane.log = the lane's own log); every run: its line in <LOG_DIR>/runs/history.tsv (start, end,
#      result, who, what, commit, log), a direct run's next to a build's of the job, so one file holds both.
# Exit: that of step 3 (the prerequisites, the build or the lane).
#
# INPUTS (the job's parameters, the same names and defaults; seed.groovy's parameter texts say more):
#   E2E_TARGET [web]   web | electron-linux | docker-server | windows-vm-electron | windows-vm-docker | windows-vm-server
#   E2E_SPEC, E2E_GREP, E2E_ROTATION_DATE, E2E_RETRIES [empty]   passed on to the lane (dp-ci.sh e2e, dp-ci.sh win ...)
#   STEP1_STARTED_BY   REQUIRED, who started it (none: MISSING, exit 2, nothing done): the job passes its build's cause (the
#                      Jenkins user), a person, an agent or the orchestrator its own name; the first line, the history line,
#                      and who chose the full lane
#   JENKINS_BUILD [empty]   the job's BUILD_TAG: a build of the job, whose console and reports Jenkins keeps (no folder here)
#   DRY_RUN=yes [no]   prints the commands of steps 1 to 4, in order, and runs none of them: nothing is checked, chosen, built,
#                      run or recorded in the release record; the first line and the history line (result DRY-RUN) are written
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci]   where the lanes write (the Windows driver's pid file)
#   RUN_RECORD_DIR [<LOG_DIR>/runs], RUN_HISTORY [<RUN_RECORD_DIR>/history.tsv]   the folders and the history file (marks.sh)
#   Example: STEP1_STARTED_BY=<name> DRY_RUN=yes E2E_TARGET=windows-vm-server bash asbl/ci/jenkins/release-step1.sh
#   A real run from the shell, detached so that closing the shell ends nothing (its console is in its folder):
#            STEP1_STARTED_BY=<name> E2E_TARGET=web setsid nohup bash asbl/ci/jenkins/release-step1.sh >/dev/null 2>&1 &
#
# It never uploads or releases anything, never runs a lane again, and records only the lane's own verdict (and, once per
# version, the full lane's choice). A second Windows run is refused by win-e2e.sh, as from the job.
# Callers: the job dp-ci-release-step1-e2e-prerelease (its Jenkinsfile), by hand, an agent, the release's orchestrator.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
. asbl/ci/marks.sh

TARGET="${E2E_TARGET:-web}"
# the lanes get the target only where the launcher below names it, as when the job ran these commands itself
export -n E2E_TARGET 2>/dev/null
export E2E_SPEC="${E2E_SPEC:-}" E2E_GREP="${E2E_GREP:-}" E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-}" E2E_RETRIES="${E2E_RETRIES:-}"
LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
case "${DRY_RUN:-no}" in yes|1) DRY=yes ;; no|0|"") DRY=no ;; *) echo "FAIL  DRY_RUN must be yes or no (got '$DRY_RUN')"; exit 2 ;; esac
WHO="${STEP1_STARTED_BY:-}"
[ -n "$WHO" ] || { echo "MISSING STEP1_STARTED_BY: who starts this run (your name, the agent's, the orchestrator's; the job passes its build's cause). Nothing done"; exit 2; }
run_record_begin "$WHO" "step 1 $TARGET${E2E_SPEC:+ E2E_SPEC=$E2E_SPEC}${E2E_GREP:+ E2E_GREP=$E2E_GREP}$([ "$DRY" = yes ] && echo ', dry run')" ||
  { echo "FAIL  cannot make the folder of this run under $RUN_RECORD_DIR. Nothing done"; exit 2; }

# copy_reports_into <run folder>: the lane's reports, the files the job's Reports stage pulls into its workspace (keep the
# two lists in step), under its names: playwright.xml, playwright-html, openapi (Linux) or robot (Windows), and trivy (the
# targets that may build first: the newest build's image scan). Hard links, since the folder is on the disk of the logs (a
# report of hundreds of MB is not stored twice), a plain copy when that fails; what the lane did not leave is skipped.
copy_reports_into() {
  local dir="$1" lane_log base i from to froms=() names=() copied=()
  lane_log=$(sed -n 's/^follow-ci: following \([^ ]*\) .*/\1/p' "$dir/run.log" | head -1)
  [ -n "$lane_log" ] && [ -f "$lane_log" ] || { echo "REPORTS none: no lane log named in $dir/run.log"; return 0; }
  ln -sfn "$lane_log" "$dir/lane.log"; base="${lane_log%.log}"; mkdir -p "$dir/reports"
  case "$TARGET" in
    windows-vm-*) froms=("$base-step-playwright.xml" "$base-step-playwright-html" "$base-step-robot"); names=(playwright.xml playwright-html robot) ;;
    *)            froms=("$base-playwright.xml" "$base-playwright-html" "$base-openapi"); names=(playwright.xml playwright-html openapi) ;;
  esac
  case "$TARGET" in
    docker-server|windows-vm-docker|windows-vm-server) froms+=("$(ls -1dt "$LOG_DIR"/*-build-*-trivy 2>/dev/null | head -1)"); names+=(trivy) ;;
  esac
  for i in "${!froms[@]}"; do
    from="${froms[i]}"; to="$dir/reports/${names[i]}"
    [ -n "$from" ] && [ -e "$from" ] || continue
    if cp -al "$from" "$to" 2>/dev/null || { rm -rf "$to"; cp -a "$from" "$to"; }; then copied+=("${names[i]}"); fi
  done
  echo "REPORTS in $dir/reports: ${copied[*]:-none} (the lane's own log: $dir/lane.log)"
}
# finish <exit code>: a run started from the shell gets its reports in its folder (after a lane ran); every run its
# history line, with the lane's commit (from the record's line, else this checkout's); then that exit code
finish() {
  local rc="$1" commit result
  commit=$(printf '%s\n' "${RECORD_OUT:-}" | sed -n 's/^RELEASE_STATE recorded .* commit=\([0-9a-f]*\).*/\1/p' | tail -1)
  [ -n "$commit" ] || commit=$(git rev-parse --short=8 HEAD 2>/dev/null)
  result=PASS; [ "$rc" -eq 0 ] || result="FAIL rc=$rc"
  [ "$DRY" = no ] || [ "$rc" -ne 0 ] || result=DRY-RUN
  [ "$DRY" = yes ] || [ -z "$RUN_DIR" ] || copy_reports_into "$RUN_DIR"
  run_record_end "$result" "$commit"
  exit "$rc"
}

# the lane, by target: the Windows lanes are dp-ci.sh win e2e|docker-e2e|server-e2e started by win-e2e.sh and followed by
# its pid (one pid file for every Windows lane), the Linux ones dp-ci.sh e2e followed by its container
WIN_FOLLOW=(env "FOLLOW_PIDFILE=$LOG_DIR/win-e2e.pid" bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh)
case "$TARGET" in
  windows-vm-electron) LANE=("${WIN_FOLLOW[@]}") ;;
  windows-vm-docker)   LANE=("${WIN_FOLLOW[@]}" docker-e2e) ;;
  windows-vm-server)   LANE=("${WIN_FOLLOW[@]}" server-e2e) ;;
  electron-windows-vm|docker-windows-vm|server-windows-vm)
    # the names before 2026-10-22, still in the parameters of older builds: refused, not sent to the Linux e2e below
    echo "FAIL  E2E_TARGET $TARGET was renamed: windows-vm-electron, windows-vm-docker, windows-vm-server"; finish 2 ;;
  electron-linux)      LANE=(env E2E_TARGET=electron bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e) ;;
  *)                   LANE=(env "E2E_TARGET=$TARGET" bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e) ;;
esac
# the targets that install what `dp-ci.sh build` makes: what their lane needs, checked in seconds before that build
case "$TARGET" in
  docker-server)     PRE=(bash asbl/ci/dp-ci.sh prereq docker) ;;
  windows-vm-docker) PRE=(bash asbl/ci/dp-ci.sh win prereq docker-e2e) ;;
  windows-vm-server) PRE=(bash asbl/ci/dp-ci.sh win prereq server-e2e) ;;
  *)                 PRE=() ;;
esac
JOB_STEP=(bash asbl/ci/jenkins/job-step.sh)

# run <command...>: runs it; in a dry run prints it instead, quoted as a shell reads it back
run() {
  if [ "$DRY" = yes ]; then echo "WOULD  $(printf '%q ' "$@" | sed 's/ $//')"; return 0; fi
  "$@"
}

[ "$DRY" = no ] || echo "WOULD  export $(printf 'E2E_SPEC=%q E2E_GREP=%q E2E_ROTATION_DATE=%q E2E_RETRIES=%q' "$E2E_SPEC" "$E2E_GREP" "$E2E_ROTATION_DATE" "$E2E_RETRIES")"
run bash asbl/ci/release-state.sh version-check --print
run env "E2E_TARGET=$TARGET" "STEP1_STARTED_BY=$WHO" bash asbl/ci/release-state.sh full-lane --step1
t0=$(date +%s)
if [ "${#PRE[@]}" -gt 0 ]; then
  run "${PRE[@]}" &&
    run "${JOB_STEP[@]}" 'JOB STEP 1/2' 'the build of origin/main, only when there is none yet (dp-ci.sh build-if-needed)' bash asbl/ci/dp-ci.sh build-if-needed &&
    run "${JOB_STEP[@]}" 'JOB STEP 2/2' "e2e $TARGET" "${LANE[@]}"
else
  run "${JOB_STEP[@]}" 'JOB STEP 1/1' "e2e $TARGET" "${LANE[@]}"
fi
rc=$?
if [ "$DRY" = yes ]; then
  echo "WOULD  RELEASE_STEP_START=<when the steps began> bash asbl/ci/release-state.sh record-step1 $(printf '%q' "$TARGET") <their exit code>"
  [ -z "$RUN_DIR" ] || echo "WOULD  copy the lane's reports into $RUN_DIR/reports"
  finish 0
fi
RECORD_OUT=$(RELEASE_STEP_START=$t0 bash asbl/ci/release-state.sh record-step1 "$TARGET" "$rc" 2>&1)
[ -z "$RECORD_OUT" ] || printf '%s\n' "$RECORD_OUT"
finish "$rc"

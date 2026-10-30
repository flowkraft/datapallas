#!/bin/bash
# Step 1 of a release, one lane, as the job dp-ci-release-step1-e2e-prerelease runs it. The job is a thin wrapper that passes
# its parameters here, so the job, an agent, a person and the release's orchestrator run the same lane the same way, with the
# same log and the same release record. It is also the everyday full e2e of the trunk (E2E_SPEC and E2E_GREP empty).
#
# HOW, in order:
#   1. the version line: release-state.sh version-check --print (what a release would do now; the lane runs anyway);
#   2. this release's full lane and the lanes step 1 needs: release-state.sh full-lane --step1 (web or docker-server,
#      alternated, chosen once per version while it is still to be released; STEP1_STARTED_BY is written as who chose it);
#   3. the job steps, each marked START/END with the time it took (job-step.sh, asbl/ci/marks.sh): docker-server,
#      windows-vm-docker and windows-vm-server first check in seconds what their lane needs (dp-ci.sh prereq), then JOB STEP
#      1/2 builds origin/main only when there is no build of it yet (dp-ci.sh build-if-needed, about 40 min) and JOB STEP 2/2
#      runs the lane; the other targets have one step, JOB STEP 1/1, the lane. The lane runs through follow-ci.sh, detached
#      (a container, or the Windows driver followed by its pid file): closing the job or the shell stops only the following;
#   4. the lane's verdict: release-state.sh record-step1 <target> <exit code>, step1.<target>-<full|auth|light|targeted>,
#      which steps 2 and 3 of a release require (RELEASE_STEP_START = when step 3 began: an older log is not this run's).
# Exit: that of step 3 (the prerequisites, the build or the lane).
#
# INPUTS (the job's parameters, the same names and defaults; seed.groovy's parameter texts say more):
#   E2E_TARGET [web]   web | electron-linux | docker-server | windows-vm-electron | windows-vm-docker | windows-vm-server
#   E2E_SPEC, E2E_GREP, E2E_ROTATION_DATE, E2E_RETRIES [empty]   passed on to the lane (dp-ci.sh e2e, dp-ci.sh win ...)
#   STEP1_STARTED_BY [<user> by hand]   who started it: the job passes its build's cause (the Jenkins user), an agent or the
#                      orchestrator its own name; printed first, and written as who chose the full lane
#   DRY_RUN=yes [no]   prints the commands of steps 1 to 4, in order, and runs none of them: nothing is checked, chosen, built,
#                      run or recorded
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci]   where the lanes write (the Windows driver's pid file)
#   Example: DRY_RUN=yes E2E_TARGET=windows-vm-server bash asbl/ci/jenkins/release-step1.sh
#
# It never uploads or releases anything, never runs a lane again, and records only the lane's own verdict (and, once per
# version, the full lane's choice). Callers: the job dp-ci-release-step1-e2e-prerelease (its Jenkinsfile), by hand, an agent,
# the release's orchestrator.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

TARGET="${E2E_TARGET:-web}"
# the lanes get the target only where the launcher below names it, as when the job ran these commands itself
export -n E2E_TARGET 2>/dev/null
export E2E_SPEC="${E2E_SPEC:-}" E2E_GREP="${E2E_GREP:-}" E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-}" E2E_RETRIES="${E2E_RETRIES:-}"
LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
WHO="${STEP1_STARTED_BY:-$(id -un) by hand}"
case "${DRY_RUN:-no}" in yes|1) DRY=yes ;; no|0|"") DRY=no ;; *) echo "FAIL  DRY_RUN must be yes or no (got '$DRY_RUN')"; exit 2 ;; esac

# the lane, by target: the Windows lanes are dp-ci.sh win e2e|docker-e2e|server-e2e started by win-e2e.sh and followed by
# its pid (one pid file for every Windows lane), the Linux ones dp-ci.sh e2e followed by its container
WIN_FOLLOW=(env "FOLLOW_PIDFILE=$LOG_DIR/win-e2e.pid" bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh)
case "$TARGET" in
  windows-vm-electron) LANE=("${WIN_FOLLOW[@]}") ;;
  windows-vm-docker)   LANE=("${WIN_FOLLOW[@]}" docker-e2e) ;;
  windows-vm-server)   LANE=("${WIN_FOLLOW[@]}" server-e2e) ;;
  electron-windows-vm|docker-windows-vm|server-windows-vm)
    # the names before 2026-10-22, still in the parameters of older builds: refused, not sent to the Linux e2e below
    echo "FAIL  E2E_TARGET $TARGET was renamed: windows-vm-electron, windows-vm-docker, windows-vm-server"; exit 2 ;;
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

echo "STEP1 $TARGET, started by $WHO$([ "$DRY" = yes ] && echo ": dry run, nothing runs")"
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
  exit 0
fi
RELEASE_STEP_START=$t0 bash asbl/ci/release-state.sh record-step1 "$TARGET" "$rc"
exit "$rc"

#!/bin/bash
# Launcher for the Windows VM e2e (dp-ci.sh win e2e), in the way dp-ci.sh launches a Linux run: returns in
# seconds, the work carries on detached, the log path is printed on a "log:" line, and the log ends with a
# PIPELINE_RESULT= line. follow-ci.sh follows it (FOLLOW_PIDFILE below), Jenkins calls it over SSH.
#
# What survives what: the tests run on the VM as a scheduled task, so they outlive anything on this side.
# The driver started here (a setsid process, not tied to the SSH session) is what collects the verdict;
# closing Jenkins, the browser or the SSH session leaves it running. A reboot of this host kills the
# driver, not the VM task: then `bash asbl/ci/dp-ci.sh win poll e2e` (or `docker-e2e`, `server-e2e`) shows what the VM did.
#
#   bash win-e2e.sh [e2e|docker-e2e|server-e2e|release|robot]   which lane: e2e (default) = windows-vm-electron, docker-e2e = windows-vm-docker,
#                                                         server-e2e = windows-vm-server, release = job dp-ci-release-step3-release-windows-vm (MODE, UPLOAD, DRY_RUN passed on),
#                                                         robot = the Robot UAT again on a kept pack (asbl/ci/release-rerun.sh; RELEASE_KEPT, ROBOT_TEST, REBUILD_PACK passed on)
#   E2E_SPEC / E2E_GREP / E2E_ROTATION_DATE / E2E_RETRIES  passed on to dp-ci.sh win <lane> through the environment (both filters
#                                            empty = its default set; E2E_RETRIES empty = the lane's own, see dp-ci.sh)
set -uo pipefail

LANE="${1:-e2e}"
case "$LANE" in e2e|docker-e2e|server-e2e|release|robot) ;; *) echo "FAIL  lane must be e2e, docker-e2e, server-e2e, release or robot (got '$LANE')"; exit 2 ;; esac

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
# one pid file for every Windows lane: they share the VM's desktop, its port 9090 and its Docker Desktop
PIDFILE="$LOG_DIR/win-e2e.pid"
mkdir -p "$LOG_DIR"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  echo "FAIL  a Windows e2e run is already going (pid $(cat "$PIDFILE")); follow it by hand: FOLLOW_PIDFILE=<LOG_DIR>/win-e2e.pid bash asbl/ci/jenkins/follow-ci.sh attach"
  exit 1
fi

LOG="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-win-$LANE-$(git rev-parse --short HEAD).log"
: > "$LOG"
ln -sfn "$LOG" "$LOG_DIR/win-e2e-latest.log"

# The driver. Its own step log is kept apart (WIN_E2E_LOG): everything it prints already lands in $LOG.
WIN_E2E_LOG="${LOG%.log}-step.log" setsid nohup bash -c '
  echo $$ > "$0"
  bash asbl/ci/dp-ci.sh win "$1"; rc=$?
  if [ "$rc" -eq 0 ]; then echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else echo "PIPELINE_RESULT=FAILED_EXIT_$rc  $(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  rm -f "$0"
' "$PIDFILE" "$LANE" >> "$LOG" 2>&1 < /dev/null &
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$PIDFILE" ] && break; sleep 0.5; done

echo "started the Windows $LANE driver, pid $(cat "$PIDFILE" 2>/dev/null)"
echo "log:     $LOG   (also $LOG_DIR/win-e2e-latest.log)"

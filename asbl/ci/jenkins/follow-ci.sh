#!/bin/bash
# Run a CI launcher on this host and follow its log until the run ends. Jenkins calls this over SSH, so the
# console of a Jenkins build is the log of the run itself. Plain script: also runs by hand.
#
#   follow-ci.sh run <launcher command...>    start the run, then follow it
#   follow-ci.sh attach                       follow the run that is going now (or show the last result)
#
# The launcher is the existing one, e.g.   follow-ci.sh run bash asbl/ci/dp-ci.sh e2e
# It must return quickly, run the work in a detached container, and print a line  "log:  <path> ..."
# (dp-ci.sh does). The work belongs to the Docker daemon, not to this process: closing Jenkins, the
# browser or the SSH session stops only the following, never the run. `attach` picks it up again.
#
#   FOLLOW_CONTAINER   the run's container (default dp-ci)
#   FOLLOW_LOG_LINK    where `attach` finds the newest log (default <LOG_DIR>/latest.log)
#
# Exit: 0 when the log ends with PIPELINE_RESULT=SUCCESS, 1 when the run failed, 2 on misuse or no run.
set -uo pipefail

CONTAINER="${FOLLOW_CONTAINER:-dp-ci}"
LOG_LINK="${FOLLOW_LOG_LINK:-/var/kraft-internalsystems/logs/datapallas-ci/latest.log}"

running() { [ -n "$(docker ps -q --filter "name=^${CONTAINER}$")" ]; }

case "${1:-}" in
  run)
    shift
    [ "$#" -gt 0 ] || { echo "usage: $0 run <launcher command...>" >&2; exit 2; }
    out=$("$@" 2>&1); rc=$?
    printf '%s\n' "$out"
    [ "$rc" -eq 0 ] || { echo "follow-ci: the launcher failed (exit $rc), nothing to follow"; exit "$rc"; }
    log=$(printf '%s\n' "$out" | sed -n 's/^log: *\([^ ]*\).*/\1/p' | head -1)
    ;;
  attach)
    log=$(readlink -f "$LOG_LINK" 2>/dev/null || true)
    ;;
  *)
    echo "usage: $0 run <launcher command...> | attach" >&2; exit 2 ;;
esac

[ -n "${log:-}" ] && [ -f "$log" ] || { echo "follow-ci: no log to follow (${log:-none})" >&2; exit 2; }
echo "follow-ci: following $log (container $CONTAINER)"

tail -n +1 -F "$log" 2>/dev/null &
TAIL=$!
trap 'kill "$TAIL" 2>/dev/null' EXIT

# until the run says how it ended, or its container is gone and the log has stopped growing
size=-1; quiet=0
while :; do
  grep -aq '^PIPELINE_RESULT=' "$log" && break
  if running; then quiet=0; else
    now=$(stat -c %s "$log"); [ "$now" = "$size" ] && quiet=$((quiet + 1)) || quiet=0; size=$now
    [ "$quiet" -ge 3 ] && break
  fi
  sleep 5
done
sleep 2
kill "$TAIL" 2>/dev/null; wait "$TAIL" 2>/dev/null

echo "follow-ci: ---- how it ended ----"
grep -aE '^(PIPELINE_RESULT|E2E_RESULT|!!! ABORT)' "$log" | tail -5
grep -aq '^PIPELINE_RESULT=SUCCESS' "$log"

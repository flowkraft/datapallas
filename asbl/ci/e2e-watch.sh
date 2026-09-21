#!/bin/bash
# =============================================================================
# DataPallas Linux CI only: watch the active `dp-ci` run and come back when it ends or stops moving
# (plan §0.4 "watch actively, never wait blindly").
#
#   bash asbl/ci/e2e-watch.sh [STALL_MIN]      (default 10)
#
# exit 0  the run ended: prints PIPELINE_RESULT, E2E_RESULT and the FIREWALL lines of its log
# exit 3  nothing progressed for STALL_MIN minutes: prints a stall report (last finished test, the
#         running test, minutes since each kind of progress, log tails, containers the run started)
# exit 2  no dp-ci run to watch
#
# Progress, checked every 30 s, is any of:
#   log    new meaningful lines in the run log (browser console noise and log polling do not count:
#          they keep coming while a test hangs)
#   test   a new finished-test line (✓ / ✘ / -)
#   files  a file changed under testground/e2e/logs or testground/e2e/output
#   docker a container/image event (create, start, die, pull, build, ...; exec and health checks do not count)
#   cpu    the server JVM (java processes in dp-ci) above 40 % of one core. Browser CPU does not count: a hung page
#          can spin the Chromium renderer at ~50 % for as long as it likes (configuration.spec.ts, 39 min).
#
# test and files are strong progress; log, docker and cpu are weak — they also come while a test hangs
# (Spring stack traces, other containers on the host, a headed browser waiting on a permission prompt:
# configuration.spec.ts sat 55 min in a clipboard read that way). Weak progress alone keeps a run
# alive for at most WEAK_MAX_MIN minutes after the last strong progress (default 3 × STALL_MIN).
# =============================================================================
set -uo pipefail

STALL_MIN="${1:-10}"
WEAK_MAX_MIN="${WEAK_MAX_MIN:-$((STALL_MIN * 3))}"
REPO=$(cd "$(dirname "$0")/../.." && pwd)
LOG_DIR=/var/kraft-internalsystems/logs/datapallas-ci
TG="$REPO/frend/reporting/testground/e2e"
CONTAINER=dp-ci
NOISE='RENDERER (warning|log|debug|info)|xhr_streaming|sanitizing HTML|\[AppsManager\]|hasTransitionalApps|loadInitialApps|/api/jobs/logs/tailer|GET /api/(system/info|jobs|execution-stats)'

running() { docker ps -q --filter "name=^${CONTAINER}\$" | grep -q .; }

running || { echo "no $CONTAINER run is active"; exit 2; }
LOG=$(readlink -f "$LOG_DIR/latest.log")
START_EPOCH=$(date +%s)
echo "watching $LOG (stall after ${STALL_MIN} min without progress, or ${WEAK_MAX_MIN} min without a finished test or testground change)"

now=$(date +%s)
last_log=$now; last_test=$now; last_files=$now; last_docker=$now; last_cpu=$now
offset=$(stat -c %s "$LOG")
tests=$(grep -acE '^stdout: +(✓|✘|-) +[0-9]+ ' "$LOG")
marker=$(mktemp); touch "$marker"
events_since=$now
CLK_TCK=$(getconf CLK_TCK)
# CPU time (user + system ticks) of the java processes running inside dp-ci, read from the host's /proc
java_ticks() {
  docker top "$CONTAINER" -eo pid,comm 2>/dev/null | awk '$2 == "java" {print $1}' |
    while read -r pid; do awk '{print $14 + $15}' "/proc/$pid/stat" 2>/dev/null; done |
    awk '{sum += $1} END {print sum + 0}'
}
prev_ticks=$(java_ticks)

while running; do
  sleep 30
  now=$(date +%s)

  size=$(stat -c %s "$LOG" 2>/dev/null || echo "$offset")
  if [ "$size" -gt "$offset" ]; then
    if tail -c +"$((offset + 1))" "$LOG" | head -c "$((size - offset))" | grep -avE "$NOISE" | grep -aq '[^[:space:]]'; then
      last_log=$now
    fi
    offset=$size
  fi

  t=$(grep -acE '^stdout: +(✓|✘|-) +[0-9]+ ' "$LOG")
  [ "$t" -gt "$tests" ] && { tests=$t; last_test=$now; }

  if [ -n "$(find "$TG/logs" "$TG/output" -newer "$marker" -type f -print -quit 2>/dev/null)" ]; then
    last_files=$now
  fi
  touch "$marker"

  ev=$(docker events --since "$events_since" --until "$now" --format '{{.Type}} {{.Action}}' 2>/dev/null |
       grep -vcE ' (exec_create|exec_start|exec_die|top|health_status)' )
  [ "${ev:-0}" -gt 0 ] && last_docker=$now
  events_since=$now

  ticks=$(java_ticks)
  cpu=$(( (ticks - prev_ticks) * 100 / CLK_TCK / 30 ))   # % of one core over the last 30 s
  prev_ticks=$ticks
  [ "$cpu" -gt 40 ] && last_cpu=$now

  strong=$last_test
  [ "$last_files" -gt "$strong" ] && strong=$last_files
  latest=$strong
  for v in $last_log $last_docker $last_cpu; do [ "$v" -gt "$latest" ] && latest=$v; done
  reason=""
  if [ $((now - latest)) -ge $((STALL_MIN * 60)) ]; then
    reason="no progress for ${STALL_MIN} min"
  elif [ $((now - strong)) -ge $((WEAK_MAX_MIN * 60)) ]; then
    reason="only weak progress (log/docker/cpu) for ${WEAK_MAX_MIN} min — no finished test, no testground change"
  fi
  if [ -n "$reason" ]; then
    rm -f "$marker"
    ago() { echo "$(( (now - $1) / 60 )) min"; }
    echo "STALL  $reason  (run started $(( (now - START_EPOCH) / 60 )) min ago in this watch)"
    echo "  since last: log line $(ago "$last_log") | finished test $(ago "$last_test") | testground files $(ago "$last_files") | docker event $(ago "$last_docker") | server JVM cpu>40% $(ago "$last_cpu")  (JVM cpu now ${cpu:-?}%)"
    echo "== last finished test"
    grep -aE '^stdout: +(✓|✘|-) +[0-9]+ ' "$LOG" | tail -1 | cut -c1-220
    echo "== running test (next in --list order)"
    spec=$(grep -aoP "^E2E_SPEC='\K[^']*" "$LOG" | tail -1)
    grepv=$(grep -aoP "E2E_GREP='\K[^']*" "$LOG" | tail -1)
    last_n=$(grep -aoE '^stdout: +(✓|✘|-) +[0-9]+ ' "$LOG" | grep -oE '[0-9]+ $' | sort -n | tail -1 | tr -d ' ')
    next=$(( ${last_n:-0} + 1 ))
    docker exec "$CONTAINER" sh -c "cd '$REPO/frend/reporting' && TEST_ENV=web RUNNING_IN_E2E=true PORTABLE_EXECUTABLE_DIR=testground/e2e E2E_SPEC=\"\$1\" E2E_GREP=\"\$2\" npx playwright test -c e2e/playwright.config.ts e2e/ --list 2>/dev/null" sh "$spec" "$grepv" |
      grep -E '^\s+specs/' | sed -n "${next}p" | sed 's/^ *//' | cut -c1-220
    echo "== run log (last meaningful lines)"
    tail -c 200000 "$LOG" | grep -avE "$NOISE" | grep -av '^\s*$' | tail -15 | cut -c1-220
    echo "== testground info.log / errors.log"
    tail -5 "$TG/logs/info.log" 2>/dev/null | cut -c1-220
    tail -5 "$TG/logs/errors.log" 2>/dev/null | cut -c1-220
    echo "== containers created since the run started"
    run_start=$(date -d "$(grep -aoP '^PIPELINE_START \K\S+' "$LOG" | head -1)" +%s 2>/dev/null || echo 0)
    docker ps -a --format '{{.Names}}|{{.CreatedAt}}|{{.Status}}' | while IFS='|' read -r n c st; do
      ct=$(date -d "${c% *}" +%s 2>/dev/null || echo 0)
      [ "$ct" -ge "$run_start" ] && [ "$n" != "$CONTAINER" ] && echo "  $n  ($st)"
    done
    exit 3
  fi
done

rm -f "$marker"
sleep 5   # the firewall watcher writes its FIREWALL closed line right after the container is gone
echo "RUN ENDED  $(basename "$LOG")"
grep -aE '^(PIPELINE_RESULT|E2E_RESULT|FIREWALL)' "$LOG"
exit 0

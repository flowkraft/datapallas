#!/bin/bash
# Launcher for the persistence test, in the way dp-ci.sh launches a run: returns within seconds, the work
# is a detached container owned by the Docker daemon, its log is a file. follow-ci.sh follows it.
#
#   persistence-test.sh [MINUTES] [INTERVAL_SECONDS]      defaults: 10 minutes, a line every 5 seconds
#
# The proof is that the process id printed with every line never changes, whatever happens to Jenkins,
# the browser or an SSH session. Run on the host; uses the same image as the real runs.
set -uo pipefail

MINUTES="${1:-10}"; INTERVAL="${2:-5}"
case "$MINUTES$INTERVAL" in *[!0-9]*|'') echo "usage: $0 [MINUTES] [INTERVAL_SECONDS] (whole numbers)" >&2; exit 2;; esac
[ "$INTERVAL" -ge 1 ] || { echo "INTERVAL_SECONDS must be at least 1" >&2; exit 2; }

LOG_DIR=/var/kraft-internalsystems/logs/datapallas-ci
CONTAINER=dp-persistence-test
CI_IMAGE=datapallas-ci
LOG="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-persistence-test.log"
mkdir -p "$LOG_DIR"
: > "$LOG"      # the log exists before the container is started, so a follower never races it
ln -sfn "$LOG" "$LOG_DIR/persistence-test-latest.log"

TOTAL=$(( MINUTES * 60 / INTERVAL ))
docker run -d --rm --name "$CONTAINER" -v "$LOG_DIR":"$LOG_DIR" -e LOG="$LOG" -e TOTAL="$TOTAL" -e INTERVAL="$INTERVAL" \
  "$CI_IMAGE" bash -c '
    exec >>"$LOG" 2>&1
    echo "PIPELINE_START $(date -u +%FT%TZ)  task=persistence-test  ${TOTAL} lines, one every ${INTERVAL} s, pid $$"
    i=0
    while [ "$i" -lt "$TOTAL" ]; do
      i=$((i + 1)); echo "persistence-test: line ${i}/${TOTAL}  pid $$  $(date -u +%FT%TZ)"; sleep "$INTERVAL"
    done
    echo "PIPELINE_RESULT=SUCCESS  $(date -u +%FT%TZ)  one process (pid $$) ran all ${TOTAL} lines"
  ' >/dev/null || { echo "FAIL  docker run $CONTAINER (is a test already running?)"; exit 1; }

echo "STARTED  $CONTAINER  task=persistence-test"
echo "log:     $LOG   (also $LOG_DIR/persistence-test-latest.log)"
echo "stop:    docker stop $CONTAINER"

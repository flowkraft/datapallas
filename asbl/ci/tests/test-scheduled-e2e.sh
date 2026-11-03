#!/bin/bash
# The nightly e2e of main (asbl/ci/jenkins/scheduled-e2e.sh) with every command it could start replaced by a stub: the
# lane (follow-ci.sh: its exit code and its time read from files), dp-ci.sh (the build, the VM's stop: recorded, never run),
# the busy check, the fixer (FIX_STATUS read from a file) and docker. The builds are real git answers of the one rule
# (asbl/ci/reuse-or-rebuild.sh) between real commits of this repository. The cases:
#   - each night's sets, with fixed dates (a weekday, a Saturday of an odd and of an even ISO week, a Sunday);
#   - each reason to skip (the CI busy, an unreadable busy check, a night still going), and the wrong inputs;
#   - the builds: f9624daf to 02af0216 (CI and tests only) builds nothing; 3f5c21f0 to 889001e6 builds only the Windows
#     pack, so a Sunday packs again; bc6ee866 to d3ffd94b (product code) builds the image and the package; none here builds;
#   - the clean-up on a scratch LOG_DIR with dated folders: only the HTML reports older than 14 days go, nothing in evidence/
#     or runs/, no file; a dry run lists them;
#   - nights with the stub lane: green; red with report-only; red with a fix round (the fixer's start, the night waiting for
#     it); stop while a set runs and while a fix round goes; status, label, follow and reports.
# Every folder is a scratch one: no live folder is touched, nothing real is started or built. Takes about 40 seconds.
# Callers: a person or an agent, from the shell, after changing the scheduled job.
#   bash asbl/ci/tests/test-scheduled-e2e.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
NIGHT_SCRIPT="$PWD/asbl/ci/jenkins/scheduled-e2e.sh"
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-scheduled-e2e.XXXXXX") || exit 2
SLEEPERS=()   # the stand-in processes this test starts, ended at its exit
cleanup() {
  bash "$NIGHT_SCRIPT" stop >/dev/null 2>&1
  for pid in "${SLEEPERS[@]}"; do kill "$pid" 2>/dev/null; done
  rm -rf "$SCRATCH"
}
trap cleanup EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}
has() {  # has <text> <file or text>: the text is in it, or what it holds is printed
  if [ -f "$2" ]; then grep -qF -- "$1" "$2" && return 0; printf '      no "%s" in %s:\n' "$1" "$2"; sed 's/^/        /' "$2" | tail -15
  else case "$2" in *"$1"*) return 0 ;; esac; printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -15)"; fi
  return 1
}
lacks() {  # lacks <text> <file or text>: the text is not in it
  if [ -f "$2" ]; then ! grep -qF -- "$1" "$2"; else case "$2" in *"$1"*) printf '      "%s" found\n' "$1"; return 1 ;; esac; fi
}
wait_for() {  # wait_for <seconds> <command...>: until it succeeds
  local until=$((SECONDS + $1)); shift
  until "$@"; do [ "$SECONDS" -lt "$until" ] || return 1; sleep 0.3; done
}

# ---- the stubs; their inputs are files in $STUB, so the night's detached process reads the same ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin"
cat > "$STUB/bin/docker" <<'EOF'
#!/bin/bash
# stub docker: nothing is running, every container is gone already
echo "docker $*" >> "$STUB/docker-calls"
exit 1
EOF
cat > "$STUB/follow-ci" <<'EOF'
#!/bin/bash
# stub follow-ci.sh: records the lane's command and environment, writes its log, sleeps $STUB/lane-sleep, exits $STUB/lane-rc
echo $$ > "$STUB/lane.pid"
echo "$* | E2E_TARGET=${E2E_TARGET:-} E2E_SPEC=${E2E_SPEC:-} E2E_REUSE_BUILD=${E2E_REUSE_BUILD:-} E2E_RETRIES=${E2E_RETRIES:-} RELEASE_KEPT=${RELEASE_KEPT:-} REBUILD_PACK=${REBUILD_PACK:-} FOLLOW_PIDFILE=${FOLLOW_PIDFILE:-}" >> "$STUB/lane-calls"
log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-e2e-stub$$.log"; echo "the stub lane" > "$log"; ln -sfn "$log" "$LOG_DIR/latest.log"
sleep "$(cat "$STUB/lane-sleep" 2>/dev/null || echo 0)"
exit "$(cat "$STUB/lane-rc" 2>/dev/null || echo 0)"
EOF
cat > "$STUB/dp-ci" <<'EOF'
#!/bin/bash
# stub dp-ci.sh: records the call, builds nothing
echo "dp-ci $*" >> "$STUB/dp-ci-calls"
EOF
cat > "$STUB/busy" <<'EOF'
#!/bin/bash
# stub release-rehearsal.sh busy: prints $STUB/busy-answer (FREE by default)
answer=$(cat "$STUB/busy-answer" 2>/dev/null || echo FREE); echo "$answer"; [ "${answer%% *}" = FREE ]
EOF
cat > "$STUB/fixer" <<'EOF'
#!/bin/bash
# stub fixer: start prints its run and plan; status prints $STUB/fix-status; each call is recorded
echo "$* DRY_RUN=${DRY_RUN:-}" >> "$STUB/fixer-calls"
case "$1" in
  start)  echo "FIX_RUN=fix-night"; echo "FIX_PLAN=$STUB/scheduled-e2e-fix-round-1.md" ;;
  status) echo "FIX_STATUS=$(cat "$STUB/fix-status" 2>/dev/null || echo RUNNING) > **KRAFT-KEEP-WORKING STATUS** (stub)" ;;
  stop)   echo "stopped $2" ;;
esac
EOF
chmod +x "$STUB/bin/docker"
export PATH="$STUB/bin:$PATH"
export LOG_DIR="$SCRATCH/logs" RUN_RECORD_DIR="$SCRATCH/logs/runs" RELEASE_ARTIFACTS_DIR="$SCRATCH/logs/release-artifacts"
export SCHEDULED_PACKAGE_DIR="$SCRATCH/package" RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf"
export SCHEDULED_BUSY="bash $STUB/busy" SCHEDULED_FOLLOW_CI="bash $STUB/follow-ci" SCHEDULED_DP_CI="bash $STUB/dp-ci" SCHEDULED_POLL=1
export SCHEDULED_STARTED_BY="the test"
mkdir -p "$LOG_DIR/runs" "$RELEASE_ARTIFACTS_DIR" "$SCHEDULED_PACKAGE_DIR/verified-db-noexe/DataPallas"
printf 'RELEASE_FIXER="bash %s"\n' "$STUB/fixer" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"
night() { bash "$NIGHT_SCRIPT" "$@" 2>&1; }

# builds_from <commit>: the build, this host's package, the VM's package and a kept pack, all made from that commit
builds_from() {
  rm -f "$LOG_DIR"/*-build-*.log "$LOG_DIR"/*-win-*.log; rm -rf "${RELEASE_ARTIFACTS_DIR:?}"/*
  printf 'IMAGE_TAG=16.6.1-%s\nPIPELINE_RESULT=SUCCESS\n' "$1" > "$LOG_DIR/20261101T000000Z-build-$1.log"
  printf 'WIN_E2E_PACKAGE=current (%s)\n' "$1" > "$LOG_DIR/20261101T000000Z-win-server-e2e-$1.log"
  echo "$1" > "$SCHEDULED_PACKAGE_DIR/.built-from"
  mkdir -p "$RELEASE_ARTIFACTS_DIR/16.6.1-$1"
  printf 'commit=%s\nwindows.file=datapallas-server.zip sha256=x\n' "$1" > "$RELEASE_ARTIFACTS_DIR/16.6.1-$1/MANIFEST.txt"
}
newest_night() { ls -1d "$RUN_RECORD_DIR"/*-scheduled-e2e/ 2>/dev/null | sort | tail -1 | sed 's#/$##'; }
night_ended() { [ ! -e "$LOG_DIR/scheduled-e2e.pid" ] || ! kill -0 "$(cat "$LOG_DIR/scheduled-e2e.pid")" 2>/dev/null; }
# a_night <date> [<env>...]: one night started and waited for, its folder in NIGHT
a_night() {
  local date="$1"; shift
  sleep 1   # one night folder per second (its name is its start time)
  env SCHEDULED_DATE="$date" "$@" bash "$NIGHT_SCRIPT" start >/dev/null 2>&1
  wait_for 30 night_ended; NIGHT=$(newest_night)
}
: > "$STUB/lane-rc"; echo 0 > "$STUB/lane-rc"

echo "---- each night's sets ----"
export SCHEDULED_COMMIT=02af0216
builds_from f9624daf
check "a Wednesday: the Linux light set" has "2026-11-04 Wednesday: linux-light, on 02af0216" "$(night plan 2026-11-04)"
check "a Saturday of an odd ISO week (45): then the full set on docker-server" \
  has "2026-11-07 Saturday: linux-light full-docker-server," "$(night plan 2026-11-07)"
check "the next Saturday (week 46): the full set on web, alternating" has "2026-11-14 Saturday: linux-light full-web," "$(night plan 2026-11-14)"
check "a Sunday: then the Windows server light set" has "2026-11-08 Sunday: linux-light windows-server-light," "$(night plan 2026-11-08)"
check "  which takes no build of this host: the VM's package and the pack's zip only" \
  same "BUILD   e2e-package BUILD   windows-pack" \
  "$(night plan 2026-11-08 | sed -n '/^SET     windows-server-light/,$p' | grep -o '^BUILD   [a-z0-9-]*' | paste -sd' ')"
check "a Monday: the Linux light set only" has "2026-11-09 Monday: linux-light, on" "$(night plan 2026-11-09)"
check "plan refuses a wrong date" bash -c '! bash "$0" plan 2026-13-45 >/dev/null 2>&1' "$NIGHT_SCRIPT"

echo "---- the builds: only what changed ----"
out=$(night plan 2026-11-08)
check "f9624daf to 02af0216 (CI and tests only): the image reused" has "BUILD   image-and-zips: reuse" "$out"
check "f9624daf to 02af0216: this host's package and the VM's reused" same 2 "$(grep -c '^BUILD   e2e-package: reuse' <<< "$out")"
check "f9624daf to 02af0216, Sunday: the kept pack reused" has "BUILD   windows-pack: reuse (the kept pack $RELEASE_ARTIFACTS_DIR/16.6.1-f9624daf" "$out"
a_night 2026-11-08 DRY_RUN=yes
check "a dry Sunday night on f9624daf to 02af0216 builds nothing" lacks "build-if-needed" "$NIGHT/run.log"
check "  its Linux light set takes both builds (E2E_REUSE_BUILD)" has "E2E_REUSE_BUILD=image-and-zips\ e2e-package" "$NIGHT/run.log"
check "  its Windows server light set on the kept pack's zip, no pack" has "RELEASE_KEPT=$RELEASE_ARTIFACTS_DIR/16.6.1-f9624daf REBUILD_PACK=no" "$NIGHT/run.log"
check "  as the release lanes: retries 1, the light set, the one-command run" has "E2E_SPEC=light E2E_DOCKER_ONE_COMMAND=yes E2E_GREP= E2E_RETRIES=1" "$NIGHT/run.log"
check "  a dry night runs no lane and no build" bash -c '[ ! -e "$0/lane-calls" ] && [ ! -e "$0/dp-ci-calls" ]' "$STUB"
check "  and ends green, a dry run" has "dry_run=yes" "$NIGHT/result.txt"
export SCHEDULED_COMMIT=889001e6; builds_from 3f5c21f0
out=$(night plan 2026-11-08)
check "3f5c21f0 to 889001e6 (the source zip's packer only): the image and both packages reused" \
  same 3 "$(grep -cE '^BUILD   (image-and-zips|e2e-package): reuse' <<< "$out")"
check "3f5c21f0 to 889001e6, Sunday: the pack built again" has "BUILD   windows-pack: rebuild" "$out"
check "  naming what changed" has "DataPallasSourceAssembler.java" "$out"
a_night 2026-11-08 DRY_RUN=yes
check "  the dry Sunday night packs first (REBUILD_PACK=yes), builds nothing on this host" \
  bash -c 'grep -qF "REBUILD_PACK=yes" "$0" && ! grep -q build-if-needed "$0"' "$NIGHT/run.log"
export SCHEDULED_COMMIT=d3ffd94b; builds_from bc6ee866
a_night 2026-11-04 DRY_RUN=yes
check "bc6ee866 to d3ffd94b (product code): the image built first" has "WOULD   bash $STUB/dp-ci build-if-needed" "$NIGHT/run.log"
check "  and the package left to the lane's own prepare (no E2E_REUSE_BUILD)" has "E2E_REUSE_BUILD= " "$NIGHT/run.log"
rm -f "$LOG_DIR"/*-build-*.log; rm -rf "${SCHEDULED_PACKAGE_DIR:?}/verified-db-noexe"
out=$(night plan 2026-11-04)
check "no build here: the image is built" has "BUILD   image-and-zips: rebuild (none to reuse: no successful build log" "$out"
check "no package here: the lane prepares it" has "BUILD   e2e-package: rebuild (none to reuse: no e2e package in" "$out"
mkdir -p "$SCHEDULED_PACKAGE_DIR/verified-db-noexe/DataPallas"
export SCHEDULED_COMMIT=02af0216; builds_from f9624daf

echo "---- the reasons to skip, and the wrong inputs ----"
before=$(ls "$RUN_RECORD_DIR" | wc -l)
echo "BUSY a dp-ci run is going (its container dp-ci: docker logs -f dp-ci)" > "$STUB/busy-answer"
out=$(night start); rc=$?
check "the CI busy: skipped, green (exit 0)" same "0 SKIPPED: the CI is busy: a dp-ci run is going (its container dp-ci: docker logs -f dp-ci)" "$rc $(tail -1 <<< "$out")"
echo "BUSY a release round is going: ROUND state=waiting-for-review version=16.6.2" > "$STUB/busy-answer"
check "a release round open: skipped" has "SKIPPED: the CI is busy: a release round is going" "$(night start)"
echo "something else" > "$STUB/busy-answer"
check "a busy check that says neither FREE nor BUSY: skipped, saying what it said" has "SKIPPED: could not tell whether the CI is busy (release-rehearsal.sh busy said: something else)" "$(night start)"
rm -f "$STUB/busy-answer"
sleep 600 & SLEEPERS+=($!); echo $! > "$LOG_DIR/scheduled-e2e.pid"
check "a night still going: skipped" has "SKIPPED: the night of 2026-11-04 Wednesday is still going" "$(night start)"
rm -f "$LOG_DIR/scheduled-e2e.pid"
check "  no night folder made by a skipped start" same "$before" "$(ls "$RUN_RECORD_DIR" | wc -l)"
check "ON_FAILURES must be fix or report-only (exit 2)" bash -c 'ON_FAILURES=retry bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
check "DRY_RUN must be yes or no (exit 2)" bash -c 'DRY_RUN=maybe bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
check "who starts it is required (exit 2)" bash -c 'SCHEDULED_STARTED_BY= bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"

echo "---- the clean-up of old HTML reports ----"
mkdir -p "$LOG_DIR/20261001T000000Z-e2e-aaaa-playwright-html" "$LOG_DIR/win-docker-e2e-20261002T000000Z-playwright-html" \
  "$LOG_DIR/20261030T000000Z-e2e-bbbb-playwright-html" "$LOG_DIR/20260916T223230Z-evidence/x/old-playwright-html" \
  "$RUN_RECORD_DIR/20261001T000000Z-step-1-web/reports/20261001T000000Z-playwright-html" "$RELEASE_ARTIFACTS_DIR/16.6.0-x/y-playwright-html"
touch "$LOG_DIR/20261001T000000Z-e2e-aaaa-playwright.json" "$LOG_DIR/20261001T000000Z-e2e-aaaa.log"
for d in "$LOG_DIR/20261001T000000Z-e2e-aaaa-playwright-html" "$LOG_DIR/win-docker-e2e-20261002T000000Z-playwright-html" \
         "$LOG_DIR/20260916T223230Z-evidence/x/old-playwright-html" "$RUN_RECORD_DIR/20261001T000000Z-step-1-web/reports/20261001T000000Z-playwright-html" \
         "$RELEASE_ARTIFACTS_DIR/16.6.0-x/y-playwright-html" "$LOG_DIR/20261001T000000Z-e2e-aaaa-playwright.json" "$LOG_DIR/20261001T000000Z-e2e-aaaa.log"; do
  touch -d '20 days ago' "$d"
done
touch -d '13 days ago' "$LOG_DIR/20261030T000000Z-e2e-bbbb-playwright-html"
out=$(DRY_RUN=yes night clean)
check "a dry clean-up lists the two old ones, deletes nothing" \
  bash -c 'grep -q "2 Playwright HTML report(s) older than 14 days would go" <<< "$0" && [ -d "$1/20261001T000000Z-e2e-aaaa-playwright-html" ]' "$out" "$LOG_DIR"
out=$(night clean)
check "the clean-up: the two HTML reports older than 14 days at the top of LOG_DIR go" \
  bash -c '[ ! -e "$0/20261001T000000Z-e2e-aaaa-playwright-html" ] && [ ! -e "$0/win-docker-e2e-20261002T000000Z-playwright-html" ]' "$LOG_DIR"
check "  one 13 days old stays" test -d "$LOG_DIR/20261030T000000Z-e2e-bbbb-playwright-html"
check "  nothing in evidence/, runs/ or release-artifacts/" bash -c '[ -d "$0/20260916T223230Z-evidence/x/old-playwright-html" ] &&
  [ -d "$1/20261001T000000Z-step-1-web/reports/20261001T000000Z-playwright-html" ] && [ -d "$2/16.6.0-x/y-playwright-html" ]' "$LOG_DIR" "$RUN_RECORD_DIR" "$RELEASE_ARTIFACTS_DIR"
check "  no file: the old log and JSON stay" bash -c '[ -f "$0/20261001T000000Z-e2e-aaaa-playwright.json" ] && [ -f "$0/20261001T000000Z-e2e-aaaa.log" ]' "$LOG_DIR"
mkdir -p "$LOG_DIR/20261002T000000Z-e2e-cccc-playwright-html"; touch -d '20 days ago' "$LOG_DIR/20261002T000000Z-e2e-cccc-playwright-html"
echo "BUSY a dp-ci run is going" > "$STUB/busy-answer"
check "a skipped night cleans up too" has "CLEAN   1 Playwright HTML report(s) older than 14 days gone" "$(night start)"
rm -f "$STUB/busy-answer"

echo "---- nights with the stub lane ----"
rm -f "$STUB/lane-calls"
a_night 2026-11-04
check "a green night: result.txt green, its set PASS" bash -c 'grep -qx "result=green" "$0/result.txt" && grep -qP "^part\tlinux-light\thost\tPASS\t" "$0/result.txt"' "$NIGHT"
check "  the lane ran once, as the release lane, the builds reused" \
  has "run bash asbl/ci/dp-ci.sh e2e | E2E_TARGET=docker-server E2E_SPEC=light E2E_REUSE_BUILD=image-and-zips e2e-package E2E_RETRIES=1" "$STUB/lane-calls"
check "  its lane's log as the part's log" bash -c 'grep -P "^part\tlinux-light" "$0/result.txt" | grep -q "e2e-stub"' "$NIGHT"
check "  in the orchestrator's format, a scheduled run that counts for no release" \
  bash -c 'grep -qx run_kind=scheduled "$0" && grep -qx step1=not-run "$0" && grep -qx kept= "$0" && grep -q "^pin=02af0216" "$0"' "$NIGHT/result.txt"
check "  status: green, exit 0" bash -c 'out=$(bash "$0" status); [ $? = 0 ] && [[ "$out" == "NIGHT state=green night=2026-11-04-Wednesday sets=linux-light commit=02af0216 "* ]]' "$NIGHT_SCRIPT"
check "  label" same "2026-11-04 Wednesday: linux-light PASS" "$(night label)"
out=$(night follow); rc=$?
check "  follow: the console to its end, exit 0" bash -c '[ "$0" = 0 ] && grep -q "NIGHT END result=green" <<< "$1" && [[ "$(tail -1 <<< "$1")" == "FOLLOW next="*" state=green ended=yes" ]]' "$rc" "$out"
check "  its history line" has $'SUCCESS\tthe test\tscheduled e2e 2026-11-04 Wednesday\t02af0216' "$RUN_RECORD_DIR/history.tsv"
check "  nothing written in a release or re-run record" bash -c '! ls "$0"/release-state "$0"/release-reruns.tsv >/dev/null 2>&1' "$LOG_DIR"
check "  the pid file gone" test ! -e "$LOG_DIR/scheduled-e2e.pid"

echo 1 > "$STUB/lane-rc"; rm -f "$STUB/fixer-calls"
a_night 2026-11-04 ON_FAILURES=report-only
check "a red night, report-only: red, no fixer" bash -c 'grep -qx "result=red" "$0/result.txt" && [ ! -e "$1/fixer-calls" ]' "$NIGHT" "$STUB"
check "  its set FAIL with why" bash -c 'grep -qP "^part\tlinux-light\thost\tFAIL\t.*\trc=1$" "$0/result.txt"' "$NIGHT"
check "  status: red, exit 1" bash -c 'bash "$0" status >/dev/null; [ $? = 1 ]' "$NIGHT_SCRIPT"
check "  label" same "2026-11-04 Wednesday: linux-light FAIL" "$(night label)"

echo RUNNING > "$STUB/fix-status"; rm -f "$STUB/lane-calls"; sleep 1
SCHEDULED_DATE=2026-11-07 night start >/dev/null
wait_for 30 bash -c 'grep -q "^state=fixing" "$0"/night.state' "$(newest_night)"; NIGHT=$(newest_night)
check "a red Saturday with fix: both sets ran, each whatever the other's verdict" same 2 "$(grep -c '^part' "$NIGHT/result.txt")"
check "  the full set as step 1's full lane: docker-server, the whole set" has "E2E_TARGET=docker-server E2E_SPEC= E2E_REUSE_BUILD=image-and-zips e2e-package E2E_RETRIES=1" "$STUB/lane-calls"
check "  the fixer started on the night's folder, round 1" has "start $NIGHT 1 DRY_RUN=no" "$STUB/fixer-calls"
check "  state fixing, the night's process waiting (the pid file alive)" bash -c 'grep -q "^state=fixing" "$0/night.state" && kill -0 "$(cat "$1/scheduled-e2e.pid")"' "$NIGHT" "$LOG_DIR"
out=$(night follow --for 5); rc=$?
check "  follow ends at the night's end line, red (exit 1), while the fix round goes" \
  bash -c '[ "$0" = 1 ] && grep -q "NIGHT END result=red: fix round 1 started: " <<< "$1" && [[ "$(tail -1 <<< "$1")" == *" state=fixing ended=yes" ]]' "$rc" "$out"
check "  label" same "2026-11-07 Saturday: linux-light FAIL, full-docker-server FAIL; fix round going" "$(night label)"
check "  the next night skips while it goes" has "SKIPPED: the night of 2026-11-07 Saturday is still going (red; fix round fix-night going" "$(night start)"
echo DONE > "$STUB/fix-status"
wait_for 30 night_ended
check "  the fix round DONE: the night red, the pid file gone, nothing run again" \
  bash -c 'grep -q "^state=red" "$0/night.state" && grep -q "^why=red; fix round 1 DONE" "$0/night.state" && [ "$(grep -c "" "$1/lane-calls")" = 2 ]' "$NIGHT" "$STUB"
check "  label" same "2026-11-07 Saturday: linux-light FAIL, full-docker-server FAIL; fix round ended" "$(night label)"

echo "---- stop: what the night started ----"
echo 0 > "$STUB/lane-rc"; echo 600 > "$STUB/lane-sleep"; rm -f "$STUB/docker-calls" "$STUB/lane.pid"; sleep 1
SCHEDULED_DATE=2026-11-04 night start >/dev/null
wait_for 15 test -s "$STUB/lane.pid"   # the stub lane is going
NIGHT=$(newest_night)
check "  status while a set runs: running, exit 5" bash -c 'bash "$0" status >/dev/null; [ $? = 5 ]' "$NIGHT_SCRIPT"
check "  label while a set runs" same "2026-11-04 Wednesday: linux-light going" "$(night label)"
out=$(STOP_BY="a release press" night stop); rc=$?
check "stop while a set runs: exit 4, stopped, the pid file gone" \
  bash -c '[ "$0" = 4 ] && grep -q "^state=stopped" "$1/night.state" && [ ! -e "$2/scheduled-e2e.pid" ]' "$rc" "$NIGHT" "$LOG_DIR"
check "  the night's processes ended (the lane's too)" bash -c 'sleep 1; ! kill -0 "$(cat "$0")" 2>/dev/null' "$STUB/lane.pid"
check "  its set's containers looked for, from started.txt" has "docker inspect -f {{.Created}} dp-ci" "$STUB/docker-calls"
check "  who stopped it" has "STOPPED by a release press (it was running)" "$NIGHT/run.log"
check "a second stop: nothing to stop (exit 4)" bash -c 'out=$(bash "$0" stop); [ $? = 4 ] && [[ "$out" == "the night had ended already (stopped)"* ]]' "$NIGHT_SCRIPT"
echo 0 > "$STUB/lane-sleep"; echo 1 > "$STUB/lane-rc"; echo RUNNING > "$STUB/fix-status"; rm -f "$STUB/fixer-calls"; sleep 1
SCHEDULED_DATE=2026-11-04 night start >/dev/null
wait_for 30 bash -c 'grep -q "^state=fixing" "$0"/night.state' "$(newest_night)"; NIGHT=$(newest_night)
out=$(night stop)
check "stop while a fix round goes: the fix run stopped too" bash -c 'grep -q "^stop fix-night" "$0/fixer-calls" && grep -q "^state=stopped" "$1/night.state"' "$STUB" "$NIGHT"

echo "---- reports ----"
json="$LOG_DIR/20261103T000000Z-e2e-x-playwright.json"; echo '{}' > "$json"; echo '<testsuites/>' > "${json%.json}.xml"
printf 'part\tlinux-light\thost\tFAIL\t%s\t%s %s\trc=1\n' "$LOG_DIR/x.log" "$json" "${json%.json}-html" >> "$NIGHT/result.txt"
out=$(night reports)
check "reports: the result, the summary, the flaky tests, the JSON and its JUnit XML, never the HTML" \
  bash -c 'grep -qx "REPORT night $1/result.txt" <<< "$0" && grep -qx "REPORT night $1/run.log" <<< "$0" && grep -qx "REPORT night $1/flaky.txt" <<< "$0" &&
           grep -qx "REPORT linux-light $2" <<< "$0" && grep -qx "REPORT linux-light ${2%.json}.xml" <<< "$0" && ! grep -q -- "-html" <<< "$0"' "$out" "$NIGHT" "$json"
check "help prints the header, exit 0" bash -c 'bash "$0" help | grep -q "^# THE NIGHTS"' "$NIGHT_SCRIPT"
check "no build was ever started" test ! -e "$STUB/dp-ci-calls"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-scheduled-e2e"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-scheduled-e2e"; exit 1

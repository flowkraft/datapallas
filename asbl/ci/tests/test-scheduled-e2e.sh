#!/bin/bash
# The nightly e2e of main (asbl/ci/jenkins/scheduled-e2e.sh) with every command it could start replaced by a stub: the
# lane (follow-ci.sh: its exit code and its time read from files), dp-ci.sh (the build, the VM's stop: recorded, never run),
# the busy check, the fixer (FIX_STATUS read from a file) and docker. The builds are real git answers of the one rule
# (asbl/ci/reuse-or-rebuild.sh) between real commits of this repository. The cases:
#   - the rotation: 16 pairs (part, packaged lane), every pair once, four nights in a row on the four lanes; plan from
#     any place in it; a dry start printing tonight's pair; each lane's sets and command (the auth file alone after a
#     server lane's part, the Electron-only file in the desktop's part);
#   - each reason to skip (the CI busy, an unreadable busy check, a night still going), and the wrong inputs; a skipped,
#     dry or stopped night leaves its pair next, a night that ran (green or red) moves the rotation on;
#   - the switch: on by default; off and on (who, since; a dry one writes nothing); a timed night while off does nothing
#     and leaves the rotation as it was; a press with off only switches, with on switches on and runs (here: skipped busy);
#   - the builds: f9624daf to 02af0216 (CI and tests only) builds nothing; 3f5c21f0 to 889001e6 builds only the Windows
#     pack, so a Windows server night packs again; bc6ee866 to d3ffd94b (product code) builds the image; none here builds;
#   - the clean-up on a scratch LOG_DIR with dated folders: only the HTML reports older than 14 days go, nothing in evidence/
#     or runs/, no file; a dry run lists them;
#   - nights with the stub lane: green; red with report-only; red with fix-prove-then-wait-for-review (the night ends at once,
#     the next night runs and only reports while that fix is open, abort, a proceed puts the red pair first) and with
#     fix-prove-then-rerun-automatically (the night waiting for the round, the red pair first after a DONE one); stop while
#     a set runs (on Linux and on the VM) and while a fix round goes; status, label, follow and reports. A proceed goes to
#     a stub fix-round.sh (test-fix-round.sh proves the real one): nothing is ever committed or pushed.
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
echo "$* | E2E_MODE=${E2E_MODE:-} E2E_TARGET=${E2E_TARGET:-} E2E_SPEC=${E2E_SPEC:-} WIN_RUN_TIMEOUT=${WIN_RUN_TIMEOUT:-} E2E_REUSE_BUILD=${E2E_REUSE_BUILD:-} E2E_RETRIES=${E2E_RETRIES:-} RELEASE_KEPT=${RELEASE_KEPT:-} REBUILD_PACK=${REBUILD_PACK:-} FOLLOW_PIDFILE=${FOLLOW_PIDFILE:-}" >> "$STUB/lane-calls"
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
echo "$* FIX_MODE=${FIX_MODE:-} DRY_RUN=${DRY_RUN:-}" >> "$STUB/fixer-calls"
case "$1" in
  start)  echo "FIX_RUN=fix-night"; echo "FIX_PLAN=$STUB/scheduled-e2e-fix-round-1.md" ;;
  status) echo "FIX_STATUS=$(cat "$STUB/fix-status" 2>/dev/null || echo RUNNING) > **KRAFT-KEEP-WORKING STATUS** (stub)" ;;
  stop)   echo "stopped $2" ;;
esac
EOF
cat > "$STUB/fix-round" <<'EOF'
#!/bin/bash
# stub fix-round.sh, for proceed only: records its call, prints the commit a real proceed prints
echo "$*" >> "$STUB/fix-round-calls"; [ "$1" != proceed ] || echo "FIX_COMMIT=0123abcd"
EOF
chmod +x "$STUB/bin/docker"
export PATH="$STUB/bin:$PATH"
export LOG_DIR="$SCRATCH/logs" RUN_RECORD_DIR="$SCRATCH/logs/runs" RELEASE_ARTIFACTS_DIR="$SCRATCH/logs/release-artifacts"
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf"
export SCHEDULED_BUSY="bash $STUB/busy" SCHEDULED_FOLLOW_CI="bash $STUB/follow-ci" SCHEDULED_DP_CI="bash $STUB/dp-ci" SCHEDULED_POLL=1
export SCHEDULED_STARTED_BY="the test"
mkdir -p "$LOG_DIR/runs" "$RELEASE_ARTIFACTS_DIR"
printf 'RELEASE_FIXER="bash %s"\n' "$STUB/fixer" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"
night() { bash "$NIGHT_SCRIPT" "$@" 2>&1; }

# builds_from <commit>: the build (image and zips) and a kept pack, both made from that commit
builds_from() {
  rm -f "$LOG_DIR"/*-build-*.log; rm -rf "${RELEASE_ARTIFACTS_DIR:?}"/*
  printf 'IMAGE_TAG=16.6.1-%s\nPIPELINE_RESULT=SUCCESS\n' "$1" > "$LOG_DIR/20261101T000000Z-build-$1.log"
  mkdir -p "$RELEASE_ARTIFACTS_DIR/16.6.1-$1"
  printf 'commit=%s\nwindows.file=datapallas-server.zip sha256=x\n' "$1" > "$RELEASE_ARTIFACTS_DIR/16.6.1-$1/MANIFEST.txt"
}
newest_night() { ls -1d "$RUN_RECORD_DIR"/*-scheduled-e2e/ 2>/dev/null | sort | tail -1 | sed 's#/$##'; }
rotation_at() { printf 'next=%s\n' "$1" > "$LOG_DIR/scheduled-e2e-rotation"; }   # rotation_at <pair>: the next night's pair
next_pair() { bash "$NIGHT_SCRIPT" plan 2>&1 | grep -oP '^NIGHT +1  pair \K\d+'; }   # the pair the next night runs
line_in() {  # line_in <line> <text>: the text has that whole line, or what it holds is printed
  printf '%s\n' "$2" | grep -qxF -- "$1" && return 0
  printf '      no line "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -20)"; return 1
}
night_ended() { [ ! -e "$LOG_DIR/scheduled-e2e.pid" ] || ! kill -0 "$(cat "$LOG_DIR/scheduled-e2e.pid")" 2>/dev/null; }
# a_night <date> [<env>...]: one night started and waited for, its folder in NIGHT
a_night() {
  local date="$1"; shift
  sleep 1   # one night folder per second (its name is its start time)
  env SCHEDULED_DATE="$date" "$@" bash "$NIGHT_SCRIPT" start >/dev/null 2>&1
  wait_for 30 night_ended; NIGHT=$(newest_night)
}
: > "$STUB/lane-rc"; echo 0 > "$STUB/lane-rc"

echo "---- the rotation: 16 pairs, by nights run ----"
export SCHEDULED_COMMIT=02af0216
builds_from f9624daf
out=$(night plan)
check "no rotation yet: the next night is pair 1, docker-server part 1, then the auth file alone" \
  line_in "NIGHT    1  pair 1/16, docker-server part 1/4: docker-server-part-1 docker-server-auth-authorization-server" "$out"
check "  16 nights listed, each (lane, part) once" \
  same "16 16" "$(grep -c '^NIGHT ' <<< "$out") $(grep -oP '^NIGHT +\d+  pair \d+/16, \K\S+ part \d' <<< "$out" | sort -u | wc -l)"
check "  four nights in a row: the four lanes, the four parts" \
  same "docker-server part 1/4|windows-vm-docker part 2/4|windows-vm-server part 3/4|windows-vm-electron part 4/4" \
  "$(grep -oP '^NIGHT +[1-4]  pair \d+/16, \K[^:]*' <<< "$out" | paste -sd'|')"
check "  a desktop night: its part only (let-me-update runs inside it)" \
  line_in "NIGHT    4  pair 4/16, windows-vm-electron part 4/4: windows-vm-electron-part-4" "$out"
check "  the next night's sets, each with its spec files" bash -c 'grep -q "^SET     the next night.s docker-server-part-1 (host): 2 spec file(s)$" <<< "$0" &&
  grep -q "^SET     the next night.s docker-server-auth-authorization-server (host): 1 spec file(s)$" <<< "$0"' "$out"
rotation_at 6; out=$(night plan)
check "the rotation at pair 6: plan starts there and wraps after pair 16" bash -c '
  grep -qx "NIGHT    1  pair 6/16, windows-vm-docker part 3/4: windows-vm-docker-part-3 windows-vm-docker-auth-authorization-server" <<< "$0" &&
  grep -q "^NIGHT   12  pair 1/16, " <<< "$0"' "$out"
check "plan takes no date (the rotation moves by nights run, not by dates)" bash -c '! bash "$0" plan 2026-11-07 >/dev/null 2>&1' "$NIGHT_SCRIPT"

echo "---- each lane's night, dry, and the builds: only what changed ----"
rotation_at 1; sleep 1
out=$(SCHEDULED_DATE=2026-11-15 DRY_RUN=yes night start); wait_for 30 night_ended; NIGHT=$(newest_night)
check "a dry start prints tonight's pair: its lane and its part" \
  has "STARTED the night of 2026-11-15 Sunday, pair 1/16, docker-server part 1/4: docker-server-part-1 docker-server-auth-authorization-server (dry run)" "$out"
check "  f9624daf to 02af0216 (CI and tests only): the image reused for both sets, nothing built" \
  bash -c '[ "$(grep -c "^BUILD   image-and-zips: reuse" "$0")" = 2 ] && ! grep -q build-if-needed "$0"' "$NIGHT/run.log"
check "  no e2e package: the packaged lanes test the shipped files" lacks "e2e-package" "$NIGHT/run.log"
check "  the part on the Linux docker lane, packaged, retries 1, the image named for reuse" \
  bash -c 'grep "^WOULD   " "$0" | head -1 | grep "E2E_MODE=production-packaged " | grep "E2E_TARGET=docker-server E2E_GREP= E2E_RETRIES=1 " |
    grep "E2E_REUSE_BUILD=image-and-zips " | grep "canvas-dashboard-demos" | grep -v "auth-authorization-server" | grep -q "dp-ci.sh e2e$"' "$NIGHT/run.log"
check "  then the auth file alone, on the same lane" \
  bash -c 'grep "^WOULD   " "$0" | sed -n 2p | grep "auth-authorization-server" | grep -v canvas | grep -q "E2E_TARGET=docker-server .*dp-ci.sh e2e$"' "$NIGHT/run.log"
check "  a dry night runs no lane and no build" bash -c '[ ! -e "$0/lane-calls" ] && [ ! -e "$0/dp-ci-calls" ]' "$STUB"
check "  ends green, a dry run, its pair in result.txt" bash -c 'grep -qx dry_run=yes "$0" && grep -qx pair=1/16 "$0"' "$NIGHT/result.txt"
check "  and leaves its pair next (a dry run ran nothing)" same 1 "$(next_pair)"
export SCHEDULED_COMMIT=889001e6; builds_from 3f5c21f0; rotation_at 3
out=$(night plan)
check "3f5c21f0 to 889001e6 (the source zip's packer only), a Windows server night: the pack built again, for both sets" \
  same 2 "$(grep -c '^BUILD   windows-pack: rebuild' <<< "$out")"
check "  naming what changed" has "DataPallasSourceAssembler.java" "$out"
a_night 2026-11-15 DRY_RUN=yes
check "  the dry night packs first (REBUILD_PACK=yes) from the kept folder, builds nothing on this host" \
  bash -c 'grep -qF "RELEASE_KEPT=$1 REBUILD_PACK=yes" "$0" && ! grep -q build-if-needed "$0"' "$NIGHT/run.log" "$RELEASE_ARTIFACTS_DIR/16.6.1-3f5c21f0"
check "  through win-e2e.sh server-e2e, the part with 16 h on the VM, the auth file the lane's own cap" \
  bash -c '[ "$(grep -c "win-e2e.sh server-e2e$" "$0")" = 2 ] && [ "$(grep -c "WIN_RUN_TIMEOUT=57600" "$0")" = 1 ] &&
    grep "WIN_RUN_TIMEOUT=57600" "$0" | grep -qv auth-authorization-server' "$NIGHT/run.log"
rotation_at 4; a_night 2026-11-15 DRY_RUN=yes
check "a desktop night: one set, its part with let-me-update-migrate-configuration, through win-e2e.sh e2e on the kept pack" \
  bash -c '[ "$(grep -c "^WOULD   " "$0")" = 1 ] && grep "^WOULD   " "$0" | grep "REBUILD_PACK=yes" | grep -q "let-me-update-migrate-configuration.*win-e2e.sh e2e$"' "$NIGHT/run.log"
export SCHEDULED_COMMIT=d3ffd94b; builds_from bc6ee866; rotation_at 2
a_night 2026-11-15 DRY_RUN=yes
check "bc6ee866 to d3ffd94b (product code), a Windows docker night: the image built first" has "WOULD   bash $STUB/dp-ci build-if-needed" "$NIGHT/run.log"
check "  then the lane through win-e2e.sh docker-e2e, no build named for reuse, no pack" \
  bash -c 'grep "^WOULD   E2E_MODE" "$0" | head -1 | grep "E2E_REUSE_BUILD= " | grep -v RELEASE_KEPT | grep -q "win-e2e.sh docker-e2e$"' "$NIGHT/run.log"
rm -f "$LOG_DIR"/*-build-*.log
check "no build here: the image is built" has "BUILD   image-and-zips: rebuild (none to reuse: no successful build log" "$(night plan)"
export SCHEDULED_COMMIT=02af0216; builds_from f9624daf; rm -f "$LOG_DIR/scheduled-e2e-rotation"

echo "---- the reasons to skip, and the wrong inputs ----"
before=$(ls "$RUN_RECORD_DIR" | wc -l)
rotation_at 7
echo "BUSY a dp-ci run is going (its container dp-ci: docker logs -f dp-ci)" > "$STUB/busy-answer"
out=$(night start); rc=$?
check "the CI busy: skipped, green (exit 0)" same "0 SKIPPED: the CI is busy: a dp-ci run is going (its container dp-ci: docker logs -f dp-ci)" "$rc $(tail -1 <<< "$out")"
check "  a skipped night leaves its pair next" same 7 "$(next_pair)"
echo "BUSY a release round is going: ROUND state=waiting-for-review version=16.6.2" > "$STUB/busy-answer"
check "a release round open: skipped" has "SKIPPED: the CI is busy: a release round is going" "$(night start)"
echo "something else" > "$STUB/busy-answer"
check "a busy check that says neither FREE nor BUSY: skipped, saying what it said" has "SKIPPED: could not tell whether the CI is busy (release-rehearsal.sh busy said: something else)" "$(night start)"
rm -f "$STUB/busy-answer"
sleep 600 & SLEEPERS+=($!); echo $! > "$LOG_DIR/scheduled-e2e.pid"
check "a night still going: skipped" has "SKIPPED: the night of 2026-11-15 Sunday is still going" "$(night start)"
rm -f "$LOG_DIR/scheduled-e2e.pid"
check "  no night folder made by a skipped start" same "$before" "$(ls "$RUN_RECORD_DIR" | wc -l)"
check "  and still pair 7 next" same 7 "$(next_pair)"
check "ON_FAILURES must be one of its three values (exit 2)" bash -c 'ON_FAILURES=retry bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
check "DRY_RUN must be yes or no (exit 2)" bash -c 'DRY_RUN=maybe bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
check "who starts it is required (exit 2)" bash -c 'SCHEDULED_STARTED_BY= bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
rm -f "$LOG_DIR/scheduled-e2e-rotation"

echo "---- the switch: on and off ----"
SW="$LOG_DIR/scheduled-e2e-switch"
check "never switched: on by default (plan, status)" bash -c 'bash "$0" plan 2>&1 | grep -qx "SWITCH  on (never switched: on by default)" &&
  bash "$0" status | grep -q " switch=on"' "$NIGHT_SCRIPT"
check "off needs who switches (exit 2)" bash -c 'SCHEDULED_STARTED_BY= bash "$0" off >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
check "a dry off writes nothing" bash -c 'DRY_RUN=yes bash "$0" off | grep -q "^WOULD   switch the nights off" && [ ! -e "$1" ]' "$NIGHT_SCRIPT" "$SW"
check "off: its line, since when, by whom" bash -c 'SCHEDULED_STARTED_BY=alice bash "$0" off | grep -qP "^SWITCH  off since \d{4}-\d\d-\d\dT[\d:]+Z, by alice$"' "$NIGHT_SCRIPT"
before=$(ls "$RUN_RECORD_DIR" | wc -l); pair_before=$(next_pair); rm -f "$STUB/busy-calls"
t0=$SECONDS; out=$(night start); rc=$?
check "a timed night while off: exit 0 at once, OFF since when and by whom" bash -c '[ "$0" = 0 ] && [ "$2" -le 5 ] &&
  grep -qP "^OFF     off since \S+, by alice: no night " <<< "$1"' "$rc" "$out" "$((SECONDS - t0))"
check "  no night folder, the rotation as it was" bash -c '[ "$(ls "$0" | wc -l)" = "$1" ] && [ "$2" = "$3" ]'   "$RUN_RECORD_DIR" "$before" "$pair_before" "$(next_pair)"
check "  status shows the switch" has " switch=off" "$(night status)"
check "RUN_EVERY_NIGHT must be on or off (exit 2)" bash -c 'RUN_EVERY_NIGHT=maybe bash "$0" start >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT"
echo "BUSY a test" > "$STUB/busy-answer"
out=$(RUN_EVERY_NIGHT=on SCHEDULED_STARTED_BY=carol night start); rc=$?
check "a press with on: on, by whom, then the night's checks (here: the CI busy, skipped)" bash -c '[ "$0" = 0 ] &&
  grep -qP "^SWITCH  on since \S+, by carol$" <<< "$1" && grep -q "^SKIPPED: the CI is busy: a test" <<< "$1" && grep -qx state=on "$2"' "$rc" "$out" "$SW"
cp "$SW" "$SCRATCH/switch.before"; sleep 1
RUN_EVERY_NIGHT=on SCHEDULED_STARTED_BY=dave night start >/dev/null
check "  a press with on while on: the switch as it was (since, by)" cmp -s "$SW" "$SCRATCH/switch.before"
rm -f "$STUB/busy-answer"
out=$(RUN_EVERY_NIGHT=off SCHEDULED_STARTED_BY=bob night start); rc=$?
check "a press with off: off, by whom, nothing run" bash -c '[ "$0" = 0 ] && grep -qP "^SWITCH  off since \S+, by bob$" <<< "$1" &&
  grep -q "^OFF     the nights are off from now, by bob" <<< "$1" && [ "$(ls "$2" | wc -l)" = "$3" ]' "$rc" "$out" "$RUN_RECORD_DIR" "$before"
check "on: its line, by whom; status on" bash -c 'SCHEDULED_STARTED_BY=erin bash "$0" on | grep -qP "^SWITCH  on since \S+, by erin$" &&
  bash "$0" status | grep -q " switch=on"' "$NIGHT_SCRIPT"
rm -f "$SW" "$LOG_DIR/scheduled-e2e-rotation"

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
a_night 2026-11-15
check "a green night: result.txt green, both sets PASS" bash -c 'grep -qx "result=green" "$0/result.txt" &&
  grep -qP "^part\tdocker-server-part-1\thost\tPASS\t" "$0/result.txt" && grep -qP "^part\tdocker-server-auth-authorization-server\thost\tPASS\t" "$0/result.txt"' "$NIGHT"
check "  the lane ran twice, packaged, the image reused" bash -c '[ "$(grep -c "^run bash asbl/ci/dp-ci.sh e2e | E2E_MODE=production-packaged E2E_TARGET=docker-server .* E2E_REUSE_BUILD=image-and-zips E2E_RETRIES=1 " "$0")" = 2 ]' "$STUB/lane-calls"
check "  its lane's log as the part's log" bash -c 'grep -P "^part\tdocker-server-part-1" "$0/result.txt" | grep -q "e2e-stub"' "$NIGHT"
check "  in the orchestrator's format, a scheduled run that counts for no release" \
  bash -c 'grep -qx run_kind=scheduled "$0" && grep -qx step1=not-run "$0" && grep -qx kept= "$0" && grep -q "^pin=02af0216" "$0"' "$NIGHT/result.txt"
check "  status: green, exit 0" bash -c 'out=$(bash "$0" status); [ $? = 0 ] &&
  [[ "$out" == "NIGHT state=green switch=on night=2026-11-15-Sunday pair=1/16 sets=docker-server-part-1,docker-server-auth-authorization-server commit=02af0216 "* ]]' "$NIGHT_SCRIPT"
check "  label" same "2026-11-15 Sunday, pair 1/16: docker-server-part-1 PASS, docker-server-auth-authorization-server PASS" "$(night label)"
out=$(night follow); rc=$?
check "  follow: the console to its end, exit 0" bash -c '[ "$0" = 0 ] && grep -q "NIGHT END result=green" <<< "$1" && [[ "$(tail -1 <<< "$1")" == "FOLLOW next="*" state=green ended=yes" ]]' "$rc" "$out"
check "  its history line" has $'SUCCESS\tthe test\tscheduled e2e 2026-11-15 Sunday\t02af0216' "$RUN_RECORD_DIR/history.tsv"
check "  nothing written in a release or re-run record" bash -c '! ls "$0"/release-state "$0"/release-reruns.tsv >/dev/null 2>&1' "$LOG_DIR"
check "  the pid file gone" test ! -e "$LOG_DIR/scheduled-e2e.pid"
check "  the night ran its pair: the next night runs pair 2" same 2 "$(next_pair)"

echo 1 > "$STUB/lane-rc"; rm -f "$STUB/fixer-calls"
a_night 2026-11-16 ON_FAILURES=report-only
check "a red night, report-only: red, no fixer" bash -c 'grep -qx "result=red" "$0/result.txt" && [ ! -e "$1/fixer-calls" ]' "$NIGHT" "$STUB"
check "  its sets FAIL with why, on the VM" bash -c '[ "$(grep -cP "^part\twindows-vm-docker-(part-2|auth-authorization-server)\twindows-vm\tFAIL\t.*\trc=1$" "$0/result.txt")" = 2 ]' "$NIGHT"
check "  status: red, exit 1" bash -c 'bash "$0" status >/dev/null; [ $? = 1 ]' "$NIGHT_SCRIPT"
check "  label" same "2026-11-16 Monday, pair 2/16: windows-vm-docker-part-2 FAIL, windows-vm-docker-auth-authorization-server FAIL" "$(night label)"
check "  a red night ran its pair too: the next night runs pair 3" same 3 "$(next_pair)"

echo "---- red nights, fix-prove-then-wait-for-review (the default) ----"
echo RUNNING > "$STUB/fix-status"; rm -f "$STUB/lane-calls" "$STUB/fixer-calls"
a_night 2026-11-17; REVIEWED=$NIGHT
check "a red Windows server night: both sets ran, each whatever the other's verdict" same 2 "$(grep -c '^part' "$NIGHT/result.txt")"
check "  the auth file alone, through win-e2e.sh server-e2e, on the kept pack" \
  bash -c 'grep "^run bash asbl/ci/jenkins/win-e2e.sh server-e2e | E2E_MODE=production-packaged " "$0" | sed -n 2p | grep "auth-authorization-server" | grep -q "RELEASE_KEPT=$1 REBUILD_PACK=no"' \
  "$STUB/lane-calls" "$RELEASE_ARTIFACTS_DIR/16.6.1-f9624daf"
check "  the fixer started on the night's folder, round 1, for review" has "start $NIGHT 1 FIX_MODE=review DRY_RUN=no" "$STUB/fixer-calls"
out=$(night follow --for 5); rc=$?
check "  the night ended red at once (the pid file gone): nothing reaches main before a proceed" \
  bash -c '[ "$0" = 1 ] && grep -q "NIGHT END result=red: fix round 1 started for review: .*Nothing reaches main before a proceed" <<< "$1" &&
    [ ! -e "$2/scheduled-e2e.pid" ]' "$rc" "$out" "$LOG_DIR"
check "  label" same "2026-11-17 Tuesday, pair 3/16: windows-vm-server-part-3 FAIL, windows-vm-server-auth-authorization-server FAIL; fix round going" "$(night label)"
check "  status: the fix round's state" has " fix=fixing" "$(night status)"
check "  the night ran its pair: pair 4 next" same 4 "$(next_pair)"
a_night 2026-11-18
check "the next night runs while that fix is open; red, it only reports (no second fix round)" \
  bash -c 'grep -q "^state=red" "$0/night.state" && [ ! -f "$0/fix-round.state" ] && [ "$(grep -c "^start " "$1/fixer-calls")" = 1 ] &&
    grep -q "the fix of the night of 2026-11-17 Tuesday is still open" "$0/night.state"' "$NIGHT" "$STUB"
echo "a diff" > "$REVIEWED/fix.diff"; echo "# the fix" > "$REVIEWED/fix-report.md"; echo DONE > "$STUB/fix-status"
check "the fixer DONE with a diff: its fix waits for review" has "FIX_ROUND state=waiting kind=review" "$(night fix status "$REVIEWED")"
check "  label of that night (not the newest)" same "2026-11-17 Tuesday, pair 3/16: windows-vm-server-part-3 FAIL, windows-vm-server-auth-authorization-server FAIL; its fix waits for review" "$(night label "$REVIEWED")"
check "  reports of that night (not the newest): its fix's report and diff too" bash -c 'out=$(bash "$0" reports "$1")
  grep -qx "REPORT night $1/fix-report.md" <<< "$out" && grep -qx "REPORT night $1/fix.diff" <<< "$out" && grep -qx "REPORT night $1/result.txt" <<< "$out"' "$NIGHT_SCRIPT" "$REVIEWED"
check "  fix on a folder that is no night's: refused (exit 2)" bash -c 'bash "$0" fix status "$1" >/dev/null 2>&1; [ $? = 2 ]' "$NIGHT_SCRIPT" "$SCRATCH"
out=$(night fix abort "$REVIEWED" "the reviewer"); rc=$?
check "fix abort: aborted, the rotation as it was (pair 5 next)" bash -c '[ "$0" = 0 ] && grep -q "state=aborted" <<< "$1" && [ "$2" = 5 ]' "$rc" "$out" "$(next_pair)"
echo RUNNING > "$STUB/fix-status"
a_night 2026-11-19; REVIEWED=$NIGHT
check "with no fix open, a red night starts its own" bash -c 'grep -qx kind=review "$0/fix-round.state" && [ "$(grep -c "^start " "$1/fixer-calls")" = 2 ]' "$NIGHT" "$STUB"
out=$(DRY_RUN=yes SCHEDULED_FIX_ROUND="bash $STUB/fix-round" night fix proceed "$REVIEWED" "the reviewer")
check "a dry fix proceed: the rotation as it was (pair 6 next)" same 6 "$(next_pair)"
out=$(SCHEDULED_FIX_ROUND="bash $STUB/fix-round" night fix proceed "$REVIEWED" "the reviewer"); rc=$?
check "fix proceed: fix-round.sh proceed on that night; its pair (5) runs first the next night" \
  bash -c '[ "$0" = 0 ] && grep -qx "proceed $1 the reviewer" "$2" && grep -q "pair 5 runs first the next night" <<< "$3"' "$rc" "$REVIEWED" "$STUB/fix-round-calls" "$out"
check "  plan: pair 5 first, again, then the rotation's place (pair 6)" bash -c 'p=$(bash "$0" plan 2>&1)
  grep -qP "^NIGHT +1  pair 5/16, .*\(again: its fix is on main\)$" <<< "$p" && grep -qP "^NIGHT +2  pair 6/16, " <<< "$p"' "$NIGHT_SCRIPT"
echo 0 > "$STUB/lane-rc"
a_night 2026-11-20
check "  the next night runs pair 5 again (green), then the rotation goes on from pair 6" \
  bash -c 'grep -qx "pair=5" "$0/night.state" && grep -qx "result=green" "$0/result.txt" && [ "$1" = 6 ]' "$NIGHT" "$(next_pair)"

echo "---- a red night, fix-prove-then-rerun-automatically ----"
echo 1 > "$STUB/lane-rc"; echo RUNNING > "$STUB/fix-status"; rm -f "$STUB/lane-calls"; sleep 1
SCHEDULED_DATE=2026-11-21 ON_FAILURES=fix-prove-then-rerun-automatically night start >/dev/null
wait_for 30 bash -c 'grep -q "^state=fixing" "$0"/night.state' "$(newest_night)"; NIGHT=$(newest_night)
check "the fixer started on the night's folder, round 1, pushing" has "start $NIGHT 1 FIX_MODE=push DRY_RUN=no" "$STUB/fixer-calls"
check "  state fixing, the night's process waiting (the pid file alive)" bash -c 'grep -q "^state=fixing" "$0/night.state" && kill -0 "$(cat "$1/scheduled-e2e.pid")"' "$NIGHT" "$LOG_DIR"
out=$(night follow --for 5); rc=$?
check "  follow ends at the night's end line, red (exit 1), while the fix round goes" \
  bash -c '[ "$0" = 1 ] && grep -q "NIGHT END result=red: fix round 1 started: " <<< "$1" && [[ "$(tail -1 <<< "$1")" == *" state=fixing ended=yes" ]]' "$rc" "$out"
check "  label" same "2026-11-21 Saturday, pair 6/16: windows-vm-docker-part-3 FAIL, windows-vm-docker-auth-authorization-server FAIL; fix round going" "$(night label)"
check "  the next night skips while it goes" has "SKIPPED: the night of 2026-11-21 Saturday is still going (red; fix round fix-night going" "$(night start)"
check "  and the rotation moved on: pair 7" same 7 "$(next_pair)"
echo DONE > "$STUB/fix-status"
wait_for 30 night_ended
check "  the fix round DONE: the night red, the pid file gone, nothing run again" \
  bash -c 'grep -q "^state=red" "$0/night.state" && grep -q "^why=red; fix round 1: state=done" "$0/night.state" && [ "$(grep -c "" "$1/lane-calls")" = 2 ]' "$NIGHT" "$STUB"
check "  its pair (6) runs first the next night" same 6 "$(next_pair)"
check "  label" same "2026-11-21 Saturday, pair 6/16: windows-vm-docker-part-3 FAIL, windows-vm-docker-auth-authorization-server FAIL; fix round ended" "$(night label)"

echo "---- stop: what the night started ----"
echo 0 > "$STUB/lane-rc"; echo 600 > "$STUB/lane-sleep"; rm -f "$STUB/docker-calls" "$STUB/lane.pid"; rotation_at 1; sleep 1
SCHEDULED_DATE=2026-11-18 night start >/dev/null
wait_for 15 test -s "$STUB/lane.pid"   # the stub lane is going
NIGHT=$(newest_night)
check "  status while a set runs: running, exit 5" bash -c 'bash "$0" status >/dev/null; [ $? = 5 ]' "$NIGHT_SCRIPT"
check "  label while a set runs" same "2026-11-18 Wednesday, pair 1/16: docker-server-part-1 going, docker-server-auth-authorization-server not run" "$(night label)"
out=$(STOP_BY="a release press" night stop); rc=$?
check "stop while a set runs: exit 4, stopped, the pid file gone" \
  bash -c '[ "$0" = 4 ] && grep -q "^state=stopped" "$1/night.state" && [ ! -e "$2/scheduled-e2e.pid" ]' "$rc" "$NIGHT" "$LOG_DIR"
check "  the night's processes ended (the lane's too)" bash -c 'sleep 1; ! kill -0 "$(cat "$0")" 2>/dev/null' "$STUB/lane.pid"
check "  its set's containers looked for, from started.txt" has "docker inspect -f {{.Created}} dp-ci" "$STUB/docker-calls"
check "  who stopped it" has "STOPPED by a release press (it was running)" "$NIGHT/run.log"
check "  a stopped night leaves its pair next" same 1 "$(next_pair)"
check "a second stop: nothing to stop (exit 4)" bash -c 'out=$(bash "$0" stop); [ $? = 4 ] && [[ "$out" == "the night had ended already (stopped)"* ]]' "$NIGHT_SCRIPT"
rm -f "$STUB/lane.pid"; rotation_at 4; sleep 1
SCHEDULED_DATE=2026-11-18 night start >/dev/null
wait_for 15 test -s "$STUB/lane.pid"
out=$(night stop)
check "stop while the desktop part runs: the VM's steps of that lane stopped (its pack, its tests)" \
  bash -c 'grep -qx "dp-ci win stop release-pack" "$0" && grep -qx "dp-ci win stop desktop-e2e" "$0" && [ "$(grep -c "win stop" "$0")" = 2 ]' "$STUB/dp-ci-calls"
echo 0 > "$STUB/lane-sleep"; echo 1 > "$STUB/lane-rc"; echo RUNNING > "$STUB/fix-status"; rm -f "$STUB/fixer-calls"; sleep 1
SCHEDULED_DATE=2026-11-18 ON_FAILURES=fix-prove-then-rerun-automatically night start >/dev/null
wait_for 30 bash -c 'grep -q "^state=fixing" "$0"/night.state' "$(newest_night)"; NIGHT=$(newest_night)
out=$(night stop)
check "stop while a fix round goes: the fix run stopped too" bash -c 'grep -q "^stop fix-night" "$0/fixer-calls" && grep -q "^state=stopped" "$1/night.state"' "$STUB" "$NIGHT"

echo "---- reports ----"
json="$LOG_DIR/20261103T000000Z-e2e-x-playwright.json"; echo '{}' > "$json"; echo '<testsuites/>' > "${json%.json}.xml"
printf 'part\tdocker-server-part-1\thost\tFAIL\t%s\t%s %s\trc=1\n' "$LOG_DIR/x.log" "$json" "${json%.json}-html" >> "$NIGHT/result.txt"
out=$(night reports)
check "reports: the result, the summary, the flaky tests, the JSON and its JUnit XML, never the HTML" \
  bash -c 'grep -qx "REPORT night $1/result.txt" <<< "$0" && grep -qx "REPORT night $1/run.log" <<< "$0" && grep -qx "REPORT night $1/flaky.txt" <<< "$0" &&
           grep -qx "REPORT docker-server-part-1 $2" <<< "$0" && grep -qx "REPORT docker-server-part-1 ${2%.json}.xml" <<< "$0" && ! grep -q -- "-html" <<< "$0"' "$out" "$NIGHT" "$json"
check "help prints the header, exit 0" bash -c 'bash "$0" help | grep -q "^# THE NIGHTS"' "$NIGHT_SCRIPT"
check "no build was ever started" bash -c '! grep -q build-if-needed "$0" 2>/dev/null' "$STUB/dp-ci-calls"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-scheduled-e2e"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-scheduled-e2e"; exit 1

#!/bin/bash
# The release round (asbl/ci/jenkins/release-rehearsal.sh) with every command it calls replaced by a stub:
#   the orchestrator (each run's result read from a list: green or red, a run folder with its result.txt),
#   the fixer (FIX_STATUS read from a file), release-publish.sh (its preflights, a MISSING line when asked),
#   release-state.sh (released: the versions public on each channel), the scheduled job's stop, and docker (a dp-ci
#   container or none). The cases: green and ready to upload; green with one MISSING; busy in each way and a version
#   already public (refused, nothing started); the dev servers' dp-ci.sh --inside (not busy); red with report-only; red,
#   review, proceed, then green; red three times with fix-prove-then-rerun-automatically; a BLOCKED fix round; stop in
#   each state; status's one line in each state; help; what a start passes the orchestrator (a press does the same); what
#   the Jenkins job shows: label, review and reports; the machines file's check at a start (asbl/ci/release-machines.sh:
#   too many VMs, too little memory, refused; the Advanced values passed on); the form's estimates refreshed after each
#   real run (release-rehearsal.sh estimate, a stub here), never after a dry one, and a failing refresh stops nothing;
#   a fix round's smaller values for the run after fixes (THE FIXER): a smaller M taken, a larger one and an unknown
#   RELEASE_STEPS left out, RELEASE_STEPS=in-order with both values 1.
# Every folder is a scratch one: no live folder is touched, nothing real is started. Takes about 85 seconds.
# Callers: a person or an agent, from the shell, after changing the round.
#   bash asbl/ci/tests/test-release-rehearsal.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
ROUND_SCRIPT="$PWD/asbl/ci/jenkins/release-rehearsal.sh"
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-release-rehearsal.XXXXXX") || exit 2
SLEEPERS=()   # the stand-in processes this test starts, ended at its exit
cleanup() {
  bash "$ROUND_SCRIPT" stop >/dev/null 2>&1
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

# ---- the stubs: their inputs are files in $STUB, so the round's detached process reads the same ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin" "$STUB/runs" "$STUB/plans"
cat > "$STUB/bin/docker" <<'EOF'
#!/bin/bash
# stub docker: ps lists the dp-ci container while $STUB/dp-ci-container exists
[ "${1:-}" = ps ] && [ -e "$STUB/dp-ci-container" ] && echo dp-ci
exit 0
EOF
cat > "$STUB/orchestrator" <<'EOF'
#!/bin/bash
# stub orchestrator: run n's result is line n of $STUB/results; it records its inputs, then sleeps $STUB/orchestrator-sleep
n=$(( $(cat "$STUB/run-count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB/run-count"
echo $$ > "$STUB/orchestrator.pid"
approval=none; [ -n "${E2E_APPROVAL:-}" ] && approval="given:${E2E_APPROVAL_USER:-}"
echo "run=$n EXECUTION=${EXECUTION:-} RELEASE_VERSION=${RELEASE_VERSION:-} RELEASE_PIN=${RELEASE_PIN:-} MODE=${MODE:-} UPLOAD=${UPLOAD:-} DRY_RUN=${DRY_RUN:-} DRY_RUN_RED=${DRY_RUN_RED:-} approval=$approval started_by=${ORCH_STARTED_BY:-}" >> "$STUB/orchestrator-calls"
tr '\0' ' ' < /proc/$$/cmdline >> "$STUB/orchestrator-cmdlines"; echo >> "$STUB/orchestrator-cmdlines"
echo "N=${SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS:-} M=${USE_N_NUMBER_OF_WINDOWS_VMS:-}" >> "$STUB/advanced-calls"
echo "RELEASE_STEPS=${RELEASE_STEPS:-}" >> "$STUB/steps-calls"
folder="$STUB/runs/run-$n"; mkdir -p "$folder"
echo "PARTS   one log per part in $folder"
sleep "$(cat "$STUB/orchestrator-sleep" 2>/dev/null || echo 0)"
result=$(sed -n "${n}p" "$STUB/results"); result=${result:-red}
printf 'result=%s\ndry_run=%s\nexecution=%s\nversion=16.6.2\npin=%s\nflaky=%s\n' "$result" "${DRY_RUN:-}" "${EXECUTION:-}" \
  "c0ffee000000000000000000000000000000000$n" "$folder/flaky.txt" > "$folder/result.txt"
[ "$result" = green ] && printf 'linux-proof\tSMS > sends one\tspecs/sms.spec.ts:12\t%s/report.json\n' "$folder" > "$folder/flaky.txt"
echo "SUMMARY (stub) $result"
[ "$result" = green ]
EOF
cat > "$STUB/fixer" <<'EOF'
#!/bin/bash
# stub fixer: start prints its run and plan (and copies $STUB/smaller-values into the red run's folder, as a fix round
# that chose smaller values writes it); status prints $STUB/fix-status; each call is recorded
echo "$* DRY_RUN=${DRY_RUN:-}" >> "$STUB/fixer-calls"
case "$1" in
  start)  echo "FIX_RUN=fix-$3"; echo "FIX_PLAN=$STUB/plans/release-16.6.2-fix-round-$3.md"
          [ ! -f "$STUB/smaller-values" ] || cp "$STUB/smaller-values" "$2/smaller-values" ;;
  status) echo "FIX_STATUS=$(cat "$STUB/fix-status" 2>/dev/null || echo DONE) > **KRAFT-KEEP-WORKING STATUS** (stub)" ;;
  stop)   echo "stopped $2" ;;
esac
EOF
cat > "$STUB/release-publish" <<'EOF'
#!/bin/bash
# stub release-publish.sh: preflight prints OK lines, and the line of $STUB/missing for an UPLOAD=yes one when it exists
echo "UPLOAD=${UPLOAD:-} DRY_RUN=${DRY_RUN:-} $*" >> "$STUB/publish-calls"
echo "OK the Docker engine"
if [ "${UPLOAD:-}" = yes ] && [ -s "$STUB/missing" ] && [ "$2" = "$(cut -d' ' -f1 "$STUB/missing")" ]; then
  echo "MISSING $(cut -d' ' -f2- "$STUB/missing")"; echo "PREREQUISITES MISSING (1): provide it"; exit 1
fi
echo "PREREQUISITES OK"
EOF
cat > "$STUB/release-state" <<'EOF'
#!/bin/bash
# stub release-state.sh released: the versions in $STUB/released (docker windows)
read -r d w < "$STUB/released"
echo "RELEASED current=$w docker=$d windows=$w"
EOF
cat > "$STUB/scheduled-e2e" <<'EOF'
#!/bin/bash
# stub scheduled-e2e.sh stop: records the call and ends the scheduled run's stand-in process
echo "$*" >> "$STUB/scheduled-calls"
kill "$(cat "$LOG_DIR/scheduled-e2e.pid")" 2>/dev/null
EOF
cat > "$STUB/estimate" <<'EOF'
#!/bin/bash
# stub release-rehearsal.sh estimate: records the call; fails when $STUB/estimate-fails exists
echo "estimate $*" >> "$STUB/estimate-calls"
[ ! -e "$STUB/estimate-fails" ] || { echo "FAIL  the estimates could not be computed: the stub says so"; exit 1; }
echo "ESTIMATES the 16 choices written to $STUB/release-estimates.json (the job's form reads it)"
EOF
cat > "$STUB/bin/git" <<'EOF'
#!/bin/bash
# stub git: fetch does nothing (review fetches origin main: no network in a test); the rest is the real git
[ "${1:-}" = fetch ] && exit 0
exec /usr/bin/git "$@"
EOF
chmod +x "$STUB/bin/docker" "$STUB/bin/git"
export PATH="$STUB/bin:$PATH"
export LOG_DIR="$SCRATCH/logs"; mkdir -p "$LOG_DIR"
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf"
export ROUND_ORCHESTRATOR="bash $STUB/orchestrator" ROUND_RELEASE_STATE="bash $STUB/release-state"
export ROUND_RELEASE_PUBLISH="bash $STUB/release-publish" ROUND_SCHEDULED_E2E="bash $STUB/scheduled-e2e" ROUND_POLL=1
export ROUND_ESTIMATE="bash $STUB/estimate"   # never the real one: it would write the Jenkins home's estimates file
unset RELEASE_VERSION RELEASE_PIN ON_FAILURES DRY_RUN E2E_APPROVAL E2E_APPROVAL_USER
unset SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS RELEASE_STEPS RELEASE_WINDOWS_VMS
# the machines check of a start (asbl/ci/release-machines.sh) on stand-ins: VM a's settings file, the host's memory
# (64 GB available) and virsh (every VM running); /var's free disk is this host's
export WIN_CI_CONF="$STUB/win-ci.env" RELEASE_MEMINFO="$STUB/meminfo"; : > "$WIN_CI_CONF"
available_memory_gb() { printf 'MemAvailable:   %s kB\n' $(($1 * 1048576)) > "$RELEASE_MEMINFO"; }
available_memory_gb 64
printf '#!/bin/bash\n# stub virsh: every VM is running\necho running\n' > "$STUB/bin/virsh"; chmod +x "$STUB/bin/virsh"

settings() {  # settings <fixer|none> [<DRY_RUN_RED>]: the settings file, root-only
  { [ "$1" = none ] || echo "RELEASE_FIXER=\"bash $STUB/fixer\""; echo "DRY_RUN_RED=\"${2:-}\""; } > "$RELEASE_REHEARSAL_CONF"
  chmod 600 "$RELEASE_REHEARSAL_CONF"
}
fresh() {  # fresh <results...>: no round, no call recorded, 16.6.1 public, the fixer set, each run's result in order
  bash "$ROUND_SCRIPT" stop >/dev/null 2>&1
  rm -rf "$LOG_DIR"/* "$STUB"/runs/* "$STUB"/*-calls "$STUB"/orchestrator-cmdlines "$STUB"/run-count "$STUB"/missing \
    "$STUB"/fix-status "$STUB"/orchestrator-sleep "$STUB"/dp-ci-container "$STUB"/estimate-fails "$STUB"/smaller-values
  echo "16.6.1 16.6.1" > "$STUB/released"
  printf '%s\n' "$@" > "$STUB/results"
  settings fixer
}
round() { bash "$ROUND_SCRIPT" "$@"; }   # the round's command, as a person runs it
start() { ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 round start "$@"; }
follow() { timeout 60 bash "$ROUND_SCRIPT" follow; }   # to the end of what is going: its exit code is the state's
wait_for_state() {  # wait_for_state <state>: up to 30 s
  # the line is read first: in a pipe with grep, pipefail would give status's own exit code (5 while running)
  for _ in $(seq 1 60); do [[ "$(round status)" == "ROUND state=$1 "* ]] && return 0; sleep 0.5; done
  echo "      still: $(round status)"; return 1
}
rounds_made() { ls -1d "$LOG_DIR"/release-rounds/*/ 2>/dev/null | wc -l; }
sleeper() {  # sleeper [<name>]: a process that lives a minute (its pid in $SLEEPER); with a name, ps shows that name.
  # Not this shell's child (started from a subshell that ends): once killed it is gone, never a zombie that kill -0 still sees
  SLEEPER=$( (exec -a "${1:-sleep}" sleep 60) > /dev/null 2>&1 & echo $! ); SLEEPERS+=("$SLEEPER")
}
wait_for_run() {  # wait_for_run <n>: until the orchestrator stub has started run n (up to 30 s)
  for _ in $(seq 1 60); do [ "$(cat "$STUB/run-count" 2>/dev/null)" = "$1" ] && return 0; sleep 0.5; done; return 1
}
one_status_line() {  # one_status_line <state> <run>: status prints one line with every field, its exit code that state's
  local out rc expected_rc
  out=$(round status); rc=$?
  case "$1" in green|released) expected_rc=0 ;; red) expected_rc=1 ;; waiting-for-review) expected_rc=3 ;;
    stopped) expected_rc=4 ;; running|fixing) expected_rc=5 ;; green-not-ready) expected_rc=6 ;; *) expected_rc=2 ;; esac
  [ "$(printf '%s\n' "$out" | wc -l)" = 1 ] &&
    printf '%s\n' "$out" | grep -qE "^ROUND state=$1 version=16\.6\.2 run=$2 pin=[0-9a-f]* result=[^ ]*$" &&
    [ "$rc" = "$expected_rc" ] && return 0
  printf '      status (exit %s, expected %s): %s\n' "$rc" "$expected_rc" "$out"; return 1
}

# ---- help, and no round yet ----
out=$(round help); rc=$?
check "help prints the header (subcommands, parameters, states, exit codes, examples), exit 0" \
  bash -c '[ "$1" = 0 ] && for w in SUBCOMMANDS "THE PARAMETERS" "THE STATES" EXAMPLES "Rarely: leave them as they are" "Advanced (Parallelization)" "estimate <N> <M>"; do grep -qF "$w" <<< "$2" || exit 1; done' _ "$rc" "$out"
fresh
out=$(round status); rc=$?
check "status with no round yet: state=none, exit 2" same "ROUND state=none version= run=0 pin= result= exit=2" "$out exit=$rc"

# ---- green, the preflights passing ----
fresh green; echo 3 > "$STUB/orchestrator-sleep"
out=$(start); rc=$?
check "start: exit 5, the round started detached" bash -c '[ "$1" = 5 ] && grep -q "^STARTED the release round" <<< "$2"' _ "$rc" "$out"
wait_for_run 1
check "status while it runs: one line, state=running" one_status_line running 1
follow > "$SCRATCH/follow.out"; rc=$?
check "green: follow ends with exit 0 and READY TO UPLOAD" bash -c '[ "$1" = 0 ] && grep -q "READY TO UPLOAD 16.6.2" "$2"' _ "$rc" "$SCRATCH/follow.out"
check "green: follow's last line says where to go on from" bash -c 'tail -1 "$1" | grep -qE "^FOLLOW next=[0-9]+ state=green$"' _ "$SCRATCH/follow.out"
check "green: status one line, state=green" one_status_line green 1
check "green: the flaky test of the run is named for after the upload" has "SMS > sends one" "$SCRATCH/follow.out"
check "a shell start passes the orchestrator what a press does (execution 1, the version, rehearsal, no upload, no approval)" \
  same "run=1 EXECUTION=1 RELEASE_VERSION=16.6.2 RELEASE_PIN= MODE=rehearsal UPLOAD=no DRY_RUN=no DRY_RUN_RED= approval=none" \
  "$(sed 's/ started_by=.*//' "$STUB/orchestrator-calls")"
check "the orchestrator learns who started the round" has "started by tester" "$STUB/orchestrator-calls"
check "green: the form's estimates refreshed once, after the run" \
  bash -c '[ "$(cat "$1")" = "estimate " ] && grep -q "ESTIMATES refreshed from run 1.s marks: ESTIMATES the 16 choices written" "$2"' _ "$STUB/estimate-calls" "$SCRATCH/follow.out"
check "preflights: UPLOAD=no docker at the start; UPLOAD=yes docker public and files public when green" \
  same "UPLOAD=no DRY_RUN=no preflight docker|UPLOAD=yes DRY_RUN=no preflight docker public|UPLOAD=yes DRY_RUN=no preflight files public" \
  "$(paste -sd'|' "$STUB/publish-calls")"
out=$(round busy); rc=$?
check "a green round waiting for its upload keeps the CI busy (exit 2)" bash -c '[ "$1" = 2 ] && grep -q "^BUSY a green round waits for its upload" <<< "$2"' _ "$rc" "$out"
echo "16.6.2 16.6.2" > "$STUB/released"
check "once both channels show 16.6.2: state=released, exit 0" one_status_line released 1
check "released: the CI is free" same FREE "$(round busy)"

# ---- green, one MISSING ----
fresh green
echo "files RCLONE_CONFIG: the remote of the bucket" > "$STUB/missing"
start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "green with one MISSING: not ready to upload, the missing name said, exit 6" \
  bash -c '[ "$1" = 6 ] && grep -q "GREEN, NOT READY TO UPLOAD: RCLONE_CONFIG: the remote of the bucket" "$2"' _ "$rc" "$SCRATCH/follow.out"
check "green, not ready: status one line" one_status_line green-not-ready 1

# ---- a refresh of the estimates that fails stops nothing ----
fresh green; : > "$STUB/estimate-fails"
start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "the estimates' refresh fails: the round goes on to green, saying so" \
  bash -c '[ "$1" = 0 ] && grep -q "ESTIMATES not refreshed (the round goes on): FAIL  the estimates could not be computed" "$2" && grep -q "READY TO UPLOAD 16.6.2" "$2"' _ "$rc" "$SCRATCH/follow.out"

# ---- busy, and a version already public: refused, nothing started ----
refused_nothing_started() {  # refused_nothing_started <why expected> <output> <exit code>
  [ "$3" = 2 ] && has "REFUSED: $1" "$2" && [ "$(rounds_made)" = 0 ] && [ ! -e "$STUB/orchestrator-calls" ]
}
fresh green; touch "$STUB/dp-ci-container"
out=$(start); rc=$?
check "busy, a dp-ci container: exit 2, nothing started" refused_nothing_started "the CI is busy: a dp-ci run is going" "$out" "$rc"
fresh green; sleeper; echo "$SLEEPER" > "$LOG_DIR/win-e2e.pid"
out=$(start); rc=$?
check "busy, a live win-e2e.pid: exit 2, nothing started" refused_nothing_started "the CI is busy: a Windows run is going" "$out" "$rc"
kill "$SLEEPER"
fresh green; flock -o "$LOG_DIR/release-orchestrator.lock" sleep 60 & SLEEPERS+=("$!"); sleep 0.5
out=$(start); rc=$?
check "busy, the orchestrator's lock held: exit 2, nothing started" refused_nothing_started "the CI is busy: a release orchestrator run is going" "$out" "$rc"
kill "${SLEEPERS[-1]}"; sleep 0.5   # flock -o: the lock was flock's own, not its sleep's
fresh green; echo "16.6.2 16.6.2" > "$STUB/released"
out=$(start); rc=$?
check "16.6.2 public on both channels already: exit 2, nothing started" refused_nothing_started "16.6.2 is public on both channels already" "$out" "$rc"
fresh green; sleeper "bash asbl/ci/dp-ci.sh --inside"
out=$(round busy); rc=$?
check "the dev servers' dp-ci.sh --inside alone: not busy" same "FREE exit=0" "$out exit=$rc"
kill "$SLEEPER"
fresh green green; echo 30 > "$STUB/orchestrator-sleep"
start > /dev/null; wait_for_state running >/dev/null
out=$(start); rc=$?
check "a round going: a second start is refused, exit 2, its one run only" \
  bash -c '[ "$1" = 2 ] && grep -q "REFUSED: the CI is busy: a release round is going" <<< "$2" && [ "$(wc -l < "$3")" = 1 ]' _ "$rc" "$out" "$STUB/orchestrator-calls"
fresh green
chmod 644 "$RELEASE_REHEARSAL_CONF"
out=$(start); rc=$?
check "a settings file others can read: refused, exit 2, nothing started" refused_nothing_started "MISSING a settings file only its owner reads" "$out" "$rc"

# ---- the machines file's check: refused before anything is stopped or started; the values passed on ----
fresh green
out=$(export USE_N_NUMBER_OF_WINDOWS_VMS=2; start); rc=$?
check "2 VMs asked, only VM a in the machines file: refused, exit 2, nothing started" \
  refused_nothing_started "the machines file does not allow N=1 M=2" "$out" "$rc"
check "2 VMs asked: the broken rule said, with its numbers" has "USE_N_NUMBER_OF_WINDOWS_VMS=2, but RELEASE_WINDOWS_VMS has 1 VM(s) (a)" "$out"
fresh green
out=$(export SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=2 RELEASE_RUNNERS=no; start); rc=$?
check "N=2 with RELEASE_RUNNERS=no: refused, exit 2, nothing started (the full set whole on one Docker engine)" \
  refused_nothing_started "the machines file does not allow N=2 M=1" "$out" "$rc"
check "N=2 with RELEASE_RUNNERS=no: the reason said" has "this host's one Docker engine, which runs one DataPallas e2e set at a time" "$out"
fresh green; available_memory_gb 20
out=$(start); rc=$?
check "20 GB available: refused, exit 2, nothing started" refused_nothing_started "the host cannot hold N=1 M=1 now" "$out" "$rc"
check "20 GB available: the memory rule's numbers said" \
  has "needs 10 GB (2 host test servers x 5 GB (runner 1 and this host's engine)), 20 GB are available now: 10 GB would stay free, under RELEASE_MIN_FREE_GB=16" "$out"
fresh green
out=$(export DRY_RUN=yes; start); rc=$?; follow > /dev/null
check "20 GB available in a dry round: started (a dry round starts no server)" same 5 "$rc"
check "a dry round refreshes no estimate (a dry run leaves no marks)" bash -c '[ ! -e "$1" ]' _ "$STUB/estimate-calls"
available_memory_gb 64
fresh green; : > "$STUB/win-ci-b.env"
out=$(export USE_N_NUMBER_OF_WINDOWS_VMS=2 RELEASE_WINDOWS_VMS="a b" WIN_VM_CONF_DIR="$STUB"; start); rc=$?; follow > /dev/null
check "M=2 with VMs a and b, 64 GB available: started, the check's line printed" has "MACHINES OK steps=together jobs=1 vms=2 (a b), memory: needs 10 GB of 64 GB available" "$out"
check "M=2: the orchestrator gets the Advanced values" same "N=1 M=2" "$(cat "$STUB/advanced-calls")"
check "M=2: the round's state keeps them" bash -c 'grep -qx "jobs=1" "$@" && grep -qx "vms=2" "$@"' _ "$LOG_DIR"/release-rounds/*/round.state

# ---- a scheduled run is stopped first ----
fresh green; sleeper; echo "$SLEEPER" > "$LOG_DIR/scheduled-e2e.pid"
out=$(start); rc=$?
check "a scheduled run going: start stops it first, then starts (exit 5)" \
  bash -c '[ "$1" = 5 ] && grep -qx stop "$2" && ! kill -0 "$3" 2>/dev/null' _ "$rc" "$STUB/scheduled-calls" "$SLEEPER"
follow > /dev/null

# ---- red, report-only; red with no fixer ----
fresh red
ON_FAILURES=report-only start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "red, report-only: exit 1, the failures' result.txt named, no fixer called" \
  bash -c '[ "$1" = 1 ] && grep -q "RED: red, ON_FAILURES=report-only. The failures: .*/run-1/result.txt" "$2" && [ ! -e "$3" ]' _ "$rc" "$SCRATCH/follow.out" "$STUB/fixer-calls"
check "red: status one line" one_status_line red 1
fresh red; settings none
start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "red, no fixer set: fix-* acts as report-only and says so (exit 1)" \
  bash -c '[ "$1" = 1 ] && grep -q "but no fixer is set" "$2"' _ "$rc" "$SCRATCH/follow.out"

# ---- red, review, proceed, then green ----
fresh red green; echo RUNNING > "$STUB/fix-status"
start > /dev/null; wait_for_state fixing >/dev/null
check "fixing: status one line" one_status_line fixing 1
check "the fixer starts on run 1's folder, fix round 1" has "start $STUB/runs/run-1 1 DRY_RUN=no" "$STUB/fixer-calls"
out=$(round busy); rc=$?
check "a fix round going: busy" bash -c '[ "$1" = 2 ] && grep -q "^BUSY a release round is going" <<< "$2"' _ "$rc" "$out"
echo DONE > "$STUB/fix-status"
follow > "$SCRATCH/follow.out"; rc=$?
check "red, fix round DONE: waiting for review (exit 3), the fix plan named" \
  bash -c '[ "$1" = 3 ] && grep -q "the fix plan: .*release-16.6.2-fix-round-1.md" "$2"' _ "$rc" "$SCRATCH/follow.out"
check "waiting for review: status one line" one_status_line waiting-for-review 1
out=$(PROCEED_BY=tester round proceed); rc=$?
check "proceed: the round runs again from the start" has "PROCEEDED" "$out"
follow > "$SCRATCH/follow.out"; rc=$?
check "after proceed: run 2 is green (exit 0)" bash -c '[ "$1" = 0 ] && grep -q "RUN 2 END: green" "$2"' _ "$rc" "$LOG_DIR/release-rounds/"*/round.log
check "run 2 is EXECUTION=2 on origin/main: no version, no pin" \
  same "run=2 EXECUTION=2 RELEASE_VERSION= RELEASE_PIN= MODE=rehearsal UPLOAD=no DRY_RUN=no DRY_RUN_RED= approval=none" \
  "$(sed -n 2p "$STUB/orchestrator-calls" | sed 's/ started_by=.*//')"
check "green after a fix: status one line, run=2" one_status_line green 2

# ---- red three times, fix-prove-then-rerun-automatically ----
fresh red red red red
ON_FAILURES=fix-prove-then-rerun-automatically start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "red 3 times, rerun automatically: two re-runs, then it waits (exit 3)" \
  bash -c '[ "$1" = 3 ] && [ "$(wc -l < "$2")" = 3 ] && [ "$(grep -c "^start " "$3")" = 3 ] && grep -q "after 2 automatic re-runs" "$4"' \
  _ "$rc" "$STUB/orchestrator-calls" "$STUB/fixer-calls" "$SCRATCH/follow.out"
check "waiting after 3 runs: status one line, run=3" one_status_line waiting-for-review 3
check "no smaller-values file: no SMALLER VALUES line, the runs keep the round's values" \
  bash -c '! grep -q "SMALLER VALUES" "$1" && [ "$(sort -u "$2")" = "N=1 M=1" ]' _ "$SCRATCH/follow.out" "$STUB/advanced-calls"

# ---- a BLOCKED fix round waits ----
fresh red green; echo BLOCKED > "$STUB/fix-status"
ON_FAILURES=fix-prove-then-rerun-automatically start > /dev/null; follow > "$SCRATCH/follow.out"; rc=$?
check "a BLOCKED fix round: waiting for review even with rerun automatically (exit 3), one run only" \
  bash -c '[ "$1" = 3 ] && [ "$(wc -l < "$2")" = 1 ] && grep -q "FIX ROUND 1 END: BLOCKED" "$3"' _ "$rc" "$STUB/orchestrator-calls" "$SCRATCH/follow.out"

# ---- a fix round's smaller values for its run after fixes (THE FIXER): only smaller ones are taken ----
two_vms_round() {  # two_vms_round: a round with M=2 (VMs a and b) that reruns by itself after a DONE fix round, to its end
  : > "$STUB/win-ci-b.env"
  (export ON_FAILURES=fix-prove-then-rerun-automatically USE_N_NUMBER_OF_WINDOWS_VMS=2 RELEASE_WINDOWS_VMS="a b" WIN_VM_CONF_DIR="$STUB"
   start > /dev/null)
  follow > "$SCRATCH/follow.out"
}
fresh red green; printf 'USE_N_NUMBER_OF_WINDOWS_VMS=1\nWHY=the VM lanes ran out of memory at 12 GB\n' > "$STUB/smaller-values"
two_vms_round; rc=$?
check "smaller values: the run after fixes gets M=1, the round started with M=2 (then green, exit 0)" \
  bash -c '[ "$1" = 0 ] && [ "$(paste -sd" " "$2")" = "N=1 M=2 N=1 M=1" ]' _ "$rc" "$STUB/advanced-calls"
check "smaller values: round.log says what was taken and why, round.state keeps it" \
  bash -c 'grep -q "SMALLER VALUES for run 2: N=1 M=1, from .*/run-1/smaller-values (why: the VM lanes ran out of memory at 12 GB)" "$1" &&
    [ "$(grep "^vms=" "$2" | tail -1)" = vms=1 ]' _ "$SCRATCH/follow.out" "$LOG_DIR"/release-rounds/*/round.state
fresh red green; printf 'USE_N_NUMBER_OF_WINDOWS_VMS=3\nRELEASE_STEPS=backwards\n' > "$STUB/smaller-values"
two_vms_round; rc=$?
check "smaller values: a larger M and an unknown RELEASE_STEPS are said and left out; the run after fixes keeps M=2" \
  bash -c '[ "$1" = 0 ] && [ "$(paste -sd" " "$2")" = "N=1 M=2 N=1 M=2" ] && [ "$(sort -u "$3")" = "RELEASE_STEPS=" ] &&
    grep -q "SMALLER VALUES: USE_N_NUMBER_OF_WINDOWS_VMS=3 left out (1 to the round.s 2)" "$4" &&
    grep -q "SMALLER VALUES: RELEASE_STEPS=backwards left out" "$4"' _ "$rc" "$STUB/advanced-calls" "$STUB/steps-calls" "$SCRATCH/follow.out"
fresh red green; printf 'RELEASE_STEPS=in-order\nWHY=the steps together cannot be fixed in this round\n' > "$STUB/smaller-values"
two_vms_round; rc=$?
check "smaller values: RELEASE_STEPS=in-order gives the run after fixes 16.6.2's order with both values 1" \
  bash -c '[ "$1" = 0 ] && [ "$(paste -sd" " "$2")" = "N=1 M=2 N=1 M=1" ] && [ "$(paste -sd" " "$3")" = "RELEASE_STEPS= RELEASE_STEPS=in-order" ] &&
    grep -q "SMALLER VALUES for run 2: RELEASE_STEPS=in-order N=1 M=1" "$4"' _ "$rc" "$STUB/advanced-calls" "$STUB/steps-calls" "$SCRATCH/follow.out"

# ---- stop in each state ----
stopped_with_exit_4() {  # stopped_with_exit_4 <output> <exit code>: exit 4, state stopped, the round's process gone, CI free
  [ "$2" = 4 ] && has "ROUND state=stopped" "$1" && [ "$(round busy)" = FREE ]
}
fresh green; echo 30 > "$STUB/orchestrator-sleep"
start > /dev/null; wait_for_state running >/dev/null; sleep 1
out=$(round stop); rc=$?
check "stop while running: exit 4, stopped, its run's process ended" \
  bash -c 'kill -0 "$(cat "$1")" 2>/dev/null && exit 1; exit 0' _ "$STUB/orchestrator.pid"
check "stop while running: state stopped, CI free" stopped_with_exit_4 "$out" "$rc"
check "stopped: status one line" one_status_line stopped 1
fresh red; echo RUNNING > "$STUB/fix-status"
start > /dev/null; wait_for_state fixing >/dev/null
out=$(round stop); rc=$?
check "stop while fixing: exit 4, stopped, the fixer's stop called for fix-1" \
  bash -c 'grep -q "^stop fix-1 " "$1"' _ "$STUB/fixer-calls"
check "stop while fixing: state stopped, CI free" stopped_with_exit_4 "$out" "$rc"
fresh red; echo DONE > "$STUB/fix-status"
start > /dev/null; follow > /dev/null
out=$(round stop); rc=$?
check "stop while waiting for review: exit 4, stopped, CI free" stopped_with_exit_4 "$out" "$rc"
fresh green
start > /dev/null; follow > /dev/null
out=$(round stop); rc=$?
check "stop a green round (giving up its upload): exit 4, stopped, CI free" stopped_with_exit_4 "$out" "$rc"
fresh red
ON_FAILURES=report-only start > /dev/null; follow > /dev/null
out=$(round stop); rc=$?
check "stop a red round: exit 4, nothing to stop" bash -c '[ "$1" = 4 ] && grep -q "had ended already (red)" <<< "$2"' _ "$rc" "$out"
fresh
out=$(round stop); rc=$?
check "stop with no round: exit 4" same 4 "$rc"
fresh red; echo DONE > "$STUB/fix-status"
start > /dev/null; follow > /dev/null
kill -KILL -- "-$(sed -n 's/^driver_pid=//p' "$LOG_DIR"/release-rounds/*/round.state | tail -1)"; sleep 0.5
check "the round's process gone (a reboot): status one line, stopped (exit 4)" one_status_line stopped 1
check "the round's process gone (a reboot): the CI is free" same FREE "$(round busy)"

# ---- a dry round; the owner's approval ----
fresh red; settings fixer "build pack"
ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 DRY_RUN=yes ON_FAILURES=report-only round start > /dev/null; follow > /dev/null
check "a dry round passes DRY_RUN=yes and the settings' DRY_RUN_RED to the orchestrator" has "DRY_RUN=yes DRY_RUN_RED=build pack " "$STUB/orchestrator-calls"
fresh green; settings fixer "build pack"
start > /dev/null; follow > /dev/null
check "a real round never passes DRY_RUN_RED" has "DRY_RUN=no DRY_RUN_RED= " "$STUB/orchestrator-calls"
fresh green
ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 DRY_RUN=yes round start > /dev/null; follow > /dev/null
check "a dry round's green holds nothing: the CI is free" same FREE "$(round busy)"
fresh green
E2E_APPROVAL="the owner approves going on: secret-text-xyz" E2E_APPROVAL_USER=the-approver start > /dev/null; follow > /dev/null
check "E2E_APPROVAL reaches the orchestrator, with who gave it" has "approval=given:the-approver " "$STUB/orchestrator-calls"
check "E2E_APPROVAL is in no file of the round, and on no command line" \
  bash -c '! grep -rq secret-text-xyz "$1" "$2"' _ "$LOG_DIR" "$STUB/orchestrator-cmdlines"
check "the round's state says only that an approval was given" bash -c 'grep -qx "approval=given" "$1"/release-rounds/*/round.state' _ "$LOG_DIR"

# ---- what the job shows: label, review, reports ----
fresh red green
check "label: no round yet" same "no round yet" "$(round label)"
out=$(round review); rc=$?
check "review with no round waiting: NOT WAITING FOR REVIEW, the state's exit code" \
  bash -c '[ "$1" = 2 ] && grep -q "^NOT WAITING FOR REVIEW" <<< "$2"' _ "$rc" "$out"
echo 3 > "$STUB/orchestrator-sleep"
start > /dev/null; wait_for_run 1
check "label: a run going" same "16.6.2 run 1 going" "$(round label)"
rm -f "$STUB/orchestrator-sleep"; follow > /dev/null
check "label: waiting for review" same "16.6.2 waiting for review after run 1" "$(round label)"
out=$(round review); rc=$?
check "review: exit 3; why, the fix plan with its report, the red run, the commits" \
  bash -c '[ "$1" = 3 ] && grep -q "^WAITING FOR REVIEW: fix round 1 DONE" <<< "$2" &&
    grep -q "^  the fix plan: .*/release-16.6.2-fix-round-1.md$" <<< "$2" &&
    grep -q "^  its report: .*/release-16.6.2-fix-round-1-run-report.md$" <<< "$2" &&
    grep -q "^  the red run: .*/run-1/result.txt$" <<< "$2" && grep -q "^  the commits since the run.s pin c0ffee00:" <<< "$2"' _ "$rc" "$out"
R1="$STUB/runs/run-1"
mkdir -p "$R1/pw-playwright-html" "$R1/robot"; touch "$R1/run.log" "$R1/failure-report-docker.md" "$R1/pw-playwright.json" \
  "$R1/pw-playwright.xml" "$R1/robot/report.html" "$R1/robot/output.xml" "$R1/not-a-report"
printf 'summary=%s\nfailure_report=%s\n' "$R1/run.log" "$R1/failure-report-docker.md" >> "$R1/result.txt"
printf 'part\t%s\t%s\t%s\t%s\t%s\t%s\n' linux-proof host FAIL "$R1/l.log" "$R1/pw-playwright.json $R1/pw-playwright-html $R1/gone.json" rc=1 \
  robot windows-vm FAIL "$R1/w.log" "$R1/robot/report.html" rc=1 pack windows-vm FAIL "$R1/w.log" "" "$R1/not-a-report" >> "$R1/result.txt"
check "reports: run 1's files, each once, as its result.txt lists them (a Robot report: its folder; a why is no report)" \
  same "$(printf 'REPORT 1 %s\n' "run $R1/result.txt" "run $R1/run.log" "run $R1/failure-report-docker.md" \
    "linux-proof $R1/pw-playwright.xml" "linux-proof $R1/pw-playwright.json" "linux-proof $R1/pw-playwright-html" "robot $R1/robot")" \
  "$(round reports)"
PROCEED_BY=tester round proceed > /dev/null; follow > /dev/null
check "label: green after two runs" same "16.6.2 green, 2 runs, ready to upload" "$(round label)"
check "reports: both runs, run 2 with its flaky tests" \
  bash -c 'grep -c "^REPORT 1 " <<< "$1" | grep -qx 7 && grep -qx "REPORT 2 run $2/run-2/result.txt" <<< "$1" &&
    grep -qx "REPORT 2 run $2/run-2/flaky.txt" <<< "$1"' _ "$(round reports)" "$STUB/runs"
fresh red
ON_FAILURES=report-only DRY_RUN=yes ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 round start > /dev/null; follow > /dev/null
check "label: red, a dry run said so" same "16.6.2 red after run 1 (dry run)" "$(round label)"

echo
if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-release-rehearsal"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-release-rehearsal"; exit 1

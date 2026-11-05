#!/bin/bash
# Step 1's full set in runners inside a release round (release 16.6.3): asbl/ci/jenkins/release-orchestrator.sh with
# RELEASE_STEPS=together and RELEASE_RUNNERS=yes (the machines file's defaults), release-step1.sh E2E_RUNNERS,
# release-state.sh record-step1's log (RELEASE_STEP1_LOG) and release-rerun.sh lane on a merged report. The cases:
#   1. orchestrator dry runs for N = 1 to 4: green; the RUNNERS block names each runner with its list
#      (full-set-runners.py files) and its expected time (the real runs' file times, read only); 1 runner holds the whole
#      full set; one dp-ci-runner-<n> line per runner in started.txt; lane 1 gets E2E_RUNNERS=N and the round's rotation
#      date; this host runs the build, then the auth file, then the Linux proof (the ORDER lines, the parts' order, their
#      DOCKER_RELEASE_PART); lane 1 starts before the Linux proof ends;
#   2. the runners start at the build's end mark (the orchestrator's track_runners, run alone on scratch logs), and this
#      host's next lane waits for each runner's checkout and caches, a runner that did not start, or lane 1's end
#      (runner_copies_in);
#   3. reds (N=4): the auth file red: the Linux proof still runs; a runner red, and one not started: lane 1 red, the
#      sign-off refused; the build red: the auth file and the Linux proof NOT_RUN;
#   4. the switches: RELEASE_RUNNERS=no and RELEASE_STEPS=in-order start no runner; RELEASE_RUNNERS=no with N=2 is
#      refused before anything starts;
#   5. release-step1.sh (dry runs): E2E_RUNNERS=N runs e2e-runners.sh full-set N and records from the merged log's link;
#      empty: the lane whole, as before; refused: 5 runners, E2E_SPEC, a target other than web or docker-server;
#   6. record-step1 with RELEASE_STEP1_LOG: the merged log's commit, log and report, not latest.log's (the auth file's);
#   7. release-rerun.sh run (a dry run) and lane: a merged report gives the answers the same tests in one report give;
#      green by re-runs once the failed test passed alone; a merged report with a runner that never ran stays red (its
#      files never ran).
# Every folder is a scratch one; docker, curl, ssh and virsh are stubs first on PATH. Real data, read only: the release
# orchestrator runs' folders (STEP1_RUNNERS_TEST_RUNS [/var/kraft-internalsystems/logs/datapallas-ci/runs]), linked
# into each scratch runs folder for the file times. Nothing is built, started or written outside the scratch folder.
# Takes about three minutes (a dry run's part lasts two seconds).
# Callers: a person or an agent, from the shell, after changing the runners' order in the orchestrator or step 1's lane.
#   bash asbl/ci/tests/test-step1-runners.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
ORCHESTRATOR=asbl/ci/jenkins/release-orchestrator.sh
REAL_RUNS="${STEP1_RUNNERS_TEST_RUNS:-/var/kraft-internalsystems/logs/datapallas-ci/runs}"
ls -d "$REAL_RUNS"/*-release-orchestrator-* >/dev/null 2>&1 ||
  { echo "FAIL  no release orchestrator run in $REAL_RUNS (STEP1_RUNNERS_TEST_RUNS)"; exit 1; }
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-step1-runners.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
has() {  # has <text> <text to search>: found, or what was searched is printed
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}
lacks() {  # lacks <text> <text to search>: not found
  case "$2" in *"$1"*) printf '      "%s" found in:\n%s\n' "$1" "$(printf '%s\n' "$2" | grep -F -- "$1" | sed 's/^/        /' | head -5)"; return 1 ;; esac
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}

# ---- the stubs and the settings: nothing of this host is read or started ----
STUBS="$SCRATCH/stubs"; mkdir -p "$STUBS"
export STUB_CALLS="$SCRATCH/calls.log"; : > "$STUB_CALLS"
cat > "$STUBS/docker" <<'STUB'
#!/bin/bash
# stub docker: records the call; the engine answers, nothing runs
echo "docker $*" >> "$STUB_CALLS"
case "$1 ${2:-}" in
  "info "*) echo "27.0.0" ;;
  "ps "*) ;;
  *) exit 1 ;;
esac
STUB
cat > "$STUBS/curl" <<'STUB'
#!/bin/bash
# stub curl: records the call; every address answers 404
echo "curl $*" >> "$STUB_CALLS"
while [ "$#" -gt 0 ]; do case "$1" in -o) : > "$2"; shift 2 ;; *) shift ;; esac; done
printf 404
STUB
cat > "$STUBS/ssh" <<'STUB'
#!/bin/bash
# stub ssh: records the call; the VM never answers
echo "ssh $*" | cut -c1-300 >> "$STUB_CALLS"
echo "ssh: connect to host vm.invalid port 22: Connection timed out" >&2; exit 255
STUB
cat > "$STUBS/virsh" <<'STUB'
#!/bin/bash
# stub virsh: every VM is running, 12 GB defined
case "${1:-}" in
  domstate) echo running ;;
  dumpxml)  printf "<domain>\n  <memory unit='KiB'>12582912</memory>\n  <currentMemory unit='KiB'>12582912</currentMemory>\n</domain>\n" ;;
  *)        exit 1 ;;
esac
STUB
chmod +x "$STUBS/docker" "$STUBS/curl" "$STUBS/ssh" "$STUBS/virsh"
export PATH="$STUBS:$PATH"
export WIN_CI_CONF="$SCRATCH/no-win-ci.env" WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts"
export RELEASE_PUBLISH_ENV="$SCRATCH/no-release-publish.env" RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf"
unset E2E_APPROVAL E2E_APPROVAL_USER RELEASE_PIN RELEASE_STEPS RELEASE_RUNNERS RELEASE_STEP1_AT_SIGNOFF UPLOAD MODE DRY_RUN_RED \
  SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS E2E_SPEC E2E_GREP E2E_RUNNERS RELEASE_STEP1_LOG
C=$(git rev-parse HEAD)
TODAY=$(date -u +%F)
# a scratch release record with this release's full lane chosen on C (FULL: web or docker-server)
export RELEASE_STATE_DIR="$SCRATCH/state"; mkdir -p "$RELEASE_STATE_DIR"
FULL=$(RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
[ -n "$FULL" ] || { echo "FAIL  no full lane chosen in the scratch record"; exit 1; }
L1="lane1-$FULL-full"
# dry_run <name> [VAR=value...]: an orchestrator dry run pinned to C, the real runs' folders linked in (read only) for the
# file times; RUN its folder, LOG its console, RC its exit code
dry_run() {
  local dir="$SCRATCH/run-$1" d; shift
  mkdir -p "$dir/logs" "$dir/artifacts" "$dir/runs"
  for d in "$REAL_RUNS"/*-release-orchestrator-*; do
    case "$d" in *-dry-run) continue ;; esac
    [ -d "$d" ] && ln -s "$d" "$dir/runs/$(basename "$d")"
  done
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_ARTIFACTS_DIR="$dir/artifacts" RELEASE_PIN="$C" \
    ORCH_STARTED_BY=test-step1-runners DRY_RUN=yes "$@" bash "$ORCHESTRATOR" > "$dir/console.log" 2>&1
  echo "$?" > "$dir/rc"
  RUN=$(ls -1d "$dir"/runs/*-release-orchestrator-*-dry-run 2>/dev/null | tail -1); LOG="$dir/console.log"; RC=$(cat "$dir/rc")
}
key() { sed -n "s/^$1=//p" "$RUN/result.txt"; }
parts() { awk -F'\t' '$1 == "part" { printf "%s%s:%s", s, $2, $4; s = " " }' "$RUN/result.txt"; }
line_of() { grep -n -m1 -F -- "$2" "$1" | cut -d: -f1; }   # line_of <log> <text>: the line number of its first match
before() {  # before <log> <text> <later text>: the first line with <text> comes before the first with <later text>
  local a b; a=$(line_of "$1" "$2"); b=$(line_of "$1" "$3")
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || { echo "      \"$2\" at line ${a:-none}, \"$3\" at line ${b:-none}"; return 1; }
}
runner_files_shown() {  # runner_files_shown <console> <N> <n>: the files the RUNNERS block lists for runner n, one per line
  awk -v h="        runner $3 of $2: " 'index($0, h) == 1 { on = 1; next }
    on && /^            [^ ]/ { gsub(/,/, ""); for (i = 1; i <= NF; i++) print $i; next } on { exit }' "$1"
}
runner_files() {  # runner_files <N> <n>: runner n's files as the lists give them, in the block's short form
  python3 -I asbl/ci/full-set-runners.py files "$1" "$2" | sed 's|^specs/||; s|\.spec\.ts$||'
}
ALL_GREEN="lane2-docker-server-auth:PASS $L1:PASS build:PASS linux-proof:PASS pack:PASS windows-docker-proof:PASS server-light:PASS electron-light:PASS robot:PASS docker-verdict:PASS windows-verdict:PASS"

echo "---- 1. the round with the runners, N = 1 to 4 (dry runs) ----"
for n in 1 2 3 4; do
  dry_run "n$n" SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS="$n"
  check "N=$n: exit 0, result=green, step1=green, every part PASS" same "0 green green $ALL_GREEN" "$RC $(key result) $(key step1) $(parts)"
  lists_ok() {
    local r
    [ "$(grep -c "^        runner [0-9] of $n: [0-9]* spec files, about [0-9]* h [0-9][0-9] (" "$LOG")" = "$n" ] ||
      { echo "      not $n runner lines with a time:"; grep "^        runner " "$LOG" | sed 's/^/        /'; return 1; }
    for r in $(seq 1 "$n"); do
      same "$(runner_files "$n" "$r" | paste -sd' ')" "$(runner_files_shown "$LOG" "$n" "$r" | paste -sd' ')" || return 1
    done
  }
  check "  the RUNNERS block: $n runner(s), each with its list's files and an expected time from the real runs" lists_ok
  check "  started.txt: one dp-ci-runner line per runner, for lane 1" same "$(seq 1 "$n" | sed 's/^/dp-ci-runner-/' | paste -sd' ')" \
    "$(awk -F'\t' '$2 == "'"$L1"'" && $3 == "container" { print $4 }' "$RUN/started.txt" | paste -sd' ')"
  check "  lane 1 gets E2E_RUNNERS=$n and the round's rotation date ($TODAY); its log starts $n runner(s)" bash -c \
    'grep "^WOULD   .*release-step1\.sh" "$1" | grep -q " E2E_ROTATION_DATE=$2 E2E_RUNNERS=$3 " &&
     [ "$(grep -c "^######## RUNNER [0-9] ENGINE START" "$4")" = "$3" ]' _ "$LOG" "$TODAY" "$n" "$RUN/$L1.log"
done
# N = 4 now (the last), then N = 1
check "N=4: this host: the build, then the auth file, then the Linux proof; lane 1 starts before the Linux proof ends" bash -c \
  "$(declare -f line_of before); before \"\$1\" 'PART    docker-linux END' 'PART    lane2-docker-server-auth START' &&
   before \"\$1\" 'PART    lane2-docker-server-auth END' 'PART    docker-linux-proof START' &&
   before \"\$1\" 'PART    $L1 START' 'PART    docker-linux-proof END' &&
   before \"\$1\" 'PART    docker-linux-proof END' 'PART    docker-keep START'" _ "$LOG"
check "  the build part: DOCKER_RELEASE_PART=build; the Linux proof: DOCKER_RELEASE_PART=linux-proof, its own part and log" bash -c \
  'grep "^WOULD " "$1" | grep -q "DOCKER_RELEASE_PART=build " && grep "^WOULD " "$1" | grep -q "DOCKER_RELEASE_PART=linux-proof " &&
   grep -q "^######## DOCKER RELEASE STEP 2/6 END rc=0" "$2/docker-linux.log" && ! grep -q "STEP 3/6" "$2/docker-linux.log" &&
   grep -q "^######## DOCKER RELEASE STEP 3/6 END rc=0" "$2/docker-linux-proof.log"' _ "$LOG" "$RUN"
check "  the ORDER lines say so" bash -c \
  'grep -qF "docker-linux (step 2'"'"'s build, DOCKER_RELEASE_PART=build), then step 1'"'"'s lane2-docker-server-auth once each runner'"'"'s" "$1" &&
   grep -qF "then docker-linux-proof (step 2'"'"'s Linux proof, DOCKER_RELEASE_PART=linux-proof)" "$1" &&
   grep -qF "runners, from the build'"'"'s end mark (DOCKER RELEASE STEP 2/6 END): step 1'"'"'s '"$L1"' in 4 runner(s)" "$1"' _ "$LOG"
check "  the summary's linux-proof is the Linux proof part's verdict" same "PASS $RUN/docker-linux-proof.log" \
  "$(awk -F'\t' '$1 == "part" && $2 == "linux-proof" { print $4 }' "$RUN/result.txt") $(sed -n 's/^  linux-proof  *PASS  *(log \(.*\))$/\1/p' "$LOG")"
whole_set() {  # 1 runner holds the whole full set: the files of the 4 runners together
  same "$(for r in 1 2 3 4; do runner_files 4 "$r"; done | sort | paste -sd' ')" "$(runner_files_shown "$SCRATCH/run-n1/console.log" 1 1 | sort | paste -sd' ')"
}
check "N=1: one runner, with the whole full set (the 4 runners' files together, $(for r in 1 2 3 4; do runner_files 4 "$r"; done | wc -l) files)" whole_set

echo "---- 2. the runners start at the build's end mark; this host's next lane waits for their copies ----"
T="$SCRATCH/alone"; mkdir -p "$T"
fn() { sed -n "/^$1() {/,/^}/p" "$ORCHESTRATOR"; }
# alone <full> <script>: the orchestrator's own function, with stubs for what it calls, in a scratch PARTS folder
alone() {
  { echo "PARTS=$T; POLL=1; full=$1; needed=\"step1.docker-server-auth step1.$1-full\"; FULL_SET_JOBS=2; PIN=$C; AUTH_SPEC=auth"
    echo "run_lane() { echo \"RUN_LANE \$1\" >> $T/calls; }"
    echo "not_run() { echo \"NOT_RUN \$1: \$2\" >> $T/calls; }"
    echo "build_verdict() { cat $T/build-verdict; }"
    fn lane_part; fn track_runners; fn runner_copies_in; echo "$2"; } > "$T/alone.sh"
  timeout 20 bash "$T/alone.sh" > "$T/out" 2>&1 & ALONE=$!
}
running() { kill -0 "$ALONE" 2>/dev/null; }
ended() { local i; for i in $(seq 1 10); do running || return 0; sleep 0.5; done; echo "      still waiting"; return 1; }
reset() { rm -f "$T"/docker-linux.log "$T"/docker-linux.rc "$T"/lane1-*.log "$T"/lane1-*.rc "$T/calls"; touch "$T/calls"; echo "PASS|" > "$T/build-verdict"; }
reset; echo "######## DOCKER RELEASE STEP 2/6 START  2026-11-05T10:00:00Z" > "$T/docker-linux.log"
alone web track_runners; sleep 3
check "track_runners: the build's 2/6 started, not ended: the runners not started yet" bash -c '[ ! -s "$1" ] && kill -0 "$2"' _ "$T/calls" "$ALONE"
echo "######## DOCKER RELEASE STEP 2/6 END rc=0  2026-11-05T10:30:00Z  took=1800s" >> "$T/docker-linux.log"
ended; check "  its end mark: lane 1 (the runners) started" same "RUN_LANE step1.web-full" "$(cat "$T/calls")"
reset; echo 1 > "$T/docker-linux.rc"
alone web track_runners; ended
check "  the build part ended with no end mark: lane 1 started (on web it needs no build)" same "RUN_LANE step1.web-full" "$(cat "$T/calls")"
reset; echo "######## DOCKER RELEASE STEP 2/6 END rc=1  2026-11-05T10:30:00Z" > "$T/docker-linux.log"; echo "FAIL|" > "$T/build-verdict"
alone docker-server track_runners; ended
check "  on docker-server with the build red: lane 1 NOT_RUN, no runner" has "NOT_RUN lane1-docker-server-full: no build of" "$(cat "$T/calls")"
reset; echo "######## RUNNER 1 CACHES END rc=0  2026-11-05T10:40:00Z" > "$T/lane1-web-full.log"
alone web runner_copies_in; sleep 3
check "runner_copies_in: runner 1's caches in, runner 2's not: still waiting" running
echo "######## RUNNER 2 ENGINE END rc=1  2026-11-05T10:41:00Z" >> "$T/lane1-web-full.log"
ended; check "  runner 2 did not start (its engine red): no more waiting" bash -c '! kill -0 "$1" 2>/dev/null && grep -q "^WAIT    this host" "$2"' _ "$ALONE" "$T/out"
reset; : > "$T/lane1-web-full.log"
alone web runner_copies_in; sleep 2
check "  no runner mark yet: waiting" running
echo - > "$T/lane1-web-full.rc"
ended; check "  lane 1 ended (or NOT_RUN): no more waiting" bash -c '! kill -0 "$1" 2>/dev/null' _ "$ALONE"

echo "---- 3. reds (N=4) ----"
dry_run red-auth SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=4 DRY_RUN_RED=lane2-docker-server-auth
check "the auth file red: result=red, step1=red; the Linux proof still runs after it, green" bash -c \
  "$(declare -f line_of before); [ \"\$2\" = '1 red red' ] && [[ \"\$3\" == *'lane2-docker-server-auth:FAIL'*'linux-proof:PASS'* ]] &&
   before \"\$1\" 'PART    lane2-docker-server-auth END' 'PART    docker-linux-proof START'" _ "$LOG" "$RC $(key result) $(key step1)" "$(parts)"
for red in runner-2 runner-3-start; do
  dry_run "red-$red" SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=4 DRY_RUN_RED="$red"
  case "$red" in runner-2) why="FAILED: runner 2 red (DRY_RUN_RED)" ;; *) why="FAILED: runner 3 did not start (above): its files NOT_RUN" ;; esac
  check "$red: lane 1 red, the rest green, the sign-off refused (result=red, step1=red); lane 1's log: \"$why\"" bash -c \
    '[ "$1" = "1 red red" ] && [ "$2" = "$3" ] && grep -q "^dry run: the sign-off: step 1 red (DRY_RUN_RED): the run is red" "$4" && grep -qF "$5" "$6"' \
    _ "$RC $(key result) $(key step1)" "$(parts)" "${ALL_GREEN/$L1:PASS/$L1:FAIL}" "$LOG" "$why" "$RUN/$L1.log"
done
dry_run red-build SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=4 DRY_RUN_RED=build
if [ "$FULL" = docker-server ]; then lane1_without_build=NOT_RUN; else lane1_without_build=PASS; fi
check "the build red: the auth file, the Linux proof, the Windows Docker proof and the keep NOT_RUN (lane 1 on $FULL: $lane1_without_build)" same \
  "1 red red lane2-docker-server-auth:NOT_RUN $L1:$lane1_without_build build:FAIL linux-proof:NOT_RUN pack:PASS windows-docker-proof:NOT_RUN server-light:PASS electron-light:PASS robot:PASS docker-verdict:NOT_RUN windows-verdict:PASS" \
  "$RC $(key result) $(key step1) $(parts)"

echo "---- 4. the switches: no runner ----"
no_runner() {  # no_runner: no RUNNERS block, no runner line in started.txt, no E2E_RUNNERS, no Linux proof part of its own
  ! grep -q "^RUNNERS \|E2E_RUNNERS=\|docker-linux-proof\|on three tracks" "$LOG" && ! grep -q "dp-ci-runner-" "$RUN/started.txt" ||
    { echo "      a runner in:"; grep -n "^RUNNERS \|E2E_RUNNERS=\|docker-linux-proof\|on three tracks\|dp-ci-runner-" "$LOG" "$RUN/started.txt" | head -5 | sed 's/^/        /'; return 1; }
}
dry_run runners-no RELEASE_RUNNERS=no
check "RELEASE_RUNNERS=no: green, the full set on this host's engine, no runner" bash -c \
  "$(declare -f no_runner); RUN='$RUN' LOG='$LOG'; [ \"\$1\" = '0 green' ] && no_runner" _ "$RC $(key result)"
dry_run in-order RELEASE_STEPS=in-order
check "RELEASE_STEPS=in-order: green, 16.6.2's order, no runner" bash -c \
  "$(declare -f no_runner); RUN='$RUN' LOG='$LOG'; [ \"\$1\" = '0 green' ] && grep -q '^PART    step1-build START' \"\$LOG\" && no_runner" _ "$RC $(key result)"
dry_run runners-no-n2 RELEASE_RUNNERS=no SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=2
check "RELEASE_RUNNERS=no with N=2: refused before anything starts (exit 2, no run folder)" bash -c \
  '[ "$1" = 2 ] && grep -qF "REFUSED SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=2 with RELEASE_RUNNERS=no: the full set runs whole on this host'"'"'s one Docker engine" "$2" &&
   ! ls -d "$3"/*-dry-run >/dev/null 2>&1' _ "$RC" "$LOG" "$SCRATCH/run-runners-no-n2/runs"

echo "---- 5. release-step1.sh E2E_RUNNERS (dry runs) ----"
S1="$SCRATCH/step1"; mkdir -p "$S1"
step1() { env LOG_DIR="$S1" RUN_RECORD_DIR="$S1/runs" STEP1_STARTED_BY=test-step1-runners DRY_RUN=yes "$@" bash asbl/ci/jenkins/release-step1.sh 2>&1; }
out=$(step1 E2E_TARGET=web E2E_RUNNERS=2); rc=$?
check "E2E_RUNNERS=2 on web: exit 0; the lane is e2e-runners.sh full-set 2; the record reads the merged log's link" bash -c \
  '[ "$1" = 0 ] && grep -qF "WOULD  bash asbl/ci/jenkins/job-step.sh JOB\ STEP\ 1/1 e2e\ web\ in\ 2\ runner\(s\) env E2E_TARGET=web bash asbl/ci/e2e-runners.sh full-set 2" <<< "$2" &&
   grep -qF "WOULD  RELEASE_STEP_START=<when the steps began> RELEASE_STEP1_LOG=$3/runners/full-set-latest.log bash asbl/ci/release-state.sh record-step1 web <their exit code>" <<< "$2"' \
  _ "$rc" "$out" "$S1"
out=$(step1 E2E_TARGET=docker-server E2E_RUNNERS=4); rc=$?
check "E2E_RUNNERS=4 on docker-server: the build first (JOB STEP 1/2), then full-set 4" bash -c \
  '[ "$1" = 0 ] && grep -qF "JOB\ STEP\ 1/2 the\ build\ of\ origin/main" <<< "$2" && grep -qF "JOB\ STEP\ 2/2 e2e\ docker-server\ in\ 4\ runner\(s\) env E2E_TARGET=docker-server bash asbl/ci/e2e-runners.sh full-set 4" <<< "$2"' _ "$rc" "$out"
out=$(step1 E2E_TARGET=web); rc=$?
check "E2E_RUNNERS empty: the lane whole on this host (follow-ci.sh, dp-ci.sh e2e), the record from latest.log, as before" bash -c \
  '[ "$1" = 0 ] && grep -qF "WOULD  bash asbl/ci/jenkins/job-step.sh JOB\ STEP\ 1/1 e2e\ web env E2E_TARGET=web bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e" <<< "$2" &&
   grep -qF "WOULD  RELEASE_STEP_START=<when the steps began> bash asbl/ci/release-state.sh record-step1 web <their exit code>" <<< "$2" &&
   ! grep -q "e2e-runners\|RELEASE_STEP1_LOG" <<< "$2"' _ "$rc" "$out"
for bad in "E2E_TARGET=web E2E_RUNNERS=5|E2E_RUNNERS=5: 1 to 4 runners" "E2E_TARGET=web E2E_RUNNERS=2 E2E_SPEC=reporting|E2E_RUNNERS runs the full set: E2E_SPEC and E2E_GREP must be empty" \
           "E2E_TARGET=electron-linux E2E_RUNNERS=2|E2E_RUNNERS is for the full set on web or docker-server (E2E_TARGET=electron-linux)"; do
  out=$(step1 ${bad%%|*}); rc=$?
  check "${bad%%|*}: refused, exit 2" bash -c '[ "$1" = 2 ] && grep -qF "FAIL  $2" <<< "$3"' _ "$rc" "${bad#*|}" "$out"
done

echo "---- 6. record-step1 reads the merged log named by RELEASE_STEP1_LOG ----"
RL="$SCRATCH/record-logs"; mkdir -p "$RL/runners"
CS=$(git rev-parse --short HEAD); PS=$(git rev-parse --short HEAD~1)
printf 'PIPELINE_START 2026-11-05T12:00:00Z  task=e2e  commit=%s  version=x\nE2E_COMMIT=%s\nPIPELINE_RESULT=SUCCESS\n' "$CS" "$CS" > "$RL/20261105T120000Z-e2e-$CS.log"
echo '{"suites": [], "stats": {}}' > "$RL/20261105T120000Z-e2e-$CS-playwright.json"
printf 'E2E_COMMIT=%s\nPIPELINE_RESULT=SUCCESS\n' "$PS" > "$RL/20261105T130000Z-e2e-$PS.log"
ln -s "$RL/20261105T130000Z-e2e-$PS.log" "$RL/latest.log"                     # the auth file's lane, meanwhile on this host
ln -s "$RL/20261105T120000Z-e2e-$CS.log" "$RL/runners/full-set-latest.log"    # the merged log (e2e-runners.sh full-set)
export RELEASE_STATE_DIR="$SCRATCH/state-record"; mkdir -p "$RELEASE_STATE_DIR"
out=$(LOG_DIR="$RL" E2E_SPEC= E2E_GREP= RELEASE_STEP1_LOG="$RL/runners/full-set-latest.log" bash asbl/ci/release-state.sh record-step1 "$FULL" 0 2>&1)
rec="$RELEASE_STATE_DIR/$C/step1.$FULL-full"
check "record-step1 with RELEASE_STEP1_LOG: step1.$FULL-full PASS on the merged log's commit, its log and report (not latest.log's)" same \
  "result=PASS commit=$C log=$RL/20261105T120000Z-e2e-$CS.log report=$RL/20261105T120000Z-e2e-$CS-playwright.json" \
  "$(grep -E '^(result|commit|log|report)=' "$rec" 2>/dev/null | paste -sd' ')"
check "  no note of a missing E2E_COMMIT line" lacks "no E2E_COMMIT= line" "$out"

echo "---- 7. release-rerun.sh lane: a merged report as one report; a runner that never ran ----"
RR="$SCRATCH/rerun"; mkdir -p "$RR"
# two runners' logs and reports (runner 1: one passed test; runner 2: one failed), and the same tests in one report
python3 -I - "$RR" "$CS" "$FULL" <<'PY'
import json, os, sys
d, c, target = sys.argv[1], sys.argv[2], sys.argv[3]
def suite(f, title, ok):
    return {"title": f.split("/")[-1], "file": f, "specs": [{"title": title, "file": f, "line": 1, "tests": [
        {"status": "expected" if ok else "unexpected", "projectName": "chromium",
         "results": [{"status": "passed" if ok else "failed", "duration": 60000}]}]}]}
a = suite("specs/features/samples.spec.ts", "a passes", True)
b = suite("specs/features/reporting.spec.ts", "b fails", False)
def stats(e, u): return {"startTime": "2026-11-05T10:00:00.000Z", "duration": 60000, "expected": e, "unexpected": u, "flaky": 0, "skipped": 0}
for n, s, ok in ((1, a, True), (2, b, False)):
    log = os.path.join(d, "runner-%d.log" % n); rep = log[:-4] + "-playwright.json"
    json.dump({"config": {}, "suites": [s], "errors": [], "stats": stats(1 if ok else 0, 0 if ok else 1)}, open(rep, "w"))
    open(log, "w").write("PIPELINE_START 2026-11-05T10:00:00Z  task=e2e  commit=%s  version=x\nE2E_COMMIT=%s\n"
        "E2E_RETRIES=1 E2E_TIMEOUT_SECS=36000 E2E_JSON_REPORT=%s\nE2E_TARGET=%s\n"
        "E2E_RESULT mode=full passed=%d failed=%d flaky=0 skipped=0 didnotrun=0 exit=%d target=%s\nPIPELINE_RESULT=%s\n"
        % (c, c, rep, target, 1 if ok else 0, 0 if ok else 1, 0 if ok else 1, target, "SUCCESS" if ok else "FAILED_AT_STEP_4"))
json.dump({"config": {}, "suites": [a, b], "errors": [], "stats": stats(1, 1)}, open(os.path.join(d, "whole-playwright.json"), "w"))
PY
python3 -I asbl/ci/full-set-runners.py merge 2 "$RR/merged.log" "$RR/runner-1.log" "$RR/runner-2.log" > /dev/null
python3 -I asbl/ci/full-set-runners.py merge 2 "$RR/lost.log" "$RR/runner-2.log" - > /dev/null
lane() {  # lane <report>: release-rerun.sh lane's answer on it (the report's path as <report>), and its exit code
  local out rc
  out=$(RELEASE_RERUN_RECORD="$RR/reruns.tsv" bash asbl/ci/release-rerun.sh lane "$FULL" "$1" "$C" 2026-11-05T09:00:00Z 2>&1); rc=$?
  printf '%s\nrc=%s\n' "${out//"$1"/<report>}" "$rc"
}
: > "$RR/reruns.tsv"
whole=$(lane "$RR/whole-playwright.json"); merged=$(lane "$RR/merged-playwright.json")
rerun() {  # rerun <report>: release-rerun.sh run's dry answer on it (no build in its scratch LOG_DIR: it stops), its exit code
  local out rc
  out=$(DRY_RUN=yes RERUN_COMMIT="$C" LOG_DIR="$RR" RELEASE_RERUN_RECORD="$RR/reruns.tsv" RELEASE_ARTIFACTS_DIR="$RR/artifacts" \
    bash asbl/ci/release-rerun.sh run "$FULL" --kept none --failed "$1" 2>&1); rc=$?
  printf '%s\nrc=%s\n' "${out//"$1"/<report>}" "$rc"
}
whole_run=$(rerun "$RR/whole-playwright.json"); merged_run=$(rerun "$RR/merged-playwright.json")
check "run (a dry run): the merged report's answer is the one report's (the failed test, then STOP: no build here, exit 3)" bash -c \
  '[ "$1" = "$2" ] && grep -q "^TESTS  specs/features/reporting.spec.ts :: b fails$" <<< "$1" && grep -q "^RERUN_RESULT .* stopped: " <<< "$1" &&
   grep -q "^rc=3$" <<< "$1"' _ "$merged_run" "$whole_run"
check "lane, no re-run yet: the merged report's answer is the one report's (still red, the same failed test)" bash -c \
  '[ "$1" = "$2" ] && grep -q "^  1. specs/features/reporting.spec.ts :: b fails$" <<< "$1" && grep -q "^LANE_RESULT still red: 0 of 1 " <<< "$1"' _ "$merged" "$whole"
printf '2026-11-05T11:00:00Z\t%s\tspecs/features/reporting.spec.ts :: b fails\t%s\tPASS\t%s/rerun.log\t%s/rerun.json\tpackage %s\tmerged\n' \
  "$FULL" "$C" "$RR" "$RR" "$CS" > "$RR/reruns.tsv"
whole=$(lane "$RR/whole-playwright.json"); merged=$(lane "$RR/merged-playwright.json")
check "the failed test passed alone since: both green by re-runs, the same answer" bash -c \
  '[ "$1" = "$2" ] && grep -q "^LANE_RESULT green by re-runs: each of the 1 red passed alone" <<< "$1" && grep -q "^rc=0$" <<< "$1"' _ "$merged" "$whole"
lost=$(lane "$RR/lost-playwright.json")
check "runner 1 red and runner 2 never ran, the failed test passed alone since: still red, runner 2's files never ran (exit 1)" bash -c \
  'grep -q "^  2. the report'"'"'s 1 error(s) outside its tests: runner 2 of 2 never ran: its [0-9]* files are NOT_RUN" <<< "$1" &&
   grep -q "^     some tests never ran: only a run of the whole lane makes it green$" <<< "$1" && grep -q "^LANE_RESULT still red: 1 of 2 " <<< "$1" && grep -q "^rc=1$" <<< "$1"' _ "$lost"

check "nothing was run, built, pushed, loaded or saved in Docker" bash -c '! grep -q "^docker \(run\|push\|build\|load\|save\)" "$1"' _ "$STUB_CALLS"
if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-step1-runners"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-step1-runners"; exit 1

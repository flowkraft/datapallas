#!/bin/bash
# The release steps started together (asbl/ci/jenkins/release-orchestrator.sh with RELEASE_STEPS=together, the machines
# file's default; release 16.6.3): steps 1, 2 and 3 start at once, each part runs to its end, and step 1 is checked at the
# run's sign-off and at every upload. With RELEASE_RUNNERS=no: step 1's full set on this host's engine (the runners'
# order, the default: asbl/ci/tests/test-step1-runners.sh). The cases:
#   1. a dry run with no release record: every part of the three steps runs start to end and gives its verdict; steps 2
#      and 3 start before step 1 ends; this host runs one part at a time, the VM one part at a time; only the parts of
#      steps 2 and 3 get the switch RELEASE_STEP1_AT_SIGNOFF=yes; the sign-off refuses (result=red) when any one part is
#      red (a step 1 lane, the pack), and a red build leaves the parts that need it NOT_RUN;
#   2. the step 1 guard of steps 2 and 3 (release-state.sh step1-guard): skipped only with the switch inside an
#      orchestrator run (its lock held), pinned, with no upload; refused as always otherwise; `require step1` (every
#      upload's check) never reads the switch; step 2 pressed alone (release-docker.sh, a dry run) still checks step 1 at
#      its start, and skips it only inside an orchestrator run; there, its build part (DOCKER_RELEASE_PART=build) ends
#      after the build, and its linux-proof part runs the Linux proof on that build, building nothing;
#   3. release-publish.sh upload-kept (DRY_RUN=yes) refuses either channel without step 1 green, the switch set and the
#      orchestrator's lock held;
#   4. a run after fixes (EXECUTION=2) lists every lane, step 1's included, its lanes green on the pin already;
#      RELEASE_STEPS=in-order keeps 16.6.2's rule there (a green lane is not run again);
#   5. two parts asking for one commit's build at once: one build (asbl/ci/build-once.sh, through which dp-ci.sh
#      build-if-needed starts its build);
#   6. RELEASE_STEPS=in-order gives 16.6.2's dry run: step 1's lanes first, then steps 2 and 3, the same ORDER lines.
# Every folder is a scratch one. release-docker.sh and upload-kept run in a sandbox: a sparse clone of this commit (asbl/ci
# as it is in this checkout, committed in the sandbox's own history when it is not yet) whose origin is a local bare
# repository; docker, curl, ssh and virsh are stubs first on PATH. No
# machines file of this host is read. Nothing is built, uploaded, pushed or started. Takes about three minutes (a dry
# run's part lasts two seconds).
# Callers: a person or an agent, from the shell, after changing the order of the steps or a step 1 check.
#   bash asbl/ci/tests/test-step-independence.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
ORCHESTRATOR=asbl/ci/jenkins/release-orchestrator.sh
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-step-independence.XXXXXX") || exit 2
LOCK_HOLDER=""
trap '[ -z "$LOCK_HOLDER" ] || kill "$LOCK_HOLDER" 2>/dev/null; rm -rf "$SCRATCH"' EXIT
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
# stub docker: records the call; the engine answers, an image's id is the kept one, nothing runs
echo "docker $*" >> "$STUB_CALLS"
case "$1 ${2:-}" in
  "info "*) echo "27.0.0" ;;
  "image inspect") echo "sha256:the-kept-image" ;;
  "ps "*) ;;
  *) exit 1 ;;
esac
STUB
cat > "$STUBS/curl" <<'STUB'
#!/bin/bash
# stub curl: records the call; every address answers 404 (Docker Hub: no such tag; the download site: no version file yet)
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
# stub virsh: every VM is running, 12 GB defined (a round's VMs: nothing to set, start or shut down)
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
export LOG_DIR="$SCRATCH/logs"; mkdir -p "$LOG_DIR"
unset E2E_APPROVAL E2E_APPROVAL_USER RELEASE_PIN RELEASE_STEPS RELEASE_STEP1_AT_SIGNOFF UPLOAD MODE \
  SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS
export RELEASE_RUNNERS=no   # the full set on this host's engine, one part at a time
C=$(git rev-parse HEAD)
STATE="bash $REPO_ROOT/asbl/ci/release-state.sh"
LOCK="$LOG_DIR/release-orchestrator.lock"
# hold_the_lock / free_the_lock: the orchestrator's lock held by another process, as during an orchestrator run
hold_the_lock() {
  ( exec 9>>"$LOCK"; flock 9; exec sleep 600 ) & LOCK_HOLDER=$!
  local i; for i in $(seq 50); do flock -n -E 75 "$LOCK" true; [ "$?" = 75 ] && return 0; sleep 0.1; done
  echo "      the lock could not be taken"; return 1
}
free_the_lock() { [ -z "$LOCK_HOLDER" ] || { kill "$LOCK_HOLDER" 2>/dev/null; wait "$LOCK_HOLDER" 2>/dev/null; }; LOCK_HOLDER=""; }

# a scratch release record with this release's full lane chosen on C (FULL: web or docker-server)
record() {  # record <name>: RELEASE_STATE_DIR is a new empty record of that name, FULL its full lane
  export RELEASE_STATE_DIR="$SCRATCH/state-$1"; mkdir -p "$RELEASE_STATE_DIR"
  FULL=$(RELEASE_COMMIT="$C" $STATE full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
}
# dry_run <name> [VAR=value...]: an orchestrator dry run pinned to C on the current record; RUN its folder, LOG its console
dry_run() {
  local dir="$SCRATCH/run-$1"; shift
  mkdir -p "$dir/logs" "$dir/artifacts"
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_ARTIFACTS_DIR="$dir/artifacts" RELEASE_PIN="$C" \
    ORCH_STARTED_BY=test-step-independence DRY_RUN=yes "$@" bash "$ORCHESTRATOR" > "$dir/console.log" 2>&1
  echo "$?" > "$dir/rc"
  RUN=$(ls -1d "$dir"/runs/*release-orchestrator*/ 2>/dev/null | tail -1); LOG="$dir/console.log"; RC=$(cat "$dir/rc")
}
key() { sed -n "s/^$1=//p" "$RUN/result.txt"; }
parts() { awk -F'\t' '$1 == "part" { printf "%s%s:%s", s, $2, $4; s = " " }' "$RUN/result.txt"; }
line_of() { grep -n -m1 -- "$2" "$1" | cut -d: -f1; }   # line_of <log> <text>: the line number of its first match
before() {  # before <log> <text> <later text>: the first line with <text> comes before the first with <later text>
  local a b; a=$(line_of "$1" "$2"); b=$(line_of "$1" "$3")
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || { echo "      \"$2\" at line ${a:-none}, \"$3\" at line ${b:-none}"; return 1; }
}
one_at_a_time() {  # one_at_a_time <log> <part>...: each part starts after the one before it ended
  local log="$1" prev="$2"; shift 2
  for p in "$@"; do before "$log" "PART    $prev END" "PART    $p START" || return 1; prev="$p"; done
}
# would_lines <log>: "<part> <TAB> <its WOULD line>" for every part a dry run started, the part read from the command
# itself (the two tracks print at once, so a WOULD line need not follow its own PART line)
would_lines() {
  awk '/^WOULD   RELEASE_PIN=/ {
    p = "unknown"
    if (match($0, /DOCKER_RELEASE_PART=[a-z]+/)) p = "docker-" substr($0, RSTART + 20, RLENGTH - 20)
    else if (match($0, /WIN_RELEASE_HALF=[a-z-]+/)) p = "windows-" substr($0, RSTART + 17, RLENGTH - 17)
    else if ($0 ~ /release-step1\.sh/ && $0 ~ /E2E_SPEC=[^ ]*auth-authorization-server/) p = "lane2-docker-server-auth"
    else if ($0 ~ /release-step1\.sh/ && match($0, /E2E_TARGET=[a-z-]+ E2E_SPEC= /)) p = "lane1-" substr($0, RSTART + 11, RLENGTH - 22) "-full"
    print p "\t" $0 }' "$1"
}

echo "---- 1. the three steps together, a dry run with no release record ----"
record together
dry_run together
LANES="lane2-docker-server-auth lane1-$FULL-full"
check "exit 0, result=green, step1=green (checked at the sign-off)" same "0 green green" "$RC $(key result) $(key step1)"
check "every part of the three steps ran to its end and gave its verdict" same \
  "lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:PASS windows-docker-proof:PASS server-light:PASS electron-light:PASS robot:PASS docker-verdict:PASS windows-verdict:PASS" \
  "$(parts)"
check "  one STEPS 1, 2 AND 3 mark, no step 1 mark before the others, no step1-build part" bash -c \
  'grep -q "^######## STEPS 1, 2 AND 3 START" "$1" && ! grep -q "^######## STEP 1 START\|^######## EXECUTION" "$1" && ! grep -q "PART    step1-build" "$1"' _ "$LOG"
check "steps 2 and 3 start before step 1 ends: the pack, then the Windows Docker proof, before lane 1's end" bash -c \
  "$(declare -f line_of before); before \"\$1\" 'PART    windows-pack START' 'PART    lane1-$FULL-full END' &&
   before \"\$1\" 'PART    docker-windows START' 'PART    lane1-$FULL-full END'" _ "$LOG"
check "this host, one part at a time: the build and the Linux proof, lane 2, lane 1, then the keep" \
  one_at_a_time "$LOG" docker-linux lane2-docker-server-auth "lane1-$FULL-full" docker-keep
check "the VM, one part at a time: the pack, the Windows Docker proof, then the server light set, Electron, Robot" \
  one_at_a_time "$LOG" windows-pack docker-windows windows-after-pack
check "the keep waits for the Windows Docker proof" before "$LOG" "PART    docker-windows END" "PART    docker-keep START"
check "only the parts of steps 2 and 3 get RELEASE_STEP1_AT_SIGNOFF=yes" same \
  "docker-keep:yes docker-linux:yes docker-windows:yes lane1-$FULL-full:no lane2-docker-server-auth:no windows-after-pack:yes windows-pack:yes" \
  "$(would_lines "$LOG" | awk -F'\t' '{ print $1 ":" ($2 ~ / RELEASE_STEP1_AT_SIGNOFF=yes / ? "yes" : "no") }' | sort | paste -sd' ')"
check "the sign-off asks step 1 after every part" before "$LOG" "PART    docker-keep END" "dry run: the sign-off: step 1 green on ${C:0:8}"
for red in "lane1-$FULL-full" lane2-docker-server-auth; do
  dry_run "red-$red" DRY_RUN_RED="$red"
  check "a red step 1 lane ($red): result=red, step1=red, steps 2 and 3 still to their end, green" bash -c \
    '[ "$1 $2 $3" = "1 red red" ] && [[ "$4" == *"build:PASS linux-proof:PASS pack:PASS windows-docker-proof:PASS server-light:PASS electron-light:PASS robot:PASS docker-verdict:PASS windows-verdict:PASS"* ]] &&
     [[ "$4" == *"$5:FAIL"* ]] && grep -q "dry run: the sign-off: step 1 red (DRY_RUN_RED): the run is red" "$6"' \
    _ "$RC" "$(key result)" "$(key step1)" "$(parts)" "$red" "$LOG"
done
dry_run red-pack DRY_RUN_RED=pack
check "a red pack: result=red, step 1 green, what needs the pack NOT_RUN, the rest green" same \
  "1 red green lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:FAIL windows-docker-proof:PASS server-light:NOT_RUN electron-light:PASS robot:NOT_RUN docker-verdict:PASS windows-verdict:FAIL" \
  "$RC $(key result) $(key step1) $(parts)"
dry_run red-build DRY_RUN_RED=build
if [ "$FULL" = docker-server ]; then lane1_without_build=NOT_RUN; else lane1_without_build=PASS; fi
check "a red build: the lanes on docker-server NOT_RUN (lane 1 on $FULL: $lane1_without_build), the Windows Docker proof and the keep NOT_RUN" same \
  "1 red red lane2-docker-server-auth:NOT_RUN lane1-$FULL-full:$lane1_without_build build:FAIL linux-proof:NOT_RUN pack:PASS windows-docker-proof:NOT_RUN server-light:PASS electron-light:PASS robot:PASS docker-verdict:NOT_RUN windows-verdict:PASS" \
  "$RC $(key result) $(key step1) $(parts)"
check "  the lane says why" has "no build of ${C:0:8} to test (the build is not green)" "$(cat "$RUN/lane2-docker-server-auth.log")"

echo "---- 2. the step 1 guard of steps 2 and 3, and the switch ----"
record guard
guard() { RELEASE_COMMIT="$C" DRY_RUN=yes $STATE step1-guard 2>&1; }   # (environment: the case's)
out=$(guard); rc=$?
check "no switch: refused (exit 1), step 1 not green" bash -c '[ "$1" = 1 ] && [[ "$2" == *"REFUSED: step 1 is not green on ${3:0:8}"* ]]' _ "$rc" "$out" "$C"
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$C" UPLOAD=no guard); rc=$?
check "the switch, the orchestrator's lock free (no orchestrator run): ignored, said, refused" bash -c \
  '[ "$1" = 1 ] && [[ "$2" == *"RELEASE_STEP1_AT_SIGNOFF=yes ignored"*"the orchestrator'"'"'s lock free"* ]] && [[ "$2" == *"REFUSED: step 1 is not green"* ]]' _ "$rc" "$out"
hold_the_lock
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$C" UPLOAD=no guard); rc=$?
check "the switch inside an orchestrator run (lock held), pinned, UPLOAD=no: SKIPPED, exit 0" bash -c \
  '[ "$1" = 0 ] && [[ "$2" == "SKIPPED: the step 1 guard: the orchestrator runs the steps together"* ]]' _ "$rc" "$out"
out=$(RELEASE_STEP1_AT_SIGNOFF=yes UPLOAD=no guard); rc=$?
check "  not pinned: refused" bash -c '[ "$1" = 1 ] && [[ "$2" == *"RELEASE_PIN=none"*"REFUSED: step 1 is not green"* ]]' _ "$rc" "$out"
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$C" UPLOAD=yes guard); rc=$?
check "  UPLOAD=yes (MODE=public): refused" bash -c '[ "$1" = 1 ] && [[ "$2" == *"UPLOAD=yes"*"REFUSED: step 1 is not green"* ]]' _ "$rc" "$out"
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$C" UPLOAD=no RELEASE_COMMIT="$C" DRY_RUN=yes $STATE require step1 2>&1); rc=$?
check "  require step1, every upload's check, never reads the switch: refused" bash -c \
  '[ "$1" = 1 ] && [[ "$2" == *"RELEASE_STATE require FAILED"* ]] && [[ "$2" != *"SKIPPED"* ]]' _ "$rc" "$out"
free_the_lock
check "the guard's callers are unchanged: release-docker.sh at its start and at its keep, dp-ci.sh's step 3 at its start" same \
  "asbl/ci/dp-ci.sh:1 asbl/ci/jenkins/release-docker.sh:2" \
  "$(grep -c 'release-state.sh" step1-guard\|\$STATE step1-guard' asbl/ci/dp-ci.sh asbl/ci/jenkins/release-docker.sh | paste -sd' ')"
check "only the orchestrator sets the switch, only release-state.sh reads it" same \
  "asbl/ci/jenkins/release-orchestrator.sh asbl/ci/release-state.sh" \
  "$(grep -rl 'RELEASE_STEP1_AT_SIGNOFF' asbl/ci --include='*.sh' --include='*.py' --include='*.groovy' | grep -v '/tests/' | sort | paste -sd' ')"

# the sandbox: this commit's asbl/ci and version files, origin a local bare repository on the same commit
SANDBOX="$SCRATCH/sandbox"
git init -q --bare "$SCRATCH/origin.git"
echo "$(cd "$(git rev-parse --git-common-dir)" && pwd)/objects" > "$SCRATCH/origin.git/objects/info/alternates"
git -C "$SCRATCH/origin.git" update-ref refs/heads/main "$C"
git clone -q --shared --no-checkout "$SCRATCH/origin.git" "$SANDBOX"
git -C "$SANDBOX" sparse-checkout set --no-cone /asbl/ci/ /frend/reporting/e2e/ /pom.xml /bkend/server/pom.xml /frend/reporting/package.json \
  /frend/reporting/package-lock.json /frend/reporting/app/package.json /frend/reporting/app/package-lock.json \
  /bkend/reporting/src/main/external-resources/template/config/burst/settings.xml
git -C "$SANDBOX" checkout -q main
cp -a asbl/ci/. "$SANDBOX/asbl/ci/"
# asbl/ci here not committed yet (while it is being changed): the sandbox commits it in its own scratch history, so its
# checkout is clean and on its origin/main, as dp-ci.sh wants it; SC is the sandbox's commit (C once committed)
if [ -n "$(git -C "$SANDBOX" status --porcelain -- asbl/ci)" ]; then
  git -C "$SANDBOX" add -A asbl/ci &&
    git -C "$SANDBOX" -c user.name=test -c user.email=test@example.invalid commit -qm "test: asbl/ci as in the checkout" &&
    git -C "$SANDBOX" push -q origin HEAD:main
fi
SC=$(git -C "$SANDBOX" rev-parse HEAD)
V=$(grep -m1 -oP '(?<=<version>)[^<]+' "$SANDBOX/bkend/reporting/src/main/external-resources/template/config/burst/settings.xml")
# step 2 pressed alone, a dry run of its linux part: release-docker.sh in the sandbox, its record the scratch one
docker_step() { ( cd "$SANDBOX" && MODE=rehearsal UPLOAD=no DRY_RUN=yes DOCKER_RELEASE_PART=linux bash asbl/ci/jenkins/release-docker.sh 2>&1 ); }
export RELEASE_STATE_DIR="$SCRATCH/state-pressed-alone"; mkdir -p "$RELEASE_STATE_DIR"
( cd "$SANDBOX" && RELEASE_COMMIT="$SC" bash asbl/ci/release-state.sh full-lane --choose >/dev/null 2>&1 )
out=$(docker_step)
check "step 2 pressed alone (release-docker.sh, a dry run): refused at its start, step 1 not green" bash -c \
  '[[ "$1" == *"REFUSED: step 1 is not green on"* ]] && [[ "$1" == *"DOCKER_RELEASE=FAILED"* ]] && [[ "$1" != *"DOCKER RELEASE STEP 2/6"* ]]' _ "$out"
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$SC" docker_step)
check "  the switch given by hand, no orchestrator run: ignored, refused at its start" bash -c \
  '[[ "$1" == *"RELEASE_STEP1_AT_SIGNOFF=yes ignored"* ]] && [[ "$1" == *"REFUSED: step 1 is not green on"* ]] && [[ "$1" != *"DOCKER RELEASE STEP 2/6"* ]]' _ "$out"
hold_the_lock
out=$(RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$SC" docker_step)
check "  inside an orchestrator run (the switch, pinned, the lock held): past the guard, to its build" bash -c \
  '[[ "$1" == *"SKIPPED: the step 1 guard"* ]] && [[ "$1" != *"REFUSED: step 1 is not green"* ]] && [[ "$1" == *"DOCKER RELEASE STEP 2/6"* ]]' _ "$out"
docker_part() { ( cd "$SANDBOX" && RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$SC" MODE=rehearsal UPLOAD=no DRY_RUN=yes DOCKER_RELEASE_PART="$1" bash asbl/ci/jenkins/release-docker.sh 2>&1 ); }
out=$(docker_part build)
check "  its build part (the runners' round): the build (2/6), then it ends: no Linux proof, green" bash -c \
  'grep -q "^######## DOCKER RELEASE STEP 2/6 END rc=0" <<< "$1" && grep -q "^dry run: DOCKER_RELEASE_PART=build ends here" <<< "$1" &&
   ! grep -q "STEP 3/6" <<< "$1" && grep -q "^DOCKER_RELEASE=SUCCESS" <<< "$1"' _ "$out"
out=$(docker_part linux-proof)
check "  its linux-proof part: on the build the build part made (nothing built), the Linux proof (3/6), green" bash -c \
  'grep -q "^######## DOCKER RELEASE STEP 2/6 START .* the build the linux or build part made of .* nothing is built here" <<< "$1" &&
   grep -q "^######## DOCKER RELEASE STEP 3/6 END rc=0" <<< "$1" && grep -q "^dry run: DOCKER_RELEASE_PART=linux-proof ends here" <<< "$1" &&
   grep -q "^DOCKER_RELEASE=SUCCESS" <<< "$1"' _ "$out"
free_the_lock

echo "---- 3. upload-kept still refuses either channel without step 1 green ----"
export RELEASE_ARTIFACTS_DIR="$SCRATCH/artifacts"
KEPT="$RELEASE_ARTIFACTS_DIR/$V-${SC:0:8}"; mkdir -p "$KEPT"
sha() { sha256sum "$1" | cut -d' ' -f1; }
for name in datapallas-server-docker.zip datapallas.zip datapallas-server.zip datapallas-src.zip; do echo "the kept $name" > "$KEPT/$name"; done
{ echo "version=$V"; echo "commit=$SC"; echo "docker.result=PASS"
  echo "docker.file=datapallas-server-docker.zip size=$(stat -c %s "$KEPT/datapallas-server-docker.zip") sha256=$(sha "$KEPT/datapallas-server-docker.zip")"
  echo "docker.image=flowkraft/datapallas-server:$V id=sha256:the-kept-image built_as=flowkraft/datapallas-server:$V-${SC:0:7}"
  echo "windows.result=PASS"
  for name in datapallas.zip datapallas-server.zip datapallas-src.zip; do
    echo "windows.file=$name size=$(stat -c %s "$KEPT/$name") sha256=$(sha "$KEPT/$name")"
  done; } > "$KEPT/MANIFEST.txt"
export RELEASE_STATE_DIR="$SCRATCH/upload-state"; mkdir -p "$RELEASE_STATE_DIR"
( cd "$SANDBOX" &&
  RELEASE_COMMIT="$SC" bash asbl/ci/release-state.sh full-lane --choose >/dev/null 2>&1
  RELEASE_COMMIT="$SC" bash asbl/ci/release-state.sh record rehearsal.docker PASS "version=$V" linux=PASS windows=PASS \
    "zip_sha256=$(sha "$KEPT/datapallas-server-docker.zip")" >/dev/null
  RELEASE_COMMIT="$SC" bash asbl/ci/release-state.sh record rehearsal.windows PASS "version=$V" pack=PASS server_light=PASS electron_light=PASS robot=PASS \
    "sha256=datapallas.zip:$(sha "$KEPT/datapallas.zip") datapallas-server.zip:$(sha "$KEPT/datapallas-server.zip") datapallas-src.zip:$(sha "$KEPT/datapallas-src.zip")" >/dev/null )
hold_the_lock
for ch in docker windows; do
  out=$( cd "$SANDBOX" && RELEASE_STEP1_AT_SIGNOFF=yes RELEASE_PIN="$SC" DRY_RUN=yes UPLOAD=no bash asbl/ci/release-publish.sh upload-kept "$ch" 2>&1 )
  check "upload-kept $ch, no step 1 lane, the switch set and the lock held: refused at the step 1 check" bash -c \
    '[[ "$1" == *"ok: the kept $2 files are the ones rehearsal.$2 proved"* ]] && [[ "$1" == *"REFUSED  step 1 is not green on ${3:0:8}"* ]] &&
     [[ "$1" == *"UPLOAD_KEPT REFUSED: nothing pushed, uploaded or recorded"* ]]' _ "$out" "$ch" "$SC"
done
free_the_lock

echo "---- 4. a run after fixes: every lane, step 1's included ----"
record after-fixes
RELEASE_COMMIT="$C" $STATE record "step1.$FULL-full" PASS >/dev/null
RELEASE_COMMIT="$C" $STATE record step1.docker-server-auth PASS >/dev/null
dry_run after-fixes EXECUTION=2
check "EXECUTION=2, both lanes green on the pin already: both listed to run" has \
  "step 1  to run: step1.docker-server-auth step1.$FULL-full, whatever the release record says (a run after fixes starts from scratch, step 1 included)" "$(cat "$LOG")"
check "  and both run, with the rest" bash -c \
  '[ "$(sed -n "s/^PART    \([^ ]*\) START .*/\1/p" "$1" | sort | paste -sd" ")" = "docker-keep docker-linux docker-windows lane1-$2-full lane2-docker-server-auth windows-after-pack windows-pack" ]' _ "$LOG" "$FULL"
dry_run after-fixes-in-order EXECUTION=2 RELEASE_STEPS=in-order
check "RELEASE_STEPS=in-order, the same record: 16.6.2's rule, the green lanes not run again" bash -c \
  'grep -q "^step 1  docker-server-auth is green for ${2:0:8} already" "$1" && grep -q "^step 1  to run: nothing;" "$1" && ! grep -q "^PART    lane" "$1"' _ "$LOG" "$C"

echo "---- 5. two parts asking for one commit's build at once: one build ----"
B="$SCRATCH/build-once"; mkdir -p "$B"
cat > "$B/caller.sh" <<'CALLER'
#!/bin/bash
# one part asking for the build: is it built (the marker), else the build (two seconds, then the marker)
. "$1/asbl/ci/build-once.sh"
dir="$2"
is_built() { [ -e "$dir/built" ]; }
fake_build() { echo "build by $3" >> "$dir/builds.log"; sleep 2; touch "$dir/built"; }
build_once "$dir/build.lock" is_built fake_build "$dir" x "$3"; rc=$?
echo "$3 BUILD_ONCE=$BUILD_ONCE rc=$rc"
CALLER
bash "$B/caller.sh" "$REPO_ROOT" "$B" first > "$B/first.out" 2>&1 & p1=$!
sleep 0.3
bash "$B/caller.sh" "$REPO_ROOT" "$B" second > "$B/second.out" 2>&1 & p2=$!
wait "$p1" "$p2"
check "two parts at once: one build" same "build by first" "$(cat "$B/builds.log")"
check "  the first builds, the second waits for it and finds it built" same \
  "first BUILD_ONCE=built rc=0|second BUILD_ONCE=meanwhile rc=0" "$(tail -qn1 "$B/first.out" "$B/second.out" | paste -sd'|')"
check "  the second said it waited" has "BUILD: another part is building (or checking) now: waiting for it to end" "$(cat "$B/second.out")"
bash "$B/caller.sh" "$REPO_ROOT" "$B" third > "$B/third.out" 2>&1
check "  a third later: built already, no lock asked" same "third BUILD_ONCE=already rc=0" "$(tail -n1 "$B/third.out")"
check "dp-ci.sh build-if-needed starts its build only through build_once" bash -c \
  '[ "$(grep -c "asbl/ci/dp-ci.sh\" build" asbl/ci/dp-ci.sh)" = 1 ] && grep -B1 "asbl/ci/dp-ci.sh\" build" asbl/ci/dp-ci.sh | grep -q "build_once \"\$LOG_DIR/build-if-needed.lock\" is_built"'

echo "---- 6. RELEASE_STEPS=in-order: 16.6.2's dry run ----"
record in-order
dry_run in-order RELEASE_STEPS=in-order
check "step 1's lanes first, on this host, then steps 2 and 3" bash -c \
  "$(declare -f line_of before); [ \"\$(sed -n 's/^PART    \([^ ]*\) START .*/\1/p' \"\$1\" | head -3 | paste -sd' ')\" = 'step1-build lane2-docker-server-auth lane1-$FULL-full' ] &&
   before \"\$1\" 'PART    lane1-$FULL-full END' 'PART    windows-pack START' && before \"\$1\" 'PART    lane1-$FULL-full END' 'PART    docker-linux START' &&
   before \"\$1\" '######## STEP 1 END' '######## EXECUTION 1 START'" _ "$LOG"
check "  no part gets the switch" lacks "RELEASE_STEP1_AT_SIGNOFF" "$(cat "$LOG")"
check "  16.6.2's ORDER lines" same \
"ORDER   step 1     host: step1-build (when a lane takes the build), lane2-docker-server-auth, lane1-$FULL-full, done
                   VM: nothing (step 1 runs on this host only)
        execution  host: build + linux-proof (step 2, DOCKER_RELEASE_PART=linux), then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended
                   VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),
                   then server-light (on datapallas-server.zip of pack, kept) + electron-light + robot + windows-verdict
                   (WIN_RELEASE_HALF=after-pack); never two VM parts at once" "$(grep -A5 '^ORDER   ' "$LOG")"
check "  the same parts and verdicts as 16.6.2's" same \
  "0 green green step1-build:PASS lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:PASS windows-docker-proof:PASS server-light:PASS electron-light:PASS robot:PASS docker-verdict:PASS windows-verdict:PASS" \
  "$RC $(key result) $(key step1) $(parts)"
check "nothing was run, built, pushed, loaded or saved in Docker" bash -c '! grep -q "^docker \(run\|push\|build\|load\|save\)" "$1"' _ "$STUB_CALLS"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-step-independence"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-step-independence"; exit 1

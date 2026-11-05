#!/bin/bash
# Any number of Windows VMs (WIN_VM=<name>; asbl/ci/win-vm.sh, dp-ci.sh, asbl/ci/jenkins/win-e2e.sh, and a round's VMs in
# asbl/ci/release-machines.sh and the orchestrator). The cases:
#   1. dp-ci.sh: each VM's commands go to its own host (VM a: win-ci.env; b, c, d: their win-ci-<name>.env, WIN_HOST
#      only); a VM with no settings file, an open one or one without WIN_HOST stops before any SSH, never on VM a's host;
#   2. win-e2e.sh: each VM its own pid file (its lock), log names and latest link, VM a 16.6.2's; two runs on one VM at
#      once: the second refused; VMs a to d at once: all four run, each driver on its own VM;
#   3. a round's VMs (stub virsh): WIN_VM_MEMORY_GB (12, or 10 when set) as a VM's defined memory when it differs
#      (--config, never above its maximum); an off VM started and waited for until it answers over SSH; no answer in time:
#      "did not start"; shut down (virsh shutdown), or virsh destroy when it hangs; a VM off already left as it is;
#   4. the orchestrator's dry runs: VM a running at 12 GB: no VM line, the dry run of before; VM a off at 24 GB: its
#      memory, its start before its first part, its shutdown after its last part and before the run's end, a dry-run
#      domain line in started.txt, virsh asked only what is; DRY_RUN_RED=vm-a: its parts red, the host's parts green,
#      the run red, the VM still shut down.
# The stop of a VM a round started: asbl/ci/tests/test-release-stop.sh.
# Every folder is a scratch one; ssh and virsh are stubs first on PATH (virsh keeps each VM's state and memory in the
# scratch folder): nothing is started on this host, no settings file of this host is read. Takes about 90 seconds.
# Callers: a person or an agent, from the shell, after changing how a VM is picked, started or shut down.
#   bash asbl/ci/tests/test-vms.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-vms.XXXXXX") || exit 2
cleanup() {
  local f; for f in "$SCRATCH"/logs/win-e2e*.pid; do [ -f "$f" ] && kill -KILL -- "-$(cat "$f")" 2>/dev/null; done
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
has() {  # has <text> <text to search>
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}
before() {  # before <log> <text> <later text>: the first line with <text> comes before the first with <later text>
  local a b; a=$(grep -n -m1 -F -- "$2" "$1" | cut -d: -f1); b=$(grep -n -m1 -F -- "$3" "$1" | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || { echo "      \"$2\" at line ${a:-none}, \"$3\" at line ${b:-none}"; return 1; }
}

# ---- the stubs: ssh and virsh; the VMs' settings files ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin" "$STUB/vms" "$SCRATCH/vm-conf" "$SCRATCH/logs"
cat > "$STUB/bin/ssh" <<'EOF'
#!/bin/bash
# stub ssh: records "<user@host> <command>"; the VM answers when its stub domain runs, and no $STUB/no-ssh-<host> is there
target=""; skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in -i|-o) skip=1 ;; -*) ;; *) [ -z "$target" ] && target="$a" ;; esac
done
host="${target#*@}"
echo "$target ${*: -1}" | cut -c1-200 >> "$STUB/ssh-calls"
case "$host" in vm-a.invalid) dom=win10-dev ;; vm-*.invalid) dom="win10-dev-${host#vm-}"; dom="${dom%.invalid}" ;; *) dom="" ;; esac
[ -e "$STUB/no-ssh-$host" ] && { echo "ssh: connect to host $host port 22: Connection timed out" >&2; exit 255; }
[ -z "$dom" ] || [ "$(cat "$STUB/vms/$dom.state" 2>/dev/null)" = running ] ||
  { echo "ssh: connect to host $host port 22: No route to host" >&2; exit 255; }
echo "Microsoft Windows [Version 10.0.19045.0]"
EOF
cat > "$STUB/bin/virsh" <<'EOF'
#!/bin/bash
# stub virsh: each domain is $STUB/vms/<domain>.state (running | shut off) and .mem / .cur (its defined maximum and current
# memory, KiB); every call that changes something is recorded in $STUB/virsh-calls; shutdown of a domain with a .hangs
# file does nothing
v="$STUB/vms"
case "${1:-}" in
  domstate) [ -e "$v/$2.state" ] || { echo "error: failed to get domain '$2'" >&2; exit 1; }; cat "$v/$2.state" ;;
  dumpxml)  d="${*: -1}"; [ -e "$v/$d.state" ] || exit 1
            printf "<domain type='kvm'>\n  <name>%s</name>\n  <memory unit='KiB'>%s</memory>\n  <currentMemory unit='KiB'>%s</currentMemory>\n</domain>\n" \
              "$d" "$(cat "$v/$d.mem")" "$(cat "$v/$d.cur" 2>/dev/null || cat "$v/$d.mem")" ;;
  setmaxmem) echo "virsh $*" >> "$STUB/virsh-calls"; [ "$(cat "$v/$2.cur" 2>/dev/null || echo 0)" -le "$3" ] || { echo "error: current above max" >&2; exit 1; }; echo "$3" > "$v/$2.mem" ;;
  setmem)   echo "virsh $*" >> "$STUB/virsh-calls"; [ "$3" -le "$(cat "$v/$2.mem")" ] || { echo "error: cannot set memory higher than max memory" >&2; exit 1; }; echo "$3" > "$v/$2.cur" ;;
  start)    echo "virsh $*" >> "$STUB/virsh-calls"; echo running > "$v/$2.state" ;;
  shutdown) echo "virsh $*" >> "$STUB/virsh-calls"; [ -e "$v/$2.hangs" ] || echo "shut off" > "$v/$2.state" ;;
  destroy)  echo "virsh $*" >> "$STUB/virsh-calls"; echo "shut off" > "$v/$2.state" ;;
  *)        echo "virsh $*" >> "$STUB/virsh-calls"; exit 1 ;;
esac
EOF
chmod +x "$STUB/bin/ssh" "$STUB/bin/virsh"
export PATH="$STUB/bin:$PATH"
GB=1048576   # KiB
# vm_is <domain> <state> <memory GB> [<current GB>]: a stub domain
vm_is() { echo "$2" > "$STUB/vms/$1.state"; echo $(($3 * GB)) > "$STUB/vms/$1.mem"; echo $((${4:-$3} * GB)) > "$STUB/vms/$1.cur"; rm -f "$STUB/vms/$1.hangs"; }
for d in win10-dev win10-dev-b win10-dev-c win10-dev-d; do vm_is "$d" running 12; done
export WIN_CI_CONF="$SCRATCH/vm-conf/win-ci.env" WIN_VM_CONF_DIR="$SCRATCH/vm-conf"
printf 'WIN_HOST=vm-a.invalid\nWIN_USER=ci\nWIN_SSH_KEY=%s\nWIN_KNOWN_HOSTS=%s\nWIN_REPO=C:/ci/repo\n' "$SCRATCH/stub-key" "$SCRATCH/stub-known-hosts" > "$WIN_CI_CONF"
: > "$SCRATCH/stub-key"; : > "$SCRATCH/stub-known-hosts"   # empty stand-ins: the stub ssh reads neither
for v in b c d; do echo "WIN_HOST=vm-$v.invalid" > "$SCRATCH/vm-conf/win-ci-$v.env"; done
echo "WIN_HOST=vm-x.invalid" > "$SCRATCH/vm-conf/win-ci-x.env"; echo "# no address" > "$SCRATCH/vm-conf/win-ci-y.env"
chmod 600 "$SCRATCH"/vm-conf/*; chmod 644 "$SCRATCH/vm-conf/win-ci-x.env"
export RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf" RELEASE_PUBLISH_ENV="$SCRATCH/no-release-publish.env"
export LOG_DIR="$SCRATCH/logs"
unset WIN_VM WIN_HOST WIN_USER WIN_SSH_KEY WIN_KNOWN_HOSTS WIN_VM_MEMORY_GB RELEASE_WINDOWS_VMS RELEASE_STEPS RELEASE_PIN \
  DRY_RUN_RED E2E_APPROVAL UPLOAD MODE SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS

echo "---- 1. dp-ci.sh: each VM's commands to its own host ----"
for v in a b c d; do
  : > "$STUB/ssh-calls"
  out=$(WIN_VM=$v bash asbl/ci/dp-ci.sh win ssh ver 2>&1); rc=$?
  check "WIN_VM=$v: ver answered, sent to ci@vm-$v.invalid only" bash -c \
    '[ "$1" = 0 ] && [[ "$2" == *"Microsoft Windows"* ]] && [ "$(cut -d" " -f1 "$3" | sort -u)" = "ci@vm-$4.invalid" ]' _ "$rc" "$out" "$STUB/ssh-calls" "$v"
done
: > "$STUB/ssh-calls"
out=$(bash asbl/ci/dp-ci.sh win ssh ver 2>&1)
check "no WIN_VM: VM a's host" same "ci@vm-a.invalid ver" "$(cat "$STUB/ssh-calls")"
for c in "e|2|no settings file $SCRATCH/vm-conf/win-ci-e.env" "x|1|must be readable by root only" \
         "y|2|no WIN_HOST in $SCRATCH/vm-conf/win-ci-y.env" "B|2|a VM's name is lowercase letters and digits"; do
  IFS='|' read -r v want text <<< "$c"
  : > "$STUB/ssh-calls"
  out=$(WIN_VM=$v bash asbl/ci/dp-ci.sh win ssh ver 2>&1); rc=$?
  check "WIN_VM=$v: refused (exit $want, \"$text\"), no SSH at all" bash -c \
    '[ "$1" = "$2" ] && [[ "$3" == *"$4"* ]] && [ ! -s "$5" ]' _ "$rc" "$want" "$out" "$text" "$STUB/ssh-calls"
done
out=$(WIN_VM=b bash asbl/ci/dp-ci.sh win check 2>&1)
check "win check names VM b's settings file after win-ci.env" has "target: configured from $WIN_CI_CONF, then $SCRATCH/vm-conf/win-ci-b.env (VM b)" "$out"

echo "---- 2. win-e2e.sh: each VM its own pid file, logs and lock ----"
R="$SCRATCH/repo"; mkdir -p "$R/asbl/ci/jenkins"
cp asbl/ci/win-vm.sh "$R/asbl/ci/"; cp asbl/ci/jenkins/win-e2e.sh "$R/asbl/ci/jenkins/"
cat > "$R/asbl/ci/dp-ci.sh" <<'EOF'
#!/bin/bash
# stub dp-ci.sh: the driver's command, and the VM it drives; it lasts until $STUB/release-<vm> is there (10 s at most)
echo "dp-ci.sh $* on VM ${WIN_VM:-unset}"
for _ in $(seq 1 100); do [ -e "$STUB/release-${WIN_VM:-unset}" ] && break; sleep 0.1; done
EOF
git -C "$R" init -q && git -C "$R" add -A && git -C "$R" -c user.name=test -c user.email=test@example.invalid commit -qm stub
launch() { ( cd "$R" && env ${1:+WIN_VM=$1} bash asbl/ci/jenkins/win-e2e.sh release 2>&1 ); }   # launch [<vm>]
L="$SCRATCH/logs"
out_b=$(launch b); rc_b=$?
check "VM b: started, its pid file win-e2e-b.pid alive" bash -c '[ "$1" = 0 ] && kill -0 "$(cat "$2")" 2>/dev/null' _ "$rc_b" "$L/win-e2e-b.pid"
check "  its log *-win-b-release-*.log, linked by win-e2e-b-latest.log" bash -c \
  '[[ "$(readlink "$1")" == "$2"/*-win-b-release-*.log ]] && [[ "$3" == *"(also $1)"* ]]' _ "$L/win-e2e-b-latest.log" "$L" "$out_b"
out=$(launch b); rc=$?
check "a second run on VM b while the first goes: refused (exit 1), the first's pid named" bash -c \
  '[ "$1" = 1 ] && [[ "$2" == *"a Windows e2e run is already going on VM b (pid $(cat "$3"))"* ]]' _ "$rc" "$out" "$L/win-e2e-b.pid"
out_c=$(launch c); rc_c=$?
check "VM c at the same time: started, its own pid file" bash -c '[ "$1" = 0 ] && kill -0 "$(cat "$2")" 2>/dev/null' _ "$rc_c" "$L/win-e2e-c.pid"
out_d=$(launch d); rc_d=$?
check "VM d at the same time: started, its own pid file" bash -c '[ "$1" = 0 ] && kill -0 "$(cat "$2")" 2>/dev/null' _ "$rc_d" "$L/win-e2e-d.pid"
out_a=$(launch); rc_a=$?
check "VM a (no WIN_VM): 16.6.2's names, win-e2e.pid and win-e2e-latest.log, *-win-release-*.log" bash -c \
  '[ "$1" = 0 ] && kill -0 "$(cat "$2/win-e2e.pid")" 2>/dev/null && [[ "$(readlink "$2/win-e2e-latest.log")" == "$2"/*-win-release-*.log ]] && [[ "$(readlink "$2/win-e2e-latest.log")" != *-win-a-* ]]' \
  _ "$rc_a" "$L"
check "every VM's pid file listed while they run (win_vm_pidfiles)" same "$L/win-e2e-b.pid $L/win-e2e-c.pid $L/win-e2e-d.pid $L/win-e2e.pid" \
  "$(LOG_DIR="$L" bash -c '. asbl/ci/win-vm.sh; win_vm_pidfiles' | LC_ALL=C sort | paste -sd' ')"
touch "$STUB/release-a" "$STUB/release-b" "$STUB/release-c" "$STUB/release-d"
for _ in $(seq 1 50); do [ -z "$(ls "$L"/win-e2e*.pid 2>/dev/null)" ] && break; sleep 0.2; done
check "each driver drove its own VM and ended green, its pid file gone" bash -c \
  'grep -q "^dp-ci.sh win release on VM b$" "$(readlink "$1/win-e2e-b-latest.log")" && grep -q "^dp-ci.sh win release on VM c$" "$(readlink "$1/win-e2e-c-latest.log")" &&
   grep -q "^dp-ci.sh win release on VM d$" "$(readlink "$1/win-e2e-d-latest.log")" &&
   grep -q "^dp-ci.sh win release on VM a$" "$(readlink "$1/win-e2e-latest.log")" && grep -q "^PIPELINE_RESULT=SUCCESS" "$(readlink "$1/win-e2e-b-latest.log")" &&
   [ -z "$(ls "$1"/win-e2e*.pid 2>/dev/null)" ]' _ "$L"
check "dp-ci.sh's free-VM check reads the pid file of its VM" bash -c \
  'grep -A1 "^      vm-free)" asbl/ci/dp-ci.sh | grep -q "pidfile=\$(win_vm_pidfile)"'

echo "---- 3. a round's VMs: memory, start, SSH, shutdown (stub virsh) ----"
lib() { bash -c '. asbl/ci/release-machines.sh; machines_load && "$@"' _ "$@" 2>&1; }   # lib <function> <args...>
: > "$STUB/virsh-calls"; vm_is win10-dev-b "shut off" 24
out=$(lib machines_vm_memory_set b)
check "VM b at 24 GB: 12 GB (the default), the current memory first, then the maximum, --config" same \
  "virsh setmem win10-dev-b 12582912 --config|virsh setmaxmem win10-dev-b 12582912 --config" "$(paste -sd'|' "$STUB/virsh-calls")"
check "  said, with both numbers" has "VM      b (win10-dev-b): its memory set to 12 GB, from 24 GB (--config: it takes it at its next start)" "$out"
: > "$STUB/virsh-calls"; out=$(lib machines_vm_memory_set b)
check "  at 12 GB already: nothing set, nothing said" bash -c '[ -z "$1" ] && [ ! -s "$2" ]' _ "$out" "$STUB/virsh-calls"
: > "$STUB/virsh-calls"; out=$(WIN_VM_MEMORY_GB=10 lib machines_vm_memory_set b)
check "WIN_VM_MEMORY_GB=10: 10 GB" same "virsh setmem win10-dev-b 10485760 --config|virsh setmaxmem win10-dev-b 10485760 --config" "$(paste -sd'|' "$STUB/virsh-calls")"
: > "$STUB/virsh-calls"; out=$(lib machines_vm_memory_set b)
check "  back to 12 GB, higher: the maximum first (current never above it)" same \
  "virsh setmaxmem win10-dev-b 12582912 --config|virsh setmem win10-dev-b 12582912 --config" "$(paste -sd'|' "$STUB/virsh-calls")"
vm_is win10-dev-b "shut off" 12 8; : > "$STUB/virsh-calls"; out=$(lib machines_vm_memory_set b)
check "  a current memory that differs (8 of 12 GB): set too" same \
  "virsh setmaxmem win10-dev-b 12582912 --config|virsh setmem win10-dev-b 12582912 --config" "$(paste -sd'|' "$STUB/virsh-calls")"
vm_is win10-dev-b "shut off" 24; : > "$STUB/virsh-calls"; out=$(lib machines_vm_memory_set b dry)
check "  dry: what it would do, nothing set" bash -c '[[ "$1" == "WOULD   VM b (win10-dev-b): its memory set to 12 GB (now 24 GB;"* ]] && [ ! -s "$2" ]' _ "$out" "$STUB/virsh-calls"
vm_is win10-dev-c "shut off" 12; : > "$STUB/virsh-calls"
out=$(VM_SSH_WAIT_SECS=6 VM_POLL_SECS=1 lib machines_vm_start c); rc=$?
check "an off VM: virsh start, waited for until it answers over SSH (exit 0)" bash -c \
  '[ "$1" = 0 ] && [ "$(cat "$2")" = "virsh start win10-dev-c" ] && [[ "$3" == *"VM      c (win10-dev-c): answers over SSH"* ]] && [ "$(cat "$4")" = running ]' \
  _ "$rc" "$STUB/virsh-calls" "$out" "$STUB/vms/win10-dev-c.state"
vm_is win10-dev-d "shut off" 12; touch "$STUB/no-ssh-vm-d.invalid"
out=$(VM_SSH_WAIT_SECS=3 VM_POLL_SECS=1 lib machines_vm_start d); rc=$?
check "no SSH answer in time: exit 1, \"did not start\" (its lanes are red)" bash -c \
  '[ "$1" = 1 ] && [ "$(printf "%s\n" "$2" | tail -1)" = "VM d (win10-dev-d) did not start: no SSH answer within 3 s of virsh start" ]' _ "$rc" "$out"
rm -f "$STUB/no-ssh-vm-d.invalid"
: > "$STUB/virsh-calls"; out=$(VM_SHUTDOWN_WAIT_SECS=3 VM_POLL_SECS=1 lib machines_vm_shutdown c)
check "shut down: virsh shutdown, off" bash -c '[ "$(cat "$1")" = "virsh shutdown win10-dev-c" ] && [ "$(cat "$2")" = "shut off" ] && [[ "$3" == *"shut down (virsh shutdown)"* ]]' \
  _ "$STUB/virsh-calls" "$STUB/vms/win10-dev-c.state" "$out"
vm_is win10-dev-c running 12; touch "$STUB/vms/win10-dev-c.hangs"; : > "$STUB/virsh-calls"
out=$(VM_SHUTDOWN_WAIT_SECS=2 VM_POLL_SECS=1 lib machines_vm_shutdown c)
check "  a VM that hangs: virsh destroy after VM_SHUTDOWN_WAIT_SECS" bash -c \
  '[ "$(paste -sd"|" "$1")" = "virsh shutdown win10-dev-c|virsh destroy win10-dev-c" ] && [ "$(cat "$2")" = "shut off" ] && [[ "$3" == *"still running 2 s after virsh shutdown: virsh destroy"* ]]' \
  _ "$STUB/virsh-calls" "$STUB/vms/win10-dev-c.state" "$out"
vm_is win10-dev-d "shut off" 12; : > "$STUB/virsh-calls"; out=$(lib machines_vm_shutdown d)
check "  off already: nothing done" bash -c '[ ! -s "$1" ] && [[ "$2" == *"off already"* ]]' _ "$STUB/virsh-calls" "$out"

echo "---- 4. the orchestrator's dry runs ----"
C=$(git rev-parse HEAD)
# a scratch release record with this release's full lane chosen on C (FULL: web or docker-server)
export RELEASE_STATE_DIR="$SCRATCH/state"; mkdir -p "$RELEASE_STATE_DIR"
FULL=$(RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
dry_run() {  # dry_run <name> [VAR=value...]: a dry run pinned to C on the scratch record; RUN its folder, LOG its console
  local dir="$SCRATCH/run-$1"; shift
  mkdir -p "$dir/logs" "$dir/artifacts"
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_ARTIFACTS_DIR="$dir/artifacts" \
    RELEASE_PIN="$C" ORCH_STARTED_BY=test-vms DRY_RUN=yes "$@" bash asbl/ci/jenkins/release-orchestrator.sh > "$dir/console.log" 2>&1
  RC=$?; RUN=$(ls -1d "$dir"/runs/*release-orchestrator*/ 2>/dev/null | tail -1); LOG="$dir/console.log"
}
key() { sed -n "s/^$1=//p" "$RUN/result.txt"; }
parts() { awk -F'\t' '$1 == "part" { printf "%s%s:%s", s, $2, $4; s = " " }' "$RUN/result.txt"; }
domains() { awk -F'\t' '$3 == "domain" { print $2 ":" $4 ":" $5 }' "$RUN/started.txt" | paste -sd' '; }
vm_is win10-dev running 12; : > "$STUB/virsh-calls"
dry_run running
check "VM a running at 12 GB: green, no VM line, no domain line in started.txt (the dry run of before)" bash -c \
  '[ "$1 $2" = "0 green" ] && ! grep -qE "^(WOULD   VM |WARN    VM |VM  )" "$3" && [ -z "$4" ]' _ "$RC" "$(key result)" "$LOG" "$(domains)"
vm_is win10-dev "shut off" 24
dry_run off
check "VM a off at 24 GB: green, its memory said before any part" bash -c \
  "$(declare -f before); [ \"\$1 \$2\" = '0 green' ] && before \"\$3\" 'WOULD   VM a (win10-dev): its memory set to 12 GB (now 24 GB;' 'PART    '" _ "$RC" "$(key result)" "$LOG"
check "  started before its first part, waited for (15 min at most)" before "$LOG" \
  "WOULD   VM a (win10-dev) is off: virsh start, then wait for its SSH (15 min at most)" "PART    windows-pack START"
check "  shut down after its last part, before the run's end" bash -c \
  "$(declare -f before); before \"\$1\" 'PART    windows-after-pack END' 'WOULD   VM a (win10-dev): shut down, its last part ended' &&
   before \"\$1\" 'WOULD   VM a (win10-dev): shut down, its last part ended' 'dry run: the sign-off'" _ "$LOG"
check "  started.txt: the VM, a dry-run domain line of part vm-a" same "vm-a:win10-dev:dry-run" "$(domains)"
check "  virsh asked only what is: nothing set, started or shut down" bash -c '[ ! -s "$1" ] && [ "$(cat "$2")" = "shut off" ]' \
  _ "$STUB/virsh-calls" "$STUB/vms/win10-dev.state"
dry_run off-10 WIN_VM_MEMORY_GB=10
check "  WIN_VM_MEMORY_GB=10: 10 GB" has "WOULD   VM a (win10-dev): its memory set to 10 GB (now 24 GB;" "$(cat "$LOG")"
dry_run red DRY_RUN_RED=vm-a
check "DRY_RUN_RED=vm-a: the VM's parts red without running, the host's green, the run red" same \
  "1 red green lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:FAIL windows-docker-proof:FAIL server-light:FAIL electron-light:FAIL robot:FAIL docker-verdict:FAIL windows-verdict:FAIL" \
  "$RC $(key result) $(key step1) $(parts)"
check "  each VM part says why; step 2's verdict: its Windows proof did not pass" same \
  "pack|windows-docker-proof|server-light|electron-light|robot|windows-verdict: VM a (win10-dev) did not start (DRY_RUN_RED) docker-verdict: the Windows Docker proof did not pass (docker-windows), so step 2 keeps nothing" \
  "$(awk -F'\t' '$1 == "part" && $4 == "FAIL" { w = $7; sub(/^FAILED: /, "", w); if ($2 == "docker-verdict") d = w; else { n = n s $2; s = "|"; if (v != "" && v != w) bad = 1; v = w } } END { print n ": " (bad ? "(the whys differ)" : v) " docker-verdict: " d }' "$RUN/result.txt")"
check "  none of them started, the VM still shut down" bash -c \
  '! grep -qE "^PART    (windows-pack|docker-windows|windows-after-pack) START" "$1" && grep -q "^WOULD   VM a (win10-dev): shut down" "$1"' _ "$LOG"
vm_is win10-dev running 12

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-vms"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-vms"; exit 1

#!/bin/bash
# Each VM runs its lanes from the layout (asbl/ci/jenkins/release-orchestrator.sh with USE_N_NUMBER_OF_WINDOWS_VMS=M; the
# layouts VM_LANES_<M>_<name> of asbl/ci/release-machines.sh), in the orchestrator's dry runs. The cases:
#   1. M = 1: the VM track of before: pack, the Windows Docker proof, then the after-pack half, one at a time; no prepare
#      part, no WIN_VM in its commands;
#   2. M = 2, 3 and 4: the schedule with its times, a line per VM part; each VM's parts in its layout's order, one at a
#      time, each command to its own VM (WIN_VM, its pid file); the server light set and Robot after the pack ended, the
#      Windows Docker proof after the build began; one e2e package per VM whose lanes test on one, never a prepare on a VM
#      other than the pack's: the pack's VM prepares (right after the pack: pack then the server light set on one VM), each
#      other VM takes a copy of the pack's (windows-package-<vm>), made once on the pack's VM after the pack started
#      (windows-package-from-pack), each copy after it; the schedule's copy rows from 58 min into the pack; step 3's
#      verdict on the pack's VM after every lane;
#   3. DRY_RUN_RED: a red build, pack, Windows Docker proof, light set or Robot gives the same verdicts with M = 4 as with
#      M = 1 (a red pack with M = 2 too); a VM that does not start: its lanes red, the other VMs' lanes run (the pack's VM:
#      the server light set elsewhere not run, no kept pack); no copy of the pack's (the pack red before its NoExeAssembler's
#      line, a check not met, a copy red): that VM prepares its own and every lane runs; its own prepare red too: its VM's
#      lane still runs.
# Every folder is a scratch one; ssh and virsh are stubs first on PATH, every VM running at 12 GB: nothing is started on
# this host, no settings file of this host is read. Takes about three minutes.
# Callers: a person or an agent, from the shell, after changing how a round spreads its Windows lanes over its VMs.
#   bash asbl/ci/tests/test-vm-lanes.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-vm-lanes.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}
before() {  # before <log> <text> <later text>: the first line with <text> comes before the first with <later text>
  local a b; a=$(grep -n -m1 -F -- "$2" "$1" | cut -d: -f1); b=$(grep -n -m1 -F -- "$3" "$1" | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || { echo "      \"$2\" at line ${a:-none}, \"$3\" at line ${b:-none}"; return 1; }
}
one_at_a_time() {  # one_at_a_time <log> <part>...: each part starts after the one before it ended
  local log="$1" prev="$2"; shift 2
  for p in "$@"; do before "$log" "PART    $prev END" "PART    $p START" || return 1; prev="$p"; done
}

# ---- the stubs: ssh and virsh (every VM running at 12 GB); the VMs' settings files ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin" "$STUB/vms" "$SCRATCH/vm-conf"
cat > "$STUB/bin/ssh" <<'EOF'
#!/bin/bash
# stub ssh: records its last argument, answers as a Windows VM
echo "${*: -1}" | cut -c1-200 >> "$STUB/ssh-calls"
echo "Microsoft Windows [Version 10.0.19045.0]"
EOF
cat > "$STUB/bin/virsh" <<'EOF'
#!/bin/bash
# stub virsh: every domain of $STUB/vms at 12 GB, running unless its file says "shut off"; a call that would change
# something is recorded and refused
case "${1:-}" in
  domstate) [ -e "$STUB/vms/$2" ] || { echo "error: failed to get domain '$2'" >&2; exit 1; }; s=$(cat "$STUB/vms/$2"); echo "${s:-running}" ;;
  dumpxml)  d="${*: -1}"; [ -e "$STUB/vms/$d" ] || exit 1
            printf "<domain type='kvm'>\n  <name>%s</name>\n  <memory unit='KiB'>12582912</memory>\n  <currentMemory unit='KiB'>12582912</currentMemory>\n</domain>\n" "$d" ;;
  *)        echo "virsh $*" >> "$STUB/virsh-calls"; exit 1 ;;
esac
EOF
chmod +x "$STUB/bin/ssh" "$STUB/bin/virsh"
export PATH="$STUB/bin:$PATH"
for d in win10-dev win10-dev-b win10-dev-c win10-dev-d; do : > "$STUB/vms/$d"; done
export WIN_CI_CONF="$SCRATCH/vm-conf/win-ci.env" WIN_VM_CONF_DIR="$SCRATCH/vm-conf"
printf 'WIN_HOST=vm-a.invalid\nWIN_USER=ci\nWIN_SSH_KEY=%s\nWIN_KNOWN_HOSTS=%s\nWIN_REPO=C:/ci/repo\n' "$SCRATCH/stub-key" "$SCRATCH/stub-known-hosts" > "$WIN_CI_CONF"
: > "$SCRATCH/stub-key"; : > "$SCRATCH/stub-known-hosts"   # empty stand-ins: the stub ssh reads neither
for v in b c d; do echo "WIN_HOST=vm-$v.invalid" > "$SCRATCH/vm-conf/win-ci-$v.env"; done
chmod 600 "$SCRATCH"/vm-conf/*
export RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf" RELEASE_PUBLISH_ENV="$SCRATCH/no-release-publish.env"
unset WIN_VM WIN_HOST WIN_USER WIN_SSH_KEY WIN_KNOWN_HOSTS WIN_VM_MEMORY_GB RELEASE_STEPS RELEASE_PIN DRY_RUN_RED \
  E2E_APPROVAL UPLOAD MODE SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS
export RELEASE_WINDOWS_VMS="a b c d"   # the four VMs exist (the caller's environment goes before the settings file)

C=$(git rev-parse HEAD)
# a scratch release record with this release's full lane chosen on C
export RELEASE_STATE_DIR="$SCRATCH/state"; mkdir -p "$RELEASE_STATE_DIR"
FULL=$(RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
dry_run() {  # dry_run <name> [VAR=value...]: a dry run pinned to C on the scratch record; RUN its folder, LOG its console
  local dir="$SCRATCH/run-$1"; shift
  mkdir -p "$dir/logs" "$dir/artifacts"
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_ARTIFACTS_DIR="$dir/artifacts" \
    RELEASE_PIN="$C" ORCH_STARTED_BY=test-vm-lanes DRY_RUN=yes "$@" bash asbl/ci/jenkins/release-orchestrator.sh > "$dir/console.log" 2>&1
  RC=$?; RUN=$(ls -1d "$dir"/runs/*release-orchestrator*/ 2>/dev/null | tail -1); LOG="$dir/console.log"
}
key() { sed -n "s/^$1=//p" "$RUN/result.txt"; }
parts() { awk -F'\t' '$1 == "part" { printf "%s%s:%s", s, $2, $4; s = " " }' "$RUN/result.txt"; }
started() { grep -oE "^PART    $1 START" "$LOG" | awk '{print $2}' | paste -sd' '; }   # started <part regex>: in start order
# vm_parts <vm>: its parts; not windows-package-from-pack, which watches the pack's VM while it packs (its own cases)
vm_parts() { grep -E "^PART    [a-z0-9-]+ START .*VM $1[ ,']" "$LOG" | awk '$2 != "windows-package-from-pack" {print $2}' | paste -sd' '; }
# would_has <log> <text> <text>: one WOULD line of that console has both
would_has() { grep '^WOULD   RELEASE_PIN=' "$1" | grep -F -- "$2" | grep -qF -- "$3" || { echo "      no WOULD line with \"$2\" and \"$3\""; return 1; }; }
pidfile_of() { [ "$1" = a ] && echo "/win-e2e.pid" || echo "/win-e2e-$1.pid"; }

echo "---- 1. one VM: the VM track of before ----"
dry_run m1 USE_N_NUMBER_OF_WINDOWS_VMS=1
check "M = 1: green, the schedule for 1 Windows VM" bash -c '[ "$1 $2" = "0 green" ] && grep -q "^SCHEDULE .*; 1 Windows VM (a);" "$3"' \
  _ "$RC" "$(key result)" "$LOG"
check "  the VM's parts: pack, the Windows Docker proof, the after-pack half, one at a time" bash -c \
  "$(declare -f before one_at_a_time); [ \"\$1\" = 'windows-pack docker-windows windows-after-pack' ] &&
   one_at_a_time \"\$2\" windows-pack docker-windows windows-after-pack" _ "$(started '(windows-[a-z0-9-]+|docker-windows)')" "$LOG"
check "  the schedule: the prepare after the pack kept by it (0 min), the TOTAL" bash -c \
  'grep -qE "^  Win VM a e2e package \(NoExe\) +[0-9]+:[0-9]{2} -> +[0-9]+:[0-9]{2} +0 min  \(already built by the pack: seconds\)" "$1" && grep -q "^TOTAL " "$1"' _ "$LOG"
check "  no prepare or package part, no WIN_VM in any command, the VM's pid file 16.6.2's" bash -c \
  '! grep -q "windows-prepare\|windows-package\|WIN_PACK_LOG_SINCE" "$1" && ! grep -q "WIN_VM=" "$1" &&
   grep -q "WIN_RELEASE_HALF=pack FOLLOW_PIDFILE=.*/logs/win-e2e.pid " "$1"' _ "$LOG"

echo "---- 2. two, three and four VMs: each VM its lanes of the layout ----"
declare -A LAYOUT
LAYOUT[2a]="windows-pack windows-prepare-a windows-server-light windows-robot windows-verdict"
LAYOUT[2b]="windows-package-b docker-windows windows-electron-light"
LAYOUT[3a]="windows-pack windows-prepare-a windows-server-light windows-robot windows-verdict"
LAYOUT[3b]="windows-package-b docker-windows"
LAYOUT[3c]="windows-package-c windows-electron-light"
LAYOUT[4a]="windows-pack windows-robot windows-verdict"
LAYOUT[4b]="windows-package-b windows-server-light"
LAYOUT[4c]="windows-package-c windows-electron-light"
LAYOUT[4d]="windows-package-d docker-windows"
for m in 2 3 4; do
  vms=$(echo "a b c d" | cut -d' ' -f1-"$m")
  dry_run "m$m" USE_N_NUMBER_OF_WINDOWS_VMS="$m"
  check "M = $m: green, every part PASS" bash -c '[ "$1 $2" = "0 green" ] && [ -n "$3" ] && [[ "$3" != *":FAIL"* ]] && [[ "$3" != *":NOT_RUN"* ]]' \
    _ "$RC" "$(key result)" "$(parts)"
  check "  the schedule: $m Windows VMs, a timed line for each VM's lanes, the total" bash -c \
    'grep -q "^SCHEDULE .*; $2 Windows VMs ($3);" "$1" && grep -q "^TOTAL " "$1" &&
     for v in $3; do grep -qE "^  Win VM $v +[A-Za-z].* +[0-9]+:[0-9]{2} -> +[0-9]+:[0-9]{2} +[0-9]+ min" "$1" || exit 1; done' _ "$LOG" "$m" "$vms"
  check "  the ORDER says each VM's lanes and the verdict on VM a" bash -c \
    'grep -q "one track each, its lanes of the layout for $2 VMs" "$1" && grep -q "then windows-verdict on VM a once every lane ended" "$1" &&
     for v in $3; do grep -qE "^ +VM $v: " "$1" || exit 1; done' _ "$LOG" "$m" "$vms"
  for v in $vms; do
    exp=${LAYOUT[$m$v]}
    # shellcheck disable=SC2086
    check "  VM $v: $exp, one at a time" bash -c \
      "$(declare -f before one_at_a_time); [ \"\$1\" = \"\$2\" ] || { printf '      expected: %s\n      actual:   %s\n' \"\$2\" \"\$1\"; exit 1; }
       one_at_a_time \"\$3\" \$2" _ "$(vm_parts "$v")" "$exp" "$LOG"
    for p in $exp; do
      case "$p" in
        windows-prepare-*) w="win-e2e.sh prepare" ;; windows-package-*) w="win-e2e.sh package" ;;
        docker-windows) w="DOCKER_RELEASE_PART=windows" ;;
        *) w="WIN_RELEASE_HALF=${p#windows-} " ;;
      esac
      [ "$p" = docker-windows ] && pf="" || pf=$(pidfile_of "$v")
      check "    $p: to VM $v (WIN_VM=$v${pf:+, $pf})" bash -c \
        "$(declare -f would_has); would_has \"\$4\" \"\$1\" \"WIN_VM=\$2 \" && { [ -z \"\$3\" ] || would_has \"\$4\" \"\$1\" \"\$3\"; }" _ "$w" "$v" "$pf" "$LOG"
    done
  done
  others=$(for v in $vms; do case " ${LAYOUT[$m$v]} " in *" windows-package-$v "*) printf '%s ' "$v" ;; esac; done); others=${others% }
  check "  one e2e package part per VM whose lanes test on one: a prepare on VM a alone, a copy of the pack's on VM(s) $others" same \
    "$(for v in $vms; do printf '%s\n' ${LAYOUT[$m$v]}; done | grep -E '^windows-(prepare|package)-' | sort | paste -sd' ')" \
    "$(started 'windows-(prepare|package)-[a-z]+' | tr ' ' '\n' | sort | paste -sd' ')"
  check "  the pack's e2e package made once, on VM a, after the pack started: for VM(s) $others" bash -c \
    "$(declare -f before would_has); [ \"\$(grep -c '^PART    windows-package-from-pack START' \"\$1\")\" = 1 ] &&
     grep -q \"^PART    windows-package-from-pack START .*for VM(s) \$2, once this pack's NoExeAssembler finished\" \"\$1\" &&
     before \"\$1\" 'PART    windows-pack START' 'PART    windows-package-from-pack START' &&
     would_has \"\$1\" 'WIN_VM=a WIN_PACKAGE_PACK_RC=' 'dp-ci.sh win package-pull ' &&
     grep -q '^WIN_PACK_LOG_SINCE=' \"\$3/windows-pack.log\"" _ "$LOG" "$others" "$RUN"
  check "  each copy waits for it, its archive named, and says it is copied" bash -c \
    "$(declare -f before would_has); for v in \$2; do
       before \"\$1\" 'PART    windows-package-from-pack END' \"PART    windows-package-\$v END\" &&
       would_has \"\$1\" \"WIN_VM=\$v WIN_PACKAGE_ARCHIVE=\" '/e2e-package.tar WIN_PACKAGE_PULL_RC=' &&
       grep -q '^WIN_E2E_PACKAGE=copied from the pack' \"\$3/windows-package-\$v.log\" || exit 1; done" _ "$LOG" "$others" "$RUN"
  check "  no prepare on a VM other than the pack's" bash -c '! grep -qE "^PART    windows-prepare-[b-z][a-z0-9]* START" "$1"' _ "$LOG"
  check "  the schedule: VM(s) $others take the pack's copy 58 min into the pack (the default)" bash -c \
    'for v in $2; do grep -qE "^  Win VM $v e2e package \(from the pack\) +0:58 -> +[0-9]+:[0-9]{2} +[0-9]+ min  \(a copy of the pack.s, once its NoExeAssembler finished \(58 min into the pack\): no build, no JUnit\)" "$1" || exit 1; done
     ! grep -qE "^  Win VM [b-z] e2e package \(NoExe\)" "$1"' _ "$LOG" "$others"
  check "  the server light set and Robot after the pack ended" bash -c \
    "$(declare -f before); before \"\$1\" 'PART    windows-pack END' 'PART    windows-server-light START' &&
     before \"\$1\" 'PART    windows-pack END' 'PART    windows-robot START'" _ "$LOG"
  check "  the Windows Docker proof after the build began" before "$LOG" "PART    docker-linux START" "PART    docker-windows START"
  check "  step 3's verdict after every lane ended, the Docker keep after the Windows Docker proof" bash -c \
    "$(declare -f before); for p in windows-pack docker-windows windows-server-light windows-electron-light windows-robot; do
       before \"\$1\" \"PART    \$p END\" 'PART    windows-verdict START' || exit 1; done
     before \"\$1\" 'PART    docker-windows END' 'PART    docker-keep START'" _ "$LOG"
  check "  virsh asked only what is" bash -c '[ ! -s "$1" ]' _ "$STUB/virsh-calls"
done
check "pack then the server light set on one VM (M = 2, VM a): one prepare, right after the pack" bash -c \
  "$(declare -f before); [ \"\$(grep -c '^PART    windows-prepare-a START' \"\$1\")\" = 1 ] &&
   before \"\$1\" 'PART    windows-pack END' 'PART    windows-prepare-a START' &&
   before \"\$1\" 'PART    windows-prepare-a END' 'PART    windows-server-light START'" _ "$SCRATCH/run-m2/console.log"
check "  its schedule: VM a's prepare kept by the pack (0 min), VM b's a copy of the pack's from 0:58" bash -c \
  'grep -qE "^  Win VM a e2e package \(NoExe\) +1:17 -> +1:17 +0 min  \(already built by the pack: seconds\)" "$1" &&
   grep -qE "^  Win VM b e2e package \(from the pack\) +0:58 -> " "$1"' _ "$SCRATCH/run-m2/console.log"
check "  M = 4: none on VM a, whose lanes (pack, Robot) test on no e2e package" bash -c \
  '! grep -q "windows-prepare-a" "$1" && ! grep -q "^  Win VM a e2e package" "$1"' _ "$SCRATCH/run-m4/console.log"

echo "---- 3. DRY_RUN_RED: what still runs after a red part ----"
for red in build pack windows-docker-proof server-light electron-light robot; do
  dry_run "red-$red-m1" USE_N_NUMBER_OF_WINDOWS_VMS=1 DRY_RUN_RED="$red"; one="$RC $(key result) $(parts)"
  [ "$red" = pack ] && one_pack="$one"
  dry_run "red-$red-m4" USE_N_NUMBER_OF_WINDOWS_VMS=4 DRY_RUN_RED="$red"; four="$RC $(key result) $(parts)"
  check "DRY_RUN_RED=$red: red, the same verdicts with 4 VMs as with 1" bash -c '[[ "$1" == "1 red "* ]] && [ "$1" = "$2" ] ||
    { printf "      M = 1: %s\n      M = 4: %s\n" "$1" "$2"; exit 1; }' _ "$one" "$four"
done
dry_run red-pack-m2 USE_N_NUMBER_OF_WINDOWS_VMS=2 DRY_RUN_RED=pack
check "  DRY_RUN_RED=pack, 4 VMs: no copy of the pack's, VMs b c d each prepare their own" bash -c \
  'for v in b c d; do grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the pack ended before its NoExeAssembler finished (DRY_RUN_RED=pack)): VM $v prepares its own" "$1/windows-package-$v.log" || exit 1; done' \
  _ "$(ls -1d "$SCRATCH"/run-red-pack-m4/runs/*/ | tail -1)"
check "DRY_RUN_RED=pack, 2 VMs: the same verdicts as with 1; the server light set and Robot say there is no pack" bash -c \
  '[ "$1" = "$2" ] && grep -q "^not run: there is no kept pack" "$3/windows-server-light.log" && grep -q "^not run: there is no pack" "$3/windows-robot.log"' \
  _ "$RC $(key result) $(parts)" "$one_pack" "$RUN"
echo "shut off" > "$STUB/vms/win10-dev-b"   # DRY_RUN_RED=vm-<name> makes an off VM not start
dry_run red-vm-b USE_N_NUMBER_OF_WINDOWS_VMS=2 DRY_RUN_RED=vm-b
: > "$STUB/vms/win10-dev-b"
check "DRY_RUN_RED=vm-b, 2 VMs: VM b's lanes red, VM a's run, the host's green" same \
  "1 red lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:PASS windows-docker-proof:FAIL server-light:PASS electron-light:FAIL robot:PASS docker-verdict:FAIL windows-verdict:FAIL" \
  "$RC $(key result) $(parts)"
check "  VM b's parts not started, each says why" bash -c \
  '[ -z "$(grep -E "^PART    (windows-package-b|docker-windows|windows-electron-light) START" "$1")" ] &&
   grep -q "^PART    windows-package-b NOT RUN: VM b (win10-dev-b) did not start (DRY_RUN_RED)" "$1" &&
   grep -q "^PART    docker-windows RED: VM b (win10-dev-b) did not start (DRY_RUN_RED)" "$1" &&
   grep -q "^PART    windows-electron-light RED: VM b (win10-dev-b) did not start (DRY_RUN_RED)" "$1"' _ "$LOG"
echo "shut off" > "$STUB/vms/win10-dev"
dry_run red-vm-a USE_N_NUMBER_OF_WINDOWS_VMS=4 DRY_RUN_RED=vm-a
: > "$STUB/vms/win10-dev"
check "DRY_RUN_RED=vm-a, 4 VMs (the pack's VM): its lanes and the verdict red, the server light set not run, VM c and d's lanes run" same \
  "1 red lane2-docker-server-auth:PASS lane1-$FULL-full:PASS build:PASS linux-proof:PASS pack:FAIL windows-docker-proof:PASS server-light:NOT_RUN electron-light:PASS robot:FAIL docker-verdict:PASS windows-verdict:FAIL" \
  "$RC $(key result) $(parts)"
check "  the server light set on VM b not run: no kept pack" bash -c \
  'grep -q "^not run: there is no kept pack" "$1/windows-server-light.log" || { sed "s/^/        /" "$1/windows-server-light.log"; exit 1; }' _ "$RUN"
check "  the pack's VM down: no copy made (the pack never started), VMs c and d prepare their own" bash -c \
  'grep -q "^not run: the pack never started" "$1/windows-package-from-pack.log" &&
   for v in c d; do grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the pack never started .*VM $v prepares its own" "$1/windows-package-$v.log" || exit 1; done' _ "$RUN"
dry_run red-from-pack USE_N_NUMBER_OF_WINDOWS_VMS=4 DRY_RUN_RED=package-from-pack
check "DRY_RUN_RED=package-from-pack (a check not met), 4 VMs: green, every lane PASS; VMs b c d each prepare their own" bash -c \
  '[ "$1 $2" = "0 green" ] && [[ "$3" != *":FAIL"* ]] && [[ "$3" != *":NOT_RUN"* ]] &&
   for v in b c d; do grep -q "^WIN_E2E_PACKAGE=not copied from the pack (a check not met (DRY_RUN_RED=package-from-pack)): VM $v prepares its own" "$4/windows-package-$v.log" || exit 1; done' \
  _ "$RC" "$(key result)" "$(parts)" "$RUN"
dry_run red-copy USE_N_NUMBER_OF_WINDOWS_VMS=4 DRY_RUN_RED=package-c
check "DRY_RUN_RED=package-c (the copy to VM c red), 4 VMs: green, every lane PASS; VM c prepares its own, b and d copied" bash -c \
  '[ "$1 $2" = "0 green" ] && [[ "$3" != *":FAIL"* ]] && [[ "$3" != *":NOT_RUN"* ]] &&
   grep -q "^FAILED: the copy to VM c red" "$4/windows-package-c.log" && grep -q "^WIN_E2E_PACKAGE=not copied from the pack (the copy failed): VM c prepares its own" "$4/windows-package-c.log" &&
   for v in b d; do grep -q "^WIN_E2E_PACKAGE=copied from the pack" "$4/windows-package-$v.log" || exit 1; done' \
  _ "$RC" "$(key result)" "$(parts)" "$RUN"
dry_run red-prepare USE_N_NUMBER_OF_WINDOWS_VMS=4 DRY_RUN_RED="package-c prepare-c"
check "DRY_RUN_RED=\"package-c prepare-c\", 4 VMs: the copy and its own prepare red, VM c's Electron light set still runs after it" bash -c \
  "$(declare -f before); grep -q '^PART    windows-package-c END rc=1 ' \"\$1\" && before \"\$1\" 'PART    windows-package-c END' 'PART    windows-electron-light START' &&
   [[ \"\$2\" == *' electron-light:PASS '* ]]" _ "$LOG" "$(parts)"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-vm-lanes"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-vm-lanes"; exit 1

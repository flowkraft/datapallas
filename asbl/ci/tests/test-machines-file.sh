#!/bin/bash
# The machines file of a release round (asbl/ci/release-machines.sh, its example asbl/ci/release-layout.example.conf, and
# what the orchestrator does with it):
#   1. no file gives the defaults; the caller's environment goes before the file; a file others may read is refused;
#   2. every layout of the example file passes the rules, for every N and M (N above 1 runs in runners; with
#      RELEASE_RUNNERS=no refused: one Docker engine), and the example's layouts are the defaults;
#   3. each broken rule is refused, with its numbers: the steps, the values, too few VMs, a lane twice or missing, an
#      unknown lane, Robot not last or not on the pack's VM, Electron before the server light set; and at a press: a
#      VM's settings file or libvirt VM missing, the memory rule (only the VMs a round starts count; the runners and
#      this host's engine named), /var's free disk after what the runners take (a runner with no volume yet, one with);
#   4. the lane times read from release runs' marks (a dry run's folder ignored, a red part not used; a run with the
#      runners: their start and images from their marks, the Linux proof from its own part, the full set's time per
#      file from each runner's own report, not the slowest runner's time as the lane's; a round that copied the pack's
#      e2e package: its NoExeAssembler's line into the pack, the archive plus the slower put, not when the pull was
#      red), the expected schedule for 4 and 4 with the runners (each its list after its start, this host's auth file
#      and Linux proof beside them, the other VMs on the pack's copy), for 1 and 1 with RELEASE_RUNNERS=no, and for
#      in-order;
#   5. the orchestrator: RELEASE_STEPS=in-order gives 16.6.2's dry-run order, a dry run prints the schedule, and a
#      layout it cannot run is refused before anything starts.
# Every folder is a scratch one; virsh, df, docker (its runners' volumes) and ssh are stubs first on PATH: nothing is started, no live folder is
# touched, no settings file of this host is read. Takes about 40 seconds (two orchestrator dry runs).
# Callers: a person or an agent, from the shell, after changing the machines file's reader or the orchestrator's use of it.
#   bash asbl/ci/tests/test-machines-file.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
MACHINES=asbl/ci/release-machines.sh
EXAMPLE=asbl/ci/release-layout.example.conf
ORCHESTRATOR=asbl/ci/jenkins/release-orchestrator.sh
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-machines-file.XXXXXX") || exit 2
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
has() {  # has <text> <text>: the text is in it, or what it holds is printed
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -15)"; return 1
}

# ---- the stand-ins: the VMs' states, /var's free disk, the host's memory, the VMs' settings files ----
STUBS="$SCRATCH/stubs"; mkdir -p "$STUBS" "$SCRATCH/vm-conf"
cat > "$STUBS/virsh" <<'STUB'
#!/bin/bash
# stub virsh: domstate <domain> answers from $STUB_VM_STATES ("<domain>=<state> ..."), a domain not there does not exist;
# dumpxml: 24 GB defined
[ "${1:-}" != dumpxml ] || { printf "<domain>\n  <memory unit='KiB'>25165824</memory>\n  <currentMemory unit='KiB'>25165824</currentMemory>\n</domain>\n"; exit 0; }
[ "${1:-}" = domstate ] || exit 0
for pair in ${STUB_VM_STATES:-}; do [ "${pair%%=*}" = "${2:-}" ] && { echo "${pair#*=}"; exit 0; }; done
echo "error: failed to get domain '${2:-}'" >&2; exit 1
STUB
cat > "$STUBS/df" <<'STUB'
#!/bin/bash
# stub df: /var has $STUB_VAR_FREE_GB GB free
printf ' Avail\n %sG\n' "${STUB_VAR_FREE_GB:-400}"
STUB
cat > "$STUBS/docker" <<'STUB'
#!/bin/bash
# stub docker: volume inspect <name> answers from $STUB_RUNNER_VOLUMES (the runners' volumes there; default all four)
if [ "${1:-}" = volume ] && [ "${2:-}" = inspect ]; then
  case " ${STUB_RUNNER_VOLUMES-dp-ci-runner-1-docker dp-ci-runner-2-docker dp-ci-runner-3-docker dp-ci-runner-4-docker dp-ci-runner-5-docker} " in
    *" ${3:-} "*) exit 0 ;;
  esac
  exit 1
fi
exit 0
STUB
printf '#!/bin/bash\nexit 0\n' > "$STUBS/ssh"
chmod +x "$STUBS"/*
export PATH="$STUBS:$PATH"
export WIN_CI_CONF="$SCRATCH/vm-conf/win-ci.env" WIN_VM_CONF_DIR="$SCRATCH/vm-conf" RELEASE_MEMINFO="$SCRATCH/meminfo"
for v in a b c d; do : > "$SCRATCH/vm-conf/win-ci-$v.env"; done; : > "$WIN_CI_CONF"
export STUB_VM_STATES="win10-dev=running win10-dev-b=shut-off win10-dev-c=shut-off win10-dev-d=shut-off"
memory_gb() { printf 'MemTotal:       131072000 kB\nMemAvailable:   %s kB\n' $(($1 * 1048576)) > "$RELEASE_MEMINFO"; }
memory_gb 100
unset RELEASE_STEPS RELEASE_SERVER_GB RELEASE_RUNNERS RELEASE_RUNNER_LIMIT_GB RELEASE_WINDOWS_VMS WIN_VM_MEMORY_GB WIN_VM_DOCKER_MEMORY_GB RELEASE_CI_CONTAINER_LIMIT_GB RELEASE_MIN_FREE_GB RELEASE_ESTIMATES_FILE \
  SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS
for key in $(compgen -v | grep -E '^(VM_LANES_|VM_DOMAIN_)'); do unset "$key"; done
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf"
# settings <line>...: the machines file, root-only, holding those lines; settings_example [<line>...]: the example plus them
settings() { printf '%s\n' "$@" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"; }
settings_example() { { cat "$EXAMPLE"; printf '%s\n' "$@"; } > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"; }
machines() { bash "$MACHINES" "$@" 2>&1; }
# refused <expected text> <command...>: exit 2 and that text in a REFUSED line
refused() {
  local text="$1" out rc; shift
  out=$("$@" 2>&1); rc=$?
  [ "$rc" = 2 ] || { echo "      exit $rc, not 2:"; printf '%s\n' "$out" | sed 's/^/        /' | tail -8; return 1; }
  has "$text" "$(printf '%s\n' "$out" | grep '^REFUSED\|^MISSING')"
}

# ---- 1. no file, the environment first, a file others may read ----
rm -f "$RELEASE_REHEARSAL_CONF"
check "no file: the defaults (together, 5 GB per server, runners of 24 GB, VM a alone in 16.6.2's order, 24 GB per VM, Docker 16 GB in it, 12 GB for the CI container, 16 GB free)" same \
"RELEASE_STEPS=together
RELEASE_SERVER_GB=5
RELEASE_RUNNERS=yes
RELEASE_RUNNER_LIMIT_GB=24
RELEASE_WINDOWS_VMS=a
WIN_VM_MEMORY_GB=24
WIN_VM_DOCKER_MEMORY_GB=16
RELEASE_CI_CONTAINER_LIMIT_GB=12
RELEASE_MIN_FREE_GB=16
RELEASE_ESTIMATES_FILE=/var/kraft-internalsystems/apps/cvs/custom-jenkins/home/datapallas/release-estimates.json
VM_LANES_1_a=\"pack docker-proof server-light electron-light robot\"
VM a: libvirt win10-dev, settings $WIN_CI_CONF" "$(machines show)"
ceilings_answer() { env "$@" bash "$MACHINES" check 1 1 >/dev/null 2>&1; echo $?; }
check "the ceilings: the default order passes; a box not under the box it runs in, or not a number, is refused" same "0 2 2 2" \
  "$(ceilings_answer A=1) $(ceilings_answer WIN_VM_MEMORY_GB=16) $(ceilings_answer RELEASE_RUNNER_LIMIT_GB=12) $(ceilings_answer RELEASE_CI_CONTAINER_LIMIT_GB=lots)"
check "  what it says names both boxes" has "RELEASE_CI_CONTAINER_LIMIT_GB=12: it runs inside RELEASE_RUNNER_LIMIT_GB=12, so it must stay under it" \
  "$(RELEASE_RUNNER_LIMIT_GB=12 machines check 1 1)"
check "no file: 1 and 1 pass the check" has "MACHINES OK steps=together jobs=1 vms=1 (a)" "$(machines check 1 1)"
settings "RELEASE_STEPS=together" "RELEASE_SERVER_GB=7"
check "the caller's environment goes before the file" same "RELEASE_STEPS=in-order RELEASE_SERVER_GB=7" \
  "$(RELEASE_STEPS=in-order machines show | grep -E '^RELEASE_(STEPS|SERVER_GB)=' | paste -sd' ')"
chmod 644 "$RELEASE_REHEARSAL_CONF"
check "a file others may read: refused (exit 2)" refused "MISSING a settings file only its owner reads" machines check 1 1

# ---- 2. the example file ----
settings_example
example_ok() {
  local m out
  for m in 1 2 3 4; do
    out=$(machines check 1 "$m") || { echo "      N=1 M=$m:"; printf '%s\n' "$out" | sed 's/^/        /'; return 1; }
  done
}
check "every layout of the example passes the rules, for N = 1 and every M (1 to 4)" example_ok
n_runners() {  # N above 1, every M: allowed with the runners (the default); refused with RELEASE_RUNNERS=no
  local n m out
  for n in 2 3 4; do for m in 1 2 3 4; do
    out=$(machines check "$n" "$m") || { echo "      N=$n M=$m:"; printf '%s\n' "$out" | sed 's/^/        /'; return 1; }
    refused "SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=$n with RELEASE_RUNNERS=no: the full set runs whole on this host's one Docker engine, which runs one DataPallas e2e set at a time" \
      env RELEASE_RUNNERS=no bash "$MACHINES" check "$n" "$m" >/dev/null || { echo "      N=$n M=$m RELEASE_RUNNERS=no: not refused as expected"; return 1; }
  done; done
}
check "N above 1 (2 to 4), every M: allowed with the runners; refused with RELEASE_RUNNERS=no (one Docker engine)" n_runners
check "RELEASE_RUNNERS=no with N=1: allowed" bash -c 'RELEASE_RUNNERS=no bash "$1" check 1 1 >/dev/null' _ "$MACHINES"
check "RELEASE_RUNNERS=maybe: refused" refused "RELEASE_RUNNERS=maybe: it must be yes or no" env RELEASE_RUNNERS=maybe bash "$MACHINES" check 1 1
check "the example names the VMs a to d only" same 'RELEASE_WINDOWS_VMS="a b c d"' "$(grep '^RELEASE_WINDOWS_VMS=' "$EXAMPLE" | sed 's/ *#.*//')"
check "the example's layouts are the defaults (the same show with and without its VM_LANES lines)" same \
  "$(machines show)" "$(grep -v '^VM_LANES_' "$EXAMPLE" > "$RELEASE_REHEARSAL_CONF"; machines show)"
check "the example's 4 VMs: a, b, c, d, each with its libvirt name and settings file" same \
"VM a: libvirt win10-dev, settings $WIN_CI_CONF
VM b: libvirt win10-dev-b, settings $SCRATCH/vm-conf/win-ci-b.env
VM c: libvirt win10-dev-c, settings $SCRATCH/vm-conf/win-ci-c.env
VM d: libvirt win10-dev-d, settings $SCRATCH/vm-conf/win-ci-d.env" "$(settings_example; machines show | grep '^VM ')"

# ---- 3. each broken rule refused, with its numbers ----
settings_example "RELEASE_STEPS=in-order"
check "in-order with N=2: refused" refused "RELEASE_STEPS=in-order runs 16.6.2's order with nothing split: N and M must be 1 (got N=2, M=1)" machines check 2 1
settings_example "RELEASE_STEPS=sideways"
check "an unknown RELEASE_STEPS: refused" refused "RELEASE_STEPS=sideways: it must be together or in-order" machines check 1 1
settings_example
check "N=5: refused" refused "SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=5: it must be 1, 2, 3 or 4" machines check 5 1
check "M=0: refused" refused "USE_N_NUMBER_OF_WINDOWS_VMS=0: it must be 1, 2, 3 or 4" machines check 1 0
settings_example "RELEASE_SERVER_GB=five"
check "a memory that is no number: refused" refused "RELEASE_SERVER_GB=five: it must be a whole number of GB" machines check 1 1
settings_example 'RELEASE_WINDOWS_VMS="a b"'
check "M=3 with 2 VMs named: refused" refused "USE_N_NUMBER_OF_WINDOWS_VMS=3, but RELEASE_WINDOWS_VMS has 2 VM(s) (a b): the others are not created yet" machines check 1 3
settings_example 'VM_LANES_2_b="docker-proof electron-light pack"'
check "a lane twice: refused, with the layout" refused 'the layout for 2 VM(s) runs pack 2 times: every lane runs once (VM_LANES_2_a="pack server-light robot" VM_LANES_2_b="docker-proof electron-light pack")' machines check 1 2
settings_example 'VM_LANES_2_b="docker-proof"'
check "a lane missing: refused" refused "the layout for 2 VM(s) runs electron-light 0 times" machines check 1 2
settings_example 'VM_LANES_3_c="electron-light coffee"'
check "an unknown lane: refused" refused "VM_LANES_3_c names 'coffee': the lanes are pack docker-proof server-light electron-light robot" machines check 1 3
settings_example 'VM_LANES_2_a="pack robot server-light"'
check "Robot not last on its VM: refused" refused 'VM_LANES_2_a="pack robot server-light": Robot must be last on its VM (it removes Java)' machines check 1 2
settings_example 'VM_LANES_2_a="pack server-light"' 'VM_LANES_2_b="docker-proof electron-light robot"'
check "Robot away from the pack's VM: refused" refused 'VM_LANES_2_b="docker-proof electron-light robot": Robot runs on the pack'"'"'s VM' machines check 1 2
settings_example 'VM_LANES_1_a="pack docker-proof electron-light server-light robot"'
check "Electron before the server light set on one VM: refused" refused 'VM_LANES_1_a="pack docker-proof electron-light server-light robot": the server light set comes before the Electron light set on one VM' machines check 1 1
settings_example
rm -f "$SCRATCH/vm-conf/win-ci-b.env"
check "press: VM b's settings file missing: refused (the plain check does not ask)" \
  bash -c 'out=$(bash "$1" check 1 2 --press); [ "$?" = 2 ] && grep -qF "REFUSED VM b has no settings file $2" <<< "$out" && bash "$1" check 1 2 >/dev/null' \
  _ "$MACHINES" "$SCRATCH/vm-conf/win-ci-b.env"
: > "$SCRATCH/vm-conf/win-ci-b.env"
check "press: VM c not in libvirt: refused" bash -c 'STUB_VM_STATES="win10-dev=running win10-dev-b=shut-off" bash "$1" check 1 3 --press | grep -qF "REFUSED VM c (libvirt win10-dev-c) does not exist: not created yet"' _ "$MACHINES"
memory_gb 60
check "press: N=1 M=4 with 60 GB available, VMs b c d off: refused, with the numbers" refused \
  "memory: N=1 M=4 needs 82 GB (2 host test servers x 5 GB (runner 1 and the host lanes' runner), VMs b c d to start x 24 GB), 60 GB are available now: -22 GB would stay free, under RELEASE_MIN_FREE_GB=16" \
  machines check 1 4 --press
check "press: only the VMs a round starts count (b c d running: 10 GB needed)" has \
  "needs 10 GB of 60 GB available, 50 GB stay free (rule 16)" \
  "$(STUB_VM_STATES="win10-dev=running win10-dev-b=running win10-dev-c=running win10-dev-d=running" machines check 1 4 --press)"
memory_gb 100
check "press: N=1 M=4 with 100 GB available: OK, with the numbers" has \
  "MACHINES OK steps=together jobs=1 vms=4 (a b c d), memory: needs 82 GB of 100 GB available, 18 GB stay free (rule 16); /var 400 GB free, the runners take about 8 GB, 392 GB stay free (rule 50)" \
  "$(machines check 1 4 --press)"
check "press: N=4 M=1, the memory rule names the runners: refused, with the numbers" refused \
  "memory: N=4 M=1 needs 25 GB (5 host test servers x 5 GB (runners 1 to 4 and the host lanes' runner)), 40 GB are available now: 15 GB would stay free, under RELEASE_MIN_FREE_GB=16" \
  bash -c 'printf "MemTotal:       131072000 kB\nMemAvailable:   41943040 kB\n" > "$1/meminfo-40"; RELEASE_MEMINFO="$1/meminfo-40" bash "$2" check 4 1 --press' _ "$SCRATCH" "$MACHINES"
check "press: N=4, runners 3 and 4 with no volume yet, /var 120 GB free: refused, with the numbers" refused \
  "disk: N=4: /var has 120 GB free, the runners take about 92 GB there (runners 3 4 with no volume yet x 40 GB, runners 1 2 5 with a volume x 4 GB): 28 GB would stay free, under the 50 GB a round keeps free" \
  env STUB_VAR_FREE_GB=120 STUB_RUNNER_VOLUMES="dp-ci-runner-1-docker dp-ci-runner-2-docker dp-ci-runner-5-docker" bash "$MACHINES" check 4 1 --press
check "press: N=4, every runner's volume there, /var 120 GB free: OK, with the numbers" has \
  "/var 120 GB free, the runners take about 20 GB, 100 GB stay free (rule 50)" "$(STUB_VAR_FREE_GB=120 machines check 4 1 --press)"
check "press: RELEASE_RUNNERS=no: the disk rule counts no runner" has \
  "memory: needs 10 GB of 100 GB available, 90 GB stay free (rule 16); /var 400 GB free (rule 50)" \
  "$(STUB_RUNNER_VOLUMES="" RELEASE_RUNNERS=no machines check 1 1 --press)"
check "press: N=4 RELEASE_RUNNERS=no with 100 GB available: refused, one Docker engine" refused \
  "SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=4 with RELEASE_RUNNERS=no: the full set runs whole on this host's one Docker engine" \
  env RELEASE_RUNNERS=no bash "$MACHINES" check 4 4 --press
check "press: /var with 20 GB free: refused" refused \
  "disk: N=1: /var has 20 GB free, the runners take about 8 GB there (runners 1 5 with a volume x 4 GB): 12 GB would stay free, under the 50 GB a round keeps free" \
  env STUB_VAR_FREE_GB=20 bash "$MACHINES" check 1 1 --press
check "press: /var with 20 GB free, RELEASE_RUNNERS=no: refused" refused "disk: /var has 20 GB free, under the 50 GB a round keeps free" \
  env STUB_VAR_FREE_GB=20 RELEASE_RUNNERS=no bash "$MACHINES" check 1 1 --press

# ---- 4. the lane times from the marks, and the schedule ----
RUNS="$SCRATCH/runs"
run_folder() {  # run_folder <name>: a real orchestrator run's folder, with parts that passed (and one red part)
  local d="$RUNS/$1"; mkdir -p "$d"
  cat > "$d/run.log" <<'LOG'
PART    step1-build START 2026-11-03T23:20:00Z on 0123abcd: the build
PART    step1-build END rc=0 2026-11-03T23:50:00Z (log x)
PART    lane2-docker-server-auth START 2026-11-03T23:50:00Z on 0123abcd: step 1 docker-server-auth (release-step1.sh)
PART    lane2-docker-server-auth END rc=0 2026-11-04T00:10:00Z (log x)
PART    lane1-docker-server-full START 2026-11-04T00:10:00Z on 0123abcd: step 1 docker-server-full (release-step1.sh)
PART    lane1-docker-server-full END rc=0 2026-11-04T10:10:00Z (log x)
PART    windows-pack START 2026-11-04T10:10:00Z on 0123abcd: step 3's pack
PART    windows-pack END rc=1 2026-11-04T11:00:00Z (log x)
LOG
  printf '0\n' > "$d/step1-build.rc"; printf '0\n' > "$d/lane2-docker-server-auth.rc"; printf '0\n' > "$d/lane1-docker-server-full.rc"
  printf '1\n' > "$d/windows-pack.rc"
  printf '######## DOCKER RELEASE STEP 3/6 START x\n######## DOCKER RELEASE STEP 3/6 END rc=0  2026-11-04T11:00:00Z  took=3000s (50m0s)  :: the Linux proof\n' > "$d/docker-linux.log"
  printf '0\n' > "$d/docker-linux.rc"
  printf '%s\n' '######## DOCKER RELEASE STEP 4/6 START x' '>>> npmwc started on the VM desktop  2026-11-04T11:00:00Z' \
    '<<< prepare finished  EXIT=0  2026-11-04T11:40:00Z' '######## DOCKER RELEASE STEP 4/6 END rc=0  2026-11-04T14:40:00Z  took=13200s (220m0s)  :: x' > "$d/docker-windows.log"
}
run_folder 20261103T231939Z-release-orchestrator-execution-1-version-16.6.2
mkdir -p "$RUNS/20261104T231939Z-release-orchestrator-execution-1-dry-run"
printf 'PART    step1-build START 2026-11-04T23:20:00Z on x: y\nPART    step1-build END rc=0 2026-11-05T23:20:00Z (log x)\n' > "$RUNS/20261104T231939Z-release-orchestrator-execution-1-dry-run/run.log"
printf '0\n' > "$RUNS/20261104T231939Z-release-orchestrator-execution-1-dry-run/step1-build.rc"
lanes=$(RUN_RECORD_DIR="$RUNS" machines lanes)
lane_line() { printf '%s\n' "$lanes" | awk -v lane="$1" '$1 == lane { print $2, $3 }'; }
F=20261103T231939Z-release-orchestrator-execution-1-version-16.6.2
check "lanes: the build, the auth file and the full set from the PART lines (a dry run's folder ignored)" same \
  "30.0 $F|20.0 $F|600.0 $F" "$(lane_line build)|$(lane_line auth)|$(lane_line full-docker-server)"
check "lanes: the Linux proof from its mark; the Windows Docker proof without its prepare (220 - 40 min)" same \
  "50.0 $F|180.0 $F|40.0 $F" "$(lane_line linux-proof)|$(lane_line docker-proof)|$(lane_line prepare)"
check "lanes: a red pack is not used, the 16.6.2 default stands" same "77.0 default" "$(lane_line pack | cut -d' ' -f1,2)"
check "lanes: no runner has run: the runners' start and images are the defaults, said to be not measured" same \
  "15.0 default|10.0 default" "$(lane_line runner-start | cut -d' ' -f1,2)|$(lane_line runner-images | cut -d' ' -f1,2)"
check "lanes: no round has copied the pack's e2e package: its line at the prepare's 58 min, the one copy of 2026-11-05 (82 s)" same \
  "58.0 default|1.4 default" "$(lane_line pack-noexe | cut -d' ' -f1,2)|$(lane_line package-copy | cut -d' ' -f1,2)"
# a round with more VMs that copied the pack's e2e package: the NoExeAssembler's line 55 min into the pack, the archive
# brought here in 50 s, the slower of two puts 70 s
RUNS3="$SCRATCH/runs-copy"; P=20261111T000000Z-release-orchestrator-execution-1-version-16.6.3; PD="$RUNS3/$P"; mkdir -p "$PD"
printf 'PART    windows-pack START 2026-11-11T01:00:00Z on 0123abcd: step 3s pack on VM a, kept\n' > "$PD/run.log"
printf '%s\n' "WIN_E2E_PACKAGE_WAIT VM a's asbl\pack-datapallas.log" "WIN_E2E_PACKAGE_READY at=2026-11-11T01:55:00Z after=3290s: x" \
  "WIN_E2E_PACKAGE_ARCHIVE=/x/e2e-package.tar sha256=0123456789abcdef... files=4444 took=50s" > "$PD/windows-package-from-pack.log"
printf '0\n' > "$PD/windows-package-from-pack.rc"
for v in b:70 c:40; do
  printf 'WIN_E2E_PACKAGE=copied from the pack (0123abcd): 4444 files, sha256 0123456789abcdef..., took=%ss\n' "${v#*:}" > "$PD/windows-package-${v%%:*}.log"
done
copy_lanes=$(RUN_RECORD_DIR="$RUNS3" machines lanes)
check "lanes: a round that copied it: its line 55 min into the pack, the copy 50 s + the slower put 70 s = 2 min" same \
  "55.0 $P|2.0 $P" "$(printf '%s\n' "$copy_lanes" | awk '$1 == "pack-noexe" || $1 == "package-copy" { print $2, $3 }' | paste -sd'|')"
printf '1\n' > "$PD/windows-package-from-pack.rc"
check "  that pull red: not used, the defaults stand" same "58.0 default|1.4 default" \
  "$(RUN_RECORD_DIR="$RUNS3" machines lanes | awk '$1 == "pack-noexe" || $1 == "package-copy" { print $2, $3 }' | paste -sd'|')"
# a newer run with the runners (2): its build part's mark, the Linux proof in its own part, the full lane merged from two
# runners (their marks in the lane's log, each runner's own log and report), next to the 16.6.2 run above
RUNS2="$SCRATCH/runs-runners"; mkdir -p "$RUNS2"; cp -r "$RUNS/$F" "$RUNS2/"
R=20261110T000000Z-release-orchestrator-execution-1-version-16.6.3; RD="$RUNS2/$R"; mkdir -p "$RD"
cat > "$RD/run.log" <<'LOG'
PART    docker-linux START 2026-11-10T00:00:00Z on 0123abcd: step 2's build (DOCKER_RELEASE_PART=build)
PART    docker-linux END rc=0 2026-11-10T00:33:00Z (log x)
PART    lane1-docker-server-full START 2026-11-10T00:33:00Z on 0123abcd: step 1 docker-server-full in 2 runner(s) (release-step1.sh)
PART    lane1-docker-server-full END rc=0 2026-11-10T02:10:00Z (log x)
PART    docker-linux-proof START 2026-11-10T00:50:00Z on 0123abcd: step 2's Linux proof
PART    docker-linux-proof END rc=0 2026-11-10T01:35:00Z (log x)
LOG
for p in docker-linux lane1-docker-server-full docker-linux-proof; do printf '0\n' > "$RD/$p.rc"; done
printf '######## DOCKER RELEASE STEP 2/6 END rc=0  2026-11-10T00:32:00Z  took=1920s (32m0s)  :: the build\n' > "$RD/docker-linux.log"
printf '######## DOCKER RELEASE STEP 3/6 END rc=0  2026-11-10T01:35:00Z  took=2700s (45m0s)  :: the Linux proof\n' > "$RD/docker-linux-proof.log"
mark() { printf '######## RUNNER %s %s END rc=0  2026-11-10T00:40:00Z  took=%ss (x)  :: x\n' "$@"; }
{ mark 1 ENGINE 60; mark 2 ENGINE 60; mark 1 CHECKOUT 120; mark 2 CHECKOUT 180; mark 1 CACHES 300; mark 2 CACHES 360
  mark 1 IMAGES 240; mark 2 IMAGES 300
  echo "E2E_MERGED_LOG=$RD/merged.log"; echo "E2E_JSON_REPORT=$RD/merged-playwright.json"; } > "$RD/lane1-docker-server-full.log"
printf 'E2E_RUNNER 1 log=%s result=SUCCESS\nE2E_RUNNER 2 log=%s result=SUCCESS\n' "$RD/r1.log" "$RD/r2.log" > "$RD/merged.log"
echo '{"suites":[],"stats":{"startTime":"2026-11-10T01:00:00.000Z","duration":5400000}}' > "$RD/merged-playwright.json"
runner_run() {  # runner_run <n> <its start> <Playwright's start> <wall ms> <file> <test ms>: a runner's lane log and its report
  printf 'PIPELINE_START %s  task=e2e  commit=0123abcd  version=16.6.3\nE2E_RETRIES=1 E2E_TIMEOUT_SECS=72000 E2E_JSON_REPORT=%s\n' "$2" "$RD/r$1-playwright.json" > "$RD/r$1.log"
  printf '{"suites":[{"file":"%s","specs":[{"file":"%s","tests":[{"results":[{"duration":%s}]}]}]}],"stats":{"startTime":"%s","duration":%s}}\n' \
    "$5" "$5" "$6" "$3" "$4" > "$RD/r$1-playwright.json"
}
runner_run 1 2026-11-10T00:46:00Z 2026-11-10T00:52:00.000Z 3600000 specs/a.spec.ts 3000000   # setup 6 min, wall 60, tests 50
runner_run 2 2026-11-10T00:48:00Z 2026-11-10T00:52:00.000Z 1800000 specs/b.spec.ts 1500000   # setup 4 min, wall 30, tests 25
lanes=$(RUN_RECORD_DIR="$RUNS2" machines lanes)
check "lanes with the runners: their start and images, the slowest runner's (10 and 5 min), from their marks" same \
  "10.0 $R|5.0 $R" "$(lane_line runner-start)|$(lane_line runner-images)"
check "  the build from the build part's mark, the Linux proof from its own part's log" same \
  "32.0 $R|45.0 $R" "$(lane_line build)|$(lane_line linux-proof)"
check "  the full set's lane time not from the runners' run (the slowest runner's, not the lane's on one engine)" same \
  "600.0 $F" "$(lane_line full-docker-server)"
check "  the time per file from each runner's own report: setup 5 min (6 and 4), ratio 1.2 (90 min wall, 75 of tests)" same \
  "50.0 specs/a.spec.ts|25.0 specs/b.spec.ts|SETUP 5.0|RATIO 1.2000|FROM $R" \
  "$(python3 -I asbl/ci/release-estimate.py files --runs "$RUNS2" --target docker-server | sed 's/^ *//; s/  */ /' | paste -sd'|')"
lanes=$(RUN_RECORD_DIR="$RUNS" machines lanes)
empty_runs="$SCRATCH/no-runs"; mkdir -p "$empty_runs"
schedule() {  # schedule <N> <M> <full target>: the library's schedule, as the orchestrator calls it
  RUN_RECORD_DIR="$empty_runs" bash -c '. "$1"; machines_load && machines_schedule "$2" "$3" "$4"' _ "$MACHINES" "$@" 2>&1
}
settings_example
out=$(schedule 4 4 docker-server)
check "schedule 4 4: each VM runs its layout, the pack's e2e package before its first e2e lane" same \
  "a Windows pack|a Robot UAT|b e2e package (from the pack)|b light set on server zip|c e2e package (from the pack)|c light set on Electron|d e2e package (from the pack)|d light set on docker-server" \
  "$(printf '%s\n' "$out" | awk '$1 == "Win" && $2 == "VM" { line = $0; sub(/^ *Win VM /, "", line); sub(/ +[0-9]+:[0-9]+ +->.*/, "", line); gsub(/ +/, " ", line); print line }' | paste -sd'|')"
check "schedule 4 4: the server light set waits for the pack (on another VM)" has \
  "Win VM b light set on server zip         1:17 ->  3:16   119 min  (step 3; waits for the pack)" "$out"
host_parts() {  # host_parts <schedule>: "<part> <start>-<end>" of each Linux host row, in order
  printf '%s\n' "$1" | awk '$1 == "Linux" { line = $0; sub(/^ *Linux +/, "", line); match(line, /[0-9]+:[0-9]+ +-> +[0-9]+:[0-9]+/)
    name = substr(line, 1, RSTART - 1); sub(/ +$/, "", name); split(substr(line, RSTART, RLENGTH), t, / +-> +/)
    printf "%s%s %s-%s", s, name, t[1], t[2]; s = "|" }'
}
check "schedule 4 4: this host's parts: the build, then the auth file once the runners have their copies (0:34 + 15), then the Linux proof" same \
  "build + JUnit 0:00-0:34|auth file on docker-server 0:49-1:09|light set on docker-server 1:09-2:04" "$(host_parts "$out")"
runner_ends=""; total_files=$(python3 -I asbl/ci/full-set-runners.py files 1 1 | wc -l)
for k in 1 2 3 4; do   # no file times in the records: each runner the lane's 620 min by its share of the files
  files=$(python3 -I asbl/ci/full-set-runners.py files 4 "$k" | wc -l)
  runner_ends="$runner_ends|runner $k full set on docker-server 0:34-$(awk -v f="$files" -v t="$total_files" 'BEGIN { m = int(34 + 15 + 10 + 620 * f / t + 0.5); printf "%d:%02d", m / 60, m % 60 }')"
done
check "schedule 4 4: the four runners from the build's end, each its list after its start (15 min) and images (10 min)" same \
  "${runner_ends#|}" "$(printf '%s\n' "$out" | awk '$1 == "runner" { line = $0; sub(/^ +/, "", line); match(line, /[0-9]+:[0-9]+ +-> +[0-9]+:[0-9]+/)
    name = substr(line, 1, RSTART - 1); sub(/ +$/, "", name); gsub(/ +/, " ", name); split(substr(line, RSTART, RLENGTH), t, / +-> +/)
    printf "%s%s %s-%s", s, name, t[1], t[2]; s = "|" }')"
check "  the memory the memory rule counts, the runners named" has \
  "MEMORY    5 host test servers x 5 GB = 25 GB (runners 1 to 4 and the host lanes' runner); VMs the round starts: b c d x 24 GB = 72 GB" "$out"
out=$(RELEASE_RUNNERS=no schedule 1 1 docker-server)
check "schedule 1 1, RELEASE_RUNNERS=no: this host's parts one at a time (one engine), the full set last: about 12 h 10" bash -c \
  '[ "$2" = "build + JUnit 0:00-0:34|light set on docker-server 0:34-1:29|auth file on docker-server 1:29-1:49|full set on docker-server 1:49-12:09" ] &&
   grep -qF "TOTAL     about 12 h 10 (the last part to end: Linux full set on docker-server)" <<< "$1" &&
   grep -qF "MEMORY    2 host test servers x 5 GB = 10 GB; VMs the round starts: none" <<< "$1" && ! grep -q "^  runner" <<< "$1"' _ "$out" "$(host_parts "$out")"
settings_example "RELEASE_STEPS=in-order"
out=$(schedule 1 1 docker-server)
check "schedule in-order: step 1 first, the VM after it, about 20 h 25 on the 16.6.2 defaults (no prepare after its green pack)" bash -c \
  'grep -qF "Win VM a Windows pack                   11:14 -> 12:31" <<< "$1" && grep -qF "Win VM a e2e package (NoExe)            12:31 -> 12:31     0 min  (already built by the pack: seconds)" <<< "$1" &&
   grep -qF "TOTAL     about 20 h 25 (the last part to end: Win VM a Robot UAT)" <<< "$1"' _ "$out"

# ---- 5. the orchestrator ----
# dry_run <name> [VAR=value...]: an orchestrator dry run on scratch folders (no release record: step 1 runs every lane)
dry_run() {
  local name="$1" dir="$SCRATCH/$1"; shift
  mkdir -p "$dir/logs" "$dir/state" "$dir/artifacts"
  env LOG_DIR="$dir/logs" RUN_RECORD_DIR="$dir/runs" RELEASE_STATE_DIR="$dir/state" RELEASE_ARTIFACTS_DIR="$dir/artifacts" \
    WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts" \
    ORCH_STARTED_BY=test-machines-file DRY_RUN=yes "$@" bash "$ORCHESTRATOR" > "$dir/console.log" 2>&1
  echo "$?" > "$dir/rc"
}
settings "RELEASE_STEPS=in-order"
dry_run in-order
console="$SCRATCH/in-order/console.log"
# the parts in the order they started: step 1's on this host, then the two tracks of the execution
starts() { sed -n 's/^PART    \([^ ]*\) START .*/\1/p' "$1" | paste -sd' '; }
ends_before_start() {  # ends_before_start <log> <part> <later part>: <part> ended before <later part> started
  local end start
  end=$(grep -n "^PART    $2 END" "$1" | cut -d: -f1); start=$(grep -n "^PART    $3 START" "$1" | cut -d: -f1)
  [ -n "$end" ] && [ -n "$start" ] && [ "$end" -lt "$start" ] || { echo "      $2 ends at line ${end:-none}, $3 starts at line ${start:-none}"; return 1; }
}
in_order() {
  local log="$1" s1 full
  full=$(sed -n 's/^PART    lane1-\([a-z-]*\)-full START.*/\1/p' "$log")
  s1="step1-build lane2-docker-server-auth lane1-$full-full"
  same 0 "$(cat "$SCRATCH/in-order/rc")" &&
    same "$s1" "$(starts "$log" | cut -d' ' -f1-3)" &&
    ends_before_start "$log" "lane1-$full-full" windows-pack && ends_before_start "$log" "lane1-$full-full" docker-linux &&
    ends_before_start "$log" docker-linux docker-windows && ends_before_start "$log" windows-pack docker-windows &&
    ends_before_start "$log" docker-windows windows-after-pack && ends_before_start "$log" docker-windows docker-keep &&
    same "step0 build linux-proof pack windows-docker-proof server-light electron-light robot docker-verdict windows-verdict" \
      "$(sed -n '/^SUMMARY /,/^FLAKY/p' "$log" | awk '$1 != "SUMMARY" && $1 != "FLAKY" && $1 !~ /^(step1|lane)/ { print $1 }' | paste -sd' ' | sed 's/^/step0 /; s/^step0 step0/step0/')"
}
check "RELEASE_STEPS=in-order: 16.6.2's dry-run order (step 1's lanes, then the host and VM tracks as before, the same summary)" in_order "$console"
check "RELEASE_STEPS=in-order: 16.6.2's ORDER lines" same \
"        execution  host: build + linux-proof (step 2, DOCKER_RELEASE_PART=linux), then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended
                   VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),
                   then server-light (on datapallas-server.zip of pack, kept) + electron-light + robot + windows-verdict
                   (WIN_RELEASE_HALF=after-pack); never two VM parts at once" "$(grep -A3 '^        execution  host:' "$console")"
check "a dry run prints the schedule, each part with its expected time" bash -c \
  'grep -q "^SCHEDULE  steps in-order;" "$1" && grep -qE "^  Win VM a Robot UAT +[0-9]+:[0-9]{2} -> +[0-9]+:[0-9]{2} +41 min" "$1" && grep -q "^TOTAL     about " "$1"' _ "$console"
rm -f "$RELEASE_REHEARSAL_CONF"
dry_run refused USE_N_NUMBER_OF_WINDOWS_VMS=2
check "the orchestrator, 2 VMs asked and only VM a: refused before anything starts (exit 2, no run folder)" bash -c \
  '[ "$(cat "$1/rc")" = 2 ] && grep -qF "REFUSED: the machines file ($2) does not allow N=1 M=2 (above). Nothing done" "$1/console.log" && [ ! -d "$1/runs" ]' \
  _ "$SCRATCH/refused" "$RELEASE_REHEARSAL_CONF"

echo "$([ "$FAILED_CASES" = 0 ] && echo "ALL PASS" || echo "$FAILED_CASES FAILED") test-machines-file"
[ "$FAILED_CASES" = 0 ]

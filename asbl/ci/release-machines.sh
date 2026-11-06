#!/bin/bash
# The machines of a release round, in one settings file: whether the steps start together, how much memory one host
# test server and one Windows VM take, which Windows VMs exist and which lanes each runs for 1 to 4 VMs. The
# orchestrator keeps no machine of its own: it asks this file. asbl/ci/release-layout.example.conf explains every key,
# with the layouts for 1 to 4 VMs; copy what you need from it into the settings file.
#
# SOURCED by asbl/ci/jenkins/release-rehearsal.sh and asbl/ci/jenkins/release-orchestrator.sh (machines_load,
# machines_check, machines_vms_for, machines_lanes_of, machines_schedule, and a round's VMs: machines_vm_memory_set,
# machines_vm_start, machines_vm_shutdown, below); also a command, for a person or an AI agent:
#   bash asbl/ci/release-machines.sh show               the settings as read: the file's values, the defaults for the rest
#   bash asbl/ci/release-machines.sh check <N> <M>      the file's rules for these Advanced values (the steps, the numbers,
#                                                       enough VMs named, the layout's rules): exit 0 with "MACHINES OK
#                                                       ...", or exit 2 with one "REFUSED ..." line per broken rule, with
#                                                       its numbers. Every start of the orchestrator and of a round asks it
#   bash asbl/ci/release-machines.sh check <N> <M> --press   the same, plus what the host must have now for a real round:
#                                                       each added VM's settings file, each VM in libvirt, the memory rule
#                                                       with the host's available memory now (N + 1 host test servers at
#                                                       RELEASE_SERVER_GB: with the runners, each runner and the host
#                                                       lanes' runner; each VM to start at WIN_VM_MEMORY_GB; each VM
#                                                       running at what it can still grow by), the disk rule: /var
#                                                       keeps MACHINES_MIN_FREE_VAR_GB [50] free after what the runners take
#                                                       there (MACHINES_RUNNER_FIRST_GB [40] for a runner with no image
#                                                       volume yet, MACHINES_RUNNER_ROUND_GB [4] for one whose volume is
#                                                       there) (release-rehearsal.sh start; not a dry round: it starts
#                                                       nothing)
#   bash asbl/ci/release-machines.sh schedule <N> <M>   what would run on which machine and when, each part's expected
#                                                       time from the last release runs' marks (asbl/ci/release-estimate.py)
#   bash asbl/ci/release-machines.sh lanes              the time of each lane, and the run it comes from
#   bash asbl/ci/release-machines.sh vm-memory-setup    the memory settings of every VM named, one VM at a time, the same
#                                                       for each (machines_vms_memory_setup): run it once after changing
#                                                       WIN_VM_MEMORY_GB or WIN_VM_DOCKER_MEMORY_GB, or adding a VM. An
#                                                       off VM is started for it and shut down after; a running VM stays
#                                                       on and takes the settings at its next start
#   N = SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS (step 1's full set in N subsets), M =
#   USE_N_NUMBER_OF_WINDOWS_VMS (the Windows lanes over M VMs); 1 to 4 each, 1 = nothing split (the job's defaults).
#   Step 1's full set runs in N runners, each a Docker engine of its own (asbl/ci/e2e-runners.sh): this host's one engine
#   runs one DataPallas e2e set at a time (the shipped compose files fix the container names, the ports and the network).
#   With RELEASE_RUNNERS=no the full set runs whole on this host's engine, so N must be 1.
#
# THE SETTINGS FILE: RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf], root's, mode 600 or 400, read as shell (the
# file release-rehearsal.sh reads RELEASE_FIXER from). Its keys, each with the default it takes when missing (a key set
# in the caller's environment goes before the file's, for a run from a shell):
#   RELEASE_STEPS [together]    together: after step 0, steps 1, 2 and 3 start at once (the host's parts one after
#                               another, the VM's beside them); in-order: 16.6.2's order (step 1, then steps 2 and 3),
#                               the off switch of every speedup (with N = M = 1 only)
#   RELEASE_SERVER_GB [5]       one host test server's memory (its server, its database containers, the browser); a
#                               runner counts as one
#   RELEASE_RUNNERS [yes]       yes: with the steps together, step 1's full set runs in runners (N of them, 1 the
#                               default), each a Docker engine of its own; no: on this host's engine, as before the
#                               runners (the fallback when a runner fails for its own reason; N must be 1)
#   RELEASE_RUNNER_LIMIT_GB [24]   each runner's memory ceiling: it reserves nothing, a runner takes what it needs
#   RELEASE_WINDOWS_VMS [a]     the Windows VMs that exist, in order: a = win10-dev (win-ci.env); each other VM's
#                               address in WIN_VM_CONF_DIR/win-ci-<name>.env (WIN_HOST only, read after win-ci.env)
#   WIN_VM_MEMORY_GB [24]       one memory for every Windows VM, set on each before a round (virsh --config): a ceiling,
#                               see THE VMS' MEMORY below
#   WIN_VM_DOCKER_MEMORY_GB [16]   the most Docker takes inside each VM, under WIN_VM_MEMORY_GB (.wslconfig memory=,
#                               written by vm-memory-setup)
#   RELEASE_CI_CONTAINER_LIMIT_GB [12]   the CI's own container dp-ci: see THE MEMORY CEILINGS below
#   RELEASE_MIN_FREE_GB [16]    host memory that must stay free: the form warns, the press refuses
#   VM_LANES_<M>_<name>         the lanes VM <name> runs, in order, when the round uses M VMs; missing: the default
#                               layout of that VM's place in RELEASE_WINDOWS_VMS (DEFAULT_LAYOUT_<M>, below)
#   VM_DOMAIN_<name>            the VM's libvirt name [a: win10-dev, any other: win10-dev-<name>]
#   RELEASE_ESTIMATES_FILE      where `release-rehearsal.sh estimate` writes the 16 estimates the job's form reads
#                               [/var/kraft-internalsystems/apps/cvs/custom-jenkins/home/datapallas/release-estimates.json]
# The lanes: pack, docker-proof (step 2's Windows Docker proof), server-light, electron-light, robot.
# The rules of a layout (checked): every lane once; Robot on the pack's VM and last there (it installs the pack's zips,
# and it removes Java); the server light set before the Electron light set when both are on one VM (the Electron
# package empties asbl\dist).
# A ROUND'S VMS (the orchestrator, real runs; virsh on this host): before the round, each VM it uses gets
# WIN_VM_MEMORY_GB as its defined memory when it differs (--config: a running VM takes it at its next start); a VM that
# is off is started, and waited for until it answers over SSH (dp-ci.sh win ssh ver, VM_SSH_WAIT_SECS [900] at most,
# every VM_POLL_SECS [15]), else its lanes are red; a VM the round started is shut down after its last lane (virsh
# shutdown, then virsh destroy after VM_SHUTDOWN_WAIT_SECS [600]); a VM that was running is left running.
# THE MEMORY CEILINGS sit around the apps, never on them: what the tests start (the AI Hub, the DB starter packs, third-party
# apps) runs as the e2e proved it, with no limit of its own, inside a box that has one. Each is a ceiling, not a reservation:
# a box takes what it needs up to it and gives it back. A box stays under the box it runs in (machines_check refuses
# otherwise):
#   a runner          RELEASE_RUNNER_LIMIT_GB         docker run --memory (asbl/ci/e2e-runners.sh)
#   a Windows VM      WIN_VM_MEMORY_GB                virsh --config, before a round (below)
#   Docker in a VM    WIN_VM_DOCKER_MEMORY_GB         .wslconfig (vm-memory-setup)
#   the CI container  RELEASE_CI_CONTAINER_LIMIT_GB   docker run --memory (asbl/ci/dp-ci.sh), on this host's engine or in a
#                                                     runner: about twice the biggest seen, 5.9 GiB
# With the runners this host's engine, which its own apps share, holds no app of a round: the auth file and the Linux proof
# run in the host lanes' runner, and only dp-ci stays there, for the build.
# THE VMS' MEMORY, the same for every VM: its size is a ceiling, not a reservation. Windows sees all of it and uses what it
# needs, inside it Docker does the same up to its own ceiling, and the host holds only what Windows really uses. That takes
# KSM on this host (machines_host_memory_sharing_on) and a memory placement rule on the VM (machines_vm_memory_placement_set),
# both set before every round, so a host reboot needs nothing done. A VM gives everything back when it shuts down.
# Other inputs: WIN_CI_CONF [/var/kraft-internalsystems/config/datapallas-ci/win-ci.env] (VM a's, named only),
# WIN_VM_CONF_DIR [/root], RELEASE_MEMINFO [/proc/meminfo], RUN_RECORD_DIR [<LOG_DIR>/runs] (the runs whose marks give
# the times), LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci].
# Exit codes of the command: 0 ok, 2 refused or a wrong argument.
#
# EXAMPLES
#   bash asbl/ci/release-machines.sh check 4 4 --press
#   RELEASE_STEPS=in-order bash asbl/ci/release-machines.sh schedule 1 1
#   RELEASE_REHEARSAL_CONF=asbl/ci/release-layout.example.conf bash asbl/ci/release-machines.sh show   (after chmod 600)

MACHINES_KEYS="RELEASE_STEPS RELEASE_SERVER_GB RELEASE_RUNNERS RELEASE_RUNNER_LIMIT_GB RELEASE_WINDOWS_VMS WIN_VM_MEMORY_GB WIN_VM_DOCKER_MEMORY_GB RELEASE_CI_CONTAINER_LIMIT_GB RELEASE_MIN_FREE_GB RELEASE_ESTIMATES_FILE"
MACHINES_LANES="pack docker-proof server-light electron-light robot"
MACHINES_MIN_FREE_VAR_GB=50   # /var keeps this free at a press: the VMs' overlays and the run's reports grow there
# the /var disk a runner takes in a round (its image store, the volume dp-ci-runner-<n>-docker, and its checkout copy under
# E2E_RUNNERS_HOME, both on /var): a runner with no volume yet copies in this host's images of its list and the CI
# caches (22 GB on 2026-11-05), pulls the rest of what its lane uses, and gets its checkout (9 GB); a runner whose volume
# is there gets each round's new server image (and the CI image when it changed), and keeps the older ones until its
# volume is removed (docker volume rm dp-ci-runner-<n>-docker resets the runner)
MACHINES_RUNNER_FIRST_GB=40
MACHINES_RUNNER_ROUND_GB=4
# what a VM holds of the host when idle (measured 2026-11-06: 5.3 to 6.4 GB). A VM running at a press is already out of
# the available memory by about this much, and can still grow from here to WIN_VM_MEMORY_GB during the round
MACHINES_VM_IDLE_GB=6
# The host lanes' runner: with the runners, step 1's auth file and step 2's Linux proof run in it, one after the other,
# beside the runners of the full set (1 to 4). Its number is fixed, so its images stay in one volume whatever N is
HOST_LANES_RUNNER=5
# The default layouts, by a VM's place in RELEASE_WINDOWS_VMS (plan 16.6.3, "The machines file"): one VM runs every lane in
# 16.6.2's order; with more, the pack and Robot stay together (Robot installs the pack's zips) and the long Windows Docker
# proof gets a VM of its own as soon as there are three
DEFAULT_LAYOUT_1=("pack docker-proof server-light electron-light robot")
DEFAULT_LAYOUT_2=("pack server-light robot" "docker-proof electron-light")
DEFAULT_LAYOUT_3=("pack server-light robot" "docker-proof" "electron-light")
DEFAULT_LAYOUT_4=("pack robot" "server-light" "electron-light" "docker-proof")

# machines_load: the settings file's keys into this shell, each missing one with its default; returns 2 (with a MISSING
# line) when the file exists but others may read or write it
machines_load() {
  local conf="${RELEASE_REHEARSAL_CONF:-/root/release-rehearsal.conf}" key assignments
  if [ -e "$conf" ]; then
    if [ "$(stat -c %u "$conf")" != "$(id -u)" ] || ! case "$(stat -c %a "$conf")" in 600|400) true ;; *) false ;; esac; then
      echo "MISSING a settings file only its owner reads: chown $(id -un) $conf; chmod 600 $conf"
      return 2
    fi
    # the file's values, read in a subshell (it is shell), for the keys of this script only; the caller's environment wins
    assignments=$(
      for key in $MACHINES_KEYS $(compgen -v | grep -E '^(VM_LANES_[1-4]_|VM_DOMAIN_)[a-z0-9]+$'); do unset "$key"; done
      . "$conf" >/dev/null 2>&1
      for key in $MACHINES_KEYS $(compgen -v | grep -E '^(VM_LANES_[1-4]_|VM_DOMAIN_)[a-z0-9]+$'); do
        [ -n "${!key+set}" ] && printf '%s=%q\n' "$key" "${!key}"
      done)
    local assignment name
    while IFS= read -r assignment; do
      [ -n "$assignment" ] || continue
      name="${assignment%%=*}"
      [ -n "${!name+set}" ] || eval "$assignment"   # printf %q's output: one quoted value
    done <<< "$assignments"
  fi
  RELEASE_STEPS="${RELEASE_STEPS:-together}"
  RELEASE_SERVER_GB="${RELEASE_SERVER_GB:-5}"
  RELEASE_RUNNERS="${RELEASE_RUNNERS:-yes}"
  RELEASE_RUNNER_LIMIT_GB="${RELEASE_RUNNER_LIMIT_GB:-24}"
  RELEASE_WINDOWS_VMS="${RELEASE_WINDOWS_VMS:-a}"
  WIN_VM_MEMORY_GB="${WIN_VM_MEMORY_GB:-24}"
  WIN_VM_DOCKER_MEMORY_GB="${WIN_VM_DOCKER_MEMORY_GB:-16}"
  RELEASE_CI_CONTAINER_LIMIT_GB="${RELEASE_CI_CONTAINER_LIMIT_GB:-12}"
  RELEASE_MIN_FREE_GB="${RELEASE_MIN_FREE_GB:-16}"
  RELEASE_ESTIMATES_FILE="${RELEASE_ESTIMATES_FILE:-/var/kraft-internalsystems/apps/cvs/custom-jenkins/home/datapallas/release-estimates.json}"
  return 0
}

# machines_vms_for <M>: the first M VMs of RELEASE_WINDOWS_VMS
machines_vms_for() { local v n=0; for v in $RELEASE_WINDOWS_VMS; do n=$((n + 1)); [ "$n" -le "$1" ] && printf '%s ' "$v"; done | sed 's/ $//'; }
# machines_lanes_of <M> <name>: the lanes VM <name> runs when the round uses M VMs (its key, else its place's default)
machines_lanes_of() {
  local m="$1" name="$2" key="VM_LANES_$1_$2" place=0 v layout
  if [ -n "${!key+set}" ]; then printf '%s' "${!key}"; return; fi
  for v in $(machines_vms_for "$m"); do
    [ "$v" = "$name" ] && { layout="DEFAULT_LAYOUT_$m[$place]"; printf '%s' "${!layout:-}"; return; }
    place=$((place + 1))
  done
}
# machines_domain_of <name>: the VM's libvirt name
machines_domain_of() {
  local key="VM_DOMAIN_$1"
  if [ -n "${!key:-}" ]; then printf '%s' "${!key}"; elif [ "$1" = a ]; then printf 'win10-dev'; else printf 'win10-dev-%s' "$1"; fi
}
# machines_conf_of <name>: the VM's settings file (VM a: win-ci.env; another: its own, WIN_HOST only)
machines_conf_of() {
  if [ "$1" = a ]; then printf '%s' "${WIN_CI_CONF:-/var/kraft-internalsystems/config/datapallas-ci/win-ci.env}"
  else printf '%s/win-ci-%s.env' "${WIN_VM_CONF_DIR:-/root}" "$1"; fi
}
# machines_vm_state <name>: running, off (defined, not running) or missing (no such VM), from virsh
machines_vm_state() {
  local state
  state=$(virsh domstate "$(machines_domain_of "$1")" 2>/dev/null) || { echo missing; return; }
  case "$state" in running) echo running ;; *) echo off ;; esac
}
# machines_vm_memory_kib <name>: the VM's defined memory and current memory, in KiB ("<memory> <currentMemory>"), from its
# definition (virsh dumpxml --inactive); nothing when virsh cannot read it
machines_vm_memory_kib() {
  local xml
  xml=$(virsh dumpxml --inactive "$(machines_domain_of "$1")" 2>/dev/null) || return 0
  printf '%s %s' "$(grep -oP "<memory unit='KiB'>\K[0-9]+" <<< "$xml" | head -1)" "$(grep -oP "<currentMemory unit='KiB'>\K[0-9]+" <<< "$xml" | head -1)"
}
# machines_vm_memory_set <name> [dry]: WIN_VM_MEMORY_GB as the VM's memory (virsh setmaxmem and setmem, --config) when
# its definition differs; says what it did (dry: what it would do); 1 when it could not
machines_vm_memory_set() {
  local dom want=$((WIN_VM_MEMORY_GB * 1048576)) max cur
  dom=$(machines_domain_of "$1")
  read -r max cur <<< "$(machines_vm_memory_kib "$1")"
  [ -n "${max:-}" ] || { echo "WARN    VM $1 ($dom): its defined memory cannot be read (virsh dumpxml --inactive): left as it is"; return 1; }
  [ "$max" != "$want" ] || [ "${cur:-$max}" != "$want" ] || return 0
  if [ "${2:-}" = dry ]; then
    echo "WOULD   VM $1 ($dom): its memory set to $WIN_VM_MEMORY_GB GB (now $((max / 1048576)) GB; virsh setmaxmem and setmem --config: it takes it at its next start)"
    return 0
  fi
  # lower: the current memory first, then the maximum; higher: the maximum first (current never above maximum)
  if [ "$max" -gt "$want" ]; then
    virsh setmem "$dom" "$want" --config >/dev/null 2>&1 && virsh setmaxmem "$dom" "$want" --config >/dev/null 2>&1
  else
    virsh setmaxmem "$dom" "$want" --config >/dev/null 2>&1 && virsh setmem "$dom" "$want" --config >/dev/null 2>&1
  fi || { echo "WARN    VM $1 ($dom): virsh could not set its memory to $WIN_VM_MEMORY_GB GB: left at $((max / 1048576)) GB"; return 1; }
  echo "VM      $1 ($dom): its memory set to $WIN_VM_MEMORY_GB GB, from $((max / 1048576)) GB (--config: it takes it at its next start)"
}
# machines_host_memory_sharing_on [dry]: KSM on this host, when it is not. Windows writes zeros over all its memory within
# minutes of its start, so without KSM a VM holds its whole size on the host from then on, used or not (measured
# 2026-11-06: 24 GB gone in 2.5 minutes, idle). KSM gives those empty pages back, and a page returns to the VM when Windows
# writes to it. use_zero_pages sends empty pages to the kernel's zero page: without it millions of them chain 256 to a page
# and KSM spends a whole core merging almost nothing. pages_to_scan: the default needs half an hour for one pass over the
# VMs. Windows always sees its full size, so KSM falling behind costs the host memory, never the VM: a failure only warns.
machines_host_memory_sharing_on() {
  local ksm="${RELEASE_KSM_DIR:-/sys/kernel/mm/ksm}"
  [ "$(cat "$ksm/run" 2>/dev/null)" != 1 ] || [ "$(cat "$ksm/use_zero_pages" 2>/dev/null)" != 1 ] ||
    [ "$(cat "$ksm/pages_to_scan" 2>/dev/null)" != 1000 ] || return 0
  if [ "${1:-}" = dry ]; then echo "WOULD   host: KSM on (use_zero_pages, 1000 pages a scan): a VM holds only what Windows uses"; return 0; fi
  if { echo 1000 > "$ksm/pages_to_scan" && echo 1 > "$ksm/use_zero_pages" && echo 1 > "$ksm/run"; } 2>/dev/null; then
    echo "HOST    KSM on (use_zero_pages, 1000 pages a scan): a VM holds only what Windows uses"
  else echo "WARN    host: KSM could not be turned on ($ksm): each VM holds its whole size on the host"; fi
}
# machines_vm_memory_placement_set <name> [dry]: the VM's memory spread over this host's NUMA nodes by a rule of its own
# (virsh numatune --config), when it has none. NUMA balancing marks idle pages of memory with no rule of its own, and KSM
# cannot see marked pages on this kernel (the fix: Linux d74943a2): it saw 250,000 of a 24 GB VM's 6.2 million pages. The
# rule takes this VM out of the balancing; turning the balancing off would touch every app on the host. 1 when it could not.
machines_vm_memory_placement_set() {
  local dom xml nodes
  dom=$(machines_domain_of "$1")
  xml=$(virsh dumpxml --inactive "$dom" 2>/dev/null) || return 0   # machines_vm_memory_set has said so
  ! grep -q '<numatune>' <<< "$xml" || return 0
  nodes=$(cat "${RELEASE_NUMA_NODES_FILE:-/sys/devices/system/node/online}" 2>/dev/null)
  [ -n "$nodes" ] || { echo "WARN    VM $1 ($dom): this host's NUMA nodes cannot be read: its memory left unplaced, KSM sees little of it"; return 1; }
  if [ "${2:-}" = dry ]; then
    echo "WOULD   VM $1 ($dom): its memory spread over NUMA nodes $nodes (virsh numatune --config: it takes it at its next start)"
    return 0
  fi
  virsh numatune "$dom" --mode interleave --nodeset "$nodes" --config >/dev/null 2>&1 ||
    { echo "WARN    VM $1 ($dom): virsh could not set its memory placement: KSM sees little of its memory"; return 1; }
  echo "VM      $1 ($dom): its memory spread over NUMA nodes $nodes (--config: it takes it at its next start)"
}
# machines_vm_memory_rules <name> [dry]: what every VM gets before a round: its memory and its placement
machines_vm_memory_rules() { machines_vm_memory_set "$@"; machines_vm_memory_placement_set "$@"; }
# machines_vm_docker_memory_script: the PowerShell of machines_vm_docker_memory_set. .wslconfig holds this one setting.
# The logon start: Docker Desktop starts at the VM's logon, so a VM a round starts has Docker for its lanes, with no one at
# it. It takes three settings: Docker's own AutoStart, the Run entry, and no entry of Windows' StartupApproved, which the
# VMs' disk has set to off and which beats the other two (2026-11-06: VM a came up with no Docker).
machines_vm_docker_memory_script() {
  sed "s/@GB@/$WIN_VM_DOCKER_MEMORY_GB/" <<'PS'
$wsl = Join-Path $env:USERPROFILE '.wslconfig'
$want = '[wsl2]' + [char]13 + [char]10 + 'memory=@GB@GB' + [char]13 + [char]10
if ((Test-Path $wsl) -and ((Get-Content -Raw $wsl) -ceq $want)) { 'WSLCONFIG same' } else { [IO.File]::WriteAllText($wsl, $want); 'WSLCONFIG written' }
$store = Join-Path $env:APPDATA 'Docker\settings-store.json'
$settings = Get-Content -Raw $store | ConvertFrom-Json
if ($settings.AutoStart -eq $true) { 'AUTOSTART same' } else {
  $settings | Add-Member -Force -NotePropertyName AutoStart -NotePropertyValue $true
  [IO.File]::WriteAllText($store, ($settings | ConvertTo-Json -Depth 20)); 'AUTOSTART on' }
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Docker Desktop' -Value 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
if ((Get-Item $approved -ErrorAction SilentlyContinue).Property -contains 'Docker Desktop') {
  Remove-ItemProperty $approved -Name 'Docker Desktop'; 'STARTUP allowed' } else { 'STARTUP same' }
PS
}
# machines_vm_docker_memory_set <name>: on the VM, over SSH: Docker's ceiling (.wslconfig: WSL takes it at its next start)
# and Docker Desktop's start at logon; 1 when the VM did not confirm both
machines_vm_docker_memory_set() {
  local dom out said
  dom=$(machines_domain_of "$1")
  out=$(machines_vm_docker_memory_script | WIN_VM="$1" bash asbl/ci/dp-ci.sh win ps 2>&1)
  said=$(tr -d '\r' <<< "$out" | grep -E '^(WSLCONFIG|AUTOSTART|STARTUP) ' | paste -sd',' | sed 's/,/, /g')
  case "$said" in
    WSLCONFIG*AUTOSTART*STARTUP*) echo "VM      $1 ($dom): Docker up to $WIN_VM_DOCKER_MEMORY_GB GB, started at logon ($said): it takes them at WSL's next start" ;;
    *) echo "WARN    VM $1 ($dom): Docker's memory not confirmed: $(tr -d '\r' <<< "$out" | tail -2 | paste -sd' ' | cut -c1-200)"; return 1 ;;
  esac
}
# machines_vms_memory_setup: the same memory settings on every VM named, one VM at a time: each VM started here writes
# zeros over all its memory before KSM gives it back, so two at once could take the host's free memory
machines_vms_memory_setup() {
  local v started rc=0
  machines_host_memory_sharing_on
  for v in $RELEASE_WINDOWS_VMS; do
    machines_vm_memory_rules "$v" || rc=1
    started=no
    if [ "$(machines_vm_state "$v")" = off ]; then machines_vm_start "$v" || { rc=1; continue; }; started=yes; fi
    machines_vm_docker_memory_set "$v" || rc=1
    [ "$started" = no ] || machines_vm_shutdown "$v"
  done
  return "$rc"
}
# machines_duration <seconds>: "15 min", or "40 s" under a minute
machines_duration() { if [ "$1" -ge 60 ]; then echo "$(($1 / 60)) min"; else echo "$1 s"; fi; }
# machines_vm_answers <name>: the VM answers over SSH now (dp-ci.sh win ssh ver)
machines_vm_answers() { WIN_VM="$1" bash asbl/ci/dp-ci.sh win ssh ver >/dev/null 2>&1; }
# machines_vm_start <name>: virsh start, then wait until it answers over SSH (VM_SSH_WAIT_SECS at most); 0 when it does,
# 1 when it did not start or never answered ("VM <name> did not start ...": its lanes are red)
machines_vm_start() {
  local dom waited=0 wait="${VM_SSH_WAIT_SECS:-900}" every="${VM_POLL_SECS:-15}"
  dom=$(machines_domain_of "$1")
  virsh start "$dom" >/dev/null 2>&1 || { echo "VM $1 ($dom) did not start: virsh start failed"; return 1; }
  echo "VM      $1 ($dom): started (virsh start); waiting for its SSH, $(machines_duration "$wait") at most"
  until machines_vm_answers "$1"; do
    [ "$waited" -lt "$wait" ] || { echo "VM $1 ($dom) did not start: no SSH answer within $(machines_duration "$wait") of virsh start"; return 1; }
    sleep "$every"; waited=$((waited + every))
  done
  echo "VM      $1 ($dom): answers over SSH, after about $waited s"
}
# machines_vm_docker_wait <name>: wait until Docker answers on a VM just started: Docker Desktop comes up after the logon,
# a minute or two after SSH, and a lane asks for it at its very top. Never red by itself: the lane's own check says it.
machines_vm_docker_wait() {
  local dom waited=0 wait="${VM_SSH_WAIT_SECS:-900}" every="${VM_POLL_SECS:-15}"
  dom=$(machines_domain_of "$1")
  until WIN_VM="$1" bash asbl/ci/dp-ci.sh win ssh docker info >/dev/null 2>&1; do
    [ "$waited" -lt "$wait" ] || { echo "WARN    VM $1 ($dom): no Docker within $(machines_duration "$wait") of its SSH: its lanes will say so"; return 0; }
    sleep "$every"; waited=$((waited + every))
  done
  echo "VM      $1 ($dom): Docker answers, after about $waited s"
}
# machines_vm_shutdown <name>: virsh shutdown, then virsh destroy when it is still running after VM_SHUTDOWN_WAIT_SECS
machines_vm_shutdown() {
  local dom waited=0 wait="${VM_SHUTDOWN_WAIT_SECS:-600}" every="${VM_POLL_SECS:-15}"
  dom=$(machines_domain_of "$1")
  [ "$(machines_vm_state "$1")" = running ] || { echo "VM      $1 ($dom): off already"; return 0; }
  virsh shutdown "$dom" >/dev/null 2>&1 || echo "WARN    VM $1 ($dom): virsh shutdown failed"
  while [ "$(machines_vm_state "$1")" = running ]; do
    if [ "$waited" -ge "$wait" ]; then
      virsh destroy "$dom" >/dev/null 2>&1
      echo "VM      $1 ($dom): still running $(machines_duration "$wait") after virsh shutdown: virsh destroy"; return 0
    fi
    sleep "$every"; waited=$((waited + every))
  done
  echo "VM      $1 ($dom): shut down (virsh shutdown)"
}
# machines_available_gb: the host's available memory now, in whole GB (GiB, MemAvailable)
machines_available_gb() { awk '/^MemAvailable:/ { printf "%d", $2 / 1048576 }' "${RELEASE_MEMINFO:-/proc/meminfo}"; }
machines_servers_for() { echo $(($1 + 1)); }   # the host test servers of a choice: N subsets + step 2's (the plan's rule)
# machines_runners_used: yes when step 1's full set runs in runners (RELEASE_RUNNERS=yes with the steps together)
machines_runners_used() { [ "$RELEASE_RUNNERS" = yes ] && [ "$RELEASE_STEPS" = together ] && echo yes || echo no; }
# machines_vm_growth_gb: what a running VM can still take from the host during a round: from idle up to its ceiling
machines_vm_growth_gb() {
  local growth=$((WIN_VM_MEMORY_GB - MACHINES_VM_IDLE_GB))
  [ "$growth" -gt 0 ] && echo "$growth" || echo 0
}
# machines_ceilings_text: a round's memory ceilings, as the job's form says them under its memory line
machines_ceilings_text() {
  echo "ceilings: a runner up to $RELEASE_RUNNER_LIMIT_GB GB, dp-ci in it up to $RELEASE_CI_CONTAINER_LIMIT_GB GB; a VM up to $WIN_VM_MEMORY_GB GB, Docker in it up to $WIN_VM_DOCKER_MEMORY_GB GB"
}
# machines_servers_text <N>: what the memory rule's N + 1 host test servers are, with the runners
machines_servers_text() {
  [ "$(machines_runners_used)" = yes ] || return 0
  case "$1" in
    1) printf '%s' " (runner 1 and the host lanes' runner)" ;;
    2) printf '%s' " (runners 1, 2 and the host lanes' runner)" ;;
    *) printf '%s' " (runners 1 to $1 and the host lanes' runner)" ;;
  esac
}
# machines_runner_disk <N>: "<GB> <what>" the round's runners take on /var: MACHINES_RUNNER_FIRST_GB for each runner with
# no volume yet, MACHINES_RUNNER_ROUND_GB for each whose volume is there (docker volume inspect); "0" without runners
machines_runner_disk() {
  local n k gb=0 new="" kept=""
  n="$1"
  [ "$(machines_runners_used)" = yes ] || { echo 0; return 0; }
  for k in $(seq 1 "$n") "$HOST_LANES_RUNNER"; do
    if docker volume inspect "dp-ci-runner-$k-docker" >/dev/null 2>&1; then kept="$kept $k"; gb=$((gb + MACHINES_RUNNER_ROUND_GB))
    else new="$new $k"; gb=$((gb + MACHINES_RUNNER_FIRST_GB)); fi
  done
  printf '%s ' "$gb"
  [ -z "$new" ] || printf 'runner%s%s with no volume yet x %s GB' "$([ "$(wc -w <<< "$new")" = 1 ] || echo s)" "$new" "$MACHINES_RUNNER_FIRST_GB"
  [ -z "$new" ] || [ -z "$kept" ] || printf ', '
  [ -z "$kept" ] || printf 'runner%s%s with a volume x %s GB' "$([ "$(wc -w <<< "$kept")" = 1 ] || echo s)" "$kept" "$MACHINES_RUNNER_ROUND_GB"
  echo
}

# machines_check <N> <M> [--press]: every rule for these Advanced values; prints one REFUSED line per broken rule (with
# its numbers) and returns 2, or prints MACHINES OK and returns 0
machines_check() {
  local n="$1" m="$2" press="${3:-}" refused=0 vms v lanes lane count place robot_place light_place electron_place
  local key value need available free_var starts="" growing="" servers disk disk_gb=0 ceilings inner outer
  refuse_rule() { echo "REFUSED $*"; refused=1; }
  case "$n" in 1|2|3|4) ;; *) refuse_rule "SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=$n: it must be 1, 2, 3 or 4" ;; esac
  case "$m" in 1|2|3|4) ;; *) refuse_rule "USE_N_NUMBER_OF_WINDOWS_VMS=$m: it must be 1, 2, 3 or 4" ;; esac
  [ "$refused" = 0 ] || return 2
  case "$RELEASE_STEPS" in
    together) ;;
    in-order) [ "$n" = 1 ] && [ "$m" = 1 ] ||
      refuse_rule "RELEASE_STEPS=in-order runs 16.6.2's order with nothing split: N and M must be 1 (got N=$n, M=$m)" ;;
    *) refuse_rule "RELEASE_STEPS=$RELEASE_STEPS: it must be together or in-order" ;;
  esac
  case "$RELEASE_RUNNERS" in
    yes) ;;
    no) [ "$n" = 1 ] || [ "$RELEASE_STEPS" != together ] ||
          refuse_rule "SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=$n with RELEASE_RUNNERS=no: the full set runs whole on this host's one Docker engine, which runs one DataPallas e2e set at a time (the shipped compose files fix the container names, the ports and the network): N must be 1" ;;
    *) refuse_rule "RELEASE_RUNNERS=$RELEASE_RUNNERS: it must be yes or no" ;;
  esac
  for key in RELEASE_SERVER_GB RELEASE_RUNNER_LIMIT_GB WIN_VM_MEMORY_GB WIN_VM_DOCKER_MEMORY_GB RELEASE_CI_CONTAINER_LIMIT_GB RELEASE_MIN_FREE_GB; do
    value="${!key}"; [[ "$value" =~ ^[0-9]+$ ]] || refuse_rule "$key=$value: it must be a whole number of GB"
  done
  # a box stays under the box it runs in: a runaway reaches its own ceiling first and ends there
  for ceilings in "WIN_VM_DOCKER_MEMORY_GB WIN_VM_MEMORY_GB" "RELEASE_CI_CONTAINER_LIMIT_GB RELEASE_RUNNER_LIMIT_GB"; do
    read -r inner outer <<< "$ceilings"
    [[ "${!inner}" =~ ^[0-9]+$ && "${!outer}" =~ ^[0-9]+$ ]] || continue   # not a number: said above
    [ "${!inner}" -lt "${!outer}" ] || refuse_rule "$inner=${!inner}: it runs inside $outer=${!outer}, so it must stay under it"
  done
  for v in $RELEASE_WINDOWS_VMS; do [[ "$v" =~ ^[a-z0-9]+$ ]] || refuse_rule "RELEASE_WINDOWS_VMS names '$v': a VM's name is lowercase letters and digits"; done
  count=$(wc -w <<< "$RELEASE_WINDOWS_VMS")
  if [ "$m" -gt "$count" ]; then
    refuse_rule "USE_N_NUMBER_OF_WINDOWS_VMS=$m, but RELEASE_WINDOWS_VMS has $count VM(s) ($RELEASE_WINDOWS_VMS): the others are not created yet"
    m=$count
  fi
  vms=$(machines_vms_for "$m")
  # the layout for M VMs: every lane once, Robot on the pack's VM and last there, the server light set before Electron
  for lane in $MACHINES_LANES; do
    count=0; for v in $vms; do for value in $(machines_lanes_of "$m" "$v"); do [ "$value" = "$lane" ] && count=$((count + 1)); done; done
    [ "$count" = 1 ] || refuse_rule "the layout for $m VM(s) runs $lane $count times: every lane runs once ($(for v in $vms; do printf 'VM_LANES_%s_%s="%s" ' "$m" "$v" "$(machines_lanes_of "$m" "$v")"; done | sed 's/ $//'))"
  done
  for v in $vms; do
    lanes=$(machines_lanes_of "$m" "$v")
    for lane in $lanes; do case " $MACHINES_LANES " in *" $lane "*) ;; *) refuse_rule "VM_LANES_${m}_$v names '$lane': the lanes are $MACHINES_LANES" ;; esac; done
    place=0; robot_place=""; light_place=""; electron_place=""
    for lane in $lanes; do
      place=$((place + 1))
      case "$lane" in robot) robot_place=$place ;; server-light) light_place=$place ;; electron-light) electron_place=$place ;; esac
    done
    if [ -n "$robot_place" ]; then
      [ "$robot_place" = "$place" ] || refuse_rule "VM_LANES_${m}_$v=\"$lanes\": Robot must be last on its VM (it removes Java)"
      case " $lanes " in *" pack "*) ;; *) refuse_rule "VM_LANES_${m}_$v=\"$lanes\": Robot runs on the pack's VM (it installs the pack's zips)" ;; esac
    fi
    if [ -n "$light_place" ] && [ -n "$electron_place" ] && [ "$electron_place" -lt "$light_place" ]; then
      refuse_rule "VM_LANES_${m}_$v=\"$lanes\": the server light set comes before the Electron light set on one VM (the Electron package empties asbl\\dist)"
    fi
  done
  if [ "$press" = --press ]; then
    # what the host must have now: each added VM's settings file (VM a's win-ci.env is release-publish.sh preflight
    # docker's, at the same start) and each VM in libvirt; the memory rule: the host test servers (with the runners: each
    # runner and the host lanes' runner, each one host test server), plus each VM this round would start at its ceiling
    # and what each VM running now can still grow by (machines_vm_growth_gb), against what is
    # available now; the disk rule: /var's free disk, less what the runners take there (machines_runner_disk)
    for v in $vms; do
      [ "$v" = a ] || [ -e "$(machines_conf_of "$v")" ] || refuse_rule "VM $v has no settings file $(machines_conf_of "$v")"
      case "$(machines_vm_state "$v")" in
        running) growing="$growing $v" ;;
        off) starts="$starts $v" ;;
        missing) refuse_rule "VM $v (libvirt $(machines_domain_of "$v")) does not exist: not created yet" ;;
      esac
    done
    servers=$(machines_servers_for "$n")
    need=$((servers * RELEASE_SERVER_GB + $(wc -w <<< "$growing") * $(machines_vm_growth_gb) + $(wc -w <<< "$starts") * WIN_VM_MEMORY_GB))
    available=$(machines_available_gb)
    if [ -z "$available" ]; then refuse_rule "the host's available memory cannot be read (${RELEASE_MEMINFO:-/proc/meminfo})"
    elif [ $((available - need)) -lt "$RELEASE_MIN_FREE_GB" ]; then
      refuse_rule "memory: N=$n M=$m needs $need GB ($servers host test servers x $RELEASE_SERVER_GB GB$(machines_servers_text "$n")${growing:+, VMs$growing running, each can grow by $(machines_vm_growth_gb) GB}${starts:+, VMs$starts to start x $WIN_VM_MEMORY_GB GB}), $available GB are available now: $((available - need)) GB would stay free, under RELEASE_MIN_FREE_GB=$RELEASE_MIN_FREE_GB"
    fi
    free_var=$(df -BG --output=avail /var 2>/dev/null | tail -1 | tr -dc '0-9')
    disk=$(machines_runner_disk "$n"); disk_gb=${disk%% *}
    if [ -z "$free_var" ]; then refuse_rule "disk: /var's free disk cannot be read (df /var)"
    elif [ "$disk_gb" = 0 ] && [ "$free_var" -lt "$MACHINES_MIN_FREE_VAR_GB" ]; then
      refuse_rule "disk: /var has $free_var GB free, under the $MACHINES_MIN_FREE_VAR_GB GB a round keeps free"
    elif [ $((free_var - disk_gb)) -lt "$MACHINES_MIN_FREE_VAR_GB" ]; then
      refuse_rule "disk: N=$n: /var has $free_var GB free, the runners take about $disk_gb GB there (${disk#* }): $((free_var - disk_gb)) GB would stay free, under the $MACHINES_MIN_FREE_VAR_GB GB a round keeps free"
    fi
  fi
  [ "$refused" = 0 ] || return 2
  echo "MACHINES OK steps=$RELEASE_STEPS jobs=$n vms=$m ($vms)$([ "$press" = --press ] && printf ', memory: needs %s GB of %s GB available, %s GB stay free (rule %s); /var %s GB free%s (rule %s)' "$need" "$available" "$((available - need))" "$RELEASE_MIN_FREE_GB" "$free_var" "$([ "$disk_gb" = 0 ] || printf ', the runners take about %s GB, %s GB stay free' "$disk_gb" "$((free_var - disk_gb))")" "$MACHINES_MIN_FREE_VAR_GB")"
}

# machines_full_target: the full set's target of the version to release next (release-state.sh full-lane --choose, dry).
# Before step 0 the checkout still holds the version released last, whose record says where ITS full set ran; when the
# CHANGELOG's first heading names a newer version (the one step 0 sets), that release runs on the other target, as step
# 1's own choice will (release-state.sh: the other side of the newest earlier release's record).
machines_full_target() {
  local commit="${1:-origin/main}" chosen full version next_version
  chosen=$(RELEASE_COMMIT="$commit" DRY_RUN=yes bash asbl/ci/release-state.sh full-lane --choose 2>/dev/null |
    grep -m1 '^FULL_LANE=')
  full=$(printf '%s' "$chosen" | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p')
  version=$(printf '%s' "$chosen" | sed -n 's/^FULL_LANE=[a-z-]* version=\([0-9][0-9.]*\):.*/\1/p')
  next_version=$(git show "$commit:asbl/src/main/external-resources/db-template/CHANGELOG.md" 2>/dev/null | tr -d '\r' |
    sed -n 's/^## \([0-9][0-9.]*\) - .*/\1/p' | head -1)
  if [ -n "$full" ] && [ -n "$version" ] && [ -n "$next_version" ] && [ "$next_version" != "$version" ]; then
    case "$full" in web) full=docker-server ;; docker-server) full=web ;; esac
  fi
  printf '%s' "${full:-docker-server}"
}
# machines_schedule <N> <M> [<full target>]: the expected schedule (asbl/ci/release-estimate.py schedule)
machines_schedule() {
  local n="$1" m="$2" target="${3:-}" vms v args=() off=""
  vms=$(machines_vms_for "$m")
  for v in $vms; do args+=(--layout "$v=$(machines_lanes_of "$m" "$v")"); done
  for v in $vms; do [ "$v" = a ] || off="$off $v"; done
  [ -n "$target" ] || target=$(machines_full_target)
  python3 -I asbl/ci/release-estimate.py schedule --runs "${RUN_RECORD_DIR:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/runs}" \
    --target "$target" --jobs "$n" --vms "$vms" "${args[@]}" --steps "$RELEASE_STEPS" --runners "$([ "$RELEASE_RUNNERS" = no ] && echo no || echo yes)" \
    --server-gb "$RELEASE_SERVER_GB" --vm-gb "$WIN_VM_MEMORY_GB" --vm-idle-gb "$MACHINES_VM_IDLE_GB" --vms-off "${off# }"
}

# machines_estimates [<full target>]: the 16 Advanced choices, N and M from 1 to 4, as JSON on stdout (asbl/ci/release-
# estimate.py estimates; release-rehearsal.sh estimate writes it where the job's form reads it): the layout of each VM
# count the named VMs allow, and each choice's REFUSED lines of machines_check (its rules, not the host's state now:
# the form reads the memory itself, and the press checks it all again)
machines_estimates() {
  local target="${1:-}" n m v why args=()
  for m in 1 2 3 4; do
    [ "$m" -le "$(wc -w <<< "$RELEASE_WINDOWS_VMS")" ] || continue
    for v in $(machines_vms_for "$m"); do args+=(--layout "$m:$v=$(machines_lanes_of "$m" "$v")"); done
  done
  for n in 1 2 3 4; do
    for m in 1 2 3 4; do
      while IFS= read -r why; do [ -z "$why" ] || args+=(--refused "$n:$m=$why"); done < <(machines_check "$n" "$m" | sed -n 's/^REFUSED //p')
    done
  done
  [ -n "$target" ] || target=$(machines_full_target)
  python3 -I asbl/ci/release-estimate.py estimates --runs "${RUN_RECORD_DIR:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/runs}" \
    --target "$target" --vms-named "$RELEASE_WINDOWS_VMS" "${args[@]}" --steps "$RELEASE_STEPS" --runners "$([ "$RELEASE_RUNNERS" = no ] && echo no || echo yes)" \
    --server-gb "$RELEASE_SERVER_GB" \
    --vm-gb "$WIN_VM_MEMORY_GB" --vm-idle-gb "$MACHINES_VM_IDLE_GB" --min-free-gb "$RELEASE_MIN_FREE_GB" \
    --ceilings "$(machines_ceilings_text)"
}

machines_show() {
  local m v key
  for key in $MACHINES_KEYS; do printf '%s=%s\n' "$key" "${!key}"; done
  for m in $(seq 1 "$(wc -w <<< "$RELEASE_WINDOWS_VMS")" | head -4); do   # the layouts the named VMs can use
    for v in $(machines_vms_for "$m"); do printf 'VM_LANES_%s_%s="%s"\n' "$m" "$v" "$(machines_lanes_of "$m" "$v")"; done
  done
  for v in $RELEASE_WINDOWS_VMS; do printf 'VM %s: libvirt %s, settings %s\n' "$v" "$(machines_domain_of "$v")" "$(machines_conf_of "$v")"; done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  cd "$(dirname "$0")/../.." || exit 2
  machines_load || exit 2
  case "${1:-help}" in
    show)     machines_show ;;
    check)    [ "$#" -ge 3 ] || { echo "usage: $0 check <N> <M> [--press]"; exit 2; }; machines_check "$2" "$3" "${4:-}"; exit $? ;;
    schedule) [ "$#" -ge 3 ] || { echo "usage: $0 schedule <N> <M>"; exit 2; }
              machines_check "$2" "$3" >/dev/null || { machines_check "$2" "$3"; exit 2; }; machines_schedule "$2" "$3" ;;
    vm-memory-setup) machines_vms_memory_setup; exit $? ;;
    lanes)    python3 -I asbl/ci/release-estimate.py lanes --runs "${RUN_RECORD_DIR:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/runs}" ;;
    help|-h|--help) sed -n '2,/^MACHINES_KEYS=/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' ;;
    *) echo "usage: $0 show|check <N> <M> [--press]|schedule <N> <M>|lanes|vm-memory-setup|help"; exit 2 ;;
  esac
fi

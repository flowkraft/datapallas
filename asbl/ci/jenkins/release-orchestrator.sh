#!/bin/bash
# The release's order, one execution per start: step 0, step 1's lanes, then one execution of steps 2 and 3 pinned to one
# commit, on two tracks at once (this host, the Windows VM). It runs the order and nothing else: the work stays in the step
# scripts it calls (release-set-version.sh, release-step1.sh, release-docker.sh, win-e2e.sh release), the ones the jobs run.
# It replaces /root/pra2-chain.sh, outside the repo, which stays as it is.
#
# HOW: two orders, as the machines file's RELEASE_STEPS says (asbl/ci/release-machines.sh).
# TOGETHER, the default (release 16.6.3): 0., 2. and 5. as below; then steps 1, 2 and 3 start at once, on two tracks, every
#   part to its end whatever the others say:
#     host  one part at a time (this host's one Docker engine runs one DataPallas e2e set at a time: the shipped compose
#           files fix the container names, the ports and the network). With the runners (RELEASE_RUNNERS=yes, the
#           machines file's default): step 2's build (DOCKER_RELEASE_PART=build) on this host's engine, then in the host
#           lanes' runner step 1's lane 2 (the auth file) and step 2's Linux proof (DOCKER_RELEASE_PART=linux-proof; it
#           runs whatever the auth file says), so a round starts no app on the engine this host's own apps share, then
#           step 2's keep part once the Windows Docker proof ended. With RELEASE_RUNNERS=no: step 2's linux
#           part (the build, then the Linux proof), step 1's lanes 2 and 1, then the keep part. A lane or part that needs
#           the build is NOT RUN when the build is red
#     runners  with the runners: from the build's end mark (DOCKER RELEASE STEP 2/6 END, never the build part's end),
#           step 1's lane 1, the full set in SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS runners at once (1, the
#           default: the whole full set in one runner), each a Docker engine of its own with its list of
#           asbl/ci/full-set-runners.txt (release-step1.sh E2E_RUNNERS=<N>: asbl/ci/e2e-runners.sh full-set), then the
#           merge into the lane's one log and one report, and step 1's record as for the lane run whole. A red runner, or
#           one that did not start (its files NOT_RUN), makes lane 1 red. The runner lists are checked before anything
#           starts (asbl/ci/full-set-runners.py check: refused = exit 2, nothing done)
#     VM    as in 4. below: the pack, the Windows Docker proof once the build ended, the server light set, Electron, Robot
#     VMs   with USE_N_NUMBER_OF_WINDOWS_VMS=M above 1, one track per VM instead: each VM runs its lanes of the layout for M
#           VMs (VM_LANES_<M>_<name>, asbl/ci/release-machines.sh), in order, each when its inputs exist: the Windows Docker
#           proof once the build ended, the server light set once the pack ended (it installs its datapallas-server.zip),
#           Robot after the pack on the pack's VM. Each VM whose lanes test on its e2e package has it once per pin: the
#           pack's VM right after the pack (win-e2e.sh prepare: seconds, a green pack stamps its own package); every other
#           VM a copy of the pack's (windows-package-<vm>, win-e2e.sh package), which the pack's VM makes once, while it
#           packs, when this pack's NoExeAssembler finished (windows-package-from-pack, dp-ci.sh win package-pull: one
#           archive through this host, sha256 checked, removed once every VM took it). A VM whose stamp is the pin's
#           already takes nothing; when no copy can be made (the pack red before that line, a check not met, a copy red)
#           the VM prepares its own, as before. A red package part stops none of its lanes: each prepares the package
#           itself first, as when pressed alone. Each lane alone (WIN_RELEASE_HALF=<lane>); once every lane ended, step
#           3's verdict on the pack's VM (WIN_RELEASE_HALF=verdict)
#   Step 1 is not asked before steps 2 and 3: their parts get RELEASE_STEP1_AT_SIGNOFF=yes, which release-state.sh
#   step1-guard honours inside this run only, and the sign-off asks it at the end (release-state.sh step1-guard): not green
#   = the run is red. Every lane runs whatever the release record says (no verdict carried: a run after fixes starts from
#   scratch, step 1 included). The step jobs pressed alone, MODE=upload and MODE=public keep every check.
# IN-ORDER (RELEASE_STEPS=in-order, 16.6.2's order, the off switch), in order (execution 2: the same from 2, after the fixes):
#   0. who started it, first: STARTED_BY=<who>  <UTC time>  :: release orchestrator ... (asbl/ci/marks.sh run_record_begin);
#      its folder <RUN_RECORD_DIR>/<UTC>-release-orchestrator-.../ holds run.log (this console) and one log per part;
#   1. step 0, only when RELEASE_VERSION is given (execution 1): release-set-version.sh with DRY_RUN=yes, then for real;
#      the commit it pushes is the pin. A red step 0 starts nothing else: the version is what everything after it tests;
#   2. the pin: RELEASE_PIN, else step 0's commit, else origin/main now (fetched). Every part gets RELEASE_PIN: dp-ci.sh puts
#      this checkout and the VM's on that commit, never on a later main (sync_host_repo, win_sync_repo), and the moved-main
#      checks of steps 2 and 3 ask only whether the part tested it (release-state.sh moved-main), so main may move, even by
#      a product change; execution 2: refused unless release-rerun.sh show says "ready for execution 2" (TODO 2's list);
#   3. step 1, the lanes a release needs (release-state.sh full-lane --choose) that are not green on the pin (release-state.sh
#      require: on the pin, or on an earlier commit when only tests or CI changed since), each through release-step1.sh, on
#      this host only: the build of the pin first when a lane takes it (dp-ci.sh build-if-needed), then lane 2
#      (docker-server-auth), then lane 1 (this release's full set, web or docker-server). Nothing on the VM: the Windows
#      light sets are step 3's (owner, 2026-11-02 and 2026-11-03: each step one channel);
#      every lane with retries 1, the owner's rule for a release (2026-10-30), as in the light sets of steps 2 and 3;
#      then the guard steps 2 and 3 make (release-state.sh step1-guard): not green and no approval = no execution, the
#      re-run commands printed (a lane red on a few tests is completed by re-running them, release-rerun.sh);
#   4. the execution, two tracks at once (the VM's parts one after the other, never two at once):
#        host  step 2's linux part: the build, then the Linux proof (release-docker.sh, DOCKER_RELEASE_PART=linux);
#              then, once both proofs ended, its keep part: keep, guard, verdict (DOCKER_RELEASE_PART=keep)
#        VM    step 3's pack (win-e2e.sh release, WIN_RELEASE_HALF=pack); then step 2's Windows Docker proof once the
#              build is there (DOCKER_RELEASE_PART=windows); then step 3's server light set on the pack's own
#              datapallas-server.zip, its Electron light set, Robot and its verdict (WIN_RELEASE_HALF=after-pack)
#      A red part never stops one that can still run: a red build leaves the Windows Docker proof and the Docker keep NOT
#      RUN, a red pack leaves the server light set and Robot NOT RUN (step 3 says so); the rest runs;
#   5. the summary: each part PASS, FAIL or NOT RUN with its reason and its log; the flaky tests; after execution 1, the
#      failures to fix (release-keep.sh failures); the history line (marks.sh run_record_end). Exit 0 only when every part
#      passed.
#
# THE RUN FOLDER (<RUN_RECORD_DIR>/<UTC>-release-orchestrator-.../), what a person, release-rehearsal.sh and the Jenkins job
# read there:
#   run.log            this console
#   <id>.log, <id>.rc  one per part started (step0, step1-build, lane*, docker-linux (with the runners the build only),
#                      docker-linux-proof (with the runners), docker-windows, docker-keep,
#                      windows-pack, windows-after-pack; with more VMs windows-prepare-<vm> (the pack's VM),
#                      windows-package-from-pack, windows-package-<vm> (the others), windows-server-light,
#                      windows-electron-light, windows-robot, windows-verdict): its output and its exit code ("-" = not run)
#   e2e-package.tar    with more VMs, the pack's e2e package for the other VMs while they take it (removed then; a
#                      crashed round leaves it here), and its record beside it: .sha256 (its sha256, file count, commit)
#                      or .none (why there is no copy)
#   result.txt         written at every end: key=value lines, then one tab-separated line per part of the summary
#                        result=green|red  dry_run=yes|no  execution=1|2  version=<x.y.z>  pin=<commit>
#                        kept=<the kept folder of the pin, or empty>  step1=green|red|not-run  summary=<run.log>
#                        flaky=<flaky.txt>  failure_report=<path> (one line per channel report in the kept folder)
#                        part <TAB> <name> <TAB> <machine: host|windows-vm> <TAB> PASS|FAIL|NOT_RUN <TAB> <log>
#                             <TAB> <reports: the Playwright JSONs and HTML folders, the Robot report, space-separated>
#                             <TAB> <why, for a part that did not pass>
#   flaky.txt          written at every end: the tests that passed only on a retry, from each part's Playwright JSON, one
#                      tab-separated line each: <part> <TAB> <test> <TAB> <file:line> <TAB> <report>. A test Playwright
#                      counts as flaky but that never passed (its retry skipped or cut off) is a failure, not listed here
#   started.txt        what each part starts, one tab-separated line each, added BEFORE the part starts (so a stop in
#                      between finds it): <UTC> <TAB> <part> <TAB> <kind> <TAB> <name> <TAB> real|dry-run <TAB> <what>
#                        container <name>     a container of this host's Docker (dp-ci: dp-ci.sh's run container;
#                                             dp-ci-runner-<n>: a runner, whole, its engine and all it runs)
#                        compose <folder>     the docker-server bundle a Linux e2e brings up there (docker compose)
#                        pidfile <path>       a process that outlives this one (win-e2e.sh's Windows driver)
#                        vm <name>            the Windows VM's scheduled tasks of that lane (dp-ci.sh win stop <step>);
#                                             windows-vm is VM a, windows-vm-<name> another
#                        domain <libvirt name>  a Windows VM this run started (part vm-<name>): shut down by a stop
#                      A dry run writes the lines it would write, marked dry-run: it started none of them
#   memory.log         a real run only, every MEMORY_EVERY seconds while it runs: this host's free -m and CPU load
#                      (/proc/loadavg and the CPU count), docker stats of the run's containers (started.txt's, a runner
#                      whole, and those of its compose folders), and each of the round's VMs' own memory (committed, its
#                      peak since boot, the commit limit, physical total and available, in bytes, over dp-ci.sh win ps
#                      with WIN_VM=<name>; machine windows-vm for VM a, windows-vm-<name> for another; a VM virsh says is
#                      off is not asked); one tab-separated line each: <UTC> <TAB> <machine> <TAB> <what> <TAB> <values>
#   caps-reached.log   a real run only, when a box of the run on this host reached its memory ceiling or a ceiling killed a
#                      process of it, read at each sample and at the run's end: one line per box the first time, as
#                      memory.log's (<what> names the box); the SUMMARY repeats them
#
# INPUTS (environment):
#   ORCH_STARTED_BY        REQUIRED, who started it: the first line of the log and the history line (none: MISSING, exit 2)
#   EXECUTION [1]          1 = step 0 (with RELEASE_VERSION), step 1, execution 1; 2 = step 1 (only what is not green on the
#                          pin), execution 2
#   RELEASE_VERSION [empty]  step 0's version (execution 1 only); empty = no step 0, the version already in the tree
#   RELEASE_PIN [empty]    the commit of this execution; empty = step 0's commit, else origin/main at the start
#   MODE [rehearsal]       the only mode it runs: MODE=public and step 4 come after the sign-off, not from here
#   UPLOAD [no]            the only value: it stops before the upload (release day: MODE=upload UPLOAD=yes, the jobs)
#   E2E_APPROVAL, E2E_APPROVAL_USER [empty]   the owner's approval, passed on to the steps' guards only when given in
#                          the environment of this start; never written in a file
#   DRY_RUN=yes [no]       the order, the pin, the step 1 lanes it would run and each part with its command, then the summary
#                          as the schedule makes it; it runs, builds, records and fetches nothing (it reads the release record)
#   DRY_RUN_RED="<part>..." [empty]   a dry run only: the parts that come out red, to see what still runs after them
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci], RUN_RECORD_DIR [<LOG_DIR>/runs], RELEASE_STATE_DIR,
#   RELEASE_ARTIFACTS_DIR  as the step scripts read them (a dry run may point them at scratch copies)
#   MEMORY_EVERY [60]      seconds between two samples of memory.log: its peaks are what the memory rule counts next time
#   RELEASE_CGROUP_DIR [/sys/fs/cgroup/system.slice]   where this host's containers' memory counters are
#   RELEASE_LIBVIRT_RUN_DIR [/run/libvirt/qemu], RELEASE_PROC_DIR [/proc]   where a running VM's process and its memory are
#   RELEASE_ZRAM_SYS_DIR [/sys/block/zram0]   where the zram swap's own counters are
#   Advanced (Parallelization), the job's two values (release-rehearsal.sh passes them on), 1 to 4 each:
#     SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS [1]   step 1's full set in that many runners (HOW, runners)
#     USE_N_NUMBER_OF_WINDOWS_VMS [1]                         the Windows lanes over that many VMs
#   THE MACHINES: RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf], the machines file (asbl/ci/release-machines.sh,
#   with asbl/ci/release-layout.example.conf): RELEASE_STEPS, RELEASE_RUNNERS (no: step 1's full set on this host's engine,
#   N = 1), the memory per host test server and per VM, the VMs and the
#   lanes each runs. Checked before anything starts (exit 2 with a REFUSED line per broken rule); every run prints the
#   SCHEDULE it expects, each part's time from the last release runs' marks.
#   THE VMS (release-machines.sh, A ROUND'S VMS): before anything starts, KSM is on and each VM the parts use gets
#   WIN_VM_MEMORY_GB and its memory placement (--config) when its definition differs; before its first part, a VM that is
#   off is started and waited for, then its Docker (its
#   started.txt line: part vm-<name>, kind domain), else its parts are red ("VM <name> did not start"); after its last
#   part, a VM this run started is shut down (<PARTS>/vm-<name>.rc then); a running VM is left running. With one VM, VM a
#   (win10-dev) runs every Windows part; with M, the first M of RELEASE_WINDOWS_VMS, each its lanes (HOW, VMs). A dry run
#   asks virsh only what is (domstate, dumpxml) and says what it would do;
#   DRY_RUN_RED=vm-<name> makes an off VM not start.
#   The parts: step0, step1-build, lane1-<web|docker-server>-full, lane2-docker-server-auth,
#   build, linux-proof, pack, windows-docker-proof, server-light, electron-light, robot, docker-verdict, windows-verdict;
#   with more VMs also prepare-<name>, a VM's own e2e package (the pack's VM, or another one's when it takes no copy),
#   package-from-pack (no copy made: a check not met; pack = the pack red before its NoExeAssembler finished) and
#   package-<name> (that VM's copy red); with the runners also runner-<n> (its share red) and
#   runner-<n>-start (it did not start: its engine gave no answer, its files NOT_RUN).
#
# USE:
#   ORCH_STARTED_BY=<name> DRY_RUN=yes bash asbl/ci/jenkins/release-orchestrator.sh
#   ORCH_STARTED_BY=<name> DRY_RUN=yes DRY_RUN_RED="build pack" bash asbl/ci/jenkins/release-orchestrator.sh
#   ORCH_STARTED_BY=<name> RELEASE_VERSION=<x.y.z> setsid nohup bash asbl/ci/jenkins/release-orchestrator.sh >/dev/null 2>&1 &
#   bash asbl/ci/jenkins/release-orchestrator.sh replay <execution 1 commit> <later commit>...   per part, reuse or rebuild
#        from each commit to the next (asbl/ci/reuse-or-rebuild.sh): what a re-run between the executions takes
#   bash asbl/ci/jenkins/release-orchestrator.sh flaky <part> <report.json> [<part> <report.json>]...   the lines flaky.txt
#        gets from those Playwright reports
#   bash asbl/ci/jenkins/release-orchestrator.sh memory-sample <run folder> [<VM name>...]   one sample appended to <run
#        folder>/memory.log, of those VMs [VM a]
#
# It never uploads, never runs MODE=public or step 4, never starts a second execution, never runs a part again, and holds
# no version or approval. One start at a time (<LOG_DIR>/release-orchestrator.lock).
# Callers: a person or an agent, from the shell (no Jenkins job).
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
. asbl/ci/marks.sh
. asbl/ci/reuse-or-rebuild.sh
. asbl/ci/release-machines.sh

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
. asbl/ci/win-vm.sh
STATE="bash asbl/ci/release-state.sh"
AUTH_SPEC='/features/auth-authorization-server\.spec\.ts$'   # lane 2, as seed.groovy's example names it

# replay <from> <to>...: for each commit after the first, what each part of the execution takes from the commit before
# (asbl/ci/reuse-or-rebuild.sh, the rule a re-run between the executions follows); a part with two builds rebuilds when
# either does
replay() {
  local from to
  [ "$#" -ge 2 ] || { echo "usage: $0 replay <execution 1 commit> <later commit>..."; return 2; }
  from="$1"; shift
  echo "REPLAY execution 1 at ${from:0:8}, then $*"
  for to in "$@"; do
    reuse_or_rebuild "$from" "$to"
    echo "REPLAY ${from:0:8} -> ${to:0:8} ($RR_CHANGED files changed)"
    printf '  %-22s %-8s %s\n' build "$RR_IMAGE_AND_ZIPS" "(image-and-zips)" \
      linux-proof "$(either "$RR_E2E_PACKAGE" "$RR_IMAGE_AND_ZIPS")" "(e2e-package, image-and-zips)" \
      windows-docker-proof "$(either "$RR_E2E_PACKAGE" "$RR_IMAGE_AND_ZIPS")" "(e2e-package, image-and-zips)" \
      pack "$RR_WINDOWS_PACK" "(windows-pack)" \
      server-light "$(either "$RR_E2E_PACKAGE" "$RR_WINDOWS_PACK")" "(e2e-package, windows-pack)" \
      electron-light "$RR_E2E_PACKAGE" "(e2e-package)" \
      robot "$RR_WINDOWS_PACK" "(windows-pack)" \
      "step 1" "$RR_STEP1" "(${RR_STEP1_WHY:-})"
    from="$to"
  done
}
either() { case " $* " in *" rebuild "*) echo rebuild ;; *) echo reuse ;; esac; }

# ---- the run folder's files that say what happened and what was started (see THE RUN FOLDER, above) ----
WIN_PID=$(win_vm_pidfile a)   # win-e2e.sh's pid file of VM a, which runs every Windows lane
# the docker-server bundle a Linux e2e on E2E_TARGET=docker-server brings up in this checkout (dp-ci.sh docker_server_up)
DOCKER_SERVER_BUNDLE="$PWD/frend/reporting/testground/docker-server/DataPallas"
SETTINGS_XML=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml   # the version, as release-state.sh reads it
MEMORY_EVERY="${MEMORY_EVERY:-60}"

# what_part_starts <part>: the things that part starts and that outlive a stop of this script, one "<kind> TAB <name> TAB
# <what>" line each (the kinds of started.txt); a part that starts nothing outside this script's processes prints nothing
what_part_starts() {
  local run_container bundle windows_driver vm=a n
  run_container=$(printf 'container\tdp-ci\tthe run container of dp-ci.sh')
  bundle=$(printf 'compose\t%s\tthe docker-server bundle under test' "$DOCKER_SERVER_BUNDLE")
  windows_driver=$(printf 'pidfile\t%s\tthe Windows driver of win-e2e.sh' "$WIN_PID")
  case "$1" in docker-windows|windows-*)   # the part's VM: its driver's pid file and its scheduled tasks (VM a: windows-vm)
    vm=$(vm_of_part "$1")
    windows_driver=$(printf 'pidfile\t%s\tthe Windows driver of win-e2e.sh' "$(win_vm_pidfile "$vm")") ;;
  esac
  case "$RUNNERS:$1" in
    yes:lane1-*)   # the full set in the runners: each runner whole (its CI container and bundle are inside it)
      for n in $(seq 1 "$FULL_SET_JOBS"); do
        printf 'container\tdp-ci-runner-%s\trunner %s (Docker in Docker): its engine and everything it runs\n' "$n" "$n"
      done; return ;;
    yes:docker-linux) echo "$run_container"; return ;;   # the build only
    yes:lane2-docker-server-auth|yes:docker-linux-proof)   # in the host lanes' runner, whole (HOST_LANES_RUNNER)
      printf 'container\tdp-ci-runner-%s\tthe host lanes\047 runner (Docker in Docker): its engine and everything it runs\n' "$HOST_LANES_RUNNER"; return ;;
  esac
  case "$1" in
    step1-build|lane1-web-full) echo "$run_container" ;;
    lane1-docker-server-full|lane2-docker-server-auth) printf '%s\n' "$run_container" "$bundle" ;;
    docker-linux|docker-linux-proof) printf '%s\n' "$run_container" "$bundle" \
      "$(printf 'container\tdp-ci-one-command\tthe image alone, run as the self-host page says (dp-ci.sh docker_one_command)')" ;;
    docker-windows) printf '%s\n' "$windows_driver" "$(printf 'vm\twindows-vm%s\tdp-ci.sh win docker-e2e' "$(win_vm_suffix "$vm")")" ;;
    windows-pack|windows-after-pack|windows-server-light|windows-electron-light|windows-robot|windows-verdict)
      printf '%s\n' "$windows_driver" "$(printf 'vm\twindows-vm%s\tdp-ci.sh win release' "$(win_vm_suffix "$vm")")" ;;
    windows-prepare-*) printf '%s\n' "$windows_driver" "$(printf 'vm\twindows-vm%s\tdp-ci.sh win prepare' "$(win_vm_suffix "$vm")")" ;;
    windows-package-from-pack) ;;   # SSH calls of this script's own process to the pack's VM: nothing outlives it
    windows-package-*) printf '%s\n' "$windows_driver" "$(printf 'vm\twindows-vm%s\tdp-ci.sh win package' "$(win_vm_suffix "$vm")")" ;;
    vm-*) printf 'domain\t%s\tthe Windows VM %s, started by this run (virsh start): shut down after its last part\n' \
      "$(machines_domain_of "${1#vm-}")" "${1#vm-}" ;;
  esac
}
# record_started <part>: its started.txt lines, before it starts
record_started() {
  local kind name what
  while IFS=$'\t' read -r kind name what; do
    [ -n "$kind" ] || continue
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$kind" "$name" \
      "$([ "$DRY" = yes ] && echo dry-run || echo real)" "$what" >> "$PARTS/started.txt"
  done <<< "$(what_part_starts "$1")"
}

# flaky_tests <part> <report.json> [<part> <report.json>]...: flaky.txt's lines. Flaky = failed, then passed on a retry; a
# test Playwright calls flaky with no passing try (its retry skipped, or cut off by the end of the run) failed: not listed.
flaky_tests() {
  python3 -I - "$@" <<'PY'
import json, sys
args = sys.argv[1:]
for part, report in zip(args[0::2], args[1::2]):
    try:
        data = json.load(open(report, encoding='utf-8'))
    except Exception as e:
        sys.stderr.write('WARN  flaky: the Playwright report %s could not be read (%s)\n' % (report, e))
        continue
    def walk(suite, titles):
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                tries = [r.get('status') for r in test.get('results') or []]
                if test.get('status') == 'flaky' and 'passed' in tries:
                    name = ' > '.join(t for t in titles + [spec.get('title', '')] if t)
                    print('%s\t%s\t%s:%s\t%s' % (part, name, spec.get('file', '?'), spec.get('line', '?'), report))
        for sub in suite.get('suites', []):
            walk(sub, titles + [sub.get('title', '')])
    for top in data.get('suites', []):
        walk(top, [])
PY
}

# containers_of_the_run <run folder>: the running containers started.txt names (real lines), and those of its compose
# folders and of the folders below them (the Rundeck and AI Hub stacks are under the bundle's _apps)
containers_of_the_run() {
  local running
  running=$(docker ps --format '{{.Names}}|{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null) || return 0
  awk -F'\t' '$5 == "real" && ($3 == "container" || $3 == "compose") { print $3 "\t" $4 }' "$1/started.txt" 2>/dev/null | sort -u |
    while IFS=$'\t' read -r kind name; do
      printf '%s\n' "$running" | awk -F'|' -v kind="$kind" -v name="$name" \
        '(kind == "container" && $1 == name) || (kind == "compose" && ($2 == name || index($2, name "/") == 1)) { print $1 }'
    done | sort -u
}
# The VM's own memory, from Windows itself (GetPerformanceInfo): what it committed, the peak of that since boot, the
# commit limit, its physical memory and what is available of it; what 16.6.3 sizes its VMs by.
VM_MEMORY_PS=$(cat <<'PS'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class DpCiMemory {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint Size; public UIntPtr CommitTotal, CommitLimit, CommitPeak, PhysicalTotal, PhysicalAvailable, SystemCache,
    KernelTotal, KernelPaged, KernelNonpaged, PageSize; public uint HandleCount, ProcessCount, ThreadCount; }
  [DllImport("psapi.dll")] public static extern bool GetPerformanceInfo(out Info info, uint size);
}
'@
$i = New-Object DpCiMemory+Info
if (-not [DpCiMemory]::GetPerformanceInfo([ref]$i, [uint32][Runtime.InteropServices.Marshal]::SizeOf($i))) { "FAIL  GetPerformanceInfo"; exit 1 }
$p = $i.PageSize.ToUInt64()
"committed={0} commit_peak={1} commit_limit={2} physical_total={3} physical_available={4}" -f ($i.CommitTotal.ToUInt64() * $p), ($i.CommitPeak.ToUInt64() * $p), ($i.CommitLimit.ToUInt64() * $p), ($i.PhysicalTotal.ToUInt64() * $p), ($i.PhysicalAvailable.ToUInt64() * $p)
PS
)
# vm_memory_line <VM name> <UTC>: the VM's memory.log line (machine windows-vm for VM a, windows-vm-<name> for another):
# its own memory over SSH (dp-ci.sh win ps with WIN_VM=<name>); a VM virsh says is off is not asked
vm_memory_line() {
  local vm_name="$1" now="$2" machine answer
  machine="windows-vm$(win_vm_suffix "$vm_name")"
  if [ "$(machines_vm_state "$vm_name")" = off ]; then printf '%s\t%s\tmemory\toff (virsh): not asked\n' "$now" "$machine"; return; fi
  answer=$(printf '%s\n' "$VM_MEMORY_PS" | WIN_VM="$vm_name" timeout 180 bash asbl/ci/dp-ci.sh win ps 2>&1 | tr -d '\r' | grep -a -m1 -E '^(committed=|FAIL)')
  case "$answer" in
    committed=*) printf '%s\t%s\tmemory\t%s\n' "$now" "$machine" "$answer" ;;
    *) printf '%s\t%s\tmemory\tnot answering%s\n' "$now" "$machine" "${answer:+: $answer}" ;;
  esac
}
# vm_host_memory_line <VM name> <UTC>: what the VM holds of this host (machine host, vm <name>, rss_kb= pss_kb=): pss_kb is its
# real cost, pages KSM shares counted once; rss_kb counts them in full. Windows' own figure leaves out its file cache, which
# stays in this host's memory. A VM that is off gives no line
vm_host_memory_line() {
  local dom rss pid pss
  dom=$(machines_domain_of "$1")
  rss=$(virsh dommemstat "$dom" 2>/dev/null | awk '$1 == "rss" { print $2 }')
  [ -n "$rss" ] || return 0
  pid=$(cat "${RELEASE_LIBVIRT_RUN_DIR:-/run/libvirt/qemu}/$dom.pid" 2>/dev/null)
  pss=$(awk '$1 == "Pss:" { print $2 }' "${RELEASE_PROC_DIR:-/proc}/$pid/smaps_rollup" 2>/dev/null)
  printf '%s\thost\tvm %s\trss_kb=%s pss_kb=%s\n' "$2" "$1" "$rss" "$pss"
}
# zram_memory_line <UTC>: what the zram swap holds and what that takes of RAM (machine host, zram swap, stored_kb= ram_kb=); no
# line when it is off or empty
zram_memory_line() {
  local stored ram
  { read -r stored _ ram _ < "${RELEASE_ZRAM_SYS_DIR:-/sys/block/zram0}/mm_stat"; } 2> /dev/null || return 0
  [ "${stored:-0}" != 0 ] || return 0
  printf '%s\thost\tzram swap\tstored_kb=%s ram_kb=%s\n' "$1" "$((stored / 1024))" "$((ram / 1024))"
}
# sample_memory_once <run folder>: one sample appended to its memory.log: this host's memory and CPU load (the runners and
# the VMs share its CPUs, which the memory rule does not count), the run's containers (a runner whole: its engine and all
# it runs), and the memory of each VM of the round (SAMPLE_VMS, else the run's RUN_VMS, else VM a), asked at once
sample_memory_once() {
  local dir="$1" now names vm_name vm_pids=() sample_vms="${SAMPLE_VMS:-${RUN_VMS:-a}}"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  for vm_name in $sample_vms; do vm_memory_line "$vm_name" "$now" > "$dir/.memory-$vm_name.line" & vm_pids+=("$!"); done
  {
    free -m | awk -v t="$now" '/^Mem:/ { m = sprintf("total=%s used=%s free=%s shared=%s buff_cache=%s available=%s", $2, $3, $4, $5, $6, $7) }
      /^Swap:/ { s = sprintf(" swap_total=%s swap_used=%s", $2, $3) } END { printf "%s\thost\tfree -m\t%s%s\n", t, m, s }'
    awk -v t="$now" -v cpus="$(nproc 2>/dev/null)" '{ printf "%s\thost\tcpu load\tload1=%s load5=%s load15=%s cpus=%s\n", t, $1, $2, $3, cpus }' /proc/loadavg
    zram_memory_line "$now"
    names=$(containers_of_the_run "$dir")
    # (one call for all of them: each docker stats --no-stream takes about two seconds)
    [ -z "$names" ] || docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' $names 2>/dev/null |
      awk -F'|' -v t="$now" '{ printf "%s\thost\tcontainer %s\tcpu=%s mem=%s mem_percent=%s\n", t, $1, $2, $3, $4 }'
    report_caps_reached "$dir"
    [ "${#vm_pids[@]}" = 0 ] || wait "${vm_pids[@]}"
    for vm_name in $sample_vms; do cat "$dir/.memory-$vm_name.line" 2>/dev/null; rm -f "$dir/.memory-$vm_name.line"; done
    for vm_name in $sample_vms; do vm_host_memory_line "$vm_name" "$now"; done
  } >> "$dir/memory.log"
}

# ---- the memory ceilings reached ----
# cap_reached_once <run folder> <where> <what> <values>: a line in caps-reached.log and on stdout, the first time only: a
# box at its ceiling can stall with no failure (16.6.3's first full set in a runner, at 10 GB), so it must leave a trace
cap_reached_once() {
  local line
  grep -qF "$(printf '%s\t%s\t' "$2" "$3")" "$1/caps-reached.log" 2>/dev/null && return 0
  line=$(printf '%s\t%s\t%s\t%s' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "$3" "$4")
  printf '%s\n' "$line" | tee -a "$1/caps-reached.log"
}
# report_caps_reached <run folder>: the kernel's own counters of the run's boxes on this host and of all inside them (a
# runner's containers are groups below its own): memory.events.local's max (its own ceiling reached, the box's alone, not
# what is below it) and oom_kill (a process of it killed)
report_caps_reached() {
  local dir="$1" box id group file inside max killed
  for box in $({ docker ps --filter 'name=^dp-ci-runner-[0-9]+$' --format '{{.Names}}' 2>/dev/null; containers_of_the_run "$dir"; } | sort -u); do
    id=$(docker inspect -f '{{.Id}}' "$box" 2>/dev/null) || continue
    group="${RELEASE_CGROUP_DIR:-/sys/fs/cgroup/system.slice}/docker-$id.scope"
    while read -r file; do
      read -r max killed < <(awk '$1 == "max" { m = $2 } $1 == "oom_kill" { k = $2 } END { print m + 0, k + 0 }' "$file" 2> /dev/null)
      # a test's container that ended since find leaves nothing to read: no ceiling (two false lines, 2026-11-06)
      [ -n "$max" ] || continue
      inside=${file#"$group"}; inside=${inside%/memory.events.local}
      [ "$max" = 0 ] || cap_reached_once "$dir" host "reached its ceiling: $box$inside" "max=$max"
      [ "$killed" = 0 ] || cap_reached_once "$dir" host "killed by a ceiling: $box$inside" "oom_kill=$killed"
    done < <(find "$group" -name memory.events.local 2>/dev/null)
  done
}
# the memory sampler: memory.log every MEMORY_EVERY seconds while this run lasts (a real run only)
MEMORY_SAMPLER_PID=""
start_memory_sampler() {
  [ "$DRY" = no ] || return 0
  (
    exec 9>&-   # the run's lock stays with the run, not with its sampler
    pause=""
    trap '[ -z "$pause" ] || kill "$pause" 2>/dev/null; exit 0' TERM
    while kill -0 "$$" 2>/dev/null; do
      sample_memory_once "$PARTS"
      sleep "$MEMORY_EVERY" & pause=$!
      wait "$pause"
    done
  ) > /dev/null 2>&1 &
  MEMORY_SAMPLER_PID=$!
}
stop_memory_sampler() { [ -z "$MEMORY_SAMPLER_PID" ] || kill "$MEMORY_SAMPLER_PID" 2>/dev/null; MEMORY_SAMPLER_PID=""; }
if [ "${1:-}" = replay ]; then shift; replay "$@"; exit $?; fi
if [ "${1:-}" = flaky ]; then
  shift; { [ "$#" -ge 2 ] && [ $(($# % 2)) = 0 ]; } || { echo "usage: $0 flaky <part> <report.json> [<part> <report.json>]..."; exit 2; }
  flaky_tests "$@"; exit $?
fi
if [ "${1:-}" = memory-sample ]; then
  [ -d "${2:-}" ] || { echo "usage: $0 memory-sample <run folder> [<VM name>...]"; exit 2; }
  dir="$2"; shift 2
  [ "$#" = 0 ] || SAMPLE_VMS="$*"
  sample_memory_once "$dir"; exit $?
fi
[ "$#" = 0 ] || { echo "usage: $0 (the run: inputs in the environment, see the top of this file) | replay <commit> <commit>... | flaky <part> <report.json>... | memory-sample <run folder> [<VM name>...]"; exit 2; }

WHO="${ORCH_STARTED_BY:-}"
[ -n "$WHO" ] || { echo "MISSING ORCH_STARTED_BY: who starts this run (your name, the agent's). Nothing done"; exit 2; }
EXECUTION="${EXECUTION:-1}"
case "$EXECUTION" in 1|2) ;; *) echo "FAIL  EXECUTION must be 1 or 2 (got '$EXECUTION')"; exit 2 ;; esac
case "${MODE:-rehearsal}" in rehearsal) ;; *) echo "FAIL  MODE=${MODE}: the orchestrator runs rehearsals only; MODE=public and step 4 come after the sign-off"; exit 2 ;; esac
case "${UPLOAD:-no}" in no) ;; *) echo "FAIL  UPLOAD=${UPLOAD}: the orchestrator stops before the upload (release day: MODE=upload UPLOAD=yes, the jobs)"; exit 2 ;; esac
case "${DRY_RUN:-no}" in yes|1) DRY=yes ;; no|0|"") DRY=no ;; *) echo "FAIL  DRY_RUN must be yes or no (got '$DRY_RUN')"; exit 2 ;; esac
VERSION="${RELEASE_VERSION:-}"
[ -z "$VERSION" ] || [ "$EXECUTION" = 1 ] || { echo "FAIL  RELEASE_VERSION is step 0's, execution 1 only"; exit 2; }
RED="${DRY_RUN_RED:-}"
[ -z "$RED" ] || [ "$DRY" = yes ] || { echo "FAIL  DRY_RUN_RED is for a dry run only"; exit 2; }
FULL_SET_JOBS="${SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS:-1}"
WINDOWS_VMS_USED="${USE_N_NUMBER_OF_WINDOWS_VMS:-1}"
machines_answer=$(machines_load && machines_check "$FULL_SET_JOBS" "$WINDOWS_VMS_USED") ||
  { printf '%s\n' "$machines_answer"; echo "REFUSED: the machines file (${RELEASE_REHEARSAL_CONF:-/root/release-rehearsal.conf}) does not allow N=$FULL_SET_JOBS M=$WINDOWS_VMS_USED (above). Nothing done"; exit 2; }
machines_load
# asbl/ci/e2e-runners.sh and dp-ci.sh do not read the machines file: these two reach them from here
export RELEASE_RUNNER_LIMIT_GB RELEASE_CI_CONTAINER_LIMIT_GB
STEPS="$RELEASE_STEPS"   # together or in-order (HOW, above)
# step 1's full set in runners (HOW, runners): with the steps together, unless the machines file says RELEASE_RUNNERS=no
RUNNERS=$([ "$STEPS" = together ] && [ "$RELEASE_RUNNERS" = yes ] && echo yes || echo no)
if [ "$RUNNERS" = yes ]; then
  lists_answer=$(python3 -I asbl/ci/full-set-runners.py check 2>&1) ||
    { printf '%s\n' "$lists_answer" | grep -E '^(REFUSED|WARN)'; echo "REFUSED: the runner lists (asbl/ci/full-set-runners.txt, above) for step 1's full set in runners. Nothing done"; exit 2; }
fi
ROUND_ROTATION_DATE=$(date -u +%F)   # the round's one rotation date, for every runner
# the switch only this run gives its step 2 and step 3 parts: their step 1 guard skipped, step 1 asked at the sign-off
STEP1_SWITCH=$([ "$STEPS" = together ] && echo RELEASE_STEP1_AT_SIGNOFF=yes)
if [ "$DRY" = no ]; then
  # one start at a time: the lock lives as long as this run and the parts it started
  exec 9>>"$LOG_DIR/release-orchestrator.lock"
  flock -n 9 || { echo "REFUSED: another start of the orchestrator is going (lock $LOG_DIR/release-orchestrator.lock). Nothing done"; exit 1; }
fi
run_record_begin "$WHO" "release orchestrator, execution $EXECUTION${VERSION:+, version $VERSION}$([ "$DRY" = yes ] && echo ', dry run')" ||
  { echo "FAIL  cannot make the folder of this run under $RUN_RECORD_DIR. Nothing done"; exit 2; }
PARTS="${RUN_DIR:-$RUN_RECORD_DIR/$(date -u +%Y%m%dT%H%M%SZ)-release-orchestrator-parts-$$}"
mkdir -p "$PARTS" || exit 2
: >> "$PARTS/started.txt"   # there from the start: an empty one = nothing started yet
POLL=$([ "$DRY" = yes ] && echo 1 || echo 30)
export MODE=rehearsal UPLOAD=no DRY_RUN=no
echo "INPUTS  execution=$EXECUTION version=${VERSION:-none (no step 0)} mode=rehearsal upload=no dry_run=$DRY${RED:+ dry_run_red=$RED} approval=$([ -n "${E2E_APPROVAL:-}" ] && echo "given in the environment, passed on to the guards" || echo none)"
echo "PARTS   one log per part in $PARTS"
RUN_VMS=$(machines_vms_for "$WINDOWS_VMS_USED")   # the VMs this run's parts use (THE VMS, above): VM a alone with one VM
# vm_of_lane <lane>: the VM that runs that lane in this run's layout (VM a with one VM)
vm_of_lane() {
  local v l
  for v in $RUN_VMS; do for l in $(machines_lanes_of "$WINDOWS_VMS_USED" "$v"); do [ "$l" = "$1" ] && { echo "$v"; return; }; done; done
  echo a
}
# vm_of_part <part>: the VM a Windows part runs on
vm_of_part() {
  case "$1" in
    windows-prepare-*) echo "${1#windows-prepare-}" ;;
    windows-pack|windows-verdict|windows-package-from-pack) vm_of_lane pack ;;
    windows-package-*) echo "${1#windows-package-}" ;;
    docker-windows) vm_of_lane docker-proof ;;
    windows-server-light|windows-electron-light|windows-robot) vm_of_lane "${1#windows-}" ;;
    *) echo a ;;
  esac
}
PACK_VM=$(vm_of_lane pack)
# vm_needs_package <vm>: a lane of that VM tests on the VM's e2e package (the light sets, the Windows Docker proof)
vm_needs_package() {
  local l
  for l in $(machines_lanes_of "$WINDOWS_VMS_USED" "$1"); do case "$l" in docker-proof|server-light|electron-light) return 0 ;; esac; done
  return 1
}
# PACKAGE_TO: with more VMs, the VMs other than the pack's whose lanes test on an e2e package: each takes a copy of the
# pack's (windows-package-<vm>) instead of building its own; PACKAGE_ARCHIVE: that copy on this host, while they take it
PACKAGE_TO=""
if [ "$WINDOWS_VMS_USED" != 1 ] && [[ " $(machines_lanes_of "$WINDOWS_VMS_USED" "$PACK_VM") " == *" pack "* ]]; then
  for vm in $RUN_VMS; do [ "$vm" = "$PACK_VM" ] || ! vm_needs_package "$vm" || PACKAGE_TO="${PACKAGE_TO:+$PACKAGE_TO }$vm"; done
fi
PACKAGE_ARCHIVE="$PARTS/e2e-package.tar"   # its record beside it names the commit
# vm_order <vm>: its parts in order, as the ORDER line says them (more VMs)
vm_order() {
  local l out=""
  [ "$1" = "$PACK_VM" ] || ! vm_needs_package "$1" ||
    out="package (its e2e package, once per pin: a copy of the pack's once VM $PACK_VM's NoExeAssembler finished, else its own prepare), "
  for l in $(machines_lanes_of "$WINDOWS_VMS_USED" "$1"); do
    case "$l" in
      pack) out="${out}pack (WIN_RELEASE_HALF=pack), "; ! vm_needs_package "$1" || out="${out}prepare (right after the pack: seconds, the pack stamps its package), " ;;
      docker-proof) out="${out}windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows), " ;;
      server-light) out="${out}server-light once the pack ended (on its datapallas-server.zip, kept), " ;;
      *) out="${out}$l, " ;;
    esac
  done
  printf '%s' "${out%, }"
}
machines_host_memory_sharing_on "$([ "$DRY" = yes ] && echo dry)"
machines_host_zram_swap_on "$([ "$DRY" = yes ] && echo dry)"   # off in finish; a stop kills this script, so release-rehearsal.sh stop does it too
for vm in $RUN_VMS; do machines_vm_memory_rules "$vm" "$([ "$DRY" = yes ] && echo dry)"; done
start_memory_sampler

# ---- the parts: run one, or in a dry run say what it would run and write the marks it would leave ----

# red_in_dry_run <part>: is that part one DRY_RUN_RED names?
red_in_dry_run() { case " $RED " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
# simulated_mark <label> <part>: a dry run's START and END lines of one mark, red when DRY_RUN_RED names the part; returns its rc
simulated_mark() {
  local rc=0
  red_in_dry_run "$2" && rc=1
  echo "######## $1 START  (dry run)"
  [ "$rc" = 0 ] || echo "FAILED: $2 red (DRY_RUN_RED)"
  echo "######## $1 END rc=$rc  (dry run)"
  return "$rc"
}
# run_part <id> <what> <command...>: one part (or a step 1 lane), its own log <PARTS>/<id>.log and exit code <id>.rc, with
# the pin and this run's approval in its environment; a dry run prints the command and writes the marks it would leave
run_part() {
  local id="$1" what="$2" rc; shift 2
  record_started "$id"
  echo "PART    $id START $(date -u +%Y-%m-%dT%H:%M:%SZ) on ${PIN:0:8}: $what"
  if [ "$DRY" = yes ]; then
    echo "WOULD   RELEASE_PIN=${PIN:0:8} MODE=rehearsal UPLOAD=no$([ -n "${E2E_APPROVAL:-}" ] && echo ' E2E_APPROVAL=(given)') $*"
    simulate "$id" > "$PARTS/$id.log"; rc=$?
    sleep 2   # a dry part lasts two seconds, so the log shows which parts overlap
  else
    # 9>&-: the run's lock stays with the run. A part's detached watcher (the firewall's, which waits for dp-ci) would keep
    # it after the run died, and the CI would look held by another run: stop would leave what the round started.
    env RELEASE_PIN="$PIN" "$@" > "$PARTS/$id.log" 2>&1 < /dev/null 9>&-; rc=$?
  fi
  echo "$rc" > "$PARTS/$id.rc"
  echo "PART    $id END rc=$rc $(date -u +%Y-%m-%dT%H:%M:%SZ) (log $PARTS/$id.log)"
  return "$rc"
}
# not_run <id> <why>: a part the schedule does not start, with its reason, in the place of its log
not_run() {
  echo "not run: $2" > "$PARTS/$1.log"; echo - > "$PARTS/$1.rc"
  echo "PART    $1 NOT RUN: $2"
}
# simulate <id>: the marks a part leaves, as its script prints them, for a dry run (the step scripts' own dry runs say more)
simulate() {
  local r=0 any=0 p v
  case "$1" in
    step0)  simulated_mark "STEP 0" step0 ;;
    step1-build) simulated_mark "BUILD IF NEEDED" step1-build ;;
    lane1-*) if [ "$RUNNERS" = yes ]; then simulate_runners "$1"; else simulated_mark "JOB STEP 2/2" "$1"; fi ;;
    lane*)  simulated_mark "JOB STEP 2/2" "$1" ;;
    docker-linux)
      echo "######## DOCKER RELEASE STEP 1/6 START  (dry run)"
      simulated_mark "DOCKER RELEASE STEP 2/6" build || return 1
      [ "$RUNNERS" = no ] || return 0   # the build part only: the Linux proof is a part of its own
      simulated_mark "DOCKER RELEASE STEP 3/6" linux-proof ;;
    docker-linux-proof)
      echo "######## DOCKER RELEASE STEP 1/6 START  (dry run)"
      echo "######## DOCKER RELEASE STEP 2/6 START  (dry run): the build the build part made"
      echo "######## DOCKER RELEASE STEP 2/6 END rc=0  (dry run)"
      simulated_mark "DOCKER RELEASE STEP 3/6" linux-proof ;;
    windows-pack)
      echo "RELEASE_ARTIFACTS=${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}/${VERSION:-<version>}-${PIN:0:8} (dry run: the folder this half would begin)"
      [ -z "$PACKAGE_TO" ] || echo "WIN_PACK_LOG_SINCE=0 (dry run: the pack's start on its VM's clock, before asbl\\pack-datapallas.bat)"
      simulated_mark "RELEASE STEP 1/5" pack ;;
    docker-windows) simulated_mark "DOCKER RELEASE STEP 4/6" windows-docker-proof ;;
    windows-after-pack)
      # the parts that install the pack's files need it kept: the server light set its datapallas-server.zip, Robot all three
      echo "######## RELEASE STEP 2/5 START  (dry run)"
      v=${VERSION:-$(git show "$PIN:$SETTINGS_XML" 2>/dev/null | grep -m1 -oP '(?<=<version>)[^<]+')}
      echo "dry run: server-light installs datapallas-server.zip of pack, kept in ${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}/$v-${PIN:0:8}/ (RELEASE_KEPT)"
      if red_in_dry_run pack; then echo "not run: there is no kept pack (FAIL) whose datapallas-server.zip it would install"; any=1
      elif red_in_dry_run server-light; then echo "FAILED: server-light red (DRY_RUN_RED)"; any=1; fi
      echo "######## RELEASE STEP 2/5 END rc=$any  (dry run)"
      simulated_mark "RELEASE STEP 3/5" electron-light || any=1
      echo "######## RELEASE STEP 4/5 START  (dry run)"
      if red_in_dry_run pack; then echo "not run: there is no pack (FAIL) to test"; r=1
      elif red_in_dry_run robot; then echo "FAILED: robot red (DRY_RUN_RED)"; r=1; fi
      echo "######## RELEASE STEP 4/5 END rc=$r  (dry run)"
      for p in pack windows-verdict; do red_in_dry_run "$p" && any=1; done
      [ "$r" = 0 ] && [ "$any" = 0 ] && echo "RELEASE_RESULT dry run: rehearsal=PASS" && return 0
      echo "RELEASE_RESULT dry run: rehearsal=FAIL"; return 1 ;;
    windows-prepare-*)
      echo "dry run: VM ${1#windows-prepare-}'s e2e package: pack-prepare-for-e2e.bat only when its stamp is not ${PIN:0:8}"
      red_in_dry_run "${1#windows-}" && { echo "FAILED: ${1#windows-} red (DRY_RUN_RED)"; return 1; }
      return 0 ;;
    # one e2e package per pin, from the pack: the pack ended red before its NoExeAssembler's line = DRY_RUN_RED=pack
    windows-package-from-pack)
      echo "dry run: on VM $PACK_VM while it packs, a look every minute until this pack's asbl\\pack-datapallas.log (written after WIN_PACK_LOG_SINCE, the VM's clock) holds 'FINISHED Assembler:NoExeAssembler' and the checks of the pack's stamp hold (the checkout on ${PIN:0:8}, no tracked file changed, the rb-webcomponents modules from its lock); then verified-db-noexe as one archive to $PACKAGE_ARCHIVE (sha256 checked) for VM(s) $PACKAGE_TO"
      if red_in_dry_run pack; then
        until [ -f "$PARTS/windows-pack.rc" ]; do sleep 1; done
        echo "WIN_E2E_PACKAGE_NONE the pack ended before its NoExeAssembler finished (DRY_RUN_RED=pack): each VM of the round prepares its own"; return 1
      elif red_in_dry_run package-from-pack; then
        echo "WIN_E2E_PACKAGE_NONE a check not met (DRY_RUN_RED=package-from-pack): each VM of the round prepares its own"; return 1
      fi
      echo "WIN_E2E_PACKAGE_ARCHIVE=$PACKAGE_ARCHIVE (dry run: nothing archived or copied)"
      return 0 ;;
    windows-package-*)
      v=${1#windows-package-}
      echo "dry run: VM $v's e2e package: nothing when its stamp is ${PIN:0:8}'s already; else the pack's copy once windows-package-from-pack brought it here, else its own prepare (pack-prepare-for-e2e.bat)"
      until [ -f "$PARTS/windows-package-from-pack.rc" ]; do sleep 1; done
      if [ "$(cat "$PARTS/windows-package-from-pack.rc")" != 0 ]; then
        echo "WIN_E2E_PACKAGE=not copied from the pack ($(sed -n 's/^WIN_E2E_PACKAGE_NONE \(.*\): each VM of the round prepares its own$/\1/p; s/^not run: //p' "$PARTS/windows-package-from-pack.log" | tail -1)): VM $v prepares its own (dry run)"
      elif red_in_dry_run "package-$v"; then
        echo "FAILED: the copy to VM $v red (DRY_RUN_RED)"
        echo "WIN_E2E_PACKAGE=not copied from the pack (the copy failed): VM $v prepares its own (dry run)"
      else
        echo "WIN_E2E_PACKAGE=copied from the pack (dry run: nothing copied, the stamp would be ${PIN:0:8})"; return 0
      fi
      red_in_dry_run "prepare-$v" && { echo "FAILED: prepare-$v red (DRY_RUN_RED)"; return 1; }
      return 0 ;;
    # the lanes alone (more VMs): what the pack left is its part's exit code, whichever VM packed
    windows-server-light)
      echo "######## RELEASE STEP 2/5 START  (dry run)"
      if [ "$(cat "$PARTS/windows-pack.rc" 2>/dev/null)" != 0 ]; then echo "not run: there is no kept pack (FAIL) whose datapallas-server.zip it would install"; r=1
      elif red_in_dry_run server-light; then echo "FAILED: server-light red (DRY_RUN_RED)"; r=1; fi
      echo "######## RELEASE STEP 2/5 END rc=$r  (dry run)"
      return "$r" ;;
    windows-electron-light) simulated_mark "RELEASE STEP 3/5" electron-light ;;
    windows-robot)
      echo "######## RELEASE STEP 4/5 START  (dry run)"
      if [ "$(cat "$PARTS/windows-pack.rc" 2>/dev/null)" != 0 ]; then echo "not run: there is no pack (FAIL) to test"; r=1
      elif red_in_dry_run robot; then echo "FAILED: robot red (DRY_RUN_RED)"; r=1; fi
      echo "######## RELEASE STEP 4/5 END rc=$r  (dry run)"
      return "$r" ;;
    windows-verdict)
      for p in windows-pack windows-server-light windows-electron-light windows-robot; do [ "$(cat "$PARTS/$p.rc" 2>/dev/null)" = 0 ] || any=1; done
      red_in_dry_run windows-verdict && any=1
      [ "$any" = 0 ] && echo "RELEASE_RESULT dry run: rehearsal=PASS" && return 0
      echo "RELEASE_RESULT dry run: rehearsal=FAIL"; return 1 ;;
    docker-keep)
      for p in build linux-proof windows-docker-proof docker-verdict; do red_in_dry_run "$p" && any=1; done
      # the real keep reads the proofs' recorded verdicts: a Windows proof that never ran (its VM did not start) is no PASS
      [ "$any" = 1 ] || [ "$(cat "$PARTS/docker-windows.rc" 2>/dev/null)" = 0 ] ||
        { echo "FAILED: the Windows Docker proof did not pass (docker-windows), so step 2 keeps nothing"; any=1; }
      [ "$any" = 0 ] && echo "DOCKER_RELEASE_RESULT dry run: rehearsal=PASS" && return 0
      echo "DOCKER_RELEASE_RESULT dry run: rehearsal=FAIL"; return 1 ;;
  esac
}
# simulate_runners <lane 1's id>: the lines lane 1 leaves in the runners (asbl/ci/e2e-runners.sh full-set), red when
# DRY_RUN_RED names a runner (runner-<n>: its share red; runner-<n>-start: it did not start, its files NOT_RUN) or the lane
simulate_runners() {
  local n m any=0
  echo "######## JOB STEP 2/2 START  (dry run)"
  echo "FULL SET in $FULL_SET_JOBS runner(s) at once, on ${PIN:0:8} (dry run: bash asbl/ci/e2e-runners.sh full-set $FULL_SET_JOBS)"
  for n in $(seq 1 "$FULL_SET_JOBS"); do
    echo "######## RUNNER $n ENGINE START  (dry run)"
    if red_in_dry_run "runner-$n-start"; then
      echo "FAIL  runner $n did not answer: its engine gave no answer (DRY_RUN_RED)"
      echo "######## RUNNER $n ENGINE END rc=1  (dry run)"
      echo "FAILED: runner $n did not start (above): its files NOT_RUN"; any=1; continue
    fi
    echo "######## RUNNER $n ENGINE END rc=0  (dry run)"
    for m in CHECKOUT CACHES IMAGES; do echo "######## RUNNER $n $m START  (dry run)"; echo "######## RUNNER $n $m END rc=0  (dry run)"; done
    echo "RUNNER  $n: its lane (dry run): $(python3 -I asbl/ci/full-set-runners.py files "$FULL_SET_JOBS" "$n" 2>/dev/null | wc -l) spec files"
    if red_in_dry_run "runner-$n"; then echo "FAILED: runner $n red (DRY_RUN_RED)"; any=1; fi
  done
  red_in_dry_run "$1" && { echo "FAILED: $1 red (DRY_RUN_RED)"; any=1; }
  echo "dry run: then the merge, the lane's one log and one report in ${LOG_DIR}/<UTC>-e2e-${PIN:0:8}.log (full-set-runners.py merge)"
  echo "######## JOB STEP 2/2 END rc=$any  (dry run)"
  return "$any"
}
# mark_verdict <log> <mark label>: "PASS|", "FAIL|<why>" or "NOT RUN|<why>" for one mark of a part's log: its END rc=0,
# another rc or a START with no END (the part died), or no START at all; a "not run:" line inside the mark makes it NOT RUN
mark_verdict() {
  local log="$1" label="$2" section end why
  [ -s "$log" ] || { echo "NOT RUN|never started"; return; }
  why=$(head -1 "$log"); case "$why" in "red: "*) echo "FAIL|${why#red: }"; return ;; esac   # red without running (vm_red)
  if ! grep -aq "^######## $label START" "$log"; then
    why=$(grep -a -m1 -E '^(not run: |FAILED|REFUSED|MISSING|FAIL  |DOCKER_RELEASE_RESULT nothing)' "$log")
    echo "NOT RUN|${why#not run: }"; return
  fi
  section=$(LC_ALL=C awk -v s="######## $label START" -v e="######## $label END rc=" 'index($0, s) == 1 { on = 1 } on { print } on && index($0, e) == 1 { exit }' "$log")
  end=$(printf '%s\n' "$section" | LC_ALL=C awk -v e="######## $label END rc=" 'index($0, e) == 1 { r = substr($0, length(e) + 1); sub(/[^0-9].*/, "", r) } END { print r }')
  why=$(printf '%s\n' "$section" | grep -a -m1 '^not run: ')
  if [ -n "$why" ]; then echo "NOT RUN|${why#not run: }"
  elif [ "$end" = 0 ]; then echo "PASS|"
  elif [ -n "$end" ]; then echo "FAIL|$(printf '%s\n' "$section" | grep -a -m1 -E '^(FAILED|REFUSED|FAIL  |MISSING)' || echo "rc=$end")"
  else echo "FAIL|started, never ended (the part died?): see its log"; fi
}
# part_verdict <id>: a whole part's verdict from its exit code (the channel verdicts and the step 1 lanes)
part_verdict() {
  local rc
  rc=$(cat "$PARTS/$1.rc" 2>/dev/null)
  case "$rc" in
    0) echo "PASS|" ;;
    -|"") echo "NOT RUN|$(sed -n '1s/^not run: //p' "$PARTS/$1.log" 2>/dev/null)" ;;
    *) echo "FAIL|$(grep -a -m1 -E '^(FAILED|REFUSED|FAIL  |MISSING)' "$PARTS/$1.log" 2>/dev/null || echo "rc=$rc")" ;;
  esac
}
SUMMARY=()
RESULT_PARTS=()   # one "<part> TAB <PASS|FAIL|NOT_RUN> TAB <log> TAB <why>" per summary line, for result.txt
# summarize <part> <verdict|why> <log>: one line of the summary, kept for the end
summarize() {
  local v="${2%%|*}" why="${2#*|}"
  SUMMARY+=("$(printf '  %-32s %-8s %s' "$1" "$v" "${why:+$why  }(log $3)")")
  RESULT_PARTS+=("$(printf '%s\t%s\t%s\t%s' "$1" "${v// /_}" "$3" "${why//$'\t'/ }")")
  [ "$v" = PASS ] || ALL_GREEN=0
}
ALL_GREEN=1
STEP1_RESULT=not-run   # green or red once the step 1 guard was asked
# kept_folder: the newest kept folder of the pin (release-keep.sh's <RELEASE_ARTIFACTS_DIR>/<version>-<commit, 8>/), or nothing
kept_folder() {
  [ -n "${PIN:-}" ] || return 0
  ls -1dt "${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}"/*-"${PIN:0:8}"/ 2>/dev/null | head -1
}
# machine_of_part <summary part>: where it runs its tests
machine_of_part() {
  case "$1" in pack|windows-docker-proof|server-light|electron-light|robot|windows-verdict) echo windows-vm ;; *) echo host ;; esac
}
# mark_of_part <summary part>: its mark in a log it shares with other parts (one script run, several parts); none = the whole log
mark_of_part() {
  case "$1" in
    build) echo "DOCKER RELEASE STEP 2/6" ;; linux-proof) echo "DOCKER RELEASE STEP 3/6" ;;
    windows-docker-proof) echo "DOCKER RELEASE STEP 4/6" ;; pack) echo "RELEASE STEP 1/5" ;;
    server-light) echo "RELEASE STEP 2/5" ;; electron-light) echo "RELEASE STEP 3/5" ;; robot) echo "RELEASE STEP 4/5" ;;
  esac
}
# reports_of_part <summary part> <log>: its reports that exist, one path a line: the Playwright JSON and its HTML folder, the
# Robot report.html (as the step scripts print them in its part of the log); a channel's verdict: that channel's failure report
reports_of_part() {
  local part="$1" log="$2" mark kept path
  case "$part" in
    docker-verdict|windows-verdict)
      kept=$(kept_folder); path="${kept%/}/failure-report-${part%-verdict}.md"
      [ -z "$kept" ] || [ ! -f "$path" ] || echo "$path"
      return 0 ;;
  esac
  [ -s "$log" ] || return 0
  mark=$(mark_of_part "$part")
  if [ -n "$mark" ]; then
    LC_ALL=C awk -v s="######## $mark START" -v e="######## $mark END rc=" 'index($0, s) == 1 { on = 1 } on { print } on && index($0, e) == 1 { exit }' "$log"
  else cat "$log"; fi | tr -d '\r' | grep -aoE '(E2E_JSON_REPORT|WIN_E2E_REPORT)=[^ ]+|^ROBOT_RESULT .* report=[^ ]+' |
    sed -E 's/^.*(REPORT|report)=//' | awk '!seen[$0]++' |
    while IFS= read -r path; do
      [ ! -e "$path" ] || echo "$path"
      case "$path" in *.json) [ ! -d "${path%.json}-html" ] || echo "${path%.json}-html" ;; esac
    done
}
# result_part_lines: result.txt's part lines, from the summary's parts
result_part_lines() {
  local line part verdict log why
  for line in "${RESULT_PARTS[@]}"; do
    IFS=$'\t' read -r part verdict log why <<< "$line"
    printf 'part\t%s\t%s\t%s\t%s\t%s\t%s\n' "$part" "$(machine_of_part "$part")" "$verdict" "$log" \
      "$(reports_of_part "$part" "$log" | paste -sd' ')" "$why"
  done
}
# write_run_files <rc> <part lines>: result.txt and flaky.txt in the run folder
write_run_files() {
  local rc="$1" parts="$2" kept version channel flaky_args=() part report
  kept=$(kept_folder)
  version="$VERSION"
  [ -n "$version" ] || [ -z "${PIN:-}" ] || version=$(git show "$PIN:$SETTINGS_XML" 2>/dev/null | grep -m1 -oP '(?<=<version>)[^<]+')
  while IFS=$'\t' read -r part report; do flaky_args+=("$part" "$report"); done < <(
    printf '%s\n' "$parts" | awk -F'\t' '$1 == "part" { n = split($6, r, " "); for (i = 1; i <= n; i++) if (r[i] ~ /\.json$/) print $2 "\t" r[i] }')
  if [ "${#flaky_args[@]}" = 0 ]; then : > "$PARTS/flaky.txt"; else flaky_tests "${flaky_args[@]}" > "$PARTS/flaky.txt"; fi
  {
    echo "# the result of a release orchestrator run (asbl/ci/jenkins/release-orchestrator.sh, its header says each line)"
    echo "result=$([ "$rc" = 0 ] && echo green || echo red)"
    echo "dry_run=$DRY"
    echo "execution=$EXECUTION"
    echo "version=$version"
    echo "pin=${PIN:-}"
    echo "kept=${kept%/}"
    echo "step1=$STEP1_RESULT"
    echo "summary=${RUN_DIR:+$RUN_DIR/run.log}"
    echo "flaky=$PARTS/flaky.txt"
    for channel in docker windows; do
      [ -z "$kept" ] || [ ! -f "${kept%/}/failure-report-$channel.md" ] || echo "failure_report=${kept%/}/failure-report-$channel.md"
    done
    printf '%s\n' "$parts"
  } > "$PARTS/result.txt"
}
finish() {  # finish <rc>: the summary with the flaky tests, result.txt and flaky.txt, the history line, the exit
  local s parts flaky_count
  stop_memory_sampler
  [ "$DRY" = yes ] || report_caps_reached "$PARTS" >> "$PARTS/memory.log"
  echo
  echo "SUMMARY execution $EXECUTION on ${PIN:+${PIN:0:8}}$([ "$DRY" = yes ] && echo ' (dry run)'):"
  for s in "${SUMMARY[@]}"; do echo "$s"; done
  [ ! -s "$PARTS/caps-reached.log" ] || { echo "MEMORY  ceilings reached in this run:"; cut -f2- "$PARTS/caps-reached.log"; }
  [ ! -s "$PARTS/memory.log" ] || echo "MEMORY  peaks of this run: $(python3 -I asbl/ci/release-estimate.py run-peaks --runs "$PARTS" 2>/dev/null)"
  parts=$(result_part_lines)
  write_run_files "$1" "$parts"
  flaky_count=$(grep -c . "$PARTS/flaky.txt")
  if [ "$flaky_count" = 0 ]; then echo "FLAKY   none: no test passed only on a retry"
  else
    echo "FLAKY   $flaky_count test(s) passed only on a retry: not failures of this run, to look at after the upload"
    awk -F'\t' '{ printf "  %-22s %s  (%s)\n", $1, $2, $3 }' "$PARTS/flaky.txt"
  fi
  echo "RESULT  $PARTS/result.txt (result=$([ "$1" = 0 ] && echo green || echo red)); flaky.txt and started.txt beside it"
  machines_host_zram_swap_off "$([ "$DRY" = yes ] && echo dry)"
  run_record_end "$([ "$DRY" = yes ] && echo DRY-RUN || { [ "$1" = 0 ] && echo PASS || echo "FAIL rc=$1"; })" "${PIN:-$(git rev-parse HEAD)}"
  exit "$1"
}

# ---- 1. step 0 ----
PIN=""
step0_commit=""
if [ -n "$VERSION" ]; then
  mark_start "STEP 0" "the version $VERSION: release-set-version.sh, a dry run first, then for real"
  if [ "$DRY" = yes ]; then
    echo "WOULD   RELEASE_VERSION=$VERSION DRY_RUN=yes bash asbl/ci/jenkins/release-set-version.sh, then the same with DRY_RUN=no"
    simulate step0 > "$PARTS/step0.log"; rc=$?
  else
    RELEASE_VERSION="$VERSION" DRY_RUN=yes bash asbl/ci/jenkins/release-set-version.sh > "$PARTS/step0-dry-run.log" 2>&1 &&
      RELEASE_VERSION="$VERSION" DRY_RUN=no bash asbl/ci/jenkins/release-set-version.sh > "$PARTS/step0.log" 2>&1
    rc=$?
    [ -f "$PARTS/step0.log" ] || cp "$PARTS/step0-dry-run.log" "$PARTS/step0.log"
    grep -a '^SET_VERSION_RESULT\|^FAILED\|^RELEASE_COMMIT=' "$PARTS/step0.log"
    step0_commit=$(sed -n 's/^RELEASE_COMMIT=//p' "$PARTS/step0.log" | tail -1)
  fi
  echo "$rc" > "$PARTS/step0.rc"
  mark_end "$rc"
  summarize step0 "$(part_verdict step0)" "$PARTS/step0.log"
  [ "$rc" = 0 ] || { echo "step 0 is red: nothing else is started (the version is what everything after it tests)"; finish 1; }
fi

# ---- 2. the pin ----
if [ -n "${RELEASE_PIN:-}" ]; then
  git cat-file -e "$RELEASE_PIN^{commit}" 2>/dev/null || [ "$DRY" = yes ] || git fetch -q origin
  PIN=$(git rev-parse --verify -q "$RELEASE_PIN^{commit}") || { echo "FAIL  no commit RELEASE_PIN=$RELEASE_PIN"; finish 2; }
  why="RELEASE_PIN"
elif [ -n "$step0_commit" ]; then
  [ "$DRY" = yes ] || git fetch -q origin
  PIN=$(git rev-parse --verify -q "$step0_commit^{commit}") || { echo "FAIL  step 0's commit $step0_commit cannot be read"; finish 2; }
  why="step 0's commit"
else
  [ "$DRY" = yes ] || git fetch -q origin || { echo "FAIL  could not fetch origin: not pinning a commit of unknown age"; finish 2; }
  PIN=$(git rev-parse --verify -q "origin/main^{commit}") || { echo "FAIL  no origin/main"; finish 2; }
  why="origin/main at the start$([ "$DRY" = yes ] && echo ', as last fetched (a dry run fetches nothing)')"
fi
# The parts of an execution start in the same second on this one checkout, and the first thing each does is put it on the
# pin (sync_host_repo in dp-ci.sh). When that is a real move, one part's git status reads the files the other part's merge
# is writing and finds "local changes to tracked files": that part is red in seconds (16.6.3's first press, 2026-11-05: the
# pack, 7 s in, while the build went on). So the move is made here, once, while no part exists: each part's own
# sync_host_repo then finds the checkout on the pin and writes nothing. A checkout with local changes, or past the pin, is
# left as it is: the parts' guard refuses it and says why, as before.
put_checkout_on_pin() {
  [ "$(git rev-parse HEAD)" != "$PIN" ] || return 0
  [ -z "$(git status --porcelain --untracked-files=no)" ] || return 0
  git merge -q --ff-only "$PIN" >/dev/null 2>&1
  [ "$(git rev-parse HEAD)" != "$PIN" ] || echo "        this checkout moved forward to it, here, before any part starts"
}
export RELEASE_PIN="$PIN"
echo "PIN     execution $EXECUTION on ${PIN:0:8} ($why): $(git log -1 --format='%s' "$PIN")"
echo "        every part builds, packs and tests ${PIN:0:8}; main may move meanwhile"
if [ "$DRY" = yes ]; then
  if [ "$(git rev-parse HEAD)" = "$PIN" ]; then echo "        this checkout is on it"
  elif git merge-base --is-ancestor HEAD "$PIN"; then echo "        this checkout ($(git rev-parse --short HEAD)) would be moved forward to it here, before any part starts"
  else echo "        this checkout ($(git rev-parse --short HEAD)) is past the pin or off its history: every real part would refuse it"; fi
else
  put_checkout_on_pin
fi
if [ "$EXECUTION" = 2 ]; then
  out=$(RERUN_COMMIT="$PIN" bash asbl/ci/release-rerun.sh show 2>&1); printf '%s\n' "$out"
  if ! printf '%s\n' "$out" | grep -q '^SHOW_RESULT ready for execution 2'; then
    [ "$DRY" = yes ] || { echo "REFUSED: execution 2 starts once every failure of execution 1 is verified (above). Nothing started"; finish 1; }
    echo "dry run: a real start would be refused here (above)"
  fi
fi

# ---- 3. step 1 ----
if [ "$RUNNERS" = yes ]; then
  mark_start "STEPS 1, 2 AND 3" "together on ${PIN:0:8}: host = step 2's build, step 1's lane 2, step 2's Linux proof and keep, one at a time; runners = step 1's lane 1 in $FULL_SET_JOBS runner(s), from the build's end; VM = pack, Windows Docker proof, server light set, Electron light set, Robot"
elif [ "$STEPS" = together ]; then
  mark_start "STEPS 1, 2 AND 3" "together on ${PIN:0:8}: host = step 2's build and Linux proof, step 1's lanes 2 and 1, step 2's keep, one at a time; VM = pack, Windows Docker proof, server light set, Electron light set, Robot"
else
  mark_start "STEP 1" "the lanes a release needs, not green on ${PIN:0:8} yet: lanes 2 and 1, on this host"
fi
full=$(RELEASE_COMMIT="$PIN" DRY_RUN=yes $STATE full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
[ -n "$full" ] || { echo "FAILED: this release's full lane cannot be read (release-state.sh full-lane --choose)"; full=unknown; }
needed=""
for lane in "step1.docker-server-auth" "step1.$full-full"; do
  [ "$STEPS" = in-order ] || { needed="$needed $lane"; continue; }   # together: every lane, no verdict carried
  # (E2E_APPROVAL left out: with it, `require` would record an approval; the steps' guards take it, not this question)
  if out=$(E2E_APPROVAL="" RELEASE_COMMIT="$PIN" $STATE require "$lane" 2>&1); then
    echo "step 1  ${lane#step1.} is green for ${PIN:0:8} already: $(printf '%s\n' "$out" | tail -1)"
  else needed="$needed $lane"; fi
done
if [ "$STEPS" = together ]; then
  echo "step 1  to run:$needed, whatever the release record says (a run after fixes starts from scratch, step 1 included);"
  echo "        checked at the sign-off, once every part ended; the Windows light sets are step 3's"
else
  echo "step 1  to run:${needed:- nothing}; the Windows light sets are step 3's"
fi
# lane_part <lane>: its part id and the release-step1.sh environment that runs it
lane_part() {
  case "$1" in
    step1.docker-server-auth)      echo "lane2-docker-server-auth E2E_TARGET=docker-server E2E_SPEC=$AUTH_SPEC" ;;
    step1.*-full)                  t="${1#step1.}"; echo "lane1-$t E2E_TARGET=${t%-full} E2E_SPEC=" ;;
  esac
}
run_lane() {  # run_lane <lane>
  local id envs runners="" rotation="" host_lane=""
  read -r id envs <<< "$(lane_part "$1")"
  # with the runners, lane 1 runs the full set in N of them (HOW, runners), all on the round's one rotation date
  # and the auth file in the host lanes' runner
  case "$RUNNERS:$1" in
    yes:*-full) runners="E2E_RUNNERS=$FULL_SET_JOBS"; rotation="$ROUND_ROTATION_DATE" ;;
    yes:*) host_lane="E2E_IN_HOST_LANES_RUNNER=yes" ;;
  esac
  # Retries 1 on every lane (owner, 2026-10-30): a release's step 1 gives a flaky test one more try, like the light sets
  # of steps 2 and 3. Left empty, each lane would take its own default: 2 for a Linux full run, 0 for the auth lane.
  run_part "$id" "step 1 ${1#step1.}${runners:+ in $FULL_SET_JOBS runner(s)} (release-step1.sh)" env $envs E2E_GREP= E2E_RETRIES=1 E2E_ROTATION_DATE=$rotation $runners $host_lane \
    STEP1_STARTED_BY="release orchestrator, started by $WHO" \
    bash asbl/ci/jenkins/release-step1.sh
}
# step1_lanes: the build first when a lane takes it (docker-server: the image), then the lanes still needed, in order
step1_lanes() {
  local lane
  case "$needed" in
    *docker-server*)
      run_part step1-build "the build of ${PIN:0:8}, when there is none yet (dp-ci.sh build-if-needed)" bash asbl/ci/dp-ci.sh build-if-needed ;;
  esac
  for lane in step1.docker-server-auth "step1.$full-full"; do
    case " $needed " in *" $lane "*) run_lane "$lane" ;; esac
  done
}
# runners_plan: each runner's files and expected time: its setup plus Playwright's ratio times its files' test minutes,
# from this target's newest passed full set in the run records (asbl/ci/release-estimate.py files; a file with no time
# there takes the mean of those with one)
runners_plan() {
  local times="$PARTS/.full-set-file-times" n from
  python3 -I asbl/ci/release-estimate.py files --runs "${RUN_RECORD_DIR:-$LOG_DIR/runs}" --target "$full" > "$times" 2>/dev/null
  from=$(sed -n 's/^FROM //p' "$times")
  echo "RUNNERS step 1's full set ($(lane_part "step1.$full-full" | cut -d' ' -f1)) in $FULL_SET_JOBS runner(s) at once, each a Docker engine"
  echo "        of its own (asbl/ci/e2e-runners.sh full-set), started at the build's end mark; each its list of"
  echo "        asbl/ci/full-set-runners.txt; its time: its files' test minutes in ${from:-no passed full set on $full (no time yet)}"
  for n in $(seq 1 "$FULL_SET_JOBS"); do
    python3 -I asbl/ci/full-set-runners.py files "$FULL_SET_JOBS" "$n" 2>/dev/null |
      awk -v n="$n" -v jobs="$FULL_SET_JOBS" '
        FNR == NR {
          if ($1 == "SETUP") setup = $2; else if ($1 == "RATIO") ratio = $2
          else if ($1 ~ /^[0-9.]+$/ && NF == 2) { t[$2] = $1; sum += $1; known++ }
          next }
        { files[++count] = $1; if ($1 in t) minutes += t[$1]; else unknown++ }
        END {
          if (known) {
            m = setup + ratio * (minutes + unknown * sum / known); m = int(m / 5 + 0.5) * 5
            time = sprintf("about %d h %02d (%.0f test minutes%s, x %.2f + %.0f min setup)", m / 60, m % 60, minutes,
                           unknown ? sprintf(" + %d file(s) at the mean", unknown) : "", ratio, setup)
          } else time = "no time yet"
          printf "        runner %d of %d: %d spec files, %s:\n", n, jobs, count, time
          line = "           "
          for (i = 1; i <= count; i++) {
            f = files[i]; sub(/^specs\//, "", f); sub(/\.spec\.ts$/, "", f)
            word = f (i < count ? "," : "")
            if (length(line) + 1 + length(word) > 118) { print line; line = "           " }
            line = line " " word }
          print line }' "$times" -
  done
}
if [ "$RUNNERS" = yes ]; then
echo "ORDER   steps 1, 2 and 3 together (RELEASE_STEPS=together), on three tracks:"
echo "        host, one part at a time (the build on this host's engine, the two after it in the host lanes' runner):"
echo "                   docker-linux (step 2's build, DOCKER_RELEASE_PART=build), then step 1's$(for l in $needed; do [ "$l" = "step1.$full-full" ] || printf ' %s,' "$(lane_part "$l" | cut -d' ' -f1)"; done | sed 's/,$//'),"
echo "                   then docker-linux-proof (step 2's Linux proof, DOCKER_RELEASE_PART=linux-proof),"
echo "                   then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended"
echo "        runners, from the build's end mark (DOCKER RELEASE STEP 2/6 END): step 1's $(lane_part "step1.$full-full" | cut -d' ' -f1) in $FULL_SET_JOBS runner(s)"
echo "                   (release-step1.sh E2E_RUNNERS=$FULL_SET_JOBS), then the merge and step 1's record"
if [ "$WINDOWS_VMS_USED" = 1 ]; then
echo "        VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),"
echo "                   then server-light (on datapallas-server.zip of pack, kept) + electron-light + robot + windows-verdict"
echo "                   (WIN_RELEASE_HALF=after-pack); never two VM parts at once"
else
echo "        VMs, meanwhile, one track each, its lanes of the layout for $WINDOWS_VMS_USED VMs in order (one part at a time per VM):"
for vm in $RUN_VMS; do echo "                   VM $vm: $(vm_order "$vm")"; done
echo "                   then windows-verdict on VM $PACK_VM once every lane ended (WIN_RELEASE_HALF=verdict)"
fi
echo "        step 1 at the sign-off, after every part: steps 2 and 3 do not wait for it ($STEP1_SWITCH)"
runners_plan
elif [ "$STEPS" = together ]; then
echo "ORDER   steps 1, 2 and 3 together (RELEASE_STEPS=together), on two tracks:"
echo "        host, one part at a time (this host's one Docker engine runs one DataPallas e2e set at a time):"
echo "                   docker-linux (step 2's build, then its Linux proof, DOCKER_RELEASE_PART=linux), then step 1's$(for l in $needed; do printf ' %s,' "$(lane_part "$l" | cut -d' ' -f1)"; done)"
echo "                   then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended"
if [ "$WINDOWS_VMS_USED" = 1 ]; then
echo "        VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),"
echo "                   then server-light (on datapallas-server.zip of pack, kept) + electron-light + robot + windows-verdict"
echo "                   (WIN_RELEASE_HALF=after-pack); never two VM parts at once"
else
echo "        VMs, meanwhile, one track each, its lanes of the layout for $WINDOWS_VMS_USED VMs in order (one part at a time per VM):"
for vm in $RUN_VMS; do echo "                   VM $vm: $(vm_order "$vm")"; done
echo "                   then windows-verdict on VM $PACK_VM once every lane ended (WIN_RELEASE_HALF=verdict)"
fi
echo "        step 1 at the sign-off, after every part: steps 2 and 3 do not wait for it ($STEP1_SWITCH)"
else
echo "ORDER   step 1     host: ${needed:+step1-build (when a lane takes the build), }$(for l in step1.docker-server-auth "step1.$full-full"; do case " $needed " in *" $l "*) printf '%s, ' "$(lane_part "$l" | cut -d' ' -f1)" ;; esac; done)done"
echo "                   VM: nothing (step 1 runs on this host only)"
echo "        execution  host: build + linux-proof (step 2, DOCKER_RELEASE_PART=linux), then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended"
echo "                   VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),"
echo "                   then server-light (on datapallas-server.zip of pack, kept) + electron-light + robot + windows-verdict"
echo "                   (WIN_RELEASE_HALF=after-pack); never two VM parts at once"
fi
echo "$machines_answer"
machines_schedule "$FULL_SET_JOBS" "$WINDOWS_VMS_USED" "$full" 2>&1 || echo "SCHEDULE  not available: asbl/ci/release-estimate.py failed (above)"
# step1_verdicts: step 1's lanes in the summary; sets s1_red (one lane not PASS)
step1_verdicts() {
  local lane id v
  s1_red=0
  for lane in $needed; do
    read -r id _ <<< "$(lane_part "$lane")"
    v=$(part_verdict "$id"); summarize "$id" "$v" "$PARTS/$id.log"
    [ "${v%%|*}" = PASS ] || s1_red=1
  done
}
# in-order (16.6.2): step 1's lanes now, then the guard of steps 2 and 3; together: the lanes run on the host track (4.)
if [ "$STEPS" = in-order ]; then
[ -z "$needed" ] || step1_lanes
[ -f "$PARTS/step1-build.rc" ] && summarize step1-build "$(part_verdict step1-build)" "$PARTS/step1-build.log"
step1_verdicts
# the guard steps 2 and 3 make, asked now (DRY_RUN=yes: an approval is printed here, recorded by the steps themselves)
if [ "$DRY" = yes ]; then
  [ "$s1_red" = 0 ] && guard_ok=1 || guard_ok=0
  echo "dry run: step 1 $([ "$guard_ok" = 1 ] && echo "green on ${PIN:0:8} once the lanes above pass" || echo "red (DRY_RUN_RED): a real start runs no execution")"
elif RELEASE_COMMIT="$PIN" DRY_RUN=yes $STATE step1-guard; then guard_ok=1
else guard_ok=0; fi
STEP1_RESULT=$([ "$guard_ok" = 1 ] && echo green || echo red)
mark_end "$([ "$guard_ok" = 1 ] && echo 0 || echo 1)"
if [ "$guard_ok" = 0 ]; then
  echo "execution $EXECUTION not started: step 1 is not green on ${PIN:0:8} (above). A lane red on a few tests: re-run them alone,"
  echo "  bash asbl/ci/release-rerun.sh run <part> --failed <the lane's report>, then bash asbl/ci/release-state.sh record-step1 <target> reruns full|auth|light;"
  echo "  then start the orchestrator again with RELEASE_PIN=${PIN:0:8} (or with the owner's approval, E2E_APPROVAL)"
  [ "$DRY" = yes ] || finish 1
fi
fi

# ---- the VMs: started when off, shut down after their last part (THE VMS, above) ----
# vm_up <name>: the VM ready for its parts; 1 when it did not start (VM_WHY says why)
vm_up() {
  local dom rc
  dom=$(machines_domain_of "$1")
  case "$(machines_vm_state "$1")" in
    running) return 0 ;;
    missing) echo "WARN    VM $1: libvirt has no $dom: its parts run as they are (they fail at their SSH if it is down)"; return 0 ;;
  esac
  record_started "vm-$1"
  if [ "$DRY" = yes ]; then
    echo "WOULD   VM $1 ($dom) is off: virsh start, then wait for its SSH ($(machines_duration "${VM_SSH_WAIT_SECS:-900}") at most); shut down after its last part"
    red_in_dry_run "vm-$1" || return 0
    VM_WHY="VM $1 ($dom) did not start (DRY_RUN_RED)"; echo "$VM_WHY"; return 1
  fi
  machines_vm_start_one_at_a_time "$PARTS/.vm-start.lock" "$1" | tee "$PARTS/vm-$1.log"; rc=${PIPESTATUS[0]}
  VM_WHY=$(tail -1 "$PARTS/vm-$1.log")
  [ "$rc" != 0 ] || machines_vm_docker_wait "$1" | tee -a "$PARTS/vm-$1.log"
  return "$rc"
}
# vm_down <name>: after the VM's last part: shut down when this run started it (its started.txt line), once
vm_down() {
  grep -q $'\t'"vm-$1"$'\tdomain\t' "$PARTS/started.txt" 2>/dev/null && [ ! -e "$PARTS/vm-$1.rc" ] || return 0
  if [ "$DRY" = yes ]; then
    echo "WOULD   VM $1 ($(machines_domain_of "$1")): shut down, its last part ended (virsh shutdown; virsh destroy after $(machines_duration "${VM_SHUTDOWN_WAIT_SECS:-600}"))"
  else machines_vm_shutdown "$1" | tee -a "$PARTS/vm-$1.log"; fi
  echo 0 > "$PARTS/vm-$1.rc"
}
# vm_red <why> <part>...: parts of a VM that did not start, red without running
vm_red() {
  local why="$1" id; shift
  for id in "$@"; do
    printf 'red: %s\nFAILED: %s\n' "$why" "$why" > "$PARTS/$id.log"; echo 1 > "$PARTS/$id.rc"
    echo "PART    $id RED: $why"
  done
}

# ---- 4. the execution: two tracks (together: steps 1, 2 and 3, under the mark opened in 3.) ----
[ "$STEPS" = together ] ||
  mark_start "EXECUTION $EXECUTION" "steps 2 and 3 on ${PIN:0:8}: host = build, Linux proof, then the Docker keep; VM = pack, Windows Docker proof, server light set, Electron light set, Robot"
DOCKER="bash asbl/ci/jenkins/release-docker.sh"
WINDOWS="bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh release"
# build_verdict: the build's verdict from the linux part's log, once its mark ended or the part did
build_verdict() { mark_verdict "$PARTS/docker-linux.log" "DOCKER RELEASE STEP 2/6"; }
# step1_lanes_after_the_build: together, step 1's lanes on the host track, after step 2's linux part (with the runners:
# after the build part, lane 2 only, in the host lanes' runner); a lane on the docker-server target installs the
# build's zip and image, so it does not run when the build is red
step1_lanes_after_the_build() {
  local lane id envs
  for lane in $needed; do
    [ "$RUNNERS" = no ] || [ "$lane" != "step1.$full-full" ] || continue   # lane 1: track_runners
    read -r id envs <<< "$(lane_part "$lane")"
    case " $envs " in
      *" E2E_TARGET=docker-server "*)
        if [ "$(build_verdict | cut -d'|' -f1)" != PASS ]; then
          not_run "$id" "no build of ${PIN:0:8} to test (the build is not green)"; continue
        fi ;;
    esac
    run_lane "$lane"
  done
}
# track_host: with the runners, this host's engine only builds: the auth file and the Linux proof run in the host lanes' runner,
# so a round starts no app on the engine the host's own apps share
track_host() {
  if [ "$RUNNERS" = yes ]; then
    # the build, step 1's auth file, then the Linux proof, each to its end: a red auth file leaves the Linux proof to run
    run_part docker-linux "step 2's build (DOCKER_RELEASE_PART=build)" env $STEP1_SWITCH DOCKER_RELEASE_PART=build $DOCKER
    step1_lanes_after_the_build
    if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
      run_part docker-linux-proof "step 2's Linux proof, on the build the build part made (DOCKER_RELEASE_PART=linux-proof)" \
        env $STEP1_SWITCH E2E_IN_HOST_LANES_RUNNER=yes DOCKER_RELEASE_PART=linux-proof $DOCKER
    else not_run docker-linux-proof "no build of ${PIN:0:8} to prove (the build is not green)"; fi
    # its memory goes back as soon as the last of its lanes ended, not at the round's end
    [ "$DRY" = yes ] || bash asbl/ci/e2e-runners.sh stop "$HOST_LANES_RUNNER"
  else
    run_part docker-linux "step 2's build, then its Linux proof (DOCKER_RELEASE_PART=linux)" env $STEP1_SWITCH DOCKER_RELEASE_PART=linux $DOCKER
    [ "$STEPS" = in-order ] || step1_lanes_after_the_build
  fi
  until [ -e "$PARTS/.docker-windows-done" ]; do sleep "$POLL"; done
  if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
    run_part docker-keep "step 2's keep, guard and verdict (DOCKER_RELEASE_PART=keep)" env $STEP1_SWITCH DOCKER_RELEASE_PART=keep $DOCKER
  else not_run docker-keep "no build of ${PIN:0:8} to keep (the build is not green)"; fi
}
# track_runners: with the runners, step 1's lane 1 in them, from the build's end mark (not the build part's end: it still
# saves the image as a file); on the docker-server target NOT RUN when the build is red (it installs the build's zip and
# image)
track_runners() {
  local lane="step1.$full-full" id envs
  case " $needed " in *" $lane "*) ;; *) return 0 ;; esac
  read -r id envs <<< "$(lane_part "$lane")"
  until grep -aq '^######## DOCKER RELEASE STEP 2/6 END' "$PARTS/docker-linux.log" 2>/dev/null || [ -f "$PARTS/docker-linux.rc" ]; do sleep "$POLL"; done
  case " $envs " in
    *" E2E_TARGET=docker-server "*)
      if [ "$(build_verdict | cut -d'|' -f1)" != PASS ]; then
        not_run "$id" "no build of ${PIN:0:8} to test (the build is not green)"; return 0
      fi ;;
  esac
  run_lane "$lane"
}
track_vm() {
  if ! vm_up a; then
    vm_red "$VM_WHY" windows-pack docker-windows windows-after-pack
    touch "$PARTS/.docker-windows-done"; vm_down a; return
  fi
  run_part windows-pack "step 3's pack, kept (WIN_RELEASE_HALF=pack)" env $STEP1_SWITCH WIN_RELEASE_HALF=pack FOLLOW_PIDFILE="$WIN_PID" $WINDOWS
  # the build ended when its mark did (or the linux part ended before it)
  until grep -aq '^######## DOCKER RELEASE STEP 2/6 END' "$PARTS/docker-linux.log" 2>/dev/null || [ -f "$PARTS/docker-linux.rc" ]; do sleep "$POLL"; done
  if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
    run_part docker-windows "step 2's Windows Docker proof (DOCKER_RELEASE_PART=windows)" env $STEP1_SWITCH DOCKER_RELEASE_PART=windows $DOCKER
  else not_run docker-windows "no build of ${PIN:0:8} to prove (the build is not green)"; fi
  touch "$PARTS/.docker-windows-done"
  run_part windows-after-pack "step 3's server light set, Electron light set, Robot and verdict (WIN_RELEASE_HALF=after-pack)" \
    env $STEP1_SWITCH WIN_RELEASE_HALF=after-pack FOLLOW_PIDFILE="$WIN_PID" $WINDOWS
  vm_down a
}
# ---- more VMs: one track each, its lanes of the layout (HOW, VMs) ----
# vm_prepare <vm>: its e2e package, once per pin (seconds when its stamp is the pin's already)
vm_prepare() {
  run_part "windows-prepare-$1" "VM $1's e2e package, once per pin (win-e2e.sh prepare: built only when its stamp is not ${PIN:0:8})" \
    env WIN_VM="$1" FOLLOW_PIDFILE="$(win_vm_pidfile "$1")" bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh prepare
}
# vm_package <vm>: a VM other than the pack's: its e2e package once per pin, a copy of the pack's (dp-ci.sh win package:
# nothing when its stamp is the pin's already; its own prepare when no copy can be made)
vm_package() {
  run_part "windows-package-$1" "VM $1's e2e package, once per pin: a copy of the pack's, from windows-package-from-pack (win-e2e.sh package; its own prepare when no copy can be made)" \
    env WIN_VM="$1" WIN_PACKAGE_ARCHIVE="$PACKAGE_ARCHIVE" WIN_PACKAGE_PULL_RC="$PARTS/windows-package-from-pack.rc" \
      FOLLOW_PIDFILE="$(win_vm_pidfile "$1")" bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh package
}
# package_from_pack: the pack's e2e package for the VMs of PACKAGE_TO, once: from the pack's start on its VM's clock
# (WIN_PACK_LOG_SINCE=, which the pack prints before asbl\pack-datapallas.bat), dp-ci.sh win package-pull waits on the
# pack's VM for this pack's NoExeAssembler and brings the archive here; the archive is removed once every one of those
# VMs' package parts ended. A pack that never started the bat (its VM did not start, a check before the pack red): no
# copy, each VM prepares its own
package_from_pack() {
  local since v
  until grep -aq '^WIN_PACK_LOG_SINCE=' "$PARTS/windows-pack.log" 2>/dev/null || [ -f "$PARTS/windows-pack.rc" ]; do sleep "$POLL"; done
  since=$(sed -n 's/^WIN_PACK_LOG_SINCE=\([0-9][0-9]*\).*/\1/p' "$PARTS/windows-pack.log" 2>/dev/null | head -1)
  if [ -z "$since" ] && ! grep -aq '^WIN_PACK_LOG_SINCE=' "$PARTS/windows-pack.log" 2>/dev/null; then
    [ "$DRY" = yes ] || echo "the pack never started asbl\\pack-datapallas.bat (no WIN_PACK_LOG_SINCE= in its log)" > "$PACKAGE_ARCHIVE.none"
    not_run windows-package-from-pack "the pack never started asbl\\pack-datapallas.bat (no WIN_PACK_LOG_SINCE= in its log): VM(s) $PACKAGE_TO prepare their own"
  else
    run_part windows-package-from-pack "VM $PACK_VM's e2e package for VM(s) $PACKAGE_TO, once this pack's NoExeAssembler finished (dp-ci.sh win package-pull)" \
      env WIN_VM="$PACK_VM" WIN_PACKAGE_PACK_RC="$PARTS/windows-pack.rc" bash asbl/ci/dp-ci.sh win package-pull "$PACKAGE_ARCHIVE" "$PIN" "$since"
  fi
  for v in $PACKAGE_TO; do until [ -f "$PARTS/windows-package-$v.rc" ]; do sleep "$POLL"; done; done
  if [ -e "$PACKAGE_ARCHIVE" ]; then rm -f "$PACKAGE_ARCHIVE"; echo "PACKAGE the pack's e2e package removed from this host ($PACKAGE_ARCHIVE): VM(s) $PACKAGE_TO took it"; fi
}
lane_id() { case "$1" in pack) echo windows-pack ;; docker-proof) echo docker-windows ;; *) echo "windows-$1" ;; esac; }   # lane_id <lane>: its part
# vm_lanes_track <vm>: that VM's lanes in order, each when its inputs exist; the VM shut down after them when this run
# started it (the pack's VM after the verdict)
vm_lanes_track() {
  local v="$1" lane pidf
  pidf=$(win_vm_pidfile "$v")
  if ! vm_up "$v"; then
    vm_red "$VM_WHY" $(for lane in $(machines_lanes_of "$WINDOWS_VMS_USED" "$v"); do lane_id "$lane"; done)
    [ "$v" != "$(vm_of_lane docker-proof)" ] || touch "$PARTS/.docker-windows-done"
    [[ " $PACKAGE_TO " != *" $v "* ]] || not_run "windows-package-$v" "$VM_WHY"
    echo "$VM_WHY" > "$PARTS/.vm-$v-red"
    [ "$v" = "$PACK_VM" ] || vm_down "$v"
    return
  fi
  if [[ " $PACKAGE_TO " == *" $v "* ]]; then vm_package "$v"
  else [ "$v" = "$PACK_VM" ] || ! vm_needs_package "$v" || vm_prepare "$v"; fi
  for lane in $(machines_lanes_of "$WINDOWS_VMS_USED" "$v"); do
    case "$lane" in
      pack)
        run_part windows-pack "step 3's pack on VM $v, kept (WIN_RELEASE_HALF=pack)" env $STEP1_SWITCH WIN_VM="$v" WIN_RELEASE_HALF=pack FOLLOW_PIDFILE="$pidf" $WINDOWS
        ! vm_needs_package "$v" || vm_prepare "$v" ;;
      docker-proof)
        until grep -aq '^######## DOCKER RELEASE STEP 2/6 END' "$PARTS/docker-linux.log" 2>/dev/null || [ -f "$PARTS/docker-linux.rc" ]; do sleep "$POLL"; done
        if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
          run_part docker-windows "step 2's Windows Docker proof on VM $v (DOCKER_RELEASE_PART=windows)" env $STEP1_SWITCH WIN_VM="$v" DOCKER_RELEASE_PART=windows $DOCKER
        else not_run docker-windows "no build of ${PIN:0:8} to prove (the build is not green)"; fi
        touch "$PARTS/.docker-windows-done" ;;
      server-light|electron-light|robot)
        # the server light set installs the pack's datapallas-server.zip: once the pack ended (Robot follows it on its VM);
        # every lane records its part in the folder the pack's half begins (its step list emptied then): once it began
        if [ "$lane" = server-light ]; then until [ -f "$PARTS/windows-pack.rc" ]; do sleep "$POLL"; done
        else until grep -aq '^RELEASE_ARTIFACTS=' "$PARTS/windows-pack.log" 2>/dev/null || [ -f "$PARTS/windows-pack.rc" ]; do sleep "$POLL"; done; fi
        run_part "windows-$lane" "step 3's $lane on VM $v (WIN_RELEASE_HALF=$lane)" env $STEP1_SWITCH WIN_VM="$v" WIN_RELEASE_HALF="$lane" FOLLOW_PIDFILE="$pidf" $WINDOWS ;;
    esac
  done
  [ "$v" = "$PACK_VM" ] || vm_down "$v"
}
# track_vms: every VM's track at once; once every lane ended, step 3's verdict on the pack's VM, which is then shut down
# when this run started it
track_vms() {
  local v pids=()
  [ -z "$PACKAGE_TO" ] || { package_from_pack & pids+=("$!"); }
  for v in $RUN_VMS; do vm_lanes_track "$v" & pids+=("$!"); done
  wait "${pids[@]}"
  if [ -f "$PARTS/.vm-$PACK_VM-red" ]; then vm_red "$(cat "$PARTS/.vm-$PACK_VM-red")" windows-verdict
  else
    run_part windows-verdict "step 3's verdict on VM $PACK_VM, every lane ended (WIN_RELEASE_HALF=verdict)" \
      env $STEP1_SWITCH WIN_VM="$PACK_VM" WIN_RELEASE_HALF=verdict FOLLOW_PIDFILE="$(win_vm_pidfile "$PACK_VM")" $WINDOWS
  fi
  vm_down "$PACK_VM"
}
track_host & host_pid=$!
if [ "$WINDOWS_VMS_USED" = 1 ]; then track_vm & vm_pid=$!; else track_vms & vm_pid=$!; fi
runners_pid=""; [ "$RUNNERS" = no ] || { track_runners & runners_pid=$!; }
wait "$host_pid"; wait "$vm_pid"; [ -z "$runners_pid" ] || wait "$runners_pid"
for vm in $RUN_VMS; do vm_down "$vm"; done   # a VM this run started whose track ended early
if [ "$DRY" = yes ]; then
  # what the guards of steps 2 and 3 will ask before their verdicts (release-docker.sh 6/6, win_release 5/5), on the main
  # this checkout knows: under the pin, whether the part tested it; for comparison, what an unpinned step would answer
  echo "the moved-main checks, as steps 2 and 3 ask them under the pin: $($STATE moved-main "$PIN" origin/main 2>&1 | tail -1)"
  echo "  the same unpinned (today's rule, for comparison): $(env -u RELEASE_PIN $STATE moved-main "$PIN" origin/main 2>&1 | tail -1)"
fi
mark_end 0

# ---- 5. the summary ----
if [ "$STEPS" = together ]; then
  step1_verdicts
  # the sign-off's step 1 check (the guard steps 2 and 3 skipped in this run): not green = the run is red
  if [ "$DRY" = yes ]; then
    [ "$s1_red" = 0 ] && guard_ok=1 || guard_ok=0
    echo "dry run: the sign-off: step 1 $([ "$guard_ok" = 1 ] && echo "green on ${PIN:0:8} once the lanes above pass" || echo "red (DRY_RUN_RED): the run is red")"
  elif RELEASE_COMMIT="$PIN" DRY_RUN=yes $STATE step1-guard; then guard_ok=1
  else guard_ok=0; fi
  STEP1_RESULT=$([ "$guard_ok" = 1 ] && echo green || echo red)
  [ "$guard_ok" = 1 ] || { ALL_GREEN=0; echo "SIGN-OFF: step 1 is not green on ${PIN:0:8} (above): the run is red, whatever steps 2 and 3 say"; }
fi
summarize build "$(build_verdict)" "$PARTS/docker-linux.log"
LINUX_PROOF_LOG="$PARTS/$([ "$RUNNERS" = yes ] && echo docker-linux-proof || echo docker-linux).log"   # with the runners, a part of its own
summarize linux-proof "$(mark_verdict "$LINUX_PROOF_LOG" "DOCKER RELEASE STEP 3/6")" "$LINUX_PROOF_LOG"
summarize pack "$(mark_verdict "$PARTS/windows-pack.log" "$(mark_of_part pack)")" "$PARTS/windows-pack.log"
summarize windows-docker-proof "$(mark_verdict "$PARTS/docker-windows.log" "$(mark_of_part windows-docker-proof)")" "$PARTS/docker-windows.log"
# the Windows lanes' logs: one VM, the after-pack half's; more VMs, each lane's own, and the verdict's
WIN_VERDICT_PART=$([ "$WINDOWS_VMS_USED" = 1 ] && echo windows-after-pack || echo windows-verdict)
for part in server-light electron-light robot; do
  lane_log="$PARTS/$([ "$WINDOWS_VMS_USED" = 1 ] && echo windows-after-pack || echo "windows-$part").log"
  summarize "$part" "$(mark_verdict "$lane_log" "$(mark_of_part "$part")")" "$lane_log"
done
summarize docker-verdict "$(part_verdict docker-keep)" "$PARTS/docker-keep.log"
summarize windows-verdict "$(part_verdict "$WIN_VERDICT_PART")" "$PARTS/$WIN_VERDICT_PART.log"
folder=$(kept_folder)
if [ "$ALL_GREEN" = 0 ] && [ "$DRY" = no ] && [ -n "$folder" ]; then
  echo "THE FAILURES TO FIX (execution $EXECUTION, ${folder%/}):"
  for ch in docker windows; do bash asbl/ci/release-keep.sh failures "${folder%/}" "$ch"; done
  echo "then: each fixed and verified alone (bash asbl/ci/release-rerun.sh run <part> --failed ${folder%/}), and EXECUTION=2 once"
  echo "bash asbl/ci/release-rerun.sh show ${folder%/} says ready for execution 2"
fi
finish "$([ "$ALL_GREEN" = 1 ] && echo 0 || echo 1)"

#!/bin/bash
# release-rehearsal.sh stop: it stops what the round's run started, from the run's started.txt, and nothing else.
# A stub orchestrator writes a started.txt (a part going with a container, a compose stack and an older container; a
# part going on the Windows VM with its driver's pid file, an older pid file and the VM's steps; an ended part; a dry-run
# line), lists its containers through a stub docker, starts a real sleep as the Windows driver (its own session, as
# win-e2e.sh does), then sleeps as a running part would. The cases:
#   1. stop while it runs: docker stop for the run's container, its compose container and the stack its server started
#      below that compose folder only (an older stack there, a folder that only starts with that name: left); the
#      driver's process ended,
#      the older pid file's left; the VM's steps of that command stopped (dp-ci.sh win stop, over a stub ssh that names
#      the step it was sent); the orchestrator ended; everything else left;
#   1b. the call that runs stop is cut (its output closed after one line, as a forced end of the Jenkins step does): it
#      finishes all the same; and a part does not keep the orchestrator's lock (read);
#   2. stop again: nothing more is stopped;
#   3. the round's process gone (a reboot) and another run holding the CI now: nothing is touched;
#   4. the round's process gone and the CI free: what the run started is stopped;
#   5. a run that started VM b and drives it, and started VM c, shut down already: VM a's steps stopped on VM a's host,
#      VM b's on VM b's (WIN_VM=b), then VM b shut down (virsh shutdown); VM c left as it is;
#   6. the round's process gone (a crash) with runner 2 and VM c it started still going, their parts' logs written after
#      them: they make the CI look busy, yet stop counts them as the round's own: the runner removed, the drivers of VMs a
#      and c ended, VM c shut down; win10-dev (running before) and another run's entries left; a second stop (as after a
#      person's) says "nothing to stop" and touches nothing;
#   7. a press after such a dead round: its leftovers stopped first, then the new round starts;
#   8. a press while a round lives: refused, nothing stopped;
#   9. the job (its Jenkinsfile, read): a round that ends stopped gets release-rehearsal.sh stop, then the build ends red;
#  10. a dry round's stop: it started nothing, so it names what its run's started.txt names (the runners among them),
#      one "WOULD stop" line each, and stops nothing.
# Every folder is a scratch one; docker, ssh and virsh are stubs first on PATH. Takes about 25 seconds.
# Callers: a person or an agent, from the shell, after changing release-rehearsal.sh's stop.
#   bash asbl/ci/tests/test-release-stop.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
ROUND_SCRIPT="$PWD/asbl/ci/jenkins/release-rehearsal.sh"
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-release-stop.XXXXXX") || exit 2
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin" "$STUB/runs"
cleanup() {
  bash "$ROUND_SCRIPT" stop >/dev/null 2>&1
  for f in "$STUB"/*.pid "$SCRATCH"/logs/win-e2e.pid "$SCRATCH"/logs/win-e2e-c.pid; do [ -f "$f" ] && kill -KILL "$(cat "$f")" 2>/dev/null; done
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

# ---- the stubs ----
cat > "$STUB/bin/docker" <<'EOF'
#!/bin/bash
# stub docker: the containers are the lines name|created|compose working dir of $STUB/containers; stop records the name
# in $STUB/stopped and takes the line away (a run container is --rm)
case "${1:-}" in
  ps) filter=""
      for a in "$@"; do case "$a" in
        name=*) filter="name:${a#name=}" ;;
        label=com.docker.compose.project.working_dir=*) filter="dir:${a#label=com.docker.compose.project.working_dir=}" ;;
      esac; done
      while IFS='|' read -r name created dir; do
        case "$filter" in
          name:*) [[ "$name" =~ ${filter#name:} ]] && echo "$name" ;;
          dir:*)  [ "$dir" = "${filter#dir:}" ] && echo "$name" ;;
          *)      echo "$name|$dir" ;;
        esac
      done < "$STUB/containers" 2>/dev/null ;;
  inspect) name="${*: -1}"
           line=$(grep "^$name|" "$STUB/containers" 2>/dev/null) || { echo "Error: No such object: $name" >&2; exit 1; }
           echo "$line" | cut -d'|' -f2 ;;
  stop) echo "$2" >> "$STUB/stopped"; sed -i "/^$2|/d" "$STUB/containers"; echo "$2" ;;
esac
exit 0
EOF
cat > "$STUB/bin/ssh" <<'EOF'
#!/bin/bash
# stub ssh: a PowerShell script sent to the VM is decoded; a step's stop (schtasks /end /tn "dp-ci-<step>") is recorded
# in $STUB/vm-stopped and answered as the VM does
encoded=no; for a in "$@"; do [ "$a" = -EncodedCommand ] && encoded=yes; done
if [ "$encoded" = yes ]; then
  step=$(printf '%s' "${*: -1}" | base64 -d | iconv -f UTF-16LE -t UTF-8 | sed -n 's/.*schtasks \/end \/tn "dp-ci-\([a-z0-9-]*\)".*/\1/p' | head -1)
  host=""; for a in "$@"; do case "$a" in *@*) host="${a#*@}"; break ;; esac; done
  [ -n "$step" ] && { echo "$step" >> "$STUB/vm-stopped"; echo "step $step on $host" >> "$STUB/events"; echo "STOPPED $step"; exit 0; }
fi
echo "ssh $*" | cut -c1-200 >> "$STUB/ssh-other"
EOF
cat > "$STUB/orchestrator" <<'EOF'
#!/bin/bash
# stub orchestrator: a run folder whose started.txt holds one line of each kind; the things those lines name, created
# after them; then it sleeps as a running part does
echo $$ > "$STUB/orchestrator.pid"
folder="$STUB/runs/run-$(date +%s%N)"; mkdir -p "$folder"
echo "PARTS   one log per part in $folder"
entry=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ -n "${STUB_DRY:-}" ]; then   # case 10: a dry round: every line dry-run (the runners among them), nothing started
  {
    printf '%s\tdocker-linux\tcontainer\tdp-ci\tdry-run\tthe run container of dp-ci.sh\n' "$entry"
    printf '%s\tlane1-docker-server-full\tcontainer\tdp-ci-runner-1\tdry-run\trunner 1 (Docker in Docker): its engine and everything it runs\n' "$entry"
    printf '%s\tlane1-docker-server-full\tcontainer\tdp-ci-runner-2\tdry-run\trunner 2 (Docker in Docker): its engine and everything it runs\n' "$entry"
    printf '%s\tlane2-docker-server-auth\tcontainer\tdp-ci\tdry-run\tthe run container of dp-ci.sh\n' "$entry"
    printf '%s\twindows-pack\tpidfile\t%s\tdry-run\tthe Windows driver of win-e2e.sh\n' "$entry" "$LOG_DIR/win-e2e.pid"
  } > "$folder/started.txt"
  echo started > "$STUB/orchestrator-ready"
  sleep 120; exit 0
fi
{
  printf '%s\tstep1-build\tcontainer\tended-part-container\treal\tthe run container of dp-ci.sh\n' "$entry"
  printf '%s\tdocker-linux\tcontainer\tdp-ci\treal\tthe run container of dp-ci.sh\n' "$entry"
  printf '%s\tdocker-linux\tcompose\t%s\treal\tthe docker-server bundle under test\n' "$entry" "$STUB/bundle"
  printf '%s\tdocker-linux\tcontainer\tdp-ci-one-command\treal\tthe image alone\n' "$entry"
  printf '%s\tdocker-windows\tpidfile\t%s\treal\tthe Windows driver of win-e2e.sh\n' "$entry" "$LOG_DIR/win-e2e.pid"
  printf '%s\tdocker-windows\tpidfile\t%s\treal\ta pid file older than its entry\n' "$entry" "$STUB/older.pid"
  printf '%s\tdocker-windows\tvm\twindows-vm\treal\tdp-ci.sh win docker-e2e\n' "$entry"
  printf '%s\tlane1-web-full\tcontainer\tdry-run-container\tdry-run\tthe run container of dp-ci.sh\n' "$entry"
  if [ -n "${STUB_VMS:-}" ]; then   # case 5: VM b started by this run and driven, VM c started and shut down already
    printf '%s\tvm-b\tdomain\twin10-dev-b\treal\tthe Windows VM b, started by this run (virsh start)\n' "$entry"
    printf '%s\twindows-pack\tvm\twindows-vm-b\treal\tdp-ci.sh win docker-e2e\n' "$entry"
    printf '%s\tvm-c\tdomain\twin10-dev-c\treal\tthe Windows VM c, started by this run (virsh start)\n' "$entry"
  fi
  if [ -n "${STUB_RUNNERS:-}" ]; then   # cases 6 and 7: runner 2 and VM c started by this run, their parts going
    printf '%s\tlane1-web-full\tcontainer\tdp-ci-runner-2\treal\trunner 2 (Docker in Docker): its engine and everything it runs\n' "$entry"
    printf '%s\tvm-c\tdomain\twin10-dev-c\treal\tthe Windows VM c, started by this run (virsh start)\n' "$entry"
    printf '%s\twindows-electron-light\tpidfile\t%s\treal\tthe Windows driver of win-e2e.sh\n' "$entry" "$LOG_DIR/win-e2e-c.pid"
    printf '%s\twindows-electron-light\tvm\twindows-vm-c\treal\tdp-ci.sh win release\n' "$entry"
  fi
} > "$folder/started.txt"
echo 0 > "$folder/step1-build.rc"
[ -z "${STUB_VMS:-}" ] || echo 0 > "$folder/vm-c.rc"
[ -z "${STUB_RUNNERS:-}" ] || echo 0 > "$folder/docker-linux.rc"   # the build part ended (the runners' round): its dp-ci gone
sleep 1.2
created=$(date -u +%Y-%m-%dT%H:%M:%S.123456789Z); older=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S.000000000Z)
if [ -n "${STUB_RUNNERS:-}" ]; then run_container="dp-ci-runner-2|$created|"; else run_container="dp-ci|$created|"; fi
printf '%s\n' "ended-part-container|$created|" "$run_container" "bundle-datapallas-1|$created|$STUB/bundle" \
  "dp-ci-one-command|$older|" "dry-run-container|$created|" "someone-elses-container|$created|" \
  "someone-elses-bundle-1|$created|$STUB/other-bundle" "app-stack-of-the-bundle-1|$created|$STUB/bundle/_apps/flowkraft/_ai-hub" \
  "older-app-stack-1|$older|$STUB/bundle/_apps/flowkraft/_older" "folder-with-a-longer-name-1|$created|$STUB/bundle-longer" \
  > "$STUB/containers"
setsid sleep 300 > /dev/null 2>&1 < /dev/null & echo $! > "$LOG_DIR/win-e2e.pid"   # its own session, as win-e2e.sh's driver
if [ -n "${STUB_RUNNERS:-}" ]; then
  setsid sleep 300 > /dev/null 2>&1 < /dev/null & echo $! > "$LOG_DIR/win-e2e-c.pid"   # VM c's driver
  # each part's log, written after what it started (a going part writes its console); another run's folder, not this
  # round's, with its own entries (its container, VM d)
  for part in $(cut -f2 "$folder/started.txt" | sort -u); do echo "the part's console" > "$folder/$part.log"; done
  mkdir -p "$STUB/runs/other-run"
  printf '%s\tlane1-web-full\tcontainer\tsomeone-elses-container\treal\tthe container of another run\n%s\tvm-d\tdomain\twin10-dev-d\treal\tthe VM of another run\n' \
    "$entry" "$entry" > "$STUB/runs/other-run/started.txt"
  echo "its console" > "$STUB/runs/other-run/lane1-web-full.log"; echo "its console" > "$STUB/runs/other-run/vm-d.log"
fi
echo started > "$STUB/orchestrator-ready"
sleep 120
EOF
cat > "$STUB/release-publish" <<'EOF'
#!/bin/bash
echo "PREREQUISITES OK"
EOF
cat > "$STUB/release-state" <<'EOF'
#!/bin/bash
echo "RELEASED current=16.6.1 docker=16.6.1 windows=16.6.1"
EOF
chmod +x "$STUB/bin/docker" "$STUB/bin/ssh"
export PATH="$STUB/bin:$PATH"
export LOG_DIR="$SCRATCH/logs"; mkdir -p "$LOG_DIR"
export RELEASE_REHEARSAL_CONF="$SCRATCH/no-settings.conf"
export ROUND_ORCHESTRATOR="bash $STUB/orchestrator" ROUND_RELEASE_STATE="bash $STUB/release-state"
export ROUND_RELEASE_PUBLISH="bash $STUB/release-publish" ROUND_SCHEDULED_E2E=true ROUND_POLL=1
# the VM's made-up address: dp-ci.sh win stop reaches only the stub ssh
export WIN_CI_CONF="$SCRATCH/no-win-ci.env" WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts"
# a start's machines check (asbl/ci/release-machines.sh check --press) on stand-ins: the host's memory, virsh (VM a running)
export RELEASE_MEMINFO="$SCRATCH/meminfo"; printf 'MemAvailable:   %s kB\n' $((64 * 1048576)) > "$RELEASE_MEMINFO"
cat > "$STUB/bin/virsh" <<'EOF'
#!/bin/bash
# stub virsh: a VM is running until it is shut down ($STUB/off-<domain>); shutdown and destroy recorded in $STUB/events
case "${1:-}" in
  domstate) [ -e "$STUB/off-$2" ] && echo "shut off" || echo running ;;
  shutdown|destroy) echo "virsh $1 $2" >> "$STUB/events"; touch "$STUB/off-$2" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$STUB/bin/virsh"
# VM b's settings file (its WIN_HOST; the rest from VM a's)
export WIN_VM_CONF_DIR="$SCRATCH/vm-conf"; mkdir -p "$WIN_VM_CONF_DIR"
echo "WIN_HOST=vm-b.invalid" > "$WIN_VM_CONF_DIR/win-ci-b.env"; chmod 600 "$WIN_VM_CONF_DIR/win-ci-b.env"
echo "WIN_HOST=vm-c.invalid" > "$WIN_VM_CONF_DIR/win-ci-c.env"; chmod 600 "$WIN_VM_CONF_DIR/win-ci-c.env"
unset SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS USE_N_NUMBER_OF_WINDOWS_VMS RELEASE_STEPS RELEASE_WINDOWS_VMS
unset RELEASE_VERSION RELEASE_PIN ON_FAILURES DRY_RUN E2E_APPROVAL

round() { bash "$ROUND_SCRIPT" "$@"; }
alive() { kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }   # alive <pid file>
# a round going, its stub orchestrator in its part; an older pid file with a live process (not this shell's child)
round_going() {
  round stop > /dev/null 2>&1
  rm -rf "$LOG_DIR"/* "$STUB"/runs/* "$STUB"/stopped "$STUB"/vm-stopped "$STUB"/containers "$STUB"/orchestrator-ready \
    "$STUB"/events "$STUB"/off-*
  [ -f "$STUB/older.pid" ] && kill -KILL "$(cat "$STUB/older.pid")" 2>/dev/null
  ( sleep 300 > /dev/null 2>&1 & echo $! > "$STUB/older.pid" ); touch -d '1 hour ago' "$STUB/older.pid"
  ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 ON_FAILURES=report-only round start > /dev/null
  for _ in $(seq 1 40); do [ -e "$STUB/orchestrator-ready" ] && return 0; sleep 0.25; done
  echo "      the stub orchestrator did not start: $(round status)"; return 1
}
containers_left() { cut -d'|' -f1 "$STUB/containers" | sort | paste -sd' '; }
lines() { sort "$1" 2>/dev/null | paste -sd' '; }   # lines <file>: its lines, sorted, on one line
kill_round_process() {  # as a reboot does to the round: its process group, gone at once
  kill -KILL -- "-$(sed -n 's/^driver_pid=//p' "$LOG_DIR"/release-rounds/*/round.state | tail -1)"; sleep 0.5
}

# ---- 1. stop while it runs ----
round_going
out=$(round stop); rc=$?
check "stop while running: exit 4, the round stopped" bash -c '[ "$1" = 4 ] && grep -q "^ROUND state=stopped " <<< "$2"' _ "$rc" "$out"
check "docker stop for the run's container, its compose stack's container and the app stack below it only" \
  same "app-stack-of-the-bundle-1 bundle-datapallas-1 dp-ci" "$(lines "$STUB/stopped")"
check "left: the ended part's, the older, the dry-run line's and someone else's containers" \
  same "dp-ci-one-command dry-run-container ended-part-container folder-with-a-longer-name-1 older-app-stack-1 someone-elses-bundle-1 someone-elses-container" "$(containers_left)"
check "the Windows driver of the pid file (its own session) ended" bash -c '! kill -0 "$(cat "$1")" 2>/dev/null' _ "$LOG_DIR/win-e2e.pid"
check "the process of a pid file older than its entry left running" alive "$STUB/older.pid"
check "the VM's steps of dp-ci.sh win docker-e2e stopped, in order" same "npmwc prepare docker-e2e" "$(paste -sd' ' "$STUB/vm-stopped" 2>/dev/null)"
check "the orchestrator (the round's process group) ended" bash -c '! kill -0 "$(cat "$1")" 2>/dev/null' _ "$STUB/orchestrator.pid"
check "stop says what it left and why" bash -c 'grep -q "^LEFT    container dp-ci-one-command: created before" <<< "$1" && grep -q "^LEFT    process .*older.pid: the file is older" <<< "$1"' _ "$out"
check "stop names each step it stopped on the VM" bash -c '[ "$(grep -c "^STOPPED the VM.s step" <<< "$1")" = 3 ]' _ "$out"

# ---- 1b. the call that runs stop is cut ----
round_going
round stop 2>/dev/null | head -1 > /dev/null
check "stop cut after one line of output: the VM's steps all stopped, in order" same "npmwc prepare docker-e2e" "$(paste -sd' ' "$STUB/vm-stopped" 2>/dev/null)"
check "stop cut after one line of output: the round stopped" bash -c 'grep -q "^ROUND state=stopped " <<< "$1"' _ "$(round status)"
check "a part does not keep the orchestrator's lock (9>&- on its call)" \
  grep -q '^    env RELEASE_PIN="$PIN" "$@" > "$PARTS/$id.log" 2>&1 < /dev/null 9>&-; rc=$?$' asbl/ci/jenkins/release-orchestrator.sh

# ---- 2. stop again ----
: > "$STUB/stopped"; : > "$STUB/vm-stopped"
out=$(round stop); rc=$?
check "stop again: exit 4, nothing more stopped" \
  bash -c '[ "$1" = 4 ] && grep -q "had ended already (stopped)" <<< "$2" && [ ! -s "$3" ] && [ ! -s "$4" ]' _ "$rc" "$out" "$STUB/stopped" "$STUB/vm-stopped"

# ---- 3. the round's process gone, another run holding the CI ----
round_going
kill_round_process   # the Windows driver, in its own session, lives on; dp-ci in the list stands for another run's now
out=$(round stop); rc=$?
check "process gone, another run holding the CI: exit 4, nothing touched" \
  bash -c '[ "$1" = 4 ] && grep -q "^LEFT    what this round.s runs started: its process was gone already, and the CI is busy now: a dp-ci run" <<< "$2" && [ ! -s "$3" ] && [ ! -s "$4" ]' \
  _ "$rc" "$out" "$STUB/stopped" "$STUB/vm-stopped"
check "process gone, another run holding the CI: the Windows driver left" alive "$LOG_DIR/win-e2e.pid"
kill -KILL "$(cat "$LOG_DIR/win-e2e.pid")" 2>/dev/null   # this test's own stand-in, left by the case above

# ---- 4. the round's process gone, the CI free ----
round_going
kill_round_process
kill -KILL "$(cat "$LOG_DIR/win-e2e.pid")"; sed -i '/^dp-ci|/d' "$STUB/containers"   # what a reboot ends on this host
out=$(round stop); rc=$?
check "process gone, the CI free: the VM's steps stopped (they outlive a reboot of this host)" \
  same "npmwc prepare docker-e2e" "$(paste -sd' ' "$STUB/vm-stopped" 2>/dev/null)"
check "process gone, the CI free: the run's compose container and app stack stopped, nothing else" same "app-stack-of-the-bundle-1 bundle-datapallas-1" "$(lines "$STUB/stopped")"
check "process gone, the CI free: exit 4, stopped" bash -c '[ "$1" = 4 ] && grep -q "^ROUND state=stopped " <<< "$2"' _ "$rc" "$out"

# ---- 5. the VMs a run started ----
export STUB_VMS=yes
round_going
out=$(round stop); rc=$?
unset STUB_VMS
check "VMs: exit 4, the round stopped" bash -c '[ "$1" = 4 ] && grep -q "^ROUND state=stopped " <<< "$2"' _ "$rc" "$out"
check "  VM a's steps on VM a's host, VM b's on VM b's, then VM b shut down; VM c (ended) left" same \
  "step npmwc on vm.invalid|step prepare on vm.invalid|step docker-e2e on vm.invalid|step npmwc on vm-b.invalid|step prepare on vm-b.invalid|step docker-e2e on vm-b.invalid|virsh shutdown win10-dev-b" \
  "$(paste -sd'|' "$STUB/events" 2>/dev/null)"
check "  stop says it shut VM b down" bash -c 'grep -q "^STOPPED VM b (win10-dev-b): shut down (virsh shutdown)" <<< "$1"' _ "$out"

# ---- 6. a crash: the round's process gone, runner 2 and VM c it started still going ----
export STUB_RUNNERS=yes
round_going
unset STUB_RUNNERS
kill_round_process   # the runner and the drivers of VMs a and c (their own sessions) live on
busy=$(round busy); brc=$?
out=$(round stop); rc=$?
check "a crash: what the round left makes the CI look busy (a runner)" bash -c '[ "$1" = 2 ] && grep -q "^BUSY a runner is going (dp-ci-runner-2" <<< "$2"' _ "$brc" "$busy"
check "  stop: exit 4, stopped, nothing left as another run's" \
  bash -c '[ "$1" = 4 ] && grep -q "^ROUND state=stopped " <<< "$2" && ! grep -q "^LEFT    what this round" <<< "$2"' _ "$rc" "$out"
check "  runner 2 removed (docker stop: a runner is --rm); the ended part's and another run's containers left" \
  bash -c '[ "$(sort "$1" | paste -sd" ")" = dp-ci-runner-2 ] && grep -q "^someone-elses-container|" "$2" && grep -q "^bundle-datapallas-1|" "$2"' \
  _ "$STUB/stopped" "$STUB/containers"
check "  the drivers of VMs a and c ended" bash -c '! kill -0 "$(cat "$1")" 2>/dev/null && ! kill -0 "$(cat "$2")" 2>/dev/null' \
  _ "$LOG_DIR/win-e2e.pid" "$LOG_DIR/win-e2e-c.pid"
check "  VM a's steps, VM c's steps, then VM c shut down; win10-dev (running before) and another run's VM d left" same \
  "step npmwc on vm.invalid|step prepare on vm.invalid|step docker-e2e on vm.invalid|step npmwc on vm-c.invalid|step prepare on vm-c.invalid|step release-pack on vm-c.invalid|step server-e2e on vm-c.invalid|step dp-server on vm-c.invalid|step e2e on vm-c.invalid|step release-robot on vm-c.invalid|virsh shutdown win10-dev-c" \
  "$(paste -sd'|' "$STUB/events" 2>/dev/null)"
: > "$STUB/stopped"; : > "$STUB/events"; : > "$STUB/vm-stopped"
out=$(round stop); rc=$?
check "  a second stop (as after a person's): nothing to stop, nothing touched" \
  bash -c '[ "$1" = 4 ] && grep -q "nothing to stop" <<< "$2" && [ ! -s "$3" ] && [ ! -s "$4" ]' _ "$rc" "$out" "$STUB/stopped" "$STUB/events"

# ---- 7. a press after a dead round: its leftovers first, then the new round ----
export STUB_RUNNERS=yes
round_going
unset STUB_RUNNERS
kill_round_process
dead=$(ls -1d "$LOG_DIR"/release-rounds/*/ | tail -1)
rm -f "$STUB/orchestrator-ready"; sleep 1   # the new round's folder name differs from the dead one's (one per second)
out=$(ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 ON_FAILURES=report-only round start); rc=$?
check "a press after a dead round: its leftovers stopped first, then the round started (exit 5)" bash -c \
  '[ "$1" = 5 ] && a=$(grep -n "^the newest round.s process is gone" <<< "$2" | cut -d: -f1) && b=$(grep -n "^STOPPED VM c (win10-dev-c)" <<< "$2" | cut -d: -f1) &&
   c=$(grep -n "^STARTED the release round" <<< "$2" | cut -d: -f1) && [ "$a" -lt "$b" ] && [ "$b" -lt "$c" ]' _ "$rc" "$out"
check "  the dead round: runner 2 removed, VM c shut down, its state stopped" bash -c \
  'grep -qx dp-ci-runner-2 "$1" && grep -qx "virsh shutdown win10-dev-c" "$2" && grep -q "^state=stopped$" "$3/round.state"' \
  _ "$STUB/stopped" "$STUB/events" "$dead"

# ---- 8. a press while a round lives ----
for _ in $(seq 1 40); do [ -e "$STUB/orchestrator-ready" ] && break; sleep 0.25; done
: > "$STUB/stopped"; : > "$STUB/events"
out=$(ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 ON_FAILURES=report-only round start); rc=$?
check "a press while a round lives: refused (exit 2, the CI busy), nothing stopped, the round still running" bash -c \
  '[ "$1" = 2 ] && grep -q "^REFUSED: the CI is busy: " <<< "$2" && ! grep -q "process is gone" <<< "$2" && [ ! -s "$3" ] && [ ! -s "$4" ] &&
   bash "$5" status | grep -q "^ROUND state=running "' _ "$rc" "$out" "$STUB/stopped" "$STUB/events" "$ROUND_SCRIPT"

# ---- 9. the job: a round that ends stopped ----
stopped_branch=$(sed -n "/stage('Follow the round')/,/^  post {/p" asbl/ci/jenkins/dp-ci-release-steps-0-3-rehearsal.Jenkinsfile |
  sed -n "/state == 'stopped'/,/error(/p")
check "the job: a round that ends stopped gets release-rehearsal.sh stop, then the build ends red" bash -c \
  'grep -q "bash asbl/ci/jenkins/release-rehearsal.sh stop" <<< "$1" && grep -q "error(" <<< "$1"' _ "$stopped_branch"

# ---- 10. a dry round's stop names what it would stop, the runners among them ----
round stop > /dev/null 2>&1
rm -rf "$LOG_DIR"/* "$STUB"/runs/* "$STUB"/stopped "$STUB"/vm-stopped "$STUB"/containers "$STUB"/orchestrator-ready "$STUB"/events
sleep 1   # a new round folder (one per second)
STUB_DRY=1 DRY_RUN=yes ROUND_STARTED_BY=tester RELEASE_VERSION=16.6.2 ON_FAILURES=report-only round start > /dev/null
for _ in $(seq 1 40); do [ -e "$STUB/orchestrator-ready" ] && break; sleep 0.25; done
out=$(DRY_RUN=yes round stop); rc=$?
check "a dry round's stop: exit 4, it names the runners and each other thing once (WOULD), stops nothing" bash -c \
  '[ "$1" = 4 ] && grep -q "^DRY RUN: the round started nothing" <<< "$2" &&
   grep -qx "WOULD stop container dp-ci-runner-1 (lane1-docker-server-full): runner 1 (Docker in Docker): its engine and everything it runs" <<< "$2" &&
   grep -qx "WOULD stop container dp-ci-runner-2 (lane1-docker-server-full): runner 2 (Docker in Docker): its engine and everything it runs" <<< "$2" &&
   [ "$(grep -c "^WOULD stop container dp-ci " <<< "$2")" = 1 ] && grep -q "^WOULD stop pidfile .*/win-e2e.pid (windows-pack)" <<< "$2" &&
   ! grep -q "^STOPPED" <<< "$2" && [ ! -s "$3" ] && [ ! -s "$4" ]' _ "$rc" "$out" "$STUB/stopped" "$STUB/vm-stopped"

echo
if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-release-stop"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-release-stop"; exit 1

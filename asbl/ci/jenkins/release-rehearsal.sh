#!/bin/bash
# The release round: one press takes a version to "ready to upload". release-orchestrator.sh runs the steps (step 0, step 1's
# lanes, steps 2 and 3 on one commit); a red run leads to a fix round by rule, then the round runs again from scratch,
# step 1 included (every lane, whatever the release record says; RELEASE_STEPS=in-order: 16.6.2's, green lanes kept).
# Called by the Jenkins job dp-ci-release-steps-0-3-rehearsal; a person or an AI coordinator runs the same from a shell, the
# job's parameters being environment variables with the same names and defaults.
#
# SUBCOMMANDS
#   start      the checks, then the round starts detached and this returns (exit 5, running). Refused, nothing started
#              (exit 2): the CI is busy (see busy), the version is public on both channels already, or a prerequisite is
#              missing (an input, the settings file, the Docker engine or the Windows VM: release-publish.sh preflight
#              docker, UPLOAD=no). A scheduled run going (dp-ci-dev-scheduled-e2e) is stopped first: a release goes before it.
#              So is a dead newest round (its process gone while its state says running, fixing or waiting: a crash):
#              what it started is stopped first (stop), then the CI is asked.
#   status     one line:  ROUND state=<state> version=<v> run=<n> pin=<commit> result=<the newest run's result.txt>
#   follow [--from <byte>] [--for <seconds>]   the round's console (round.log) from that byte; without --for, until the round
#              is no longer running or fixing; with it, at most that long (the job's polls of under a minute). The last line
#              is  FOLLOW next=<byte to go on from> state=<state>
#   proceed    a round waiting for review runs again from scratch, step 1 included (PROCEED_BY=<who> says who)
#   stop       the round stops, in this order: its process group (the round, its run, the run's parts); then what the
#              run started that outlives that group, from its started.txt: each entry of a part that had not ended, a
#              container or compose stack created since its entry (docker stop), the Windows driver of a pid file written
#              since (its process group), the VM's steps of that command (dp-ci.sh win stop, on that VM), and last a
#              Windows VM the run started (virsh shutdown, then virsh destroy after VM_SHUTDOWN_WAIT_SECS [600]); then
#              its fix run (the fixer's stop). Nothing the round did not start: an ended part's entries, older containers or pid files, and,
#              when the round's process was gone already (a reboot) and another run holds the CI now, none at all. What makes
#              the CI busy only through the round's own entries (a runner, a VM's driver, a CI container, each made after
#              its entry and before its part's log was last written) is the round's, not another run. A dry round started
#              nothing: its stop names what its runs' started.txt names (its dry-run lines: the runners dp-ci-runner-<n>,
#              the CI and compose containers, the drivers' pid files, the VMs), one "WOULD stop" line each. Exit 4
#   busy       is the CI busy, the question start asks (and the scheduled job): FREE (exit 0), or BUSY <why> (exit 2);
#              a runner there (dp-ci-runner-<n>) is a run going
#   label      the build's label for the job's build list, one line: "16.6.2 run 1 going", "16.6.2 waiting for review after
#              run 1", "16.6.2 green, 1 run, ready to upload", "16.6.2 red after run 2", ... Exit 0
#   review     what a round waiting for review shows (the job's pause): why, the fix plan with its status line, its report,
#              the red run's result.txt, the commits since the run's pin (origin/main fetched first). Exit 3; not waiting:
#              NOT WAITING FOR REVIEW, the status line, the state's exit code
#   reports    the report files of each ended run of the round, as its result.txt lists them:  REPORT <run n> <part> <path>
#              a line (the result, summary, flaky tests and failure reports under the part "run"). The job pulls them
#   estimate   the 16 Advanced (Parallelization) choices estimated from the last release runs' marks (asbl/ci/release-
#              estimate.py, through release-machines.sh) and written as JSON to RELEASE_ESTIMATES_FILE, where the job's
#              form reads them (its block under the two choices, asbl/ci/jenkins/release-estimate-block.groovy); one line
#              per choice printed. A round does it after each real run; by hand after a change to the settings file. Exit 0
#   estimate <N> <M>   the block the form draws for that choice, in a terminal: what the press refuses, the memory it
#              needs against the host's available memory now (RELEASE_MEMINFO [/proc/meminfo]), the Gantt chart of the
#              round's parts, the total and the gain against 1 and 1. Estimated afresh; RELEASE_ESTIMATES_FROM=<a JSON
#              estimate wrote> draws from that one instead (what the form shows). The job's build prints it first. Exit 0
#   help       this header
#
# THE PARAMETERS, in the groups the job's form shows:
#   Always
#     RELEASE_VERSION [empty]  the new version x.y.z: step 0 sets it, then step 1, then steps 2 and 3, in run 1. Empty only to
#                              rehearse the current version again, with no step 0
#   Sometimes
#     ON_FAILURES [fix-prove-then-wait-for-review]   what a red run leads to:
#       fix-prove-then-wait-for-review      a fix round (the fixer: every failure's root cause from the code and the git
#                                           history, real fixes, each proven by re-running only what failed), then the
#                                           round waits for proceed; proceed = run again from scratch, step 1 included
#       fix-prove-then-rerun-automatically  the same fix round, then the round runs again by itself; after 2 such re-runs
#                                           it waits for proceed
#       report-only                         the round ends red with the failure report; no agent
#       A fix round that ends BLOCKED, or is stopped, always waits. With no fixer set (RELEASE_FIXER), fix-* is report-only,
#       and the round says so
#   Rarely: leave them as they are
#     RELEASE_PIN [empty]      run 1 on that commit instead of step 0's (or origin/main's); a run after fixes is always on
#                              origin/main, which holds the fixes
#     DRY_RUN [no]             yes: each run is the orchestrator's dry run (DRY_RUN_RED from the settings file), the fixer
#                              and the preflights get DRY_RUN=yes: nothing runs, builds, records or uploads
#     E2E_APPROVAL [empty]     the owner's written decision to go on without step 1's lanes, passed to every run of the round
#                              (with E2E_APPROVAL_USER); held by the round's process only, never written in a file
#   Advanced (Parallelization): 1 to 4 each; the machines they use come from the settings file (below)
#     SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS [1]   step 1's full set in that many runners at once, each a
#                                                             Docker engine of its own on this host with its list of
#                                                             asbl/ci/full-set-runners.txt (1: the whole full set in
#                                                             one runner), all started when the build ends, each capped
#                                                             at RELEASE_RUNNER_LIMIT_GB [10] of memory; this host's
#                                                             engine meanwhile runs the auth file, then the Linux proof.
#                                                             RELEASE_RUNNERS=no in the settings file: the full set whole
#                                                             on this host's engine, as before the runners; N must be 1
#     USE_N_NUMBER_OF_WINDOWS_VMS [1]                         the Windows lanes over that many VMs, each running the
#                                                             lanes of the layout for that many VMs
#     What a choice gives, before the press: the job's block under the two choices, or estimate <N> <M> (above).
#     Checked before anything starts (asbl/ci/release-machines.sh check <N> <M>): the machines file's rules, enough VMs
#     named, the layout's rules; a real round also what the host must have now (check <N> <M> --press): each added VM's
#     settings file, each VM in libvirt, the memory rule with the host's available memory (N + 1 host test servers: each
#     runner and this host's engine, and each VM to start), /var's free disk after what the runners take there (their
#     image volumes and checkouts). Refused: exit 2, one REFUSED line per broken rule, with its numbers
#   Not parameters: ROUND_STARTED_BY, who starts it (required; the job reads it from the build's cause); MODE and UPLOAD
#   (always a rehearsal with no upload); the retries (always 1); the test switches.
#
# THE STATES, and the exit code of every subcommand:
#   0  green              every part passed and both UPLOAD=yes preflights are OK: ready to upload (a separate press); it
#      released           stays green until release-state.sh released shows the version on both channels: then released
#   1  red                a run is red and the round ended (report-only, or no fixer): the failures are in its result.txt
#   2  refused, none      a start refused, nothing started; or no round yet
#   3  waiting-for-review a fix round ended (DONE, BLOCKED or stopped), or 2 automatic re-runs were made: proceed or stop
#   4  stopped            stopped by stop, or the round's process is gone (a reboot)
#   5  running, fixing    run <n> is going, or fix round <n>
#   6  green-not-ready    every part passed, but an UPLOAD=yes preflight said MISSING: not ready to upload until provided
#   A round is going, and the CI busy, while it is running, fixing or waiting, and while it is green until released.
#
# THE SETTINGS FILE  RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf]: this host's, not in the repo, root's (the user
#   running this), mode 600 or 400, read as shell: RELEASE_FIXER="<command>" (the fix round's agent: below) and
#   DRY_RUN_RED="<parts>" (a dry round only: the orchestrator's parts that come out red, to try the red paths). Missing = no
#   fixer, no red parts. The machines of a round are there too: RELEASE_STEPS, RELEASE_SERVER_GB, RELEASE_WINDOWS_VMS,
#   WIN_VM_MEMORY_GB, RELEASE_MIN_FREE_GB, VM_LANES_<M>_<name>, RELEASE_ESTIMATES_FILE (each explained, with its
#   default, in asbl/ci/release-layout.example.conf; read by asbl/ci/release-machines.sh).
# THE FIXER (RELEASE_FIXER, outside the public repo: devops-gitops bkend-infra/scripts/jenkins/release-fixer.sh)
#   <fixer> start <run folder> <fix round n>   prints FIX_RUN=<name> and FIX_PLAN=<the fix round's plan>
#   <fixer> status <name>                      prints FIX_STATUS=RUNNING|DONE|BLOCKED|STOPPED <the plan's status line>
#   <fixer> stop <name>
#   Each gets DRY_RUN (yes in a dry round: it starts no agent).
#   Smaller values for the run after fixes, only when the fix round cannot fix a speedup's root cause within the round
#   (it says so in its report): it writes <the red run's folder>/smaller-values, lines
#   SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=<n>, USE_N_NUMBER_OF_WINDOWS_VMS=<m>, RELEASE_STEPS=in-order (the
#   off switch: both values 1) and WHY=<one line>, any of them. Before its next run the round takes only values smaller
#   than its own (a larger or unknown one is said and left out), says so in round.log (SMALLER VALUES) and round.state
#   (jobs, vms), and keeps them for its later runs.
# THE ROUND FOLDER  <LOG_DIR>/release-rounds/<UTC>-release-<version or "current">/
#   round.state  key=value: state, why, version, on_failures, jobs, vms (the Advanced values: THE FIXER's smaller values
#                once a fix round chose them), pin, run, run_<n> (each
#                run's folder), result, fix_round,
#                fix_run, fix_plan, automatic_reruns, dry_run, approval (given|none), started_by, started, updated, driver_pid
#   round.log    the console: the round's lines (ROUND ...) and each run's orchestrator console
#   proceed      written by proceed, taken by the waiting round
# IS THE CI BUSY: runs, never process names (the dev servers' permanent dp-ci.sh --inside is no run): a dp-ci container
#   (dp-ci.sh's one-run interlock), a live win-e2e pid file of any VM (a Windows run, asbl/ci/win-vm.sh),
#   <LOG_DIR>/release-orchestrator.lock held,
#   <LOG_DIR>/release-rehearsal.lock held (a round's process), the newest round fixing with its fix run going, or green and
#   not yet released (a dry round's green holds nothing: it uploads nothing).
#
# EXAMPLES
#   ROUND_STARTED_BY=<name> RELEASE_VERSION=16.6.2 bash asbl/ci/jenkins/release-rehearsal.sh start
#   bash asbl/ci/jenkins/release-rehearsal.sh follow                  # to the end of the run or fix round going
#   bash asbl/ci/jenkins/release-rehearsal.sh status
#   PROCEED_BY=<name> bash asbl/ci/jenkins/release-rehearsal.sh proceed
#   ROUND_STARTED_BY=<name> DRY_RUN=yes ON_FAILURES=report-only bash asbl/ci/jenkins/release-rehearsal.sh start
#
# Callers: the Jenkins job dp-ci-release-steps-0-3-rehearsal; a person or an AI coordinator, from a shell on this host.
# For the tests (asbl/ci/tests/test-release-rehearsal.sh): ROUND_ORCHESTRATOR, ROUND_RELEASE_STATE, ROUND_RELEASE_PUBLISH,
# ROUND_SCHEDULED_E2E and ROUND_ESTIMATE replace the commands it calls; ROUND_POLL [30] is the seconds between two looks of a
# waiting round.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
ROUNDS_DIR="$LOG_DIR/release-rounds"
ROUND_LOCK="$LOG_DIR/release-rehearsal.lock"
RELEASE_REHEARSAL_CONF="${RELEASE_REHEARSAL_CONF:-/root/release-rehearsal.conf}"
ROUND_ORCHESTRATOR="${ROUND_ORCHESTRATOR:-bash asbl/ci/jenkins/release-orchestrator.sh}"
ROUND_RELEASE_STATE="${ROUND_RELEASE_STATE:-bash asbl/ci/release-state.sh}"
ROUND_RELEASE_PUBLISH="${ROUND_RELEASE_PUBLISH:-bash asbl/ci/release-publish.sh}"
ROUND_SCHEDULED_E2E="${ROUND_SCHEDULED_E2E:-bash asbl/ci/jenkins/scheduled-e2e.sh}"
ROUND_ESTIMATE="${ROUND_ESTIMATE:-bash asbl/ci/jenkins/release-rehearsal.sh estimate}"
SCHEDULED_E2E_PID="$LOG_DIR/scheduled-e2e.pid"   # the scheduled job's run, while it lasts (asbl/ci/jenkins/scheduled-e2e.sh)
ROUND_POLL="${ROUND_POLL:-30}"
FULL_SET_JOBS="${SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS:-1}"   # Advanced (Parallelization), see THE PARAMETERS
WINDOWS_VMS_USED="${USE_N_NUMBER_OF_WINDOWS_VMS:-1}"
. asbl/ci/release-machines.sh
. asbl/ci/win-vm.sh
MAX_AUTOMATIC_RERUNS=2   # owner, 2026-10-30: at most two re-runs without a review
UNREADABLE_FIX_STATUS_LIMIT=20   # that many looks in a row with no FIX_STATUS line: the fix round is BLOCKED, it waits for a person
SETTINGS_XML=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml   # the version, as release-state.sh reads it

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
say() { echo "ROUND   $(now) $*"; }

# ---- the round folder ----
newest_round() { ls -1d "$ROUNDS_DIR"/*/ 2>/dev/null | sort | tail -1 | sed 's#/$##'; }
state_get() { sed -n "s/^$2=//p" "$1/round.state" 2>/dev/null | tail -1; }
# state_set <round folder> <key=value>...: those keys rewritten in one move (a reader never sees half a file)
state_set() {
  local dir="$1" tmp keys; shift
  keys=$(printf '%s\n' "$@" updated= | sed 's/=.*//' | paste -sd'|')
  tmp=$(mktemp "$dir/.round.state.XXXXXX") || return 1
  { grep -v -E "^($keys)=" "$dir/round.state" 2>/dev/null; printf '%s\n' "$@" | tr -d '\r'; echo "updated=$(now)"; } > "$tmp" &&
    mv -f "$tmp" "$dir/round.state"
}
is_round_process_alive() {  # the round's process holds the round lock while it lives
  [ -e "$ROUND_LOCK" ] || return 1
  ! flock -n "$ROUND_LOCK" true 2>/dev/null
}
# both_channels_released <version>: release-state.sh released shows it on the Docker and the Windows channel
both_channels_released() {
  local line
  [ -n "$1" ] || return 1
  line=$($ROUND_RELEASE_STATE released 2>/dev/null | grep '^RELEASED ') || return 1
  case " $line " in *" docker=$1 "*) ;; *) return 1 ;; esac
  case " $line " in *" windows=$1 "*) return 0 ;; *) return 1 ;; esac
}
# round_state <round folder>: the state status says: the file's, except a going round whose process is gone (stopped) and a
# green round whose version is public on both channels now (released)
round_state() {
  local dir="$1" state
  state=$(state_get "$dir" state)
  case "$state" in
    running|fixing|waiting-for-review) is_round_process_alive || state=stopped ;;
    green|green-not-ready) ! both_channels_released "$(state_get "$dir" version)" || state=released ;;
  esac
  echo "${state:-none}"
}
exit_code_of_state() {
  case "$1" in
    green|released) echo 0 ;; red) echo 1 ;; waiting-for-review) echo 3 ;; stopped) echo 4 ;;
    running|fixing) echo 5 ;; green-not-ready) echo 6 ;; *) echo 2 ;;
  esac
}
status_line() {  # status_line <round folder or empty> [<state>]
  local dir="$1" state="${2:-}"
  if [ -z "$dir" ]; then echo "ROUND state=none version= run=0 pin= result="; return; fi
  [ -n "$state" ] || state=$(round_state "$dir")
  echo "ROUND state=$state version=$(state_get "$dir" version) run=$(state_get "$dir" run) pin=$(state_get "$dir" pin) result=$(state_get "$dir" result)"
}

# ---- is the CI busy ----
# busy_reason [<round folder>]: why the CI is busy, or nothing. Runs only: their lock and pid files, the runners and the
# newest round's state. With a round folder, what that round left itself (own_leftovers) does not count
busy_reason() {
  local pid dir state pidfile runner own=""
  [ -z "${1:-}" ] || own=$'\n'"$(own_leftovers "$1")"$'\n'
  if docker ps -a --filter 'name=^dp-ci$' --format '{{.Names}}' 2>/dev/null | grep -q . && [[ "$own" != *$'\n'"container dp-ci"$'\n'* ]]; then
    echo "a dp-ci run is going (its container dp-ci: docker logs -f dp-ci)"; return; fi
  for runner in $(docker ps -a --filter 'name=^dp-ci-runner-[0-9]+$' --format '{{.Names}}' 2>/dev/null); do
    [[ "$own" == *$'\n'"container $runner"$'\n'* ]] || { echo "a runner is going ($runner: bash asbl/ci/e2e-runners.sh status)"; return; }
  done
  for pidfile in $(win_vm_pidfiles); do
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [[ "$own" != *$'\n'"pidfile $pidfile"$'\n'* ]]; then
      echo "a Windows run is going (pid $pid in $pidfile)"; return; fi
  done
  if [ -e "$LOG_DIR/release-orchestrator.lock" ] && ! flock -n "$LOG_DIR/release-orchestrator.lock" true 2>/dev/null; then
    echo "a release orchestrator run is going ($LOG_DIR/release-orchestrator.lock)"; return; fi
  dir=$(newest_round)
  if is_round_process_alive; then echo "a release round is going: $(status_line "$dir")"; return; fi
  [ -n "$dir" ] || return 0
  state=$(round_state "$dir")
  case "$state" in   # a dry round uploads nothing, so its green waits for no upload
    green|green-not-ready) [ "$(state_get "$dir" dry_run)" = yes ] ||
      { echo "a green round waits for its upload: $(status_line "$dir" "$state")"; return; } ;;
  esac
  if [ "$(state_get "$dir" state)" = fixing ] && [ -n "$(state_get "$dir" fix_run)" ] &&
     [ "$(fixer_status "$(state_get "$dir" fix_run)" | cut -d' ' -f1)" = RUNNING ]; then
    echo "a fix run is going: $(state_get "$dir" fix_run) ($(state_get "$dir" fix_plan))"; return
  fi
}

# ---- the settings and the fixer ----
RELEASE_FIXER=""; SETTINGS_DRY_RUN_RED=""
read_settings() {  # RELEASE_FIXER and SETTINGS_DRY_RUN_RED from the settings file; returns 2 (a MISSING line) when others may read it
  [ -e "$RELEASE_REHEARSAL_CONF" ] || return 0
  if [ "$(stat -c %u "$RELEASE_REHEARSAL_CONF")" != "$(id -u)" ] || ! case "$(stat -c %a "$RELEASE_REHEARSAL_CONF")" in 600|400) true ;; *) false ;; esac; then
    echo "MISSING a settings file only its owner reads: chown $(id -un) $RELEASE_REHEARSAL_CONF; chmod 600 $RELEASE_REHEARSAL_CONF (it names commands this host runs)"
    return 2
  fi
  RELEASE_FIXER=$(. "$RELEASE_REHEARSAL_CONF" >/dev/null 2>&1; printf '%s' "${RELEASE_FIXER:-}")
  SETTINGS_DRY_RUN_RED=$(. "$RELEASE_REHEARSAL_CONF" >/dev/null 2>&1; printf '%s' "${DRY_RUN_RED:-}")
}
# fixer_status <fix run>: RUNNING|DONE|BLOCKED|STOPPED followed by the plan's status line, or UNKNOWN <what it said>
fixer_status() {
  local out
  [ -n "$RELEASE_FIXER" ] || read_settings >/dev/null
  [ -n "$RELEASE_FIXER" ] || { echo "UNKNOWN no fixer set"; return; }
  out=$(DRY_RUN="$ROUND_DRY_RUN" $RELEASE_FIXER status "$1" 2>&1 9>&-)
  printf '%s\n' "$out" | sed -n 's/^FIX_STATUS=//p' | tail -1 | grep . || echo "UNKNOWN $(printf '%s' "$out" | tail -1)"
}

# ---- the round's process ----
# run_once <round folder> <n>: run <n> of the round, the orchestrator in the foreground; sets RUN_FOLDER and RUN_RESULT
run_once() {
  local dir="$1" n="$2" execution=1 version="$RELEASE_VERSION" pin="$RELEASE_PIN" offset rc result_file
  [ "$n" = 1 ] || { execution=2; version=""; pin=""; }
  state_set "$dir" state=running run="$n" why=
  say "RUN $n START: EXECUTION=$execution${version:+ RELEASE_VERSION=$version}${pin:+ RELEASE_PIN=$pin} DRY_RUN=$ROUND_DRY_RUN$([ -n "$E2E_APPROVAL" ] && echo ' E2E_APPROVAL=(given)')"
  offset=$(stat -c %s "$dir/round.log")
  # exported, never on a command line: ps shows a command line to every user, and E2E_APPROVAL is the owner's text
  (
    export ORCH_STARTED_BY="release round $(basename "$dir"), started by $ROUND_STARTED_BY" EXECUTION="$execution" \
      RELEASE_VERSION="$version" RELEASE_PIN="$pin" MODE=rehearsal UPLOAD=no DRY_RUN="$ROUND_DRY_RUN" \
      SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS="$FULL_SET_JOBS" USE_N_NUMBER_OF_WINDOWS_VMS="$WINDOWS_VMS_USED" \
      DRY_RUN_RED="$([ "$ROUND_DRY_RUN" = yes ] && printf '%s' "$SETTINGS_DRY_RUN_RED")" E2E_APPROVAL="$E2E_APPROVAL" \
      E2E_APPROVAL_USER="$([ -n "$E2E_APPROVAL" ] && printf '%s' "${E2E_APPROVAL_USER:-$ROUND_STARTED_BY}")"
    exec $ROUND_ORCHESTRATOR < /dev/null 9>&-
  )
  rc=$?
  # this run's folder: the orchestrator's PARTS line, read from where this run began in the console
  RUN_FOLDER=$(tail -c +"$((offset + 1))" "$dir/round.log" | sed -n 's/^PARTS   one log per part in //p' | tail -1)
  result_file="${RUN_FOLDER:+$RUN_FOLDER/result.txt}"
  RUN_RESULT=$(sed -n 's/^result=//p' "$result_file" 2>/dev/null | tail -1)
  if [ -z "$RUN_RESULT" ]; then
    RUN_RESULT=red
    state_set "$dir" why="run $n left no result.txt (the orchestrator ended with exit $rc: round.log says why)"
  fi
  state_set "$dir" "run_$n=$RUN_FOLDER" result="$result_file" \
    pin="$(sed -n 's/^pin=//p' "$result_file" 2>/dev/null | tail -1)" \
    version="$(v=$(sed -n 's/^version=//p' "$result_file" 2>/dev/null | tail -1); printf '%s' "${v:-$(state_get "$dir" version)}")"
  say "RUN $n END: $RUN_RESULT (exit $rc)${result_file:+, $result_file}"
}
# ready_to_upload <round folder>: a green run's last check, both UPLOAD=yes preflights (names only); state green or green-not-ready
ready_to_upload() {
  local dir="$1" out rc_docker rc_files missing flaky
  say "GREEN: every part passed. The upload preflights (UPLOAD=yes, every credential checked, names only):"
  out=$(UPLOAD=yes DRY_RUN="$ROUND_DRY_RUN" $ROUND_RELEASE_PUBLISH preflight docker public 2>&1 9>&-); rc_docker=$?
  printf '%s\n' "$out"; missing=$(printf '%s\n' "$out" | sed -n 's/^MISSING //p')
  out=$(UPLOAD=yes DRY_RUN="$ROUND_DRY_RUN" $ROUND_RELEASE_PUBLISH preflight files public 2>&1 9>&-); rc_files=$?
  printf '%s\n' "$out"; missing=$(printf '%s\n%s\n' "$missing" "$(printf '%s\n' "$out" | sed -n 's/^MISSING //p')" | grep . | paste -sd';')
  flaky=$(sed -n 's/^flaky=//p' "$(state_get "$dir" result)" 2>/dev/null)
  if [ -n "$flaky" ] && [ -s "$flaky" ]; then
    say "FLAKY: $(grep -c . "$flaky") test(s) passed only on a retry, to fix after the upload ($flaky):"
    awk -F'\t' '{ printf "  %-22s %s  (%s)\n", $1, $2, $3 }' "$flaky"
  fi
  if [ "$rc_docker" = 0 ] && [ "$rc_files" = 0 ] && [ -z "$missing" ]; then
    state_set "$dir" state=green why="ready to upload"
    say "READY TO UPLOAD $(state_get "$dir" version) on $(state_get "$dir" pin | cut -c1-8). The next presses, each a separate one:"
    say "  dp-ci-release-step2-release-docker and dp-ci-release-step3-release-windows-vm with MODE=upload UPLOAD=yes (the kept files),"
    say "  then each with MODE=public, then dp-ci-release-step4-demo-public"
    return 0
  fi
  state_set "$dir" state=green-not-ready why="not ready to upload: ${missing:-a preflight failed (above)}"
  say "GREEN, NOT READY TO UPLOAD: ${missing:-a preflight failed (above)}. Provide it, then run the preflights again (release-publish.sh preflight)"
  return 6
}
# fix_round <round folder> <n> <run folder>: the fixer's round, until it ends; sets FIX_END (DONE, BLOCKED or STOPPED)
fix_round() {
  local dir="$1" n="$2" folder="$3" out name plan status unreadable
  state_set "$dir" state=fixing fix_round="$n" fix_run= fix_plan= why=
  say "FIX ROUND $n START: $RELEASE_FIXER start $folder $n"
  out=$(DRY_RUN="$ROUND_DRY_RUN" $RELEASE_FIXER start "$folder" "$n" 2>&1 9>&-); printf '%s\n' "$out"
  name=$(printf '%s\n' "$out" | sed -n 's/^FIX_RUN=//p' | tail -1)
  plan=$(printf '%s\n' "$out" | sed -n 's/^FIX_PLAN=//p' | tail -1)
  if [ -z "$name" ]; then
    FIX_END=BLOCKED; state_set "$dir" why="fix round $n could not start (the fixer's output above)"
    say "FIX ROUND $n BLOCKED: the fixer did not start it"; return
  fi
  state_set "$dir" fix_run="$name" fix_plan="$plan"
  unreadable=0
  while :; do
    status=$(fixer_status "$name")
    case "${status%% *}" in
      DONE|BLOCKED|STOPPED) break ;;
      UNKNOWN) unreadable=$((unreadable + 1))
               [ "$unreadable" -lt "$UNREADABLE_FIX_STATUS_LIMIT" ] || { status="BLOCKED the fixer's status could not be read $unreadable times in a row: ${status#* }"; break; } ;;
      *) unreadable=0 ;;
    esac
    sleep "$ROUND_POLL"
  done
  FIX_END="${status%% *}"
  state_set "$dir" why="fix round $n $FIX_END: ${status#* }"
  say "FIX ROUND $n END: $status"
}
# wait_for_review <round folder> <why>: until proceed
wait_for_review() {
  local dir="$1" pin plan
  state_set "$dir" state=waiting-for-review why="$2"
  pin=$(state_get "$dir" pin); plan=$(state_get "$dir" fix_plan)
  say "WAITING FOR REVIEW: $2"
  [ -z "$plan" ] || say "  the fix plan: $plan; its report: ${plan%.md}-run-report.md"
  [ -z "$pin" ] || { say "  the commits since the run's pin ${pin:0:8} (origin/main as last fetched):"; git log --oneline "$pin..origin/main" 2>/dev/null | head -40 | sed 's/^/    /'; }
  say "  proceed: run again from scratch, step 1 included (release-rehearsal.sh proceed); stop: end the round (release-rehearsal.sh stop)"
  rm -f "$dir/proceed"
  until [ -e "$dir/proceed" ]; do sleep "$ROUND_POLL"; done
  say "PROCEED by $(cat "$dir/proceed" 2>/dev/null): the round runs again from scratch, step 1 included"
  rm -f "$dir/proceed"
}
# smaller_values <round folder> <the red run's folder> <the next run's n>: before a run after fixes, the values its fix
# round chose for it (THE FIXER, smaller values), from <the red run's folder>/smaller-values; only smaller ones are taken
smaller_values() {
  local dir="$1" file="$2/smaller-values" n m steps why took=""
  [ -n "$2" ] && [ -f "$file" ] || return 0
  n=$(sed -n 's/^SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=//p' "$file" | tail -1 | tr -d '\r')
  m=$(sed -n 's/^USE_N_NUMBER_OF_WINDOWS_VMS=//p' "$file" | tail -1 | tr -d '\r')
  steps=$(sed -n 's/^RELEASE_STEPS=//p' "$file" | tail -1 | tr -d '\r')
  why=$(sed -n 's/^WHY=//p' "$file" | tail -1 | tr -d '\r')
  case "$steps" in
    "") ;;
    in-order) n=1; m=1; export RELEASE_STEPS=in-order; took="RELEASE_STEPS=in-order " ;;   # the orchestrator's machines file gives way to it
    *) say "SMALLER VALUES: RELEASE_STEPS=$steps left out (only in-order, the off switch, can be chosen)" ;;
  esac
  if [ -n "$n" ]; then
    if [[ "$n" =~ ^[1-4]$ ]] && [ "$n" -le "$FULL_SET_JOBS" ]; then FULL_SET_JOBS="$n"
    else say "SMALLER VALUES: SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=$n left out (1 to the round's $FULL_SET_JOBS)"; fi
  fi
  if [ -n "$m" ]; then
    if [[ "$m" =~ ^[1-4]$ ]] && [ "$m" -le "$WINDOWS_VMS_USED" ]; then WINDOWS_VMS_USED="$m"
    else say "SMALLER VALUES: USE_N_NUMBER_OF_WINDOWS_VMS=$m left out (1 to the round's $WINDOWS_VMS_USED)"; fi
  fi
  state_set "$dir" jobs="$FULL_SET_JOBS" vms="$WINDOWS_VMS_USED"
  say "SMALLER VALUES for run $3: ${took}N=$FULL_SET_JOBS M=$WINDOWS_VMS_USED, from $file${why:+ (why: $why)}"
}
# the round itself, in its own detached process (start launches it): runs, fix rounds, reviews, until green, red or stopped
drive_round() {
  local dir="$1" n=0 fix=0 automatic=0 out
  exec >> "$dir/round.log" 2>&1
  state_set "$dir" driver_pid=$$
  while :; do
    n=$((n + 1))
    [ "$n" = 1 ] || smaller_values "$dir" "$RUN_FOLDER" "$n"
    run_once "$dir" "$n"
    # its marks for the form's estimates (a dry run leaves none): never in the way of the round
    if [ "$ROUND_DRY_RUN" = no ]; then
      if out=$($ROUND_ESTIMATE 2>&1); then say "ESTIMATES refreshed from run $n's marks: $(printf '%s\n' "$out" | head -1)"
      else say "ESTIMATES not refreshed (the round goes on): $(printf '%s\n' "$out" | tail -1)"; fi
    fi
    if [ "$RUN_RESULT" = green ]; then ready_to_upload "$dir"; return $?; fi
    if [ "$ON_FAILURES" = report-only ] || [ -z "$RELEASE_FIXER" ]; then
      state_set "$dir" state=red why="$( [ "$ON_FAILURES" = report-only ] && echo "red, ON_FAILURES=report-only" || echo "red; ON_FAILURES=$ON_FAILURES but no fixer is set (RELEASE_FIXER in $RELEASE_REHEARSAL_CONF): report only")"
      say "RED: $(state_get "$dir" why). The failures: $(state_get "$dir" result)"
      return 1
    fi
    fix=$((fix + 1))
    fix_round "$dir" "$fix" "$RUN_FOLDER"
    if [ "$FIX_END" = DONE ] && [ "$ON_FAILURES" = fix-prove-then-rerun-automatically ] && [ "$automatic" -lt "$MAX_AUTOMATIC_RERUNS" ]; then
      automatic=$((automatic + 1)); state_set "$dir" automatic_reruns="$automatic"
      say "RUN AGAIN automatically ($automatic of $MAX_AUTOMATIC_RERUNS): fix round $fix is DONE"
      continue
    fi
    if [ "$FIX_END" = DONE ] && [ "$ON_FAILURES" = fix-prove-then-rerun-automatically ]; then
      wait_for_review "$dir" "fix round $fix is DONE after $MAX_AUTOMATIC_RERUNS automatic re-runs: the next run waits for a review"
    else
      wait_for_review "$dir" "$(state_get "$dir" why)"
    fi
  done
}

# ---- the subcommands ----
# estimate_cmd [<N> <M>]: the 16 choices to RELEASE_ESTIMATES_FILE, or one choice's block (estimate, in SUBCOMMANDS)
estimate_cmd() {
  local file tmp src n m
  machines_load || exit 2
  if [ "$#" = 0 ]; then
    file="$RELEASE_ESTIMATES_FILE"
    mkdir -p "$(dirname "$file")" && tmp=$(mktemp "$file.XXXXXX") || { echo "FAIL  cannot write next to $file"; exit 2; }
    if ! machines_estimates > "$tmp" 2> "$tmp.err"; then
      echo "FAIL  the estimates could not be computed: $(tail -1 "$tmp.err")"; rm -f "$tmp" "$tmp.err"; exit 1
    fi
    rm -f "$tmp.err"; chmod 644 "$tmp" && mv -f "$tmp" "$file" || { rm -f "$tmp"; echo "FAIL  cannot write $file"; exit 2; }
    echo "ESTIMATES the 16 choices written to $file (the job's form reads it)"
    python3 -I -c 'import json, sys
d = json.load(open(sys.argv[1]))
for p in d["pairs"]:
    print("ESTIMATE  N=%d M=%d  %s; needs %d GB%s" % (p["jobs"], p["vms"], p["total_line"][8:], p["need_gb"],
          "; REFUSED at the press (estimate %d %d says why)" % (p["jobs"], p["vms"]) if p["refused"] else ""))' "$file"
    exit 0
  fi
  n="$1" m="${2:-}"
  case "$n:$m" in [1-4]:[1-4]) ;; *) echo "usage: $0 estimate [<N> <M>]   (N and M from 1 to 4)"; exit 2 ;; esac
  src="${RELEASE_ESTIMATES_FROM:-}"
  if [ -z "$src" ]; then
    src=$(mktemp) || exit 2
    trap "rm -f '$src'" EXIT   # the name now: src is local, gone when the trap runs at exit
    machines_estimates > "$src" || { echo "FAIL  the estimates could not be computed"; exit 1; }
  fi
  python3 -I asbl/ci/release-estimate.py block --estimates "$src" --jobs "$n" --vms "$m" --meminfo "${RELEASE_MEMINFO:-/proc/meminfo}"
}
refuse() { echo "REFUSED: $*. Nothing started"; status_line "$(newest_round)"; exit 2; }
start_round() {
  local who version dir out pid old
  case "$ON_FAILURES" in fix-prove-then-wait-for-review|fix-prove-then-rerun-automatically|report-only) ;;
    *) refuse "ON_FAILURES must be fix-prove-then-wait-for-review, fix-prove-then-rerun-automatically or report-only (got '$ON_FAILURES')" ;; esac
  case "$ROUND_DRY_RUN" in yes|no) ;; *) refuse "DRY_RUN must be yes or no (got '$ROUND_DRY_RUN')" ;; esac
  [ -z "$RELEASE_VERSION" ] || printf '%s' "$RELEASE_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || refuse "RELEASE_VERSION must be x.y.z or empty (got '$RELEASE_VERSION')"
  [ -z "$RELEASE_PIN" ] || printf '%s' "$RELEASE_PIN" | grep -qE '^[0-9a-f]{7,40}$' || refuse "RELEASE_PIN must be a commit hash or empty (got '$RELEASE_PIN')"
  who="${ROUND_STARTED_BY:-}"
  [ -n "$who" ] || refuse "MISSING ROUND_STARTED_BY: who starts this round (your name, the agent's)"
  out=$(read_settings) || refuse "$out"
  read_settings
  # the machines file's rules for the chosen Advanced values, before anything is stopped or started
  out=$(machines_load && machines_check "$FULL_SET_JOBS" "$WINDOWS_VMS_USED") ||
    { printf '%s\n' "$out"; refuse "the machines file does not allow N=$FULL_SET_JOBS M=$WINDOWS_VMS_USED (above: bash asbl/ci/release-machines.sh check $FULL_SET_JOBS $WINDOWS_VMS_USED)"; }
  # a release press goes before a scheduled run: stop it, then ask whether the CI is free
  pid=$(cat "$SCHEDULED_E2E_PID" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "a scheduled run is going (pid $pid): stopping it first, a release goes before it"
    STOP_BY="a release press (release-rehearsal.sh start, by $who)" $ROUND_SCHEDULED_E2E stop
    for _ in $(seq 1 60); do kill -0 "$pid" 2>/dev/null || break; sleep 2; done
  fi
  # a dead newest round (its process gone, its state still going: a crash): what it started stopped first, as stop does
  old=$(newest_round)
  case "$(state_get "${old:-/nonexistent}" state)" in running|fixing|waiting-for-review)
    if ! is_round_process_alive; then
      echo "the newest round's process is gone ($(status_line "$old")): stopping what it started first"
      ( STOP_BY="a release press (release-rehearsal.sh start, by $who): its process was gone" ROUND_DRY_RUN="$(state_get "$old" dry_run)" stop_round )
    fi ;;
  esac
  out=$(busy_reason); [ -z "$out" ] || refuse "the CI is busy: $out"
  # a real round's memory and disk, with the CI free: the memory rule against the host's available memory now (a dry round
  # starts no server and no VM)
  if [ "$ROUND_DRY_RUN" = no ]; then
    out=$(machines_load && machines_check "$FULL_SET_JOBS" "$WINDOWS_VMS_USED" --press) ||
      { printf '%s\n' "$out"; refuse "the host cannot hold N=$FULL_SET_JOBS M=$WINDOWS_VMS_USED now (above: bash asbl/ci/release-machines.sh check $FULL_SET_JOBS $WINDOWS_VMS_USED --press)"; }
    printf '%s\n' "$out"
  fi
  version="$RELEASE_VERSION"
  [ -n "$version" ] || version=$(git show "origin/main:$SETTINGS_XML" 2>/dev/null | grep -m1 -oP '(?<=<version>)[^<]+')
  ! both_channels_released "$version" || refuse "$version is public on both channels already (release-state.sh released): give the next version in RELEASE_VERSION"
  out=$(UPLOAD=no DRY_RUN="$ROUND_DRY_RUN" $ROUND_RELEASE_PUBLISH preflight docker 2>&1); printf '%s\n' "$out"
  printf '%s\n' "$out" | grep -q '^PREREQUISITES OK' || refuse "a prerequisite is missing (above: release-publish.sh preflight docker)"
  # one round at a time: the lock is taken here and handed to the round's process, which holds it while it lives
  mkdir -p "$ROUNDS_DIR" || refuse "cannot make $ROUNDS_DIR"
  exec 9>>"$ROUND_LOCK"
  flock -n 9 || refuse "another release round is starting or going ($ROUND_LOCK)"
  dir="$ROUNDS_DIR/$(date -u +%Y%m%dT%H%M%SZ)-release-${RELEASE_VERSION:-current}"
  mkdir -p "$dir" || refuse "cannot make $dir"
  : > "$dir/round.log"
  state_set "$dir" state=running run=0 version="$version" on_failures="$ON_FAILURES" jobs="$FULL_SET_JOBS" vms="$WINDOWS_VMS_USED" \
    pin="$RELEASE_PIN" dry_run="$ROUND_DRY_RUN" \
    approval="$([ -n "$E2E_APPROVAL" ] && echo given || echo none)" started_by="$who" started="$(now)" automatic_reruns=0 \
    why="starting" fixer="${RELEASE_FIXER:-none}"
  { say "STARTED by $who: version ${RELEASE_VERSION:-$version (no step 0)}, ON_FAILURES=$ON_FAILURES, DRY_RUN=$ROUND_DRY_RUN${RELEASE_PIN:+, RELEASE_PIN=$RELEASE_PIN}$([ -n "$E2E_APPROVAL" ] && echo ', E2E_APPROVAL given'), fixer: ${RELEASE_FIXER:-none set (report only)}, Advanced N=$FULL_SET_JOBS M=$WINDOWS_VMS_USED"; } >> "$dir/round.log"
  export RELEASE_VERSION RELEASE_PIN ON_FAILURES E2E_APPROVAL ROUND_STARTED_BY="$who" DRY_RUN="$ROUND_DRY_RUN" \
    SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS="$FULL_SET_JOBS" USE_N_NUMBER_OF_WINDOWS_VMS="$WINDOWS_VMS_USED"
  setsid nohup bash "$0" __drive "$dir" > /dev/null 2>&1 < /dev/null &
  exec 9>&-
  echo "STARTED the release round $dir (its process $!): follow it with  bash asbl/ci/jenkins/release-rehearsal.sh follow"
  status_line "$dir" running
  exit 5
}
follow_round() {
  local dir from=0 for_seconds="" deadline size state
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --from) from="${2:-0}"; shift 2 ;;
      --for) for_seconds="${2:-}"; shift 2 ;;
      *) echo "usage: $0 follow [--from <byte>] [--for <seconds>]"; exit 2 ;;
    esac
  done
  dir=$(newest_round)
  [ -n "$dir" ] || { status_line ""; exit 2; }
  [ -z "$for_seconds" ] || deadline=$((SECONDS + for_seconds))
  while :; do
    size=$(stat -c %s "$dir/round.log" 2>/dev/null || echo 0)
    [ "$size" -le "$from" ] || { tail -c +"$((from + 1))" "$dir/round.log" | head -c "$((size - from))"; from=$size; }
    state=$(round_state "$dir")
    case "$state" in running|fixing) ;; *)
      size=$(stat -c %s "$dir/round.log")   # what the round wrote as it ended
      [ "$size" -le "$from" ] || { tail -c +"$((from + 1))" "$dir/round.log" | head -c "$((size - from))"; from=$size; }
      break ;;
    esac
    [ -z "$for_seconds" ] || [ "$SECONDS" -lt "$deadline" ] || break
    sleep 2
  done
  echo "FOLLOW next=$from state=$state"
  exit "$(exit_code_of_state "$state")"
}
proceed_round() {
  local dir state
  dir=$(newest_round); state=$(round_state "${dir:-/nonexistent}")
  [ "$state" = waiting-for-review ] || { echo "NOTHING TO PROCEED: the round is not waiting for review"; status_line "$dir"; exit "$(exit_code_of_state "$state")"; }
  echo "${PROCEED_BY:-${ROUND_STARTED_BY:-someone}} at $(now)" > "$dir/proceed"
  for _ in $(seq 1 $((ROUND_POLL + 10))); do [ "$(round_state "$dir")" != waiting-for-review ] && break; sleep 1; done
  echo "PROCEEDED: the round runs again from scratch, step 1 included"
  status_line "$dir"
  state=$(round_state "$dir"); exit "$(exit_code_of_state "$state")"
}
# ---- what the Jenkins job shows (read only) ----
# round_label: the build's label in the job's build list, one line, e.g. "16.6.2 green, 1 run, ready to upload"
round_label() {
  local dir state version runs runs_word dry=""
  dir=$(newest_round)
  [ -n "$dir" ] || { echo "no round yet"; return; }
  state=$(round_state "$dir"); version=$(state_get "$dir" version); runs=$(state_get "$dir" run)
  runs_word="runs"; [ "$runs" = 1 ] && runs_word="run"
  [ "$(state_get "$dir" dry_run)" != yes ] || dry=" (dry run)"
  case "$state" in
    running) if [ "${runs:-0}" = 0 ]; then echo "$version starting$dry"; else echo "$version run $runs going$dry"; fi ;;
    fixing)             echo "$version fix round $(state_get "$dir" fix_round) after run $runs$dry" ;;
    waiting-for-review) echo "$version waiting for review after run $runs$dry" ;;
    green)              echo "$version green, $runs $runs_word, ready to upload$dry" ;;
    green-not-ready)    echo "$version green, $runs $runs_word, $(state_get "$dir" why)$dry" ;;
    released)           echo "$version released, $runs $runs_word" ;;
    red)                echo "$version red after run $runs$dry" ;;
    stopped)            echo "$version stopped, $runs $runs_word$dry" ;;
    *)                  echo "$version $state$dry" ;;
  esac
}
# review_round: what a round waiting for review shows (the job's pause): why it waits, the fix plan with its status line,
# its report, the red run's result, and the commits since the run's pin (origin/main fetched first: the fixes are pushed)
review_round() {
  local dir state plan pin
  dir=$(newest_round); state=$(round_state "${dir:-/nonexistent}")
  [ "$state" = waiting-for-review ] || { echo "NOT WAITING FOR REVIEW"; status_line "$dir"; exit "$(exit_code_of_state "$state")"; }
  plan=$(state_get "$dir" fix_plan); pin=$(state_get "$dir" pin)
  echo "WAITING FOR REVIEW: $(state_get "$dir" why)"
  if [ -n "$plan" ]; then
    echo "  the fix plan: $plan"
    [ ! -f "$plan" ] || echo "    $(head -n 1 "$plan")"
    echo "  its report: ${plan%.md}-run-report.md"
  fi
  echo "  the red run: $(state_get "$dir" result)"
  if [ -n "$pin" ]; then
    git fetch -q origin main 2>/dev/null
    echo "  the commits since the run's pin ${pin:0:8}:"
    git log --oneline "$pin..origin/main" 2>/dev/null | head -40 | sed 's/^/    /'
  fi
  echo "  Proceed = run again from scratch, step 1 included. Stop = the round ends (release-rehearsal.sh stop)."
  exit 3
}
# report_files_of_run <run folder>: the report files its result.txt lists, that exist: the result itself, the summary, the
# flaky tests, the failure reports, each part's reports (a Playwright JSON with its JUnit XML beside it; a Robot report:
# its folder, where output.xml is). "<part> <path>" a line; the run's own files under the part "run"
report_files_of_run() {
  local result="$1/result.txt" key value part reports path
  [ -f "$result" ] || return 0
  echo "run $result"
  while IFS='=' read -r key value; do
    case "$key" in summary|flaky|failure_report) [ -z "$value" ] || [ ! -e "$value" ] || echo "run $value" ;; esac
  done < <(grep -E '^(summary|flaky|failure_report)=' "$result")
  # awk, not read: read merges empty tab-separated fields, so a part with no reports would read its why as them
  while IFS=$'\t' read -r part reports; do
    for path in $reports; do
      case "$path" in
        */report.html) path=$(dirname "$path") ;;
        *.json) [ ! -e "${path%.json}.xml" ] || echo "$part ${path%.json}.xml" ;;
      esac
      [ ! -e "$path" ] || echo "$part $path"
    done
  done < <(awk -F'\t' '$1 == "part" { print $2 "\t" $6 }' "$result")
}
# round_reports: the report files of each run of the newest round that has ended: "REPORT <run n> <part> <path>" a line
round_reports() {
  local dir n folder
  dir=$(newest_round)
  [ -n "$dir" ] || { echo "NO ROUND"; exit 2; }
  for n in $(seq 1 "$(state_get "$dir" run)"); do
    folder=$(state_get "$dir" "run_$n")
    [ -n "$folder" ] || continue
    report_files_of_run "$folder" | awk -v n="$n" '!seen[$0]++ { print "REPORT " n " " $0 }'
  done
  exit 0
}
# ---- stop: what the round's runs started ----
# run_folders_of_round <round folder>: each run's folder, from the orchestrator's PARTS lines in the round's console
run_folders_of_round() { sed -n 's/^PARTS   one log per part in //p' "$1/round.log" 2>/dev/null | sort -u; }
# unfinished_started_entries <round folder>: the real started.txt lines (UTC part kind name what) of the parts that have
# no exit code (<part>.rc): those were going when the round stopped. An ended part cleaned up after itself, and a
# container that has its name now may be someone else's
unfinished_started_entries() {
  local folder utc part kind name real what
  run_folders_of_round "$1" | while IFS= read -r folder; do
    [ -f "$folder/started.txt" ] || continue
    while IFS=$'\t' read -r utc part kind name real what; do
      [ "$real" = real ] && [ ! -e "$folder/$part.rc" ] && printf '%s\t%s\t%s\t%s\t%s\n' "$utc" "$part" "$kind" "$name" "$what"
    done < "$folder/started.txt"
  done
}
# dry_started_entries <round folder>: a dry round's runs started nothing; each thing their started.txt names (its dry-run
# lines) once, "WOULD stop <kind> <name> (<part>): <what>": what a real round's stop ends while its part goes
dry_started_entries() {
  local folder utc part kind name real what
  echo "DRY RUN: the round started nothing; a real round's stop ends what its runs' started.txt names while its part goes:"
  run_folders_of_round "$1" | while IFS= read -r folder; do
    [ -f "$folder/started.txt" ] || continue
    while IFS=$'\t' read -r utc part kind name real what; do
      [ "$real" != dry-run ] || printf 'WOULD stop %s %s (%s): %s\n' "$kind" "$name" "$part" "$what"
    done < "$folder/started.txt"
  done | awk '!seen[$3 " " $4]++'
}
epoch_of() { date -u -d "$1" +%s 2>/dev/null || echo 0; }   # epoch_of <time>: its seconds since 1970, 0 when unreadable
# own_leftovers <round folder>: what the round's runs started that makes the CI busy and is the round's own, one
# "container <name>" or "pidfile <file>" line each: a part that had not ended, its container or pid file made after its
# entry and before its part's log was last written (the part still ran then; another run could start only after it)
own_leftovers() {
  local folder utc part kind name real what made
  run_folders_of_round "$1" | while IFS= read -r folder; do
    [ -f "$folder/started.txt" ] || continue
    while IFS=$'\t' read -r utc part kind name real what; do
      [ "$real" = real ] && [ ! -e "$folder/$part.rc" ] && [ -f "$folder/$part.log" ] || continue
      case "$kind" in
        container) made=$(docker inspect -f '{{.Created}}' "$name" 2>/dev/null) && [ -n "$made" ] || continue; made=$(epoch_of "$made") ;;
        pidfile)   made=$(stat -c %Y "$name" 2>/dev/null) || continue ;;
        *)         continue ;;
      esac
      [ "$made" -ge "$(epoch_of "$utc")" ] && [ "$made" -le "$(stat -c %Y "$folder/$part.log")" ] && echo "$kind $name"
    done < "$folder/started.txt"
  done
}
# vm_steps_of <command>: the VM's scheduled tasks (dp-ci-<step>) that a dp-ci.sh win command runs, by dp-ci.sh's names:
# the package's npmwc and prepare (win_prepare_package), each lane's own step, the installed server dp-server; step 3's
# release runs the pack, the server lane, the Electron light set (e2e) and the Robot UAT. Ending a task that is not
# there does nothing
vm_steps_of() {
  case "$1" in
    "dp-ci.sh win server-e2e") echo "npmwc prepare server-e2e dp-server" ;;
    "dp-ci.sh win docker-e2e") echo "npmwc prepare docker-e2e" ;;
    "dp-ci.sh win release")    echo "npmwc prepare release-pack server-e2e dp-server e2e release-robot" ;;
    "dp-ci.sh win prepare")    echo "npmwc prepare" ;;
    "dp-ci.sh win package")    echo "npmwc prepare" ;;   # the pack's copy; its own prepare when no copy can be made
  esac
}
# stop_container_created_since <name> <epoch>: docker stop, when it was created at or after that time (the run's)
stop_container_created_since() {
  local created
  created=$(docker inspect -f '{{.Created}}' "$1" 2>/dev/null) || return 0   # gone already (run containers are --rm)
  if [ "$(epoch_of "$created")" -lt "$2" ]; then echo "LEFT    container $1: created before the run's entry, not the round's"; return 0; fi
  docker stop "$1" > /dev/null 2>&1 && echo "STOPPED container $1" || echo "WARN    docker stop $1 failed"
}
# stop_pidfile_process_since <pid file> <epoch>: the process of a pid file written at or after that time, with its
# process group (win-e2e.sh starts its driver with setsid: the group is the driver's whole tree)
stop_pidfile_process_since() {
  local pid
  pid=$(cat "$1" 2>/dev/null)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 0
  if [ "$(stat -c %Y "$1")" -lt "$2" ]; then echo "LEFT    process $pid of $1: the file is older than the run's entry"; return 0; fi
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; }
  echo "STOPPED process $pid of $1"
}
# vm_of_entry <name of a vm entry>: the VM it names (windows-vm: VM a; windows-vm-<name>: that VM)
vm_of_entry() { case "$1" in windows-vm-*) echo "${1#windows-vm-}" ;; *) echo a ;; esac; }
# stop_what_the_runs_started <round folder>: each unfinished entry, in its started.txt order (a part's Windows driver
# before its VM steps, so the driver does not react to them); a VM the run started last, once its steps are stopped
stop_what_the_runs_started() {
  local utc part kind name what since container step vms=""
  while IFS=$'\t' read -r utc part kind name what; do
    since=$(epoch_of "$utc")
    case "$kind" in
      container) stop_container_created_since "$name" "$since" ;;
      compose)   for container in $(docker ps --filter "label=com.docker.compose.project.working_dir=$name" --format '{{.Names}}' 2>/dev/null); do
                   stop_container_created_since "$container" "$since"
                 done ;;
      pidfile)   stop_pidfile_process_since "$name" "$since" ;;
      vm)        for step in $(vm_steps_of "$what"); do
                   # read whole, not piped to grep -q: an early grep exit would give dp-ci.sh a SIGPIPE, and pipefail its code
                   if [[ "$(WIN_VM="$(vm_of_entry "$name")" bash asbl/ci/dp-ci.sh win stop "$step" 2>&1)" == *"STOPPED $step"* ]]; then echo "STOPPED the VM's step $step ($part)"
                   else echo "WARN    the VM's step $step ($part) was not confirmed stopped: WIN_VM=$(vm_of_entry "$name") bash asbl/ci/dp-ci.sh win stop $step"; fi
                 done ;;
      domain)    vms="$vms ${part#vm-}" ;;
    esac
  done < <(unfinished_started_entries "$1")
  for vm in $vms; do machines_vm_shutdown "$vm" | sed 's/^VM      /STOPPED VM /'; done
}
stop_round() {
  local dir state recorded_state pid fix_run was_alive=no other_run
  dir=$(newest_round)
  [ -n "$dir" ] || { echo "NOTHING TO STOP: no round yet"; status_line ""; exit 4; }
  state=$(round_state "$dir"); recorded_state=$(state_get "$dir" state)
  case "$recorded_state" in stopped|red) echo "the round had ended already ($recorded_state): nothing to stop"; status_line "$dir"; exit 4 ;; esac
  [ "$state" != released ] || { echo "the round had ended already (released): nothing to stop"; status_line "$dir"; exit 4; }
  pid=$(state_get "$dir" driver_pid)
  # the round's process group first: its orchestrator would start the next part as soon as one of them is stopped
  if is_round_process_alive && [ -n "$pid" ]; then
    was_alive=yes
    kill -TERM -- "-$pid" 2>/dev/null
    for _ in $(seq 1 30); do is_round_process_alive || break; sleep 1; done
    is_round_process_alive && kill -KILL -- "-$pid" 2>/dev/null
  fi
  # then what its run started that outlives that group. A round whose process was gone already (a reboot) ended long
  # ago maybe: when another run holds the CI now, those names may be that run's, so nothing is touched; what the round
  # left itself (own_leftovers: a runner, a VM's driver, a CI container) is not another run
  [ "$(state_get "$dir" dry_run)" != yes ] || dry_started_entries "$dir"
  other_run=""; [ "$was_alive" = yes ] || other_run=$(busy_reason "$dir")
  case "$other_run" in "a green round waits"*|"a fix run is going"*) other_run="" ;; esac   # this round itself
  if [ -z "$other_run" ]; then stop_what_the_runs_started "$dir"
  else echo "LEFT    what this round's runs started: its process was gone already, and the CI is busy now: $other_run"; fi
  fix_run=$(state_get "$dir" fix_run)
  if [ "$recorded_state" = fixing ] && [ -n "$fix_run" ]; then
    read_settings >/dev/null
    [ -z "$RELEASE_FIXER" ] || { echo "stopping the fix run $fix_run"; DRY_RUN="$ROUND_DRY_RUN" $RELEASE_FIXER stop "$fix_run"; }
  fi
  state_set "$dir" state=stopped why="stopped by ${STOP_BY:-${ROUND_STARTED_BY:-someone}} at $(now) (it was $state)"
  say "STOPPED by ${STOP_BY:-${ROUND_STARTED_BY:-someone}} (it was $state)" >> "$dir/round.log"
  status_line "$dir"
  exit 4
}

RELEASE_VERSION="${RELEASE_VERSION:-}"
RELEASE_PIN="${RELEASE_PIN:-}"
ON_FAILURES="${ON_FAILURES:-fix-prove-then-wait-for-review}"
ROUND_DRY_RUN="${DRY_RUN:-no}"
E2E_APPROVAL="${E2E_APPROVAL:-}"
case "${1:-help}" in
  start)   start_round ;;
  status)  dir=$(newest_round); state=$(round_state "${dir:-/nonexistent}"); status_line "$dir" "$state"; exit "$(exit_code_of_state "$state")" ;;
  follow)  shift; follow_round "$@" ;;
  proceed) proceed_round ;;
  stop)    stop_round ;;
  busy)    why=$(busy_reason); [ -z "$why" ] && { echo FREE; exit 0; }; echo "BUSY $why"; exit 2 ;;
  label)   round_label; exit 0 ;;
  review)  review_round ;;
  reports) round_reports ;;
  estimate) shift; estimate_cmd "$@" ;;
  help|-h|--help) sed -n '2,/^set -uo pipefail/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
  __drive) read_settings >/dev/null; drive_round "$2"; exit $? ;;   # internal: the round's own process, launched by start
  *) echo "usage: $0 start|status|follow|proceed|stop|busy|label|review|reports|estimate [<N> <M>]|help (see: $0 help)"; exit 2 ;;
esac

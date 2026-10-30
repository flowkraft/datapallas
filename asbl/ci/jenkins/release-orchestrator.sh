#!/bin/bash
# The release's order, one execution per start: step 0, step 1's lanes, then one execution of steps 2 and 3 pinned to one
# commit, on two tracks at once (this host, the Windows VM). It runs the order and nothing else: the work stays in the step
# scripts it calls (release-set-version.sh, release-step1.sh, release-docker.sh, win-e2e.sh release), the ones the jobs run.
# It replaces /root/pra2-chain.sh, outside the repo, which stays as it is.
#
# HOW, in order (execution 2: the same from 2, after the fixes):
#   0. who started it, first: STARTED_BY=<who>  <UTC time>  :: release orchestrator ... (asbl/ci/marks.sh run_record_begin);
#      its folder <RUN_RECORD_DIR>/<UTC>-release-orchestrator-.../ holds run.log (this console) and one log per part;
#   1. step 0, only when RELEASE_VERSION is given (execution 1): release-set-version.sh with DRY_RUN=yes, then for real;
#      the commit it pushes is the pin. A red step 0 starts nothing else: the version is what everything after it tests;
#   2. the pin: RELEASE_PIN, else step 0's commit, else origin/main now (fetched). Every part gets RELEASE_PIN: dp-ci.sh puts
#      this checkout and the VM's on that commit, never on a later main (sync_host_repo, win_sync_repo), and the moved-main
#      checks of steps 2 and 3 ask only whether the part tested it (release-state.sh moved-main), so main may move, even by
#      a product change; execution 2: refused unless release-rerun.sh show says "ready for execution 2" (TODO 2's list);
#   3. step 1, the lanes a release needs (release-state.sh full-lane --choose) that are not green on the pin (release-state.sh
#      require: on the pin, or on an earlier commit when only tests or CI changed since), each through release-step1.sh:
#        host  the build of the pin first when a lane takes it (dp-ci.sh build-if-needed), then lane 2 (docker-server-auth),
#              then lane 1 (this release's full set, web or docker-server)
#        VM    lane 4 (windows-vm-server, its light set) meanwhile, once the build is there; lane 3 is step 3's own
#      then the guard steps 2 and 3 make (release-state.sh step1-guard): not green and no approval = no execution, the
#      re-run commands printed (a lane red on a few tests is completed by re-running them, release-rerun.sh);
#   4. the execution, two tracks at once (the VM's parts one after the other, never two at once):
#        host  step 2's linux part: the build, then the Linux proof (release-docker.sh, DOCKER_RELEASE_PART=linux);
#              then, once both proofs ended, its keep part: keep, guard, verdict (DOCKER_RELEASE_PART=keep)
#        VM    step 3's pack (win-e2e.sh release, WIN_RELEASE_HALF=pack); then step 2's Windows Docker proof once the
#              build is there (DOCKER_RELEASE_PART=windows); then step 3's Electron light set, Robot and its verdict
#              (WIN_RELEASE_HALF=after-pack)
#      A red part never stops one that can still run: a red build leaves the Windows Docker proof and the Docker keep NOT
#      RUN, a red pack leaves Robot NOT RUN (step 3 says so); the rest runs;
#   5. the summary: each part PASS, FAIL or NOT RUN with its reason and its log; after execution 1, the failures to fix
#      (release-keep.sh failures); the history line (marks.sh run_record_end). Exit 0 only when every part passed.
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
#   The parts: step0, step1-build, lane1-<web|docker-server>-full, lane2-docker-server-auth, lane4-windows-vm-server-light,
#   build, linux-proof, pack, windows-docker-proof, electron-light, robot, docker-verdict, windows-verdict.
#
# USE:
#   ORCH_STARTED_BY=<name> DRY_RUN=yes bash asbl/ci/jenkins/release-orchestrator.sh
#   ORCH_STARTED_BY=<name> DRY_RUN=yes DRY_RUN_RED="build pack" bash asbl/ci/jenkins/release-orchestrator.sh
#   ORCH_STARTED_BY=<name> RELEASE_VERSION=<x.y.z> setsid nohup bash asbl/ci/jenkins/release-orchestrator.sh >/dev/null 2>&1 &
#   bash asbl/ci/jenkins/release-orchestrator.sh replay <execution 1 commit> <later commit>...   per part, reuse or rebuild
#        from each commit to the next (asbl/ci/reuse-or-rebuild.sh): what a re-run between the executions takes
#
# It never uploads, never runs MODE=public or step 4, never starts a second execution, never runs a part again, and holds
# no version or approval. One start at a time (<LOG_DIR>/release-orchestrator.lock).
# Callers: a person or an agent, from the shell (no Jenkins job).
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
. asbl/ci/marks.sh
. asbl/ci/reuse-or-rebuild.sh

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
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
      windows-docker-proof "$RR_IMAGE_AND_ZIPS" "(image-and-zips)" \
      pack "$RR_WINDOWS_PACK" "(windows-pack)" \
      electron-light "$RR_E2E_PACKAGE" "(e2e-package)" \
      robot "$RR_WINDOWS_PACK" "(windows-pack)" \
      "step 1" "$RR_STEP1" "(${RR_STEP1_WHY:-})"
    from="$to"
  done
}
either() { case " $* " in *" rebuild "*) echo rebuild ;; *) echo reuse ;; esac; }
if [ "${1:-}" = replay ]; then shift; replay "$@"; exit $?; fi
[ "$#" = 0 ] || { echo "usage: $0 (the run: inputs in the environment, see the top of this file) | replay <commit> <commit>..."; exit 2; }

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
if [ "$DRY" = no ]; then
  # one start at a time: the lock lives as long as this run and the parts it started
  exec 9>>"$LOG_DIR/release-orchestrator.lock"
  flock -n 9 || { echo "REFUSED: another start of the orchestrator is going (lock $LOG_DIR/release-orchestrator.lock). Nothing done"; exit 1; }
fi
run_record_begin "$WHO" "release orchestrator, execution $EXECUTION${VERSION:+, version $VERSION}$([ "$DRY" = yes ] && echo ', dry run')" ||
  { echo "FAIL  cannot make the folder of this run under $RUN_RECORD_DIR. Nothing done"; exit 2; }
PARTS="${RUN_DIR:-$RUN_RECORD_DIR/$(date -u +%Y%m%dT%H%M%SZ)-release-orchestrator-parts-$$}"
mkdir -p "$PARTS" || exit 2
POLL=$([ "$DRY" = yes ] && echo 1 || echo 30)
export MODE=rehearsal UPLOAD=no DRY_RUN=no
echo "INPUTS  execution=$EXECUTION version=${VERSION:-none (no step 0)} mode=rehearsal upload=no dry_run=$DRY${RED:+ dry_run_red=$RED} approval=$([ -n "${E2E_APPROVAL:-}" ] && echo "given in the environment, passed on to the guards" || echo none)"
echo "PARTS   one log per part in $PARTS"

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
  echo "PART    $id START $(date -u +%Y-%m-%dT%H:%M:%SZ) on ${PIN:0:8}: $what"
  if [ "$DRY" = yes ]; then
    echo "WOULD   RELEASE_PIN=${PIN:0:8} MODE=rehearsal UPLOAD=no$([ -n "${E2E_APPROVAL:-}" ] && echo ' E2E_APPROVAL=(given)') $*"
    simulate "$id" > "$PARTS/$id.log"; rc=$?
    sleep 2   # a dry part lasts two seconds, so the log shows which parts overlap
  else
    env RELEASE_PIN="$PIN" "$@" > "$PARTS/$id.log" 2>&1 < /dev/null; rc=$?
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
  local r=0 any=0 p
  case "$1" in
    step0)  simulated_mark "STEP 0" step0 ;;
    step1-build) simulated_mark "BUILD IF NEEDED" step1-build ;;
    lane*)  simulated_mark "JOB STEP 2/2" "$1" ;;
    docker-linux)
      echo "######## DOCKER RELEASE STEP 1/6 START  (dry run)"
      simulated_mark "DOCKER RELEASE STEP 2/6" build || return 1
      simulated_mark "DOCKER RELEASE STEP 3/6" linux-proof ;;
    windows-pack) simulated_mark "RELEASE STEP 1/4" pack ;;
    docker-windows) simulated_mark "DOCKER RELEASE STEP 4/6" windows-docker-proof ;;
    windows-after-pack)
      simulated_mark "RELEASE STEP 2/4" electron-light || any=1
      echo "######## RELEASE STEP 3/4 START  (dry run)"
      if red_in_dry_run pack; then echo "not run: there is no pack (FAIL) to test"; r=1
      elif red_in_dry_run robot; then echo "FAILED: robot red (DRY_RUN_RED)"; r=1; fi
      echo "######## RELEASE STEP 3/4 END rc=$r  (dry run)"
      for p in pack windows-verdict; do red_in_dry_run "$p" && any=1; done
      [ "$r" = 0 ] && [ "$any" = 0 ] && echo "RELEASE_RESULT dry run: rehearsal=PASS" && return 0
      echo "RELEASE_RESULT dry run: rehearsal=FAIL"; return 1 ;;
    docker-keep)
      for p in build linux-proof windows-docker-proof docker-verdict; do red_in_dry_run "$p" && any=1; done
      [ "$any" = 0 ] && echo "DOCKER_RELEASE_RESULT dry run: rehearsal=PASS" && return 0
      echo "DOCKER_RELEASE_RESULT dry run: rehearsal=FAIL"; return 1 ;;
  esac
}
# mark_verdict <log> <mark label>: "PASS|", "FAIL|<why>" or "NOT RUN|<why>" for one mark of a part's log: its END rc=0,
# another rc or a START with no END (the part died), or no START at all; a "not run:" line inside the mark makes it NOT RUN
mark_verdict() {
  local log="$1" label="$2" section end why
  [ -s "$log" ] || { echo "NOT RUN|never started"; return; }
  if ! grep -aq "^######## $label START" "$log"; then
    why=$(grep -a -m1 -E '^(not run: |FAILED|REFUSED|MISSING|FAIL  |DOCKER_RELEASE_RESULT nothing)' "$log")
    echo "NOT RUN|${why#not run: }"; return
  fi
  section=$(awk -v s="######## $label START" -v e="######## $label END rc=" 'index($0, s) == 1 { on = 1 } on { print } on && index($0, e) == 1 { exit }' "$log")
  end=$(printf '%s\n' "$section" | awk -v e="######## $label END rc=" 'index($0, e) == 1 { r = substr($0, length(e) + 1); sub(/[^0-9].*/, "", r) } END { print r }')
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
# summarize <part> <verdict|why> <log>: one line of the summary, kept for the end
summarize() {
  local v="${2%%|*}" why="${2#*|}"
  SUMMARY+=("$(printf '  %-32s %-8s %s' "$1" "$v" "${why:+$why  }(log $3)")")
  [ "$v" = PASS ] || ALL_GREEN=0
}
ALL_GREEN=1
finish() {  # finish <rc>: the summary, the history line, the exit
  local s
  echo
  echo "SUMMARY execution $EXECUTION on ${PIN:+${PIN:0:8}}$([ "$DRY" = yes ] && echo ' (dry run)'):"
  for s in "${SUMMARY[@]}"; do echo "$s"; done
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
export RELEASE_PIN="$PIN"
echo "PIN     execution $EXECUTION on ${PIN:0:8} ($why): $(git log -1 --format='%s' "$PIN")"
echo "        every part builds, packs and tests ${PIN:0:8}; main may move meanwhile"
if [ "$DRY" = yes ]; then
  if [ "$(git rev-parse HEAD)" = "$PIN" ]; then echo "        this checkout is on it"
  elif git merge-base --is-ancestor HEAD "$PIN"; then echo "        this checkout ($(git rev-parse --short HEAD)) would be moved forward to it by the first part"
  else echo "        this checkout ($(git rev-parse --short HEAD)) is past the pin or off its history: every real part would refuse it"; fi
fi
if [ "$EXECUTION" = 2 ]; then
  out=$(RERUN_COMMIT="$PIN" bash asbl/ci/release-rerun.sh show 2>&1); printf '%s\n' "$out"
  if ! printf '%s\n' "$out" | grep -q '^SHOW_RESULT ready for execution 2'; then
    [ "$DRY" = yes ] || { echo "REFUSED: execution 2 starts once every failure of execution 1 is verified (above). Nothing started"; finish 1; }
    echo "dry run: a real start would be refused here (above)"
  fi
fi

# ---- 3. step 1 ----
mark_start "STEP 1" "the lanes a release needs, not green on ${PIN:0:8} yet: host lanes 2 and 1, the VM's lane 4 meanwhile"
full=$(RELEASE_COMMIT="$PIN" DRY_RUN=yes $STATE full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
[ -n "$full" ] || { echo "FAILED: this release's full lane cannot be read (release-state.sh full-lane --choose)"; full=unknown; }
needed=""
for lane in "step1.docker-server-auth" "step1.$full-full" "step1.windows-vm-server-light"; do
  # (E2E_APPROVAL left out: with it, `require` would record an approval; the steps' guards take it, not this question)
  if out=$(E2E_APPROVAL="" RELEASE_COMMIT="$PIN" $STATE require "$lane" 2>&1); then
    echo "step 1  ${lane#step1.} is green for ${PIN:0:8} already: $(printf '%s\n' "$out" | tail -1)"
  else needed="$needed $lane"; fi
done
echo "step 1  to run:${needed:- nothing}; lane 3 (windows-vm-electron-light) is step 3's own"
# lane_part <lane>: its part id and the release-step1.sh environment that runs it
lane_part() {
  case "$1" in
    step1.docker-server-auth)      echo "lane2-docker-server-auth E2E_TARGET=docker-server E2E_SPEC=$AUTH_SPEC" ;;
    step1.windows-vm-server-light) echo "lane4-windows-vm-server-light E2E_TARGET=windows-vm-server E2E_SPEC=" ;;
    step1.*-full)                  t="${1#step1.}"; echo "lane1-$t E2E_TARGET=${t%-full} E2E_SPEC=" ;;
  esac
}
run_lane() {  # run_lane <lane>
  local id envs
  read -r id envs <<< "$(lane_part "$1")"
  run_part "$id" "step 1 ${1#step1.} (release-step1.sh)" env $envs E2E_GREP= E2E_RETRIES= E2E_ROTATION_DATE= \
    STEP1_STARTED_BY="release orchestrator, started by $WHO" \
    bash asbl/ci/jenkins/release-step1.sh
}
step1_host() {
  local lane
  case "$needed" in
    *docker-server*|*windows-vm-server*)
      run_part step1-build "the build of ${PIN:0:8}, when there is none yet (dp-ci.sh build-if-needed)" bash asbl/ci/dp-ci.sh build-if-needed ;;
  esac
  touch "$PARTS/.step1-build-done"
  for lane in step1.docker-server-auth "step1.$full-full"; do
    case " $needed " in *" $lane "*) run_lane "$lane" ;; esac
  done
}
step1_vm() {
  case " $needed " in *" step1.windows-vm-server-light "*) ;; *) return 0 ;; esac
  until [ -e "$PARTS/.step1-build-done" ]; do sleep "$POLL"; done
  if [ -f "$PARTS/step1-build.rc" ] && [ "$(cat "$PARTS/step1-build.rc")" != 0 ]; then
    not_run lane4-windows-vm-server-light "no build of ${PIN:0:8} (step1-build is red)"
  else run_lane step1.windows-vm-server-light; fi
}
echo "ORDER   step 1     host: ${needed:+step1-build (when a lane takes the build), }$(for l in step1.docker-server-auth "step1.$full-full"; do case " $needed " in *" $l "*) printf '%s, ' "$(lane_part "$l" | cut -d' ' -f1)" ;; esac; done)done"
echo "                   VM, meanwhile: $(case " $needed " in *" step1.windows-vm-server-light "*) echo "lane4-windows-vm-server-light, once step1-build ended" ;; *) echo nothing ;; esac)"
echo "        execution  host: build + linux-proof (step 2, DOCKER_RELEASE_PART=linux), then docker-verdict (keep, guard: DOCKER_RELEASE_PART=keep) once windows-docker-proof ended"
echo "                   VM, meanwhile: pack (step 3, WIN_RELEASE_HALF=pack), windows-docker-proof once the build ended (DOCKER_RELEASE_PART=windows),"
echo "                   then electron-light + robot + windows-verdict (WIN_RELEASE_HALF=after-pack); never two VM parts at once"
if [ -n "$needed" ]; then
  step1_host & host_pid=$!
  step1_vm & vm_pid=$!
  wait "$host_pid"; wait "$vm_pid"
fi
[ -f "$PARTS/step1-build.rc" ] && summarize step1-build "$(part_verdict step1-build)" "$PARTS/step1-build.log"
s1_red=0
for lane in $needed; do
  read -r id _ <<< "$(lane_part "$lane")"
  v=$(part_verdict "$id"); summarize "$id" "$v" "$PARTS/$id.log"
  [ "${v%%|*}" = PASS ] || s1_red=1
done
# the guard steps 2 and 3 make, asked now (DRY_RUN=yes: an approval is printed here, recorded by the steps themselves)
if [ "$DRY" = yes ]; then
  [ "$s1_red" = 0 ] && guard_ok=1 || guard_ok=0
  echo "dry run: step 1 $([ "$guard_ok" = 1 ] && echo "green on ${PIN:0:8} once the lanes above pass" || echo "red (DRY_RUN_RED): a real start runs no execution")"
elif RELEASE_COMMIT="$PIN" STEP1_PROVEN_LATER=windows-vm-electron-light DRY_RUN=yes $STATE step1-guard; then guard_ok=1
else guard_ok=0; fi
mark_end "$([ "$guard_ok" = 1 ] && echo 0 || echo 1)"
if [ "$guard_ok" = 0 ]; then
  echo "execution $EXECUTION not started: step 1 is not green on ${PIN:0:8} (above). A lane red on a few tests: re-run them alone,"
  echo "  bash asbl/ci/release-rerun.sh run <part> --failed <the lane's report>, then bash asbl/ci/release-state.sh record-step1 <target> reruns full|auth|light;"
  echo "  then start the orchestrator again with RELEASE_PIN=${PIN:0:8} (or with the owner's approval, E2E_APPROVAL)"
  [ "$DRY" = yes ] || finish 1
fi

# ---- 4. the execution: two tracks ----
mark_start "EXECUTION $EXECUTION" "steps 2 and 3 on ${PIN:0:8}: host = build, Linux proof, then the Docker keep; VM = pack, Windows Docker proof, Electron light set, Robot"
DOCKER="bash asbl/ci/jenkins/release-docker.sh"
WINDOWS="bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh release"
WIN_PID="$LOG_DIR/win-e2e.pid"
# build_verdict: the build's verdict from the linux part's log, once its mark ended or the part did
build_verdict() { mark_verdict "$PARTS/docker-linux.log" "DOCKER RELEASE STEP 2/6"; }
track_host() {
  run_part docker-linux "step 2's build, then its Linux proof (DOCKER_RELEASE_PART=linux)" env DOCKER_RELEASE_PART=linux $DOCKER
  until [ -e "$PARTS/.docker-windows-done" ]; do sleep "$POLL"; done
  if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
    run_part docker-keep "step 2's keep, guard and verdict (DOCKER_RELEASE_PART=keep)" env DOCKER_RELEASE_PART=keep $DOCKER
  else not_run docker-keep "no build of ${PIN:0:8} to keep (the build is not green)"; fi
}
track_vm() {
  run_part windows-pack "step 3's pack, kept (WIN_RELEASE_HALF=pack)" env WIN_RELEASE_HALF=pack FOLLOW_PIDFILE="$WIN_PID" $WINDOWS
  # the build ended when its mark did (or the linux part ended before it)
  until grep -aq '^######## DOCKER RELEASE STEP 2/6 END' "$PARTS/docker-linux.log" 2>/dev/null || [ -f "$PARTS/docker-linux.rc" ]; do sleep "$POLL"; done
  if [ "$(build_verdict | cut -d'|' -f1)" = PASS ]; then
    run_part docker-windows "step 2's Windows Docker proof (DOCKER_RELEASE_PART=windows)" env DOCKER_RELEASE_PART=windows $DOCKER
  else not_run docker-windows "no build of ${PIN:0:8} to prove (the build is not green)"; fi
  touch "$PARTS/.docker-windows-done"
  run_part windows-after-pack "step 3's Electron light set, Robot and verdict (WIN_RELEASE_HALF=after-pack)" \
    env WIN_RELEASE_HALF=after-pack FOLLOW_PIDFILE="$WIN_PID" $WINDOWS
}
track_host & host_pid=$!
track_vm & vm_pid=$!
wait "$host_pid"; wait "$vm_pid"
if [ "$DRY" = yes ]; then
  # what the guards of steps 2 and 3 will ask before their verdicts (release-docker.sh 6/6, win_release 4/4), on the main
  # this checkout knows: under the pin, whether the part tested it; for comparison, what an unpinned step would answer
  echo "the moved-main checks, as steps 2 and 3 ask them under the pin: $($STATE moved-main "$PIN" origin/main 2>&1 | tail -1)"
  echo "  the same unpinned (today's rule, for comparison): $(env -u RELEASE_PIN $STATE moved-main "$PIN" origin/main 2>&1 | tail -1)"
fi
mark_end 0

# ---- 5. the summary ----
summarize build "$(build_verdict)" "$PARTS/docker-linux.log"
summarize linux-proof "$(mark_verdict "$PARTS/docker-linux.log" "DOCKER RELEASE STEP 3/6")" "$PARTS/docker-linux.log"
summarize pack "$(mark_verdict "$PARTS/windows-pack.log" "RELEASE STEP 1/4")" "$PARTS/windows-pack.log"
summarize windows-docker-proof "$(mark_verdict "$PARTS/docker-windows.log" "DOCKER RELEASE STEP 4/6")" "$PARTS/docker-windows.log"
summarize electron-light "$(mark_verdict "$PARTS/windows-after-pack.log" "RELEASE STEP 2/4")" "$PARTS/windows-after-pack.log"
summarize robot "$(mark_verdict "$PARTS/windows-after-pack.log" "RELEASE STEP 3/4")" "$PARTS/windows-after-pack.log"
summarize docker-verdict "$(part_verdict docker-keep)" "$PARTS/docker-keep.log"
summarize windows-verdict "$(part_verdict windows-after-pack)" "$PARTS/windows-after-pack.log"
folder=$(ls -1dt "${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}"/*-"${PIN:0:8}"/ 2>/dev/null | head -1)
if [ "$ALL_GREEN" = 0 ] && [ "$DRY" = no ] && [ -n "$folder" ]; then
  echo "THE FAILURES TO FIX (execution $EXECUTION, ${folder%/}):"
  for ch in docker windows; do bash asbl/ci/release-keep.sh failures "${folder%/}" "$ch"; done
  echo "then: each fixed and verified alone (bash asbl/ci/release-rerun.sh run <part> --failed ${folder%/}), and EXECUTION=2 once"
  echo "bash asbl/ci/release-rerun.sh show ${folder%/} says ready for execution 2"
fi
finish "$([ "$ALL_GREEN" = 1 ] && echo 0 || echo 1)"

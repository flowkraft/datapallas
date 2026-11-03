#!/bin/bash
# The nightly e2e of main. The Jenkins job dp-ci-dev-scheduled-e2e starts it every night on its timer (seed.groovy); a person
# or an agent runs the same from a shell. It tests main between releases with the release's own lanes, and builds only what
# changed since the builds already here. It never counts for a release: it writes nothing in the release record
# (asbl/ci/release-state.sh) or the re-run record (asbl/ci/release-rerun.sh).
#
# THE NIGHTS, by the UTC day the night starts on (night_sets):
#   every night  linux-light            the light set on docker-server, then the one-command run of the image, as step 2's
#                                       Linux proof runs them (asbl/ci/light-set.txt, E2E_SPEC=light)
#   Saturday     then full-web or       the full set, as step 1's full lane runs it: web in an even ISO week,
#                full-docker-server     docker-server in an odd one, so the two alternate week by week
#   Sunday       then                   the light set on windows-vm-server, as step 3 runs it: on the Windows pack's
#                windows-server-light   datapallas-server.zip of the newest kept folder holding one (RELEASE_KEPT), or after
#                                       a pack when the pack's inputs changed since (REBUILD_PACK=yes)
#   The sets run one after the other, each whatever the verdict of the one before. Retries 1, as the release's lanes.
#
# THE BUILDS: only what changed, by the rule release-rerun.sh run applies (asbl/ci/reuse-or-rebuild.sh). For each build a
# set takes: the commit it was made from, then the rule from that commit to the commit under test (origin/main, fetched):
#   image-and-zips  the newest successful build log's IMAGE_TAG (<version>-<commit>), as dp-ci.sh picks it.
#                   reuse: named in E2E_REUSE_BUILD. rebuild: dp-ci.sh build-if-needed first (about 40 min)
#   e2e-package     this host's (the Linux sets): asbl/target/package/.built-from, a one-line stamp (a clean build); the
#                   VM's (windows-server-light): the newest WIN_E2E_PACKAGE line of a Windows log here.
#                   reuse: named in E2E_REUSE_BUILD. rebuild: left out, so the lane's own prepare rebuilds it
#   windows-pack    the newest kept folder with a Windows pack (asbl/ci/release-keep.sh): its MANIFEST's commit.
#                   reuse: RELEASE_KEPT=<that folder>. rebuild: REBUILD_PACK=yes, the lane packs first
#   A build checked here is checked again where the lane takes it (dp-ci.sh reuse_build_ok). A night after a CI- or
#   test-only commit builds nothing.
#
# SUBCOMMANDS
#   start      first the clean-up (see clean), then the checks; then the night starts detached and this returns.
#              Exit 5 started (a "log:" line), 0 skipped (SKIPPED: <why>), 2 a wrong input (nothing started). It skips:
#              - while a night is still going, its fix round included (the pid file below);
#              - while the CI is busy: a dp-ci run, a Windows run, a release run, or a release round open until the
#                version is public (asbl/ci/jenkins/release-rehearsal.sh busy).
#   follow [--from <byte>] [--for <seconds>]   the newest night's console from that byte; without --for, until the night's
#              tests end (its NIGHT END line); with it, at most that long (the job's polls). The last line is
#              FOLLOW next=<byte to go on from> state=<state> ended=<yes: the NIGHT END line is out, no>
#   status     one line:  NIGHT state=<state> night=<date> <day> sets=<sets> commit=<commit> result=<its result.txt>
#   label      the build's label for the job's build list: "2026-11-07 Saturday: linux-light PASS, full-web going"
#   reports    the report files of the newest night, as its result.txt lists them:  REPORT <set> <path>  a line (the
#              result itself, the summary, the flaky tests: set "night"; each set's Playwright JSON and its JUnit XML;
#              never the HTML folders, which stay on the host)
#   stop       the night going stops: its own processes, then what its set started (the dp-ci containers, the
#              docker-server bundle, the Windows driver and the VM's steps, each only when made since the set began),
#              then its fix run. A release press calls it (release-rehearsal.sh start): a release goes before a night
#   plan [<YYYY-MM-DD>]   the sets of that night (default: today, UTC) and each build's answer, reuse or rebuild. Runs nothing
#   clean      the Playwright HTML reports older than 14 days go: the *-playwright-html folders at the top of LOG_DIR,
#              never anything under evidence/, runs/, release-artifacts/ or another folder, and no log or report file
#   help       this header
#
# INPUTS (environment; the job's parameters, the same names and defaults):
#   ON_FAILURES [fix]   what a red night leads to: fix = a fix round, the fixer (RELEASE_FIXER in the settings file, as for
#                       the release round): every failure's root cause found, fixed and proven alone; it runs nothing again
#                       (the next night checks again). report-only = the night ends red with its result, no agent. With no
#                       fixer set, fix acts as report-only and says so
#   DRY_RUN [no]        yes: the night prints each set's builds and the command it would run, and runs, builds and starts
#                       nothing (the fixer gets DRY_RUN=yes); clean only lists
#   SCHEDULED_STARTED_BY   REQUIRED by start: who starts it (the job passes its build's cause, "Started by timer" at night)
#   STOP_BY [someone]   for stop: who stops it, written in the night's log and state (a release press, a build's Abort)
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci], RUN_RECORD_DIR [<LOG_DIR>/runs],
#   RELEASE_ARTIFACTS_DIR [<LOG_DIR>/release-artifacts], RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf]
#   For the tests (asbl/ci/tests/test-scheduled-e2e.sh): SCHEDULED_DATE (the night's date), SCHEDULED_COMMIT (the commit
#   under test, nothing fetched), SCHEDULED_PACKAGE_DIR [<repo>/asbl/target/package], SCHEDULED_BUSY (replaces
#   release-rehearsal.sh busy), SCHEDULED_FOLLOW_CI [bash asbl/ci/jenkins/follow-ci.sh] (what runs a lane),
#   SCHEDULED_DP_CI [bash asbl/ci/dp-ci.sh] (the build and the VM's stop),
#   SCHEDULED_POLL [60] (seconds between two looks at a fix round)
#
# THE NIGHT'S FOLDER  <RUN_RECORD_DIR>/<UTC>-scheduled-e2e/, in the release orchestrator's format, so the fixer and the job
#   read it as they read a release run's:
#   run.log      the console: the NIGHT lines, each set's builds and its lane's console
#   night.state  key=value: state (running|fixing|green|red|stopped), why, night, sets, commit, on_failures, dry_run,
#                started_by, started, updated, driver_pid, set (the set going), fix_run, fix_plan
#   started.txt  what each set starts, written before it starts (the kinds of release-orchestrator.sh's started.txt)
#   <set>.rc     each set's exit code
#   result.txt   result, dry_run, run_kind=scheduled, night, sets, version, pin, kept (empty), step1=not-run, summary,
#                flaky; then one line per set: part <TAB> <set> <TAB> host|windows-vm <TAB> PASS|FAIL|NOT_RUN <TAB> <log>
#                <TAB> <reports> <TAB> <why>
#   flaky.txt    the tests that passed only on a retry (release-orchestrator.sh flaky)
#   The night's process holds <LOG_DIR>/scheduled-e2e.pid while it lives, its fix round included.
#
# EXIT CODES of status and follow (and the state they name): 0 green; 1 red (its fix round may still go: fixing);
#   2 no night yet; 4 stopped; 5 running
#
# EXAMPLES
#   SCHEDULED_STARTED_BY=<name> DRY_RUN=yes bash asbl/ci/jenkins/scheduled-e2e.sh start
#   bash asbl/ci/jenkins/scheduled-e2e.sh plan 2026-11-07            # a Saturday: the light set, then the full set
#   SCHEDULED_STARTED_BY=<name> ON_FAILURES=report-only bash asbl/ci/jenkins/scheduled-e2e.sh start
#   bash asbl/ci/jenkins/scheduled-e2e.sh follow
#   DRY_RUN=yes bash asbl/ci/jenkins/scheduled-e2e.sh clean
#
# Callers: the Jenkins job dp-ci-dev-scheduled-e2e; release-rehearsal.sh (stop, before a release); a person or an agent.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO=$PWD
SELF="$REPO/asbl/ci/jenkins/$(basename "$0")"   # the detached night runs this file again, from anywhere

LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
RUN_RECORD_DIR="${RUN_RECORD_DIR:-$LOG_DIR/runs}"
RELEASE_ARTIFACTS_DIR="${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}"
RELEASE_REHEARSAL_CONF="${RELEASE_REHEARSAL_CONF:-/root/release-rehearsal.conf}"
SCHEDULED_PACKAGE_DIR="${SCHEDULED_PACKAGE_DIR:-$REPO/asbl/target/package}"
SCHEDULED_BUSY="${SCHEDULED_BUSY:-bash asbl/ci/jenkins/release-rehearsal.sh busy}"
SCHEDULED_FOLLOW_CI="${SCHEDULED_FOLLOW_CI:-bash asbl/ci/jenkins/follow-ci.sh}"
SCHEDULED_DP_CI="${SCHEDULED_DP_CI:-bash asbl/ci/dp-ci.sh}"
SCHEDULED_POLL="${SCHEDULED_POLL:-60}"
ON_FAILURES="${ON_FAILURES:-fix}"
DRY_RUN="${DRY_RUN:-no}"
NIGHT_PID="$LOG_DIR/scheduled-e2e.pid"   # release-rehearsal.sh reads it: a night going is stopped before a release
WIN_PID="$LOG_DIR/win-e2e.pid"           # win-e2e.sh's one pid file for every Windows lane
DOCKER_SERVER_BUNDLE="$REPO/frend/reporting/testground/docker-server/DataPallas"   # dp-ci.sh docker_server_up's folder
HTML_REPORTS_KEPT_DAYS=14                # the plan's design: old HTML reports go, so the disk stays free
UNREADABLE_FIX_STATUS_LIMIT=20           # that many looks in a row with no FIX_STATUS line: the night stops waiting
SETTINGS_XML=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml   # the version, as release-state.sh reads it

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
say() { echo "NIGHT   $(now) $*"; }
print_header() { sed -n '2,/^set -uo pipefail$/p' "$SELF" | sed '$d'; }
usage() { print_header; exit 2; }

# ---- which sets a night runs, and what each one takes ----
# night_sets <YYYY-MM-DD>: the sets of the night that starts on that UTC day, in the order they run
night_sets() {
  local weekday iso_week
  weekday=$(date -u -d "$1" +%u) iso_week=$(date -u -d "$1" +%V) || return 2
  echo linux-light
  if [ "$weekday" = 6 ]; then
    if [ $((10#$iso_week % 2)) = 0 ]; then echo full-web; else echo full-docker-server; fi
  fi
  [ "$weekday" != 7 ] || echo windows-server-light
}
# set_builds <set>: the builds that set takes, the image first (its rebuild also makes this host's e2e package again)
set_builds() {
  case "$1" in
    linux-light|full-docker-server) echo "image-and-zips e2e-package" ;;
    full-web)                       echo "e2e-package" ;;
    windows-server-light)           echo "image-and-zips e2e-package windows-pack" ;;
  esac
}
set_machine() { case "$1" in windows-*) echo windows-vm ;; *) echo host ;; esac; }

# newest_kept_pack: the newest kept folder holding a Windows pack (its MANIFEST has windows.file lines), or nothing
newest_kept_pack() {
  local dir
  for dir in $(ls -1dt "$RELEASE_ARTIFACTS_DIR"/*/ 2>/dev/null); do
    grep -q '^windows\.file=' "$dir/MANIFEST.txt" 2>/dev/null && { echo "${dir%/}"; return 0; }
  done
}
# build_origin <build> <set>: "<commit> <what it is>" of the build that set would take, or "- <why there is none>"
build_origin() {
  local f tag commit dir
  case "$1/$2" in
    image-and-zips/*)
      for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
        grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
        tag=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
        [ -n "$tag" ] && { echo "${tag#*-} the build $tag ($f)"; return; }
      done
      echo "- no successful build log in $LOG_DIR" ;;
    e2e-package/windows-*)
      for f in $(ls -1t "$LOG_DIR"/*-win-*.log 2>/dev/null); do
        commit=$(grep -aoP '^WIN_E2E_PACKAGE=(current|built|reused) \(\K[0-9a-f]+' "$f" | tail -1)
        [ -n "$commit" ] && { echo "$commit the VM's package ($f)"; return; }
      done
      echo "- no Windows log here says what the VM's package is built from" ;;
    e2e-package/*)
      if [ ! -d "$SCHEDULED_PACKAGE_DIR/verified-db-noexe/DataPallas" ]; then echo "- no e2e package in $SCHEDULED_PACKAGE_DIR"
      elif [ "$(grep -c . "$SCHEDULED_PACKAGE_DIR/.built-from" 2>/dev/null)" != 1 ]; then
        echo "- the package's stamp $SCHEDULED_PACKAGE_DIR/.built-from is not one line: no clean build of one commit"
      else echo "$(head -n 1 "$SCHEDULED_PACKAGE_DIR/.built-from") the package ($SCHEDULED_PACKAGE_DIR)"; fi ;;
    windows-pack/*)
      dir=$(newest_kept_pack)
      if [ -n "$dir" ]; then echo "$(sed -n 's/^commit=//p' "$dir/MANIFEST.txt" | head -1) the kept pack $dir"
      else echo "- no kept folder in $RELEASE_ARTIFACTS_DIR holds a Windows pack"; fi ;;
  esac
}
# build_answer <build> <set> <commit under test>: prints "BUILD <build>: reuse|rebuild ..." and sets BUILD_ANSWER
build_answer() {
  local from what answer why
  read -r from what <<< "$(build_origin "$1" "$2")"
  case "$from" in
    -)       from="" ;;
    *-dirty) what="$what (a build of a dirty tree is of no commit)" from="" ;;
  esac
  if [ -z "$from" ]; then
    answer=rebuild why="none to reuse: $what"
  else
    reuse_or_rebuild "$from" "$3"
    case "$1" in
      e2e-package)    answer=$RR_E2E_PACKAGE why=$RR_WHY_E2E_PACKAGE ;;
      image-and-zips) answer=$RR_IMAGE_AND_ZIPS why=$RR_WHY_IMAGE_AND_ZIPS ;;
      windows-pack)   answer=$RR_WINDOWS_PACK why=$RR_WHY_WINDOWS_PACK ;;
    esac
    if [ -n "$RR_NOTE" ]; then answer=rebuild why="the rule cannot answer: $RR_NOTE"
    elif [ "$answer" = reuse ]; then why="$what, built from ${from:0:8}: nothing it ships changed since"
    else why="$what, built from ${from:0:8}: it ships what changed since: $why"; fi
  fi
  BUILD_ANSWER=$answer
  echo "BUILD   $1: $answer ($why)"
}
# shellcheck source=../reuse-or-rebuild.sh
. asbl/ci/reuse-or-rebuild.sh

# commit_under_test: origin/main fetched, as the lanes' own sync takes it (HEAD when this checkout is ahead); a dry run
# fetches nothing; SCHEDULED_COMMIT replaces it
commit_under_test() {
  if [ -n "${SCHEDULED_COMMIT:-}" ]; then git rev-parse --verify -q "$SCHEDULED_COMMIT^{commit}"; return; fi
  [ "$DRY_RUN" = yes ] || git fetch -q origin || return 1
  if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then git rev-parse origin/main; else git rev-parse HEAD; fi
}

# ---- the night's folder ----
newest_night() { ls -1d "$RUN_RECORD_DIR"/*-scheduled-e2e/ 2>/dev/null | sort | tail -1 | sed 's#/$##'; }
state_get() { sed -n "s/^$2=//p" "$1/night.state" 2>/dev/null | tail -1; }
# state_set <night folder> <key=value>...: those keys rewritten in one move (a reader never sees half a file)
state_set() {
  local dir="$1" tmp keys; shift
  keys=$(printf '%s\n' "$@" updated= | sed 's/=.*//' | paste -sd'|')
  tmp=$(mktemp "$dir/.night.state.XXXXXX") || return 1
  { grep -v -E "^($keys)=" "$dir/night.state" 2>/dev/null; printf '%s\n' "$@" | tr -d '\r'; echo "updated=$(now)"; } > "$tmp" &&
    mv -f "$tmp" "$dir/night.state"
}
night_process_alive() { local pid; pid=$(cat "$NIGHT_PID" 2>/dev/null); [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }
# night_state <folder>: its recorded state, or stopped when it says running or fixing and its process is gone (a reboot)
night_state() {
  local state; state=$(state_get "$1" state)
  case "$state" in running|fixing)
    [ "$(state_get "$1" driver_pid)" = "$(cat "$NIGHT_PID" 2>/dev/null)" ] && night_process_alive || state=stopped ;;
  esac
  echo "${state:-none}"
}
exit_code_of_state() { case "$1" in green) echo 0 ;; red|fixing) echo 1 ;; stopped) echo 4 ;; running) echo 5 ;; *) echo 2 ;; esac; }
status_line() {
  local dir="$1"
  [ -n "$dir" ] || { echo "NIGHT state=none: no night yet"; return; }
  echo "NIGHT state=$(night_state "$dir") night=$(state_get "$dir" night | tr ' ' '-') sets=$(state_get "$dir" sets | tr ' ' ',') commit=$(state_get "$dir" commit | cut -c1-8) result=$dir/result.txt"
}

# ---- the fixer, as the release round reads it ----
RELEASE_FIXER=""
read_fixer() {  # RELEASE_FIXER from the settings file, when only its owner may read it (it names commands this host runs)
  [ -e "$RELEASE_REHEARSAL_CONF" ] || return 0
  [ "$(stat -c %u "$RELEASE_REHEARSAL_CONF")" = "$(id -u)" ] && case "$(stat -c %a "$RELEASE_REHEARSAL_CONF")" in 600|400) true ;; *) false ;; esac ||
    { echo "WARN    $RELEASE_REHEARSAL_CONF may be read by others: no fixer taken from it (chmod 600)"; return 0; }
  RELEASE_FIXER=$(. "$RELEASE_REHEARSAL_CONF" >/dev/null 2>&1; printf '%s' "${RELEASE_FIXER:-}")
}
fixer_status() {  # fixer_status <fix run>: RUNNING|DONE|BLOCKED|STOPPED and the plan's status line, or UNKNOWN <what it said>
  local out
  out=$(DRY_RUN="$DRY_RUN" $RELEASE_FIXER status "$1" 2>&1)
  printf '%s\n' "$out" | sed -n 's/^FIX_STATUS=//p' | tail -1 | grep . || echo "UNKNOWN $(printf '%s' "$out" | tail -1)"
}

# ---- one set ----
# what_set_starts <set>: what it starts that outlives this script's processes, one "<kind> TAB <name> TAB <what>" line
# each, as release-orchestrator.sh's what_part_starts names them
what_set_starts() {
  case "$1" in
    full-web) printf 'container\tdp-ci\tthe run container of dp-ci.sh\n' ;;
    full-docker-server|linux-light)
      printf 'container\tdp-ci\tthe run container of dp-ci.sh\ncompose\t%s\tthe docker-server bundle under test\n' "$DOCKER_SERVER_BUNDLE"
      [ "$1" != linux-light ] || printf 'container\tdp-ci-one-command\tthe image alone, run as the self-host page says\n' ;;
    windows-server-light) printf 'pidfile\t%s\tthe Windows driver of win-e2e.sh\nvm\twindows-vm\tdp-ci.sh win server-e2e\n' "$WIN_PID" ;;
  esac
}
# newest_log_since <link> <epoch>: the log the link points at, when written since then (the lane's own)
newest_log_since() { local l; l=$(readlink -f "$1" 2>/dev/null) || return 0; [ -f "$l" ] && [ "$(stat -c %Y "$l")" -ge "$2" ] && echo "$l"; }
# run_set <night folder> <n> <of> <set> <commit>: the set's builds, then its lane through follow-ci.sh; its .rc and its
# part line (SET_LINE). Returns the lane's exit code
run_set() {
  local dir="$1" n="$2" of="$3" set="$4" under="$5" build reuse="" kept="" rebuild_pack=no lane_env launcher pidfile link
  local t0 rc log json reports kind name what why=""
  say "SET $n/$of START $set"
  state_set "$dir" set="$set"
  while IFS=$'\t' read -r kind name what; do
    [ -n "$kind" ] && printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(now)" "$set" "$kind" "$name" "$([ "$DRY_RUN" = yes ] && echo dry-run || echo real)" "$what" >> "$dir/started.txt"
  done <<< "$(what_set_starts "$set")"
  for build in $(set_builds "$set"); do
    build_answer "$build" "$set" "$under"
    case "$build/$BUILD_ANSWER" in
      image-and-zips/reuse|e2e-package/reuse) reuse="${reuse:+$reuse }$build" ;;
      image-and-zips/rebuild)
        if [ "$DRY_RUN" = yes ]; then echo "WOULD   $SCHEDULED_DP_CI build-if-needed"
        elif ! $SCHEDULED_DP_CI build-if-needed; then why="the build failed (dp-ci.sh build-if-needed, above)"; fi ;;
      windows-pack/reuse)   kept=$(newest_kept_pack) ;;
      windows-pack/rebuild) kept=$(newest_kept_pack) rebuild_pack=yes ;;
    esac
  done
  case "$set" in
    linux-light)
      lane_env=(E2E_TARGET=docker-server E2E_SPEC=light E2E_DOCKER_ONE_COMMAND=yes) launcher=(bash asbl/ci/dp-ci.sh e2e)
      pidfile="" link="$LOG_DIR/latest.log" ;;
    full-web|full-docker-server)
      lane_env=(E2E_TARGET="${set#full-}" E2E_SPEC= E2E_DOCKER_ONE_COMMAND=) launcher=(bash asbl/ci/dp-ci.sh e2e)
      pidfile="" link="$LOG_DIR/latest.log" ;;
    windows-server-light)
      lane_env=(E2E_SPEC= RELEASE_KEPT="$kept" REBUILD_PACK="$rebuild_pack") launcher=(bash asbl/ci/jenkins/win-e2e.sh server-e2e)
      pidfile="$WIN_PID" link="$LOG_DIR/win-e2e-latest.log" ;;
  esac
  lane_env+=(E2E_GREP= E2E_RETRIES=1 E2E_ROTATION_DATE= E2E_PACKAGE= E2E_DOCKER_FROM_URL= E2E_REUSE_BUILD="$reuse" E2E_KEPT_BUILD=
             E2E_BUILD_IMAGE_FILE= FOLLOW_PIDFILE="$pidfile")
  if [ -n "$why" ]; then rc=1 log=""
  elif [ "$DRY_RUN" = yes ]; then
    echo "WOULD   $(printf '%q ' "${lane_env[@]}")bash asbl/ci/jenkins/follow-ci.sh run ${launcher[*]}"; rc=0 log=""
  else
    t0=$(date +%s)
    env "${lane_env[@]}" $SCHEDULED_FOLLOW_CI run "${launcher[@]}"; rc=$?
    log=$(newest_log_since "$link" "$t0")
    [ "$rc" = 0 ] || why="rc=$rc"
  fi
  echo "$rc" > "$dir/$set.rc"
  case "$set" in
    windows-*) json=$([ -n "$log" ] && grep -aoP '^WIN_E2E_REPORT=\K\S+' "$log" | tail -1)
               [ -n "$json" ] || json="${log:+${log%.log}-step-playwright.json}" ;;
    *)         json="${log:+${log%.log}-playwright.json}" ;;
  esac
  reports="${json:+$json ${json%.json}-html}"
  SET_LINE=$(printf 'part\t%s\t%s\t%s\t%s\t%s\t%s' "$set" "$(set_machine "$set")" "$([ "$rc" = 0 ] && echo PASS || echo FAIL)" "${log:-$dir/run.log}" "$reports" "$why")
  say "SET $n/$of END $set rc=$rc${log:+ log $log}"
  return "$rc"
}

# write_result <night folder> <green|red> <part lines>: result.txt and flaky.txt, as the release orchestrator writes them
write_result() {
  local dir="$1" result="$2" parts="$3" under version flaky_args=() set report
  under=$(state_get "$dir" commit)
  version=$(git show "$under:$SETTINGS_XML" 2>/dev/null | grep -m1 -oP '(?<=<version>)[^<]+')
  while IFS=$'\t' read -r set report; do
    case "$report" in *.json) [ -f "$report" ] && flaky_args+=("$set" "$report") ;; esac
  done < <(printf '%s\n' "$parts" | awk -F'\t' '$1 == "part" { split($6, r, " "); print $2 "\t" r[1] }')
  if [ "${#flaky_args[@]}" = 0 ]; then : > "$dir/flaky.txt"
  else bash asbl/ci/jenkins/release-orchestrator.sh flaky "${flaky_args[@]}" > "$dir/flaky.txt"; fi
  {
    echo "# the result of a scheduled night (asbl/ci/jenkins/scheduled-e2e.sh), in the release orchestrator's format"
    echo "result=$result"
    echo "dry_run=$DRY_RUN"
    echo "run_kind=scheduled"
    echo "night=$(state_get "$dir" night)"
    echo "sets=$(state_get "$dir" sets)"
    echo "version=$version"
    echo "pin=$under"
    echo "kept="
    echo "step1=not-run"
    echo "summary=$dir/run.log"
    echo "flaky=$dir/flaky.txt"
    printf '%s\n' "$parts"
  } > "$dir/result.txt"
}

# fix_round <night folder>: the fixer's round on the red night, waited for, holding the pid file (the next night skips,
# a release press stops it); it runs nothing again
fix_round() {
  local dir="$1" out name plan status unreadable=0
  out=$(DRY_RUN="$DRY_RUN" $RELEASE_FIXER start "$dir" 1 2>&1); printf '%s\n' "$out"
  name=$(printf '%s\n' "$out" | sed -n 's/^FIX_RUN=//p' | tail -1)
  plan=$(printf '%s\n' "$out" | sed -n 's/^FIX_PLAN=//p' | tail -1)
  if [ -z "$name" ]; then
    state_set "$dir" state=red why="red; the fix round could not start (the fixer's output above)"
    say "NIGHT END result=red: the fix round could not start (above)"; return
  fi
  state_set "$dir" state=fixing fix_run="$name" fix_plan="$plan" why="red; fix round $name going: $plan"
  say "NIGHT END result=red: fix round 1 started: $plan (run $name). This night's process waits for it; the next night skips while it goes"
  while :; do
    status=$(fixer_status "$name")
    case "${status%% *}" in
      DONE|BLOCKED|STOPPED) break ;;
      UNKNOWN) unreadable=$((unreadable + 1))
               [ "$unreadable" -lt "$UNREADABLE_FIX_STATUS_LIMIT" ] || { status="BLOCKED the fixer's status could not be read $unreadable times in a row: ${status#* }"; break; } ;;
      *) unreadable=0 ;;
    esac
    sleep "$SCHEDULED_POLL"
  done
  state_set "$dir" state=red why="red; fix round 1 ${status%% *}: ${status#* }"
  say "FIX ROUND 1 END: $status"
}

# the night itself, in the folder start made (started detached by start)
night() {
  local dir="$1" under sets set n=0 of parts="" failed=0
  echo $$ > "$NIGHT_PID"
  trap 'rm -f "$NIGHT_PID"' EXIT
  state_set "$dir" driver_pid=$$
  . asbl/ci/marks.sh
  RUN_WHO=$(state_get "$dir" started_by) RUN_WHAT="scheduled e2e $(state_get "$dir" night)" RUN_T0=$(state_get "$dir" started)
  RUN_DIR="$dir" RUN_HISTORY="${RUN_HISTORY:-$RUN_RECORD_DIR/history.tsv}"
  echo "STARTED_BY=$RUN_WHO  $RUN_T0  :: $RUN_WHAT"
  under=$(commit_under_test) || { state_set "$dir" state=red why="the commit under test could not be read (git fetch origin)"
    say "NIGHT END result=red: the commit under test could not be read (git fetch origin)"; run_record_end FAIL -; exit 1; }
  sets=$(state_get "$dir" sets)
  state_set "$dir" commit="$under"
  say "the night of $(state_get "$dir" night): $sets, on ${under:0:8} (origin/main$([ "$DRY_RUN" = yes ] && echo ", dry run: nothing runs"))"
  of=$(wc -w <<< "$sets")
  for set in $sets; do
    n=$((n + 1))
    mark_start "NIGHT SET $n/$of" "$set"
    run_set "$dir" "$n" "$of" "$set" "$under" || failed=$((failed + 1))
    mark_end "$(cat "$dir/$set.rc")"
    parts="${parts:+$parts$'\n'}$SET_LINE"
  done
  if [ "$failed" = 0 ]; then
    write_result "$dir" green "$parts"; state_set "$dir" state=green why="every set passed" set=
    say "NIGHT END result=green: every set passed ($sets)"
    run_record_end "$([ "$DRY_RUN" = yes ] && echo DRY-RUN || echo SUCCESS)" "$under"; exit 0
  fi
  write_result "$dir" red "$parts"; state_set "$dir" set=
  run_record_end FAILURE "$under"
  read_fixer
  if [ "$ON_FAILURES" = report-only ]; then
    state_set "$dir" state=red why="red: $failed set(s) failed; report-only"
    say "NIGHT END result=red: $failed set(s) failed (ON_FAILURES=report-only: no fix round; the result: $dir/result.txt)"
  elif [ -z "$RELEASE_FIXER" ]; then
    state_set "$dir" state=red why="red: $failed set(s) failed; no fixer set ($RELEASE_REHEARSAL_CONF), so report-only"
    say "NIGHT END result=red: $failed set(s) failed; no fixer set (RELEASE_FIXER in $RELEASE_REHEARSAL_CONF): report-only"
  else
    fix_round "$dir"
  fi
  exit 1
}

# ---- the subcommands ----
clean_html_reports() {
  local found=0 dir
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    found=$((found + 1))
    if [ "$DRY_RUN" = yes ]; then echo "WOULD   delete $dir"; else rm -rf -- "$dir" && echo "DELETED $dir"; fi
  done < <(find "$LOG_DIR" -mindepth 1 -maxdepth 1 -type d -name '*-playwright-html' -mmin +$((HTML_REPORTS_KEPT_DAYS * 24 * 60)) 2>/dev/null | sort)
  echo "CLEAN   $found Playwright HTML report(s) older than $HTML_REPORTS_KEPT_DAYS days $([ "$DRY_RUN" = yes ] && echo "would go (dry run)" || echo gone) (the top of $LOG_DIR only)"
}

start_night() {
  local who night date sets dir out
  case "$ON_FAILURES" in fix|report-only) ;; *) echo "FAIL  ON_FAILURES must be fix or report-only (got '$ON_FAILURES')"; exit 2 ;; esac
  case "$DRY_RUN" in yes|no) ;; *) echo "FAIL  DRY_RUN must be yes or no (got '$DRY_RUN')"; exit 2 ;; esac
  who="${SCHEDULED_STARTED_BY:-}"
  [ -n "$who" ] || { echo "MISSING SCHEDULED_STARTED_BY: who starts this night (the job passes its build's cause)"; exit 2; }
  clean_html_reports
  if night_process_alive; then
    dir=$(newest_night)
    echo "SKIPPED: the night of $(state_get "$dir" night) is still going ($(state_get "$dir" why || true); $(status_line "$dir"))"; exit 0
  fi
  out=$($SCHEDULED_BUSY 2>&1)
  case "$out" in BUSY*) echo "SKIPPED: the CI is busy: ${out#BUSY }"; exit 0 ;; FREE*) ;;
    *) echo "SKIPPED: could not tell whether the CI is busy (release-rehearsal.sh busy said: $(printf '%s' "$out" | tail -1))"; exit 0 ;; esac
  date="${SCHEDULED_DATE:-$(date -u +%F)}"
  night="$date $(date -u -d "$date" +%A)" || { echo "FAIL  SCHEDULED_DATE must be a date (got '$date')"; exit 2; }
  sets=$(night_sets "$date" | paste -sd' ')
  # one folder per start, named by its time, so the newest sorts last (a second start in the same second waits one)
  dir="$RUN_RECORD_DIR/$(date -u +%Y%m%dT%H%M%SZ)-scheduled-e2e"
  while [ -e "$dir" ]; do sleep 1; dir="$RUN_RECORD_DIR/$(date -u +%Y%m%dT%H%M%SZ)-scheduled-e2e"; done
  mkdir -p "$dir" || { echo "FAIL  cannot make $dir"; exit 2; }
  state_set "$dir" state=running why="started" night="$night" sets="$sets" on_failures="$ON_FAILURES" dry_run="$DRY_RUN" \
    started_by="$who" started="$(now)"
  # setsid: the night leads a process group of its own (stop ends it whole), and no SSH session or Jenkins build holds it.
  # The pid is written here, before this returns, so a follow right after sees the night alive
  ON_FAILURES="$ON_FAILURES" DRY_RUN="$DRY_RUN" setsid nohup bash "$SELF" night "$dir" >> "$dir/run.log" 2>&1 < /dev/null &
  echo "$!" > "$NIGHT_PID"
  state_set "$dir" driver_pid="$!"
  echo "STARTED the night of $night: $sets$([ "$DRY_RUN" = yes ] && echo " (dry run)")"
  echo "log: $dir/run.log"
  exit 5
}

# follow_night [--from <byte>] [--for <seconds>]: as release-rehearsal.sh follow, for the newest night
follow_night() {
  local from=0 for_seconds="" dir log size state t0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --from) from="${2:-0}"; shift 2 ;;
      --for)  for_seconds="${2:-}"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ "$from" =~ ^[0-9]+$ ]] && { [ -z "$for_seconds" ] || [[ "$for_seconds" =~ ^[0-9]+$ ]]; } || usage
  dir=$(newest_night)
  [ -n "$dir" ] || { echo "FOLLOW next=0 state=none"; exit 2; }
  log="$dir/run.log" t0=$SECONDS
  print_new_bytes() {
    local size; size=$(stat -c %s "$log" 2>/dev/null || echo 0)
    if [ "$size" -gt "$from" ]; then tail -c +"$((from + 1))" "$log" | head -c "$((size - from))"; from=$size; fi
  }
  while :; do
    print_new_bytes
    state=$(night_state "$dir")
    # the tests ended (a fix round may go on: the night's process waits for it), or the night ended or is gone
    if { grep -aq '^NIGHT   [^ ]* NIGHT END ' "$log" 2>/dev/null && [ "$state" != running ]; } ||
       { [ "$state" != running ] && [ "$state" != fixing ]; }; then
      sleep 1; print_new_bytes; break
    fi
    [ -z "$for_seconds" ] || [ $((SECONDS - t0)) -lt "$for_seconds" ] || break
    sleep 2
  done
  local ended=no
  ! grep -aq '^NIGHT   [^ ]* NIGHT END ' "$log" 2>/dev/null || ended=yes
  echo
  echo "FOLLOW next=$from state=$state ended=$ended"
  exit "$(exit_code_of_state "$state")"
}

night_label() {
  local dir set rc word line=""
  dir=$(newest_night)
  [ -n "$dir" ] || { echo "no night yet"; return; }
  for set in $(state_get "$dir" sets); do
    if [ -f "$dir/$set.rc" ]; then [ "$(cat "$dir/$set.rc")" = 0 ] && word=PASS || word=FAIL
    elif [ "$(state_get "$dir" set)" = "$set" ] && [ "$(night_state "$dir")" = running ]; then word=going
    else word="not run"; fi
    line="${line:+$line, }$set $word"
  done
  case "$(night_state "$dir")" in
    fixing)  line="$line; fix round going" ;;
    stopped) line="$line; stopped" ;;
    red)     [ -z "$(state_get "$dir" fix_run)" ] || line="$line; fix round ended" ;;
  esac
  echo "$(state_get "$dir" night): $line$([ "$(state_get "$dir" dry_run)" = yes ] && echo " (dry run)")"
}

night_reports() {
  local dir file set report
  dir=$(newest_night)
  [ -n "$dir" ] && [ -f "$dir/result.txt" ] || return 0
  echo "REPORT night $dir/result.txt"
  for file in summary flaky; do
    report=$(sed -n "s/^$file=//p" "$dir/result.txt" | head -1)
    [ -n "$report" ] && [ -e "$report" ] && echo "REPORT night $report"
  done
  awk -F'\t' '$1 == "part" { print $2 "\t" $6 }' "$dir/result.txt" | while IFS=$'\t' read -r set reports; do
    for report in $reports; do
      case "$report" in
        *.json) [ -e "$report" ] && echo "REPORT $set $report"
                [ -e "${report%.json}.xml" ] && echo "REPORT $set ${report%.json}.xml" ;;
      esac
    done
  done
}

# stop_night: its process group, what its set going started (only when made since the set began), its fix run
stop_night() {
  local dir pid state utc set_name kind name real what since containers container created step
  dir=$(newest_night)
  [ -n "$dir" ] || { echo "NOTHING TO STOP: no night yet"; exit 4; }
  state=$(night_state "$dir")
  case "$state" in running|fixing) ;; *) echo "the night had ended already ($state): nothing to stop"; status_line "$dir"; exit 4 ;; esac
  pid=$(state_get "$dir" driver_pid)
  kill -TERM -- "-$pid" 2>/dev/null
  for _ in $(seq 1 30); do night_process_alive || break; sleep 1; done
  night_process_alive && kill -KILL -- "-$pid" 2>/dev/null
  rm -f "$NIGHT_PID"
  # what the set going started: its started.txt lines, for a set with no exit code yet
  while IFS=$'\t' read -r utc set_name kind name real what; do
    [ "$real" = real ] && [ ! -e "$dir/$set_name.rc" ] || continue
    since=$(date -u -d "$utc" +%s 2>/dev/null || echo 0)
    case "$kind" in
      container|compose)
        if [ "$kind" = container ]; then containers="$name"
        else containers=$(docker ps --filter "label=com.docker.compose.project.working_dir=$name" --format '{{.Names}}' 2>/dev/null); fi
        for container in $containers; do
          created=$(docker inspect -f '{{.Created}}' "$container" 2>/dev/null) || continue   # gone already (--rm)
          [ "$(date -u -d "$created" +%s 2>/dev/null || echo 0)" -ge "$since" ] || { echo "LEFT    container $container: older than the set"; continue; }
          docker stop "$container" >/dev/null 2>&1 && echo "STOPPED container $container" || echo "WARN    docker stop $container failed"
        done ;;
      pidfile)
        pid=$(cat "$name" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [ "$(stat -c %Y "$name")" -ge "$since" ]; then
          kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
          for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
          kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; }
          echo "STOPPED process $pid of $name"
        fi ;;
      vm)
        # the VM's scheduled tasks of the server lane (release-rehearsal.sh vm_steps_of); ending one not there does nothing
        for step in npmwc prepare server-e2e dp-server; do
          [[ "$($SCHEDULED_DP_CI win stop "$step" 2>&1)" == *"STOPPED $step"* ]] && echo "STOPPED the VM's step $step"
        done ;;
    esac
  done < "$dir/started.txt" 2>/dev/null
  if [ "$state" = fixing ] && [ -n "$(state_get "$dir" fix_run)" ]; then
    read_fixer
    [ -z "$RELEASE_FIXER" ] || { echo "stopping the fix run $(state_get "$dir" fix_run)"; DRY_RUN="$DRY_RUN" $RELEASE_FIXER stop "$(state_get "$dir" fix_run)"; }
  fi
  state_set "$dir" state=stopped why="stopped by ${STOP_BY:-someone} at $(now) (it was $state)"
  say "STOPPED by ${STOP_BY:-someone} (it was $state)" >> "$dir/run.log"
  status_line "$dir"
  exit 4
}

plan_night() {
  local date="${1:-${SCHEDULED_DATE:-$(date -u +%F)}}" under set build
  date -u -d "$date" >/dev/null 2>&1 || { echo "FAIL  not a date: '$date' (YYYY-MM-DD)"; exit 2; }
  under=$(DRY_RUN=yes commit_under_test) || { echo "FAIL  no commit under test"; exit 2; }
  echo "PLAN    the night of $date $(date -u -d "$date" +%A): $(night_sets "$date" | paste -sd' '), on ${under:0:8}"
  for set in $(night_sets "$date"); do
    echo "SET     $set ($(set_machine "$set"))"
    for build in $(set_builds "$set"); do build_answer "$build" "$set" "$under"; done
  done
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  start)   start_night ;;
  night)   [ -d "${1:-}" ] || usage; night "$1" ;;
  follow)  follow_night "$@" ;;
  status)  dir=$(newest_night); status_line "$dir"; exit "$(exit_code_of_state "$([ -n "$dir" ] && night_state "$dir")")" ;;
  label)   night_label ;;
  reports) night_reports ;;
  stop)    stop_night ;;
  plan)    plan_night "$@" ;;
  clean)   case "$DRY_RUN" in yes|no) ;; *) echo "FAIL  DRY_RUN must be yes or no"; exit 2 ;; esac; clean_html_reports ;;
  help|-h|--help) print_header ;;
  *) usage ;;
esac

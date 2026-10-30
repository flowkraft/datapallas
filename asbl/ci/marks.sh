# Sourced, not run. Marks the parts of a run that does several (a build and an e2e, a pack and its checks, a lane's
# install and its tests): a START line and an END line with the time and how long the part took, so where the time
# goes can be read back from any log (owner, 2026-10-22: "so that we could have stats where time is going"):
#
#   grep -aE '^######## ' <log>
#   ######## JOB STEP 1/2 START  2026-10-22T10:00:00Z  :: the build of this commit, when there is none yet
#   ######## JOB STEP 1/2 END rc=0  2026-10-22T10:41:07Z  took=2467s (41m7s)  :: the build of this commit, when there is none yet
#
# Parts nest (a job step holds a lane, a lane holds its own steps): each END closes the part opened last.
#   mark_start <label> <what>   opens a part
#   mark_end [rc]               closes the part opened last
#   mark_next <label> <what>    closes the open part as rc=0 and opens the next one
#   mark_run <command...>       runs it, then closes, with its rc, every part it opened and left open (an early return)
#
# A RUN STARTED FROM THE SHELL (by hand, by an agent, by the release's orchestrator) is as visible as a Jenkins build: a
# build has its "Started by", the job's history and its reports; such a run gets its first line, one line in one history
# file, and its own folder with its console (its caller copies its reports there). A build of a job passes JENKINS_BUILD
# (its BUILD_TAG): Jenkins keeps its console and reports, so it gets the first line and the history line only.
#   run_record_begin <who> <what>      prints "STARTED_BY=<who>  <UTC time>  :: <what>", the first line of the run's log;
#                                      a direct run: RUN_DIR=<RUN_RECORD_DIR>/<UTC>-<what>, and from here on its console
#                                      also goes to RUN_DIR/run.log. Returns 2 (nothing written) when <who> is empty or
#                                      the folder cannot be made
#   run_record_end <result> <commit>   one line in RUN_HISTORY, tab-separated: start, end, result, who, what, commit, log
#                                      (RUN_DIR/run.log, or the Jenkins build); a new file gets its header line first
#   RUN_RECORD_DIR [<LOG_DIR>/runs, LOG_DIR default /var/kraft-internalsystems/logs/datapallas-ci]
#   RUN_HISTORY [<RUN_RECORD_DIR>/history.tsv]   read it with: column -t -s "$(printf '\t')" <RUN_HISTORY>
MARK_LABEL=(); MARK_WHAT=(); MARK_T0=()
mark_start() {
  MARK_LABEL+=("$1"); MARK_WHAT+=("$2"); MARK_T0+=("$SECONDS")
  echo ""
  echo "######## $1 START  $(date -u +%Y-%m-%dT%H:%M:%SZ)  :: $2"
}
mark_end() {
  local i=$((${#MARK_LABEL[@]} - 1)) s
  [ "$i" -ge 0 ] || return 0
  s=$((SECONDS - MARK_T0[i]))
  echo "######## ${MARK_LABEL[i]} END rc=${1:-0}  $(date -u +%Y-%m-%dT%H:%M:%SZ)  took=${s}s ($((s / 60))m$((s % 60))s)  :: ${MARK_WHAT[i]}"
  unset 'MARK_LABEL[i]' 'MARK_WHAT[i]' 'MARK_T0[i]'
}
mark_next() { mark_end 0; mark_start "$@"; }
mark_run() {
  local depth=${#MARK_LABEL[@]} rc
  "$@"; rc=$?
  while [ "${#MARK_LABEL[@]}" -gt "$depth" ]; do mark_end "$rc"; done
  return "$rc"
}
run_record_begin() {
  RUN_WHO="$1" RUN_WHAT="$2" RUN_T0=$(date -u +%Y-%m-%dT%H:%M:%SZ) RUN_DIR=""
  RUN_RECORD_DIR="${RUN_RECORD_DIR:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/runs}"
  RUN_HISTORY="${RUN_HISTORY:-$RUN_RECORD_DIR/history.tsv}"
  [ -n "$RUN_WHO" ] || return 2
  if [ -z "${JENKINS_BUILD:-}" ]; then
    RUN_DIR="$RUN_RECORD_DIR/${RUN_T0//[-:]/}-$(printf '%s' "$RUN_WHAT" | tr -cs 'A-Za-z0-9._' '-' | cut -c1-60 | sed 's/-*$//')"
    [ ! -e "$RUN_DIR" ] || RUN_DIR="$RUN_DIR-$$"
    mkdir -p "$RUN_DIR" || { RUN_DIR=""; return 2; }
    exec > >(tee -a "$RUN_DIR/run.log") 2>&1
  fi
  echo "STARTED_BY=$RUN_WHO  $RUN_T0  :: $RUN_WHAT"
}
run_record_end() {
  local log="${RUN_DIR:+$RUN_DIR/run.log}" tab_or_newline=$'\t\n'
  [ -n "$log" ] || log="Jenkins ${JENKINS_BUILD:-?}"
  mkdir -p "$(dirname "$RUN_HISTORY")"
  [ -s "$RUN_HISTORY" ] || printf 'start\tend\tresult\twho\twhat\tcommit\tlog\n' >> "$RUN_HISTORY"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$RUN_T0" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${RUN_WHO//[$tab_or_newline]/ }" \
    "${RUN_WHAT//[$tab_or_newline]/ }" "$2" "$log" >> "$RUN_HISTORY"
  echo "RUN_HISTORY $1: one line in $RUN_HISTORY${RUN_DIR:+; the folder of this run: $RUN_DIR}"
}

#!/bin/bash
# The fix round of a red nightly run (asbl/ci/jenkins/scheduled-e2e.sh) or of a red run by hand (asbl/ci/jenkins/e2e-by-hand.sh),
# by their ON_FAILURES; a person or an agent runs the same from a shell. The release round has its own
# (asbl/ci/jenkins/release-rehearsal.sh); both hand the run's folder to the same fixer (RELEASE_FIXER in the settings file).
#
# THE TWO KINDS of fix round (start's second argument; the fixer gets it as FIX_MODE):
#   review  ON_FAILURES=fix-prove-then-wait-for-review: the fixer works in a scratch clone and commits nothing. It leaves
#           <run folder>/fix.diff (the change, against origin/main) and <run folder>/fix-report.md (each failure: cause,
#           fix, proof; "no root cause found" is an answer too). A person reads both, then:
#           proceed  that very diff applied on origin/main as it is now, committed and pushed;
#           abort    nothing reaches main; the diff and the report stay in the run folder, the failures in its result.txt.
#   push    ON_FAILURES=fix-prove-then-rerun-automatically: the fixer commits and pushes each proven fix itself, as in a
#           release round; the caller runs the same thing again after it.
#
# THE RECORD  <run folder>/fix-round.state, key=value: kind, state, why, fix_run, fix_plan, started, updated,
#   decided_by, commit. Its states:
#     fixing     the fixer's run goes
#     waiting    (review) it ended DONE with a diff: waiting for proceed or abort
#     no-fix     (review) it ended DONE with no diff: nothing to review (fix-report.md says why)
#     done       (push) it ended DONE: its fixes are on main
#     ended      it ended BLOCKED or STOPPED, or its status could not be read FIX_ROUND_UNREADABLE_LIMIT times in a row
#     proceeded  (review) the diff is on main: commit=
#     aborted    stopped or dropped by a person: decided_by=
#   fixing and waiting are open; the others are closed.
#
# SUBCOMMANDS (<run folder>: the red run's folder, an absolute path)
#   start <run folder> review|push   the fixer on that red run (its result.txt), round 1; prints FIX_RUN= and FIX_PLAN=.
#                                    Exit 0 started, 1 the fixer did not start, 2 a wrong call or a round already recorded
#   status <run folder>              asks the fixer while fixing, then one line:
#                                    FIX_ROUND state=<state> kind=<kind> run=<fix run> diff=<path|-> report=<path|-> why=<why>
#                                    Exit 0; 2 when the folder has no fix round
#   wait <run folder> [--for <seconds>]   status every FIX_ROUND_POLL seconds until it is no longer fixing (or that long);
#                                    prints the last status line. Exit 0 closed or waiting, 5 still fixing
#   proceed <run folder> <who>       (waiting only) applies fix.diff on origin/main, commits ("<run> fix, reviewed by <who>:
#                                    <the report's first line>") and pushes; prints FIX_COMMIT=<sha>. Exit 1 when the diff no
#                                    longer applies on origin/main or the push fails (the state stays waiting, why printed)
#   abort <run folder> <who>         (fixing or waiting) the fixer's run stopped when it goes; nothing reaches main
#   fixer-set                        exit 0 when a fixer is set (FIXER=<command>), 1 when none is
#   help                             this header
#
# INPUTS (environment):
#   DRY_RUN [no]   yes: the fixer gets DRY_RUN=yes (it starts nothing); proceed prints what it would commit and pushes nothing
#   RELEASE_REHEARSAL_CONF [/root/release-rehearsal.conf]   the settings file naming the fixer (RELEASE_FIXER), owner-only
#   FIX_ROUND_POLL [60]   seconds between two looks at the fixer in wait
#   FIX_ROUND_UNREADABLE_LIMIT [20]   that many looks in a row with no FIX_STATUS line: the round counts as ended
#
# EXAMPLES
#   bash asbl/ci/jenkins/fix-round.sh status <LOG_DIR>/runs/20261115T180000Z-scheduled-e2e
#   bash asbl/ci/jenkins/fix-round.sh proceed <LOG_DIR>/runs/20261115T180000Z-scheduled-e2e "<name>"
#   DRY_RUN=yes bash asbl/ci/jenkins/fix-round.sh proceed <run folder> "<name>"
#
# Callers: scheduled-e2e.sh, e2e-by-hand.sh (and through them the job dp-ci-e2e-nightly-or-by-hand);
# a person or an agent. Test: asbl/ci/tests/test-fix-round.sh.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

DRY_RUN="${DRY_RUN:-no}"
RELEASE_REHEARSAL_CONF="${RELEASE_REHEARSAL_CONF:-/root/release-rehearsal.conf}"
FIX_ROUND_POLL="${FIX_ROUND_POLL:-60}"
FIX_ROUND_UNREADABLE_LIMIT="${FIX_ROUND_UNREADABLE_LIMIT:-20}"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
usage() { sed -n '2,/^set -uo pipefail$/p' "$0" | sed '$d'; exit 2; }

# ---- the record ----
record_of() { echo "$1/fix-round.state"; }
record_get() { sed -n "s/^$2=//p" "$(record_of "$1")" 2>/dev/null | tail -1; }
# record_set <run folder> <key=value>...: those keys rewritten in one move (a reader never sees half a file)
record_set() {
  local dir="$1" tmp keys; shift
  keys=$(printf '%s\n' "$@" updated= | sed 's/=.*//' | paste -sd'|')
  tmp=$(mktemp "$dir/.fix-round.state.XXXXXX") || return 1
  { grep -v -E "^($keys)=" "$(record_of "$dir")" 2>/dev/null; printf '%s\n' "$@" | tr -d '\r'; echo "updated=$(now)"; } > "$tmp" &&
    mv -f "$tmp" "$(record_of "$dir")"
}
checked_run_folder() { [ -n "${1:-}" ] && [ -f "$1/result.txt" ] || { echo "FAIL  no result.txt in '${1:-}': give a red run's folder"; exit 2; }; }
checked_recorded() { [ -f "$(record_of "${1:-}")" ] || { echo "FAIL  no fix round recorded in '${1:-}' ($(record_of "${1:-}"))"; exit 2; }; }

# ---- the fixer, as the release round reads it ----
RELEASE_FIXER=""
read_fixer() {  # RELEASE_FIXER from the settings file, when only its owner may read it (it names commands this host runs)
  [ -e "$RELEASE_REHEARSAL_CONF" ] || return 0
  [ "$(stat -c %u "$RELEASE_REHEARSAL_CONF")" = "$(id -u)" ] && case "$(stat -c %a "$RELEASE_REHEARSAL_CONF")" in 600|400) true ;; *) false ;; esac ||
    { echo "WARN    $RELEASE_REHEARSAL_CONF may be read by others: no fixer taken from it (chmod 600)" >&2; return 0; }
  RELEASE_FIXER=$(. "$RELEASE_REHEARSAL_CONF" >/dev/null 2>&1; printf '%s' "${RELEASE_FIXER:-}")
}
fixer_status() {  # fixer_status <fix run>: RUNNING|DONE|BLOCKED|STOPPED and the plan's status line, or UNKNOWN <what it said>
  local out
  out=$(DRY_RUN="$DRY_RUN" $RELEASE_FIXER status "$1" 2>&1)
  printf '%s\n' "$out" | sed -n 's/^FIX_STATUS=//p' | tail -1 | grep . || echo "UNKNOWN $(printf '%s' "$out" | tail -1)"
}

# ---- the subcommands ----
start_round() {
  local dir="$1" kind="$2" out name plan
  checked_run_folder "$dir"
  case "$kind" in review|push) ;; *) echo "FAIL  the kind of fix round is review or push (got '$kind')"; exit 2 ;; esac
  [ ! -f "$(record_of "$dir")" ] || { echo "FAIL  $dir has a fix round already ($(record_get "$dir" state))"; exit 2; }
  read_fixer
  [ -n "$RELEASE_FIXER" ] || { echo "FAIL  no fixer set (RELEASE_FIXER in $RELEASE_REHEARSAL_CONF)"; exit 1; }
  out=$(FIX_MODE="$kind" DRY_RUN="$DRY_RUN" $RELEASE_FIXER start "$dir" 1 2>&1); printf '%s\n' "$out"
  name=$(printf '%s\n' "$out" | sed -n 's/^FIX_RUN=//p' | tail -1)
  plan=$(printf '%s\n' "$out" | sed -n 's/^FIX_PLAN=//p' | tail -1)
  [ -n "$name" ] || { echo "FAIL  the fix round could not start (the fixer's output above)"; exit 1; }
  record_set "$dir" kind="$kind" state=fixing why="the fixer's run $name goes: $plan" fix_run="$name" fix_plan="$plan" started="$(now)"
}

# refresh <run folder>: while fixing, the fixer's answer moves the record on (UNREADABLE counts the looks with no answer)
UNREADABLE=0
refresh() {
  local dir="$1" status
  [ "$(record_get "$dir" state)" = fixing ] || return 0
  read_fixer
  [ -n "$RELEASE_FIXER" ] || { record_set "$dir" state=ended why="no fixer set any more: its run cannot be asked"; return 0; }
  status=$(fixer_status "$(record_get "$dir" fix_run)")
  case "${status%% *}/$(record_get "$dir" kind)" in
    DONE/review) if [ -s "$dir/fix.diff" ]; then record_set "$dir" state=waiting why="the fix waits for review: ${status#* }"
                 else record_set "$dir" state=no-fix why="no diff: ${status#* }"; fi ;;
    DONE/push)   record_set "$dir" state=done why="its fixes are on main: ${status#* }" ;;
    BLOCKED/*|STOPPED/*) record_set "$dir" state=ended why="${status%% *}: ${status#* }" ;;
    UNKNOWN/*)   UNREADABLE=$((UNREADABLE + 1))
                 [ "$UNREADABLE" -lt "$FIX_ROUND_UNREADABLE_LIMIT" ] ||
                   record_set "$dir" state=ended why="the fixer's status could not be read $UNREADABLE times in a row: ${status#* }" ;;
    *)           UNREADABLE=0 ;;
  esac
}
status_line() {
  local dir="$1" diff=- report=-
  [ -s "$dir/fix.diff" ] && diff="$dir/fix.diff"
  [ -s "$dir/fix-report.md" ] && report="$dir/fix-report.md"
  echo "FIX_ROUND state=$(record_get "$dir" state) kind=$(record_get "$dir" kind) run=$(record_get "$dir" fix_run) diff=$diff report=$report why=$(record_get "$dir" why)"
}

wait_round() {
  local dir="$1" for_seconds="" t0=$SECONDS
  shift
  case "${1:-}" in --for) for_seconds="${2:-}"; [[ "$for_seconds" =~ ^[0-9]+$ ]] || usage ;; "") ;; *) usage ;; esac
  while :; do
    refresh "$dir"
    [ "$(record_get "$dir" state)" = fixing ] || break
    [ -z "$for_seconds" ] || [ $((SECONDS - t0)) -lt "$for_seconds" ] || break
    sleep "$FIX_ROUND_POLL"
  done
  status_line "$dir"
  [ "$(record_get "$dir" state)" != fixing ] || exit 5
}

# proceed: a worktree of origin/main as it is now, the diff applied with its index, one commit, one push; the worktree goes
proceed_round() {
  local dir="$1" who="$2" run summary message work commit rc=1
  [ "$(record_get "$dir" state)" = waiting ] || { echo "FAIL  nothing waits for review in $dir: $(status_line "$dir")"; exit 1; }
  run=$(basename "$dir")
  summary=$(grep -m1 . "$dir/fix-report.md" 2>/dev/null | sed 's/^#* *//' | cut -c1-120)
  message="$run fix, reviewed by $who: ${summary:-see its fix-report.md}"
  if [ "$DRY_RUN" = yes ]; then
    echo "WOULD   apply $dir/fix.diff on origin/main, commit \"$message\" and push it to main"; return 0
  fi
  git fetch -q origin || { echo "FAIL  git fetch origin failed: nothing applied"; exit 1; }
  work=$(mktemp -d "${TMPDIR:-/tmp}/fix-round-proceed.XXXXXX") && rmdir "$work" || exit 1
  git worktree add -q --detach "$work" origin/main || { echo "FAIL  no worktree of origin/main at $work"; exit 1; }
  if ! git -C "$work" apply --index "$dir/fix.diff"; then
    echo "FAIL  the diff no longer applies on origin/main $(git rev-parse --short origin/main): it still waits (fix it, or abort)"
  elif ! git -C "$work" commit -q -m "$message"; then
    echo "FAIL  the commit failed (above): nothing pushed, it still waits"
  elif ! git -C "$work" push -q origin HEAD:main; then
    echo "FAIL  the push to main failed (above; main moved?): nothing pushed, it still waits: proceed again"
  else
    commit=$(git -C "$work" rev-parse HEAD) rc=0
  fi
  git worktree remove --force "$work" >/dev/null 2>&1
  [ "$rc" = 0 ] || exit 1
  record_set "$dir" state=proceeded commit="$commit" decided_by="$who" why="proceeded by $who: $commit on main"
  echo "FIX_COMMIT=$commit"
}

abort_round() {
  local dir="$1" who="$2" state
  state=$(record_get "$dir" state)
  case "$state" in fixing|waiting) ;; *) echo "FAIL  nothing open to abort in $dir: $(status_line "$dir")"; exit 1 ;; esac
  if [ "$state" = fixing ]; then
    read_fixer
    [ -z "$RELEASE_FIXER" ] || { echo "stopping the fixer's run $(record_get "$dir" fix_run)"; DRY_RUN="$DRY_RUN" $RELEASE_FIXER stop "$(record_get "$dir" fix_run)"; }
  fi
  record_set "$dir" state=aborted decided_by="$who" why="aborted by $who at $(now) (it was $state): nothing reached main"
  status_line "$dir"
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  start)     [ "$#" = 2 ] || usage; start_round "$1" "$2" ;;
  status)    [ "$#" = 1 ] || usage; checked_recorded "$1"; refresh "$1"; status_line "$1" ;;
  wait)      [ "$#" -ge 1 ] || usage; checked_recorded "$1"; wait_round "$@" ;;
  proceed)   [ "$#" = 2 ] && [ -n "$2" ] || usage; checked_recorded "$1"; refresh "$1"; proceed_round "$1" "$2" ;;
  abort)     [ "$#" = 2 ] && [ -n "$2" ] || usage; checked_recorded "$1"; refresh "$1"; abort_round "$1" "$2" ;;
  fixer-set) read_fixer; [ -n "$RELEASE_FIXER" ] && echo "FIXER=$RELEASE_FIXER" ;;
  help|-h|--help) sed -n '2,/^set -uo pipefail$/p' "$0" | sed '$d' ;;
  *) usage ;;
esac

#!/bin/bash
# The fix round of a red nightly or by-hand run (asbl/ci/jenkins/fix-round.sh) with a stub fixer and a scratch git origin:
# the script runs from a scratch clone of a scratch repository, so its proceed commits and pushes only there. The cases:
#   - the wrong calls: no result.txt, a wrong kind, no fixer set, a second start on the same run;
#   - review: start (the fixer told FIX_MODE=review), fixing while it runs, waiting once it is DONE with a diff, a dry
#     proceed (nothing pushed), proceed (that diff, one commit on main, its message), nothing left to proceed;
#   - a diff that no longer applies: proceed refused, still waiting; then abort;
#   - DONE with no diff: no-fix; push: done; BLOCKED: ended; a status the fixer never answers: ended after the limit;
#   - abort while fixing stops the fixer's run; wait --for while fixing: exit 5.
# Every folder is a scratch one. Takes a few seconds.
#   bash asbl/ci/tests/test-fix-round.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-fix-round.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
has() {  # has <text> <text to search>
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}

# ---- a scratch origin and the clone the script runs from ----
git init -q --bare "$SCRATCH/origin.git"
git clone -q "$SCRATCH/origin.git" "$SCRATCH/seed" 2>/dev/null
mkdir -p "$SCRATCH/seed/asbl/ci/jenkins"
cp asbl/ci/jenkins/fix-round.sh "$SCRATCH/seed/asbl/ci/jenkins/"
printf 'line one\nline two\n' > "$SCRATCH/seed/notes.txt"
git -C "$SCRATCH/seed" add -A && git -C "$SCRATCH/seed" -c user.name=t -c user.email=t@t commit -qm "the start" &&
  git -C "$SCRATCH/seed" push -q origin HEAD:main 2>/dev/null
git clone -q -b main "$SCRATCH/origin.git" "$SCRATCH/repo"
git -C "$SCRATCH/repo" config user.name "the test"; git -C "$SCRATCH/repo" config user.email "test@example.invalid"
ROUND="$SCRATCH/repo/asbl/ci/jenkins/fix-round.sh"

# ---- the stub fixer: start records its call, status prints $STUB/status-<run> ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB"
cat > "$STUB/fixer" <<'EOF'
#!/bin/bash
echo "$* FIX_MODE=${FIX_MODE:-} DRY_RUN=${DRY_RUN:-}" >> "$STUB/fixer-calls"
case "$1" in
  start)  echo "FIX_RUN=run-$(basename "$2")"; echo "FIX_PLAN=$STUB/plan-$(basename "$2").md" ;;
  status) s=$(cat "$STUB/status-$2" 2>/dev/null || echo RUNNING); [ "$s" = SILENT ] || echo "FIX_STATUS=$s > status line (stub)" ;;
  stop)   echo "stopped $2" ;;
esac
EOF
export RELEASE_REHEARSAL_CONF="$SCRATCH/release-rehearsal.conf" FIX_ROUND_POLL=0
printf 'RELEASE_FIXER="bash %s"\n' "$STUB/fixer" > "$RELEASE_REHEARSAL_CONF"; chmod 600 "$RELEASE_REHEARSAL_CONF"
round() { bash "$ROUND" "$@" 2>&1; }
red_run() {  # red_run <name>: a red run's folder
  mkdir -p "$SCRATCH/runs/$1"; printf 'result=red\nrun_kind=scheduled\n' > "$SCRATCH/runs/$1/result.txt"; echo "$SCRATCH/runs/$1"
}
fixer_says() { echo "$2" > "$STUB/status-run-$1"; }   # fixer_says <run name> <RUNNING|DONE|BLOCKED|STOPPED|SILENT>
diff_of_notes() {  # diff_of_notes <old line> <new line>: a diff of notes.txt against origin/main
  sed "s/^$1\$/$2/" "$SCRATCH/repo/notes.txt" > "$SCRATCH/notes.new"
  diff -u --label a/notes.txt --label b/notes.txt "$SCRATCH/repo/notes.txt" "$SCRATCH/notes.new"
}

echo "---- the wrong calls ----"
check "no result.txt: refused (exit 2)" bash -c 'bash "$0" start "$1" review >/dev/null 2>&1; [ $? = 2 ]' "$ROUND" "$SCRATCH/none"
A=$(red_run a)
check "a wrong kind: refused (exit 2)" bash -c 'bash "$0" start "$1" maybe >/dev/null 2>&1; [ $? = 2 ]' "$ROUND" "$A"
check "no fixer set: exit 1, fixer-set says so" bash -c 'RELEASE_REHEARSAL_CONF=/nonexistent bash "$0" start "$1" review >/dev/null 2>&1; [ $? = 1 ] &&
  ! RELEASE_REHEARSAL_CONF=/nonexistent bash "$0" fixer-set' "$ROUND" "$A"
check "status of a run with no fix round: exit 2" bash -c 'bash "$0" status "$1" >/dev/null 2>&1; [ $? = 2 ]' "$ROUND" "$A"

echo "---- review: start, fixing, waiting, proceed ----"
out=$(round start "$A" review)
check "start: the fixer's run and plan, the fixer told FIX_MODE=review" bash -c 'grep -q "^FIX_RUN=run-a$" <<< "$0" && grep -q "^start $1 1 FIX_MODE=review DRY_RUN=no$" "$2"' \
  "$out" "$A" "$STUB/fixer-calls"
check "a second start on the same run: refused (exit 2)" bash -c 'bash "$0" start "$1" review >/dev/null 2>&1; [ $? = 2 ]' "$ROUND" "$A"
check "while the fixer runs: fixing" has "FIX_ROUND state=fixing kind=review run=run-a diff=- report=-" "$(round status "$A")"
out=$(round wait "$A" --for 0); rc=$?
check "wait --for 0 while fixing: exit 5" bash -c '[ "$0" = 5 ]' "$rc"
diff_of_notes "line two" "line two, fixed" > "$A/fix.diff"; printf '# reporting: the burst waits for its folder\n\ncause ...\n' > "$A/fix-report.md"
fixer_says a DONE
check "DONE with a diff: waiting, naming the diff and the report" has "FIX_ROUND state=waiting kind=review run=run-a diff=$A/fix.diff report=$A/fix-report.md" "$(round wait "$A")"
out=$(DRY_RUN=yes round proceed "$A" "the reviewer")
check "a dry proceed: what it would commit, nothing pushed, still waiting" bash -c 'grep -q "^WOULD   apply" <<< "$0" &&
  [ "$(git -C "$1" rev-list --count main)" = 1 ] && bash "$2" status "$3" | grep -q "state=waiting"' "$out" "$SCRATCH/origin.git" "$ROUND" "$A"
out=$(round proceed "$A" "the reviewer")
check "proceed: one commit on main with that diff, its message, FIX_COMMIT" bash -c '
  [ "$(git -C "$1" rev-list --count main)" = 2 ] && [ "$(git -C "$1" show main:notes.txt | tail -1)" = "line two, fixed" ] &&
  [ "$(git -C "$1" log -1 --format=%s main)" = "a fix, reviewed by the reviewer: reporting: the burst waits for its folder" ] &&
  grep -qx "FIX_COMMIT=$(git -C "$1" rev-parse main)" <<< "$0"' "$out" "$SCRATCH/origin.git"
check "  the record: proceeded, by whom, the commit" bash -c 'grep -qx state=proceeded "$0" && grep -qx "decided_by=the reviewer" "$0" && grep -q "^commit=" "$0"' "$A/fix-round.state"
check "  no worktree left" bash -c '[ "$(git -C "$0" worktree list | wc -l)" = 1 ]' "$SCRATCH/repo"
check "proceed again: nothing waits (exit 1)" bash -c 'bash "$0" proceed "$1" x >/dev/null 2>&1; [ $? = 1 ]' "$ROUND" "$A"

echo "---- a diff that no longer applies; abort ----"
B=$(red_run b); round start "$B" review >/dev/null
diff_of_notes "line one" "line one, changed" > "$B/fix.diff"
sed -i 's/^-line one$/-line ONE/' "$B/fix.diff"   # it expects a line main does not have
fixer_says b DONE
out=$(round proceed "$B" "the reviewer"); rc=$?
check "proceed of a diff that does not apply: exit 1, nothing pushed, still waiting" bash -c '[ "$0" = 1 ] &&
  grep -q "no longer applies on origin/main" <<< "$1" && [ "$(git -C "$2" rev-list --count main)" = 2 ] && grep -qx state=waiting "$3"' \
  "$rc" "$out" "$SCRATCH/origin.git" "$B/fix-round.state"
check "abort: aborted, by whom, nothing on main" bash -c 'bash "$0" abort "$1" "the reviewer" | grep -q "state=aborted" &&
  grep -qx "decided_by=the reviewer" "$1/fix-round.state" && [ "$(git -C "$2" rev-list --count main)" = 2 ]' "$ROUND" "$B" "$SCRATCH/origin.git"
check "abort again: nothing open (exit 1)" bash -c 'bash "$0" abort "$1" x >/dev/null 2>&1; [ $? = 1 ]' "$ROUND" "$B"

echo "---- the other ends ----"
C=$(red_run c); round start "$C" review >/dev/null; fixer_says c DONE
check "review, DONE with no diff: no-fix" has "FIX_ROUND state=no-fix" "$(round status "$C")"
D=$(red_run d); round start "$D" push >/dev/null; fixer_says d DONE
check "push, DONE: done, the fixer told FIX_MODE=push" bash -c 'bash "$0" status "$1" | grep -q "state=done kind=push" && grep -q "^start $1 1 FIX_MODE=push" "$2"' \
  "$ROUND" "$D" "$STUB/fixer-calls"
E=$(red_run e); round start "$E" push >/dev/null; fixer_says e BLOCKED
check "BLOCKED: ended, saying so" has "FIX_ROUND state=ended kind=push run=run-e diff=- report=- why=BLOCKED:" "$(round status "$E")"
F=$(red_run f); round start "$F" review >/dev/null; fixer_says f SILENT
check "a fixer that never answers: ended after the limit" has "state=ended" "$(FIX_ROUND_UNREADABLE_LIMIT=3 round wait "$F")"
G=$(red_run g); round start "$G" review >/dev/null
check "abort while fixing: the fixer's run stopped, aborted" bash -c 'bash "$0" abort "$1" "a person" | grep -q "state=aborted" && grep -q "^stop run-g " "$2"' \
  "$ROUND" "$G" "$STUB/fixer-calls"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-fix-round"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-fix-round"; exit 1

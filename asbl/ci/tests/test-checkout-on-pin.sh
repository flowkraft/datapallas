#!/bin/bash
# The checkout goes on an execution's pin once, in the orchestrator, before any part starts (put_checkout_on_pin in
# asbl/ci/jenkins/release-orchestrator.sh). 16.6.3's first press (2026-11-05) lost its pack 7 seconds in: two parts started
# in the same second and each ran sync_host_repo (asbl/ci/dp-ci.sh) on this one checkout; one's git status read the files
# the other's merge was writing. Dry runs commit nothing and move nothing, so none of them could show it.
#   1. a clean checkout behind the pin: moved, and two sync_host_repo at once then pass, every time;
#   2. local changes: nothing moved, nothing lost, and sync_host_repo still refuses and says so;
#   3. a checkout past the pin: left there, and sync_host_repo still refuses it;
#   4. a checkout on the pin: nothing to do, nothing said;
#   5. the orchestrator calls it for real runs only, after the pin is chosen and before step 1's parts.
# The two functions are read from the real scripts and run in a scratch repository: no real checkout, no script run.
# Takes a few seconds.
# Callers: a person or an agent, from the shell, after changing the orchestrator or sync_host_repo.
#   bash asbl/ci/tests/test-checkout-on-pin.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
ORCHESTRATOR=$PWD/asbl/ci/jenkins/release-orchestrator.sh
DP_CI=$PWD/asbl/ci/dp-ci.sh
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-checkout-on-pin.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() { [ "$1" = "$2" ] && return 0; printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1; }

eval "$(sed -n '/^put_checkout_on_pin() {/,/^}/p' "$ORCHESTRATOR")"
eval "$(sed -n '/^sync_host_repo() {/,/^}/p' "$DP_CI")"
declare -F put_checkout_on_pin sync_host_repo >/dev/null || { echo "FAIL  a function is missing"; exit 1; }

# a scratch repository: commit OLD, then PINNED changing seven files, as step 0 does, then LATER
git init -q "$SCRATCH/repo"; cd "$SCRATCH/repo" || exit 2
git config user.email test@example.invalid; git config user.name test
for n in 1 2 3 4 5 6 7; do seq 1 20000 > "version-file-$n"; done
git add .; git commit -q -m old; OLD=$(git rev-parse HEAD)
for n in 1 2 3 4 5 6 7; do echo new >> "version-file-$n"; done
git add .; git commit -q -m pinned; PINNED=$(git rev-parse HEAD)
echo later >> version-file-1; git add .; git commit -q -m later; LATER=$(git rev-parse HEAD)

# ---- 1. behind the pin ----
export RELEASE_PIN=$PINNED; PIN=$PINNED
red=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  git reset -q --hard "$OLD"
  put_checkout_on_pin >/dev/null
  sync_host_repo 2>/dev/null & first=$!
  sync_host_repo 2>/dev/null & second=$!
  wait "$first" || red=$((red + 1)); wait "$second" || red=$((red + 1))
done
check "1. behind the pin: two parts at once, ten times, none red" same 0 "$red"
check "1. and the checkout is on the pin" same "$PINNED" "$(git rev-parse HEAD)"
git reset -q --hard "$OLD"
check "1. it says it moved" bash -c '[[ "$1" == *"moved forward to it"* ]]' _ "$(put_checkout_on_pin)"

# ---- 2. local changes ----
git reset -q --hard "$OLD"; echo mine >> version-file-1
out=$(put_checkout_on_pin)
check "2. local changes: not moved" same "$OLD" "$(git rev-parse HEAD)"
check "2. nothing said" same "" "$out"
check "2. the change is still there" bash -c 'tail -1 version-file-1 | grep -qx mine'
check "2. the parts' guard still refuses" bash -c '[[ "$1" == *"local changes to tracked files"* ]]' _ "$(sync_host_repo 2>&1)"

# ---- 3. past the pin ----
git checkout -q -- .; git reset -q --hard "$LATER"
out=$(put_checkout_on_pin)
check "3. past the pin: left there" same "$LATER" "$(git rev-parse HEAD)"
check "3. nothing said" same "" "$out"
sync_host_repo >/dev/null 2>&1; rc=$?
check "3. the parts' guard still refuses" same 2 "$rc"

# ---- 4. on the pin ----
git reset -q --hard "$PINNED"
check "4. on the pin: nothing said" same "" "$(put_checkout_on_pin)"
check "4. still on it" same "$PINNED" "$(git rev-parse HEAD)"

# ---- 5. where the orchestrator calls it ----
call=$(grep -n '^  put_checkout_on_pin$' "$ORCHESTRATOR" | cut -d: -f1)
pin_line=$(grep -n '^export RELEASE_PIN="\$PIN"$' "$ORCHESTRATOR" | cut -d: -f1)
step1_line=$(grep -n '^# ---- 3. step 1 ----$' "$ORCHESTRATOR" | cut -d: -f1)
check "5. called once" same 1 "$(printf '%s\n' "$call" | grep -c .)"
check "5. after the pin, before step 1's parts" bash -c '[ "$1" -gt "$2" ] && [ "$1" -lt "$3" ]' _ "${call:-0}" "${pin_line:-0}" "${step1_line:-0}"
check "5. in the else of the dry run's check: real runs only" bash -c 'sed -n "$(($1 - 1))p" "$2" | grep -qx else' _ "${call:-0}" "$ORCHESTRATOR"

[ "$FAILED_CASES" = 0 ] && { echo "ALL PASS"; exit 0; }
echo "$FAILED_CASES FAILED"; exit 1

#!/bin/bash
# The full lane is chosen for the version of the commit asked about (asbl/ci/release-state.sh full-lane --choose with
# RELEASE_COMMIT), not for the version this checkout says. On a new version's first press the orchestrator asks at step 1's
# start, before step 1's build moves the host checkout to the pin, so the checkout still says the version before: 16.6.2's
# first press (2026-11-03) reused 16.6.1's docker-server instead of alternating to web.
# The cases run in a scratch git repository: this checkout's release-state.sh and reuse-or-rebuild.sh, and a made-up
# settings.xml (commit A says 16.6.2, commit B 16.6.3; the checkout stays on A), with a scratch release record in which
# 16.6.2 has its full lane:
#   1. RELEASE_COMMIT=B: 16.6.3's lane, alternated from 16.6.2's;
#   2. no RELEASE_COMMIT: this checkout's version, 16.6.2's lane kept (as before);
#   3. a RELEASE_COMMIT git does not know: this checkout's version (as before); the dry runs record nothing.
# Nothing outside the scratch folder is read or written. Takes a second.
# Callers: a person or an agent, after changing how release-state.sh reads a version.
#   bash asbl/ci/tests/test-full-lane-version.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-full-lane-version.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED=1; fi
}
contains() {  # contains <expected text> <output>
  [[ "$2" == *"$1"* ]] && return 0
  echo "      expected: $1"; echo "      got: $2"; return 1
}

SETTINGS=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml
REPO="$SCRATCH/repo"
mkdir -p "$REPO/asbl/ci" "$REPO/$(dirname "$SETTINGS")"
cp asbl/ci/release-state.sh asbl/ci/reuse-or-rebuild.sh "$REPO/asbl/ci/"
in_repo() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid "$@"; }
in_repo init -q
echo '<settings><version>16.6.2</version></settings>' > "$REPO/$SETTINGS"
in_repo add -A && in_repo commit -q -m 'version 16.6.2'
A=$(in_repo rev-parse HEAD)
echo '<settings><version>16.6.3</version></settings>' > "$REPO/$SETTINGS"
in_repo commit -q -am 'version 16.6.3'
B=$(in_repo rev-parse HEAD)
in_repo checkout -q "$A"

export RELEASE_STATE_DIR="$SCRATCH/state" LOG_DIR="$SCRATCH/logs"
mkdir -p "$RELEASE_STATE_DIR" "$LOG_DIR"
STATE="bash $REPO/asbl/ci/release-state.sh"
RELEASE_COMMIT="$A" $STATE full-lane --choose >/dev/null 2>&1   # 16.6.2's full lane, drawn (no earlier record)
LANE_A=$(sed -n 's/^lane=//p' "$RELEASE_STATE_DIR/full-e2e/16.6.2" 2>/dev/null)
case "$LANE_A" in
  web) OTHER=docker-server ;;
  docker-server) OTHER=web ;;
  *) echo "FAIL  setup: no full lane recorded for 16.6.2"; exit 1 ;;
esac

echo "---- 1. RELEASE_COMMIT on the next version, this checkout still on the one before ----"
out=$(RELEASE_COMMIT="$B" DRY_RUN=yes $STATE full-lane --choose 2>&1)
check "16.6.3's lane, alternated from 16.6.2's $LANE_A" \
  contains "FULL_LANE=$OTHER version=16.6.3: dry run: would choose $OTHER (alternated: previous 16.6.2 $LANE_A)" "$out"
check "  and step 1 of 16.6.3 needs that lane" contains "step 1 of 16.6.3 needs: $OTHER-full docker-server-auth" "$out"

echo "---- 2. no RELEASE_COMMIT: this checkout's version, as before ----"
out=$(DRY_RUN=yes $STATE full-lane --choose 2>&1)
check "16.6.2's recorded lane, kept" contains "FULL_LANE=$LANE_A version=16.6.2: the full set of this release runs on $LANE_A" "$out"

echo "---- 3. a RELEASE_COMMIT git does not know: this checkout's version, as before ----"
out=$(RELEASE_COMMIT=0123456789abcdef DRY_RUN=yes $STATE full-lane --choose 2>&1)
check "16.6.2's recorded lane, kept" contains "FULL_LANE=$LANE_A version=16.6.2:" "$out"
check "the dry runs recorded nothing for 16.6.3" test ! -e "$RELEASE_STATE_DIR/full-e2e/16.6.3"

[ "$FAILED" = 0 ] && { echo "ALL PASS  test-full-lane-version"; exit 0; }
echo "SOME FAILED  test-full-lane-version"; exit 1

#!/bin/bash
# Job dp-ci-release-step0-set-version: step 0 of a release, the version. Plain script, run on the host: Jenkins calls it
# over SSH, it also runs by hand.
#
#   RELEASE_VERSION=<x.y.z> DRY_RUN=no|yes  bash asbl/ci/jenkins/release-set-version.sh
#
# 1. the current release: the higher of the two channels' released versions, read as the version gate reads them
#    (asbl/ci/release-state.sh released: Docker Hub's :latest, newest/windows-version.txt);
# 2. RELEASE_VERSION the same or lower, or empty: NOTHING DONE, green (the job's field comes pre-filled with the current
#    release, so a run left as it is does nothing); not x.y.z: refused;
# 3. bigger: in a throwaway git worktree of origin/main (never this checkout, which agents and dp-ci.sh use),
#    asbl/ci/set-version.sh <version> writes it into the version files; then set-version.sh --versions must give it for
#    every one of them and git diff --name-only must list exactly them. origin/main already saying it everywhere: nothing
#    is committed;
# 4. one commit, "release <version>: the version in the 7 version files", pushed to main, the worktree removed; then
#    RELEASE_COMMIT=<sha> and the next step: step 1's four lanes on that commit. main moved meanwhile: the push is
#    rejected and the job fails, saying so (it never retries on a tree it did not check);
# 5. a warning, never a failure, when asbl/src/main/external-resources/db-template/CHANGELOG.md has no heading for the
#    version: the notes are the owner's, committed before step 1 (step 1 and the release jobs run on one commit).
# DRY_RUN=yes: the edits (set-version.sh --dry-run) and the commit it would make; nothing is written or pushed.
# The last line, SET_VERSION_RESULT, says what happened (asbl/ci/jenkins/release-label.sh labels the Jenkins build with it).
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2

V="${RELEASE_VERSION:-}"
V="${V//[[:space:]]/}"   # a value pasted into the field may carry blanks
DRY="${DRY_RUN:-no}"
case "$DRY" in no|yes) ;; *) echo "FAIL  DRY_RUN must be no or yes (got '$DRY')"; exit 2 ;; esac
CHANGELOG=asbl/src/main/external-resources/db-template/CHANGELOG.md
WT=""

result() { echo "SET_VERSION_RESULT $*"; }
bigger_versions() {  # bigger_versions 1.2.3 -> "1.2.4, 1.3.0, 2.0.0"
  printf '%s' "$1" | awk -F. '{ printf "%d.%d.%d, %d.%d.0, %d.0.0", $1, $2, $3 + 1, $1, $2 + 1, $1 + 1 }'
}
fail() { echo "FAILED: $1"; result "$V FAILED: see the log"; return 1; }
changelog_check() {  # a warning only: the release notes are the owner's
  grep -qE "^## ${V//./\\.}( |$)" "$WT/$CHANGELOG" && { echo "the changelog has a heading for $V"; return 0; }
  echo "WARN  $CHANGELOG has no '## $V - <date>' heading: the release notes are yours to write; commit them before step 1"
  echo "      (step 1 and the release jobs run on one commit)"
}
remove_worktree() { [ -n "$WT" ] && { git worktree remove --force "$WT" 2>/dev/null; rm -rf "$WT"; git worktree prune; }; }
trap remove_worktree EXIT

main() {
  local rel rc cur base versions files n out bad changed c now
  echo "STEP 0, THE VERSION: RELEASE_VERSION='$V' dry_run=$DRY  checkout: $(git log -1 --format='%h %s')"
  rel=$(bash asbl/ci/release-state.sh released); rc=$?
  printf '%s\n' "$rel"
  [ "$rc" = 0 ] || fail "the released versions cannot be read (above): nothing done" || return 1
  cur=$(printf '%s\n' "$rel" | sed -n 's/^RELEASED current=\([^ ]*\) .*/\1/p')

  if [ -z "$V" ]; then
    echo "NOTHING DONE: $cur is the current release. For a new release give a bigger version ($(bigger_versions "$cur"))"
    result "nothing done: $cur is the current release"; return 0
  fi
  if ! printf '%s' "$V" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "REFUSED  '$V' is not x.y.z (three numbers: $(bigger_versions "$cur")): nothing done"
    result "refused: '$V' is not x.y.z"; return 1
  fi
  if [ -n "$cur" ] && [ "$(printf '%s\n%s\n' "$V" "$cur" | sort -V | tail -1)" != "$V" ] || [ "$V" = "$cur" ]; then
    [ "$V" = "$cur" ] || echo "$V is lower than the current release."
    echo "NOTHING DONE: $cur is the current release. For a new release give a bigger version ($(bigger_versions "$cur"))"
    result "nothing done: $cur is the current release"; return 0
  fi

  git fetch -q origin main || fail "git fetch origin main (above)" || return 1
  base=$(git rev-parse origin/main)
  WT=$(mktemp -d /tmp/dp-release-set-version.XXXXXX) || fail "no temp folder" || return 1
  git worktree add -q --detach "$WT" "$base" || fail "git worktree add (above)" || return 1
  echo "$V is bigger than the current release $cur: setting it on origin/main ${base:0:8}, in the throwaway worktree $WT"
  versions=$(cd "$WT" && bash asbl/ci/set-version.sh --versions)
  files=$(printf '%s\n' "$versions" | awk '{ print $2 }' | sort)
  n=$(printf '%s\n' "$files" | grep -c .)
  if [ -z "$(printf '%s\n' "$versions" | awk -v v="$V" '$1 != v')" ]; then
    echo "origin/main (${base:0:8}) already says $V in all $n version files: nothing committed"
    changelog_check
    result "$V already set on origin/main (${base:0:8}): nothing committed"; return 0
  fi

  if [ "$DRY" = yes ]; then
    (cd "$WT" && bash asbl/ci/set-version.sh --dry-run "$V") || fail "set-version.sh --dry-run (above)" || return 1
    changelog_check
    echo "dry run: would commit \"release $V: the version in the $n version files\" on top of origin/main ${base:0:8} and push it to main"
    result "dry run: $V would be set on ${base:0:8}, nothing written"; return 0
  fi

  out=$(cd "$WT" && bash asbl/ci/set-version.sh "$V" 2>&1); rc=$?
  # its closing 'NEXT, BY HAND' lines are for a run by hand: this job does those steps itself
  printf '%s\n' "$out" | awk '/^NEXT, BY HAND:/ { exit } { print }'
  [ "$rc" = 0 ] || fail "asbl/ci/set-version.sh $V (above): nothing committed" || return 1
  bad=$(cd "$WT" && bash asbl/ci/set-version.sh --versions | awk -v v="$V" '$1 != v')
  [ -z "$bad" ] || fail "these version files do not say $V: $(printf '%s' "$bad" | tr '\n' ' ')(nothing committed)" || return 1
  changed=$(git -C "$WT" diff --name-only | sort)
  [ "$changed" = "$files" ] || fail "git diff lists other files than the $n version files: $(printf '%s' "$changed" | tr '\n' ' ')(nothing committed)" || return 1
  echo "checked: all $n version files say $V (set-version.sh --versions), and git diff lists exactly them"
  changelog_check

  git -C "$WT" add -- $files && git -C "$WT" commit -q -m "release $V: the version in the $n version files" ||
    fail "git commit (above)" || return 1
  c=$(git -C "$WT" rev-parse HEAD)
  if ! git -C "$WT" push -q origin HEAD:main; then
    git fetch -q origin main; now=$(git rev-parse origin/main)
    [ "$now" != "$base" ] && echo "main moved while this job worked (${base:0:8} -> ${now:0:8}): run the job again, it starts from the new origin/main"
    fail "the push to main was rejected (above): nothing changed on main" || return 1
  fi
  echo "pushed: ${c:0:8} \"release $V: the version in the $n version files\" is on main"
  echo "RELEASE_COMMIT=$c"
  echo "NEXT: step 1, dp-ci-release-step1-e2e-prerelease, on the commit being released (this one, or a later one with the"
  echo "      changelog): this release's full lane (web or docker-server; bash asbl/ci/release-state.sh full-lane --choose says"
  echo "      which), docker-server auth and windows-vm-server light. windows-vm-electron light is step 3's own run, its"
  echo "      RELEASE STEP 2/4, so a release does not run it here. Step 1 runs made before this commit do not count for this"
  echo "      release; after it, any step 1 run on the commit being released does."
  result "$V set: ${c:0:8}"
}

main
rc=$?
exit "$rc"

#!/bin/bash
# The never-shipped list's guard (asbl/ci/reuse-or-rebuild.sh, THE PACKERS CHECK). The list says which changes rebuild
# nothing, and it holds only while no packer copies one of its paths. So the rule reads the packers at both commits of every
# question and refuses to trust the list where a packer names one. The cases, on scratch commits made on origin/main:
#   1. origin/main passes, with only the known mentions (`packers`: no NAMES line, no known mention missing);
#   2. an assembler that copies frend/reporting/e2e/, then a commit that changes only an e2e spec: every part rebuilds and
#      step 1 is refused, "a packer names a never-shipped path", with the packer and its line; release-state.sh moved-main
#      refuses that move. The same spec change on origin/main alone: every part reuses, moved-main lets it pass;
#   3. the same with an assembler that copies frend/reporting/ whole;
#   4. a known mention that needs another line: with .dockerignore no longer dropping **/e2e/, the Dockerfile's
#      COPY ./frend/reporting . is a mention like any other;
#   5. reuse-or-rebuild.sh replay still passes.
# It reads git only. A sandbox clone (asbl/ci as it is in this checkout, uncommitted changes included) borrows this
# repository's objects, and the scratch commits are made there with git's plumbing, never checked out. moved-main gets a
# scratch RELEASE_STATE_DIR. Nothing is built, fetched or pushed. Takes about 25 seconds.
# Callers: a person or an agent, from the shell, after changing the never-shipped list, the packers check or a packer.
#   bash asbl/ci/tests/test-never-shipped-guard.sh
# Prints PASS or FAIL per check; exit 0 when every check passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-never-shipped-guard.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds; returns 1 on a FAIL (so the caller can show why)
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); return 1; fi
}
has() {  # has <text> <text to search>: found, or what was searched is printed
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}
lacks() {  # lacks <text> <text to search>: not found, or the lines with it are printed
  case "$2" in *"$1"*) printf '      "%s" found:\n%s\n' "$1" "$(printf '%s\n' "$2" | grep -F -- "$1" | sed 's/^/        /' | head -5)"; return 1 ;; esac
  return 0
}
exit_is() { [ "$1" = "$2" ] || { echo "      exit $1, not $2"; return 1; }; }  # exit_is <got> <wanted>

C=$(git rev-parse --verify -q "origin/main^{commit}") || { echo "FAIL  git cannot read origin/main"; exit 2; }
ASSEMBLY=asbl/src/main/java/com/sourcekraft/documentburster/assembly
NOEXE=$ASSEMBLY/NoExeAssembler.java
SPEC=frend/reporting/e2e/specs/areas/configuration.spec.ts
KNOWN_NOEXE_LINE='String reportingDir = Utils.getTopProjectFolderPath() + "/frend/reporting";'

# the sandbox: origin/main with this checkout's asbl/ci, its objects borrowed from this repository
SANDBOX="$SCRATCH/sandbox"
git init -q --bare "$SCRATCH/origin.git"
echo "$(cd "$(git rev-parse --git-common-dir)" && pwd)/objects" > "$SCRATCH/origin.git/objects/info/alternates"
git -C "$SCRATCH/origin.git" update-ref refs/heads/main "$C"
git clone -q --shared --no-checkout "$SCRATCH/origin.git" "$SANDBOX"
git -C "$SANDBOX" sparse-checkout set --no-cone /asbl/ci/
git -C "$SANDBOX" checkout -q main
cp -a asbl/ci/. "$SANDBOX/asbl/ci/"
rule() { bash "$SANDBOX/asbl/ci/reuse-or-rebuild.sh" "$@" 2>&1; }   # the rule, its repository the sandbox
moved_main() { ( cd "$SANDBOX" && RELEASE_STATE_DIR="$SCRATCH/state" LOG_DIR="$SCRATCH/logs" RELEASE_PIN="" \
                   bash asbl/ci/release-state.sh moved-main "$1" "$2" 2>&1 ); }

# commit_with <parent> <message> <path> <file with its new content>: a commit of the parent's tree with that one file
# replaced, made with plumbing in the sandbox (a scratch index, no checkout); prints its hash
commit_with() {
  local idx="$SCRATCH/index" blob tree
  rm -f "$idx"
  GIT_INDEX_FILE="$idx" git -C "$SANDBOX" read-tree "$1" &&
    blob=$(git -C "$SANDBOX" hash-object -w "$4") &&
    GIT_INDEX_FILE="$idx" git -C "$SANDBOX" update-index --cacheinfo "100644,$blob,$3" &&
    tree=$(GIT_INDEX_FILE="$idx" git -C "$SANDBOX" write-tree) &&
    GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@localhost GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@localhost \
      git -C "$SANDBOX" commit-tree "$tree" -p "$1" -m "$2"
}
# the e2e spec with one more line: the only change of the commit that follows
git show "$C:$SPEC" > "$SCRATCH/spec.ts" && echo "// a test-only change" >> "$SCRATCH/spec.ts"
# NoExeAssembler with one more line after its known mention of frend/reporting; prints that line's number
assembler_with() {
  local at
  at=$(git show "$C:$NOEXE" | grep -n -F -- "$KNOWN_NOEXE_LINE" | cut -d: -f1)
  [ -n "$at" ] || { echo "      no '$KNOWN_NOEXE_LINE' in $NOEXE at ${C:0:8}" >&2; return 1; }
  git show "$C:$NOEXE" | awk -v at="$at" -v line="$1" '{ print } NR == at { print line }' > "$SCRATCH/assembler.java"
  echo $((at + 1))
}

echo "---- 1. origin/main (${C:0:8}): only the known mentions ----"
out=$(rule packers "$C"); rc=$?
check "packers: PASS (exit 0)" exit_is "$rc" 0
check "  its PASS line" has "PACKERS ${C:0:8} PASS: " "$out"
check "  the known mentions, each with its reason (NoExeAssembler's npm folder, the Dockerfile's frontend stage)" \
  bash -c '[[ "$0" == *"  KNOWN  '"$NOEXE"':"*"runs npm (custom:compile-and-stage-web-components) in frend/reporting"* ]] &&
           [[ "$0" == *"  KNOWN  Dockerfile:"*"frend/reporting, a parent of frend/reporting/e2e/: the frontend build stage"* ]]' "$out"
check "  no other mention" lacks "  NAMES  " "$out"
check "  no known mention missing" lacks "a known mention not found" "$out"

# guarded_case <label> <the assembler's new line>: cases 2 and 3
guarded_case() {
  local line copy next out rc why
  line=$(assembler_with "$2") || { check "$1: the scratch assembler" false; return; }
  copy=$(commit_with "$C" "$1" "$NOEXE" "$SCRATCH/assembler.java") &&
    next=$(commit_with "$copy" "an e2e spec only" "$SPEC" "$SCRATCH/spec.ts") ||
    { check "$1: the scratch commits" false; return; }
  why="the first: $NOEXE:$line:"
  out=$(rule packers "$copy"); rc=$?
  check "$1: packers FAIL (exit 1), naming the new line" \
    bash -c '[ "$0" = 1 ] && [[ "$1" == *"  NAMES  $2  "* ]] && [[ "$1" == *"PACKERS ${3:0:8} FAIL: 1 packer line(s)"* ]]' \
    "$rc" "$out" "$NOEXE:$line" "$copy"
  out=$(rule parts "$copy" "$next"); rc=$?
  check "  then an e2e spec only: every part rebuilds, step 1 refused, the packer and its line in the note (exit 1)" \
    bash -c '[ "$0" = 1 ] &&
      [ "$(printf "%s\n" "$1" | grep -cE "^  (e2e-package|image-and-zips|windows-pack) +rebuild +\(a packer names a never-shipped path\)$")" = 3 ] &&
      printf "%s\n" "$1" | grep -qE "^  step1 +refused +\(a packer names a never-shipped path\)$" && [[ "$1" == *"$2"* ]]' \
    "$rc" "$out" "$why" || printf '%s\n' "$out" | sed 's/^/        /'
  out=$(moved_main "$copy" "$next"); rc=$?
  check "  release-state.sh moved-main refuses that move (exit 1), naming the packer's line" \
    bash -c '[ "$0" = 1 ] && [[ "$1" == *"MOVED_MAIN refused: "*"a packer names a never-shipped path"*"$2"* ]]' "$rc" "$out" "$why" ||
    printf '%s\n' "$out" | sed 's/^/        /'
}

echo "---- 2. an assembler that copies frend/reporting/e2e/ ----"
alone=$(commit_with "$C" "an e2e spec only" "$SPEC" "$SCRATCH/spec.ts") || alone=""
out=$(rule parts "$C" "$alone"); rc=$?
check "the e2e spec change alone, on origin/main: every part reuses, step 1 still counts (exit 0)" \
  bash -c '[ "$0" = 0 ] && [ -n "$2" ] && printf "%s\n" "$1" | grep -qE "^  step1 +still-counts " &&
           [ "$(printf "%s\n" "$1" | grep -cE "^  (e2e-package|image-and-zips|windows-pack) +reuse ")" = 3 ]' "$rc" "$out" "$alone"
out=$(moved_main "$C" "$alone"); rc=$?
check "  moved-main lets that move pass (exit 0)" bash -c '[ "$0" = 0 ] && [[ "$1" == *"MOVED_MAIN ok: "* ]]' "$rc" "$out" ||
  printf '%s\n' "$out" | sed 's/^/        /'
guarded_case "NoExeAssembler copies frend/reporting/e2e/" \
  '		FileUtils.copyDirectory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting/e2e"), new File(packageDirPath + "/e2e"));'

echo "---- 3. an assembler that copies frend/reporting/ whole ----"
guarded_case "NoExeAssembler copies frend/reporting/ whole" \
  '		FileUtils.copyDirectory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting"), new File(packageDirPath + "/web"));'

echo "---- 4. a known mention that needs another line ----"
git show "$C:.dockerignore" | grep -v -x -F '**/e2e/' > "$SCRATCH/dockerignore"
dock_line=$(git show "$C:Dockerfile" | grep -n -x -F 'COPY ./frend/reporting .' | cut -d: -f1)
if no_drop=$(commit_with "$C" ".dockerignore keeps e2e/" .dockerignore "$SCRATCH/dockerignore"); then
  out=$(rule packers "$no_drop"); rc=$?
  check ".dockerignore without **/e2e/: COPY ./frend/reporting . (Dockerfile:$dock_line) is a mention like any other (exit 1)" \
    bash -c '[ "$0" = 1 ] && [[ "$1" == *"  NAMES  Dockerfile:$2  frend/reporting, a parent of frend/reporting/e2e/"* ]] &&
             [[ "$1" == *"is known only while .dockerignore has \"**/e2e/\""* ]]' "$rc" "$out" "$dock_line" ||
    printf '%s\n' "$out" | grep -v '^  KNOWN ' | sed 's/^/        /'
else
  check ".dockerignore without **/e2e/: the scratch commit" false
fi

echo "---- 5. the replay ----"
out=$(rule replay); rc=$?
check "reuse-or-rebuild.sh replay passes (exit 0)" bash -c '[ "$0" = 0 ] && [[ "$1" == *"REPLAY PASS"* ]]' "$rc" "$out" ||
  printf '%s\n' "$out" | grep -E 'FAIL' | sed 's/^/        /'

echo
if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS"; exit 0; fi
echo "FAILED: $FAILED_CASES"; exit 1

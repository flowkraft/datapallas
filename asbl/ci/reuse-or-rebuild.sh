#!/bin/bash
# The one rule that says what a change can affect: given two commits, for each part a release builds, "reuse" (the build of
# the earlier commit still holds for the later one) or "rebuild" (something that part ships changed), with the files that
# decided; and for step 1, "still counts" (step 1 green on the earlier commit holds for the later one) or "refused".
#
# THE PARTS and what each is built from (asbl/src/test/java/.../assembly/AssemblerTest.java):
#   e2e-package     the e2e package, asbl/target/package/verified-db-noexe: AssemblerTest#prepareForE2E = NoExeAssembler
#                   (dp-ci.sh prepare_package on this host, asbl\pack-prepare-for-e2e.bat on the VM)
#   image-and-zips  the Docker image and the two server zips, `dp-ci.sh build`: AssemblerTest#assembleDataPallasServerLinux =
#                   NoExeAssembler, DataPallasServerSpringBootAssembler, DockerAssembler
#   windows-pack    the Windows pack, pack-datapallas.bat on the VM: AssemblerTest#assembleDataPallasAndDataPallasServer =
#                   NoExeAssembler, DataPallasAssembler, DataPallasServerSpringBootAssembler, DataPallasSourceAssembler
#   step 1's lanes test the e2e package (the web and Electron lanes) and the image with the zips (docker-server, the Windows
#   server lane), never the Windows pack: step 1 still counts when both of those are reuse.
#
# HOW, in order:
#   1. the files that differ between the two commits (git diff --no-renames: a rename names both paths); a commit git cannot
#      read means every part rebuilds and step 1 is refused;
#   2. with a checkout given (--tree), tracked files changed in it mean the same: a dirty tree is no commit, nothing says
#      what it was built from;
#   3. each file placed (place_path): on the never-shipped list -> nothing; one part's own packer file -> that part only;
#      anything else the packers read (bkend/, frend/, asbl/, xtra-tools/, pom.xml) -> every part; a path outside all of
#      them cannot be placed -> every part, named so;
#   4. step 1 still counts when neither the e2e package nor the image with the zips rebuilds.
#
# USE (from anywhere; the commits are read from this file's repository, RR_REPO replaces it):
#   bash asbl/ci/reuse-or-rebuild.sh parts <from> <to> [--tree <checkout>]   the answer: one line per part, then step 1
#   bash asbl/ci/reuse-or-rebuild.sh part <part> <from> <to> [--tree <dir>]  one part: prints reuse|rebuild, exit 0|1
#   bash asbl/ci/reuse-or-rebuild.sh step1 <from> <to>                       prints still-counts|refused, exit 0|1
#   bash asbl/ci/reuse-or-rebuild.sh replay                                  the acceptance check of the rule, in seconds:
#                                                                            exit 0 only when every answer is the expected one
#   . asbl/ci/reuse-or-rebuild.sh; reuse_or_rebuild <from> <to> [<checkout>] for the scripts that ask (the re-run entry, the
#                                                                            release gates, the orchestrator): sets the RR_*
#                                                                            variables below, prints nothing, changes no option
#   Example: bash asbl/ci/reuse-or-rebuild.sh parts 3f5c21f0 889001e6   (16.6.0: only the Windows pack rebuilds)
#
# It only reads git; it never builds, fetches, writes or changes the checkout. The release runs it where a build or step 1
# would otherwise be taken only for its exact commit: between the two executions of steps 2 and 3, never inside one (an
# execution builds and packs its own commit, start to end).
#
# After reuse_or_rebuild:
#   RR_E2E_PACKAGE RR_IMAGE_AND_ZIPS RR_WINDOWS_PACK   reuse | rebuild
#   RR_WHY_E2E_PACKAGE RR_WHY_IMAGE_AND_ZIPS RR_WHY_WINDOWS_PACK   the files that made it rebuild (space-separated)
#   RR_STEP1          still-counts | refused
#   RR_STEP1_WHY      why: "nothing its lanes test changed" | "the product changed" | "the CI toolchain changed" |
#                     "a path it cannot place" | "dirty tree" | "unknown commit"
#   RR_FROM RR_TO     the two commits, 8 characters; RR_CHANGED the number of files that differ
#   RR_NOTE           a dirty tree or an unknown commit, in words (empty otherwise)

# THE NEVER-SHIPPED LIST: a path under one of these is in no part, so a change to it rebuilds nothing. Every entry was checked
# against what the packers copy (at ac01cd76: the six assemblers, AssemblerTest, both .bat packers, the product Dockerfile
# and .dockerignore, electron-builder.json):
#   frend/reporting/e2e/  the Playwright suite. No assembler or .bat names it; the image's .dockerignore drops **/e2e/; the
#                         Electron app is frend/reporting/app (electron-builder's two-package layout), not frend/reporting.
#   asbl/ci/              the CI scripts and jobs; no packer names it. Except what decides the built bytes, kept as shipped
#                         below (TOOLCHAIN): the toolchain image the Linux builds run in and the npm script shell.
#   asbl/src/uat/         the Robot UAT: it runs against the pack, nothing copies it into one.
#   */src/test/           the unit tests: the builds compile and run them, no jar holds them. Except asbl/src/test/, whose
#                         AssemblerTest IS the packers' entry (it says what each part assembles), and every src/test file an
#                         assembler copies into the package: NoExeAssembler ships four sample Groovy scripts and five HTML
#                         templates from bkend/reporting/src/test/. Those are read from the assemblers' sources at both
#                         commits (shipped_test_files), so a new copy line is picked up without editing this list.
#   .docs/                notes, ignored by git: never in a commit.
# The one packer that copies everything is the Windows pack's source zip (DataPallasSourceAssembler = `git archive HEAD`): it
# carries these files as source, never as something the product runs, and no test reads them out of it. Execution 2 packs it
# from its own commit, so the source zip a user gets always matches its commit.
NEVER_SHIPPED=(frend/reporting/e2e/ asbl/ci/ asbl/src/uat/ '*/src/test/' .docs/)

# Under asbl/ci/ but shipped: they decide the built bytes of the Linux builds (the e2e package on this host, the image and the
# zips), not the VM's. A change to how dp-ci.sh DRIVES a build stays CI: execution 2 rebuilds with it.
TOOLCHAIN=(asbl/ci/Dockerfile asbl/ci/npm-script-shell.sh)

# The packers' own files used by one or two parts only (the rest of the product is in all three)
ASSEMBLY=asbl/src/main/java/com/sourcekraft/documentburster/assembly
WINDOWS_PACK_ONLY=("$ASSEMBLY/DataPallasAssembler.java" "$ASSEMBLY/DataPallasSourceAssembler.java" asbl/pack-datapallas.bat)
IMAGE_AND_ZIPS_ONLY=("$ASSEMBLY/DockerAssembler.java" Dockerfile .dockerignore asbl/docker/)
E2E_PACKAGE_ONLY=(asbl/pack-prepare-for-e2e.bat)
# the server zip is in both the Linux build and the Windows pack, never in the e2e package
SERVER_ZIP_ONLY=("$ASSEMBLY/DataPallasServerSpringBootAssembler.java" asbl/src/main/external-resources/db-server-template/)
# what the packers read at all: a changed path outside these cannot be placed
PRODUCT_ROOTS=(bkend/ frend/ asbl/ xtra-tools/ pom.xml)

RR_REPO="${RR_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# rr_matches <path> <entry...>: the path is one of the entries, or under one that ends in / (a * in an entry spans folders)
rr_matches() {
  local p="$1" e; shift
  for e in "$@"; do
    case "$e" in
      */) # shellcheck disable=SC2254
          case "$p" in $e*) return 0 ;; esac ;;
      *)  [ "$p" = "$e" ] && return 0 ;;
    esac
  done
  return 1
}

# shipped_test_files <commit...>: every src/test path an assembler names in its source at those commits, one per line, no
# leading slash. NoExeAssembler copies sample scripts and templates from bkend/reporting/src/test/ into the package.
shipped_test_files() {
  local c f
  for c in "$@"; do
    for f in $(git -C "$RR_REPO" ls-tree --name-only "$c" "$ASSEMBLY/" 2>/dev/null); do
      git -C "$RR_REPO" show "$c:$f" 2>/dev/null | grep -oE '"/?[A-Za-z0-9_./-]*/src/test/[^"]*"' | tr -d '"' | sed 's#^/##'
    done
  done | sort -u
}

# place_path <path> <file of shipped test paths>: prints the parts the path is in ("" = none), a |, and what it is:
# never-shipped | toolchain | product | unplaced (| and not a tab: read would drop an empty first field before a tab)
place_path() {
  local p="$1" shipped_tests="$2" t
  if rr_matches "$p" "${TOOLCHAIN[@]}"; then printf 'e2e-package image-and-zips|toolchain\n'; return; fi
  if rr_matches "$p" "${NEVER_SHIPPED[@]}"; then
    # a src/test file an assembler copies is shipped, as is the packers' own test folder
    if [ -n "$shipped_tests" ] && [ -s "$shipped_tests" ]; then
      while IFS= read -r t; do
        [ -n "$t" ] || continue
        case "$t" in
          */) case "$p" in "$t"*) printf 'e2e-package image-and-zips windows-pack|product\n'; return ;; esac ;;
          *)  case "$p" in "$t"|"$t"/*) printf 'e2e-package image-and-zips windows-pack|product\n'; return ;; esac ;;
        esac
      done < "$shipped_tests"
    fi
    case "$p" in asbl/src/test/*) printf 'e2e-package image-and-zips windows-pack|product\n'; return ;; esac
    printf '|never-shipped\n'; return
  fi
  if rr_matches "$p" "${WINDOWS_PACK_ONLY[@]}"; then printf 'windows-pack|product\n'; return; fi
  if rr_matches "$p" "${IMAGE_AND_ZIPS_ONLY[@]}"; then printf 'image-and-zips|product\n'; return; fi
  if rr_matches "$p" "${E2E_PACKAGE_ONLY[@]}"; then printf 'e2e-package|product\n'; return; fi
  if rr_matches "$p" "${SERVER_ZIP_ONLY[@]}"; then printf 'image-and-zips windows-pack|product\n'; return; fi
  if rr_matches "$p" "${PRODUCT_ROOTS[@]}"; then printf 'e2e-package image-and-zips windows-pack|product\n'; return; fi
  printf 'e2e-package image-and-zips windows-pack|unplaced\n'
}

# rr_answer_for_paths <file of changed paths> <file of shipped test paths>: the RR_* answers for that list of paths (the
# replay feeds it a made-up path too, through the same placement as a real commit)
rr_answer_for_paths() {
  local p parts kind part product=0 toolchain=0 unplaced=0
  RR_E2E_PACKAGE=reuse RR_IMAGE_AND_ZIPS=reuse RR_WINDOWS_PACK=reuse
  RR_WHY_E2E_PACKAGE="" RR_WHY_IMAGE_AND_ZIPS="" RR_WHY_WINDOWS_PACK=""
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    IFS='|' read -r parts kind <<< "$(place_path "$p" "$2")"
    for part in $parts; do
      case "$part" in
        e2e-package)    RR_E2E_PACKAGE=rebuild;    RR_WHY_E2E_PACKAGE="${RR_WHY_E2E_PACKAGE:+$RR_WHY_E2E_PACKAGE }$p" ;;
        image-and-zips) RR_IMAGE_AND_ZIPS=rebuild; RR_WHY_IMAGE_AND_ZIPS="${RR_WHY_IMAGE_AND_ZIPS:+$RR_WHY_IMAGE_AND_ZIPS }$p" ;;
        windows-pack)   RR_WINDOWS_PACK=rebuild;   RR_WHY_WINDOWS_PACK="${RR_WHY_WINDOWS_PACK:+$RR_WHY_WINDOWS_PACK }$p" ;;
      esac
    done
    # only what step 1's lanes test (the e2e package, the image with the zips) decides its reason
    case " $parts " in
      *" e2e-package "*|*" image-and-zips "*)
        case "$kind" in product) product=1 ;; toolchain) toolchain=1 ;; unplaced) unplaced=1 ;; esac ;;
    esac
  done < "$1"
  if [ "$RR_E2E_PACKAGE" = reuse ] && [ "$RR_IMAGE_AND_ZIPS" = reuse ]; then
    RR_STEP1=still-counts RR_STEP1_WHY="nothing its lanes test changed"
  else
    RR_STEP1=refused
    if [ "$product" = 1 ]; then RR_STEP1_WHY="the product changed"
    elif [ "$unplaced" = 1 ]; then RR_STEP1_WHY="a path it cannot place"
    else RR_STEP1_WHY="the CI toolchain changed"; fi
    [ "$toolchain" = 1 ] && [ "$product" = 1 ] && RR_STEP1_WHY="the product and the CI toolchain changed"
  fi
}

# rr_everything <why> <note>: every part rebuilds, step 1 refused (an unknown commit, a dirty tree)
rr_everything() {
  RR_E2E_PACKAGE=rebuild RR_IMAGE_AND_ZIPS=rebuild RR_WINDOWS_PACK=rebuild
  RR_WHY_E2E_PACKAGE="($1)" RR_WHY_IMAGE_AND_ZIPS="($1)" RR_WHY_WINDOWS_PACK="($1)"
  RR_STEP1=refused RR_STEP1_WHY="$1" RR_NOTE="$2"
}

# reuse_or_rebuild <from> <to> [<checkout>]: THE RULE. Sets the RR_* variables (see the header); returns 0 when every part is
# reuse, 1 when one rebuilds, 2 when a commit cannot be read (every part rebuild then too).
reuse_or_rebuild() {
  local from to tree="${3:-}" changed tests dirty rc=0
  RR_NOTE="" RR_CHANGED=0
  RR_FROM="${1:0:8}" RR_TO="${2:0:8}"
  from=$(git -C "$RR_REPO" rev-parse --verify -q "${1:-none}^{commit}" 2>/dev/null)
  to=$(git -C "$RR_REPO" rev-parse --verify -q "${2:-none}^{commit}" 2>/dev/null)
  if [ -z "$from" ] || [ -z "$to" ]; then
    rr_everything "unknown commit" "git cannot read '${1:-}' or '${2:-}' in $RR_REPO"; return 2
  fi
  RR_FROM="${from:0:8}" RR_TO="${to:0:8}"
  if [ -n "$tree" ]; then
    dirty=$(git -C "$tree" status --porcelain --untracked-files=no 2>&1)
    if [ -n "$dirty" ]; then
      rr_everything "dirty tree" "$tree has changes to tracked files: $(printf '%s\n' "$dirty" | head -3 | tr '\n' ' ')"; return 1
    fi
  fi
  changed=$(mktemp) && tests=$(mktemp) || return 2
  git -C "$RR_REPO" diff --no-renames --name-only "$from" "$to" > "$changed" 2>/dev/null || {
    rm -f "$changed" "$tests"; rr_everything "unknown commit" "git diff $RR_FROM $RR_TO failed"; return 2; }
  RR_CHANGED=$(grep -c . "$changed")
  shipped_test_files "$from" "$to" > "$tests"
  rr_answer_for_paths "$changed" "$tests"
  rm -f "$changed" "$tests"
  [ "$RR_E2E_PACKAGE$RR_IMAGE_AND_ZIPS$RR_WINDOWS_PACK" = reusereusereuse ] || rc=1
  return $rc
}

# rr_print: the answer for people, one line per part, then step 1
rr_print() {
  echo "REUSE_RULE from=$RR_FROM to=$RR_TO files_changed=$RR_CHANGED${RR_NOTE:+ note=\"$RR_NOTE\"}"
  printf '  %-15s %-8s %s\n' e2e-package "$RR_E2E_PACKAGE" "${RR_WHY_E2E_PACKAGE:-(nothing it ships changed)}"
  printf '  %-15s %-8s %s\n' image-and-zips "$RR_IMAGE_AND_ZIPS" "${RR_WHY_IMAGE_AND_ZIPS:-(nothing it ships changed)}"
  printf '  %-15s %-8s %s\n' windows-pack "$RR_WINDOWS_PACK" "${RR_WHY_WINDOWS_PACK:-(nothing it ships changed)}"
  printf '  %-15s %-8s %s\n' step1 "$RR_STEP1" "($RR_STEP1_WHY)"
}

# rr_step1_words: step 1's answer as the replay table writes it
rr_step1_words() { [ "$RR_STEP1" = still-counts ] && echo "still counts" || echo "refused: $RR_STEP1_WHY"; }

# rr_replay: the acceptance check. The three transitions of the 16.6.0 release between its four chains must print exactly the
# plan's table (plan-2026-10-28-faster-releases-trusted-light-set.md, "The replay"); then one case each for a test-only
# commit, a product commit, a dirty tree, a path it cannot place, a shipped src/test file, a unit test, the CI toolchain and
# a Windows-only packer. Prints each answer with PASS or FAIL; exit 0 only when all pass.
rr_replay() {
  local fails=0 row got want tmp scratch none
  echo "THE REPLAY (16.6.0): what each transition between the chains really needed"
  printf '%-10s%-10s%-13s%-14s%-14s%s\n' from to "e2e package" "image + zips" "Windows pack" "step 1, green on the earlier commit"
  while IFS='|' read -r from to want; do
    reuse_or_rebuild "$from" "$to"
    got="$RR_E2E_PACKAGE $RR_IMAGE_AND_ZIPS $RR_WINDOWS_PACK $(rr_step1_words)"
    printf '%-10s%-10s%-13s%-14s%-14s%s\n' "$from" "$to" "$RR_E2E_PACKAGE" "$RR_IMAGE_AND_ZIPS" "$RR_WINDOWS_PACK" "$(rr_step1_words)"
    [ "$got" = "$want" ] || { echo "  FAIL  expected: $want"; fails=$((fails + 1)); }
  done <<'ROWS'
3f5c21f0|889001e6|reuse reuse rebuild still counts
889001e6|01eea21f|rebuild rebuild rebuild refused: the product changed
01eea21f|daaae02a|reuse reuse reuse still counts
ROWS
  echo
  echo "THE OTHER CASES"
  # rr_replay_case <label> <expected "e2e image windows step1">: compares the RR_* answers just set
  rr_replay_case() {
    got="$RR_E2E_PACKAGE $RR_IMAGE_AND_ZIPS $RR_WINDOWS_PACK $(rr_step1_words)"
    if [ "$got" = "$2" ]; then echo "  PASS  $1: $got"; else echo "  FAIL  $1: $got (expected: $2)"; fails=$((fails + 1)); fi
  }
  reuse_or_rebuild d59a7f78~1 d59a7f78
  rr_replay_case "test-only commit d59a7f78 (one e2e spec)" "reuse reuse reuse still counts"
  reuse_or_rebuild dcfc6c01~1 dcfc6c01
  rr_replay_case "product commit dcfc6c01 (server + Electron main)" "rebuild rebuild rebuild refused: the product changed"
  # a dirty tree: a scratch clone sharing this repository's objects, one e2e helper checked out and changed. Even a
  # test-only change rebuilds: a tree with uncommitted changes is no commit.
  scratch=$(mktemp -d) || return 2
  if git clone -q --shared --no-checkout "$RR_REPO" "$scratch/tree" 2>/dev/null &&
     git -C "$scratch/tree" sparse-checkout set --no-cone /frend/reporting/e2e/helpers/fluent-tester.ts 2>/dev/null &&
     git -C "$scratch/tree" checkout -q daaae02a 2>/dev/null; then
    echo "// dirty" >> "$scratch/tree/frend/reporting/e2e/helpers/fluent-tester.ts"
    reuse_or_rebuild 01eea21f daaae02a "$scratch/tree"
    rr_replay_case "dirty tree (01eea21f -> daaae02a, one e2e helper changed in the checkout)" \
      "rebuild rebuild rebuild refused: dirty tree"
  else
    echo "  FAIL  dirty tree: could not make the scratch clone in $scratch"; fails=$((fails + 1))
  fi
  rm -rf "$scratch"
  # the made-up paths go through the same placement as a commit's files
  tmp=$(mktemp) && none=$(mktemp) || return 2
  shipped_test_files daaae02a > "$none"
  printf 'new-top-folder/notes.txt\n' > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "a path it cannot place (new-top-folder/notes.txt)" "rebuild rebuild rebuild refused: a path it cannot place"
  printf 'bkend/reporting/src/test/groovy/reporting/scriptedReport_invoice.groovy\n' > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "a src/test file NoExeAssembler ships (scriptedReport_invoice.groovy)" \
    "rebuild rebuild rebuild refused: the product changed"
  printf 'bkend/server/src/test/java/com/sourcekraft/documentburster/common/ServicesManagerHostPathTest.java\n' > "$tmp"
  rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "a unit test (ServicesManagerHostPathTest.java)" "reuse reuse reuse still counts"
  printf 'asbl/ci/Dockerfile\n' > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "the CI toolchain (asbl/ci/Dockerfile)" "rebuild rebuild reuse refused: the CI toolchain changed"
  printf 'asbl/pack-datapallas.bat\n' > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "a Windows-only packer (asbl/pack-datapallas.bat)" "reuse reuse rebuild still counts"
  rm -f "$tmp" "$none"
  # The never-shipped list holds only while no packer names one of its folders: the packers' code (comments left out) at
  # this checkout's HEAD, so a new copy line breaks the replay instead of being missed. src/test is not searched here: the
  # files an assembler copies from it are read by shipped_test_files and count as shipped.
  got=$(git -C "$RR_REPO" grep -nE 'frend/reporting/e2e|e2e/|asbl/ci|asbl/src/uat|src/uat|\.docs' HEAD -- "$ASSEMBLY/" \
          asbl/pack-datapallas.bat asbl/pack-prepare-for-e2e.bat Dockerfile frend/reporting/electron-builder.json 2>/dev/null |
        grep -vE '^[^:]+:[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|#|REM |@?echo )')
  if [ -z "$got" ]; then
    echo "  PASS  the packers name no never-shipped folder (assemblers, both .bat packers, Dockerfile, electron-builder.json)"
  else
    echo "  FAIL  a packer names a never-shipped folder: place it in this file's lists first"; printf '        %s\n' "$got"
    fails=$((fails + 1))
  fi
  echo
  if [ "$fails" = 0 ]; then echo "REPLAY PASS"; return 0; fi
  echo "REPLAY FAIL ($fails)"; return 1
}

# Run as a command (not sourced): the subcommands of the header
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  rr_tree_arg() { [ "${1:-}" = --tree ] && [ -n "${2:-}" ] && echo "$2"; }
  case "${1:-}" in
    parts)  [ $# -ge 3 ] || { sed -n '2,35p' "$0"; exit 2; }
            reuse_or_rebuild "$2" "$3" "$(rr_tree_arg "${4:-}" "${5:-}")"; rc=$?; rr_print; exit $rc ;;
    part)   [ $# -ge 4 ] || { sed -n '2,35p' "$0"; exit 2; }
            reuse_or_rebuild "$3" "$4" "$(rr_tree_arg "${5:-}" "${6:-}")"
            case "$2" in
              e2e-package) a=$RR_E2E_PACKAGE ;; image-and-zips) a=$RR_IMAGE_AND_ZIPS ;; windows-pack) a=$RR_WINDOWS_PACK ;;
              *) echo "FAIL  the part must be e2e-package, image-and-zips or windows-pack (got '$2')"; exit 2 ;;
            esac
            echo "$a"; [ "$a" = reuse ]; exit $? ;;
    step1)  [ $# -ge 3 ] || { sed -n '2,35p' "$0"; exit 2; }
            reuse_or_rebuild "$2" "$3"; echo "$RR_STEP1 ($RR_STEP1_WHY)"; [ "$RR_STEP1" = still-counts ]; exit $? ;;
    replay) rr_replay; exit $? ;;
    *)      sed -n '2,35p' "$0"; exit 2 ;;
  esac
fi

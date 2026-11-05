#!/bin/bash
# The one rule that says what a change can affect: given two commits, for each part a release builds, "reuse" (the build of
# the earlier commit still holds for the later one) or "rebuild" (something that part ships changed), with the files that
# decided; and for step 1, "still counts" (step 1 green on the earlier commit holds for the later one) or "refused".
#
# THE PARTS and what each is built from (asbl/src/test/java/.../assembly/AssemblerTest.java):
#   e2e-package     the e2e package, asbl/target/package/verified-db-noexe: AssemblerTest#prepareForE2E = NoExeAssembler
#                   (dp-ci.sh prepare_package on this host, asbl\pack-prepare-for-e2e.bat on the VM)
#   image-and-zips  the Docker image and datapallas-server-docker.zip, `dp-ci.sh build`:
#                   AssemblerTest#assembleDataPallasServerLinux = NoExeAssembler, DockerAssembler (no datapallas-server.zip
#                   since 16.6.2: the one users get is the Windows pack's)
#   windows-pack    the Windows pack, pack-datapallas.bat on the VM: AssemblerTest#assembleDataPallasAndDataPallasServer =
#                   NoExeAssembler, DataPallasAssembler, DataPallasServerSpringBootAssembler, DataPallasSourceAssembler
#   step 1's lanes test the e2e package (web) and the image with its zip (docker-server), never the Windows pack: step 1
#   still counts when both of those are reuse.
#
# HOW, in order:
#   1. the files that differ between the two commits (git diff --no-renames: a rename names both paths); a commit git cannot
#      read means every part rebuilds and step 1 is refused;
#   2. with a checkout given (--tree), tracked files changed in it mean the same: a dirty tree is no commit, nothing says
#      what it was built from;
#   3. the packers read at both commits (packers_check, THE PACKERS CHECK below): a packer line that names a never-shipped
#      path, or a parent of one, and is not a known mention means the list cannot be trusted there: every part rebuilds
#      and step 1 is refused;
#   4. each file placed (place_path): on the never-shipped list -> nothing; one part's own packer file -> that part only;
#      anything else the packers read (bkend/, frend/, asbl/, xtra-tools/, pom.xml) -> every part; a path outside all of
#      them cannot be placed -> every part, named so;
#   5. step 1 still counts when neither the e2e package nor the image with the zips rebuilds.
#
# USE (from anywhere; the commits are read from this file's repository, RR_REPO replaces it):
#   bash asbl/ci/reuse-or-rebuild.sh parts <from> <to> [--tree <checkout>]   the answer: one line per part, then step 1
#   bash asbl/ci/reuse-or-rebuild.sh part <part> <from> <to> [--tree <dir>]  one part: prints reuse|rebuild, exit 0|1
#   bash asbl/ci/reuse-or-rebuild.sh step1 <from> <to>                       prints still-counts|refused, exit 0|1
#   bash asbl/ci/reuse-or-rebuild.sh packers <commit>                        the packers check there: each mention (KNOWN
#                                                                            with its reason, NAMES for any other), then
#                                                                            PASS or FAIL; exit 0|1, 2 an unreadable commit
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
#                     "a path it cannot place" | "dirty tree" | "unknown commit" | "a packer names a never-shipped path"
#   RR_FROM RR_TO     the two commits, 8 characters; RR_CHANGED the number of files that differ
#   RR_NOTE           a dirty tree, an unknown commit, or the packer line that names a never-shipped path, in words
#                     (empty otherwise)

# THE NEVER-SHIPPED LIST: a path under one of these is in no part, so a change to it rebuilds nothing. Every entry was checked
# against what the packers copy (at ac01cd76: the six assemblers, AssemblerTest, both .bat packers, the product Dockerfile
# and .dockerignore, electron-builder.json), and packers_check reads them again at both commits of every question:
#   frend/reporting/e2e/  the Playwright suite. No assembler or .bat names it; the image's .dockerignore drops **/e2e/; the
#                         Electron app is frend/reporting/app (electron-builder's two-package layout), not frend/reporting.
#   asbl/ci/              the CI scripts and jobs; no packer names it. Except what decides the built bytes, kept as shipped
#                         below (TOOLCHAIN): the toolchain image the Linux builds run in and the npm script shell.
#   asbl/src/uat/         the Robot UAT: it runs against the pack, nothing copies it into one.
#   */src/test/           the unit tests: the builds compile and run them, no jar holds them. Except asbl/src/test/, whose
#                         AssemblerTest IS the packers' entry (it says what each part assembles), and every src/test file an
#                         assembler copies into the package: NoExeAssembler ships four sample Groovy scripts and five HTML
#                         templates from bkend/reporting/src/test/. Those are read from the assemblers' sources at both
#                         commits (shipped_test_files), so a new copy line is picked up without editing this list. And
#                         every src/test inside a folder the assemblers copy whole (COPIED_WHOLE): the playgrounds'
#                         tests in db-template/_apps ship in every zip (16.6.2's three zips hold 11 such entries).
#   .docs/                notes, ignored by git: never in a commit.
#   .github/              the GitHub repository's own files: its workflows, dependabot.yml and the pictures the README
#                         shows. One workflow (update-stars.yml) commits the star counter
#                         .github/screenshots/github-star-animation.svg to main every day and on every new star, so main
#                         moves by it between a release's sign-off and its upload. No packer names the folder.
# The one packer that copies everything is the Windows pack's source zip (DataPallasSourceAssembler = `git archive HEAD`): it
# carries these files as source, never as something the product runs, and no test reads them out of it. Execution 2 packs it
# from its own commit, so the source zip a user gets always matches its commit.
NEVER_SHIPPED=(frend/reporting/e2e/ asbl/ci/ asbl/src/uat/ '*/src/test/' .docs/ .github/)
# the template folders the assemblers copy whole, every tracked file (Utils.copyTrackedTemplateFiles; PackageCheck names the
# same three): all of a folder here ships, a src/test inside it too
COPIED_WHOLE=(asbl/src/main/external-resources/db-template/ asbl/src/main/external-resources/db-server-template/
              bkend/reporting/src/main/external-resources/template/)

# Under asbl/ci/ but shipped: they decide the built bytes of the Linux builds (the e2e package on this host, the image and the
# zips), not the VM's. A change to how dp-ci.sh DRIVES a build stays CI: execution 2 rebuilds with it.
TOOLCHAIN=(asbl/ci/Dockerfile asbl/ci/npm-script-shell.sh)

# The packers' own files used by one or two parts only (the rest of the product is in all three)
ASSEMBLY=asbl/src/main/java/com/sourcekraft/documentburster/assembly
WINDOWS_PACK_ONLY=("$ASSEMBLY/DataPallasAssembler.java" "$ASSEMBLY/DataPallasSourceAssembler.java" asbl/pack-datapallas.bat
                   "$ASSEMBLY/DataPallasServerSpringBootAssembler.java")   # datapallas-server.zip: the pack's only, since 16.6.2
IMAGE_AND_ZIPS_ONLY=("$ASSEMBLY/DockerAssembler.java" Dockerfile .dockerignore asbl/docker/)
E2E_PACKAGE_ONLY=(asbl/pack-prepare-for-e2e.bat)
# the Server's template files: the Dockerfile copies them into the image, DataPallasServerSpringBootAssembler into the pack's
# datapallas-server.zip; the e2e package has none of them
IMAGE_AND_WINDOWS_PACK=(asbl/src/main/external-resources/db-server-template/)
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
  if rr_matches "$p" "${NEVER_SHIPPED[@]}" && ! rr_matches "$p" "${COPIED_WHOLE[@]}"; then
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
  if rr_matches "$p" "${IMAGE_AND_WINDOWS_PACK[@]}"; then printf 'image-and-zips windows-pack|product\n'; return; fi
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

# THE PACKERS CHECK (packers_check <commit>): the never-shipped list holds only while no packer copies one of its paths.
# packers_check reads the packers at a commit, each path from the folder its packer runs in, and finds each line that names
# a path under a never-shipped entry, or a parent of one. Every such line must be a known mention (below, with its reason);
# any other means every part rebuilds and step 1 is refused, whatever changed (RR_STEP1_WHY "a packer names a never-shipped
# path", RR_NOTE the packer and its line). What it reads, per packer:
#   Java (the assembly folder's files, AssemblerTest): the string literals ("a" + "b" read as one), each path from the
#     repository's root ("/x" after getTopProjectFolderPath) or from asbl/ (where Maven runs them), both tried;
#   .bat: the words of each line, from asbl/ and from the root (they pushd ..\ before Maven);
#   Dockerfile: COPY/ADD sources from the build context (the root); --from= copies another stage's files, never a source path;
#   .dockerignore: only its ! lines (an exclude ships nothing; ! puts files back);
#   electron-builder.json: its strings, from frend/reporting.
# Comments are skipped. The root alone, a packer's own folder (. and ..) and a word that names no top folder of the commit are
# no paths. A literal with a folder named e2e, uat, .docs or .github (or asbl/ci) that resolves nowhere (its parent a
# variable) counts too. Not seen: a path built only from variables. The src/test files an assembler copies
# (shipped_test_files) are known by rule: they are placed as shipped. A commit's never-shipped folders are its own: each
# entry, and each <folder>/src/test in its tree that place_path calls never-shipped.
# The packers: <path at the commit, or a folder of .java files>|<the folder it runs in>|<how its paths are written>
PACKERS=("$ASSEMBLY/|asbl|java"
         "asbl/src/test/java/com/sourcekraft/documentburster/assembly/AssemblerTest.java|asbl|java"
         "asbl/pack-datapallas.bat|asbl|bat" "asbl/pack-prepare-for-e2e.bat|asbl|bat"
         "Dockerfile||dockerfile" ".dockerignore||dockerignore" "frend/reporting/electron-builder.json|frend/reporting|json")
# The known mentions, three items each: the packer, its line (spaces as they come), and why it ships nothing of the list.
# The same 13 lines at every commit from 3f5c21f0 (16.6.0) to 457cf22e (2026-11-05). A line changed or added is no longer
# known: read it, then add it here with its reason, or fix the packer.
KNOWN_MENTIONS=(
  "$ASSEMBLY/DataPallasAssembler.java"
  'new ProcessExecutor().directory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting"))'
  "runs npm in frend/reporting to build the Electron app; the pack takes only frend/reporting/release/DataPallas.exe"
  "$ASSEMBLY/DataPallasServerSpringBootAssembler.java"
  'new ProcessExecutor().directory(new File(Utils.getTopProjectFolderPath() + "/frend/reporting"))'
  "runs npm in frend/reporting to build the web app; the server zip takes only frend/reporting/dist"
  "$ASSEMBLY/NoExeAssembler.java"
  'String reportingDir = Utils.getTopProjectFolderPath() + "/frend/reporting";'
  "runs npm (custom:compile-and-stage-web-components) in frend/reporting; it copies nothing from there"
  "$ASSEMBLY/DataPallasSourceAssembler.java"
  'String[] requiredPaths = { "/frend", "/bkend", "/pom.xml", "/README.md" };'
  "the source zip's check that git archive kept these top folders: the source zip is the commit's files as source, by design"
  asbl/pack-datapallas.bat
  'call mvn clean install -pl asbl -am -DskipTests -U >> asbl\pack-datapallas.log 2>&1'
  "Maven builds the asbl module and what it needs; the packers decide what ships"
  asbl/pack-datapallas.bat
  'call mvn test -pl asbl -Dtest=AssemblerTest#assembleDataPallasAndDataPallasServer -X >> asbl\pack-datapallas.log 2>&1'
  "Maven runs the packers' entry, AssemblerTest, in the asbl module"
  asbl/pack-prepare-for-e2e.bat
  'call mvn clean install -pl bkend/common,asbl -am -DskipTests >> asbl\pack-prepare-for-e2e.log 2>&1'
  "Maven builds the bkend/common and asbl modules; their jars hold no test class, the packers decide what ships"
  asbl/pack-prepare-for-e2e.bat
  'call mvn test -pl asbl -Dtest=AssemblerTest#prepareForE2E >> asbl\pack-prepare-for-e2e.log 2>&1'
  "Maven runs the packers' entry, AssemblerTest, in the asbl module"
  Dockerfile 'COPY ./bkend/common/src ./bkend/common/src'
  "the backend build stage compiles the module; the image takes only the jars (COPY --from=backend-build), no test class"
  Dockerfile 'COPY ./bkend/update/src ./bkend/update/src'
  "the backend build stage compiles the module; the image takes only the jars (COPY --from=backend-build), no test class"
  Dockerfile 'COPY ./bkend/reporting/src ./bkend/reporting/src'
  "the backend build stage compiles the module; the image takes only the jars (COPY --from=backend-build), no test class"
  Dockerfile 'COPY ./bkend/server/src ./bkend/server/src'
  "the backend build stage compiles the module; the image takes only the jars (COPY --from=backend-build), no test class"
  Dockerfile 'COPY ./frend/reporting .'
  "the frontend build stage; .dockerignore drops **/e2e/ from the build context, and the image takes only the stage's dist"
)
# A known mention that holds only while another packer line is there, four items each: the packer, its line, the other
# packer, the line it needs. Without it the mention is no longer known.
KNOWN_MENTION_NEEDS=(Dockerfile 'COPY ./frend/reporting .' .dockerignore '**/e2e/')

# packers_check <commit>: THE PACKERS CHECK at that commit. Prints each mention (KNOWN <packer>:<line> <path>, <how>: <reason>,
# or NAMES ... <the line> for any other), then "PACKERS <commit> PASS|FAIL: ...". rc 0 PASS, 1 FAIL, 2 the commit unreadable
# or the check could not run (python3)
packers_check() {
  local commit tests rc=0
  commit=$(git -C "$RR_REPO" rev-parse --verify -q "${1:-none}^{commit}" 2>/dev/null) ||
    { echo "PACKERS ${1:-} FAIL: git cannot read the commit in $RR_REPO"; return 2; }
  tests=$(mktemp) || return 2
  shipped_test_files "$commit" > "$tests"
  RR_NEVER_SHIPPED=$(printf '%s\n' "${NEVER_SHIPPED[@]}") RR_TOOLCHAIN=$(printf '%s\n' "${TOOLCHAIN[@]}") \
  RR_COPIED_WHOLE=$(printf '%s\n' "${COPIED_WHOLE[@]}") RR_PACKERS=$(printf '%s\n' "${PACKERS[@]}") \
  RR_KNOWN=$(printf '%s\n' "${KNOWN_MENTIONS[@]}") RR_KNOWN_NEEDS=$(printf '%s\n' "${KNOWN_MENTION_NEEDS[@]}") \
  RR_SHIPPED_TESTS="$tests" python3 -I - "$RR_REPO" "$commit" <<'PY' || rc=$?
import os, posixpath, re, subprocess, sys

repo, commit = sys.argv[1], sys.argv[2]
def items(name):
    return [l for l in os.environ.get(name, '').split('\n') if l.strip()]
def git(*args):
    return subprocess.run(['git', '-C', repo] + list(args), capture_output=True).stdout.decode('utf-8', 'replace')
def spaces(code):
    return ' '.join(code.split())
def under(path, folder):
    return path == folder or path.startswith(folder + '/')

tree = git('ls-tree', '-r', '--name-only', commit).splitlines()
if not tree:
    print('PACKERS %s FAIL: git cannot list its files' % commit[:8]); sys.exit(2)
top_names = {p.split('/')[0] for p in tree} | {'.docs'}
toolchain = set(items('RR_TOOLCHAIN'))
copied_whole = [e.rstrip('/') for e in items('RR_COPIED_WHOLE')]
shipped_tests = [l.rstrip('/') for l in open(os.environ['RR_SHIPPED_TESTS']).read().split('\n') if l.strip()]
# this commit's never-shipped folders, as place_path places them
never = []
for entry in items('RR_NEVER_SHIPPED'):
    if entry.startswith('*/'):
        tail = '/' + entry[2:].rstrip('/') + '/'
        folders = {p[:p.find(tail) + len(tail) - 1] for p in tree if tail in p}
        never += sorted(f for f in folders if not under(f, 'asbl/src/test') and not any(under(f, c) for c in copied_whole))
    else:
        never.append(entry.rstrip('/'))
NAMED_FOLDERS = {'e2e', 'uat', '.docs', '.github'}

def how_it_meets(path):
    """(how the path meets the list, shipped by rule) or (None, False)"""
    if path in toolchain:
        return None, False
    for folder in never:
        if under(path, folder):
            return 'under ' + folder + '/', any(under(path, t) for t in shipped_tests)
        if folder.startswith(path + '/'):
            return 'a parent of ' + folder + '/', False
    return None, False

def paths_of(word, runs_in, from_root_too):
    """the repository paths a word of a packer may name"""
    w = word.replace('\\', '/').replace('%~dp0', '')
    w = re.sub(r'(/\*\*?|\*+)$', '', w).rstrip('/')
    if w.startswith('./'):
        w = w[2:]
    if not w or not re.search(r'[A-Za-z0-9]', w) or w in ('.', '..'):
        return []   # no name, a packer's own folder, or the root: where it runs, not what it copies
    if w.startswith('/'):
        starts = [w[1:]]
    else:
        starts = [posixpath.join(runs_in, w)] if runs_in else [w]
        if from_root_too and runs_in:
            starts.append(w)
    found = []
    for s in starts:
        n = posixpath.normpath(s) if s else '.'
        if n not in ('.', '') and not n.startswith('..') and n.split('/')[0] in top_names:
            found.append(n)
    return found

def words_of(kind, code):
    """the words of one packer line that may be paths"""
    if kind in ('java', 'json'):
        if kind == 'java':
            code = re.sub(r'"\s*\+\s*"', '', code)   # "a" + "b" is one path
        literals = re.findall(r'"((?:[^"\\]|\\.)*)"', code)
        if kind == 'java':
            literals = [l.replace('\\\\', '\\') for l in literals]
        return [w for l in literals for w in re.split(r'[\s,;]+', l) if w]
    if kind == 'dockerfile':
        words = code.split()
        if words and words[0].upper() in ('COPY', 'ADD'):
            if any(w.startswith('--from=') for w in words):
                return []
            return [w for w in words[1:] if not w.startswith('--')][:-1]   # the last one is where they go in the image
        return re.split(r'[\s,=;"\'()\[\]]+', code)
    if kind == 'dockerignore':
        return [code.strip()[1:]] if code.strip().startswith('!') else []
    return re.split(r'[\s,=;"\'()]+', code)

def is_comment(kind, code):
    s = code.strip()
    if not s:
        return True
    if kind == 'java':
        return s.startswith(('//', '*', '/*'))
    if kind == 'bat':
        return re.match(r'(?i)^(rem\b|::|@?echo\b)', s) is not None
    if kind in ('dockerfile', 'dockerignore'):
        return s.startswith('#')
    return False

sources = {}
def source(path):
    if path not in sources:
        sources[path] = git('show', '%s:%s' % (commit, path)).split('\n')
    return sources[path]

k = items('RR_KNOWN')
known = {(k[i], spaces(k[i + 1])): k[i + 2] for i in range(0, len(k) - 2, 3)}
n = items('RR_KNOWN_NEEDS')
for i in range(0, len(n) - 3, 4):
    key = (n[i], spaces(n[i + 1]))
    if key in known and spaces(n[i + 3]) not in {spaces(l) for l in source(n[i + 2])}:
        del known[key]   # what makes it harmless is gone: it is a mention like any other
        print('  NOTE   %s: "%s" is known only while %s has "%s"; it does not at %s' % (n[i], n[i + 1], n[i + 2], n[i + 3], commit[:8]))
packers = []
for spec in items('RR_PACKERS'):
    path, runs_in, kind = spec.split('|')
    if path.endswith('/'):
        packers += [(p, runs_in, kind) for p in tree if p.startswith(path) and p.endswith('.java') and '/' not in p[len(path):]]
    elif path in tree:
        packers.append((path, runs_in, kind))
others, known_count, known_used = [], 0, set()
for path, runs_in, kind in packers:
    for number, code in enumerate(source(path), 1):
        if is_comment(kind, code):
            continue
        reported, line_counted = set(), False
        for word in words_of(kind, code):
            found = [(p,) + how_it_meets(p) for p in paths_of(word, runs_in, kind in ('java', 'bat'))]
            found = [f for f in found if f[1]]
            if not found and (set(word.replace('\\', '/').split('/')) & NAMED_FOLDERS or 'asbl/ci' in word.replace('\\', '/')):
                found = [(word, 'a never-shipped folder by its name', False)]
            for named, how, shipped in found:
                if (named, how) in reported:
                    continue
                reported.add((named, how))
                key = (path, spaces(code))
                if shipped:
                    known_count += 1
                    print('  KNOWN  %s:%d  %s, %s: an assembler copies it (shipped_test_files): placed as shipped' % (path, number, named, how))
                elif key in known:
                    known_count += 1; known_used.add(key)
                    print('  KNOWN  %s:%d  %s, %s: %s' % (path, number, named, how, known[key]))
                else:
                    if not line_counted:
                        others.append('%s:%d: %s' % (path, number, spaces(code)[:200])); line_counted = True
                    print('  NAMES  %s:%d  %s, %s: %s' % (path, number, named, how, spaces(code)[:200]))
for path, code in sorted(set(known) - known_used):
    print('  NOTE   a known mention not found at %s: %s: %s' % (commit[:8], path, code))
if others:
    print('PACKERS %s FAIL: %d packer line(s) name a never-shipped path, not a known mention; the first: %s'
          % (commit[:8], len(others), others[0]))
    sys.exit(1)
print('PACKERS %s PASS: %d packer files read, %d known mention(s), no other' % (commit[:8], len(packers), known_count))
PY
  rm -f "$tests"
  case "$rc" in 0|1) return "$rc" ;; *) echo "PACKERS ${commit:0:8} FAIL: the check could not run (exit $rc)"; return 2 ;; esac
}

# packers_verdict <commit>: packers_check's answer for that commit, once per commit in this process: sets RR_PACKERS_FIRST
# ("at <commit>: " and its FAIL line: the first other mention, or why the check could not run) and returns its rc
declare -gA RR_PACKERS_RC=() RR_PACKERS_NOTE=()
packers_verdict() {
  local out rc=0
  if [ -z "${RR_PACKERS_RC[$1]+set}" ]; then
    out=$(packers_check "$1") || rc=$?
    RR_PACKERS_RC[$1]=$rc
    RR_PACKERS_NOTE[$1]=$(printf '%s\n' "$out" | sed -n 's/^PACKERS \([^ ]*\) FAIL: /at \1: /p' | tail -1)
  fi
  RR_PACKERS_FIRST="${RR_PACKERS_NOTE[$1]}"
  return "${RR_PACKERS_RC[$1]}"
}

# rr_everything <why> <note>: every part rebuilds, step 1 refused (an unknown commit, a dirty tree, a packer that names a
# never-shipped path)
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
  if ! packers_verdict "$from" || ! packers_verdict "$to"; then
    rr_everything "a packer names a never-shipped path" "$RR_PACKERS_FIRST"; return 1
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
# commit, the star counter's commit, a product commit, a dirty tree, a path it cannot place, a shipped src/test file, a
# unit test, the CI toolchain, a Windows-only packer, the server zip's packer, the Server's template files and a test inside
# a template folder copied whole; then the packers check at this checkout's HEAD. Prints each answer with PASS or FAIL;
# exit 0 only when all pass.
rr_replay() {
  local fails=0 row got want tmp scratch none rc
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
  reuse_or_rebuild 37d1fa00~1 37d1fa00
  rr_replay_case "the star counter's commit 37d1fa00 (.github/screenshots/github-star-animation.svg)" \
    "reuse reuse reuse still counts"
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
  printf '%s\n' "$ASSEMBLY/DataPallasServerSpringBootAssembler.java" > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "the server zip's packer (DataPallasServerSpringBootAssembler.java: the Windows pack's only since 16.6.2)" \
    "reuse reuse rebuild still counts"
  printf 'asbl/src/main/external-resources/db-server-template/startServer.bat\n' > "$tmp"; rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "the Server's template files (db-server-template/: the image and the pack's server zip)" \
    "reuse rebuild rebuild refused: the product changed"
  printf 'asbl/src/main/external-resources/db-template/_apps/flowkraft/grails-playground/src/test/resources/application-test.yml\n' > "$tmp"
  rr_answer_for_paths "$tmp" "$none"
  rr_replay_case "a test inside a folder copied whole (db-template/_apps/flowkraft/grails-playground/src/test/: in every zip)" \
    "rebuild rebuild rebuild refused: the product changed"
  rm -f "$tmp" "$none"
  # the never-shipped list holds only while no packer names one of its paths: the packers check at this checkout's HEAD,
  # so a new copy line breaks the replay instead of being missed (and every question about HEAD refuses step 1)
  got=$(packers_check HEAD); rc=$?
  if [ "$rc" = 0 ]; then
    echo "  PASS  the packers at HEAD: $(printf '%s\n' "$got" | sed -n 's/^PACKERS [^ ]* PASS: //p')"
  else
    echo "  FAIL  the packers at HEAD name a never-shipped path (not a known mention):"
    printf '%s\n' "$got" | grep -v '^  KNOWN ' | sed 's/^/      /'
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
    parts)  [ $# -ge 3 ] || { sed -n '2,41p' "$0"; exit 2; }
            reuse_or_rebuild "$2" "$3" "$(rr_tree_arg "${4:-}" "${5:-}")"; rc=$?; rr_print; exit $rc ;;
    part)   [ $# -ge 4 ] || { sed -n '2,41p' "$0"; exit 2; }
            reuse_or_rebuild "$3" "$4" "$(rr_tree_arg "${5:-}" "${6:-}")"
            case "$2" in
              e2e-package) a=$RR_E2E_PACKAGE ;; image-and-zips) a=$RR_IMAGE_AND_ZIPS ;; windows-pack) a=$RR_WINDOWS_PACK ;;
              *) echo "FAIL  the part must be e2e-package, image-and-zips or windows-pack (got '$2')"; exit 2 ;;
            esac
            echo "$a"; [ "$a" = reuse ]; exit $? ;;
    step1)  [ $# -ge 3 ] || { sed -n '2,41p' "$0"; exit 2; }
            reuse_or_rebuild "$2" "$3"; echo "$RR_STEP1 ($RR_STEP1_WHY)"; [ "$RR_STEP1" = still-counts ]; exit $? ;;
    packers) [ $# -ge 2 ] || { sed -n '2,41p' "$0"; exit 2; }
            packers_check "$2"; exit $? ;;
    replay) rr_replay; exit $? ;;
    *)      sed -n '2,41p' "$0"; exit 2 ;;
  esac
fi

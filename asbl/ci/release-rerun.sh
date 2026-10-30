#!/bin/bash
# Re-proves a failure by itself on the build already there, not by a chain: between the two executions of steps 2 and 3,
# and for a step 1 lane red on a few tests. One part, the named tests or an execution's failures in it, retries 0, through
# follow-ci.sh with the lane's own marks, log and report. It builds nothing: it takes an execution's kept files
# (asbl/ci/release-keep.sh) or the build already on this host or the VM, when the one rule (asbl/ci/reuse-or-rebuild.sh)
# says nothing that part ships changed since that build's commit. Otherwise it stops, naming the files and the command that
# rebuilds that part alone; REBUILD=yes runs that rebuild first. Each re-run leaves one line per test in the re-run record,
# and `show` lists an execution's failures, each with its last re-run or "not verified yet".
#
# THE PARTS: where the tests run, and the builds each one takes (the parts of asbl/ci/reuse-or-rebuild.sh):
#   web                  step 1's web lane on this host (dp-ci.sh e2e, E2E_TARGET=web)          e2e-package (this host's)
#   docker-server        step 2's Linux proof and step 1's docker-server lanes (dp-ci.sh e2e,   e2e-package (this host's),
#                        E2E_TARGET=docker-server)                                              image-and-zips
#   windows-vm-docker    step 2's Windows Docker proof (win-e2e.sh docker-e2e)                  image-and-zips
#   windows-vm-server    step 1's Windows server lane (win-e2e.sh server-e2e)                   image-and-zips (this host's
#                                                                                               build: no execution keeps it)
#   windows-vm-electron  step 3's Electron light set and step 1's lane 3 (win-e2e.sh e2e)       e2e-package (the VM's)
#   robot                step 3's Robot UAT (win-e2e.sh robot, dp-ci.sh win robot)              windows-pack (a kept one)
#   Where a build comes from: --kept <folder> = that execution's kept image and docker zip (docker-server,
#   windows-vm-docker) or its kept pack (robot, which needs one); otherwise the newest successful build on this host (its
#   log's IMAGE_TAG, its image, asbl/dist), this checkout's asbl/target/package (its .built-from stamp), the VM's package
#   (the newest WIN_E2E_PACKAGE= line of a Windows log here; the lane checks it again on the VM).
#
# HOW `run`, in order:
#   1. the commit under test: origin/main, fetched, as the lanes' own sync takes it (HEAD when this checkout is ahead);
#      a dry run fetches nothing and takes HEAD;
#   2. the tests: each --test (as `show` names it: "<file> :: <test>"), --failed <kept folder> (that execution's failures
#      in this part, from release-keep.sh failures) or --failed <report> (a lane's Playwright .json or Robot output.xml);
#      none = the part's whole set as its step runs it (the light set; for robot every suite; web has none: name tests);
#   3. for each build the part takes, the rule from that build's commit to the commit under test: reuse, or STOP with the
#      files and the command that rebuilds that part alone (exit 3); REBUILD=yes runs that command first;
#   4. the lane, through asbl/ci/jenkins/follow-ci.sh, E2E_RETRIES=0, E2E_REUSE_BUILD naming the parts it may take from an
#      earlier commit (dp-ci.sh reuse_build_ok checks them again where the lane wants its exact commit), E2E_KEPT_BUILD for
#      a kept image; robot: RELEASE_KEPT, ROBOT_TEST (one run per test, in turn), REBUILD_PACK;
#   5. one line per test into the re-run record, the re-run's failure report beside its log (release-keep.sh
#      report-steps), and the RERUN_RESULT line.
#
# USE:
#   bash asbl/ci/release-rerun.sh run <part> [--kept <folder>|none] [--failed <folder>|<report>] [--test "<test>"]...
#        --kept defaults to the --failed folder for the parts that take kept files; none = this host's build
#   bash asbl/ci/release-rerun.sh show [<kept folder>]   every failure of that execution (the newest kept folder when none is
#        given), each with its last re-run: "verified green", "red again" or "not verified yet", and a note when a change
#        that part ships came after it; then "ready for execution 2" or what is missing. It refuses nothing (exit 0).
#   bash asbl/ci/release-rerun.sh lane <part> <report> <lane commit> <lane time>   a step 1 lane's run, red on the failures
#        of <report>: each one with the newest re-run of that very test (never the whole set: a lane's set is not the
#        light set) since <lane time>; exit 0 and LANE_RERUNS lines only when every one passed alone on a commit where
#        nothing step 1's lanes test changed since <lane commit>; a red step with no failed test never does.
#   DRY_RUN=yes [no]   run: the commit, the build each part would take, the rule's answer, the tests and the command it
#                      would start; it fetches, runs and writes nothing
#   REBUILD=yes [no]   run: a build the rule says rebuild is rebuilt first, as the STOP line says: image-and-zips =
#                      dp-ci.sh build-if-needed; e2e-package = the lane's own prepare (left out of E2E_REUSE_BUILD; the VM:
#                      dp-ci.sh win prepare); windows-pack = pack-datapallas.bat on the VM (REBUILD_PACK=yes)
#   RERUN_COMMIT=<commit> [HEAD of this checkout]   the commit a dry run takes as under test, and the one `show` checks the
#                      re-runs against: to replay what a re-run would do on another commit. A real run refuses it.
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci], RELEASE_ARTIFACTS_DIR [<LOG_DIR>/release-artifacts],
#   RELEASE_RERUN_RECORD [<LOG_DIR>/release-reruns.tsv]: variables so a dry run can point them at scratch copies
#   Example: DRY_RUN=yes bash asbl/ci/release-rerun.sh run windows-vm-docker --failed <LOG_DIR>/release-artifacts/16.6.0-01eea21f
#
# THE RE-RUN RECORD: one tab-separated line per test of each re-run, appended, never rewritten:
#   time  part  test  commit (full)  PASS|FAIL|NOT_RUN  log  report  build  for
#   test: the failure as `show` names it, or * for the part's whole set; build: what the part took ("kept <folder>", "build
#   <tag>", "package <commit>", "rebuilt <part>", one per build, joined by "; "); for: the execution or report it re-proves.
#
# It never uploads, never writes the release record (release-state.sh) or an execution's kept folder, never retries a test,
# builds or packs only with REBUILD=yes, and starts nothing in a dry run. Called by hand or by an agent; `show` also by the
# release's orchestrator before execution 2; `lane` by asbl/ci/release-state.sh record-step1 <target> reruns <mode>.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO=$PWD
CALLER_PWD="${OLDPWD:-$PWD}"
LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
RELEASE_ARTIFACTS_DIR="${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}"
RELEASE_RERUN_RECORD="${RELEASE_RERUN_RECORD:-$LOG_DIR/release-reruns.tsv}"
SERVER_IMAGE_REPO=flowkraft/datapallas-server
KEEP="bash $REPO/asbl/ci/release-keep.sh"
case "${DRY_RUN:-no}" in yes|1) DRY=yes ;; no|0|"") DRY=no ;; *) echo "FAIL  DRY_RUN must be yes or no (got '$DRY_RUN')"; exit 2 ;; esac
REBUILD="${REBUILD:-no}"
case "$REBUILD" in yes|no) ;; *) echo "FAIL  REBUILD must be yes or no (got '$REBUILD')"; exit 2 ;; esac
# reuse_or_rebuild and its RR_* answers
. "$REPO/asbl/ci/reuse-or-rebuild.sh"

usage() { sed -n '2,66p' "$0"; exit 2; }
abs() { case "$1" in /*|"") echo "$1" ;; *) echo "$CALLER_PWD/$1" ;; esac; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# part_builds <part>: the builds that part takes (THE PARTS above); rc 1 for a name that is no part
part_builds() {
  case "$1" in
    web|windows-vm-electron)             echo e2e-package ;;
    docker-server)                       echo "e2e-package image-and-zips" ;;
    windows-vm-docker|windows-vm-server) echo image-and-zips ;;
    robot)                               echo windows-pack ;;
    *) return 1 ;;
  esac
}

# step_part <step label>: the part whose re-run re-proves a step of an execution (release-docker.sh, dp-ci.sh win release),
# then "rebuilt" for a build or a pack step (only a re-run that rebuilt it proves its fix); "-" for a step that is no test
# (the keep, the guard, the upload): execution 2 runs it again.
step_part() {
  case "$1" in
    "DOCKER RELEASE STEP 2/6") echo "docker-server rebuilt" ;;
    "DOCKER RELEASE STEP 3/6") echo docker-server ;;
    "DOCKER RELEASE STEP 4/6") echo windows-vm-docker ;;
    "RELEASE STEP 1/4")        echo "robot rebuilt" ;;
    "RELEASE STEP 2/4")        echo windows-vm-electron ;;
    "RELEASE STEP 3/4")        echo robot ;;
    *)                         echo - ;;
  esac
}

# failures_of <kept folder | report>: every failure there, one line each, its fields split by \x1f (a tab is white space to
# `read`, which would merge an empty field into the next): step, test|step, the id `show` and the record use ("<file> ::
# <test>" for a test, the step's label for a red step with no failed test), its file, its own title, its report. A report
# (a step 1 lane's) is read as one step called LANE REPORT.
failures_of() {
  local src="$1" ch steps
  if [ -d "$src" ]; then
    for ch in docker windows; do $KEEP failures "$src" "$ch" 2>/dev/null; done
  else
    steps=$(mktemp) || return 2
    printf 'LANE REPORT\tFAIL\t%s\t\t%s\t%s\n' "$src" "$src" "$(now)" > "$steps"
    $KEEP failures "$steps"
    rm -f "$steps"
  fi | awk -F'\t' 'BEGIN { OFS = "\037" } {
    # an absolute file (the source of a Robot suite, a path on the VM) by its name; a Playwright spec keeps its path
    f = $4; if (f ~ /^([A-Za-z]:)?[\\\/]/) sub(/.*[\\\/]/, "", f)
    id = ($2 == "step") ? $1 : ((f != "") ? f " :: " $3 : $3)
    print $1, $2, id, f, $5, $6 }'
}

# newest_build: "<tag> <log>" of the newest successful build on this host, the build the lanes install (dp-ci.sh's own rule)
newest_build() {
  local f t
  for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
    grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
    t=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
    [ -n "$t" ] && { echo "$t $f"; return 0; }
  done
}

# vm_package: "<commit> <log>" of the VM's package as the newest WIN_E2E_PACKAGE= line of a Windows log here says it
# (current (X), built (X), reused (X for Y)); the lane reads the stamp on the VM itself and checks it again
vm_package() {
  local f line
  for f in $(ls -1t "$LOG_DIR"/*-win-*.log 2>/dev/null); do
    line=$(grep -aoP '^WIN_E2E_PACKAGE=(current|built|reused) \(\K[0-9a-f]+' "$f" | tail -1)
    [ -n "$line" ] && { echo "$line $f"; return 0; }
  done
}

# build_of <build part> <part> <kept folder or empty>: where that build comes from. Sets B_FROM (its commit, empty when
# there is none), B_WHAT (what it is, in words), B_NOTE (why it cannot be used whatever the rule says, empty otherwise),
# B_TREE (the checkout the rule checks for changes, for the builds on this host) and B_CMD (the command that rebuilds it).
build_of() {
  local bpart="$1" part="$2" kept="$3" tag log lines stamp
  B_FROM="" B_WHAT="" B_NOTE="" B_TREE="" B_CMD=""
  case "$bpart" in
    image-and-zips)
      B_TREE="$REPO" B_CMD="bash asbl/ci/dp-ci.sh build-if-needed (about 40 min)"
      if [ -n "$kept" ]; then
        tag=$(sed -n 's/^docker\.image=.* built_as=[^ :]*:\([^ ]*\)$/\1/p' "$kept/MANIFEST.txt" 2>/dev/null | tail -1)
        B_FROM="${tag#*-}" B_WHAT="kept $kept: $SERVER_IMAGE_REPO:${tag:-?} and its datapallas-server-docker.zip"
        if [ -z "$tag" ] || [ ! -s "$kept/datapallas-server-docker.zip" ]; then
          B_FROM="" B_NOTE="$kept keeps no image or no datapallas-server-docker.zip (its keep failed?): --kept none takes this host's build"
        elif ! docker image inspect "$SERVER_IMAGE_REPO:$tag" >/dev/null 2>&1; then
          if [ -s "$kept/datapallas-server-image.tar" ]; then B_WHAT="$B_WHAT (not in the daemon now: the lane loads it from its image file)"
          else B_NOTE="$SERVER_IMAGE_REPO:$tag is not on this host and $kept keeps no image file"; fi
        fi
        # the Linux lane runs in the dp-ci container, which sees LOG_DIR and the checkout, nothing else
        [ "$part" != docker-server ] || case "$(readlink -f "$kept")/" in "$(readlink -f "$LOG_DIR")"/*|"$REPO"/*) ;; *)
          B_NOTE="$kept is outside $LOG_DIR: the dp-ci container of the Linux lane cannot read it" ;; esac
      else
        read -r tag log <<< "$(newest_build)"
        B_FROM="${tag#*-}" B_WHAT="build ${tag:-none} (${log:-no successful build log in $LOG_DIR})"
        if [ -z "${tag:-}" ]; then B_FROM="" B_NOTE="there is no successful build on this host"
        elif ! docker image inspect "$SERVER_IMAGE_REPO:$tag" >/dev/null 2>&1; then B_NOTE="its image $SERVER_IMAGE_REPO:$tag is not on this host"
        elif [ "$part" = windows-vm-server ] && [ ! -s asbl/dist/datapallas-server.zip ]; then B_NOTE="asbl/dist/datapallas-server.zip is missing"
        elif [ "$part" != windows-vm-server ] && [ ! -s asbl/dist/datapallas-server-docker.zip ]; then B_NOTE="asbl/dist/datapallas-server-docker.zip is missing"
        fi
      fi ;;
    e2e-package)
      if [ "$part" = windows-vm-electron ]; then
        B_CMD="bash asbl/ci/dp-ci.sh win prepare (pack-prepare-for-e2e.bat on the VM, about 1 h)"
        read -r B_FROM log <<< "$(vm_package)"
        B_WHAT="the VM's package, built from ${B_FROM:-?} (${log:-no WIN_E2E_PACKAGE line in a Windows log here}; the lane checks it on the VM)"
        [ -n "$B_FROM" ] || B_NOTE="no Windows log here says what the VM's package is built from"
      else
        B_TREE="$REPO" B_CMD="REBUILD=yes and the same run: the lane's own prepare (pack-prepare-for-e2e, about 26 min)"
        stamp="$REPO/asbl/target/package/.built-from"
        lines=$(grep -c . "$stamp" 2>/dev/null); B_FROM=$(head -n 1 "$stamp" 2>/dev/null)
        B_WHAT="package ${B_FROM:-none} ($stamp)"
        if [ -z "$B_FROM" ] || [ ! -d "$REPO/asbl/target/package/verified-db-noexe/DataPallas" ]; then B_FROM="" B_NOTE="there is no e2e package in this checkout"
        elif [ "$lines" != 1 ]; then B_NOTE="a shortcut changed it (E2E_PACKAGE: a second line in its stamp), so it is no clean build of $B_FROM"
        fi
      fi ;;
    windows-pack)
      B_CMD="REBUILD=yes and the same run: pack-datapallas.bat on the VM first (about 1 h 30)"
      if [ -n "$kept" ] && grep -q '^windows\.file=' "$kept/MANIFEST.txt" 2>/dev/null; then
        B_FROM=$(sed -n 's/^commit=//p' "$kept/MANIFEST.txt") B_WHAT="kept $kept: $(sed -n 's/^windows\.file=\([^ ]*\) .*/\1/p' "$kept/MANIFEST.txt" | paste -sd' ')"
      else
        B_WHAT="no kept pack" B_NOTE="${kept:-no kept folder given}: no kept Windows pack there (--kept <folder> of an execution whose pack passed)"
      fi ;;
  esac
  case "$B_FROM" in *-dirty) B_NOTE="it is a build of a dirty tree, of no commit" ;; esac
}

# js_escape <text>: the text as a JavaScript regex matching itself; any run of white space matches any run (a title may
# hold a line break), and " and % match any character (the Windows lanes carry the regex in a cmd.exe set "N=V" line)
js_escape() { python3 -c 'import re,sys; s=" ".join(sys.argv[1].split()); s=re.sub(r"([\\^$.*+?()\[\]{}|/])", r"\\\1", s); print(re.sub(r"[\"%]", ".", s).replace(" ", r"\s+"))' "$1"; }

# selection <part> <test ids...>: sets SEL_SPEC and SEL_GREP for a Playwright lane (empty both = the part's whole set)
selection() {
  local part="$1" id file title files="" titles=""; shift
  SEL_SPEC="" SEL_GREP=""
  for id in "$@"; do
    case "$id" in *" :: "*) file="${id%% :: *}" title="${id#* :: }" ;; *) file="" title="$id" ;; esac
    title="${title##* > }"
    if [ -n "$file" ]; then
      file=$(python3 -c 'import re,sys; f=re.sub(r"([\\^$.*+?()\[\]{}|])", r"\\\1", sys.argv[1].replace("\\", "/")); print(f.replace("/", "[\\\\/]"))' "$file")
      case "|$files|" in *"|$file|"*) ;; *) files="${files:+$files|}$file" ;; esac
    fi
    titles="${titles:+$titles|}$(js_escape "$title")"
  done
  [ -n "$files" ] && SEL_SPEC="[\\\\/]($files)\$"
  [ -n "$titles" ] && SEL_GREP="(?:$titles)"
  return 0
}

# robot_name <test id>: the Robot test's own name for run-tests.bat --test, any character win_robot_rerun refuses as ?
robot_name() { local t="${1#* :: }"; t="${t##* > }"; printf '%s' "$t" | sed "s|[^A-Za-z0-9 _.,:()'*?/-]|?|g"; }

# results <part> <report> <test ids...>: one line per test, "<id>\tPASS|FAIL|NOT_RUN", read from the lane's report
# (a Playwright .json, a Robot output.xml): PASS only when every run of it passed; NOT_RUN when the report has no such test
results() {
  python3 - "$@" <<'PY'
import json, sys, xml.etree.ElementTree as ET
part, report, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
one = lambda s: ' '.join((s or '').split())
seen = {}
try:
    if report.endswith('.xml'):
        for t in ET.parse(report).getroot().iter('test'):
            s = t.find('status'); seen.setdefault(('', one(t.get('name'))), []).append(s.get('status') if s is not None else '?')
    else:
        def walk(suite):
            for sp in suite.get('specs', []):
                for t in sp.get('tests', []):
                    seen.setdefault((sp.get('file', ''), one(sp.get('title'))), []).append(t.get('status'))
            for sub in suite.get('suites', []): walk(sub)
        for top in json.load(open(report, encoding='utf-8')).get('suites', []): walk(top)
except Exception:
    seen = {}
for i in ids:
    f, t = (i.split(' :: ', 1) + [''])[:2] if ' :: ' in i else ('', i)
    t = one(t.split(' > ')[-1])
    st = [s for (sf, stt), v in seen.items() if stt == t and (not f or report.endswith('.xml') or sf == f) for s in v]
    v = 'NOT_RUN' if not st else ('PASS' if all(s in ('expected', 'PASS') for s in st) else 'FAIL')
    print('%s\t%s' % (i, v))
PY
}

# shq <NAME=value>...: the assignments as a shell reads them back, each value in single quotes (a regex stays readable)
shq() { local kv; for kv in "$@"; do printf "%s='%s' " "${kv%%=*}" "$(printf '%s' "${kv#*=}" | sed "s/'/'\\\\''/g")"; done; }

# newest_log <link> <since>: the log the link points to, when it was written since <since> (epoch seconds)
newest_log() { local l; l=$(readlink -f "$1" 2>/dev/null) || return 0; [ -f "$l" ] && [ "$(stat -c %Y "$l")" -ge "$2" ] && echo "$l"; }

# run_part <part> [options]: `run`, in the order of HOW above
run_part() {
  local part="${1:-}" kept="" kept_set=0 failed="" ids=() bpart under rr_word rr_why reuse="" builds="" stop=0 rebuild_parts=""
  local light env_lane launcher pidfile log_link log report t0 rc id v line res pass=0 fail=0 steps md for kept_build="" one_command=""
  part_builds "$part" >/dev/null || { echo "FAIL  no part '$part': web, docker-server, windows-vm-docker, windows-vm-server, windows-vm-electron or robot"; exit 2; }
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --kept)   [ "$#" -ge 2 ] || usage; kept_set=1; [ "$2" = none ] && kept="" || kept="$(abs "$2")"; shift 2 ;;
      --failed) [ "$#" -ge 2 ] || usage; failed="$(abs "$2")"; shift 2 ;;
      --test)   [ "$#" -ge 2 ] || usage; ids+=("$2"); shift 2 ;;
      *) usage ;;
    esac
  done
  failed="${failed%/}" kept="${kept%/}"
  [ -z "$failed" ] || [ -e "$failed" ] || { echo "FAIL  --failed $failed: no such folder or report"; exit 2; }
  # the parts that take kept files take the --failed execution's, unless told otherwise
  if [ "$kept_set" = 0 ] && [ -d "$failed" ]; then case "$part" in docker-server|windows-vm-docker|robot) kept="$failed" ;; esac; fi
  [ -z "$kept" ] || [ "$part" = docker-server ] || [ "$part" = windows-vm-docker ] || [ "$part" = robot ] ||
    { echo "FAIL  --kept: $part takes no kept files (THE PARTS)"; exit 2; }
  for="${failed:+$(basename "$failed")}"; for="${for:--}"

  # 1. the commit under test
  if [ "$DRY" = yes ]; then
    under=$(git rev-parse --verify -q "${RERUN_COMMIT:-HEAD}^{commit}") || { echo "FAIL  RERUN_COMMIT=$RERUN_COMMIT is no commit here"; exit 2; }
  else
    [ -z "${RERUN_COMMIT:-}" ] || { echo "FAIL  RERUN_COMMIT is for a dry run and show: a re-run tests origin/main"; exit 2; }
    git fetch -q origin || { echo "FAIL  could not fetch origin"; exit 2; }
    if git merge-base --is-ancestor HEAD origin/main; then under=$(git rev-parse origin/main); else under=$(git rev-parse HEAD); fi
  fi
  echo "RERUN $part on ${under:0:8}$([ "$DRY" = yes ] && echo " (dry run: ${RERUN_COMMIT:+RERUN_COMMIT, }nothing fetched)")"

  # 2. the tests
  if [ -n "$failed" ]; then
    while IFS=$'\037' read -r line _ id _; do
      [ "$(step_part "$line" | cut -d' ' -f1)" = "$part" ] || [ "${line}" = "LANE REPORT" ] || continue
      case "$id" in "LANE REPORT"|"DOCKER RELEASE STEP "*|"RELEASE STEP "*) ids=() ; break ;; esac
      ids+=("$id")
    done < <(failures_of "$failed")
    [ "${#ids[@]}" -gt 0 ] || echo "TESTS  no failed test of $part in $for: a red step with no failed test is re-proved by the part's whole set"
  fi
  [ "$part" != web ] || [ "${#ids[@]}" -gt 0 ] || { echo "FAIL  web has no set of its own: name the tests (--test, --failed)"; exit 2; }
  if [ "${#ids[@]}" = 0 ]; then echo "TESTS  * (the whole set of $part, as its step runs it)"
  else for id in "${ids[@]}"; do echo "TESTS  $id"; done; fi

  # 3. each build the part takes, and the rule
  for bpart in $(part_builds "$part"); do
    build_of "$bpart" "$part" "$kept"
    echo "BUILD  $bpart: $B_WHAT"
    if [ -n "$B_NOTE" ]; then rr_word=rebuild rr_why="no usable $bpart here: $B_NOTE"
    else
      reuse_or_rebuild "$B_FROM" "$under" $B_TREE
      case "$bpart" in
        e2e-package)    rr_word=$RR_E2E_PACKAGE rr_why=$RR_WHY_E2E_PACKAGE ;;
        image-and-zips) rr_word=$RR_IMAGE_AND_ZIPS rr_why=$RR_WHY_IMAGE_AND_ZIPS ;;
        windows-pack)   rr_word=$RR_WINDOWS_PACK rr_why=$RR_WHY_WINDOWS_PACK ;;
      esac
      if [ -n "$RR_NOTE" ]; then rr_why="the rule cannot answer for ${under:0:8}: $RR_NOTE"
      else rr_why="the $bpart built from ${B_FROM:0:8} cannot stand for ${under:0:8}: it ships what changed since: $rr_why"; fi
    fi
    if [ "$rr_word" = reuse ]; then
      echo "RULE   $bpart: reuse, built from ${B_FROM:0:8}: nothing it ships changed since (asbl/ci/reuse-or-rebuild.sh)"
      [ "$bpart" = windows-pack ] || reuse="${reuse:+$reuse }$bpart"
      builds="${builds:+$builds; }${B_WHAT%% (*}"
      [ "$bpart" != image-and-zips ] || [ -z "$kept" ] || kept_build="$kept"
    elif [ "$REBUILD" = yes ]; then
      echo "RULE   $bpart: rebuild ($rr_why); REBUILD=yes: rebuilt first: $B_CMD"
      rebuild_parts="${rebuild_parts:+$rebuild_parts }$bpart"
      builds="${builds:+$builds; }rebuilt $bpart"
    else
      echo "STOP   $part: $rr_why"
      case "$RR_STEP1_WHY/$B_CMD" in
        "dirty tree/"*) echo "       commit or undo those changes first: a re-run tests a commit (the lanes' sync refuses a dirty checkout)" ;;
        */REBUILD=yes*) echo "       rebuild that part alone: $B_CMD" ;;
        *)            echo "       rebuild that part alone: $B_CMD; or the same run with REBUILD=yes, which does it first" ;;
      esac
      stop=1
    fi
  done
  [ "$stop" = 0 ] || { echo "RERUN_RESULT part=$part commit=${under:0:8} stopped: a build it takes is not of what it tests (STOP above); nothing ran"; exit 3; }

  # 4. the lane
  case " $rebuild_parts " in *" image-and-zips "*)
    if [ "$DRY" = yes ]; then echo "WOULD  bash asbl/ci/dp-ci.sh build-if-needed"
    else bash asbl/ci/dp-ci.sh build-if-needed || { echo "RERUN_RESULT part=$part commit=${under:0:8} the rebuild failed (above); nothing ran"; exit 1; }; fi ;;
  esac
  case "$part" in
    web|docker-server)
      selection "$part" "${ids[@]}"
      if [ "${#ids[@]}" = 0 ]; then
        # the whole set as step 2's Linux proof runs it: the light set (asbl/ci/light-set.txt, E2E_SPEC=light) and the
        # one-command run
        SEL_SPEC=light one_command=yes
      fi
      env_lane=(E2E_TARGET="$part" E2E_SPEC="$SEL_SPEC" E2E_GREP="$SEL_GREP" E2E_RETRIES=0 E2E_PACKAGE="" E2E_DOCKER_FROM_URL=""
                E2E_DOCKER_ONE_COMMAND="$one_command" E2E_REUSE_BUILD="$reuse" E2E_KEPT_BUILD="$kept_build")
      launcher=(bash asbl/ci/dp-ci.sh e2e) pidfile="" log_link="$LOG_DIR/latest.log" ;;
    windows-vm-docker|windows-vm-server|windows-vm-electron)
      selection "$part" "${ids[@]}"
      [ "$part" != windows-vm-electron ] || [ "${#ids[@]}" -gt 0 ] || SEL_SPEC=light
      env_lane=(E2E_SPEC="$SEL_SPEC" E2E_GREP="$SEL_GREP" E2E_RETRIES=0 E2E_DOCKER_FROM_URL="" E2E_REUSE_BUILD="$reuse" E2E_KEPT_BUILD="$kept_build")
      launcher=(bash asbl/ci/jenkins/win-e2e.sh "$(case "$part" in windows-vm-docker) echo docker-e2e ;; windows-vm-server) echo server-e2e ;; *) echo e2e ;; esac)")
      pidfile="$LOG_DIR/win-e2e.pid" log_link="$LOG_DIR/win-e2e-latest.log" ;;
    robot)
      env_lane=(RELEASE_KEPT="$kept" REBUILD_PACK="$(case " $rebuild_parts " in *" windows-pack "*) echo yes ;; *) echo no ;; esac)")
      launcher=(bash asbl/ci/jenkins/win-e2e.sh robot) pidfile="$LOG_DIR/win-e2e.pid" log_link="$LOG_DIR/win-e2e-latest.log" ;;
  esac
  if [ "$DRY" = yes ]; then
    if [ "$part" = robot ] && [ "${#ids[@]}" -gt 0 ]; then
      for id in "${ids[@]}"; do echo "WOULD  $(shq "${env_lane[@]}" "ROBOT_TEST=$(robot_name "$id")" "FOLLOW_PIDFILE=$pidfile")bash asbl/ci/jenkins/follow-ci.sh run ${launcher[*]}"; done
    else
      echo "WOULD  $(shq "${env_lane[@]}" "FOLLOW_PIDFILE=$pidfile")bash asbl/ci/jenkins/follow-ci.sh run ${launcher[*]}"
    fi
    echo "WOULD  then one line per test in $RELEASE_RERUN_RECORD (build: ${builds:-?}; for: $for) and the re-run's failure report beside its log"
    echo "RERUN_RESULT part=$part commit=${under:0:8} dry run: nothing ran, nothing written"
    exit 0
  fi

  # one lane run per Robot test (run-tests.bat takes one), one run otherwise; then its lines in the record
  local runs=("${ids[@]:-*}") batch
  [ "$part" = robot ] || runs=("*")
  for batch in "${runs[@]}"; do
    t0=$(date +%s)
    if [ "$part" = robot ]; then
      env "${env_lane[@]}" ROBOT_TEST="$([ "$batch" = "*" ] || robot_name "$batch")" FOLLOW_PIDFILE="$pidfile" \
        bash asbl/ci/jenkins/follow-ci.sh run "${launcher[@]}"; rc=$?
    else
      env "${env_lane[@]}" FOLLOW_PIDFILE="$pidfile" bash asbl/ci/jenkins/follow-ci.sh run "${launcher[@]}"; rc=$?
    fi
    log=$(newest_log "$log_link" "$t0")
    case "$part" in
      web|docker-server) report="${log:+${log%.log}-playwright.json}" ;;
      robot)             report=$([ -n "$log" ] && grep -aoP '^WIN_ROBOT_REPORT=\K\S+' "$log" | tail -1) ;;
      *)                 report=$([ -n "$log" ] && grep -aoP '^WIN_E2E_REPORT=\K\S+' "$log" | tail -1)
                         [ -n "$report" ] || report="${log:+${log%.log}-step-playwright.json}" ;;
    esac
    # the tests of this run: the named ones (for robot, this run's one), or * for the whole set with the run's verdict
    if [ "$batch" != "*" ] || { [ "$part" != robot ] && [ "${#ids[@]}" -gt 0 ]; }; then
      res=$(if [ "$part" = robot ]; then results "$part" "$report" "$batch"; else results "$part" "$report" "${ids[@]}"; fi)
    else
      res="*	$([ "$rc" = 0 ] && echo PASS || echo FAIL)"
    fi
    while IFS=$'\t' read -r id v; do
      [ -n "$id" ] || continue
      # a test that passed counts only when the whole run ended well (its log's PIPELINE_RESULT)
      [ "$v" != PASS ] || [ "$rc" = 0 ] || v=FAIL
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(now)" "$part" "$id" "$under" "$v" "${log:--}" "${report:--}" "${builds:--}" "$for" >> "$RELEASE_RERUN_RECORD"
      if [ "$v" = PASS ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
      echo "RERUN  $v  $id"
    done <<< "$res"
    # the re-run's failure report, in the release's format, beside its log
    if [ -n "$log" ]; then
      steps="${log%.log}-rerun.steps" md="${log%.log}-rerun-failures.md"
      printf 'RE-RUN %s\t%s\t%s\t%s\t%s\t%s\n' "$part" "$([ "$rc" = 0 ] && echo PASS || echo FAIL)" \
        "the re-run of $part on ${under:0:8}, retries 0 (asbl/ci/release-rerun.sh)" "$log" "$report" "$(now)" > "$steps"
      $KEEP report-steps "$steps" "$md" "the re-run of $part on ${under:0:8} (build: ${builds:--}; for: $for)" >/dev/null && echo "RERUN_REPORT=$md"
    fi
  done
  echo "RERUN_RESULT part=$part commit=${under:0:8} passed=$pass failed=$fail record=$RELEASE_RERUN_RECORD"
  [ "$fail" = 0 ]
}

# show_execution [<kept folder>]: `show` (USE above)
show_execution() {
  local folder head step kind id file title report part need line rtime rcommit rres rlog rbuild n=0 green=0 red=0 open=0 older=0 other=0 bpart why
  folder="$(abs "${1:-$(ls -1dt "$RELEASE_ARTIFACTS_DIR"/*/ 2>/dev/null | head -1)}")"; folder="${folder%/}"
  [ -f "$folder/MANIFEST.txt" ] || { echo "SHOW   no kept execution in '${folder:-$RELEASE_ARTIFACTS_DIR}'"; return 0; }
  head=$(git rev-parse --verify -q "${RERUN_COMMIT:-HEAD}^{commit}") || { echo "SHOW   RERUN_COMMIT=$RERUN_COMMIT is no commit here"; return 0; }
  echo "SHOW   execution 1 = $(sed -n 's/^version=//p' "$folder/MANIFEST.txt") on $(sed -n 's/^commit=//p' "$folder/MANIFEST.txt" | cut -c1-8) ($folder); checked against ${head:0:8}${RERUN_COMMIT:+ (RERUN_COMMIT)}; record $RELEASE_RERUN_RECORD"
  while IFS=$'\037' read -r step kind id file title report; do
    n=$((n + 1)); read -r part need <<< "$(step_part "$step")"
    echo ""
    echo "  $n. ${part/#-/(no part)}  $id"
    echo "     failed in $step${report:+ ($report)}"
    if [ "$part" = - ]; then
      echo "     no re-run: not a test (the keep, the guard, the upload); execution 2 runs it again"; other=$((other + 1)); continue
    fi
    # the newest re-run that covers it: of the part, of that test or of the whole set, and for a build or pack step one
    # that rebuilt it
    line=$(awk -F'\t' -v p="$part" -v i="$id" -v nd="${need:-}" '$2 == p && ($3 == i || $3 == "*") && (nd == "" || $8 ~ /rebuilt/) { l = $0 } END { print l }' \
      "$RELEASE_RERUN_RECORD" 2>/dev/null)
    if [ -z "$line" ]; then echo "     not verified yet${need:+ (a re-run that rebuilt it: REBUILD=yes)}"; open=$((open + 1)); continue; fi
    IFS=$'\t' read -r rtime _ _ rcommit rres rlog _ rbuild _ <<< "$line"
    if [ "$rres" = PASS ]; then echo "     verified green: re-run $rtime on ${rcommit:0:8} ($rbuild; log $rlog)"
    else echo "     red again: re-run $rtime on ${rcommit:0:8}, $rres (log $rlog)"; red=$((red + 1)); continue; fi
    # still the build the commit under test needs? a change that part ships since the re-run's commit says no
    why=""
    reuse_or_rebuild "$rcommit" "$head"
    for bpart in $(part_builds "$part"); do
      case "$bpart" in
        e2e-package)    [ "$RR_E2E_PACKAGE" = reuse ] || why="$why $RR_WHY_E2E_PACKAGE" ;;
        image-and-zips) [ "$RR_IMAGE_AND_ZIPS" = reuse ] || why="$why $RR_WHY_IMAGE_AND_ZIPS" ;;
        windows-pack)   [ "$RR_WINDOWS_PACK" = reuse ] || why="$why $RR_WHY_WINDOWS_PACK" ;;
      esac
    done
    if [ -n "$why" ]; then
      echo "     note: older than a later shipped change (${rcommit:0:8}..${head:0:8}: $(printf '%s\n' $why | sort -u | head -5 | paste -sd' ')${RR_NOTE:+; $RR_NOTE}): re-run it on the rebuilt part"
      older=$((older + 1))
    else
      green=$((green + 1))
    fi
  done < <(failures_of "$folder")
  echo ""
  if [ "$n" = 0 ]; then echo "SHOW_RESULT ready for execution 2: execution 1 has no failure"
  elif [ "$((open + red + older))" = 0 ]; then echo "SHOW_RESULT ready for execution 2: $green of $n failures verified green alone$([ "$other" = 0 ] || echo ", $other not a test (execution 2 runs them again)")"
  else echo "SHOW_RESULT not ready for execution 2: $open not verified yet, $red red again, $older older than a later shipped change, $green verified green (of $n)"; fi
  return 0
}

# lane_reruns <part> <report> <lane commit> <lane time>: `lane` (USE above). The failures and their ids as `show` names them
# (failures_of); a re-run counts for the lane's commit when the rule says nothing step 1's lanes test changed between the
# two commits (RR_STEP1 still-counts), as release-state.sh counts step 1 on an earlier commit.
lane_reruns() {
  local part="$1" report="$2" lc since="$4" step kind id file title rep line rtime rcommit rres rlog n=0 green=0 commits="" logs=""
  lc=$(git rev-parse --verify -q "${3:-}^{commit}") ||
    { echo "LANE_RESULT still red: the lane's commit '${3:-}' is no commit here"; return 1; }
  echo "LANE   $part on ${lc:0:8}, its run of $since (report $report); record $RELEASE_RERUN_RECORD"
  while IFS=$'\037' read -r step kind id file title rep; do
    n=$((n + 1))
    echo "  $n. $id"
    if [ "$kind" = step ]; then
      echo "     the lane itself failed, with no failed test in its report (cut short or broken): only a run of the whole lane makes it green"; continue
    fi
    line=$(awk -F'\t' -v p="$part" -v i="$id" -v s="$since" '$2 == p && $3 == i && $1 >= s { l = $0 } END { print l }' "$RELEASE_RERUN_RECORD" 2>/dev/null)
    [ -n "$line" ] || { echo "     not verified yet: no re-run of it alone since the lane's run"; continue; }
    IFS=$'\t' read -r rtime _ _ rcommit rres rlog _ <<< "$line"
    [ "$rres" = PASS ] || { echo "     red again: re-run $rtime on ${rcommit:0:8}, $rres (log $rlog)"; continue; }
    reuse_or_rebuild "$lc" "$rcommit"
    if [ "$RR_STEP1" != still-counts ]; then
      echo "     green on ${rcommit:0:8} ($rtime), but that is not the product the lane tested: $RR_STEP1_WHY since ${lc:0:8} ($(printf '%s\n' $RR_WHY_E2E_PACKAGE $RR_WHY_IMAGE_AND_ZIPS | sort -u | head -5 | paste -sd' ')${RR_NOTE:+; $RR_NOTE})"
      continue
    fi
    echo "     passed alone: re-run $rtime on ${rcommit:0:8} (log $rlog)"
    green=$((green + 1))
    case " $commits " in *" ${rcommit:0:8} "*) ;; *) commits="${commits:+$commits }${rcommit:0:8}" ;; esac
    logs="${logs:+$logs }$rlog"
  done < <(failures_of "$report")
  if [ "$n" -gt 0 ] && [ "$green" = "$n" ]; then
    echo "LANE_RERUNS reruns=$n"
    echo "LANE_RERUNS rerun_commits=$commits"
    echo "LANE_RERUNS rerun_logs=$logs"
    echo "LANE_RESULT green by re-runs: each of the $n red passed alone since the lane's run, on $commits"
    return 0
  fi
  echo "LANE_RESULT still red: $green of $n red passed alone since the lane's run"
  return 1
}

cmd="${1:-}"; [ "$#" -gt 0 ] && shift
case "$cmd" in
  run)  run_part "$@" ;;
  show) show_execution "$@" ;;
  lane) [ "$#" = 4 ] || usage; lane_reruns "$1" "$(abs "$2")" "$3" "$4" ;;
  *)    usage ;;
esac

#!/bin/bash
# The release record: which part of a release passed on which commit, and whether there is a version to release at all, per
# release channel (docker: the image and its zip; windows: the three Windows zips). Plain files on this host, one folder per
# commit, so that a release job can refuse to start when step 1 is not green on its commit, can find the rehearsal it copies,
# and so that `show` tells at any time where a release stands. Run on the host (the Jenkins jobs call it over SSH, it also
# runs by hand):
#
#   bash asbl/ci/release-state.sh record <name> PASS|FAIL [key=value ...]       write one verdict
#   bash asbl/ci/release-state.sh record-step1 <e2e target> <rc>                 the verdict of one step-1 lane (its job calls it;
#                                                                                RELEASE_STEP_START = when the lane started, epoch s)
#   bash asbl/ci/release-state.sh require <name|step1>...                        exit 1 unless every one is PASS
#   bash asbl/ci/release-state.sh step1-guard                                    the release jobs' guard: exit 1 with one line, "REFUSED:
#                                                                                step 1 is not green on <commit>: <lanes>. Run ...", unless
#                                                                                the four lanes a release needs are PASS (or E2E_APPROVAL,
#                                                                                below). STEP1_PROVEN_LATER=windows-vm-electron-light
#                                                                                (the release jobs' start, plan-pre-release-artifacts-
#                                                                                ready): that lane is the one step 3 runs itself, after
#                                                                                its pack; it is shown as "proven later", not checked.
#                                                                                Only that lane, only here: `require step1`, which
#                                                                                every upload makes, always reads all four
#   bash asbl/ci/release-state.sh record-step1 <e2e target> reruns full|auth|light   a lane red on a few tests made green by
#                                                                                their re-runs alone: the lane's newest red run
#                                                                                (this commit or an earlier one of its history)
#                                                                                recorded PASS once every failure passed alone
#                                                                                since (below); DRY_RUN=yes: said, not recorded
#   bash asbl/ci/release-state.sh moved-main <start commit> <origin/main now>    may a step that started on one commit finish
#                                                                                after main moved: exit 0 when main did not move
#                                                                                or moved by never-shipped files only, exit 1
#                                                                                when it moved by what ships (or is unreadable)
#   bash asbl/ci/release-state.sh get <name> <key>                               print one recorded value
#   bash asbl/ci/release-state.sh full-lane                                      the last two releases' full-lane choices: version,
#                                                                                lane, why (alternated|random), when, the full run's
#                                                                                result, commit and time, an approval
#   bash asbl/ci/release-state.sh full-lane <version>                            that release's record (exit 1 when there is none)
#   bash asbl/ci/release-state.sh full-lane --choose                             this checkout's version: its full lane, chosen and
#                                                                                recorded now when it has none, and the lanes step 1
#                                                                                needs (DRY_RUN=yes: nothing recorded)
#   bash asbl/ci/release-state.sh full-lane --step1                              the same at a step-1 lane's start, only while the
#                                                                                version is still to be released (release-step1.sh;
#                                                                                E2E_TARGET, STEP1_STARTED_BY = who, as chosen_by)
#   bash asbl/ci/release-state.sh show [<commit>]                                the table of one commit
#   bash asbl/ci/release-state.sh rehearsed docker|windows <version>             the newest PASSED rehearsal of that version on that
#                                                                                channel, on whichever commit, that uploaded its
#                                                                                files (not upload=no: UPLOAD=no proves only) and
#                                                                                whose files were not deleted: "REHEARSED <commit>
#                                                                                <time>"; exit 1
#                                                                                ("NOT REHEARSED ...") when there is none
#   bash asbl/ci/release-state.sh removed docker|windows <folder>                the files of the rehearsal in <folder>
#                                                                                (rehearsal/<version>-<commit>/) were deleted
#                                                                                (release-publish.sh's cleanup): its verdicts get
#                                                                                removed=<time>, the rest of them stays (digest=)
#   bash asbl/ci/release-state.sh version-check [docker|windows] [--print]       is there a version to release on that channel
#                                                                                (below; docker when not given)
#   bash asbl/ci/release-state.sh released [docker|windows]                      the released version of each channel, read as
#                                                                                version-check reads it, and the current release (the
#                                                                                higher one): "RELEASED current=<v> docker=<v> windows=<v>";
#                                                                                exit 2 when a channel cannot be read (step 0,
#                                                                                asbl/ci/jenkins/release-set-version.sh); with a
#                                                                                channel only that one: "RELEASED <channel>=<v>"
#
# The commit is RELEASE_COMMIT when set (any form git knows: full, short), else this checkout's HEAD; folders use the full
# hash. A verdict is the file <RELEASE_STATE_DIR>/<commit>/<name>, key=value lines: result, version (settings.xml of
# this checkout unless given), time, log (RELEASE_LOG when set), then whatever the caller adds (digest=, sha256 lists).
# Recording again replaces the verdict: the last run of a part is the one that counts.
#
# Verdict names (the jobs, in order):
#   step1.<target>-<mode>    dp-ci-release-step1-e2e-prerelease, one per target and mode (full | auth | light | targeted)
#   rehearsal.docker-stage   dp-ci-release-step2-release-docker: the image pushed as :<version> (digest=), the zip staged in rehearsal/
#   rehearsal.docker         dp-ci-release-step2-release-docker: the whole rehearsal (MODE=rehearsal, or the one MODE=public runs first):
#                            the two proofs and the upload; upload=no = proven with UPLOAD=no, nothing staged
#   rehearsal.windows        dp-ci-release-step3-release-windows-vm: the pack, the Robot UAT, the three zips staged in rehearsal/;
#                            upload=no = proven with UPLOAD=no, nothing staged
#   public.docker            dp-ci-release-step2-release-docker, MODE=public: the rehearsed zip in newest/ and <version>/, :latest
#   public.windows           dp-ci-release-step3-release-windows-vm, MODE=public: the rehearsed zips in newest/ and <version>/
# Until 2026-10-22 they were step2.docker-stage, step2.docker, step3.windows and step4.publish (none was ever recorded for real).
# `require step1` = the step-1 lanes a release needs (owner decision OD5, 2026-10-22; since 2026-10-24 the full set
# alternates, plan-release-build-prove-upload): step1.<this release's full lane>-full (web or docker-server, the full-lane
# record below), step1.docker-server-auth, step1.windows-vm-electron-light (E2E_SPEC=light) and step1.windows-vm-server-light.
# A `targeted` run (own E2E_SPEC/E2E_GREP) is recorded for the table but never counts for a release.
# STEP 1 ON AN EARLIER COMMIT (step1_answer, since plan-2026-10-28-faster-releases): a lane with no verdict on the commit
# counts with its newest verdict on an earlier commit of that commit's history when asbl/ci/reuse-or-rebuild.sh says
# nothing step 1's lanes test changed between the two (RR_STEP1 still-counts: a test or CI fix after step 1). A product
# change between them still needs step 1 again, or E2E_APPROVAL. step1-guard, `require` and `show` name that commit and why.
# A LANE RED ON A FEW TESTS: `record-step1 <target> reruns <mode>` records it PASS once every failure in its report passed
# alone after the lane's run (asbl/ci/release-rerun.sh run, retries 0; release-rerun.sh lane checks it), each on a commit
# where nothing step 1's lanes test changed since the lane's own. The verdict keeps the run (log, report, run_time, rc) and
# names the re-runs (reruns, rerun_commits, rerun_logs). A red with no failed test (the lane cut short or broken), a re-run
# red again or one after a product change: still red, as is a lane whose run left no report.
# E2E_APPROVAL (the parameter of the release jobs of steps 2 and 3, 2026-10-23): free text, empty by default. Empty =
# step1-guard and `require step1...` check the lanes as always. With the two words "owner approved" in it (any case)
# they do not check them: the run goes on whatever the record says, and the decision is printed (the lines starting
# E2E_APPROVAL: who (E2E_APPROVAL_USER, the Jenkins user), when, the text verbatim, each lane as the record holds it, on
# this commit or else the newest on another one) and recorded on the commit as approval.step1 (DRY_RUN=yes|1: printed
# only). Any other text = refused, the text shown, even when the lanes are green: a mistyped approval is never silent.
# An approval is never a lane: a later check without one reads the lanes only.
#
# version-check <channel> (owner, 2026-10-22: the release takes its version from settings.xml; the same as the released
# version = do nothing, greater = release). Each release job runs it for its own channel before any work:
#   - the version to release is <version> in bkend/reporting/src/main/external-resources/template/config/burst/settings.xml;
#   - the other files that declare it (asbl/ci/set-version.sh --versions) must say the same: dp-ci.sh tags the image from
#     pom.xml, DockerAssembler pins the zip's image tag from settings.xml;
#   - the released version of the channel: docker = the x.y.z tag whose digest is the one :latest has on Docker Hub (public
#     API, no login); windows = the version line of newest/windows-version.txt on the download site (written by the
#     Windows job's MODE=public; until the first one, WINDOWS_RELEASED_BY_HAND below). The channel's last public.<channel>
#     record, when there is one, must agree;
#   - equal: "NOTHING TO RELEASE", exit 3 (the jobs end green, nothing done; the line names step 0,
#     dp-ci-release-step0-set-version, which sets a bigger version); lower: refused, exit 1;
#     greater: exit 0, unless the record says it was already made public on that channel, or (docker) :<version> is already
#     on Docker Hub and no rehearsal staged it (pushed by hand): refused, exit 1. Docker Hub or the download site not
#     answering: exit 2.
#   --print (step 1, which is also the everyday e2e job and never skips): one RELEASE_VERSION line, always exit 0.
# DOCKERHUB_API, RELEASE_IMAGE_REPO and RELEASE_DOWNLOAD_BASE are variables so a test can point them at a local fixture.
set -uo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")/../.." || exit 2

RELEASE_STATE_DIR="${RELEASE_STATE_DIR:-/var/kraft-internalsystems/logs/datapallas-ci/release-state}"
REQUIRED_STEP1=""   # the lanes a release needs: required_step1 sets it, from this release's full lane (below)
SETTINGS_XML=bkend/reporting/src/main/external-resources/template/config/burst/settings.xml
DOCKERHUB_API="${DOCKERHUB_API:-https://hub.docker.com/v2/repositories}"
RELEASE_IMAGE_REPO="${RELEASE_IMAGE_REPO:-flowkraft/datapallas-server}"
LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
RELEASE_DOWNLOAD_BASE="${RELEASE_DOWNLOAD_BASE:-https://downloads.datapallas.com/file/datapallas}"
# The Windows channel's released version until its first MODE=public writes newest/windows-version.txt: the last version
# both channels were released together, by hand (newest/'s zips uploaded 2026-08-15 14:08Z, Docker Hub's :16.5.0 14:25Z).
WINDOWS_RELEASED_BY_HAND=16.5.0
# reuse_or_rebuild and its RR_* answers: whether step 1 on an earlier commit still counts, and whether main moved by
# never-shipped files only
. asbl/ci/reuse-or-rebuild.sh

commit_of() {  # the full hash of RELEASE_COMMIT or HEAD; the given text itself when git does not know it
  local c="${RELEASE_COMMIT:-HEAD}" full
  full=$(git rev-parse --verify -q "$c^{commit}" 2>/dev/null) && { echo "$full"; return 0; }
  [ "$c" != HEAD ] && echo "$c"
}
tree_version() { grep -m1 -oP '(?<=<version>)[^<]+' "$SETTINGS_XML" 2>/dev/null; }
valid_name() { printf '%s' "$1" | grep -qE '^(step1|rehearsal|public)\.[a-z0-9-]+$'; }
field() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1; }  # field <file> <key>

# The full e2e set alternates (owner, plan-release-build-prove-upload): each release runs the whole suite on one side only,
# FULL_SIDES, web one release and docker-server the next, and step 1's other lanes are the light ones and the sign-in file.
# One record per release (per version: a release may span several commits), $FULL_DIR/<version>, key=value lines as the
# verdicts: lane, why (alternated: the other side of the newest earlier release's record; random: drawn 50/50 because no
# earlier record could be read), previous, chosen, chosen_commit, chosen_by; then the full run of that lane on that
# version (result, ran_commit, ran, log: the last run counts) and an E2E_APPROVAL that lifted it (approved). The first
# choice is kept: a repeated or cancelled run never draws again (an unreadable record of the version itself is kept aside
# as <version>.unreadable-<time> and drawn again, as random).
FULL_DIR="$RELEASE_STATE_DIR/full-e2e"
FULL_SIDES="web docker-server"
full_valid() {  # full_valid <file> <version>: a readable record of that version
  local l; l=$(field "$1" lane)
  [ -f "$1" ] && [ "$(field "$1" version)" = "$2" ] && case " $FULL_SIDES " in *" $l "*) [ -n "$l" ] ;; *) false ;; esac
}
full_other() { case "$1" in web) echo docker-server ;; *) echo web ;; esac; }
full_describe() {  # full_describe <file>: one line, for the logs
  echo "$(field "$1" lane) ($(field "$1" why)$(p=$(field "$1" previous); [ -n "$p" ] && echo ": previous $p"); chosen $(field "$1" chosen) by $(field "$1" chosen_by))"
}
full_set() {  # full_set <file> key=value...: replace those keys, keep the rest
  local f="$1" tmp kv; shift
  tmp=$(mktemp "$FULL_DIR/.set.XXXXXX") || return 2
  cp "$f" "$tmp" || { rm -f "$tmp"; return 2; }
  for kv in "$@"; do
    grep -v "^${kv%%=*}=" "$tmp" > "$tmp.n"; printf '%s\n' "$kv" >> "$tmp.n"; mv -f "$tmp.n" "$tmp"
  done
  mv -f "$tmp" "$f"
}
# full_lane <version> <by>: prints FULL_LANE=<lane> ...; the recorded choice of that version, else one made now and recorded
# (DRY_RUN=yes|1: made, printed, not recorded)
full_lane() {
  local v="$1" by="$2" f="$FULL_DIR/$1" o pv="" best="" lane why prev now tmp b
  if full_valid "$f" "$v"; then
    echo "FULL_LANE=$(field "$f" lane) version=$v: the full set of this release runs on $(full_describe "$f"); kept: a repeated run never draws again"
    return 0
  fi
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  for o in "$FULL_DIR"/*; do   # the newest earlier release with a record
    [ -f "$o" ] || continue
    pv=$(basename "$o"); printf '%s' "$pv" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || continue
    [ "$pv" != "$v" ] && [ "$(printf '%s\n%s\n' "$pv" "$v" | sort -V | head -1)" = "$pv" ] || continue
    [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$best" "$pv" | sort -V | tail -1)" = "$pv" ] && best="$pv"
  done
  if [ -n "$best" ] && full_valid "$FULL_DIR/$best" "$best"; then
    lane=$(full_other "$(field "$FULL_DIR/$best" lane)"); why=alternated; prev="$best $(field "$FULL_DIR/$best" lane)"
  else
    b=$(od -An -N1 -tu1 /dev/urandom | tr -d ' '); set -- $FULL_SIDES; [ $((b % 2)) = 0 ] && lane=$1 || lane=$2
    why=random
    if [ -n "$best" ]; then prev="$best: unreadable record"; else prev="none: no earlier release recorded"; fi
    [ -f "$f" ] && prev="$prev; this release's own record was unreadable"
  fi
  case "${DRY_RUN:-no}" in
    yes|1) echo "FULL_LANE=$lane version=$v: dry run: would choose $lane ($why: previous $prev) and record it$([ "$why" = random ] && echo "; a real run draws again")"; return 0 ;;
  esac
  mkdir -p "$FULL_DIR" || return 2
  [ -f "$f" ] && { mv -f "$f" "$f.unreadable-$now"; echo "WARN  the record $f could not be read: kept as $f.unreadable-$now, a new lane drawn"; }
  tmp=$(mktemp "$FULL_DIR/.$v.XXXXXX") || return 2
  printf '%s\n' "version=$v" "lane=$lane" "why=$why" "previous=$prev" "chosen=$now" "chosen_commit=$(git rev-parse HEAD 2>/dev/null)" "chosen_by=$by" > "$tmp"
  # created only when nobody else did meanwhile (ln fails on an existing file): the first choice stays
  if ln "$tmp" "$f" 2>/dev/null; then rm -f "$tmp"
  else rm -f "$tmp"; full_valid "$f" "$v" || { echo "FAIL  could not record $f"; return 2; }; fi
  if [ "$(field "$f" why)" = random ]; then
    echo "FULL_LANE=$(field "$f" lane) version=$v: DRAWN AT RANDOM (50/50), not alternated: $(field "$f" previous). The full set of this release runs on $(field "$f" lane); recorded in $f"
  else
    echo "FULL_LANE=$(field "$f" lane) version=$v: the full set of this release runs on $(full_describe "$f"); recorded in $f"
  fi
}
# required_step1 [choose <by>]: REQUIRED_STEP1 for this checkout's version: the full set on its lane, the sign-in file on
# docker-server, the light sets of windows-vm-electron and windows-vm-server. choose = make the choice when there is none
# (printing it); without it, a version with no choice yet needs both full runs (nothing is drawn by a mere look).
required_step1() {
  local v line lane
  v=$(tree_version)
  if [ "${1:-}" = choose ]; then
    line=$(full_lane "$v" "$2") || { printf '%s\n' "$line"; return 2; }
    printf '%s\n' "$line"
    lane=$(printf '%s\n' "$line" | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p')
  elif full_valid "$FULL_DIR/$v" "$v"; then
    lane=$(field "$FULL_DIR/$v" lane)
  fi
  REQUIRED_STEP1="$(for s in ${lane:-$FULL_SIDES}; do printf 'step1.%s-full ' "$s"; done)step1.docker-server-auth step1.windows-vm-electron-light step1.windows-vm-server-light"
}

approval_phrase() { printf '%s' "${E2E_APPROVAL:-}" | grep -qiE 'owner[[:space:]]+approved'; }
lane_state() {  # lane_state <verdict name>: what the record holds for it on this commit, else its newest verdict on another one
  local f="$dir/$1" o t best="" best_t=""
  [ -f "$f" ] && { echo "$(field "$f" result) on ${commit:0:8} ($(field "$f" time))"; return 0; }
  for o in "$RELEASE_STATE_DIR"/*/"$1"; do
    [ -f "$o" ] || continue
    t=$(field "$o" time); [[ "$t" > "$best_t" ]] && { best_t="$t"; best="$o"; }
  done
  if [ -n "$best" ]; then echo "missing on ${commit:0:8}; newest on another commit: $(field "$best" result) on $(basename "$(dirname "$best")" | cut -c1-8) ($best_t)"
  else echo "missing on ${commit:0:8} and on every other commit"; fi
}
# lane_report <e2e target> <log>: the lane's Playwright report, found as release-docker.sh and release-rerun.sh find it: the
# Linux e2e writes it beside its log, a Windows lane names the copy it pulled from the VM (WIN_E2E_REPORT=)
lane_report() {
  local r=""
  [ -n "$2" ] || return 0
  case "$1" in
    windows-vm-*) r=$(grep -aoP '^WIN_E2E_REPORT=\K\S+' "$2" 2>/dev/null | tail -1); [ -n "$r" ] || r="${2%.log}-step-playwright.json" ;;
    *)            r="${2%.log}-playwright.json" ;;
  esac
  [ -f "$r" ] && echo "$r"
}
# lane_verdicts <verdict name> <commit>: that lane's verdicts on <commit> and on the earlier commits of its history, newest
# first, one "<time> <file>" line each (a commit this checkout does not know is left out)
lane_verdicts() {
  local o oc
  for o in "$RELEASE_STATE_DIR"/*/"$1"; do
    [ -f "$o" ] || continue
    oc=$(basename "$(dirname "$o")")
    [ "$oc" = "$2" ] || git merge-base --is-ancestor "$oc" "$2" 2>/dev/null || continue
    printf '%s %s\n' "$(field "$o" time)" "$o"
  done | sort -r
}
# step1_answer <verdict name>: what counts for one step-1 lane on $commit (STEP 1 ON AN EARLIER COMMIT, above): its own
# verdict when it has one, the last run counting as always; else the newest verdict of the lane on an earlier commit of its
# history from which nothing step 1's lanes test changed. Sets S1_RESULT (PASS, FAIL, or empty: missing), S1_FROM (the
# commit whose verdict counts) and S1_HOW (how, in words, for the gate's lines and `show`; empty for a plain run of the
# commit itself).
step1_answer() {
  local n="$1" t f="" oc=""
  S1_RESULT="" S1_FROM="" S1_HOW=""
  if [ -f "$dir/$n" ]; then
    f="$dir/$n"; oc="$commit"
  else
    while read -r t f; do
      oc=$(basename "$(dirname "$f")")
      reuse_or_rebuild "$oc" "$commit"
      [ "$RR_STEP1" = still-counts ] && break
      [ -n "$S1_HOW" ] || S1_HOW="none carried: the newest on an earlier commit, $(field "$f" result) on ${oc:0:8} ($t), does not count here: $RR_STEP1_WHY since"
      f=""
    done < <(lane_verdicts "$n" "$commit")
    [ -n "$f" ] || return 0
    S1_HOW="carried from ${oc:0:8} ($(field "$f" time)): nothing step 1's lanes test changed in ${oc:0:8}..${commit:0:8} ($RR_CHANGED files differ; asbl/ci/reuse-or-rebuild.sh)"
  fi
  S1_RESULT=$(field "$f" result) S1_FROM="$oc"
  if [ "$(field "$f" completed_by)" = reruns ]; then
    S1_HOW="${S1_HOW:+$S1_HOW; }green by re-runs: its run of $(field "$f" run_time) was red on $(field "$f" reruns) test(s), each passed alone since, on $(field "$f" rerun_commits)"
  fi
  return 0
}
approval_accept() {  # approval_accept <the check> <lane>...: the phrase is there: print the decision, record approval.step1; rc 2 = not recorded
  local check="$1" user now n lanes="" tmp
  shift
  user="${E2E_APPROVAL_USER:-}"; [ -n "$user" ] || user="(no Jenkins user: run by hand as $(id -un))"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  for n in $REQUIRED_STEP1 "$@"; do case " $lanes " in *" $n "*) ;; *) lanes="$lanes $n" ;; esac; done
  echo "E2E_APPROVAL ACCEPTED on ${commit:0:8} by $user at $now ($check): the step-1 check is not made, the run goes on whatever the record says"
  printf '%s\n' "$E2E_APPROVAL" | sed 's/^/E2E_APPROVAL text: /'
  for n in $lanes; do printf 'E2E_APPROVAL   %-26s %s\n' "${n#step1.}" "$(lane_state "$n")"; done
  case "${DRY_RUN:-no}" in yes|1) echo "E2E_APPROVAL dry run: approval.step1 not recorded"; return 0 ;; esac
  mkdir -p "$dir" || return 2
  tmp=$(mktemp "$dir/.approval.step1.XXXXXX") || return 2
  {
    echo "result=APPROVED"
    echo "commit=$commit"
    echo "version=$(tree_version)"
    echo "time=$now"
    echo "user=$user"
    echo "text=$(printf '%s' "$E2E_APPROVAL" | tr '\r\n' '  ')"
    echo "check=$check"
    [ -n "${RELEASE_LOG:-}" ] && echo "log=$RELEASE_LOG"
    for n in $lanes; do echo "$n=$(lane_state "$n")"; done
  } > "$tmp" && mv -f "$tmp" "$dir/approval.step1" || { rm -f "$tmp"; echo "FAIL  could not record approval.step1 in $dir"; return 2; }
  echo "E2E_APPROVAL recorded approval.step1 on ${commit:0:8} (never a lane: a check without an approval reads the lanes only)"
}
approval_refused() {  # a text that is not the phrase: shown, and the check refuses; rc 1 = no text at all
  [ -n "${E2E_APPROVAL:-}" ] || return 1
  echo "E2E_APPROVAL NOT ACCEPTED: the text does not say 'owner approved', so it is no approval and the run is refused. The text:"
  printf '%s\n' "$E2E_APPROVAL" | sed 's/^/E2E_APPROVAL text: /'
}

hub_get() {  # hub_get <path under tags/> -> its JSON; rc 0 found, 1 no such tag (404), 2 Docker Hub not answering
  local out code
  out=$(mktemp) || return 2
  code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 30 "$DOCKERHUB_API/$RELEASE_IMAGE_REPO/tags/$1" 2>/dev/null)
  case "$code" in
    200) cat "$out"; rm -f "$out"; return 0 ;;
    404) rm -f "$out"; return 1 ;;
    *)   rm -f "$out"; return 2 ;;
  esac
}
json_digest() { python3 -c 'import json,sys; print(json.load(sys.stdin).get("digest") or "")'; }

released_docker() {  # the x.y.z tag :latest points to ('' = nothing released yet); rc 2 when Docker Hub does not answer
  local j d
  j=$(hub_get latest); case $? in 0) ;; 1) echo ""; return 0 ;; *) return 2 ;; esac
  d=$(printf '%s' "$j" | json_digest)
  j=$(hub_get '?page_size=100') || return 2
  printf '%s' "$j" | D="$d" python3 -c '
import json, os, re, sys
d = os.environ["D"]
names = [r["name"] for r in json.load(sys.stdin).get("results", [])
         if d and r.get("digest") == d and re.fullmatch(r"\d+\.\d+\.\d+", r["name"])]
names.sort(key=lambda v: [int(x) for x in v.split(".")])
print(names[-1] if names else "")'
}
released_windows() {  # the version newest/windows-version.txt names, or WINDOWS_RELEASED_BY_HAND when there is no such file yet
  local out code v
  out=$(mktemp) || return 2
  # the query string only gets past the CDN's cache
  code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 30 "$RELEASE_DOWNLOAD_BASE/newest/windows-version.txt?check=$(date +%s)-$RANDOM" 2>/dev/null)
  v=$(sed -n 's/^version=//p' "$out" | head -1); rm -f "$out"
  case "$code" in
    200) printf '%s' "$v" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || return 2; echo "$v" ;;
    404) echo "$WINDOWS_RELEASED_BY_HAND" ;;
    *)   return 2 ;;
  esac
}
released_version() { case "$1" in docker) released_docker ;; windows) released_windows ;; *) return 2 ;; esac; }
bigger_versions() {  # bigger_versions 16.5.0 -> "16.5.1, 16.6.0, 17.0.0": the examples a message gives for a new release
  printf '%s' "$1" | awk -F. '{ printf "%d.%d.%d, %d.%d.0, %d.0.0", $1, $2, $3 + 1, $1, $2 + 1, $1 + 1 }'
}
channel_source() {  # where a channel's released version is read
  case "$1" in
    docker) echo "Docker Hub ($DOCKERHUB_API/$RELEASE_IMAGE_REPO)" ;;
    *)      echo "the download site ($RELEASE_DOWNLOAD_BASE/newest/windows-version.txt)" ;;
  esac
}

VC_VERSION=""; VC_RELEASED="?"
version_check() {  # version_check docker|windows: prints why; rc 0 GO, 3 nothing to release, 1 refused, 2 cannot check
  local ch="$1" v r bad j d pub
  v=$(tree_version); VC_VERSION="$v"
  [ -n "$v" ] || { echo "REFUSED  cannot read <version> from $SETTINGS_XML"; return 1; }
  printf '%s' "$v" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "REFUSED  $SETTINGS_XML says '$v', not x.y.z"; return 1; }
  bad=$(bash asbl/ci/set-version.sh --versions | awk -v v="$v" '$1 != v')
  if [ -n "$bad" ]; then
    echo "REFUSED  $SETTINGS_XML says $v, these files say otherwise:"
    printf '%s\n' "$bad" | sed 's/^/           /'
    echo "         one version everywhere: put these back to what the others say and commit; dp-ci-release-step0-set-version then"
    echo "         changes all of them at once (asbl/ci/set-version.sh, which needs them to agree)"
    return 1
  fi
  r=$(released_version "$ch") || { echo "CANNOT CHECK  $(channel_source "$ch") did not answer"; return 2; }
  VC_RELEASED="${r:-none}"
  pub=$(sed -n 's/^version=//p' "$RELEASE_STATE_DIR"/*/public."$ch" 2>/dev/null | sort -V | tail -1)
  if [ -n "$pub" ] && [ "$pub" != "$r" ]; then
    echo "REFUSED  the released $ch version is '${r:-none}' ($(channel_source "$ch")), the release record's last public.$ch is $pub: look at both before releasing"
    return 1
  fi
  if [ -n "$r" ] && [ "$v" = "$r" ]; then
    echo "NOTHING TO RELEASE: settings.xml says $v, $v is already released. For a new release, run dp-ci-release-step0-set-version with a bigger version ($(bigger_versions "$v"))."
    return 3
  fi
  if [ -n "$r" ] && [ "$(printf '%s\n%s\n' "$v" "$r" | sort -V | tail -1)" != "$v" ]; then
    echo "REFUSED  settings.xml says $v, lower than the released $r"
    return 1
  fi
  if grep -qx "version=$v" "$RELEASE_STATE_DIR"/*/public."$ch" 2>/dev/null; then
    echo "REFUSED  the release record says $v was already made public on the $ch channel: run dp-ci-release-step0-set-version with a bigger version ($(bigger_versions "$v"))"
    return 1
  fi
  if [ "$ch" = docker ]; then
    j=$(hub_get "$v")
    case $? in
      1) ;;
      0) d=$(printf '%s' "$j" | json_digest)
         if ! grep -qx "digest=$d" "$RELEASE_STATE_DIR"/*/rehearsal.docker-stage 2>/dev/null; then
           echo "REFUSED  $RELEASE_IMAGE_REPO:$v is already on Docker Hub ($d) and no rehearsal staged it (pushed by hand?):"
           echo "         run dp-ci-release-step0-set-version with a bigger version ($(bigger_versions "$v"))"
           return 1
         fi
         echo "note: $RELEASE_IMAGE_REPO:$v is on Docker Hub, staged by an earlier rehearsal and not public yet: it may be staged again" ;;
      *) echo "CANNOT CHECK  $(channel_source docker) did not answer"; return 2 ;;
    esac
  fi
  echo "RELEASE_VERSION=$v RELEASED=${r:-none} CHANNEL=$ch GO"
  return 0
}

cmd="${1:-}"; [ "$#" -gt 0 ] && shift
case "$cmd" in
  record|require|get|show|step1-guard)
    commit=$(commit_of) || true
    [ -n "$commit" ] || { echo "FAIL  cannot tell which commit (RELEASE_COMMIT='${RELEASE_COMMIT:-}', HEAD)"; exit 2; }
    dir="$RELEASE_STATE_DIR/$commit" ;;
esac

case "$cmd" in
  record)
    name="${1:-}"; result="${2:-}"
    valid_name "$name" || { echo "FAIL  record: '$name' is not a verdict name (step1.<lane>, rehearsal.<channel>, public.<channel>)"; exit 2; }
    case "$result" in PASS|FAIL) ;; *) echo "FAIL  record: the result must be PASS or FAIL (got '$result')"; exit 2 ;; esac
    shift 2
    mkdir -p "$dir" || exit 2
    tmp=$(mktemp "$dir/.$name.XXXXXX") || exit 2
    {
      echo "result=$result"
      echo "commit=$commit"
      printf '%s\n' "$@" | grep -q '^version=' || echo "version=$(tree_version)"
      echo "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      [ -n "${RELEASE_LOG:-}" ] && echo "log=$RELEASE_LOG"
      for kv in "$@"; do
        printf '%s' "$kv" | grep -qE '^[a-z0-9_]+=' || { echo "FAIL  record: '$kv' is not key=value" >&2; rm -f "$tmp"; exit 2; }
        printf '%s\n' "$kv"
      done
    } > "$tmp" || { rm -f "$tmp"; exit 2; }
    mv -f "$tmp" "$dir/$name" || exit 2
    echo "RELEASE_STATE recorded $name=$result commit=${commit:0:8}"
    ;;
  record-step1)
    # The lane's commit and log come from the run's own log (the Linux e2e prints E2E_COMMIT=, the Windows lanes
    # WIN_E2E_COMMIT=, the VM's commit): a Windows lane may test a commit this host has not pulled yet. A log older than
    # RELEASE_STEP_START is an earlier run's (this one failed before it started its own, e.g. in its build): not used.
    target="${1:-}"; rc="${2:-}"
    printf '%s' "$target" | grep -qE '^[a-z0-9-]+$' || { echo "FAIL  record-step1: bad target '$target'"; exit 2; }
    if [ "$rc" = reruns ]; then
      # A LANE RED ON A FEW TESTS (above): its newest red run, here or on an earlier commit of this one's history, made
      # green when release-rerun.sh lane finds every failure of its report passed alone since; recorded on the lane's commit
      mode="${3:-}"
      case "$mode" in full|auth|light) ;; *) echo "FAIL  record-step1 $target reruns full|auth|light: which run of the lane (got '$mode')"; exit 2 ;; esac
      name="step1.$target-$mode"
      head=$(commit_of) || true
      [ -n "$head" ] || { echo "FAIL  cannot tell which commit (RELEASE_COMMIT='${RELEASE_COMMIT:-}', HEAD)"; exit 2; }
      read -r t f < <(lane_verdicts "$name" "$head")
      [ -n "${f:-}" ] || { echo "FAIL  no $name recorded on ${head:0:8} or on an earlier commit of its history"; exit 1; }
      lc=$(basename "$(dirname "$f")")
      if [ "$(field "$f" result)" != FAIL ]; then
        echo "RELEASE_STATE $name is $(field "$f" result) on ${lc:0:8} ($t)$([ "$(field "$f" completed_by)" = reruns ] && echo ", completed by re-runs"): nothing to complete"
        exit 0
      fi
      log=$(field "$f" log); report=$(field "$f" report); [ -n "$report" ] || report=$(lane_report "$target" "$log")
      [ -n "$report" ] ||
        { echo "RELEASE_STATE $name stays red on ${lc:0:8}: its run left no test report (log ${log:-none}): only a run of the whole lane makes it green"; exit 1; }
      out=$(bash asbl/ci/release-rerun.sh lane "$target" "$report" "$lc" "$t"); r=$?
      printf '%s\n' "$out"
      [ "$r" = 0 ] || { echo "RELEASE_STATE $name stays red on ${lc:0:8} (above)"; exit 1; }
      mapfile -t reruns < <(sed -n 's/^LANE_RERUNS //p' <<< "$out")
      case "${DRY_RUN:-no}" in
        yes|1) echo "RELEASE_STATE dry run: would record $name=PASS commit=${lc:0:8}, completed by re-runs (${reruns[*]})"; exit 0 ;;
      esac
      RELEASE_COMMIT="$lc" RELEASE_LOG="$log" bash "$SELF" record "$name" PASS "version=$(field "$f" version)" "rc=$(field "$f" rc)" \
        "report=$report" completed_by=reruns run_result=FAIL "run_time=$t" "${reruns[@]}"
      exit $?
    fi
    printf '%s' "$rc" | grep -qE '^[0-9]+$' || { echo "FAIL  record-step1: bad rc '$rc'"; exit 2; }
    spec="${E2E_SPEC:-}"; gexp="${E2E_GREP:-}"
    if [ -z "$spec" ] && [ -z "$gexp" ]; then
      case "$target" in windows-vm-docker|windows-vm-server) mode=light ;; *) mode=full ;; esac
    elif [ "$target" = windows-vm-electron ] && [ "$spec" = light ] && [ -z "$gexp" ]; then
      mode=light   # E2E_SPEC=light: WIN_ELECTRON_LIGHT_SPEC of dp-ci.sh, the electron lane's light set
    elif [ -z "$gexp" ] && case "$spec" in *'|'*|*'(?'*) false ;; *auth-authorization-server*) true ;; *) false ;; esac; then
      mode=auth
    else
      mode=targeted
    fi
    case "$target" in windows-vm-*) link="$LOG_DIR/win-e2e-latest.log"; key=WIN_E2E_COMMIT ;; *) link="$LOG_DIR/latest.log"; key=E2E_COMMIT ;; esac
    log=$(readlink -f "$link" 2>/dev/null)
    [ -n "$log" ] && [ "$(stat -c %Y "$log" 2>/dev/null || echo 0)" -lt "${RELEASE_STEP_START:-0}" ] && log=""
    c=$(grep -aoP "^$key=\K\S+" "$log" 2>/dev/null | tail -1)
    if [ -z "$c" ]; then
      c=$(git rev-parse HEAD)
      echo "note: no $key= line in ${log:-$link} (the lane did not get that far): recording this checkout's $(git rev-parse --short HEAD)"
    fi
    git rev-parse --verify -q "$c^{commit}" >/dev/null 2>&1 || git fetch -q origin 2>/dev/null
    [ "$rc" = 0 ] && res=PASS || res=FAIL
    # the lane's test report too: `record-step1 <target> reruns` reads its failures
    report=$(lane_report "$target" "$log")
    RELEASE_COMMIT="$c" RELEASE_LOG="$log" bash "$SELF" record "step1.$target-$mode" "$res" "rc=$rc" ${report:+"report=$report"}
    # a full run on one of the two sides: this release's full-lane record says whether it is its lane
    if [ "$mode" = full ] && case " $FULL_SIDES " in *" $target "*) true ;; *) false ;; esac; then
      v=$(tree_version)
      if ! full_valid "$FULL_DIR/$v" "$v"; then
        echo "note: no full lane chosen for $v yet: this full run is recorded as step1.$target-full only (bash $0 full-lane --choose)"
      elif [ "$(field "$FULL_DIR/$v" lane)" = "$target" ]; then
        full_set "$FULL_DIR/$v" "result=$res" "ran_commit=$c" "ran=$(date -u +%Y-%m-%dT%H:%M:%SZ)" "log=$log" &&
          echo "FULL_LANE $v: the full set ran on $target, $res, on ${c:0:8} (recorded in $FULL_DIR/$v)"
      else
        echo "note: $v's full set runs on $(full_describe "$FULL_DIR/$v"), not on $target: this run does not count for the release"
      fi
    fi
    ;;
  full-lane)
    case "${1:-}" in
      --choose) required_step1 choose "full-lane --choose" || exit 2
                echo "step 1 of $(tree_version) needs: ${REQUIRED_STEP1//step1./}" ;;
      --step1)  # the step-1 job, at its start: the choice made only when this version is still to be released on a channel
                # (the job is also the everyday e2e: a released version, or one the gate refuses, draws nothing); who
                # started it (STEP1_STARTED_BY, from asbl/ci/jenkins/release-step1.sh) is written as who chose
                go=0; why=""
                for ch in docker windows; do
                  version_check "$ch" >/dev/null 2>&1; rc=$?
                  case "$rc" in 0) go=1 ;; 3) why="$why $ch: already released;" ;; *) why="$why $ch: refused or could not check (rc $rc);" ;; esac
                done
                if [ "$go" = 1 ]; then
                  required_step1 choose "step 1 job (${E2E_TARGET:-?})${STEP1_STARTED_BY:+, started by $STEP1_STARTED_BY}" || exit 2
                  echo "step 1 of $(tree_version) needs: ${REQUIRED_STEP1//step1./}"
                else
                  required_step1
                  echo "FULL_LANE $(tree_version): no lane chosen:$why the release jobs' step 1 guard chooses it"
                fi ;;
      "")       # the last two releases' choices
                printf '%-10s %-14s %-11s %-21s %-7s %-9s %-21s %s\n' VERSION LANE WHY CHOSEN RESULT ON RAN MORE
                for v in $(ls -1 "$FULL_DIR" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -2); do
                  f="$FULL_DIR/$v"
                  if full_valid "$f" "$v"; then
                    printf '%-10s %-14s %-11s %-21s %-7s %-9s %-21s %s\n' "$v" "$(field "$f" lane)" "$(field "$f" why)" "$(field "$f" chosen)" \
                      "$(field "$f" result)" "$(field "$f" ran_commit | cut -c1-8)" "$(field "$f" ran)" \
                      "previous $(field "$f" previous)$(a=$(field "$f" approved); [ -n "$a" ] && echo "; approved $a")"
                  else printf '%-10s %s\n' "$v" "UNREADABLE record ($f): the next release draws at random"; fi
                done
                [ -n "$(ls -1 "$FULL_DIR" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$')" ] || echo "(no release recorded yet: the next one draws at random)" ;;
      *)        f="$FULL_DIR/$1"
                if full_valid "$f" "$1"; then sed 's/^/  /' "$f"; echo "FULL_LANE $1: $(full_describe "$f")$(r=$(field "$f" result); [ -n "$r" ] && echo ", ran $r on $(field "$f" ran_commit | cut -c1-8) at $(field "$f" ran)")"
                elif [ -f "$f" ]; then echo "FULL_LANE $1: UNREADABLE record $f"; exit 1
                else echo "FULL_LANE $1: no record (no lane chosen for $1)"; exit 1; fi ;;
    esac
    ;;
  require)
    [ "$#" -gt 0 ] || { echo "usage: $0 require <name|step1>..."; exit 2; }
    lanes1=1; for n in "$@"; do case "$n" in step1|step1.*) ;; *) lanes1=0 ;; esac; done  # E2E_APPROVAL: step-1 lanes only
    case " $* " in *" step1 "*) required_step1 choose "require step1" || exit 2 ;; *) required_step1 ;; esac
    if [ "$lanes1" = 1 ] && approval_phrase; then approval_accept "require $*" $(printf '%s\n' "$@" | grep -v '^step1$'); exit $?; fi
    names=""
    for n in "$@"; do [ "$n" = step1 ] && names="$names $REQUIRED_STEP1" || names="$names $n"; done
    bad=0
    for n in $names; do
      # a step-1 lane: this commit's verdict, or an earlier commit's that still counts (step1_answer); the rest: this commit's
      case "$n" in
        step1.*) step1_answer "$n"; f="$RELEASE_STATE_DIR/$S1_FROM/$n"; r="$S1_RESULT" ;;
        *)       f="$dir/$n"; r=$(field "$f" result); S1_HOW="" ;;
      esac
      case "$r" in
        PASS) echo "  ok       $n  (version $(field "$f" version), $(field "$f" time))${S1_HOW:+: $S1_HOW}" ;;
        FAIL) echo "  RED      $n  (version $(field "$f" version), $(field "$f" time)$(l=$(field "$f" log); [ -n "$l" ] && echo ", log $l"))${S1_HOW:+: $S1_HOW}"; bad=1 ;;
        *)    echo "  MISSING  $n  (never run on this commit${S1_HOW:+; $S1_HOW})"; bad=1 ;;
      esac
    done
    if [ "$bad" = 0 ]; then echo "RELEASE_STATE require OK commit=${commit:0:8}"; [ "$lanes1" = 1 ] && approval_refused && exit 1; exit 0; fi
    echo "RELEASE_STATE require FAILED commit=${commit:0:8}: run the steps above on this commit first"
    [ "$lanes1" = 1 ] && approval_refused
    exit 1
    ;;
  step1-guard)
    required_step1 choose step1-guard || exit 2
    if approval_phrase; then
      approval_accept step1-guard; rc=$?
      # the full set lifted by the owner's approval: written on this release's full-lane record too
      case "$rc:${DRY_RUN:-no}" in 0:yes|0:1) ;; 0:*) v=$(tree_version)
        full_set "$FULL_DIR/$v" "approved=$(date -u +%Y-%m-%dT%H:%M:%SZ) on ${commit:0:8} by ${E2E_APPROVAL_USER:-$(id -un)}: E2E_APPROVAL, see approval.step1 of that commit" &&
          echo "FULL_LANE approval written on the record of $v ($FULL_DIR/$v)" ;; esac
      exit "$rc"
    fi
    case "${STEP1_PROVEN_LATER:-}" in
      ""|windows-vm-electron-light) ;;
      *) echo "FAIL  step1-guard: STEP1_PROVEN_LATER may only name windows-vm-electron-light, the lane step 3 runs itself (got '$STEP1_PROVEN_LATER')"; exit 2 ;;
    esac
    bad="" red=0
    for n in $REQUIRED_STEP1; do
      step1_answer "$n"
      if [ -n "${STEP1_PROVEN_LATER:-}" ] && [ "$n" = "step1.$STEP1_PROVEN_LATER" ] && [ "$S1_RESULT" != PASS ]; then
        echo "note: ${n#step1.} is proven later, by step 3 itself (its RELEASE STEP 2/4, recorded as $n): not checked now; every upload requires it"
        continue
      fi
      # how a lane counts when it is not a plain run of this commit: carried from an earlier one, or green by re-runs
      [ -z "$S1_HOW" ] || echo "note: ${n#step1.} ${S1_RESULT:-missing} on ${commit:0:8}${S1_FROM:+$([ "$S1_FROM" = "$commit" ] || echo " (the verdict of ${S1_FROM:0:8})")}: $S1_HOW"
      case "$S1_RESULT" in PASS) ;; FAIL) bad="$bad, ${n#step1.} red"; red=1 ;; *) bad="$bad, ${n#step1.} missing" ;; esac
    done
    if [ -z "$bad" ]; then echo "ok: step 1 is green on ${commit:0:8} (${REQUIRED_STEP1//step1./})"; approval_refused && exit 1; exit 0; fi
    echo "REFUSED: step 1 is not green on ${commit:0:8}: ${bad#, }. Run dp-ci-release-step1-e2e-prerelease first."
    [ "$red" = 0 ] || echo "       A lane red on a few tests: re-run them alone (bash asbl/ci/release-rerun.sh run <lane> --failed <its report>), then bash asbl/ci/release-state.sh record-step1 <lane> reruns <mode>"
    approval_refused
    exit 1
    ;;
  moved-main)
    # The guards at the end of steps 2 and 3 (release-docker.sh DOCKER RELEASE STEP 6/6, dp-ci.sh win_release before its
    # upload): origin/main moved since the step started. By never-shipped files only (a test or CI fix: every part reuses,
    # asbl/ci/reuse-or-rebuild.sh), what the start commit built and proved still stands; by anything that ships, or a main
    # that no longer contains the start commit, the step is refused, as before.
    s=$(git rev-parse --verify -q "${1:-}^{commit}" 2>/dev/null); m=$(git rev-parse --verify -q "${2:-}^{commit}" 2>/dev/null)
    [ -n "$s" ] && [ -n "$m" ] || { echo "MOVED_MAIN refused: cannot read the commits ('${1:-}', '${2:-}')"; exit 1; }
    [ "$s" != "$m" ] || { echo "MOVED_MAIN no: origin/main is still ${s:0:8}"; exit 0; }
    git merge-base --is-ancestor "$s" "$m" ||
      { echo "MOVED_MAIN refused: origin/main ${m:0:8} does not contain ${s:0:8} (rewritten?)"; exit 1; }
    reuse_or_rebuild "$s" "$m"
    if [ "$RR_E2E_PACKAGE/$RR_IMAGE_AND_ZIPS/$RR_WINDOWS_PACK" = reuse/reuse/reuse ]; then
      echo "MOVED_MAIN ok: origin/main moved ${s:0:8} -> ${m:0:8} by never-shipped files only ($RR_CHANGED files; asbl/ci/reuse-or-rebuild.sh): what ${s:0:8} built and proved still stands"
      exit 0
    fi
    echo "MOVED_MAIN refused: origin/main moved ${s:0:8} -> ${m:0:8} by what ships: $(printf '%s\n' $RR_WHY_E2E_PACKAGE $RR_WHY_IMAGE_AND_ZIPS $RR_WHY_WINDOWS_PACK | sort -u | head -5 | paste -sd' ')${RR_NOTE:+ ($RR_NOTE)}"
    exit 1
    ;;
  rehearsed)
    ch="${1:-}"; v="${2:-}"
    case "$ch" in docker|windows) ;; *) echo "usage: $0 rehearsed docker|windows <version>"; exit 2 ;; esac
    best=""; best_time=""; red=0
    for f in "$RELEASE_STATE_DIR"/*/rehearsal."$ch"; do
      [ -f "$f" ] && [ "$(field "$f" version)" = "$v" ] && [ -z "$(field "$f" removed)" ] || continue
      [ "$(field "$f" upload)" != no ] || continue   # proven with UPLOAD=no: nothing was uploaded, nothing to copy
      if [ "$(field "$f" result)" = PASS ]; then
        t=$(field "$f" time)
        [[ "$t" > "$best_time" ]] && { best_time="$t"; best=$(field "$f" commit); }
      else
        red=$((red + 1))
      fi
    done
    [ -n "$best" ] && { echo "REHEARSED $best $best_time"; exit 0; }
    echo "NOT REHEARSED: no passed rehearsal of $v on the $ch channel ($red red)"
    exit 1
    ;;
  removed)
    ch="${1:-}"; folder="${2:-}"; base="${folder#rehearsal/}"; base="${base%/}"
    case "$ch" in docker|windows) ;; *) echo "usage: $0 removed docker|windows rehearsal/<version>-<commit>/"; exit 2 ;; esac
    printf '%s' "$base" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{8}$' || { echo "FAIL  removed: '$folder' is not rehearsal/<version>-<commit>/"; exit 2; }
    v="${base%-*}"; c8="${base##*-}"; n=0
    for f in "$RELEASE_STATE_DIR/$c8"*/rehearsal."$ch" "$RELEASE_STATE_DIR/$c8"*/rehearsal."$ch"-*; do
      [ -f "$f" ] && [ "$(field "$f" version)" = "$v" ] && [ -z "$(field "$f" removed)" ] || continue
      echo "removed=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$f" && n=$((n + 1))
    done
    echo "RELEASE_STATE removed: $folder ($ch), $n verdict(s) marked"
    ;;
  get)
    f="$dir/${1:-}"; [ -n "${2:-}" ] || { echo "usage: $0 get <name> <key>"; exit 2; }
    [ -f "$f" ] || exit 1
    v=$(field "$f" "$2"); [ -n "$v" ] || exit 1
    printf '%s\n' "$v"
    ;;
  show)
    [ -n "${1:-}" ] && { RELEASE_COMMIT="$1"; commit=$(commit_of); dir="$RELEASE_STATE_DIR/$commit"; }
    required_step1
    v=$(tree_version)
    if full_valid "$FULL_DIR/$v" "$v"; then echo "the full set of $v runs on $(full_describe "$FULL_DIR/$v")"
    else echo "the full set of $v: no lane chosen yet (bash $0 full-lane --choose)"; fi
    echo "release record of commit ${commit:0:8} ($dir)"
    printf '%-34s %-6s %-10s %-21s %s\n' VERDICT RESULT VERSION TIME MORE
    found=0
    for f in "$dir"/step1.* "$dir"/approval.* "$dir"/rehearsal.* "$dir"/public.*; do
      [ -f "$f" ] || continue; found=1
      printf '%-34s %-6s %-10s %-21s %s\n' "$(basename "$f")" "$(field "$f" result)" "$(field "$f" version)" "$(field "$f" time)" \
        "$(grep -vE '^(result|commit|version|time)=' "$f" | tr '\n' ' ' | cut -c1-120)"
    done
    [ "$found" = 1 ] || echo "(nothing recorded for this commit)"
    # each lane a release needs, as the gates read it (step1_answer): which commit's verdict counts, and how
    complete=1
    for n in $REQUIRED_STEP1; do
      step1_answer "$n"
      printf 'step 1 %-28s %s\n' "${n#step1.}" "${S1_RESULT:-missing}${S1_FROM:+ on ${S1_FROM:0:8}}${S1_HOW:+: $S1_HOW}"
      [ "$S1_RESULT" = PASS ] || complete=0
    done
    [ "$complete" = 1 ] || { echo "step 1 for a release: NOT complete (needs $REQUIRED_STEP1)"; exit 0; }
    echo "step 1 for a release: complete"
    ;;
  released)
    case "${1:-}" in
      docker|windows) r=$(released_version "$1") || { echo "CANNOT CHECK  $(channel_source "$1") did not answer"; exit 2; }
                      echo "RELEASED $1=${r:-none}"; exit 0 ;;
      "") ;;
      *) echo "usage: $0 released [docker|windows]"; exit 2 ;;
    esac
    d=$(released_docker) || { echo "CANNOT CHECK  $(channel_source docker) did not answer"; exit 2; }
    w=$(released_windows) || { echo "CANNOT CHECK  $(channel_source windows) did not answer"; exit 2; }
    echo "RELEASED current=$(printf '%s\n' $d $w | sort -V | tail -1) docker=${d:-none} windows=$w"
    ;;
  version-check)
    ch=docker; print=0
    for a in "$@"; do
      case "$a" in docker|windows) ch="$a" ;; --print) print=1 ;; *) echo "usage: $0 version-check [docker|windows] [--print]"; exit 2 ;; esac
    done
    if [ "$print" = 1 ]; then
      out=$(mktemp); version_check "$ch" > "$out"; rc=$?
      case "$rc" in
        0) what="would release" ;;
        3) what="nothing to release" ;;
        1) what="a release would be refused: $(head -1 "$out" | sed 's/^REFUSED  //')" ;;
        *) what="cannot check ($(channel_source "$ch" | sed 's/ (.*//') did not answer)" ;;
      esac
      rm -f "$out"
      echo "RELEASE_VERSION settings.xml=${VC_VERSION:-?} released=$VC_RELEASED: $what"
      exit 0
    fi
    version_check "$ch"
    ;;
  *)
    sed -n '2,112p' "$0"; exit 2 ;;
esac

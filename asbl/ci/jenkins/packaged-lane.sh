# Sourced, from the repository's root, by scheduled-e2e.sh and one-spec.sh: one run on a production-packaged lane
# (E2E_MODE=production-packaged: the shipped files, started as a user starts them), with the launchers and environment
# release-rerun.sh gives the same lanes. The build the lane takes is reused, or built again, by the one rule
# (asbl/ci/reuse-or-rebuild.sh); then its launcher runs, followed by follow-ci.sh.
# The caller sets first: LOG_DIR, RELEASE_ARTIFACTS_DIR, DRY_RUN (yes: the builds' answers and the command printed,
# nothing built or run). It may set LANE_DP_CI [bash asbl/ci/dp-ci.sh] (the image build), LANE_FOLLOW_CI
# [bash asbl/ci/jenkins/follow-ci.sh] (what runs the launcher) and LANE_COMMIT (the commit under test, nothing fetched);
# the tests set stubs. run-result.sh is sourced first (newest_log_since).

PACKAGED_LANES=(docker-server windows-vm-docker windows-vm-server windows-vm-electron)
WIN_PID="$LOG_DIR/win-e2e.pid"   # win-e2e.sh's one pid file for every Windows lane
DOCKER_SERVER_BUNDLE="$PWD/frend/reporting/testground/docker-server/DataPallas"   # dp-ci.sh docker_server_up's folder

is_packaged_lane() { local lane; for lane in "${PACKAGED_LANES[@]}"; do [ "$lane" = "$1" ] && return 0; done; return 1; }
# lane_builds <lane>: the build it takes (release-rerun.sh's part_builds)
lane_builds() { case "$1" in docker-server|windows-vm-docker) echo image-and-zips ;; *) echo windows-pack ;; esac; }
lane_machine() { case "$1" in windows-*) echo windows-vm ;; *) echo host ;; esac; }
# lane_vm_steps <lane>: the VM's scheduled tasks (dp-ci-<step>) its run starts: a pack first when REBUILD_PACK=yes
lane_vm_steps() {
  case "$1" in
    windows-vm-docker)   echo docker-e2e ;;
    windows-vm-server)   echo "release-pack server-e2e dp-server" ;;
    windows-vm-electron) echo "release-pack desktop-e2e" ;;
  esac
}
# what_lane_starts <lane>: what its run starts that outlives the caller's processes, one "<kind> TAB <name> TAB <what>"
# line each, as release-orchestrator.sh's what_part_starts names them
what_lane_starts() {
  case "$1" in
    docker-server) printf 'container\tdp-ci\tthe run container of dp-ci.sh\ncompose\t%s\tthe docker-server bundle under test\n' "$DOCKER_SERVER_BUNDLE" ;;
    *)             printf 'pidfile\t%s\tthe Windows driver of win-e2e.sh\nvm\t%s\tthe VM steps: %s\n' "$WIN_PID" "$1" "$(lane_vm_steps "$1")" ;;
  esac
}
# lane_spec <lane> <E2E_SPEC>: the regex as that lane matches it: on Windows the paths have backslashes, so each / of the
# regex becomes [\\/] (a regex that already writes [\\/] is kept as it is)
lane_spec() {
  case "$1/$2" in
    windows-*/*'[\\/]'*|docker-server/*) printf '%s\n' "$2" ;;
    *) printf '%s\n' "$2" | sed 's#/#[\\\\/]#g' ;;
  esac
}

# commit_under_test: origin/main fetched, as the lanes' own sync takes it (HEAD when this checkout is ahead); a dry run
# fetches nothing; LANE_COMMIT replaces it
commit_under_test() {
  if [ -n "${LANE_COMMIT:-}" ]; then git rev-parse --verify -q "$LANE_COMMIT^{commit}"; return; fi
  [ "$DRY_RUN" = yes ] || git fetch -q origin || return 1
  if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then git rev-parse origin/main; else git rev-parse HEAD; fi
}

# newest_kept_pack: the newest kept folder holding a Windows pack (its MANIFEST has windows.file lines), or nothing
newest_kept_pack() {
  local dir
  for dir in $(ls -1dt "$RELEASE_ARTIFACTS_DIR"/*/ 2>/dev/null); do
    grep -q '^windows\.file=' "$dir/MANIFEST.txt" 2>/dev/null && { echo "${dir%/}"; return 0; }
  done
}
# build_origin <build>: "<commit> <what it is>" of the build a lane would take, or "- <why there is none>"
build_origin() {
  local f tag dir
  case "$1" in
    image-and-zips)
      for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
        grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
        tag=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
        [ -n "$tag" ] && { echo "${tag#*-} the build $tag ($f)"; return; }
      done
      echo "- no successful build log in $LOG_DIR" ;;
    windows-pack)
      dir=$(newest_kept_pack)
      if [ -n "$dir" ]; then echo "$(sed -n 's/^commit=//p' "$dir/MANIFEST.txt" | head -1) the kept pack $dir"
      else echo "- no kept folder in $RELEASE_ARTIFACTS_DIR holds a Windows pack"; fi ;;
  esac
}
# build_answer <build> <commit under test>: prints "BUILD <build>: reuse|rebuild (why)" and sets BUILD_ANSWER
build_answer() {
  local from what answer why
  read -r from what <<< "$(build_origin "$1")"
  case "$from" in
    -)       from="" ;;
    *-dirty) what="$what (a build of a dirty tree is of no commit)" from="" ;;
  esac
  if [ -z "$from" ]; then
    answer=rebuild why="none to reuse: $what"
  else
    reuse_or_rebuild "$from" "$2"
    case "$1" in
      image-and-zips) answer=$RR_IMAGE_AND_ZIPS why=$RR_WHY_IMAGE_AND_ZIPS ;;
      windows-pack)   answer=$RR_WINDOWS_PACK why=$RR_WHY_WINDOWS_PACK ;;
    esac
    if [ -n "$RR_NOTE" ]; then answer=rebuild why="the rule cannot answer: $RR_NOTE"
    elif [ "$answer" = reuse ]; then why="$what, built from ${from:0:8}: nothing it ships changed since"
    else why="$what, built from ${from:0:8}: it ships what changed since: $why"; fi
  fi
  BUILD_ANSWER=$answer
  echo "BUILD   $1: $answer ($why)"
}
# shellcheck source=../reuse-or-rebuild.sh
. asbl/ci/reuse-or-rebuild.sh

# run_packaged_lane <lane> <E2E_SPEC> <E2E_GREP> <E2E_RETRIES> <WIN_RUN_TIMEOUT or empty> <commit under test>: its build
# (reused, built, or packed again by the lane), then its launcher through follow-ci.sh. Sets LANE_RC (its exit code),
# LANE_LOG (its log, or empty), LANE_JSON (its Playwright JSON report, or empty) and LANE_WHY (why it is red, or empty)
run_packaged_lane() {
  local lane="$1" spec="$2" grep="$3" retries="$4" win_timeout="$5" under="$6"
  local build reuse="" kept="" rebuild_pack=no lane_env launcher pidfile link t0
  LANE_RC=0 LANE_LOG="" LANE_JSON="" LANE_WHY=""
  for build in $(lane_builds "$lane"); do
    build_answer "$build" "$under"
    case "$build/$BUILD_ANSWER" in
      image-and-zips/reuse) reuse="${reuse:+$reuse }$build" ;;
      image-and-zips/rebuild)
        if [ "$DRY_RUN" = yes ]; then echo "WOULD   ${LANE_DP_CI:-bash asbl/ci/dp-ci.sh} build-if-needed"
        elif ! ${LANE_DP_CI:-bash asbl/ci/dp-ci.sh} build-if-needed; then LANE_WHY="the build failed (dp-ci.sh build-if-needed, above)"; fi ;;
      windows-pack/reuse)   kept=$(newest_kept_pack) ;;
      windows-pack/rebuild) kept=$(newest_kept_pack) rebuild_pack=yes ;;
    esac
  done
  lane_env=(E2E_MODE=production-packaged E2E_SPEC="$(lane_spec "$lane" "$spec")")
  case "$lane" in
    docker-server)
      lane_env+=(E2E_TARGET=docker-server) launcher=(bash asbl/ci/dp-ci.sh e2e)
      pidfile="" link="$LOG_DIR/latest.log" ;;
    *)
      # E2E_TARGET empty: the launcher names the lane (a caller's own E2E_TARGET never reaches it)
      lane_env+=(E2E_TARGET=) launcher=(bash asbl/ci/jenkins/win-e2e.sh "$(case "$lane" in windows-vm-docker) echo docker-e2e ;; windows-vm-server) echo server-e2e ;; *) echo e2e ;; esac)")
      [ "$(lane_builds "$lane")" != windows-pack ] || lane_env+=(RELEASE_KEPT="$kept" REBUILD_PACK="$rebuild_pack")
      [ -z "$win_timeout" ] || lane_env+=(WIN_RUN_TIMEOUT="$win_timeout")
      pidfile="$WIN_PID" link="$LOG_DIR/win-e2e-latest.log" ;;
  esac
  lane_env+=(E2E_GREP="$grep" E2E_RETRIES="$retries" E2E_ROTATION_DATE= E2E_PACKAGE= E2E_DOCKER_FROM_URL= E2E_DOCKER_ONE_COMMAND=
             E2E_REUSE_BUILD="$reuse" E2E_KEPT_BUILD= E2E_BUILD_IMAGE_FILE= FOLLOW_PIDFILE="$pidfile")
  if [ -n "$LANE_WHY" ]; then LANE_RC=1; return 1; fi
  if [ "$DRY_RUN" = yes ]; then
    echo "WOULD   $(printf '%q ' "${lane_env[@]}")bash asbl/ci/jenkins/follow-ci.sh run ${launcher[*]}"; return 0
  fi
  t0=$(date +%s)
  env "${lane_env[@]}" ${LANE_FOLLOW_CI:-bash asbl/ci/jenkins/follow-ci.sh} run "${launcher[@]}"; LANE_RC=$?
  LANE_LOG=$(newest_log_since "$link" "$t0")
  [ "$LANE_RC" = 0 ] || LANE_WHY="rc=$LANE_RC"
  case "$lane" in
    windows-*) LANE_JSON=$([ -n "$LANE_LOG" ] && grep -aoP '^WIN_E2E_REPORT=\K\S+' "$LANE_LOG" | tail -1)
               [ -n "$LANE_JSON" ] || LANE_JSON="${LANE_LOG:+${LANE_LOG%.log}-step-playwright.json}" ;;
    *)         LANE_JSON="${LANE_LOG:+${LANE_LOG%.log}-playwright.json}" ;;
  esac
  return "$LANE_RC"
}

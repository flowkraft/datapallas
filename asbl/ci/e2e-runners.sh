#!/bin/bash
# The runners: Docker engines of their own on this host (Docker in Docker), one per job of a split full set. One Docker
# engine runs one DataPallas e2e set at a time (the shipped compose files fix the container names, the ports and the
# network), so each job runs in its own engine, where those names, ports and the localhost the tests read are its own.
# No product file and no test changes. This host's engine is runner 0 and stays as it is.
#
# A runner n (1 to 4) is a privileged container dp-ci-runner-<n> of the image docker:<this host's engine version>-dind,
# started with plain `docker run` (never in a compose stack: the nightly backup stops and starts those) and removed when
# it stops. What it keeps between rounds, as a VM keeps its images:
#   its image store       the named volume dp-ci-runner-<n>-docker (removing it resets the runner: the next start
#                         copies every image in again, slower only)
#   its engine's socket   <E2E_RUNNER_SOCKET_DIR>/<n>/docker.sock, in a host folder mounted into it
#   its checkout          <E2E_RUNNERS_HOME>/<n>/reportburster: a copy of this checkout with the build's outputs the e2e
#                         reads (the package, the zip, node_modules), so it writes only its own testground and results
#   its log folder        <LOG_DIR>/runners/<n>: its run logs, its copy of the build log, its app image key records
# Each folder is mounted into the runner at the same path, so every bind mount of its lane resolves. Its networks take
# their own address pool (10.20<n>.0.0/16), apart from this host's.
#
# SUBCOMMANDS
#   start <n>...    start those runners, each ready for a lane, in this order (each a marked part, asbl/ci/marks.sh):
#                     RUNNER <n> ENGINE    the dind image checked to exist (docker manifest inspect, no pull, unless
#                                          this host has it), the runner started, its engine waited for
#                                          (E2E_RUNNER_ENGINE_WAIT_SECS); no answer: exit 1, "did not answer"; the
#                                          containers of its last run removed
#                     RUNNER <n> CHECKOUT  this checkout copied in (rsync --delete; its testground, test-results and
#                                          playwright-report are the runner's own)
#                     RUNNER <n> CACHES    the CI container's caches dp-ci-m2, dp-ci-npm, dp-ci-cache (Playwright's
#                                          browsers) copied in when the host's changed since the last copy (their file
#                                          count and size)
#                     RUNNER <n> IMAGES    every image of the runner's list (`images`) that this host's engine has,
#                                          copied when the runner lacks its id (docker save | docker load keeps the id);
#                                          an app's key record with it when this host has all its built images; the
#                                          newest successful build's log (its IMAGE_TAG line). An image this host lacks
#                                          is left to the runner's own engine: its lane pulls it, or builds it by its key,
#                                          as this host's engine does. Never a build of the server or the CI image there
#                   The host's lanes write this checkout and these caches: a caller starts them after CACHES END.
#                   A runner that exists already is refused (stop it first).
#   stop [<n>...]   each runner's CI container (dp-ci in its engine) stopped, so its lane's log ends, then the runner
#                   stopped and removed; its volume, checkout and log folder kept [every runner there is]
#   status          one line per runner 1 to 4: running or not, its engine, its CI container, its volume, its checkout
#   run <n>         the e2e lane in runner n, followed to its end (asbl/ci/jenkins/follow-ci.sh run ... dp-ci.sh e2e, from
#                   the runner's checkout, DOCKER_HOST at its socket, E2E_RUNNER=<n>, E2E_RUNNER_LOG_DIR); the lane's
#                   settings come from the environment as for dp-ci.sh e2e (E2E_TARGET, E2E_RETRIES, E2E_TIMEOUT_SECS,
#                   E2E_RUNNER_FILES: its share of the full set [empty: the whole full set], ...; E2E_SPEC and E2E_GREP
#                   are refused: they make a targeted run, without the full set's retries and limits). RELEASE_PIN [the
#                   runner checkout's commit: the one the build is of], E2E_ROTATION_DATE [today, UTC, fixed at this
#                   start: a round passes one date to all its runners]
#   images          the runner's image list, one per line: every image the compose files of the checkout name (the apps,
#                   the DB starter packs, the tools, the shipped bundle), the CI image and the newest build's server image
#   full-set <N>    step 1's full set in N runners (1 to 4) as one lane (asbl/ci/jenkins/release-step1.sh with
#                   E2E_RUNNERS=<N>): the runner lists checked first (asbl/ci/full-set-runners.py check; refused: exit 2,
#                   nothing started); then runners 1 to N at once, each started (its marks here), its share run
#                   (E2E_RUNNER_FILES = full-set-runners.py pattern <N> <n>; its console in its log folder as
#                   <UTC>-console.log, never here: its E2E_JSON_REPORT= line here would count its report twice), then
#                   stopped. A runner that did not start (its engine gave no answer within E2E_RUNNER_ENGINE_WAIT_SECS, a
#                   copy failed) runs nothing: its files are NOT_RUN. Then the lane's one log and one report in this
#                   host's log folder, <LOG_DIR>/<UTC>-e2e-<commit>.log and its -playwright.json: the merge of the
#                   runners' (full-set-runners.py merge), or with 1 runner its own, linked under that name; and the link
#                   <LOG_DIR>/runners/full-set-latest.log to it (release-state.sh record-step1 reads it: this host's
#                   latest.log is its own lanes'). Prints E2E_MERGED_LOG=<log> and E2E_JSON_REPORT=<report>. The settings
#                   of `run`, one RELEASE_PIN and one E2E_ROTATION_DATE for every runner. This host's own lanes write
#                   this checkout and the caches: a caller starts them once each runner's "RUNNER <n> CACHES" mark ended
#
# SETTINGS (environment)
#   E2E_RUNNERS_HOME [/var/kraft-internalsystems/projects/dp-ci-runners]   each runner's checkout folder <home>/<n>
#   E2E_RUNNER_SOCKET_DIR [/run/dp-ci-runners]   each runner's socket folder <dir>/<n>
#   LOG_DIR [/var/kraft-internalsystems/logs/datapallas-ci]   this host's; a runner's is <LOG_DIR>/runners/<n>
#   RELEASE_RUNNER_LIMIT_GB [10]   each runner's hard memory limit (machines file key): a runner that needs more fails its
#                                  own job with "out of memory" in its log, never taking the memory of other apps
#   E2E_RUNNER_ENGINE_WAIT_SECS [300]   how long start waits for a runner's engine
#   RUNNER_STARTED_FILE [empty]    a run folder's started.txt (the orchestrator's): before a runner starts, its line
#                                  "<UTC> <part> container dp-ci-runner-<n> real <what>", so a stop finds it, and
#                                  memory.log samples it whole; RUNNER_PART [runner-<n>] is that line's part
#
# EXIT CODES: 0 done; 1 a runner could not start, its engine did not answer, or its lane failed (run: the lane's own
# exit code; full-set: the lane red); 2 a wrong call (a runner outside 1 to 4, a runner there already, no runner for run,
# runner lists refused).
#
# Callers: asbl/ci/jenkins/release-orchestrator.sh (step 1's full set in N runners), a person or an AI agent from the
# shell. Examples:
#   bash asbl/ci/e2e-runners.sh start 1 2
#   E2E_TARGET=docker-server E2E_RETRIES=1 E2E_RUNNER_FILES='/specs/features/reporting\.spec\.ts$' bash asbl/ci/e2e-runners.sh run 1
#   bash asbl/ci/e2e-runners.sh status
#   E2E_TARGET=docker-server E2E_RETRIES=1 bash asbl/ci/e2e-runners.sh full-set 4
#   bash asbl/ci/e2e-runners.sh stop
# Tests: asbl/ci/tests/test-runners.sh (stub docker and ufw).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO=$PWD
. asbl/ci/marks.sh

RUNNERS_MAX=4
RUNNERS_HOME="${E2E_RUNNERS_HOME:-/var/kraft-internalsystems/projects/dp-ci-runners}"
SOCKET_DIR="${E2E_RUNNER_SOCKET_DIR:-/run/dp-ci-runners}"
LOG_DIR="${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}"
LIMIT_GB="${RELEASE_RUNNER_LIMIT_GB:-10}"
ENGINE_WAIT_SECS="${E2E_RUNNER_ENGINE_WAIT_SECS:-300}"
CI_IMAGE=datapallas-ci
SERVER_IMAGE_REPO=flowkraft/datapallas-server
CACHE_VOLUMES="dp-ci-m2 dp-ci-npm dp-ci-cache"   # dp-ci.sh's CI container mounts them at /root/.m2, .npm, .cache
APPS_IN_REPO=asbl/src/main/external-resources/db-template/_apps
# the compose files whose images a lane uses: the apps (xx-custom is a user's own, never run), the DB starter packs, the
# tools (the legacy Jasper server, the test email server) and the shipped bundle
COMPOSE_ROOTS="$APPS_IN_REPO asbl/src/main/external-resources/db-template/db asbl/src/main/external-resources/db-template/tools asbl/docker"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
runner_name() { echo "dp-ci-runner-$1"; }
runner_volume() { echo "dp-ci-runner-$1-docker"; }
runner_socket() { echo "$SOCKET_DIR/$1/docker.sock"; }
runner_checkout() { echo "$RUNNERS_HOME/$1/reportburster"; }
runner_log_dir() { echo "$LOG_DIR/runners/$1"; }
in_runner() { local n="$1"; shift; DOCKER_HOST="unix://$(runner_socket "$n")" "$@"; }   # in_runner <n> <command...>
runner_exists() { docker ps -a --filter "name=^$(runner_name "$1")\$" --format '{{.Names}}' 2>/dev/null | grep -q .; }
engine_answers() { in_runner "$1" timeout 20 docker version --format '{{.Server.Version}}' >/dev/null 2>&1; }
valid_runner() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le "$RUNNERS_MAX" ]; }

# ---- the runner's image list ----
# newest_build_log: this host's newest successful build log (dp-ci.sh build: PIPELINE_RESULT=SUCCESS and IMAGE_TAG=)
newest_build_log() {
  local log
  for log in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
    grep -aq '^PIPELINE_RESULT=SUCCESS' "$log" && grep -aq '^IMAGE_TAG=' "$log" && { echo "$log"; return 0; }
  done
  return 1
}
runner_images() {
  local root compose build_log
  for root in $COMPOSE_ROOTS; do
    find "$root" -name docker-compose.yml -not -path '*/xx-custom/*' 2>/dev/null | sort | while read -r compose; do
      (cd "$(dirname "$compose")" && docker compose config --images 2>/dev/null)
    done
  done | grep -v "^$SERVER_IMAGE_REPO:" | sort -u   # the bundle names the released tag: the build's is below
  echo "$CI_IMAGE"
  build_log=$(newest_build_log) && echo "$SERVER_IMAGE_REPO:$(grep -aoP '^IMAGE_TAG=\K\S+' "$build_log" | tail -1)"
}

# ---- start ----
# remove_containers_of_last_run <n>: every container left in runner n's engine. The volume keeps them with the images, and
# the apps' compose files say restart: unless-stopped, so the engine brings them back by itself as it starts: 16.6.3's
# Abort left Rundeck, the server and the AI Hub in runner 1's volume, to run again before the next round's first test. A
# runner being started has no lane yet, so all of them are leftovers. Images and the apps' data volumes stay. A failure
# only warns: the round goes on and collects what follows from it.
remove_containers_of_last_run() {
  local n="$1" left
  left=$(in_runner "$n" docker ps -aq 2>/dev/null)
  [ -n "$left" ] || return 0
  # shellcheck disable=SC2086   # one id per word
  if in_runner "$n" docker rm -f $left >/dev/null 2>&1; then echo "RUNNER  $n: $(wc -w <<< "$left") containers of its last run removed"
  else echo "WARN    runner $n: the containers of its last run could not all be removed: $(echo $left)"; fi
}
start_engine() {
  local n="$1" version dind name
  version=$(docker version --format '{{.Server.Version}}' 2>/dev/null) || { echo "FAIL  this host's Docker engine does not answer"; return 1; }
  dind="docker:$version-dind"
  if ! docker image inspect "$dind" >/dev/null 2>&1 && ! docker manifest inspect "$dind" >/dev/null 2>&1; then
    echo "FAIL  the image $dind (this host's engine version) does not exist: docker manifest inspect found no such tag"; return 1
  fi
  name=$(runner_name "$n")
  if [ -n "${RUNNER_STARTED_FILE:-}" ]; then
    printf '%s\t%s\tcontainer\t%s\treal\t%s\n' "$(now)" "${RUNNER_PART:-runner-$n}" "$name" \
      "runner $n (Docker in Docker): its engine and everything it runs" >> "$RUNNER_STARTED_FILE"
  fi
  mkdir -p "$SOCKET_DIR/$n" "$RUNNERS_HOME/$n" "$(runner_log_dir "$n")" || return 1
  rm -f "$(runner_socket "$n")"   # an old socket of a runner that ended
  # its engine listens on two sockets only, its own /var/run/docker.sock (what its CI container mounts) and the host
  # folder's (what this script and dp-ci.sh talk to): dockerd as the command, so the image adds no TCP listener
  docker run -d --rm --privileged --name "$name" --label "dp-ci-runner=$n" \
    --memory "${LIMIT_GB}g" --memory-swap "${LIMIT_GB}g" \
    -v "$(runner_volume "$n")":/var/lib/docker \
    -v "$SOCKET_DIR/$n":"$SOCKET_DIR/$n" \
    -v "$RUNNERS_HOME/$n":"$RUNNERS_HOME/$n" \
    -v "$(runner_log_dir "$n")":"$(runner_log_dir "$n")" \
    "$dind" dockerd --host=unix:///var/run/docker.sock --host="unix://$(runner_socket "$n")" \
      --bip="10.20$n.255.1/24" --default-address-pool "base=10.20$n.0.0/17,size=24" >/dev/null ||
    { echo "FAIL  runner $n: docker run $name failed"; return 1; }
  local waited=0
  until engine_answers "$n"; do
    if [ "$waited" -ge "$ENGINE_WAIT_SECS" ]; then
      echo "FAIL  runner $n did not answer: its engine gave no answer within $ENGINE_WAIT_SECS s ($(runner_socket "$n"))"; return 1
    fi
    sleep 2; waited=$((waited + 2))
  done
  echo "RUNNER  $n: $name ($dind) answers on $(runner_socket "$n"), memory limit ${LIMIT_GB} GB"
  remove_containers_of_last_run "$n"
}
copy_checkout() {
  local n="$1" to
  to=$(runner_checkout "$n")
  mkdir -p "$to" || return 1
  rsync -a --delete --exclude=/frend/reporting/testground/ --exclude=test-results/ --exclude=playwright-report/ "$REPO/" "$to/" ||
    { echo "FAIL  runner $n: the checkout copy to $to failed"; return 1; }
  echo "RUNNER  $n: checkout copied to $to at $(git -C "$to" rev-parse --short HEAD 2>/dev/null)"
}
# cache_fingerprint <volume> [<n>]: "<files> <bytes>" of a cache volume, of this host's engine (or runner n's)
cache_fingerprint() {
  local count_cmd='find /c -type f | wc -l; du -sb /c | cut -f1'
  if [ -n "${2:-}" ]; then in_runner "$2" docker run --rm -v "$1":/c:ro --entrypoint sh "$CI_IMAGE" -c "$count_cmd"
  else docker run --rm -v "$1":/c:ro --entrypoint sh "$CI_IMAGE" -c "$count_cmd"; fi 2>/dev/null | paste -sd' '
}
# copy_ci_image <n>: the CI image into runner n, unless the same id is there. Its own step before the caches: a cache copy
# runs this image in the runner's engine, and IMAGES comes after CACHES (the host's lanes wait for CACHES END only).
# Without it every cache copy failed on 16.6.3's first runner lane, which started with empty caches.
copy_ci_image() {
  local n="$1" host_id
  host_id=$(docker image inspect -f '{{.Id}}' "$CI_IMAGE" 2>/dev/null) || return 1
  [ "$(in_runner "$n" docker image inspect -f '{{.Id}}' "$CI_IMAGE" 2>/dev/null)" != "$host_id" ] || return 0
  docker save "$CI_IMAGE" | in_runner "$n" docker load -q >/dev/null
}
copy_caches() {
  local n="$1" volume host_print copied_file
  mkdir -p "$(runner_log_dir "$n")/caches" || return 1
  copy_ci_image "$n" || echo "WARN    runner $n: $CI_IMAGE could not be copied in: its caches cannot be copied either"
  for volume in $CACHE_VOLUMES; do
    copied_file="$(runner_log_dir "$n")/caches/$volume.copied"
    host_print=$(cache_fingerprint "$volume")
    if [ -n "$host_print" ] && [ "$host_print" = "$(cat "$copied_file" 2>/dev/null)" ]; then
      echo "CACHE   $n: $volume unchanged since its last copy ($host_print files and bytes)"; continue
    fi
    # emptied first, so the runner's equals the host's
    if docker run --rm -v "$volume":/from:ro --entrypoint tar "$CI_IMAGE" -C /from -cf - . |
       in_runner "$n" docker run --rm -i -v "$volume":/to --entrypoint sh "$CI_IMAGE" -c 'find /to -mindepth 1 -delete && tar -C /to -xf -'; then
      echo "$host_print" > "$copied_file"
      echo "CACHE   $n: $volume copied in ($host_print files and bytes)"
    else
      rm -f "$copied_file"; echo "WARN    runner $n: $volume could not be copied: its lane fills it as a first run would"
    fi
  done
}
# app_built_images <compose folder>: the images compose builds itself there (<project>-<service>, a build and no image)
app_built_images() {
  (cd "$1" && docker compose config --format json 2>/dev/null) | python3 -c 'import json, sys
c = json.load(sys.stdin)
print(*(c["name"] + "-" + s for s, v in c["services"].items() if "build" in v and "image" not in v))'
}
copy_images() {
  local n="$1" image host_id runner_id copied=0 kept=0 absent=0 failed=0 folder compose built record records_in build_log
  for image in $(runner_images); do
    host_id=$(docker image inspect -f '{{.Id}}' "$image" 2>/dev/null) ||
      { echo "IMAGE   $n: $image not on this host: the runner's lane pulls it, or builds it by its key"; absent=$((absent + 1)); continue; }
    runner_id=$(in_runner "$n" docker image inspect -f '{{.Id}}' "$image" 2>/dev/null)
    if [ "$runner_id" = "$host_id" ]; then kept=$((kept + 1)); continue; fi
    if docker save "$image" | in_runner "$n" docker load -q >/dev/null &&
       [ "$(in_runner "$n" docker image inspect -f '{{.Id}}' "$image" 2>/dev/null)" = "$host_id" ]; then
      echo "IMAGE   $n: $image copied in (${host_id:7:12})"; copied=$((copied + 1))
    else
      echo "WARN    runner $n: $image could not be copied: the runner's lane pulls it, or builds it by its key"; failed=$((failed + 1))
    fi
  done
  echo "IMAGES  $n: $copied copied, $kept there already (the same id), $absent not on this host, $failed failed"
  # each app's key record, with its images: when this host has all the images the app builds, the runner now has the
  # same ones, and this host's record (or none) says what they were built from; an app this host lacks an image of keeps
  # the runner's own images and record
  records_in="$(runner_log_dir "$n")/app-images"
  mkdir -p "$records_in" || return 1
  find "$APPS_IN_REPO" -name docker-compose.yml -not -path '*/xx-custom/*' 2>/dev/null | sort | while read -r compose; do
    folder=${compose#"$APPS_IN_REPO"/}; folder=${folder%/docker-compose.yml}
    record="$(echo "$folder" | tr / +).key"
    built=$(app_built_images "$(dirname "$compose")") || continue
    [ -n "$built" ] || continue
    for image in $built; do docker image inspect "$image" >/dev/null 2>&1 || continue 2; done
    if [ -f "$LOG_DIR/app-images/$record" ]; then cp -f "$LOG_DIR/app-images/$record" "$records_in/$record" && echo "RECORD  $n: $folder ($(head -c 8 "$records_in/$record"))"
    else rm -f "$records_in/$record"; fi
  done
  # the build's log, where dp-ci.sh docker_server_up finds the server image's tag
  if build_log=$(newest_build_log); then cp -f "$build_log" "$(runner_log_dir "$n")/" && echo "BUILD   $n: $(basename "$build_log") copied in"; fi
}
start_runner() {
  local n="$1"
  mark_start "RUNNER $n ENGINE" "runner $n: $(runner_name "$n") started, its engine waited for"
  start_engine "$n"; local rc=$?; mark_end "$rc"; [ "$rc" = 0 ] || return 1
  mark_start "RUNNER $n CHECKOUT" "runner $n: this checkout copied in"
  copy_checkout "$n"; rc=$?; mark_end "$rc"; [ "$rc" = 0 ] || return 1
  mark_start "RUNNER $n CACHES" "runner $n: the CI caches copied in when changed"
  copy_caches "$n"; mark_end "$?"
  mark_start "RUNNER $n IMAGES" "runner $n: the images of its list copied in by id, with their key records"
  copy_images "$n"; mark_end "$?"
}
start_cmd() {
  local n
  [ "$#" -gt 0 ] || { echo "usage: $0 start <n>... (1 to $RUNNERS_MAX)"; return 2; }
  for n in "$@"; do
    valid_runner "$n" || { echo "REFUSED runner $n: at most $RUNNERS_MAX runners, 1 to $RUNNERS_MAX. Nothing started"; return 2; }
    ! runner_exists "$n" || { echo "REFUSED runner $n: $(runner_name "$n") is there already (bash $0 stop $n first). Nothing started"; return 2; }
  done
  for n in "$@"; do start_runner "$n" || return 1; done
}

# ---- stop, status ----
stop_cmd() {
  local n runners="$*"
  [ -n "$runners" ] || runners=$(seq 1 "$RUNNERS_MAX")
  for n in $runners; do
    valid_runner "$n" || { echo "REFUSED runner $n: runners are 1 to $RUNNERS_MAX"; return 2; }
    runner_exists "$n" || continue
    # its CI container first, so its lane's log closes as a stopped run's does
    if engine_answers "$n" && in_runner "$n" docker ps -q --filter 'name=^dp-ci$' 2>/dev/null | grep -q .; then
      in_runner "$n" docker stop dp-ci >/dev/null 2>&1 && echo "STOPPED runner $n's CI container dp-ci"
    fi
    docker stop "$(runner_name "$n")" >/dev/null 2>&1
    docker rm -f "$(runner_name "$n")" >/dev/null 2>&1   # gone already when it was started with --rm
    echo "STOPPED runner $n ($(runner_name "$n") removed; its volume $(runner_volume "$n"), checkout and log folder kept)"
  done
}
status_cmd() {
  local n running engine ci volume checkout
  for n in $(seq 1 "$RUNNERS_MAX"); do
    running=no; engine=-; ci=-
    if runner_exists "$n"; then
      running=yes
      if engine_answers "$n"; then
        engine=answers
        ci=$(in_runner "$n" docker ps -q --filter 'name=^dp-ci$' 2>/dev/null | grep -q . && echo running || echo none)
      else engine=silent; fi
    fi
    volume=$(docker volume inspect "$(runner_volume "$n")" >/dev/null 2>&1 && echo kept || echo none)
    checkout=$(git -C "$(runner_checkout "$n")" rev-parse --short HEAD 2>/dev/null || echo none)
    echo "RUNNER $n running=$running engine=$engine ci=$ci volume=$volume checkout=$checkout"
  done
}

# ---- run ----
run_cmd() {
  local n="${1:-}" checkout
  valid_runner "$n" || { echo "usage: $0 run <n> (1 to $RUNNERS_MAX)"; return 2; }
  # a runner runs a share of the full set, with the full set's retries and limits: E2E_SPEC or E2E_GREP would make it a
  # targeted run (no retries, a 20 h limit)
  [ -z "${E2E_SPEC:-}" ] && [ -z "${E2E_GREP:-}" ] ||
    { echo "REFUSED runner $n: E2E_SPEC/E2E_GREP make a targeted run; a runner's share of the full set is E2E_RUNNER_FILES"; return 2; }
  runner_exists "$n" && engine_answers "$n" || { echo "REFUSED runner $n is not running, or its engine does not answer: bash $0 start $n"; return 2; }
  checkout=$(runner_checkout "$n")
  [ -f "$checkout/asbl/ci/dp-ci.sh" ] || { echo "REFUSED runner $n has no checkout at $checkout: bash $0 start $n"; return 2; }
  export RELEASE_PIN="${RELEASE_PIN:-$(git -C "$checkout" rev-parse HEAD)}"
  export E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-$(date -u +%F)}"
  echo "RUNNER  $n: the e2e lane on ${RELEASE_PIN:0:8}, rotation date $E2E_ROTATION_DATE, files '${E2E_RUNNER_FILES:-the whole full set}'"
  DOCKER_HOST="unix://$(runner_socket "$n")" E2E_RUNNER="$n" E2E_RUNNER_LOG_DIR="$(runner_log_dir "$n")" \
    FOLLOW_PIDFILE="" bash "$checkout/asbl/ci/jenkins/follow-ci.sh" run bash "$checkout/asbl/ci/dp-ci.sh" e2e
}

# ---- full-set: step 1's full set in N runners, as one lane ----
# runner_lane_log <console>: the lane log a runner's console names (follow-ci.sh's "following" line), when it is there
runner_lane_log() {
  local log
  log=$(sed -n 's/^follow-ci: following \([^ ]*\) .*/\1/p' "$1" 2>/dev/null | head -1)
  [ -n "$log" ] && [ -f "$log" ] && echo "$log"
}
# full_set_runner <N> <n> <stamp>: runner n's share of the full set: started, run, stopped; its lane log's path (or "-")
# in <its log folder>/<stamp>-lane.txt
full_set_runner() {
  local jobs="$1" n="$2" stamp="$3" console files rc lane_log
  console="$(runner_log_dir "$n")/$stamp-console.log"
  echo - > "$(runner_log_dir "$n")/$stamp-lane.txt" 2>/dev/null
  if ! start_runner "$n"; then
    echo "FAILED: runner $n did not start (above): its files NOT_RUN"
    stop_cmd "$n"; return 1
  fi
  files=$(python3 -I asbl/ci/full-set-runners.py pattern "$jobs" "$n") ||
    { echo "FAILED: runner $n: its share cannot be read (full-set-runners.py pattern $jobs $n): its files NOT_RUN"; stop_cmd "$n"; return 1; }
  echo "RUNNER  $n: its lane starts, its console in $console"
  E2E_RUNNER_FILES="$files" run_cmd "$n" > "$console" 2>&1; rc=$?
  lane_log=$(runner_lane_log "$console")
  echo "${lane_log:--}" > "$(runner_log_dir "$n")/$stamp-lane.txt"
  echo "RUNNER  $n: its lane ended rc=$rc (its log ${lane_log:-none}, its console $console)"
  stop_cmd "$n"
  return "$rc"
}
full_set_cmd() {
  local jobs="${1:-}" n out stamp commit merged rc pids=() logs=() report link="$LOG_DIR/runners/full-set-latest.log"
  [[ "$jobs" =~ ^[1-4]$ ]] || { echo "usage: $0 full-set <N> (1 to $RUNNERS_MAX runners)"; return 2; }
  [ -z "${E2E_SPEC:-}" ] && [ -z "${E2E_GREP:-}" ] ||
    { echo "REFUSED full-set: E2E_SPEC/E2E_GREP make a targeted run, not the full set. Nothing started"; return 2; }
  for n in $(seq 1 "$jobs"); do
    ! runner_exists "$n" || { echo "REFUSED runner $n: $(runner_name "$n") is there already (bash $0 stop $n first). Nothing started"; return 2; }
  done
  out=$(python3 -I asbl/ci/full-set-runners.py check 2>&1) ||
    { printf '%s\n' "$out" | grep -E '^(REFUSED|WARN)'; echo "REFUSED full-set: the runner lists, asbl/ci/full-set-runners.txt (above). Nothing started"; return 2; }
  printf '%s\n' "$out" | grep '^WARN' || true
  # one commit and one rotation date for every runner of the lane
  export RELEASE_PIN="${RELEASE_PIN:-$(git rev-parse HEAD)}" E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-$(date -u +%F)}"
  commit=$(git rev-parse --short "$RELEASE_PIN") || { echo "FAIL  no commit $RELEASE_PIN in this checkout"; return 1; }
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  merged="$LOG_DIR/$stamp-e2e-$commit.log"
  mkdir -p "$LOG_DIR/runners" || return 1
  for n in $(seq 1 "$jobs"); do mkdir -p "$(runner_log_dir "$n")" || return 1; done
  echo "FULL SET in $jobs runner(s) at once, on ${RELEASE_PIN:0:8}, target ${E2E_TARGET:-web}, rotation date $E2E_ROTATION_DATE"
  for n in $(seq 1 "$jobs"); do full_set_runner "$jobs" "$n" "$stamp" & pids+=("$!"); done
  wait "${pids[@]}"
  for n in $(seq 1 "$jobs"); do logs+=("$(cat "$(runner_log_dir "$n")/$stamp-lane.txt" 2>/dev/null || echo -)"); done
  if [ "$jobs" = 1 ]; then
    # one runner: its log is the lane's, linked here under the e2e name with its report beside it
    if [ "${logs[0]}" = - ]; then
      echo "FAILED: runner 1 ran no lane: the full set NOT_RUN"; rm -f "$link"; return 1
    fi
    report="${logs[0]%.log}-playwright.json"
    ln -f "${logs[0]}" "$merged" 2>/dev/null || cp -p "${logs[0]}" "$merged" || { echo "FAIL  the lane's log could not be linked as $merged"; return 1; }
    [ ! -f "$report" ] || ln -f "$report" "${merged%.log}-playwright.json" 2>/dev/null || cp -p "$report" "${merged%.log}-playwright.json"
    rc=0; grep -aq '^PIPELINE_RESULT=SUCCESS' "$merged" || rc=1
    echo "E2E_MERGED_LOG=$merged"
    [ ! -f "${merged%.log}-playwright.json" ] || echo "E2E_JSON_REPORT=${merged%.log}-playwright.json"
    grep -a '^E2E_RESULT \|^PIPELINE_RESULT=' "$merged" | tail -2
  else
    python3 -I asbl/ci/full-set-runners.py merge "$jobs" "$merged" "${logs[@]}"; rc=$?
    [ "$rc" != 2 ] || { echo "FAILED: the runners' results could not be merged (above): the lane is red"; rm -f "$link"; return 1; }
  fi
  ln -sfn "$merged" "$link"
  [ "$rc" = 0 ] || echo "FAILED: the full set in $jobs runner(s) is red: $(grep -a -m1 '^E2E_RUNNERS_RED ' "$merged" | sed 's/^E2E_RUNNERS_RED /runner(s) /' || true)$(grep -a -m1 '^E2E_RESULT ' "$merged" | grep -oE 'failed=[0-9]+' | sed 's/^/ /')"
  return "$rc"
}

case "${1:-help}" in
  start)  shift; start_cmd "$@" ;;
  stop)   shift; stop_cmd "$@" ;;
  status) status_cmd ;;
  run)    shift; run_cmd "$@" ;;
  images) runner_images ;;
  full-set) shift; full_set_cmd "$@" ;;
  help|-h|--help) sed -n '2,/^set -uo pipefail/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' ;;
  *) echo "usage: $0 start <n>...|stop [<n>...]|status|run <n>|images|full-set <N>|help"; exit 2 ;;
esac

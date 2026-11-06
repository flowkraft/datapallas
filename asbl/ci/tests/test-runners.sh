#!/bin/bash
# The runners (asbl/ci/e2e-runners.sh): a Docker engine of their own per job of a split full set, and dp-ci.sh's lane in
# one. The cases:
#   1. start: runners 1 to 4, each `docker run` privileged, with its own name, volume, socket folder and address pool,
#      and the same paths inside as outside; a 5th refused; a runner there already refused; an engine that never answers:
#      "did not answer", exit 1;
#   2. a runner's lane (run): every docker call to its own socket; its CI container with --network host, the runner's own
#      docker socket, its own checkout and log folder; no ufw call; no dp-dev stop or start; dp-ci.sh refuses a runner's
#      lane on another socket, a task other than e2e, and a runner without the CI image (never builds it); run refuses
#      E2E_SPEC (a targeted run);
#   3. images: every image of the runner's list that this host has, copied when the runner lacks its id, not when it has
#      it; an app image with its key record; an image this host lacks left to the runner (no copy, no pull or build at
#      start); never a build of the server or CI image in a runner; the caches copied once, and again only when the
#      host's changed; in the lane, an app image is current (no build) only with its key record of the sources' key;
#   4. a started runner is a real `container` line of started.txt, and the orchestrator's sampler names it (docker stats
#      of the whole runner), with this host's CPU load line and one memory line per VM of the round, WIN_VM=<name>;
#   5. the round's rotation date and the full lane's retries and timeouts reach every runner; a runner's share stays the
#      full mode, inside the full set's two exclusions;
#   6. stop: each runner's CI container stopped in its engine, the runners removed, their volumes kept;
#   7. with 1 job: runner 1 alone, with the whole full set;
#   8. full-set <N> (step 1's full set as one lane): each runner started, run with its own share (full-set-runners.py
#      pattern) and stopped; the merged log in LOG_DIR under the e2e name with the lane's commit, runners/full-set-latest.log
#      naming it; green only when each runner is; a red runner and engines that never answer: the lane red, the runners
#      named, their files NOT_RUN; 1 runner: its own log and report under the e2e name; refused: 5 runners, E2E_SPEC, a
#      runner there already.
# Every folder is a scratch one: a scratch git repository with a copy of asbl/ci and made-up compose files; docker, ufw,
# ssh and virsh are stubs first on PATH that record each call with its DOCKER_HOST: nothing is started, no image or cache
# is copied, no live folder is touched. Takes about 30 seconds.
# Callers: a person or an agent, from the shell, after changing the runners or dp-ci.sh's runner lane.
#   bash asbl/ci/tests/test-runners.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-runners.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
same() {  # same <expected> <actual>: equal, or both printed
  [ "$1" = "$2" ] && return 0
  printf '      expected: %s\n      actual:   %s\n' "$1" "$2"; return 1
}
has() {  # has <text> <text to search>
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}
hasnt() {  # hasnt <text> <text to search>
  case "$2" in *"$1"*) printf '      "%s" found in:\n%s\n' "$1" "$(printf '%s\n' "$2" | grep -F -- "$1" | sed 's/^/        /' | head -5)"; return 1 ;; esac
  return 0
}

# ---- the stubs: docker (one state per engine: this host's, each runner's), ufw, ssh, virsh ----
export STUB="$SCRATCH/stub"; mkdir -p "$STUB/bin"
cat > "$STUB/bin/docker" <<'EOF'
#!/bin/bash
# stub docker: "<engine> docker <args>" in $STUB/calls, the engine from DOCKER_HOST (host, or r<n> for a runner's socket
# .../<n>/docker.sock). Each engine's images are $STUB/images-<engine> ("<name> <id>" lines); a runner answers while
# $STUB/running-<n> is there (made by its docker run, removed by its stop), unless $STUB/silent is there
case "${DOCKER_HOST:-}" in
  "") eng=host ;;
  unix://*/[0-9]/docker.sock) n=${DOCKER_HOST%/docker.sock}; n=${n##*/}; eng=r$n ;;
  *) eng=other ;;
esac
echo "$eng docker $*" >> "$STUB/calls"
if [ "$eng" != host ]; then
  [ -e "$STUB/running-${eng#r}" ] && [ ! -e "$STUB/silent" ] || { echo "Cannot connect to the Docker daemon at $DOCKER_HOST" >&2; exit 1; }
fi
images="$STUB/images-$eng"; touch "$images"
image_id() { awk -v i="$1" '$1 == i { print $2 }' "$images" | tail -1; }
arg_after() { local want="$1" prev=""; shift; for a in "$@"; do [ "$prev" = "$want" ] && { echo "$a"; return; }; prev="$a"; done; }
case "${1:-}" in
  version|info) echo 28.3.1 ;;
  manifest) [ "${3:-}" = docker:28.3.1-dind ] ;;
  image)
    name="${*: -1}"; id=$(image_id "$name")
    [ -n "$id" ] || { echo "Error: No such image: $name" >&2; exit 1; }
    case " $* " in *" -f "*|*" --format "*) echo "$id" ;; *) echo "[{}]" ;; esac ;;
  ps)
    names=""
    if [ "$eng" = host ]; then
      for f in "$STUB"/running-*; do [ -e "$f" ] && names="$names dp-ci-runner-${f##*-}"; done
      names="$names datapallas-dev"   # dp-dev runs on this host's engine
    else
      [ -e "$STUB/ci-${eng#r}" ] && names="$names dp-ci"
      names="$names $(cat "$STUB/left-${eng#r}" 2>/dev/null)"   # what the runner's last run left in its volume
    fi
    filter=$(arg_after --filter "$@"); filter=${filter#name=^}; filter=${filter%\$}
    for c in $names; do
      [ -z "$filter" ] || [ "$c" = "$filter" ] || continue
      case "$*" in *'|'*) echo "$c|" ;; *) echo "$c" ;; esac
    done ;;
  stats) shift; for a in "$@"; do case "$a" in --*|*'{{'*) ;; *) printf '%s|250.0%%|7.5GiB / 10GiB|75.0%%\n' "$a" ;; esac; done ;;
  run)
    name=$(arg_after --name "$@")
    case "$eng:$name" in
      host:dp-ci-runner-*) touch "$STUB/running-${name##*-}" "$STUB/volume-$name-docker"; exit 0 ;;
      r*:dp-ci)  # dp-ci.sh's CI container: its log gets a green end at once (follow-ci.sh then ends)
        for a in "$@"; do case "$a" in LOG=*) log=${a#LOG=} ;; esac; done
        if [ -e "$STUB/full-report" ]; then
          # the full-set cases: a lane's summary lines and a one-test report beside its log (full-set-runners.py merge reads
          # them); red with $STUB/red-<n>
          c=$(cat "$STUB/commit"); rep="${log%.log}-playwright.json"; st=expected; res=passed; p=1; f=0; x=0; pr=SUCCESS
          [ ! -e "$STUB/red-${eng#r}" ] || { st=unexpected; res=failed; p=0; f=1; x=1; pr=FAILED_AT_STEP_4; }
          printf 'PIPELINE_START 2026-11-05T10:00:00Z  task=e2e  commit=%s  version=16.6.3\nE2E_COMMIT=%s\nE2E_RETRIES=1 E2E_TIMEOUT_SECS=36000 E2E_JSON_REPORT=%s\nE2E_TARGET=web\n' "$c" "$c" "$rep" >> "$log"
          printf '{"config": {}, "suites": [{"title": "%s.spec.ts", "file": "specs/%s.spec.ts", "specs": [{"title": "t", "file": "specs/%s.spec.ts", "line": 1, "tests": [{"status": "%s", "projectName": "chromium", "results": [{"status": "%s", "duration": 60000}]}]}]}], "errors": [], "stats": {"startTime": "2026-11-05T10:00:00.000Z", "duration": 60000, "expected": %d, "unexpected": %d, "flaky": 0, "skipped": 0}}\n' \
            "$eng" "$eng" "$eng" "$st" "$res" "$p" "$f" > "$rep"
          printf 'E2E_RESULT mode=full passed=%d failed=%d flaky=0 skipped=0 didnotrun=0 exit=%d target=web\nPIPELINE_RESULT=%s\n' "$p" "$f" "$x" "$pr" >> "$log"
        elif [ -e "$STUB/late-log" ]; then
          # as a real container: its first line comes after docker run returned, and its log was not there before it
          ( sleep 1; printf 'PIPELINE_START\nPIPELINE_RESULT=SUCCESS\n' >> "$log" ) >/dev/null 2>&1 &
        else
          printf 'PIPELINE_START\nE2E_RESULT mode=full passed=1 failed=0 flaky=0 skipped=0 didnotrun=0 exit=0 target=web\nPIPELINE_RESULT=SUCCESS\n' >> "$log"
        fi
        exit 0 ;;
    esac
    case "$*" in
      *" -i "*)   # a cache copied in: it runs the CI image in that engine, which must have it (as a real engine)
        grep -q '^datapallas-ci ' "$STUB/images-$eng" 2>/dev/null || { cat >/dev/null; echo "Unable to find image" >&2; exit 125; }
        cat > "$STUB/cache-$eng-$(arg_after -v "$@" | cut -d: -f1)" ;;
      *"--entrypoint tar"*) echo "TAR $(arg_after -v "$@" | cut -d: -f1)" ;;      # a cache read out
      *"-c find"*) cat "$STUB/cache-host-$(arg_after -v "$@" | cut -d: -f1)" 2>/dev/null || printf '10\n1000\n' ;;   # its fingerprint
    esac ;;
  save) for i in "${@:2}"; do echo "IMAGE $i $(image_id "$i")"; done ;;
  load) while read -r word name id; do [ "$word" = IMAGE ] && { grep -v "^$name " "$images" > "$images.new"; echo "$name $id" >> "$images.new"; mv "$images.new" "$images"; }; done ;;
  compose)
    folder=$(basename "$PWD")
    case "$*" in
      *"config --images"*) cat "$STUB/compose-$folder.images" 2>/dev/null ;;
      *"config --format json"*) cat "$STUB/compose-$folder.json" 2>/dev/null || exit 1 ;;
    esac ;;
  stop) [ "$eng" = host ] && rm -f "$STUB/running-${2##*-}" || rm -f "$STUB/ci-${eng#r}" ;;
  rm) if [ "$eng" = host ]; then rm -f "$STUB/running-${3##*-}"; else rm -f "$STUB/left-${eng#r}"; fi ;;
  volume) [ -e "$STUB/volume-${3:-}" ] ;;
esac
exit 0
EOF
cat > "$STUB/bin/ufw" <<'EOF'
#!/bin/bash
echo "ufw $*" >> "$STUB/calls"
EOF
cat > "$STUB/bin/ssh" <<'EOF'
#!/bin/bash
# stub ssh: records "<user@host> <command>"; answers as Windows would to the memory script
target=""; skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in -i|-o) skip=1 ;; -*) ;; *) [ -z "$target" ] && target="$a" ;; esac
done
echo "ssh $target" >> "$STUB/calls"
echo "committed=8589934592 commit_peak=12884901888 commit_limit=21474836480 physical_total=12884901888 physical_available=4294967296"
EOF
cat > "$STUB/bin/virsh" <<'EOF'
#!/bin/bash
# stub virsh: VMs a and b running, VM c off
case "${1:-}" in
  domstate) case "${2:-}" in win10-dev|win10-dev-b) echo running ;; win10-dev-c) echo "shut off" ;; *) exit 1 ;; esac ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$STUB"/bin/*
export PATH="$STUB/bin:$PATH" CI_IMAGE_NAME=datapallas-ci
calls_of() { grep "^$1 " "$STUB/calls" 2>/dev/null; }   # calls_of <engine>: that engine's docker calls
docker_runs_of() { grep -E "^host docker run -d --rm --privileged --name dp-ci-runner-$1 " "$STUB/calls"; }

# ---- the scratch repository: a copy of asbl/ci, made-up compose files of the apps, the DB packs and the bundle ----
R="$SCRATCH/repo"; APPS="$R/asbl/src/main/external-resources/db-template/_apps"
mkdir -p "$R/asbl" "$APPS/app-x" "$APPS/flowkraft/_ai-hub" "$APPS/xx-custom" "$R/asbl/src/main/external-resources/db-template/db" "$R/asbl/docker"
cp -r asbl/ci "$R/asbl/ci"
rm -rf "$R/asbl/ci/tests"
for f in "$APPS/app-x" "$APPS/flowkraft/_ai-hub" "$APPS/xx-custom" "$R/asbl/src/main/external-resources/db-template/db" "$R/asbl/docker"; do
  echo "services: {}" > "$f/docker-compose.yml"
done
echo "a source" > "$APPS/app-x/Dockerfile"
printf 'app-x-web\npostgres:17-alpine\n' > "$STUB/compose-app-x.images"
printf '{"name": "app-x", "services": {"web": {"build": {"context": "."}}, "db": {"image": "postgres:17-alpine"}}}\n' > "$STUB/compose-app-x.json"
printf 'ai-hub-letta\nvectorim/element-web:v1\n' > "$STUB/compose-_ai-hub.images"
printf '{"name": "ai-hub", "services": {"letta": {"build": {"context": "."}}, "element": {"image": "vectorim/element-web:v1"}}}\n' > "$STUB/compose-_ai-hub.json"
printf 'never/copied:1\n' > "$STUB/compose-xx-custom.images"
printf 'mariadb:11.3.2\nibmcom/db2:11.5\n' > "$STUB/compose-db.images"
printf 'mailhog/mailhog\nflowkraft/datapallas-server:16.6.3\n' > "$STUB/compose-docker.images"
git -C "$R" init -q && git -C "$R" add -A && git -C "$R" -c user.name=t -c user.email=t@t.invalid commit -qm scratch || exit 2
PIN=$(git -C "$R" rev-parse HEAD)

export LOG_DIR="$SCRATCH/logs" E2E_RUNNERS_HOME="$SCRATCH/runners" E2E_RUNNER_SOCKET_DIR="$SCRATCH/sockets" E2E_RUNNER_ENGINE_WAIT_SECS=4
mkdir -p "$LOG_DIR/app-images"
printf 'PIPELINE_START\nIMAGE_TAG=16.6.3-%s\nPIPELINE_RESULT=SUCCESS\n' "${PIN:0:8}" > "$LOG_DIR/20261105T100000Z-build-${PIN:0:8}.log"
# this host's images: all but ibmcom/db2 (this host lacks it); runner 1 has postgres with the host's id already
printf '%s\n' "datapallas-ci sha256:ci1" "flowkraft/datapallas-server:16.6.3-${PIN:0:8} sha256:srv1" "app-x-web sha256:appx1" \
  "postgres:17-alpine sha256:pg1" "ai-hub-letta sha256:letta1" "vectorim/element-web:v1 sha256:el1" "mariadb:11.3.2 sha256:maria1" \
  "mailhog/mailhog sha256:mh1" "never/copied:1 sha256:never1" "docker:28.3.1-dind sha256:dind1" > "$STUB/images-host"
echo "postgres:17-alpine sha256:pg1" > "$STUB/images-r1"
echo "ai-hub-letta sha256:old-letta" > "$STUB/images-r2"
echo "1111111111111111111111111111111111111111" > "$LOG_DIR/app-images/app-x.key"
echo "2222222222222222222222222222222222222222" > "$LOG_DIR/app-images/flowkraft+_ai-hub.key"
unset E2E_SPEC E2E_GREP E2E_RETRIES E2E_TIMEOUT_SECS E2E_ROTATION_DATE E2E_RUNNER E2E_RUNNER_LOG_DIR E2E_RUNNER_FILES RELEASE_PIN DOCKER_HOST
RUNNERS="$R/asbl/ci/e2e-runners.sh"

echo "---- 1. start: runners 1 to 4, their own name, volume, socket folder and address pool ----"
mkdir -p "$SCRATCH/run"; : > "$STUB/calls"
START_OUT=$(RUNNER_STARTED_FILE="$SCRATCH/run/started.txt" RUNNER_PART=lane1-docker-server-full-runner-1 bash "$RUNNERS" start 1 2>&1); START_RC=$?
START_CALLS=$(cat "$STUB/calls")
OUT=$(RUNNER_STARTED_FILE="$SCRATCH/run/started.txt" RUNNER_PART=lane1-docker-server-full-runner-1 bash "$RUNNERS" start 1 2>&1); RC=$?
check "start 1 when it is there already: refused, exit 2" same "2 1" "$RC $(printf '%s\n' "$OUT" | grep -c '^REFUSED runner 1: dp-ci-runner-1 is there already')"
echo "rb-rundeck datapallas-server" > "$STUB/left-2"   # a run stopped by an Abort: its containers stay in the runner's volume
START2_OUT=$(bash "$RUNNERS" start 2 3 4 2>&1); START2_RC=$?
check "start 1, then 2 3 4: exit 0 both" same "0 0" "$START_RC $START2_RC"
check "start: the containers of a runner's last run removed from its engine, and said; a runner with none: no rm" same "1 1 0" \
  "$(grep -c '^r2 docker rm -f rb-rundeck datapallas-server$' "$STUB/calls") $(printf '%s\n' "$START2_OUT" | grep -c '^RUNNER  2: 2 containers of its last run removed$') $(grep -c '^r3 docker rm' "$STUB/calls")"
for n in 1 2 3 4; do
  run_line=$(docker_runs_of "$n")
  check "runner $n: one privileged docker run of docker:28.3.1-dind (the host engine's version), memory limit 32 GB" same \
    "1 yes" "$(printf '%s\n' "$run_line" | grep -c . ) $(has '--memory 32g --memory-swap 32g' "$run_line" >/dev/null && has ' docker:28.3.1-dind dockerd ' "$run_line" >/dev/null && echo yes)"
  check "runner $n: its volume, socket folder, checkout and log folder, each at the same path inside" bash -c '
    l="$1"; s="$2/$3"; h="$4/$3"; g="$5/runners/$3"
    case "$l" in *"-v dp-ci-runner-$3-docker:/var/lib/docker "*) ;; *) exit 1 ;; esac
    case "$l" in *"-v $s:$s "*) ;; *) exit 1 ;; esac
    case "$l" in *"-v $h:$h "*) ;; *) exit 1 ;; esac
    case "$l" in *"-v $g:$g "*) ;; *) exit 1 ;; esac' _ "$run_line" "$E2E_RUNNER_SOCKET_DIR" "$n" "$E2E_RUNNERS_HOME" "$LOG_DIR"
  check "runner $n: its engine on its own socket only (no TCP), its own address pool" bash -c '
    l="$1"; n="$2"
    case "$l" in *"--host=unix:///var/run/docker.sock --host=unix://$3/$n/docker.sock --bip=10.20$n.255.1/24 --default-address-pool base=10.20$n.0.0/17,size=24"*) ;; *) exit 1 ;; esac
    case "$l" in *tcp://*) exit 1 ;; esac' _ "$run_line" "$n" "$E2E_RUNNER_SOCKET_DIR"
done
check "the four runners: four names, four volumes, four pools" same "4 4 4" \
  "$(grep -oE -- '--name dp-ci-runner-[0-9]' "$STUB/calls" | sort -u | wc -l) $(grep -oE -- '-v dp-ci-runner-[0-9]-docker' "$STUB/calls" | sort -u | wc -l) $(grep -oE -- '--bip=10\.20[0-9]' "$STUB/calls" | sort -u | wc -l)"
check "the dind image checked with docker manifest inspect only when this host lacks it (it has it here): no pull" \
  eval '! grep -qE "^host docker (pull|manifest)" "$STUB/calls"'
check "start: the four parts marked, in order (ENGINE, CHECKOUT, CACHES, IMAGES)" same \
  "RUNNER 1 ENGINE START|RUNNER 1 ENGINE END|RUNNER 1 CHECKOUT START|RUNNER 1 CHECKOUT END|RUNNER 1 CACHES START|RUNNER 1 CACHES END|RUNNER 1 IMAGES START|RUNNER 1 IMAGES END" \
  "$(printf '%s\n' "$START_OUT" | sed -n 's/^######## \(RUNNER 1 [A-Z]*\) \(START\|END\).*/\1 \2/p' | paste -sd'|')"
check "start: the checkout copied, on the same commit" same "${PIN:0:8}" "$(git -C "$E2E_RUNNERS_HOME/1/reportburster" rev-parse --short=8 HEAD)"
OUT=$(bash "$RUNNERS" start 5 2>&1); RC=$?
check "a 5th runner: refused, exit 2, nothing started" same "2 1 0" "$RC $(printf '%s\n' "$OUT" | grep -c '^REFUSED runner 5: at most 4 runners') $(grep -c 'dp-ci-runner-5' "$STUB/calls")"
bash "$RUNNERS" stop 4 >/dev/null 2>&1
sed -i '/^docker:28.3.1-dind /d' "$STUB/images-host"; touch "$STUB/silent"   # this host lacks the dind image; no engine answers
OUT=$(E2E_RUNNER_ENGINE_WAIT_SECS=2 bash "$RUNNERS" start 4 2>&1); RC=$?
rm -f "$STUB/silent"
check "an engine that never answers: \"did not answer\", exit 1, no copy into it" same "1 1 0" \
  "$RC $(printf '%s\n' "$OUT" | grep -c '^FAIL  runner 4 did not answer') $(printf '%s\n' "$OUT" | grep -c 'RUNNER 4 CHECKOUT START')"
check "the dind image this host lacks: docker manifest inspect (no pull)" same "1 0" \
  "$(grep -c '^host docker manifest inspect docker:28.3.1-dind' "$STUB/calls") $(grep -c '^host docker pull' "$STUB/calls")"
bash "$RUNNERS" stop 4 >/dev/null 2>&1; bash "$RUNNERS" start 4 >/dev/null 2>&1

echo "---- 3. images and caches ----"
check "runner 1: every image of its list this host has, copied in (save | load), not postgres (the same id there already)" same \
  "ai-hub-letta app-x-web datapallas-ci flowkraft/datapallas-server:16.6.3-${PIN:0:8} mailhog/mailhog mariadb:11.3.2 vectorim/element-web:v1" \
  "$(printf '%s\n' "$START_CALLS" | sed -n 's/^host docker save //p' | sort | paste -sd' ')"
check "runner 1: then each with the host's id" same "sha256:appx1 sha256:ci1 sha256:letta1 sha256:pg1 sha256:srv1" \
  "$(awk '$1 ~ /^(app-x-web|datapallas-ci|ai-hub-letta|postgres:17-alpine|flowkraft\/datapallas-server:)/ { print $2 }' "$STUB/images-r1" | sort | paste -sd' ')"
check "runner 2: ai-hub-letta with another id there: replaced by the host's" same "sha256:letta1" "$(awk '$1 == "ai-hub-letta" { print $2 }' "$STUB/images-r2")"
check "the image this host lacks (ibmcom/db2): not copied, said; no pull or build at start in any runner" same "1 0 0" \
  "$(printf '%s\n' "$START_OUT" | grep -c 'ibmcom/db2:11.5 not on this host: the runner.s lane pulls it, or builds it by its key') $(grep -c 'docker save ibmcom' "$STUB/calls") $(grep -cE '^r[0-9] docker (pull|build|compose build|compose up)' "$STUB/calls")"
check "xx-custom (a user's own app) is not in the list" eval '! grep -q "never/copied" "$STUB/calls"'
check "the bundle's released tag is not in the list, the build's tag is" same "0 1" \
  "$(bash "$RUNNERS" images | grep -c '^flowkraft/datapallas-server:16.6.3$') $(bash "$RUNNERS" images | grep -c "^flowkraft/datapallas-server:16.6.3-${PIN:0:8}$")"
check "the key records of the apps whose built images this host has, copied with them" same \
  "1111111111111111111111111111111111111111 2222222222222222222222222222222222222222" \
  "$(cat "$LOG_DIR/runners/1/app-images/app-x.key" "$LOG_DIR/runners/1/app-images/flowkraft+_ai-hub.key" 2>/dev/null | paste -sd' ')"
check "the newest successful build log copied into the runner's log folder (docker_server_up reads its IMAGE_TAG)" \
  test -f "$LOG_DIR/runners/1/20261105T100000Z-build-${PIN:0:8}.log"
check "the three caches copied into runner 1 once" same "dp-ci-cache dp-ci-m2 dp-ci-npm" \
  "$(printf '%s\n' "$START_CALLS" | grep -oE '^r1 docker run --rm -i -v dp-ci-[a-z0-9]+' | awk '{ print $NF }' | sed 's/^-v //' | sort | paste -sd' ')"
check "the CI image goes in before the first cache (16.6.3: every cache copy failed without it)" bash -c '
  [ "$(grep -n "^host docker save datapallas-ci" <<< "$1" | head -1 | cut -d: -f1)" -lt "$(grep -n "^r1 docker run --rm -i -v dp-ci-" <<< "$1" | head -1 | cut -d: -f1)" ]' _ "$START_CALLS"
check "no cache warning at the start" eval '! grep -q "could not be copied" <<< "$START_OUT"'
bash "$RUNNERS" stop 1 >/dev/null 2>&1; : > "$STUB/calls"
printf '11\n1001\n' > "$STUB/cache-host-dp-ci-npm"   # the host's npm cache changed
OUT=$(bash "$RUNNERS" start 1 2>&1)
check "started again: only the cache the host changed is copied (dp-ci-npm), no image (the same ids)" same "dp-ci-npm 0" \
  "$(grep -oE '^r1 docker run --rm -i -v dp-ci-[a-z0-9]+' "$STUB/calls" | awk '{ print $NF }' | sed 's/^-v //' | paste -sd' ') $(grep -c '^host docker save' "$STUB/calls")"
check "started again: a record of an app whose built image the host lacks stays the runner's own" bash -c '
  sed -i "/^app-x-web /d" "$1/images-host"; echo "3333333333333333333333333333333333333333" > "$2/runners/1/app-images/app-x.key"
  bash "$3" stop 1 >/dev/null 2>&1; bash "$3" start 1 >/dev/null 2>&1
  [ "$(cat "$2/runners/1/app-images/app-x.key")" = 3333333333333333333333333333333333333333 ]' _ "$STUB" "$LOG_DIR" "$RUNNERS"
echo "app-x-web sha256:appx1" >> "$STUB/images-host"
# the lane's own check (dp-ci.sh app_image_current_in_runner): an app image is current only with its key record of the
# sources' key and its images there; outside a runner, never (the host's compose build, cached, as before)
current_check() {  # current_check <E2E_RUNNER> <record> : 0 when current
  env REPO="$R" LOG_DIR="$SCRATCH/lane-records" E2E_RUNNER="$1" DOCKER_HOST="unix://$E2E_RUNNER_SOCKET_DIR/1/docker.sock" bash -c "
    APPS_IN_REPO=asbl/src/main/external-resources/db-template/_apps; APPS_ASSEMBLED_FROM=''
    $(sed -n '/^app_sources_key() {/,/^}/p' "$R/asbl/ci/dp-ci.sh")
    $(sed -n '/^  app_image_current_in_runner() {/,/^  }/p' "$R/asbl/ci/dp-ci.sh")
    mkdir -p \"\$LOG_DIR/app-images\"; [ -z '$2' ] || echo '$2' > \"\$LOG_DIR/app-images/app-x.key\"
    app_image_current_in_runner '$APPS/app-x' app-x"
}
KEY=$(env REPO="$R" bash -c "APPS_IN_REPO=asbl/src/main/external-resources/db-template/_apps; APPS_ASSEMBLED_FROM=''
  $(sed -n '/^app_sources_key() {/,/^}/p' "$R/asbl/ci/dp-ci.sh"); app_sources_key HEAD app-x")
check "lane: an app image with its record of the sources' key is current (no build)" current_check 1 "$KEY"
check "lane: a record of another key: not current (built, then recorded)" eval '! current_check 1 1111111111111111111111111111111111111111'
check "lane: its image missing in the runner: not current" eval 'sed -i "/^app-x-web /d" "$STUB/images-r1"; ! current_check 1 "$KEY"'
check "lane: outside a runner: never (the host's compose build, cached)" eval '! current_check "" "$KEY"'
check "dp-ci.sh app_images_build: a current app skipped, a built one recorded, in a runner only" bash -c '
  f=$(sed -n "/^  app_images_build() {/,/^  }/p" "$1")
  printf "%s\n" "$f" | grep -q "if app_image_current_in_runner" &&
  printf "%s\n" "$f" | grep -q "\[ -z \"\${E2E_RUNNER:-}\" \] || { mkdir -p \"\$LOG_DIR/app-images\" && app_sources_key HEAD"' _ "$R/asbl/ci/dp-ci.sh"

echo "---- 2. a runner's lane ----"
: > "$STUB/calls"
RUN_OUT=$(E2E_TARGET=docker-server E2E_RETRIES=1 E2E_TIMEOUT_SECS=259200 E2E_ROTATION_DATE=2026-11-09 \
  E2E_RUNNER_FILES='/specs/features/(reporting|connections)\.spec\.ts$' bash "$RUNNERS" run 2 2>&1); RUN_RC=$?
RUN_CALLS=$(cat "$STUB/calls")
CI_RUN=$(grep '^r2 docker run -d --rm --name dp-ci ' "$STUB/calls")
check "the CI container in a runner: its memory ceiling, set at its creation" has "--memory 12g --memory-swap 12g" "$CI_RUN"
check "run 2: followed to its green end (the stub CI container's log), exit 0" same "0 PIPELINE_RESULT=SUCCESS" "$RUN_RC $(printf '%s\n' "$RUN_OUT" | tail -1)"
check "run 2: every docker call of the lane to runner 2's socket (on this host's only run's own check that the runner is there)" same \
  "host docker ps -a --filter name=^dp-ci-runner-2\$ --format {{.Names}}|r2" \
  "$(printf '%s\n' "$RUN_CALLS" | grep '^host docker ' | sort -u | paste -sd'|')|$(printf '%s\n' "$RUN_CALLS" | grep -v '^host ' | grep ' docker ' | cut -d' ' -f1 | sort -u | paste -sd' ')"
check "run 2: its CI container: --network host, the runner's own docker socket, its own checkout and log folder" bash -c '
  l="$1"; c="$2/2/reportburster"; g="$3/runners/2"
  for want in "--network host" "-v /var/run/docker.sock:/var/run/docker.sock" "-v $c:$c -w $c" "-v $g:$g" "-e LOG=$g/" "-e E2E_RUNNER=2" "-e E2E_RUNNER_LOG_DIR=$g"; do
    case "$l" in *"$want"*) ;; *) echo "      missing: $want"; exit 1 ;; esac
  done' _ "$CI_RUN" "$E2E_RUNNERS_HOME" "$LOG_DIR"
check "run 2: no ufw call" same 0 "$(grep -c '^ufw' "$STUB/calls")"
check "run 2: no dp-dev stop or start (dp-dev runs on this host's engine)" same 0 "$(grep -cE 'docker (stop|start|run).*datapallas-dev' "$STUB/calls")"
check "run 2: the CI image not built, only looked for" same "0 1" \
  "$(grep -cE 'docker build' "$STUB/calls") $(grep -c '^r2 docker image inspect datapallas-ci' "$STUB/calls")"
check "run 2: the lane's log in the runner's own log folder, with its latest.log" bash -c \
  '[ "$(readlink "$1/runners/2/latest.log")" = "$(ls -1 "$1"/runners/2/*-e2e-*.log | tail -1)" ] && grep -q "^PIPELINE_RESULT=SUCCESS" "$1/runners/2/latest.log"' _ "$LOG_DIR"
check "run 2: the commit its copy holds (RELEASE_PIN), said" eval 'has "the e2e lane on ${PIN:0:8}" "$RUN_OUT"'
sed -i '/^datapallas-ci /d' "$STUB/images-r3"; : > "$STUB/calls"
OUT=$(bash "$RUNNERS" run 3 2>&1); RC=$?
check "a runner without the CI image: dp-ci.sh fails, naming the copy, and builds nothing" same "1 1 0" \
  "$([ "$RC" != 0 ] && echo 1) $(printf '%s\n' "$OUT" | grep -c 'FAIL  runner 3 has no datapallas-ci image: asbl/ci/e2e-runners.sh start 3 copies it in') $(grep -c 'docker build' "$STUB/calls")"
OUT=$(cd "$E2E_RUNNERS_HOME/1/reportburster" && E2E_RUNNER=1 E2E_RUNNER_LOG_DIR="$LOG_DIR/runners/1" bash asbl/ci/dp-ci.sh e2e 2>&1); RC=$?
check "dp-ci.sh: a runner's lane on this host's engine (no DOCKER_HOST): refused, exit 2" same "2 1" \
  "$RC $(printf '%s\n' "$OUT" | grep -c "^FAIL  E2E_RUNNER=1, but DOCKER_HOST='' is not that runner's socket")"
OUT=$(cd "$E2E_RUNNERS_HOME/1/reportburster" && DOCKER_HOST="unix://$E2E_RUNNER_SOCKET_DIR/2/docker.sock" E2E_RUNNER=1 E2E_RUNNER_LOG_DIR="$LOG_DIR/runners/1" bash asbl/ci/dp-ci.sh e2e 2>&1); RC=$?
check "dp-ci.sh: runner 1's lane on runner 2's socket: refused, exit 2" same 2 "$RC"
OUT=$(cd "$E2E_RUNNERS_HOME/1/reportburster" && DOCKER_HOST="unix://$E2E_RUNNER_SOCKET_DIR/1/docker.sock" E2E_RUNNER=1 E2E_RUNNER_LOG_DIR="$LOG_DIR/runners/1" bash asbl/ci/dp-ci.sh build 2>&1); RC=$?
check "dp-ci.sh: a build in a runner: refused, exit 2" same "2 1" "$RC $(printf '%s\n' "$OUT" | grep -c '^FAIL  only e2e runs in a runner')"
touch "$STUB/late-log"
OUT=$(bash "$RUNNERS" run 1 2>&1); RC=$?
rm -f "$STUB/late-log"
check "a container that writes its log late: the lane is followed to its end (16.6.3: stopped, no log to follow)" same "0 0" \
  "$RC $(grep -c 'no log to follow' <<< "$OUT")"
OUT=$(E2E_SPEC='/x\.spec\.ts$' bash "$RUNNERS" run 1 2>&1); RC=$?
check "run with E2E_SPEC (a targeted run): refused, exit 2" same "2 1" "$RC $(printf '%s\n' "$OUT" | grep -c '^REFUSED runner 1: E2E_SPEC/E2E_GREP make a targeted run')"

echo "---- 5. the round's rotation date, the full lane's retries and limits, in every runner ----"
echo "datapallas-ci sha256:ci1" >> "$STUB/images-r3"; : > "$STUB/calls"
for n in 1 3 4; do
  E2E_TARGET=docker-server E2E_RETRIES=1 E2E_TIMEOUT_SECS=259200 E2E_ROTATION_DATE=2026-11-09 E2E_RUNNER_FILES="/runner-$n-files/" \
    bash "$RUNNERS" run "$n" >/dev/null 2>&1
done
printf '%s\n' "$CI_RUN" >> "$STUB/calls"   # runner 2's, from its run above with the same settings
for n in 1 2 3 4; do
  l=$(grep "^r$n docker run -d --rm --name dp-ci " "$STUB/calls")
  check "runner $n: E2E_ROTATION_DATE=2026-11-09, E2E_RETRIES=1, E2E_TIMEOUT_SECS=259200, its files, the target" bash -c '
    for want in "-e E2E_ROTATION_DATE=2026-11-09 " "-e E2E_RETRIES=1 " "-e E2E_TIMEOUT_SECS=259200 " "-e E2E_RUNNER_FILES=/" "-e E2E_TARGET=docker-server "; do
      case "$1" in *"$want"*) ;; *) echo "      missing: $want"; exit 1 ;; esac
    done' _ "$l"
done
: > "$STUB/calls"
for n in 1 2; do bash "$RUNNERS" run "$n" >/dev/null 2>&1; done
check "no rotation date given: one date, today's (UTC), in each runner" same "$(date -u +%F) $(date -u +%F)" \
  "$(grep -oE '^r[12] docker run -d --rm --name dp-ci .*-e E2E_ROTATION_DATE=[0-9-]+' "$STUB/calls" | sed 's/.*=//' | paste -sd' ')"
# the share inside the full set: dp-ci.sh's E2E_SPEC for a runner (its full-mode branch), checked with Python's re
SPEC_LINE=$(grep -A4 "      mode=full$" "$R/asbl/ci/dp-ci.sh" | grep 'export E2E_SPEC="^(?!')
check "dp-ci.sh: a runner's files only in the full mode's branch (E2E_SPEC and E2E_GREP empty)" test -n "$SPEC_LINE"
check "a runner's share: its files, never the auth file or the Electron-only file, the mode full" bash -c '
  E2E_RUNNER_FILES="/specs/features/(reporting|auth-authorization-server|let-me-update-migrate-configuration)\.spec\.ts\$"
  eval "${1#"${1%%export*}"}"
  python3 -I - "$E2E_SPEC" <<PY
import re, sys
spec = re.compile(sys.argv[1])
want = {"/r/e2e/specs/features/reporting.spec.ts": True, "/r/e2e/specs/features/connections.spec.ts": False,
        "/r/e2e/specs/features/auth-authorization-server.spec.ts": False,
        "/r/e2e/specs/features/let-me-update-migrate-configuration.spec.ts": False}
bad = [p for p, w in want.items() if bool(spec.search(p)) != w]
print("      wrong: %s" % bad) if bad else None
sys.exit(1 if bad else 0)
PY' _ "$SPEC_LINE"
check "a runner's share in the rest form (a negative list) works the same" bash -c '
  E2E_RUNNER_FILES="^(?!.*/specs/features/(reporting|connections)\.spec\.ts\$)"
  eval "${1#"${1%%export*}"}"
  python3 -I - "$E2E_SPEC" <<PY
import re, sys
spec = re.compile(sys.argv[1])
ok = (not spec.search("/r/specs/features/reporting.spec.ts") and spec.search("/r/specs/features/samples.spec.ts")
      and not spec.search("/r/specs/features/auth-authorization-server.spec.ts"))
sys.exit(0 if ok else 1)
PY' _ "$SPEC_LINE"

echo "---- 7. with 1 job: runner 1 alone, the whole full set ----"
: > "$STUB/calls"
OUT=$(E2E_TARGET=docker-server E2E_RETRIES=1 bash "$RUNNERS" run 1 2>&1); RC=$?
check "run 1 with no share: the whole full set (E2E_RUNNER_FILES empty, E2E_SPEC empty: the full mode)" same "0 1 1" \
  "$RC $(grep -c '^r1 docker run -d --rm --name dp-ci .*-e E2E_SPEC= -e E2E_GREP= .*-e E2E_RUNNER_FILES= ' "$STUB/calls") $(printf '%s\n' "$OUT" | grep -c "files 'the whole full set'")"

echo "---- 4. started.txt, and the sampler ----"
check "started.txt: runner 1's real container line, written before it started" same \
  "lane1-docker-server-full-runner-1:container:dp-ci-runner-1:real" \
  "$(awk -F'\t' '{ print $2 ":" $3 ":" $4 ":" $5 }' "$SCRATCH/run/started.txt")"
mkdir -p "$SCRATCH/vm-conf"
export WIN_CI_CONF="$SCRATCH/vm-conf/win-ci.env" WIN_VM_CONF_DIR="$SCRATCH/vm-conf" RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf"
printf 'WIN_HOST=vm-a.invalid\nWIN_USER=ci\nWIN_SSH_KEY=%s\nWIN_KNOWN_HOSTS=%s\nWIN_REPO=C:/ci/repo\n' "$SCRATCH/stub-key" "$SCRATCH/stub-known-hosts" > "$WIN_CI_CONF"
: > "$SCRATCH/stub-key"; : > "$SCRATCH/stub-known-hosts"
for v in b c; do echo "WIN_HOST=vm-$v.invalid" > "$SCRATCH/vm-conf/win-ci-$v.env"; done
chmod 600 "$SCRATCH"/vm-conf/*
: > "$STUB/calls"
bash "$REPO_ROOT/asbl/ci/jenkins/release-orchestrator.sh" memory-sample "$SCRATCH/run" a b c
check "sampler: docker stats of runner 1, the whole runner" same \
  "$(printf 'host\tcontainer dp-ci-runner-1\tcpu=250.0%% mem=7.5GiB / 10GiB mem_percent=75.0%%')" \
  "$(grep -P '\tcontainer ' "$SCRATCH/run/memory.log" | cut -f2-)"
check "sampler: this host's CPU load line" same 1 \
  "$(grep -cP '^[0-9TZ:-]+\thost\tcpu load\tload1=[0-9.]+ load5=[0-9.]+ load15=[0-9.]+ cpus=[0-9]+$' "$SCRATCH/run/memory.log")"
check "sampler: one memory line per VM of the round: a and b asked (WIN_VM=<name>: each its own host), c off: not asked" same \
  "windows-vm:committed=8589934592 windows-vm-b:committed=8589934592 windows-vm-c:off (virsh): not asked" \
  "$(awk -F'\t' '$3 == "memory" { split($4, v, " "); print $2 ":" v[1] (v[1] == "off" ? " " v[2] " " v[3] " " v[4] : "") }' "$SCRATCH/run/memory.log" | paste -sd' ')"
check "sampler: ssh to VM a's and VM b's hosts, not VM c's" same "ssh ci@vm-a.invalid ssh ci@vm-b.invalid" \
  "$(grep '^ssh ' "$STUB/calls" | sort -u | paste -sd' ')"

echo "---- 6. stop ----"
touch "$STUB/ci-1" "$STUB/ci-3"; : > "$STUB/calls"
OUT=$(bash "$RUNNERS" stop 2>&1); RC=$?
check "stop: exit 0, each runner's CI container stopped in its own engine (1 and 3 had one)" same "0 r1 docker stop dp-ci|r3 docker stop dp-ci" \
  "$RC $(grep -E '^r[0-9] docker stop dp-ci$' "$STUB/calls" | paste -sd'|')"
check "stop: the four runners stopped and removed" same "1 2 3 4" \
  "$(grep -oE '^host docker stop dp-ci-runner-[0-9]' "$STUB/calls" | grep -oE '[0-9]$' | paste -sd' ')"
check "stop: no runner left, every volume kept (no volume removed)" same "0 0" \
  "$(ls "$STUB"/running-* 2>/dev/null | wc -l) $(grep -cE 'docker (volume rm|rm -f? ?-v|rm -v)' "$STUB/calls")"
check "status: four runners not running, each with its volume kept" same 4 "$(bash "$RUNNERS" status | grep -c '^RUNNER [1-4] running=no .* volume=kept ')"

echo "---- 8. full-set: the full set in N runners as one lane ----"
# the full set's spec files in the scratch repository (the lists and the merge read them), committed: the lane's commit
( cd "$REPO_ROOT" && find frend/reporting/e2e -name '*.spec.ts' -not -path '*/node_modules/*' ) |
  while read -r f; do mkdir -p "$R/$(dirname "$f")" && cp "$REPO_ROOT/$f" "$R/$f"; done
git -C "$R" add -A && git -C "$R" -c user.name=t -c user.email=t@t.invalid commit -qm specs || exit 2
SPECS_PIN=$(git -C "$R" rev-parse HEAD); git -C "$R" rev-parse --short HEAD > "$STUB/commit"
printf 'PIPELINE_START\nIMAGE_TAG=16.6.3-%s\nPIPELINE_RESULT=SUCCESS\n' "${SPECS_PIN:0:8}" > "$LOG_DIR/20261105T110000Z-build-${SPECS_PIN:0:8}.log"
touch "$STUB/full-report"; rm -f "$STUB"/ci-*
unset RELEASE_PIN E2E_RUNNER_FILES E2E_ROTATION_DATE E2E_SPEC E2E_GREP
full_set() { (cd "$R" && E2E_ROTATION_DATE=2026-11-09 bash "$RUNNERS" full-set "$@" 2>&1); }   # full_set <N>: its output
merged_of() { sed -n 's/^E2E_MERGED_LOG=//p' <<< "$1" | tail -1; }
: > "$STUB/calls"
OUT=$(full_set 2); RC=$?; M=$(merged_of "$OUT")
check "full-set 2, both green: exit 0, the merged log in LOG_DIR under the e2e name, green, with the lane's commit" bash -c '
  [ "$1" = 0 ] && [[ "$2" == "$3"/*-e2e-"$4".log ]] && grep -q "^PIPELINE_RESULT=SUCCESS" "$2" && grep -qx "E2E_COMMIT=$4" "$2" &&
  [ -f "${2%.log}-playwright.json" ]' _ "$RC" "$M" "$LOG_DIR" "$(cat "$STUB/commit")"
check "  runners/full-set-latest.log names it (the record reads that, not latest.log)" same "$M" "$(readlink "$LOG_DIR/runners/full-set-latest.log")"
check "  runners 1 and 2 started (one docker run each), none other" same "1 1 0 0" \
  "$(for n in 1 2 3 4; do docker_runs_of "$n" | grep -c .; done | paste -sd' ')"
share_ok() {  # share_ok <N> <n>: runner n's CI container got E2E_RUNNER_FILES = its pattern (full-set-runners.py)
  local want; want=$(cd "$R" && python3 -I asbl/ci/full-set-runners.py pattern "$1" "$2")
  grep "^r$2 docker run -d --rm --name dp-ci " "$STUB/calls" | grep -qF -- "-e E2E_RUNNER_FILES=$want " ||
    { echo "      runner $2: no E2E_RUNNER_FILES=$want"; return 1; }
}
check "  each runner's CI container got its own share (full-set-runners.py pattern 2 <n>)" bash -c "R='$R' STUB='$STUB'; $(declare -f share_ok); share_ok 2 1 && share_ok 2 2"
check "  and the round's rotation date, one for both" same 2 "$(grep -c '^r[12] docker run -d --rm --name dp-ci .*-e E2E_ROTATION_DATE=2026-11-09 ' "$STUB/calls")"
check "  the runners stopped at the end (none running)" same 0 "$(ls "$STUB"/running-* 2>/dev/null | wc -l)"
check "  each runner's start marked in the lane's output (the orchestrator waits on CACHES END)" same 2 \
  "$(grep -cE '^######## RUNNER [12] CACHES END rc=0' <<< "$OUT")"
touch "$STUB/red-2"; sleep 1
OUT=$(full_set 2); RC=$?; M=$(merged_of "$OUT"); rm -f "$STUB/red-2"
check "full-set 2, runner 2 red: exit 1, the lane red, runner 2 named" bash -c '
  [ "$1" = 1 ] && grep -q "^PIPELINE_RESULT=FAILED_IN_RUNNERS" "$2" && grep -q "^E2E_RUNNERS_RED 2 " "$2" &&
  [[ "$3" == *"FAILED: the full set in 2 runner(s) is red: runner(s) 2 "* ]]' _ "$RC" "$M" "$OUT"
touch "$STUB/silent"; sleep 1
OUT=$(full_set 2); RC=$?; rm -f "$STUB/silent"
M=$(readlink "$LOG_DIR/runners/full-set-latest.log")
check "full-set 2, engines that never answer: exit 1, each \"did not start\", their files NOT_RUN in the merged log" bash -c '
  [ "$1" = 1 ] && [ "$(grep -c "^FAILED: runner [12] did not start (above): its files NOT_RUN" <<< "$2")" = 2 ] &&
  [ "$(grep -c "^E2E_RUNNER [12] log=none result=NOT_RUN" "$3")" = 2 ] && grep -q "^PIPELINE_RESULT=FAILED_IN_RUNNERS" "$3"' _ "$RC" "$OUT" "$M"
check "  no runner left running" same 0 "$(ls "$STUB"/running-* 2>/dev/null | wc -l)"
sleep 1; : > "$STUB/calls"
OUT=$(full_set 1); RC=$?; M=$(merged_of "$OUT")
check "full-set 1: runner 1 alone, the whole full set (E2E_RUNNER_FILES empty), its log and report under the e2e name" bash -c '
  [ "$1" = 0 ] && [[ "$2" == "$3"/*-e2e-*.log ]] && [ -f "${2%.log}-playwright.json" ] && grep -q "^PIPELINE_RESULT=SUCCESS" "$2" &&
  grep -q "^r1 docker run -d --rm --name dp-ci .*-e E2E_RUNNER_FILES= " "$4" && ! grep -q "^host docker run -d --rm --privileged --name dp-ci-runner-[2-4] " "$4"' \
  _ "$RC" "$M" "$LOG_DIR" "$STUB/calls"
check "  runners/full-set-latest.log names it" same "$M" "$(readlink "$LOG_DIR/runners/full-set-latest.log")"
OUT=$(full_set 5); RC=$?
check "full-set 5: refused, exit 2" same "2 1" "$RC $(grep -c '^usage: .* full-set <N> (1 to 4 runners)' <<< "$OUT")"
OUT=$(cd "$R" && E2E_SPEC=reporting bash "$RUNNERS" full-set 2 2>&1); RC=$?
check "full-set with E2E_SPEC: refused, exit 2, nothing started" same "2 1" "$RC $(grep -c '^REFUSED full-set: E2E_SPEC/E2E_GREP make a targeted run' <<< "$OUT")"
touch "$STUB/running-2"
OUT=$(full_set 2); RC=$?; rm -f "$STUB/running-2"
check "full-set 2 with runner 2 there already: refused, exit 2" same "2 1" "$RC $(grep -c '^REFUSED runner 2: dp-ci-runner-2 is there already' <<< "$OUT")"

echo
[ "$FAILED_CASES" = 0 ] && { echo "ALL PASS  test-runners"; exit 0; }
echo "FAILED  $FAILED_CASES case(s)  test-runners"; exit 1

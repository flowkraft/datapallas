#!/bin/bash
# E2E_MODE on the three server lanes of asbl/ci/dp-ci.sh (docker-server on Linux, win docker-e2e, win server-e2e). The cases:
#   1. E2E_MODE: dev when unset, dev and production-packaged accepted, anything else refused (rc 2); the Linux lane
#      refuses production-packaged on web and electron (they test the dev tree);
#   2. docker-server (docker_server_up, on a kept build): production-packaged keeps an untouched copy of the unzipped
#      bundle in <folder>-pristine before `docker compose up`, and exports it as E2E_PRISTINE_INSTALL_DIR; dev makes no copy;
#      production-packaged prepares no verified-db-noexe package (prepare_package); the launcher hands E2E_MODE to the
#      CI container;
#   3. win docker-e2e and win server-e2e: production-packaged prepares no verified-db-noexe package, copies the extracted
#      installation to <folder>-pristine (robocopy) before the server starts, and hands the tests E2E_PRISTINE_INSTALL_DIR;
#      dev prepares the package as before and makes no copy;
#   4. win_web_e2e passes E2E_MODE to the tests on the VM (dev when unset) with the lane's extra variables.
# Each lane function is taken from dp-ci.sh as it is and runs against stubs (ssh, docker, the VM's PowerShell, the steps
# around it) that record their calls: nothing is started, no VM or Docker engine is touched. Takes about two seconds.
# Callers: a person or an agent, from the shell, after changing E2E_MODE or a server lane.
#   bash asbl/ci/tests/test-packaged-lanes.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
DP_CI=asbl/ci/dp-ci.sh
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-packaged-lanes.XXXXXX") || exit 2
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
before() {  # before <file> <text> <later text>: the first line with <text> comes before the first with <later text>
  local a b; a=$(grep -n -m1 -F -- "$2" "$1" | cut -d: -f1); b=$(grep -n -m1 -F -- "$3" "$1" | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || { echo "      \"$2\" at line ${a:-none}, \"$3\" at line ${b:-none}"; return 1; }
}
lacks() {  # lacks <file> <text>: no line holds <text>
  ! grep -qF -- "$2" "$1" || { echo "      found: $(grep -F -- "$2" "$1" | head -1)"; return 1; }
}
# function_from_dp_ci <name> [indent]: the function's definition in dp-ci.sh, up to the first closing brace at its indent
# at which the text parses (a PowerShell here-document inside it may hold a brace at the same indent)
function_from_dp_ci() {
  local indent="${2:-}" start end
  start=$(grep -n -m1 "^$indent$1() {" "$DP_CI" | cut -d: -f1)
  [ -n "$start" ] || { echo "echo 'no function $1 in $DP_CI'; false"; return 1; }
  for end in $(awk -v s="$start" -v closing="$indent}" 'NR > s && $0 == closing {print NR}' "$DP_CI"); do
    sed -n "${start},${end}p" "$DP_CI" | bash -n 2>/dev/null && { sed -n "${start},${end}p" "$DP_CI"; return 0; }
  done
  return 1
}
top_level_function() { function_from_dp_ci "$1"; }
linux_task_function() { function_from_dp_ci "$1" "  "; }
unset E2E_MODE E2E_PRISTINE_INSTALL_DIR E2E_KEPT_BUILD RELEASE_KEPT REBUILD_PACK E2E_DOCKER_FROM_URL E2E_SPEC E2E_GREP \
  E2E_RETRIES E2E_REUSE_BUILD WIN_RUN_TIMEOUT WIN_RUN_STALL WIN_RUN_WATCH

# ---- 1. E2E_MODE checked ----
eval "$(top_level_function e2e_mode_checked)"
check "E2E_MODE unset = dev" same dev "$(unset E2E_MODE; e2e_mode_checked)"
check "E2E_MODE=dev and production-packaged accepted" same "dev production-packaged" \
  "$(E2E_MODE=dev e2e_mode_checked) $(E2E_MODE=production-packaged e2e_mode_checked)"
OUT=$(E2E_MODE=packaged e2e_mode_checked 2>&1); RC=$?
check "E2E_MODE=packaged refused, rc 2, naming the two values" same "2 1" \
  "$RC $(printf '%s\n' "$OUT" | grep -c "E2E_MODE must be dev or production-packaged (got 'packaged')")"
eval "$(linux_task_function e2e_web)"
for target in web electron; do
  OUT=$(E2E_TARGET=$target E2E_MODE=production-packaged e2e_web 2>&1); RC=$?
  check "the Linux lane refuses production-packaged on E2E_TARGET=$target, rc 2" same "2 1" \
    "$RC $(printf '%s\n' "$OUT" | grep -c 'needs E2E_TARGET=docker-server')"
done

# ---- 2. docker-server: docker_server_up on a kept build ----
eval "$(top_level_function pristine_install_copy)"
eval "$(linux_task_function docker_server_up)"
CALLS="$SCRATCH/calls"
KEPT="$SCRATCH/kept"; mkdir -p "$KEPT" "$SCRATCH/zip/DataPallas/config/_internal"
echo "services: {}" > "$SCRATCH/zip/DataPallas/docker-compose.yml"
echo "<settings><runtime>docker</runtime></settings>" > "$SCRATCH/zip/DataPallas/config/_internal/settings.xml"
(cd "$SCRATCH/zip" && python3 -c 'import shutil; shutil.make_archive("../kept/datapallas-server-docker", "zip", ".")')
REPO="$SCRATCH/repo"; mkdir -p "$REPO"; LOG="$SCRATCH/docker-server.log"; SHA=abc1234; LOG_DIR="$SCRATCH/logs"
SERVER_IMAGE_REPO=flowkraft/datapallas-server DOCKER_SERVER_URL=http://localhost:9090
kept_build_tag() { echo "16.6.4-abc1234"; }
app_images_refresh() { :; }
curl() { :; }
docker() {
  echo "docker $*" >> "$CALLS"
  case "$*" in
    "image inspect "*|"inspect datapallas-server "*) echo sha256:kept-image ;;
    "compose config --images") printf '%s\n' flowkraft/datapallas-server:16.6.4 ;;
    "compose up "*) [ -d "$REPO/frend/reporting/testground/docker-server-pristine/DataPallas" ] &&
                    echo "pristine copy there at compose up" >> "$CALLS" ;;
  esac
  return 0
}
docker_server_lane() {  # docker_server_lane <E2E_MODE>: docker_server_up as the lane runs it; prints E2E_PRISTINE_INSTALL_DIR
  : > "$CALLS"; rm -rf "$REPO/frend"; unset E2E_PRISTINE_INSTALL_DIR
  DOCKER_SERVER_DIR=""
  E2E_MODE="$1" E2E_KEPT_BUILD="$KEPT" docker_server_up > "$SCRATCH/docker-server-up.out" 2>&1 || return 1
  echo "${E2E_PRISTINE_INSTALL_DIR:-none}"
}
PRISTINE=$(docker_server_lane production-packaged)
check "docker-server production-packaged: E2E_PRISTINE_INSTALL_DIR = the bundle's folder -pristine" \
  same "$REPO/frend/reporting/testground/docker-server-pristine/DataPallas" "$PRISTINE"
check "docker-server production-packaged: the copy is made before docker compose up" \
  grep -qx "pristine copy there at compose up" "$CALLS"
check "docker-server production-packaged: the copy is the zip as unzipped" \
  diff -r "$SCRATCH/zip/DataPallas" "$PRISTINE"
check "docker-server dev: no copy, no E2E_PRISTINE_INSTALL_DIR" same "none no" \
  "$(docker_server_lane dev) $([ -e "$REPO/frend/reporting/testground/docker-server-pristine" ] && echo yes || echo no)"
eval "$(linux_task_function prepare_package)"
PKG_STAMP="$SCRATCH/no-stamp"
OUT=$(cd "$SCRATCH" && E2E_MODE=production-packaged prepare_package 2>&1); RC=$?
check "Linux production-packaged: prepare_package builds no package, rc 0" same "0 1" \
  "$RC $(printf '%s\n' "$OUT" | grep -c '^package: none needed (E2E_MODE=production-packaged')"
check "the launcher hands E2E_MODE to the CI container" grep -qF -- '-e E2E_MODE="${E2E_MODE:-}"' "$DP_CI"

# ---- 3. the two Windows server lanes ----
unset -f docker curl
for f in win_pristine_install_copy win_docker_e2e win_server_e2e; do eval "$(top_level_function $f)"; done
WIN_REPO='C:\ci\repo'; WIN_RUNS='C:\dp-ci\runs'
record() { echo "$*" >> "$CALLS"; }
win_ps() { echo "win_ps: $(tr '\n' ' ')" >> "$CALLS"; }
win_ssh() {
  case "$*" in
    *"rev-parse"*) echo abc1234 ;;
    "docker image inspect "*|"docker inspect datapallas-server "*) echo sha256:vm-image ;;
  esac
}
docker() { echo sha256:kept-image; }
image_file_id() { echo sha256:kept-image; }
light_set_filters() { LIGHT_SET_SPEC=light-spec LIGHT_SET_GREP=light-grep; }
for f in prereq mark_start mark_next win_sync_repo win_stacks_down win_temp_clean win_app_images_drop win_docker_config \
         win_wait_9090 win_docker_down win_server_down win_web_result win_put_dist win_run_start win_pull; do
  eval "$f() { :; }"
done
win_prepare_package() { record "win_prepare_package"; }
win_bundle_extract() { record "win_bundle_extract $*"; }
win_web_e2e() { record "win_web_e2e E2E_MODE=${E2E_MODE:-unset} $*"; WIN_WEB_OUT="$SCRATCH/web.log"; }
printf 'commit=abc1234\nwindows.file=datapallas-server.zip size=1 sha256=%064d\n' 0 > "$KEPT/MANIFEST.txt"
echo image > "$KEPT/datapallas-server-image.tar"
windows_lane() {  # windows_lane <docker-e2e|server-e2e> <E2E_MODE>: the lane with the tests stubbed; its calls in $CALLS
  : > "$CALLS"
  case "$1" in
    docker-e2e) E2E_MODE="$2" E2E_KEPT_BUILD="$KEPT" win_docker_e2e ;;
    server-e2e) E2E_MODE="$2" RELEASE_KEPT="$KEPT" win_server_e2e ;;
  esac > "$SCRATCH/$1.out" 2>&1
}
for lane in docker-e2e server-e2e; do
  case $lane in docker-e2e) folder=docker-server start="docker compose up" ;; server-e2e) folder=server start="" ;; esac
  root="C:\\ci\\repo\\frend\\reporting\\testground\\$folder"
  windows_lane $lane production-packaged
  check "win $lane production-packaged: no verified-db-noexe package prepared" lacks "$CALLS" win_prepare_package
  check "win $lane production-packaged: the extracted installation copied to $folder-pristine (robocopy)" \
    grep -qF "robocopy.exe '$root\\DataPallas' \"\$copyRoot\\DataPallas\"" "$CALLS"
  check "win $lane production-packaged: the copy after the unzip" before "$CALLS" "win_bundle_extract" "robocopy.exe"
  [ -z "$start" ] || check "win $lane production-packaged: the copy before $start" before "$CALLS" "robocopy.exe" "$start"
  check "win $lane production-packaged: the tests get E2E_MODE and E2E_PRISTINE_INSTALL_DIR" \
    grep -qF "E2E_MODE=production-packaged" <(grep "^win_web_e2e " "$CALLS" | grep -F "E2E_PRISTINE_INSTALL_DIR=$root-pristine\\DataPallas")
  windows_lane $lane dev
  check "win $lane dev: the package prepared as before, no copy, no E2E_PRISTINE_INSTALL_DIR" same "1 0 0" \
    "$(grep -c '^win_prepare_package' "$CALLS") $(grep -c robocopy "$CALLS") $(grep -c E2E_PRISTINE_INSTALL_DIR "$CALLS")"
done

# ---- 4. win_web_e2e: E2E_MODE in the tests' environment on the VM ----
eval "$(top_level_function win_web_e2e)"
win_run() { printf '%s\n' "$WIN_RUN_ENV" > "$SCRATCH/win-run-env"; }
WIN_E2E_LOG="$SCRATCH/win-web.log"
mkdir -p "$REPO/frend/reporting" && echo '"x": "TEST_LICENSE_KEY=0123abcd"' > "$REPO/frend/reporting/package.json"
web_env() {  # web_env <E2E_MODE or empty> [NAME=VALUE...]: the WIN_RUN_ENV win_web_e2e hands the step
  local mode="$1"; shift
  if [ -n "$mode" ]; then E2E_MODE="$mode" win_web_e2e windows-vm-server s 'C:\inst' targeted sp gr 0 "$@"
  else (unset E2E_MODE; win_web_e2e windows-vm-server s 'C:\inst' targeted sp gr 0 "$@"); fi > /dev/null 2>&1
  cat "$SCRATCH/win-run-env"
}
check "win_web_e2e: E2E_MODE=production-packaged and the lane's E2E_PRISTINE_INSTALL_DIR reach the step" same "1 1" \
  "$(web_env production-packaged 'E2E_PRISTINE_INSTALL_DIR=C:\p\DataPallas' | grep -cx 'E2E_MODE=production-packaged') $(web_env production-packaged 'E2E_PRISTINE_INSTALL_DIR=C:\p\DataPallas' | grep -cxF 'E2E_PRISTINE_INSTALL_DIR=C:\p\DataPallas')"
check "win_web_e2e: E2E_MODE unset = dev on the VM" same 1 "$(web_env '' | grep -cx 'E2E_MODE=dev')"

echo
if [ "$FAILED_CASES" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$FAILED_CASES FAILED"; exit 1; fi

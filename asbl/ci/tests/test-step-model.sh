#!/bin/bash
# The release's step model: what each step runs and what each upload needs (asbl/ci/release-state.sh, release-publish.sh,
# jenkins/release-orchestrator.sh). Step 1 is the full e2e on this host only: this release's full set (web or
# docker-server, release-state.sh full-lane) and the sign-in file on docker-server; no light set, nothing on the VM.
# The cases:
#   1. the step 1 check (release-state.sh step1-guard, and `require step1`, which every upload makes): green with only
#      the full lane and the auth lane PASS; refused when either is missing or red; no Windows lane asked for;
#   2. release-publish.sh upload-kept (DRY_RUN=yes) refuses each channel without those two lanes, and passes that check
#      with both;
#   3. an orchestrator dry run: step 1 is lanes 1 and 2 on this host, and no VM part in step 1.
# Every folder is a scratch one. upload-kept runs in a sandbox: a sparse clone of this commit (asbl/ci as it is in this
# checkout, uncommitted changes included) whose origin is a local bare repository, so its fetch never leaves this host;
# docker, curl and ssh are stubs first on PATH that record each call (curl answers 404: nothing released yet). Nothing is
# built, uploaded, pushed or started. Takes about 40 seconds.
# Callers: a person or an agent, from the shell, after changing the step model.
#   bash asbl/ci/tests/test-step-model.sh
# Prints PASS or FAIL per case; exit 0 when every case passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-step-model.XXXXXX") || exit 2
trap 'rm -rf "$SCRATCH"' EXIT
FAILED_CASES=0
check() {  # check <what> <command...>: PASS when the command succeeds
  local what="$1"; shift
  if "$@"; then echo "PASS  $what"; else echo "FAIL  $what"; FAILED_CASES=$((FAILED_CASES + 1)); fi
}
has() {  # has <text> <text to search>: found, or what was searched is printed
  case "$2" in *"$1"*) return 0 ;; esac
  printf '      no "%s" in:\n%s\n' "$1" "$(printf '%s\n' "$2" | sed 's/^/        /' | tail -12)"; return 1
}
lacks() {  # lacks <text> <text to search>: not found
  case "$2" in *"$1"*) printf '      "%s" found in:\n%s\n' "$1" "$(printf '%s\n' "$2" | grep -F -- "$1" | sed 's/^/        /' | head -5)"; return 1 ;; esac
}

# ---- the stubs ----
STUBS="$SCRATCH/stubs"; mkdir -p "$STUBS"
export STUB_CALLS="$SCRATCH/calls.log"; : > "$STUB_CALLS"
cat > "$STUBS/docker" <<'STUB'
#!/bin/bash
# stub docker: records the call; an image's id is the kept one; nothing else exists
echo "docker $*" >> "$STUB_CALLS"
case "$1 ${2:-}" in
  "image inspect") echo "sha256:the-kept-image" ;;
  *) exit 1 ;;
esac
STUB
cat > "$STUBS/curl" <<'STUB'
#!/bin/bash
# stub curl: records the call; every address answers 404 (Docker Hub: no such tag; the download site: no version file yet)
echo "curl $*" >> "$STUB_CALLS"
while [ "$#" -gt 0 ]; do case "$1" in -o) : > "$2"; shift 2 ;; *) shift ;; esac; done
printf 404
STUB
cat > "$STUBS/ssh" <<'STUB'
#!/bin/bash
# stub ssh: records the call; the VM never answers
echo "ssh $*" | cut -c1-300 >> "$STUB_CALLS"
echo "ssh: connect to host vm.invalid port 22: Connection timed out" >&2; exit 255
STUB
chmod +x "$STUBS/docker" "$STUBS/curl" "$STUBS/ssh"
export PATH="$STUBS:$PATH"
# made-up settings: no settings file of this host is read (the Windows VM's, the publish credentials)
export WIN_CI_CONF="$SCRATCH/no-win-ci.env" WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts"
export RELEASE_PUBLISH_ENV="$SCRATCH/no-release-publish.env"
unset E2E_APPROVAL E2E_APPROVAL_USER RELEASE_PIN

C=$(git rev-parse HEAD)
STATE="bash $REPO_ROOT/asbl/ci/release-state.sh"
# fresh_record <name>: an empty scratch release record, this release's full lane chosen in it (FULL is that lane)
fresh_record() {
  export RELEASE_STATE_DIR="$SCRATCH/state-$1"
  mkdir -p "$RELEASE_STATE_DIR"
  FULL=$(RELEASE_COMMIT="$C" $STATE full-lane --choose 2>&1 | sed -n 's/^FULL_LANE=\([a-z-]*\) .*/\1/p' | head -1)
}
lane_passes() { RELEASE_COMMIT="$C" $STATE record "step1.$1" PASS >/dev/null; }  # lane_passes <lane>
lane_fails()  { RELEASE_COMMIT="$C" $STATE record "step1.$1" FAIL >/dev/null; }
guard()   { RELEASE_COMMIT="$C" DRY_RUN=yes $STATE step1-guard 2>&1; }
require() { RELEASE_COMMIT="$C" DRY_RUN=yes $STATE require step1 2>&1; }

echo "---- 1. the step 1 check ----"
fresh_record none
check "a full lane is chosen for this release (web or docker-server)" has "$FULL" "web docker-server"
out=$(guard); rc=$?
check "no lane recorded: refused (exit 1), naming the full lane and the auth lane missing" \
  bash -c '[ "$0" = 1 ] && [[ "$1" == *"REFUSED: step 1 is not green"*"$2-full missing, docker-server-auth missing. "* ]]' "$rc" "$out" "$FULL"
check "  and no Windows lane asked for" lacks "windows-vm" "$out"
fresh_record full-only; lane_passes "$FULL-full"
out=$(guard); rc=$?
check "the full lane only: refused, the auth lane missing" bash -c '[ "$0" = 1 ] && [[ "$1" == *"not green on ${2:0:8}: docker-server-auth missing. "* ]]' "$rc" "$out" "$C"
fresh_record auth-only; lane_passes docker-server-auth
out=$(guard); rc=$?
check "the auth lane only: refused, the full lane missing" bash -c '[ "$0" = 1 ] && [[ "$1" == *"not green on ${2:0:8}: $3-full missing. "* ]]' "$rc" "$out" "$C" "$FULL"
fresh_record full-red; lane_fails "$FULL-full"; lane_passes docker-server-auth
out=$(guard); rc=$?
check "the full lane red: refused, saying red" bash -c '[ "$0" = 1 ] && [[ "$1" == *"$2-full red"* ]]' "$rc" "$out" "$FULL"
fresh_record both; lane_passes "$FULL-full"; lane_passes docker-server-auth
out=$(guard); rc=$?
check "both lanes PASS, nothing else: green (exit 0), naming those two" \
  bash -c '[ "$0" = 0 ] && [[ "$1" == *"ok: step 1 is green on ${2:0:8} ($3-full docker-server-auth)"* ]]' "$rc" "$out" "$C" "$FULL"
out=$(require); rc=$?
check "  require step1, every upload's check: green too" bash -c '[ "$0" = 0 ]' "$rc"
check "  no Windows lane asked for by either" lacks "windows-vm" "$(guard; require)"
out=$(STEP1_PROVEN_LATER=anything guard); rc=$?
check "STEP1_PROVEN_LATER is read no more" bash -c '[ "$0" = 0 ] && [[ "$1" != *"proven later"* ]]' "$rc" "$out"

echo "---- 2. upload-kept refuses each channel without those two lanes ----"
# the sandbox: this commit's asbl/ci and version files, origin a local bare repository on the same commit
SANDBOX="$SCRATCH/sandbox"
git init -q --bare "$SCRATCH/origin.git"
echo "$(cd "$(git rev-parse --git-common-dir)" && pwd)/objects" > "$SCRATCH/origin.git/objects/info/alternates"
git -C "$SCRATCH/origin.git" update-ref refs/heads/main "$C"
git clone -q --shared --no-checkout "$SCRATCH/origin.git" "$SANDBOX"
git -C "$SANDBOX" sparse-checkout set --no-cone /asbl/ci/ /pom.xml /bkend/server/pom.xml /frend/reporting/package.json \
  /frend/reporting/package-lock.json /frend/reporting/app/package.json /frend/reporting/app/package-lock.json \
  /bkend/reporting/src/main/external-resources/template/config/burst/settings.xml
git -C "$SANDBOX" checkout -q main
cp -a asbl/ci/. "$SANDBOX/asbl/ci/"
V=$(grep -m1 -oP '(?<=<version>)[^<]+' "$SANDBOX/bkend/reporting/src/main/external-resources/template/config/burst/settings.xml")
# the kept folder of a green day-before run of this commit: its files, its image, its manifest
export RELEASE_ARTIFACTS_DIR="$SCRATCH/artifacts"
KEPT="$RELEASE_ARTIFACTS_DIR/$V-${C:0:8}"; mkdir -p "$KEPT"
sha() { sha256sum "$1" | cut -d' ' -f1; }
for name in datapallas-server-docker.zip datapallas.zip datapallas-server.zip datapallas-src.zip; do echo "the kept $name" > "$KEPT/$name"; done
{ echo "version=$V"; echo "commit=$C"; echo "docker.result=PASS"
  echo "docker.file=datapallas-server-docker.zip size=$(stat -c %s "$KEPT/datapallas-server-docker.zip") sha256=$(sha "$KEPT/datapallas-server-docker.zip")"
  echo "docker.image=flowkraft/datapallas-server:$V id=sha256:the-kept-image built_as=flowkraft/datapallas-server:$V-${C:0:7}"
  echo "windows.result=PASS"
  for name in datapallas.zip datapallas-server.zip datapallas-src.zip; do
    echo "windows.file=$name size=$(stat -c %s "$KEPT/$name") sha256=$(sha "$KEPT/$name")"
  done; } > "$KEPT/MANIFEST.txt"
# rehearsed <name>: a scratch release record with both channels' passed rehearsals of those files
rehearsed() {
  export RELEASE_STATE_DIR="$SCRATCH/upload-state-$1"; mkdir -p "$RELEASE_STATE_DIR"
  ( cd "$SANDBOX" &&
    RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh full-lane --choose >/dev/null 2>&1
    RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record rehearsal.docker PASS "version=$V" "zip_sha256=$(sha "$KEPT/datapallas-server-docker.zip")" >/dev/null
    RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record rehearsal.windows PASS "version=$V" \
      "sha256=datapallas.zip:$(sha "$KEPT/datapallas.zip") datapallas-server.zip:$(sha "$KEPT/datapallas-server.zip") datapallas-src.zip:$(sha "$KEPT/datapallas-src.zip")" >/dev/null )
  FULL=$(sed -n 's/^lane=//p' "$RELEASE_STATE_DIR/full-e2e/$V")
}
sandbox_lane_passes() { ( cd "$SANDBOX" && RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record "step1.$1" PASS >/dev/null ); }
upload_kept() { ( cd "$SANDBOX" && DRY_RUN=yes UPLOAD=no bash asbl/ci/release-publish.sh upload-kept "$1" 2>&1 ); }  # upload_kept <channel>
refused_at_step1() { [[ "$1" == *"REFUSED  step 1 is not green on ${C:0:8}"* ]] && [[ "$1" == *"UPLOAD_KEPT REFUSED: nothing pushed, uploaded or recorded"* ]]; }

rehearsed none
for ch in docker windows; do
  out=$(upload_kept "$ch")
  check "no step 1 lane: upload-kept $ch refused at the step 1 check (every check before it passed)" \
    bash -c "$(declare -f refused_at_step1); C=$C; refused_at_step1 \"\$0\" && [[ \"\$0\" == *\"ok: the kept $ch files are the ones rehearsal.$ch proved\"* ]]" "$out"
done
rehearsed full-only; sandbox_lane_passes "$FULL-full"
for ch in docker windows; do
  out=$(upload_kept "$ch")
  check "the full lane only: upload-kept $ch refused, the auth lane missing" \
    bash -c "$(declare -f refused_at_step1); C=$C; refused_at_step1 \"\$0\" && [[ \"\$0\" == *\"step1.docker-server-auth\"* ]]" "$out"
done
rehearsed auth-only; sandbox_lane_passes docker-server-auth
for ch in docker windows; do
  out=$(upload_kept "$ch")
  check "the auth lane only: upload-kept $ch refused, the full lane missing" \
    bash -c "$(declare -f refused_at_step1); C=$C; refused_at_step1 \"\$0\" && [[ \"\$0\" == *\"step1.$FULL-full\"* ]]" "$out"
done
rehearsed both; sandbox_lane_passes "$FULL-full"; sandbox_lane_passes docker-server-auth
for ch in docker windows; do
  out=$(upload_kept "$ch")
  check "both lanes: upload-kept $ch passes the step 1 check" \
    bash -c "$(declare -f refused_at_step1); C=$C; ! refused_at_step1 \"\$0\" && [[ \"\$0\" == *\"RELEASE_STATE require OK\"* ]]" "$out"
done
check "upload-kept: nothing pushed, uploaded or loaded" lacks "docker push" "$(cat "$STUB_CALLS")"

echo "---- 3. an orchestrator dry run: step 1 on this host only ----"
D="$SCRATCH/orchestrator"; mkdir -p "$D/logs" "$D/state" "$D/artifacts"
env LOG_DIR="$D/logs" RUN_RECORD_DIR="$D/runs" RELEASE_STATE_DIR="$D/state" RELEASE_ARTIFACTS_DIR="$D/artifacts" \
  ORCH_STARTED_BY=test-step-model DRY_RUN=yes bash asbl/ci/jenkins/release-orchestrator.sh > "$D/console.log" 2>&1
RUN=$(ls -1d "$D"/runs/*release-orchestrator*/ 2>/dev/null | tail -1)
console=$(cat "$D/console.log")
FULL=$(awk -F'\t' '$1 == "part" && $2 ~ /^lane1-/ { print substr($2, 7) }' "$RUN/result.txt")
check "step 1 runs lanes 2 and 1, in that order, on this host" \
  has "ORDER   step 1     host: step1-build (when a lane takes the build), lane2-docker-server-auth, lane1-$FULL, done" "$console"
check "  and nothing on the VM" has "VM: nothing (step 1 runs on this host only)" "$console"
check "  step 1's parts in result.txt: the build and lanes 2 and 1, each on the host" \
  bash -c '[ "$(awk -F"\t" "\$1 == \"part\" && \$2 ~ /^(step1-build|lane)/ { printf \"%s%s:%s\", s, \$2, \$3; s=\" \" }" "$0/result.txt")" = "step1-build:host lane2-docker-server-auth:host lane1-$1:host" ]' "$RUN" "$FULL"
check "  no step 1 part starts anything on the VM (started.txt)" \
  bash -c '! awk -F"\t" "\$2 ~ /^(step1-build|lane)/" "$0/started.txt" | grep -qE "windows|vm"' "$RUN"
check "  the step 1 guard green once both lanes pass (a dry run)" has "dry run: step 1 green on" "$console"

if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS  test-step-model"; exit 0; fi
echo "FAILED  $FAILED_CASES case(s)  test-step-model"; exit 1

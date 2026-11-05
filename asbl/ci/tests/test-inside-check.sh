#!/bin/bash
# The files checked from inside (asbl/ci/release-keep.sh inside, which release-publish.sh's stage-files and stage-docker run
# before any upload). A kept file's sha256 says it is the file a run proved; this check says that run packed this version
# of this commit. The cases:
#   1. the kept 16.6.2 folder (16.6.2-39198f4d) passes for both channels;
#   2. a scratch folder linking the kept 16.6.1 files (16.6.1-d3ffd94b), its manifest saying 16.6.2 on 39198f4d: refused,
#      naming the CHANGELOG heading, the jar, the source zip and the files list (windows), the compose pin and the image
#      label (docker);
#   3. small kept files made from this checkout's commit as a release packs it (its CHANGELOG headed by its version: a
#      scratch commit on it when the CHANGELOG is ahead, between a CHANGELOG commit and step 0), by
#      fixtures/make-kept-files.py, pass; one with an extra
#      rb-common-16.6.1.jar, one with a source file changed, one with a db-template copy changed and one whose compose pins
#      another version are each refused, naming the file;
#   4. the stages with UPLOAD=no, in sandboxes (sparse clones of this commit, asbl/ci as it is in this checkout, uncommitted
#      changes included; docker, curl, ssh and virsh are stubs): step 3's stage-files and step 2's stage-docker (its build
#      a stub dp-ci.sh build-if-needed) print the check before their upload lines, and with a refused folder fail with the
#      reason and print no upload line; upload-kept with DRY_RUN=yes shows each channel's check before that channel's
#      upload lines.
# Cases 1 and 2 read the kept folders where release-keep.sh keeps them (KEPT_RELEASES_DIR another), read-only; every other
# folder is a scratch one. The stub docker has no image label, so the labels are read from the kept image files. Nothing is
# built, pushed, uploaded or started. Takes about 2 minutes.
# Callers: a person or an agent, from the shell, after changing the check or the stages.
#   bash asbl/ci/tests/test-inside-check.sh
# Prints PASS or FAIL per check; exit 0 when every check passes, 1 otherwise.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
REPO_ROOT=$PWD
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/test-inside-check.XXXXXX") || exit 2
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
before() {  # before <first text> <later text> <output>: both there, the first on an earlier line
  local a b
  a=$(printf '%s\n' "$3" | grep -n -F -m1 -- "$1" | cut -d: -f1); b=$(printf '%s\n' "$3" | grep -n -F -m1 -- "$2" | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] && return 0
  printf '      "%s" (line %s) not before "%s" (line %s) in:\n%s\n' "$1" "${a:-none}" "$2" "${b:-none}" \
    "$(printf '%s\n' "$3" | sed 's/^/        /' | tail -15)"; return 1
}
sha() { sha256sum "$1" | cut -d' ' -f1; }

# ---- the stubs ----
STUBS="$SCRATCH/stubs"; mkdir -p "$STUBS"
export STUB_CALLS="$SCRATCH/calls.log"; : > "$STUB_CALLS"
cat > "$STUBS/docker" <<'STUB'
#!/bin/bash
# stub docker: records the call; an image asked for by name or id is STUB_IMAGE_ID (none when unset), with no label
echo "docker $*" >> "$STUB_CALLS"
case "$1 ${2:-}" in
  "image inspect") case "$*" in *Labels*) exit 1 ;; esac; [ -n "${STUB_IMAGE_ID:-}" ] || exit 1; echo "$STUB_IMAGE_ID" ;;
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
cat > "$STUBS/virsh" <<'STUB'
#!/bin/bash
# stub virsh: every VM is running, 12 GB defined
case "${1:-}" in
  domstate) echo running ;;
  dumpxml)  printf "<domain>\n  <memory unit='KiB'>12582912</memory>\n  <currentMemory unit='KiB'>12582912</currentMemory>\n</domain>\n" ;;
  *)        exit 1 ;;
esac
STUB
chmod +x "$STUBS/docker" "$STUBS/curl" "$STUBS/ssh" "$STUBS/virsh"
export PATH="$STUBS:$PATH"
# made-up settings: no settings file of this host is read (the Windows VM's, the publish credentials)
export WIN_CI_CONF="$SCRATCH/no-win-ci.env" WIN_HOST=vm.invalid WIN_USER=ci WIN_SSH_KEY="$SCRATCH/no-key" WIN_KNOWN_HOSTS="$SCRATCH/no-known-hosts"
export RELEASE_PUBLISH_ENV="$SCRATCH/no-release-publish.env" RELEASE_REHEARSAL_CONF="$SCRATCH/no-release-rehearsal.conf"
export RELEASE_STATE_DIR="$SCRATCH/state" RELEASE_ARTIFACTS_DIR="$SCRATCH/artifacts"
unset E2E_APPROVAL E2E_APPROVAL_USER RELEASE_PIN RELEASE_KEPT_DIR STUB_IMAGE_ID
KEPT_RELEASES_DIR="${KEPT_RELEASES_DIR:-/var/kraft-internalsystems/logs/datapallas-ci/release-artifacts}"
inside() { bash asbl/ci/release-keep.sh inside "$1" "$2" 2>&1; }   # inside <folder> <channel>: this checkout's check

echo "---- 1. the kept 16.6.2 folder passes ----"
K162="$KEPT_RELEASES_DIR/16.6.2-39198f4d"
for ch in windows docker; do
  out=$(inside "$K162" "$ch"); rc=$?
  check "16.6.2-39198f4d, $ch: INSIDE PASS (exit 0)" bash -c '[ "$0" = 0 ] && [[ "$1" == *"INSIDE PASS the $2 files of 16.6.2 on 39198f4d"* ]]' "$rc" "$out" "$ch" ||
    printf '%s\n' "$out" | sed 's/^/        /'
done

echo "---- 2. the kept 16.6.1 files, under a manifest that says 16.6.2 on 39198f4d ----"
K161="$KEPT_RELEASES_DIR/16.6.1-d3ffd94b"; LINKED="$SCRATCH/linked-16.6.1"; mkdir -p "$LINKED"
for name in datapallas.zip datapallas-server.zip datapallas-src.zip datapallas-server-docker.zip datapallas-server-image.tar \
            release-files-windows.txt; do ln -s "$K161/$name" "$LINKED/$name"; done
sed -e 's/^version=.*/version=16.6.2/' -e 's/^commit=.*/commit=39198f4d52a43c377dbf64ef837b903c57e77dd2/' "$K161/MANIFEST.txt" > "$LINKED/MANIFEST.txt"
out=$(inside "$LINKED" windows); rc=$?
check "windows: refused (exit 1)" exit_is "$rc" 1
check "  naming the CHANGELOG heading" has "CHANGELOG.md's first heading is \"## 16.6.1 - " "$out"
check "  naming the jar" has "the product jar DataPallas/lib/burst/rb-common-16.6.1.jar is not of 16.6.2" "$out"
check "  naming the source zip" has "MISMATCH  datapallas-src.zip: " "$out"
check "  naming the files list" has "release-files-windows.txt: names commit d3ffd94b and version 16.6.1, not 39198f4d and 16.6.2" "$out"
out=$(inside "$LINKED" docker); rc=$?
check "docker: refused (exit 1)" exit_is "$rc" 1
check "  naming the compose pin" has "its compose pins flowkraft/datapallas-server:16.6.1, not flowkraft/datapallas-server:16.6.2" "$out"
check "  naming the image label" has "its label version is 16.6.1 (from datapallas-server-image.tar), not 16.6.2" "$out"

echo "---- 3. small kept files made from this commit ----"
V=$(git show HEAD:bkend/reporting/src/main/external-resources/template/config/burst/settings.xml | grep -m1 -oP '(?<=<version>)[^<]+')
FIXTURE="python3 -I $REPO_ROOT/asbl/ci/tests/fixtures/make-kept-files.py"
# this commit as a release packs it: its CHANGELOG headed by its version, as the commit of step 0 has it; between a
# CHANGELOG commit and step 0 the checkout's is not, so then a scratch commit on it (fixtures/make-kept-files.py), in a
# scratch object folder that every git command below reads
export GIT_ALTERNATE_OBJECT_DIRECTORIES="$SCRATCH/objects"; mkdir -p "$GIT_ALTERNATE_OBJECT_DIRECTORIES"
C=$($FIXTURE --release-commit "$REPO_ROOT" HEAD "$V" "$GIT_ALTERNATE_OBJECT_DIRECTORIES") ||
  { echo "FAIL  fixtures/make-kept-files.py --release-commit"; exit 1; }
KEPT="$RELEASE_ARTIFACTS_DIR/$V-${C:0:8}"   # where release-keep.sh keeps this version and commit
IMAGE_ID=$($FIXTURE "$KEPT" "$REPO_ROOT" "$C" "$V") || { echo "FAIL  the fixture could not make the kept files"; exit 1; }
for ch in windows docker; do
  out=$(inside "$KEPT" "$ch"); rc=$?
  check "the made files, $ch: INSIDE PASS (exit 0)" bash -c '[ "$0" = 0 ] && [[ "$1" == *"INSIDE PASS"* ]]' "$rc" "$out" ||
    printf '%s\n' "$out" | sed 's/^/        /'
done
check "  a copy that differs by line endings only is equal" has "(1 by line endings only;" "$(inside "$KEPT" windows)"
# broken <name> <channel> <break> <text naming it>: a set with one thing wrong, refused naming it
broken() {
  local dir="$SCRATCH/broken-$1" out rc
  MAKE_KEPT_SRC_ZIP=$([ "${3%%=*}" = source ] || echo "$KEPT/datapallas-src.zip") $FIXTURE "$dir" "$REPO_ROOT" "$C" "$V" --break "$3" >/dev/null ||
    { check "$1: the fixture" false; return; }
  out=$(inside "$dir" "$2"); rc=$?
  check "$1 ($2): refused (exit 1), naming it" bash -c '[ "$0" = 1 ] && [[ "$1" == *"$2"* ]]' "$rc" "$out" "$4" ||
    printf '%s\n' "$out" | grep -v '^OK ' | sed 's/^/        /'
}
broken extra-jar windows jar=rb-common-16.6.1.jar "MISMATCH  datapallas.zip: the product jar DataPallas/lib/burst/rb-common-16.6.1.jar is not of $V"
broken source-changed windows source=pom.xml "MISMATCH  datapallas-src.zip: 1 file(s) differs from git archive ${C:0:8}: DataPallas/pom.xml"
broken template-changed windows template=config/_internal/settings.xml \
  "MISMATCH  datapallas.zip: its db-template copy DataPallas/config/_internal/settings.xml differs from commit ${C:0:8}"
broken compose-other docker compose=16.6.1 "MISMATCH  datapallas-server-docker.zip: its compose pins flowkraft/datapallas-server:16.6.1"

echo "---- 4. the stages print the check before their upload lines ----"
# sandbox <dir>: a sparse clone of this commit (origin a local bare repository on it), asbl/ci as it is in this checkout
sandbox() {
  git init -q --bare "$1.origin.git"
  echo "$(cd "$(git rev-parse --git-common-dir)" && pwd)/objects" > "$1.origin.git/objects/info/alternates"
  git -C "$1.origin.git" update-ref refs/heads/main "$C"
  git clone -q --shared --no-checkout "$1.origin.git" "$1"
  git -C "$1" sparse-checkout set --no-cone /asbl/ci/ /pom.xml /bkend/server/pom.xml /frend/reporting/package.json \
    /frend/reporting/package-lock.json /frend/reporting/app/package.json /frend/reporting/app/package-lock.json \
    /bkend/reporting/src/main/external-resources/template/config/burst/settings.xml
  git -C "$1" checkout -q main
  cp -a asbl/ci/. "$1/asbl/ci/"
}
SANDBOX="$SCRATCH/sandbox"; sandbox "$SANDBOX"
UPLOAD_LINE="UPLOAD=no  would run: rclone lsf -R"   # each stage's first upload line: the cleanup of earlier rehearsals

# step 3: dp-ci.sh win release runs stage-files with the pack's list, RELEASE_COMMIT and UPLOAD
out=$( cd "$SANDBOX" && RELEASE_COMMIT="$C" UPLOAD=no bash asbl/ci/release-publish.sh stage-files "$V" "$KEPT/release-files-windows.txt" 2>&1 ); rc=$?
check "step 3's stage-files, UPLOAD=no: the check passes, then the upload lines (exit 0)" \
  bash -c "$(declare -f before); [ \"\$0\" = 0 ] && before 'INSIDE PASS the windows files' '$UPLOAD_LINE' \"\$1\"" "$rc" "$out"
out=$( cd "$SANDBOX" && RELEASE_STATE_DIR="$SCRATCH/state-refused" RELEASE_KEPT_DIR="$SCRATCH/broken-extra-jar" RELEASE_COMMIT="$C" UPLOAD=no \
       bash asbl/ci/release-publish.sh stage-files "$V" "$SCRATCH/broken-extra-jar/release-files-windows.txt" 2>&1 ); rc=$?
check "  a folder refused from inside: its FAIL with the reason, no upload line (exit 1)" \
  bash -c '[ "$0" = 1 ] && [[ "$1" == *"FAIL  the files checked from inside refuse them: datapallas.zip: the product jar"* ]] &&
           [[ "$1" == *"RELEASE_STAGE FAIL"* ]] && [[ "$1" != *"would run"* ]]' "$rc" "$out" || printf '%s\n' "$out" | sed 's/^/        /'

# step 2: release-docker.sh runs stage-docker after its build and proofs, with RELEASE_COMMIT and the proven id and zip
SANDBOX2="$SCRATCH/sandbox-step2"; sandbox "$SANDBOX2"
cat > "$SANDBOX2/asbl/ci/dp-ci.sh" <<'STUB'
#!/bin/bash
# stub dp-ci.sh, for step 2's stage only: build-if-needed finds this checkout built (STUB_BUILD_TAG)
case "${1:-}" in build-if-needed) echo "BUILD_TAG=$STUB_BUILD_TAG" ;; *) echo "stub dp-ci.sh: $* is not stubbed" >&2; exit 1 ;; esac
STUB
mkdir -p "$SANDBOX2/asbl/dist"
step2_stage() {  # step2_stage <kept files of this version and commit>: stage-docker as release-docker.sh runs it
  cp -f "$1/datapallas-server-docker.zip" "$SANDBOX2/asbl/dist/datapallas-server-docker.zip"
  rm -rf "$SCRATCH/artifacts-step2"; mkdir -p "$SCRATCH/artifacts-step2"; cp -a "$1" "$SCRATCH/artifacts-step2/$V-${C:0:8}"
  ( cd "$SANDBOX2" && STUB_BUILD_TAG="$V-$(git rev-parse --short HEAD)" STUB_IMAGE_ID="$IMAGE_ID" RELEASE_STATE_DIR="$SCRATCH/state-step2" \
      RELEASE_ARTIFACTS_DIR="$SCRATCH/artifacts-step2" RELEASE_COMMIT="$C" RELEASE_PROVEN_IMAGE_ID="$IMAGE_ID" \
      RELEASE_PROVEN_ZIP_SHA256="$(sha "$1/datapallas-server-docker.zip")" UPLOAD=no bash asbl/ci/release-publish.sh stage-docker 2>&1 )
}
out=$(step2_stage "$KEPT"); rc=$?
check "step 2's stage-docker, UPLOAD=no: the check passes, then the upload lines (exit 0)" \
  bash -c "$(declare -f before); [ \"\$0\" = 0 ] && before 'INSIDE PASS the docker files' '$UPLOAD_LINE' \"\$1\"" "$rc" "$out"
out=$(step2_stage "$SCRATCH/broken-compose-other"); rc=$?
check "  a folder refused from inside: its FAIL with the reason, no upload line (exit 1)" \
  bash -c '[ "$0" = 1 ] && [[ "$1" == *"FAIL  the files checked from inside refuse them: datapallas-server-docker.zip: its compose pins"* ]] &&
           [[ "$1" == *"RELEASE_STAGE FAIL"* ]] && [[ "$1" != *"would run"* ]]' "$rc" "$out" || printf '%s\n' "$out" | sed 's/^/        /'

# release day: upload-kept, DRY_RUN=yes, on the kept folder of a green rehearsal of this commit, step 1 green
printf 'docker.result=PASS\nwindows.result=PASS\n' >> "$KEPT/MANIFEST.txt"
export STUB_IMAGE_ID="$IMAGE_ID"
( cd "$SANDBOX" &&
  RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh full-lane --choose >/dev/null 2>&1
  RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record rehearsal.docker PASS "version=$V" linux=PASS windows=PASS \
    "zip_sha256=$(sha "$KEPT/datapallas-server-docker.zip")" >/dev/null
  RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record rehearsal.windows PASS "version=$V" pack=PASS server_light=PASS \
    electron_light=PASS robot=PASS "sha256=datapallas.zip:$(sha "$KEPT/datapallas.zip") datapallas-server.zip:$(sha "$KEPT/datapallas-server.zip") datapallas-src.zip:$(sha "$KEPT/datapallas-src.zip")" >/dev/null
  FULL=$(sed -n 's/^lane=//p' "$RELEASE_STATE_DIR/full-e2e/$V")
  RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record "step1.$FULL-full" PASS >/dev/null
  RELEASE_COMMIT="$C" bash asbl/ci/release-state.sh record step1.docker-server-auth PASS >/dev/null )
for ch in docker windows; do
  out=$( cd "$SANDBOX" && DRY_RUN=yes UPLOAD=no bash asbl/ci/release-publish.sh upload-kept "$ch" 2>&1 ); rc=$?
  check "upload-kept $ch, DRY_RUN=yes: every check passed, the check from inside before the upload lines (exit 0)" \
    bash -c "$(declare -f before); [ \"\$0\" = 0 ] && [[ \"\$1\" == *'UPLOAD_KEPT CHECKED $ch'* ]] && before 'INSIDE PASS the $ch files' '$UPLOAD_LINE' \"\$1\"" "$rc" "$out" ||
    printf '%s\n' "$out" | tail -20 | sed 's/^/        /'
done
check "nothing pushed, uploaded or loaded" lacks "docker push" "$(cat "$STUB_CALLS")"
check "  no image loaded either" lacks "docker load" "$(cat "$STUB_CALLS")"

echo
if [ "$FAILED_CASES" = 0 ]; then echo "ALL PASS"; exit 0; fi
echo "FAILED: $FAILED_CASES"; exit 1

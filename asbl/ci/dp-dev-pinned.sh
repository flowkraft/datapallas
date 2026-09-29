#!/bin/bash
# dp-dev-pinned: build and serve ONE pinned commit, inside the datapallas-ci image.
#
# Started by `dp-ci.sh dev --pinned <sha>`, which clones the repo into its own folder, parks it at that
# commit and runs THIS script (taken from the launcher's checkout, so pinning to a commit older than
# this feature still works). The clone has its own maven repository, so a pinned build and the live
# site never overwrite each other's jars.
#
# Why an assembly is needed at all: the dev server runs with its working directory in
# frend/reporting/testground/e2e, which is a COPY of asbl/src/main/external-resources/db-template made
# by AssemblerTest#prepareForE2E. Cube configs, samples and seed scripts reach a running DataPallas
# only through that copy. It is the slow step (it rebuilds every module WITH its JUnit tests), so it is
# skipped when this same commit has already been assembled here.
set -uo pipefail
P="${REPO:?REPO is not set}"
SHA="${SHA:-$(git -C "$P" rev-parse --short HEAD)}"
L="$(dirname "${LOG:-/tmp/dp-dev-pinned.log}")"
STAMP="$P/asbl/target/package/.assembled-at"

exec >>"${LOG:-/tmp/dp-dev-pinned.log}" 2>&1
cd "$P" || exit 1
git config --global --add safe.directory '*'
install -m 755 asbl/ci/npm-script-shell.sh /usr/local/bin/dp-npm-script-shell || exit 1
export npm_config_script_shell=/usr/local/bin/dp-npm-script-shell

s() {
  echo; echo ">>> PINNED STEP $1 START $(date -u +%FT%TZ)"; shift
  "$@"; local rc=$?
  echo "<<< PINNED STEP END rc=$rc $(date -u +%FT%TZ)"
  [ $rc = 0 ] || { echo "PINNED_RESULT=FAILED"; exit $rc; }
}

echo "PINNED_START $(date -u +%FT%TZ) commit=$SHA"

setup() {
  rm -rf /root/.m2/repository/com/sourcekraft /root/.m2/repository/com/flowkraft
  local J=xtra-tools/bild/common-scripts/maven/lib-repository/burst
  mvn -B -q install -U -f xtra-tools/bild/common-scripts/maven/pom.xml &&
  mvn -B -q install -N -f pom.xml &&
  mvn -B -q install:install-file -Dfile=$J/pherialize-1.2.1.jar -DgroupId=de.ailis.pherialize -DartifactId=pherialize -Dversion=1.2.1 -Dpackaging=jar &&
  mvn -B -q install:install-file -Dfile=$J/jpdfunit-1.1.jar -DgroupId=net.sf.jpdfunit -DartifactId=jpdfunit -Dversion=1.1 -Dpackaging=jar &&
  mvn -B -q install:install-file -Dfile=$J/pdfbox-0.7.2.jar -DgroupId=pdfbox -DartifactId=pdfbox -Dversion=0.7.2 -Dpackaging=jar
}

npmi() { (cd frend/rb-webcomponents && npm ci --force) && (cd frend/reporting && npm install --force --no-save); }

assemble() {
  mvn -B test -pl asbl -Dtest=AssemblerTest#prepareForE2E; local rc=$?
  echo "--- JUnit summary ---"
  cat bkend/*/target/surefire-reports/*.txt 2>/dev/null | grep -h "^Tests run:" |
    awk -F'[:,]' '{r+=$2; f+=$4; e+=$6; s+=$8} END {printf "Tests run: %d, Failures: %d, Errors: %d, Skipped: %d\n", r, f, e, s}'
  grep -l -E "FAILURE|ERROR" bkend/*/target/surefire-reports/*.txt 2>/dev/null | sed 's/^/FAILED: /'
  [ -d asbl/target/package/verified-db-noexe ] || { echo "no verified-db-noexe package"; return 1; }
  echo "$SHA" > "$STAMP"
  return $rc
}

# The AI Hub start page, built the production way (the pinned site is meant to look like the product).
# The tools image carries make/g++/python3 because better-sqlite3 compiles here.
aihub() {
  cd asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage &&
  npm install --legacy-peer-deps --no-package-lock && npm run build
}

if [ "$(cat "$STAMP" 2>/dev/null)" = "$SHA" ] && [ -d asbl/target/package/verified-db-noexe ]; then
  echo "already assembled at $SHA -- skipping the build, serving straight away"
else
  s 1-maven-setup setup
  s 2-npm-install npmi
  s 3-mvn-build mvn -B clean install -pl asbl -am -DskipTests -U
  s 4-assemble-with-junit assemble
  s 5-ai-hub-build aihub
fi

echo "PINNED_BUILD_DONE $(date -u +%FT%TZ): starting the dev server"
cd "$P" || exit 1
export REPO="$P" TASK=dev DEV_MODE=pinned SHA LOG
exec bash "$P/asbl/ci/dp-ci.sh" --inside

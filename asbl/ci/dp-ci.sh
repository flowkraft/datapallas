#!/bin/bash
# =============================================================================
# DataPallas Linux CI — run on internalsystems, from anywhere:
#
#   bash asbl/ci/dp-ci.sh build     JUnit + packages + Docker image, from the working tree as it is
#   E2E_SPEC=<regex> E2E_GREP=<regex> bash asbl/ci/dp-ci.sh e2e
#                                   e2e via the SAME gulp flow as `npm run custom:start-server-and-e2e-web`
#                                   (targeted when E2E_SPEC/E2E_GREP are set; both empty = the full suite without
#                                   auth-authorization-server and let-me-update-migrate-configuration, which run
#                                   separately); needs the NoExe package of a previous build
#                                   (asbl/target/package/verified-db-noexe). E2E_SPEC is a regex on the file path:
#                                   anchor it to run one file, e.g. E2E_SPEC='/variables\.spec\.ts$'.
#                                   Optional: E2E_TARGET=web|electron|docker-server (default web), E2E_TIMEOUT_SECS (default 72000 = 20 h).
#                                   docker-server runs the tests against what datapallas-server-docker.zip ships (plan §3 O13):
#                                   the bundle is unpacked fresh into frend/reporting/testground/docker-server and started with the
#                                   image of the last successful `dp-ci.sh build` — it never builds or pulls, and it aborts unless
#                                   the running container uses exactly that image (line DOCKER_SERVER_IMAGE=<tag> <id> in the log).
#                                   Ends with one parsable line: E2E_RESULT mode=... passed=N failed=N ... exit=N
#                                   Stuck tests cost minutes, not hours (plan §4 D0): E2E_MAX_WAIT_MS (15 min per wait),
#                                   E2E_MAX_TEST_MS (60 min per test), E2E_ACTION_TIMEOUT_MS (5 min per click),
#                                   E2E_CLEAN_STATE_ATTEMPTS (60), E2E_FAILFAST (1), E2E_START_EVIDENCE_MS (5 min),
#                                   E2E_STALL_MS (10 min), E2E_REPEAT_EACH (1), E2E_SLOW_MO (0 ms, the config default everywhere; 750 = watch in slow motion). 0 switches one off.
#                                   E2E_ROTATION_DATE (YYYY-MM-DD, default today UTC): whose day's vendor rotation to run, e.g. a failed run's. Watch a run with
#                                   bash asbl/ci/e2e-watch.sh [STALL_MIN].
#                                   E2E_LICENSE_INSTANCE_ID (dp-ci-linux-e2e): one licence-server instance for all CI
#                                   runs, so an interrupted run cannot leave activations of the test key behind.
#                                   E2E_CHROMIUM_EXECUTABLE (the image's Chrome for Testing 138 = Electron 37's Chromium;
#                                   bundled = Playwright's bundled Chromium 120). DEBUG is passed through (e.g. DEBUG=pw:browser prints the browser's own stderr, crash stacks included).
#                                   Host firewall: an e2e run opens two ufw rules tagged dp-ci-e2e (host -> Docker
#                                   networks, containers -> DataPallas on 9090) and a detached watcher removes them when
#                                   dp-ci is gone, however the run ended (plan §3 O14). Check: ufw status | grep -c dp-ci-e2e
#   JUNIT_MODULE=<bkend/common|bkend/reporting|bkend/server> JUNIT_TEST=<surefire -Dtest pattern> bash asbl/ci/dp-ci.sh junit
#                                   JUnit gate: one class/pattern (e.g. 'Jasper*Test', 'ReportsServiceTest#method') or,
#                                   with JUNIT_TEST empty, every test of the module; JUNIT_MODULE empty = all three
#   bash asbl/ci/dp-ci.sh dev       (re)start dp-dev = https://dp-dev.bkstg.flowkraft.com: the dev web server
#                                   (`npm run custom:start-server-and-ui-web`) in frend/reporting/testground/e2e,
#                                   from the repo as it is, in container datapallas-dev. build/e2e/junit stop it
#                                   while they run (they rebuild the backend and reset testground/e2e) and start
#                                   it again when they end.
#   bash asbl/ci/dp-ci.sh publish-demo-bkstg [TAG]
#                                   ON DEMAND, owner only: https://dp-demo.bkstg.flowkraft.com runs
#                                   flowkraft/datapallas-server:<TAG> (default: the <version>-<commit> tag of the newest
#                                   successful build). Prints tag, image, commit, dirty flag, the last full e2e result
#                                   and what runs now; then .env + docker compose up -d + smoke test, rollback when the
#                                   smoke test fails. DRY_RUN=1 = print only; FORCE=1 = allow a -dirty image.
#                                   PUBLISH_TARGET_ENV=<file> replaces the target settings (tests use a throwaway target).
#   bash asbl/ci/dp-ci.sh publish-demo-datapallas.com [TAG] [--reset]
#                                   ON DEMAND, owner only: https://demo.datapallas.com, the same steps. Default TAG = the
#                                   image dp-demo.bkstg runs. Target settings come from the root-only file
#                                   /var/kraft-internalsystems/config/datapallas-ci/demo-datapallas-com.env (TARGET_HOST
#                                   local or an ssh host, TARGET_COMPOSE_DIR, TARGET_DATA_DIR, TARGET_APP, TARGET_URL).
#                                   --reset wipes the site's data folder and starts it again from the image defaults.
#
# The launcher returns within seconds. The work runs in a detached container named dp-ci, owned by
# the Docker daemon, so closing SSH / Code Server / the browser has no effect on it. It builds IN
# this repo folder (like C:\Projects\reportburster on Windows) and never runs git reset/clean here.
#
# Watch:  grep -aE '^(PIPELINE_START|PIPELINE_RESULT|>>> STEP|<<< STEP|!!! ABORT)' <log>
# Stop:   docker stop dp-ci
# dp-dev: log <LOG_DIR>/dev-latest.log, stop: docker stop datapallas-dev
# =============================================================================
set -uo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
LOG_DIR=/var/kraft-internalsystems/logs/datapallas-ci
CI_IMAGE=datapallas-ci
CONTAINER=dp-ci
DEV_CONTAINER=datapallas-dev                          # dp-dev; the bkstg reverse proxy reaches it by this name
DEV_NETWORK=bridge_current_host_cross_containers_net  # the reverse proxy's network
DEV_PORT=14201                                        # TCP forwarder to `ng serve` (localhost:4201) in that container
SERVER_IMAGE_REPO=flowkraft/datapallas-server

# A publish target: the site's compose folder (docker-compose.yml + .env with DATAPALLAS_IMAGE=...), its data
# folder, the app container, the public URL (empty = no URL check) and the host: "local", or an ssh host reached
# with root's ssh key. PUBLISH_TARGET_ENV=<file> replaces these settings; the tests of the publish commands use it
# so that they never touch a real site.
DEMO_DATAPALLAS_COM_CONF=/var/kraft-internalsystems/config/datapallas-ci/demo-datapallas-com.env
DP_DEMO_ENV=/var/kraft-internalsystems/apps/program-files/custom-datapallas-demo/.env
load_publish_target() {
  case "$1" in
    publish-demo-bkstg)
      TARGET_HOST=local
      TARGET_COMPOSE_DIR=/var/kraft-internalsystems/apps/program-files/custom-datapallas-demo
      TARGET_DATA_DIR=/var/kraft-internalsystems/apps/cvs/custom-datapallas-demo
      TARGET_APP=datapallas-demo
      TARGET_URL=https://dp-demo.bkstg.flowkraft.com
      ;;
    publish-demo-datapallas.com)
      if [ -z "${PUBLISH_TARGET_ENV:-}" ]; then
        if [ ! -f "$DEMO_DATAPALLAS_COM_CONF" ]; then
          echo "FAIL  demo.datapallas.com is not set up yet (plan §3 O6): $DEMO_DATAPALLAS_COM_CONF does not exist."
          echo "      Create it, root only (chmod 600), with these settings:"
          echo "        TARGET_HOST=local                  # or an ssh host (user@host) reachable with root's ssh key"
          echo "        TARGET_COMPOSE_DIR=/abs/path       # folder with docker-compose.yml and .env (DATAPALLAS_IMAGE=...)"
          echo "        TARGET_DATA_DIR=/abs/path          # the site's data folder (seeded on the first publish)"
          echo "        TARGET_APP=<app container name>"
          echo "        TARGET_URL=https://demo.datapallas.com   # empty = no public URL check"
          return 1
        fi
        case "$(stat -c %a "$DEMO_DATAPALLAS_COM_CONF")" in
          600|400) ;;
          *) echo "FAIL  $DEMO_DATAPALLAS_COM_CONF must be readable by root only: chmod 600 $DEMO_DATAPALLAS_COM_CONF"; return 1 ;;
        esac
        # shellcheck disable=SC1090
        . "$DEMO_DATAPALLAS_COM_CONF" || return 1
        echo "publish target settings from $DEMO_DATAPALLAS_COM_CONF"
      fi
      ;;
  esac
  if [ -n "${PUBLISH_TARGET_ENV:-}" ]; then
    # shellcheck disable=SC1090
    . "$PUBLISH_TARGET_ENV" || { echo "FAIL  cannot read PUBLISH_TARGET_ENV=$PUBLISH_TARGET_ENV"; return 1; }
    echo "publish target settings from $PUBLISH_TARGET_ENV"
  fi
  local v missing=""
  for v in TARGET_HOST TARGET_COMPOSE_DIR TARGET_DATA_DIR TARGET_APP; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  [ -z "$missing" ] || { echo "FAIL  publish target settings missing:$missing"; return 1; }
  if [ "$TARGET_HOST" = local ]; then
    [ -f "$TARGET_COMPOSE_DIR/docker-compose.yml" ] || { echo "FAIL  no docker-compose.yml in $TARGET_COMPOSE_DIR"; return 1; }
  else
    ssh -o BatchMode=yes -o ConnectTimeout=20 "$TARGET_HOST" "test -f '$TARGET_COMPOSE_DIR/docker-compose.yml'" ||
      { echo "FAIL  $TARGET_HOST: no $TARGET_COMPOSE_DIR/docker-compose.yml (or ssh to $TARGET_HOST failed)"; return 1; }
  fi
}

# --- Host firewall for e2e runs (plan §3 O14) -----------------------------------------------------------------------
# ufw on internalsystems denies incoming AND outgoing traffic by default. That also blocks the host (and the
# host-network dp-ci container) from reaching its own Docker containers on their published ports — the JasperReports
# legacy renderer, MailHog, the DB starter packs — and blocks containers calling DataPallas back on 9090 (AI Hub,
# Next.js, Grails). An e2e run needs both, so the launcher opens exactly two rules tagged dp-ci-e2e for the length of
# the run and a detached watcher removes them once dp-ci is gone. Nothing permanent; setup-firewall.sh is untouched.
# The databases needed a third rule for a while (plan §3 O18): the shipped server reached a starter pack through
# host.docker.internal:<published port>, so ufw dropped it. §4 F2n removed the need - server and packs share the
# 'datapallas' network now and talk to each other directly - so the window is back to these two rules.
FIREWALL_TAG=dp-ci-e2e
FIREWALL_DOCKER_NETS=172.16.0.0/12

# deletes every rule tagged $FIREWALL_TAG (highest rule number first, so the numbers of the rest do not shift)
firewall_close() {  # $1 = log file
  local n
  for n in $(ufw status numbered | sed -n "s/^\[ *\([0-9]\+\)\].*# $FIREWALL_TAG *\$/\1/p" | sort -rn); do
    ufw --force delete "$n" >/dev/null
  done
  echo "FIREWALL closed  $(date -u +%Y-%m-%dT%H:%M:%SZ)  remaining $FIREWALL_TAG rules: $(ufw status | grep -c "# $FIREWALL_TAG")" >>"$1"
}

firewall_open() {  # $1 = log file
  local outside leftovers
  # the rules cover 172.16.0.0/12 only, so every Docker network must be inside it
  outside=$(docker network ls -q | xargs -r docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' |
    python3 -c '
import ipaddress, sys
pool = ipaddress.ip_network(sys.argv[1])
for line in sys.stdin:
    name, *subnets = line.split()
    for subnet in subnets:
        net = ipaddress.ip_network(subnet, strict=False)
        if net.version == 4 and not net.subnet_of(pool):
            print(name, subnet)
' "$FIREWALL_DOCKER_NETS")
  if [ -n "$outside" ]; then
    echo "FAIL  Docker networks outside $FIREWALL_DOCKER_NETS, the e2e firewall rules would not cover them (plan §3 O14):"
    echo "$outside"
    return 1
  fi
  # leftovers from a run that could not clean up (crash, reboot)
  leftovers=$(ufw status | grep -c "# $FIREWALL_TAG")
  [ "$leftovers" = 0 ] || { echo "removing $leftovers leftover $FIREWALL_TAG firewall rules" | tee -a "$1"; firewall_close "$1"; }
  if ! ufw allow out to "$FIREWALL_DOCKER_NETS" comment "$FIREWALL_TAG" >/dev/null ||
     ! ufw allow in from "$FIREWALL_DOCKER_NETS" to any port 9090 proto tcp comment "$FIREWALL_TAG" >/dev/null; then
    echo "FAIL  could not open the e2e firewall rules"
    firewall_close "$1"
    return 1
  fi
  { echo "FIREWALL open  $(date -u +%Y-%m-%dT%H:%M:%SZ)  (plan §3 O14; closed when $CONTAINER is gone)"
    ufw status | grep "# $FIREWALL_TAG"; } >>"$1"
}

# a watcher outside any SSH session: waits for dp-ci to end (or to be gone already) and closes the rules. The close
# code is copied into the watcher's command line, so later edits of this file cannot affect a running watcher.
firewall_close_when_run_ends() {  # $1 = log file
  # Waits for EVERY dp-ci run to be gone, not just the one that started it: when a run is stopped and the
  # next one starts right away, the old watcher used to close the window the new run had just opened (seen
  # 2026-09-16: rules opened 08:22:07, closed 08:22:08, and that run reached neither the apps nor the host).
  setsid nohup bash -c "$(declare -p FIREWALL_TAG CONTAINER); $(declare -f firewall_close)
    while docker ps -q --filter name=\"^\$CONTAINER\\\$\" | grep -q .; do
      docker wait \"\$CONTAINER\" >/dev/null 2>&1 || sleep 2
    done
    firewall_close $(printf '%q' "$1")" >/dev/null 2>&1 </dev/null &
}

# dp-dev runs in its own container on the reverse-proxy network (like www-datapallas-com-dev), NOT on the
# host network: the reverse proxy cannot reach host-network ports (ufw drops them).
start_dev_container() {
  local sha log
  sha=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)
  [ -z "$(git -C "$REPO" status --porcelain 2>/dev/null)" ] || sha="$sha-dirty"
  log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-dev-$sha.log"
  ln -sfn "$log" "$LOG_DIR/dev-latest.log"
  docker rm -f "$DEV_CONTAINER" >/dev/null 2>&1
  docker run -d --rm --name "$DEV_CONTAINER" --network "$DEV_NETWORK" \
    -v "$REPO":"$REPO" -w "$REPO" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v dp-ci-m2:/root/.m2 -v dp-ci-npm:/root/.npm -v dp-ci-cache:/root/.cache \
    -v "$LOG_DIR":"$LOG_DIR" \
    -e REPO="$REPO" -e TASK=dev -e SHA="$sha" -e LOG="$log" \
    "$CI_IMAGE" bash "$REPO/asbl/ci/dp-ci.sh" --inside >/dev/null || return 1
  echo "dp-dev:  $DEV_CONTAINER started, https://dp-dev.bkstg.flowkraft.com answers once the backend and UI have compiled (a few minutes)"
  echo "log:     $log   (also $LOG_DIR/dev-latest.log)"
}

# -----------------------------------------------------------------------------
# INSIDE the dp-ci container
# -----------------------------------------------------------------------------
if [ "${1:-}" = "--inside" ]; then
  exec >>"$LOG" 2>&1
  cd "$REPO" || exit 1
  git config --global --add safe.directory '*'
  # npm scripts in frend/reporting use cmd.exe syntax (%npm_package_version%). npm runs them through a
  # small sh wrapper here instead: package.json must stay exactly as it runs on Windows.
  install -m 755 asbl/ci/npm-script-shell.sh /usr/local/bin/dp-npm-script-shell ||
    { echo "!!! cannot install asbl/ci/npm-script-shell.sh"; exit 1; }
  export npm_config_script_shell=/usr/local/bin/dp-npm-script-shell
  # the launcher stopped dp-dev for this run: start it again however the run ends
  [ "${RESTART_DEV:-0}" = 1 ] && trap 'echo ""; echo "restarting dp-dev ($DEV_CONTAINER)"; start_dev_container' EXIT
  VERSION=$(grep -m1 -oP '(?<=<revision>)[^<]+' pom.xml)

  step() {
    local n="$1"; shift
    echo ""
    echo "=============================================================="
    echo ">>> STEP $n START  $(date -u +%Y-%m-%dT%H:%M:%SZ)  :: $*"
    echo "=============================================================="
    "$@"
    local rc=$?
    echo "<<< STEP $n END rc=$rc  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [ $rc -ne 0 ]; then
      echo "!!! ABORTING PIPELINE at step $n (rc=$rc)"
      echo "PIPELINE_RESULT=FAILED_AT_STEP_$n  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      exit $rc
    fi
  }

  # Same as pack-datapallas.bat: drop cached project artifacts, install the parent POM, plus the
  # vendored jars that are not on Maven Central (lib-repository/install-jars.cmd).
  maven_setup() {
    rm -rf /root/.m2/repository/com/sourcekraft /root/.m2/repository/com/flowkraft
    local L=xtra-tools/bild/common-scripts/maven/lib-repository/burst
    mvn -B install -U -f xtra-tools/bild/common-scripts/maven/pom.xml &&
    # the root POM too: modules built one by one outside the reactor (the e2e chain's
    # compile-and-stage-backend-jars) resolve their parent rb-product-DataPallas from ~/.m2
    mvn -B install -N -f pom.xml &&
    mvn -B install:install-file -Dfile=$L/pherialize-1.2.1.jar -DgroupId=de.ailis.pherialize -DartifactId=pherialize -Dversion=1.2.1 -Dpackaging=jar &&
    mvn -B install:install-file -Dfile=$L/jpdfunit-1.1.jar -DgroupId=net.sf.jpdfunit -DartifactId=jpdfunit -Dversion=1.1 -Dpackaging=jar &&
    mvn -B install:install-file -Dfile=$L/pdfbox-0.7.2.jar -DgroupId=pdfbox -DartifactId=pdfbox -Dversion=0.7.2 -Dpackaging=jar
  }

  # rb-webcomponents: npm ci installs exactly its package-lock.json.
  # frend/reporting: its package-lock.json is behind package.json, which npm ci refuses, so it gets
  # the same `npm install --force` as the Dockerfile. --no-save keeps the lock file (and git) untouched.
  npm_install() {
    # Compare the files before and after, not against git: package.json may carry uncommitted edits.
    local before
    before=$(md5sum frend/reporting/package.json frend/reporting/package-lock.json)
    (cd frend/rb-webcomponents && npm ci --force) &&
    (cd frend/reporting && npm install --force --no-save) || return 1
    [ "$before" = "$(md5sum frend/reporting/package.json frend/reporting/package-lock.json)" ] ||
      echo "WARN  npm rewrote frend/reporting/package*.json during this run"
  }

  # Same as pack-datapallas.bat STEP 2.
  mvn_build() {
    mvn -B clean install -pl asbl -am -DskipTests -U
  }

  # Same as pack-datapallas.bat STEP 3, Linux entry point. NoExeAssembler runs the backend build
  # WITH its JUnit tests, then the server zip and the Docker image are assembled.
  assemble() {
    mvn -B test -pl asbl -Dtest=AssemblerTest#assembleDataPallasServerLinux
    local rc=$?
    echo "--- JUnit summary (surefire reports) ---"
    cat bkend/*/target/surefire-reports/*.txt 2>/dev/null | grep -h "^Tests run:" |
      awk -F'[:,]' '{r+=$2; f+=$4; e+=$6; s+=$8} END {printf "Tests run: %d, Failures: %d, Errors: %d, Skipped: %d\n", r, f, e, s}'
    grep -l -E "FAILURE|ERROR" bkend/*/target/surefire-reports/*.txt 2>/dev/null | sed 's/^/FAILED: /'
    return $rc
  }

  # JUnit gate. The module's dependencies are installed first through the root reactor (-am also builds
  # rb-update, which rb-reporting needs; bkend/server has spring-boot-starter-parent but is a reactor module),
  # without tests; then only the module's tests run, from a clean target/ so the summary shows just this run.
  junit_tests() {
    local modules="${JUNIT_MODULE:-bkend/common bkend/reporting bkend/server}" m rc=0
    local filter=()
    [ -n "${JUNIT_TEST:-}" ] && filter=("-Dtest=$JUNIT_TEST" -Dsurefire.failIfNoSpecifiedTests=false)
    echo "JUNIT_MODULE='${JUNIT_MODULE:-}'  JUNIT_TEST='${JUNIT_TEST:-}'  (module empty = all three; test empty = every test)"
    for m in $modules; do
      case "$m" in
        bkend/common|bkend/reporting|bkend/server) ;;
        *) echo "!!! JUNIT_MODULE must be bkend/common, bkend/reporting or bkend/server (got '$m')"; return 2 ;;
      esac
    done
    for m in $modules; do
      echo "--- $m: dependencies ---"
      mvn -B install -pl "$m" -am -DskipTests || return 1
      echo "--- $m: tests ---"
      mvn -B clean test -f "$m/pom.xml" "${filter[@]}" || rc=1
      echo "--- JUnit summary $m ---"
      for f in "$m"/target/surefire-reports/*.txt; do
        [ -f "$f" ] || continue
        printf '%s  %s\n' "$(grep -h -m1 '^Tests run:' "$f")" "$(basename "$f" .txt)"
      done
      cat "$m"/target/surefire-reports/*.txt 2>/dev/null | grep -h "^Tests run:" |
        awk -F'[:,]' '{r+=$2; f+=$4; e+=$6; s+=$8; c++} END {printf "TOTAL classes: %d, Tests run: %d, Failures: %d, Errors: %d, Skipped: %d\n", c, r, f, e, s}'
      grep -l -E "FAILURE|ERROR" "$m"/target/surefire-reports/*.txt 2>/dev/null | sed 's/^/FAILED: /'
    done
    return $rc
  }

  # The owner's e2e chain, unchanged: clean testground -> gulp starts the Spring Boot server from
  # testground/e2e + `ng serve` on 4201 -> Playwright (TEST_ENV=web, or Electron) -> server killed. gulp itself
  # does not return Playwright's exit code, so the verdict is read from the line gulp prints.
  e2e_web() {
    local out=/tmp/e2e-web.out code mode=targeted target="${E2E_TARGET:-web}"
    case "$target" in
      web|electron|docker-server) ;;
      *) echo "!!! E2E_TARGET must be web, electron or docker-server (got '$target')"; return 2 ;;
    esac
    if [ -z "${E2E_SPEC:-}" ] && [ -z "${E2E_GREP:-}" ]; then
      # Full suite minus the two specs that run on their own: auth-authorization-server creates accounts and
      # changes roles (no other spec may find them), let-me-update-migrate-configuration is Electron-only.
      # playwright.config.ts uses E2E_SPEC as testMatch, so no shared file changes.
      export E2E_SPEC='^(?!.*(auth-authorization-server|let-me-update-migrate-configuration)).*\.spec\.ts$'
      mode=full
    fi
    # Nothing declares a deployment shape any more: there is one, and every target runs the same secured
    # backend. The web and electron targets start it through the npm scripts, the docker-server target is the
    # shipped image -- what differs is which CALLER the tests use (the Electron shell signs its own requests
    # with the installation key; a browser signs in as burst), and that is the product's own behaviour.
    if [ "$target" = docker-server ]; then
      docker_server_up || return 1
    else
      # The product's startTestEmailServer.sh runs MailHog as a container named "mailhog" by default. On this
      # host that name belongs to dp-demo's MailHog, so the e2e runs use their own container.
      export DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER="${DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER:-dp-e2e-mailhog}"
      (cd frend/reporting && npm run custom:clean-testground) || return 1
    fi
    # stuck tests cost minutes, not hours (plan §4 D0); read by e2e/utils/constants.ts, fluent-tester.ts,
    # utils/helpers.ts and playwright.config.ts. Unset outside this script, so Windows runs are unchanged.
    export E2E_MAX_WAIT_MS="${E2E_MAX_WAIT_MS:-900000}" E2E_MAX_TEST_MS="${E2E_MAX_TEST_MS:-3600000}" \
      E2E_ACTION_TIMEOUT_MS="${E2E_ACTION_TIMEOUT_MS:-300000}" E2E_CLEAN_STATE_ATTEMPTS="${E2E_CLEAN_STATE_ATTEMPTS:-60}" \
      E2E_FAILFAST="${E2E_FAILFAST:-1}" E2E_START_EVIDENCE_MS="${E2E_START_EVIDENCE_MS:-300000}" \
      E2E_STALL_MS="${E2E_STALL_MS:-600000}" E2E_REPEAT_EACH="${E2E_REPEAT_EACH:-1}" E2E_SLOW_MO="${E2E_SLOW_MO:-0}"
    # every CI run is the same licence-server instance (plan §4 D2 processing-license); read by e2e/utils/helpers.ts
    export E2E_LICENSE_INSTANCE_ID="${E2E_LICENSE_INSTANCE_ID:-dp-ci-linux-e2e}"
    # web runs use the Chromium of Electron's engine, baked into the CI image (asbl/ci/Dockerfile, plan §4 D2);
    # read by e2e/playwright.config.ts. E2E_CHROMIUM_EXECUTABLE=bundled uses Playwright's bundled Chromium instead.
    export E2E_CHROMIUM_EXECUTABLE="${E2E_CHROMIUM_EXECUTABLE:-/opt/chrome-for-testing/chrome-linux64/chrome}"
    [ "$E2E_CHROMIUM_EXECUTABLE" = bundled ] && E2E_CHROMIUM_EXECUTABLE=""
    echo "E2E_CHROMIUM_EXECUTABLE=${E2E_CHROMIUM_EXECUTABLE:-(Playwright bundled)}"
    # Retries and the time limit follow the mode: a targeted run shows each failure as it is; a full run retries
    # a failed test twice (owner, 2026-09-16) and runs to the end of the last file however many tests fail, so
    # one run collects every failure. Read by e2e/playwright.config.ts (retries).
    if [ "$mode" = full ]; then E2E_RETRIES="${E2E_RETRIES:-2}" E2E_TIMEOUT_SECS="${E2E_TIMEOUT_SECS:-259200}"; fi
    export E2E_RETRIES="${E2E_RETRIES:-0}" E2E_TIMEOUT_SECS="${E2E_TIMEOUT_SECS:-72000}"
    # every result with its error, retries and trace paths, next to the run log; read by e2e/playwright.config.ts
    export E2E_JSON_REPORT="${LOG%.log}-playwright.json"
    echo "E2E_MODE=$mode"
    echo "E2E_RETRIES=$E2E_RETRIES E2E_TIMEOUT_SECS=$E2E_TIMEOUT_SECS E2E_JSON_REPORT=$E2E_JSON_REPORT"
    echo "E2E_CAPS max_wait_ms=$E2E_MAX_WAIT_MS max_test_ms=$E2E_MAX_TEST_MS action_timeout_ms=$E2E_ACTION_TIMEOUT_MS" \
      "clean_state_attempts=$E2E_CLEAN_STATE_ATTEMPTS failfast=$E2E_FAILFAST start_evidence_ms=$E2E_START_EVIDENCE_MS" \
      "stall_ms=$E2E_STALL_MS repeat_each=$E2E_REPEAT_EACH slow_mo=$E2E_SLOW_MO"
    echo "E2E_TARGET=$target"
    echo "E2E_SPEC='${E2E_SPEC:-}'  E2E_GREP='${E2E_GREP:-}'"
    # xvfb-run: playwright.config.ts sets headless:false (headed, like on Windows), so a virtual X display is needed
    if [ "$target" = docker-server ]; then
      # No gulp, no ng serve, no Spring Boot from source: the server under test is the container, and the
      # tests read and write the bundle folder the container has bind-mounted.
      # The dev chain gets the test licence key from package.json's _custom:playwright-tests-web; read it from
      # there too, so both targets use the same key and it is not copied into this script.
      local test_license_key
      test_license_key=$(grep -oP '"_custom:playwright-tests-web":.*?TEST_LICENSE_KEY=\K[0-9a-fA-F]+' frend/reporting/package.json | head -1)
      [ -n "$test_license_key" ] || { echo "!!! docker-server: TEST_LICENSE_KEY not found in frend/reporting/package.json"; docker_server_down; return 1; }
      (cd frend/reporting && TEST_ENV=web RUNNING_IN_E2E=true TEST_LICENSE_KEY="$test_license_key" \
        E2E_BASE_URL="$DOCKER_SERVER_URL" PORTABLE_EXECUTABLE_DIR="$DOCKER_SERVER_DIR" \
        timeout --kill-after=60 "${E2E_TIMEOUT_SECS:-72000}" \
        xvfb-run -a --server-args="-screen 0 1920x1080x24" \
        npx playwright test -c e2e/playwright.config.ts e2e/) 2>&1 | tee "$out"
      # Playwright runs in the foreground here, so its own exit code is the verdict; the dev chain prints
      # the line below through gulp instead.
      echo "Main Playwright process exited with code ${PIPESTATUS[0]}" >> "$out"
      docker_server_down
    else
      (cd frend/reporting && timeout --kill-after=60 "${E2E_TIMEOUT_SECS:-72000}" \
        xvfb-run -a --server-args="-screen 0 1920x1080x24" npx gulp "utils:start-server-and-e2e-$target") 2>&1 | tee "$out"
    fi
    code=$(grep -aoE "Main Playwright process exited with code [0-9]+" "$out" | tail -1 | grep -oE "[0-9]+$")
    echo "--- Playwright result ---"
    grep -aoE "[0-9]+ (passed|failed|flaky|skipped|did not run|interrupted)( \([^)]*\))?" "$out" | tail -6
    echo "Playwright exit code: ${code:-none (Playwright never ran or was killed)}"
    echo "E2E_RESULT mode=$mode spec='${E2E_SPEC:-}' grep='${E2E_GREP:-}'" \
      "passed=$(e2e_count passed "$out") failed=$(e2e_count failed "$out") flaky=$(e2e_count flaky "$out")" \
      "skipped=$(e2e_count skipped "$out") didnotrun=$(e2e_count "did not run" "$out") exit=${code:-none} target=$target"
    [ "$code" = "0" ]
  }

  # E2E_TARGET=docker-server (plan §3 O13, §4 F2a G0): the tests run against the product as it ships — the
  # unpacked datapallas-server-docker.zip plus the flowkraft/datapallas-server image built by the last
  # successful `dp-ci.sh build` on this host. Nothing is built or pulled here: a missing image or zip is a
  # failure, and so is a container running any other image.
  DOCKER_SERVER_DIR=""
  DOCKER_SERVER_URL="http://localhost:9090"
  docker_server_up() {
    local zip="$REPO/asbl/dist/datapallas-server-docker.zip" root="$REPO/frend/reporting/testground/docker-server"
    local f tag image_id running_id i

    for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
      grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
      tag=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
      [ -n "$tag" ] && { echo "docker-server: image of the newest successful build $(basename "$f") -> $tag"; break; }
    done
    [ -n "${tag:-}" ] || { echo "!!! docker-server: no successful build log with an IMAGE_TAG line — run 'dp-ci.sh build' first"; return 1; }
    image_id=$(docker image inspect "$SERVER_IMAGE_REPO:$tag" --format '{{.Id}}' 2>/dev/null) ||
      { echo "!!! docker-server: image $SERVER_IMAGE_REPO:$tag is not on this host — run 'dp-ci.sh build' first"; return 1; }
    [ -s "$zip" ] || { echo "!!! docker-server: $zip is missing — run 'dp-ci.sh build' first"; return 1; }

    # The bundle's compose pins the released tag, and that is the file customers run: give the locally built
    # image that name here (never pulled: --pull never below, and the id check proves which image runs).
    docker tag "$SERVER_IMAGE_REPO:$tag" "$SERVER_IMAGE_REPO:$(printf '%s' "$tag" | cut -d- -f1)" || return 1

    rm -rf "$root" && mkdir -p "$root" || return 1
    unzip -q "$zip" -d "$root" || { echo "!!! docker-server: cannot unpack $zip"; return 1; }
    DOCKER_SERVER_DIR="$root/DataPallas"
    [ -f "$DOCKER_SERVER_DIR/docker-compose.yml" ] || { echo "!!! docker-server: $DOCKER_SERVER_DIR/docker-compose.yml missing"; return 1; }

    # The apps the tests start (next-playground, grails-playground, ai-hub, …) are built by compose from the
    # bundle's _apps sources, and compose reuses an image that already exists: an image left by an earlier run
    # would hide every change to those sources. A fresh install has none, so neither does the run — remove
    # what compose built for each app (--rmi local: only built images, never the public ones an app pulls).
    local app_compose
    for app_compose in $(find "$DOCKER_SERVER_DIR/_apps" -name docker-compose.yml 2>/dev/null); do
      (cd "$(dirname "$app_compose")" && docker compose down --rmi local --remove-orphans) >/dev/null 2>&1 || true
    done

    # The bundle's other images (mailhog) are ordinary public ones: pull any the host lacks (a docker prune
    # removes them), the DataPallas image never.
    local img
    for img in $(cd "$DOCKER_SERVER_DIR" && docker compose config --images | grep -v "^$SERVER_IMAGE_REPO:"); do
      docker image inspect "$img" >/dev/null 2>&1 || docker pull -q "$img" ||
        { echo "!!! docker-server: cannot pull $img"; return 1; }
    done
    (cd "$DOCKER_SERVER_DIR" && docker compose up -d --pull never) || { echo "!!! docker-server: compose up failed"; docker_server_down; return 1; }

    for i in $(seq 1 60); do
      curl -fsS -o /dev/null -m 5 "$DOCKER_SERVER_URL" && break
      sleep 5
    done
    curl -fsS -o /dev/null -m 5 "$DOCKER_SERVER_URL" || { echo "!!! docker-server: $DOCKER_SERVER_URL did not answer within 5 minutes"; docker_server_down; return 1; }

    running_id=$(docker inspect datapallas-server --format '{{.Image}}' 2>/dev/null)
    [ "$running_id" = "$image_id" ] ||
      { echo "!!! docker-server: the container runs image $running_id, the build made $image_id — aborting"; docker_server_down; return 1; }
    echo "DOCKER_SERVER_IMAGE=$SERVER_IMAGE_REPO:$tag $image_id"
    # The whole server log of the run, next to the run log: clean state empties the bundle's logs between tests,
    # and the last lines printed by docker_server_down do not reach back to a failure hours earlier.
    docker logs -f datapallas-server > "${LOG%.log}-datapallas-server.log" 2>&1 &
    echo "DOCKER_SERVER_LOG=${LOG%.log}-datapallas-server.log"
    echo "DOCKER_SERVER_DIR=$DOCKER_SERVER_DIR"
    # Tools that live inside the installation (the JasperReports legacy CLI, and the CLI in general) run
    # inside the container on this target, the way a customer runs them. Unset for every other target.
    export E2E_DOCKER_SERVER=datapallas-server
    # The dev chain's npm script passes the test licence key to Playwright; this target starts Playwright
    # itself, so it takes the same key from that script — one source of truth. Without it the specs fall back
    # to a dummy key and the licence server answers "Unknown license key".
    export TEST_LICENSE_KEY="${TEST_LICENSE_KEY:-$(grep -aoE 'TEST_LICENSE_KEY=[0-9a-f]+' "$REPO/frend/reporting/package.json" | head -1 | cut -d= -f2)}"
  }

  # Stops the bundle but keeps the folder: its config, logs and output are the evidence of the run.
  # The server's own output lives in the container, and clean state empties the bundle's logs between tests,
  # so the last lines go into the run log before the container is gone — otherwise a failure on this target
  # has no server-side evidence at all.
  docker_server_down() {
    [ -n "$DOCKER_SERVER_DIR" ] || return 0
    echo "--- datapallas-server container log (last 4000 lines) ---"
    docker logs --tail 4000 datapallas-server 2>&1 | sed 's/^/datapallas-server: /' || true
    (cd "$DOCKER_SERVER_DIR" && docker compose down) >/dev/null 2>&1 || true
    # What the server itself started through docker.sock (database starter packs, apps) outlives the bundle when
    # a test could not stop it (a killed run): F2 run 1 left supabase-northwind restarting for days. Compose
    # records the working dir the server passed: the bundle's host folder (--project-directory), or the
    # container's own /app when a call site forgot it.
    local project
    for project in $(docker ps -a --format '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}' |
                     awk -F'|' -v dir="$DOCKER_SERVER_DIR" '$1 != "" && ($2 ~ /^\/app(\/|$)/ || index($2, dir "/") == 1) {print $1}' |
                     sort -u); do
      echo "docker-server: removing compose project '$project', started by the server and still running"
      docker compose -p "$project" down -v --remove-orphans >/dev/null 2>&1 || true
    done
  }

  # the number from Playwright's summary line "<N> <what>" (e.g. "8 passed (50.6s)"), 0 when absent
  e2e_count() {
    local n
    n=$(grep -aE "^(stdout:)? *[0-9]+ $1( \(.*\))? *$" "$2" | tail -1 | grep -oE "[0-9]+" | head -1)
    echo "${n:-0}"
  }

  # dp-dev: the owner's everyday web dev chain, unchanged (`npm run custom:start-server-and-ui-web`): gulp compiles
  # and starts the Spring Boot server from testground/e2e (9090), then `ng serve` (4201). ng serve listens on
  # localhost only, so a small TCP forwarder makes it reachable for the reverse proxy on $DEV_PORT. The proxy sends
  # Host/Origin "localhost:4201", which Angular's dev server requires. Nothing in package.json changes.
  dev_server() {
    node -e '
      // ng serve binds "localhost", which may be ::1 or 127.0.0.1: try both, in that order.
      // pipe() ends the other side gracefully (pending data is flushed); destroy() only on errors,
      // otherwise large responses get cut off (nginx: "upstream prematurely closed connection").
      const net = require("net");
      const HOSTS = ["::1", "127.0.0.1"];
      net.createServer((c) => {
        let u = null;
        c.on("error", () => { c.destroy(); if (u) u.destroy(); });
        c.on("close", () => { if (u) u.destroy(); });
        const attempt = (i) => {
          const s = net.connect({ port: 4201, host: HOSTS[i] });
          let up = false;
          s.on("connect", () => {
            up = true; u = s;
            if (c.destroyed) return s.destroy();
            c.pipe(s); s.pipe(c);
          });
          s.on("error", () => {
            s.destroy();
            if (!up && i + 1 < HOSTS.length) attempt(i + 1); else c.destroy();
          });
        };
        attempt(0);
      }).listen(Number(process.argv[1]), "0.0.0.0");
    ' "$DEV_PORT" &
    # dp-dev is reachable from the internet, and it is secured -- not because anything here says so, but
    # because every DataPallas is. The browser reaching it through ng serve holds no installation key, so it
    # meets the login screen and signs in as a real account, exactly like a browser pointed at a Server.
    # DataPallas.security.enabled=false is the only way to relax that, and nothing reachable should use it.
    (cd frend/reporting && npm run custom:start-server-and-ui-web)
  }

  # A unique tag per build, so a publish can name exactly this image (DockerAssembler re-points
  # :<version> and :latest on every build).
  tag_image() {
    docker tag "$SERVER_IMAGE_REPO:$VERSION" "$SERVER_IMAGE_REPO:$VERSION-$SHA" || return 1
    echo "IMAGE_TAG=$VERSION-$SHA"
  }

  # --- publish (plan §4 B1/B2): summary -> refuse/dry-run -> [--reset] .env + compose up -> smoke -> rollback on failure
  # Every step on the site goes through on_target, so a local site and one on another host run the same code.
  on_target() {
    if [ "$TARGET_HOST" = local ]; then
      bash -c "$1"
    else
      ssh -o BatchMode=yes -o ConnectTimeout=20 "$TARGET_HOST" "$1"
    fi
  }
  q() { printf '%q' "$1"; }

  publish_summary() {
    local tag="${PUBLISH_TAG:-}" f t commit dirty=no e2e running
    if [ -z "$tag" ]; then
      for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
        grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
        t=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
        [ -n "$t" ] && { tag="$t"; echo "TAG not given: newest successful build $(basename "$f") -> $tag"; break; }
      done
      [ -n "$tag" ] || { echo "!!! no TAG given and no successful build log with an IMAGE_TAG line: run a build, or pass the tag"; return 1; }
    fi
    PUBLISH_IMAGE="$SERVER_IMAGE_REPO:$tag"
    docker image inspect "$PUBLISH_IMAGE" >/dev/null 2>&1 || { echo "!!! image $PUBLISH_IMAGE does not exist on this host"; return 1; }
    commit="${tag#*-}"                      # <version>-<commit>[-dirty]
    [ "$commit" != "$tag" ] || commit="unknown (tag is not <version>-<commit>)"
    case "$commit" in *-dirty) dirty=yes ;; esac
    e2e=$(for f in $(ls -1 "$LOG_DIR"/*-e2e-"$commit".log 2>/dev/null | sort); do grep -a '^E2E_RESULT mode=full' "$f"; done | tail -1)
    running=$(on_target "docker inspect -f '{{.Config.Image}} (image id {{.Image}})' $(q "$TARGET_APP") 2>/dev/null") ||
      running="nothing (no container $TARGET_APP)"
    echo "PUBLISH target:   ${TARGET_URL:-(no public URL)}  host=$TARGET_HOST  app=$TARGET_APP  compose=$TARGET_COMPOSE_DIR  data=$TARGET_DATA_DIR"
    echo "PUBLISH image:    $PUBLISH_IMAGE  id=$(docker image inspect -f '{{.Id}}' "$PUBLISH_IMAGE" | cut -c8-19)  created=$(docker image inspect -f '{{.Created}}' "$PUBLISH_IMAGE")"
    echo "PUBLISH commit:   $commit  dirty=$dirty$([ "$dirty" = yes ] && echo ' (= uncommitted changes on top of that commit)')"
    echo "PUBLISH full e2e: ${e2e:-no full e2e run for this commit}"
    echo "PUBLISH runs now: $running"
    [ "${PUBLISH_RESET:-0}" = 1 ] && echo "PUBLISH --reset:  the data folder $TARGET_DATA_DIR will be wiped and seeded again"
    if [ "$dirty" = yes ] && [ "${FORCE:-0}" != 1 ]; then
      echo "!!! refusing to publish a -dirty image (built from uncommitted changes): commit + build first, or FORCE=1"
      return 1
    fi
  }

  # --reset: the site starts again from the image defaults (everything visitors created is gone)
  publish_wipe_data() {
    case "$TARGET_DATA_DIR" in
      *..*|*" "*) echo "!!! refusing to wipe TARGET_DATA_DIR=$TARGET_DATA_DIR (.. or spaces in the path)"; return 1 ;;
      /*/*/*) ;;
      *) echo "!!! refusing to wipe TARGET_DATA_DIR=$TARGET_DATA_DIR (must be an absolute path at least 3 levels deep)"; return 1 ;;
    esac
    echo "--reset: stopping the site and wiping $TARGET_DATA_DIR"
    on_target "docker compose -f $(q "$TARGET_COMPOSE_DIR/docker-compose.yml") down && mkdir -p $(q "$TARGET_DATA_DIR") && find $(q "$TARGET_DATA_DIR") -mindepth 1 -delete"
  }

  publish_deploy() {
    local envf="$TARGET_COMPOSE_DIR/.env" compose="$TARGET_COMPOSE_DIR/docker-compose.yml" pkg=asbl/target/package/verified-docker/DataPallas
    PUBLISH_PREVIOUS_ENV="$TARGET_COMPOSE_DIR/.env.before-publish"
    if [ "$TARGET_HOST" != local ] && ! on_target "docker image inspect $(q "$PUBLISH_IMAGE") >/dev/null 2>&1"; then
      echo "copying $PUBLISH_IMAGE to $TARGET_HOST (docker save | ssh docker load) ..."
      docker save "$PUBLISH_IMAGE" | on_target "docker load" || return 1
    fi
    on_target "if [ -f $(q "$envf") ]; then cp -p $(q "$envf") $(q "$PUBLISH_PREVIOUS_ENV"); else : > $(q "$PUBLISH_PREVIOUS_ENV"); fi" || return 1
    echo "saved the current .env as $PUBLISH_PREVIOUS_ENV"
    if [ "${PUBLISH_RESET:-0}" = 1 ]; then
      publish_wipe_data || return 1
    fi
    if [ -z "$(on_target "mkdir -p $(q "$TARGET_DATA_DIR") && ls -A $(q "$TARGET_DATA_DIR") | head -1")" ]; then
      [ -d "$pkg" ] || { echo "!!! $pkg (from a build) is needed to seed $TARGET_DATA_DIR"; return 1; }
      echo "empty data folder: seeding $TARGET_DATA_DIR from $pkg"
      tar -C "$pkg" --exclude=./docker-compose.yml --exclude=./README.md -cf - . | on_target "tar -C $(q "$TARGET_DATA_DIR") -xpf -" || return 1
    fi
    on_target "{ grep -v '^DATAPALLAS_IMAGE=' $(q "$PUBLISH_PREVIOUS_ENV"); echo DATAPALLAS_IMAGE=$(q "$PUBLISH_IMAGE"); } > $(q "$envf.new") && mv $(q "$envf.new") $(q "$envf")" || return 1
    echo "wrote $envf: DATAPALLAS_IMAGE=$PUBLISH_IMAGE"
    on_target "docker compose -f $(q "$compose") up -d"
  }

  publish_smoke() {
    local deadline=$(( $(date +%s) + ${SMOKE_TIMEOUT_SECS:-300} )) code=""
    while [ "$(date +%s)" -lt "$deadline" ]; do
      code=$(on_target "docker exec $(q "$TARGET_APP") curl -s -o /dev/null -m 10 -w '%{http_code}' http://localhost:9090/" 2>/dev/null)
      [ "$code" = 200 ] && break
      sleep 5
    done
    echo "smoke: http://localhost:9090/ inside $TARGET_APP -> ${code:-no answer} (expected 200)"
    [ "$code" = 200 ] || return 1
    if [ -n "${TARGET_URL:-}" ]; then
      code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$TARGET_URL")
      echo "smoke: $TARGET_URL -> $code (expected 302 = login redirect)"
      [ "$code" = 302 ] || return 1
    fi
  }

  publish_rollback() {
    local compose="$TARGET_COMPOSE_DIR/docker-compose.yml" prev
    prev=$(on_target "sed -n 's/^DATAPALLAS_IMAGE=//p' $(q "$PUBLISH_PREVIOUS_ENV")" 2>/dev/null)
    echo "!!! publish failed: rolling back"
    on_target "cp -p $(q "$PUBLISH_PREVIOUS_ENV") $(q "$TARGET_COMPOSE_DIR/.env")"
    if [ -n "$prev" ] && on_target "docker image inspect $(q "$prev") >/dev/null 2>&1"; then
      echo "rollback: back to $prev"
      on_target "docker compose -f $(q "$compose") up -d"
    else
      echo "rollback: no previous image (${prev:-none}): docker compose down"
      on_target "docker compose -f $(q "$compose") down"
    fi
  }

  publish_apply() {
    publish_deploy && publish_smoke && return 0
    publish_rollback
    return 1
  }

  echo "PIPELINE_START $(date -u +%Y-%m-%dT%H:%M:%SZ)  task=$TASK  commit=$SHA  version=$VERSION"
  case "$TASK" in
    publish-*)
      step 1 publish_summary
      if [ "${DRY_RUN:-0}" = 1 ]; then
        echo "DRY_RUN=1: nothing changed"
      else
        step 2 publish_apply
      fi
      echo ""
      echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      exit 0
      ;;
  esac
  step 1 maven_setup
  if [ "$TASK" = "junit" ]; then
    step 2 junit_tests
    echo ""
    echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    exit 0
  fi
  step 2 npm_install
  if [ "$TASK" = "dev" ]; then
    step 3 dev_server
    exit 0
  fi
  if [ "$TASK" = "e2e" ]; then
    step 3 e2e_web
    echo ""
    echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    exit 0
  fi
  step 3 mvn_build
  step 4 assemble
  step 5 tag_image
  echo ""
  echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi

# -----------------------------------------------------------------------------
# LAUNCHER (on the host)
# -----------------------------------------------------------------------------
TASK="${1:-}"
case "$TASK" in
  build|e2e|junit|dev|publish-demo-bkstg|publish-demo-datapallas.com) ;;
  # release: reserved for the real software release (plan §3 O7)
  *) echo "usage: $0 build|e2e|junit|dev|publish-demo-bkstg [TAG]|publish-demo-datapallas.com [TAG] [--reset]"; exit 2 ;;
esac
PUBLISH_FLAGS=""
PUBLISH_TAG=""
PUBLISH_RESET=0
if [ "${TASK#publish-}" != "$TASK" ]; then
  for a in "${@:2}"; do
    case "$a" in
      --reset) [ "$TASK" = publish-demo-datapallas.com ] || { echo "FAIL  --reset is only for publish-demo-datapallas.com"; exit 2; }
               PUBLISH_RESET=1 ;;
      -*) echo "FAIL  unknown option $a"; exit 2 ;;
      *) PUBLISH_TAG="$a" ;;
    esac
  done
  load_publish_target "$TASK" || exit 1
  if [ "$TASK" = publish-demo-datapallas.com ] && [ -z "$PUBLISH_TAG" ]; then
    # default: exactly the image dp-demo.bkstg runs
    PUBLISH_TAG=$(sed -n "s#^DATAPALLAS_IMAGE=$SERVER_IMAGE_REPO:##p" "$DP_DEMO_ENV" 2>/dev/null)
    case "$PUBLISH_TAG" in
      ""|not-deployed-yet) echo "FAIL  no TAG given and dp-demo.bkstg has not been published yet ($DP_DEMO_ENV): pass a TAG"; exit 1 ;;
    esac
    echo "TAG not given: the image dp-demo.bkstg runs -> $PUBLISH_TAG"
  fi
  if [ "$TARGET_HOST" = local ]; then
    mkdir -p "$TARGET_DATA_DIR" || exit 1
    PUBLISH_FLAGS="-v $TARGET_COMPOSE_DIR:$TARGET_COMPOSE_DIR -v $TARGET_DATA_DIR:$TARGET_DATA_DIR"
  else
    PUBLISH_FLAGS="-v /root/.ssh:/root/.ssh:ro"   # on_target runs ssh as root inside dp-ci
  fi
fi

if docker ps -a --filter "name=^${CONTAINER}\$" --format '{{.Names}}' | grep -q .; then
  [ "$TASK" = "dev" ] && { echo "FAIL  a $CONTAINER run is working (it rebuilds the backend and resets testground/e2e) - start dp-dev after it ends"; exit 1; }
  echo "FAIL  a $CONTAINER container already exists — one run at a time (docker logs -f $CONTAINER)"; exit 1
fi

cd "$REPO" || exit 1
if [ "$TASK" = "dev" ]; then
  mkdir -p "$LOG_DIR"
  echo "building the $CI_IMAGE tools image (cached after the first time)..."
  docker build -q -t "$CI_IMAGE" "$REPO/asbl/ci" >/dev/null || { echo "FAIL  docker build $CI_IMAGE"; exit 1; }
  start_dev_container || { echo "FAIL  docker run $DEV_CONTAINER"; exit 1; }
  echo "stop:    docker stop $DEV_CONTAINER"
  exit 0
fi
SHA=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain)" ] || SHA="$SHA-dirty"

E2E_FLAGS=""
if [ "$TASK" = "e2e" ]; then
  [ -d "$REPO/asbl/target/package/verified-db-noexe/DataPallas" ] ||
    { echo "FAIL  e2e needs asbl/target/package/verified-db-noexe from a previous build — run: $0 build"; exit 1; }
  # host network: specs start app containers whose published ports must answer on localhost
  E2E_FLAGS="--network host --shm-size=2g"
fi

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$TASK-$SHA.log"
ln -sfn "$LOG" "$LOG_DIR/latest.log"

echo "building the $CI_IMAGE tools image (cached after the first time)..."
docker build -q -t "$CI_IMAGE" "$REPO/asbl/ci" >>"$LOG" 2>&1 || { echo "FAIL  docker build $CI_IMAGE — see $LOG"; exit 1; }

RESTART_DEV=0
# build, e2e and junit rebuild the backend / reset testground/e2e under dp-dev; publishing does not touch it
if [ "${TASK#publish-}" = "$TASK" ] && docker ps -q --filter "name=^${DEV_CONTAINER}\$" | grep -q .; then
  echo "stopping dp-dev ($DEV_CONTAINER) while this run works; it starts again when the run ends"
  docker stop "$DEV_CONTAINER" >/dev/null
  RESTART_DEV=1
fi

if [ "$TASK" = "e2e" ]; then
  firewall_open "$LOG" || { [ "$RESTART_DEV" = 1 ] && start_dev_container; exit 1; }
fi

docker run -d --rm --name "$CONTAINER" $E2E_FLAGS $PUBLISH_FLAGS \
  -v "$REPO":"$REPO" -w "$REPO" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v dp-ci-m2:/root/.m2 -v dp-ci-npm:/root/.npm -v dp-ci-cache:/root/.cache \
  -v "$LOG_DIR":"$LOG_DIR" \
  -e REPO="$REPO" -e TASK="$TASK" -e SHA="$SHA" -e LOG="$LOG" -e RESTART_DEV="$RESTART_DEV" \
  -e LICENSE_CURL_TIMEOUT_SECS=15 -e LICENSE_CURL_ATTEMPTS=1 \
  -e JUNIT_MODULE="${JUNIT_MODULE:-}" -e JUNIT_TEST="${JUNIT_TEST:-}" \
  -e E2E_SPEC="${E2E_SPEC:-}" -e E2E_GREP="${E2E_GREP:-}" -e E2E_TIMEOUT_SECS="${E2E_TIMEOUT_SECS:-}" -e E2E_RETRIES="${E2E_RETRIES:-}" \
  -e E2E_TARGET="${E2E_TARGET:-web}" \
  -e E2E_MAX_WAIT_MS="${E2E_MAX_WAIT_MS:-}" -e E2E_MAX_TEST_MS="${E2E_MAX_TEST_MS:-}" -e E2E_ACTION_TIMEOUT_MS="${E2E_ACTION_TIMEOUT_MS:-}" \
  -e E2E_CLEAN_STATE_ATTEMPTS="${E2E_CLEAN_STATE_ATTEMPTS:-}" -e E2E_FAILFAST="${E2E_FAILFAST:-}" \
  -e E2E_START_EVIDENCE_MS="${E2E_START_EVIDENCE_MS:-}" -e E2E_STALL_MS="${E2E_STALL_MS:-}" -e E2E_REPEAT_EACH="${E2E_REPEAT_EACH:-}" \
  -e E2E_LICENSE_INSTANCE_ID="${E2E_LICENSE_INSTANCE_ID:-}" \
  -e DEBUG="${DEBUG:-}" \
  -e E2E_CHROMIUM_EXECUTABLE="${E2E_CHROMIUM_EXECUTABLE:-}" \
  -e E2E_SLOW_MO="${E2E_SLOW_MO:-}" \
  -e E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-}" \
  -e PUBLISH_TAG="$PUBLISH_TAG" -e PUBLISH_RESET="$PUBLISH_RESET" -e DRY_RUN="${DRY_RUN:-0}" -e FORCE="${FORCE:-0}" -e SMOKE_TIMEOUT_SECS="${SMOKE_TIMEOUT_SECS:-300}" \
  -e TARGET_HOST="${TARGET_HOST:-}" -e TARGET_COMPOSE_DIR="${TARGET_COMPOSE_DIR:-}" -e TARGET_DATA_DIR="${TARGET_DATA_DIR:-}" \
  -e TARGET_APP="${TARGET_APP:-}" -e TARGET_URL="${TARGET_URL:-}" \
  "$CI_IMAGE" bash "$REPO/asbl/ci/dp-ci.sh" --inside >/dev/null ||
  { echo "FAIL  docker run $CONTAINER"; [ "$TASK" = "e2e" ] && firewall_close "$LOG"
    [ "$RESTART_DEV" = 1 ] && start_dev_container; exit 1; }
if [ "$TASK" = "e2e" ]; then firewall_close_when_run_ends "$LOG"; fi

echo "STARTED  $CONTAINER  task=$TASK  commit=$SHA"
echo "log:     $LOG   (also $LOG_DIR/latest.log)"
echo "watch:   grep -aE '^(PIPELINE_START|PIPELINE_RESULT|>>> STEP|<<< STEP|!!! ABORT)' $LOG_DIR/latest.log"
echo "stop:    docker stop $CONTAINER"
if [ "$TASK" = "e2e" ]; then
  echo "firewall: $(ufw status | grep -c "# $FIREWALL_TAG") rules tagged $FIREWALL_TAG open until $CONTAINER is gone (plan §3 O14)"
fi

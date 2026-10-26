#!/bin/bash
# =============================================================================
# DataPallas CI on the Linux host (internalsystems), run from anywhere:  bash asbl/ci/dp-ci.sh <subcommand> [args]
#
# THE MAP: each subcommand on one line, with the Jenkins job that runs it (folder datapallas; each job's own description
# and asbl/ci/jenkins/jenkins.md say when to use which). The details of each follow below the release order.
#   build                                  the full build of the checkout as it is: by hand only (the jobs use build-if-needed)
#   build-if-needed                        origin/main, then `build` only when it is not built yet: dp-ci-release-step1-e2e-prerelease,
#                                          dp-ci-release-step2-release-docker
#   e2e                                    the real e2e (web, electron-linux, docker-server): dp-ci-release-step1-e2e-prerelease
#   e2e-loop                               the fix-and-retry loop, one spec file: dp-ci-dev-e2e-one-spec
#   junit                                  the Java unit tests: dp-ci-dev-junit
#   quality                                the quality tools, never gating: dp-ci-dev-quality-report
#   dev [--live | --pinned <sha> | --refresh-content [--pinned]]
#                                          the dev web server: dp-ci-dev-server (start, stop; --refresh-content by hand)
#   publish-demo-datapallas.com <TAG> [--reset]
#                                          any image to demo.datapallas.com, by hand only: no job runs it (a release's
#                                          public demo is installed by dp-ci-release-step4-demo-public)
#   prereq <check...>                      what a job needs, checked in seconds: every heavy job runs it first
#   win e2e | docker-e2e | server-e2e      the Windows VM's e2e targets windows-vm-electron, windows-vm-docker, windows-vm-server:
#                                          dp-ci-release-step1-e2e-prerelease (docker-e2e also dp-ci-release-step2-release-docker)
#   win release                            the Windows release, MODE=rehearsal|public: dp-ci-release-step3-release-windows-vm
#   win prereq e2e|docker-e2e|server-e2e|release
#                                          a Windows lane's checks, in seconds: the lanes and the release jobs run them first
#   win sync | win prepare                 the VM's checkout to origin/main | that, plus its package rebuilt when stale: by hand
#                                          (every Windows lane syncs first; windows-vm-electron also prepares)
#   win check | ssh | ps | run | poll | stop
#                                          the VM itself: does it answer, a command, a PowerShell script, a task on its desktop:
#                                          by hand
# The release jobs of steps 0, 2 and 4 run scripts of their own (asbl/ci/jenkins/release-set-version.sh, release-docker.sh,
# release-demos.sh), which call the subcommands above; the release record is asbl/ci/release-state.sh.
#
# THE RELEASE, in order (asbl/ci/jenkins/jenkins.md, "The release, in order"): Jenkins jobs, on origin/main.
#   0 dp-ci-release-step0-set-version           asbl/ci/jenkins/release-set-version.sh: a bigger version written into the version
#                                               files (asbl/ci/set-version.sh), one commit pushed to main; left as it is, nothing
#   1 dp-ci-release-step1-e2e-prerelease        `e2e` / `win ...` per target; four lanes green on one commit, recorded (the
#                                               full set on the release's full lane, web or docker-server, alternated:
#                                               asbl/ci/release-state.sh full-lane)
#   2 dp-ci-release-step2-release-docker        asbl/ci/jenkins/release-docker.sh. MODE=rehearsal: build once here, prove (the
#                                               light set on the build's zip and image on Linux and in the VM's Docker
#                                               Desktop, no registry), then upload (UPLOAD=yes: :<version> and the zip staged in
#                                               rehearsal/). MODE=public (UPLOAD=yes): a passed rehearsal copied to newest/ and
#                                               :latest (owner only)
#   3 dp-ci-release-step3-release-windows-vm    `win release`, the same two modes and UPLOAD for the Windows files: pack,
#                                               prove (the Robot UAT), upload (2 and 3 in either order, never at once: one VM;
#                                               the two public runs one after the other)
#   4 dp-ci-release-step4-demo-public           asbl/ci/jenkins/release-demos.sh: demo.datapallas.com installs the release
# Steps 2 and 3 start with their channel's version gate (asbl/ci/release-state.sh version-check docker|windows: settings.xml
# against that channel's released version; the same = nothing to release, green, naming step 0) and refuse unless step 1
# is green on the commit they rehearse (REFUSED, naming step 1). Each channel is released on its own. MODE=public never
# copies anything that did not pass: with no passed rehearsal of the version it rehearses first. UPLOAD=no (the default
# of both) builds and proves and uploads nothing, printing each command it skips; MODE=public refuses it.
#
# THE DETAILS. Variables come from the environment; [x] is the default.
#
#   bash asbl/ci/dp-ci.sh build
#       Compile (no unit tests), assemble the packages (asbl/dist), tag the Docker image flowkraft/datapallas-server:
#       <version>-<commit>, scan it with Trivy (<log>-trivy/trivy.json); from the checkout as it is. About 40 min. Writes the
#       package stamp (asbl/target/package/.built-from), so an e2e right after it does not rebuild the package.
#
#   bash asbl/ci/dp-ci.sh build-if-needed
#       This checkout on origin/main (a fast-forward, never a reset), then `build` only when the newest successful build is
#       not of this commit, its image and both server zips still here; ends with BUILD_TAG=<version>-<commit>. The jobs that
#       install what `build` makes run it first themselves. DRY_RUN=1 [0] = only say whether a build is needed.
#
#   E2E_SPEC=<regex> E2E_GREP=<regex> bash asbl/ci/dp-ci.sh e2e
#       The REAL e2e, the release check, through the SAME gulp flow as `npm run custom:start-server-and-e2e-web`, on this
#       checkout put on origin/main first (a fast-forward: local changes to tracked files stop the run, commits not pushed
#       yet are tested as they are). The NoExe package (asbl/target/package/verified-db-noexe, which the testground is
#       copied from: _apps, db-template, config) must be built from THIS commit: it is rebuilt first when its stamp says
#       otherwise (= asbl/pack-prepare-for-e2e.bat, no JUnit, no image; about 30 min). E2E_PACKAGE does not apply here.
#       E2E_SPEC   a regex on the spec file's path; anchor it for one file, e.g. E2E_SPEC='/variables\.spec\.ts$'.
#       E2E_GREP   a regex on the test titles. Both empty = the full suite without auth-authorization-server (it changes
#                  accounts and roles later specs use) and let-me-update-migrate-configuration (Electron only), which run
#                  on their own; either set = a targeted run.
#       E2E_TARGET [web] | electron-linux (electron is the same) | docker-server. docker-server tests what
#                  datapallas-server-docker.zip ships: the bundle unpacked fresh into frend/reporting/testground/docker-server
#                  and started with the image of the last successful `build`; it never builds or pulls, and aborts unless the
#                  running container uses exactly that image (DOCKER_SERVER_IMAGE=<tag> <id> in the log).
#       E2E_DOCKER_FROM_URL=<zip url>  (a staged Docker release, by hand): that bundle downloaded instead, its image pulled,
#                  the running digest = the one the rehearsal pushed (release record), then the self-host page's
#                  one-command `docker run`. By hand only since the Docker release proves before it uploads (it uses
#                  the build's own zip and image, below): it checks a staged download as a user gets it.
#       E2E_DOCKER_ONE_COMMAND=yes [no]  (docker-server, the Docker release's Linux proof): after the tests, the self-host
#                  page's one-command `docker run` of the image the bundle ran, as E2E_DOCKER_FROM_URL does.
#       E2E_RETRIES how often a failed test runs again: [empty = 2 for the full suite, 0 for a targeted run]. The Windows
#                  lanes have their own: windows-vm-electron full 1, the light set of windows-vm-electron (E2E_SPEC=light),
#                  windows-vm-docker and windows-vm-server 1, targeted 0.
#       E2E_TIMEOUT_SECS the whole run's limit: [259200 = 72 h for the full suite, 72000 = 20 h for a targeted run].
#       Stuck tests cost minutes, not hours (0 switches one off): E2E_MAX_WAIT_MS [40 min per wait], E2E_MAX_TEST_MS
#                  [90 min per test], E2E_ACTION_TIMEOUT_MS [5 min per click], E2E_CLEAN_STATE_ATTEMPTS [60],
#                  E2E_FAILFAST [1], E2E_START_EVIDENCE_MS [5 min], E2E_STALL_MS [10 min], E2E_REPEAT_EACH [1],
#                  E2E_SLOW_MO [0 ms; 750 = watch it in slow motion].
#       E2E_ROTATION_DATE [today, UTC], YYYY-MM-DD: whose day's vendor and app rotation to run, e.g. a failed run's.
#       E2E_LICENSE_INSTANCE_ID [dp-ci-linux-e2e; the VM: dp-ci-win-e2e]: one licence-server instance for all CI runs, so
#                  an interrupted run cannot leave activations of the test key behind.
#       E2E_CHROMIUM_EXECUTABLE [the image's Chrome for Testing 138 = Electron 37's Chromium; bundled = Playwright's
#                  Chromium 120]. DEBUG is passed through (DEBUG=pw:browser prints the browser's own stderr).
#       E2E_DD_SCREENSHOTS=1 [off]: the dashboard-demo specs also take the "How it was built" pictures, written into the
#                  docs site's public/images/docs (DOCS_SITE [<all-repos>/src/company-biz/flowkraft/www/reportburster.com]).
#       Ends with one parsable line: E2E_RESULT mode=... passed=N failed=N ... exit=N. Watch a run: bash asbl/ci/e2e-watch.sh.
#       Host firewall: an e2e run opens two ufw rules tagged dp-ci-e2e (host -> Docker networks, containers -> DataPallas
#       on 9090), because ufw denies both by default; a detached watcher removes them when dp-ci is gone, however the run
#       ended. Check: ufw status | grep -c dp-ci-e2e
#
#   E2E_SPEC=<regex> E2E_GREP=<regex> [E2E_PACKAGE=<mode>] bash asbl/ci/dp-ci.sh e2e-loop
#       The fix-and-retry LOOP: the same run as `e2e`, targeted (E2E_SPEC or E2E_GREP is required), on E2E_TARGET [web] or
#       electron-linux, on this checkout put on origin/main first as for `e2e`, and it NEVER rebuilds the package (only
#       builds one when there is none, about 30 min). The jars and the UI are built from the tree on every run; the package supplies the content
#       (db-template, config, samples, scripts). E2E_PACKAGE says what happens to it:
#         [package-reuse-as-is]              run on the package exactly as it stands (a fix to specs, helpers, Java, the UI). Instant.
#         package-rsync-simple-file-changes  copy the plain db-template files changed since the package was built (commits, and new
#                                            untracked files) into the package and the testground; stops with "use
#                                            package-repackage" when one of them is not a verbatim copy (generated, transformed
#                                            or named by the assembler). Seconds.
#         package-repackage                  package the content again on the jars already built
#                                            (AssemblerTest#refreshContentForE2E), about 3.5 min. Not a full rebuild: that is
#                                            `dp-ci.sh build` (about 40 min).
#       The old values reuse and content are refused, naming the new one. The log names the package it ran on: an
#       `E2E_PACKAGE mode=... built_from=... commit_under_test=... files_copied=<n>` line. The loop also serves the AI Hub
#       start page from the `ui-startpage` sources (`next dev`, the Dockerfile's devserver stage, image
#       ai-hub-ai-hub-frend:dev; line AI_HUB_FROM_SOURCES=<path>): a Canvas change needs no image build. `e2e` keeps the
#       production image. Every variable of `e2e` above applies (E2E_RETRIES: 0, a targeted run).
#
#   JUNIT_MODULE=<bkend/common|bkend/reporting|bkend/server> JUNIT_TEST=<surefire -Dtest pattern> bash asbl/ci/dp-ci.sh junit
#       The Java unit tests of the checkout as it is: one class or pattern (e.g. 'Jasper*Test', 'ReportsServiceTest#method');
#       JUNIT_TEST [empty = every test of the module]; JUNIT_MODULE [empty = all three]. One class 1-4 min, all about 24 min.
#
#   bash asbl/ci/dp-ci.sh quality
#       The quality tools (lint, bug finder, format check, complexity, docs). Compiles the Java modules without tests and
#       installs the npm dependencies of the two frontends (the AI Hub in a scratch copy, never in the tree), then runs each
#       tool one after the other. No package, no tests. Never gating: a tool that fails is recorded and the run goes on.
#       Each tool leaves its report as <log>-quality-<tool> next to the run log. Ends with one parsable line:
#       QUALITY_RESULT tools=N ok=N failed=N <tool>=<ok|rcN> ... exit=0
#
#   bash asbl/ci/dp-ci.sh dev [--live | --pinned <sha> | --refresh-content [--pinned]]
#       --live [the default]: the dev web server (`npm run custom:start-server-and-ui-web`) in frend/reporting/testground/e2e,
#       from this checkout as it is saved, hot-reloading, in container datapallas-dev: https://dp-dev-live.bkstg.flowkraft.com
#       (https://dp-dev.bkstg.flowkraft.com is an alias). It also runs the AI Hub start page as `next dev` from its sources:
#       https://dp-dev-aihub.bkstg.flowkraft.com. build, e2e and junit stop it while they run (they rebuild the backend and
#       reset testground/e2e) and start it again when they end.
#       --pinned <sha>: a separate clone parked at that commit (asbl/ci/dp-dev-pinned.sh), so a test session cannot move;
#       <sha> must be a commit this checkout has; no hot reload; container datapallas-pinned: https://dp-dev-pinned.bkstg.flowkraft.com.
#       --refresh-content [--pinned]: content is served from a copy of the package. In --live an edited db-template file
#       that the site already has is mirrored onto it at once (dev-watch-content); a new sample or dataset is not, and a
#       pinned site mirrors nothing: this packages the content again on the built jars (about 3 min) and copies it in.
#       A private dev site of one agent: DP_DEV_CONTAINER, DP_DEV_URL, DP_DEV_M2, DP_AIHUB_URL (below, next to DEV_URL).
#       Log <LOG_DIR>/dev-latest.log; stop: docker stop datapallas-dev (datapallas-pinned).
#
#   bash asbl/ci/dp-ci.sh publish-demo-datapallas.com <TAG> [--reset]
#       ON DEMAND, owner only: https://demo.datapallas.com runs flowkraft/datapallas-server:<TAG> (a build's
#       <version>-<commit> tag). Prints tag, image, commit, dirty flag, the last full e2e result and what runs now; then
#       .env + docker compose up -d + smoke test (SMOKE_TIMEOUT_SECS [300]), rollback when the smoke test fails.
#       DRY_RUN=1 = print only; FORCE=1 = allow a -dirty image. PUBLISH_TARGET_ENV=<file> replaces the target settings
#       (tests use a throwaway target). By hand only, no job runs this: a release is installed on
#       demo.datapallas.com by dp-ci-release-step4-demo-public (asbl/ci/demo-public/install-release.sh). Target settings:
#       the root-only file /var/kraft-internalsystems/config/datapallas-ci/demo-datapallas-com.env (TARGET_HOST local or
#       an ssh host, TARGET_COMPOSE_DIR, TARGET_DATA_DIR, TARGET_APP, TARGET_URL). --reset wipes the site's data folder and
#       starts it again from the image defaults. When that file has DEMO_SITE_ENV (the website's settings file), a publish
#       ends with asbl/ci/demo-links.sh --target <file>: three share links, the tour button, the website told.
#
#   bash asbl/ci/dp-ci.sh prereq <check...>
#       What a job needs, checked in seconds before anything slow; the checks only read. One line per check, OK <what> or
#       MISSING <what>: <what to do> (NOT CHECKED when it needs one listed MISSING), then PREREQUISITES OK (exit 0) or
#       PREREQUISITES MISSING (<n>): nothing was started ... (exit 1). Checks: docker (this host's engine), vm (the VM's
#       settings and an answer over SSH), vm-docker (its Docker Desktop), vm-java (Java 17 on its PATH as the registry has
#       it), vm-mvn (Maven on that PATH), vm-free (no other Windows run), publish-target
#       publish-demo-datapallas.com (its settings and docker-compose.yml). Every Linux task checks docker itself first
#       (not a dry build-if-needed, which starts nothing), and each Windows lane its own set at its top.
#
#   bash asbl/ci/dp-ci.sh win <subcommand>
#       The Windows VM (win10-dev). Runs ON THE HOST, not in a container: it drives the VM over SSH with root's key and
#       does not touch this repo, dp-dev or the firewall (the host reaches the VM without a ufw rule). The VM's settings:
#       WIN_CI_CONF [/var/kraft-internalsystems/config/datapallas-ci/win-ci.env], root only (mode 600), with WIN_HOST,
#       WIN_USER, WIN_SSH_KEY, WIN_KNOWN_HOSTS and WIN_REPO (the VM's checkout; the e2e and release lanes need it); the
#       environment may set them instead. Never print that file.
#       check                   the VM answers and the PowerShell quoting path is intact.
#       ssh <words...>          a command through cmd.exe (quote-free commands only).
#       ps < script.ps1         a PowerShell script from stdin, sent as -EncodedCommand, so nothing in it needs escaping:
#                               use it for anything real.
#       run <step> <dir> <command...> | poll <step> [offset] | stop <step>
#                               a command on the VM's desktop session as a scheduled task, waited for | its log | stopped.
#                               WIN_RUN_TIMEOUT caps it [3 h], WIN_RUN_STALL stops it after that long with no log growth
#                               [20 min]; the lanes set their own (below).
#       sync | prepare          the VM's checkout fast-forwarded to origin/main (stops on local changes) | that, then its
#                               package rebuilt with asbl/pack-prepare-for-e2e.bat unless it was built from that commit.
#       e2e                     windows-vm-electron: the desktop app on the VM, E2E_SPEC/E2E_GREP as in `e2e` (on Windows the
#                               path has backslashes: write the separator as [\\/]); both empty = the full suite without
#                               auth-authorization-server; E2E_SPEC=light = the light set (WIN_LIGHT_SPEC), what a release
#                               needs of this lane. Caps: WIN_RUN_TIMEOUT [full 64 h, targeted 3 h; win-ci.env sets
#                               6 h for targeted runs], WIN_RUN_STALL [full 105 min, targeted 80 min].
#       docker-e2e              windows-vm-docker: DataPallas Server in the VM's Docker Desktop, from datapallas-server-docker.zip
#                               as the self-host page installs it, with the image `build` made from the VM's commit copied
#                               over and loaded, no registry (also the Docker release's Windows proof); with
#                               E2E_DOCKER_FROM_URL, a staged download instead, by hand, as in `e2e`.
#       server-e2e              windows-vm-server: DataPallas Server on the VM's own Java 17, from datapallas-server.zip as the
#                               installation page installs it (startServer.bat).
#                               Both server lanes run a light set of five spec files when E2E_SPEC and E2E_GREP are empty.
#                               Caps: WIN_RUN_TIMEOUT [3 h], WIN_RUN_STALL [80 min].
#       release                 the Windows release's files (MODE=rehearsal|public, UPLOAD=no|yes, DRY_RUN=no|yes): pack-datapallas.bat once
#                               (RELEASE_PACK_TIMEOUT [28800 = 8 h]), the Robot UAT on its very files (RELEASE_ROBOT_TIMEOUT
#                               [21600 = 6 h]), then, UPLOAD=yes, datapallas.zip, datapallas-server.zip and datapallas-src.zip
#                               staged in rehearsal/<version>-<commit>/; MODE=public copies a passed rehearsal to newest/ - see
#                               win_release.
#       prereq e2e|docker-e2e|server-e2e|release
#                               that lane's checks (prereq above): e2e = vm vm-docker vm-java vm-mvn vm-free; docker-e2e = vm
#                               vm-docker docker vm-free; server-e2e = vm vm-docker vm-java vm-free; release = vm vm-free.
#       The e2e lanes are started by asbl/ci/jenkins/win-e2e.sh (a detached driver; the tests run on the VM as a scheduled
#       task). Each lane marks its parts START/END with the time they took (asbl/ci/marks.sh): grep -aE '^######## ' <log>.
#
# Internal, set by this script or its callers, not by hand: LOG_DIR, WIN_E2E_LOG, WIN_RUN_ENV, WIN_RUN_WATCH, WIN_RUN_BARE,
# WIN_RUN_EVERY, WIN_SCP_EXTRA, WIN_CONNECT_TIMEOUT, WIN_HOST_KEY_CHECKING, DEV_MODE, PINNED_SHA, PUBLISH_TAG, PUBLISH_RESET,
# PUBLISH_SETTINGS_FILE, TARGET_*, RESTART_DEV, TEST_LICENSE_KEY, DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER, DP_API_URL,
# DEMO_LINKS_WAIT_SECS.
#
# The launcher returns within seconds. The work runs in a detached container named dp-ci, owned by the Docker daemon,
# so closing SSH / Code Server / the browser has no effect on it. It builds IN this repo folder (like
# C:\Projects\reportburster on Windows) and never runs git reset/clean here. One dp-ci run at a time.
#
# Watch:  grep -aE '^(PIPELINE_START|PIPELINE_RESULT|>>> STEP|<<< STEP|!!! ABORT)' <log>
# Stop:   docker stop dp-ci
# dp-dev: log <LOG_DIR>/dev-latest.log, stop: docker stop datapallas-dev
# The comments below cite sections of the CI plan this script was built from (plan §..., W1 ...); that plan is not in
# this repository: each one names a decision already described where it is cited.
# =============================================================================
set -uo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
LOG_DIR=/var/kraft-internalsystems/logs/datapallas-ci
CI_IMAGE=datapallas-ci
CONTAINER=dp-ci
DEV_CONTAINER=${DP_DEV_CONTAINER:-datapallas-dev}      # dp-dev; the bkstg reverse proxy reaches it by this name
# A private dev site of one agent runs from that agent's own clone (its dp-ci.sh) with its own container, so it never collides with dp-dev:
#   DP_DEV_CONTAINER=datapallas-dev-kate DP_DEV_URL=https://dp-kate.bkstg.flowkraft.com DP_DEV_M2=dp-kate-m2 bash asbl/ci/dp-ci.sh dev
# (log: <LOG_DIR>/dev-kate-latest.log, stop: docker stop datapallas-dev-kate). The defaults are the shared dp-dev.
DEV_URL=${DP_DEV_URL:-https://dp-dev.bkstg.flowkraft.com}
DEV_M2=${DP_DEV_M2:-dp-ci-m2}
DEV_LOG_LINK=${DEV_CONTAINER#datapallas-}-latest.log   # datapallas-dev -> dev-latest.log
DEV_NETWORK=bridge_current_host_cross_containers_net  # the reverse proxy's network
APPS_NETWORK=datapallas                               # the apps' own network (their docker-compose files)
RPROXY_CONTAINER=ints-rproxy-gateway-bkstg            # the bkstg reverse proxy; its per-host files:
RPROXY_CONF_DIR=/var/kraft-internalsystems/rproxy-gateway-bkstg/config/nginx/reverse-proxy-confs/bkstg.flowkraft.com
DEV_PORT=14201                                        # TCP forwarder to `ng serve` (localhost:4201) in that container
AI_HUB_PORT=3000                                      # `next dev` for the AI Hub start page, in --live only
# The route to that dev start page: nginx file dp-dev-aihub.subdomain.conf on this host sends it to
# $DEV_CONTAINER:$AI_HUB_PORT, behind the same Authelia login as dp-dev itself. A private dev site
# passes its own (DP_AIHUB_URL, and its own nginx file pointing at its own container).
AI_HUB_URL=${DP_AIHUB_URL:-https://dp-dev-aihub.bkstg.flowkraft.com}
PINNED_CONTAINER=datapallas-pinned                    # dp-dev-pinned; the reverse proxy reaches it by this name
PINNED_REPO=/var/kraft-internalsystems/projects/dp-pinned/reportburster  # the pinned clone, never this checkout
SERVER_IMAGE_REPO=flowkraft/datapallas-server
# mark_start / mark_end / mark_next / mark_run: the START/END lines of a run's parts, with their times (host side)
. "$REPO/asbl/ci/marks.sh"

# A publish target: the site's compose folder (docker-compose.yml + .env with DATAPALLAS_IMAGE=...), its data
# folder, the app container, the public URL (empty = no URL check) and the host: "local", or an ssh host reached
# with root's ssh key. PUBLISH_TARGET_ENV=<file> replaces these settings; the tests of the publish commands use it
# so that they never touch a real site.
DEMO_DATAPALLAS_COM_CONF=/var/kraft-internalsystems/config/datapallas-ci/demo-datapallas-com.env
load_publish_target() {
  case "$1" in
    publish-demo-datapallas.com)
      if [ -z "${PUBLISH_TARGET_ENV:-}" ]; then
        if [ ! -f "$DEMO_DATAPALLAS_COM_CONF" ]; then
          echo "FAIL  demo.datapallas.com is not set up yet (plan §3 O6): $DEMO_DATAPALLAS_COM_CONF does not exist."
          echo "      Create it, root only (chmod 600), with these settings:"
          echo "        TARGET_HOST=local                  # or an ssh host (user@host) reachable with root's ssh key"
          echo "        TARGET_COMPOSE_DIR=/abs/path       # folder with docker-compose.yml and .env (DATAPALLAS_IMAGE=...)"
          echo "        TARGET_DATA_DIR=/abs/path          # the site's data folder (seeded on the first publish)"
          echo "        TARGET_APP=<app container name>"
          echo "        TARGET_URL=                        # empty = no public URL check (the public edge answers 404 on /)"
          echo "      and, to feed the website from it, the DEMO_* lines of asbl/ci/demo-links.sh (DEMO_URL, DEMO_SITE_*)."
          echo "      asbl/ci/demo-public/setup.sh writes this file for you."
          return 1
        fi
        case "$(stat -c %a "$DEMO_DATAPALLAS_COM_CONF")" in
          600|400) ;;
          *) echo "FAIL  $DEMO_DATAPALLAS_COM_CONF must be readable by root only: chmod 600 $DEMO_DATAPALLAS_COM_CONF"; return 1 ;;
        esac
        # shellcheck disable=SC1090
        . "$DEMO_DATAPALLAS_COM_CONF" || return 1
        PUBLISH_SETTINGS_FILE="$DEMO_DATAPALLAS_COM_CONF"
        echo "publish target settings from $DEMO_DATAPALLAS_COM_CONF"
      fi
      ;;
  esac
  if [ -n "${PUBLISH_TARGET_ENV:-}" ]; then
    # shellcheck disable=SC1090
    . "$PUBLISH_TARGET_ENV" || { echo "FAIL  cannot read PUBLISH_TARGET_ENV=$PUBLISH_TARGET_ENV"; return 1; }
    PUBLISH_SETTINGS_FILE="$PUBLISH_TARGET_ENV"
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
  # the rules cover 172.16.0.0/12 only, so every Docker network must be inside it. An internal network
  # (`internal: true`) is the exception: its containers reach neither the host nor anything outside the
  # network, so no traffic of it goes through these rules and its subnet can be anything (virgil's
  # agents_key_proxy_net, 10.89.77.0/28, is one).
  outside=$(docker network ls -q | xargs -r docker network inspect -f '{{.Name}} {{.Internal}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' |
    python3 -c '
import ipaddress, sys
pool = ipaddress.ip_network(sys.argv[1])
for line in sys.stdin:
    name, internal, *subnets = line.split()
    if internal == "true":
        continue
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

# dp-dev frames three demo dashboards into the dev website through share links (asbl/ci/demo-links.sh; the same script feeds
# datapallas.com from demo.datapallas.com, see publish_provision), and every run that
# stops dp-dev also resets the testground those links live in: when dp-dev comes back they are gone, and the frames stay hidden
# without a word. So a watcher outside any SSH session waits for THIS run's container to be gone (its EXIT trap starts dp-dev again)
# and then has that script put the links back; the script itself waits until dp-dev answers. It only ever logs, so it cannot touch the
# run's result. Not "every dp-ci run": a long Windows run that never stops dp-dev must not hold it up. The shared dp-dev only: a
# private dev site (DP_DEV_CONTAINER) must not rewrite the shared website's .env.local.
demo_links_in_background() {
  [ "$DEV_CONTAINER" = datapallas-dev ] && [ -f "$REPO/asbl/ci/demo-links.sh" ] || return 0
  setsid nohup bash "$REPO/asbl/ci/demo-links.sh" >>"$LOG_DIR/demo-links.log" 2>&1 </dev/null &
}
demo_links_when_run_ends() {
  [ "$DEV_CONTAINER" = datapallas-dev ] && [ -f "$REPO/asbl/ci/demo-links.sh" ] || return 0
  setsid nohup bash -c "$(declare -p CONTAINER REPO LOG_DIR)
    while docker ps -q --filter name=\"^\$CONTAINER\\\$\" | grep -q .; do
      docker wait \"\$CONTAINER\" >/dev/null 2>&1 || sleep 2
    done
    bash \"\$REPO/asbl/ci/demo-links.sh\"" >>"$LOG_DIR/demo-links.log" 2>&1 </dev/null &
}

# =============================================================================
# WINDOWS VM LANE (plan §4 Phase W)
# =============================================================================
# The Windows half of a release runs on the libvirt VM win10-dev, driven from here and watched here:
# JUnit (W6), the Electron e2e suite (W7), packaging (W8) and the Robot UAT (W9).
#
# Reachability (W1). The VM is on libvirt's NAT network `default` (virbr0, host 192.168.122.1); its
# IP is pinned by a DHCP reservation on its NIC MAC, so a reboot cannot move it:
#     virsh net-dumpxml default | grep '<host mac'
#     -> one <host mac=... name=... ip=.../> line, the VM's own NIC MAC
# (That reservation named the wrong MAC until 2026-09-21 — virbr0's own — which would have gone live
# on the next network restart and moved the VM off .215. Check both views agree: --inactive and live.)
#
# On the VM: OpenSSH server, service Automatic, key-only (PasswordAuthentication no), the public key
# in C:\ProgramData\ssh\administrators_authorized_keys (icacls: Administrators + SYSTEM only), and one
# inbound rule `dp-ci-ssh` scoped to -RemoteAddress 192.168.122.1, so only this host can reach port 22.
# sshd lives in C:\Program Files\OpenSSH-Win64 — outside Chocolatey, so the baseline's choco removal
# (W3) cannot take our access with it. Setup script and log on the VM: C:\dp-ci\setup-sshd.ps1 / .log.
# The private key is root-only here and is never printed.
#
# ONE Windows account, the VM's existing local admin (O2: the CI runs on win10-dev itself, no clone).
# No CI account was created and no auto-logon is configured: Windows 10 allows one active console
# session, so a separate auto-logon session would be disconnected the moment the owner opens the VM in
# Guacamole — killing any GUI test running in it. With one account the console the owner watches IS
# the session the tests run in, which is what W2/W9 need and what makes a run watchable.
#
# WHERE THE CONNECTION SETTINGS LIVE. This repository is PUBLIC, so the machine's address, the account
# name and the key path are not written here: no account name, no host, no key, no credential of any
# kind belongs in a tracked file. They are read from a root-only file outside the repository, the same
# way the publish targets are (see load_publish_target above):
#
#     /var/kraft-internalsystems/config/datapallas-ci/win-ci.env   (chmod 600, root:root)
#         WIN_HOST=...
#         WIN_USER=...
#         WIN_SSH_KEY=/root/.ssh/<key>
#         WIN_REPO=<the VM's checkout path>   (only the Windows lane needs it)
#         WIN_KNOWN_HOSTS=/root/.ssh/<known_hosts file>
#
# The environment overrides the file, so a one-off run can point somewhere else without editing it.
WIN_CI_CONF="${WIN_CI_CONF:-/var/kraft-internalsystems/config/datapallas-ci/win-ci.env}"
if [ -r "$WIN_CI_CONF" ]; then
  case "$(stat -c %a "$WIN_CI_CONF")" in
    600|400) . "$WIN_CI_CONF" ;;
    *) echo "FAIL  $WIN_CI_CONF must be readable by root only: chmod 600 $WIN_CI_CONF" >&2; exit 1 ;;
  esac
fi
WIN_HOST="${WIN_HOST:-}"
WIN_USER="${WIN_USER:-}"
WIN_SSH_KEY="${WIN_SSH_KEY:-}"
# Where the VM's own checkout lives (W5). Kept with the other VM facts in win-ci.env rather than in
# this file: the repository is public, and a machine's directory layout is nobody else's business.
WIN_REPO="${WIN_REPO:-}"
WIN_KNOWN_HOSTS="${WIN_KNOWN_HOSTS:-}"
WIN_CONNECT_TIMEOUT="${WIN_CONNECT_TIMEOUT:-10}"

# Every win_* entry point goes through this first, so an unconfigured machine fails with a sentence that
# says what to do instead of an ssh error that does not.
win_conf_ok() {
  local missing=
  [ -n "$WIN_HOST" ]       || missing="$missing WIN_HOST"
  [ -n "$WIN_USER" ]       || missing="$missing WIN_USER"
  [ -n "$WIN_SSH_KEY" ]    || missing="$missing WIN_SSH_KEY"
  [ -n "$WIN_KNOWN_HOSTS" ] || missing="$missing WIN_KNOWN_HOSTS"
  [ -z "$missing" ] || { echo "FAIL  not configured:$missing - set them in $WIN_CI_CONF (chmod 600) or in the environment" >&2; return 1; }
}

# No firewall window, deliberately. W1 asked for a `dp-ci-win` window like the e2e one; it is not
# needed: the rule that blocks the e2e containers is an INPUT rule, and the host reaching a guest
# across virbr0 is not INPUT (ufw's routed policy is allow). Proven by `dp-ci.sh win check` answering
# while `ufw status | grep -c dp-ci-win` is 0 — which is also W1's "done when". A window nothing needs
# is only a wider surface, so dp-ci-win does not exist. setup-firewall.sh is untouched either way.

# Quoting, decided once (W1) so no caller has to think about it again. Windows OpenSSH hands the
# command line to cmd.exe, whose quoting rules are not POSIX — and differ again inside PowerShell.
# Hence exactly two entry points:
#   win_ssh <words...>   Handed to cmd.exe, which is already sshd's default shell on Windows — so do
#                        NOT wrap the command in `cmd /c`: that nests a second cmd and the quoting
#                        collapses (`win_ssh cmd /c ver` -> `'ver"' is not recognized`). Plain
#                        `win_ssh ver` is right. Short, quote-free commands only.
#   win_ps  < script     PowerShell, script on stdin, shipped as -EncodedCommand (UTF-16LE base64).
#                        Nothing is interpreted on the way: quotes, %, &, |, <, >, ^, backslashes and
#                        newlines arrive byte-for-byte, so nothing ever needs escaping. Use a quoted
#                        heredoc (<<'PS'). This is the entry point for everything non-trivial, and
#                        `win check` exercises it against the characters cmd.exe would otherwise eat.
# Both return the remote command's exit code; 255 is ssh's own "could not connect".
win_ssh() {  # runs "$@" on the VM through cmd.exe
  win_conf_ok || return 1
  local opts=( -i "$WIN_SSH_KEY"
    -o BatchMode=yes
    -o StrictHostKeyChecking="${WIN_HOST_KEY_CHECKING:-accept-new}"
    -o UserKnownHostsFile="$WIN_KNOWN_HOSTS"
    -o ConnectTimeout="$WIN_CONNECT_TIMEOUT"
    -o ServerAliveInterval=15       # a step can be silent for minutes; notice a dead VM within ~1 min
    -o ServerAliveCountMax=4 )
  ssh "${opts[@]}" "$WIN_USER@$WIN_HOST" "$@"
}

win_scp() {  # win_scp <local-file> <remote-path>   (remote path in C:/forward/slash form)
  win_conf_ok || return 1
  scp -q -i "$WIN_SSH_KEY" \
      -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o UserKnownHostsFile="$WIN_KNOWN_HOSTS" \
      -o ConnectTimeout="$WIN_CONNECT_TIMEOUT" \
      "$1" "$WIN_USER@$WIN_HOST:$2"
}

win_pull() {  # win_pull <remote-path> <local-path>   (remote path in C:/forward/slash form)
  win_conf_ok || return 1
  scp -q -i "$WIN_SSH_KEY" \
      -o BatchMode=yes \
      -o StrictHostKeyChecking="${WIN_HOST_KEY_CHECKING:-accept-new}" \
      -o UserKnownHostsFile="$WIN_KNOWN_HOSTS" \
      -o ConnectTimeout="$WIN_CONNECT_TIMEOUT" \
      ${WIN_SCP_EXTRA:-} \
      "$WIN_USER@$WIN_HOST:$1" "$2"
}

win_ps() {   # PowerShell script on stdin -> the VM, nothing interpreted on the way
  # PowerShell emits its progress stream to stderr as CLIXML noise ("#< CLIXML <Objs ...>") around
  # every command that reports progress; silencing it once here keeps every caller's output readable.
  local tmp b64 rc remote
  tmp=$(mktemp) || { echo "FAIL  could not create a temp file"; return 1; }
  { printf '%s\n' "\$ProgressPreference='SilentlyContinue'"; cat; } > "$tmp"

  # Windows caps a command line at 8191 characters, and -EncodedCommand is UTF-16LE base64, so the
  # payload is ~2.7x the script. Anything bigger has to travel as a FILE or the command line is
  # silently truncated ("The command line is too long."). Small scripts still go inline: one round
  # trip, and nothing is left on the VM's disk.
  b64=$(iconv -f UTF-8 -t UTF-16LE < "$tmp" | base64 -w0) || {
    rm -f "$tmp"; echo "FAIL  could not encode the PowerShell script"; return 1; }

  if [ "${#b64}" -lt 6000 ]; then
    win_ssh powershell -NoProfile -NonInteractive -EncodedCommand "$b64"; rc=$?
  else
    remote="C:/dp-ci/tmp/ps-$$-$(date +%s%N).ps1"
    win_ssh "if not exist C:\\dp-ci\\tmp md C:\\dp-ci\\tmp" >/dev/null 2>&1
    if ! win_scp "$tmp" "$remote"; then
      rm -f "$tmp"; echo "FAIL  could not copy the PowerShell script to the VM"; return 1; fi
    win_ssh powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$remote"; rc=$?
    win_ssh del "$(printf '%s' "$remote" | tr '/' '\\')" >/dev/null 2>&1
  fi
  rm -f "$tmp"
  return $rc
}

# -----------------------------------------------------------------------------
# W2. Run a step on the VM's DESKTOP, and watch it from Linux.
#
# Why this exists: Windows OpenSSH lands every command in session 0, the services session. Nothing
# with a window can run there - Electron starts and dies, and a GUI test would see nothing. Measured,
# not assumed: `(Get-Process -Id $PID).SessionId` over win_ssh answers 0, while `query session` shows
# the CI account's console as session 1.
#
# The primitive is a scheduled task created with /it (interactive only), which Windows runs inside
# that console session. Deliberately WITHOUT /ru and /rp: the task is created by the CI account for
# the CI account, so Windows asks for no password - and this CI never handles one. (Adding /ru turns
# the same command into a password prompt, for no gain: /it already pins it to that account's desktop.)
#
# The step is a .cmd file on the VM, not a command line: the task's /tr is then just a path, so
# nothing of the command is ever parsed by schtasks, cmd.exe quoting rules, or the SSH layer.
#
#   C:\dp-ci\runs\<step>\step.cmd    what runs
#   C:\dp-ci\runs\<step>\step.log    everything it printed
#   C:\dp-ci\runs\<step>\step.exit   EXIT=<code>, written only when it is over (EXIT=97 and a second line
#                                     saying why when the step could not write step.log, so did not run)
#
# Because the task belongs to the scheduler and not to sshd, dropping the SSH connection - or this
# script being killed - does not kill the step. That is the whole point: a two-hour e2e must not
# depend on a TCP connection staying up for two hours.
WIN_RUNS='C:\dp-ci\runs'
WIN_RUN_WATCH="${WIN_RUN_WATCH:-}"

# Refuse rather than hang. A task created with /it when nobody is logged on at the console is created
# happily and then runs nowhere: the step would sit there with an empty log until the timeout, which
# is the worst failure mode of the lot - it looks exactly like a slow build.
win_console_ok() {
  local out
  # query.exe prints the table and THEN exits 1, because it cannot enumerate the services session.
  # So its exit code says nothing; only the output does. Emptiness is the real failure.
  out=$(win_ssh query session 2>&1)
  [ -n "$out" ] || { echo "FAIL  could not read the VM's session list" >&2; return 1; }
  # The account name is never echoed: a CI log gets pasted around, and this repo is public.
  if printf '%s\n' "$out" | grep -qiE "^[[:space:]>]*console[[:space:]]+${WIN_USER}[[:space:]]+[0-9]+[[:space:]]+Active"; then
    return 0
  fi
  cat >&2 <<'MSG'
FAIL  the VM has no Active Console session for the CI account, so a desktop step cannot run.
      Two ways out:
        (a) log in once on the VM's desktop through Guacamole, or
        (b) enable auto-logon for that account, so the desktop is there after every reboot.
MSG
  return 1
}

# win_run_start <step> <windows-working-dir> <command...>   - launch, do not wait.
win_run_start() {
  local step="${1:-}" wdir="${2:-}"; shift 2 2>/dev/null || true
  local cmd="$*" dir tmp
  [ -n "$step" ] && [ -n "$wdir" ] && [ -n "$cmd" ] || { echo "FAIL  win_run_start <step> <working-dir> <command...>" >&2; return 2; }
  case "$step" in *[!A-Za-z0-9_-]*) echo "FAIL  step name may only contain letters, digits, - and _" >&2; return 2 ;; esac
  win_console_ok || return 1

  # WIN_RUN_ELEVATE=1: the task itself runs elevated. A step that installs or uninstalls software - the
  # Robot UAT does, in every prerequisites and different-java-versions test - meets a UAC prompt when it runs
  # unelevated, and that prompt sits on the VM's desktop with nobody to answer it: the teardown of
  # 2026-10-25 stalled there (group H). A scheduled task launched with /rl highest is already elevated, so
  # no prompt appears. It needs an administrator account on the VM: without one schtasks says "Access is
  # denied" and the task is never created - named below, not discovered as an empty log an hour later.
  local rl="" elev_note=""
  if [ "${WIN_RUN_ELEVATE:-}" = 1 ]; then
    rl="/rl highest "
    elev_note=" (WIN_RUN_ELEVATE=1: is the CI account an administrator on the VM?)"
  fi

  # One driver per step name. Two drivers on the same name do not just interleave their logs: when
  # the first one finishes it calls win_run_stop, which kills the process tree of the step the SECOND
  # one started, and that step dies with no exit marker and no explanation. Refuse instead.
  if win_ssh schtasks /query /tn "dp-ci-$step" 2>/dev/null | grep -qi running; then
    echo "FAIL  a step called '$step' is already running on the VM." >&2
    echo "      Wait for it, watch it with: $0 win poll $step [offset]" >&2
    echo "      or stop it with:            $0 win stop $step" >&2
    return 1
  fi
  dir="$WIN_RUNS\\$step"

  # Built here and copied over, never interpolated into a command line. CRLF because cmd.exe treats a
  # lone LF at the end of a line as part of the command.
  # Two files, on purpose. run.cmd is what the scheduled task points at, so /tr stays a BARE PATH:
  # schtasks parses its own /tr argument, and a redirection inside it is rejected outright
  # ("Invalid argument/option - '>'"). Keeping the redirection in a .cmd sidesteps schtasks quoting,
  # cmd.exe quoting and SSH quoting all at once. %~dp0 is run.cmd's own folder, trailing slash included.
  tmp=$(mktemp) || return 1
  {
    echo '@echo off'
    # The private toolchain, same as the Linux image: JDK 17 + Maven 3.9.9 + Node 20. JAVAC_COMPILER_PATH
    # is what keeps asbl/Utils.java off the broken Temurin that is still installed machine-wide (F-6.8).
    if [ "${WIN_RUN_BARE:-}" = 1 ]; then
      # WIN_RUN_BARE=1: a step that must meet the machine as a user's does - the Java installed on it, never the
      # CI's (the server installed as its page says, the Robot UAT). No toolchain, and the environment read
      # again from the registry (Chocolatey's refreshenv), so not even the session's copy of it is left.
      echo 'set "JAVA_HOME="'
      echo 'set "PATH=%PATH:C:\ci\tools\jdk-17\bin;=%"'
      echo 'where /q refreshenv && call refreshenv >nul'
    else
      echo 'set "JAVA_HOME=C:\ci\tools\jdk-17"'
      echo 'set "JAVAC_COMPILER_PATH=C:\ci\tools\jdk-17\bin\javac.exe"'
      echo 'set "PATH=C:\ci\tools\jdk-17\bin;C:\ci\tools\maven\bin;C:\ci\tools\node;%PATH%"'
    fi
    # Anything else the step needs, one NAME=VALUE per line. It has to be written INTO the file:
    # environment variables do not survive the SSH boundary, and the scheduled task does not inherit
    # our environment either - it inherits the console session's. Quoted the `set "N=V"` way, so a
    # value containing & | < > ^ (the e2e regexes do) is data and not cmd.exe syntax.
    if [ -n "${WIN_RUN_ENV:-}" ]; then
      while IFS= read -r kv; do
        [ -n "$kv" ] || continue
        echo "set \"$kv\""
      done <<< "$WIN_RUN_ENV"
    fi
    echo "cd /d \"$wdir\" || exit /b 90"
    echo "echo ===== step $step on the desktop, %DATE% %TIME% ====="
    echo "call $cmd"
  } | sed 's/$/\r/' > "$tmp"
  win_ssh "if not exist \"$dir\" md \"$dir\"" >/dev/null 2>&1
  win_scp "$tmp" "$(printf '%s' "$dir\\step.cmd" | tr '\\' '/')" || { rm -f "$tmp"; echo "FAIL  could not copy the step to the VM" >&2; return 1; }

  {
    echo '@echo off'
    # DPRAN says the step itself ran. When step.log cannot be opened (a program left running by an earlier
    # run of this step still holds it: a UAT's chromedriver.exe, 2026-10-26), cmd skips the redirected call
    # and ERRORLEVEL stays 0, so the step came back EXIT=0 without having run. That is a failure: EXIT=97,
    # and step.exit's second line says why (win_run prints it).
    echo 'set "DPRAN="'
    echo 'call :step > "%~dp0step.log" 2>&1'
    # The redirection goes FIRST, deliberately. Written the natural way round,
    # `echo EXIT=%ERRORLEVEL%>"...step.exit"`, cmd reads the digit glued to the `>` as a file HANDLE
    # - `0>` is "redirect stdin" - so on success it redirected handle 0 and wrote an empty file. The
    # step then had no exit code at all, and every failure came back looking like EXIT=0.
    echo 'set DPRC=%ERRORLEVEL%'
    echo 'if not defined DPRAN goto nolog'
    echo '>"%~dp0step.exit" echo EXIT=%DPRC%'
    echo 'exit /b %DPRC%'
    echo ':step'
    echo 'set "DPRAN=1"'
    echo 'call "%~dp0step.cmd"'
    echo 'exit /b %ERRORLEVEL%'
    echo ':nolog'
    echo '('
    echo '  echo EXIT=97'
    echo '  echo !!! the step did not run: %~dp0step.log could not be written. Another process holds it open, a program left running by an earlier run of this step.'
    echo ') >"%~dp0step.exit"'
    echo 'exit /b 97'
  } | sed 's/$/\r/' > "$tmp"
  win_scp "$tmp" "$(printf '%s' "$dir\\run.cmd" | tr '\\' '/')" || { rm -f "$tmp"; echo "FAIL  could not copy the launcher to the VM" >&2; return 1; }
  rm -f "$tmp"

  # The task itself redirects into step.log, so /tr stays a bare path with no quoting to get wrong.
  # /st is in the past on purpose: the trigger never fires by itself, `schtasks /run` is what starts it.
  win_ps <<PS
\$ErrorActionPreference = "Continue"
# Both go before the task is created, not inside step.cmd: otherwise the first poll can read the
# PREVIOUS run's step.exit in the moment before the new step starts, and call it finished.
Remove-Item "$dir\\step.log" -ErrorAction SilentlyContinue
Remove-Item "$dir\\step.exit" -ErrorAction SilentlyContinue
& schtasks /create /f /tn "dp-ci-$step" /sc once /st 00:00 /it ${rl}/tr "$dir\\run.cmd" | Out-Null
if (\$LASTEXITCODE -ne 0) { "FAIL  could not create the task$elev_note"; exit 1 }
& schtasks /run /tn "dp-ci-$step" | Out-Null
if (\$LASTEXITCODE -ne 0) { "FAIL  could not start the task"; exit 1 }
"STARTED $step"
PS
}

# win_run_poll <step> <byte-offset>   - print new log bytes, then @@OFF/@@EXIT markers for the caller.
win_run_poll() {
  local step="${1:-}" off="${2:-0}" dir
  [ -n "$step" ] || { echo "FAIL  win_run_poll <step> [offset]" >&2; return 2; }
  dir="$WIN_RUNS\\$step"
  win_ps <<PS
\$ErrorActionPreference = "SilentlyContinue"
\$log = "$dir\\step.log"; \$off = [int64]$off; \$len = \$off
if (Test-Path \$log) {
  # Opened with FileShare ReadWrite: the step is writing to this very file right now.
  \$fs = [IO.File]::Open(\$log, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  \$len = \$fs.Length
  if (\$off -lt \$len) { \$fs.Position = \$off; \$sr = New-Object IO.StreamReader(\$fs); \$sr.ReadToEnd() }
  \$fs.Close()
}
"@@OFF \$len"
\$w = "$WIN_RUN_WATCH"
if (\$w -and (Test-Path \$w)) { "@@WATCH " + (Get-Item \$w).Length } else { "@@WATCH 0" }
if (Test-Path "$dir\\step.exit") {
  \$m = (Get-Content "$dir\\step.exit" -Raw)
  if (\$m) { \$m = \$m.Trim() }
  if (\$m) { "@@EXIT " + \$m } else { "@@EXIT EMPTY" }
} else { "@@EXIT NONE" }
PS
}

# win_run_stop <step>   - end the task and everything it started, then forget the task.
win_run_stop() {
  local step="${1:-}"
  [ -n "$step" ] || { echo "FAIL  win_run_stop <step>" >&2; return 2; }
  win_ps <<PS
\$ErrorActionPreference = "SilentlyContinue"
& schtasks /end /tn "dp-ci-$step" 2>&1 | Out-Null
\$t = Get-ScheduledTask -TaskName "dp-ci-$step" -ErrorAction SilentlyContinue
if (\$t) {
  # /end stops the task; the tree it spawned (node, java, electron) outlives it, so kill that too.
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { \$_.CommandLine -like "*$step\\*.cmd*" } |
    ForEach-Object { & taskkill /pid \$_.ProcessId /t /f 2>&1 | Out-Null }
}
& schtasks /delete /f /tn "dp-ci-$step" 2>&1 | Out-Null
"STOPPED $step"
PS
}

# win_run <step> <windows-working-dir> <command...>   - launch on the desktop and watch to the end.
# WIN_RUN_TIMEOUT  overall seconds before it is killed (default 3h - an Electron e2e is long).
# WIN_RUN_STALL    seconds with no new log output before it is called stalled (default 20m; 0 = never).
#                  Callers whose step can legitimately go quiet for longer must raise it - win_e2e does.
# WIN_RUN_EVERY    seconds between polls (default 20).
# WIN_RUN_WATCH    a second file on the VM whose growth also counts as progress. The Windows pack
#                  scripts redirect Maven into their OWN log (asbl\pack-*.log) and print almost
#                  nothing themselves, so step.log can sit unchanged for half an hour while the build
#                  is perfectly healthy - and the stall timer would then kill it. Point this at that
#                  log. Nothing about the scripts changes; this only teaches the watcher where to look.
win_run() {
  local step="${1:-}"
  [ $# -ge 3 ] || { echo "FAIL  win_run <step> <windows-working-dir> <command...>" >&2; return 2; }
  local timeout="${WIN_RUN_TIMEOUT:-10800}" stall="${WIN_RUN_STALL:-1200}" every="${WIN_RUN_EVERY:-20}"
  local start now off=0 last_out chunk code line quiet watch=0 watch_prev=0

  win_run_start "$@" || return 1
  start=$(date +%s); last_out=$start
  echo ">>> $step started on the VM desktop  $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  while :; do
    sleep "$every"
    chunk=$(win_run_poll "$step" "$off" 2>&1) || { echo "WARN  could not reach the VM; retrying"; continue; }
    code=""
    while IFS= read -r line; do
      # PowerShell sends CRLF. Without stripping the CR, "@@EXIT NONE\r" misses its own case and is
      # read as a finish code - which ends the watch, and kills a step that is running perfectly well.
      line="${line%$'\r'}"
      case "$line" in
        '@@OFF '*)  [ "${line#@@OFF }" -ge 0 ] 2>/dev/null && off="${line#@@OFF }" ;;
        '@@WATCH '*) watch="${line#@@WATCH }" ;;
        '@@EXIT NONE') ;;
        '@@EXIT EMPTY') code=EMPTY ;;
        '@@EXIT '*) code="${line#@@EXIT }" ;;
        *) printf '%s\n' "$line"; last_out=$(date +%s) ;;
      esac
    done <<< "$chunk"

    if [ -n "$code" ]; then
      echo "<<< $step finished  $code  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      win_run_stop "$step" >/dev/null 2>&1
      case "$code" in
        EXIT=0) return 0 ;;
        EXIT=*) return "${code#EXIT=}" ;;
        EMPTY)  echo "!!! $step wrote an empty exit marker - it finished, but its exit code is lost." >&2
                echo "    Read the log; do NOT read this as success." >&2; return 125 ;;
        *)      return 1 ;;
      esac
    fi

    # A growing watch file is the step working, just not talking.
    if [ "$watch" -gt "$watch_prev" ] 2>/dev/null; then watch_prev="$watch"; last_out=$(date +%s); fi

    now=$(date +%s)
    quiet=$(( now - last_out ))
    if [ "$stall" -gt 0 ] && [ "$quiet" -ge "$stall" ]; then
      echo "!!! $step printed nothing for ${quiet}s - treating it as stalled and killing it"
      win_run_stop "$step"; return 124
    fi
    if [ $(( now - start )) -ge "$timeout" ]; then
      echo "!!! $step is still going after ${timeout}s - killing it"
      win_run_stop "$step"; return 124
    fi
  done
}

# ---------------------------------------------------------------------------
# the number from Playwright's summary line "<N> <what>" (e.g. "8 passed (50.6s)"), 0 when absent.
# Top level, not nested in the Linux task, because the Windows lane exits before that function is ever
# defined - and both lanes must count a run the same way or their numbers cannot be compared.
e2e_count() {
  local n
  n=$(grep -aE "^(stdout:)? *[0-9]+ $1( \(.*\))? *$" "$2" | tail -1 | grep -oE "[0-9]+" | head -1)
  echo "${n:-0}"
}

# W7. The Electron e2e, on the VM's own desktop.
#
# Same shape as the Linux lane's e2e_web(): clean the testground, then run the ONE gulp task that
# `npm run custom:start-server-and-e2e-electron` ends in. We call the gulp task rather than the npm
# script for exactly the reason the Linux lane does - the npm script also pulls in `precustom:`, the
# Jasmine updater suite, which is a unit suite and not part of an e2e verdict. Nothing under frend/
# changes: this only chooses which existing entry point to call.
#
# What is deliberately NOT here, compared with Linux: no xvfb (W2 gives a real desktop) and no
# E2E_CHROMIUM_EXECUTABLE (the target IS Electron, so the engine under test is the product's own).
# gulp's _refreshEnv() overwrites PATH from the registry before it checks for java and mvn, so the
# toolchain has to be on the Machine PATH for this to work at all - see plan 6.8/6.8.1.
# Put the VM's checkout on origin/main before a Windows run, so it tests pushed code and says which. Strictly a
# fast-forward: never reset, clean or checkout -- (plan §0.3). A tree with local changes or a history that cannot
# fast-forward stops the run and changes nothing. The Linux lane tests this host's working tree as it is, so a
# difference between the two (unpushed or uncommitted work here) is printed, not hidden.
win_sync_repo() {
  local vm host dirty
  win_ssh "git -C $WIN_REPO fetch -q origin" >/dev/null 2>&1 ||
    { echo "FAIL  the VM could not fetch origin (no network to GitHub?) - not running on code of unknown age." >&2; return 2; }
  dirty=$(win_ssh "git -C $WIN_REPO status --porcelain --untracked-files=no" 2>&1 | tr -d '\r')
  [ -z "$dirty" ] || {
    echo "FAIL  the VM's checkout has local changes to tracked files; nothing was touched:" >&2
    printf '%s\n' "$dirty" | head -10 >&2; return 2; }
  win_ssh "git -C $WIN_REPO merge -q --ff-only origin/main" >/dev/null 2>&1 ||
    { echo "FAIL  the VM's checkout cannot fast-forward to origin/main (diverged or not on main); nothing was changed." >&2; return 2; }
  vm=$(win_ssh "git -C $WIN_REPO rev-parse --short HEAD" 2>/dev/null | tr -d '\r' | tail -1)
  host=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)
  echo "WIN_E2E_COMMIT=$vm"
  [ "$vm" = "$host" ] || echo "WARN  this host is at $host, the VM tests $vm: the Linux lane and this one are not testing the same commit." >&2
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ] ||
    echo "WARN  this host has uncommitted changes; the VM cannot see them." >&2
  return 0
}

# The Windows twin of prepare_package: the VM's package (asbl\\target\\package) is what its testground is copied
# from, and nothing else rebuilds it. Runs asbl\\pack-prepare-for-e2e.bat UNCHANGED, on the desktop, when the
# stamp left by the last successful run is not the VM's commit.
win_prepare_package() {
  local vm built pkg="$WIN_REPO\\asbl\\target\\package"
  vm=$(win_ssh "git -C $WIN_REPO rev-parse --short HEAD" 2>/dev/null | tr -d '\r' | tail -1)
  [ -n "$vm" ] || { echo "FAIL  could not read the VM's commit" >&2; return 2; }
  built=$(win_ssh "type $pkg\\.built-from" 2>/dev/null | tr -d '\r' | tail -1)
  if [ "$built" = "$vm" ] && win_ssh "if exist $pkg\\verified-db-noexe\\DataPallas echo yes" 2>/dev/null | grep -q yes; then
    echo "WIN_E2E_PACKAGE=current ($vm)"
    return 0
  fi
  echo "WIN_E2E_PACKAGE=stale (built from '${built:-nothing}', the VM is at $vm) - running pack-prepare-for-e2e.bat on the desktop"
  win_ssh "if exist $pkg\\.built-from del /q $pkg\\.built-from" >/dev/null 2>&1
  # The package's web-component bundle is built by `vite build` in frend\rb-webcomponents, which needs its devDependencies
  # (daisyui). The Linux lane installs them in npm_install; nothing did here, so the bundle was missing from the package
  # of the 2026-10-19 run-all C build while the prepare step still ended with BUILD SUCCESS.
  win_run npmwc "$WIN_REPO\\frend\\rb-webcomponents" 'npm ci --force' || {
    echo "!!! npm ci in frend\\rb-webcomponents failed on the VM" >&2; return 1; }
  # A build killed by an earlier run (win_run_stop only ends the step's own cmd.exe) can leave Maven and its test JVM
  # alive, holding the files this step deletes: the 2026-10-03 rerun then "finished" in 3 minutes with exit 0 and no
  # package. Only processes of the CI's private toolchain (C:\ci\tools) are touched.
  win_ps >/dev/null 2>&1 <<'PS'
Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Where-Object { $_.CommandLine -like '*C:\ci\tools\*' } |
  ForEach-Object { & taskkill /pid $_.ProcessId /t /f 2>&1 | Out-Null }
PS
  # mvn writes to the bat's own log, so that file growing is the proof of life. The step runs the product's whole
  # JUnit suite (NoExeAssembler's `mvn clean install` has no -DskipTests) and one test class is quiet for 13+
  # minutes, so the silence budget is the same as the cap: 40 minutes of it killed the first run (2026-10-03).
  WIN_RUN_WATCH="$WIN_REPO\\asbl\\pack-prepare-for-e2e.log" WIN_RUN_TIMEOUT=14400 WIN_RUN_STALL=7200 \
    win_run prepare "$WIN_REPO\\asbl" 'pack-prepare-for-e2e.bat' || {
      echo "!!! the prepare step failed; its log is asbl\\pack-prepare-for-e2e.log on the VM" >&2; return 1; }
  win_ssh "if not exist $pkg\\verified-db-noexe\\DataPallas exit /b 1" >/dev/null 2>&1 ||
    { echo "!!! the prepare step did not produce verified-db-noexe" >&2; return 1; }
  win_ssh ">\"$pkg\\.built-from\" echo $vm" >/dev/null 2>&1
  echo "WIN_E2E_PACKAGE=built ($vm)"
}

# Docker Desktop is a hard prerequisite of both Windows lanes, not an optional extra: every containerised
# app the specs start (analytics-olap, apps-ai-hub, apps-cms-wordpress, apps-custom and the
# grails/nextjs family) goes through e2e/helpers/docker-test-helper.ts. With the daemon down they
# do NOT fail fast - each one walks into "Please start Docker before - Docker is NEEDED to run
# this", gets retried, and the run carries on for hours collecting failures that mean nothing.
# The 2026-09-21 full run lost its first 2h19m and ~20 tests that way (plan 6.18). Five seconds
# of asking the VM, before the testground is touched, is the whole fix. Docker Desktop does not start
# by itself after a VM restart. Each lane asks at its very top, before the sync (prereq vm-docker).
win_docker_ok() {
  local dockerv
  dockerv=$(win_ssh 'docker info --format "{{.ServerVersion}}"' 2>&1 | tr -d '\r' | tail -1)
  case "$dockerv" in
    ''|*[Ee]rror*|*'cannot connect'*|*'not running'*|*'dockerDesktopLinuxEngine'*)
      echo "FAIL  Docker Desktop is not running on the VM - the e2e suite needs it." >&2
      echo "      docker info said: ${dockerv:-<no output>}" >&2
      echo "      Start it in the VM's desktop session, wait until 'docker info' answers, re-run." >&2
      return 2 ;;
  esac
  echo "WIN_E2E_DOCKER=$dockerv"
}

# What gulp's _startServerAndDoX finds on the VM before it starts the server (frend/reporting/scripts-dev/gulp/utils.js):
# PATH and JAVA_HOME read again from the registry, Machine then User (_refreshEnv), `java -version` runs (_isJavaAvailable),
# mvn or mvn.cmd in a folder of that PATH (_isMavenAvailable). Prints VM_JAVA=<version>|missing|unknown and
# VM_MVN=found|missing. Only reads.
win_java_probe() {
  win_ps 2>/dev/null <<'PS' | tr -d '\r'
$m = [Environment]::GetEnvironmentVariable('Path', 'Machine'); $u = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($m -or $u) { $env:Path = (@($m, $u) | Where-Object { $_ }) -join ';' }
$h = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine'); if (-not $h) { $h = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User') }
if ($h) { $env:JAVA_HOME = $h }
$v = @(& cmd.exe /c 'java -version 2>&1')
if ($LASTEXITCODE -ne 0) { 'VM_JAVA=missing' } elseif (($v -join "`n") -match 'version "([^"]+)"') { 'VM_JAVA=' + $matches[1] } else { 'VM_JAVA=unknown' }
$mvn = @($env:Path.Split(';') | Where-Object { $d = $_; $d -and @('mvn', 'mvn.cmd' | Where-Object { try { Test-Path -LiteralPath (Join-Path $d $_) -PathType Leaf } catch { $false } }).Count })
if ($mvn.Count) { 'VM_MVN=found' } else { 'VM_MVN=missing' }
PS
}

# prereq <check...>: what a job needs, checked in seconds before it starts anything slow. Every Linux task checks docker
# first (the launcher below), each Windows lane its own set at its top, and a caller checks before its own slow part
# (dp-ci.sh prereq ..., dp-ci.sh win prereq <lane>: step 1's Jenkinsfile, jenkins/release-demos.sh, the release preflight
# asbl/ci/release-publish.sh). One line per check, OK <what> or MISSING <what>: <what to do>, every check run even after
# one fails (NOT CHECKED: it needs something MISSING above); then PREREQUISITES OK, exit 0, or PREREQUISITES MISSING
# (<n>), exit 1. The checks only read. Names only: never the VM's address, never a value of win-ci.env.
#   docker                 this host's Docker engine answers (docker info)
#   vm                     win-ci.env's settings, and the VM answers over SSH
#   vm-docker              Docker Desktop runs on the VM (win_docker_ok)
#   vm-java                Java 17 runs from the VM's PATH as the registry has it (gulp's java test, win_java_probe); it is
#                          also the Java startServer.bat runs on
#   vm-mvn                 Maven on that PATH (gulp's Maven test); without it gulp tests the Install screen, not the app
#   vm-free                no other Windows run is going (win-e2e.pid; a run checking from inside its own driver is not "other")
#   publish-target <task>  the publish target of publish-demo-datapallas.com (load_publish_target),
#                          nothing published
prereq() {
  local c n names miss=0 vm_ok=0 v pid p t java=""
  while [ "$#" -gt 0 ]; do
    c=$1; shift
    case "$c" in
      docker)
        if v=$(timeout 30 docker info --format '{{.ServerVersion}}' 2>/dev/null) && [ -n "$v" ]; then
          echo "OK the Docker engine on this host answers ($v)"
        else
          echo "MISSING a running Docker engine on this host: start it (systemctl start docker), then run the job again"
          miss=$((miss + 1))
        fi ;;
      vm)
        names=""
        for n in WIN_HOST WIN_USER WIN_SSH_KEY WIN_KNOWN_HOSTS WIN_REPO; do [ -n "${!n}" ] || names="$names $n"; done
        if [ -n "$names" ]; then
          names="${names# }"; echo "MISSING ${names// /, } in $WIN_CI_CONF: the Windows VM's settings (root-only, chmod 600; see its comments at the top of asbl/ci/dp-ci.sh)"
          miss=$((miss + 1))
        elif ! win_ssh ver >/dev/null 2>&1; then
          echo "MISSING an answer from the Windows VM over SSH (the VM of $WIN_CI_CONF): start the VM, or repair its SSH, then run the job again"
          miss=$((miss + 1))
        else
          echo "OK the Windows VM answers over SSH"; vm_ok=1
        fi ;;
      vm-docker)
        if [ "$vm_ok" != 1 ]; then
          echo "NOT CHECKED Docker Desktop on the Windows VM: it needs the VM above"
        elif v=$(win_docker_ok 2>/dev/null); then
          echo "OK Docker Desktop runs on the Windows VM (${v#WIN_E2E_DOCKER=})"
        else
          echo "MISSING Docker Desktop running on the Windows VM: start it in the VM's desktop session, wait until docker info answers, then run the job again"
          miss=$((miss + 1))
        fi ;;
      vm-java|vm-mvn)
        if [ "$vm_ok" != 1 ]; then
          echo "NOT CHECKED $([ "$c" = vm-java ] && echo 'Java 17' || echo Maven) on the Windows VM: it needs the VM above"
          continue
        fi
        [ -n "$java" ] || java=$(win_java_probe)
        if [ "$c" = vm-mvn ]; then
          if [ "$(printf '%s\n' "$java" | sed -n 's/^VM_MVN=//p')" = found ]; then
            echo "OK Maven (mvn) on the Windows VM's PATH (as the registry has it, read the way gulp reads it)"
          else
            echo "MISSING Maven (mvn) on the Windows VM: no mvn or mvn.cmd in a folder of the PATH the registry gives (Machine, then User, as gulp reads it); windows-vm-electron's gulp builds and starts the server with it, and without it tests the Install screen instead of the app (exit=no-server). Put Maven's bin folder on the machine PATH (choco install maven), then run the job again"
            miss=$((miss + 1))
          fi
          continue
        fi
        v=$(printf '%s\n' "$java" | sed -n 's/^VM_JAVA=//p')
        n=${v%%.*}; [ "$n" = 1 ] && { n=${v#1.}; n=${n%%.*}; }   # 1.8.0 -> 8
        case "$v" in
          ''|missing)
            echo "MISSING Java 17 on the Windows VM: java -version does not run from the PATH the registry gives (Machine, then User, as gulp reads it); windows-vm-electron's gulp starts the server with it and windows-vm-server's startServer.bat runs on it. Install it on the machine (choco install temurin17, as ensure_java_is_installed('17') in asbl/src/uat/resources/utilities.py does), then run the job again"
            miss=$((miss + 1)) ;;
          *)
            if [ "$n" -ge 17 ] 2>/dev/null; then
              echo "OK Java $v runs on the Windows VM (its PATH as the registry has it, read the way gulp reads it)"
            else
              echo "MISSING Java 17 on the Windows VM: the PATH the registry gives runs Java '$v'; windows-vm-electron's gulp starts the server with it and windows-vm-server's startServer.bat runs on it. Install Java 17 on the machine (choco install temurin17), then run the job again"
              miss=$((miss + 1))
            fi ;;
        esac ;;
      vm-free)
        pid=$(cat "$LOG_DIR/win-e2e.pid" 2>/dev/null)
        p=$$
        while [ -n "$pid" ] && [ -n "$p" ] && [ "$p" -gt 1 ] && [ "$p" != "$pid" ]; do p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' '); done
        if [ -n "$pid" ] && [ "$p" != "$pid" ] && kill -0 "$pid" 2>/dev/null; then
          echo "MISSING a free Windows VM: another Windows run is going (pid $pid, $LOG_DIR/win-e2e.pid); wait until it ends (follow it: FOLLOW_PIDFILE=$LOG_DIR/win-e2e.pid bash asbl/ci/jenkins/follow-ci.sh attach), then run the job again"
          miss=$((miss + 1))
        else
          echo "OK no other Windows run is going"
        fi ;;
      publish-target)
        t=${1:-}; [ "$#" -gt 0 ] && shift
        case "$t" in
          publish-demo-datapallas.com) ;;
          *) echo "FAIL  prereq: publish-target needs publish-demo-datapallas.com (got '$t')"; return 2 ;;
        esac
        if v=$( (load_publish_target "$t") 2>&1 ); then
          echo "OK the publish target of $t (its settings and its docker-compose.yml; nothing published)"
        else
          v=$(printf '%s\n' "$v" | sed -n 's/^FAIL  //p' | head -1)
          echo "MISSING a ready publish target for $t: ${v:-its settings could not be read}; set it up (bash asbl/ci/dp-ci.sh $t with DRY_RUN=1 says how), then run the job again"
          miss=$((miss + 1))
        fi ;;
      *) echo "FAIL  prereq: unknown check '$c' (docker, vm, vm-docker, vm-java, vm-mvn, vm-free, publish-target <task>)"; return 2 ;;
    esac
  done
  if [ "$miss" = 0 ]; then echo "PREREQUISITES OK"; return 0; fi
  echo "PREREQUISITES MISSING ($miss): nothing was started. Fix what is listed above, then run the job again."
  return 1
}
# win prereq <lane>: what that Windows lane needs, for a caller to check before its own slow part (the lane checks the same
# at its top, but after the caller's build), plus vm-free: the caller is about to start a Windows run
win_prereq() {
  case "${1:-}" in
    e2e)        prereq vm vm-docker vm-java vm-mvn vm-free ;;
    docker-e2e) prereq vm vm-docker docker vm-free ;;
    server-e2e) prereq vm vm-docker vm-java vm-free ;;
    release)    prereq vm vm-free ;;
    *) echo "usage: $0 win prereq e2e|docker-e2e|server-e2e|release"; return 2 ;;
  esac
}

# A build killed at its cap (win_run_stop only ends the step's process tree) leaves the app stacks its tests
# started running, and Docker Desktop's bind mounts keep their files open: after the killed run-all C #29,
# nine flowkraft-ai-hub-* containers held testground\e2e\_apps\...\synapse\homeserver.log, and #30's
# clean-testground retried for 20+ minutes until they were stopped by hand. Linux unlinks open files, and
# its docker-server lane takes its stacks down itself. Only compose projects whose working directory is
# inside this checkout's testground are touched, and without -v.
# win_stacks_down server   also takes down, with -v, what the Docker server started through docker.sock: compose
# records the working dir the server passed, which is the container's own /app or the bundle's folder in
# whatever form Docker Desktop shows it to the container (the same rule as docker_server_down on Linux).
win_stacks_down() {
  local server=0
  [ "${1:-}" = server ] && server=1
  win_ps 2>&1 <<PS | tr -d '\r'
\$ErrorActionPreference = "Continue"
\$testground = '$WIN_REPO\\frend\\reporting\\testground\\'
\$server = $server
\$projects = @{}
foreach (\$id in (& docker ps -aq)) {
  # PowerShell 5.1 strips the quotes of {{.Label "..."}}, so the labels are read as JSON.
  \$labels = (& docker inspect \$id --format '{{json .Config.Labels}}') | ConvertFrom-Json
  \$dir = \$labels.'com.docker.compose.project.working_dir'
  \$project = \$labels.'com.docker.compose.project'
  if (-not (\$project -and \$dir)) { continue }
  if (\$dir.StartsWith(\$testground, [StringComparison]::OrdinalIgnoreCase)) { \$projects[\$project] = '' }
  elseif (\$server -and (\$dir -match '^/app(/|\$)' -or (\$dir -replace '\\\\', '/') -match '/frend/reporting/testground/docker-server/')) { \$projects[\$project] = '-v' }
}
foreach (\$project in \$projects.Keys) {
  if (\$projects[\$project]) { & docker compose -p \$project down -v --remove-orphans 2>&1 | Out-Null }
  else { & docker compose -p \$project down --remove-orphans 2>&1 | Out-Null }
  "WIN_E2E_LEFTOVER_STACK=\$project taken down"
}
PS
}

# Playwright workers that are killed leave their playwright-artifacts-* folders in %TEMP% behind: on 2026-10-20
# there were 398 of them, 30.85 GB, with 12.9 GB free on C:. Each run makes its own new ones.
win_temp_clean() {
  win_ps 2>&1 <<'PS' | tr -d '\r'
$left = @(Get-ChildItem -Path $env:TEMP -Directory -Filter 'playwright-artifacts-*' -ErrorAction SilentlyContinue)
$left | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$freed = @($left | Where-Object { -not (Test-Path -LiteralPath $_.FullName) }).Count
"WIN_E2E_TEMP_FREED=$freed folders"
PS
}

win_e2e() {
  local mode=targeted out code retries spec gexp
  # what the lane needs, in seconds, before the sync and the package rebuild (hours): the VM, its Docker Desktop, and the
  # Java and Maven gulp looks for (without them it tests the Install screen, exit=no-server, at the very end)
  prereq vm vm-docker vm-java vm-mvn || return 2
  mark_start "windows-vm-electron STEP 1/2" "the VM's package: sync to origin/main, pack-prepare-for-e2e.bat when it is not from that commit"
  win_sync_repo || return $?
  win_prepare_package || return $?
  mark_next "windows-vm-electron STEP 2/2" "the tests: gulp utils:start-server-and-e2e-electron, then the reports pulled"
  spec="${E2E_SPEC:-}"; gexp="${E2E_GREP:-}"
  # A full run here is the whole suite minus auth-authorization-server. That file is SERVER ONLY: it opens the
  # web UI (E2E_BASE_URL, else ng serve on :4201), and the Electron flow serves no web UI. It runs alone on
  # Linux (web, docker-server). Its last test also changes burst's password on purpose, so every later spec
  # that signs in as burst failed after it (reporting-dashboards got a 401 in run-all C #33). Plan 5.2a's
  # "it has no target guard, so it belongs here" was wrong (.docs/linux-windows-full-cicd-release-plan.md
  # 6.34). let-me-update-migrate-configuration stays in: it is Electron-only.
  if [ -z "$spec" ] && [ -z "$gexp" ]; then
    mode=full
    spec='^(?!.*auth-authorization-server).*\.spec\.ts$'
  elif [ "$spec" = light ] && [ -z "$gexp" ]; then
    # E2E_SPEC=light: the light set the other Windows lanes run (WIN_LIGHT_SPEC), what a release needs of this lane
    # since the full set alternates between web and docker-server (asbl/ci/release-state.sh full-lane)
    mode=light
    spec="$WIN_LIGHT_SPEC"
  fi
  # A targeted run shows each failure as it is; a full run, and the light set as on the other Windows lanes, retry a
  # failed test once, so one run still collects every failure instead of stopping at the first flake (plan W7).
  if [ "$mode" = full ] || [ "$mode" = light ]; then retries="${E2E_RETRIES:-1}"; else retries="${E2E_RETRIES:-0}"; fi

  win_stacks_down
  win_temp_clean

  out="${WIN_E2E_LOG:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/win-e2e-$(date -u +%Y%m%dT%H%M%SZ).log}"
  mkdir -p "$(dirname "$out")" 2>/dev/null

  # The same caps as the Linux lane, so a stuck test costs minutes and not hours, and so the two
  # lanes mean the same thing by "passed". Read by playwright.config.ts, fluent-tester.ts and
  # e2e/utils/helpers.ts - all of them already there, none of them OS-specific.
  # Raised from 900000/3600000 on 2026-09-22. These ceilings are the ONLY thing that made
  # apps-custom fail here and pass on the owner's laptop: unset, a startApp wait is 5000 s, so the
  # laptop never noticed that starting an app BUILDS its image on first use. Measured cold on the
  # CI VM: npm install 959 s + next build 157 s = ~19 min, well past the old 15 min wait ceiling.
  # A seeded app cannot be pre-warmed the way plan .docs/linux-cicd-plan.md R1 suggests for the
  # blueprint apps (AI Hub, CloudBeaver, BI, WordPress): docker compose names the image after the
  # project DIRECTORY, and a scaffolded copy's directory does not exist until the test creates it,
  # so its build cannot happen before the run. 40 min clears the measured build twice over and
  # still bounds a hung wait; the 90 min test ceiling leaves room for the one test that starts two
  # apps cold. The real runaway guards are unchanged and much tighter: WIN_RUN_STALL kills a run
  # with no info.log growth for 30 min, WIN_RUN_TIMEOUT caps the whole run.
  WIN_RUN_ENV=$(printf '%s\n' \
    "E2E_SPEC=$spec" \
    "E2E_GREP=$gexp" \
    "E2E_RETRIES=$retries" \
    "E2E_REPEAT_EACH=${E2E_REPEAT_EACH:-1}" \
    "E2E_SLOW_MO=${E2E_SLOW_MO:-0}" \
    "E2E_MAX_WAIT_MS=${E2E_MAX_WAIT_MS:-2400000}" \
    "E2E_MAX_TEST_MS=${E2E_MAX_TEST_MS:-5400000}" \
    "E2E_ACTION_TIMEOUT_MS=${E2E_ACTION_TIMEOUT_MS:-300000}" \
    "E2E_CLEAN_STATE_ATTEMPTS=${E2E_CLEAN_STATE_ATTEMPTS:-60}" \
    "E2E_FAILFAST=${E2E_FAILFAST:-1}" \
    "E2E_START_EVIDENCE_MS=${E2E_START_EVIDENCE_MS:-300000}" \
    "E2E_STALL_MS=${E2E_STALL_MS:-600000}" \
    "E2E_ROTATION_DATE=${E2E_ROTATION_DATE:-$(date -u +%F)}" \
    "E2E_LICENSE_INSTANCE_ID=${E2E_LICENSE_INSTANCE_ID:-dp-ci-win-e2e}" \
    "E2E_JSON_REPORT=$WIN_RUNS\\e2e\\playwright.json")
  export WIN_RUN_ENV

  echo "WIN_E2E_MODE=$mode  spec='$spec'  grep='$gexp'  retries=$retries"
  echo "WIN_E2E_LOG=$out"
  # The product's own running log, written throughout every run. While Playwright is between files the
  # step's stdout can be quiet for minutes, and without a growing file to look at the stall timer
  # would kill a perfectly healthy run.
  WIN_RUN_WATCH="${WIN_RUN_WATCH:-$WIN_REPO\\frend\\reporting\\testground\\e2e\\logs\\info.log}"
  # A full Electron suite is hours, and the VM runs it about twice as slowly as Linux (the Linux full
  # run took 10 h 22 min). Run-all C's build #29 was cut at the old 20 h cap (72000 s) with 24 spec
  # files never started. 230400 s (64 h), plus the package rebuild and the results, fit inside the
  # 72 h of the run-all D plan and of its Jenkins job. The targeted cap stays.
  WIN_RUN_TIMEOUT="${WIN_RUN_TIMEOUT:-$([ "$mode" = full ] && echo 230400 || echo 10800)}"
  # A quiet test is not a stalled run. One wait may block for E2E_MAX_WAIT_MS (40 min) and one whole
  # test for E2E_MAX_TEST_MS (90 min) without printing a single line, so win_run's 20-minute silence
  # budget is certain to shoot a healthy suite sooner or later - it killed the 2026-09-21 full run
  # at 8h38m, mid-test, after 1213s of quiet, with 16 spec files still to go (plan 6.23). The budget
  # has to sit above the longest silence the caps themselves allow. Raised with those caps on
  # 2026-09-22 and in the same proportion as before: targeted = 2x the wait ceiling, full = a little
  # over the whole-test ceiling. Leaving these at 1800/4200 would have re-created the 2026-09-21 kill
  # on the very cold image build the new ceilings exist to allow. A dead run is still bounded, and
  # much sooner, by WIN_RUN_TIMEOUT above.
  WIN_RUN_STALL="${WIN_RUN_STALL:-$([ "$mode" = full ] && echo 6300 || echo 4800)}"
  export WIN_RUN_WATCH WIN_RUN_TIMEOUT WIN_RUN_STALL

  win_run e2e "$WIN_REPO\\frend\\reporting" \
    'npm run custom:clean-testground && call npx gulp utils:start-server-and-e2e-electron' 2>&1 | tee "$out"

  # gulp does not return Playwright's exit code, so the verdict is the line it prints - the same line
  # the Linux lane parses.
  # W7 wants the evidence on this side, not only on the VM: the machine-readable result of every test
  # (its errors and attachment paths included) and the product's own running log. Best effort - a run
  # that died before Playwright wrote its report still has a verdict to print.
  win_pull "$(printf '%s' "$WIN_RUNS\\e2e\\playwright.json" | tr '\\' '/')" "${out%.log}-playwright.json" \
    2>/dev/null && echo "WIN_E2E_REPORT=${out%.log}-playwright.json"
  # the same two reports as the Linux lane, for Jenkins: the HTML report (a folder, scp -r) and the JUnit XML
  win_pull "$(printf '%s' "$WIN_RUNS\\e2e\\playwright.xml" | tr '\\' '/')" "${out%.log}-playwright.xml" 2>/dev/null
  WIN_SCP_EXTRA=-r win_pull "$(printf '%s' "$WIN_RUNS\\e2e\\playwright-html" | tr '\\' '/')" "${out%.log}-playwright-html" 2>/dev/null
  win_pull "$(printf '%s' "$WIN_REPO\\frend\\reporting\\testground\\e2e\\logs\\info.log" | tr '\\' '/')" \
    "${out%.log}-info.log" 2>/dev/null && echo "WIN_E2E_INFOLOG=${out%.log}-info.log"

  code=$(grep -aoE "Main Playwright process exited with code [0-9]+" "$out" | tail -1 | grep -oE "[0-9]+$")
  echo "--- Playwright result ---"
  grep -aoE "[0-9]+ (passed|failed|flaky|skipped|did not run|interrupted)( \([^)]*\))?" "$out" | tail -6
  # The silent-skip branch of gulp's _startServerAndDoX(): no java or no mvn on the REGISTRY PATH and
  # the suite runs against the Install screen instead of the application, looking green. That is a
  # failed run, not a passed one (plan 6.8).
  if grep -aq "Spring Boot server will NOT be started" "$out"; then
    echo "!!! the chain skipped the server and tested the Install screen - this is NOT a result." >&2
    echo "    The private toolchain is not on the Machine PATH; see plan 6.8.1." >&2
    echo "WIN_E2E_RESULT mode=$mode spec='$spec' grep='$gexp' exit=no-server"
    return 1
  fi
  echo "WIN_E2E_RESULT mode=$mode spec='$spec' grep='$gexp'" \
    "passed=$(e2e_count passed "$out") failed=$(e2e_count failed "$out") flaky=$(e2e_count flaky "$out")" \
    "skipped=$(e2e_count skipped "$out") didnotrun=$(e2e_count "did not run" "$out") exit=${code:-none}"
  [ "$code" = "0" ]
}

# The two Windows lanes of DataPallas Server. Each tests a package exactly as `dp-ci.sh build` made it
# from the commit the VM tests, installed the way its download page tells a user to, with the tests in a browser on the
# VM's desktop at http://localhost:9090:
#   windows-vm-docker  datapallas-server-docker.zip (DockerAssembler) in Docker Desktop   https://datapallas.com/docs/server/self-host
#   windows-vm-server  datapallas-server.zip (DataPallasServerSpringBootAssembler) on the  https://datapallas.com/docs/server/installation
#                      machine's own Java 17
# Both are light on purpose (owner, 2026-10-22: as light as it can be while still proving it; no duplication of what the
# other lanes prove): each runs only what its package adds. E2E_SPEC / E2E_GREP replace the default set (retries 0 then).
# Order: push, `dp-ci.sh build-if-needed` (the server checkout on origin/main, what the VM tests, built when it is not yet;
# job dp-ci-release-step1-e2e-prerelease runs it first for these targets), then the lanes, one at a time: they share the
# VM's desktop, port 9090 and Docker Desktop, so jenkins/win-e2e.sh keeps one pid file for all three Windows lanes and
# refuses a second driver, and dp-ci-release-step1-e2e-prerelease queues a second build. No `dp-ci.sh build` during a
# run: it replaces the zips the lanes install.

# The newest successful build on this host, which must be of the commit the VM tests; prints its IMAGE_TAG
# (<version>-<commit>). Its asbl/dist zips and its image are what the two lanes install.
win_vm_build_tag() {
  local vm f tag= tagsha
  vm=$(win_ssh "git -C $WIN_REPO rev-parse --short HEAD" 2>/dev/null | tr -d '\r' | tail -1)
  [ -n "$vm" ] || { echo "FAIL  could not read the VM's commit" >&2; return 2; }
  for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
    grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
    tag=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
    [ -n "$tag" ] && { echo "WIN_BUILD=$(basename "$f") -> $tag" >&2; break; }
  done
  [ -n "$tag" ] || { echo "FAIL  no successful build log with an IMAGE_TAG line - run dp-ci.sh build-if-needed first" >&2; return 2; }
  tagsha="${tag#*-}"
  # two git versions may abbreviate the same commit to different lengths
  [ "${vm#"$tagsha"}" != "$vm" ] || [ "${tagsha#"$vm"}" != "$tagsha" ] ||
    { echo "FAIL  the build is of '$tagsha', the VM tests '$vm' - run dp-ci.sh build-if-needed first" >&2; return 2; }
  echo "$tag"
}

# win_bundle_extract <local zip> <VM folder> <file DataPallas\ must hold>: the zip copied to the VM and extracted into an
# empty folder, nothing changed in it - what a user's unzip gives.
win_bundle_extract() {
  local name zip keep=0
  if [ -f "$1" ]; then
    name=$(basename "$1"); zip="C:\\dp-ci\\tmp\\$name"
    win_ssh "if not exist C:\\dp-ci\\tmp md C:\\dp-ci\\tmp" >/dev/null 2>&1
    win_scp "$1" "C:/dp-ci/tmp/$name" || { echo "FAIL  could not copy $name to the VM" >&2; return 1; }
  else
    # a path on the VM: the release extracts the very file the pack made, and leaves it where it is
    name="${1##*\\}"; zip="$1"; keep=1
  fi
  win_ps 2>&1 <<PS | tr -d '\r'
\$ErrorActionPreference = "Continue"
\$root = '$2'; \$zip = '$zip'
if (Test-Path \$root) { Remove-Item -Recurse -Force \$root }
if (Test-Path \$root) { "FAIL  could not remove the previous installation (a file in it is still open)"; exit 1 }
New-Item -ItemType Directory -Force \$root | Out-Null
& tar.exe -xf \$zip -C \$root
\$rc = \$LASTEXITCODE
if ($keep -eq 0) { Remove-Item \$zip -ErrorAction SilentlyContinue }
if (\$rc -ne 0 -or -not (Test-Path "\$root\\DataPallas\\$3")) { "FAIL  could not extract $name"; exit 1 }
"WIN_BUNDLE=$name extracted"
PS
}

# win_bundle_download <url> <VM folder> <file DataPallas\ must hold>: the zip downloaded on the VM (curl.exe, as a user
# gets it from the page), then extracted like a copied one (win_bundle_extract); the download stays in C:\dp-ci\tmp.
win_bundle_download() {
  local name="${1##*/}"
  win_ps 2>&1 <<PS | tr -d '\r' || return 1
\$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force 'C:\\dp-ci\\tmp' | Out-Null
& curl.exe -fsSL --max-time 1800 -o 'C:\\dp-ci\\tmp\\$name' '$1'
if (\$LASTEXITCODE -ne 0) { "FAIL  could not download $1 on the VM"; exit 1 }
"WIN_BUNDLE_DOWNLOAD=$1 sha256 " + (Get-FileHash -Algorithm SHA256 'C:\\dp-ci\\tmp\\$name').Hash.ToLower()
PS
  win_bundle_extract "C:\\dp-ci\\tmp\\$name" "$2" "$3"
}

# http://localhost:9090 on the VM, the address the page sends the user to. GET / is public: the web UI has to load before
# anyone can sign in. 10 minutes, twice Linux's: Docker Desktop runs nested and the VM is slow.
win_wait_9090() {
  win_ps 2>&1 <<'PS' | tr -d '\r'
for ($i = 0; $i -lt 120; $i++) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://localhost:9090' | Out-Null; "WIN_SERVER_URL=http://localhost:9090 answering"; exit 0 } catch { Start-Sleep 5 }
}
"FAIL  http://localhost:9090 did not answer within 10 minutes"; exit 1
PS
}

# win_web_e2e <target> <step> <installation> <mode> <spec> <grep> <retries> [NAME=VALUE...]
# The tests in a browser on the VM's desktop against http://localhost:9090, the way the Linux docker-server lane runs them:
# no gulp, Playwright straight away, PORTABLE_EXECUTABLE_DIR = the installation the tests read and write. The licence key is
# the one the dev chain's npm script passes, read from package.json like the Linux lane does. Sets WIN_WEB_OUT (its log).
win_web_e2e() {
  local target="$1" step="$2" inst="$3" mode="$4" spec="$5" gexp="$6" retries="$7" key
  shift 7
  WIN_WEB_OUT="${WIN_E2E_LOG:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/win-$step-$(date -u +%Y%m%dT%H%M%SZ).log}"
  mkdir -p "$(dirname "$WIN_WEB_OUT")" 2>/dev/null
  : > "$WIN_WEB_OUT"
  # the reports of an earlier run must not be pulled as this one's
  win_ps >/dev/null 2>&1 <<PS
Remove-Item -Recurse -Force '$WIN_RUNS\\$step\\playwright.json', '$WIN_RUNS\\$step\\playwright.xml', '$WIN_RUNS\\$step\\playwright-html' -ErrorAction SilentlyContinue
PS
  key=$(grep -aoE 'TEST_LICENSE_KEY=[0-9a-f]+' "$REPO/frend/reporting/package.json" | head -1 | cut -d= -f2)
  [ -n "$key" ] || { echo "FAIL  TEST_LICENSE_KEY not found in frend/reporting/package.json" >&2; return 1; }
  WIN_RUN_ENV=$(printf '%s\n' \
    "TEST_ENV=web" \
    "RUNNING_IN_E2E=true" \
    "TEST_LICENSE_KEY=$key" \
    "E2E_BASE_URL=http://localhost:9090" \
    "PORTABLE_EXECUTABLE_DIR=$inst" \
    "E2E_SPEC=$spec" \
    "E2E_GREP=$gexp" \
    "E2E_RETRIES=$retries" \
    "E2E_REPEAT_EACH=${E2E_REPEAT_EACH:-1}" \
    "E2E_SLOW_MO=${E2E_SLOW_MO:-0}" \
    "E2E_MAX_WAIT_MS=${E2E_MAX_WAIT_MS:-2400000}" \
    "E2E_MAX_TEST_MS=${E2E_MAX_TEST_MS:-5400000}" \
    "E2E_ACTION_TIMEOUT_MS=${E2E_ACTION_TIMEOUT_MS:-300000}" \
    "E2E_CLEAN_STATE_ATTEMPTS=${E2E_CLEAN_STATE_ATTEMPTS:-60}" \
    "E2E_FAILFAST=${E2E_FAILFAST:-1}" \
    "E2E_START_EVIDENCE_MS=${E2E_START_EVIDENCE_MS:-300000}" \
    "E2E_STALL_MS=${E2E_STALL_MS:-600000}" \
    "E2E_ROTATION_DATE=${E2E_ROTATION_DATE:-$(date -u +%F)}" \
    "E2E_LICENSE_INSTANCE_ID=${E2E_LICENSE_INSTANCE_ID:-dp-ci-win-e2e}" \
    "E2E_JSON_REPORT=$WIN_RUNS\\$step\\playwright.json" \
    "$@")
  export WIN_RUN_ENV

  echo "WIN_E2E_MODE=$mode  target=$target  spec='$spec'  grep='$gexp'  retries=$retries"
  echo "WIN_E2E_LOG=$WIN_WEB_OUT"
  WIN_RUN_WATCH="${WIN_RUN_WATCH:-$inst\\logs\\info.log}"
  WIN_RUN_TIMEOUT="${WIN_RUN_TIMEOUT:-10800}"
  WIN_RUN_STALL="${WIN_RUN_STALL:-4800}"
  export WIN_RUN_WATCH WIN_RUN_TIMEOUT WIN_RUN_STALL

  # Playwright runs in the foreground of the step, so the step prints its exit code in the line the Linux lanes parse
  # (`call echo %%ERRORLEVEL%%` reads it after npx has finished, not when the line is read).
  # It stops on its own 10 min before the lane's limit (--global-timeout), so it still writes its report: the tests it
  # ran and the one it interrupted. Killed by the limit, it wrote none (chain b on 889001e6: 3 h, no failed test named).
  local pw_limit_ms=$(( WIN_RUN_TIMEOUT > 1200 ? (WIN_RUN_TIMEOUT - 600) * 1000 : WIN_RUN_TIMEOUT * 1000 ))
  win_run "$step" "$WIN_REPO\\frend\\reporting" \
    "npx playwright test -c e2e/playwright.config.ts e2e/ --global-timeout=$pw_limit_ms & call echo Main Playwright process exited with code %%ERRORLEVEL%%" 2>&1 | tee "$WIN_WEB_OUT"
  WIN_RUN_ENV=""

  win_pull "$(printf '%s' "$WIN_RUNS\\$step\\playwright.json" | tr '\\' '/')" "${WIN_WEB_OUT%.log}-playwright.json" \
    2>/dev/null && echo "WIN_E2E_REPORT=${WIN_WEB_OUT%.log}-playwright.json"
  win_pull "$(printf '%s' "$WIN_RUNS\\$step\\playwright.xml" | tr '\\' '/')" "${WIN_WEB_OUT%.log}-playwright.xml" 2>/dev/null
  WIN_SCP_EXTRA=-r win_pull "$(printf '%s' "$WIN_RUNS\\$step\\playwright-html" | tr '\\' '/')" "${WIN_WEB_OUT%.log}-playwright-html" 2>/dev/null
  return 0
}

# win_web_result <target> <mode> <spec> <grep> [extra words]: the verdict line, as the other lanes print it
win_web_result() {
  local out="$WIN_WEB_OUT" code
  code=$(grep -aoE "Main Playwright process exited with code [0-9]+" "$out" | tail -1 | grep -oE "[0-9]+$")
  echo "--- Playwright result ---"
  grep -aoE "[0-9]+ (passed|failed|flaky|skipped|did not run|interrupted)( \([^)]*\))?" "$out" | tail -6
  echo "WIN_E2E_RESULT mode=$2 target=$1 spec='$3' grep='$4'" \
    "passed=$(e2e_count passed "$out") failed=$(e2e_count failed "$out") flaky=$(e2e_count flaky "$out")" \
    "skipped=$(e2e_count skipped "$out") didnotrun=$(e2e_count "did not run" "$out") exit=${code:-none}${5:+ $5}"
  [ "$code" = "0" ]
}

# Target windows-vm-docker: datapallas-server-docker.zip as the self-host page installs it - extracted, `cd DataPallas`,
# `docker compose up -d` under the VM's Docker Desktop - then http://localhost:9090, signed in as burst.
# The one step that cannot be the user's: their compose pulls the released image from Docker Hub, and an unreleased build
# is not there. So the image the build made is copied to the VM (docker save / load) and given the version tag the
# bundle's compose names; the compose file is not touched, and the run aborts unless the container runs exactly that image
# (the same rule as the Linux docker-server lane).
# What the container runs is the Linux image the docker-server lane already tests on Linux, every spec. What only this
# lane tests is where it meets Windows: the bundle's folders bind-mounted from NTFS, the server starting apps through
# Docker Desktop's docker.sock with Windows host paths, the published port. Hence its light set, which the owner agreed
# to on 2026-10-22:
#   quick-start                      samples/ in, output/ and logs/ out: the core burst
#   configuration                    settings saved into config/
#   log-files-viewer-separate-tabs   logs/ read back in the UI
#   cubes-definitions                the sample databases in db/
#   apps-ai-hub                      an app the server starts through docker.sock
# Unlike Linux, the images compose builds for the apps are kept between runs: the AI Hub's take hours to build on the VM,
# and what is in them is the Linux docker-server lane's to prove; starting them from Windows is this one's.
# The specs run from the VM's checkout and the node_modules already in it, as the Electron lane's do.
WIN_LIGHT_SPEC='[\\/](features[\\/]quick-start|areas[\\/]configuration|components[\\/]log-files-viewer-separate-tabs|areas[\\/]cubes-definitions|features[\\/]apps-ai-hub)\.spec\.ts$'

# The Docker CLI on the VM must not ask the Windows credential store. Over SSH there is no interactive
# logon session, so docker-credential-wincred answers "A specified logon session does not exist. It may
# already have been terminated." and every registry call dies - which is how the release's compose pull
# (docker compose up -d --pull always) failed on 2026-10-25. A config without credsStore is not enough:
# when the config holds no auths entry at all, the CLI picks the platform's store by itself (wincred on
# Windows), so {"auths":{}} still failed over SSH on the VM (Docker 29.8.1). One entry for a host that
# never exists keeps the CLI on its plain file store, and the pull goes out anonymously, which is all a
# public demo image needs; a private registry would need a real login in an interactive session, never a
# secret written here.
win_docker_config() {
  local tmp
  tmp=$(mktemp) || return 1
  printf '{"auths":{"none.invalid":{}}}' > "$tmp"
  win_ssh "if not exist C:\\dp-ci\\docker-config md C:\\dp-ci\\docker-config" >/dev/null 2>&1
  win_scp "$tmp" C:/dp-ci/docker-config/config.json || {
    rm -f "$tmp"; echo "FAIL  could not write the Docker CLI config on the VM" >&2; return 1; }
  rm -f "$tmp"
}

win_docker_e2e() {
  local target=windows-vm-docker mode=targeted retries spec gexp tag version image_id vm_id running_id tmp want="" vmc
  local zip="$REPO/asbl/dist/datapallas-server-docker.zip" step=docker-e2e
  local root="$WIN_REPO\\frend\\reporting\\testground\\docker-server"
  local inst="$root\\DataPallas"
  # what the lane needs, in seconds, before the sync: the VM, its Docker Desktop and, unless a release's download is
  # tested, this host's Docker engine (the image is copied from it)
  prereq vm vm-docker $([ -z "${E2E_DOCKER_FROM_URL:-}" ] && echo docker) || return 2
  if [ -n "${E2E_DOCKER_FROM_URL:-}" ]; then
    # A staged Docker release (by hand): the self-host install from the download, as on Linux (docker_server_up): the zip
    # from E2E_DOCKER_FROM_URL, the image its compose names pulled from the registry, and the running image must be
    # the one the release pushed. Docker Desktop numbers images its own way: the check is on RepoDigests, not the id.
    mark_start "$target STEP 1/3" "the release: the VM on origin/main, the digest step 2 pushed"
    win_sync_repo || return $?
    vmc=$(win_ssh "git -C $WIN_REPO rev-parse HEAD" 2>/dev/null | tr -d '\r' | tail -1)
    want=$(RELEASE_COMMIT="$vmc" bash "$REPO/asbl/ci/release-state.sh" get rehearsal.docker-stage digest 2>/dev/null)
    [ -n "$want" ] || { echo "FAIL  no rehearsal.docker-stage digest recorded for '${vmc:0:8}' - rehearse the Docker release first" >&2; return 2; }
    echo "WIN_DOCKER_IMAGE=the release's $SERVER_IMAGE_REPO@$want, pulled by compose"
  else
    mark_start "$target STEP 1/3" "the image: the build of the VM's commit, copied to the VM when it is not there yet"
    win_sync_repo || return $?
    tag=$(win_vm_build_tag) || return $?
    image_id=$(docker image inspect "$SERVER_IMAGE_REPO:$tag" --format '{{.Id}}' 2>/dev/null) ||
      { echo "FAIL  image $SERVER_IMAGE_REPO:$tag is not on this host - run dp-ci.sh build-if-needed first" >&2; return 2; }
    [ -s "$zip" ] || { echo "FAIL  $zip is missing - run dp-ci.sh build-if-needed first" >&2; return 2; }
    version=$(printf '%s' "$tag" | cut -d- -f1)
  fi

  spec="${E2E_SPEC:-}"; gexp="${E2E_GREP:-}"
  if [ -z "$spec" ] && [ -z "$gexp" ]; then mode=light; spec="$WIN_LIGHT_SPEC"; fi
  if [ "$mode" = light ]; then retries="${E2E_RETRIES:-1}"; else retries="${E2E_RETRIES:-0}"; fi

  # the previous run's bundle, and anything its server started, before its folder is replaced
  win_stacks_down server
  win_temp_clean

  if [ -z "$want" ]; then
    # The image, once per commit: about 2 GB, so it is copied only when the VM does not have this tag yet.
    vm_id=$(win_ssh "docker image inspect $SERVER_IMAGE_REPO:$tag --format {{.Id}}" 2>/dev/null | tr -d '\r' | tail -1)
    case "$vm_id" in
      sha256:*) echo "WIN_DOCKER_IMAGE=$SERVER_IMAGE_REPO:$tag already on the VM" ;;
      *)
        echo "WIN_DOCKER_IMAGE=$SERVER_IMAGE_REPO:$tag copying to the VM (docker save, scp, docker load)"
        tmp=$(mktemp --suffix=.tar.gz) || return 1
        docker save "$SERVER_IMAGE_REPO:$tag" | gzip -1 > "$tmp" || { rm -f "$tmp"; echo "FAIL  docker save failed" >&2; return 1; }
        win_ssh "if not exist C:\\dp-ci\\tmp md C:\\dp-ci\\tmp" >/dev/null 2>&1
        win_scp "$tmp" C:/dp-ci/tmp/datapallas-server-image.tar.gz || { rm -f "$tmp"; echo "FAIL  could not copy the image to the VM" >&2; return 1; }
        rm -f "$tmp"
        win_ssh "docker load -q -i C:\\dp-ci\\tmp\\datapallas-server-image.tar.gz" 2>&1 | tr -d '\r'
        win_ssh "del /q C:\\dp-ci\\tmp\\datapallas-server-image.tar.gz" >/dev/null 2>&1
        vm_id=$(win_ssh "docker image inspect $SERVER_IMAGE_REPO:$tag --format {{.Id}}" 2>/dev/null | tr -d '\r' | tail -1)
        case "$vm_id" in sha256:*) ;; *) echo "FAIL  the image did not load on the VM" >&2; return 1 ;; esac ;;
    esac
    win_ps 2>&1 <<PS | tr -d '\r' || return 1
\$ErrorActionPreference = "Continue"
\$repo = '$SERVER_IMAGE_REPO'; \$tag = '$tag'; \$version = '$version'
# older builds' images: 2 GB each, on a disk that has run out before
foreach (\$t in (& docker images \$repo --format '{{.Tag}}')) {
  if (\$t -ne \$tag -and \$t -ne \$version) { & docker rmi "\${repo}:\$t" 2>&1 | Out-Null; "removed the old image \${repo}:\$t" }
}
# the name the bundle's compose pins
& docker tag "\${repo}:\$tag" "\${repo}:\$version"
if (\$LASTEXITCODE -ne 0) { "FAIL  docker tag failed"; exit 1 }
PS
  fi

  mark_next "$target STEP 2/3" "install: datapallas-server-docker.zip extracted, docker compose up -d, :9090 answers"
  if [ -n "$want" ]; then
    win_bundle_download "$E2E_DOCKER_FROM_URL" "$root" docker-compose.yml || return 1
  else
    win_bundle_extract "$zip" "$root" docker-compose.yml || return 1
  fi
  # "cd DataPallas" and "docker compose up -d", as the page says; from the download, with no local copy of the image
  win_docker_config || return 1
  win_ps 2>&1 <<PS | tr -d '\r' || { win_docker_down "$inst"; return 1; }
\$ErrorActionPreference = "Continue"
\$env:DOCKER_CONFIG = 'C:\dp-ci\docker-config'
Set-Location '$inst'
\$extra = @()
if ('$want' -ne '') {
  \$img = (& docker compose config --images) | Where-Object { \$_ -like '${SERVER_IMAGE_REPO}:*' } | Select-Object -First 1
  if (\$img) { & docker image rm \$img 2>&1 | Out-Null; "untagged the local \$img (none on a user's machine)" }
  \$extra = @('--pull', 'always')
}
& docker compose up -d @extra 2>&1 | ForEach-Object { "compose: \$_" }
if (\$LASTEXITCODE -ne 0) { "FAIL  docker compose up -d failed"; exit 1 }
# compose writes its progress to stderr, and under 2>&1 PowerShell 5.1 makes each line an error record:
# \$? stays false and powershell.exe exits 1 although compose succeeded, so the step failed every time
exit 0
PS
  win_wait_9090 || { win_docker_down "$inst"; return 1; }
  running_id=$(win_ssh "docker inspect datapallas-server --format {{.Image}}" 2>/dev/null | tr -d '\r' | tail -1)
  if [ -n "$want" ]; then
    case "$(win_ssh "docker image inspect $running_id --format \"{{json .RepoDigests}}\"" 2>/dev/null | tr -d '\r' | tail -1)" in
      *"\"$SERVER_IMAGE_REPO@$want\""*) echo "DOCKER_SERVER_IMAGE=$SERVER_IMAGE_REPO@$want (pulled; on the VM: $running_id)" ;;
      *) echo "FAIL  the container runs image '$running_id', not the release's $SERVER_IMAGE_REPO@$want - aborting" >&2
         win_docker_down "$inst"; return 1 ;;
    esac
  else
    [ "$running_id" = "$vm_id" ] ||
      { echo "FAIL  the container runs image '$running_id', the build made $vm_id - aborting" >&2; win_docker_down "$inst"; return 1; }
    echo "DOCKER_SERVER_IMAGE=$SERVER_IMAGE_REPO:$tag $image_id (on the VM: $vm_id)"
  fi
  mark_next "$target STEP 3/3" "the tests ($mode set) in a browser on the VM, then the server's log"

  win_web_e2e "$target" "$step" "$inst" "$mode" "$spec" "$gexp" "$retries" "E2E_DOCKER_SERVER=datapallas-server" ||
    { win_docker_down "$inst"; return 1; }
  # the server's whole log of the run: clean state empties the bundle's logs between tests
  win_ssh "docker logs datapallas-server" > "${WIN_WEB_OUT%.log}-datapallas-server.log" 2>&1 &&
    echo "DOCKER_SERVER_LOG=${WIN_WEB_OUT%.log}-datapallas-server.log"
  win_docker_down "$inst"
  win_web_result "$target" "$mode" "$spec" "$gexp"
}

# Stops the bundle (the page's "docker compose down") and what its server started; keeps the folder, which is the
# evidence of the run (config, logs, output), until the next run replaces it.
win_docker_down() {
  echo "--- datapallas-server container log (last 300 lines) ---"
  win_ssh "docker logs --tail 300 datapallas-server" 2>&1 | tr -d '\r' | sed 's/^/datapallas-server: /'
  win_ps 2>&1 <<PS | tr -d '\r'
Set-Location '$1' -ErrorAction SilentlyContinue
if (\$?) { & docker compose down 2>&1 | Out-Null; "WIN_DOCKER_SERVER=stopped" }
PS
  win_stacks_down server
}

# Target windows-vm-server: datapallas-server.zip (DataPallasServerSpringBootAssembler) as the installation page installs
# it - Java 17 on the machine, the zip extracted, startServer.bat, http://localhost:9090 - then the same light set as
# windows-vm-docker, a plain web run against it (no E2E_DOCKER_SERVER: the installation is the extracted folder itself).
# Java is the machine's, the Java 17 installed on it (Temurin, through Chocolatey) - a bare step, so never the CI's
# private JDK, which is on no machine-wide setting (since 2026-10-22). The server runs in the foreground on the
# desktop, as when a user double-clicks startServer.bat, and is stopped with shutServer.bat at the end.
# Owner, 2026-10-22: this lane runs the light set and nothing else; the Robot UAT suites
# (asbl/src/uat/tests/DataPallas-Server*.robot: auth, poll folder, Windows service) run in `win release`.
win_server_e2e() {
  local mode=targeted retries spec gexp tag step=server-e2e
  local zip="$REPO/asbl/dist/datapallas-server.zip"
  local root="$WIN_REPO\\frend\\reporting\\testground\\server"
  local inst="$root\\DataPallas"
  # what the lane needs, in seconds, before the sync: the VM, its Docker Desktop (apps-ai-hub starts apps through it, as
  # it does for a user) and the machine's Java 17 (startServer.bat)
  prereq vm vm-docker vm-java || return 2
  mark_start "windows-vm-server STEP 1/2" "install: datapallas-server.zip extracted, startServer.bat on the machine's Java, :9090 answers"
  win_sync_repo || return $?
  tag=$(win_vm_build_tag) || return $?
  [ -s "$zip" ] || { echo "FAIL  $zip is missing - run dp-ci.sh build-if-needed first" >&2; return 2; }
  echo "WIN_SERVER_PACKAGE=datapallas-server.zip of build $tag"

  spec="${E2E_SPEC:-}"; gexp="${E2E_GREP:-}"
  if [ -z "$spec" ] && [ -z "$gexp" ]; then mode=light; spec="$WIN_LIGHT_SPEC"; fi
  if [ "$mode" = light ]; then retries="${E2E_RETRIES:-1}"; else retries="${E2E_RETRIES:-0}"; fi

  win_server_down "$inst"   # a server left by a killed run, before its folder is replaced
  win_stacks_down
  win_temp_clean
  # startRbsjServer.bat quietly moves to 9091 when 9090 is taken, and the tests would then talk to whatever holds 9090
  win_ps 2>&1 <<'PS' | tr -d '\r' || return 1
$l = Get-NetTCPConnection -LocalPort 9090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($l) { "FAIL  port 9090 is taken by " + (Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue).ProcessName; exit 1 }
PS
  win_bundle_extract "$zip" "$root" startServer.bat || return 1

  # "Start the server by running startServer.bat"
  WIN_RUN_ENV="" WIN_RUN_BARE=1 win_run_start dp-server "$inst" startServer.bat || return 1
  win_wait_9090 || {
    echo "--- startServer.bat output ---"
    win_run_poll dp-server 0 2>&1 | tr -d '\r' | grep -v '^@@' | tail -40
    win_server_down "$inst"; return 1; }

  mark_next "windows-vm-server STEP 2/2" "the tests ($mode set) in a browser on the VM, then the server's log"
  win_web_e2e windows-vm-server "$step" "$inst" "$mode" "$spec" "$gexp" "$retries" ||
    { win_server_down "$inst"; return 1; }
  win_pull "$(printf '%s' "$inst\\logs\\rbsj-server.log" | tr '\\' '/')" "${WIN_WEB_OUT%.log}-rbsj-server.log" 2>/dev/null &&
    echo "WIN_SERVER_LOG=${WIN_WEB_OUT%.log}-rbsj-server.log"
  win_server_down "$inst"
  win_stacks_down
  win_web_result windows-vm-server "$mode" "$spec" "$gexp"
}

# shutServer.bat, then the task that ran startServer.bat ended in any case; keeps the folder (config, logs, output) as
# the evidence of the run until the next run replaces it.
win_server_down() {
  win_ps 2>&1 <<PS | tr -d '\r'
if (-not (Test-Path '$1\\shutServer.bat')) { exit 0 }
Set-Location '$1'
& cmd.exe /c shutServer.bat 2>&1 | Out-Null
for (\$i = 0; \$i -lt 30; \$i++) {
  if (-not (Get-NetTCPConnection -LocalPort 9090 -State Listen -ErrorAction SilentlyContinue)) { "WIN_SERVER=stopped by shutServer.bat"; exit 0 }
  Start-Sleep 2
}
"WARN  something still listens on 9090 a minute after shutServer.bat"
PS
  win_run_stop dp-server >/dev/null 2>&1
}

# The Windows release's upload (UPLOAD=yes): the VM itself copies the three zips to the bucket, with its own rclone,
# WIN_RCLONE_VERSION from rclone's download site, checked against WIN_RCLONE_SHA256 and kept in WIN_RCLONE_DIR (the one
# thing this release installs on the VM). The Backblaze key never reaches the VM's disk or a log: release-publish.sh
# pipes the remote's fields from this host's rclone config into the ssh session's stdin, never into a variable, an
# argument or a file; the PowerShell of win_stage_upload goes inline as -EncodedCommand (never as a script file, as a
# long win_ps would) and holds no value itself; it reads the fields from stdin into memory and hands them to that one
# rclone process only, as its environment (RCLONE_CONFIG_DPRELEASE_*, with --config NUL: no config file read or
# written). It prints counts and destinations, never rclone's own output. The cleanup of earlier rehearsals, the check
# by download and the public copy stay on this host, with its credentials (release-publish.sh).
WIN_RCLONE_VERSION=1.68.2
WIN_RCLONE_SHA256=812bf76cc02c04cf6327f3683f3d5a88e47d36c39db84c1a745777496be7d993   # rclone-v1.68.2-windows-amd64.zip
WIN_RCLONE_DIR='C:\dp-ci\tools\rclone'

# win_rclone_ensure [check|print]: WIN_RCLONE_VERSION in WIN_RCLONE_DIR on the VM, installed when it is not there (a
# minute; nothing done when it is). check = only say whether it is there (a dry run); print = the VM untouched, only what
# it would do (UPLOAD=no).
win_rclone_ensure() {
  local url="https://downloads.rclone.org/v$WIN_RCLONE_VERSION/rclone-v$WIN_RCLONE_VERSION-windows-amd64.zip"
  if [ "${1:-}" = print ]; then
    echo "UPLOAD=no  would run: on the VM, when $WIN_RCLONE_DIR\\rclone.exe is not rclone v$WIN_RCLONE_VERSION: $url downloaded, its sha256 checked ($WIN_RCLONE_SHA256), rclone.exe put in $WIN_RCLONE_DIR"
    return 0
  fi
  win_ps 2>&1 <<PS | tr -d '\r'
\$ErrorActionPreference = 'Stop'
\$dir = '$WIN_RCLONE_DIR'; \$exe = Join-Path \$dir 'rclone.exe'; \$want = 'rclone v$WIN_RCLONE_VERSION'
\$have = ''
if (Test-Path \$exe) { try { \$have = (& \$exe version 2>\$null | Select-Object -First 1) } catch { \$have = '' } }
if (\$have -eq \$want) { "OK rclone on the Windows VM: \$want in \$dir (already there)"; exit 0 }
if ('${1:-}' -eq 'check') { "NOTE rclone on the Windows VM: \$want not in \$dir yet (\$(if (\$have) { \$have } else { 'none' })): a run with UPLOAD=yes installs it"; exit 0 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
\$tmp = Join-Path \$env:TEMP ('rclone-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path \$tmp | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing -Uri '$url' -OutFile (Join-Path \$tmp 'r.zip')
  \$sha = (Get-FileHash -Algorithm SHA256 (Join-Path \$tmp 'r.zip')).Hash.ToLower()
  if (\$sha -ne '$WIN_RCLONE_SHA256') { "MISSING rclone on the Windows VM: the download of $url is not the expected file (sha256 \$sha): nothing installed"; exit 1 }
  Expand-Archive -Path (Join-Path \$tmp 'r.zip') -DestinationPath \$tmp -Force
  New-Item -ItemType Directory -Force -Path \$dir | Out-Null
  Copy-Item -Force (Join-Path \$tmp 'rclone-v$WIN_RCLONE_VERSION-windows-amd64\rclone.exe') \$exe
} catch { "MISSING rclone on the Windows VM: the install from $url failed: \$(\$_.Exception.Message)"; exit 1 }
finally { Remove-Item -Recurse -Force \$tmp -ErrorAction SilentlyContinue }
\$have = (& \$exe version 2>\$null | Select-Object -First 1)
if (\$have -ne \$want) { "MISSING rclone on the Windows VM: \$exe says '\$have', not \$want"; exit 1 }
"OK rclone on the Windows VM: \$want installed in \$dir"
PS
  return "${PIPESTATUS[0]}"
}

# the PowerShell of win_stage_upload, the same every time: what it uploads, where and with which key all come on stdin
win_stage_upload_ps() {
  cat <<'PS'
$ProgressPreference = 'SilentlyContinue'
$files = @(); $vals = @{}
while ($null -ne ($l = [Console]::In.ReadLine())) {
  if ($l -eq 'end') { break }
  $k, $v = $l -split ' ', 2
  switch ($k) {
    'exe'  { $exe = $v }
    'dir'  { $dir = $v }
    'dest' { $dest = $v }
    'file' { $files += $v }
    'env'  { $n, $x = $v -split '=', 2; $vals[$n] = $x }
  }
}
$ok = 0
foreach ($f in $files) {
  $name, $want = $f -split ':', 2
  $src = Join-Path $dir $name
  if (-not (Test-Path $src)) { "VM_UPLOAD $name -> $dest/$name FAILED: not in $dir"; continue }
  if ((Get-FileHash -Algorithm SHA256 $src).Hash.ToLower() -ne $want) { "VM_UPLOAD $name -> $dest/$name FAILED: not the pack's (sha256 differs), not uploaded"; continue }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = 'copyto --config NUL -q "' + $src + '" "' + $dest + '/' + $name + '"'
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  foreach ($n in $vals.Keys) { $psi.EnvironmentVariables[$n] = $vals[$n] }
  $p = [System.Diagnostics.Process]::Start($psi)
  $e = $p.StandardError.ReadToEndAsync(); $null = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $null = $e.Result
  if ($p.ExitCode -eq 0) { $ok++; "VM_UPLOAD $name -> $dest/$name uploaded" } else { "VM_UPLOAD $name -> $dest/$name FAILED (rclone exit $($p.ExitCode); its output is not shown, it could hold the key)" }
}
$vals.Clear()
"VM_UPLOAD $ok of $($files.Count) uploaded to $dest/"
if ($ok -ne $files.Count) { exit 1 }
PS
}

# win_stage_upload [--print] <bucket path of the folder> <name>:<sha256>...: the VM uploads those files of its asbl\dist
# (each first checked against its sha256: the pack's) to <bucket path>/<name> with WIN_RCLONE_DIR's rclone. stdin: the
# rclone remote's fields, one <FIELD>=<value> line each (TYPE=b2, ACCOUNT=..., KEY=...): they go straight on to the VM
# (sed, ssh), never into a variable, an argument, a file or the log. --print: nothing done, only the command per file.
win_stage_upload() {
  local print=0 folder f b64
  [ "${1:-}" = --print ] && { print=1; shift; }
  folder="$1"; shift
  if [ "$print" = 1 ]; then
    for f in "$@"; do
      echo "UPLOAD=no  would run: on the VM, over SSH: $WIN_RCLONE_DIR\\rclone.exe copyto --config NUL -q ${WIN_REPO:-<the VM checkout>}\\asbl\\dist\\${f%%:*} dprelease:$folder/${f%%:*}  (its sha256 checked first; the Backblaze key only in that process's environment, RCLONE_CONFIG_DPRELEASE_*)"
    done
    return 0
  fi
  win_conf_ok || return 1
  # one constant script, no value in it: everything it needs comes on stdin, after the values of the arguments above
  b64=$(win_stage_upload_ps | iconv -f UTF-8 -t UTF-16LE | base64 -w0)
  { printf 'exe %s\n' "$WIN_RCLONE_DIR\\rclone.exe"
    printf 'dir %s\n' "$WIN_REPO\\asbl\\dist"
    printf 'dest %s\n' "dprelease:$folder"
    for f in "$@"; do printf 'file %s\n' "$f"; done
    sed -n 's/^\([A-Z0-9_]\{1,64\}\)=/env RCLONE_CONFIG_DPRELEASE_\1=/p'
    echo end
  } | win_ssh powershell -NoProfile -NonInteractive -EncodedCommand "$b64" 2>&1 | tr -d '\r'
  return "${PIPESTATUS[1]}"
}

# win_dist_sha <name>: the sha256 of asbl\dist\<name> on the VM, or 'missing'
win_dist_sha() {
  win_ps 2>/dev/null <<PS | tr -d '\r' | tail -1
\$f = '$WIN_REPO\\asbl\\dist\\$1'
if (Test-Path \$f) { (Get-FileHash -Algorithm SHA256 \$f).Hash.ToLower() } else { 'missing' }
PS
}

# win_put_dist [--check] <folder on this host> <name>:<sha256>...: the VM's asbl\dist holds those very files. Each one that is
# missing there or another file is copied from <folder> (asbl/ci/release-keep.sh's artifacts folder) and checked again.
# --check: only said, nothing copied. The release's Robot UAT reads asbl\dist after the electron light set's prepare
# (pack-prepare-for-e2e.bat) emptied it, and release day's upload (release-publish.sh upload-kept) uploads from there.
win_put_dist() {
  local check=0 folder f n want have bad=0
  [ "${1:-}" = --check ] && { check=1; shift; }
  folder="$1"; shift
  win_conf_ok || return 1
  [ "$check" = 1 ] || win_ssh "if not exist $WIN_REPO\\asbl\\dist md $WIN_REPO\\asbl\\dist" >/dev/null 2>&1
  for f in "$@"; do
    n=${f%%:*}; want=${f#*:}
    have=$(win_dist_sha "$n")
    if [ "$have" = "$want" ]; then echo "DIST  $n  in the VM's asbl\\dist is the kept file (sha256 ${want:0:16}...)"; continue; fi
    if [ "$check" = 1 ]; then echo "DIST  $n  in the VM's asbl\\dist is ${have:-unreadable}, not the kept ${want:0:16}...: would copy $folder/$n there"; continue; fi
    [ "$(sha256sum "$folder/$n" 2>/dev/null | cut -d' ' -f1)" = "$want" ] || { echo "FAIL  $folder/$n is not the kept file (sha256)"; bad=1; continue; }
    win_scp "$folder/$n" "$(printf '%s' "$WIN_REPO\\asbl\\dist\\$n" | tr '\\' '/')" || { echo "FAIL  could not copy $n to the VM"; bad=1; continue; }
    have=$(win_dist_sha "$n")
    if [ "$have" = "$want" ]; then echo "DIST  $n  copied from $folder to the VM's asbl\\dist (it was ${have:-another file} before), checked"
    else echo "FAIL  $n in the VM's asbl\\dist after the copy: sha256 ${have:-unreadable}, not ${want:0:16}..."; bad=1; fi
  done
  return "$bad"
}

# Job dp-ci-release-step3-release-windows-vm (`dp-ci.sh win release`): the Windows release, MODE=rehearsal (the default),
# MODE=upload or MODE=public, UPLOAD=no (the default) or yes, DRY_RUN=no|yes. Pack, prove, keep, upload, in that order:
# nothing is uploaded before the electron light set and the Robot UAT passed, and nothing at all unless UPLOAD=yes. Never at
# the same time as the Docker job's Windows part (one VM). One rehearsal makes one pack, so every check below is of the very
# files that are kept and staged; their sha256 are printed and kept in <log>-step-release-files.txt (owner, 2026-10-22).
# The day before a release (plan-pre-release-artifacts-ready): MODE=rehearsal UPLOAD=no after step 2: about 8-14 h on the VM
# (the pack 2-4 h, the electron light set 2-4 h with its own prepare, the Robot UAT 2-5 h; caps RELEASE_PACK_TIMEOUT 8 h,
# RELEASE_LIGHT_TIMEOUT 6 h, RELEASE_ROBOT_TIMEOUT 6 h). It leaves datapallas.zip, datapallas-server.zip and datapallas-src.zip
# in <artifacts>/<version>-<commit>/ (release-keep.sh), the windows lines of MANIFEST.txt and failure-report-windows.md, and
# step1.windows-vm-electron-light recorded on the commit. Release day: MODE=upload UPLOAD=yes, then MODE=public.
# MODE=rehearsal: a real release into places users do not get; nothing users get changes. Every part runs whatever the one
# before it said (a red light set does not skip the UAT); only the upload refuses a red run.
#   first              the version gate (release-state.sh version-check windows: settings.xml against the released
#                      Windows version; nothing to release ends here, green, with no pack), the prerequisites within
#                      seconds (asbl/ci/release-publish.sh preflight files: the tools, the publish credentials and that
#                      they work; the VM, its Docker Desktop, Java and Maven, which the light set needs; any missing =
#                      FAILED, each named with what to provide, the VM untouched), this host's checkout and the VM's both
#                      on origin/main, and the step 1 guard (release-state.sh step1-guard: step 1 not green on this commit =
#                      REFUSED within seconds, naming step 1; windows-vm-electron-light is this job's own part 2, shown as
#                      proven later; it never runs a step 1 lane)
#   1/4 pack           asbl\pack-datapallas.bat on the VM: empties dist, target and the project's Maven cache, builds
#                      everything again (DataPallas.exe included), and leaves datapallas.zip, datapallas-server.zip and
#                      datapallas-src.zip in asbl\dist. It builds no Docker image and needs no Docker Desktop: the Docker
#                      release is built once, on Linux, by step 2. Then the three zips brought down to this host and kept
#                      (asbl/ci/release-keep.sh keep windows: <artifacts>/<version>-<commit>/, each checked against the pack's
#                      sha256; an earlier set of the same commit moves to replaced/, never deleted).
#   2/4 electron light the desktop app built from the repository, its light set: dp-ci.sh win e2e with E2E_SPEC=light
#                      (WIN_LIGHT_SPEC, the five specs every light set runs, retries 1) on the release commit, its own
#                      prepare (pack-prepare-for-e2e.bat, which empties asbl\dist), recorded as
#                      step1.windows-vm-electron-light on the commit: step 1 needs no hand-started lane for it.
#   3/4 Robot UAT      the pack's zips put back in asbl\dist from the kept copy when the prepare emptied it (win_put_dist,
#                      sha256 checked), then asbl\src\uat\run-tests.bat, unchanged: extracts datapallas.zip and
#                      datapallas-server.zip and runs every .robot file as a user meets the product - Java and Chocolatey
#                      removed and installed, the exe, the command line, the server and its Windows service. A bare step:
#                      the machine's Java, never the CI's; elevated (WIN_RUN_ELEVATE=1), so its installs and teardowns
#                      meet no UAC prompt nobody could answer. No pack = not run (a failure of the run).
#   4/4 kept, upload   what it kept (each file against the manifest), then, only when parts 1-3 are green: still
#                      origin/main and step 1 green (UPLOAD=no: only said), then (asbl/ci/release-publish.sh stage-files):
#                      UPLOAD=yes: this host deletes the Windows files of earlier rehearsals (its own credentials), the VM
#                      itself uploads datapallas.zip, datapallas-server.zip and datapallas-src.zip from its asbl\dist to
#                      rehearsal/<version>-<commit>/ (each checked against the pack's sha256 first; its own rclone, put in
#                      place before the pack by win_rclone_ensure; the Backblaze key only in that rclone's environment,
#                      through the SSH session's stdin: win_stage_upload), this host checks each by download, recorded as
#                      rehearsal.windows (MODE=public copies it). No public link moves.
#                      UPLOAD=no: the exact commands it would run, nothing uploaded, no credential read, rclone not
#                      installed; recorded as rehearsal.windows PASS upload=no, which MODE=public never copies.
#   Then, whatever happened: the windows channel's verdict in the manifest, the failure report (every failure of the light
#   set and the UAT, with its test, its step, its error and its evidence, then grouped; release-keep.sh) and the summary.
#   Green only when all four are (or when there is nothing to release). A red one means a new commit and the steps
#   again, never a patched zip.
# MODE=upload: release day's upload of what a rehearsal kept, no new pack (release-publish.sh upload-kept windows: the kept
#   files checked against the manifest and the record, put back in the VM's asbl\dist when needed, then stage-files). Minutes.
# MODE=public: the public release, the deliberate act: refused at once unless UPLOAD=yes. It never replaces public files
# with files that did not pass a rehearsal that uploaded them. First the
# version gate, as above (this version already public on Windows = nothing to release, green), the prerequisites (preflight
# files public: the Cloudflare token too), then the newest PASSED rehearsal of this version (release-state.sh rehearsed
# windows <version>, on whichever commit):
#   found: WINDOWS PUBLIC, the copy, minutes, the VM untouched (release-publish.sh publish windows): the rehearsed zips to
#          newest/ and <version>/, newest/windows-version.txt, public.windows recorded;
#   none:  "no passed rehearsal of <version> on the windows channel: rehearsing first", the rehearsal above on
#          origin/main, then the copy, only when the rehearsal is green. A red rehearsal leaves the public files as they are.
# DRY_RUN=yes, all modes: packs, tests, keeps, stages and copies nothing, and the VM is not touched: the gate, the
# prerequisites (the bucket listed, not written), the guard, which rehearsal it would copy or that it would rehearse first,
# and what each part would do (DRY_RUN=1 counts as yes).
win_release() {
  local base vmc hostc files ok=1 rc gate res_pack=NOT_RUN res_light=NOT_RUN res_robot=NOT_RUN res_keep=NOT_RUN res_stage=NOT_RUN mode dry reh
  local uat n counts pass fail skip folder inc light_log kept="" log keep="bash $REPO/asbl/ci/release-keep.sh"
  mode="${MODE:-rehearsal}"
  case "$mode" in rehearsal|upload|public) ;; *) echo "FAIL  MODE must be rehearsal, upload or public (got '$mode')" >&2; return 2 ;; esac
  case "${DRY_RUN:-no}" in no|0) dry=no ;; yes|1) dry=yes ;; *) echo "FAIL  DRY_RUN must be no or yes (got '$DRY_RUN')" >&2; return 2 ;; esac
  UPLOAD="${UPLOAD:-no}"
  case "$UPLOAD" in no|yes) export UPLOAD ;; *) echo "FAIL  UPLOAD must be no or yes (got '$UPLOAD')" >&2; return 2 ;; esac
  echo "WINDOWS RELEASE: mode=$mode upload=$UPLOAD dry_run=$dry"
  if [ "$mode" = public ] && [ "$UPLOAD" != yes ]; then
    echo "REFUSED: MODE=public publishes, the deliberate act: run it with UPLOAD=yes. Nothing was packed, tested, staged or copied."
    echo "RELEASE_RESULT refused: MODE=public needs UPLOAD=yes"
    return 1
  fi
  if [ "$mode" = upload ]; then
    mark_start "WINDOWS UPLOAD" "release day: the kept Windows zips uploaded, no new pack (release-publish.sh upload-kept windows)"
    (cd "$REPO" && sync_host_repo) || return 2
    DRY_RUN=$dry bash "$REPO/asbl/ci/release-publish.sh" upload-kept windows; rc=$?
    mark_end "$rc"
    return "$rc"
  fi
  uat="$WIN_REPO\\asbl\\src\\uat"
  base="${WIN_E2E_LOG:-${LOG_DIR:-/var/kraft-internalsystems/logs/datapallas-ci}/win-release-$(date -u +%Y%m%dT%H%M%SZ)-step.log}"
  base="${base%.log}"
  log="${base%-step}.log"
  mkdir -p "$(dirname "$base")" 2>/dev/null
  mark_start "RELEASE STEP 1/4" "the version gate and the prerequisites; then a copy of a passed rehearsal (MODE=public), or the step 1 guard, the VM's rclone (UPLOAD=yes) and the pack: the VM on origin/main, asbl\\pack-datapallas.bat, the files' sha256, the zips kept on this host"
  (cd "$REPO" && sync_host_repo) || return 2
  gate=$(bash "$REPO/asbl/ci/release-state.sh" version-check windows); rc=$?
  printf '%s\n' "$gate"
  case "$rc" in
    0) RELEASE_VERSION=$(printf '%s\n' "$gate" | sed -n 's/^RELEASE_VERSION=\([^ ]*\) .*/\1/p') ;;
    3) echo "RELEASE_RESULT nothing to release: nothing packed, staged or copied"; return 0 ;;
    *) echo "RELEASE_RESULT refused by the version gate (above): no pack"; return 1 ;;
  esac
  hostc=$(git -C "$REPO" rev-parse HEAD)
  # what the run needs, within seconds, before anything slow (the files' checks are the same for a copy: none needs the VM)
  DRY_RUN=$dry bash "$REPO/asbl/ci/release-publish.sh" preflight files $([ "$mode" = public ] && echo public) ||
    { echo "FAILED: prerequisites missing (above): nothing packed, staged or copied"; return 1; }
  if [ "$mode" = public ]; then
    if reh=$(bash "$REPO/asbl/ci/release-state.sh" rehearsed windows "$RELEASE_VERSION"); then
      set -- $reh   # REHEARSED <commit> <time>
      echo "MODE=public: copying the rehearsal of $RELEASE_VERSION that passed on ${2:0:8} ($3): nothing is packed or tested again"
      mark_end 0
      win_release_copy "$RELEASE_VERSION" "$2" "$dry"; return $?
    fi
    printf '%s\n' "$reh"
    echo "no passed rehearsal of $RELEASE_VERSION on the windows channel: rehearsing first (on ${hostc:0:8}, origin/main), then the copy"
  fi
  # the VM, its Docker Desktop, Java and Maven (part 2, the electron light set, needs them), in seconds, before the step 1 guard
  # and the pack (a copy above needs none); it only reads, so a dry run checks it too
  prereq vm vm-docker vm-java vm-mvn || { echo "FAILED: prerequisites missing (above): nothing packed, staged or copied"; return 1; }
  # windows-vm-electron-light is this job's own part 2: proven later, not required now; the upload requires it
  RELEASE_COMMIT="$hostc" STEP1_PROVEN_LATER=windows-vm-electron-light bash "$REPO/asbl/ci/release-state.sh" step1-guard || return 1
  # the VM's rclone for the upload at the end: in place before the pack, so a failed install shows in a minute, not hours
  # later (a dry run only says whether it is there; UPLOAD=no only what it would do)
  if [ "$UPLOAD" != yes ]; then win_rclone_ensure print
  elif [ "$dry" = yes ]; then win_rclone_ensure check
  else win_rclone_ensure || { echo "FAILED: no rclone on the Windows VM for the upload (above): nothing packed, staged or copied"; return 1; }
  fi
  if [ "$dry" = yes ]; then
    echo "dry run: would put the VM on ${hostc:0:8}, run asbl\\pack-datapallas.bat there, print the zips' sha256 and keep them in ${RELEASE_ARTIFACTS_DIR:-$LOG_DIR/release-artifacts}/$RELEASE_VERSION-${hostc:0:8}/"
    mark_next "RELEASE STEP 2/4" "the electron light set (dry run)"
    echo "dry run: would run dp-ci.sh win e2e with E2E_SPEC=light (WIN_LIGHT_SPEC) on ${hostc:0:8}, its own prepare first, and record step1.windows-vm-electron-light"
    mark_next "RELEASE STEP 3/4" "Robot Framework UAT (dry run)"
    echo "dry run: would put the pack's zips back in asbl\\dist when needed and run asbl\\src\\uat\\run-tests.bat on them"
    mark_next "RELEASE STEP 4/4" "what it kept, the upload (dry run, UPLOAD=$UPLOAD)"
    if [ "$UPLOAD" = yes ]; then echo "dry run: would delete earlier Windows rehearsals here, have the VM upload datapallas.zip, datapallas-server.zip and datapallas-src.zip to rehearsal/$RELEASE_VERSION-${hostc:0:8}/ with its rclone, check them here by download and record rehearsal.windows"
    else echo "dry run: UPLOAD=no: would print the uploads it skips, write nothing, and record rehearsal.windows upload=no"; fi
    echo "dry run: then would write the failure report and the summary beside the manifest"
    mark_end 0
    [ "$mode" = public ] && echo "dry run: then would copy that rehearsal to the public places (release-publish.sh publish windows $RELEASE_VERSION ${hostc:0:8})"
    echo "RELEASE_RESULT dry run: nothing packed, tested, kept, staged or copied"
    return 0
  fi
  win_sync_repo || return $?
  vmc=$(win_ssh "git -C $WIN_REPO rev-parse HEAD" 2>/dev/null | tr -d '\r' | tail -1)
  [ -n "$vmc" ] || { echo "FAIL  could not read the VM's commit" >&2; return 2; }
  [ "$vmc" = "$hostc" ] || { echo "FAIL  the VM is at ${vmc:0:8}, this host at ${hostc:0:8}: origin/main moved during the start, run it again" >&2; return 2; }
  echo "RELEASE_COMMIT=${vmc:0:8} RELEASE_VERSION=$RELEASE_VERSION"
  folder=$($keep begin windows "$RELEASE_VERSION" "$vmc") || { echo "FAILED: the artifacts folder (above)"; return 1; }
  echo "RELEASE_ARTIFACTS=$folder"
  win_server_down "$WIN_REPO\\frend\\reporting\\testground\\server\\DataPallas" >/dev/null
  win_stacks_down server
  win_temp_clean

  WIN_RUN_ENV="" WIN_RUN_WATCH="$WIN_REPO\\asbl\\pack-datapallas.log" WIN_RUN_TIMEOUT="${RELEASE_PACK_TIMEOUT:-28800}" WIN_RUN_STALL=7200 \
    win_run release-pack "$WIN_REPO\\asbl" pack-datapallas.bat
  rc=$?
  if [ "$rc" -ne 0 ]; then
    # First the lines that name the failure, then the log's end. A failing test of the pack ends the log in a Maven
    # stack trace naming the fork, not the test or its error (2026-10-26: "git ls-files did not finish" sat 100 lines
    # above the last 60), and the failure report quotes the last 40 lines of this step.
    echo "--- asbl\\pack-datapallas.log, the lines naming the failure ---"
    win_ps 2>&1 <<PS | tr -d '\r'
Select-String -Path '$WIN_REPO\\asbl\\pack-datapallas.log' -Pattern '<<< (FAILURE|ERROR)!', 'BUILD FAILED', '^\[ERROR\] Failed to execute goal' -Context 0,1 -ErrorAction SilentlyContinue |
  Select-Object -First 8 | ForEach-Object { \$_.Line; \$_.Context.PostContext }
PS
    echo "--- asbl\\pack-datapallas.log (last 20 lines) ---"
    win_ps 2>&1 <<PS | tr -d '\r'
Get-Content '$WIN_REPO\\asbl\\pack-datapallas.log' -Tail 20 -ErrorAction SilentlyContinue
PS
    res_pack="FAIL(exit $rc)"
  else
    # what the pack made: the three zips with their sha256
    files=$(win_ps 2>&1 <<PS | tr -d '\r'
\$ok = \$true
foreach (\$n in 'datapallas.zip', 'datapallas-server.zip', 'datapallas-src.zip') {
  \$f = Join-Path '$WIN_REPO\\asbl\\dist' \$n
  if (Test-Path \$f) { "RELEASE_FILE " + (Get-FileHash -Algorithm SHA256 \$f).Hash.ToLower() + "  " + (Get-Item \$f).Length + "  " + \$n }
  else { "FAIL  \$n is not in asbl\\dist"; \$ok = \$false }
}
if (\$ok) { exit 0 } else { exit 1 }
PS
)
    rc=$?
    printf '%s\n' "$files"
    if [ "$rc" -ne 0 ]; then
      res_pack="FAIL(output)"
    else
      res_pack=PASS
      { echo "commit   $vmc"
        echo "version  $RELEASE_VERSION"
        printf '%s\n' "$files" | sed -n 's/^RELEASE_FILE /sha256   /p'
      } > "$base-release-files.txt"
      echo "RELEASE_FILES=$base-release-files.txt"
      # kept on this host at once: the light set's prepare below empties asbl\dist
      res_keep=FAIL
      if inc=$(mktemp -d "$folder/.incoming-windows.XXXXXX"); then
        kept=""
        for n in datapallas.zip datapallas-server.zip datapallas-src.zip; do
          win_pull "$(printf '%s' "$WIN_REPO\\asbl\\dist\\$n" | tr '\\' '/')" "$inc/$n" &&
            [ "$(sha256sum "$inc/$n" | cut -d' ' -f1)" = "$(sed -n "s/^sha256   \([0-9a-f]\{64\}\)  [0-9]*  $n\$/\1/p" "$base-release-files.txt")" ] ||
            { echo "FAIL  $n brought down from the VM is not the pack's (sha256) or could not be copied"; kept=""; break; }
          kept="$kept $n=$inc/$n"
        done
        [ -n "$kept" ] && $keep keep windows "$RELEASE_VERSION" "$vmc" $kept && res_keep=PASS
        rm -rf "$inc"
      fi
    fi
  fi
  $keep step windows "$RELEASE_VERSION" "$vmc" "RELEASE STEP 1/4" "${res_pack%%(*}" "the pack: asbl\\pack-datapallas.bat on the VM ($res_pack)" "$log" >/dev/null
  [ "$res_pack" = PASS ] && $keep step windows "$RELEASE_VERSION" "$vmc" "RELEASE STEP 1/4 keep" "$res_keep" "the three zips brought down and kept in $folder" "$log" >/dev/null

  mark_end "$([ "$res_pack" = PASS ] && echo 0 || echo 1)"
  mark_start "RELEASE STEP 2/4" "the electron light set on ${vmc:0:8}: dp-ci.sh win e2e with E2E_SPEC=light (WIN_LIGHT_SPEC: features/quick-start, areas/configuration, components/log-files-viewer-separate-tabs, areas/cubes-definitions, features/apps-ai-hub), the app built from the repository; recorded as step1.windows-vm-electron-light"
  # the lane as step 1 ran it (its own prepare, its reports), in a subshell so its settings stay its own; a 6 h cap, as the
  # targeted Windows runs have (win-ci.env)
  light_log="$base-electron-light.log"
  if ( export E2E_SPEC=light E2E_GREP="" E2E_RETRIES="" WIN_E2E_LOG="$light_log" WIN_RUN_WATCH="" WIN_RUN_STALL="" \
         WIN_RUN_TIMEOUT="${RELEASE_LIGHT_TIMEOUT:-21600}"; mark_run win_e2e ); then res_light=PASS; else res_light=FAIL; fi
  RELEASE_COMMIT="$vmc" RELEASE_LOG="$light_log" bash "$REPO/asbl/ci/release-state.sh" record step1.windows-vm-electron-light "$res_light" \
    "version=$RELEASE_VERSION" "by=step 3, dp-ci.sh win release RELEASE STEP 2/4"
  # The lane can die before it writes its own log (the pack leaves the checkout dirty, the driver never starts):
  # then this run's log is the only evidence there is, and the failure report must cite it instead of a file
  # nobody will ever find (2026-10-25, group E: the report pointed at a log that did not exist).
  light_evidence="$light_log"
  [ -f "$light_log" ] || light_evidence="$log"
  $keep step windows "$RELEASE_VERSION" "$vmc" "RELEASE STEP 2/4" "$res_light" "the electron light set (E2E_SPEC=light, WIN_LIGHT_SPEC) on the app built from the repository" "$light_evidence" "${light_log%.log}-playwright.json" >/dev/null
  mark_end "$([ "$res_light" = PASS ] && echo 0 || echo 1)"

  mark_start "RELEASE STEP 3/4" "Robot Framework UAT: the pack's zips in asbl\\dist (put back from the kept copy when needed), then asbl\\src\\uat\\run-tests.bat"
  if [ "$res_pack" != PASS ]; then
    echo "not run: there is no pack ($res_pack) to test"
  elif ! win_put_dist "$folder" $(sed -n 's/^sha256   \([0-9a-f]\{64\}\)  [0-9]*  \([A-Za-z0-9._-]*\)$/\2:\1/p' "$base-release-files.txt"); then
    echo "not run: the pack's zips are not in the VM's asbl\\dist and could not be put back (above)"
  else
    # the suite's own set-up, once: its venv. Before it, what an earlier UAT run left: a chromedriver.exe that
    # still holds that run's step.log open, so the step cannot write its log and does not run (win_run's
    # EXIT=97), and an earlier run's results folder must never be read as this run's verdict (2026-10-26)
    win_ps 2>&1 <<PS | tr -d '\r'
Get-Process chromedriver -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item '$uat\\results' -Recurse -Force -ErrorAction SilentlyContinue
if (-not (Test-Path '$uat\\.venv\\Scripts\\activate.bat')) {
  Set-Location '$uat'
  & powershell -NoProfile -ExecutionPolicy Bypass -File requirements-install.ps1 2>&1 | Select-Object -Last 5
}
PS
    # WIN_RUN_ELEVATE: the suites install and uninstall Java and Chocolatey, so the task itself must be
    # elevated (a UAC prompt on the VM's desktop has nobody to answer it; group H of 2026-10-25).
    WIN_RUN_ENV="" WIN_RUN_BARE=1 WIN_RUN_WATCH="" WIN_RUN_ELEVATE=1 WIN_RUN_TIMEOUT="${RELEASE_ROBOT_TIMEOUT:-21600}" WIN_RUN_STALL=5400 \
      win_run release-robot "$uat" run-tests.bat
    # run-tests.bat does not pass Robot's exit code on: the verdict is the suite's own output.xml
    rm -rf "$base-robot"
    WIN_SCP_EXTRA=-r win_pull "$(printf '%s' "$uat\\results" | tr '\\' '/')" "$base-robot" 2>/dev/null
    res_robot=FAIL
    counts=$(python3 - "$base-robot/output.xml" <<'PY' 2>/dev/null
import sys, xml.etree.ElementTree as ET
s = ET.parse(sys.argv[1]).getroot().find('statistics/total/stat')
print(s.get('pass', 0), s.get('fail', 0), s.get('skip', 0))
PY
)
    if [ -n "$counts" ]; then
      read -r pass fail skip <<< "$counts"
      echo "ROBOT_RESULT passed=$pass failed=$fail skipped=$skip report=$base-robot/report.html"
      [ "$fail" = 0 ] && [ "$skip" = 0 ] && [ "$pass" -gt 0 ] && res_robot=PASS
    else
      echo "ROBOT_RESULT no output.xml - the suite did not finish (see the step output above)"
    fi
  fi
  $keep step windows "$RELEASE_VERSION" "$vmc" "RELEASE STEP 3/4" "$res_robot" "the Robot UAT (asbl\\src\\uat\\run-tests.bat, all seven suites) on the pack's zips" "$log" "$([ -d "$base-robot" ] && echo "$base-robot/output.xml")" >/dev/null
  mark_end "$([ "$res_robot" = PASS ] && echo 0 || echo 1)"

  mark_start "RELEASE STEP 4/4" "what it kept, then the upload, UPLOAD=$UPLOAD: datapallas.zip, datapallas-server.zip, datapallas-src.zip to rehearsal/$RELEASE_VERSION-${vmc:0:8}/, checked by download"
  [ "$res_keep" = PASS ] && bash "$REPO/asbl/ci/release-keep.sh" check "$folder" windows
  if [ "$res_pack" != PASS ] || [ "$res_keep" != PASS ] || [ "$res_light" != PASS ] || [ "$res_robot" != PASS ]; then
    echo "not uploaded: the run is red (pack=$res_pack keep=$res_keep light=$res_light robot=$res_robot)"
    RELEASE_COMMIT="$vmc" RELEASE_LOG="$log" bash "$REPO/asbl/ci/release-state.sh" record rehearsal.windows FAIL \
      "version=$RELEASE_VERSION" "pack=$res_pack" "keep=$res_keep" "light=$res_light" "robot=$res_robot"
    ok=0
  # hours after the start: still origin/main, and step 1 green on it (a later step-1 run may have recorded red); UPLOAD=no:
  # nothing is uploaded, so an incomplete step 1 is said, and release day's upload checks it again
  elif ! git -C "$REPO" fetch -q origin || [ "$(git -C "$REPO" rev-parse origin/main)" != "$vmc" ]; then
    echo "not uploaded: origin/main moved since the start (or could not be read)"
    res_stage=FAIL; ok=0
  elif [ "$UPLOAD" = yes ] && ! RELEASE_COMMIT="$vmc" bash "$REPO/asbl/ci/release-state.sh" require step1; then
    echo "not uploaded: step 1 is not green on ${vmc:0:8}"
    res_stage=FAIL; ok=0
  else
    [ "$UPLOAD" = yes ] || RELEASE_COMMIT="$vmc" DRY_RUN=yes bash "$REPO/asbl/ci/release-state.sh" require step1 ||
      echo "UPLOAD=no  the upload would be refused now: step 1 is not complete on ${vmc:0:8} (above); release day's upload checks it again"
    # the VM uploads the three zips itself, from its asbl\dist (release-publish.sh stage-files -> win stage-upload); this
    # host cleans earlier rehearsals first and checks each upload by download. UPLOAD=no: the commands, nothing written.
    if RELEASE_COMMIT="$vmc" RELEASE_LOG="$log" \
       bash "$REPO/asbl/ci/release-publish.sh" stage-files "$RELEASE_VERSION" "$base-release-files.txt"; then
      res_stage=PASS
      if [ "$UPLOAD" != yes ]; then
        RELEASE_COMMIT="$vmc" RELEASE_LOG="$log" bash "$REPO/asbl/ci/release-state.sh" record rehearsal.windows PASS \
          "version=$RELEASE_VERSION" "pack=PASS" "light=PASS" "robot=PASS" "upload=no" "kept=$folder" \
          "sha256=$(sed -n 's/^sha256   \([0-9a-f]\{64\}\)  [0-9]*  \([A-Za-z0-9._-]*\)$/\2:\1/p' "$base-release-files.txt" | tr '\n' ' ' | sed 's/ $//')"
        res_stage=SKIPPED
      fi
    else
      res_stage=FAIL; ok=0
    fi
    $keep step windows "$RELEASE_VERSION" "$vmc" "RELEASE STEP 4/4" "$([ "$res_stage" = FAIL ] && echo FAIL || echo PASS)" "the upload, UPLOAD=$UPLOAD ($res_stage)" "$log" >/dev/null
  fi

  mark_end "$(case "$res_stage" in PASS|SKIPPED) echo 0 ;; *) echo 1 ;; esac)"
  echo ""
  [ -f "$base-release-files.txt" ] && cat "$base-release-files.txt"
  $keep finish windows "$RELEASE_VERSION" "$vmc" "$([ "$ok" = 1 ] && echo PASS || echo FAIL)" "$log"
  echo "RELEASE_RESULT commit=${vmc:0:8} version=$RELEASE_VERSION pack=$res_pack keep=$res_keep light=$res_light robot=$res_robot stage=$res_stage upload=$UPLOAD$([ "$res_stage" = SKIPPED ] && echo " (proven and kept; nothing uploaded, nothing for MODE=public to copy: release day uploads the kept files, MODE=upload UPLOAD=yes)")"
  if [ "$ok" != 1 ]; then
    [ "$mode" = public ] && echo "MODE=public: the rehearsal is red, nothing copied: the public files are as they were"
    return 1
  fi
  [ "$mode" = public ] || return 0
  win_release_copy "$RELEASE_VERSION" "$vmc" "$dry"
}

# win_release_copy <version> <commit> <dry>: MODE=public's copy of the Windows rehearsal that passed on <commit>
win_release_copy() {
  local rc
  mark_start "WINDOWS PUBLIC" "the rehearsal of $1 on ${2:0:8} copied to the public places (release-publish.sh publish windows)"
  DRY_RUN="$3" bash "$REPO/asbl/ci/release-publish.sh" publish windows "$1" "$2"; rc=$?
  mark_end "$rc"
  if [ "$rc" != 0 ]; then echo "RELEASE_RESULT commit=${2:0:8} version=$1 public=FAIL"
  elif [ "$3" = yes ]; then echo "RELEASE_RESULT commit=${2:0:8} version=$1 public=DRY_RUN (nothing copied)"
  else echo "RELEASE_RESULT commit=${2:0:8} version=$1 public=PASS"; fi
  return "$rc"
}

# W1 "done when": the VM answers, and no firewall window was needed to make it answer.
win_check() {
  local rc probe fw ver
  local expected='a"b%c&d|e<f>g^h\i j'      # every character cmd.exe would mangle on the way
  win_conf_ok || { echo "WIN_CHECK_RESULT ssh=FAIL reason=not-configured"; return 1; }
  # deliberately not echoed: the host, the account name and the key path. A CI log is pasted around.
  echo "target: configured from $WIN_CI_CONF"
  [ -r "$WIN_SSH_KEY" ] || { echo "WIN_CHECK_RESULT ssh=FAIL reason=no-readable-key"; return 1; }
  ver=$(win_ssh ver 2>&1); rc=$?          # bare `ver`, not `cmd /c ver` — see the quoting note above
  if [ $rc != 0 ]; then
    echo "$ver"
    echo "WIN_CHECK_RESULT ssh=FAIL exit=$rc  (255 = could not connect: VM off, IP moved, sshd stopped)"
    return 1
  fi
  probe=$(win_ps <<'PS'
Write-Output 'a"b%c&d|e<f>g^h\i j'
PS
)
  probe=${probe%$'\r'}                       # PowerShell ends lines with CRLF
  fw=$(ufw status 2>/dev/null | grep -c dp-ci-win)
  echo "windows: $(printf '%s' "$ver" | tr -d '\r' | tr -s ' ')"
  [ "$probe" = "$expected" ] || echo "QUOTING_BROKEN sent=[$expected] got=[$probe]"
  echo "WIN_CHECK_RESULT ssh=OK quoting=$([ "$probe" = "$expected" ] && echo OK || echo BROKEN) dp_ci_win_rules=$fw"
  [ "$probe" = "$expected" ] && [ "$fw" = 0 ]
}

# The apps DataPallas starts (AI Hub, playgrounds, CloudBeaver, ...) work from dp-dev as from an installation:
# - their servers find DataPallas as `datapallas-server` on the `datapallas` network, the Docker server's own name
#   and network (asbl/docker/docker-compose.yml): DP_API_URL for the AI Hub, Grails' RbUtils tries it first;
# - a browser finds each app at https://<dev host>-<port>.<domain>: DP_APPS_URL is the Apps URL DataPallas uses
#   until one is saved in More Settings, and dev_app_proxies() makes those hosts on the reverse proxy;
# - the sign-in cookie covers the whole domain, so the app hosts see the same signed-in user.
# One dev site at a time can hold the `datapallas-server` name (the apps' container names are fixed anyway).
dev_app_proxies() {  # $1 = the dev site's host label (dp-dev), $2 = its domain (bkstg.flowkraft.com)
  local made=() port target conf
  [ -d "$RPROXY_CONF_DIR" ] || { echo "dp-dev apps: no reverse-proxy files at $RPROXY_CONF_DIR, app hosts not made"; return 0; }
  # the proxy reaches each app by container name on the apps' network: host-published ports are dropped by ufw
  docker network inspect "$APPS_NETWORK" -f '{{range .Containers}}{{.Name}} {{end}}' | tr ' ' '\n' | grep -qx "$RPROXY_CONTAINER" ||
    docker network connect "$APPS_NETWORK" "$RPROXY_CONTAINER" || return 1
  # one host per published port of every app (read from the apps' docker-compose files), made only when missing
  while read -r port target; do
    conf="$RPROXY_CONF_DIR/$1-$port.subdomain.conf"
    [ -f "$conf" ] && continue
    cat >"$conf" <<EOF
# made by asbl/ci/dp-ci.sh (dev_app_proxies): app port $port of $1, behind the same Authelia login
server {
    listen      443 ssl http2;
    server_name $1-$port.$2;
    ssl_certificate         /etc/letsencrypt/live/$2/fullchain.pem;
    ssl_certificate_key     /etc/letsencrypt/live/$2/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$2/chain.pem;
    include nginxconfig.io/general.conf;
    include nginxconfig.io/security.conf;
    include nginxconfig.io/authelia-location.conf;
    location ^~ / {
        proxy_http_version                 1.1;
        proxy_cache_bypass                 \$http_upgrade;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        \$connection_upgrade;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header Forwarded         \$proxy_add_forwarded;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout              600s;
        proxy_send_timeout                 600s;
        proxy_read_timeout                 600s;
        include nginxconfig.io/authelia-authrequest.conf;
        resolver   127.0.0.11  valid=30s;
        set \$backend_url "http://$target";
        proxy_pass \$backend_url;
    }
}
server {
    listen 80;
    server_name $1-$port.$2;
    return 301 https://\$server_name\$request_uri;
}
EOF
    made+=("$conf")
  done < <(echo "9090 datapallas-server:9090"
           python3 - "$REPO/asbl/src/main/external-resources/db-template/_apps" <<'PY'
import glob, re, sys
for f in sorted(glob.glob(sys.argv[1] + "/**/docker-compose.yml", recursive=True)):
    if "/xx-custom/" in f:
        continue
    service = name = None
    for line in open(f):
        m = re.match(r"^  ([\w-]+):\s*$", line)
        if m:
            service = name = m.group(1)
        m = re.match(r"^\s+container_name:\s*(\S+)", line)
        if m:
            name = m.group(1)
        m = re.match(r'^\s+-\s*"?(?:\$\{\w+:-)?(\d+)\}?:(\d+)"?', line)
        if m and service:
            print(m.group(1), "%s:%s" % (name, m.group(2)))
PY
          )
  [ ${#made[@]} = 0 ] && return 0
  if docker exec "$RPROXY_CONTAINER" nginx -t >/dev/null 2>&1; then
    docker exec "$RPROXY_CONTAINER" nginx -s reload >/dev/null 2>&1 && echo "dp-dev apps: ${#made[@]} app hosts added on the reverse proxy"
  else
    rm -f "${made[@]}"
    echo "FAIL  nginx refused the new app hosts, removed them again"; return 1
  fi
}

# dp-dev runs in its own container on the reverse-proxy network (like www-datapallas-com-dev), NOT on the
# host network: the reverse proxy cannot reach host-network ports (ufw drops them).
start_dev_container() {
  local sha log host="${DEV_URL#*://}"
  host="${host%%/*}"
  sha=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)
  [ -z "$(git -C "$REPO" status --porcelain 2>/dev/null)" ] || sha="$sha-dirty"
  log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-dev-$sha.log"
  ln -sfn "$log" "$LOG_DIR/$DEV_LOG_LINK"
  # created as compose itself would, so the apps' `docker compose up` takes it as their own
  docker network inspect "$APPS_NETWORK" >/dev/null 2>&1 ||
    docker network create --label com.docker.compose.network=default "$APPS_NETWORK" >/dev/null || return 1
  docker rm -f "$DEV_CONTAINER" >/dev/null 2>&1
  docker run -d --rm --name "$DEV_CONTAINER" --network "$DEV_NETWORK" --ulimit core=0 \
    -v "$REPO":"$REPO" -w "$REPO" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$DEV_M2":/root/.m2 -v dp-ci-npm:/root/.npm -v dp-ci-cache:/root/.cache \
    -v "$LOG_DIR":"$LOG_DIR" \
    -e REPO="$REPO" -e TASK=dev -e SHA="$sha" -e LOG="$log" \
    -e DP_API_URL="http://datapallas-server:9090/api" -e DP_APPS_URL="https://${host%%.*}-{port}.${host#*.}" \
    -e SERVER_SERVLET_SESSION_COOKIE_DOMAIN="${host#*.}" \
    "$CI_IMAGE" bash "$REPO/asbl/ci/dp-ci.sh" --inside >/dev/null || return 1
  docker network connect --alias datapallas-server "$APPS_NETWORK" "$DEV_CONTAINER" || return 1
  dev_app_proxies "${host%%.*}" "${host#*.}" || echo "dp-dev apps: the app hosts are not in place"
  echo "dp-dev:  $DEV_CONTAINER started, $DEV_URL answers once the backend and UI have compiled (a few minutes)"
  echo "ai-hub:  $AI_HUB_URL - the AI Hub start page and the Canvas, from the sources, hot-reloading"
  echo "log:     $log   (also $LOG_DIR/$DEV_LOG_LINK)"
}

# The pinned dev site: a SEPARATE clone parked at one commit, its own container, its own maven repo,
# so nothing another agent commits can change what is being tested. The clone is built by
# asbl/ci/dp-dev-pinned.sh -- taken from THIS checkout, not from the pinned tree, so pinning to a
# commit older than this feature still works. The pinned tree is only ever read and built.
start_pinned_dev() {
  local sha="$1" log
  mkdir -p "$(dirname "$PINNED_REPO")" "$LOG_DIR"
  if [ ! -d "$PINNED_REPO/.git" ]; then
    echo "cloning $REPO -> $PINNED_REPO (once)"
    git clone -q "$REPO" "$PINNED_REPO" || return 1
  fi
  git -C "$PINNED_REPO" remote set-url origin "$REPO" 2>/dev/null
  git -C "$PINNED_REPO" fetch -q origin || return 1
  git -C "$PINNED_REPO" rev-parse --verify -q "$sha^{commit}" >/dev/null ||
    { echo "FAIL  $sha is not a commit in $PINNED_REPO"; return 1; }
  # Only TRACKED changes matter: a checkout would lose those. Build output that is merely untracked
  # (frend/reporting/src/assets/web-components/themes.css, for one) survives it and must not block.
  if [ -n "$(git -C "$PINNED_REPO" status --porcelain --untracked-files=no)" ]; then
    echo "FAIL  $PINNED_REPO has local changes -- look at them before they are lost"; return 1
  fi
  git -C "$PINNED_REPO" checkout -q --detach "$sha" || return 1
  echo "pinned at $(git -C "$PINNED_REPO" log --oneline -1)"
  log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-dev-pinned-$sha.log"
  ln -sfn "$log" "$LOG_DIR/dev-pinned-latest.log"
  docker rm -f "$PINNED_CONTAINER" >/dev/null 2>&1
  docker run -d --name "$PINNED_CONTAINER" --network "$DEV_NETWORK" --ulimit core=0 \
    -v "$PINNED_REPO":"$PINNED_REPO" -w "$PINNED_REPO" \
    -v "$REPO/asbl/ci":/dp-ci-driver:ro \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v dp-pinned-m2:/root/.m2 -v dp-ci-npm:/root/.npm -v dp-ci-cache:/root/.cache \
    -v "$LOG_DIR":"$LOG_DIR" \
    -e REPO="$PINNED_REPO" -e TASK=dev -e DEV_MODE=pinned -e SHA="$sha" -e LOG="$log" \
    "$CI_IMAGE" bash /dp-ci-driver/dp-dev-pinned.sh >/dev/null || return 1
  echo "dp-dev-pinned:  $PINNED_CONTAINER started on $sha"
  echo "log:            $log   (also $LOG_DIR/dev-pinned-latest.log)"
  echo "it answers at https://dp-dev-pinned.bkstg.flowkraft.com once the assembly and the UI are built"
  echo "stop:           docker stop $PINNED_CONTAINER"
}

# dp-ci.sh dev --refresh-content: the content half of the dev loop.
# A dev server hot-reloads its code, but it reads its samples, templates and scripts from
# testground/e2e -- a copy of the assembled package, made once and never refreshed since. This
# packages the content again on the jars that are already built (not the package rebuild, about 30 min) and
# copies it over testground/e2e, leaving the running server's own state alone. Content is read per
# request, so there is nothing to restart afterwards.
refresh_dev_content() {
  local container="$1" log rc
  docker ps --filter "name=^${container}$" --format '{{.Names}}' | grep -q . ||
    { echo "FAIL  $container is not running -- start it first"; return 1; }
  mkdir -p "$LOG_DIR"
  log="$LOG_DIR/$(date -u +%Y%m%dT%H%M%SZ)-dev-refresh-content.log"
  ln -sfn "$log" "$LOG_DIR/refresh-content-latest.log"
  echo "refreshing the content of $container   (log $log)"
  docker exec "$container" bash -c "cd '$REPO_IN_CONTAINER'/frend/reporting && npm run custom:dev-refresh-content" >"$log" 2>&1
  rc=$?
  tail -3 "$log"
  [ $rc = 0 ] || echo "FAIL  the content refresh failed -- see $log"
  return $rc
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
    local t0=$SECONDS
    "$@"
    local rc=$? s=$((SECONDS - t0))
    echo "<<< STEP $n END rc=$rc  $(date -u +%Y-%m-%dT%H:%M:%SZ)  took=${s}s ($((s / 60))m$((s % 60))s)"
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

  # What the e2e runs is the product as it is PACKAGED, not as it is in the tree: the testground is a copy of
  # asbl/target/package/verified-db-noexe (the AI Hub apps, db-template, config, scripts), and only the Java
  # jars and the Angular UI are rebuilt from source on every run. A package from an older commit therefore
  # tests old code under a new commit's name (2026-10-03: a 22 Sep package, still sending `LIMIT 500` to SQL
  # Server, was run as if it were current). So the package carries a stamp of the commit it was built from, and an
  # e2e rebuilds it whenever the stamp is not this commit. A tree with uncommitted changes is never "current".
  # prepare_package is asbl/pack-prepare-for-e2e.bat: clean + install without tests + AssemblerTest#prepareForE2E.
  PKG_STAMP=asbl/target/package/.built-from
  package_stamp() { mkdir -p "$(dirname "$PKG_STAMP")" && printf '%s\n' "$SHA" > "$PKG_STAMP"; }

  # package-rsync-simple-file-changes. The db-template files that differ between the commit the package was built from and the tree as
  # it is (commits, and new untracked files: the launcher refuses a tree with changes to tracked files) are copied into the package and the testground, but only where a copy is all the
  # assembler would have done with them: the package must hold the file byte for byte as it was at that commit (the assembler overlays
  # the bkend/reporting template and rewrites many configs and samples afterwards), and the assembler code must not name it (it may
  # generate or check it). One path that fails either test, or a deleted file, and nothing is copied: use package-repackage. A file the
  # package already holds as it is in the tree (copied by an earlier run) is left alone and not counted.
  PKG_RSYNC_COPIED=0
  package_rsync() {
    local from="$1" src=asbl/src/main/external-resources/db-template top=asbl/target/package/verified-db-noexe/DataPallas
    local tg=frend/reporting/testground/e2e st path rel why f d
    local -a copy=() refused=()
    git cat-file -e "$from^{commit}" 2>/dev/null ||
      { echo "!!! package-rsync-simple-file-changes: the package's commit '$from' is not in this clone - use package-repackage"; return 2; }
    while IFS=$'\t' read -r st path; do
      [ -n "$path" ] || continue
      rel=${path#"$src"/}; why=""
      if [ -f "$top/$rel" ] && cmp -s "$path" "$top/$rel"; then continue; fi
      if grep -rqF -- "$(basename "$rel")" asbl/src/main/java; then why="the assembler names it"
      else
        case "$st" in
          M) git show "$from:$path" 2>/dev/null | cmp -s - "$top/$rel" || why="the package does not hold it as a verbatim copy" ;;
          A|'??') [ -e "$top/$rel" ] && why="new in the tree, but the package already has another file there" ;;
          *) why="$st (only changed or new files are copied)" ;;
        esac
      fi
      if [ -n "$why" ]; then refused+=("$rel: $why"); else copy+=("$rel"); fi
    done < <(git diff --name-status --no-renames "$from" -- "$src"; git ls-files --others --exclude-standard -- "$src" | sed 's/^/??\t/')
    if [ ${#refused[@]} -gt 0 ]; then
      for f in "${refused[@]}"; do echo "refused: $f"; done
      echo "!!! package-rsync-simple-file-changes copied nothing: ${#refused[@]} changed path(s) are not plain copies - use package-repackage"
      return 2
    fi
    for rel in "${copy[@]}"; do
      for d in "$top" "$tg"; do
        [ -d "$d" ] || continue
        mkdir -p "$(dirname "$d/$rel")" && cp -p "$src/$rel" "$d/$rel" || return 1
      done
      echo "copied: $rel"
    done
    PKG_RSYNC_COPIED=${#copy[@]}
    # A package changed by a shortcut is no longer the one its first line names: the second line keeps it from ever being taken for a
    # package built from a clean commit (the stamp rule below then rebuilds it).
    [ "$PKG_RSYNC_COPIED" = 0 ] || printf '%s\nrsync %s files_copied=%s\n' "$from" "$SHA" "$PKG_RSYNC_COPIED" > "$PKG_STAMP"
    return 0
  }

  prepare_package() {
    local built from copied=0 t0; built=$(cat "$PKG_STAMP" 2>/dev/null); from=$(head -n 1 <<<"$built")
    # E2E_PACKAGE (the loop job dp-ci-dev-e2e-one-spec, targeted runs only; empty = the stamp rule below, unchanged). Every e2e run compiles the
    # jars and serves the UI from the tree; the package only supplies the CONTENT (_apps, db-template, config, samples, scripts, sample
    # databases). So a fix that changes none of that need not rebuild it:
    #   package-reuse-as-is               = run on the package exactly as it stands (specs, helpers, Java, Angular UI);
    #   package-rsync-simple-file-changes = copy in the plain db-template files changed since the package was built (package_rsync);
    #   package-repackage                 = package the content again on the jars already built (AssemblerTest#refreshContentForE2E),
    #                                       minutes, not the 26 of a full rebuild.
    # Either shortcut that changes the package adds a second line to its stamp, and the run says which package it ran on (the
    # E2E_PACKAGE line), so it is never mistaken for a run on this commit's own package.
    if [ -n "${E2E_PACKAGE:-}" ]; then
      case "$E2E_PACKAGE" in
        package-reuse-as-is|package-rsync-simple-file-changes|package-repackage) ;;
        reuse)   echo "!!! E2E_PACKAGE=reuse is gone: use package-reuse-as-is"; return 2 ;;
        content) echo "!!! E2E_PACKAGE=content is gone: use package-repackage"; return 2 ;;
        *) echo "!!! E2E_PACKAGE must be package-reuse-as-is, package-rsync-simple-file-changes or package-repackage (got '$E2E_PACKAGE')"; return 2 ;;
      esac
      if [ -z "${E2E_SPEC:-}" ] && [ -z "${E2E_GREP:-}" ]; then
        echo "!!! E2E_PACKAGE=$E2E_PACKAGE is for targeted runs: a full run always starts from a package built from its own commit"; return 2
      fi
      if [ -z "$built" ] || [ ! -d asbl/target/package/verified-db-noexe/DataPallas ]; then
        echo "package: E2E_PACKAGE=$E2E_PACKAGE asked for, but there is no stamped package to start from - building it"
      else
        case "$E2E_PACKAGE" in
          package-repackage)
            t0=$SECONDS
            # Step 1 (maven_setup) drops the project's own artifacts from ~/.m2, so the asbl module's dependencies are installed
            # first (no clean, no tests: what an earlier run compiled is reused), then only the content is packaged again.
            # The packaging copies rb-reporting.jar and rb-server.jar from the tree. dp-dev, restarted after every run, cleans
            # and rebuilds bkend/server/target, so a run started while it rebuilds finds no jar (build 15, 2026-10-12):
            # build the two jars first when either is missing (no clean, no tests).
            if [ ! -f bkend/reporting/target/rb-reporting.jar ] || [ ! -f bkend/server/target/rb-server.jar ]; then
              echo "package: the jars are not in the tree (dp-dev was rebuilding them) - building them first"
              mvn -B install -pl bkend/server -am -DskipTests || return 1
            fi
            { mvn -B install -pl asbl -am -DskipTests && mvn -B test -pl asbl -Dtest=AssemblerTest#refreshContentForE2E; } || return 1
            # The package now holds this tree's content: a later rsync compares against this commit; the second line still rules
            # it out as a clean build of any commit.
            printf '%s\nrepackaged from %s\n' "${SHA%-dirty}" "$from" > "$PKG_STAMP"
            echo "package: repackaged in $(( (SECONDS - t0) / 60 )) min $(( (SECONDS - t0) % 60 )) s" ;;
          package-rsync-simple-file-changes)
            package_rsync "$from" || return 2
            copied=$PKG_RSYNC_COPIED ;;
        esac
        echo "E2E_PACKAGE mode=$E2E_PACKAGE built_from=$from commit_under_test=$SHA files_copied=$copied"
        return 0
      fi
    fi
    if [ "${SHA%-dirty}" = "$SHA" ] && [ "$built" = "$SHA" ] && [ -d asbl/target/package/verified-db-noexe/DataPallas ]; then
      echo "package: built from $SHA, the commit under test - nothing to rebuild"
      return 0
    fi
    echo "package: built from '${built:-nothing}', commit under test is $SHA - rebuilding it (pack-prepare-for-e2e.bat)"
    rm -f "$PKG_STAMP"
    mvn_build &&
    mvn -B test -pl asbl -Dtest=AssemblerTest#prepareForE2E || return 1
    [ -d asbl/target/package/verified-db-noexe/DataPallas ] || { echo "!!! the prepare step did not produce verified-db-noexe"; return 1; }
    package_stamp
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

  # The AI Hub start page served from the ui-startpage SOURCES instead of from the
  # ai-hub-ai-hub-frend image. What it changes, and why:
  #   - the start page is a Next app, and `next dev` compiles the page that is asked for from the
  #     files as they are. The sources are bind-mounted over /app, so a Canvas change costs that
  #     page's recompile and no image build at all - and a run can no longer test an image somebody
  #     built by hand two commits ago, which is what every Canvas change used to pay for.
  #   - only the TESTGROUND's copy of the app's compose file is touched: the product's own file is
  #     never changed, the service keeps its name, its port, its environment and its dependencies,
  #     and the image it builds is tagged :dev, so this app's production :latest is left alone.
  #   - the dev image is built here and not left to the product's `compose up` (which builds only
  #     what is missing): it carries node_modules, and those have to match today's package.json.
  #     With the layer cache warm it takes seconds.
  # Docker creates the mount points of the nested mounts (config/_internal, workspace, data) inside
  # the bind-mounted folder, so a few empty untracked directories appear under ui-startpage.
  aihub_from_sources() {
    local u="$REPO/asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage"
    local f="$REPO/frend/reporting/testground/e2e/_apps/flowkraft/_ai-hub/docker-compose.yml"
    if [ ! -f "$f" ]; then
      # The testground is emptied before every run and filled from the package by this gulp task,
      # which is the first thing the e2e chain does. It is idempotent (it looks for datapallas.bat
      # and does nothing when the content is there), so running it here only means the app's compose
      # file exists before it is pointed at the sources; the chain then finds nothing left to do.
      (cd "$REPO/frend/reporting" && npx gulp e2e-package-javastuff-if-needed) ||
        { echo "!!! ai-hub: could not fill the testground from the package"; return 1; }
    fi
    [ -f "$f" ] || { echo "!!! ai-hub: $f is missing even with the testground filled from the package"; return 1; }
    echo "ai-hub: building the dev image from the sources (cached after the first time)"
    timeout 3600 docker build --target devserver -t ai-hub-ai-hub-frend:dev "$u" >/dev/null ||
      { echo "!!! ai-hub: docker build --target devserver failed"; return 1; }
    python3 - "$f" "$u" <<'AIHUBPY' || { echo "!!! ai-hub: could not point the app's compose file at the sources"; return 1; }
import sys
f, u = sys.argv[1], sys.argv[2]
s = open(f, newline='').read()
i, j = s.index("\n  ai-hub-frend:\n"), s.index("\n  ai-hub-tools:\n")
blk = s[i:j]
def one(old, new):
    global blk
    assert blk.count(old) == 1, old
    blk = blk.replace(old, new)
# the dev stage of the app's own Dockerfile, built from the sources in this checkout
one("      context: ./ui-startpage\n      dockerfile: Dockerfile\n",
    "      context: %s\n      dockerfile: Dockerfile\n      target: devserver\n" % u)
# its own tag, so the production image of this app is never overwritten
one("    container_name: flowkraft-ai-hub-frend\n",
    "    container_name: flowkraft-ai-hub-frend\n    image: ai-hub-ai-hub-frend:dev\n")
# `next dev` compiles what is asked for; the modules and the build output stay in the container
one("      - NODE_ENV=production\n", "      - NODE_ENV=development\n")
one("    volumes:\n",
    "    volumes:\n      - %s:/app\n      - /app/node_modules\n      - /app/.next\n" % u)
open(f, "w", newline='').write(s[:i] + blk + s[j:])
AIHUBPY
    echo "AI_HUB_FROM_SOURCES=$u (image ai-hub-ai-hub-frend:dev, stage devserver)"
  }

  # The owner's e2e chain, unchanged: clean testground -> gulp starts the Spring Boot server from
  # testground/e2e + `ng serve` on 4201 -> Playwright (TEST_ENV=web, or Electron) -> server killed. gulp itself
  # does not return Playwright's exit code, so the verdict is read from the line gulp prints.
  # The release lane starts the apps from the images compose finds on the host, and compose builds only an
  # image that is missing: an image left by an earlier run hides every change to an app's sources (run-all A
  # #25: M110 met a Canvas older than its commit). Building each app here answers from the layer cache in
  # seconds when nothing changed and rebuilds only the changed layers when something did. A failed build
  # stops the run rather than testing an old image.
  app_images_build() {
    local t="$REPO/frend/reporting/testground/e2e/_apps" c
    [ -d "$t" ] || (cd "$REPO/frend/reporting" && npx gulp e2e-package-javastuff-if-needed) ||
      { echo "!!! apps: could not fill the testground from the package"; return 1; }
    for c in $(find "$t" -name docker-compose.yml -not -path '*/xx-custom/*' | sort); do
      echo "apps: building $(basename "$(dirname "$c")") (cached unless its sources changed)"
      (cd "$(dirname "$c")" && timeout 3600 docker compose build -q) ||
        { echo "!!! apps: docker compose build failed for $c"; return 1; }
    done
  }

  e2e_web() {
    local out=/tmp/e2e-web.out code mode=targeted target="${E2E_TARGET:-web}" one_command=""
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
      # host another stack may use that name, so the e2e runs use their own container.
      export DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER="${DATAPALLAS_TEST_EMAIL_SERVER_CONTAINER:-dp-e2e-mailhog}"
      (cd frend/reporting && npm run custom:clean-testground) || return 1
      # The loop lane serves the start page from the sources (`aihub_from_sources` above). E2E_PACKAGE
      # is what tells the two lanes apart: the task dispatch at the bottom sets it on the loop lane and
      # empties it on the release lane, which proves the image DataPallas ships. A failure here stops
      # the run rather than quietly testing whatever image happens to be on the host.
      if [ -n "${E2E_PACKAGE:-}" ]; then aihub_from_sources || return 1; else app_images_build || return 1; fi
    fi
    # stuck tests cost tens of minutes, not hours (plan §4 D0); read by e2e/utils/constants.ts,
    # fluent-tester.ts, utils/helpers.ts and playwright.config.ts. Unset outside this script, so
    # Windows and Electron runs outside CI are unchanged. Same values as the Windows lane above, and
    # for the same reason: a cold `docker compose up` builds the image, which outlasts a 15 min wait.
    export E2E_MAX_WAIT_MS="${E2E_MAX_WAIT_MS:-2400000}" E2E_MAX_TEST_MS="${E2E_MAX_TEST_MS:-5400000}" \
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
      e2e_openapi
      docker_server_down
      if [ -n "${E2E_DOCKER_FROM_URL:-}" ] || [ "${E2E_DOCKER_ONE_COMMAND:-}" = yes ]; then docker_one_command || one_command=FAIL; fi
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
    [ "$code" = "0" ] && [ "$one_command" != FAIL ]
  }

  # springdoc OpenAPI + Swagger UI (J11): while the shipped server is still up at the end of a docker-server run, save its /v3/api-docs as
  # openapi.json and build a static Swagger UI page next to it (swagger-ui-dist from npm, fetched here), in <log>-openapi, which the dp-ci-release-step1-e2e-prerelease
  # job pulls and publishes next to the Playwright report. Never fails the run: a missing document or an npm problem is printed and the run goes on.
  e2e_openapi() {
    local out tmp code files="swagger-ui.css swagger-ui-bundle.js swagger-ui-standalone-preset.js favicon-32x32.png"
    out="${LOG%.log}-openapi"; mkdir -p "$out" || return 0
    code=$(curl -s -m 60 -o "$out/openapi.json" -w '%{http_code}' "$DOCKER_SERVER_URL/v3/api-docs" 2>/dev/null)
    echo "openapi: GET $DOCKER_SERVER_URL/v3/api-docs -> ${code:-no answer}"
    [ "$code" = 200 ] || { echo "openapi: no document saved (the endpoint needs a login, or the server has no springdoc); not gating"; rm -f "$out/openapi.json"; return 0; }
    tmp=$(mktemp -d) &&
    (cd "$tmp" && npm pack swagger-ui-dist@5 --silent >/dev/null && tar xzf swagger-ui-dist-*.tgz && for f in $files; do cp "package/$f" "$out/"; done) ||
      { echo "openapi: could not get swagger-ui-dist from npm; openapi.json is kept without the page"; rm -rf "$tmp"; return 0; }
    rm -rf "$tmp"
    cat > "$out/swagger-initializer.js" <<'JS'
window.onload = function () {
  window.ui = SwaggerUIBundle({ url: 'openapi.json', dom_id: '#swagger-ui', deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout' });
};
JS
    cat > "$out/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>DataPallas API (Swagger UI)</title>
<link rel="stylesheet" href="swagger-ui.css"></head>
<body><div id="swagger-ui"></div>
<script src="swagger-ui-bundle.js"></script><script src="swagger-ui-standalone-preset.js"></script><script src="swagger-initializer.js"></script></body></html>
HTML
    echo "openapi: saved $out/openapi.json and the Swagger UI page"
    return 0
  }

  # E2E_TARGET=docker-server (plan §3 O13, §4 F2a G0): the tests run against the product as it ships — the
  # unpacked datapallas-server-docker.zip plus the flowkraft/datapallas-server image built by the last
  # successful `dp-ci.sh build` on this host. Nothing is built or pulled here: a missing image or zip is a
  # failure, and so is a container running any other image.
  # E2E_DOCKER_FROM_URL=<zip url> (a staged Docker release, by hand): the self-host install from the download instead, as a
  # user does it (datapallas.com/docs/server/self-host): that zip, the image its compose names pulled from the registry
  # (the local tag of that name removed first; the build's <version>-<commit> tag keeps the layers), and the running
  # image must be the one the release pushed (the digest rehearsal.docker-stage recorded for this commit). After the
  # tests, the page's other way in: the image alone, `docker run --rm -p <port>:9090 <image>`, must answer 200.
  DOCKER_SERVER_DIR=""
  DOCKER_SERVER_IMAGE=""
  DOCKER_SERVER_URL="http://localhost:9090"
  docker_server_up() {
    local zip="$REPO/asbl/dist/datapallas-server-docker.zip" root="$REPO/frend/reporting/testground/docker-server"
    local f tag image_id running_id i want pull=never

    if [ -n "${E2E_DOCKER_FROM_URL:-}" ]; then
      want=$(bash "$REPO/asbl/ci/release-state.sh" get rehearsal.docker-stage digest 2>/dev/null)
      [ -n "$want" ] || { echo "!!! docker-server: no rehearsal.docker-stage digest recorded for this commit — rehearse the Docker release first"; return 1; }
      zip="$root.zip"; pull=always
      mkdir -p "${root%/*}" && rm -f "$zip" || return 1
      curl -fsSL --max-time 1800 -o "$zip" "$E2E_DOCKER_FROM_URL" ||
        { echo "!!! docker-server: cannot download $E2E_DOCKER_FROM_URL"; return 1; }
      echo "docker-server: downloaded $E2E_DOCKER_FROM_URL (sha256 $(sha256sum "$zip" | cut -c1-16)...), the release image $want"
    else
      for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
        grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
        tag=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
        [ -n "$tag" ] && { echo "docker-server: image of the newest successful build $(basename "$f") -> $tag"; break; }
      done
      [ -n "${tag:-}" ] || { echo "!!! docker-server: no successful build log with an IMAGE_TAG line — run 'dp-ci.sh build' first"; return 1; }
      # The image must come from the commit under test: the tag is <version>-<commit>. An image from an older
      # build would test old code under this commit's name (nothing is built here, so the only safe answer is no).
      [ "${tag#*-}" = "$SHA" ] ||
        { echo "!!! docker-server: the image was built from '${tag#*-}', the commit under test is '$SHA' — run 'dp-ci.sh build-if-needed' first"; return 1; }
      image_id=$(docker image inspect "$SERVER_IMAGE_REPO:$tag" --format '{{.Id}}' 2>/dev/null) ||
        { echo "!!! docker-server: image $SERVER_IMAGE_REPO:$tag is not on this host — run 'dp-ci.sh build' first"; return 1; }
      [ -s "$zip" ] || { echo "!!! docker-server: $zip is missing — run 'dp-ci.sh build' first"; return 1; }

      # The bundle's compose pins the released tag, and that is the file customers run: give the locally built
      # image that name here (never pulled: --pull never below, and the id check proves which image runs).
      docker tag "$SERVER_IMAGE_REPO:$tag" "$SERVER_IMAGE_REPO:$(printf '%s' "$tag" | cut -d- -f1)" || return 1
    fi

    rm -rf "$root" && mkdir -p "$root" || return 1
    unzip -q "$zip" -d "$root" || { echo "!!! docker-server: cannot unpack $zip"; return 1; }
    DOCKER_SERVER_DIR="$root/DataPallas"
    [ -f "$DOCKER_SERVER_DIR/docker-compose.yml" ] || { echo "!!! docker-server: $DOCKER_SERVER_DIR/docker-compose.yml missing"; return 1; }
    DOCKER_SERVER_IMAGE=$(cd "$DOCKER_SERVER_DIR" && docker compose config --images | grep "^$SERVER_IMAGE_REPO:" | head -1)
    # a user's machine has no copy of it: compose pulls the release's (--pull always below)
    [ "$pull" = always ] && { docker image rm "$DOCKER_SERVER_IMAGE" >/dev/null 2>&1 || true; }

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
    (cd "$DOCKER_SERVER_DIR" && docker compose up -d --pull "$pull") || { echo "!!! docker-server: compose up failed"; docker_server_down; return 1; }

    for i in $(seq 1 60); do
      curl -fsS -o /dev/null -m 5 "$DOCKER_SERVER_URL" && break
      sleep 5
    done
    curl -fsS -o /dev/null -m 5 "$DOCKER_SERVER_URL" || { echo "!!! docker-server: $DOCKER_SERVER_URL did not answer within 5 minutes"; docker_server_down; return 1; }

    running_id=$(docker inspect datapallas-server --format '{{.Image}}' 2>/dev/null)
    if [ -n "${E2E_DOCKER_FROM_URL:-}" ]; then
      case " $(docker image inspect "$running_id" --format '{{join .RepoDigests " "}}' 2>/dev/null) " in
        *" $SERVER_IMAGE_REPO@$want "*) ;;
        *) echo "!!! docker-server: the container runs $DOCKER_SERVER_IMAGE as $running_id, not the release's $SERVER_IMAGE_REPO@$want — aborting"
           docker_server_down; return 1 ;;
      esac
      echo "DOCKER_SERVER_IMAGE=$DOCKER_SERVER_IMAGE $SERVER_IMAGE_REPO@$want (pulled)"
    else
      [ "$running_id" = "$image_id" ] ||
        { echo "!!! docker-server: the container runs image $running_id, the build made $image_id — aborting"; docker_server_down; return 1; }
      echo "DOCKER_SERVER_IMAGE=$SERVER_IMAGE_REPO:$tag $image_id"
    fi
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

  # The self-host page's one command, `docker run --rm -p 9090:9090 <image>`: the release's image alone must answer 200
  # within 3 minutes. Run after the bundle is down, on a free local port; stopped (and so removed) after.
  docker_one_command() {
    local port code="" i name=dp-ci-one-command
    for port in $(seq 19090 19190); do (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || break; done
    docker run -d --rm --name "$name" -p "127.0.0.1:$port:9090" "$DOCKER_SERVER_IMAGE" >/dev/null ||
      { echo "DOCKER_ONE_COMMAND result=FAIL image=$DOCKER_SERVER_IMAGE (docker run failed)"; return 1; }
    for i in $(seq 1 36); do
      code=$(curl -s -L -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$port/" 2>/dev/null)
      [ "$code" = 200 ] && break
      sleep 5
    done
    docker stop "$name" >/dev/null 2>&1
    echo "DOCKER_ONE_COMMAND result=$([ "$code" = 200 ] && echo PASS || echo FAIL) image=$DOCKER_SERVER_IMAGE port=$port http=${code:-none}"
    [ "$code" = 200 ]
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
    # A backend change should cost seconds, not a rebuild. DevTools restarts the context in about two
    # seconds as soon as a class under bkend/server/target/classes changes -- this is what recompiles it.
    # Only in --live: a pinned site is meant to stay exactly where it was pinned.
    # ... and a content change should cost nothing at all: the server serves samples, templates and
    # scripts out of testground/e2e, so a file edited under db-template is mirrored straight onto it.
    if [ "${DEV_MODE:-live}" = live ]; then
      (cd frend/reporting && npm run custom:dev-watch-backend) &
      (cd frend/reporting && npm run custom:dev-watch-content) &
      ai_hub_dev &
    fi
    (cd frend/reporting && npm run custom:start-server-and-ui-web)
  }

  # The AI Hub start page run as `next dev`, so it hot-reloads from its sources like the rest of the UI.
  # Packaging still builds it the production way; this is only the dev lane. Never fatal: a dev server
  # without the start page is still a usable dev server.
  ai_hub_dev() {
    local d="$REPO/asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage"
    [ -d "$d" ] || { echo "ai-hub: no sources at $d, next dev not started"; return 0; }
    cd "$d" || return 0
    # better-sqlite3 has no prebuilt binary for this image and compiles here; the tools image carries
    # make/g++/python3 for exactly that.
    npm install --legacy-peer-deps --no-package-lock ||
      { echo "ai-hub: npm install failed, next dev not started"; return 0; }
    # Where the DataPallas backend is, as seen from HERE. The shipped default names
    # host.docker.internal, which is what a container started by an installation needs; this dev
    # server runs in the same container as the backend, and that name resolves to nothing here, so
    # Explore Data would not load a single table.
    export DP_API_URL="${DP_API_URL:-http://localhost:9090/api}"
    # Reachable from outside this container, which is what the route needs (next dev would otherwise
    # be free to listen on the loopback only). The port stays the one package.json asks for.
    export HOSTNAME=0.0.0.0
    # The SQLite file the start page keeps its own state in: the production image is built with the
    # schema already pushed, a dev run has to push it once. Idempotent, under a second afterwards.
    npm run db:push >/dev/null 2>&1 || echo "ai-hub: db:push failed, the start page may have no state of its own"
    echo "ai-hub: next dev on port $AI_HUB_PORT, at $AI_HUB_URL"
    npm run dev
  }

  # A unique tag per build, so a publish can name exactly this image (DockerAssembler re-points
  # :<version> and :latest on every build).
  tag_image() {
    docker tag "$SERVER_IMAGE_REPO:$VERSION" "$SERVER_IMAGE_REPO:$VERSION-$SHA" || return 1
    echo "IMAGE_TAG=$VERSION-$SHA"
  }

  # Trivy (J15): scans the image tag_image has just tagged. Report only: JSON for Jenkins (<log>-trivy/trivy.json, pulled by the jobs dp-ci-release-step1-e2e-prerelease and dp-ci-release-step2-release-docker)
  # plus the HIGH/CRITICAL table in this log. Never fails the build (a scan or database-download problem is printed and the run goes on).
  trivy_scan() {
    local out img="$SERVER_IMAGE_REPO:$VERSION-$SHA"
    out="${LOG%.log}-trivy"; mkdir -p "$out" || return 0
    trivy image --quiet --severity HIGH,CRITICAL --format json --output "$out/trivy.json" "$img" ||
      echo "trivy: JSON scan of $img failed (not gating)"
    trivy image --quiet --severity HIGH,CRITICAL --format table "$img" ||
      echo "trivy: table scan of $img failed (not gating)"
    return 0
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
    local tag="${PUBLISH_TAG:-}" commit dirty=no e2e running
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

  # A site that frames the instance (demo.datapallas.com -> datapallas.com) needs three share links on it and the tour button on its
  # Country Sales page; both are gone after --reset, and the website must be told the new tokens (asbl/ci/demo-links.sh does all of it).
  # Never fails the publish: the site IS published at this point, and rolling back would not help; it says what to run instead.
  publish_provision() {
    [ -n "${PUBLISH_SETTINGS_FILE:-}" ] && grep -q '^DEMO_SITE_ENV=' "$PUBLISH_SETTINGS_FILE" || return 0
    local out rc
    echo ""
    echo "provisioning the website feed (asbl/ci/demo-links.sh --target $PUBLISH_SETTINGS_FILE)"
    out=$(DEMO_LINKS_WAIT_SECS=${DEMO_LINKS_WAIT_SECS:-600} bash "$REPO/asbl/ci/demo-links.sh" --target "$PUBLISH_SETTINGS_FILE" 2>&1); rc=$?
    printf '%s\n' "$out"
    if [ "$rc" -eq 0 ]; then
      echo "PUBLISH_PROVISION ok"
    else
      echo "!!! the site is published, but its website feed is NOT set up: after the cause is fixed, run"
      echo "!!!   bash asbl/ci/demo-links.sh --target $PUBLISH_SETTINGS_FILE"
      echo "PUBLISH_PROVISION failed"
    fi
    return 0
  }

  publish_apply() {
    publish_deploy && publish_smoke && { publish_provision; return 0; }
    publish_rollback
    return 1
  }

  # ---- quality: the tools of the quality plan, one `quality_tool <name> <command...>` line each in quality_tools ----
  QUALITY_STATES=""
  QUALITY_COUNTS=""   # numbers a tool reports, e.g. unformatted-<app>=N, appended to the QUALITY_RESULT line
  quality_count() { QUALITY_COUNTS="$QUALITY_COUNTS $1=$2"; }
  # where a tool leaves its report: <run log without .log>-quality-<tool>, which Jenkins pulls (asbl/ci/jenkins/pull-reports.sh, @run/)
  quality_out() { local d="${LOG%.log}-quality-$1"; mkdir -p "$d" && printf '%s\n' "$d"; }
  # runs one tool and never fails the run: the state is recorded for the QUALITY_RESULT line (reports are shown, not enforced)
  quality_tool() {
    local name="$1" rc; shift
    echo ""; echo "--- quality: $name ---"
    "$@"; rc=$?
    if [ "$rc" -eq 0 ]; then QUALITY_STATES="$QUALITY_STATES $name=ok"
    else echo "quality: $name ended with rc=$rc (recorded, not gating)"; QUALITY_STATES="$QUALITY_STATES $name=rc$rc"; fi
    return 0
  }
  # SpotBugs and Javadoc need the compiled classes of the four Java modules; ESLint, Prettier and Compodoc need node_modules.
  # The AI Hub app is copied to a scratch folder first, so no node_modules or lock file ever lands in the tree
  # (db-template is packaged); QUALITY_AIHUB is that copy.
  QUALITY_AIHUB=/tmp/dp-quality/ai-hub
  quality_prepare() {
    mvn -B install -pl bkend/common,bkend/update,bkend/reporting,bkend/server -am -DskipTests || return 1
    npm_install || return 1
    local src=asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage
    rm -rf "$QUALITY_AIHUB" && mkdir -p "$QUALITY_AIHUB" &&
    tar -C "$src" --exclude=./node_modules --exclude=./.next -cf - . | tar -C "$QUALITY_AIHUB" -xf - &&
    (cd "$QUALITY_AIHUB" && npm install --no-save --no-package-lock --force eslint-formatter-checkstyle eslint-plugin-prettier prettier eslint-plugin-sonarjs @typescript-eslint/parser)
  }
  # Javadoc (J18) of the two library modules: the site of each module under one index page. Comments with doclint errors do not stop it.
  quality_javadoc() {
    local out m; out=$(quality_out javadoc) || return 1
    mvn -B javadoc:javadoc -pl bkend/common,bkend/reporting || return 1
    { echo '<!doctype html><meta charset="utf-8"><title>DataPallas Javadoc</title><h1>DataPallas Javadoc</h1><ul>'
      for m in common reporting; do
        if [ -d "bkend/$m/target/site/apidocs" ]; then
          mkdir -p "$out/$m" && cp -a "bkend/$m/target/site/apidocs/." "$out/$m/" && echo "<li><a href=\"$m/index.html\">$m</a></li>"
        else echo "<li>$m: no Javadoc was generated</li>"; fi
      done
      echo '</ul>'; } > "$out/index.html"
  }
  # Compodoc (J18): the documentation site of the Angular app (modules, components, services, routes, doc coverage). The package.json
  # script `compodoc` does the same into frend/reporting/documentation (git-ignored); here the site goes next to the run log instead.
  quality_compodoc() {
    local out; out=$(quality_out compodoc) || return 1
    (cd frend/reporting && npx compodoc -p src/tsconfig.app.json -d "$out" --silent)
  }
  # ESLint (J13): problems only, written as checkstyle XML, which Warnings Next Generation reads. ESLint exits 1 when it finds problems, so the
  # test of success is a complete XML, not the exit code. The Angular app keeps ESLint 8 and its .eslintrc.json (package.json script lint:report);
  # the AI Hub (ESLint 9, eslint.config.mjs) runs in the scratch copy, where the checkstyle formatter (removed from ESLint 9) is installed.
  quality_eslint() {  # quality_eslint <name> <folder> <command...>
    local name="$1" dir="$2" out; shift 2
    out=$(quality_out "$name") || return 1
    (cd "$dir" && "$@" > "$out/eslint.xml" 2> "$out/eslint.err"; true)
    grep -q '</checkstyle>' "$out/eslint.xml" && return 0
    echo "quality: $name produced no complete checkstyle XML; its stderr:"; tail -5 "$out/eslint.err"; return 1
  }
  quality_eslint_angular() { quality_eslint eslint-angular frend/reporting npm run --silent lint:report; }
  quality_eslint_aihub() { quality_eslint eslint-aihub "$QUALITY_AIHUB" npx eslint -f checkstyle .; }
  # Prettier (formatter), report only, never --write. Two views of the same fact, per app:
  #   - the table: the differences as ESLint warnings (rule prettier/prettier, eslint-plugin-prettier) in checkstyle XML, shown by Warnings NG as
  #     its own source, separate from the lint problems; only the files ESLint can parse (TypeScript, JavaScript, Angular templates);
  #   - the safety net: `prettier --check` over the whole app (it also sees CSS, SCSS, JSON, Markdown ...): the list goes to the console and to
  #     prettier-check.txt, the number into QUALITY_RESULT as unformatted-<app>=N.
  quality_prettier_check() {  # quality_prettier_check <name> <folder> <prettier path/glob...>
    local name="$1" dir="$2" out n; shift 2
    out=$(quality_out "$name") || return 1
    (cd "$dir" && npx prettier --check "$@" > "$out/prettier-check.txt" 2>&1; true)
    grep -q -E 'Checking formatting|Code style issues|All matched files' "$out/prettier-check.txt" ||
      { echo "quality: $name: prettier did not run; its output:"; tail -5 "$out/prettier-check.txt"; return 1; }
    grep -E '^\[warn\] ' "$out/prettier-check.txt" | grep -v 'Code style issues' || true
    n=$(grep -E '^\[warn\] ' "$out/prettier-check.txt" | grep -vc 'Code style issues')
    quality_count "unformatted-${name#prettier-}" "$n"
    echo "quality: $name: $n file(s) not formatted"
  }
  quality_prettier_angular() {
    local rc=0
    quality_eslint prettier-angular frend/reporting npx eslint --no-eslintrc -c .eslintrc.prettier.json -f checkstyle "src/**/*.ts" "src/**/*.html" || rc=1
    quality_prettier_check prettier-angular frend/reporting "src/**/*.{ts,html,scss,css,json}" || rc=1
    return $rc
  }
  quality_prettier_aihub() {
    local rc=0
    quality_eslint prettier-aihub "$QUALITY_AIHUB" npx eslint -c eslint.prettier.config.mjs -f checkstyle . || rc=1
    quality_prettier_check prettier-aihub "$QUALITY_AIHUB" . || rc=1
    return $rc
  }
  # ESLint complexity rules (own result, separate from the lint problems): complexity, max-depth, max-lines-per-function, max-params and
  # sonarjs/cognitive-complexity as warnings, defaults, in checkstyle XML (same helper and shape as the Prettier table).
  quality_complexity_angular() { quality_eslint complexity-angular frend/reporting npx eslint --no-eslintrc -c .eslintrc.complexity.json -f checkstyle "src/**/*.ts"; }
  quality_complexity_aihub() { quality_eslint complexity-aihub "$QUALITY_AIHUB" npx eslint -c eslint.complexity.config.mjs -f checkstyle .; }
  # SpotBugs + find-sec-bugs (J16) over the four Java modules (classes from quality_prepare): report only, the goal is `spotbugs`, never `check`.
  # Each module's target/spotbugsXml.xml is copied as <module>.xml next to the run log.
  quality_spotbugs() {
    local out m rc=0; out=$(quality_out spotbugs) || return 1
    mvn -B spotbugs:spotbugs -pl bkend/common,bkend/update,bkend/reporting,bkend/server || rc=1
    for m in common update reporting server; do
      if [ -f "bkend/$m/target/spotbugsXml.xml" ]; then cp "bkend/$m/target/spotbugsXml.xml" "$out/$m.xml"
      else echo "quality: spotbugs: no report for $m"; rc=1; fi
    done
    return $rc
  }
  # Spotless (J17) over the four Java modules: `spotless:check` only, never `apply`. Spotless prints its violations in the Maven console, so
  # spotless-to-checkstyle.py (stdlib python, runs here in the container) turns that output into checkstyle XML for Jenkins. The console list and the
  # count in QUALITY_RESULT are the fallback if the converter does not match the real output.
  quality_spotless() {
    local out txt; out=$(quality_out spotless) || return 1; txt="$out/spotless-check.txt"
    mvn -B -fae spotless:check -pl bkend/common,bkend/update,bkend/reporting,bkend/server > "$txt" 2>&1
    grep -E 'format violations|^\[ERROR\]\s+\S.*\.java\s*$' "$txt" || true
    quality_count spotless-files "$(grep -cE '^\[ERROR\]\s+\S.*\.java\s*$' "$txt")"
    python3 asbl/ci/jenkins/spotless-to-checkstyle.py "$txt" "$out/spotless.xml" "$REPO"
    grep -q 'spotless-maven-plugin' "$txt" || { echo "quality: spotless: the plugin did not run; its output:"; tail -5 "$txt"; return 1; }
  }
  # PMD complexity + CPD copy-paste detection (J17) over the four Java modules (classes from quality_prepare): report only, pmd.xml and cpd.xml
  # of each module are copied as <module>.xml into the pmd and cpd folders.
  quality_pmd() {
    local pout cout m rc=0; pout=$(quality_out pmd) || return 1; cout=$(quality_out cpd) || return 1
    mvn -B -fae pmd:pmd pmd:cpd -pl bkend/common,bkend/update,bkend/reporting,bkend/server || rc=1
    for m in common update reporting server; do
      if [ -f "bkend/$m/target/pmd.xml" ]; then cp "bkend/$m/target/pmd.xml" "$pout/$m.xml"; else echo "quality: pmd: no pmd.xml for $m"; rc=1; fi
      if [ -f "bkend/$m/target/cpd.xml" ]; then cp "bkend/$m/target/cpd.xml" "$cout/$m.xml"; else echo "quality: pmd: no cpd.xml for $m"; rc=1; fi
    done
    return $rc
  }
  # the tools of the quality plan, one line each, in this order; each adds its report under quality_out and never fails the run
  quality_tools() {
    quality_tool javadoc quality_javadoc
    quality_tool compodoc quality_compodoc
    quality_tool eslint-angular quality_eslint_angular
    quality_tool eslint-aihub quality_eslint_aihub
    quality_tool prettier-angular quality_prettier_angular
    quality_tool prettier-aihub quality_prettier_aihub
    quality_tool spotbugs quality_spotbugs
    quality_tool spotless quality_spotless
    quality_tool pmd quality_pmd
    quality_tool complexity-angular quality_complexity_angular
    quality_tool complexity-aihub quality_complexity_aihub
  }
  quality_result() {
    local n=0 ok=0 s
    for s in $QUALITY_STATES; do n=$((n + 1)); case "$s" in *=ok) ok=$((ok + 1)) ;; esac; done
    echo "QUALITY_RESULT tools=$n ok=$ok failed=$((n - ok))$QUALITY_STATES$QUALITY_COUNTS exit=0"
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
  if [ "$TASK" = "quality" ]; then
    step 2 quality_prepare
    step 3 quality_tools
    echo ""
    quality_result
    echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    exit 0
  fi
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
    step 3 prepare_package
    step 4 e2e_web
    echo ""
    echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    exit 0
  fi
  step 3 mvn_build
  step 4 assemble
  package_stamp
  step 5 tag_image
  step 6 trivy_scan
  echo ""
  echo "PIPELINE_RESULT=SUCCESS  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi

# -----------------------------------------------------------------------------
# LAUNCHER (on the host)
# -----------------------------------------------------------------------------
TASK="${1:-}"
# e2e-loop = the fix-and-retry loop: the same run as e2e, targeted, web or electron-linux, never a package rebuild (job dp-ci-dev-e2e-one-spec).
# e2e = the real e2e, the release check (job dp-ci-release-step1-e2e-prerelease): E2E_PACKAGE does not apply to it, so a stray value in the environment
# cannot skip the package rule.
[ "$TASK" = e2e-dev ] && { echo "FAIL  e2e-dev is now e2e-loop (Jenkins job dp-ci-dev-e2e-one-spec)"; exit 2; }
if [ "$TASK" = e2e-loop ]; then
  if [ -z "${E2E_SPEC:-}" ] && [ -z "${E2E_GREP:-}" ]; then echo "FAIL  e2e-loop runs one spec file: set E2E_SPEC (e.g. /variables\.spec\.ts\$) or E2E_GREP. The full suite is the real e2e (dp-ci.sh e2e)."; exit 2; fi
  E2E_PACKAGE="${E2E_PACKAGE:-package-reuse-as-is}"
  case "$E2E_PACKAGE" in
    package-reuse-as-is|package-rsync-simple-file-changes|package-repackage) ;;
    reuse)   echo "FAIL  E2E_PACKAGE=reuse is gone: use package-reuse-as-is"; exit 2 ;;
    content) echo "FAIL  E2E_PACKAGE=content is gone: use package-repackage"; exit 2 ;;
    *) echo "FAIL  E2E_PACKAGE must be package-reuse-as-is, package-rsync-simple-file-changes or package-repackage (got '$E2E_PACKAGE')"; exit 2 ;;
  esac
  E2E_TARGET="${E2E_TARGET:-web}"
  case "$E2E_TARGET" in web|electron) ;; electron-linux) E2E_TARGET=electron ;; *) echo "FAIL  e2e-loop runs on web or electron-linux (got '$E2E_TARGET'); docker-server and the Windows VM are release checks: dp-ci.sh e2e"; exit 2 ;; esac
  export E2E_TARGET
  TASK=e2e
elif [ "$TASK" = e2e ]; then
  E2E_PACKAGE=""
fi
case "$TASK" in
  build|build-if-needed|e2e|junit|quality|dev|win|prereq|publish-demo-datapallas.com) ;;
  # release: reserved for the real software release (plan §3 O7)
  *) echo "usage: $0 build|build-if-needed|e2e|e2e-loop|junit|quality|dev|win <check|ssh|ps|run|poll|stop|e2e|docker-e2e|server-e2e|release|sync|prepare|prereq>|prereq <check...>|publish-demo-datapallas.com <TAG> [--reset]"; exit 2 ;;
esac

# prereq <check...>: only the checks asked for, nothing started (a caller checks before its own slow part; see prereq)
if [ "$TASK" = prereq ]; then
  [ "$#" -gt 1 ] || { echo "usage: $0 prereq <check...>   (docker, vm, vm-docker, vm-java, vm-mvn, vm-free, publish-target <task>)"; exit 2; }
  shift; prereq "$@"; exit $?
fi

# An e2e tests the newest pushed code, whichever lane runs it: put this host's checkout on origin/main first (the
# Windows lane does the same on the VM, win_sync_repo). Strictly a fast-forward; changes to tracked files, or a history
# that cannot fast-forward, stop the run and change nothing. Commits not pushed yet are tested as they are (and said so).
sync_host_repo() {
  local dirty ahead=""
  git fetch -q origin || { echo "FAIL  could not fetch origin - not running on code of unknown age." >&2; return 2; }
  dirty=$(git status --porcelain --untracked-files=no)
  [ -z "$dirty" ] || { echo "FAIL  this checkout has local changes to tracked files; nothing was touched:" >&2
    printf '%s\n' "$dirty" | head -10 >&2; return 2; }
  git merge -q --ff-only origin/main >/dev/null 2>&1 ||
    ahead=$(git rev-list --count origin/main..HEAD)
  if [ -n "$ahead" ]; then
    [ "$(git rev-list --count HEAD..origin/main)" = 0 ] ||
      { echo "FAIL  this checkout and origin/main have diverged; nothing was changed." >&2; return 2; }
    echo "WARN  $ahead commit(s) here are not pushed; testing them as they are." >&2
  fi
  return 0
}
# The Windows lane runs here on the host, before any container exists: it only talks to the VM over
# SSH. It deliberately skips the "one dp-ci run at a time" interlock below - reading the VM's state
# is safe while a Linux run is going, and W6-W9 will take the interlock themselves when they need it.
if [ "$TASK" = "win" ]; then
  case "${2:-}" in
    check) win_check; exit $? ;;
    ssh)   shift 2; win_ssh "$@"; exit $? ;;
    ps)    win_ps; exit $? ;;
    run)   shift 2; win_run "$@"; exit $? ;;
    poll)  shift 2; win_run_poll "$@"; exit $? ;;
    stop)  shift 2; win_run_stop "$@"; exit $? ;;
    # mark_run: a lane that stops early still closes its open STEP line, with its exit code
    e2e)   shift 2; mark_run win_e2e "$@"; exit $? ;;
    docker-e2e) mark_run win_docker_e2e; exit $? ;;
    server-e2e) mark_run win_server_e2e; exit $? ;;
    release) mark_run win_release; exit $? ;;
    stage-upload) shift 2; win_stage_upload "$@"; exit $? ;;   # release-publish.sh stage-files: the VM's upload (stdin: the remote's fields)
    put-dist) shift 2; win_put_dist "$@"; exit $? ;;
    rclone-ensure) shift 2; win_rclone_ensure "$@"; exit $? ;;   # release-publish.sh upload-kept: the VM's rclone for its upload   # release-publish.sh upload-kept: the kept zips back in the VM's asbl\dist
    sync)  win_sync_repo; exit $? ;;
    prepare) win_sync_repo && win_prepare_package; exit $? ;;
    prereq) shift 2; win_prereq "$@"; exit $? ;;
    *)     echo "usage: $0 win check | $0 win ssh <words...> | $0 win ps < script.ps1"
           echo "       $0 win run <step> <windows-working-dir> <command...>   (runs on the desktop, waits)"
           echo "       $0 win poll <step> [offset] | $0 win stop <step>"
           echo "       $0 win sync         (fast-forward the VM's checkout to origin/main; win e2e does this first)"
           echo "       $0 win prepare      (sync, then rebuild the VM's package when it is not from the VM's commit; win e2e does this too)"
           echo "       $0 win prereq e2e|docker-e2e|server-e2e|release   (what that lane needs, checked in seconds: the VM over SSH, its Docker Desktop, Java and Maven, no other Windows run)"
           echo "       $0 win e2e          (Electron e2e on the desktop; E2E_SPEC=light = the light set; other E2E_SPEC/E2E_GREP = targeted)"
           echo "       $0 win docker-e2e   (DataPallas Server in Docker Desktop, installed as the self-host page says; a light set by default)"
           echo "       $0 win server-e2e   (DataPallas Server on the VM's Java 17, installed as the installation page says; the same light set)"
           echo "       $0 win release      (the Windows release: pack-datapallas.bat and the zips kept, the electron light set, the Robot UAT on the pack's zips, then staged; MODE=upload: the kept zips uploaded)"
           echo "       $0 win stage-upload [--print] <bucket path> <name>:<sha256>...   (the VM uploads asbl\\dist files; stdin: the rclone remote's FIELD=value lines; release-publish.sh stage-files runs it)"
           echo "       $0 win rclone-ensure [check|print]   (the VM's pinned rclone, installed when missing; release-publish.sh upload-kept runs it)"
           echo "       $0 win put-dist [--check] <folder> <name>:<sha256>...   (the VM's asbl\\dist gets those files from <folder> when it holds others; release-publish.sh upload-kept runs it)"; exit 2 ;;
  esac
fi
# Every Linux task needs this host's Docker engine. Without it the "one run at a time" check below passes silently and the
# run fails at its first docker build, so it is checked first, in seconds (the Windows lanes above only talk to the VM).
# Not for a dry build-if-needed, which starts nothing: release-docker.sh runs one before its version gate, and "nothing to
# release" stays green whatever the state of this host (its own prerequisites, after the gate, check the engine).
if [ "$TASK" != build-if-needed ] || [ "${DRY_RUN:-0}" != 1 ]; then prereq docker || exit 1; fi
PUBLISH_FLAGS=""
PUBLISH_SETTINGS_FILE=""
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
  [ -n "$PUBLISH_TAG" ] || { echo "FAIL  no TAG given: pass the <version>-<commit> tag of the image to publish"; exit 2; }
  if [ "$TARGET_HOST" = local ]; then
    mkdir -p "$TARGET_DATA_DIR" || exit 1
    PUBLISH_FLAGS="-v $TARGET_COMPOSE_DIR:$TARGET_COMPOSE_DIR -v $TARGET_DATA_DIR:$TARGET_DATA_DIR"
  else
    PUBLISH_FLAGS="-v /root/.ssh:/root/.ssh:ro"   # on_target runs ssh as root inside dp-ci
  fi
  # a site that feeds a website (demo-links.sh --target): the settings file, and root's ssh key when the website is on another host
  if [ -n "$PUBLISH_SETTINGS_FILE" ] && grep -q '^DEMO_SITE_ENV=' "$PUBLISH_SETTINGS_FILE"; then
    PUBLISH_FLAGS="$PUBLISH_FLAGS -v $PUBLISH_SETTINGS_FILE:$PUBLISH_SETTINGS_FILE:ro"
    [ "$TARGET_HOST" != local ] || PUBLISH_FLAGS="$PUBLISH_FLAGS -v /root/.ssh:/root/.ssh:ro"
  fi
fi

if docker ps -a --filter "name=^${CONTAINER}\$" --format '{{.Names}}' | grep -q .; then
  [ "$TASK" = "dev" ] && { echo "FAIL  a $CONTAINER run is working (it rebuilds the backend and resets testground/e2e) - start dp-dev after it ends"; exit 1; }
  echo "FAIL  a $CONTAINER container already exists — one run at a time (docker logs -f $CONTAINER)"; exit 1
fi

cd "$REPO" || exit 1
if [ "$TASK" = "dev" ]; then
  # Two dev sites. They differ only in WHICH checkout their container runs, never in the code:
  #   --live          THIS checkout, hot-reloading, and whatever anyone else commits into it meanwhile
  #                   -> https://dp-dev-live.bkstg.flowkraft.com  (dp-dev is an alias for it)
  #   --pinned <sha>  a separate clone parked at one commit, so a test session cannot move under you
  #                   -> https://dp-dev-pinned.bkstg.flowkraft.com
  # --live is the default: that is what a plain "dp-ci.sh dev" has always meant.
  DEV_MODE=live; PINNED_SHA=""
  case "${2:-}" in
    ""|--live) ;;
    --pinned) DEV_MODE=pinned; PINNED_SHA="${3:-}"
              [ -n "$PINNED_SHA" ] || { echo "usage: $0 dev --pinned <commit>"; exit 2; } ;;
    # code hot-reloads by itself; content does not, because it is served from a copy of the package
    --refresh-content) DEV_MODE=refresh ;;
    *) echo "usage: $0 dev [--live | --pinned <commit> | --refresh-content [--pinned]]"; exit 2 ;;
  esac
  if [ "$DEV_MODE" = refresh ]; then
    if [ "${3:-}" = --pinned ]; then
      REPO_IN_CONTAINER="$PINNED_REPO" refresh_dev_content "$PINNED_CONTAINER"
    else
      REPO_IN_CONTAINER="$REPO" refresh_dev_content "$DEV_CONTAINER"
    fi
    exit $?
  fi
  mkdir -p "$LOG_DIR"
  echo "building the $CI_IMAGE tools image (cached after the first time)..."
  docker build -q -t "$CI_IMAGE" "$REPO/asbl/ci" >/dev/null || { echo "FAIL  docker build $CI_IMAGE"; exit 1; }
  if [ "$DEV_MODE" = pinned ]; then
    start_pinned_dev "$PINNED_SHA" || { echo "FAIL  could not start the pinned dev site"; exit 1; }
    exit 0
  fi
  start_dev_container || { echo "FAIL  docker run $DEV_CONTAINER"; exit 1; }
  demo_links_in_background
  echo "stop:    docker stop $DEV_CONTAINER"
  exit 0
fi
if [ "$TASK" = e2e ]; then sync_host_repo || exit 2; fi
# build-if-needed: what a job that installs the files `build` makes runs first. This checkout on origin/main, then `build`
# only when the newest successful build is not of this commit - the rule docker-server, the Windows server lanes and the
# publish commands read a build by. The build is a run of its own (its own log, its own STEP lines), followed to its end.
if [ "$TASK" = build-if-needed ]; then
  sync_host_repo || exit 2
  SHA=$(git rev-parse --short HEAD)
  [ -z "$(git status --porcelain)" ] || SHA="$SHA-dirty"
  newest_build() {
    local f t
    for f in $(ls -1 "$LOG_DIR"/*-build-*.log 2>/dev/null | sort -r); do
      grep -aq '^PIPELINE_RESULT=SUCCESS' "$f" || continue
      t=$(grep -aoP '^IMAGE_TAG=\K\S+' "$f" | tail -1)
      [ -n "$t" ] && { echo "$t $(basename "$f")"; return 0; }
    done
  }
  read -r tag blog <<< "$(newest_build)"
  if [ -n "${tag:-}" ] && [ "${tag#*-}" = "$SHA" ] && docker image inspect "$SERVER_IMAGE_REPO:$tag" >/dev/null 2>&1 &&
     [ -s asbl/dist/datapallas-server-docker.zip ] && [ -s asbl/dist/datapallas-server.zip ]; then
    echo "BUILD: $SHA is built already ($blog) - nothing to build"
  elif [ "${DRY_RUN:-0}" = 1 ]; then
    echo "BUILD: $SHA is not built (newest successful build: '${tag:-none}'; its image and both server zips must be on this host) - a real run builds it first (dp-ci.sh build, about 40 min)"
    exit 0
  else
    echo "BUILD: $SHA is not built (newest successful build: '${tag:-none}'; its image and both server zips must be on this host) - building it first (dp-ci.sh build, about 40 min)"
    FOLLOW_PIDFILE="" bash "$REPO/asbl/ci/jenkins/follow-ci.sh" run bash "$REPO/asbl/ci/dp-ci.sh" build ||
      { echo "FAIL  the build of $SHA failed (its log above)"; exit 1; }
    read -r tag blog <<< "$(newest_build)"
    [ "${tag#*-}" = "$SHA" ] || { echo "FAIL  the build ended, but the newest successful build is of '${tag#*-}', not $SHA"; exit 1; }
  fi
  echo "BUILD_TAG=$tag"
  exit 0
fi
SHA=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain)" ] || SHA="$SHA-dirty"
echo "E2E_COMMIT=$SHA"

E2E_FLAGS=""
if [ "$TASK" = "e2e" ]; then
  # host network: specs start app containers whose published ports must answer on localhost
  E2E_FLAGS="--network host --shm-size=2g"
fi
# The "How it was built" pictures: the helpers write them next to the docs site checkout as it sits beside this
# repo on a developer's machine (<parent of the repo>/kraft-src-company-biz/...); here that folder is the docs
# site's own, mounted at that place, so the pictures land in the site and outlive the run's container.
DOCS_FLAGS=""
if [ "${E2E_DD_SCREENSHOTS:-}" = 1 ]; then
  DOCS_SITE="${DOCS_SITE:-$(dirname "$(dirname "$REPO")")/company-biz/flowkraft/www/reportburster.com}"
  [ -d "$DOCS_SITE/public" ] || { echo "FAIL  E2E_DD_SCREENSHOTS=1: no docs site at $DOCS_SITE (set DOCS_SITE)"; exit 2; }
  mkdir -p "$DOCS_SITE/public/images/docs"
  DOCS_FLAGS="-v $DOCS_SITE/public/images/docs:$(dirname "$REPO")/kraft-src-company-biz/flowkraft/www/reportburster.com/public/images/docs"
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

# --ulimit core=0: the host's core_pattern is the bare word "core", so a crashing process dumps into
# its own cwd -- which is this repo. A Chromium renderer segfaulted once (2026-09-15, bundled
# chromium-1097, gone since the pinned chrome-for-testing) and left 536 MB of browser memory sitting
# in frend/reporting/, one `git add -A` away from being committed. Crashes still show up as
# "[RENDERER crash]" in the run log, which is the part worth keeping.
docker run -d --rm --name "$CONTAINER" $E2E_FLAGS $PUBLISH_FLAGS $DOCS_FLAGS --ulimit core=0 \
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
  -e E2E_SLOW_MO="${E2E_SLOW_MO:-}" -e E2E_DD_SCREENSHOTS="${E2E_DD_SCREENSHOTS:-}" \
  -e E2E_ROTATION_DATE="${E2E_ROTATION_DATE:-}" -e E2E_PACKAGE="${E2E_PACKAGE:-}" -e E2E_DOCKER_FROM_URL="${E2E_DOCKER_FROM_URL:-}" -e E2E_DOCKER_ONE_COMMAND="${E2E_DOCKER_ONE_COMMAND:-}" \
  -e PUBLISH_TAG="$PUBLISH_TAG" -e PUBLISH_RESET="$PUBLISH_RESET" -e PUBLISH_SETTINGS_FILE="$PUBLISH_SETTINGS_FILE" -e DRY_RUN="${DRY_RUN:-0}" -e FORCE="${FORCE:-0}" -e SMOKE_TIMEOUT_SECS="${SMOKE_TIMEOUT_SECS:-300}" \
  -e TARGET_HOST="${TARGET_HOST:-}" -e TARGET_COMPOSE_DIR="${TARGET_COMPOSE_DIR:-}" -e TARGET_DATA_DIR="${TARGET_DATA_DIR:-}" \
  -e TARGET_APP="${TARGET_APP:-}" -e TARGET_URL="${TARGET_URL:-}" \
  "$CI_IMAGE" bash "$REPO/asbl/ci/dp-ci.sh" --inside >/dev/null ||
  { echo "FAIL  docker run $CONTAINER"; [ "$TASK" = "e2e" ] && firewall_close "$LOG"
    [ "$RESTART_DEV" = 1 ] && start_dev_container; exit 1; }
if [ "$TASK" = "e2e" ]; then firewall_close_when_run_ends "$LOG"; fi
if [ "$RESTART_DEV" = 1 ]; then demo_links_when_run_ends; fi

echo "STARTED  $CONTAINER  task=$TASK  commit=$SHA"
echo "log:     $LOG   (also $LOG_DIR/latest.log)"
echo "watch:   grep -aE '^(PIPELINE_START|PIPELINE_RESULT|>>> STEP|<<< STEP|!!! ABORT)' $LOG_DIR/latest.log"
echo "stop:    docker stop $CONTAINER"
if [ "$TASK" = "e2e" ]; then
  echo "firewall: $(ufw status | grep -c "# $FIREWALL_TAG") rules tagged $FIREWALL_TAG open until $CONTAINER is gone (plan §3 O14)"
fi

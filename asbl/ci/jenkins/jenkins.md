# Jenkins for DataPallas

Jenkins is a **window onto the scripts we already run**, not a second way of building. Every job starts the same
plain script from `asbl/ci/` that is run by hand (today `dp-ci.sh`), on the server, in the same CI container, and
shows its log. Nothing is installed on the host and no Jenkins agent is needed.

## Which job when

The jobs are in the Jenkins folder `datapallas` (https://jenkins.bkstg.flowkraft.com/job/datapallas/). The name says the moment: `dp-ci-dev-...` = any time while developing, `dp-ci-release-stepN-...` = a release, in that order. Each job's own description in Jenkins says the same as its section below (what, when, order, needs, time, examples, log).

| Situation | Job | Values |
|---|---|---|
| Re-run one failed e2e test after a fix | `dp-ci-dev-e2e-one-spec` | `E2E_SPEC=/features/samples\.spec\.ts$`, `E2E_GREP=<a piece of the test's title>`; then `E2E_GREP` empty for the whole file |
| Confirm one spec file on a package built from this exact commit | `dp-ci-release-step1-e2e-prerelease` | `E2E_TARGET=web`, `E2E_SPEC=/features/samples\.spec\.ts$` (recorded as `targeted`) |
| Run one JUnit class or method | `dp-ci-dev-junit` | `JUNIT_MODULE=bkend/server`, `JUNIT_TEST=ReportsServiceTest#aFolderHoldingOnlyOneTemplateNeedsNoInference` (a class: `JUNIT_TEST=ReportsServiceTest`) |
| See a saved change in a browser | `dp-ci-dev-server` | `ACTION=start` (`DEV_MODE=live`): https://dp-dev-live.bkstg.flowkraft.com |
| See one commit that nothing can move | `dp-ci-dev-server` | `ACTION=start`, `DEV_MODE=pinned`, `PINNED_SHA=<sha>`: https://dp-dev-pinned.bkstg.flowkraft.com |
| See Kate's clone in a browser | `dp-ci-dev-server` | `TARGET=dp-kate.bkstg.flowkraft.com`, `ACTION=start`: https://dp-kate.bkstg.flowkraft.com |
| Start a running dev server again | `dp-ci-dev-server` | `ACTION=restart` (with its `TARGET` and `DEV_MODE`) |
| Stop a dev server | `dp-ci-dev-server` | `ACTION=stop` (with `DEV_MODE=pinned`, or `TARGET=dp-kate.bkstg.flowkraft.com`, for those) |
| The whole trunk on Linux | `dp-ci-release-step1-e2e-prerelease` | `E2E_TARGET=web`, `E2E_SPEC` and `E2E_GREP` empty (about 10.5 to 15 h) |
| The whole trunk on Windows | `dp-ci-release-step1-e2e-prerelease` | `E2E_TARGET=windows-vm-electron`, `E2E_SPEC` and `E2E_GREP` empty (about 25 h) |
| One Windows test by its title | `dp-ci-release-step1-e2e-prerelease` | `E2E_TARGET=windows-vm-electron`, `E2E_SPEC=[\\/]samples\.spec\.ts$` (Windows paths have backslashes), `E2E_GREP=<a piece of its title>` |
| Which side ran the full e2e set for a release | none: on this host | `bash asbl/ci/release-state.sh full-lane 16.6.0` (`full-lane` alone: the last two releases, with why) |
| A release, start to end (e.g. 16.6.0) | steps 0 to 4 | step 0 `RELEASE_VERSION=16.6.0`; step 1's lanes; the day before, execution 1: step 2 then step 3 `MODE=rehearsal UPLOAD=no` (built, proven, kept), each failure re-proved alone (`release-rerun.sh`), then execution 2 the same, start to end; release day, steps 2 and 3 `MODE=upload UPLOAD=yes`, a look, then `MODE=public UPLOAD=yes` one after the other; step 4. See "The release, in order" and "The day before and release day" |
| A release from the scripts: step 0, step 1, an execution | none: on this host | `ORCH_STARTED_BY=<name> RELEASE_VERSION=<x.y.z> bash asbl/ci/jenkins/release-orchestrator.sh` (`DRY_RUN=yes` first; `EXECUTION=2` for execution 2): "Running the release from the scripts" |
| Re-prove one failure of an execution, alone, on the build already there | none: on this host | `bash asbl/ci/release-rerun.sh run <part> --failed <kept folder>` (`DRY_RUN=yes` first); `bash asbl/ci/release-rerun.sh show` until `ready for execution 2` |
| Upload what execution 2 kept, no rebuild | `dp-ci-release-step2-release-docker` and `dp-ci-release-step3-release-windows-vm` | `MODE=upload UPLOAD=yes` (`UPLOAD=no` or `DRY_RUN=yes`: the checks and the commands only); by hand `bash asbl/ci/release-publish.sh upload-kept docker\|windows` |
| What a release run kept, its manifest, its failure report | none: on this host | `bash asbl/ci/release-keep.sh show [<version>-<commit>]`; the folder `/var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit>/` |
| Make a version public after its rehearsal passed | `dp-ci-release-step2-release-docker` and `dp-ci-release-step3-release-windows-vm` | `MODE=public UPLOAD=yes` (one after the other): the passed rehearsal that uploaded its files (`UPLOAD=yes`) copied in minutes |
| Make a version public directly, no rehearsal run before | the same two jobs | `MODE=public UPLOAD=yes`: it finds no passed, uploaded rehearsal of the version, says `rehearsing first`, rehearses and uploads, and copies only when that is green |
| Release without step 1's four lanes counting for the commit, on the owner's decision | the same two jobs | `E2E_APPROVAL` with the words `owner approved` and what the decision rests on (the owner only): the step-1 check is not made; the log and the release record say who, when, the text and what the four lanes were |
| The public demo, after a release went public | `dp-ci-release-step4-demo-public` | nothing to change; `RESET_DEMO_DATA=yes` when the release changed the dashboards |
| The code-quality report | `dp-ci-dev-quality-report` | no parameters |
| A job says `PREREQUISITES MISSING` | the same job, again, once fixed | each `MISSING <what>: <what to do>` line says what to do; nothing was started. Lists: "What each job needs before it starts" and "Before the first release"; by hand: `bash asbl/ci/dp-ci.sh prereq <check...>`, `bash asbl/ci/release-publish.sh preflight docker\|files [public]` |

## What it gives

1. **Start a step on demand** from the Jenkins UI (build, JUnit gate, e2e with an optional spec or grep).
2. **Watch it live**: the console of the build *is* the log of the run.
3. **It keeps running** whatever is closed: browser, SSH session, a chat, or Jenkins itself.

## How it works

```
Jenkins UI  ->  job (Jenkinsfile)  ->  ssh root@host  ->  follow-ci.sh run bash asbl/ci/dp-ci.sh <mode>
                                                                |
                                  dp-ci.sh starts a DETACHED container (dp-ci) from the datapallas-ci image,
                                  owned by the Docker daemon, logging to a file under the CI log folder
                                                                |
                                  follow-ci.sh tails that log until it ends -> the build's console and result
```

- **Same scripts, same container.** A job only sets the script's environment variables (`E2E_SPEC`,
  `E2E_GREP`, `JUNIT_MODULE`, ...) and calls it: the same command as by hand on the host.
- **SSH exactly as agents do it.** The Jenkins container has an `ssh` client and its own key
  (`/var/jenkins_home/.ssh`, mode 600, outside the repository). The matching public key is in the host's
  `/root/.ssh/authorized_keys`. Jobs reach the host at `172.19.0.1`, the gateway of the Docker network.
- **One run at a time.** The run's container has a fixed name (`dp-ci`), so a second launch fails instead of
  colliding; Jenkins also limits each job to one build at a time.

## Persistence

The work is a detached container owned by the Docker daemon. It is not a child of Jenkins, of the SSH
session or of any chat.

| What happens | The run | The Jenkins build |
|---|---|---|
| Browser, SSH session or chat closed | keeps running | keeps following |
| Jenkins container restarts | **keeps running** | its console stops and the build shows as aborted; follow the same run again by hand on the host: `bash asbl/ci/jenkins/follow-ci.sh attach` |
| Someone presses Abort on the build | **keeps running** (only the following stops); stop it with `docker stop dp-ci` | aborted |
| The host reboots | lost: rerun it | aborted |

So the work cannot be lost by closing or restarting anything except the host. What a Jenkins restart takes
away is the live view of that build, and `follow-ci.sh attach` (on the host) brings it back.

## Jobs

All live in the folder `datapallas`, and are created by `seed.groovy`, which also holds each job's full description and parameter texts (what Jenkins shows). Jenkins lists them alphabetically, which is the order below. Steps 0, 2 and 3 label each build in the job's build list with what happened (`16.5.1 rehearsal passed`, `nothing to release: ...`, `16.5.1 FAILED: see the log`; `asbl/ci/jenkins/release-label.sh`, read from the run's own result lines, a red build too).

Where the time goes: every job that does several things marks each part with a START and an END line, the END with how long it took, in one format (`asbl/ci/marks.sh`): `######## JOB STEP 1/2 START <time> :: <what>` ... `######## JOB STEP 1/2 END rc=0 <time> took=2467s (41m7s) :: <what>`. Nested parts carry their own label (`DOCKER RELEASE STEP 4/6`, `RELEASE STEP 2/4`, `PUBLIC STEP 2/4`, `windows-vm-docker STEP 3/3`, `DEMOS STEP 2/3`), and the Linux run's own steps end with `took=` too (`<<< STEP 4 END rc=0 <time> took=...`). `grep -aE '^######## |^<<< STEP'` on a console log or a run log gives the times.

The times below are measured from the CI logs and Jenkins' build durations, unless they say "not measured yet".

### dp-ci-dev-e2e-one-spec

- **What:** the fix-and-retry loop, `dp-ci.sh e2e-loop`: one spec file, or some of its tests, on `web` or `electron-linux`, retries 0. The jars and the Angular UI are built from the tree on every run; the package (the content the tests start from) is never rebuilt, `E2E_PACKAGE` says what happens to it (built first only when there is none). It never counts for a release.
- **When:** after a fix: the failed tests, then the whole file. A file on a package of this exact commit, or a Windows or Docker test: step 1 instead. Commit the fix first: the run puts this checkout on `origin/main` (a fast-forward) and stops on local changes to tracked files; commits not pushed yet are tested as they are.
- **Parameters:**
  - `E2E_SPEC`: a regex on the spec file's path, ending in `$` for one file; needed unless `E2E_GREP` is set. E.g. `/features/samples\.spec\.ts$`, `/areas/cube-stories\.spec\.ts$`.
  - `E2E_GREP`: a regex on the test titles; empty = the whole file. E.g. `02_dashboard_demos`, `Show Me`, `refus|SQL vendor`.
  - `E2E_TARGET`: `web` (default) or `electron-linux` (the desktop-only specs, e.g. let-me-update-migrate-configuration).
  - `E2E_PACKAGE`: `package-reuse-as-is` (default; for a fix to specs, helpers, Java or the UI; instant), `package-rsync-simple-file-changes` (the plain db-template files changed since the package was built, copied in; seconds; stops with `use package-repackage` when a changed file is not a verbatim copy), `package-repackage` (the content packaged again on the built jars, `AssemblerTest#refreshContentForE2E`; about 3.5 min; not a full rebuild). `reuse` and `content` are refused, naming the new value.
- **Examples:** one failed test after a fix: `E2E_SPEC=/features/samples\.spec\.ts$ E2E_GREP=02_dashboard_demos`; after a fix to a db-template sample: add `E2E_PACKAGE=package-rsync-simple-file-changes`; a desktop-only spec: `E2E_SPEC=/features/let-me-update-migrate-configuration\.spec\.ts$ E2E_TARGET=electron-linux`.
- **Needs:** this host's Docker engine; no other `dp-ci` run (one at a time).
- **Time:** about 4 min of setup, then the tests: one test about 5 min in all; the last 40 runs: median 16 min, seconds up to 4.8 h (several big files at once).
- **Log:** the Playwright lines (the job's description lists the patterns); `E2E_PACKAGE mode=... built_from=... commit_under_test=... files_copied=<n>` says which package ran.

### dp-ci-dev-junit

- **What:** the Java unit tests, `dp-ci.sh junit`, on the checkout as it is: one module and test pattern, or all three modules when both are empty. It shows the test results, JaCoCo and the Error Prone warnings (reports only).
- **When:** after a Java change.
- **Parameters:** `JUNIT_MODULE` (empty = all three, `bkend/server`, `bkend/common`, `bkend/reporting`), `JUNIT_TEST` (a Surefire `-Dtest` pattern: `ReportsServiceTest`, `ReportsServiceTest#aFolderHoldingOnlyOneTemplateNeedsNoInference`, `Jasper*Test`; empty = every test of the module).
- **Needs:** this host's Docker engine; no other `dp-ci` run.
- **Time:** one class 1 to 4 min; everything about 24 min.
- **Log:** `TOTAL classes:` per module; `Tests run:.*(Failures: [1-9]|Errors: [1-9])` for the failing classes.

### dp-ci-dev-quality-report

- **What:** the quality tools, `dp-ci.sh quality` (lint, bug finder, format, complexity, documentation; see "Quality reports"). Never gating.
- **When:** any time. **Parameters:** none. **Needs:** this host's Docker engine; no other `dp-ci` run.
- **Time:** not measured yet (it has not run yet).
- **Log:** `QUALITY_RESULT tools=N ok=N failed=N ...`.

### dp-ci-dev-server

- **What:** starts, restarts or stops a dev web server, `dp-ci.sh dev --live`, `--pinned <sha>` or `dev` in Kate's clone, and prints its URL. `live` = the checkout as it is saved, hot-reloading (Java in about 10 s, the UI at once): https://dp-dev-live.bkstg.flowkraft.com (`dp-dev` is an alias). `pinned` = a separate clone parked at one commit, no hot reload: https://dp-dev-pinned.bkstg.flowkraft.com. `TARGET` picks whose: `dp-dev.bkstg.flowkraft.com` (the default) is the main checkout, `dp-kate.bkstg.flowkraft.com` the same for Kate's own clone (`agents-headquarter/office-kate/projects/src/products/reportburster`), live only: https://dp-kate.bkstg.flowkraft.com. It keeps running after the build until `ACTION=stop`; build, JUnit and e2e runs stop the live one for their length and start it again. A second start prints `already running at <URL>`, `restart` starts it again; it refuses while a `dp-ci` run holds the server.
- **When:** to look at a change. Never a proof: only the e2e jobs prove, and no e2e runs against it (an e2e cleans the testground it reads and starts its own server).
- **Parameters:** `TARGET` (`dp-dev.bkstg.flowkraft.com`, `dp-kate.bkstg.flowkraft.com`), `ACTION` (`start`, `restart`, `stop`), `DEV_MODE` (`live`, `pinned`; dp-kate is live only), `PINNED_SHA` (a pinned start or restart only; a commit this checkout has). In `live`, an edited db-template file reaches the site at once; a new sample or dataset needs `dp-ci.sh dev --refresh-content` (by hand, about 3 min).
- **Needs:** this host's Docker engine (at a start); `live` (either target) also its checkout's Linux package (`asbl/target/package/verified-db-noexe`, which an e2e run builds when there is none): not checked, and without it the start fails after the backend build. **Time:** a start or restart about 3.5 min until the site answers (a pinned commit's first start is longer: not measured yet); a stop seconds.
- **Log:** `ready: <URL>`, `already running at`, `restart:`, `stopped:`, `FAIL`.

### dp-ci-release-step0-set-version

- **What:** step 0 of a release, the version: `asbl/ci/jenkins/release-set-version.sh`. `RELEASE_VERSION` comes pre-filled with the current release (the higher of the two channels' released versions, read by `seed.groovy` when it generates the jobs; Docker Hub not answering: `settings.xml` on `origin/main`, and the field's text says so). Left as it is, or lower: `NOTHING DONE`, green. Not `x.y.z`: refused. Bigger: the released versions read again (`release-state.sh released`), then in a throwaway `git worktree` of `origin/main` (never the shared checkout) `asbl/ci/set-version.sh <version>`, a check that all 7 version files say it and that exactly those changed, one commit `release <version>: the version in the 7 version files` pushed to `main`, `RELEASE_COMMIT=<sha>` and the next step. `origin/main` already saying it: nothing committed. `main` moved meanwhile: the push is rejected and the job fails, saying so (it never retries).
- **When:** a release starts here. The release notes are the owner's: a `## <version> - <date>` heading in `asbl/src/main/external-resources/db-template/CHANGELOG.md`, committed first, at the latest before step 1 (the job warns, never fails, when there is none).
- **Parameters:** `RELEASE_VERSION` (pre-filled with the current release), `DRY_RUN` (`no`; `yes` = the 7 edits and the commit it would make, nothing written or pushed).
- **Needs:** nothing to provide. **Time:** seconds. **Log:** `SET_VERSION_RESULT` is the verdict.

### dp-ci-release-step1-e2e-prerelease

- **What:** the real e2e on a package built from this exact commit of `origin/main` (rebuilt first when it is not), run by `asbl/ci/jenkins/release-step1.sh` (the job only passes its parameters to it; the same script runs from the shell: "Running the release from the scripts"): `dp-ci.sh e2e` on Linux, `dp-ci.sh win e2e` (`windows-vm-electron`), `win docker-e2e` (`windows-vm-docker`), `win server-e2e` (`windows-vm-server`) on the Windows VM. Two roles: a release's four lanes, and the everyday full e2e of the trunk; it never needs step 0 and never skips. The `docker-server`, `windows-vm-docker` and `windows-vm-server` targets install what `dp-ci.sh build` makes: the job first runs `dp-ci.sh build-if-needed` (JOB STEP 1/2: built only when the newest successful build is not of `origin/main`; about 40 min, once per commit), then the tests (JOB STEP 2/2); it also shows that build's Trivy table. It has no package parameter on purpose: the package shortcuts exist only on `dp-ci-dev-e2e-one-spec`. One build at a time: a second one waits in the Jenkins queue, so the Windows targets (they share the VM; `win-e2e.sh` refuses a second driver too) can be started one after the other and run in turn.
- **The release record:** each build records its verdict as `step1.<target>-<full|auth|light|targeted>`; a run with any other filter is `targeted` and never counts. A release needs four lanes that count for its commit (OD5, the full set alternating since 2026-10-24): the full set on this release's full lane, `web` or `docker-server` (`E2E_SPEC` empty; "The full e2e lane", below), `docker-server` auth (`E2E_SPEC=/features/auth-authorization-server\.spec\.ts$`, which every full run leaves out), `windows-vm-electron` light (`E2E_SPEC=light`; recorded by step 3 itself, its `RELEASE STEP 2/4`, so a release does not run it here), `windows-vm-server` light (`E2E_SPEC` empty = its light set). The job prints the full lane at its start (`FULL_LANE=`) and, after a full run, whether it was that lane. Step 1 runs made before step 0's version commit do not count for that release. A lane counts for a commit (`release-state.sh step1-guard`, `require step1`, `show`) when its own verdict there is green; with no verdict there, when its newest verdict on an earlier commit is green and only never-shipped files changed since (`asbl/ci/reuse-or-rebuild.sh step1 <from> <to>`: `still-counts`; a change to what ships or to the CI toolchain refuses); or when its run was red on a few tests that each passed alone afterwards (`release-rerun.sh run <target> --failed <its report>`, then `release-state.sh record-step1 <target> reruns <full|auth|light>`: PASS on the lane's commit, `completed_by=reruns`, with the re-runs named). It stays red when a failure has no passing re-run since the lane's run, when a re-run came after a change to what ships, or when the lane failed with no failed test or no report; a re-run through this job (`E2E_GREP` set) is `targeted` and completes nothing. Without the four lanes, steps 2 and 3 go on only on the owner's written decision, `E2E_APPROVAL` (see those jobs). Its first line is `STARTED_BY=<who>  <UTC>  :: step 1 <target>`, then `RELEASE_VERSION` (what a release would do now).
- **Parameters:**
  - `E2E_SPEC`: a regex on the spec file's path; empty with `E2E_GREP` empty = the full suite (on `windows-vm-docker` and `windows-vm-server`: the light set, `asbl/ci/light-set.txt`, about 2 h on `windows-vm-docker` by estimate); `light` = the light set on any `windows-vm` target, on `windows-vm-electron` with `auth-authorization-desktop` whole, recorded `step1.windows-vm-electron-light`. A full run leaves out `auth-authorization-server` everywhere, and on Linux also `let-me-update-migrate-configuration`, which `windows-vm-electron` keeps. On the `windows-vm` targets the path has backslashes: write the separator as `[\\/]`.
  - `E2E_GREP`: a regex on the test titles; set, the run is recorded `targeted`.
  - `E2E_TARGET`: `web` (default), `electron-linux`, `docker-server`, `windows-vm-electron`, `windows-vm-docker` (DataPallas Server in Docker Desktop on the VM, from `datapallas-server-docker.zip`, as the self-host page says), `windows-vm-server` (DataPallas Server on the VM's own Java 17, from `datapallas-server.zip`, as the installation page says).
  - `E2E_ROTATION_DATE`: empty = today; the day's database rotation, e.g. 2026-09-22 = sqlserver and duckdb.
  - `E2E_RETRIES`: empty = the lane's own: a full run 2 on Linux, 1 on `windows-vm-electron`; the light set of `windows-vm-electron`, `windows-vm-docker` and `windows-vm-server` 1; any filter 0.
- **Examples:** the four release lanes above; the trunk: `E2E_TARGET=web` or `windows-vm-electron`, `E2E_SPEC` empty; one Windows test: `E2E_TARGET=windows-vm-electron E2E_SPEC=[\\/]samples\.spec\.ts$ E2E_GREP=02_dashboard_demos`.
- **Needs:** each target first checks what it needs, within seconds ("What each job needs before it starts", below).
- **Time:** a full run about 10.5 h on Linux (`docker-server`; a `web` full run took 15.4 h) and about 25 h on `windows-vm-electron`; the Windows light sets (`asbl/ci/light-set.txt`): `windows-vm-docker` about 2 h 10 by estimate (capped at 4 h 30, `LIGHT_SET_CAP_SERVER_LANES`), `windows-vm-server` the same cap (not measured yet); one file minutes to 2 h; first, when needed, the package (Linux about 30 min, the VM about 1 to 1.5 h) and the build (about 40 min).
- **Log:** the Playwright lines, `^########` and `^(>>>|<<<) STEP` for the times, `^STARTED_BY=|^RUN_HISTORY` for who started it and its history line, `RELEASE_VERSION|FULL_LANE|RELEASE_STATE` for the release record (`FULL_LANE`: the side of this release's full set and why, then whether a full run was that side).

### dp-ci-release-step2-release-docker

- **What:** the Docker release, `asbl/ci/jenkins/release-docker.sh`, `MODE=rehearsal` (the default), `MODE=upload` or `MODE=public` (`bash asbl/ci/jenkins/release-docker.sh --help`: what it builds, proves, keeps, how long, what it leaves). Rehearsal and public start with the Docker channel's version gate (nothing to release = green, nothing done), then check the prerequisites within seconds (`release-publish.sh preflight docker`; "Before the first release", below): anything missing stops the job before anything is built, each named with what to provide (`MISSING <what>: <what to provide>`, then `PREREQUISITES MISSING (<n>)`; the build list says `prerequisites missing: see the log`).
  - `MODE=rehearsal`: build, prove, upload, in that order. Only when step 1 counts for its commit of `origin/main` (`step1-guard`: green there, carried from an earlier commit, or completed by re-runs; a `note:` line says which; otherwise, within seconds, `REFUSED: step 1 is not green on <commit>: <lanes>. Run dp-ci-release-step1-e2e-prerelease first.`, and for a red lane the re-run commands on the next line; or with `E2E_APPROVAL`, below; `windows-vm-electron-light` is not asked for here: step 3 records it, and every upload requires it), then `dp-ci.sh build-if-needed` (step 2/6): Docker is built once, on Linux: the image `flowkraft/datapallas-server:<version>-<commit>` and `asbl/dist/datapallas-server-docker.zip`. Then that build is proven without a registry: on this host (3/6) the `docker-server` lane installs that very zip as the self-host page says, its compose's `:<version>` being the build's image (never pulled), the light set, then the one-command `docker run` (`E2E_DOCKER_ONE_COMMAND=yes`); on the VM (4/6) the `windows-vm-docker` lane carries the same image over (`docker save`, copy, `docker load`, tagged as the compose names it), installs the same zip in Docker Desktop, the light set; in both, the running image must be the one built. Both proofs always run; a red one names itself (`linux=FAIL` or `windows=FAIL`) and leaves Docker Hub and the bucket untouched. Then, red or green, the keeping (5/6, `asbl/ci/release-keep.sh`): the zip in the artifacts folder (`/var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit>/`, the image id and sha256 checked first), the image tagged `flowkraft/datapallas-server:<version>` on this host, the manifest's docker lines and `failure-report-docker.md` ("The day before and release day", below). Then, only when both proofs are green, the guard (6/6): `origin/main` still that commit, or moved since by never-shipped files only (`release-state.sh moved-main`; under the orchestrator's `RELEASE_PIN`, whether the step tested the pin), step 1 still counting, the image id and the zip's sha256 still the proven ones. Then the upload (6/6 too, `release-publish.sh stage-docker`, which refuses an image or zip other than the proven ones): with `UPLOAD=yes` the Docker zips of earlier rehearsals deleted from `rehearsal/`, the image pushed as `flowkraft/datapallas-server:<version>` (never `:latest`) and the zip uploaded to `rehearsal/<version>-<commit>/` on Backblaze, both checked; with `UPLOAD=no` (the default) the exact commands and where they would write, nothing written. `DOCKER_RELEASE_RESULT` is the verdict, recorded as `rehearsal.docker` (`upload=no` or `upload=yes`). Nothing users get changes. `E2E_DOCKER_FROM_URL` (a staged download installed as a user gets it, by hand) is kept for checking the public copy's source.
  - `MODE=upload` (release day, the owner only): no build: `release-publish.sh upload-kept docker` checks the kept set of this checkout's version and commit (each file's sha256 and the image id against `MANIFEST.txt`, the manifest's verdict, the passed `rehearsal.docker` record and its sha256, the version gate, `origin/main`, step 1 with all four lanes), then `stage-docker` uploads those very files as a rehearsal does; any mismatch is refused, named (`REFUSED: ...`), nothing uploaded. `UPLOAD=no` or `DRY_RUN=yes`: the same checks, then the commands it would run. `UPLOAD_KEPT` is the verdict. Minutes.
  - `MODE=public` (the owner only, with `UPLOAD=yes`; refused within seconds with `UPLOAD=no`): the newest passed rehearsal of this version that uploaded its files (not `upload=no`), on whichever commit (`REHEARSED <commit> <time>`), copied in minutes (`release-publish.sh publish docker`): its zip checked by download against the tested sha256 and `:<version>` against the rehearsed digest, the outgoing release's zip archived (copied from `newest/` to its own `<old version>/` when missing there, checked by download), then copied to `newest/` (the links of the README, the Docker Hub page and the self-host page) and to `<version>/` (the archive), each `newest/` file checked by download, the Cloudflare cache purged, `:latest` pointed at the rehearsed `:<version>` and checked, `newest/docker-version.txt` written, `public.docker` recorded, the copied rehearsal's zip deleted from `rehearsal/`, then `seed` queued. With no passed rehearsal: `no passed rehearsal of <version> on the docker channel: rehearsing first`, the rehearsal on `origin/main`, and the copy only when it is green. It never copies anything that did not pass. Printed at the end, by hand: the Docker Hub page (`asbl/docker/push-dockerhub-readme.ps1`, on Windows, with its own Docker Hub token) and `dp-ci-release-step4-demo-public`.
- **When and order:** after step 1 (or, on the owner's decision, without it: `E2E_APPROVAL`); before step 3, never at the same time (one VM). The owner's way: the day before, `MODE=rehearsal UPLOAD=no`, then step 3 the same (execution 1; the re-runs; then execution 2 the same way); release day `MODE=upload UPLOAD=yes`, a look, then `MODE=public UPLOAD=yes`. The two public runs (steps 2 and 3) one after the other.
- **Parameters:** `MODE` (`rehearsal`, `upload`, `public`), `UPLOAD` (below), `DRY_RUN` (`no`, `yes`: the gate, the prerequisites (the bucket listed, not written), the guards, which rehearsal it would copy or that it would rehearse first, and what each part would do; nothing built, pushed, installed or copied), `E2E_APPROVAL` (below).
- **`UPLOAD`** (`no`, the default, or `yes`; the same parameter on both release jobs), whether the run writes to Docker Hub and the bucket (the owner says yes). Every upload reads it (`release-publish.sh` stage-docker, stage-files and publish), none goes around it:
  - `no`: all the work and every proof, the files kept, then, for each upload it skips, the exact command and where its output would go (`UPLOAD=no  would run: ...`); no credential read (the prerequisites leave out the upload checks: `NOT CHECKED ...`), nothing written; recorded `upload=no`, which `MODE=public` never copies (release day's `MODE=upload` uploads the kept files); the build list says `<version> proven and kept, nothing uploaded (UPLOAD=no)`;
  - `yes`: the uploads run, at the end, after every proof is green;
  - `MODE=public` needs `yes` (`REFUSED: MODE=public needs UPLOAD=yes`, nothing done);
  - example: rehearse 16.6.0 and upload it: `MODE=rehearsal UPLOAD=yes`.
- **`E2E_APPROVAL`**, the owner's written decision to release without step 1's four lanes counting for the commit (the owner only):
  - empty (the default): the step-1 check as above, refused without the four lanes;
  - with the words `owner approved` in the text, in any case: that check is not made and the run goes on whatever the release record holds. Nothing else changes: the version gate, the prerequisites, the pushed digest and the sha256 checks, and never copying what did not pass a rehearsal stay as they are. It covers every step-1 check of the build: the guard at the start and `stage-docker`'s own;
  - written down, never silent: `E2E_APPROVAL` lines in the log (`ACCEPTED`, the Jenkins user who started the build, the UTC time, the whole text, and each of the four lanes: PASS or FAIL on this commit, else the newest result on another commit, else missing), and the entry `approval.step1` on the commit in the release record (`release-state.sh show`); `DRY_RUN=yes` prints it and records nothing;
  - it counts for that build only and never turns a lane green: the next build without it is refused again;
  - any other text: refused as when empty, and the log shows the text (`E2E_APPROVAL NOT ACCEPTED`), so a mistyped approval is seen;
  - example: `owner approved: 16.7.0 on step 1 of <commit>, before the fix in ServicesManager.java` (a change to what ships after step 1: the one case the record cannot carry).
- **Time:** a rehearsal: 16.6.0's took about 2 h 10 to 2 h 20 with the earlier five-file light set (its last two chains: the build 36 min, when there is none; the Linux proof 23 to 30 min; the Windows proof 67 to 76 min); the light set of `asbl/ci/light-set.txt` adds about 1.5 h by estimate (the Windows proof capped at 4 h 30); the keeping and the upload: minutes; `MODE=upload` and a public copy: minutes (not measured yet).
- **Log:** `DOCKER RELEASE STEP 1/6` (the gate) .. `2/6` (the build), `3/6` (the Linux proof), `4/6` (the Windows proof), `5/6` (the keeping), `6/6` (the guard and the upload); `^UPLOAD=no ` for what an `UPLOAD=no` run skipped; `^KEEP|^KEPT|^REPLACED|^PROOF|^FAILURES|^REPORT` for what it kept; `DOCKER UPLOAD` (`MODE=upload`); and `DOCKER PUBLIC` (`PUBLIC STEP 1/4` .. `4/4`); `^E2E_APPROVAL` for an approval; the build's Trivy table on the build page.

### dp-ci-release-step3-release-windows-vm

- **What:** the Windows release, `dp-ci.sh win release`, `MODE=rehearsal` (the default), `MODE=upload` or `MODE=public` (the comment above `win_release` in `asbl/ci/dp-ci.sh`: what it builds, proves, keeps, how long, what it leaves). Rehearsal and public start with the Windows channel's version gate (nothing to release = green, nothing done), then check the prerequisites within seconds (`release-publish.sh preflight files`, as the Docker job does; then, unless it only copies, the Windows VM answering over SSH, its Docker Desktop, Java 17 and Maven, which the light set needs: `dp-ci.sh prereq vm vm-docker vm-java vm-mvn`): anything missing stops the job before the pack.
  - `MODE=rehearsal`: only when step 1 counts for its commit of `origin/main`, as for the Docker job (otherwise REFUSED within seconds, as above; or with `E2E_APPROVAL`, as the Docker job; `windows-vm-electron-light` is its own part 2, shown as proven later). Four parts, each run whatever the one before said:
    - `RELEASE STEP 1/4`: on the Windows VM, `asbl/pack-datapallas.bat` builds the Windows release files once, from clean (`datapallas.zip` with DataPallas.exe, `datapallas-server.zip`, `datapallas-src.zip`, which holds exactly the commit's files, `git archive HEAD`; it builds no Docker image, the Docker job builds Docker on Linux); the three zips are brought down to this host, checked against the pack's sha256 and kept (`release-keep.sh keep windows`, the artifacts folder as the Docker job's);
    - `RELEASE STEP 2/4`: the electron light set, `dp-ci.sh win e2e` with `E2E_SPEC=light` (`asbl/ci/light-set.txt`, its entries for `windows-vm-electron`: the samples, one test per zone and `auth-authorization-desktop` whole), on the app built from the repository at the release commit, its own prepare first; recorded as `step1.windows-vm-electron-light` on that commit, the lane step 1 needs (no separate run, no parameter). Its prepare (`pack-prepare-for-e2e.bat`) empties `asbl\dist`: the reason the zips are kept first;
    - `RELEASE STEP 3/4`: the pack's zips put back in `asbl\dist` from the kept copy (`dp-ci.sh win put-dist`, sha256 checked), then those very files tested as a user meets them by the Robot Framework UAT (`asbl/src/uat/run-tests.bat`, a bare step: the machine's own Java; elevated, `WIN_RUN_ELEVATE=1`, so the installs and teardowns of its suites meet no UAC prompt: the VM's CI account must be an administrator); a red light set does not skip it; no pack = not run, a failure;
    - `RELEASE STEP 4/4`: what it kept, checked against the manifest; then, only when the three parts are green and `origin/main` is still that commit or moved since by never-shipped files only (`release-state.sh moved-main`, as the Docker job's guard; otherwise `not uploaded`, a failure), with `UPLOAD=yes`, this host deletes the Windows zips of earlier rehearsals from `rehearsal/`, the VM itself uploads the three zips from its `asbl\dist` to `rehearsal/<version>-<commit>/` (each checked against the pack's sha256 first) with its own rclone, and this host checks each by download (`release-publish.sh stage-files` -> `dp-ci.sh win stage-upload`; the key rule: "The credentials", below), recorded as `rehearsal.windows`; with `UPLOAD=no` (the default) the exact commands, nothing written, recorded `upload=no`. Then the manifest's windows verdict and `failure-report-windows.md`. `RELEASE_RESULT` is the verdict (`pack= keep= light= robot= stage=`); `RELEASE_FILE` the sha256 of the files (also `<log>-step-release-files.txt`). Nothing users get changes.
  - `MODE=upload` (release day, the owner only): no pack: `release-publish.sh upload-kept windows` checks the kept zips as the Docker job's `MODE=upload` does (manifest, `rehearsal.windows` record and sha256, version gate, `origin/main`, step 1 with all four lanes), puts them back in the VM's `asbl\dist` when a later run replaced them (`dp-ci.sh win put-dist`), then `stage-files` (the VM uploads them, this host checks each by download). `UPLOAD=no` or `DRY_RUN=yes`: the checks and the commands only. Minutes.
  - `MODE=public` (the owner only, with `UPLOAD=yes`, as the Docker job): the newest passed, uploaded rehearsal of this version copied in minutes, the VM untouched (`release-publish.sh publish windows`): checked by download, the outgoing release's zips archived as for Docker, copied to `newest/` and `<version>/`, checked again, the Cloudflare cache purged, `newest/windows-version.txt` written, `public.windows` recorded, the copied rehearsal's zips deleted, `seed` queued; with none, it rehearses first, as the Docker job does. It never copies anything that did not pass.
- **When and order:** as the Docker job; after it, never at the same time.
- **Parameters:** `MODE` (`rehearsal`, `upload`, `public`), `UPLOAD` (as the Docker job's), `DRY_RUN` (`no`, `yes`: the VM untouched, only asked whether it answers; the gate, the prerequisites (the bucket listed, not written), the guard, which rehearsal it would copy or that it would rehearse first, and what each part would do), `E2E_APPROVAL` (as the Docker job's; here it covers the guard at the start and the check again before staging).
- **Time:** a rehearsal: 16.6.0's took about 3 h 35 on the VM (its last two chains): the pack 82 min (capped at 8 h, `RELEASE_PACK_TIMEOUT`), the electron light set: its own package rebuild 62 min, then its tests (29 min with the earlier six-file set, about an hour by estimate with `asbl/ci/light-set.txt`, so about 4 h 15 in all; capped at 3 h, `RELEASE_LIGHT_TIMEOUT`), and the Robot UAT 32 to 41 min (capped at 6 h, `RELEASE_ROBOT_TIMEOUT`); `MODE=upload`: minutes; a public copy: minutes: its own work took 8 s against local stand-ins (2026-10-22); a real copy also downloads the three zips (about 1.7 GB) twice to check them and copies them on the bucket, so the download speed decides.
- **Log:** `RELEASE STEP 1/4` (the pack and the keeping) .. `2/4` (the electron light set), `3/4` (the Robot UAT), `4/4` (what it kept, the upload), `WINDOWS UPLOAD` (`MODE=upload`) and `WINDOWS PUBLIC` (`PUBLIC STEP 1/3` .. `3/3`); `^E2E_APPROVAL` for an approval; the Robot report and the electron light set's Playwright report on the build page ("Robot UAT reports", below).

### dp-ci-release-step4-demo-public

- **What:** step 4 of a release: demo.datapallas.com (the public demo that datapallas.com frames) installs the published release, nothing built (OD4): `asbl/ci/jenkins/release-demos.sh` with `DEMO=demo.datapallas.com`: `setup.sh` and `setup.sh --edge`, then `asbl/ci/demo-public/install-release.sh` (`newest/datapallas-server-docker.zip` unzipped into a folder of its own per version, with `asbl/ci/demo-public/docker-compose.override.yml`: no Docker socket, no host port, no MailHog; the data carried over from the running version; the previous version started again when the new one does not answer; nothing to do when it already runs the released version; its verdict is the `DEMO_INSTALL result=` line), then `setup.sh --check` and the demo links. The output is masked like the Rundeck job's.
- **When:** after step 2's `MODE=public`.
- **Parameters:** `RESET_DEMO_DATA` (`no`; `yes` = the new version starts from the bundle's own data, the old data stays in the previous version's folder; for a release that changed the dashboards), `DRY_RUN` (`no`, `yes`: changes nothing).
- **Needs:** the Docker release public; the demo's two root-only settings files, written when it was set up (`demo-datapallas-com.env` and `demo-public-storefront.env` in `/var/kraft-internalsystems/config/datapallas-ci/`, named in `asbl/ci/demo-public/setup.sh`). **Time:** minutes (not measured yet). **Log:** `DEMOS STEP 1/3` .. `3/3`; `DEMOS_RESULT` is the verdict.

To add a step: make it a script in `asbl/ci/` that launches a detached run and prints a `log:` line, add a
`<name>.Jenkinsfile` here (copy `dp-ci-dev-junit.Jenkinsfile`), add an entry to `seed.groovy`, push, run `seed`. A job that runs several
scripts wraps each in `job-step.sh "JOB STEP n/N" "<what>" <command...>`, so its log says where the time goes.

**What each job needs before it starts.** Each job checks it first, within seconds, before anything slow: one line per check, `OK <what>` or `MISSING <what>: <what to do>`, then `PREREQUISITES OK` or `PREREQUISITES MISSING (<n>): nothing was started. Fix what is listed above, then run the job again.` By hand, on this host: `bash asbl/ci/dp-ci.sh prereq <check...>` (`docker`, `vm`, `vm-docker`, `vm-java`, `vm-mvn`, `vm-free`, `publish-target <task>`) or `bash asbl/ci/dp-ci.sh win prereq e2e|docker-e2e|server-e2e|release` (a Windows lane's set). The checks only read. The jobs with a build label (steps 0, 2 and 3) then show `prerequisites missing: see the log`.

- Every job that runs `dp-ci.sh` on this host (`dp-ci-dev-junit`, `dp-ci-dev-quality-report`, `dp-ci-dev-e2e-one-spec`, `dp-ci-dev-server`, step 1's `web`, `electron-linux` and `docker-server`, the builds in steps 1 and 2): the Docker engine on this host (`docker`): `MISSING a running Docker engine on this host: start it (systemctl start docker), then run the job again`.
- Step 1, the Windows targets, at the start of the lane (before the VM's sync and package rebuild); `windows-vm-docker` and `windows-vm-server` also before their build, with no other Windows run going (`vm-free`: `MISSING a free Windows VM: another Windows run is going ...`):
  - all three: the VM (`vm`): `MISSING WIN_HOST, ... in <win-ci.env>: the Windows VM's settings ...` or `MISSING an answer from the Windows VM over SSH ...: start the VM, or repair its SSH, ...`; its Docker Desktop (`vm-docker`): `MISSING Docker Desktop running on the Windows VM: start it in the VM's desktop session, wait until docker info answers, ...`;
  - `windows-vm-electron`: Java 17 and Maven on the VM's PATH as the registry has it, the test gulp makes before it starts the server (`vm-java`, `vm-mvn`): `MISSING Java 17 on the Windows VM: ...`, `MISSING Maven (mvn) on the Windows VM: ...` (without them gulp tests the Install screen instead of the app);
  - `windows-vm-docker`: also the Docker engine on this host, which its image is copied from (not when a release's download is tested);
  - `windows-vm-server`: also the machine's Java 17 (`vm-java`), which `startServer.bat` runs on.
- `dp-ci-release-step2-release-docker` and `dp-ci-release-step3-release-windows-vm`: "Before the first release", below; step 3 also the VM answering over SSH (`vm`), unless it only copies.
- `dp-ci-release-step4-demo-public` builds nothing and has no check of its own: a part that fails stops it with `FAILED` and why.

## The release, in order

```
step0 set-version                         (RELEASE_VERSION bigger than the current release: the 7 version files, one commit on main)
   |  the version commit, or a later one (the changelog)
   v
step1 e2e-prerelease                      (Linux + Windows VM, the e2e lanes; one Jenkins build per target; the full
                                           set on one side, web or docker-server, the other side than the release before)
   |  all required lanes count for commit C (green on it, carried from an earlier commit, or completed by re-runs)
   v
   |  the day before: UPLOAD=no, everything built, proven and kept: execution 1; each failure re-proved alone
   |  (release-rerun.sh); then execution 2, start to end, green start to end: the sign-off
step2 release-docker      MODE=rehearsal  (Linux builds; light set on Linux AND Windows on that build, no registry; the zip
                                           and the image kept; then, UPLOAD=yes, :V pushed and the zip staged in rehearsal/)
step3 release-windows-vm  MODE=rehearsal  (Windows VM packs, the zips kept; the electron light set (= step 1's lane);
                                           Robot UAT; then, UPLOAD=yes, the zips staged in rehearsal/)
   |  each PASS on commit C, version V  (as jobs: step 2 first, never at the same time, one VM; the orchestrator
   |  runs both on two tracks, one VM part at a time)
   |  release day:
step2 release-docker      MODE=upload     (UPLOAD=yes: the kept zip and image, no rebuild, checked against the manifest)
step3 release-windows-vm  MODE=upload     (UPLOAD=yes: the kept zips, no new pack, uploaded by the VM)
   v
step2 release-docker      MODE=public     (UPLOAD=yes; rehearsal/V-C -> newest/ and V/, :V -> :latest, checked; owner only)
step3 release-windows-vm  MODE=public     (UPLOAD=yes; rehearsal/V-C -> newest/ and V/, checked; owner only; right after step 2's)
   v
step4 demo-public                         (demo.datapallas.com installs the published release, see OD4)
```

Why this order:

- **Step 0 sets the version**, the one thing a release changes in the code: one commit on `main` with the 7 version files, made from `origin/main` in a throwaway worktree. Left as it is, the job does nothing, so a click by mistake changes nothing. The release notes (`CHANGELOG.md`) stay the owner's, committed before step 1.
- **Step 1 proves the code**: the real e2e on a package built from one commit. The lanes a release needs (owner decision OD5, 2026-10-22; the full set alternating since 2026-10-24) are the full set on this release's side, `web` or `docker-server` ("The full e2e lane", below), `docker-server` auth, and the light sets of `windows-vm-electron` and `windows-vm-server`. Since 2026-10-24 (plan-pre-release-artifacts-ready) step 3 runs the `windows-vm-electron` light set itself, its `RELEASE STEP 2/4`, and records it as that lane: the step-1 job is the trunk's check and the other three lanes.
- **`E2E_APPROVAL`, the owner's written exception.** Steps 2 and 3 refuse unless step 1's four lanes count for their commit (green there, carried from an earlier commit when only never-shipped files changed, or completed by re-runs); when the owner decides to release on other evidence (for example step 1 green on a commit before a fix to what ships), `E2E_APPROVAL` with the words `owner approved` on each of the two jobs lets it go on without that check, loosening nothing else. The log (`^E2E_APPROVAL`) and the release record (`approval.step1`) keep who, when, the text and what the four lanes were at that moment, and the next build without it is refused again.
- **The rehearsals make the files a user downloads, each once, and test those very files the way a user meets them.** Docker is built once, on Linux, and published from Linux; its light set runs on Linux and on Windows on that very build, before anything is uploaded (the zip installed as the self-host page says, the image copied to the VM, never pulled). The Windows files are packed once on the VM, kept, and pass the Robot UAT. Only then, and only with `UPLOAD=yes`, both stage (OD1): `:<version>` on Docker Hub and the zips in `rehearsal/<version>-<commit>/` on Backblaze. Nothing users get changes.
- **`MODE=public` builds nothing**: it copies what a rehearsal tested to `newest/` and `<version>/`, purges the Cloudflare cache of the `newest/` links (OD6) and, for Docker, points `:latest` at the rehearsed digest, each checked. What goes public is byte for byte what passed. It never replaces public files with files that did not pass a rehearsal: run directly, with no passed rehearsal of the version, it rehearses first and copies only when that is green. So: rehearse, look, then public; once trusted, public directly.
- **Old releases stay, rehearsals do not.** Before `newest/` is replaced, the outgoing release's files are copied to its own `<version>/` when they are not there yet (so the first job release archives the hand release 16.5.0 too). After the copy, the rehearsal it copied is deleted; a new rehearsal first deletes its channel's earlier rehearsal files (red, abandoned or never made public), each marked removed in the release record. Only `rehearsal/` is ever cleaned, with a hard delete that frees the space at once; `newest/` and `<version>/` never. `DRY_RUN=yes` prints what it would archive and delete.
- **One commit per execution, two executions per release**: an execution (steps 2 and 3, start to end) refuses unless step 1 counts for its commit of `origin/main`, and builds, proves and keeps that commit's files. During it `main` may move by never-shipped files only (`release-state.sh moved-main`; under the orchestrator's `RELEASE_PIN`, by anything: each step tests the pin). Between execution 1 and execution 2 the fixes go on `main` and each failure is re-proved alone on the build already there (`release-rerun.sh`; a product fix after its one part is rebuilt). Release day's `MODE=upload` uploads only the kept files of the checkout's commit, so `origin/main` must be on execution 2's commit then (`upload-kept` refuses otherwise). `MODE=public` copies the rehearsed commit's files even when `main` has moved since.
- **Each channel is released on its own**, with its own released version and its own public run. Between the two public runs, `newest/` holds one channel's new files next to the other's old ones: run the two public runs one after the other.
- **Step 4, demo.datapallas.com**, installs the published release like any user (OD4).

**Which proof covers which file.** Each file a user gets is built once, proven as built, then uploaded; nothing tested is rebuilt after its proof, and no Playwright run is pointed at the packed exe:

| File | Built | Proven | Uploaded (`UPLOAD=yes`) |
|---|---|---|---|
| the image `flowkraft/datapallas-server:<version>` | step 2, on this host (`dp-ci.sh build-if-needed`: `<version>-<commit>`) | step 2: `DOCKER RELEASE STEP 3/6`, the light set on this host (`docker-server`) and the one-command `docker run`; `STEP 4/6`, the light set on the Windows VM in Docker Desktop (`windows-vm-docker`), that image copied over; both recorded in `rehearsal.docker` (`linux=`, `windows=`) | step 2 `STEP 6/6`, from this host: `:<version>` pushed (`:latest` only by `MODE=public`) |
| `datapallas-server-docker.zip` | step 2, with the image (`asbl/dist/`) | the same two installs, as the self-host page says: its Windows proof is step 2's `STEP 4/6` (`win-e2e.sh docker-e2e`, its log in the build's console and `win-e2e-latest.log`), not a step-1 lane | step 2 `STEP 6/6`, from this host: `rehearsal/<version>-<commit>/` |
| `datapallas.zip` (DataPallas.exe) and `datapallas-server.zip` | step 3, on the Windows VM (`asbl/pack-datapallas.bat`) | step 3: `RELEASE STEP 3/4`, the Robot UAT installs both as a user does (`asbl/src/uat`) | step 3, by the VM itself (the key rule: "The credentials", below), checked by download from this host |
| `datapallas-src.zip` | step 3, with them | packed, not run | step 3, with them |

Step 1 proves the code, not these files: the full set on its side (`web` or `docker-server`, both on this host), the sign-in file, the light set of `windows-vm-electron` (the app in Electron mode built from the repository: the proof it was written for; run by step 3, its `RELEASE STEP 2/4`) and of `windows-vm-server`. Together they are the confidence: the alternating full set, the Docker light set on the Docker files, the Electron light set, the UAT on the two Windows zips.

**Publishing by hand.** Steps 0 to 3 from the scripts, with the same log and record: "Running the release from the scripts", below. There is no other way than the jobs' own scripts, which the jobs only start; on this host, from the repository (`/var/kraft-internalsystems/projects/all-repos/src/products/reportburster`), with the same parameters as environment variables and the same checks:

- release day, the kept files: `MODE=upload UPLOAD=yes bash asbl/ci/jenkins/release-docker.sh` and `MODE=upload UPLOAD=yes bash asbl/ci/jenkins/win-e2e.sh release` (or straight `UPLOAD=yes bash asbl/ci/release-publish.sh upload-kept docker|windows`);
- Docker: `MODE=rehearsal UPLOAD=yes bash asbl/ci/jenkins/release-docker.sh`, a look, then `MODE=public UPLOAD=yes bash asbl/ci/jenkins/release-docker.sh` (it runs in the foreground, a rehearsal for hours: start it in tmux);
- Windows: `MODE=rehearsal UPLOAD=yes bash asbl/ci/jenkins/win-e2e.sh release`, then `MODE=public UPLOAD=yes bash asbl/ci/jenkins/win-e2e.sh release` (it returns in seconds and runs detached; follow it with `FOLLOW_PIDFILE=/var/kraft-internalsystems/logs/datapallas-ci/win-e2e.pid bash asbl/ci/jenkins/follow-ci.sh attach`, the log is `win-e2e-latest.log`);
- `DRY_RUN=yes` first prints what each would do; `UPLOAD=no` (the default) proves everything and prints each upload's command (`UPLOAD=no  would run: ...`) instead of running it. Those printed commands are for reading: run by hand they would put files no rehearsal recorded as uploaded, which `MODE=public` never copies; rerun the rehearsal with `UPLOAD=yes` instead.

The owner runs these (an upload or a publish is his); `E2E_APPROVAL` works the same way (`E2E_APPROVAL='owner approved: ...'`). The Docker Hub page stays by hand: `asbl/docker/push-dockerhub-readme.ps1`, on Windows.

**The version gate.** Every release job starts with `bash asbl/ci/release-state.sh version-check docker|windows`. The version is `<version>` in `bkend/reporting/src/main/external-resources/template/config/burst/settings.xml`, which step 0 sets (`dp-ci-release-step0-set-version`: `asbl/ci/set-version.sh <version>` on `origin/main`, with the other version files; `--versions` lists them, they must agree). Each channel has its released version: Docker's is the one Docker Hub's `:latest` has; Windows' is the `version=` line of `newest/windows-version.txt`, read by its download link, and until the first Windows `MODE=public` writes that file, 16.5.0, the last version both channels were released together by hand (a constant in `release-state.sh`). The same: `NOTHING TO RELEASE: ... For a new release, run dp-ci-release-step0-set-version with a bigger version (...)`, the job ends green and does nothing. Greater: the release goes on. Lower, or already published: refused. Step 1 only prints the `RELEASE_VERSION` line and runs anyway, as the everyday e2e job. `release-state.sh released` prints each channel's released version and the current release (the higher one): step 0 compares with it.

**The full e2e lane.** The full set (the whole suite) is not run on every side for every release: it alternates between `web` and `docker-server`, one side per release, the other side the next; the other step-1 lanes are the sign-in file on `docker-server` and the light sets of `windows-vm-electron` and `windows-vm-server`. One record per release version, `<release-state>/full-e2e/<version>` (key=value lines like the verdicts): `lane`, `why` (`alternated`: the other side of the newest earlier version's record; `random`: drawn 50/50 because no earlier record could be read, the first release or a lost or corrupt record, and said so in capitals in the log: `DRAWN AT RANDOM`), `previous`, `chosen` (when), `chosen_commit`, `chosen_by`; then the full run of that lane on that version (`result`, `ran_commit`, `ran`, `log`: the last run counts), and `approved` when an `E2E_APPROVAL` let the release go on without it (the approval itself is `approval.step1` on its commit). The choice is made once per version, by the first of: the step-1 job at its start (only while that version is still to be released on a channel), `release-state.sh full-lane --choose`, the release jobs' step-1 guard; every later run, repeated or after a cancelled one, reads it and never draws again (an unreadable record of the version itself is kept aside as `<version>.unreadable-<time>` and drawn again, as random). The next release alternates from the recorded lane whether it ran or an approval lifted it. `DRY_RUN=yes` prints the choice it would make and records nothing. `bash asbl/ci/release-state.sh full-lane` shows the last two releases' choices and their reasons; `full-lane <version>` answers "which side ran the full set for that release" from the record alone, without Jenkins history.

**The release record.** Each job writes its verdict as a file under `/var/kraft-internalsystems/logs/datapallas-ci/release-state/<commit>/`, and the jobs after it read it. `bash asbl/ci/release-state.sh show [<commit>]` prints the table: where a release stands, and for each step 1 lane which commit counts and how (its own run, carried, or by re-runs), then whether step 1 is complete for a release; `release-state.sh rehearsed docker|windows <version>` names the newest passed rehearsal of a version whose files are still in `rehearsal/`.

| Job | Needs | Writes | Records |
|---|---|---|---|
| step 0 `dp-ci-release-step0-set-version` | nothing | the version commit on `main` | nothing |
| step 1 `dp-ci-release-step1-e2e-prerelease` | nothing (one build per lane) | nothing | `step1.<target>-<mode>` (`release-state.sh record-step1 <target> reruns <mode>`: a lane red on a few tests made PASS once each passed alone); the release's full lane in `full-e2e/<version>` (chosen at the first build of the version, the full run's result) |
| `dp-ci-release-step2-release-docker`, `MODE=rehearsal` | the step 1 lanes on its commit but `windows-vm-electron-light`, which step 3 records (or `E2E_APPROVAL` = `owner approved`); the prerequisites below | on this host, always: the zip, the image tag `:<version>`, the manifest and the failure report in `release-artifacts/<version>-<commit>/`; `UPLOAD=no`: nothing else; `UPLOAD=yes`: `flowkraft/datapallas-server:<version>`; `datapallas-server-docker.zip` in `rehearsal/<version>-<commit>/` (the earlier Docker rehearsal zips deleted) | `rehearsal.docker-stage`, `rehearsal.docker`; `approval.step1` with an `E2E_APPROVAL` |
| `dp-ci-release-step3-release-windows-vm`, `MODE=rehearsal` | the step 1 lanes on its commit but `windows-vm-electron-light`, its own part 2 (or `E2E_APPROVAL` = `owner approved`); the prerequisites below | on this host, always: the three zips, the manifest and the failure report in `release-artifacts/<version>-<commit>/`; `UPLOAD=no`: nothing else; `UPLOAD=yes`: `datapallas.zip`, `datapallas-server.zip`, `datapallas-src.zip` in `rehearsal/<version>-<commit>/` (the earlier Windows rehearsal zips deleted) | `step1.windows-vm-electron-light`, `rehearsal.windows`; `approval.step1` with an `E2E_APPROVAL` |
| either job, `MODE=upload` (`UPLOAD=yes`) | the kept set of the checkout's version and commit, its manifest green, a passed `rehearsal.<channel>` with the same sha256, all four step 1 lanes | what that channel's rehearsal with `UPLOAD=yes` writes, from the kept files | `rehearsal.docker` / `rehearsal.windows` `upload=yes` |
| either job, `MODE=public` (`UPLOAD=yes`) | a passed rehearsal of this version on its channel that uploaded its files (else it rehearses first); the prerequisites below | the outgoing release in its `<version>/`, `newest/` and `<version>/` on Backblaze (the copied rehearsal deleted), the Cloudflare purge, `newest/<channel>-version.txt`; Docker also `:latest`: the public links | `public.docker` or `public.windows`, on the rehearsed commit |
| step 4 `dp-ci-release-step4-demo-public` | the Docker job's `MODE=public` done (it installs `newest/`) | demo.datapallas.com | nothing |

**The credentials** (OD3) are one root-only file the owner writes, `/var/kraft-internalsystems/config/datapallas-ci/release-publish.env`, mode 600: `DOCKERHUB_USER`, `DOCKERHUB_TOKEN`, `RCLONE_CONFIG` (the path of an rclone config with the `backblaze` remote), `CLOUDFLARE_PURGE_TOKEN`, `CLOUDFLARE_ZONE_ID`. The jobs check it first (the list below) and source it silently; nothing prints it. The one exception to "only this host": the Windows zips are uploaded by the VM itself (`dp-ci.sh win stage-upload`): the fields of the `backblaze` remote go from `rclone config dump` here straight into the SSH session's stdin (never a variable, an argument or a file), a constant PowerShell sent inline (`-EncodedCommand`, never a script file) reads them into memory and gives them to that one rclone process as its environment (`RCLONE_CONFIG_DPRELEASE_*`, `--config NUL`); the VM's log lines say counts and destinations only, never rclone's output. Afterwards the VM holds no credential: no config file, no temporary file, nothing in a log. rclone itself (v1.68.2, sha256-checked) is installed on the VM by the job when missing (`C:\dp-ci\tools\rclone`, the one thing this release installs there). The cleanup of earlier rehearsals, the checks by download and the public copy stay on this host.

**Before the first release**, what the owner provides. The release jobs check it right after the version gate, within seconds, before anything slow, and name what is missing with these words (`bash asbl/ci/release-publish.sh preflight docker|files [public]` runs the same check by hand; "nothing to release" ends green before it, so a missing key never turns a no-op run red):

- both release jobs, `dp-ci-release-step2-release-docker` and `dp-ci-release-step3-release-windows-vm`, with `UPLOAD=yes` (`UPLOAD=no` needs none of this list: `NOT CHECKED`):
  - `rclone`, `curl` and `sha256sum` on this host;
  - `release-publish.env` owned by root, mode 600 (`chmod 600`; not read otherwise), with the keys below;
  - `RCLONE_CONFIG` in it: the path of an rclone config whose `backblaze` remote is an rclone b2 remote with a Backblaze application key that can write and delete in the `datapallas` bucket (the check writes a few bytes to `rehearsal/_preflight/`, downloads them back from the download site and removes them; `DRY_RUN=yes` only lists `rehearsal/`);
  - the download site (`downloads.datapallas.com`) answering: every upload is checked by download.
- `dp-ci-release-step2-release-docker` also:
  - the Docker engine and `docker buildx` on this host;
  - `DOCKERHUB_USER` and `DOCKERHUB_TOKEN`: a Docker Hub access token of that user with Read & Write on `flowkraft/datapallas-server` (the check logs in with a throwaway Docker config and asks Docker Hub's token service for the push right; nothing is pushed);
  - unless it only copies a passed rehearsal: the Windows VM answering over SSH, its Docker Desktop running, and no other Windows run going (`dp-ci.sh win prereq docker-e2e`).
- `dp-ci-release-step3-release-windows-vm`, any `UPLOAD`, unless it only copies: the Windows VM answering over SSH, its Docker Desktop, Java 17 and Maven on its PATH (the electron light set needs them), no other Windows run going (`dp-ci.sh prereq vm vm-docker vm-java vm-mvn`).
- `dp-ci-release-step3-release-windows-vm` with `UPLOAD=yes` also: the VM reaching `downloads.rclone.org` once (the job installs its rclone there before the pack when missing, a minute; `MISSING rclone on the Windows VM: ...` otherwise) and Backblaze (it uploads the zips itself).
- `MODE=public`, either job, also: `CLOUDFLARE_PURGE_TOKEN`, a Cloudflare API token with Cache Purge on the download site's zone (checked with Cloudflare's read-only token check; nothing is purged), and `CLOUDFLARE_ZONE_ID`.

The owner's steps for a release:

1. Done on 2026-10-22: `seed.groovy` approved (In-process Script Approval), `seed` run, the old jobs archived and deleted. Again after every change to `seed.groovy`: approve its new text and run `seed`; it never deletes a job, so a job it no longer defines is deleted by hand, archived first.
2. Once: write `release-publish.env` and provide the rest of "Before the first release" above; `bash asbl/ci/release-publish.sh preflight docker public` and `... preflight files public`, run on this host, list what is still missing.
3. Commit the changelog (`asbl/src/main/external-resources/db-template/CHANGELOG.md`, a `## <version> - <date>` heading) and whatever else the release needs, then run `dp-ci-release-step0-set-version` with the new version (`DRY_RUN=yes` first shows the 7 edits): it commits the version files and pushes them to `main`. Until that commit, every release job says NOTHING TO RELEASE. From then on a change to what ships needs step 1 again (or `E2E_APPROVAL`); a test, CI or doc change does not (`asbl/ci/reuse-or-rebuild.sh`).
4. Run step 1 for each required lane but `windows-vm-electron` light, which step 3 runs (each build prints them at its start, after `FULL_LANE=`: which side runs the full set this time and why; `bash asbl/ci/release-state.sh full-lane --choose` says the same before any build) (or decide to go without it: `E2E_APPROVAL` on the two jobs), then, the day before, execution 1: step 2 and then step 3 with `MODE=rehearsal UPLOAD=no` (or the orchestrator: "Running the release from the scripts"); read `MANIFEST.txt` and the two failure reports ("The day before and release day"), fix each failure and re-prove it alone (`release-rerun.sh run`, until `release-rerun.sh show` says `ready for execution 2`), then execution 2 the same way, start to end, green start to end: the sign-off; release day, both with `MODE=upload UPLOAD=yes`, look at them, then both with `MODE=public`, one after the other, then step 4, `dp-ci-release-step4-demo-public`. The Docker job's `MODE=public` prints what stays by hand (the Docker Hub page: `asbl/docker/push-dockerhub-readme.ps1`).

## The day before and release day

Since 2026-10-24 (plan `plan-pre-release-artifacts-ready`) the work that takes hours is done the day before, and release day only uploads what that work kept and proved.

**The day before**, two executions (the set signed off belongs to one commit, execution 2's): execution 1 is step 2, then step 3, each `MODE=rehearsal UPLOAD=no` (no credential needed or read); each failure is then fixed on `main` and re-proved alone on the build already there (`release-rerun.sh run <part> --failed <kept folder>`; a product fix only after that one part is rebuilt, `REBUILD=yes`) until `release-rerun.sh show` says `ready for execution 2`; then execution 2, the same two steps on the new commit, start to end. Each checks the gates it needs within seconds (the version gate, the prerequisites, the step 1 guard: `windows-vm-electron-light` is shown as proven later, by step 3), builds, proves, keeps, and closes with a summary: what it kept, its proof, where it sits. Nothing stops early: every part runs whatever the one before it said (a red Linux proof still runs the Windows proof; a red electron light set still runs the Robot UAT; a failed pack only skips what has nothing to test), every report is pulled, red or green (the VM's `windows-vm-docker` and `windows-vm-server` lanes: Playwright stops itself 10 minutes before the lane's time limit, `WIN_RUN_TIMEOUT`, so its report is still written), and a red run keeps its files too (the manifest says `result=FAIL`; release day refuses them).

**Where the files wait**: `/var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit8>/` on this host (`asbl/ci/release-keep.sh`; `RELEASE_ARTIFACTS_DIR` moves it):

- `datapallas-server-docker.zip` (step 2) and `datapallas.zip`, `datapallas-server.zip`, `datapallas-src.zip` (step 3, brought down from the VM's `asbl\dist` right after the pack); the image stays in this host's Docker daemon, tagged `flowkraft/datapallas-server:<version>` (and its build tag `<version>-<commit8>`), and is kept as a file too, `datapallas-server-image.tar` (`docker save`, written before the proofs): this host's nightly cleanup deletes every image no container uses, so release day loads it back from the file (`docker load -i`) when the daemon lost it, and checks its id;
- `keep-docker.log`: what step 2's keeping did (and, when it failed, the image id and the zip's sha256 against the proven ones);
- `MANIFEST.txt`: `version=`, `commit=`, then per channel (`docker.` / `windows.`) the time, each file (`name size= sha256=`), the image (`<repo>:<version> id=sha256:... built_as=<repo>:<build tag>`), each proof (`<step> PASS|FAIL: <what> (log ..., report ...)`), `result=` and `finished=`, the run's log and report;
- `failure-report-docker.md` and `failure-report-windows.md`: one per run, also when green: the steps with their verdicts, the counts per suite (Playwright: passed, failed, flaky, skipped; Robot: per suite), every failure (a skipped test counts as one) with its test, its step, its error and the log or report to open, then the failures grouped by their first error line, each group with the place for its root cause, what changed, the proposed fix and how to verify it: written, never applied;
- `replaced/<channel>-<time>/`: an earlier set of the same version and commit that a later run replaced (a repeat run with the very same sha256 keeps the files and says so; a different build is never mixed with the kept one); nothing is deleted.

`bash asbl/ci/release-keep.sh show [<version>-<commit>]` prints the manifest and where the reports are; `bash asbl/ci/release-keep.sh check <folder> docker|windows` checks each file and the image against it.

**Release day**, the owner: steps 2 and 3 with `MODE=upload UPLOAD=yes` (`DRY_RUN=yes` or `UPLOAD=no` first: the same checks, then the exact commands). `release-publish.sh upload-kept <channel>` uploads exactly the manifest's set: `:<version>` pushed and `datapallas-server-docker.zip` staged in `rehearsal/<version>-<commit>/`; the three Windows zips put back in the VM's `asbl\dist` when needed and uploaded by the VM. It refuses, naming the file, when a sha256, the image id, the version or the commit differs from the manifest, when the manifest's channel is not `result=PASS`, when the rehearsal record does not hold the same files, or when step 1 is not complete (all four lanes, `windows-vm-electron-light` included, or an `E2E_APPROVAL`). Then `MODE=public UPLOAD=yes` on each, unchanged. The full e2e is not run again on release day.

**Where "only the upload is left" does not hold** (each one makes release day more than the upload, or makes its upload refuse):

1. `main` moved after execution 2 (even by never-shipped files only, and even when execution 2 was pinned): the kept files are of the old commit, the checkout is not: `upload-kept` refuses (`origin/main` is not the kept commit). The way back: execution 2 again on the new commit.
2. Step 1 incomplete: the other three lanes are not step 3's work; without them counting for the commit (or an `E2E_APPROVAL` on the release day run) the upload refuses.
3. A red execution 2: its files are kept for reading, never uploaded: a fix is a new commit, re-proved alone, then execution 2 again.
4. The image: a `docker system prune`, this host's nightly cleanup (about 03:00-03:25Z) or a daemon reset removes it from the daemon between the two days: `upload-kept docker` loads it back from the kept `datapallas-server-image.tar` and checks its id. Another build retagging `flowkraft/datapallas-server:<version>-<commit8>` changes it: `upload-kept docker` refuses (the image id); rebuild = a new day-before step 2. A retagged `:<version>` alone is tagged again from the build tag.
5. The VM's `asbl\dist` is replaced by any later Windows pack or emptied by any prepare: `MODE=upload` puts the kept zips back (`dp-ci.sh win put-dist`), so the VM must answer over SSH on release day, and the upload runs from the VM.
6. The credentials: `release-publish.env` is read only on release day: a missing or wrong key shows then (`preflight`), not the day before; `bash asbl/ci/release-publish.sh preflight docker public` and `... files public` the day before say it without uploading.
7. The version gate: a version that went public meanwhile on a channel (by hand, say) makes that channel's upload "nothing to release".
8. Disk: the kept set (about 1.8 GB, plus the image file, as large as the image) and the image live under `/var`; cleaning `logs/datapallas-ci` by hand would delete the set.

## Running the release from the scripts

The release without Jenkins, with the same log and the same release record as the jobs: on this host, from the
repository. Each script's header has the rest (what, how, inputs, never). The long ones are started detached, so they do
not depend on the shell that started them: `setsid nohup <command> >/dev/null 2>&1 &`. `LOG_DIR` is
`/var/kraft-internalsystems/logs/datapallas-ci`; the history of every run, from the shell or Jenkins, is one line each in
`<LOG_DIR>/runs/history.tsv`.

- **The orchestrator**, `asbl/ci/jenkins/release-orchestrator.sh`: one execution, step 0 to the verdicts.
  - Command: `ORCH_STARTED_BY=<name> RELEASE_VERSION=<x.y.z> bash asbl/ci/jenkins/release-orchestrator.sh`
    (`ORCH_STARTED_BY` required). It runs:
    - step 0 (its dry run, then the real one; the commit it pushes is the pin);
    - step 1's lanes that do not count yet for the pin, each with retries 1 (a flaky test gets one more try, as in
      the light sets of steps 2 and 3), then the step 1 guard;
    - the execution on two tracks. The host: the build, the Linux proof, the keeping. The VM: the pack, the Windows
      Docker proof once the build ended, the Electron light set, Robot; never two VM parts at once.
  - `EXECUTION=2`: step 1 (only what does not count yet), then execution 2. It is refused unless `release-rerun.sh show`
    says `ready for execution 2`.
  - `RELEASE_PIN=<commit>`: the commit of the execution [step 0's commit, else `origin/main` at the start]. The steps
    test the pin, so `main` may move meanwhile.
  - `bash asbl/ci/jenkins/release-orchestrator.sh replay <execution 1 commit> <later commit>...`: what each change lets
    a re-run take, per part (reuse or rebuild).
  - Dry run: `DRY_RUN=yes`, with `DRY_RUN_RED="<part>..."` to see what still runs after a red part. It runs, builds,
    records and fetches nothing.
  - Log: `<LOG_DIR>/runs/<UTC>-release-orchestrator-.../run.log`, one log per part beside it, then one summary line
    per part (PASS, FAIL or NOT RUN, its reason, its log). After execution 1 it also prints the failures to fix.
  - Never: an upload (`MODE=rehearsal` and `UPLOAD=no` only), `MODE=public`, step 4, a second execution, a part run
    again, two starts at once (`<LOG_DIR>/release-orchestrator.lock`). It holds no version or approval; an
    `E2E_APPROVAL` given in its environment goes to the guards only.
- **The re-run entry**, `asbl/ci/release-rerun.sh`: a failure re-proved alone, between the two executions.
  - Command: `bash asbl/ci/release-rerun.sh run <web|docker-server|windows-vm-docker|windows-vm-server|windows-vm-electron|robot> [--kept <folder>|none] [--failed <kept folder>|<report>] [--test "<test>"]...`.
    It runs the failed tests, or the named ones, with no retries. It uses the build already there when
    `asbl/ci/reuse-or-rebuild.sh` says reuse; a change to what that part ships stops it until `REBUILD=yes`.
  - `bash asbl/ci/release-rerun.sh show [<kept folder>]`: every failure of the execution with its last re-run, then
    `ready for execution 2` or what is missing.
  - Dry run: `DRY_RUN=yes`: the commit, the build each part would take, the rule's answer, the tests and the command.
    Nothing is written.
  - Log: the lane's own, through `follow-ci.sh`, with the re-run's failure report beside it. The last line is
    `RERUN_RESULT`.
  - Record: one line per test in `<LOG_DIR>/release-reruns.tsv`. `release-state.sh record-step1 <lane> reruns
    <mode>` completes a step 1 lane from it.
  - Never: an upload, the release record or a kept folder written, retries, a build without `REBUILD=yes`.
- **Step 1, one lane**, `asbl/ci/jenkins/release-step1.sh`: what the step 1 job runs.
  - Command: `STEP1_STARTED_BY=<name> E2E_TARGET=<target> [E2E_SPEC=... E2E_GREP=... E2E_ROTATION_DATE=... E2E_RETRIES=...] bash asbl/ci/jenkins/release-step1.sh`.
    `STEP1_STARTED_BY` is required; the other parameters are the job's.
  - Dry run: `DRY_RUN=yes`: the commands of its steps, in order, none run. It still writes its first line and a
    `DRY-RUN` history line.
  - Log: `<LOG_DIR>/runs/<UTC>-step-1-<target>/`, holding `run.log`, `lane.log` and `reports/`.
  - Record: its history line; `step1.<target>-<mode>` in the release record.
  - Never: an upload. It records only its own verdict.

## The seed job (hidden from the dashboard)

`seed` is the one job made by hand. It reads `asbl/ci/jenkins/seed.groovy` from GitHub `main` and creates or
updates every job in the folder `datapallas`. **It is not automatic**: nothing triggers it. It runs only when it
is started, by the owner or by an agent, and only needs to run when `seed.groovy` has changed.

It is kept out of sight on purpose. The default dashboard view is `DataPallas`, which lists only the folder
`datapallas`; the built-in `All` view was removed. The job itself is untouched and still there.

- **Open it:** `https://jenkins.bkstg.flowkraft.com/job/seed/` (type the address; the dashboard does not list it).
- **Run it:** the **Build Now** button on that page, or by the API as below.
- **When:** after any change to `seed.groovy` (a job added or removed, a parameter or description changed).
  Not needed when a `Jenkinsfile` or a script changes: those are read at the start of every build.
- **Safe to repeat:** running it again with nothing changed creates nothing and deletes nothing; the build
  history of the jobs is kept. It rewrites each job's definition to what `seed.groovy` says, so a change made to
  a job in the UI is undone. It never deletes a job: one removed from `seed.groovy` stays until it is deleted
  in the UI.
- **Approval:** every new version of `seed.groovy` must be approved once, in *Manage Jenkins -> In-process
  Script Approval*, otherwise the build fails with "script not yet approved for use". Approve, run it again.
- **Rebuilding Jenkins from nothing:** create `seed` first (freestyle job, source = this repository, branch
  `main`, sparse checkout `asbl/ci/jenkins`, one build step "Process Job DSLs" with
  `asbl/ci/jenkins/seed.groovy`), approve the script, run it. That restores every job.

**By the API (what an agent does).** The service user is `ci-agent`; its token is in the root-only file
`/root/jenkins-ci.env` on the host (never in the repository, never printed). From the host, with `curl` run
inside the Jenkins container (`docker exec ints-jenkins curl ...`, user and token from that file given through
a root-only curl config file), fetch a crumb from `/crumbIssuer/api/json` and POST to `/job/seed/build`.
Poll `/job/seed/lastBuild/api/json` for `building` and `result`; the log is `/job/seed/lastBuild/consoleText`.

**Bring the `All` view back** (if the owner wants every job listed again): the `+` next to the view tabs on the
dashboard, a *List View* that includes all jobs, or `seed` appears again in any view that matches it.

## Files in this folder

| File | What it is |
|---|---|
| `jenkins.md` | this document |
| `seed.groovy` | Job DSL: creates the folder and every job. The source of truth for the jobs |
| `<job>.Jenkinsfile` | one per job, named as the job: starts its script on the host over SSH |
| `win-e2e.sh` | launcher for the Windows VM e2e: starts `dp-ci.sh win e2e` (or `win docker-e2e` / `win server-e2e` / `win release` / `win robot` with the argument `docker-e2e` / `server-e2e` / `release` / `robot`) as a detached host process (pid in `win-e2e.pid`, shared by every Windows lane), log `<ts>-win-e2e-<sha>.log` (`-win-docker-e2e-`, `-win-server-e2e-`, `-win-release-`), ends with `PIPELINE_RESULT=`. The tests themselves run on the VM as a scheduled task; a reboot of the host kills only the driver (then `dp-ci.sh win poll e2e`). Before every run the VM's checkout is fast-forwarded to `origin/main` (to `RELEASE_PIN` under the orchestrator; `dp-ci.sh win sync`; stops on local changes), the commit tested is printed as `WIN_E2E_COMMIT`, and the VM's package is rebuilt with `asbl/pack-prepare-for-e2e.bat` unless it was built from that commit (`WIN_E2E_PACKAGE=`; `dp-ci.sh win prepare` does both without the tests) |
| `job-step.sh` | on the host: runs one part of a job between a `######## JOB STEP n/N START` and an `END ... took=` line (format: `asbl/ci/marks.sh`) |
| `release-step1.sh` | on the host: job `dp-ci-release-step1-e2e-prerelease` (the job passes its parameters): one step 1 lane, its record and its history line; the same from the shell |
| `release-orchestrator.sh` | on the host, no job: one execution from step 0 to the verdicts, on two tracks ("Running the release from the scripts") |
| `release-docker.sh` | on the host: job `dp-ci-release-step2-release-docker`. `MODE=rehearsal`: the build, the proofs on Linux and on the VM (the build's zip and image, no registry), then the upload (`asbl/ci/release-publish.sh stage-docker`, `UPLOAD=yes`). `MODE=public`: the copy of a passed rehearsal (`asbl/ci/release-publish.sh publish docker`) |
| `release-set-version.sh` | on the host: job `dp-ci-release-step0-set-version`: a bigger version written into the version files of `origin/main` (`asbl/ci/set-version.sh`, in a throwaway worktree), checked, committed and pushed to `main` |
| `release-label.sh` | on the host: the label of a step 0, 2 or 3 build in the build list, read from the run's output (`release-run.out` in the job's workspace), set by the Jenkinsfile's `post { always }` |
| `release-demos.sh` | on the host: job `dp-ci-release-step4-demo-public` (`DEMO=demo.datapallas.com`: `asbl/ci/demo-public/install-release.sh`), masked |
| `follow-ci.sh` | on the host: runs a launcher and follows its log until the run ends (`run`), or follows the current one (`attach`) |
| `plugins.txt` | the plugins needed beyond a standard install: `job-dsl`, and the report publishers of the quality plan (`htmlpublisher`, `coverage`, `warnings-ng`, `robot`) |
| `pull-reports.sh` | on the host: streams the report files of a run as a tar.gz, which the `Reports` stage of a Jenkinsfile unpacks into the build's workspace (see "Reports") |

Nothing is kept for Jenkins in the server folders: `apps/program-files/custom-jenkins` only holds the compose
file, and `apps/cvs/custom-jenkins/home` is Jenkins' live data (credentials included), never edited by hand.

## Reports

The CI runs on the host in a detached container, so its reports (test XML, coverage, lint results, HTML sites) are files on the host.
A Jenkins build only has its own workspace, so every job that has reports ends with a `Reports` stage:

1. `Run on the host` runs the script as before. A red run is recorded (`catchError`), not thrown, so the next stage still runs.
2. `Reports` runs `pull-reports.sh` on the host over the same SSH as the run and unpacks the stream into `reports/` in the workspace.
   The paths come from `REPORT_PATHS` in the Jenkinsfile (space-separated, globs allowed, relative to the repository root, e.g. `bkend/*/target/surefire-reports`).
   A missing path is skipped. It never fails the build. Two more forms: an absolute path is packed flat under its own name, and `@run/<suffix>` is the file
   `<newest run log without .log><suffix>` in the log folder (the e2e's `@run/-playwright.xml` is the JUnit XML named after that run's log).
3. The publisher steps of the tools (`junit`, Coverage, Warnings Next Generation, HTML Publisher, Robot Framework) read from `reports/`.
   They are added one tool at a time by the quality-tools work. Every tool is non-gating: it shows a report, it never fails a build.

The plugins are listed in `plugins.txt`. `pull-reports.sh` is read from the host checkout like `dp-ci.sh`, so a change to it needs no Jenkins step; a change to `seed.groovy` needs `seed`.

### Robot UAT reports (Windows lane)

The Robot UAT (`asbl/src/uat/run-tests.bat`, results in `asbl/src/uat/results/`: `output.xml`, `log.html`, `report.html`) runs in `dp-ci.sh win release`,
job `dp-ci-release-step3-release-windows-vm` (`MODE=rehearsal`, `RELEASE STEP 3/4`), on the files the release pack has just made (put back in `asbl\dist` from the kept copy after the electron light set's prepare emptied it).
The electron light set of the same run (`RELEASE STEP 2/4`) leaves `<step log>-electron-light.log` with its `-playwright.xml`, `-playwright.json` and `-playwright-html`, shown on the build page as "Electron light set (Playwright)". The run copies `results/` to the host as
`<step log of the run, without .log>-robot`, and the job shows it with the Robot Framework plugin; the verdict is the run's own
`ROBOT_RESULT` line (from `output.xml`: `run-tests.bat` does not pass Robot's exit code on).

## Quality reports (one place to look)

Every tool below is **non-gating**: it shows a report on the build page and never changes a build's result. Nothing in this section has been run yet (the plan only configured it);
the first-run checklist is at the end. Jenkins folder `datapallas`, each job's build page: https://jenkins.bkstg.flowkraft.com/job/datapallas/.

| Tool | Job | Where to click on the build page |
|---|---|---|
| JUnit (Surefire XML of every Java module) | `dp-ci-dev-junit` | "Test Result" (counts, failed tests, trend) |
| JaCoCo coverage | `dp-ci-dev-junit` | "Coverage" (percentages, trend); "JaCoCo common / reporting / server" (HTML with the source of each class) |
| Error Prone + NullAway (javac warnings) | `dp-ci-dev-junit` | "Error Prone" warnings table |
| Playwright | `dp-ci-release-step1-e2e-prerelease` | "Test Result" (JUnit XML) and "Playwright report" (HTML: steps, screenshots, trace) |
| Robot Framework UAT | `dp-ci-release-step3-release-windows-vm` | "Robot Results"; the sha256 of the accepted files are the archived `release-files.txt` |
| springdoc OpenAPI + Swagger UI | `dp-ci-release-step1-e2e-prerelease` with `E2E_TARGET=docker-server` | "Swagger UI (OpenAPI)" and the archived `openapi.json` |
| Trivy (image CVEs, HIGH and CRITICAL)  | `dp-ci-release-step1-e2e-prerelease` (`docker-server`, `windows-vm-docker`, `windows-vm-server`) and `dp-ci-release-step2-release-docker` | "Trivy" warnings table of the newest build; the same table is in that build's own log |
| Javadoc | `dp-ci-dev-quality-report` | "Javadoc" |
| Compodoc | `dp-ci-dev-quality-report` | "Compodoc" |
| ESLint (Angular, AI Hub) | `dp-ci-dev-quality-report` | "ESLint Angular", "ESLint AI Hub" |
| Prettier (Angular, AI Hub) | `dp-ci-dev-quality-report` | "Prettier Angular", "Prettier AI Hub" tables; the full file list is in the console and `QUALITY_RESULT` (`unformatted-<app>=N`) |
| SpotBugs + find-sec-bugs | `dp-ci-dev-quality-report` | "SpotBugs" |
| Spotless | `dp-ci-dev-quality-report` | "Spotless" (table per Java file; the raw output is an archived artifact) |
| PMD complexity, CPD | `dp-ci-dev-quality-report` | "PMD complexity", "Duplicated code" |
| ESLint complexity (Angular, AI Hub) | `dp-ci-dev-quality-report` | "Complexity Angular", "Complexity AI Hub" |
| Dependabot, CodeQL | GitHub, not Jenkins | see "GitHub: Dependabot and CodeQL" |

`dp-ci-dev-quality-report` ends its console log with a `QUALITY_RESULT` line: how many tools ran, which ended with a non-zero code (`<tool>=rcN`) and some counts.

### First-run checklist for the owner

1. The one-time Jenkins steps below, in order: install the plugins, relax the CSP, restart Jenkins, run `seed` (and approve the new `seed.groovy`).
2. Run **`dp-ci-dev-junit`** first: JaCoCo and Error Prone change the Java compile, so this is where a mistake shows first. If the compile breaks, remove the block marked "Error Prone + NullAway" in the poms.
3. Run **`dp-ci-dev-quality-report`**, then **`dp-ci-release-step1-e2e-prerelease`** (Playwright; with `E2E_TARGET=docker-server` it builds first, so it also shows Trivy and the OpenAPI page).
4. Open each table above once. An empty table next to a fine console log means the parser does not fit that tool's output: the raw output is archived or in the console, tell an agent which.

### The least certain changes (never run)

- **Error Prone + NullAway**: touches every Java compile (Linux and the Windows package build); the `-J` flags, the forked javac of the server and the Maven-console parser are all unproven.
- **The Spotless converter** (`spotless-to-checkstyle.py`): written from the documented message format, tried only on a hand-written sample.
- **The AI Hub ESLint flat configs** (lint, Prettier, complexity) and the checkstyle formatter installed in the CI scratch copy; also the `sonarjs` plugin version in each app.
- **Trivy**: the install in the CI image and the Warnings Next Generation `trivy` parser fit the JSON.
- **The Robot pull**: `dp-ci.sh win release` copies the UAT results to the host and step 3 shows them; the first rehearsal (16.6.0, 2026-10-25) brought them down cut short by the stall guard, and the failure report now reads such a file test by test; a complete pull on Jenkins is still unproven.
- **The PMD plugin version** (3.26.0, PMD 7) and the rule names, and the CPD parser.
- **OpenAPI / Swagger UI**: `/v3/api-docs` may need a login on the secured backend; the page needs the CSP relaxation, and the Playwright trace viewer may not open from Jenkins.

## One-time steps for the owner (Jenkins side of the quality plan)

The quality plan only writes files in the repository. These steps change the running Jenkins and are done by the owner, once, in this order,
at a moment when no build is running or queued:

1. **Install the plugins** listed at the end of `plugins.txt`: Manage Jenkins -> Plugins -> Available -> `htmlpublisher` (HTML Publisher), `coverage` (Coverage),
   `warnings-ng` (Warnings Next Generation), `robot` (Robot Framework). (By command line instead:
   `docker cp asbl/ci/jenkins/plugins.txt ints-jenkins:/tmp/plugins.txt && docker exec ints-jenkins jenkins-plugin-cli --plugin-file /tmp/plugins.txt --plugin-download-directory /var/jenkins_home/plugins`.)
2. **Let Jenkins show JavaScript in published HTML reports.** By default Jenkins serves workspace and published HTML with a strict Content-Security-Policy that blocks scripts, which breaks
   the Playwright report, the Javadoc and Compodoc sites and Swagger UI. Decision (an agent's design, the owner may change it): relax the policy for the whole Jenkins, because it sits behind Authelia and
   every report is produced by our own CI. In `/var/kraft-internalsystems/apps/program-files/custom-jenkins/docker-compose.yml` add to the Jenkins `JAVA_OPTS` (or create it under `environment`):
   `-Dhudson.model.DirectoryBrowserSupport.CSP="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; worker-src 'self' blob:"`.
   Instead of this, the reports could be served as static files by nginx behind Authelia; that is more work and not needed to start. Not verified: the Playwright *trace viewer* may still not open from a Jenkins-served
   report, because it needs a service worker; the report itself, the screenshots and the error text do.
3. **Restart Jenkins** (this applies steps 1 and 2): `docker compose up -d --force-recreate` in the folder of that compose file, or Manage Jenkins -> Restart safely.
4. **Run `seed`** (see "The seed job"; it creates `dp-ci-dev-quality-report` with the other jobs), and approve the new `seed.groovy` in In-process Script Approval.

## GitHub: Dependabot and CodeQL

Two tools of the quality plan run on GitHub, not in Jenkins; their files are in the repository and their results are read on GitHub:

| Tool | File | Where to look |
|---|---|---|
| Dependabot (weekly update pull requests: Maven, the Angular app, the AI Hub app, the CI image, GitHub Actions) | `.github/dependabot.yml` | https://github.com/flowkraft/datapallas/network/updates and the pull requests labelled `dependencies` |
| CodeQL (Java and TypeScript/JavaScript code scanning, on push to `main`, on pull requests and weekly) | `.github/workflows/codeql.yml` | https://github.com/flowkraft/datapallas/security/code-scanning |

Both are report only: nothing here gates a merge or a Jenkins build.

## Setting it up

1. **Job DSL plugin** installed (done 2026-10-03).
2. **Service user and API token**: user `ci-agent`; its token is in the root-only file `/root/jenkins-ci.env`
   on the host (done).
3. **SSH key for Jenkins**: generated into the Jenkins home, public half added to the host's
   `authorized_keys` (done 2026-10-03).
4. **Seed job** (see "The seed job" below): the only job made by hand. Freestyle, named `seed`, source = this repository, branch `main`,
   one build step "Process Job DSLs" with `asbl/ci/jenkins/seed.groovy`. Run it after any change to the jobs.
5. **Executors**: one on the built-in node, so only one build runs at a time.

## Which build an e2e tests

The e2e does not run the tree as it is: its testground is a copy of the package `asbl/target/package/verified-db-noexe`
(the AI Hub apps, `db-template`, config, scripts); only the Java jars and the Angular UI are rebuilt from source on every
run. A package from an older commit therefore tests old code under a new commit's name (found 2026-10-03: a 22 Sep package
on the Windows VM was still sending `LIMIT 500` to SQL Server). So the package carries a stamp,
`asbl/target/package/.built-from`, with the commit it was built from, and both lanes rebuild it before the tests unless the
stamp is exactly the commit under test (a tree with uncommitted changes always rebuilds). That holds for every normal run
and for both executions of a release; the image is checked the same way, by its tag `<version>-<commit>`:

| Lane | Rebuild step | Log line |
|---|---|---|
| Linux (`dp-ci.sh e2e`) | `prepare_package`: `mvn clean install -pl asbl -am -DskipTests` + `AssemblerTest#prepareForE2E` (= `pack-prepare-for-e2e.bat`, no JUnit, no image) | `package: built from ...` |
| Windows VM (`dp-ci.sh win e2e`) | `win_prepare_package`: runs `asbl\pack-prepare-for-e2e.bat` unchanged on the desktop | `WIN_E2E_PACKAGE=current/stale/built` |

`dp-ci.sh build` writes the same stamp after it assembles, so an e2e straight after a build does not rebuild again.

The one exception is a re-run between the two executions (`asbl/ci/release-rerun.sh`, which sets `E2E_REUSE_BUILD`). It
takes the build already there, an earlier commit's package or image, only when `asbl/ci/reuse-or-rebuild.sh` finds that
nothing the build ships changed between the two commits. Never shipped: `frend/reporting/e2e/`, `asbl/ci/` (but its
`Dockerfile` and `npm-script-shell.sh`), `asbl/src/uat/`, `*/src/test/` (but `asbl/src/test/` and the test files the
assemblers copy), `.docs/`. Anything else, or a dirty tree, stops the re-run, which builds nothing: `REBUILD=yes` first.
The log says it: `package: built from <X>, reused for <Y> (E2E_REUSE_BUILD)`, `REUSE_BUILD ...`.

## Rules

- **No secrets in the repository** (it is public): keys, tokens and passwords stay on the server.
- **One codebase, no OS guards.** A step that exists as a `.bat` gets a `.sh` twin next to it.
- **API access** only through the dedicated service user, never a person's account.
- **Jenkins does not check out its own copy**: the jobs run the host's checkout. `junit`, `quality`, `dev --live` and
  `build` run on it as it is; `e2e`, `e2e-loop` and `build-if-needed` first fast-forward it to `origin/main` (to `RELEASE_PIN` when the orchestrator
  pins one), and so do the release jobs (`dev --pinned` uses a clone of its own).

## What an agent does

For a long step or a gate it starts the same job (or `dp-ci.sh`), reads the same log, fixes the cause when it
fails and runs it again. The owner reads the same console in Jenkins.

## Job renames and removals (2026-10-08)

`dp-ci-build` is now `dp-ci-package`; `dp-ci-attach` is gone; `dp-ci-e2e-dev` is new. The seed job creates and updates jobs but never deletes one (`removedJobAction` IGNORE), so the old jobs `datapallas/dp-ci-build` and `datapallas/dp-ci-attach` stay in Jenkins until someone deletes them there; neither had a build history worth keeping.

## Job renames (2026-10-11)

The two e2e jobs are named for what they prove: `dp-ci-e2e` is now `dp-ci-e2e-release` and `dp-ci-e2e-dev` is now `dp-ci-e2e-loop`; `dp-ci.sh e2e-dev` is now `dp-ci.sh e2e-loop`; `E2E_PACKAGE` `reuse` and `content` are now `package-reuse-as-is` and `package-repackage`, and `package-rsync-simple-file-changes` is new. The old names are refused with the new one, and the old jobs were deleted in Jenkins after `seed` had created the new ones (their build history went with them).

## Job renames and removals (2026-10-22)

The jobs a release runs in order carry their step in their name, and each builds what it needs itself: `dp-ci-e2e-release` is now `dp-ci-release-step1-e2e-prerelease`, and `dp-ci-release-step2-pack-and-uat` (`dp-ci.sh win release`) is new. `dp-ci-package` is gone: step 1 and the new `dp-ci-release-demos` run `dp-ci.sh build-if-needed`, and `dp-ci.sh build` still runs by hand. The seed job leaves the two old jobs in Jenkins with their build history (`removedJobAction` IGNORE) until they are deleted there by hand.

## Job renames and removals (2026-10-22, later)

The release has four steps: Docker is built once on Linux by its own job, and nothing goes public before the last one. `dp-ci-release-step2-pack-and-uat` is now `dp-ci-release-step3-pack-and-uat-windows` (the Windows files only: the pack, the Robot UAT, the zips staged from this host); `dp-ci-release-step2-pack-and-uat-docker` (the Docker release) and `dp-ci-release-step4-publish` (the publish) are new. `dp-ci-release-demos` installs the published release on demo.datapallas.com instead of building it. The seed job leaves the old job in Jenkins with its build history until it is deleted there by hand.

## Job renames and removals (2026-10-22, run D)

Each channel is released by one job with two modes: `dp-ci-release-step2-pack-and-uat-docker` is now `dp-ci-release-step2-release-docker` and `dp-ci-release-step3-pack-and-uat-windows` is now `dp-ci-release-step3-release-windows-vm`, each with `MODE=rehearsal` (what they did before, staged in `rehearsal/` instead of `candidate/`) and `MODE=public` (what `dp-ci-release-step4-publish` did, per channel). `dp-ci-release-step4-publish` and `release-publish.sh promote` are gone. The release records are renamed (`step2.docker` and `step2.docker-stage` are `rehearsal.docker` and `rehearsal.docker-stage`, `step3.windows` is `rehearsal.windows`, `step4.publish` is `public.docker` and `public.windows`); none had been recorded for real. The three old jobs were never created in Jenkins (the seed of `c3d1c29c` was not applied).

New: `dp-ci-release-step0-set-version`, step 0 of a release, sets the version (before, the owner ran `asbl/ci/set-version.sh` and committed by hand). `NOTHING TO RELEASE` and the version gate's refusals now name it. Steps 0, 2 and 3 label their builds (`release-label.sh`).

## Job renames and removals (2026-10-22, the CI explains itself)

The name says the moment: `dp-ci-dev-...` any time while developing, `dp-ci-release-stepN-...` a release, in that order. `dp-ci-dev-live` is now `dp-ci-dev-server`, `dp-ci-e2e-loop` is now `dp-ci-dev-e2e-one-spec`, `dp-ci-junit` is now `dp-ci-dev-junit`, `dp-ci-quality` is now `dp-ci-dev-quality-report`. `dp-ci-release-demos` is now two jobs: `dp-ci-dev-demo-preview-bkstg` (dp-demo.bkstg) and `dp-ci-release-step4-demo-public` (demo.datapallas.com, step 4 of a release); `DEMO=both` is gone. The `dp-ci.sh` subcommands keep their names. Every job's description in Jenkins now has the same blocks (what, when, order, needs, time, examples, log, more). `seed` never deletes a job: once it had created the new ones, the six old jobs still in Jenkins (`dp-ci-dev-live`, `dp-ci-e2e-loop`, `dp-ci-junit`, `dp-ci-quality`, and `dp-ci-e2e-release` and `dp-ci-package` of the first renames that day) were deleted there by hand on 2026-10-22, each archived first with its build history (`/var/kraft-internalsystems/logs/datapallas-ci/deleted-jenkins-jobs/`). `dp-ci-release-demos` and the other names of `c3d1c29c` were never created (its seed was not applied).

## Job removals (2026-10-22, dp-demo.bkstg retired)

`dp-ci-dev-demo-preview-bkstg`, `dp-ci.sh publish-demo-bkstg` and the preview site dp-demo.bkstg are gone: dp-dev.bkstg (`dp-ci-dev-server`) shows the code under development, and the dev website dp-www-dev.bkstg shows its demos from it. `release-demos.sh` installs demo.datapallas.com only (step 4, unchanged). `dp-ci.sh publish-demo-datapallas.com` needs its TAG now (its default was the image dp-demo.bkstg ran). The Rundeck jobs `ops/change/demo-publish` and `dev/datapallas` are gone too: DataPallas jobs are Jenkins jobs only, and Kate's dev site is `dp-ci-dev-server` with `TARGET=dp-kate.bkstg.flowkraft.com`. The old job was deleted in Jenkins by hand after `seed` ran; its folder is archived in `logs/datapallas-ci/deleted-jenkins-jobs/`.

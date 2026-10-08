# Jenkins for DataPallas

Jenkins is a **window onto the scripts we already run**, not a second way of building. Every job starts the same
plain script from `asbl/ci/` that is run by hand (today `dp-ci.sh`), on the server, in the same CI container, and
shows its log. Nothing is installed on the host and no Jenkins agent is needed.

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

- **Same scripts, same container.** `dp-ci.sh` is unchanged. A job only sets its environment variables
  (`E2E_SPEC`, `E2E_GREP`, `JUNIT_MODULE`, ...) and calls it, exactly as one does by hand on the host.
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

All live in the folder `datapallas`, and are created by `seed.groovy`.

| Job | Runs | Parameters |
|---|---|---|
| `dp-ci-package` | `dp-ci.sh build`: compile (no unit tests), the distribution packages, the Docker image, the Trivy scan; about 14 min. Needed before a `docker-server` run of `dp-ci-e2e` and before publishing a demo | none |
| `dp-ci-junit` | `dp-ci.sh junit`: the JUnit gate; no package, no e2e | `JUNIT_MODULE`, `JUNIT_TEST` |
| `dp-ci-quality` | `dp-ci.sh quality`: compiles the Java modules, installs the npm dependencies, runs the quality tools; no package, no tests, never gating | none |
| `dp-ci-e2e-dev` | `dp-ci.sh e2e-dev`: the **development** e2e. One spec file, never rebuilds the package; not a release check | `E2E_SPEC` (required), `E2E_GREP`, `E2E_TARGET` (`web` or `electron-linux`), `E2E_PACKAGE` (`reuse` = run on the package that is there, for a fix to specs, helpers, Java, the Angular UI or web components; `content` = package the content again on the built jars first, minutes, for a fix under db-template, config, samples or scripts). The log has the line `E2E_PACKAGE mode=... built_from=... commit_under_test=...` |
| `dp-ci-e2e` | `dp-ci.sh e2e`, or `dp-ci.sh win e2e` for `electron-windows-vm`: the **real** e2e, on a package built from this exact commit (rebuilt first when it is not: 26-40 min). Needed before a release | `E2E_SPEC` (one file, empty = the full suite), `E2E_TARGET` (`web`, `electron-linux`, `electron-windows-vm`, `docker-server`), `E2E_ROTATION_DATE` (empty = today; the day's database rotation, e.g. 2026-09-22 = sqlserver) |

To add a step: make it a script in `asbl/ci/` that launches a detached run and prints a `log:` line, add a
`<name>.Jenkinsfile` here (copy `dp-ci-package.Jenkinsfile`), add an entry to `seed.groovy`, push, run `seed`.

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
| `<job>.Jenkinsfile` | one per job: starts its script on the host over SSH |
| `win-e2e.sh` | launcher for the Windows VM e2e: starts `dp-ci.sh win e2e` as a detached host process (pid in `win-e2e.pid`), log `<ts>-win-e2e-<sha>.log`, ends with `PIPELINE_RESULT=`. The tests themselves run on the VM as a scheduled task; a reboot of the host kills only the driver (then `dp-ci.sh win poll e2e`). Before every run the VM's checkout is fast-forwarded to `origin/main` (`dp-ci.sh win sync`; stops on local changes), the commit tested is printed as `WIN_E2E_COMMIT`, and the VM's package is rebuilt with `asbl/pack-prepare-for-e2e.bat` unless it was built from that commit (`WIN_E2E_PACKAGE=`; `dp-ci.sh win prepare` does both without the tests) |
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

The Robot UAT (`asbl/src/uat/run-tests.bat`, results in `asbl/src/uat/results/`: `output.xml`, `log.html`, `report.html`) is not run by `dp-ci.sh win` yet (the lane's header lists it as W9).
The Jenkins side is ready: when a UAT step of the lane copies `results/` to the host as `<step log of the run, without .log>-robot` (like `-playwright-html` next to it),
`dp-ci-e2e` with `E2E_TARGET=electron-windows-vm` pulls it and shows it with the Robot Framework plugin. Until then nothing is shown and nothing fails.

## Quality reports (one place to look)

Every tool below is **non-gating**: it shows a report on the build page and never changes a build's result. Nothing in this section has been run yet (the plan only configured it);
the first-run checklist is at the end. Jenkins folder `datapallas`, each job's build page: https://jenkins.bkstg.flowkraft.com/job/datapallas/.

| Tool | Job | Where to click on the build page |
|---|---|---|
| JUnit (Surefire XML of every Java module) | `dp-ci-junit` | "Test Result" (counts, failed tests, trend) |
| JaCoCo coverage | `dp-ci-junit` | "Coverage" (percentages, trend); "JaCoCo common / reporting / server" (HTML with the source of each class) |
| Error Prone + NullAway (javac warnings) | `dp-ci-junit` | "Error Prone" warnings table |
| Playwright | `dp-ci-e2e` | "Test Result" (JUnit XML) and "Playwright report" (HTML: steps, screenshots, trace) |
| Robot Framework UAT (Windows lane) | `dp-ci-e2e` with `E2E_TARGET=electron-windows-vm` | "Robot Results" (nothing until a UAT step of the lane produces it) |
| springdoc OpenAPI + Swagger UI | `dp-ci-e2e` with `E2E_TARGET=docker-server` | "Swagger UI (OpenAPI)" and the archived `openapi.json` |
| Trivy (image CVEs, HIGH and CRITICAL)  | `dp-ci-package` | "Trivy" warnings table; the same table is in the console log |
| Javadoc | `dp-ci-quality` | "Javadoc" |
| Compodoc | `dp-ci-quality` | "Compodoc" |
| ESLint (Angular, AI Hub) | `dp-ci-quality` | "ESLint Angular", "ESLint AI Hub" |
| Prettier (Angular, AI Hub) | `dp-ci-quality` | "Prettier Angular", "Prettier AI Hub" tables; the full file list is in the console and `QUALITY_RESULT` (`unformatted-<app>=N`) |
| SpotBugs + find-sec-bugs | `dp-ci-quality` | "SpotBugs" |
| Spotless | `dp-ci-quality` | "Spotless" (table per Java file; the raw output is an archived artifact) |
| PMD complexity, CPD | `dp-ci-quality` | "PMD complexity", "Duplicated code" |
| ESLint complexity (Angular, AI Hub) | `dp-ci-quality` | "Complexity Angular", "Complexity AI Hub" |
| Dependabot, CodeQL | GitHub, not Jenkins | see "GitHub: Dependabot and CodeQL" |

`dp-ci-quality` ends its console log with a `QUALITY_RESULT` line: how many tools ran, which ended with a non-zero code (`<tool>=rcN`) and some counts.

### First-run checklist for the owner

1. The one-time Jenkins steps below, in order: install the plugins, relax the CSP, restart Jenkins, run `seed` (and approve the new `seed.groovy`).
2. Run **`dp-ci-junit`** first: JaCoCo and Error Prone change the Java compile, so this is where a mistake shows first. If the compile breaks, remove the block marked "Error Prone + NullAway" in the poms.
3. Run **`dp-ci-quality`**, then **`dp-ci-package`** (Trivy), then **`dp-ci-e2e`** (Playwright; for the OpenAPI page use `E2E_TARGET=docker-server`, after a build of the same commit).
4. Open each table above once. An empty table next to a fine console log means the parser does not fit that tool's output: the raw output is archived or in the console, tell an agent which.

### The least certain changes (never run)

- **Error Prone + NullAway**: touches every Java compile (Linux and the Windows package build); the `-J` flags, the forked javac of the server and the Maven-console parser are all unproven.
- **The Spotless converter** (`spotless-to-checkstyle.py`): written from the documented message format, tried only on a hand-written sample.
- **The AI Hub ESLint flat configs** (lint, Prettier, complexity) and the checkstyle formatter installed in the CI scratch copy; also the `sonarjs` plugin version in each app.
- **Trivy**: the install in the CI image and the Warnings Next Generation `trivy` parser fit the JSON.
- **The Robot pull**: no UAT step produces the report yet (W9); only the Jenkins side exists.
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
4. **Run `seed`** (see "The seed job") once the quality plan has added the job `dp-ci-quality` to `seed.groovy`, and approve the new `seed.groovy` in In-process Script Approval.

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

## An e2e always tests the commit it names

The e2e does not run the tree as it is: its testground is a copy of the package `asbl/target/package/verified-db-noexe`
(the AI Hub apps, `db-template`, config, scripts); only the Java jars and the Angular UI are rebuilt from source on every
run. A package from an older commit therefore tests old code under a new commit's name (found 2026-10-03: a 22 Sep package
on the Windows VM was still sending `LIMIT 500` to SQL Server). So the package carries a stamp,
`asbl/target/package/.built-from`, with the commit it was built from, and both lanes rebuild it before the tests unless the
stamp is exactly the commit under test (a tree with uncommitted changes always rebuilds):

| Lane | Rebuild step | Log line |
|---|---|---|
| Linux (`dp-ci.sh e2e`) | `prepare_package`: `mvn clean install -pl asbl -am -DskipTests` + `AssemblerTest#prepareForE2E` (= `pack-prepare-for-e2e.bat`, no JUnit, no image) | `package: built from ...` |
| Windows VM (`dp-ci.sh win e2e`) | `win_prepare_package`: runs `asbl\pack-prepare-for-e2e.bat` unchanged on the desktop | `WIN_E2E_PACKAGE=current/stale/built` |

`dp-ci.sh build` writes the same stamp after it assembles, so an e2e straight after a build does not rebuild again.

## Rules

- **No secrets in the repository** (it is public): keys, tokens and passwords stay on the server.
- **One codebase, no OS guards.** A step that exists as a `.bat` gets a `.sh` twin next to it.
- **API access** only through the dedicated service user, never a person's account.
- **The build runs on the working tree as it is**, like `dp-ci.sh` always did. Jenkins does not check out its
  own copy.

## What an agent does

For a long step or a gate it starts the same job (or `dp-ci.sh`), reads the same log, fixes the cause when it
fails and runs it again. The owner reads the same console in Jenkins.

## Job renames and removals (2026-10-08)

`dp-ci-build` is now `dp-ci-package`; `dp-ci-attach` is gone; `dp-ci-e2e-dev` is new. The seed job creates and updates jobs but never deletes one (`removedJobAction` IGNORE), so the old jobs `datapallas/dp-ci-build` and `datapallas/dp-ci-attach` stay in Jenkins until someone deletes them there; neither had a build history worth keeping.

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
| Jenkins container restarts | **keeps running** | its console stops and the build shows as aborted; start `dp-ci-attach` to follow the same run again |
| Someone presses Abort on the build | **keeps running** (only the following stops); stop it with `docker stop dp-ci` | aborted |
| The host reboots | lost: rerun it | aborted |

So the work cannot be lost by closing or restarting anything except the host. What a Jenkins restart takes
away is the live view of that build, and `dp-ci-attach` brings it back.

**Proof, once, and again after any change here.** Start the job `datapallas/persistence-test` (10 minutes, a
line every 5 seconds, from one process). Close the browser tab and the SSH session, then restart the Jenkins
container. Start `dp-ci-attach`: it must show the same process still printing, and the run must end with
`PIPELINE_RESULT=SUCCESS` and the same pid on every line. Until that has been done the guarantee is a design
intention.

## Jobs

All live in the folder `datapallas`, and are created by `seed.groovy`.

| Job | Runs | Parameters |
|---|---|---|
| `dp-ci-build` | `dp-ci.sh build` | none |
| `dp-ci-junit` | `dp-ci.sh junit` | `JUNIT_MODULE`, `JUNIT_TEST` |
| `dp-ci-e2e` | `dp-ci.sh e2e` | `E2E_SPEC`, `E2E_GREP`, `E2E_TARGET` (both filters empty = the full suite) |
| `dp-ci-attach` | follows the run going now, or shows how the last one ended; starts nothing | none |
| `persistence-test` | a detached container that prints a line every few seconds | `MINUTES`, `INTERVAL_SECONDS` |

To add a step: make it a script in `asbl/ci/` that launches a detached run and prints a `log:` line, add a
`<name>.Jenkinsfile` here (copy `dp-ci-build.Jenkinsfile`), add an entry to `seed.groovy`, push, run `seed`.

## Files in this folder

| File | What it is |
|---|---|
| `jenkins.md` | this document |
| `seed.groovy` | Job DSL: creates the folder and every job. The source of truth for the jobs |
| `<job>.Jenkinsfile` | one per job: starts its script on the host over SSH |
| `follow-ci.sh` | on the host: runs a launcher and follows its log until the run ends (`run`), or follows the current one (`attach`) |
| `persistence-test.sh` | launcher for the persistence test, in the way `dp-ci.sh` launches a run |
| `plugins.txt` | the one plugin needed beyond a standard install (`job-dsl`) |

Nothing is kept for Jenkins in the server folders: `apps/program-files/custom-jenkins` only holds the compose
file, and `apps/cvs/custom-jenkins/home` is Jenkins' live data (credentials included), never edited by hand.

## Setting it up

1. **Job DSL plugin** installed (done 2026-10-03).
2. **Service user and API token**: user `ci-agent`; its token is in the root-only file `/root/jenkins-ci.env`
   on the host (done).
3. **SSH key for Jenkins**: generated into the Jenkins home, public half added to the host's
   `authorized_keys` (done 2026-10-03).
4. **Seed job**: the only job made by hand. Freestyle, named `seed`, source = this repository, branch `main`,
   one build step "Process Job DSLs" with `asbl/ci/jenkins/seed.groovy`. Run it after any change to the jobs.
5. **Executors**: one on the built-in node, so only one build runs at a time.
6. **The persistence proof** above.

## Rules

- **No secrets in the repository** (it is public): keys, tokens and passwords stay on the server.
- **One codebase, no OS guards.** A step that exists as a `.bat` gets a `.sh` twin next to it.
- **API access** only through the dedicated service user, never a person's account.
- **The build runs on the working tree as it is**, like `dp-ci.sh` always did. Jenkins does not check out its
  own copy.

## What an agent does

For a long step or a gate it starts the same job (or `dp-ci.sh`), reads the same log, fixes the cause when it
fails and runs it again. The owner reads the same console in Jenkins.

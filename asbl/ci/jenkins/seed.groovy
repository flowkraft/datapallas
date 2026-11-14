// Job DSL: creates every Jenkins job of this project from the repository, so the Jenkins can be rebuilt and
// no job is made by clicking. Run by the one hand-made job `seed` (see jenkins.md, "The seed job").
//
// One job per step the owner starts on its own. Each job loads its Jenkinsfile from this repository, and the
// Jenkinsfile runs a plain script from asbl/ci on the host over SSH: the very scripts that are run by hand,
// in the very same CI container. No secrets in here: the repository is public.
//
// The texts below are what the owner and the agents read to use the jobs (Jenkins shows them as plain text, the line
// breaks kept, links not clickable): each job's description stands on its own, in the same blocks (describe, below).
// Keep them in step with the scripts; the longer guide is asbl/ci/jenkins/jenkins.md.

def repoUrl    = 'https://github.com/flowkraft/datapallas.git'
def repoBranch = '*/main'
def guideUrl   = 'https://github.com/flowkraft/datapallas/blob/main/asbl/ci/jenkins/jenkins.md'

// The map of the folder. Jenkins lists the jobs alphabetically, which is this order: dev = any time while developing,
// release-stepN = a release, in that order.
folder('datapallas') {
  description('DataPallas CI. Each job runs a plain script of the repository (asbl/ci) on the CI host, the same command as by hand. The jobs are defined in asbl/ci/jenkins/seed.groovy: change them there, not here. The guide: ' + guideUrl +
    '\n\nWhich job, and when (each job\'s own description says how, with examples):' +
    '\n  dp-ci-release-steps-0-3-rehearsal: a release in one press: steps 0 to 3 as a rehearsal, a fix round after a red run, until ready to upload (the upload stays a separate press)' +
    '\n  dp-ci-dev-junit: after a Java change: one test class or method, or all' +
    '\n  dp-ci-dev-quality-report: any time: lint, bug finder, format, complexity; never blocks anything' +
    '\n  dp-ci-dev-server: to look at a change in a browser: start, restart or stop a dev server: dp-dev (live or pinned) or dp-kate' +
    '\n  dp-ci-e2e-nightly-or-by-hand: the e2e of main. By hand, any time: after a fix, one spec file or some of its tests, or a quarter of the full set, on any target, dev or production-packaged. By itself every night while NIGHTLY_ON is ticked (Configure): one quarter a night on a packaged lane, production-packaged. Never counts for a release' +
    '\n  dp-ci-release-step0-set-version: a release starts here: the new version committed (left as it is: nothing done)' +
    '\n  dp-ci-release-step1-e2e-prerelease: the e2e: the trunk\'s check, and a release\'s two lanes, both on this host (the full set on one side, web or docker-server, alternating per release; the sign-in file)' +
    '\n  dp-ci-release-step2-release-docker: the Docker release: the day before MODE=rehearsal UPLOAD=no (build, prove, keep), release day MODE=upload then MODE=public' +
    '\n  dp-ci-release-step3-release-windows-vm: the Windows release: the same modes (pack and keep, the server light set on the pack\'s server zip, the electron light set, the Robot UAT)' +
    '\n  dp-ci-release-step4-demo-public: after step 2\'s MODE=public: demo.datapallas.com installs the release' +
    '\n\nA release = step 0, then step 1\'s lanes (without them, steps 2 and 3 go on only on the owner\'s written decision: E2E_APPROVAL), then, the day before: steps 2 and 3 with MODE=rehearsal UPLOAD=no, each one channel and needing only step 1 (the one-press job runs them together, their parts on the Windows VM one at a time; pressed as jobs, one after the other in either order): everything built, proven and kept in /var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit>/ (the four zips, MANIFEST.txt with their sha256 and the image id, a failure report per channel; the image stays tagged on the host), nothing uploaded, no credential read. Release day: steps 2 and 3 with MODE=upload UPLOAD=yes upload those very files (no rebuild; a file whose sha256 differs from the manifest is refused, named), then MODE=public on each, one after the other; then step 4.' +
    '\n\nWhich proof covers which file a user gets: the Docker image and datapallas-server-docker.zip are built once on Linux by step 2 and proven by step 2 itself (the light set on Linux, and on the Windows VM in Docker Desktop, on that very build) before step 2 uploads them; datapallas.zip, datapallas-server.zip and datapallas-src.zip are packed on the Windows VM by step 3 and proven there by step 3 itself (the server light set on the pack\'s datapallas-server.zip, the electron light set: the app built from the repository, never the packed exe; then the Robot UAT on the pack\'s zips) before the VM uploads them. Each upload waits for step 1 and for its own step\'s parts, never for the other channel. Step 1 proves the code, on this host: the full set on its side and the sign-in file.')
}

// A job's description: the same blocks for every job, so a reader finds each fact in the same place. A block given as a
// list is shown one item per line.
def describe = { Map b ->
  ['WHAT', 'WHEN', 'ORDER', 'NEEDS', 'TIME', 'EXAMPLES', 'LOG', 'MORE'].collect { k ->
    def v = b[k]
    assert v : "describe: the block ${k} is missing"
    k + ': ' + (v instanceof List ? '\n  ' + v.join('\n  ') : v)
  }.join('\n\n')
}
def guide = { String job, String runs ->
  "asbl/ci/jenkins/jenkins.md, the section ${job} (${guideUrl}). It runs ${runs} on the CI host: the same command runs by hand there."
}
// What every job that runs dp-ci.sh on this host checks first (dp-ci.sh prereq docker), and its one-run-at-a-time rule.
def needsDocker = 'checked first, within seconds: this host\'s Docker engine (dp-ci.sh prereq docker; missing: MISSING a running Docker engine on this host: start it ..., then PREREQUISITES MISSING, nothing started). One dp-ci run at a time: while another runs, it stops at once (a dp-ci container already exists).'

// How to read a Playwright run's log, the same for both e2e jobs. The lines are dp-ci.sh's and Playwright's: keep this in step with them.
def playwrightLog = 'Playwright. Search the whole log with a regular expression, not only its end: a run waiting for a database (DB2) fills the end with thousands of "attempting JDBC connection" lines while its results sit further up. Every finished test attempt prints one line: ✓  394 specs/features/reporting.spec.ts:810:31 › <title> (2.2m) passed, ✘ failed, - skipped, (retry #1) a second try of the same test; the number after the mark counts the attempts finished so far. On Windows (windows-vm-electron) the same line reads ok 394 specs\\features\\reporting.spec.ts:810:31 > <title>: ok for ✓, x for ✘, backslashes in the path, > for ›; the patterns below match both.' +
  '\n  How many tests and how far: Running [0-9]+ tests, then the newest (✓|ok|✘|x|-) +[0-9]+ specs[/\\\\].' +
  '\n  Running tally, counting the matches: (✓|ok) +[0-9]+ specs[/\\\\] passed, (✘|x) +[0-9]+ specs[/\\\\] failed,  - +[0-9]+ specs[/\\\\] skipped.' +
  '\n  Which failed, and the retries: (✘|x) +[0-9]+ specs[/\\\\] and retry #[0-9]+ (a pass on a retry = flaky, a fail on a retry = really red). One test: its file and line, for example reporting\\.spec\\.ts:390, with 20 lines of context. Waiting for a database: attempting JDBC.' +
  '\n  The official end result, once the run has finished: E2E_RESULT|\\] (stdout: +)?[0-9]+ (passed|failed|flaky|skipped|did not run).' +
  '\n  Counts during the run are attempts, not tests, and provisional: a test that failed and then passed on its retry shows once in each count. The official totals are Playwright\'s summary line (361 passed, 16 failed, 1 flaky), the E2E_RESULT line and the JSON report, written when the run ends.'

// E2E_APPROVAL, the same parameter on both release jobs (steps 2 and 3). asbl/ci/release-state.sh reads it, with the user who
// started the build (the Jenkinsfiles pass both): keep this in step with that script's header.
def e2eApproval = 'THE OWNER\'S WRITTEN DECISION to release without step 1\'s two lanes (the full set on this release\'s side and the sign-in file) counting for the commit being released (the owner only). Empty (the default) = the normal check: the two lanes count for that commit (green on it, carried from an earlier commit when only never-shipped files changed, or a red lane completed by re-runs), else REFUSED within seconds, naming the lanes.\nWith the words owner approved in the text (any case) = that check is not made: the run goes on whatever the release record holds. Nothing else changes: the version gate, the prerequisites, the pushed digest and sha256 checks, and never copying what did not pass a rehearsal stay as they are. It covers every step-1 check of this build.\nWritten down, never silent: lines starting E2E_APPROVAL in the log (ACCEPTED, the Jenkins user who started this build, the UTC time, the whole text, and each of the two lanes: PASS or FAIL on this commit, else the newest result on another commit, else missing), and the entry approval.step1 on the commit in the release record (bash asbl/ci/release-state.sh show). DRY_RUN=yes prints it and records nothing. It counts for this build only and never turns a lane green: the next build without it is refused again.\nAny other text = refused as when empty, and the log shows the text (E2E_APPROVAL NOT ACCEPTED), so a mistyped approval is seen.\nUse it: only when the owner decides to release on other evidence than the two lanes; write what the decision rests on.\nExample:\n  owner approved: 16.7.0 on step 1 of 1a2b3c4d, before the fix in ServicesManager.java'

// UPLOAD, the same parameter on both release jobs (steps 2 and 3). Every upload reads it (asbl/ci/release-publish.sh, the
// Windows VM's upload in dp-ci.sh win release): keep this in step with that script's header.
def uploadSwitch = 'WHETHER this run writes to Docker Hub and the bucket (the owner only says yes). no (default) = all the work and every proof, then nothing uploaded: for each upload it skips, the exact command and where its output would go (UPLOAD=no  would run: ... in the log), no credential read; the release record says upload=no, and MODE=public never copies such a run.\nyes = the uploads run, at the end, after every proof is green: Docker :<version> and its zip, or the three Windows zips, to rehearsal/<version>-<commit>/, each checked; MODE=public needs it (refused with no: the copy writes the public places and :latest).\nUse no to rehearse the whole release with nothing written; yes when the owner approves the upload.\nExample:\n  rehearse 16.6.0 and upload it: MODE=rehearsal  UPLOAD=yes'

// RELEASE_VERSION's pre-filled value (job dp-ci-release-step0-set-version): the current release, the higher of the two
// channels' released versions, read now, while seed generates the jobs, from the public places the version gate reads
// (asbl/ci/release-state.sh released; no credentials): the x.y.z tag that Docker Hub's :latest has, and the version line of
// newest/windows-version.txt (until the first Windows MODE=public writes it: WINDOWS_RELEASED_BY_HAND in release-state.sh).
// Docker Hub not answering: <version> in settings.xml on origin/main. A parameter's default is fixed when seed runs, so a
// MODE=public that went through queues seed again, and the field shows the new release.
def dockerHubTags = 'https://hub.docker.com/v2/repositories/flowkraft/datapallas-server/tags'
def downloadBase  = 'https://downloads.datapallas.com/file/datapallas'
def rawMain       = 'https://raw.githubusercontent.com/flowkraft/datapallas/main'
def fetch = { String url ->
  def c = new URL(url).openConnection()
  c.connectTimeout = 15000
  c.readTimeout = 30000
  c.inputStream.withCloseable { it.getText('UTF-8') }
}
def isXyz = { v -> v instanceof String && v ==~ /\d+\.\d+\.\d+/ }
def vcmp = { String a, String b ->
  def x = a.tokenize('.')*.toInteger()
  def y = b.tokenize('.')*.toInteger()
  (0..2).collect { x[it] <=> y[it] }.find { it != 0 } ?: 0
}
def biggerVersions = { String v ->
  def x = v.tokenize('.')*.toInteger()
  "${x[0]}.${x[1]}.${x[2] + 1}, ${x[0]}.${x[1] + 1}.0, ${x[0] + 1}.0.0"
}
def releasedDocker = null, releasedWindows = null, windowsFrom = 'the download site did not answer'
try {
  def slurper = new groovy.json.JsonSlurper()
  def digest = slurper.parseText(fetch("${dockerHubTags}/latest")).digest
  def names = slurper.parseText(fetch("${dockerHubTags}/?page_size=100")).results.findAll { it.digest == digest && isXyz(it.name) }*.name
  if (digest && names) releasedDocker = names.max(vcmp)
} catch (e) {
  println "RELEASE_VERSION default: Docker Hub not read (${e})"
}
try {
  def line = fetch("${downloadBase}/newest/windows-version.txt?check=${System.currentTimeMillis()}").readLines().find { it.startsWith('version=') }
  windowsFrom = 'newest/windows-version.txt has no x.y.z version line'
  if (line && isXyz(line.substring(8))) { releasedWindows = line.substring(8); windowsFrom = 'newest/windows-version.txt' }
} catch (FileNotFoundException e) {
  windowsFrom = 'newest/windows-version.txt not written yet, and WINDOWS_RELEASED_BY_HAND not read from asbl/ci/release-state.sh on origin/main'
  try {
    def m = fetch("${rawMain}/asbl/ci/release-state.sh") =~ /(?m)^WINDOWS_RELEASED_BY_HAND=(\S+)/
    if (m.find() && isXyz(m.group(1))) { releasedWindows = m.group(1); windowsFrom = 'newest/windows-version.txt not written yet: the last release made by hand, WINDOWS_RELEASED_BY_HAND in asbl/ci/release-state.sh' }
  } catch (e2) {
    println "RELEASE_VERSION default: release-state.sh on origin/main not read (${e2})"
  }
} catch (e) {
  println "RELEASE_VERSION default: the download site not read (${e})"
}
def currentRelease = '', currentFrom = ''
if (releasedDocker) {
  currentRelease = [releasedDocker, releasedWindows].findAll { it }.max(vcmp)
  currentFrom = "Docker ${releasedDocker} (the version Docker Hub's :latest has), " +
    (releasedWindows ? "Windows ${releasedWindows} (${windowsFrom})" : "Windows not read (${windowsFrom})")
} else {
  try {
    def m = fetch("${rawMain}/bkend/reporting/src/main/external-resources/template/config/burst/settings.xml") =~ /<version>([^<]+)<\/version>/
    if (m.find() && isXyz(m.group(1))) {
      currentRelease = m.group(1)
      currentFrom = "Docker Hub did not answer, so this is <version> in settings.xml on origin/main, which may already be the next release"
    }
  } catch (e) {
    println "RELEASE_VERSION default: settings.xml on origin/main not read (${e})"
  }
}
def readAt = java.time.Instant.now().toString().substring(0, 16).replace('T', ' ')
def releaseVersionText = currentRelease ?
  "${currentRelease} is the current release: left as it is, this job does nothing. Fill a bigger release number whenever you want to push a new release (${biggerVersions(currentRelease)}).\nRead when the jobs were last generated (seed, ${readAt} UTC): ${currentFrom}. The job reads the released versions again when it runs, and changes nothing unless the number is bigger." :
  "The current release could not be read when the jobs were last generated (seed, ${readAt} UTC): left empty, this job prints the current release and does nothing. Fill a bigger release number (x.y.z) whenever you want to push a new release."
println "RELEASE_VERSION default: '${currentRelease}' (${currentFrom ?: 'nothing read'})"
// the release round's RELEASE_VERSION: empty by default (a press names the new version), the same facts as step 0's text
def roundVersionText = 'Always. The new version x.y.z: step 0 sets it, then step 1, then steps 2 and 3, in run 1. Empty only to rehearse the current version again, with no step 0.\n' +
  (currentRelease ?
    "${currentRelease} is the current release; the next possible ones: ${biggerVersions(currentRelease)}.\nRead when the jobs were last generated (seed, ${readAt} UTC): ${currentFrom}. The round refuses a version that is public on both channels already." :
    "The current release could not be read when the jobs were last generated (seed, ${readAt} UTC). The round refuses a version that is public on both channels already.")

// name -> [what it is, parameters]; the Jenkinsfile is asbl/ci/jenkins/<name>.Jenkinsfile. Add an entry to add a job.
// A parameter's text: the first line says what it is and its default, then when to change it, then examples.
// ON_FAILURES: the same three values, the same meaning, in the release round and dp-ci-e2e-nightly-or-by-hand; each job says what
// its red run is and what each fix value leads to there (more: a line of its own before the last one)
def fixValues = ['fix-prove-then-wait-for-review', 'fix-prove-then-rerun-automatically', 'report-only']
def onFailures = { String red, String review, String rerun, String more ->
  [choices: fixValues, text: "Sometimes. If ${red} is red: every failure is collected, its root cause found in the code and the git history, a plan with real fixes written, and each fix proven by re-running only the tests that failed. Then:\nfix-prove-then-wait-for-review (default) = ${review}\nfix-prove-then-rerun-automatically = ${rerun}\nreport-only = it ends red with the failure report. No agent.\n${more}Leave the default to review each fix round."]
}
def fixerNeed = 'for a fix round: the fixer, set on this host in the root-only settings file /root/release-rehearsal.conf (RELEASE_FIXER), as for the release round; without it, both fix values act as report-only and say so.'
// a fix waiting for review in dp-ci-e2e-nightly-or-by-hand (a night or a run by hand): what Proceed and Abort do
def reviewedFix = 'the fixes are made and proven in a scratch clone and nothing reaches main: the build pauses with Proceed, showing the fix report and its diff (also on the build page, reports/). Proceed = that diff committed and pushed to main as one commit; Abort = the fix dropped.'

// DRY_RUN, the same in every job that has it: no does the work, yes shows what it would do and changes nothing
def dryRun = { String does, String shows, String use ->
  [choices: ['no', 'yes'], text: 'no (default) = do it: ' + does + '.\nyes = ' + shows + '.\nUse yes ' + use + '.\nExample: DRY_RUN=yes']
}

// E2E_SPEC, E2E_GREP and E2E_TARGET, the same in dp-ci-e2e-nightly-or-by-hand and step 1: one meaning, the same values and examples; each job
// adds what it does with them (empty, use, and its own lines)
def e2eSpecText = { String empty, String use, String more, String moreExamples ->
  'WHICH FILE(S) to run: a regex on the spec file\'s path (the files are under frend/reporting/e2e/specs/); end it with $ to match one file only. ' + empty +
  '\nUse it: ' + use + '\n' + more +
  'Examples:\n  /areas/cube-stories\\.spec\\.ts$\n  /features/samples\\.spec\\.ts$\n  /areas/connections\\.spec\\.ts$\n  /features/explore-data-   -> every explore-data-*.spec.ts (several files: slower)' + moreExamples
}
def e2eGrepText = { String empty, String use ->
  'WHICH TESTS inside the chosen file(s): a regex on the test titles. ' + empty + '\nUse it: ' + use +
  '\nExamples:\n  Show Me   -> the tests whose title contains Show Me\n  refus|SQL vendor   -> the tests whose title contains either text (| means or)\n  \\[duckdb\\] Database Schema   -> + ( ) [ ] . ? * and | have a meaning in a regex: put a backslash before them to match them as written. Same for palette \\+ default config\nTip: copy a piece of the title from the failure line of the run log or from the Playwright report.\nCareful: in a serial file (cube-stories, dashboard-demos, auth-authorization-server) a test depends on the ones before it, so a filtered run can fail for that reason alone.'
}
def e2eTargets = ['web', 'electron-linux', 'docker-server', 'windows-vm-docker', 'windows-vm-server', 'windows-vm-electron']
def e2eTargetWhat = [
  'web': 'the server and the Angular UI built from this tree, in a browser: the everyday one.',
  'electron-linux': 'the desktop application on Linux, for the specs that only run there (for example let-me-update-migrate-configuration).',
  'docker-server': 'Linux: the shipped docker-server bundle (datapallas-server-docker.zip) and its Docker image.',
  'windows-vm-docker': 'that bundle installed in Docker Desktop on the Windows VM the way the self-host page says, tested in a browser on the VM.',
  'windows-vm-server': 'DataPallas Server without Docker (the Windows pack\'s datapallas-server.zip) on the VM\'s own Java 17, installed the way the installation page says (extract, startServer.bat, http://localhost:9090).',
  'windows-vm-electron': 'the desktop application on the Windows VM (slow).',
]
def e2eTargetText = { Map perTarget, String more ->
  'WHAT the tests run against.\n' + e2eTargets.collect { t -> t + (t == 'web' ? ' (default)' : '') + ' = ' + e2eTargetWhat[t] + (perTarget[t] ? ' ' + perTarget[t] : '') }.join('\n') + '\n' + more
}

def jobs = [
  'dp-ci-release-steps-0-3-rehearsal': [
    about: 'Set RELEASE_VERSION.\nChange ON_FAILURES only when you want something other than a review of each fix round.\nLeave the other three as they are.\n\n' + describe(
      WHAT: [
        'The release round (asbl/ci/jenkins/release-rehearsal.sh): one press takes RELEASE_VERSION to "ready to upload". Run 1: step 0 (the version committed), step 1\'s lanes, then steps 2 and 3 on one commit (asbl/ci/jenkins/release-orchestrator.sh), as a rehearsal: built, proven and kept, nothing uploaded.',
        'A red run: ON_FAILURES says what follows. A fix round: an agent (the fixer) finds each failure\'s root cause in the code and the git history, fixes it, and proves each fix by re-running only what failed; then the round runs again from scratch: step 0 never again, step 1 included (every lane), steps 2 and 3 from the very beginning.',
        'Green: both channels\' UPLOAD=yes preflights are checked (every credential, by name only): "ready to upload", with the next presses, and the flaky tests listed. The upload stays a separate press.',
        'The round runs on this host, detached: closing the browser or restarting Jenkins never stops it (the build resumes following it). An Abort pressed by a person stops the round, and what its runs started.',
      ],
      WHEN: 'a release: one press with RELEASE_VERSION, the day before the release day. RELEASE_VERSION empty: the current version rehearsed again, no step 0. DRY_RUN=yes: to check the job after a CI change.',
      ORDER: 'it runs steps 0 to 3 in one press (each step job stays, for a step alone). After it is green: dp-ci-release-step2-release-docker and dp-ci-release-step3-release-windows-vm with MODE=upload UPLOAD=yes, then MODE=public on each, then dp-ci-release-step4-demo-public. One round at a time.',
      NEEDS: [
        'checked first, within seconds (REFUSED: <why>. Nothing started):',
        'the CI free: no dp-ci run, no Windows run, no release run, no round going (bash asbl/ci/jenkins/release-rehearsal.sh busy says FREE); a night of dp-ci-e2e-nightly-or-by-hand is stopped first: a release goes before it;',
        'the version not public on both channels already; this host\'s Docker engine and the Windows VM (asbl/ci/release-publish.sh preflight docker, UPLOAD=no);',
        'for a fix round: the fixer, set on this host in the root-only settings file /root/release-rehearsal.conf (RELEASE_FIXER); without it, ON_FAILURES acts as report-only and the round says so;',
        'for "ready to upload" only, not to start: the upload credentials, checked by name (asbl/ci/release-publish.sh preflight docker public, preflight files public).',
        'for the Advanced values: the machines file\'s rules (asbl/ci/release-machines.sh check <N> <M>): the VMs exist and /var keeps 50 GB free after what the runners take there. Memory only warns: a choice that would leave less than RELEASE_MIN_FREE_GB (16) of the host\'s memory free, by the real peaks of the last rounds, still starts.',
      ],
      TIME: 'a run: about a day (16.6.1\'s execution 1 took about 19 h: step 1\'s lanes, then steps 2 and 3); a fix round: hours, at most 48 h (its own cap); the build follows the round in polls of under a minute.',
      EXAMPLES: [
        'release 16.6.2: RELEASE_VERSION=16.6.2 (the rest as they are)',
        'the same, and run again by itself after each fix round (twice at most, then it waits): RELEASE_VERSION=16.6.2  ON_FAILURES=fix-prove-then-rerun-automatically',
        'the failure report only, no agent: RELEASE_VERSION=16.6.2  ON_FAILURES=report-only',
        'check the job after a CI change, nothing run: RELEASE_VERSION=16.6.2  DRY_RUN=yes',
        'rehearse the current version again, no step 0: RELEASE_VERSION empty',
      ],
      LOG: '^ROUND (the round\'s own lines: STARTED, RUN n START and END, FIX ROUND n START and END, WAITING FOR REVIEW, GREEN, READY TO UPLOAD, RED, STOPPED), then each run\'s orchestrator console (PARTS, SUMMARY). The build list labels each build with where the round is (16.6.2 run 1 going, waiting for review after run 1, green, 1 run, ready to upload). Each ended run\'s reports are on the build page: the artifacts reports/run-<n>/ (result.txt, the summary, the failure reports, the flaky tests, report-paths.txt) and Test Result (Playwright); the Playwright HTML folders stay on the host (up to 18 GB each), named in report-paths.txt. The settings it ran with: round-settings.txt. From a shell: bash asbl/ci/jenkins/release-rehearsal.sh status (or follow, proceed, stop).',
      MORE: guide('dp-ci-release-steps-0-3-rehearsal', 'asbl/ci/jenkins/release-rehearsal.sh')
    ),
    // in the order the form shows them, each group under a separator line with its name
    params: [
      SEPARATOR_ALWAYS: [separator: 'Always'],
      RELEASE_VERSION: [default: '', text: roundVersionText],
      SEPARATOR_SOMETIMES: [separator: 'Sometimes'],
      ON_FAILURES: onFailures('the run',
        'the build pauses with Proceed, showing the fix plan, its report and the commits. Proceed = run again from scratch, step 1 included.',
        'the same fixes and proofs, then it runs again from scratch by itself, step 1 included. After 2 such re-runs it waits for Proceed.',
        'A fix round that ends BLOCKED always waits for a review.\n'),
      SEPARATOR_RARELY: [separator: 'Rarely: leave them as they are'],
      RELEASE_PIN: [default: '', text: 'Rarely: leave it empty. A commit (its hash) to rehearse that commit in run 1 instead of step 0\'s (or origin/main\'s). A run after fixes is always on origin/main, which holds the fixes.'],
      DRY_RUN: dryRun('the round runs', 'what the round would run: each run is the orchestrator\'s dry run, and the fixer and the preflights get DRY_RUN=yes (nothing builds, records, starts an agent or uploads)', 'rarely, to check the job after a CI change'),
      E2E_APPROVAL: [text: 'Rarely: leave it empty. Passed to every run of the round. ' + e2eApproval],
      SEPARATOR_ADVANCED: [separator: 'Advanced (Parallelization)'],
      SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS: [choices: ['1', '2', '3', '4'], text: 'Advanced. Step 1\'s full e2e set in this many runners at once, each a Docker engine of its own on this host (one engine runs one DataPallas e2e set at a time), each with its list of asbl/ci/full-set-runners.txt (by area, each spec file whole in one runner), all started when the build ends, while a runner of their own (the host lanes\' runner) runs the auth file, then step 2\'s Linux proof. The memory rule counts each runner and the host lanes\' runner at the most it really reached in the last rounds, RELEASE_SERVER_GB until a round recorded it; each runner takes what it needs, up to RELEASE_RUNNER_LIMIT_GB (24 GB). Each runner also takes /var disk (about 40 GB the first time: the images and caches copied in; a few GB in later rounds). The block below estimates the round\'s time and memory for the two values.\n1 (default) = the whole full set in one runner.\n2 to 4 = the full set shared out over that many runners.\nWith RELEASE_RUNNERS=no in the machines file (/root/release-rehearsal.conf) the full set runs whole on this host\'s engine, as before the runners (the fallback when a runner fails for its own reason): only 1 then; the press refuses more (exit 2, nothing started).'],
      USE_N_NUMBER_OF_WINDOWS_VMS: [choices: ['1', '2', '3', '4'], text: 'Advanced. The Windows lanes (the pack, the Windows Docker proof, the light sets, Robot) spread over this many VMs, each running its lanes of the machines file (/root/release-rehearsal.conf) at once with the others. The round starts each VM after the first, one at a time (a VM holds all its memory while it boots), and shuts it down after its last lane; each one takes what it needs of the host\'s memory, up to WIN_VM_MEMORY_GB (24 GB). The block below estimates the round\'s time and memory for the two values.\n1 (default) = VM a runs every Windows lane in a row.\nThe press refuses (exit 2, nothing started) more VMs than exist. A choice that would leave less than RELEASE_MIN_FREE_GB (16) of the host\'s memory free, by the real peaks of the last rounds, shows REFUSED by memory in the block below, and you can still press: the choice is yours.'],
      ESTIMATED_TIME_AND_MEMORY: [block: 'asbl/ci/jenkins/release-estimate-block.groovy', refs: ['SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS', 'USE_N_NUMBER_OF_WINDOWS_VMS'], fallback: 'The estimate could not be drawn here: bash asbl/ci/jenkins/release-rehearsal.sh estimate N M on the host', text: 'Redrawn when either choice above changes, nothing to fill in: the round\'s parts per machine, the total and the gain against 1 and 1, from the last release runs\' marks, and the memory the two values need against the host\'s available memory now. The same in a terminal: bash asbl/ci/jenkins/release-rehearsal.sh estimate <N> <M>; the build\'s first lines print it too.'],
      USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP: [choices: ['0', '32', '64', '128'], text: 'Advanced. 0 = off. Up to this many GB of idle memory can move into compressed swap in RAM when RAM runs short. Use it when the memory line above shows REFUSED. On at each run\'s start, off at its end or stop.'],
    ],
  ],
  'dp-ci-dev-junit': [
    about: describe(
      WHAT: 'The Java unit tests (dp-ci.sh junit) of the CI host\'s checkout as it is: one module and test pattern, or every test of the three modules when both are empty. No package, no e2e. The build page shows the test results, the JaCoCo coverage and the Error Prone warnings (reports only: they never change the result).',
      WHEN: 'after a Java change: the class or method you touched; everything (both empty) before you call wide Java changes done.',
      ORDER: 'any time.',
      NEEDS: needsDocker,
      TIME: 'one class: 1 to 4 min; everything: about 24 min (both measured).',
      EXAMPLES: [
        'one class: JUNIT_MODULE=bkend/server  JUNIT_TEST=ReportsServiceTest',
        'one method: JUNIT_MODULE=bkend/server  JUNIT_TEST=ReportsServiceTest#aFolderHoldingOnlyOneTemplateNeedsNoInference',
        'every Jasper test class of a module: JUNIT_MODULE=bkend/reporting  JUNIT_TEST=Jasper*Test',
        'everything: JUNIT_MODULE and JUNIT_TEST empty',
      ],
      LOG: 'the total of each module: TOTAL classes: ; the test classes with failures or errors: Tests run:.*(Failures: [1-9]|Errors: [1-9]) (with 5 lines of context); the verdict: PIPELINE_RESULT.',
      MORE: guide('dp-ci-dev-junit', 'asbl/ci/dp-ci.sh junit')
    ),
    params: [
      JUNIT_MODULE: [choices: ['', 'bkend/server', 'bkend/common', 'bkend/reporting'], text: 'WHICH MODULE: the Maven module whose tests run. Empty (the default) = all three modules; with JUNIT_TEST empty too, the full gate, about 24 min.\nUse it: nearly every time, the module of the code you changed.\nPair it with JUNIT_TEST below to run only the class you touched.'],
      JUNIT_TEST  : [text: 'WHICH TESTS inside the module: a Maven Surefire -Dtest pattern. Empty (the default) = every test of the module (slow).\nUse it: nearly every time, to run only the class or method you touched. With JUNIT_MODULE empty, the pattern runs in all three modules.\nExamples:\n  ReportsServiceTest   -> one test class (bkend/server)\n  ReportsServiceTest#aFolderHoldingOnlyOneTemplateNeedsNoInference   -> one test method of it\n  Jasper*Test   -> every class that starts with Jasper and ends with Test\n  FooTest,BarTest   -> two classes'],
    ],
  ],
  'dp-ci-dev-quality-report': [
    about: describe(
      WHAT: 'The quality tools (dp-ci.sh quality) on the CI host\'s checkout as it is: lint (ESLint), bug finder (SpotBugs with find-sec-bugs), format (Prettier, Spotless), complexity and duplicates (PMD, CPD, ESLint complexity) and the documentation sites (Javadoc, Compodoc). It compiles the Java modules without tests and installs the npm dependencies first. Each tool shows a report on the build page. Never gating: a tool that fails is recorded and the run goes on; nothing waits for this job and it never blocks anything.',
      WHEN: 'any time, to look at the code\'s quality.',
      ORDER: 'any time.',
      NEEDS: needsDocker,
      TIME: 'not measured yet: it has not run yet.',
      EXAMPLES: ['the report of the checkout: nothing to set (it has no parameters)'],
      LOG: 'what each tool reported: quality: ; the summary: QUALITY_RESULT tools=N ok=N failed=N <tool>=<ok|rcN> ...',
      MORE: guide('dp-ci-dev-quality-report', 'asbl/ci/dp-ci.sh quality')
    ),
    params: [:],
  ],
  'dp-ci-dev-server': [
    about: describe(
      WHAT: 'Starts, restarts or stops a dev web server (dp-ci.sh dev) and prints its URL. live: the CI host\'s checkout as it is saved right now, hot-reloading (Java in about 10 s, the UI at once), https://dp-dev-live.bkstg.flowkraft.com (https://dp-dev.bkstg.flowkraft.com is the same site). pinned: a separate clone parked at one commit (PINNED_SHA), no hot reload, https://dp-dev-pinned.bkstg.flowkraft.com. TARGET=dp-kate.bkstg.flowkraft.com: the same for Kate\'s own clone (agents-headquarter/office-kate/projects/src/products/reportburster), live only, https://dp-kate.bkstg.flowkraft.com. It keeps running after the build ends, until ACTION=stop; a build, JUnit or e2e run stops the live one for its length and starts it again afterwards. A second start prints "already running at <URL>" and starts nothing; restart starts it again (dp-ci.sh dev replaces the running container).',
      WHEN: 'to look at a change in a browser. It is for looking, never a proof: only the e2e jobs prove (dp-ci-e2e-nightly-or-by-hand, dp-ci-release-step1-e2e-prerelease), and no e2e runs against this server (an e2e cleans the testground it reads and starts its own).',
      ORDER: 'any time; it refuses to start while a dp-ci run holds the server.',
      NEEDS: 'checked first, within seconds, at a start: this host\'s Docker engine (dp-ci.sh prereq docker). live (either TARGET) also needs its checkout\'s Linux package (asbl/target/package/verified-db-noexe, which an e2e run builds when there is none): it is not checked, and without it the start fails after the backend build (cp ... ENOENT, server exited).',
      TIME: 'start or restart: about 3.5 min until the site answers (measured 3.2 to 3.7 min; pinned: longer the first time for a commit, which it assembles first, not measured yet); already running: seconds; stop: seconds.',
      EXAMPLES: [
        'see a saved change: ACTION=start',
        'a test session nothing can move: ACTION=start  DEV_MODE=pinned  PINNED_SHA=<a commit, e.g. c3d1c29c>',
        'start a running site again (a change it does not hot-reload): ACTION=restart',
        'Kate\'s site: TARGET=dp-kate.bkstg.flowkraft.com (with ACTION=start, restart or stop)',
        'free the machine: ACTION=stop (with DEV_MODE=pinned, or TARGET=dp-kate.bkstg.flowkraft.com, for those)',
      ],
      LOG: 'ready: <URL> (the site answers), already running at, restart:, stopped:, FAIL.',
      MORE: guide('dp-ci-dev-server', 'asbl/ci/dp-ci.sh dev --live, dev --pinned <sha>, or dev in Kate\'s clone')
    ),
    params: [
      TARGET    : [choices: ['dp-dev.bkstg.flowkraft.com', 'dp-kate.bkstg.flowkraft.com'], text: 'WHOSE dev site. dp-dev.bkstg.flowkraft.com (default): the CI host\'s main checkout (/var/kraft-internalsystems/projects/all-repos/src/products/reportburster), live or pinned (DEV_MODE).\ndp-kate.bkstg.flowkraft.com: the same for Kate\'s own clone (/var/kraft-internalsystems/projects/all-repos/coordination-project-files/agents-headquarter/office-kate/projects/src/products/reportburster), container datapallas-dev-kate; live only.'],
      ACTION    : [choices: ['start', 'restart', 'stop'], text: 'WHAT to do. start (default): bring the server up and print its URL; when it is already running, only print the URL.\nrestart: start it again, also when it runs (dp-ci.sh dev removes the running container first).\nstop: stop it (nothing to do when it is not running).'],
      DEV_MODE  : [choices: ['live', 'pinned'], text: 'WHICH dev site. live (default): the checkout as it is saved right now, hot-reloading (Java in about 10 s, the UI at once, an edited db-template file at once; a new sample or dataset needs dp-ci.sh dev --refresh-content, by hand).\npinned: a separate clone parked at the commit in PINNED_SHA, so nothing committed meanwhile changes it; it does not hot-reload; TARGET=dp-dev.bkstg.flowkraft.com only.\nUse pinned for a test session that must not move.'],
      PINNED_SHA: [text: 'The commit to park the pinned site at (a sha, e.g. c3d1c29c). Empty by default; needed for DEV_MODE=pinned with ACTION=start or restart, ignored otherwise.\nIt must be a commit this checkout has (made here, or pushed and pulled here). A pinned site that is already running stays at its commit on a start: restart it to pin another one.'],
    ],
  ],
  'dp-ci-e2e-nightly-or-by-hand': [
    about: 'The e2e of main, two ways in one job:\n' +
      '  BY HAND: Build with Parameters, any time, the nightly on or off. One spec file or some of its tests, or a quarter of the full set, on any target (E2E_TARGET), dev or production-packaged (E2E_MODE).\n' +
      '  THE NIGHTLY: by itself at 18:00 UTC while NIGHTLY_ON is ticked. Always production-packaged: the next pair (quarter, lane) of a 16-night rotation.\n' +
      'The nightly on or off: Configure, tick or untick NIGHTLY_ON, Save. Saved at once, nothing runs. Unticked, the 18:00 build only says "nightly off" (grey) and runs nothing; a press by hand still runs.\n' +
      'A red run (or night): ON_FAILURES. By default its fix waits for your Proceed on its build.\n\n' + describe(
      WHAT: [
        'BY HAND (asbl/ci/jenkins/e2e-by-hand.sh). WHAT_TO_RUN says what: spec-and-grep = the files of E2E_SPEC and the tests of E2E_GREP, no retries; full-set-quarter-1 to 4 = a quarter of the full set as the nightly takes it, retries 1. E2E_TARGET says where, E2E_MODE how:',
        '  web, electron-linux (dev only): the fix-and-retry loop (dp-ci.sh e2e-loop). The jars and the Angular UI are built from the tree on every run; the package (the content the tests start from: sample apps, db-template, config, samples, scripts) is never rebuilt: E2E_PACKAGE says what happens to it (built first only when there is none).',
        '  docker-server, windows-vm-docker, windows-vm-server, windows-vm-electron (either mode): the lane as the nightly runs it (asbl/ci/jenkins/packaged-lane.sh). production-packaged = the shipped DataPallas, started just like a user starts it; dev = the same lane, each test\'s clean state from the dev e2e package (windows-vm-electron: the app built from the VM\'s tree, no pack). The build a lane takes is reused when nothing it ships changed since, else built (the image and zips) or packed again (the Windows pack), on origin/main.',
        'THE NIGHTLY (asbl/ci/jenkins/scheduled-e2e.sh). Each night the next pair of a 16-night rotation: one quarter of the full set (its 4-job layout, asbl/ci/full-set-runners.txt) on one production-packaged lane: docker-server (Linux), windows-vm-docker, windows-vm-server (the pack\'s server zip) or windows-vm-electron (the pack\'s datapallas.zip, DataPallas.exe). Every pair runs once in 16 nights; four nights in a row take the four lanes and the four quarters. A server lane\'s night then runs auth-authorization-server alone; a desktop night runs let-me-update-migrate-configuration with its quarter. Retries 1, as the release. It builds only what changed, as above: a night after a CI- or test-only commit builds nothing.',
        '  The rotation moves by nights run: a skipped, dry, stopped or off night leaves its pair next. bash asbl/ci/jenkins/scheduled-e2e.sh plan lists the next 16 pairs. Each night, run or skipped, the Playwright HTML reports older than 14 days go (the top of the log folder only).',
        '  On or off: NIGHTLY_ON (Configure -> Save, seed keeps it). From a shell, without Jenkins: scheduled-e2e.sh off|on, a switch kept on this host (a timed night while it is off does nothing; its label says since when and by whom).',
        'Before either runs, the build puts the CI host\'s checkout on origin/main (a fast-forward), so the scripts and the tests are main as pushed; the nightly only while the CI is free (a release round\'s checkout is never moved).',
        'It never counts for a release: nothing in the release record.',
      ],
      WHEN: [
        'BY HAND: after a fix, the failed tests (E2E_GREP), then the whole file. On the shipped DataPallas, Linux Docker or the Windows VM: a packaged E2E_TARGET with E2E_MODE=production-packaged. A quarter of the full set: to look ahead on one lane, or after a fix that touches many files. To confirm a file for a release, on a package built from this exact commit: dp-ci-release-step1-e2e-prerelease (with E2E_SPEC, or E2E_GREP).',
        'Commit and push the fix first: the run tests origin/main, and stops on local changes to tracked files of the CI checkout.',
        'THE NIGHTLY: by itself. By hand: WHAT_TO_RUN=next-nightly-pair runs the next pair now; DRY_RUN=yes after a change to it.',
      ],
      ORDER: 'any time, the nightly on or off. One run at a time on the CI: while a dp-ci run, a Windows run or a night goes, a second one is refused within seconds and says why. A build paused for a review holds nothing: the next press runs. The nightly skips, green ("SKIPPED: <why>"), while the CI is busy: a dp-ci run, a Windows run, a release run, a release round open until its version is public, or the night before still going (its fix round included, with ON_FAILURES=fix-prove-then-rerun-automatically). A release press stops a night going: a release goes before it.',
      NEEDS: [needsDocker, 'a windows-vm-* target: the Windows VM (the lane checks it first);', fixerNeed],
      TIME: [
        'BY HAND, one file: about 4 min of setup, then the tests: one test about 5 min in all; over the last 40 runs a median of 16 min, from seconds up to 4.8 h for several big files at once (measured). package-repackage: about 3.5 min more; no package yet: about 30 min more.',
        'A quarter: about 2 h 10 to 2 h 40 on Linux (the 16.6.1 full set, 10 h 20 on docker-server, cut in four), about twice that on the Windows VM (capped at 16 h).',
        'A packaged lane\'s build, when one is needed: about 40 min; a pack: about 1 h 30. The Windows VM is about twice as slow as Linux.',
        'THE NIGHTLY: a quarter as above, plus the auth file (about 20 min) on a server lane\'s night. A fix round: hours, at most 48 h (its own cap).',
      ],
      EXAMPLES: [
        'one failed test after a fix: E2E_SPEC=/features/samples\\.spec\\.ts$  E2E_GREP=02_dashboard_demos',
        'a whole file: E2E_SPEC=/areas/cube-stories\\.spec\\.ts$',
        'after a fix to a db-template sample: E2E_SPEC=/features/samples\\.spec\\.ts$  E2E_PACKAGE=package-rsync-simple-file-changes',
        'a desktop-only spec: E2E_SPEC=/features/let-me-update-migrate-configuration\\.spec\\.ts$  E2E_TARGET=electron-linux',
        'one file on the shipped Docker bundle: E2E_SPEC=/features/samples\\.spec\\.ts$  E2E_TARGET=docker-server  E2E_MODE=production-packaged',
        'one file on the shipped desktop app on Windows: E2E_SPEC=/features/samples\\.spec\\.ts$  E2E_TARGET=windows-vm-electron  E2E_MODE=production-packaged',
        'a quarter of the full set on the Windows server zip: WHAT_TO_RUN=full-set-quarter-2  E2E_TARGET=windows-vm-server  E2E_MODE=production-packaged',
        'the failures only, no agent: E2E_SPEC=/areas/cube-stories\\.spec\\.ts$  ON_FAILURES=report-only',
        'the next nightly pair, now: WHAT_TO_RUN=next-nightly-pair',
        'the nightly off until further notice: Configure, untick NIGHTLY_ON, Save (nothing runs); on again: tick it, Save',
        'what a press would do, nothing run: the values as for the run, plus DRY_RUN=yes',
      ],
      LOG: playwrightLog +
        '\n  BY HAND: what it took: BY_HAND what=... target=... mode=...; which package it ran on (web, electron-linux): E2E_PACKAGE mode=... built_from=... commit_under_test=... files_copied=<n>; the verdict: BY_HAND_RESULT=green|red|dry-run ...; a red run\'s folder: BY_HAND_RUN_FOLDER=<folder> (its result.txt); a fix round\'s state: FIX_ROUND state=...; a wrong input: FAIL  <why> (nothing ran, exit 2). On the build page: Test Result, Playwright report (the HTML), and the artifacts reports/ (result.txt, fix-report.md, fix.diff).' +
        '\n  THE NIGHTLY: ^NIGHT (the night\'s own lines: the sets, SET n/N START and END, NIGHT END with the verdict, FIX ROUND 1 END), ^FIX_ROUND (a fix round\'s state: fixing, waiting, done, ended, no-fix, proceeded, aborted), ^BUILD (each build\'s answer: reuse or rebuild, and why), then each lane\'s console. The build list labels each build (2026-11-15 Sunday, pair 2/16: windows-vm-docker-part-2 PASS, windows-vm-docker-auth-authorization-server going; SKIPPED: <why>; nightly off). On the build page: the artifacts reports/ (the night\'s result.txt, run.log, flaky tests, the Playwright JSON) and Test Result; the HTML folders stay on the host. From a shell: bash asbl/ci/jenkins/scheduled-e2e.sh status (or plan, follow, stop; fix status|proceed|abort <the night\'s folder> <who> decides a waiting fix as the pause does).',
      MORE: guide('dp-ci-e2e-nightly-or-by-hand', 'asbl/ci/jenkins/e2e-by-hand.sh (by hand) or asbl/ci/jenkins/scheduled-e2e.sh (the nightly)')
    ),
    // the night starts at 18:00 UTC; a Windows quarter may take up to 16 h, so it ends before the next night. A timed
    // build runs the nightly only while NIGHTLY_ON (its default, set in Configure) is ticked
    cron: 'TZ=UTC\n0 18 * * *',
    params: [
      SEPARATOR_NIGHTLY: [separator: 'The nightly: on or off (set in Configure, then Save)'],
      // a new job starts with the nights off: the owner's choice on 2026-11-14
      NIGHTLY_ON: [tick: false, text: 'THE NIGHTLY ON OR OFF. Set it in Configure: tick or untick it, then Save. Saved at once, nothing runs; seed keeps it.\nTicked = every night at 18:00 UTC the nightly runs: the next pair of its rotation, production-packaged, with ON_FAILURES and DRY_RUN at their defaults (WHAT_TO_RUN, E2E_TARGET, E2E_MODE, E2E_SPEC, E2E_GREP and E2E_PACKAGE do not apply to it).\nUnticked = no nightly: the 18:00 build only says "nightly off (NIGHTLY_ON unticked in Configure)" and runs nothing (grey, not red).\nOn or off, a press by hand (Build with Parameters) always runs what you choose below: ticking or unticking this box on the Build with Parameters page changes nothing.'],
      SEPARATOR_BY_HAND: [separator: 'A run by hand: what, where, how'],
      WHAT_TO_RUN: [choices: ['spec-and-grep', 'full-set-quarter-1', 'full-set-quarter-2', 'full-set-quarter-3', 'full-set-quarter-4', 'next-nightly-pair'], text: 'WHAT RUNS.\nspec-and-grep (default) = the files of E2E_SPEC and the tests of E2E_GREP (one of the two is needed): the everyday run after a fix. No retries.\nfull-set-quarter-1 to full-set-quarter-4 = one quarter of the full set, the 4-job layout of asbl/ci/full-set-runners.txt (by area, each spec file whole), as the nightly takes it: about 2 h 10 to 2 h 40 on Linux, about twice that on the Windows VM. The block below shows the chosen quarter: its spec files, its tests and its time. Retries 1. Leave E2E_SPEC empty (the quarter chooses the files; a spec is refused); E2E_GREP may narrow it. On windows-vm-electron the quarter also runs let-me-update-migrate-configuration, as the nightly does.\nnext-nightly-pair = the nightly now, whether NIGHTLY_ON is ticked or not: the next pair of its rotation, production-packaged. Only ON_FAILURES and DRY_RUN apply; the others are ignored.\nExample: WHAT_TO_RUN=full-set-quarter-3  E2E_TARGET=docker-server  E2E_MODE=production-packaged'],
      QUARTER_FILES_TESTS_AND_TIME: [block: 'asbl/ci/jenkins/e2e-quarters-block.groovy', refs: ['WHAT_TO_RUN'], fallback: 'The quarter could not be drawn here: python3 asbl/ci/release-estimate.py quarters --runs /var/kraft-internalsystems/logs/datapallas-ci/runs --quarter N on the host', text: 'Redrawn when WHAT_TO_RUN changes, nothing to fill in. For a quarter: its spec files with their tests and test minutes, its tests in all, and its time by estimate on Linux and on the Windows VM, from the newest passed full set; the job writes them after each build. The same in a terminal on the CI host: python3 asbl/ci/release-estimate.py quarters --runs /var/kraft-internalsystems/logs/datapallas-ci/runs --quarter <n>'],
      E2E_TARGET: [choices: e2eTargets, text: e2eTargetText([:], 'web and electron-linux test the dev tree: E2E_MODE=dev only. docker-server and the three windows-vm lanes take either mode.\nDay to day: web.')],
      E2E_MODE: [choices: ['dev', 'production-packaged'], text: 'HOW the target runs (a run by hand; the nightly is always production-packaged).\ndev (default) = the tests start from the dev e2e package. On web and electron-linux (dev only), the fix-and-retry loop: the jars and the Angular UI built from this tree, the package per E2E_PACKAGE. On docker-server and the windows-vm lanes, the same lane as production-packaged, each test\'s clean state from the dev e2e package; windows-vm-electron then runs the app built from the VM\'s tree (no pack).\nproduction-packaged = just like a user over the shipped DataPallas: docker-server = the docker-server bundle (datapallas-server-docker.zip) and its image; windows-vm-docker = that bundle in Docker Desktop; windows-vm-server = the pack\'s datapallas-server.zip; windows-vm-electron = the pack\'s datapallas.zip, DataPallas.exe. The build each takes is reused when nothing it ships changed since, else built (about 40 min) or packed again (about 1 h 30), on origin/main. web and electron-linux refuse it (they test the dev tree).\nUse production-packaged to see a test the way a user meets it; dev to look for the cause of a difference between the two.\nExample: E2E_TARGET=windows-vm-electron  E2E_MODE=production-packaged'],
      E2E_SPEC  : [text: e2eSpecText('Needed with WHAT_TO_RUN=spec-and-grep unless E2E_GREP is set (then every file is searched for those titles, slower). Empty with a quarter: the quarter chooses its files.', 'every run by hand, a different file each time. Leave E2E_GREP empty to run the whole file (the normal case).', 'On a windows-vm lane the path has backslashes: each / is turned into [\\\\/] for you (a regex already written with [\\\\/] is kept).\n', '')],
      E2E_GREP  : [text: e2eGrepText('Empty (the default) = every test of the file(s), or of the quarter (the normal case).', 'to re-run only the test or tests that failed after a fix. Run the whole file again (empty) before you call the file green. With a quarter: only its tests whose title matches.')],
      SEPARATOR_SOMETIMES: [separator: 'Sometimes'],
      E2E_PACKAGE: [choices: ['package-reuse-as-is', 'package-rsync-simple-file-changes', 'package-repackage'], text: 'WHAT HAPPENS TO THE PACKAGE before the run (web and electron-linux only: the other targets take no e2e package from this checkout and refuse another value). package-reuse-as-is (default): run on the package exactly as it stands. The package holds the content the tests start from (sample apps, db-template, config, samples, scripts, sample databases); the jars and the Angular UI are always built from the tree, so a fix to Java, the UI, specs or helpers needs nothing more.\npackage-reuse-as-is: instant. Use it for almost every run.\npackage-rsync-simple-file-changes: copy the plain db-template files changed since the package was built (commits, and new untracked files) into the package and the testground. A few seconds. Use it after a small fix under db-template (for example a sample or the AI Hub app). If a changed file is not a plain copy in the package (generated, transformed or checked by the assembler), the run stops with: use package-repackage. With nothing changed it copies 0 files.\npackage-repackage: package the content again on the jars already built (AssemblerTest#refreshContentForE2E), about 3.5 min. Use it after a fix to config, samples or scripts that the rsync mode refuses. It is not a full rebuild: that is dp-ci.sh build (about 40 min).\nIf you forget the package after a content fix, the run tests the OLD content and its result is wrong. The log says which package ran: the line E2E_PACKAGE mode=... built_from=... commit_under_test=... files_copied=<n>.\nIf there is no package yet, one is built first (about 30 min).\nExample: E2E_SPEC=/features/samples\\.spec\\.ts$  E2E_PACKAGE=package-rsync-simple-file-changes'],
      ON_FAILURES: onFailures('the run (or the night)',
        reviewedFix + ' After a Proceed on a night, its red pair runs first the next night. A night ends at once: the next nights run meanwhile; while a night\'s fix waits, a red night only reports.',
        'the fixer pushes each proven fix to main itself. By hand: then the same run again, once: that run is the verdict. A night: the night waits for it (the next night skips meanwhile), then the red pair runs first the next night.',
        'The nightly at 18:00 takes the default.\n'),
      SEPARATOR_RARELY: [separator: 'Rarely'],
      DRY_RUN: dryRun('the run or the night runs', 'the inputs checked (a wrong one refused), each build\'s answer (reuse or rebuild) and the command it would run; nothing runs, builds or starts (a night\'s clean-up only lists)', 'to see what a press would do, or to check the job after a change'),
    ],
  ],
  'dp-ci-release-step0-set-version': [
    about: describe(
      WHAT: 'Step 0 of a release: sets the new version (asbl/ci/jenkins/release-set-version.sh). RELEASE_VERSION bigger than the current release: in a throwaway git worktree of origin/main (never the shared checkout), asbl/ci/set-version.sh writes it into the 7 version files; the job checks that all 7 say it and that exactly those changed, commits "release <version>: the version in the 7 version files", pushes it to main and prints RELEASE_COMMIT=<sha>. The same or lower: nothing done, green. Not x.y.z: refused. origin/main already saying it: nothing committed.',
      WHEN: 'a release starts here. First commit the release notes (at the latest before step 1): a "## <version> - <date>" heading in asbl/src/main/external-resources/db-template/CHANGELOG.md (the job warns, without failing, when there is none).',
      ORDER: 'step 0; then dp-ci-release-step1-e2e-prerelease on the version commit or a later one, then dp-ci-release-step2-release-docker and dp-ci-release-step3-release-windows-vm, then dp-ci-release-step4-demo-public. Step 1 runs made before the version commit do not count for that release; any step 1 run on the commit being released does. Step 1 never needs this job: it is also the everyday e2e.',
      NEEDS: 'nothing to provide: it reads the released versions from the public places (Docker Hub, the download site) and pushes with the CI host\'s git. main moved while it worked: the push is rejected, the job fails and says so; run it again.',
      TIME: 'seconds.',
      EXAMPLES: [
        'see the current release: run it as it is (RELEASE_VERSION pre-filled with it: nothing done)',
        'release 16.6.0, a look first: RELEASE_VERSION=16.6.0  DRY_RUN=yes (the 7 edits and the commit, nothing written)',
        'release 16.6.0: RELEASE_VERSION=16.6.0',
      ],
      LOG: '^STEP 0|^RELEASED|NOTHING DONE|REFUSED|FAILED|WARN|^checked:|^pushed:|RELEASE_COMMIT=|^NEXT:|SET_VERSION_RESULT. The build list labels each build with what happened.',
      MORE: guide('dp-ci-release-step0-set-version', 'asbl/ci/jenkins/release-set-version.sh')
    ),
    params: [
      RELEASE_VERSION: [default: currentRelease, text: releaseVersionText],
      DRY_RUN: dryRun('for a bigger version, the 7 edits committed and pushed to main', 'the current release, then for a bigger version the 7 edits (asbl/ci/set-version.sh --dry-run) and the commit it would make; nothing written or pushed', 'first, to see the edits'),
    ],
  ],
  'dp-ci-release-step1-e2e-prerelease': [
    about: describe(
      WHAT: 'The real end-to-end tests, on a package built from this exact commit of origin/main (rebuilt first when it is not), run by asbl/ci/jenkins/release-step1.sh (this job passes its parameters to it; the same script runs from the shell): dp-ci.sh e2e on Linux (web, electron-linux, docker-server), dp-ci.sh win e2e|docker-e2e|server-e2e on the Windows VM. Two roles: a release\'s two lanes, both on this host (the Windows lanes are steps 2 and 3\'s since 16.6.2), and the everyday full e2e of the trunk. docker-server and windows-vm-docker install what dp-ci.sh build makes: the job builds origin/main first when it is not built yet (dp-ci.sh build-if-needed, JOB STEP 1/2; the tests are JOB STEP 2/2). windows-vm-server installs the Windows pack\'s datapallas-server.zip, the only one made, which this job cannot hand it: here it refuses within seconds (step 3 runs it, its RELEASE STEP 2/5; by itself: bash asbl/ci/release-rerun.sh run windows-vm-server --kept <kept folder>). Each build records its verdict in the release record (bash asbl/ci/release-state.sh show); a run with any filter (E2E_SPEC or E2E_GREP set, other than the auth lane below and E2E_SPEC=light on windows-vm-electron) is "targeted" and never counts for a release. Its first line says who started it (STARTED_BY=<who>  <UTC>  :: step 1 <target>); then RELEASE_VERSION says what a release would do now; it runs anyway. Then FULL_LANE: the side, web or docker-server, that runs this release\'s full set (it alternates, one side per release; bash asbl/ci/release-state.sh full-lane shows the last two and why).',
      WHEN: [
        'a release: the two lanes in EXAMPLES, each counting for the commit being released, one build each (start them one after the other: a second build waits in the Jenkins queue);',
        'a lane counts for a commit when its own verdict there is green; with none there, when its newest verdict on an earlier commit is green and only never-shipped files changed since (asbl/ci/reuse-or-rebuild.sh step1 <from> <to>: still-counts); or when its run was red on a few tests that each passed alone afterwards: bash asbl/ci/release-rerun.sh run <target> --failed <its report>, then bash asbl/ci/release-state.sh record-step1 <target> reruns <full|auth|light> (a re-run through this job, E2E_GREP set, is targeted and completes nothing);',
        'any day: the whole trunk on Linux (web) or on Windows (windows-vm-electron), E2E_SPEC empty;',
        'one spec file on a package built from this exact commit (E2E_SPEC), or a test on Windows or Docker by its title (E2E_GREP).',
        'It tests origin/main (this checkout is fast-forwarded to it first; local changes to tracked files stop it): push the fix first.',
        'For the quick fix-and-retry loop: dp-ci-e2e-nightly-or-by-hand, pressed by hand.',
      ],
      ORDER: 'step 1 of a release: after dp-ci-release-step0-set-version (its version commit or a later one), before dp-ci-release-step2-release-docker and dp-ci-release-step3-release-windows-vm, which refuse unless the two lanes count for their commit (or their E2E_APPROVAL says owner approved: the owner\'s written decision to go on without them). It never needs step 0 and never skips.',
      NEEDS: [
        'checked first, within seconds, before the build and the tests (MISSING <what>: <what to do>, then PREREQUISITES MISSING, nothing started):',
        'web, electron-linux, docker-server: this host\'s Docker engine;',
        'windows-vm-electron: the Windows VM over SSH, its Docker Desktop, Java 17 and Maven on its PATH;',
        'windows-vm-docker: the VM, its Docker Desktop, this host\'s Docker engine, no other Windows run;',
        'windows-vm-server: the VM, its Docker Desktop, its Java 17, no other Windows run; and a kept pack (RELEASE_KEPT) or REBUILD_PACK=yes, which this job does not pass.',
      ],
      TIME: [
        'a full run: about 10.5 h on Linux (docker-server, measured; a web full run took 15.4 h), about 25 h on windows-vm-electron (measured 24.8 h);',
        'the light set (asbl/ci/light-set.txt) of windows-vm-docker: about 2 h 10 by estimate (capped at 4 h 30, LIGHT_SET_CAP_SERVER_LANES); windows-vm-server: the same cap (not measured yet);',
        'one file: minutes to 2 h (measured);',
        'first, when needed: the package rebuilt (Linux about 30 min, the VM about 1 to 1.5 h, measured 62 min on 2026-10-22), and for docker-server and windows-vm-docker the build of origin/main (about 40 min, once per commit).',
      ],
      EXAMPLES: [
        'release lane 1, the full set, on this release\'s full lane: web or docker-server, the other side than the release before (alternated; drawn at random, and said so, when no earlier record can be read; chosen once per version, kept for every later run). The job prints it at its start (FULL_LANE=); by hand: bash asbl/ci/release-state.sh full-lane --choose. E2E_TARGET=<that lane>  E2E_SPEC empty',
        'release lane 2, the sign-in file the full run leaves out: E2E_TARGET=docker-server  E2E_SPEC=/features/auth-authorization-server\\.spec\\.ts$',
        'the Windows desktop\'s light set, apart from a release (step 3 runs it itself, its RELEASE STEP 3/5, and records it): E2E_TARGET=windows-vm-electron  E2E_SPEC=light',
        'the trunk on Linux: E2E_TARGET=web  E2E_SPEC empty',
        'the trunk on Windows: E2E_TARGET=windows-vm-electron  E2E_SPEC empty',
        'one Windows test by title: E2E_TARGET=windows-vm-electron  E2E_SPEC=[\\\\/]samples\\.spec\\.ts$  E2E_GREP=02_dashboard_demos',
        'one file on a package of this commit: E2E_TARGET=web  E2E_SPEC=/features/samples\\.spec\\.ts$',
      ],
      LOG: playwrightLog +
        '\n  Where the time goes: ^######## (every part of the job and of a Windows lane, START and END, took=<seconds>), ^(>>>|<<<) STEP (the steps of the Linux run).' +
        '\n  Who started it and its history line: ^STARTED_BY=|^RUN_HISTORY.' +
        '\n  The release record: RELEASE_VERSION|FULL_LANE|RELEASE_STATE (the version line first, then this release\'s full lane and the lanes step 1 needs, the verdict recorded last; FULL_LANE also when this run is or is not the full lane).',
      MORE: guide('dp-ci-release-step1-e2e-prerelease', 'asbl/ci/jenkins/release-step1.sh (asbl/ci/dp-ci.sh e2e, or dp-ci.sh win e2e|docker-e2e|server-e2e through asbl/ci/jenkins/win-e2e.sh)')
    ),
    params: [
      E2E_SPEC  : [text: e2eSpecText('EMPTY (THE DEFAULT), WITH E2E_GREP EMPTY TOO, IS THE FULL SUITE: ABOUT 10.5 HOURS ON LINUX, ABOUT 25 HOURS ON windows-vm-electron, AND THE CI SERVER DOES NOTHING ELSE UNTIL IT ENDS. On windows-vm-docker and windows-vm-server, empty is the light set instead (asbl/ci/light-set.txt: the 23 samples and one test per zone, about 2 h on windows-vm-docker by estimate).\nlight = the light set on any windows-vm target; on windows-vm-electron it is what step 3 runs of that lane (the full set alternates between web and docker-server), with auth-authorization-desktop whole.', 'empty for a release lane or the trunk; a file to confirm it on a package built from this exact commit.', 'What a full run leaves out, to run on its own: auth-authorization-server on every target (it changes the accounts and roles that later specs sign in with), and on Linux also let-me-update-migrate-configuration (desktop only: run it on electron-linux); windows-vm-electron keeps let-me-update-migrate-configuration. Name a file in the regex to run it.\nOn the windows-vm targets the path has backslashes: write the separator as [\\\\/].\n', '\n  /features/   -> every spec file of the features folder (Linux)\n  [\\\\/]samples\\.spec\\.ts$   -> samples.spec.ts on any target, Windows too\nFor a quick fix-and-retry loop use dp-ci-e2e-nightly-or-by-hand instead.')],
      E2E_GREP  : [text: e2eGrepText('Empty (the default) = every test of those files (the normal case).', 'to run named tests on a package built from this exact commit, or on the Windows VM. Set, the run is recorded as targeted and never counts for a release.')],
      E2E_TARGET: [choices: e2eTargets, text: e2eTargetText(['docker-server': 'Built first when origin/main is not built yet.', 'windows-vm-docker': 'Empty E2E_SPEC = the light set (asbl/ci/light-set.txt): the server\'s code is proven by docker-server, this checks where it meets Windows. Built first when origin/main (what the VM tests) is not built yet.', 'windows-vm-server': 'The same light set, on a Windows pack: a kept pack (RELEASE_KEPT) or a new one (REBUILD_PACK=yes), which this job does not pass, so here it refuses within seconds. Step 3 runs it (RELEASE STEP 2/5); bash asbl/ci/release-rerun.sh run windows-vm-server --kept <kept folder> runs it again by itself.', 'windows-vm-electron': 'Here built from this tree on the VM (step 1 runs in E2E_MODE=dev).'], 'Day to day: web. The others: a release, or a check on Windows or Docker (on the shipped DataPallas, a few tests: dp-ci-e2e-nightly-or-by-hand, E2E_MODE=production-packaged).')],
      E2E_ROTATION_DATE: [text: 'WHICH DAY\'s variant to run, YYYY-MM-DD. Empty (the default) = today, UTC. Some specs test a different app or database vendor depending on the day (the choice is seeded from the date, so two days in a row cover every combination). A day\'s variant only, not the nightly\'s rotation (dp-ci-e2e-nightly-or-by-hand\'s nightly runs its own 16-night rotation of (quarter, lane) pairs).\nUse it only to repeat the variant of another day, for example the day a run failed.\nExample: 2026-09-22 (that day: sqlserver and duckdb).'],
      E2E_RETRIES: [text: 'HOW MANY TIMES a failed test is run again. Empty (the default) = the lane\'s own: a full run 2 on Linux (web, electron-linux, docker-server) and 1 on windows-vm-electron; the light set of windows-vm-docker and windows-vm-server 1; any run with E2E_SPEC or E2E_GREP set 0.\nUse it: 0 to see each failure as it is; 1 or 2 to tell flaky tests from red ones (a pass on a retry is reported as flaky, failing every try as failed).\nThe run goes on to the end whatever fails.'],
    ],
  ],
  'dp-ci-release-step2-release-docker': [
    about: describe(
      WHAT: [
        'The Docker release (asbl/ci/jenkins/release-docker.sh), in three modes.',
        'MODE=rehearsal (the default): build, prove, keep, upload, in that order; the day before a release with UPLOAD=no. The build of origin/main, once, on Linux (only when there is none yet): the image and datapallas-server-docker.zip. Then that very zip installed the way a user does it (https://datapallas.com/docs/server/self-host) against that very image, no registry: on this host (the docker-server light set, then the one-command docker run) and in the Windows VM\'s Docker Desktop, the image copied over and loaded under the name the compose asks for (the windows-vm-docker light set). Both proofs run whatever the other said. Then, red or green, the zip is kept in /var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit>/ and the image tagged <repo>:<version> on this host and kept as a file beside the zip (datapallas-server-image.tar: this host\'s nightly cleanup deletes images no container uses, so the upload loads it back from the file and checks its id), with the manifest (MANIFEST.txt: sha256, image id, each proof) and failure-report-docker.md (every failure of the two proofs, its test, its error, its evidence, then grouped; nothing fixed); a repeated run of the same commit reuses the same files or moves the earlier set to replaced/, never deleting it. Only when both proofs are green, origin/main is still the proven commit (or moved since by never-shipped files only: release-state.sh moved-main) and the image and zip are still the proven ones: UPLOAD=yes: the Docker zips of earlier rehearsals deleted from rehearsal/, the image pushed as :<version> on Docker Hub (never :latest) and the zip staged in rehearsal/<version>-<commit>/ on Backblaze, both checked; UPLOAD=no (the default): the exact push and upload commands printed, nothing written. A red proof names itself and leaves Docker Hub and the bucket as they were. Nothing users get changes. Green only when all of it is.',
        'MODE=upload (release day, the owner only): the kept zip and image of this checkout\'s version and commit uploaded, no rebuild (asbl/ci/release-publish.sh upload-kept docker): each checked against the manifest and the passed rehearsal, which needs both its proofs green, Linux and Windows (a changed or missing file, or another image id, is refused, named), the version gate, step 1, then :<version> pushed and the zip staged in rehearsal/; UPLOAD=no or DRY_RUN=yes: the checks and the commands it would run, nothing written. Minutes.',
        'MODE=public (the owner only, with UPLOAD=yes; refused with UPLOAD=no): the newest passed, uploaded rehearsal of this version, from whichever commit (REHEARSED <commit> in the log), copied in minutes: the outgoing release zip first kept in its own <old version>/ (copied there from newest/ when missing), then the zip to newest/ (the links of the README, the Docker Hub page and the self-host page) and to <version>/, :latest pointed at the rehearsed :<version>, each checked, the Cloudflare cache purged, newest/docker-version.txt written, the copied rehearsal deleted from rehearsal/, then the seed job queued. With no passed rehearsal of this version it says "rehearsing first", rehearses as above, and copies only when that is green.',
        'MODE=public never copies anything that did not pass: a red rehearsal leaves the public files as they are.',
        'Both modes start with the version gate: settings.xml the same as the released Docker version (the one :latest has) = NOTHING TO RELEASE, green, nothing done.',
      ],
      WHEN: 'to release the Docker channel, once step 1\'s lanes count for origin/main (or, on the owner\'s decision, without them: E2E_APPROVAL). The day before, execution 1: MODE=rehearsal UPLOAD=no, and step 3 the same way (the one-press job dp-ci-release-steps-0-3-rehearsal runs the two together); each failure re-proved alone on the build already there (bash asbl/ci/release-rerun.sh run <part> --failed <kept folder>, until bash asbl/ci/release-rerun.sh show says ready for execution 2); then execution 2, the same two jobs on the fixed commit, start to end. Release day, with origin/main on execution 2\'s commit (the upload takes that commit\'s kept files): MODE=upload UPLOAD=yes, a look, then MODE=public UPLOAD=yes.',
      ORDER: 'step 2: after dp-ci-release-step1-e2e-prerelease (else REFUSED within seconds, naming step 1, unless E2E_APPROVAL says owner approved). It needs nothing of step 3, nor step 3 of it: pressed as jobs, the two run one after the other in either order (both use the VM, which takes one Windows run at a time); the one-press job runs them together, one VM part at a time. Run the two MODE=public runs one after the other: between them, newest/ holds one channel\'s new files next to the other\'s old ones. After its MODE=public: dp-ci-release-step4-demo-public, and the Docker Hub page by hand (asbl/docker/push-dockerhub-readme.ps1, on Windows, with its own Docker Hub token; the job prints it as a MANUAL line).',
      NEEDS: [
        'checked right after the version gate, within seconds, before anything slow (asbl/ci/release-publish.sh preflight docker; MISSING <what>: <what to provide>, then PREREQUISITES MISSING, nothing built):',
        'step 1\'s lanes counting for the commit: green on it, carried from an earlier commit, or completed by re-runs (else REFUSED, naming step 1, and for a red lane the re-run commands), or the owner\'s written decision to go on without them: E2E_APPROVAL with the words owner approved (the parameter\'s own text says what it does and what it writes down);',
        'with UPLOAD=yes: the keys file /var/kraft-internalsystems/config/datapallas-ci/release-publish.env (root only, mode 600, written by the owner): a Docker Hub token that may push and a Backblaze key that can write, both tried; for MODE=public also the Cloudflare purge token; and on this host rclone, curl, sha256sum and docker buildx (UPLOAD=no needs none of them);',
        'on this host: the Docker engine;',
        'for a rehearsal, the Windows VM: answering, its Docker Desktop running, no other Windows run.',
        'The full list: asbl/ci/jenkins/jenkins.md, "Before the first release".',
      ],
      TIME: 'a rehearsal: 16.6.0\'s took about 2 h 10 to 2 h 20 with the earlier five-file light set (its last two chains): the build of origin/main when there is none (36 min), the Linux proof (23 to 30 min), the Windows proof (67 to 76 min: the image copied to the VM, its light set, the AI Hub images built there when missing); the light set of asbl/ci/light-set.txt adds about 1.5 h by estimate (the Windows proof capped at 4 h 30); the keeping and, with UPLOAD=yes, the push and the upload (minutes; not measured yet); MODE=upload: minutes, the upload speed decides; MODE=public with a passed rehearsal: minutes (not measured yet); MODE=public that rehearses first: a rehearsal plus the copy.',
      EXAMPLES: [
        'the day before 16.6.0 (after steps 0 and 1), built, proven and kept, nothing uploaded: MODE=rehearsal  UPLOAD=no; step 3 the same, in either order',
        'release day: MODE=upload  UPLOAD=yes (the kept files), then MODE=public  UPLOAD=yes',
        'go public after a green rehearsal that uploaded (UPLOAD=yes): MODE=public  UPLOAD=yes',
        'see what a run would do, nothing built, kept or copied: DRY_RUN=yes (with any MODE)',
        'the whole rehearsal, nothing written to Docker Hub or the bucket: MODE=rehearsal  UPLOAD=no (the default)',
        'rehearse and upload, on the owner\'s approval: MODE=rehearsal  UPLOAD=yes; then go public: MODE=public  UPLOAD=yes',
        'release without step 1\'s lanes, on the owner\'s decision: E2E_APPROVAL=owner approved: 16.7.0 on step 1 of 1a2b3c4d, before the fix in ServicesManager.java',
      ],
      LOG: 'the parts (DOCKER RELEASE STEP 1/6 the gate, 2/6 the build, 3/6 the Linux proof, 4/6 the Windows proof, 5/6 the keeping, 6/6 the guard and the upload; DOCKER UPLOAD; DOCKER PUBLIC with its PUBLIC STEP n/N; each START and END with the time it took) and the verdict: ^######## |RELEASE_VERSION=|NOTHING TO RELEASE|PREREQUISITES|^MISSING |REFUSED|^UPLOAD=no |^E2E_APPROVAL|REHEARSED|rehearsing first|BUILD:|BUILD_TAG=|RELEASE_STATE|RELEASE_STAGE|DOCKER_SERVER_IMAGE|DOCKER_ONE_COMMAND|E2E_RESULT|PIPELINE_RESULT|RELEASE_PUBLIC|^MANUAL |^KEEP|^REPLACED|^KEPT|^PROOF|^FAILURES|^REPORT|^UPLOAD_KEPT|DOCKER_RELEASE_RESULT|DOCKER_RELEASE=. The kept files, their manifest and the failure report: bash asbl/ci/release-keep.sh show. An E2E_APPROVAL: ^E2E_APPROVAL (ACCEPTED or NOT ACCEPTED, who, when, the text, step 1\'s lanes). The build list labels each build with what happened.',
      MORE: guide('dp-ci-release-step2-release-docker', 'asbl/ci/jenkins/release-docker.sh')
    ),
    params: [
      MODE: [choices: ['rehearsal', 'upload', 'public'], text: 'WHICH release. rehearsal (default) = build, prove the build on Linux and on Windows (no registry), keep the zip and the image, then, with UPLOAD=yes, push :<version> and stage the zip in rehearsal/. Nothing users get changes. The day before a release: rehearsal with UPLOAD=no.\nupload (release day, the owner only) = the kept zip and image of this commit uploaded as they are, no rebuild (UPLOAD=yes; with no: checked only).\npublic (the owner only) = copy the newest passed rehearsal of this version to newest/ and :latest, in minutes; with none, rehearse first and copy only when it is green.\nUse rehearsal, look at it, then public; once trusted, public directly.'],
      DRY_RUN: dryRun('the run goes', 'the version gate, the prerequisites (the bucket listed, not written), the guards, which rehearsal it would copy or that it would rehearse first, and what each part would do; nothing built, pushed, installed or copied', 'to see what a run would do'),
      UPLOAD: [choices: ['no', 'yes'], text: uploadSwitch],
      E2E_APPROVAL: [text: e2eApproval],
    ],
  ],
  'dp-ci-release-step3-release-windows-vm': [
    about: describe(
      WHAT: [
        'The Windows release (dp-ci.sh win release), in three modes.',
        'MODE=rehearsal (the default): a real release into places users do not get; the day before a release with UPLOAD=no. RELEASE STEP 1/5: on the Windows VM, asbl/pack-datapallas.bat builds the Windows release files once, from clean (datapallas.zip with DataPallas.exe, datapallas-server.zip, datapallas-src.zip; no Docker image: step 2 builds Docker on Linux), and the three zips are brought down and kept in /var/kraft-internalsystems/logs/datapallas-ci/release-artifacts/<version>-<commit>/ with the manifest. 2/5: the pack\'s own datapallas-server.zip (the kept copy put back on the VM, sha256 checked) installed the way the installation page says, on the VM\'s Java 17, and its light set (dp-ci.sh win server-e2e with E2E_SPEC=light, asbl/ci/light-set.txt), recorded as step3.windows-vm-server-light. 3/5: the desktop app built from the repository, its light set (dp-ci.sh win e2e with E2E_SPEC=light), recorded as step3.windows-vm-electron-light. 4/5: the Robot Framework UAT (asbl/src/uat/run-tests.bat) tests the pack\'s very files the way a user meets them (Java and Chocolatey removed and installed, the exe, the command line, the server and its Windows service), last, since it removes the Java the server runs on; a red light set does not skip it. 5/5: what it kept, then, only when the four are green and origin/main is still that commit (or moved since by never-shipped files only: release-state.sh moved-main): UPLOAD=yes: this host deletes the Windows zips of earlier rehearsals from rehearsal/, the VM itself uploads the three zips to rehearsal/<version>-<commit>/ on Backblaze with its own rclone (installed on the VM before the pack when missing, a pinned version; the Backblaze key goes from this host through the SSH session\'s stdin into that rclone process\'s environment only: never a file on the VM, never in a log), and this host checks each by download; UPLOAD=no (the default): the exact commands printed, nothing written, rclone not installed. Then failure-report-windows.md beside the manifest: every failure of the light sets and the UAT (a skipped test counts as one), its test, its error, its evidence, then grouped; nothing fixed. Nothing users get changes.',
        'MODE=upload (release day, the owner only): the kept zips of this checkout\'s version and commit uploaded by the VM, no new pack (asbl/ci/release-publish.sh upload-kept windows): each checked against the manifest and the passed rehearsal, which needs each of its four parts green (the pack, both light sets, the Robot UAT), put back in the VM\'s asbl\\dist when a later run replaced them, then staged as a rehearsal stages them; UPLOAD=no or DRY_RUN=yes: the checks and the commands, nothing written. Minutes.',
        'MODE=public (the owner only, with UPLOAD=yes; refused with UPLOAD=no): the newest passed, uploaded rehearsal of this version, from whichever commit (REHEARSED <commit> in the log), copied in minutes, the VM untouched: the outgoing release zips first kept in its own <old version>/ (copied there from newest/ when missing), then the zips to newest/ and to <version>/, each checked by download, the Cloudflare cache purged, newest/windows-version.txt written, the copied rehearsal deleted from rehearsal/, then the seed job queued. With no passed rehearsal of this version it says "rehearsing first", rehearses as above, and copies only when that is green.',
        'MODE=public never copies anything that did not pass: a red rehearsal leaves the public files as they are.',
        'Both modes start with the version gate: settings.xml the same as the released Windows version (newest/windows-version.txt) = NOTHING TO RELEASE, green, nothing done.',
      ],
      WHEN: 'to release the Windows channel, once step 1\'s lanes count for origin/main (or, on the owner\'s decision, without them: E2E_APPROVAL). The day before: MODE=rehearsal UPLOAD=no, with step 2 (it needs nothing of it), in execution 1 and again in execution 2 (as step 2 says). Release day, with origin/main on execution 2\'s commit: MODE=upload UPLOAD=yes, a look, then MODE=public UPLOAD=yes.',
      ORDER: 'step 3: after dp-ci-release-step1-e2e-prerelease (else REFUSED within seconds, naming step 1, unless E2E_APPROVAL says owner approved). It needs nothing of step 2: pressed as jobs, the two run one after the other in either order (both use the VM, which takes one Windows run at a time); the one-press job runs them together, one VM part at a time (step 3\'s pack, step 2\'s Windows proof, then step 3\'s other parts). Its MODE=public and step 2\'s one after the other: between them, newest/ holds one channel\'s new files next to the other\'s old ones.',
      NEEDS: [
        'checked right after the version gate, within seconds, before the pack (asbl/ci/release-publish.sh preflight files, then dp-ci.sh prereq vm; MISSING <what>: <what to provide>, then PREREQUISITES MISSING, nothing packed):',
        'step 1\'s lanes counting for the commit, as for step 2 (else REFUSED, naming step 1), or the owner\'s written decision to go on without them: E2E_APPROVAL with the words owner approved (the parameter\'s own text says what it does and what it writes down);',
        'with UPLOAD=yes: the keys file /var/kraft-internalsystems/config/datapallas-ci/release-publish.env (root only, mode 600, written by the owner): a Backblaze key that can write, tried; for MODE=public also the Cloudflare purge token; and on this host rclone, curl and sha256sum (UPLOAD=no needs none of them);',
        'the Windows VM answering over SSH, its Docker Desktop, Java 17 and Maven (the light sets need them; not when it only copies), and no other Windows run (it refuses to start while one is going); with UPLOAD=yes also the VM reaching downloads.rclone.org (its rclone, installed by the job before the pack when missing) and Backblaze (it uploads the zips itself).',
        'The full list: asbl/ci/jenkins/jenkins.md, "Before the first release".',
      ],
      TIME: 'a rehearsal: 16.6.0\'s took about 3 h 35 on the VM (its last two chains): the pack 82 min (capped at 8 h, RELEASE_PACK_TIMEOUT) and the zips brought down (minutes), the electron light set: its own package rebuild 62 min, then its tests (29 min with the earlier six-file set, about an hour by estimate with asbl/ci/light-set.txt, so about 4 h 15 in all; tests capped at 3 h, RELEASE_LIGHT_TIMEOUT), and the Robot UAT 32 to 41 min (capped at 6 h, RELEASE_ROBOT_TIMEOUT); since 16.6.2 also the server light set, its prepare and its tests (about 1 to 2 h by estimate, capped at 4 h 30, LIGHT_SET_CAP_SERVER_LANES; not measured yet); MODE=upload: minutes, the upload speed decides; MODE=public with a passed rehearsal: minutes: its own work took 8 s against local stand-ins (2026-10-22); a real copy also downloads the three zips (about 1.7 GB) twice to check them and copies them on the bucket, so the download speed decides; MODE=public that rehearses first: a rehearsal plus the copy.',
      EXAMPLES: [
        'the day before 16.6.0 (after steps 0 and 1), packed, proven and kept, nothing uploaded: MODE=rehearsal  UPLOAD=no',
        'release day: MODE=upload  UPLOAD=yes (the kept zips), then MODE=public  UPLOAD=yes',
        'go public after a green rehearsal that uploaded (UPLOAD=yes): MODE=public  UPLOAD=yes',
        'see what a run would do, the VM untouched: DRY_RUN=yes (with any MODE)',
        'the whole rehearsal, nothing written to the bucket: MODE=rehearsal  UPLOAD=no (the default)',
        'rehearse and upload, on the owner\'s approval: MODE=rehearsal  UPLOAD=yes; then go public: MODE=public  UPLOAD=yes',
        'release without step 1\'s lanes, on the owner\'s decision: E2E_APPROVAL=owner approved: 16.7.0 on step 1 of 1a2b3c4d, before the fix in ServicesManager.java',
      ],
      LOG: 'the parts (RELEASE STEP 1/5 the pack and the keeping, 2/5 the server light set, 3/5 the electron light set, 4/5 the Robot UAT, 5/5 what it kept and the upload; WINDOWS UPLOAD; WINDOWS PUBLIC with its PUBLIC STEP n/N, each START and END with the time it took) and the verdict: ^######## |RELEASE_VERSION=|NOTHING TO RELEASE|PREREQUISITES|^MISSING |REFUSED|^E2E_APPROVAL|^UPLOAD=no |REHEARSED|rehearsing first|RELEASE_STATE|RELEASE_RESULT|WIN_E2E_RESULT|ROBOT_RESULT|RELEASE_STAGE|RELEASE_PUBLIC|^UPLOAD_KEPT; the files: RELEASE_FILE|^KEEP|^REPLACED|^KEPT|^DIST |^STAGE |^PUBLIC ; the failures: ^FAILURES|^REPORT (bash asbl/ci/release-keep.sh show). An E2E_APPROVAL: ^E2E_APPROVAL (ACCEPTED or NOT ACCEPTED, who, when, the text, step 1\'s lanes). The build list labels each build with what happened; the build page shows the Robot report and the two light sets\' Playwright reports.',
      MORE: guide('dp-ci-release-step3-release-windows-vm', 'asbl/ci/dp-ci.sh win release (through asbl/ci/jenkins/win-e2e.sh release)')
    ),
    params: [
      MODE: [choices: ['rehearsal', 'upload', 'public'], text: 'WHICH release. rehearsal (default) = pack on the VM and keep the zips, the server light set on the pack\'s datapallas-server.zip, the electron light set, the Robot UAT on the pack, then, with UPLOAD=yes, stage in rehearsal/. Nothing users get changes. The day before a release: rehearsal with UPLOAD=no.\nupload (release day, the owner only) = the kept zips of this commit uploaded as they are, no new pack (UPLOAD=yes; with no: checked only).\npublic (the owner only) = copy the newest passed rehearsal of this version to newest/, in minutes; with none, rehearse first and copy only when it is green.\nUse rehearsal, look at it, then public; once trusted, public directly.'],
      DRY_RUN: dryRun('the run goes', 'the VM only asked whether it answers, then the version gate, the prerequisites (the bucket listed, not written), the guard, which rehearsal it would copy or that it would rehearse first, and what each part would do; nothing packed, tested, staged or copied', 'to see what a run would do'),
      UPLOAD: [choices: ['no', 'yes'], text: uploadSwitch],
      E2E_APPROVAL: [text: e2eApproval],
    ],
  ],
  'dp-ci-release-step4-demo-public': [
    about: describe(
      WHAT: 'The public demo, https://demo.datapallas.com (the one datapallas.com frames), installs the published release the way a user does, building nothing (asbl/ci/jenkins/release-demos.sh with DEMO=demo.datapallas.com): setup.sh and setup.sh --edge (its folders and its two vhosts), then asbl/ci/demo-public/install-release.sh: newest/datapallas-server-docker.zip unzipped into a folder of its own per version, with docker-compose.override.yml (no Docker socket, no host port, no MailHog), the data carried over from the running version, the previous version started again when the new one does not answer; then setup.sh --check and the demo links. Nothing to do when it already runs the released version. The output is masked (share-link tokens, passwords).',
      WHEN: 'after the Docker release went public (dp-ci-release-step2-release-docker, MODE=public).',
      ORDER: 'step 4, the last step of a release.',
      NEEDS: 'the Docker release public: its released version (the one Docker Hub\'s :latest has) and newest/datapallas-server-docker.zip; the demo\'s two root-only settings files, written when it was set up (/var/kraft-internalsystems/config/datapallas-ci/demo-datapallas-com.env and demo-public-storefront.env, named in asbl/ci/demo-public/setup.sh). It builds nothing and has no prerequisite check of its own: a part that fails stops it with FAILED and why.',
      TIME: 'minutes (not measured yet).',
      EXAMPLES: [
        'after step 2\'s MODE=public: nothing to change',
        'the release changed the dashboards: RESET_DEMO_DATA=yes',
        'see what it would do: DRY_RUN=yes',
      ],
      LOG: 'the parts (DEMOS STEP 1/3 the setup, 2/3 the install, 3/3 the check, each START and END with the time it took) and the verdict: ^######## |DEMO_INSTALL result|DEMO_SETUP result|^!!!|FAILED|DEMOS_RESULT.',
      MORE: guide('dp-ci-release-step4-demo-public', 'asbl/ci/jenkins/release-demos.sh with DEMO=demo.datapallas.com')
    ),
    params: [
      RESET_DEMO_DATA: [choices: ['no', 'yes'], text: 'WHOSE data the new version starts with. no (default) = the data of the running version, carried over.\nyes = the bundle\'s own data; what visitors created stays in the previous version\'s folder.\nUse yes when the release changed the dashboards. It matters only when a new version is installed.'],
      DRY_RUN: dryRun('the install goes', 'setup.sh --check, then what the install would do; nothing installed or changed', 'to see what a run would do'),
    ],
  ],
]

// The Parameter Separator plugin (plugins.txt) draws a line with a header between groups of a job's parameters (its Job DSL
// name: separator). A seed without it leaves the separators out, so it never fails
def separatorsAvailable = false
try {
  separatorsAvailable = jenkins.model.Jenkins.instance.pluginManager.getPlugin('parameter-separator')?.isActive() ?: false
} catch (e) {
  println "Parameter separators left out: the plugin list was not read (${e})"
}
println "Parameter separators: ${separatorsAvailable ? 'shown' : 'left out (the parameter-separator plugin is not active)'}"

// The Active Choices plugin (uno-choice, plugins.txt) draws the live blocks under some choices (the round's estimate, the
// quarter of dp-ci-e2e-nightly-or-by-hand): a reactive reference parameter (its Job DSL name:
// activeChoiceReactiveReferenceParam) whose Groovy script is its own file (block:), read from the seed's workspace (a
// script-console apply: a copy of it in that workspace), redrawn when a choice it names (refs:) changes. A seed without the
// plugin, or without the file, leaves the block out, so it never fails; the build's first lines print the estimate anyway
def unoChoiceActive = false
try {
  unoChoiceActive = jenkins.model.Jenkins.instance.pluginManager.getPlugin('uno-choice')?.isActive() ?: false
} catch (e) {
  println "The live blocks: left out (the plugin list was not read: ${e})"
}
def blockScripts = [:]
def blockScript = { String path ->
  if (!blockScripts.containsKey(path)) {
    String text = null
    if (!unoChoiceActive) {
      println "The block ${path}: left out (the uno-choice plugin is not active)"
    } else {
      try {
        text = readFileFromWorkspace(path)
        println "The block ${path}: shown"
      } catch (e) {
        println "The block ${path}: left out (not read: ${e})"
      }
    }
    blockScripts[path] = text
  }
  return blockScripts[path]
}

// A tick box's default is a person's setting (Configure -> Save, for example NIGHTLY_ON): a seed run keeps it as it finds it;
// a new job (or one where it cannot be read) gets the default written in its entry (tick:)
def keptTick = { String jobName, String pname, boolean whenNew ->
  try {
    def saved = jenkins.model.Jenkins.get().getItemByFullName("datapallas/${jobName}")?.getProperty(hudson.model.ParametersDefinitionProperty)?.getParameterDefinition(pname)
    if (saved?.getClass()?.getName() == 'hudson.model.BooleanParameterDefinition') {   // by name: the seed parses without Jenkins's classes
      println "${jobName}: ${pname} kept as saved: ${saved.isDefaultValue() ? 'ticked' : 'unticked'}"
      return saved.isDefaultValue()
    }
  } catch (e) {
    println "${jobName}: ${pname} not read (${e}): ${whenNew ? 'ticked' : 'unticked'}"
  }
  return whenNew
}

jobs.each { jobName, job ->
  pipelineJob("datapallas/${jobName}") {
    description(job.about)
    parameters {
      job.params.each { pname, p ->
        if (p.separator) {
          if (separatorsAvailable) {
            separator {   // the loop says jobName: a closure calls a captured local before a DSL method of that name
              name(pname)
              separatorStyle('')
              sectionHeader(p.separator)
              sectionHeaderStyle('')
            }
          }
        } else if (p.block) {
          String drawn = blockScript(p.block)
          if (drawn) {
            activeChoiceReactiveReferenceParam(pname) {
              description(p.text)
              omitValueField(true)
              choiceType('FORMATTED_HTML')
              groovyScript {
                script(drawn)
                fallbackScript("return '<pre>${p.fallback}</pre>'")
              }
              for (String referenced : p.refs) {
                referencedParameter(referenced)
              }
            }
          }
        } else if (p.containsKey('tick')) {
          booleanParam(pname, keptTick(jobName, pname, p.tick), p.text)
        } else if (p.choices) {
          choiceParam(pname, p.choices, p.text)
        } else {
          stringParam(pname, p.default ?: '', p.text)
        }
      }
    }
    definition {
      cpsScm {
        scm {
          git {
            remote { url(repoUrl) }
            branch(repoBranch)
          }
        }
        scriptPath("asbl/ci/jenkins/${jobName}.Jenkinsfile")
        lightweight(true)
      }
    }
    // a job with a timer (cron) starts by itself: Jenkins's own cron syntax, a TZ= line first
    if (job.cron) {
      properties {
        pipelineTriggers {
          triggers {
            cron { spec(job.cron) }
          }
        }
      }
    }
    logRotator { numToKeep(200) }
    // Disable / Enable on a job's page is a person's choice: a seed run keeps it
    disabled(jenkins.model.Jenkins.get().getItemByFullName("datapallas/${jobName}")?.isDisabled() ?: false)
  }
}

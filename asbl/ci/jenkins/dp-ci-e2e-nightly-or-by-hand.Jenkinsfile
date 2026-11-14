// Job datapallas/dp-ci-e2e-nightly-or-by-hand: the e2e of main, every night by itself or any time by hand. Its full
// description (what, when, order, needs, time, examples, log) and its parameters' texts are in asbl/ci/jenkins/seed.groovy,
// which makes the job; the guide is asbl/ci/jenkins/jenkins.md, section dp-ci-e2e-nightly-or-by-hand.
// A LIGHT WRAPPER over two plain scripts on the host, run over SSH exactly as a person or an agent runs them (the
// parameters are their environment):
//   - the nightly, asbl/ci/jenkins/scheduled-e2e.sh: a timed build (18:00 UTC) while NIGHTLY_ON is ticked in Configure,
//     or a press with WHAT_TO_RUN=next-nightly-pair. Always production-packaged, the next pair of its 16-night rotation.
//     The night runs detached on the host; this build follows its console in polls of under a minute, holding no
//     executor between them, so a Jenkins restart only resumes the polling. Abort stops the night (post { aborted }).
//   - a run by hand, asbl/ci/jenkins/e2e-by-hand.sh: one spec file or some of its tests, or a quarter of the full set, on
//     the chosen E2E_TARGET in the chosen E2E_MODE. The run is a detached container (or the Windows driver) owned by the
//     host, so closing the browser or restarting Jenkins never stops it.
// NIGHTLY_ON (a tick box, Configure -> Save, no build): unticked, a timed build only says "nightly off" and runs nothing;
// a press by hand always runs. seed.groovy keeps the tick as it finds it.
// Before either script runs, the host's checkout is fast-forwarded to origin/main, so the build runs the scripts as
// pushed. A timed or nightly build does it only while the CI is free (release-rehearsal.sh busy): a release round's pinned
// checkout is never moved, and the night says SKIPPED instead. A run by hand always does it, as its dp-ci.sh run would
// as it starts.
// A red run, by ON_FAILURES (the scripts' headers): fix-prove-then-wait-for-review (the default) = its fix round works in
// a scratch clone; when its fix waits, this build pauses outside any node (no executor held) with the fix's report and
// diff: Proceed = that diff committed and pushed (a night's red pair then runs first the next night), Abort = dropped.
// fix-prove-then-rerun-automatically = the fixer pushes itself. No disableConcurrentBuilds: a build paused for a review
// must not hold the next one. One night at a time is scheduled-e2e.sh's rule, one dp-ci run at a time dp-ci.sh's, one
// Windows run at a time win-e2e.sh's: a second one is refused in seconds and says why.
// After every build (post { always }), the quarters' texts the form shows under WHAT_TO_RUN are written again from the
// newest passed full set (e2e-by-hand.sh quarters: a one-second read, nothing run).

// hostCall(<command run in the repo on the host>, keepAll, quiet): one short SSH call, its output shown in the console as
// it comes (quiet: kept only). Returns [rc: its exit code (-1 or 255: the call itself failed), text: its whole output when
// keepAll, else its last line]
Map hostCall(String command, boolean keepAll, boolean quiet) {
  Map answer = [rc: -1, text: '']
  try {
    node {
      // host-call.out is rewritten by each call (tee or >) before the host answers, so it never holds an older answer
      String show = quiet ? '> host-call.out' : '| tee host-call.out'
      answer.rc = sh(returnStatus: true, script: """#!/bin/bash
set -o pipefail
q() { printf '%q' "\$1"; }
timeout 300 ssh -n -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "\$DP_HOST" "cd \$(q "\$DP_REPO") && ${command}" ${show}
""")
      if (fileExists('host-call.out')) {
        String out = readFile('host-call.out')
        answer.text = keepAll ? out : lastLine(out)
      }
    }
  } catch (err) {
    rethrowAbort(err)
    // the call itself broke (a Jenkins restart while it ran): rc -1, and the caller asks again or says so
    echo "The call to the host broke: ${err}"
  }
  return answer
}

// rethrowAbort(err): a person's Abort goes on up, so post { aborted } stops what this build started; anything else is the
// caller's
void rethrowAbort(err) {
  if (err instanceof org.jenkinsci.plugins.workflow.steps.FlowInterruptedException) {
    throw err
  }
}

// firstLineStartingWith(<text>, <prefix>): that line, or ''
String firstLineStartingWith(String text, String prefix) {
  for (String line : text.readLines()) {
    if (line.startsWith(prefix)) {
      return line
    }
  }
  return ''
}

// lastLineStartingWith(<text>, <prefix>): the last such line, or '' (after a fix round the second run is the verdict)
String lastLineStartingWith(String text, String prefix) {
  String found = ''
  for (String line : text.readLines()) {
    if (line.startsWith(prefix)) {
      found = line
    }
  }
  return found
}

// lastLine(<text>): its last non-empty line, or ''
String lastLine(String text) {
  List lines = text.trim().readLines()
  return lines ? lines[lines.size() - 1] : ''
}

// fieldsOf("FOLLOW next=123 state=running ended=no"): [next: '123', state: 'running', ended: 'no']
Map fieldsOf(String line) {
  Map fields = [:]
  for (String word : line.tokenize(' ')) {
    int eq = word.indexOf('=')
    if (eq > 0) {
      fields[word.substring(0, eq)] = word.substring(eq + 1)
    }
  }
  return fields
}

// whoStartedThisBuild(): the person who pressed it, else the cause (the timer: "Started by timer")
String whoStartedThisBuild() {
  try {
    def u = currentBuild.getBuildCauses('hudson.model.Cause$UserIdCause')
    return u ? u[0].userId : currentBuild.getBuildCauses()[0].shortDescription
  } catch (err) {
    return "(not read: ${err})"
  }
}

// startedByTimer(): this build is a timed night (its cause is the timer). When the cause cannot be read it is taken as
// one: a timed build runs only the nightly, and only while NIGHTLY_ON is ticked
boolean startedByTimer() {
  try {
    return !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
  } catch (err) {
    echo "The build's cause was not read (${err}): taken as a timed night."
    return true
  }
}

// the checkout put on origin/main before a script runs (a fast-forward only; local changes or another history: left as
// it is, said so). A nightly build: only while the CI is free, else SKIPPED here without running the script (which says
// only the same), so a release round's pinned checkout is never moved.
// Both go inside the local "..." of an ssh call: each \$ and \" is the host's (unescaped by the local shell), as a bare
// $(...) would run here, in the Jenkins container
String checkoutToMain = '{ git fetch -q origin && git merge -q --ff-only origin/main && echo CHECKOUT on \\$(git rev-parse --short HEAD), origin/main; } || echo WARN this checkout could not fast-forward to origin/main: it runs as it is, at \\$(git rev-parse --short HEAD)'
String nightlyCheckout = 'if busy=\\$(bash asbl/ci/jenkins/release-rehearsal.sh busy 2>&1); then ' + checkoutToMain + '; else echo \\"SKIPPED: the CI is busy: \\${busy#BUSY }\\"; exit 0; fi; '

// ---- the nightly ----

// showLabel(): the build list says where the night is, without opening the log (scheduled-e2e.sh label): this build's
// night once it is known, as a later night may start while this build pauses for a review
void showLabel() {
  Map label = hostCall('bash asbl/ci/jenkins/scheduled-e2e.sh label $(q "${NIGHT_DIR:-}")', false, true)
  if (label.rc == 0 && label.text) {
    currentBuild.description = label.text
  }
}

// publishNightReports(): the night's reports as scheduled-e2e.sh reports lists them, pulled into reports/: its result,
// its console and its flaky tests archived; each set's Playwright results as JUnit (the test counts and each failure),
// with its JSON archived. The Playwright HTML folders stay on the host (one full set's is up to 18 GB). Never fails the
// build: reports are shown, not enforced
void publishNightReports() {
  try {
    Map listing = hostCall('bash asbl/ci/jenkins/scheduled-e2e.sh reports $(q "$NIGHT_DIR")', true, true)
    List paths = []
    for (String line : listing.text.readLines()) {
      List f = line.tokenize(' ')
      if (f.size() == 3 && f[0] == 'REPORT') {
        paths.add(f[2])
      }
    }
    if (!paths) {
      echo 'The night has no reports (yet): nothing to show.'
      return
    }
    node {
      writeFile(file: 'reports.paths', text: paths.join('\n') + '\n')
      sh """#!/bin/bash
q() { printf '%q' "\$1"; }
rm -rf reports && mkdir -p reports
ssh -o BatchMode=yes "\$DP_HOST" "cd \$(q "\$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh \$(while IFS= read -r p; do [ -n "\$p" ] && printf '%q ' "\$p"; done < reports.paths)" | tar xzf - -C reports || echo "The night's reports: nothing pulled"
exit 0
"""
      archiveArtifacts(artifacts: 'reports/**', allowEmptyArchive: true)
      junit(testResults: 'reports/*-playwright.xml', allowEmptyResults: true, skipMarkingBuildUnstable: true)
    }
    echo "The night's reports are on this build's page (artifacts reports/, Test Result). Its Playwright HTML folders are on the host, next to each JSON."
  } catch (err) {
    rethrowAbort(err)
    echo "The reports were not all shown (they are on the host, see scheduled-e2e.sh reports): ${err}"
  }
}

// followFix(): the night's fix round for review, in polls of under a minute, until it no longer fixes. Returns its state
// then: waiting (its fix waits for review), no-fix, ended (BLOCKED, stopped), or proceeded, aborted (decided from a shell)
String followFix() {
  int failedCalls = 0
  String lastState = ''
  while (true) {
    Map call = hostCall('FIX_ROUND_POLL=15 bash asbl/ci/jenkins/scheduled-e2e.sh fix wait $(q "$NIGHT_DIR") --for 45', false, true)
    Map fix = call.text.startsWith('FIX_ROUND ') ? fieldsOf(call.text) : [:]
    if (!fix.state) {
      // the host did not answer: the round goes on there; ask again
      failedCalls++
      if (failedCalls % 10 == 1) {
        echo "The host did not answer (exit ${call.rc}, ${failedCalls} time(s) in a row): asking again every 30 s. The fix round goes on there."
      }
      sleep(time: 30, unit: 'SECONDS')
      continue
    }
    failedCalls = 0
    if (fix.state != lastState) {
      lastState = fix.state
      echo call.text
      showLabel()
    }
    if (fix.state != 'fixing') {
      return fix.state
    }
  }
}

// followNight(): the night's console from the byte the build reached, in polls of under a minute, until its tests end (its
// NIGHT END line) or it ends otherwise. Returns its state then: green, red, fixing (red, its fix round going), stopped
String followNight() {
  int failedCalls = 0
  String lastState = ''
  while (true) {
    Map call = hostCall("bash asbl/ci/jenkins/scheduled-e2e.sh follow --from ${env.NIGHT_NEXT_BYTE ?: '0'} --for 45", false, false)
    Map follow = call.text.startsWith('FOLLOW ') ? fieldsOf(call.text) : [:]
    if (!follow.next || !follow.state) {
      // the host did not answer (a Jenkins restart killed the call, the network): the night goes on there; ask again
      failedCalls++
      if (failedCalls % 10 == 1) {
        echo "The host did not answer (exit ${call.rc}, ${failedCalls} time(s) in a row): asking again every 30 s. The night goes on there."
      }
      sleep(time: 30, unit: 'SECONDS')
      continue
    }
    failedCalls = 0
    env.NIGHT_NEXT_BYTE = follow.next
    if (follow.state != lastState) {
      lastState = follow.state
      showLabel()
    }
    if (follow.state == 'running' || (follow.state == 'fixing' && follow.ended != 'yes')) {
      continue
    }
    return follow.state
  }
}

// ---- the review of a fix, the same for a night and a run by hand ----

// reviewPause(<what>, <after a proceed>): the fix waits for review: its report and diff shown (the console, and reports/
// on the build page), then a pause outside any node until a person presses Proceed (FIX_TOOL proceed) or Abort
// (post { aborted }: FIX_TOOL abort). FIX_TOOL and FIX_FOLDER are set by the caller. Returns the proceed's answer, or why
// nothing was pushed
String reviewPause(String what, String afterProceed) {
  hostCall('$FIX_TOOL status $(q "$FIX_FOLDER") && cat $(q "$FIX_FOLDER")/fix-report.md $(q "$FIX_FOLDER")/fix.diff', true, false)
  while (true) {
    env.AT_REVIEW_PAUSE = 'yes'
    def answer = input(message: "${what}'s fix waits for review: its report and its diff are above, and on this build's page (reports/fix-report.md, reports/fix.diff).\nProceed = that diff committed and pushed to main as one commit${afterProceed}. Abort = the fix dropped, nothing reaches main.",
                       ok: 'Proceed: commit and push the fix', submitterParameter: 'PROCEED_BY')
    env.AT_REVIEW_PAUSE = ''
    env.PROCEED_BY = (answer instanceof Map) ? "${answer['PROCEED_BY']}" : "${answer}"
    Map proceed = hostCall('$FIX_TOOL proceed $(q "$FIX_FOLDER") $(q "$PROCEED_BY")', true, false)
    if (proceed.rc == 0) {
      return (firstLineStartingWith(proceed.text, 'FIX_COMMIT=') ?: 'its fix is on main') + " (reviewed by ${env.PROCEED_BY})"
    }
    Map status = hostCall('$FIX_TOOL status $(q "$FIX_FOLDER")', false, false)
    if (!status.text.startsWith('FIX_ROUND state=waiting ')) {
      return "nothing pushed by this build: ${status.text}"
    }
    echo 'The proceed failed (its FAIL line above): nothing was pushed and the fix still waits. Proceed again, or Abort.'
  }
}

pipeline {
  agent none

  options {
    timestamps()
  }

  environment {
    DP_HOST = 'root@172.19.0.1'
    DP_REPO = '/var/kraft-internalsystems/projects/all-repos/src/products/reportburster'
    // a run by hand's reports when it printed no BY_HAND_JSON line: those of the newest run log (pull-reports.sh)
    REPORT_PATHS = '@run/-playwright.xml @run/-playwright-html'
  }

  stages {
    stage('What runs') {
      steps {
        script {
          // a timer's build has every parameter at its default (NIGHTLY_ON: the tick in Configure); the defaults here
          // are the job's own, for a first build
          boolean timed = startedByTimer()
          env.STARTED_BY = whoStartedThisBuild()
          env.RUN_ON_FAILURES = params.ON_FAILURES ?: 'fix-prove-then-wait-for-review'
          env.RUN_DRY_RUN = params.DRY_RUN ?: 'no'
          if (timed && params.NIGHTLY_ON == false) {
            env.RUN_KIND = 'off'
            currentBuild.description = 'nightly off (NIGHTLY_ON unticked in Configure): nothing ran'
            currentBuild.result = 'NOT_BUILT'
            echo 'The nightly is off: NIGHTLY_ON is unticked in Configure. Nothing ran. Tick it and Save to run every night again.'
            return
          }
          env.RUN_KIND = (timed || params.WHAT_TO_RUN == 'next-nightly-pair') ? 'nightly' : 'by-hand'
          if (env.RUN_KIND == 'nightly') {
            echo "The nightly${timed ? ' (the timer)' : ''}: the next pair of the rotation, production-packaged (WHAT_TO_RUN, E2E_TARGET, E2E_MODE, E2E_SPEC, E2E_GREP and E2E_PACKAGE do not apply).\nON_FAILURES=${env.RUN_ON_FAILURES}\nDRY_RUN=${env.RUN_DRY_RUN}\nstarted by: ${env.STARTED_BY}"
          } else {
            echo "A run by hand:\nWHAT_TO_RUN=${params.WHAT_TO_RUN}\nE2E_TARGET=${params.E2E_TARGET}\nE2E_MODE=${params.E2E_MODE}\nE2E_SPEC=${params.E2E_SPEC}\nE2E_GREP=${params.E2E_GREP}\nE2E_PACKAGE=${params.E2E_PACKAGE}\nON_FAILURES=${env.RUN_ON_FAILURES}\nDRY_RUN=${env.RUN_DRY_RUN}\nstarted by: ${env.STARTED_BY}"
          }
        }
      }
    }

    stage('Start the night') {
      when {
        expression { env.RUN_KIND == 'nightly' }
      }
      steps {
        script {
          Map start = hostCall(nightlyCheckout + 'ON_FAILURES=$(q "$RUN_ON_FAILURES") DRY_RUN=$(q "$RUN_DRY_RUN") SCHEDULED_STARTED_BY=$(q "$STARTED_BY") bash asbl/ci/jenkins/scheduled-e2e.sh start', true, false)
          if (start.rc == 0) {
            // skipped (the CI busy, the night before still going), or off by the host's own switch: green, the reason as
            // the label
            String off = firstLineStartingWith(start.text, 'OFF ')
            currentBuild.description = off ? off.replaceFirst(/^OFF +/, '').replaceFirst(/: no night .*$/, '') : (firstLineStartingWith(start.text, 'SKIPPED') ?: 'SKIPPED: see the log')
            return
          }
          if (start.rc == 2) {
            String refused = firstLineStartingWith(start.text, 'FAIL') ?: firstLineStartingWith(start.text, 'MISSING') ?: 'a wrong input: see the log'
            currentBuild.description = refused
            error(refused)
          }
          // the night started (or, when the call itself failed in a restart, may have: followed only if so). Its folder
          // (status: result=<folder>/result.txt) names it from now on: a later night may start while this build pauses
          Map status = hostCall('bash asbl/ci/jenkins/scheduled-e2e.sh status', false, false)
          if (start.rc != 5 && !status.text.startsWith('NIGHT state=running ')) {
            error("The start could not be confirmed (exit ${start.rc}): ${status.text}")
          }
          env.NIGHT_DIR = (fieldsOf(status.text).result ?: '').replaceAll('/result\\.txt$', '')
          env.NIGHT_STARTED = 'yes'
        }
      }
    }
    stage('Follow the night') {
      when {
        expression { env.NIGHT_STARTED == 'yes' }
      }
      steps {
        script {
          String state = followNight()
          showLabel()
          publishNightReports()
          if (state == 'green') {
            echo 'The night is green: every set passed.'
          } else if (state == 'fixing') {
            error('The night is red: its fix round goes on on the host (bash asbl/ci/jenkins/scheduled-e2e.sh status); the next night skips while it goes. The failures are in the night\'s result.txt (reports/).')
          } else if (state == 'red' && hostCall('bash asbl/ci/jenkins/scheduled-e2e.sh fix status $(q "$NIGHT_DIR")', false, true).text.startsWith('FIX_ROUND state=fixing ')) {
            env.FIX_TOOL = 'bash asbl/ci/jenkins/scheduled-e2e.sh fix'
            env.FIX_FOLDER = env.NIGHT_DIR
            env.FIX_FOLLOWED = 'yes'
            String fixState = followFix()
            String decided = "its fix round ended ${fixState}: nothing to review"
            if (fixState == 'waiting') {
              publishNightReports()
              decided = reviewPause('The night', '; the red pair runs first the next night')
            }
            env.FIX_FOLLOWED = ''
            showLabel()
            error("The night is red; ${decided}. The failures are in the night's result.txt (reports/).")
          } else if (state == 'red') {
            error('The night is red (ON_FAILURES=report-only, or no fixer set, or its fix round could not start, or another night\'s fix still waits for review: above). The failures are in the night\'s result.txt (reports/).')
          } else if (state == 'stopped') {
            // stopped from the host (a release press goes before a night): not a failure of the code
            env.NIGHT_STOPPED_ON_THE_HOST = 'yes'
            currentBuild.result = 'ABORTED'
            echo 'The night was stopped on the host (its STOPPED line above says by whom).'
          } else {
            error("The night ended ${state}: see its console above.")
          }
        }
      }
    }

    stage('Run by hand') {
      when {
        beforeAgent true
        expression { env.RUN_KIND == 'by-hand' }
      }
      agent any
      options {
        timeout(time: 30, unit: 'HOURS')
      }
      stages {
        stage('Run on the host') {
          steps {
            // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            sh """#!/bin/bash
set -o pipefail
q() { printf '%q' "\$1"; }
rm -f by-hand.out
ssh -o BatchMode=yes "\$DP_HOST" "cd \$(q "\$DP_REPO") && ${checkoutToMain}; WHAT_TO_RUN=\$(q "\$WHAT_TO_RUN") E2E_TARGET=\$(q "\$E2E_TARGET") E2E_MODE=\$(q "\$E2E_MODE") E2E_SPEC=\$(q "\$E2E_SPEC") E2E_GREP=\$(q "\$E2E_GREP") E2E_PACKAGE=\$(q "\$E2E_PACKAGE") ON_FAILURES=\$(q "\$RUN_ON_FAILURES") DRY_RUN=\$(q "\$RUN_DRY_RUN") bash asbl/ci/jenkins/e2e-by-hand.sh" | tee by-hand.out
"""
            }
            script {
              // a red run's folder, and whether its fix waits for review (e2e-by-hand.sh's lines)
              String out = fileExists('by-hand.out') ? readFile('by-hand.out') : ''
              env.BY_HAND_RUN_FOLDER = firstLineStartingWith(out, 'BY_HAND_RUN_FOLDER=').replaceFirst('^BY_HAND_RUN_FOLDER=', '')
              env.BY_HAND_FIX_WAITS = (env.BY_HAND_RUN_FOLDER && firstLineStartingWith(out, 'FIX_ROUND state=waiting ')) ? 'yes' : ''
              // the last run's Playwright JSON report: its JUnit XML and HTML folder are named after it, on every target
              env.BY_HAND_JSON = lastLineStartingWith(out, 'BY_HAND_JSON=').replaceFirst('^BY_HAND_JSON=', '')
              String result = lastLineStartingWith(out, 'BY_HAND_RESULT=') ?: firstLineStartingWith(out, 'FAIL  ')
              if (result) {
                currentBuild.description = result.replaceFirst('^BY_HAND_RESULT=', '')
              }
            }
          }
        }
        stage('Reports') {
          steps {
            // Pulls the run's reports from the host into ./reports. Never fails the build (reports are shown, not enforced).
            sh '''#!/bin/bash
rm -rf reports; mkdir -p reports
q() { printf '%q' "$1"; }
# the run's reports, named after its JSON report (a Windows lane's too); else after the newest run log
paths="$REPORT_PATHS"
[ -z "$BY_HAND_JSON" ] || paths="$(q "${BY_HAND_JSON%.json}.xml") $(q "${BY_HAND_JSON%.json}-html")"
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $paths" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's files are named after its log (<ts>-e2e-<sha>-playwright...): give them the fixed names the publishers need
for f in reports/*-playwright.xml; do [ -e "$f" ] && mv "$f" reports/playwright.xml; done
for d in reports/*-playwright-html; do [ -e "$d" ] && rm -rf reports/playwright-html && mv "$d" reports/playwright-html; done
# a red run's result, and its fix's report and diff when it waits for review
if [ -n "$BY_HAND_RUN_FOLDER" ]; then
  ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $(q "$BY_HAND_RUN_FOLDER/result.txt") $(q "$BY_HAND_RUN_FOLDER/fix-report.md") $(q "$BY_HAND_RUN_FOLDER/fix.diff")" | tar xzf - -C reports || echo "The run's folder: nothing pulled"
fi
exit 0
'''
            archiveArtifacts(artifacts: 'reports/result.txt, reports/fix-report.md, reports/fix.diff', allowEmptyArchive: true)
            junit testResults: 'reports/playwright.xml', allowEmptyResults: true, skipMarkingBuildUnstable: true
            publishHTML(target: [reportName: 'Playwright report', reportDir: 'reports/playwright-html', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
          }
        }
      }
    }
    stage('Review the fix') {
      when {
        expression { env.BY_HAND_FIX_WAITS == 'yes' }
      }
      steps {
        script {
          env.FIX_TOOL = 'bash asbl/ci/jenkins/fix-round.sh'
          env.FIX_FOLDER = env.BY_HAND_RUN_FOLDER
          currentBuild.description = 'red; ' + reviewPause('The run', '')
        }
      }
    }
  }

  post {
    always {
      script {
        // the form's quarters (WHAT_TO_RUN's block): each one's files, tests and time, from the newest passed full set
        hostCall('bash asbl/ci/jenkins/e2e-by-hand.sh quarters', false, true)
      }
    }
    aborted {
      script {
        // a person's Abort. While this build follows a fix round or pauses for its review: that fix aborted (fix-round.sh
        // refuses one decided meanwhile). Else, for a night: it stops, only a night this build started and not one
        // already stopped on the host. A run by hand goes on on the host (closing the following only), as before
        env.STOP_BY = "an Abort of the Jenkins build ${env.BUILD_TAG}"
        if (env.FIX_FOLLOWED == 'yes' || env.AT_REVIEW_PAUSE == 'yes') {
          hostCall('$FIX_TOOL abort $(q "$FIX_FOLDER") $(q "$STOP_BY")', true, false)
        } else if (env.NIGHT_STARTED == 'yes' && env.NIGHT_STOPPED_ON_THE_HOST != 'yes') {
          hostCall('STOP_BY=$(q "$STOP_BY") bash asbl/ci/jenkins/scheduled-e2e.sh stop', true, false)
        }
      }
    }
  }
}

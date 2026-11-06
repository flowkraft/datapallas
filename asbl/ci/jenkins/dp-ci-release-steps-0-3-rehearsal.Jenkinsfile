// Job datapallas/dp-ci-release-steps-0-3-rehearsal: the release round. One press takes RELEASE_VERSION to "ready to upload":
// step 0, step 1's lanes, then steps 2 and 3 on one commit; a red run leads to a fix round (ON_FAILURES), then a run again
// from the start, until green. The upload stays a separate press. Its full description is in asbl/ci/jenkins/seed.groovy,
// which makes the job; the guide is asbl/ci/jenkins/jenkins.md, section dp-ci-release-steps-0-3-rehearsal.
// A LIGHT WRAPPER: the round is asbl/ci/jenkins/release-rehearsal.sh on the host (a person or an AI coordinator runs the same
// from a shell, the seven parameters being its environment). This file starts it, follows its console in polls of under a
// minute, pauses with Proceed while the round waits for a review, and shows each run's reports. The round runs detached on
// the host, so:
//   - no executor is held while it runs: `agent none`, and only the short SSH calls (roundCall) take one;
//   - a Jenkins restart only resumes the polling from the byte the build had reached; it never stops the round;
//   - an Abort pressed by a person (the build's, or the pause's) stops the round: post { aborted }. A restart never aborts
//     a build (it resumes), and the job has no timeout on purpose: a round lasts until green, red or stopped;
//   - a round that ends stopped (its process gone: a crash; or a person's stop) gets release-rehearsal.sh stop too, so
//     nothing it started stays running (after a person's stop: "nothing to stop").

// roundCall(<command run in the repo on the host>, keepAll, stdinVariable, quiet): one short SSH call, its output shown in
// the console as it comes (quiet: kept only). Returns [rc: its exit code (-1 or 255: the call itself failed), text: its whole
// output when keepAll, else its last line]. stdinVariable: the environment variable whose value goes to the call on stdin
// (E2E_APPROVAL: never on a command line, where ps shows it)
Map roundCall(String command, boolean keepAll, String stdinVariable, boolean quiet) {
  Map answer = [rc: -1, text: '']
  try {
    node {
      String feed = stdinVariable ? "printf '%s' \"\$${stdinVariable}\" |" : ''
      String noStdin = stdinVariable ? '' : '-n'
      // round-call.out is rewritten by each call (tee or >) before the host answers, so it never holds an older answer
      String show = quiet ? '> round-call.out' : '| tee round-call.out'
      answer.rc = sh(returnStatus: true, script: """#!/bin/bash
set -o pipefail
q() { printf '%q' "\$1"; }
${feed} timeout 300 ssh ${noStdin} -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "\$DP_HOST" "cd \$(q "\$DP_REPO") && ${command}" ${show}
""")
      if (fileExists('round-call.out')) {
        String out = readFile('round-call.out')
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

// rethrowAbort(err): a person's Abort (the build's, or the pause's) goes on up, so post { aborted } stops the round;
// anything else is the caller's to handle
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

// lastLine(<text>): its last non-empty line, or ''
String lastLine(String text) {
  List lines = text.trim().readLines()
  return lines ? lines[lines.size() - 1] : ''
}

// fieldsOf("FOLLOW next=123 state=running"): [next: '123', state: 'running']
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

String whoStartedThisBuild() {
  try {
    def u = currentBuild.getBuildCauses('hudson.model.Cause$UserIdCause')
    return u ? u[0].userId : currentBuild.getBuildCauses()[0].shortDescription
  } catch (err) {
    return "(not read: ${err})"
  }
}

// showLabel(): the build list says where the round is, without opening the log (release-rehearsal.sh label)
void showLabel() {
  Map label = roundCall('bash asbl/ci/jenkins/release-rehearsal.sh label', false, '', true)
  if (label.rc == 0 && label.text) {
    currentBuild.description = label.text
  }
}

// publishEndedRuns(): the reports of each run that has ended and is not shown yet, as its result.txt lists them
// (release-rehearsal.sh reports), pulled into reports/run-<n>/: the result, the summary, the failure reports and the flaky
// tests archived; Playwright's results as JUnit (the test counts and each failure) with its JSON archived; the Robot
// results. Playwright's HTML folders stay on the host (one full run's is up to 18 GB): reports/run-<n>/report-paths.txt
// lists them with every other file, by path. Never fails the build: reports are shown, not enforced
void publishEndedRuns() {
  try {
    Map listing = roundCall('bash asbl/ci/jenkins/release-rehearsal.sh reports', true, '', true)
    Map pathsOfRun = [:]
    for (String line : listing.text.readLines()) {
      List f = line.tokenize(' ')
      if (f.size() == 4 && f[0] == 'REPORT') {
        if (!pathsOfRun.containsKey(f[1])) {
          pathsOfRun[f[1]] = []
        }
        pathsOfRun[f[1]].add(f[2] + ' ' + f[3])
      }
    }
    // an index loop around steps: what it holds is saved at each step, so a Jenkins restart resumes it
    List runs = new ArrayList(pathsOfRun.keySet())
    for (int r = 0; r < runs.size(); r++) {
      String run = runs[r]
      if ((env.ROUND_RUNS_SHOWN ?: '').contains(",${run},")) {
        continue
      }
      List pulled = []
      List htmlFolders = []
      String robotFolder = ''
      for (String partAndPath : pathsOfRun[run]) {
        String path = partAndPath.substring(partAndPath.indexOf(' ') + 1)
        String name = path.substring(path.lastIndexOf('/') + 1)
        if (name.endsWith('-playwright-html')) {
          htmlFolders.add(partAndPath)
        } else {
          pulled.add(path)
          if (partAndPath.startsWith('robot ')) {
            robotFolder = name
          }
        }
      }
      node {
        writeFile(file: "reports/run-${run}/report-paths.txt", text: "Run ${run}'s reports on the host (part, path). The Playwright HTML folders are not copied here (each up to 18 GB): open them on the host, or pull one with asbl/ci/jenkins/pull-reports.sh.\n" + pathsOfRun[run].join('\n') + '\n')
        writeFile(file: "reports/run-${run}.paths", text: pulled.join('\n') + '\n')
        sh """#!/bin/bash
q() { printf '%q' "\$1"; }
ssh -o BatchMode=yes "\$DP_HOST" "cd \$(q "\$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh \$(while IFS= read -r p; do [ -n "\$p" ] && printf '%q ' "\$p"; done < reports/run-${run}.paths)" | tar xzf - -C reports/run-${run} || echo "Reports of run ${run}: nothing pulled"
exit 0
"""
        archiveArtifacts(artifacts: "reports/run-${run}/**", allowEmptyArchive: true)
        junit(testResults: "reports/run-${run}/*-playwright.xml", allowEmptyResults: true, skipMarkingBuildUnstable: true)
        if (robotFolder && fileExists("reports/run-${run}/${robotFolder}/output.xml")) {
          robot(outputPath: "reports/run-${run}/${robotFolder}", outputFileName: 'output.xml', logFileName: 'log.html', reportFileName: 'report.html', passThreshold: 0.0, unstableThreshold: 0.0, otherFiles: '**/*.png')
        }
      }
      env.ROUND_RUNS_SHOWN = (env.ROUND_RUNS_SHOWN ?: ',') + "${run},"
      echo "Run ${run}'s reports are on this build's page (artifacts reports/run-${run}/, Test Result). Its Playwright HTML on the host: ${htmlFolders ? htmlFolders.join('; ') : 'none'}"
    }
  } catch (err) {
    rethrowAbort(err)
    echo "The reports were not all shown (they are on the host, see release-rehearsal.sh reports): ${err}"
  }
}

// reviewPause(): the round waits for a review: the build shows what to review and pauses, outside any node, until a person
// presses Proceed (the round runs again from the start) or Abort (post { aborted } stops the round)
void reviewPause() {
  publishEndedRuns()
  Map review = roundCall('bash asbl/ci/jenkins/release-rehearsal.sh review', true, '', false)
  env.ROUND_AT_REVIEW_PAUSE = 'yes'
  def answer = input(message: "${review.text}\nProceed = run again from the start. Abort = stop the round.",
                     ok: 'Proceed: run again from the start', submitterParameter: 'PROCEED_BY')
  env.ROUND_AT_REVIEW_PAUSE = ''
  env.ROUND_PROCEED_BY = (answer instanceof Map) ? "${answer['PROCEED_BY']}" : "${answer}"
  roundCall('PROCEED_BY=$(q "$ROUND_PROCEED_BY") bash asbl/ci/jenkins/release-rehearsal.sh proceed', true, '', false)
}

// followRound(): the round's console from the byte the build reached, in polls of under a minute, until it is neither
// running nor fixing (a review pause in between, as often as the round asks). Returns the state it ended in
String followRound() {
  String lastState = ''
  int failedCalls = 0
  while (true) {
    Map call = roundCall("bash asbl/ci/jenkins/release-rehearsal.sh follow --from ${env.ROUND_NEXT_BYTE ?: '0'} --for 45", false, '', false)
    Map follow = call.text.startsWith('FOLLOW ') ? fieldsOf(call.text) : [:]
    if (!follow.next || !follow.state) {
      // the host did not answer (a Jenkins restart killed the call, the network): the round goes on there; ask again
      failedCalls++
      if (failedCalls % 10 == 1) {
        echo "The host did not answer (exit ${call.rc}, ${failedCalls} time(s) in a row): asking again every 30 s. The round goes on there."
      }
      sleep(time: 30, unit: 'SECONDS')
      continue
    }
    failedCalls = 0
    env.ROUND_NEXT_BYTE = follow.next
    if (follow.state != lastState) {
      lastState = follow.state
      showLabel()
      publishEndedRuns()
    }
    if (follow.state == 'running' || follow.state == 'fixing') {
      continue
    }
    if (follow.state == 'waiting-for-review') {
      reviewPause()
      lastState = ''
      continue
    }
    return follow.state
  }
}

pipeline {
  agent none

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    DP_HOST = 'root@172.19.0.1'
    DP_REPO = '/var/kraft-internalsystems/projects/all-repos/src/products/reportburster'
  }

  stages {
    stage('Start the round') {
      steps {
        script {
          env.ROUND_STARTED_BY = whoStartedThisBuild()
          // the Advanced (Parallelization) values: 1, and 0 for the swap, when the job has no such parameter yet (a seed not applied)
          env.SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS = params.SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS ?: '1'
          env.USE_N_NUMBER_OF_WINDOWS_VMS = params.USE_N_NUMBER_OF_WINDOWS_VMS ?: '1'
          env.USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP = params.USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP ?: '0'
          env.ROUND_SETTINGS = "RELEASE_VERSION=${params.RELEASE_VERSION ?: ''}\nON_FAILURES=${params.ON_FAILURES}\nRELEASE_PIN=${params.RELEASE_PIN ?: ''}\nDRY_RUN=${params.DRY_RUN}\nE2E_APPROVAL=${params.E2E_APPROVAL ? 'given (its text is never written down by the round)' : 'none'}\nSPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=${env.SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS}\nUSE_N_NUMBER_OF_WINDOWS_VMS=${env.USE_N_NUMBER_OF_WINDOWS_VMS}\nUSE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP=${env.USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP}\nstarted by: ${env.ROUND_STARTED_BY}\n"
          echo "The settings of this round:\n${env.ROUND_SETTINGS}"
          // the estimate of the two Advanced values first, as the form's block draws it (also without the uno-choice
          // plugin); it never stops the build
          roundCall('bash asbl/ci/jenkins/release-rehearsal.sh estimate $(q "$SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS") $(q "$USE_N_NUMBER_OF_WINDOWS_VMS")', false, '', false)
          Map start = roundCall('E2E_APPROVAL=\\$(cat) RELEASE_VERSION=$(q "$RELEASE_VERSION") ON_FAILURES=$(q "$ON_FAILURES") RELEASE_PIN=$(q "$RELEASE_PIN") DRY_RUN=$(q "$DRY_RUN") SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS=$(q "$SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS") USE_N_NUMBER_OF_WINDOWS_VMS=$(q "$USE_N_NUMBER_OF_WINDOWS_VMS") USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP=$(q "$USE_UP_TO_N_GB_OF_ZRAM_COMPRESSED_SWAP") ROUND_STARTED_BY=$(q "$ROUND_STARTED_BY") bash asbl/ci/jenkins/release-rehearsal.sh start', true, 'E2E_APPROVAL', false)
          if (start.rc == 2) {
            String refused = firstLineStartingWith(start.text, 'REFUSED') ?: 'REFUSED: see the log'
            currentBuild.description = refused
            error(refused)
          }
          if (start.rc != 5) {
            // the call itself failed (a restart during the start): the round may have started; follow it only if so
            Map status = roundCall('bash asbl/ci/jenkins/release-rehearsal.sh status', false, '', false)
            if (!status.text.startsWith('ROUND state=running ')) {
              error("The start could not be confirmed (exit ${start.rc}): ${status.text}")
            }
          }
          env.ROUND_STARTED = 'yes'
        }
      }
    }
    stage('Follow the round') {
      steps {
        script {
          String state = followRound()
          if (state == 'green' || state == 'released') {
            echo 'The round is green: ready to upload, a separate press (the round\'s console above names the presses).'
          } else if (state == 'green-not-ready') {
            unstable('Green, but not ready to upload: an UPLOAD=yes preflight said MISSING (above).')
          } else if (state == 'red') {
            error('The round is red (ON_FAILURES=report-only, or no fixer set): the failures are in the run\'s result.txt (above).')
          } else if (state == 'stopped') {
            // its process is gone (a crash, a reboot) or a person stopped it: what it started is stopped, as for an Abort
            env.ROUND_STOP_BY = "the Jenkins build ${env.BUILD_TAG} (the round ended stopped)"
            roundCall('STOP_BY=$(q "$ROUND_STOP_BY") bash asbl/ci/jenkins/release-rehearsal.sh stop', true, '', false)
            error('The round ended stopped: its process is gone, or a person stopped it (above). What it started is stopped.')
          } else {
            error("The round ended ${state}: see its console above.")
          }
        }
      }
    }
  }

  post {
    aborted {
      script {
        // a person's Abort (the build's, or the pause's): the round stops. Only a round this build started; and at a review
        // pause, only while the round still waits there (someone may have pressed proceed or stop from a shell meanwhile)
        if (env.ROUND_STARTED == 'yes') {
          Map status = roundCall('bash asbl/ci/jenkins/release-rehearsal.sh status', false, '', false)
          if (env.ROUND_AT_REVIEW_PAUSE == 'yes' && !status.text.startsWith('ROUND state=waiting-for-review ')) {
            echo "Aborted at the review pause, but the round no longer waits there (${status.text}): it is not stopped."
          } else {
            env.ROUND_STOP_BY = "an Abort of the Jenkins build ${env.BUILD_TAG}"
            roundCall('STOP_BY=$(q "$ROUND_STOP_BY") bash asbl/ci/jenkins/release-rehearsal.sh stop', true, '', false)
          }
        }
      }
    }
    cleanup {
      script {
        // last: the label and the reports of any run not shown yet, and the settings it ran with. Never turns a build red
        try {
          if (env.ROUND_STARTED == 'yes') {
            showLabel()
            publishEndedRuns()
          }
          node {
            writeFile(file: 'round-settings.txt', text: env.ROUND_SETTINGS ?: 'not read\n')
            archiveArtifacts(artifacts: 'round-settings.txt', allowEmptyArchive: true)
          }
        } catch (err) {
          rethrowAbort(err)
          echo "The label, reports or settings were not all shown: ${err}"
        }
      }
    }
  }
}

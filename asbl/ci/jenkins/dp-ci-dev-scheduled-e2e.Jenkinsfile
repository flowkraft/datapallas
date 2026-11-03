// Job datapallas/dp-ci-dev-scheduled-e2e: the nightly e2e of main. It starts by itself at 22:00 UTC (the timer is in
// asbl/ci/jenkins/seed.groovy, which makes the job and holds its full description); the guide is asbl/ci/jenkins/jenkins.md,
// section dp-ci-dev-scheduled-e2e.
// A LIGHT WRAPPER: the night is asbl/ci/jenkins/scheduled-e2e.sh on the host (a person or an agent runs the same from a
// shell, the two parameters being its environment). This file starts it, follows its console in polls of under a minute and
// shows its reports. The night runs detached on the host, so:
//   - no executor is held while it runs: `agent none`, and only the short SSH calls (nightCall) take one;
//   - a Jenkins restart (the nightly stack recreate, about 03:15 UTC, falls inside Saturday's full set) only resumes the
//     polling from the byte the build had reached; it never stops the night;
//   - an Abort pressed by a person stops the night: post { aborted }. No timeout on purpose: Saturday's night lasts up to
//     about 16 h, and every lane has its own cap.
// The build ends when the night's tests end (its NIGHT END line). After a red night its fix round goes on, on the host
// (ON_FAILURES=fix); the next night skips while it goes.

// nightCall(<command run in the repo on the host>, keepAll, quiet): one short SSH call, its output shown in the console as
// it comes (quiet: kept only). Returns [rc: its exit code (-1 or 255: the call itself failed), text: its whole output when
// keepAll, else its last line]
Map nightCall(String command, boolean keepAll, boolean quiet) {
  Map answer = [rc: -1, text: '']
  try {
    node {
      // night-call.out is rewritten by each call (tee or >) before the host answers, so it never holds an older answer
      String show = quiet ? '> night-call.out' : '| tee night-call.out'
      answer.rc = sh(returnStatus: true, script: """#!/bin/bash
set -o pipefail
q() { printf '%q' "\$1"; }
timeout 300 ssh -n -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "\$DP_HOST" "cd \$(q "\$DP_REPO") && ${command}" ${show}
""")
      if (fileExists('night-call.out')) {
        String out = readFile('night-call.out')
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

// rethrowAbort(err): a person's Abort goes on up, so post { aborted } stops the night; anything else is the caller's
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

// showLabel(): the build list says where the night is, without opening the log (scheduled-e2e.sh label)
void showLabel() {
  Map label = nightCall('bash asbl/ci/jenkins/scheduled-e2e.sh label', false, true)
  if (label.rc == 0 && label.text) {
    currentBuild.description = label.text
  }
}

// publishReports(): the night's reports as scheduled-e2e.sh reports lists them, pulled into reports/: its result, its
// console and its flaky tests archived; each set's Playwright results as JUnit (the test counts and each failure), with its
// JSON archived. The Playwright HTML folders stay on the host (one full set's is up to 18 GB). Never fails the build:
// reports are shown, not enforced
void publishReports() {
  try {
    Map listing = nightCall('bash asbl/ci/jenkins/scheduled-e2e.sh reports', true, true)
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

// followNight(): the night's console from the byte the build reached, in polls of under a minute, until its tests end (its
// NIGHT END line) or it ends otherwise. Returns its state then: green, red, fixing (red, its fix round going), stopped
String followNight() {
  int failedCalls = 0
  String lastState = ''
  while (true) {
    Map call = nightCall("bash asbl/ci/jenkins/scheduled-e2e.sh follow --from ${env.NIGHT_NEXT_BYTE ?: '0'} --for 45", false, false)
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
    stage('Start the night') {
      steps {
        script {
          // a timer's build has every parameter at its default; the defaults here are the job's own, for a first build
          env.NIGHT_ON_FAILURES = params.ON_FAILURES ?: 'fix'
          env.NIGHT_DRY_RUN = params.DRY_RUN ?: 'no'
          env.NIGHT_STARTED_BY = whoStartedThisBuild()
          echo "The settings of this night:\nON_FAILURES=${env.NIGHT_ON_FAILURES}\nDRY_RUN=${env.NIGHT_DRY_RUN}\nstarted by: ${env.NIGHT_STARTED_BY}"
          Map start = nightCall('ON_FAILURES=$(q "$NIGHT_ON_FAILURES") DRY_RUN=$(q "$NIGHT_DRY_RUN") SCHEDULED_STARTED_BY=$(q "$NIGHT_STARTED_BY") bash asbl/ci/jenkins/scheduled-e2e.sh start', true, false)
          if (start.rc == 0) {
            // skipped (the CI busy, the night before still going): green, the reason as the label
            currentBuild.description = firstLineStartingWith(start.text, 'SKIPPED') ?: 'SKIPPED: see the log'
            return
          }
          if (start.rc == 2) {
            String refused = firstLineStartingWith(start.text, 'FAIL') ?: firstLineStartingWith(start.text, 'MISSING') ?: 'a wrong input: see the log'
            currentBuild.description = refused
            error(refused)
          }
          if (start.rc != 5) {
            // the call itself failed (a restart during the start): the night may have started; follow it only if so
            Map status = nightCall('bash asbl/ci/jenkins/scheduled-e2e.sh status', false, false)
            if (!status.text.startsWith('NIGHT state=running ')) {
              error("The start could not be confirmed (exit ${start.rc}): ${status.text}")
            }
          }
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
          publishReports()
          if (state == 'green') {
            echo 'The night is green: every set passed.'
          } else if (state == 'fixing') {
            error('The night is red: its fix round goes on on the host (bash asbl/ci/jenkins/scheduled-e2e.sh status); the next night skips while it goes. The failures are in the night\'s result.txt (reports/).')
          } else if (state == 'red') {
            error('The night is red (ON_FAILURES=report-only, or no fixer set, or its fix round could not start: above). The failures are in the night\'s result.txt (reports/).')
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
  }

  post {
    aborted {
      script {
        // a person's Abort: the night stops. Only a night this build started, and not one already stopped on the host
        if (env.NIGHT_STARTED == 'yes' && env.NIGHT_STOPPED_ON_THE_HOST != 'yes') {
          env.NIGHT_STOP_BY = "an Abort of the Jenkins build ${env.BUILD_TAG}"
          nightCall('STOP_BY=$(q "$NIGHT_STOP_BY") bash asbl/ci/jenkins/scheduled-e2e.sh stop', true, false)
        }
      }
    }
  }
}

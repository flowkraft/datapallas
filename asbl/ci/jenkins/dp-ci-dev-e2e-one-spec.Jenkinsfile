// Job datapallas/dp-ci-dev-e2e-one-spec: the fix-and-retry loop, dp-ci.sh e2e-loop: one spec file, or some of its tests, on web or
// electron-linux, never a package rebuild (E2E_PACKAGE says what happens to the package), or on a production-packaged lane
// (docker-server, windows-vm-docker, windows-vm-server, windows-vm-electron), as the nightly runs them. Never counts for a release.
// The work is the plain script asbl/ci/jenkins/one-spec.sh, run on the host over SSH exactly as it is run by hand (the
// parameters are its environment); this file only starts it, shows its log and its reports, and pauses for a review. The
// run is a detached container owned by the Docker daemon, so closing the browser or restarting Jenkins never stops it.
// A red run, by ON_FAILURES (one-spec.sh's header): fix-prove-then-wait-for-review (the default) = its fix round works in a
// scratch clone; when its fix waits, this build pauses outside any node (no executor held) with the fix's report and diff:
// Proceed = fix-round.sh proceed (that diff committed and pushed), Abort = fix-round.sh abort. One build at a time
// (disableConcurrentBuilds: one dp-ci run at a time), so while a build pauses the next one waits in the queue.
// Its full description (what, when, order, needs, time, examples, log) is in asbl/ci/jenkins/seed.groovy, which makes the job;
// the guide is asbl/ci/jenkins/jenkins.md, section dp-ci-dev-e2e-one-spec.

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

// fixCall(<fix-round.sh arguments, shell words>): one short SSH call to fix-round.sh on the host, its output in the
// console. Returns its exit code (255: the call itself failed)
int fixCall(String arguments) {
  int rc = -1
  node {
    rc = sh(returnStatus: true, script: """#!/bin/bash
q() { printf '%q' "\$1"; }
timeout 300 ssh -n -o BatchMode=yes -o ConnectTimeout=20 "\$DP_HOST" "cd \$(q "\$DP_REPO") && bash asbl/ci/jenkins/fix-round.sh ${arguments}"
""")
  }
  return rc
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
    REPORT_PATHS = '@run/-playwright.xml @run/-playwright-html'
  }

  stages {
    stage('Run') {
      agent any
      options {
        timeout(time: 30, unit: 'HOURS')
      }
      stages {
        stage('Run on the host') {
          steps {
            // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
rm -f one-spec.out
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && E2E_SPEC=$(q "$E2E_SPEC") E2E_GREP=$(q "$E2E_GREP") E2E_PACKAGE=$(q "$E2E_PACKAGE") E2E_TARGET=$(q "$E2E_TARGET") ON_FAILURES=$(q "${ON_FAILURES:-fix-prove-then-wait-for-review}") bash asbl/ci/jenkins/one-spec.sh" | tee one-spec.out
'''
            }
            script {
              // a red run's folder, and whether its fix waits for review (one-spec.sh's lines)
              String out = fileExists('one-spec.out') ? readFile('one-spec.out') : ''
              env.ONE_SPEC_RUN_FOLDER = firstLineStartingWith(out, 'ONE_SPEC_RUN_FOLDER=').replaceFirst('^ONE_SPEC_RUN_FOLDER=', '')
              env.ONE_SPEC_FIX_WAITS = (env.ONE_SPEC_RUN_FOLDER && firstLineStartingWith(out, 'FIX_ROUND state=waiting ')) ? 'yes' : ''
              // the last run's Playwright JSON report: its JUnit XML and HTML folder are named after it, on every target
              env.ONE_SPEC_JSON = lastLineStartingWith(out, 'ONE_SPEC_JSON=').replaceFirst('^ONE_SPEC_JSON=', '')
              String result = firstLineStartingWith(out, 'ONE_SPEC_RESULT=')
              if (result) {
                currentBuild.description = result.replaceFirst('^ONE_SPEC_RESULT=', '')
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
# the run's reports, named after its JSON report (a packaged Windows lane's too); else, as before, after the newest run log
paths="$REPORT_PATHS"
[ -z "$ONE_SPEC_JSON" ] || paths="$(q "${ONE_SPEC_JSON%.json}.xml") $(q "${ONE_SPEC_JSON%.json}-html")"
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $paths" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's files are named after its log (<ts>-e2e-<sha>-playwright...): give them the fixed names the publishers need
for f in reports/*-playwright.xml; do [ -e "$f" ] && mv "$f" reports/playwright.xml; done
for d in reports/*-playwright-html; do [ -e "$d" ] && rm -rf reports/playwright-html && mv "$d" reports/playwright-html; done
# a red run's result, and its fix's report and diff when it waits for review
if [ -n "$ONE_SPEC_RUN_FOLDER" ]; then
  ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $(q "$ONE_SPEC_RUN_FOLDER/result.txt") $(q "$ONE_SPEC_RUN_FOLDER/fix-report.md") $(q "$ONE_SPEC_RUN_FOLDER/fix.diff")" | tar xzf - -C reports || echo "The run's folder: nothing pulled"
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
        expression { env.ONE_SPEC_FIX_WAITS == 'yes' }
      }
      steps {
        script {
          // the fix's report and diff in the console (also reports/ on this build's page), then the pause, outside any node
          fixCall('status $(q "$ONE_SPEC_RUN_FOLDER") && cat $(q "$ONE_SPEC_RUN_FOLDER")/fix-report.md $(q "$ONE_SPEC_RUN_FOLDER")/fix.diff')
          while (true) {
            env.ONE_SPEC_AT_REVIEW_PAUSE = 'yes'
            def answer = input(message: "The run's fix waits for review: its report and its diff are above, and on this build's page (reports/fix-report.md, reports/fix.diff).\nProceed = that diff committed and pushed to main as one commit. Abort = the fix dropped, nothing reaches main.",
                               ok: 'Proceed: commit and push the fix', submitterParameter: 'PROCEED_BY')
            env.ONE_SPEC_AT_REVIEW_PAUSE = ''
            env.ONE_SPEC_PROCEED_BY = (answer instanceof Map) ? "${answer['PROCEED_BY']}" : "${answer}"
            if (fixCall('proceed $(q "$ONE_SPEC_RUN_FOLDER") $(q "$ONE_SPEC_PROCEED_BY")') == 0) {
              currentBuild.description = "red; its fix is on main (reviewed by ${env.ONE_SPEC_PROCEED_BY})"
              break
            }
            if (fixCall('status $(q "$ONE_SPEC_RUN_FOLDER") | grep -q \'^FIX_ROUND state=waiting \'') != 0) {
              echo 'The fix no longer waits (decided from a shell meanwhile, see fix-round.sh status): nothing pushed by this build.'
              break
            }
            echo 'The proceed failed (its FAIL line above): nothing was pushed and the fix still waits. Proceed again, or Abort.'
          }
        }
      }
    }
  }

  post {
    aborted {
      script {
        // an Abort at the review pause (the pause's or the build's): the fix dropped (fix-round.sh refuses one decided meanwhile)
        if (env.ONE_SPEC_AT_REVIEW_PAUSE == 'yes') {
          env.ONE_SPEC_ABORT_BY = "an Abort of the Jenkins build ${env.BUILD_TAG}"
          fixCall('abort $(q "$ONE_SPEC_RUN_FOLDER") $(q "$ONE_SPEC_ABORT_BY")')
        }
      }
    }
  }
}

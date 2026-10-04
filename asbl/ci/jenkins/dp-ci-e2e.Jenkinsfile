// Job datapallas/dp-ci-e2e. End-to-end tests: dp-ci.sh e2e. E2E_SPEC / E2E_GREP narrow it to a subset; both empty = the full suite. Needs the package of a previous build.
// The work is the plain script named below, run on the host over SSH exactly as it is run by hand; this file
// only starts it and shows its log. The run is a detached container owned by the Docker daemon, so closing
// the browser or restarting Jenkins never stops it (see asbl/ci/jenkins/jenkins.md).
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'HOURS')
  }

  environment {
    DP_HOST = 'root@172.19.0.1'
    DP_REPO = '/var/kraft-internalsystems/projects/all-repos/src/products/reportburster'
    // space-separated paths (globs allowed), relative to DP_REPO, pulled into ./reports by the Reports stage; see jenkins.md, "Reports"
    REPORT_PATHS = '@run/-playwright.xml @run/-playwright-html'
  }

  stages {
    stage('Run on the host') {
      steps {
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
case "$E2E_TARGET" in
  electron-windows-vm)
    # the Windows VM lane: dp-ci.sh win e2e, started by win-e2e.sh and followed by its pid
    RUN="FOLLOW_PIDFILE=/var/kraft-internalsystems/logs/datapallas-ci/win-e2e.pid bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/win-e2e.sh" ;;
  electron-linux)
    RUN="E2E_TARGET=electron bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e" ;;
  *)
    RUN="E2E_TARGET=$(q "$E2E_TARGET") bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e" ;;
esac
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && E2E_SPEC=$(q "$E2E_SPEC") E2E_GREP=$(q "$E2E_GREP") E2E_ROTATION_DATE=$(q "$E2E_ROTATION_DATE") $RUN"
'''
        }
      }
    }
    stage('Reports') {
      steps {
        // Pulls the run's reports from the host into ./reports. Never fails the build (reports are shown, not enforced).
        // The publisher steps (junit, coverage, warnings, HTML) are added below by the quality plan, one tool at a time.
        sh '''#!/bin/bash
rm -rf reports; mkdir -p reports
q() { printf '%q' "$1"; }
# the Windows lane has its own newest-log link, and its step log (dp-ci.sh win e2e) names the files <log>-step-playwright...
LOGDIR=/var/kraft-internalsystems/logs/datapallas-ci; LOGLINK=$LOGDIR/latest.log; RP="$REPORT_PATHS"
if [ "$E2E_TARGET" = electron-windows-vm ]; then LOGLINK=$LOGDIR/win-e2e-latest.log; RP="@run/-step-playwright.xml @run/-step-playwright-html"; fi
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && CI_LOG_LINK=$(q "$LOGLINK") bash asbl/ci/jenkins/pull-reports.sh $RP" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's files are named after its log (<ts>-e2e-<sha>-playwright...): give them the fixed names the publishers need
for f in reports/*-playwright.xml; do [ -e "$f" ] && mv "$f" reports/playwright.xml; done
for d in reports/*-playwright-html; do [ -e "$d" ] && rm -rf reports/playwright-html && mv "$d" reports/playwright-html; done
exit 0
'''
        // Playwright (J1): the JUnit XML = test counts and trend; the HTML report = every test with its steps, screenshots and trace.
        // Non-gating: neither step changes the result. keepAll false keeps only the latest report (traces are large).
        junit testResults: 'reports/playwright.xml', allowEmptyResults: true, skipMarkingBuildUnstable: true
        publishHTML(target: [reportName: 'Playwright report', reportDir: 'reports/playwright-html', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
      }
    }
  }
}

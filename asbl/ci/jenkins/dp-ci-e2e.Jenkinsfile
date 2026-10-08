// Job datapallas/dp-ci-e2e. The REAL end-to-end tests: dp-ci.sh e2e, on a package built from this exact commit (rebuilt first when it is not). Slow. E2E_SPEC narrows it to one file (a regex on the path); empty = the full suite. No title filter: it runs a file start to end. For the fast development loop use dp-ci-e2e-dev.
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
    REPORT_PATHS = '@run/-playwright.xml @run/-playwright-html @run/-openapi'
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
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && E2E_SPEC=$(q "$E2E_SPEC") E2E_ROTATION_DATE=$(q "$E2E_ROTATION_DATE") $RUN"
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
if [ "$E2E_TARGET" = electron-windows-vm ]; then LOGLINK=$LOGDIR/win-e2e-latest.log; RP="@run/-step-playwright.xml @run/-step-playwright-html @run/-step-robot"; fi
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && CI_LOG_LINK=$(q "$LOGLINK") bash asbl/ci/jenkins/pull-reports.sh $RP" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's files are named after its log (<ts>-e2e-<sha>-playwright...): give them the fixed names the publishers need
for f in reports/*-playwright.xml; do [ -e "$f" ] && mv "$f" reports/playwright.xml; done
for d in reports/*-playwright-html; do [ -e "$d" ] && rm -rf reports/playwright-html && mv "$d" reports/playwright-html; done
for d in reports/*-openapi; do [ -e "$d" ] && rm -rf reports/openapi && mv "$d" reports/openapi; done
for d in reports/*-robot; do [ -e "$d" ] && rm -rf reports/robot && mv "$d" reports/robot; done
exit 0
'''
        // Playwright (J1): the JUnit XML = test counts and trend; the HTML report = every test with its steps, screenshots and trace.
        // Non-gating: neither step changes the result. keepAll false keeps only the latest report (traces are large).
        junit testResults: 'reports/playwright.xml', allowEmptyResults: true, skipMarkingBuildUnstable: true
        // Robot Framework UAT (J10), Windows lane: a UAT step of the lane (W9, not there yet) leaves asbl/src/uat/results (output.xml, log.html, report.html)
        // as <step log>-robot next to its log; it is then shown with the Robot plugin: pass/fail trend, links to the report and the log.
        // Nothing is shown (and nothing fails) while no run has produced it. Thresholds 0 = never marks the build unstable.
        script {
          if (fileExists('reports/robot/output.xml')) {
            robot outputPath: 'reports/robot', outputFileName: 'output.xml', logFileName: 'log.html', reportFileName: 'report.html', passThreshold: 0.0, unstableThreshold: 0.0, otherFiles: '**/*.png'
          }
        }
        // springdoc OpenAPI + Swagger UI (J11): saved by dp-ci.sh e2e at the end of a docker-server run (the shipped server is up); the static Swagger UI page
        // reads the openapi.json next to it. Nothing is shown while no run has produced it. Needs the CSP relaxation of jenkins.md (it runs a script).
        publishHTML(target: [reportName: 'Swagger UI (OpenAPI)', reportDir: 'reports/openapi', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
        archiveArtifacts artifacts: 'reports/openapi/openapi.json', allowEmptyArchive: true
        publishHTML(target: [reportName: 'Playwright report', reportDir: 'reports/playwright-html', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
      }
    }
  }
}

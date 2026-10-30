// Job datapallas/dp-ci-release-step1-e2e-prerelease: the real e2e on a package built from this exact commit (dp-ci.sh e2e, or
// dp-ci.sh win e2e|docker-e2e|server-e2e for the Windows targets): step 1 of a release (four lanes green on one commit: the full
// set on this release's full lane, web or docker-server, alternated; E2E_SPEC=light on windows-vm-electron = its light set,
// e.g. E2E_TARGET=windows-vm-electron E2E_SPEC=light), and the
// everyday full e2e of the trunk. Each build records its verdict (asbl/ci/release-state.sh). The quick loop is dp-ci-dev-e2e-one-spec.
// Its full description (what, when, order, needs, time, examples, log) is in asbl/ci/jenkins/seed.groovy, which makes the job;
// the guide is asbl/ci/jenkins/jenkins.md, section dp-ci-release-step1-e2e-prerelease.
// THIN ON PURPOSE: the lane is asbl/ci/jenkins/release-step1.sh (the target's launcher, the prerequisites, build-if-needed,
// the job steps, and the release record's lines: the version line, full-lane --step1, record-step1), run on the host over
// SSH exactly as an agent, the release's orchestrator or a person runs it by hand, so a direct run is this job's run. This
// file only collects the parameters and who started the build, calls the script, shows its log and pulls the reports. The
// run is detached (a container owned by the Docker daemon, or the Windows driver), so closing the browser or restarting
// Jenkins never stops it (see asbl/ci/jenkins/jenkins.md).
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 72, unit: 'HOURS')
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
        script {
          // who started this build (release-step1.sh prints it and writes it as who chose the full lane): read from the
          // build's cause, no plugin needed. Never stops the build
          try {
            def u = currentBuild.getBuildCauses('hudson.model.Cause$UserIdCause')
            env.STEP1_STARTED_BY = u ? u[0].userId : currentBuild.getBuildCauses()[0].shortDescription
          } catch (err) {
            env.STEP1_STARTED_BY = "(not read: ${err})"
          }
        }
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
# the parameters and who started the build, passed to the script that is the lane (the header of this file); each part of the
# run is marked START/END with the time it took (asbl/ci/marks.sh): grep '^######## ' in the console
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") || exit 2; E2E_TARGET=$(q "$E2E_TARGET") E2E_SPEC=$(q "$E2E_SPEC") E2E_GREP=$(q "$E2E_GREP") E2E_ROTATION_DATE=$(q "$E2E_ROTATION_DATE") E2E_RETRIES=$(q "$E2E_RETRIES") STEP1_STARTED_BY=$(q "$STEP1_STARTED_BY") bash asbl/ci/jenkins/release-step1.sh"
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
# the Windows lanes have their own newest-log link, and their step log (dp-ci.sh win e2e / docker-e2e) names the files <log>-step-playwright...
LOGDIR=/var/kraft-internalsystems/logs/datapallas-ci; LOGLINK=$LOGDIR/latest.log; RP="$REPORT_PATHS"
if [ "$E2E_TARGET" = windows-vm-electron ] || [ "$E2E_TARGET" = windows-vm-docker ] || [ "$E2E_TARGET" = windows-vm-server ]; then LOGLINK=$LOGDIR/win-e2e-latest.log; RP="@run/-step-playwright.xml @run/-step-playwright-html @run/-step-robot"; fi
# the targets that may have built first: the image scan of the build (dp-ci.sh build writes it next to its own log)
TRIVY=""
case "$E2E_TARGET" in docker-server|windows-vm-docker|windows-vm-server) TRIVY='$(ls -1dt '"$LOGDIR"'/*-build-*-trivy 2>/dev/null | head -1)' ;; esac
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && T=$TRIVY && set -f && CI_LOG_LINK=$(q "$LOGLINK") bash asbl/ci/jenkins/pull-reports.sh $RP \\$T" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's files are named after its log (<ts>-e2e-<sha>-playwright...): give them the fixed names the publishers need
for f in reports/*-playwright.xml; do [ -e "$f" ] && mv "$f" reports/playwright.xml; done
for d in reports/*-playwright-html; do [ -e "$d" ] && rm -rf reports/playwright-html && mv "$d" reports/playwright-html; done
for d in reports/*-openapi; do [ -e "$d" ] && rm -rf reports/openapi && mv "$d" reports/openapi; done
for d in reports/*-robot; do [ -e "$d" ] && rm -rf reports/robot && mv "$d" reports/robot; done
for d in reports/*-trivy; do [ -e "$d" ] && rm -rf reports/trivy && mv "$d" reports/trivy; done
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
        // Trivy (J15), when this job built first: the HIGH and CRITICAL CVEs of the image, as a Warnings Next Generation table.
        recordIssues(tool: trivy(pattern: 'reports/trivy/trivy.json', id: 'trivy', name: 'Trivy'), enabledForFailure: true, skipBlames: true)
        archiveArtifacts artifacts: 'reports/trivy/trivy.json', allowEmptyArchive: true
        publishHTML(target: [reportName: 'Playwright report', reportDir: 'reports/playwright-html', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
      }
    }
  }
}

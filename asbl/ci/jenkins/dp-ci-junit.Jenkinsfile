// Job datapallas/dp-ci-junit. The JUnit gate: dp-ci.sh junit, for one module and test pattern (both empty = everything).
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
    REPORT_PATHS = 'bkend/*/target/surefire-reports bkend/*/target/site/jacoco'
  }

  stages {
    stage('Run on the host') {
      steps {
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && JUNIT_MODULE=$(q "$JUNIT_MODULE") JUNIT_TEST=$(q "$JUNIT_TEST") bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh junit"
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
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $REPORT_PATHS" | tar xzf - -C reports || echo "Reports: nothing pulled"
'''
        // JUnit (J9): Surefire's XML of every module = the test counts, the failed tests and the trend graph on the build page.
        // skipMarkingBuildUnstable: the report is shown, it never changes the result (the run's own result stands).
        junit testResults: 'reports/bkend/*/target/surefire-reports/TEST-*.xml', allowEmptyResults: true, skipMarkingBuildUnstable: true
        // JaCoCo (J12): coverage per module (percentages and trend, no quality gate = never changes the result), and the JaCoCo HTML with the source of each class.
        recordCoverage(tools: [[parser: 'JACOCO', pattern: 'reports/bkend/*/target/site/jacoco/jacoco.xml']], sourceCodeRetention: 'NEVER')
        publishHTML(target: [reportName: 'JaCoCo common', reportDir: 'reports/bkend/common/target/site/jacoco', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: false])
        publishHTML(target: [reportName: 'JaCoCo reporting', reportDir: 'reports/bkend/reporting/target/site/jacoco', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: false])
        // Error Prone + NullAway (J17): their javac warnings are in this run's console log (the compile is here; dp-ci-build's compile is not published again).
        // The Maven console format is parsed; the filter keeps the two enabled checks only. Warnings only, never changes the result.
        recordIssues(tool: mavenConsole(id: 'errorprone', name: 'Error Prone'), filters: [includeMessage('.*\\[(DefaultCharset|NullAway)\\].*')], enabledForFailure: true, skipBlames: true)
        publishHTML(target: [reportName: 'JaCoCo server', reportDir: 'reports/bkend/server/target/site/jacoco', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: false])
      }
    }
  }
}

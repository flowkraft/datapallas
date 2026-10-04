// Job datapallas/dp-ci-build. JUnit, packages and the Docker image: dp-ci.sh build.
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
    REPORT_PATHS = '@run/-trivy'
  }

  stages {
    stage('Run on the host') {
      steps {
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh build"
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
        // Trivy (J15): the HIGH and CRITICAL CVEs of the image just built, as a Warnings Next Generation table. If the parser does not fit
        // the JSON, the file is still kept, and the same table is in the console log of the run.
        recordIssues(tool: trivy(pattern: 'reports/trivy*/trivy.json', id: 'trivy', name: 'Trivy'), enabledForFailure: true, skipBlames: true)
        archiveArtifacts artifacts: 'reports/trivy*/trivy.json', allowEmptyArchive: true
      }
    }
  }
}

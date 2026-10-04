// Job datapallas/dp-ci-quality. The quality tools (lint, bug finder, format check, documentation): dp-ci.sh quality.
// No package and no tests: it compiles the Java modules, installs the npm dependencies and runs each tool. Never gating:
// every tool shows a report, none fails the build. The reports are pulled into the workspace by the Reports stage.
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
    // every tool leaves its report as <log>-quality-<tool> next to the run log; see jenkins.md, "Reports"
    REPORT_PATHS = '@run/-quality-*'
  }

  stages {
    stage('Run on the host') {
      steps {
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh quality"
'''
        }
      }
    }
    stage('Reports') {
      steps {
        // Pulls the run's reports from the host into ./reports. Never fails the build (reports are shown, not enforced).
        sh '''#!/bin/bash
rm -rf reports; mkdir -p reports
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && set -f && bash asbl/ci/jenkins/pull-reports.sh $REPORT_PATHS" | tar xzf - -C reports || echo "Reports: nothing pulled"
# the run's folders are named <ts>-quality-<sha>-quality-<tool>: give each the fixed name reports/<tool> the publishers need
for d in reports/*-quality-*; do [ -e "$d" ] && t="${d##*-quality-}" && rm -rf "reports/$t" && mv "$d" "reports/$t"; done
exit 0
'''
        // Javadoc (J18): the site of bkend/common and bkend/reporting under one index page (HTML Publisher; needs the JavaScript decision of jenkins.md).
        publishHTML(target: [reportName: 'Javadoc', reportDir: 'reports/javadoc', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
        // The publisher steps of the other tools ( Compodoc, ESLint, Prettier, SpotBugs, Spotless) are added below by the quality plan, one tool at a time.
      }
    }
  }
}

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
        // Compodoc (J18): the documentation site of the Angular app.
        publishHTML(target: [reportName: 'Compodoc', reportDir: 'reports/compodoc', reportFiles: 'index.html', keepAll: false, allowMissing: true, alwaysLinkToLastBuild: true])
        // ESLint (J13): the problems of the Angular app and of the AI Hub, one Warnings Next Generation result each (count, trend, list per file).
        // skipBlames: the sources are not in the workspace (the run is on the host). Never gating: no quality gate is set.
        recordIssues(tool: esLint(pattern: 'reports/eslint-angular/eslint.xml', id: 'eslint-angular', name: 'ESLint Angular'), enabledForFailure: true, skipBlames: true)
        recordIssues(tool: esLint(pattern: 'reports/eslint-aihub/eslint.xml', id: 'eslint-aihub', name: 'ESLint AI Hub'), enabledForFailure: true, skipBlames: true)
        // Prettier (formatter): the formatting differences as a table per app (ESLint rule prettier/prettier, own result, separate from the lint problems),
        // and the full list of `prettier --check` (it also sees CSS, JSON ...) as a downloadable file next to the build; the count is in QUALITY_RESULT.
        recordIssues(tool: esLint(pattern: 'reports/prettier-angular/eslint.xml', id: 'prettier-angular', name: 'Prettier Angular'), enabledForFailure: true, skipBlames: true)
        recordIssues(tool: esLint(pattern: 'reports/prettier-aihub/eslint.xml', id: 'prettier-aihub', name: 'Prettier AI Hub'), enabledForFailure: true, skipBlames: true)
        archiveArtifacts artifacts: 'reports/prettier-*/prettier-check.txt', allowEmptyArchive: true
        // SpotBugs + find-sec-bugs (J16): the findings of the four Java modules, one Warnings Next Generation result (category, priority, file).
        recordIssues(tool: spotBugs(pattern: 'reports/spotbugs/*.xml', useRankAsPriority: true, id: 'spotbugs', name: 'SpotBugs'), enabledForFailure: true, skipBlames: true)
        // Spotless (J17): one warning per Java file and hunk, from spotless-to-checkstyle.py (written from the documented message format; confirm on the first run).
        // The raw `mvn spotless:check` output is kept as an artifact, and the file list is in the console and in QUALITY_RESULT (spotless-files=N) if the table is empty.
        recordIssues(tool: checkStyle(pattern: 'reports/spotless/spotless.xml', id: 'spotless', name: 'Spotless'), enabledForFailure: true, skipBlames: true)
        archiveArtifacts artifacts: 'reports/spotless/spotless-check.txt', allowEmptyArchive: true
        // The publisher steps of the other tools ( Compodoc, ESLint, Prettier, SpotBugs, Spotless) are added below by the quality plan, one tool at a time.
      }
    }
  }
}

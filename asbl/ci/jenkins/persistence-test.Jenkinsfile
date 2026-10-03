// Job datapallas/persistence-test. Proof that a run outlives the browser, SSH and a Jenkins restart: a detached container prints a line every few seconds.
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
  }

  stages {
    stage('Run on the host') {
      steps {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && MINUTES=$(q "$MINUTES") INTERVAL_SECONDS=$(q "$INTERVAL_SECONDS") FOLLOW_CONTAINER=dp-persistence-test FOLLOW_LOG_LINK=/var/kraft-internalsystems/logs/datapallas-ci/persistence-test-latest.log bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/jenkins/persistence-test.sh $(q "$MINUTES") $(q "$INTERVAL_SECONDS")"
'''
      }
    }
  }
}

// Job datapallas/dp-ci-attach. Follow the dp-ci run that is going now, or show how the last one ended. Starts nothing.
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
if [ "$LANE" = windows ]; then
  ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && FOLLOW_PIDFILE=/var/kraft-internalsystems/logs/datapallas-ci/win-e2e.pid FOLLOW_LOG_LINK=/var/kraft-internalsystems/logs/datapallas-ci/win-e2e-latest.log bash asbl/ci/jenkins/follow-ci.sh attach"
else
  ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && bash asbl/ci/jenkins/follow-ci.sh attach"
fi
'''
      }
    }
  }
}

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
  }

  stages {
    stage('Run on the host') {
      steps {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && E2E_SPEC=$(q "$E2E_SPEC") E2E_GREP=$(q "$E2E_GREP") E2E_TARGET=$(q "$E2E_TARGET") bash asbl/ci/jenkins/follow-ci.sh run bash asbl/ci/dp-ci.sh e2e"
'''
      }
    }
  }
}

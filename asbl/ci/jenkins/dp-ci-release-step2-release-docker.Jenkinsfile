// Job datapallas/dp-ci-release-step2-release-docker: the Docker release (asbl/ci/jenkins/release-docker.sh). MODE=rehearsal (the
// default): built once on Linux, that build proven on Linux and Windows without a registry, kept (the docker zip and the image,
// in the artifacts folder with its manifest and failure report), then staged where users do not get it (UPLOAD=yes); the day
// before a release it runs with UPLOAD=no. MODE=upload: release day, the kept files uploaded, no rebuild. MODE=public: a passed,
// uploaded rehearsal of this version copied to the public places in minutes, or a rehearsal first when there is none.
// Its full description (what, when, order, needs, time, examples, log) is in asbl/ci/jenkins/seed.groovy, which makes the job;
// the guide is asbl/ci/jenkins/jenkins.md, section dp-ci-release-step2-release-docker.
// E2E_APPROVAL (the owner's written decision to go on without step 1's lanes; seed.groovy's parameter text says what it
// does) and the user who started the build (E2E_APPROVAL_USER) reach asbl/ci/release-state.sh through the environment.
// UPLOAD (default no): whether the run writes to Docker Hub and the bucket. no = all the work and every proof, then the
// exact command and destination of each upload it skips, nothing written; yes = the uploads, at the end, after every proof;
// MODE=public refuses no. seed.groovy's parameter text says the rest. Example: MODE=rehearsal UPLOAD=yes
// The work is the plain script named below, run on the host over SSH exactly as it is run by hand; this file
// only starts it and shows its log. The e2e runs are detached (a container, the Windows driver), so closing the
// browser or restarting Jenkins never stops them (see asbl/ci/jenkins/jenkins.md).
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 12, unit: 'HOURS')
  }

  environment {
    DP_HOST = 'root@172.19.0.1'
    DP_REPO = '/var/kraft-internalsystems/projects/all-repos/src/products/reportburster'
  }

  stages {
    stage('Run on the host') {
      steps {
        script {
          // who started this build, for an E2E_APPROVAL (asbl/ci/release-state.sh writes it into the log and the release
          // record): read from the build's cause, no plugin needed. Never stops the build
          try {
            def u = currentBuild.getBuildCauses('hudson.model.Cause$UserIdCause')
            env.E2E_APPROVAL_USER = u ? u[0].userId : currentBuild.getBuildCauses()[0].shortDescription
          } catch (err) {
            env.E2E_APPROVAL_USER = "(not read: ${err})"
          }
        }
        // a red run is recorded here, not thrown, so that the Reports stage below still runs and shows its reports
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
        sh '''#!/bin/bash
set -o pipefail
q() { printf '%q' "$1"; }
# its parts are marked DOCKER RELEASE STEP 1/6 .. 6/6 (5/6 = the keeping), DOCKER UPLOAD and DOCKER PUBLIC, each START/END with the time it took (asbl/ci/marks.sh):
# grep '^######## ' in the console. The output is kept in release-run.out for the stage that queues the seed job and for the build's label (post, below).
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && MODE=$(q "$MODE") UPLOAD=$(q "$UPLOAD") DRY_RUN=$(q "$DRY_RUN") E2E_APPROVAL=$(q "$E2E_APPROVAL") E2E_APPROVAL_USER=$(q "$E2E_APPROVAL_USER") bash asbl/ci/jenkins/release-docker.sh" | tee release-run.out
'''
        }
      }
    }
    stage('Queue seed') {
      steps {
        script {
          // MODE=public that went through: the seed job runs again, so the jobs show the released version
          if (sh(script: "grep -q '^RELEASE_PUBLIC PASS ' release-run.out 2>/dev/null", returnStatus: true) == 0) {
            build job: '/seed', wait: false
          }
        }
      }
    }
    stage('Reports') {
      steps {
        // The image scan of the newest build (the one staged, when this run built it or found it built). Never fails the build.
        sh '''#!/bin/bash
rm -rf reports; mkdir -p reports
q() { printf '%q' "$1"; }
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && T=\\$(ls -1dt /var/kraft-internalsystems/logs/datapallas-ci/*-build-*-trivy 2>/dev/null | head -1) && set -f && bash asbl/ci/jenkins/pull-reports.sh \\$T" | tar xzf - -C reports || echo "Reports: nothing pulled"
for d in reports/*-trivy; do [ -e "$d" ] && rm -rf reports/trivy && mv "$d" reports/trivy; done
exit 0
'''
        recordIssues(tool: trivy(pattern: 'reports/trivy/trivy.json', id: 'trivy', name: 'Trivy'), enabledForFailure: true, skipBlames: true)
        archiveArtifacts artifacts: 'reports/trivy/trivy.json', allowEmptyArchive: true
      }
    }
  }
  post {
    always {
      script {
        // the build list says what happened without opening the log: the label is read from the run's output by
        // asbl/ci/jenkins/release-label.sh. Never turns a build red.
        try {
          def label = sh(returnStdout: true, script: '''#!/bin/bash
q() { printf '%q' "$1"; }
[ -f release-run.out ] || exit 0
ssh -o BatchMode=yes "$DP_HOST" "cd $(q "$DP_REPO") && bash asbl/ci/jenkins/release-label.sh" < release-run.out
''').trim()
          if (label) {
            currentBuild.description = label
          }
        } catch (err) {
          echo "The build label was not set: ${err}"
        }
      }
    }
  }
}

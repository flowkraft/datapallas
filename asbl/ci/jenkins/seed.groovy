// Job DSL: creates every Jenkins job of this project from the repository, so the Jenkins can be rebuilt and
// no job is made by clicking. Run by the one hand-made job `seed` (see jenkins.md, "Seed job").
//
// One job per step the owner starts on its own. Each job loads its Jenkinsfile from this repository, and the
// Jenkinsfile runs a plain script from asbl/ci on the host over SSH: the very scripts that are run by hand,
// in the very same CI container. No secrets in here: the repository is public.

def repoUrl    = 'https://github.com/flowkraft/datapallas.git'
def repoBranch = '*/main'

folder('datapallas') {
  description('DataPallas CI. The jobs are defined in asbl/ci/jenkins/seed.groovy: change them there, not here.')
}

// name -> [Jenkinsfile, what it is, parameters]. Add an entry to add a job.
def jobs = [
  'dp-ci-build': [
    about: 'JUnit, packages and the Docker image of the working tree on the server (dp-ci.sh build).',
    params: [:],
  ],
  'dp-ci-junit': [
    about: 'The JUnit gate (dp-ci.sh junit): one module and test pattern, or everything when both are empty.',
    params: [
      JUNIT_MODULE: [choices: ['', 'bkend/common', 'bkend/reporting', 'bkend/server'], text: 'Module; empty = all three'],
      JUNIT_TEST  : [text: "Surefire -Dtest pattern, e.g. 'Jasper*Test'; empty = every test of the module"],
    ],
  ],
  'dp-ci-e2e': [
    about: 'End-to-end tests (dp-ci.sh e2e). Needs the package of a previous dp-ci-build.',
    params: [
      E2E_SPEC  : [text: 'Regex on the spec file path; anchor it to run one file, e.g. /variables\\.spec\\.ts$ . Empty = no file filter'],
      E2E_GREP  : [text: 'Regex on the test titles. Empty = no title filter'],
      E2E_TARGET: [choices: ['web', 'electron-linux', 'electron-windows-vm', 'docker-server'], text: 'What the tests run against. electron-windows-vm = the real Windows desktop of the VM'],
      E2E_ROTATION_DATE: [text: 'YYYY-MM-DD: whose day\'s database rotation to run (2026-09-22 = sqlserver + duckdb). Empty = today'],
    ],
  ],
  'dp-ci-attach': [
    about: 'Follow the run that is going now (or show how the last one ended). Starts nothing: use it to watch a run started elsewhere.',
    params: [
      LANE: [choices: ['linux', 'windows'], text: 'linux = the dp-ci container (build, junit, e2e); windows = the e2e on the Windows VM'],
    ],
  ],
]

jobs.each { name, job ->
  pipelineJob("datapallas/${name}") {
    description(job.about)
    parameters {
      job.params.each { pname, p ->
        if (p.choices) {
          choiceParam(pname, p.choices, p.text)
        } else {
          stringParam(pname, p.default ?: '', p.text)
        }
      }
    }
    definition {
      cpsScm {
        scm {
          git {
            remote { url(repoUrl) }
            branch(repoBranch)
          }
        }
        scriptPath("asbl/ci/jenkins/${name}.Jenkinsfile")
        lightweight(true)
      }
    }
    logRotator { numToKeep(30) }
  }
}

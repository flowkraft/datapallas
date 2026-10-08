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
  'dp-ci-package': [
    about: 'Builds what ships: compile (no unit tests), the distribution packages, the Docker image and its Trivy scan of the working tree on the server (dp-ci.sh build, about 14 min). Needed before a docker-server run of dp-ci-e2e and before publishing a demo; the real e2e (dp-ci-e2e) is needed before a release. Unit tests are dp-ci-junit.',
    params: [:],
  ],
  'dp-ci-quality': [
    about: 'The quality tools (lint, bug finder, format check, documentation) of the working tree on the server (dp-ci.sh quality). No package, no tests, no e2e; never gating.',
    params: [:],
  ],
  'dp-ci-junit': [
    about: 'The JUnit gate (dp-ci.sh junit): one module and test pattern, or everything when both are empty. No package, no e2e.',
    params: [
      JUNIT_MODULE: [choices: ['', 'bkend/common', 'bkend/reporting', 'bkend/server'], text: 'Module; empty = all three'],
      JUNIT_TEST  : [text: "Surefire -Dtest pattern, e.g. 'Jasper*Test'; empty = every test of the module"],
    ],
  ],
  'dp-ci-e2e-dev': [
    about: 'Fast e2e while developing (dp-ci.sh e2e-dev): ONE spec file, web target only. Never rebuilds the package: it runs on the package that is there, or repackages only the content. Not a release check: that is dp-ci-e2e.',
    params: [
      E2E_SPEC  : [text: 'REQUIRED. Regex on the spec file path, anchored to one file, e.g. /variables\\.spec\\.ts$'],
      E2E_GREP  : [text: 'Regex on the test titles, to re-run a few tests of that file. Empty = the whole file'],
      E2E_PACKAGE: [choices: ['reuse', 'content'], text: 'reuse = run on the package that is there (a fix to specs, helpers, Java, the Angular UI, web components). content = package the content again first, minutes (a fix under db-template, config, samples or scripts)'],
    ],
  ],
  'dp-ci-e2e': [
    about: 'The real end-to-end tests (dp-ci.sh e2e), on a package built from this exact commit (rebuilt first when it is not: 26-40 min). Slow. Needed before a release; run dp-ci-package first for the docker-server target. For the fast development loop use dp-ci-e2e-dev.',
    params: [
      E2E_SPEC  : [text: 'Regex on the spec file path; anchor it to run one file, e.g. /variables\\.spec\\.ts$ . Empty = the full suite'],
      E2E_TARGET: [choices: ['web', 'electron-linux', 'electron-windows-vm', 'docker-server'], text: 'What the tests run against. electron-windows-vm = the real Windows desktop of the VM'],
      E2E_ROTATION_DATE: [text: 'YYYY-MM-DD: whose day\'s database rotation to run (2026-09-22 = sqlserver + duckdb). Empty = today'],
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
    logRotator { numToKeep(200) }
  }
}

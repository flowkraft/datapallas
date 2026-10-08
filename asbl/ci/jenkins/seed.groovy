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
      JUNIT_MODULE: [choices: ['bkend/server', 'bkend/common', 'bkend/reporting', ''], text: 'WHICH MODULE: the Maven module whose tests run. The default is bkend/server, the module that changes most (41 commits in 60 days, against 20 for bkend/common and 15 for bkend/reporting).\nUse it: after you changed Java code, pick the module you changed.\nThe last entry, empty = all three modules (the full gate, slow, about 25 min).'],
      JUNIT_TEST  : [text: 'WHICH TESTS inside the module (a Maven Surefire -Dtest pattern). Empty = every test of the module (slow).\nUse it: nearly every time, to run only the class or method you touched.\nExamples:\n  ReportsServiceTest   -> one test class\n  ReportsServiceTest#method   -> one test method of it\n  Jasper*Test   -> every class that starts with Jasper and ends with Test\n  FooTest,BarTest   -> two classes'],
    ],
  ],
  'dp-ci-e2e-dev': [
    about: 'Fast e2e while developing (dp-ci.sh e2e-dev): ONE spec file, on the web or the electron-linux target. Never rebuilds the package: it runs on the package that is there, or repackages only the content. Not a release check: that is dp-ci-e2e.',
    params: [
      E2E_SPEC  : [text: 'WHICH FILE to run. REQUIRED. A regex on the path of the spec file; end it with $ so that it matches one file only.\nUse it: every run (there is no default: it is a different file each time).\nExamples (the files run most often):\n  /areas/cube-stories\\.spec\\.ts$\n  /features/samples\\.spec\\.ts$\n  /areas/connections\\.spec\\.ts$\n  /features/explore-data-visualizations\\.spec\\.ts$\nSeveral files at once (slower, the exception): /features/explore-data-   -> every explore-data-*.spec.ts.\nThe files are under frend/reporting/e2e/specs/. Leave E2E_GREP empty to run the whole file (the normal case).'],
      E2E_GREP  : [text: 'WHICH TESTS inside that file. Optional. A regex on the test titles. Empty = every test of the file (the normal case).\nUse it: to re-run only the test or tests that failed after a fix. Run the whole file again (empty) before you call the file green.\nExamples:\n  Show Me   -> the tests whose title contains Show Me\n  refus|SQL vendor   -> the tests whose title contains either text (| means or)\n  \\[duckdb\\] Database Schema   -> + ( ) [ ] . ? * and | have a meaning in a regex: put a backslash before them to match them as written. Same for palette \\+ default config\nTip: copy a piece of the title from the failure line of the run log or from the Playwright report.\nCareful: in a serial file (cube-stories, dashboard-demos, auth-authorization-server) a test depends on the ones before it, so a filtered run can fail for that reason alone.'],
      E2E_TARGET: [choices: ['web', 'electron-linux'], text: 'WHAT the tests run against.\nweb (default, the everyday one): the server and the Angular UI built from this tree, in a browser.\nelectron-linux: the desktop application on Linux (for the specs that only run there, for example let-me-update-migrate-configuration).\ndocker-server and electron-windows-vm are release checks: use dp-ci-e2e for them.'],
      E2E_PACKAGE: [choices: ['reuse', 'content'], text: 'WHICH PACKAGE to run on. The package holds the content the tests start from (sample apps, db-template, config, samples, scripts, sample databases). The jars and the Angular UI are always built from the tree, so a fix to Java, the UI, specs or helpers needs nothing more.\nreuse (default): run on the package that is already built. Use it for almost every run.\ncontent: package the content again first (a few minutes). Use it after a fix under db-template (for example the AI Hub app), config, samples or scripts.\nThe log says which package ran: the line E2E_PACKAGE mode=... built_from=... commit_under_test=...\nIf there is no package yet, one is built first (26 to 40 min).'],
    ],
  ],
  'dp-ci-e2e': [
    about: 'The real end-to-end tests (dp-ci.sh e2e), on a package built from this exact commit (rebuilt first when it is not: 26-40 min). Slow. Needed before a release; run dp-ci-package first for the docker-server target. For the fast development loop use dp-ci-e2e-dev.',
    params: [
      E2E_SPEC  : [text: 'WHICH FILE(S) to run. A regex on the path of the spec file; end it with $ for one file. EMPTY = the full suite (about 5 hours).\nUse it: with a file, to confirm that file on a package built from this exact commit; empty, before a release.\nExamples:\n  /areas/cube-stories\\.spec\\.ts$\n  /features/samples\\.spec\\.ts$\n  /features/   -> every spec file of the features folder\nThe full run leaves out auth-authorization-server and let-me-update-migrate-configuration (they run on their own); name them in the regex to run them. For a quick fix-and-retry loop use dp-ci-e2e-dev instead.'],
      E2E_TARGET: [choices: ['web', 'electron-linux', 'electron-windows-vm', 'docker-server'], text: 'WHAT the tests run against.\nweb (default, the everyday one): the server and the Angular UI built from this tree, in a browser.\nelectron-linux: the desktop application on Linux.\nelectron-windows-vm: the real Windows desktop of the VM (slow, for release checks).\ndocker-server: the shipped server bundle and its Docker image; run dp-ci-package on the SAME commit first.\nDay to day: web. The other three are for release checks.'],
      E2E_ROTATION_DATE: [text: 'Optional, rarely needed. Some specs test a different app or database vendor depending on the day (the choice is seeded from the date, so two days in a row cover every combination). Empty = today, UTC.\nUse it only to repeat the variant of another day, for example the day a run failed.\nFormat YYYY-MM-DD. Example: 2026-09-22 (that day: sqlserver and duckdb).'],
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

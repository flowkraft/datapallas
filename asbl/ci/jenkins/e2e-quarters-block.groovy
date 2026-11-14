// The live block under WHAT_TO_RUN of the job dp-ci-e2e-nightly-or-by-hand: an Active Choices reactive reference parameter
// (the uno-choice plugin, formatted HTML), redrawn whenever WHAT_TO_RUN changes, before the press. seed.groovy reads this
// file and gives it to the parameter; it runs outside the sandbox, approved once in Manage Jenkins -> In-process Script
// Approval, like seed.groovy.
//
// It only reads: the 4 quarters' texts `python3 asbl/ci/release-estimate.py quarters` wrote on the host (the job writes
// them after each build: each quarter's spec files with their tests and test minutes, its tests and its time by
// estimate, from the newest passed full set). For full-set-quarter-<n> it shows that quarter's text, the same as
// `release-estimate.py quarters --runs <runs> --quarter <n>` in a terminal; for another value, one line.
//
// Its inputs, as Active Choices binds them (a test binds them by hand):
//   WHAT_TO_RUN                                                            the choice [spec-and-grep]
//   E2E_QUARTERS_FILE [<JENKINS_HOME>/datapallas/e2e-quarters.json]        the JSON the job writes
// It returns the block as HTML (a <pre>); it never fails: a JSON it cannot read gives one line saying so.
import groovy.json.JsonSlurper

String boundOr(String name, String fallback) {
  def b = getBinding()
  if (b.hasVariable(name)) {
    def v = b.getVariable(name)
    if (v != null && v.toString().trim()) {
      return v.toString().trim()
    }
  }
  return fallback
}

String html(String text) {
  return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
}

String what = boundOr('WHAT_TO_RUN', 'spec-and-grep')
String file = boundOr('E2E_QUARTERS_FILE', (System.getenv('JENKINS_HOME') ?: '/var/jenkins_home') + '/datapallas/e2e-quarters.json')
String text
def quarter = (what =~ /^full-set-quarter-([1-4])$/)
if (!quarter.matches()) {
  text = 'Pick full-set-quarter-1 to full-set-quarter-4 above: its spec files, its tests and its time show here.'
} else {
  String n = quarter.group(1)
  try {
    def data = new JsonSlurper().parseText(new File(file).getText('UTF-8'))
    text = data.quarters[n] ?: "No text for quarter ${n} in ${file}".toString()
  } catch (e) {
    text = "The quarters could not be read from ${file}: ${e.message} (the job writes it after each build; on the host: python3 asbl/ci/release-estimate.py quarters --runs <the run folders>)".toString()
  }
}
return '<pre>' + html(text) + '</pre>'

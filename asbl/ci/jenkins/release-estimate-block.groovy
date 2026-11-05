// The live estimate under the "Advanced (Parallelization)" choices of the job dp-ci-release-steps-0-3-rehearsal: an Active
// Choices reactive reference parameter (the uno-choice plugin, formatted HTML), redrawn whenever either choice changes,
// before the press. seed.groovy reads this file and gives it to the parameter; it runs outside the sandbox, approved once
// in Manage Jenkins -> In-process Script Approval, like seed.groovy.
//
// It only reads: the 16 estimates `bash asbl/ci/jenkins/release-rehearsal.sh estimate` wrote on the host (the one
// calculation, asbl/ci/release-estimate.py, from the last release runs' marks) and the host's available memory now. It
// picks the chosen pair and writes the same text as `release-rehearsal.sh estimate <N> <M>` in a terminal (release-
// estimate.py block): what the press refuses, the memory line, the Gantt chart, the total and the gain. Keep the two in
// step: asbl/ci/tests/test-estimate.sh compares them for all 16 pairs.
//
// Its inputs, as Active Choices binds them (a test binds them by hand):
//   SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS, USE_N_NUMBER_OF_WINDOWS_VMS   the two choices [1]
//   RELEASE_ESTIMATES_FILE [<JENKINS_HOME>/datapallas/release-estimates.json]        the host's RELEASE_ESTIMATES_FILE
//   RELEASE_MEMINFO [/proc/meminfo]                                                    the host's memory (the container
//                                                                                      sees the host's)
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

// the host's available memory now, whole GB (as release-machines.sh's memory rule reads it), or null
Integer availableGb(String meminfo) {
  try {
    String line = new File(meminfo).readLines().find { it ==~ /^MemAvailable:\s+\d+.*/ }
    if (line) {
      long kib = (line.split(/\s+/)[1]) as long
      return (int) kib.intdiv(1048576L)
    }
  } catch (ignored) {
  }
  return null
}

String jobs = boundOr('SPLIT_E2E_FULL_SET_EXECUTION_INTO_N_PARALLEL_JOBS', '1')
String vms = boundOr('USE_N_NUMBER_OF_WINDOWS_VMS', '1')
String file = boundOr('RELEASE_ESTIMATES_FILE', (System.getenv('JENKINS_HOME') ?: '/var/jenkins_home') + '/datapallas/release-estimates.json')
String meminfo = boundOr('RELEASE_MEMINFO', '/proc/meminfo')
List lines = []
try {
  def data = new JsonSlurper().parseText(new File(file).getText('UTF-8'))
  def pair = data.pairs.find { it.jobs.toString() == jobs && it.vms.toString() == vms }
  if (pair == null) {
    lines << "No estimate for N=${jobs} M=${vms}: run bash asbl/ci/jenkins/release-rehearsal.sh estimate on the host".toString()
  } else {
    pair.refused.each { lines << ('REFUSED at the press: ' + it) }
    lines << ('Memory  needs +' + pair.need_gb + ' GB: ' + pair.need_text)
    Integer available = availableGb(meminfo)
    if (available == null) {
      lines << ('        available now: unknown (' + meminfo + ' could not be read)')
    } else {
      int left = available - (pair.need_gb as int)
      int minFree = data.min_free_gb as int
      String warn = left < minFree ? '    WARNING: under the ' + minFree + ' GB rule (the press refuses it)' : ''
      lines << ('        available now ' + available + ' GB -> ' + left + ' GB would stay free' + warn)
    }
    pair.chart.each { lines << it.toString() }
    lines << pair.total_line.toString()
  }
  lines << data.from_line.toString()
} catch (e) {
  lines = ['The estimate could not be read from ' + file + ': ' + e + ' (bash asbl/ci/jenkins/release-rehearsal.sh estimate writes it, after each round)']
}
return '<pre style="font-size:12px;line-height:1.3">' + html(lines.join('\n')) + '</pre>'

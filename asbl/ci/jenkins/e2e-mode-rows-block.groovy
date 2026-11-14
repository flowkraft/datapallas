// The hidden block ROWS_SHOWN_BY_E2E_MODE of the job dp-ci-e2e-nightly-or-by-hand: an Active Choices reactive reference
// parameter (the uno-choice plugin, formatted hidden HTML: its own row never shows), redrawn whenever E2E_MODE changes,
// before the press. seed.groovy reads this file and gives it to the parameter; it runs outside the sandbox, approved once
// in Manage Jenkins -> In-process Script Approval, like seed.groovy.
//
// It only draws: one CSS rule that hides the form's rows the chosen mode does not use, so the form shows what applies:
//   dev                   E2E_SPEC, E2E_GREP, E2E_PACKAGE (WHAT_TO_RUN, the quarter block and E2E_TARGET hidden)
//   production-packaged   WHAT_TO_RUN, the quarter block, E2E_TARGET, E2E_SPEC, E2E_GREP (E2E_PACKAGE hidden)
// A hidden row still sends its value; the job uses only those of the chosen mode (the Jenkinsfile, stage 'What runs').
// Before this script is approved, or in a browser without CSS :has(), every row shows: nothing breaks.
//
// Its input, as Active Choices binds it (a test binds it by hand): E2E_MODE [dev]
// It returns the block as HTML (a <style>); it never fails.
String mode = 'dev'
def b = getBinding()
if (b.hasVariable('E2E_MODE') && b.getVariable('E2E_MODE')?.toString()?.trim()) {
  mode = b.getVariable('E2E_MODE').toString().trim()
}
List hidden = ['ROWS_SHOWN_BY_E2E_MODE'] +
  (mode == 'production-packaged' ? ['E2E_PACKAGE'] : ['WHAT_TO_RUN', 'QUARTER_FILES_TESTS_AND_TIME', 'E2E_TARGET'])
String rows = hidden.collect { String n ->
  '.jenkins-form-item:has(> .setting-main > div[name="parameter"] > input[name="name"][value="' + n + '"])'
}.join(', ')
return '<style>' + rows + ' { display: none; }</style>'

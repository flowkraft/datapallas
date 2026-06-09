*** Settings ***
Library     OperatingSystem
Library     resources/utilities.py
Variables   resources/vars.py
Test Setup       Clean State

*** Keywords ***
Clean State
  [Documentation]  Clean Output Folders and Log Files
  Clean Output Folders and Log Files

*** Test Cases ***
Command Line Payslips.pdf Should Work Fine
  [Documentation]  Command Line Payslips.pdf Should Work Fine

  Ensure Chocolatey Is Installed
  Sleep  1s
  Refresh Env Variables
  Ensure Java Is Installed
  Sleep  1s
  Refresh Env Variables

  ${command}=    Set Variable    cmd /c "refreshenv && ${PORTABLE_EXECUTABLE_DIR}/datapallas.bat job burst ${PORTABLE_EXECUTABLE_DIR}/samples/burst/Payslips.pdf"
  ${rc}    ${output}=    Run And Return Rc And Output    ${command}
  Log    ${output}
  Should Be Equal As Integers    ${rc}    0

  ${count_output_pdf_files}=    Count Files    ${PORTABLE_EXECUTABLE_DIR}/output    pattern=*.pdf    recursive=True
  Should Be Equal As Integers    ${count_output_pdf_files}    3

  Ensure Java Is Not Installed

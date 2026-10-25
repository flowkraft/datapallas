*** Settings ***
Library     SeleniumLibrary
Library     OperatingSystem
Library     Process
Library     resources/utilities.py
Resource    resources/utilities.robot
Variables   resources/vars.py
Test Setup    Clean State
Test Teardown    Kill DataPallas Exe Process

*** Test Cases ***
# Prerequisites Java 8 Installed Should Let The User Know That At Least Java 11 Is Required
#     [Documentation]  Prerequisites Java 8 Installed Should Let The User Know That At Least Java 11 Is Required
#     Ensure Chocolatey Is Installed
#     Ensure Java Is Installed   version=8
#     Sleep  1s
#     Refresh Env Variables
#     Sleep  1s
#     Open Electron Application
#     Sleep  1s
#     Wait Until Page Contains Element    id=burstFile    timeout=300
#     Wait Until Page Contains Element    id=javaInstallationOld    timeout=300
#     Sleep  1s
#     Ensure Java Is Not Installed
#     Close DataPallas Application
    
Prerequisites Chocolatey Is Installed and Java Not Installed Should Allow User To Install Java
    [Documentation]  Prerequisites Chocolatey Is Installed and Java Not Installed Should Allow User To Install Java
    Ensure Chocolatey Is Installed
    Ensure Java Is Not Installed
    Sleep  1s
    Refresh Env Variables
    Sleep  1s
    Open Electron Application
    Sleep  1s
    Wait Until Page Contains Element    id=btnInstallJavaTabBurst    timeout=300
    Sleep  1s
    Click Button    id=btnInstallJavaTabBurst
    Wait Until Page Contains Element    id=btnInstallJava    timeout=300
    Page Should Not Contain Element    id=btnInstallChocolatey
    Sleep  1s
    Click Button    id=btnInstallJava
    Wait Until Page Contains Element    css=.dburst-button-question-decline    timeout=300
    Sleep  1s
    Click Element    css=.dburst-button-question-decline
    Wait Until Element Is Not Visible    css=.dburst-button-question-decline    timeout=300
    Sleep  1s
    Click Button    id=btnInstallJava
    Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
    Sleep  1s
    Take Named Screenshot If Requested    000_05_Prerequisites_ChocoYesJavaNo_InstallJava
    Click Element    css=.dburst-button-question-confirm
    Wait Until Element Is Not Visible    css=.dburst-button-question-confirm    timeout=300
    Sleep  1s
    Wait For Powershell And Accept Completion
    Close DataPallas Application
    Sleep  1s
    Refresh Env Variables
    Sleep  1s
    Open Electron Application
    Wait Until Page Contains Element    id=burstFile    timeout=300
    Sleep  1s
    Page Should Not Contain Element    id=btnInstallJavaTabBurst
    Sleep  1s
    Ensure Java Is Not Installed
    Close DataPallas Application

Prerequisites Chocolatey Not Installed and Java Not Installed Should Allow User to Install Chocolatey and Then Java
   [Documentation]  Chocolatey Not Installed and Java Not Installed Should Allow User to Install Chocolatey and Then Java
   Ensure Java Is Not Installed
   Ensure Chocolatey Is Not Installed
   Open Electron Application
   Sleep  1s
   Wait Until Page Contains Element    id=btnInstallJavaTabBurst    timeout=300
   Sleep  1s
   Click Button    id=btnInstallJavaTabBurst
   Wait Until Page Contains Element    id=btnInstallChocolatey    timeout=300
   Element Should Be Enabled  id=btnInstallChocolatey
   Wait Until Page Contains Element    id=btnInstallJava    timeout=300
   Element Should Be Disabled   id=btnInstallJava
   Sleep  1s
   Click Button    id=btnInstallChocolatey
   Wait Until Page Contains Element    css=.dburst-button-question-decline    timeout=300
   Sleep  1s
   Click Element    css=.dburst-button-question-decline
   Wait Until Element Is Not Visible    css=.dburst-button-question-decline    timeout=300
   Sleep  1s
   Click Button    id=btnInstallChocolatey
   Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
   Sleep  1s
   Take Named Screenshot If Requested    000_05_Prerequisites_ChocoNoJavaNo_InstallChoco
   Click Element    css=.dburst-button-question-confirm
   Wait Until Element Is Not Visible    css=.dburst-button-question-confirm    timeout=300
   Wait For Powershell And Accept Completion
   Sleep  1s
   Close DataPallas Application
   Sleep  1s
   Refresh Env Variables
   Sleep  1s
   Open Electron Application
   Sleep  1s
   Wait Until Page Contains Element    id=btnInstallJavaTabBurst    timeout=300
   Click Button    id=btnInstallJavaTabBurst
   Wait Until Page Contains Element    id=btnInstallJava    timeout=300
   Element Should Be Enabled   id=btnInstallJava
   Sleep  1s
	 Click Button    id=btnInstallJava
   Wait Until Page Contains Element    css=.dburst-button-question-decline    timeout=300
   Sleep  1s
   Click Element    css=.dburst-button-question-decline
   Wait Until Element Is Not Visible    css=.dburst-button-question-decline    timeout=300
   Sleep  1s
   Click Button    id=btnInstallJava
   Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
   Sleep  1s
   Click Element    css=.dburst-button-question-confirm
   Wait Until Element Is Not Visible    css=.dburst-button-question-confirm    timeout=300
   Sleep  1s
   Wait For Powershell And Accept Completion
   Sleep  1s
   Close DataPallas Application
   Sleep  1s
   Refresh Env Variables
   Sleep  1s
   Open Electron Application
   Wait Until Page Contains Element    id=burstFile    timeout=300
   Sleep  1s
   Page Should Not Contain Element    id=btnInstallJavaTabBurst
   Sleep  1s
   Ensure Java Is Not Installed
   Close DataPallas Application

# Prerequisites Chocolatey Installed But Choco Minus Version Not Working Should Work Fine
#   [Documentation] Chocolatey Installed But Choco Minus Version Not Working Should Work Fine

*** Keywords ***
#Open Electron Application
#  [Documentation]  Open's your electron application by providing browser binary via
#  ...  ${signal_electron} and chromedriver binary via ${signal_service}
#  ...  see vars.py for more details.
#  Create Webdriver    Chrome    options=${signal_electron}    service=${signal_service}

Verify Chrome Debugger Connection
  [Documentation]  Verifies Chrome debugger is available before attempting connection
  # First check if port is actually responding
  ${port_check}=    Run Process    powershell -command "if(Test-NetConnection -ComputerName localhost -Port 9222 -WarningAction SilentlyContinue -InformationLevel Quiet) { Write-Output 'open' } else { Write-Output 'closed' }"    shell=True
  ${port_status}=    Set Variable    ${port_check.stdout.strip()}
  Run Keyword If    '${port_status}' != 'open'    Fail    Chrome debugger port 9222 is not responding
  
  # Then attempt to connect
  Log    Port check passed, attempting to connect to Chrome on port 9222...
  ${options}=    Evaluate    sys.modules['selenium.webdriver'].ChromeOptions()    sys, selenium.webdriver
  Call Method    ${options}    add_experimental_option    debuggerAddress    localhost:9222
  Create WebDriver    Chrome    service=${signal_service}    options=${options}

  # The driver meets whichever page exists first, and on a cold VM that is the splash. Move to the app's
  # own window; when the splash is already gone this is the only one and costs nothing.
  Wait Until Keyword Succeeds    10x    1s    Switch To App Window

  # Verify we can interact with the page
  Wait Until Keyword Succeeds    3x    1s    Get Title

Close Electron Application
  [Documentation]  Kills the Electron application process
  Close All Browsers
  Terminate All Processes    kill=True
  Kill DataPallas Exe Process

Close DataPallas Application
  [Documentation]  Close DataPallas Application
#  Click X Close DataPallas
  Kill DataPallas Exe Process

Close And Open Electron Application
    [Arguments]    ${condition_keyword}    ${condition_arg}    ${timeout}
    Close DataPallas Application
    Sleep  1s
    Refresh Env Variables
    Sleep  1s
    Open Electron Application
    Wait Until Page Contains Element    id=burstFile    timeout=300
    Sleep  1s
    Run Keyword    ${condition_keyword}    ${condition_arg}    ${timeout}

Clean State
  [Documentation]  Clean Output Folders and Log Files
  Clean Output Folders and Log Files
  Close DataPallas Application

#Capture Failed Test Screenshot
#  [Documentation]  Captures a screenshot with a name based on the test case name
#  Capture Page Screenshot    EMBED


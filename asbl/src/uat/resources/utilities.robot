*** Settings ***
Library     SeleniumLibrary
Library     OperatingSystem
Library     Process
Library     resources/utilities.py
Variables   resources/vars.py

*** Keywords ***
Take Named Screenshot If Requested
    [Arguments]    ${screenshot_name}
    [Documentation]    Takes a screenshot with the given name only if TAKE_SCREENSHOTS env var is set to true
    ${take_screenshots}=    Get Environment Variable    TAKE_SCREENSHOTS    default=False
    Log    TAKE_SCREENSHOTS value: ${take_screenshots}    level=TRACE
    Run Keyword If    ${take_screenshots}    Capture Page Screenshot    ${screenshot_name}.png

Ensure Sidebar Open
    [Documentation]    The Processing screen starts with the left sidebar collapsed
    ...    (CSS --sidebar-w:0). Open it only when not already visible, so an already-open
    ...    sidebar is never toggled shut. Mirrors the e2e fluent-tester doEnsureSidebarOpen().
    ${is_visible}=    Execute Javascript    return document.documentElement.classList.contains('sidebar-visible')
    Run Keyword If    not ${is_visible}    Click Element    id=btnToggleSidebar

Capture Samples Screen If Requested
    [Documentation]    Navigate to the Samples screen and capture the 005_25 quickstart
    ...    walkthrough screenshot. This step is screenshot-only — the click makes no
    ...    assertion — so plain runs (TAKE_SCREENSHOTS unset) skip it entirely.
    ${take_screenshots}=    Get Environment Variable    TAKE_SCREENSHOTS    default=False
    Run Keyword If    ${take_screenshots}    Capture Samples Screen

Capture Samples Screen
    [Documentation]    Open the collapsed Processing sidebar, click the Samples menu item
    ...    and capture the walkthrough screenshot.
    Ensure Sidebar Open
    Wait Until Element Is Visible    id=leftMenuSamples    timeout=30
    Click Element    id=leftMenuSamples
    Sleep  5s
    Capture Page Screenshot    005_25_Quickstart_View_Samples.png

Quickstart Payslips.pdf Should Work Fine
    
    Sleep  1s
    Open Electron Application
    Wait Until Page Contains Element    id=burstFile    timeout=300
    Wait Until Page Contains Element    id=infoLog    timeout=300
    Page Should Contain Element    id=noJobsRunning
    Page Should Contain Element    id=btnGreatNoErrorsNoWarnings
    # screen "Before Selecting a File"
    Take Named Screenshot If Requested    005_00_Quickstart_Before_Selecting_File
    ${payslips_pdf_path}=  Join Path  ${PORTABLE_EXECUTABLE_DIR}  samples/burst/Payslips.pdf
    Choose File  id=burstFileUploadInput  ${payslips_pdf_path}
    # screen "After the File Was Selected"
    Take Named Screenshot If Requested     005_05_Quickstart_After_File_Selected
  	Sleep  1s
    # Click Burst (cannot because of log files)
    Click Button    id=btnBurst
    Sleep  1s
    Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
    Click Element    css=.dburst-button-question-confirm
    Wait Until Element Is Not Visible    css=.dburst-button-question-confirm    timeout=300
    Sleep  1s
    Click Button    id=btnClearLogsBurstReportsTab
    Wait Until Page Contains Element    css=.dburst-button-question-decline    timeout=300
    Sleep  1s
    Click Element    css=.dburst-button-question-decline
    Wait Until Element Is Not Visible    css=.dburst-button-question-decline    timeout=300
    Sleep  1s
    Click Button    id=btnClearLogsBurstReportsTab
    Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
    Sleep  1s
    Click Element    css=.dburst-button-question-confirm
    Wait Until Element Is Not Visible    css=.dburst-button-question-confirm    timeout=300
    Wait Until Element Is Not Visible    id=infoLog    timeout=300
    Sleep  1s
    # Click Burst (this time works)
    Click Button    id=btnBurst
    Wait Until Page Contains Element    css=.dburst-button-question-confirm    timeout=300
    Sleep  1s
    # screen "After the Clicking Burst Button"
    Take Named Screenshot If Requested     005_10_Quickstart_Asking_Confirmation_to_Burst
	  Click Element    css=.dburst-button-question-confirm
    # Working on ...
    Wait Until Page Contains Element    css=#logsViewerBurstReportsTab #infoLog    timeout=300
    Wait Until Page Contains Element    id=workingOn    timeout=300
    Sleep  1s
    # screen "While Working On"
    Take Named Screenshot If Requested    005_15_Quickstart_While_Working_On
    Wait Until Element Is Not Visible    id=noJobsRunning    timeout=300
    # Done
    Wait Until Element Is Not Visible    id=workingOn    timeout=3000
    Wait Until Page Contains Element    id=noJobsRunning    timeout=3000
    # Done without errors 
    Page Should Contain Element    id=btnGreatNoErrorsNoWarnings
    Sleep  1s
    # screen "Done"
    Take Named Screenshot If Requested     005_20_Quickstart_Done_Bursting
    Sleep  1s
    # Samples navigation is screenshot-only (no assertion); skipped on plain runs.
    # When capturing, the collapsed Processing sidebar is opened first.
    Capture Samples Screen If Requested
    Sleep  1s
    Close Electron Application


Open Electron Application
  [Documentation]  Open's your electron application with improved reliability for slower systems
  ...  ${signal_electron.binary_location} and chromedriver binary via ${chromedriver_path}
  ...  see vars.py for more details.
  # Kill any existing processes to prevent conflicts
  Run Keyword And Ignore Error    Kill DataPallas Exe Process
  Sleep    2s
     
  # Start with explicit debugging port
  ${electron_command}=    Set Variable    cmd /c "where /q refreshenv && (call refreshenv && start ${signal_electron.binary_location} --remote-debugging-port=9222) || start ${signal_electron.binary_location} --remote-debugging-port=9222"
  ${working_dir}=    Get Parent Directory    ${signal_electron.binary_location}
  Start Process    ${electron_command}    cwd=${working_dir}  shell=True
     
  # Give application more time to start and stabilize
  Log    Waiting 10 seconds for Electron to fully initialize...
  Sleep    30s
     
  # More resilient connection approach with longer timeout between attempts
  Wait Until Keyword Succeeds    15x    10s    Verify Chrome Debugger Connection
  
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
  
  # Verify we can interact with the page
  Wait Until Keyword Succeeds    3x    1s    Get Title
  
Close Electron Application
  [Documentation]  Kills the Electron application process
  Kill DataPallas Exe Process


startServer.bat and shutServer.bat Should Work Fine
    
    Sleep  1s
    Start Server
    Wait Until Keyword Succeeds    10x    3s    Check Server Is Running
    
    Sleep  1s
    Copy File    ${PORTABLE_EXECUTABLE_DIR_SERVER}/samples/burst/Payslips.pdf    ${PORTABLE_EXECUTABLE_DIR_SERVER}/poll
    Wait Until Keyword Succeeds    10x    3s    Check PDF Files Generated    3
    
    Sleep  1s
    Shut Server
    Wait Until Keyword Succeeds    10x    3s    Check Server Is Not Running
    

# Capture Failed Test Screenshot
#   [Documentation]  Captures a screenshot with a name based on the test case name
#   Capture Page Screenshot    EMBED


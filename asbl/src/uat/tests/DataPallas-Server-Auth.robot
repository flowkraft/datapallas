*** Settings ***
Library     RequestsLibrary
Library     OperatingSystem
Library     Collections
Library     resources/utilities.py
Resource    resources/utilities.robot
Variables   resources/vars.py
Test Setup       Clean Output Folders and Log Files  product=server
Test Teardown    Shut Server

Documentation    Authentication and authorization against the REAL packaged DataPallas Server.
...
...              WHY THIS CANNOT BE A PLAYWRIGHT SPEC
...              The Playwright suite runs against frend/reporting/testground/e2e, which has no
...              startServer.bat — so DataPallas resolves itself to the Desktop edition there and
...              never enforces authentication. That is deliberate: it keeps the 46 functional specs
...              free of login friction. But it also means the Playwright suite is structurally
...              incapable of testing the Server edition.
...
...              This file drives target/uat/rbs/DataPallas, the real datapallas-server.zip, which
...              DOES ship startServer.bat. It is therefore the only place where edition detection,
...              the default account, roles and share links can be proven end to end on the artifact
...              that customers actually download.

*** Variables ***
${SERVER_URL}          http://localhost:9090
${DEFAULT_USER}        burst
${DEFAULT_PASSWORD}    burst
${NEW_PASSWORD}        ChangedPassword123!
${VIEWER_USER}         uat-viewer
${VIEWER_PASSWORD}     ViewerPassword123!

*** Test Cases ***
The Packaged Server Detects Itself And Enforces Authentication
    [Documentation]    The Server edition must never come up unauthenticated. This is the single
    ...                most important assertion in the file: if it fails, everything the API exposes
    ...                — connections, their passwords, arbitrary Groovy — is open to anyone who can
    ...                reach port 9090.

    Given A Running Packaged Server

    # No session yet, so identity must be refused rather than served.
    Create Session    dp    ${SERVER_URL}    verify=${False}
    ${me}=    GET On Session    dp    /api/auth/me    expected_status=any
    Should Be Equal As Integers    ${me.status_code}    401

    # And a genuinely dangerous endpoint must be refused too, not merely the identity probe.
    ${script}=    POST On Session    dp    /api/queries/run-script
    ...    json={"connectionId": "x", "script": "return []"}    expected_status=any
    Should Contain    ${{ [401, 403] }}    ${script.status_code}

The Default Account Works And Is Advertised Until It Is Changed
    [Documentation]    A freshly downloaded server has to be usable immediately — that is why the
    ...                one-time setup token was dropped. The credentials are stated on the login
    ...                page, and that public statement IS the pressure to change them.

    Given A Running Packaged Server
    Create Session    dp    ${SERVER_URL}    verify=${False}

    # The login screen reads this before anyone can sign in, so it is public by necessity.
    ${status}=    GET On Session    dp    /api/auth/first-run
    Should Be True    ${status.json()}[usingDefaultCredentials]
    Should Be Equal    ${status.json()}[defaultUsername]    ${DEFAULT_USER}
    Should Be Equal    ${status.json()}[defaultPassword]    ${DEFAULT_PASSWORD}

    # And the account actually works.
    ${login}=    POST On Session    dp    /api/auth/login
    ...    json={"username": "${DEFAULT_USER}", "password": "${DEFAULT_PASSWORD}"}
    Should Be Equal As Integers    ${login.status_code}    200
    Should Contain    ${login.json()}[roles]    TENANT_ADMIN

Changing The Default Password Silences The Notice
    [Documentation]    The notice is derived from the password, not from a flag, so changing the
    ...                password must clear it with nothing else to remember.

    Given A Running Packaged Server
    ${session}=    Sign In As Default Administrator

    ${changed}=    PUT On Session    dp    /api/iam/users/${DEFAULT_USER}/password
    ...    json={"password": "${NEW_PASSWORD}"}    headers=${session}
    Should Be Equal As Integers    ${changed.status_code}    200

    ${status}=    GET On Session    dp    /api/auth/first-run
    Should Not Be True    ${status.json()}[usingDefaultCredentials]

    # The old password is genuinely gone, not merely hidden.
    ${old}=    POST On Session    dp    /api/auth/login
    ...    json={"username": "${DEFAULT_USER}", "password": "${DEFAULT_PASSWORD}"}    expected_status=any
    Should Be Equal As Integers    ${old.status_code}    401

Roles Are Enforced On The Packaged Server
    [Documentation]    A VIEWER must not be able to run Groovy. Reaching /api/queries/run-script is
    ...                code execution on the server, so this is the boundary that matters most.

    Given A Running Packaged Server
    ${admin}=    Sign In As Default Administrator

    ${created}=    POST On Session    dp    /api/iam/users
    ...    json={"username": "${VIEWER_USER}", "password": "${VIEWER_PASSWORD}", "role": "VIEWER"}
    ...    headers=${admin}    expected_status=any
    Should Contain    ${{ [201, 409] }}    ${created.status_code}

    ${viewer}=    Sign In    ${VIEWER_USER}    ${VIEWER_PASSWORD}

    ${script}=    POST On Session    dp    /api/queries/run-script
    ...    json={"connectionId": "x", "script": "return []"}    headers=${viewer}    expected_status=any
    Should Be Equal As Integers    ${script.status_code}    403

    ${reveal}=    POST On Session    dp    /api/connections/eml-contact/reveal-password
    ...    json={"field": "userpassword"}    headers=${viewer}    expected_status=any
    Should Be Equal As Integers    ${reveal.status_code}    403

    ${fs}=    GET On Session    dp    /api/system/fs/content?path=config/_internal/settings.xml
    ...    headers=${viewer}    expected_status=any
    Should Be Equal As Integers    ${fs.status_code}    403

The Trust Boundary Holds On The Packaged Server
    [Documentation]    Path confinement on the real artifact: the REST API must not be able to read
    ...                or write anything outside the installation directory.

    Given A Running Packaged Server
    ${admin}=    Sign In As Default Administrator

    ${outside}=    GET On Session    dp    /api/system/fs/content?path=C:/Windows/win.ini
    ...    headers=${admin}    expected_status=any
    Should Be Equal As Integers    ${outside.status_code}    400

    ${escape}=    GET On Session    dp    /api/system/fs/content?path=../../secret
    ...    headers=${admin}    expected_status=any
    Should Be Equal As Integers    ${escape.status_code}    400

Share Links Let Someone Without An Account Open A Dashboard
    [Documentation]    The end-to-end share story on the packaged server: create a link, open it with
    ...                no session at all, then revoke it and watch it close.

    Given A Running Packaged Server
    ${admin}=    Sign In As Default Administrator

    ${link}=    POST On Session    dp    /api/embed/share-link
    ...    json={"reportId": "g-dashboard"}    headers=${admin}    expected_status=any
    Should Be Equal As Integers    ${link.status_code}    200
    ${token}=    Set Variable    ${link.json()}[token]

    # A brand-new session with no cookies — exactly what a recipient of the link has.
    Create Session    anon    ${SERVER_URL}    verify=${False}
    ${opened}=    GET On Session    anon    /dashboard/g-dashboard?token=${token}
    Should Be Equal As Integers    ${opened.status_code}    200
    Should Contain    ${opened.text}    rb-dashboard
    Should Contain    ${opened.text}    embed-token=

    # Without the link, the same page is refused.
    ${bare}=    GET On Session    anon    /dashboard/g-dashboard    expected_status=any
    Should Be Equal As Integers    ${bare.status_code}    401

    ${links}=    GET On Session    dp    /api/embed/share-link?reportId=g-dashboard    headers=${admin}
    FOR    ${entry}    IN    @{links.json()}
        DELETE On Session    dp    /api/embed/share-link/${entry}[id]    headers=${admin}
    END

    ${revoked}=    GET On Session    anon    /dashboard/g-dashboard?token=${token}    expected_status=any
    Should Be Equal As Integers    ${revoked.status_code}    404

Unattended Polling Still Works With Authentication Enforced
    [Documentation]    The Server edition exists to process reports unattended. Enforcing
    ...                authentication must not break the poll folder, which is file-driven and never
    ...                goes near HTTP — this is the regression that would hurt most and show least.

    Given A Running Packaged Server

    Copy File    ${PORTABLE_EXECUTABLE_DIR_SERVER}/samples/burst/Payslips.pdf    ${PORTABLE_EXECUTABLE_DIR_SERVER}/poll
    Wait Until Keyword Succeeds    10x    3s    Check PDF Files Generated    3

*** Keywords ***
Given A Running Packaged Server
    [Documentation]    Starts the real packaged server and waits for it to answer.
    Ensure Chocolatey Is Installed
    Sleep    1s
    Refresh Env Variables
    Ensure Java Is Installed
    Sleep    1s
    Refresh Env Variables
    Start Server
    Wait Until Keyword Succeeds    10x    3s    Check Server Is Running

Check Server Is Running
    [Documentation]    GET / is public — the Angular bundle has to load before anyone can sign in.
    Create Session    root    ${SERVER_URL}    verify=${False}
    ${response}=    GET On Session    root    /
    Should Be Equal As Integers    ${response.status_code}    200

Check PDF Files Generated
    [Arguments]    ${expected_count}
    ${count}=    Count Files    ${PORTABLE_EXECUTABLE_DIR_SERVER}/output    pattern=*.pdf    recursive=True
    Should Be Equal As Integers    ${count}    ${expected_count}

Sign In
    [Arguments]    ${username}    ${password}
    [Documentation]    Signs in and returns headers carrying the session cookie.
    Create Session    dp    ${SERVER_URL}    verify=${False}
    ${response}=    POST On Session    dp    /api/auth/login
    ...    json={"username": "${username}", "password": "${password}"}
    Should Be Equal As Integers    ${response.status_code}    200
    ${cookie}=    Set Variable    ${response.headers}[Set-Cookie]
    ${session_cookie}=    Set Variable    ${{ $cookie.split(';')[0] }}
    ${headers}=    Create Dictionary    Cookie=${session_cookie}
    RETURN    ${headers}

Sign In As Default Administrator
    [Documentation]    Uses burst/burst. Each test starts from a clean installation, so the default
    ...                account is present even after the password-change test above.
    ${headers}=    Sign In    ${DEFAULT_USER}    ${DEFAULT_PASSWORD}
    RETURN    ${headers}

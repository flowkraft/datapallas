@echo off

:: Get the directory of the script
set "SCRIPT_DIR=%~dp0"

:: Remove trailing backslash
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Navigate to the DataPallas directory
cd /d "%SCRIPT_DIR%\..\.."
set "PORTABLE_EXECUTABLE_DIR_PATH=%cd%"

:: Only set RB_SERVER_MODE to false if it's not already defined
if not defined RB_SERVER_MODE (
    set "RB_SERVER_MODE=false"
)

:: Check if FRONTEND_PATH is set and points to a valid directory
if exist "%FRONTEND_PATH%" (
    set "RB_SERVER_MODE=true"
)

:: Check if POLLING_PATH is set and points to a valid directory
if exist "%POLLING_PATH%" (
    set "RB_SERVER_MODE=true"
)

echo FRONTEND_PATH (shutRbsjServer.bat): %FRONTEND_PATH%
echo POLLING_PATH (shutRbsjServer.bat): %POLLING_PATH%
echo RB_SERVER_MODE (shutRbsjServer.bat): %RB_SERVER_MODE%

:: Export the environment variables (optional, demonstration purposes)
echo PORTABLE_EXECUTABLE_DIR_PATH (shutRbsjServer.bat) is set to %PORTABLE_EXECUTABLE_DIR_PATH%
echo RB_SERVER_MODE  (shutRbsjServer.bat) is set to %RB_SERVER_MODE%


if "%RB_SERVER_MODE%"=="true" (
    powershell -File "%~dp0killOlderExesAndSpringBoots.ps1"
) else (
    :: Call killOlderExes.ps1 to kill older instances of DataPallas.exe
    powershell -File "%~dp0killOlderExesAndSpringBoots.ps1" -scriptDir "%PORTABLE_EXECUTABLE_DIR_PATH%"
)

:: The PowerShell script's exit code is ours: 0 only when the server was really stopped
exit /b %ERRORLEVEL%

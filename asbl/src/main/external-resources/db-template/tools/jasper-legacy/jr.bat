@echo off
setlocal enabledelayedexpansion

rem ---------------------------------------------------------------------------
rem  jr.bat — render a classic .jrxml through the JasperReports 6 container.
rem
rem  Same options as `datapallas.bat jasper`, so a report moves between the two
rem  engines by changing the command name and nothing else:
rem
rem    jr.bat --report-dir <dir> --jrxml <file> --format <fmt> --out <file>
rem           [--jdbc-url <url>] [--jdbc-user <u>] [--jdbc-pass <p>]
rem           [-p "KEY=VALUE"]...
rem
rem  Exit codes match the rest of the CLI: 0 ok, 1 job failed, 2 bad command line.
rem  Output is also appended to logs\jr.bat.log.
rem ---------------------------------------------------------------------------

set "IMAGE=flowkraft/datapallas-jasper-legacy:6.21.5"
set "TOOLDIR=%~dp0"
set "LOGDIR=%~dp0..\..\logs"
set "LOGFILE=%LOGDIR%\jr.bat.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1

set "ARGS="
set "REPORTDIR="
set "OUTFILE="
set "JDBCURL="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--report-dir" (
    set "REPORTDIR=%~2"
    shift & shift & goto parse
)
if /i "%~1"=="--out" (
    set "OUTFILE=%~2"
    shift & shift & goto parse
)
if /i "%~1"=="--jdbc-url" (
    set "JDBCURL=%~2"
    shift & shift & goto parse
)
if /i "%~1"=="-p" (
    set "ARGS=!ARGS! -p "%~2""
    shift & shift & goto parse
)
if /i "%~1"=="--params" (
    set "ARGS=!ARGS! -p "%~2""
    shift & shift & goto parse
)
set "ARGS=!ARGS! "%~1""
shift
goto parse
:parsed

if not defined REPORTDIR goto :noReportDir
if not defined OUTFILE goto :noOut

rem Absolute host paths, then split the output into a folder to mount and a
rem file name to write inside it.
for %%I in ("!REPORTDIR!") do set "REPORTDIR_ABS=%%~fI"
for %%I in ("!OUTFILE!") do (
    set "OUTDIR=%%~dpI"
    set "OUTNAME=%%~nxI"
)
if "!OUTDIR:~-1!"=="\" set "OUTDIR=!OUTDIR:~0,-1!"

if not exist "!REPORTDIR_ABS!" goto :badReportDir
if not exist "!OUTDIR!" mkdir "!OUTDIR!" >nul 2>&1

rem A container's "localhost" is the container. Point it at the machine jr.bat
rem is running on instead — which is also how you reach a database DataPallas
rem started for you, since those publish their port on the host.
if defined JDBCURL (
    set "JDBCURL=!JDBCURL:localhost=host.docker.internal!"
    set "JDBCURL=!JDBCURL:127.0.0.1=host.docker.internal!"
    set "ARGS=!ARGS! --jdbc-url ^"!JDBCURL!^""
)

rem First run builds the image from the Dockerfile sitting next to this script.
rem Nothing is pulled from a registry — the image is yours, built locally, and
rem every later run starts immediately.
docker image inspect "%IMAGE%" >nul 2>&1
if errorlevel 1 (
    echo INFO - %IMAGE% not found locally, building it once from %TOOLDIR%internal
    echo INFO - this takes a few minutes and needs internet access; later runs start immediately
    docker build -t "%IMAGE%" "%TOOLDIR%internal"
    if errorlevel 1 (
        echo ERROR - could not build %IMAGE%. See tools\jasper-legacy\README.md
        exit /b 1
    )
)

set "TMPOUT=%TEMP%\jr-%RANDOM%.out"

docker run --rm ^
    --add-host=host.docker.internal:host-gateway ^
    -v "!REPORTDIR_ABS!:/work/report:ro" ^
    -v "!OUTDIR!:/work/out" ^
    -v "!TOOLDIR!lib:/opt/jr/userlib:ro" ^
    !IMAGE! ^
    --report-dir /work/report --out "/work/out/!OUTNAME!" !ARGS! > "!TMPOUT!" 2>&1

set "RC=!ERRORLEVEL!"

type "!TMPOUT!"
echo. >> "!LOGFILE!"
echo ===== %DATE% %TIME% jr.bat %* >> "!LOGFILE!"
type "!TMPOUT!" >> "!LOGFILE!"
del "!TMPOUT!" >nul 2>&1

exit /b !RC!

:noReportDir
call :usage "Missing required option: --report-dir"
exit /b 2

:noOut
call :usage "Missing required option: --out"
exit /b 2

:badReportDir
call :usage "Report folder not found: !REPORTDIR_ABS!"
exit /b 2

:usage
echo ERROR - %~1
echo.
echo Usage: jr.bat --report-dir ^<dir^> --jrxml ^<file^> --format ^<fmt^> --out ^<file^>
echo               [--jdbc-url ^<url^>] [--jdbc-user ^<u^>] [--jdbc-pass ^<p^>] [-p "KEY=VALUE"]...
goto :eof

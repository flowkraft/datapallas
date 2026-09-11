@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  Starts the JasperReports 6 renderer as a REST service.
rem
rem    POST http://localhost:9095/api/reports/render
rem    GET  http://localhost:9095/api/health
rem
rem  Use this when something else needs to render classic reports over HTTP, or
rem  when you are rendering enough of them that a container start per report
rem  hurts. For a one-off report, jr.bat is simpler and needs nothing running.
rem
rem  Optional environment variables:
rem    JASPER_LEGACY_PORT      port to listen on          (default 9095)
rem    JASPER_LEGACY_REPORTS   folder holding the reports (default ..\..\config\reports-jasper-legacy)
rem ---------------------------------------------------------------------------

set "INTERNAL=%~dp0internal"

if not defined JASPER_LEGACY_PORT set "JASPER_LEGACY_PORT=9095"

echo Starting the JasperReports 6 renderer on port %JASPER_LEGACY_PORT% ...
docker compose -f "%INTERNAL%\docker-compose.yml" up -d --build api
if errorlevel 1 (
    echo ERROR - could not start the service. See tools\jasper-legacy\README.md
    exit /b 1
)

echo.
echo   REST API   http://localhost:%JASPER_LEGACY_PORT%/api/reports/render
echo   Health     http://localhost:%JASPER_LEGACY_PORT%/api/health
echo   Stop it    shutJasperLegacyServer.bat
echo.
exit /b 0

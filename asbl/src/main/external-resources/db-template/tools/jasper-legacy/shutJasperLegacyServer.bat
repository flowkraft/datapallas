@echo off
setlocal

rem Stops the JasperReports 6 REST service. jr.bat keeps working without it.

set "INTERNAL=%~dp0internal"

echo Stopping the JasperReports 6 renderer ...
docker compose -f "%INTERNAL%\docker-compose.yml" down
exit /b %ERRORLEVEL%

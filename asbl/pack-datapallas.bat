@echo off

echo ========================================
echo Checking Docker Desktop is running...
echo ========================================
docker info >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker Desktop is not running. Please start it before running this script.
    exit /b 1
)
echo Docker Desktop is running.

echo ========================================
echo Cleaning build artifacts and Maven cache
echo ========================================

REM Clean dist and target directories
IF EXIST dist (
    echo Removing dist directory...
    del /S /Q dist\*
    RMDIR /S /Q dist
)

IF EXIST target (
    echo Removing target directory...
    del /S /Q target\*
    RMDIR /S /Q target
)

IF EXIST pack-datapallas.log (
    echo Removing old log file...
    del /f /q pack-datapallas.log
)

REM Clean Maven cache for project artifacts (prevents cached failures)
echo Clearing Maven cache for project artifacts...

IF EXIST %USERPROFILE%\.m2\repository\com\sourcekraft (
    echo   - Clearing com.sourcekraft artifacts
    rmdir /S /Q %USERPROFILE%\.m2\repository\com\sourcekraft
)

IF EXIST %USERPROFILE%\.m2\repository\com\flowkraft (
    echo   - Clearing com.flowkraft artifacts
    rmdir /S /Q %USERPROFILE%\.m2\repository\com\flowkraft
)

echo ========================================
echo Building from parent directory (reactor-aware)
echo ========================================

REM Go to parent directory so Maven sees the reactor
pushd ..\

REM STEP 1: Install parent POM first (critical!)
echo Installing parent POM...
call mvn install -U -f xtra-tools\bild\common-scripts\maven\pom.xml > asbl\pack-datapallas.log 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Parent POM install failed. Check asbl\pack-datapallas.log for details.
    popd
    exit /b %ERRORLEVEL%
)

REM STEP 2: Build asbl and all its dependencies using Maven reactor
echo Building asbl and dependencies...
call mvn clean install -pl asbl -am -DskipTests -U >> asbl\pack-datapallas.log 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed. Check asbl\pack-datapallas.log for details.
    popd
    exit /b %ERRORLEVEL%
)

REM STEP 3: Now run the test
echo Running AssemblerTest#assembleDataPallasAndDataPallasServer...
call mvn test -pl asbl -Dtest=AssemblerTest#assembleDataPallasAndDataPallasServer -X >> asbl\pack-datapallas.log 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Test failed. Check asbl\pack-datapallas.log for details.
    popd
    exit /b %ERRORLEVEL%
)

popd

echo ========================================
echo Build complete. Check pack-datapallas.log for details
echo ========================================

REM Upload dist artifacts to Backblaze B2 (datapallas/newest/)
REM rclone --config rclone.conf copy C:/Projects/reportburster/asbl/dist/ backblaze:datapallas/newest/ --include "datapallas.zip" --include "datapallas-server.zip" --include "datapallas-server-docker.zip" --include "datapallas-src.zip" --progress

REM Push Docker image to Docker Hub (flowkraft/datapallas-server)
REM Two tags are pushed: :latest first, then the real version read back from
REM the image's `version` LABEL via `docker inspect`. The LABEL was patched
REM by DockerAssembler from the pom.xml <revision> placeholder — do not pass
REM the version manually here, let docker inspect discover it from the image.

REM CMD:        docker login -u flowkraft && docker push flowkraft/datapallas-server:latest && for /f "tokens=*" %v in ('docker inspect --format "{{ index .Config.Labels \"version\" }}" flowkraft/datapallas-server:latest') do docker push flowkraft/datapallas-server:%v
REM PowerShell: docker login -u flowkraft; docker push flowkraft/datapallas-server:latest; $v = docker inspect --format '{{ .Config.Labels.version }}' flowkraft/datapallas-server:latest; docker push flowkraft/datapallas-server:$v

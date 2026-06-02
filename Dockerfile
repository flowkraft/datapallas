# =============================================================================
# DataPallas Server Dockerfile
# Multi-stage build optimized for caching and clean builds
# =============================================================================
#
# RELEASE BUILDS ARE DRIVEN BY DockerAssembler.java (asbl/.../assembly/),
# NOT by hand-typed `docker build`. The assembler:
#   1. Reads the version from pom.xml -> settings.xml
#   2. Rewrites this file to Dockerfile.assembled, patching the
#      `version="0.0.0"` placeholder in the LABEL block below with the
#      real value (e.g. version="15.2.0")
#   3. Runs `docker build` with TWO tags: :latest AND :<version>
# See asbl/pack-datapallas.bat for the push step that uploads both tags.
#
# BUILD MODES:
#
# 1. DEVELOPMENT BUILD (uses cache, fast rebuilds):
#    docker build -t flowkraft/datapallas-server:dev .
#
# 2. RELEASE BUILD (100% clean, no cache) — normally invoked via DockerAssembler:
#    docker build --no-cache --build-arg BUILD_DATE=$(date -u +%Y%m%d%H%M%S) \
#                 -t flowkraft/datapallas-server:X.Y.Z .
#
# =============================================================================

# -----------------------------------------------------------------------------
# STAGE 1: Maven Dependencies (cached unless pom.xml changes)
# -----------------------------------------------------------------------------
FROM maven:3.9.9-eclipse-temurin-17-alpine AS maven-deps

# Build date arg - change this to bust cache for release builds
ARG BUILD_DATE=dev

WORKDIR /app

# Install custom jar that's not in Maven Central (rarely changes, cache it)
COPY ./xtra-tools/bild/common-scripts/maven/lib-repository/burst/pherialize-1.2.1.jar /tmp/
RUN mvn install:install-file \
    -Dfile=/tmp/pherialize-1.2.1.jar \
    -DgroupId=de.ailis.pherialize \
    -DartifactId=pherialize \
    -Dversion=1.2.1 \
    -Dpackaging=jar \
    -P docker && \
    rm /tmp/pherialize-1.2.1.jar

# Copy ONLY pom.xml files first (for dependency caching)
COPY ./pom.xml ./pom.xml
COPY ./xtra-tools/bild/common-scripts/maven/pom.xml ./xtra-tools/bild/common-scripts/maven/pom.xml
COPY ./bkend/common/pom.xml ./bkend/common/pom.xml
COPY ./bkend/update/pom.xml ./bkend/update/pom.xml
COPY ./bkend/reporting/pom.xml ./bkend/reporting/pom.xml
COPY ./bkend/server/pom.xml ./bkend/server/pom.xml

# Download all dependencies (this layer is cached until pom.xml changes)
RUN mvn dependency:go-offline -B -P docker || true

# -----------------------------------------------------------------------------
# STAGE 2: Build Java Backend
# -----------------------------------------------------------------------------
FROM maven-deps AS backend-build

# Now copy source code (changes frequently, not cached)
COPY ./bkend/common/src ./bkend/common/src
COPY ./bkend/update/src ./bkend/update/src
COPY ./bkend/reporting/src ./bkend/reporting/src
COPY ./bkend/server/src ./bkend/server/src

# Build all modules
RUN mvn clean install -DskipTests -P docker

# Copy dependencies for burst library
RUN mvn dependency:copy-dependencies -P docker

# -----------------------------------------------------------------------------
# STAGE 3: Build Angular Frontend (parallel with backend in BuildKit)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

# Build date arg for cache busting
ARG BUILD_DATE=dev

WORKDIR /app/frend

# Copy package files first (for npm cache)
COPY ./frend/reporting/package*.json ./
# Also copy rb-webcomponents package files so we can install its deps (cacheable)
COPY ./frend/rb-webcomponents/package*.json ../rb-webcomponents/

# Install dependencies (cached unless package.json changes)
RUN npm install -g @angular/cli && npm install --force && npm --prefix ../rb-webcomponents install --force

# Copy source code and build
COPY ./frend/reporting .
COPY ./frend/rb-webcomponents ../rb-webcomponents

# Build Angular for web deployment
RUN npm run custom:release-web && npm prune --production --force

# -----------------------------------------------------------------------------
# STAGE 4: Runtime Image
# -----------------------------------------------------------------------------
FROM eclipse-temurin:17-jre

# Metadata
# NOTE: version="0.0.0" is a PLACEHOLDER. DockerAssembler.java rewrites it
# during packaging to the real value read from pom.xml <revision>.
# DO NOT MANUALLY CHANGE IT — bump the version in pom.xml instead.
LABEL maintainer="FlowKraft" \
      version="0.0.0" \
      description="DataPallas Server - Business Intelligence, Reporting, and Document Distribution in the Age of AI"

# Make apt resilient against archive.ubuntu.com flakiness:
#   - 80-retries: retry transient download failures up to 5 times instead of failing on first connection error
#   - mirror swap: replace archive.ubuntu.com (round-robin pool with frequently-failing IPs) with
#     azure.archive.ubuntu.com (Canonical's anycast Azure-fronted mirror, single healthy logical endpoint)
# Handles both deb822 (noble: /etc/apt/sources.list.d/ubuntu.sources) and legacy (/etc/apt/sources.list) layouts
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
        sed -i 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list.d/ubuntu.sources; \
    fi && \
    if [ -f /etc/apt/sources.list ]; then \
        sed -i 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list; \
    fi

# Install runtime dependencies + Docker CE CLI with compose v2 plugin
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    docker-ce-cli \
    docker-compose-plugin \
    rclone \
    openssh-client \
    rsync \
    bash \
    perl \
    gawk \
    sed \
    jq \
    xmlstarlet \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy template folder structure (rarely changes)
COPY ./asbl/src/main/external-resources/db-template .
COPY ./asbl/src/main/external-resources/db-server-template .
COPY ./bkend/reporting/src/main/external-resources/template .

# NoExeAssembler generated files (config, db)
COPY ./asbl/target/package/verified-db-noexe/DataPallas/_apps ./_apps
COPY ./asbl/target/package/verified-db-noexe/DataPallas/config ./config
COPY ./asbl/target/package/verified-db-noexe/DataPallas/db ./db

# Preserve a copy of defaults in a safe location so runtime can extract them
RUN mkdir -p /opt/datapallas/defaults && cp -a ./config /opt/datapallas/defaults/ || true

# Configure default settings for Docker environment (robust, portable replacements)
RUN perl -0777 -pi -e 's#<host\b[^>]*>\s*localhost\s*</host>#<host>mailhog</host>#ig' /app/config/burst/settings.xml && \
    perl -0777 -pi -e 's#<weburl\b[^>]*>\s*https?://localhost:8025\s*</weburl>#<weburl>http://mailhog:8025</weburl>#ig' /app/config/burst/settings.xml && \
    perl -0777 -pi -e 's#<runtime\b[^>]*>\s*windows\s*</runtime>#<runtime>docker</runtime>#ig' /app/config/_internal/settings.xml

# Copy built artifacts from build stages
COPY --from=frontend-build /app/frend/dist /app/lib/frend
# Copy rb-webcomponents assets built during frontend build into tools for runtime serving
COPY --from=frontend-build /app/rb-webcomponents/dist /app/tools/rb-webcomponents
COPY --from=backend-build /app/bkend/reporting/target/dependencies /app/lib/burst
COPY --from=backend-build /app/bkend/reporting/target/rb-reporting.jar /app/lib/burst/rb-reporting.jar
COPY --from=backend-build /app/bkend/server/target/rb-server.jar /app/lib/server/rb-server.jar

# Generate datapallas.sh script (matches .bat functionality with dynamic args)
RUN cat > ./datapallas.sh << 'EOF'
#!/bin/sh
# DataPallas CLI - matches Windows .bat behavior
# Passes all arguments dynamically to the Java process

# Build argument string for Ant
ARGS=""
COUNT=1
for ARG in "$@"; do
    ARGS="$ARGS -Darg$COUNT=\"$ARG\""
    COUNT=$((COUNT + 1))
done

# Execute with all arguments
eval java -DDOCUMENTBURSTER_HOME="$(pwd)" \
    -cp "lib/burst/ant-launcher*.jar" \
    org.apache.tools.ant.launch.Launcher \
    -buildfile config/_internal/documentburster.xml \
    $ARGS \
    -emacs >> logs/datapallas.sh.log 2>&1
EOF
RUN sed -i 's/\r$//' ./datapallas.sh && chmod +x ./datapallas.sh

# Generate test email server scripts
RUN echo '#!/bin/sh' > ./tools/test-email-server/startTestEmailServer.sh && \
    echo 'docker start mailhog' >> ./tools/test-email-server/startTestEmailServer.sh && \
    sed -i 's/\r$//' ./tools/test-email-server/startTestEmailServer.sh && \
    chmod +x ./tools/test-email-server/startTestEmailServer.sh

RUN echo '#!/bin/sh' > ./tools/test-email-server/shutTestEmailServer.sh && \
    echo 'docker stop mailhog' >> ./tools/test-email-server/shutTestEmailServer.sh && \
    sed -i 's/\r$//' ./tools/test-email-server/shutTestEmailServer.sh && \
    chmod +x ./tools/test-email-server/shutTestEmailServer.sh

# Create the docker-entrypoint.sh script and normalize line endings
RUN cat > /usr/local/bin/docker-entrypoint.sh << 'ENTRYPOINT_EOF'
#!/bin/bash
set -e

# =============================================================================
# DataPallas Docker Entrypoint
# Handles first-run extraction, API key generation and server startup
# =============================================================================

PORTABLE_EXECUTABLE_DIR_PATH=/app
FRONTEND_PATH=/app/lib/frend
POLLING_PATH=/app/poll
API_KEY_FILE=/app/config/_internal/api-key.txt
CONFIG_JSON_FILE=/app/lib/frend/assets/config.json
SERVER_PORT=${SERVER_PORT:-9090}

# -----------------------------------------------------------------------------
# Function: Generate or load API key
# Mirrors the behavior of startRbsjServer.bat on Windows
# -----------------------------------------------------------------------------
setup_api_key() {
    # Check if API_KEY is provided via environment variable
    if [ -n "$API_KEY" ]; then
        echo "Using API key from environment variable"
        CURRENT_API_KEY="$API_KEY"
    elif [ -f "$API_KEY_FILE" ]; then
        # Read existing API key from file (persisted via volume)
        CURRENT_API_KEY=$(cat "$API_KEY_FILE" | tr -d '[:space:]')
        echo "Loaded existing API key from $API_KEY_FILE"
    else
        # Generate new API key (32 bytes = 256 bits, base64 encoded)
        CURRENT_API_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 43)
        echo "Generated new API key"
    fi
    
    # Ensure config directory exists
    mkdir -p "$(dirname "$API_KEY_FILE")"
    mkdir -p "$(dirname "$CONFIG_JSON_FILE")"
    
    # Write API key to file for backend to read
    echo -n "$CURRENT_API_KEY" > "$API_KEY_FILE"
    
    # Write config.json for Angular frontend (matches startRbsjServer.bat behavior)
    cat > "$CONFIG_JSON_FILE" << EOF
{
  "apiKey": "$CURRENT_API_KEY"
}
EOF
    
    echo "API key configured for both backend and frontend"
}

# -----------------------------------------------------------------------------
# Main: Route based on first argument
# -----------------------------------------------------------------------------
if [ "$1" = "datapallas.sh" ]; then
    # CLI mode: run datapallas.sh with remaining arguments
    shift
    exec ./datapallas.sh "$@"
else
    # Server mode: start the Spring Boot server
    echo "Starting DataPallas Server..."

    # No automatic initial-folder extraction is performed here; ensure host mounts
    # are populated externally when needed
    
    # Setup API key authentication (TEMPORARILY DISABLED for rollback)
    # setup_api_key
    
    # Export environment variables
    export PORTABLE_EXECUTABLE_DIR_PATH
    export FRONTEND_PATH
    export POLLING_PATH
    export SERVE_WEB=true
    
    # Mark that we're running inside Docker - used by Java code to adjust hostnames
    # for connecting to sibling containers via host.docker.internal
    export RUNNING_IN_DOCKER=true
    
    # Clean up temp files (like Windows bat does)
    find /app/temp -type f ! -name "*progress*" -delete 2>/dev/null || true
    
    # Start the Spring Boot server
    # TEMP: API key disabled for rollback — API key will not be passed as a JVM -D to avoid accidental usage
    exec java \
        -Dorg.springframework.boot.logging.LoggingSystem=org.springframework.boot.logging.log4j2.Log4J2LoggingSystem \
        -Dlog4j.configurationFile=/app/log4j2.xml \
        -Dserver.port=$SERVER_PORT \
        -DPORTABLE_EXECUTABLE_DIR=$PORTABLE_EXECUTABLE_DIR_PATH \
        -DUID=$SERVER_PORT \
        -Dspring.resources.add-mappings=true \
        -Dspring.web.resources.static-locations=file:///$FRONTEND_PATH \
        -Dspring.mvc.static-path-pattern="/**" \
        -DPOLLING_PATH=$POLLING_PATH \
        -jar /app/lib/server/rb-server.jar
fi
ENTRYPOINT_EOF

# Normalize line endings and make the entrypoint executable
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

# Create required directories
RUN mkdir -p /app/temp /app/logs /app/poll /app/output /app/quarantine /app/backup

# Expose port
EXPOSE 9090

# Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#     CMD curl -f http://localhost:9090/api/system/version || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

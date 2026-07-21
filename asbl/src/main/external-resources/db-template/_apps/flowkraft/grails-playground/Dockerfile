# FlowKraft Unified App - Grails 7 Application
# Multi-stage build for smaller final image

# ===== Stage 0: Tailwind CSS =====
# Rebuild grails-app/assets/stylesheets/tailwind.css against THIS app's views — the blueprint PLUS any
# _custom overrides applied at scaffold time — so a utility class an override introduces (e.g. the
# md:inline-flex / sm:inline / md:flex on the portal + admin nav) is actually compiled into the CSS.
# The tailwind.css shipped in the blueprint is built from the blueprint's OWN views only, and the
# Gradle stage below never regenerates it; without this stage an override's new class silently never
# reaches the stylesheet and the element it styles stays permanently hidden. (Next.js gets this for
# free — `next build` recompiles Tailwind over the whole app, overrides included; this is the Grails
# equivalent.) css:build reads src/tailwind.source.css, whose @source glob scans grails-app/views/**.
FROM node:20-alpine AS css
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY grails-app ./grails-app
RUN npm run css:build

# ===== Stage 1: Build =====
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /build

# Install Gradle (matching wrapper version)
RUN apk add --no-cache curl unzip && \
    curl -L https://services.gradle.org/distributions/gradle-8.14.3-bin.zip -o gradle.zip && \
    unzip gradle.zip && \
    mv gradle-8.14.3 /opt/gradle && \
    rm gradle.zip

ENV PATH="/opt/gradle/bin:${PATH}"

# Copy build files first for better caching
COPY build.gradle settings.gradle gradle.properties ./
COPY gradle ./gradle

# Download dependencies (cached layer)
RUN gradle dependencies --no-daemon || true

# Copy source code
COPY grails-app ./grails-app
COPY src ./src

# Overwrite the shipped stylesheet with the one Stage 0 rebuilt over this app's views + overrides,
# so the classes those overrides use are present before the asset pipeline bundles it into the WAR.
COPY --from=css /build/grails-app/assets/stylesheets/tailwind.css ./grails-app/assets/stylesheets/tailwind.css

# Build the application and prepare the executable WAR
RUN gradle assemble --no-daemon && \
    find /build/build/libs -name "*.war" ! -name "*-plain.war" -exec cp {} /build/build/libs/app.war \;

# ===== Stage 2: Runtime =====
FROM eclipse-temurin:21-jre-alpine

LABEL maintainer="FlowKraft Team"
LABEL description="FlowKraft Unified Admin + Portal Application"
LABEL version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1000 flowkraft && \
    adduser -u 1000 -G flowkraft -s /bin/sh -D flowkraft

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy the built WAR from builder stage
COPY --from=builder /build/build/libs/app.war app.war

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs && \
    chown -R flowkraft:flowkraft /app

# Switch to non-root user
USER flowkraft

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD curl -f http://localhost:8080/actuator/health || exit 1

# JVM options for container environment
ENV JAVA_OPTS="-Xmx512m -Xms256m \
    -XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -Djava.security.egd=file:/dev/./urandom"

# Run the application
ENTRYPOINT ["java", "-jar", "app.war"]

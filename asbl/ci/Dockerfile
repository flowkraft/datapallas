# =============================================================================
# DataPallas Linux CI build container (used by asbl/ci/dp-ci.sh)
#
# Holds only the TOOLS: JDK 17 + Maven, Node 20, Docker CLI, fonts. The source
# and every build output stay in the repo folder, which dp-ci.sh bind-mounts at
# its own host path. Docker images are built by the HOST daemon through the
# mounted /var/run/docker.sock.
# =============================================================================
FROM maven:3.9.9-eclipse-temurin-17

RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git zip unzip bzip2 \
        fontconfig fonts-dejavu-core fonts-liberation \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        nodejs docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# OS libraries Chromium needs for the Playwright e2e runs (the browser itself is downloaded by the
# repo's `npm install` into /root/.cache/ms-playwright). A newer Playwright is used only for
# install-deps, because the repo's 1.41 predates Ubuntu 24.04 package names.
RUN npx -y playwright@1.47.2 install-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm

# install-deps also installs OpenType (.otf) fonts (fonts-tlwg-loma-otf, fonts-unifont). docx4j's font discovery
# then loads them and needs a PDFBox 3 class the backend does not ship, so the backend JUnit Docx4jTests fail with
# NoClassDefFoundError org/apache/pdfbox/io/RandomAccessReadBuffer. The e2e runs do not need these fonts.
RUN apt-get purge -y fonts-tlwg-loma-otf fonts-unifont && ! find / -xdev -iname '*.otf' | grep -q .

# Microsoft core fonts (Times New Roman, Arial, ...), which the Windows machines running the e2e suite have. Without them
# PDFBox logs "Using fallback font LiberationSerif-BoldItalic for TimesNewRomanPS-BoldItalicMT" at WARN while bursting the
# sample PDFs, and every "No Errors / No Warnings" check after such a burst fails. TrueType only: no .otf (see above).
RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
 && apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
 && rm -rf /var/lib/apt/lists/* \
 && fc-list | grep -qi "Times New Roman" && ! find / -xdev -iname '*.otf' | grep -q .

# virtual X display: the e2e config runs browsers headed (headless:false), same as on Windows.
# libxtst6: with DISPLAY set (xvfb-run) a plain JVM loads the AWT X toolkit (libawt_xawt.so needs libXtst.so.6), e.g.
# the e2e helper that compiles a .jasper with `java -cp lib/burst/* CompileJasperTemplate.java`. A Linux desktop has it.
# libgtk-3-0t64: Electron (E2E_TARGET=electron) links against GTK 3; Playwright's Chromium deps do not include it.
RUN apt-get update && apt-get install -y --no-install-recommends xvfb xauth libxtst6 libgtk-3-0t64 && rm -rf /var/lib/apt/lists/*

# Chromium for the web e2e runs: Chrome for Testing 138 = the Chromium inside Electron 37.10.3, the engine the Windows runs
# test with. Playwright 1.41's bundled Chromium 120 segfaults in the renderer on the connection "Database Schema" screens
# (plan §4 D2). dp-ci.sh sets E2E_CHROMIUM_EXECUTABLE to this binary. Move it together with the Electron version.
ARG CFT_VERSION=138.0.7204.183
RUN curl -fsSL -o /tmp/cft.zip "https://storage.googleapis.com/chrome-for-testing-public/${CFT_VERSION}/linux64/chrome-linux64.zip" \
 && mkdir -p /opt/chrome-for-testing && unzip -q /tmp/cft.zip -d /opt/chrome-for-testing && rm /tmp/cft.zip \
 && /opt/chrome-for-testing/chrome-linux64/chrome --version | grep -q "${CFT_VERSION}"

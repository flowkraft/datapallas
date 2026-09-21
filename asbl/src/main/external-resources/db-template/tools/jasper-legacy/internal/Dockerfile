# DataPallas — JasperReports 6 legacy renderer
#
# Builds a self-contained image that renders classic .jrxml (JasperReports
# 1.x - 6.21), the format the JasperReports 7 engine inside DataPallas cannot
# read. It lives in a container rather than in DataPallas because the two
# libraries disagree on shared dependencies — JasperReports 6 pins
# openpdf 1.3.32 and jfreechart 1.0.19 against DataPallas's 1.3.43 and 1.5.6 —
# and a process boundary is the only way to hold both at once.
#
#   docker build -t flowkraft/datapallas-jasper-legacy:6.21.5 .
#
# See README.md for usage; jr.bat / jr.sh wrap the docker run.

# ---------------------------------------------------------------- build stage
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /build
COPY pom.xml .

# Resolve dependencies against the pom alone first, so editing the runner
# source does not re-download the world on every rebuild.
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q package

# -------------------------------------------------------------- runtime stage
FROM eclipse-temurin:17-jre

# JasperReports measures text through AWT before it ever reaches the exporter,
# and AWT needs real fonts on disk. Without fontconfig a report using a logical
# font (SansSerif, Serif) fails on a headless image even though the template is
# perfectly valid. DejaVu covers the fonts most Studio templates name; anything
# else the customer owns goes in lib/ as a font-extension jar.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/jr

COPY --from=build /build/target/jasper-legacy-runner.jar /opt/jr/lib/
COPY --from=build /build/target/lib/ /opt/jr/lib/

# Mount point for the customer's own jars — scriptlets, custom data sources,
# custom functions, corporate font extensions, licence-restricted JDBC drivers.
# Created empty so the classpath entry is valid even when nothing is mounted.
RUN mkdir -p /opt/jr/userlib /work/report /work/templates /work/db /work/out

# The customer's jars come first: a report that was built against their version
# of a library should get their version of it.
ENTRYPOINT ["java", \
  "-Djava.awt.headless=true", \
  "-cp", "/opt/jr/userlib/*:/opt/jr/lib/*", \
  "com.flowkraft.jasperlegacy.JasperLegacyRunner"]

CMD ["--help"]

# Build stage
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app

# Copy Maven wrapper first and download Maven distribution (rarely changes)
COPY mvnw mvnw.cmd ./
COPY .mvn/ .mvn/
# mvnw is tracked without the executable bit (git mode 100644), so the build context has it as 0644 and
# "./mvnw" fails with "Permission denied" (exit 126) on every machine — plan §4 D6. Set the bit here
# rather than rely on file modes, which Windows checkouts do not carry anyway.
RUN chmod +x mvnw && ./mvnw --version

# Copy build files and download dependencies
COPY pom.xml ./
RUN ./mvnw dependency:go-offline -B || true

# Now copy the rest of the source code
COPY . .

# Build the application
# "COPY . ." above brings mvnw back without the executable bit, so set it again.
RUN chmod +x mvnw && ./mvnw clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

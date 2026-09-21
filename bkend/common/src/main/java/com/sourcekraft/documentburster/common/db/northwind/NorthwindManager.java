package com.sourcekraft.documentburster.common.db.northwind;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.ProcessResult;
import com.sourcekraft.documentburster.common.ServicesManager;
import com.sourcekraft.documentburster.common.db.ContainerAddresses;
import com.sourcekraft.documentburster.utils.Utils;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Persistence;
import net.jodah.failsafe.Failsafe;
import net.jodah.failsafe.RetryPolicy;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * Manages database containers for the Northwind sample database using a
 * docker-compose file. Supports PostgreSQL, MySQL, SQLite, SQL Server, Oracle,
 * MariaDB, and IBM DB2. Data is persisted in external volumes. Initialization
 * occurs only if data is not present.
 */
public class NorthwindManager implements AutoCloseable {

	private static final Logger log = LoggerFactory.getLogger(NorthwindManager.class);

	private static final String DOCKER_COMPOSE_FILENAME = "docker-compose.yml";
	private static final String MARKER_FILENAME = ".northwind_initialized";

	// State-tracking maps
	private final Map<DatabaseVendor, Boolean> runningDatabases = new HashMap<>();
	private final Map<DatabaseVendor, Path> activeDataPaths = new HashMap<>();
	private final Map<DatabaseVendor, Integer> activeHostPorts = new HashMap<>();

	private final String baseDataPath;
	private final String dockerComposeFilePath;
	private File sqliteDbFile;

	/**
	 * Defines the supported database vendors with their default connection
	 * properties.
	 */
	public enum DatabaseVendor {
		POSTGRES(5432, "postgres", "postgres", "Northwind", Duration.ofMinutes(30)),
		MYSQL(3306, "root", "password", "Northwind", Duration.ofMinutes(30)),
		MARIADB(3307, "root", "password", "Northwind", Duration.ofMinutes(30)), // Use 3307 to avoid conflict
		SQLITE(0, null, null, "Northwind", Duration.ofMinutes(10)),
		DUCKDB(0, null, null, "northwind.duckdb", Duration.ofMinutes(10)),
		SQLSERVER(1433, "sa", "Password123!", "Northwind", Duration.ofMinutes(60)),
		ORACLE(1521, "oracle", "oracle", "XEPDB1", Duration.ofMinutes(60)), // DB name is XE for Oracle XE
		DB2(50000, "db2inst1", "password", "NORTHWND", Duration.ofMinutes(60)),
		CLICKHOUSE(8123, "default", "clickhouse", "northwind", Duration.ofMinutes(30)), // HTTP interface port
		SUPABASE(5435, "supabase_admin", "postgres", "Northwind", Duration.ofMinutes(30)); // Supabase PostgreSQL BaaS

		private final int containerPort;
		private final String defaultUser;
		private final String defaultPassword;
		private final String defaultDbName;
		private final Duration defaultTimeout;

		DatabaseVendor(int containerPort, String defaultUser, String defaultPassword, String defaultDbName,
				Duration defaultTimeout) {
			this.containerPort = containerPort;
			this.defaultUser = defaultUser;
			this.defaultPassword = defaultPassword;
			this.defaultDbName = defaultDbName;
			this.defaultTimeout = defaultTimeout;
		}

		public int getContainerPort() {
			return containerPort;
		}

		public String getDefaultUser() {
			return defaultUser;
		}

		public String getDefaultPassword() {
			return defaultPassword;
		}

		public String getDefaultDbName() {
			return defaultDbName;
		}

		public Duration getDefaultTimeout() {
			return defaultTimeout;
		}

		public String getDockerComposeServiceName() {
			if (this == SQLSERVER) {
				return "sqlserver"; // docker-compose service names cannot contain uppercase
			}
			if (this == SUPABASE) {
				return "supabase-db"; // Supabase uses its own compose file with this service name
			}
			return this.name().toLowerCase();
		}
	}

	/**
	 * Initializes the manager, locates the docker-compose file, and sets up the
	 * base data path.
	 */
	public NorthwindManager() throws Exception {
		this.baseDataPath = Utils.getDbFolderPath();
		Path dbTemplatePath = Paths.get(baseDataPath);
		this.dockerComposeFilePath = dbTemplatePath.resolve(DOCKER_COMPOSE_FILENAME).toString();

		for (DatabaseVendor vendor : DatabaseVendor.values()) {
			runningDatabases.put(vendor, false);
		}
	}

	/**
	 * Returns the docker-compose file path for the given vendor.
	 * Supabase uses its own compose file in a subdirectory.
	 */
	private String getDockerComposeFilePathForVendor(DatabaseVendor vendor) {
		if (vendor == DatabaseVendor.SUPABASE) {
			return Paths.get(baseDataPath, "supabase", DOCKER_COMPOSE_FILENAME).toString();
		}
		return this.dockerComposeFilePath;
	}

	/**
	 * Starts a database service using Docker Compose, then initializes it with data
	 * if it's the first run.
	 */
	public void startDatabase(DatabaseVendor vendor, String customHostPath, Integer customHostPort) throws Exception {
		// --- Path and Port Determination ---
		Path hostDataPath = (customHostPath != null && !customHostPath.trim().isEmpty())
				? Paths.get(customHostPath).toAbsolutePath()
				: getDefaultHostDataPath(vendor);

		Integer hostPortToUse = (customHostPort != null) ? customHostPort : getDefaultHostPort(vendor);

		log.info("[" + vendor + "] Starting database: vendor={}, hostPort={}, hostDataPath={}",
				vendor, hostPortToUse, hostDataPath);

		// --- Initialization Check ---
		boolean needsInitialization;
		if (vendor == DatabaseVendor.SQLITE) {
			sqliteDbFile = hostDataPath.resolve("northwind.db").toFile();
			needsInitialization = !sqliteDbFile.exists() || sqliteDbFile.length() == 0;
		} else if (vendor == DatabaseVendor.DUCKDB) {
			sqliteDbFile = hostDataPath.resolve("northwind.duckdb").toFile();
			needsInitialization = !sqliteDbFile.exists() || sqliteDbFile.length() == 0;
		} else {
			Path markerFile = hostDataPath.resolve(MARKER_FILENAME);
			needsInitialization = !Files.exists(markerFile);
			// Marker absent but DB may already have data (persistent container, deleted marker, CI wipe).
			if (needsInitialization) {
				try {
					if (northwindExistsInDatabase(vendor)) {
						log.info("[{}] Northwind tables already in DB; recreating marker, skipping init", vendor);
						Files.createDirectories(hostDataPath);
						if (!Files.exists(markerFile)) Files.createFile(markerFile);
						needsInitialization = false;
					}
				} catch (Exception e) {
					log.warn("[{}] Could not check DB for existing Northwind data: {}", vendor, e.getMessage());
					// fall through — attempt init as normal
				}
			}
		}

		activeDataPaths.put(vendor, hostDataPath);
		if (hostPortToUse != null) {
			activeHostPorts.put(vendor, hostPortToUse);
		}

		// --- Start Service ---
		if (vendor == DatabaseVendor.SQLITE) {
			setupSQLite(hostDataPath);
		} else if (vendor == DatabaseVendor.DUCKDB) {
			setupDuckDB(hostDataPath);
		} else {
			startDatabaseWithDockerCompose(vendor, hostPortToUse);
		}

		// --- Update State ---
		runningDatabases.put(vendor, true);

		// --- Initialize Data (if needed) ---
		if (needsInitialization) {
			initializeDatabaseWithGenerator(vendor, hostDataPath);
		}

		log.info("Northwind DB Started: {} | Data Path: {} | JDBC URL: {}", vendor, getActualDataPath(vendor),
				getJdbcUrl(vendor));
	}

	public void startDatabase(DatabaseVendor vendor, String customHostPath) throws Exception {
		startDatabase(vendor, customHostPath, null);
	}

	/**
	 * Executes `docker-compose up` for a specific service.
	 */
	private void startDatabaseWithDockerCompose(DatabaseVendor vendor, Integer hostPort) throws Exception {
		String serviceName = vendor.getDockerComposeServiceName();
		String composeFilePath = getDockerComposeFilePathForVendor(vendor);
		Path workingDir = Paths.get(composeFilePath).getParent();

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		// In the Docker server, relative bind mounts (Supabase's ./volumes/...) must resolve on the host, not
		// as /app/... paths the host daemon would create as empty folders. No-op everywhere else.
		ServicesManager.addHostProjectDirectory(command, workingDir);
		command.add("-f");
		command.add(DOCKER_COMPOSE_FILENAME);

		command.add("up");
		command.add("-d");
		command.add("--remove-orphans"); // Clean up any old containers

		// Supabase has its own compose file — start all services (official behavior).
		// Other vendors share one compose file — start only the named service.
		if (vendor != DatabaseVendor.SUPABASE) {
			command.add(serviceName);
		}

		ProcessExecutor executor = new ProcessExecutor().command(command).directory(workingDir.toFile())
				// .redirectOutput(Slf4jStream.of(getClass()).asInfo())
				// .redirectError(Slf4jStream.of(getClass()).asError())
				.readOutput(true)
				.timeout(vendor.getDefaultTimeout().toSeconds(), TimeUnit.SECONDS);

		// If a custom port is provided, set it as an environment variable for the
		// process
		if (hostPort != null) {
			Map<String, String> environment = new HashMap<>(System.getenv());
			String portEnvVar = vendor.name();
			portEnvVar += "_PORT";
			environment.put(portEnvVar, hostPort.toString());
			executor.environment(environment);
		}

		log.debug("Executing: {}", String.join(" ", command));

		log.info("[" + vendor + "] Executing docker-compose command: {}", String.join(" ", command));
		log.info("[" + vendor + "] Working directory: {}", workingDir);
		if (hostPort != null) {
			log.info("[" + vendor + "] Environment variable {}={}", vendor.name() + "_PORT", hostPort);
		}

		ProcessResult result = executor.execute();

		log.info("[" + vendor + "] Docker compose exit code: {}, output: {}",
				result.getExitValue(), result.outputUTF8());

		if (result.getExitValue() != 0) {
			throw new IOException("Docker Compose command failed with exit code " + result.getExitValue()
					+ " for service " + serviceName);
		}

		// ✅ ADD THIS: For SQL Server, create database before normal wait
		if (vendor == DatabaseVendor.SQLSERVER) {
			log.info("[" + vendor + "] SQL Server started, creating Northwind database...");
			ensureSqlServerDatabaseExists(vendor, hostPort);
		}

		waitForDatabaseToBeReady(vendor, hostPort);
	}

	/**
	 * Stops a specific database service using `docker-compose stop`.
	 */
	public void stopDatabase(DatabaseVendor vendor) throws Exception {
		if (vendor == DatabaseVendor.SQLITE || vendor == DatabaseVendor.DUCKDB) {
			sqliteDbFile = null; // Just clear the reference
		} else {
			String serviceName = vendor.getDockerComposeServiceName();
			String composeFilePath = getDockerComposeFilePathForVendor(vendor);
			Path workingDir = Paths.get(composeFilePath).getParent();

			List<String> command = new ArrayList<>();
			command.add("docker");
			command.add("compose");
			ServicesManager.addHostProjectDirectory(command, workingDir);
			command.add("-f");
			command.add(DOCKER_COMPOSE_FILENAME);

			command.add("stop");

			// Supabase has its own compose file — omit service name to stop all 13 services.
			// Other vendors share one compose file — specify service name to stop only that vendor.
			if (vendor != DatabaseVendor.SUPABASE) {
				command.add(serviceName);
			}

			new ProcessExecutor().command(command).directory(workingDir.toFile())
					.execute();
		}

		// --- Update State ---
		runningDatabases.put(vendor, false);
		activeDataPaths.remove(vendor);
		activeHostPorts.remove(vendor);
		log.info("Service {} stopped.", vendor);
	}

	/**
	 * Waits for a database to become available by checking its port and attempting
	 * a JDBC connection.
	 */
	private void waitForDatabaseToBeReady(DatabaseVendor vendor, Integer hostPort) throws Exception {
		final int hostPortToUse = (hostPort != null) ? hostPort : getDefaultHostPort(vendor);
		// In the Docker server the pack is a sibling container on the shared network, so it is reached by
		// name and its own port; everywhere else this is localhost and the published port (plan §4 F2n).
		final String[] reachable = ContainerAddresses.resolve("localhost", String.valueOf(hostPortToUse));
		final String host = reachable[0];
		final int port = Integer.parseInt(reachable[1]);

		log.info("[" + vendor + "] waitForDatabaseToBeReady: vendor={}, host={}, port={}", vendor, host, port);

		// Failsafe retry policy for the connection attempt
		RetryPolicy<Object> retryPolicy = new RetryPolicy<>().handle(Throwable.class) // Handle any exception
				.withDelay(Duration.ofSeconds(5)).withMaxDuration(vendor.getDefaultTimeout()).withMaxRetries(-1)
				.onRetry(e -> log.debug("Connection to {} on port {} failed, retrying...", vendor, port))
				.onFailure(e -> log.error("Failed to connect to {} after multiple retries.", vendor));

		Failsafe.with(retryPolicy).run(() -> {

			log.info("[" + vendor + "] Retry attempt starting for {}:{}", vendor, port);

			// First, check if the port is open to avoid immediate JDBC timeout
			if (!Utils.isPortOpen(host, port, 2000)) {
				throw new IOException("Port " + port + " is not open.");
			}

			log.info("[" + vendor + "] Port {} is open, attempting JDBC connection", port);

			// Print classpath for debugging
			// String classpath = System.getProperty("java.class.path");
			// log.info("Current Java classpath: {}", classpath);

			// Print JDBC URL for debugging
			String jdbcUrl = getJdbcUrl(vendor);
			log.info("Attempting JDBC connection with URL: {}", jdbcUrl);

			log.info("[" + vendor + "] DriverManager.getConnection(url={}, user={}, pass=***)",
					jdbcUrl, getUsername(vendor));

			DriverManager.setLoginTimeout(5);

			// Attempt a full JDBC connection
			try (Connection connection = DriverManager.getConnection(jdbcUrl, getUsername(vendor),
					getPassword(vendor))) {

				log.info("[" + vendor + "] Connection established, checking validity");

				if (!connection.isValid(5)) {
					log.info("[" + vendor + "] Connection is NOT valid");
					throw new IOException("JDBC connection is not valid.");
				}

				log.info("[" + vendor + "] Connection is valid, database is ready");

			}
		});

		log.info("[" + vendor + "] waitForDatabaseToBeReady completed successfully");
	}

	/**
	 * SQL Server-specific: Create Northwind database if it doesn't exist.
	 * Must connect to 'master' first since Northwind doesn't exist yet.
	 */
	private void ensureSqlServerDatabaseExists(DatabaseVendor vendor, Integer hostPort) throws Exception {
		final int hostPortToUse = (hostPort != null) ? hostPort : getDefaultHostPort(vendor);
		final String[] reachable = ContainerAddresses.resolve("localhost", String.valueOf(hostPortToUse));
		final String host = reachable[0];
		final int port = Integer.parseInt(reachable[1]);
		final String masterUrl = "jdbc:sqlserver://" + host + ":" + port
				+ ";databaseName=master;encrypt=false;trustServerCertificate=true";
		final String dbName = vendor.getDefaultDbName();

		log.info("[" + vendor + "] Waiting for SQL Server to accept connections on master DB...");

		// Wait for SQL Server to be ready (connect to master)
		RetryPolicy<Object> retryPolicy = new RetryPolicy<>()
				.handle(Throwable.class)
				.withDelay(Duration.ofSeconds(5))
				.withMaxDuration(Duration.ofMinutes(5))
				.withMaxRetries(-1)
				.onRetry(e -> {
					Throwable cause = e.getLastFailure();
					log.debug("[" + vendor + "] Waiting for SQL Server (attempt #{}): {}",
							e.getAttemptCount(),
							cause != null ? cause.getMessage() : "unknown");
				})
				.onFailure(e -> log.error("[" + vendor + "] Failed to connect to SQL Server master", e.getFailure()));

		Failsafe.with(retryPolicy).run(() -> {
			if (!Utils.isPortOpen(host, port, 2000)) {
				throw new IOException("Port " + port + " not open");
			}

			log.debug("[" + vendor + "] Port {} open, attempting connection to master", port);
			DriverManager.setLoginTimeout(5);

			try (Connection conn = DriverManager.getConnection(masterUrl, getUsername(vendor), getPassword(vendor))) {
				if (!conn.isValid(5)) {
					throw new IOException("Connection to master not valid");
				}

				log.info("[" + vendor + "] Connected to master DB, checking if {} exists", dbName);

				try (Statement stmt = conn.createStatement()) {
					// Check if database exists
					ResultSet rs = stmt.executeQuery(
							"SELECT database_id FROM sys.databases WHERE name = '" + dbName + "'");

					if (!rs.next()) {
						log.info("[" + vendor + "] Database {} does not exist, creating it...", dbName);
						stmt.execute("CREATE DATABASE [" + dbName + "]");

						// Wait a moment for creation to complete
						Thread.sleep(2000);

						log.info("[" + vendor + "] Database {} created successfully", dbName);
					} else {
						log.info("[" + vendor + "] Database {} already exists", dbName);
					}
				}
			}
		});

		log.info("[" + vendor + "] ensureSqlServerDatabaseExists() completed");
	}

	/**
	 * Returns a direct JDBC connection to the specified database. The caller is
	 * responsible for closing the connection.
	 */
	public Connection getConnection(DatabaseVendor vendor) throws Exception {
		return DriverManager.getConnection(getJdbcUrl(vendor), getUsername(vendor), getPassword(vendor));
	}

	/**
	 * Constructs the JDBC URL for a given database vendor.
	 * Uses Utils.getEffectiveHost() to handle Docker environment detection,
	 * automatically converting localhost to host.docker.internal when running in Docker.
	 */
	public String getJdbcUrl(DatabaseVendor vendor) {

		int hostPort = activeHostPorts.getOrDefault(vendor, getDefaultHostPort(vendor));
		String dbName = vendor.getDefaultDbName();
		String[] reachable = ContainerAddresses.resolve("localhost", String.valueOf(hostPort));
		String host = reachable[0];
		int port = Integer.parseInt(reachable[1]);

		switch (vendor) {
			case POSTGRES:
				return "jdbc:postgresql://" + host + ":" + port + "/" + dbName;
			case MYSQL:
				return "jdbc:mysql://" + host + ":" + port + "/" + dbName + "?useSSL=false&allowPublicKeyRetrieval=true";
			case MARIADB:
				return "jdbc:mariadb://" + host + ":" + port + "/" + dbName + "?useSSL=false&allowPublicKeyRetrieval=true";
			case SQLITE:
				return "jdbc:sqlite:" + getActualDataPath(vendor).resolve("northwind.db").toString();
			case DUCKDB:
				return "jdbc:duckdb:" + getActualDataPath(vendor).resolve("northwind.duckdb").toString();
			case SQLSERVER:
				String url = "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + dbName + ";encrypt=false";
				log.info("[" + vendor + "] Constructed SQL Server URL: {}", url);
				return url;
			case ORACLE:
				return "jdbc:oracle:thin:@//" + host + ":" + port + "/" + dbName;
			case DB2:
				return "jdbc:db2://" + host + ":" + port + "/" + dbName;
			case CLICKHOUSE:
				return "jdbc:clickhouse://" + host + ":" + port + "/" + dbName
						+ ServerDatabaseSettings.CLICKHOUSE_CONNECT_OPTIONS;
			case SUPABASE:
				return "jdbc:postgresql://" + host + ":" + port + "/" + dbName + "?currentSchema=public";
			default:
				throw new IllegalArgumentException("Unsupported database vendor: " + vendor);
		}
	}

	// --- Helper, State, and Initialization Methods (Largely Unchanged) ---

	private void setupSQLite(Path hostDataPath) throws IOException {
		this.sqliteDbFile = hostDataPath.resolve("northwind.db").toFile();
		Files.createDirectories(this.sqliteDbFile.getParentFile().toPath());
	}

	private void setupDuckDB(Path hostDataPath) throws IOException {
		this.sqliteDbFile = hostDataPath.resolve("northwind.duckdb").toFile();
		Files.createDirectories(this.sqliteDbFile.getParentFile().toPath());
	}

	public void initializeDatabaseWithGenerator(DatabaseVendor vendor, Path hostDataPath) throws Exception {

        // DuckDB uses a specialized data warehouse creator (dimensional model, not OLTP)
        // REASON: DuckDB is for analytics/OLAP, so we create a Star Schema warehouse
        //         instead of using JPA to create OLTP tables like other vendors
        if (vendor == DatabaseVendor.DUCKDB) {
            log.info("Initializing DuckDB data warehouse (Star Schema)...");
            String duckdbPath = hostDataPath.resolve("northwind.duckdb").toAbsolutePath().toString();
            
            // SQLite path - SQLite and DuckDB are sibling folders under the same parent (db/)
            // Use hostDataPath.getParent() to get the common db/ folder, then resolve SQLite sibling
            // This works for both:
            //   - Build time: target/package/db-noexe/DataPallas/db/ (no PORTABLE_EXECUTABLE_DIR)
            //   - Runtime: {PORTABLE_EXECUTABLE_DIR}/db/ (when running as packaged app)
            Path sqliteDbPath = hostDataPath.getParent().resolve("sample-northwind-sqlite").resolve("northwind.db");
            String sqlitePath = sqliteDbPath.toAbsolutePath().toString();
            log.info("DuckDB target: {}, SQLite source: {}", duckdbPath, sqlitePath);

            // Call static method to create data warehouse using pure SQL
            // This bypasses JPA entirely - DuckDB warehouse is created via:
            // 1. ATTACH SQLite OLTP database
            // 2. Copy OLTP tables (for e2e test compatibility)
            // 3. Transform into Star Schema (fact_sales + 5 dimensions)
            // 4. Create analytical views (vw_sales_detail for instant pivots)
            DuckDBDataWarehouseCreator.createDataWarehouse(duckdbPath, sqlitePath);

            log.info("DuckDB data warehouse created successfully");
            return; // Skip JPA initialization below - already created via SQL
        }

        // ClickHouse uses a specialized data warehouse creator (columnar OLAP, not OLTP)
        // REASON: ClickHouse is for analytics/OLAP with columnar storage (MergeTree engine),
        //         JPA/Hibernate doesn't support ClickHouse DDL properly
        // CRITICAL: Data is imported from SQLite (same source as DuckDB) to ensure
        //           IDENTICAL data in both OLAP databases for pivot table consistency
        if (vendor == DatabaseVendor.CLICKHOUSE) {
            log.info("Initializing ClickHouse data warehouse (Star Schema)...");
            
            // Get JDBC URL with proper host/port
            int clickHouseHostPort = activeHostPorts.getOrDefault(vendor, getDefaultHostPort(vendor));
            String[] reachable = ContainerAddresses.resolve("localhost", String.valueOf(clickHouseHostPort));
            String jdbcUrl = "jdbc:clickhouse://" + reachable[0] + ":" + reachable[1] + "/"
                    + vendor.getDefaultDbName() + ServerDatabaseSettings.CLICKHOUSE_CONNECT_OPTIONS;
            
            // SQLite path - SQLite and ClickHouse marker folders are siblings under the same parent (db/)
            // Use hostDataPath.getParent() for consistency with DuckDB approach
            // At runtime, PORTABLE_EXECUTABLE_DIR is set, so this resolves to:
            //   {PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite/northwind.db
            Path sqliteDbPath = hostDataPath.getParent().resolve("sample-northwind-sqlite").resolve("northwind.db");
            String sqlitePath = sqliteDbPath.toAbsolutePath().toString();
            log.info("SQLite source path (for ETL): {}", sqlitePath);
            
            // Call ClickHouse creator with connection details and SQLite path
            ClickHouseDataWarehouseCreator.createDataWarehouse(jdbcUrl, getUsername(vendor), getPassword(vendor), sqlitePath);
            
            log.info("ClickHouse data warehouse created successfully");
            
            // Create marker file to prevent re-initialization
            Path markerFilePath = hostDataPath.resolve(MARKER_FILENAME);
            Files.createDirectories(hostDataPath);
            if (!Files.exists(markerFilePath)) {
                Files.createFile(markerFilePath);
            }
            log.info("ClickHouse marker file ensured: {}", markerFilePath);
            
            return; // Skip JPA initialization below - already created via SQL
        }

        log.info("[" + vendor + "] Starting JPA initialization for {}", vendor);
        log.info("[" + vendor + "] Persistence unit: northwind-{}", vendor.name().toLowerCase());

        EntityManagerFactory emf = null;
        EntityManager em = null;
        String persistenceUnitName = "northwind-" + vendor.name().toLowerCase();

        try {
            Map<String, String> props = getJpaProperties(vendor, true);

            // For DB2, set default schema explicitly (optional but safer)
            if (vendor == DatabaseVendor.DB2) {
                props.putIfAbsent("hibernate.default_schema", "DB2INST1");
            }

            // For Supabase, constrain Hibernate to public schema only.
            // supabase_admin sees auth/storage/vault schemas — without this,
            // Hibernate may interfere with Supabase internal objects.
            if (vendor == DatabaseVendor.SUPABASE) {
                props.putIfAbsent("hibernate.default_schema", "public");
            }

            log.info("[" + vendor + "] JPA properties: url={}, user={}",
                    props.get("jakarta.persistence.jdbc.url"),
                    props.get("jakarta.persistence.jdbc.user"));

            log.info("[" + vendor + "] Creating EntityManagerFactory");

            // Retry EMF creation to ride over transient DB2 readiness (-4499) issues
            RetryPolicy<EntityManagerFactory> emfRetry = new RetryPolicy<EntityManagerFactory>()
                    .handle(Throwable.class)
                    .withDelay(Duration.ofSeconds(5))
                    .withMaxRetries(5)
                    .onFailedAttempt(ev -> {
                        Throwable t = ev.getLastFailure();
                        log.warn("EMF creation failed (attempt {} of {}): {}",
                                ev.getAttemptCount(), 5, t != null ? t.getMessage() : "unknown");
                    });

            emf = Failsafe.with(emfRetry).get(() ->
                    Persistence.createEntityManagerFactory(persistenceUnitName, props)
            );

            log.info("[" + vendor + "] Creating EntityManager");
            em = emf.createEntityManager();

            log.info("[" + vendor + "] Running NorthwindDataGenerator");

            NorthwindDataGenerator generator = new NorthwindDataGenerator(em);
            generator.generateAll();

            log.info("[" + vendor + "] Data generation complete, creating marker file");

            if (vendor != DatabaseVendor.SQLITE) {
                Path markerFilePath = hostDataPath.resolve(MARKER_FILENAME);
                Files.createDirectories(hostDataPath);
                if (!Files.exists(markerFilePath)) {
                    Files.createFile(markerFilePath);
                }
                log.info("[" + vendor + "] Marker file ensured: {}", markerFilePath);
            }
        } finally {
            if (em != null && em.isOpen()) {
                em.close();
            }
            if (emf != null && emf.isOpen()) {
                emf.close();
            }
        }
    }
	
	private boolean northwindExistsInDatabase(DatabaseVendor vendor) {
		try (Connection conn = DriverManager.getConnection(
				getJdbcUrl(vendor), getUsername(vendor), getPassword(vendor))) {
			try (ResultSet rs = conn.getMetaData().getTables(
					null, null, "Customers", new String[]{"TABLE"})) {
				return rs.next();
			}
		} catch (Exception e) {
			log.debug("[{}] northwindExistsInDatabase check failed: {}", vendor, e.getMessage());
			return false;
		}
	}

	public Map<String, String> getJpaProperties(DatabaseVendor vendor, boolean forDdl) {
		Map<String, String> properties = new HashMap<>();
		properties.put("jakarta.persistence.jdbc.url", getJdbcUrl(vendor));
		properties.put("jakarta.persistence.jdbc.user", getUsername(vendor));
		properties.put("jakarta.persistence.jdbc.password", getPassword(vendor));

		if (forDdl) {
			// All server vendors use drop-and-create for idempotent re-seeding:
			// Hibernate drops and recreates only the tables mapped to @Entity
			// classes, scoped via hibernate.default_schema (see setupDatabase
			// where Supabase gets default_schema=public). Auth/storage/vault
			// schemas on Supabase are outside that scope and never touched.
			// Without drop-and-create the Docker volume holds whatever was
			// first seeded, forever — so a generator code change never reaches
			// the test database.
			properties.put("jakarta.persistence.schema-generation.database.action", "drop-and-create");
			properties.put("hibernate.hbm2ddl.auto", "create");
		}

		return properties;
	}

	public String getUsername(DatabaseVendor vendor) {
		return vendor.getDefaultUser();
	}

	public String getPassword(DatabaseVendor vendor) {
		return vendor.getDefaultPassword();
	}

	public boolean isRunning(DatabaseVendor vendor) {
		return runningDatabases.getOrDefault(vendor, false);
	}

	public Path getActualDataPath(DatabaseVendor vendor) {
		return activeDataPaths.get(vendor);
	}

	public Integer getActualHostPort(DatabaseVendor vendor) {
		return activeHostPorts.get(vendor);
	}

	private Path getDefaultHostDataPath(DatabaseVendor vendor) {
		String subDirName = "sample-northwind-" + vendor.name().toLowerCase().replace("_", "-");
		return Paths.get(this.baseDataPath, subDirName).toAbsolutePath();
	}

	private Integer getDefaultHostPort(DatabaseVendor vendor) {
		return vendor.getContainerPort();
	}

	@Override
	public void close() throws Exception {
		for (DatabaseVendor vendor : DatabaseVendor.values()) {
			if (isRunning(vendor)) {
				stopDatabase(vendor);
			}
		}
	}

	public String getDatabaseVersion(DatabaseVendor vendor) throws Exception {
		try (Connection conn = DriverManager.getConnection(getJdbcUrl(vendor), getUsername(vendor),
				getPassword(vendor))) {
			return conn.getMetaData().getDatabaseProductVersion();
		}
	}

	public boolean testDatabaseConnection(DatabaseVendor vendor) throws Exception {

		try (Connection conn = DriverManager.getConnection(getJdbcUrl(vendor), getUsername(vendor),
				getPassword(vendor))) {
			return conn.isValid(2); // Timeout in seconds
		}
	}

	public List<String> getTableNames(DatabaseVendor vendor) throws Exception {
		List<String> tableNames = new ArrayList<>();

		try (Connection conn = DriverManager.getConnection(getJdbcUrl(vendor), getUsername(vendor),
				getPassword(vendor))) {
			try (ResultSet rs = conn.getMetaData().getTables(null, null, "%", new String[] { "TABLE" })) {
				while (rs.next()) {
					tableNames.add(rs.getString("TABLE_NAME"));
				}
			}
		}
		return tableNames;
	}

	public int getTableCount(DatabaseVendor vendor, String tableName) throws Exception {

		try (Connection conn = DriverManager.getConnection(getJdbcUrl(vendor), getUsername(vendor),
				getPassword(vendor))) {
			try (Statement stmt = conn.createStatement();
					ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM \"" + tableName + "\"")) {
				if (rs.next()) {
					return rs.getInt(1);
				}
			}
		}
		return 0;
	}
}

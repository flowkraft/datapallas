package com.sourcekraft.documentburster.common.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.sql.DataSource;

import org.apache.commons.lang3.StringUtils; // Keep StringUtils
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.statement.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings; // Import needed
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/**
 * Manages database connections using HikariCP connection pooling. Prioritizes
 * using pre-loaded primary connection details from Settings, falling back to
 * file loading for other connection codes. DataSources and Jdbi instances are
 * cached.
 */
public class DatabaseConnectionManager implements AutoCloseable {

	private static final Logger log = LoggerFactory.getLogger(DatabaseConnectionManager.class);

	private final Settings settings;

	// Cache for DataSource pools (Connection Code -> DataSource)
	private final Map<String, HikariDataSource> dataSourcePools = new ConcurrentHashMap<>();
	// Cache for Jdbi instances (Connection Code -> Jdbi)
	private final Map<String, Jdbi> jdbiInstances = new ConcurrentHashMap<>();
	// Cache for loaded connection details (Connection Code -> Settings)
	private final Map<String, ConnectionDatabaseSettings> loadedConnectionDetails = new ConcurrentHashMap<>();

	public DatabaseConnectionManager(Settings settings) {
		this.settings = settings;
		log.debug("DatabaseConnectionManager initialized.");
	}

	public Settings getSettings() {
		return settings;
	}

	// Add driver class mapping
	private String getDriverClass(String dbType) {
		switch (dbType.toLowerCase()) {
			case "sqlite":
				return "org.sqlite.JDBC";
			case "duckdb":
				return "org.duckdb.DuckDBDriver";
			case "clickhouse":
				return "com.clickhouse.jdbc.ClickHouseDriver";
			case "oracle":
				return "oracle.jdbc.driver.OracleDriver";
			case "sqlserver":
				return "com.microsoft.sqlserver.jdbc.SQLServerDriver";
			case "postgres":
			case "postgresql":
			case "timescaledb":
				return "org.postgresql.Driver";
			case "mysql":
				return "com.mysql.cj.jdbc.Driver";
			case "mariadb":
				return "org.mariadb.jdbc.Driver";
			case "ibmdb2":
				return "com.ibm.db2.jcc.DB2Driver";
			default:
				log.warn("No JDBC driver class configured for database type: {}", dbType);
				return null;
		}
	}

	public Connection getJdbcConnection(String connectionCode) throws Exception {

		String cCode = StringUtils.EMPTY;

		if (!StringUtils.isBlank(connectionCode))
			cCode = connectionCode;
		else
			cCode = this.settings.getReportingPrimaryDatabaseConnectionCode();

		ConnectionDatabaseSettings settings = getConnectionSettings(cCode);

		settings.databaseserver.ensureDriverAndUrl();

		String driverClass = getDriverClass(settings.databaseserver.type);
		Class.forName(driverClass);

		// Decrypt password at the exact moment of use — never store plaintext
		String decryptedPassword = settings.databaseserver.userpassword;
		try {
			decryptedPassword = SecretsCipher.getInstance(Settings.PORTABLE_EXECUTABLE_DIR_PATH)
					.decrypt(settings.databaseserver.userpassword);
		} catch (Exception e) {
			log.warn("Failed to decrypt database password for JDBC connection: {}", e.getMessage());
		}
		// DuckDB: open read-only so we don't take an exclusive file lock that blocks other
		// processes (e.g. the AI Hub's chat2db) already holding the same .duckdb file open.
		// Read-only is safe here (query/schema reads) and DuckDB shares read-only openers.
		if ("duckdb".equalsIgnoreCase(settings.databaseserver.type)) {
			java.util.Properties props = new java.util.Properties();
			if (StringUtils.isNotBlank(settings.databaseserver.userid))
				props.setProperty("user", settings.databaseserver.userid);
			if (StringUtils.isNotBlank(decryptedPassword))
				props.setProperty("password", decryptedPassword);
			props.setProperty("duckdb.read_only", "true");
			return DriverManager.getConnection(settings.databaseserver.url, props);
		}
		return DriverManager.getConnection(settings.databaseserver.url, settings.databaseserver.userid,
				decryptedPassword);
	}

	/**
	 * Retrieves the connection settings for the given code. Prioritizes pre-loaded
	 * primary connection settings from ctx.settings. Falls back to loading from
	 * file for secondary connections or if primary was not pre-loaded. T
	 * 
	 * @param connectionCode The unique code identifying the database connection.
	 * @return The ConnectionDatabaseSettings object.
	 * @throws Exception If settings cannot be retrieved.
	 */
	private synchronized ConnectionDatabaseSettings getConnectionSettings(String connectionCode) throws Exception {
		String primaryCode = this.settings.getReportingPrimaryDatabaseConnectionCode();

		if (StringUtils.isNotBlank(primaryCode) && primaryCode.equals(connectionCode)
				&& this.settings.connectionDatabaseSettings != null) {
			ConnectionDatabaseSettings c = this.settings.connectionDatabaseSettings.connection;
			if (c != null && c.databaseserver != null)
				c.databaseserver.ensureDriverAndUrl();
			return c;
		} else {
			DocumentBursterConnectionDatabaseSettings dbSettings = this.settings
					.loadSettingsConnectionDatabase(connectionCode);
			if (dbSettings != null && dbSettings.connection != null && dbSettings.connection.databaseserver != null) {
				dbSettings.connection.databaseserver.ensureDriverAndUrl();
			}
			return dbSettings.connection;
		}
	}

	/**
	 * Gets a pooled DataSource for the given connection code. If not already
	 * cached, retrieves connection settings (prioritizing pre-loaded primary),
	 * creates and configures the pool, caches it, and returns it.
	 *
	 * @param connectionCode The unique code identifying the database connection.
	 * @return The pooled HikariDataSource instance.
	 * @throws Exception If loading connection details fails or pool creation fails.
	 */
	public synchronized DataSource getDataSource(String connectionCode) throws Exception {
		log.trace("Entering getDataSource for code: {}", connectionCode);
		if (StringUtils.isBlank(connectionCode)) {
			log.error("getDataSource called with blank connection code.");
			throw new IllegalArgumentException("Connection code cannot be blank.");
		}
		// Check cache first
		if (dataSourcePools.containsKey(connectionCode)) {
			log.debug("Cache hit for DataSource: {}", connectionCode);
			log.trace("Exiting getDataSource (cached) for code: {}", connectionCode);
			return dataSourcePools.get(connectionCode);
		}

		log.debug("Cache miss for DataSource: {}. Creating new pool.", connectionCode);
		// Get settings using the new logic
		ConnectionDatabaseSettings connSettings = getConnectionSettings(connectionCode);
		if (connSettings == null || connSettings.databaseserver == null) {
			log.error("Retrieved ConnectionDatabaseSettings or its databaseserver field is null for code: {}",
					connectionCode);
			throw new Exception("Failed to retrieve valid database server settings for code: " + connectionCode);
		}

		connSettings.databaseserver.ensureDriverAndUrl();

		// System.out.println("connSettings: " + connSettings.toString());

		// Create DataSource using HikariCP
		log.trace("Creating HikariConfig for code: {}", connectionCode);
		HikariConfig config = new HikariConfig();

		// In DatabaseConnectionManager.java
		if (StringUtils.isBlank(connSettings.databaseserver.driver)) {
			// Try to determine driver from database type
			connSettings.databaseserver.driver = getDriverClass(connSettings.databaseserver.type);
			if (StringUtils.isBlank(connSettings.databaseserver.driver)) {
				throw new Exception("Database driver not specified and could not be determined for type: "
						+ connSettings.databaseserver.type);
			}
		}

		// System.out.println("connSettings.databaseserver.driver: " +
		// connSettings.databaseserver.driver);

		config.setDriverClassName(connSettings.databaseserver.driver);
		config.setJdbcUrl(connSettings.databaseserver.url);
		config.setUsername(connSettings.databaseserver.userid);

		// Decrypt password at the exact moment of use — never store plaintext
		String decryptedPoolPassword = connSettings.databaseserver.userpassword;
		try {
			decryptedPoolPassword = SecretsCipher.getInstance(Settings.PORTABLE_EXECUTABLE_DIR_PATH)
					.decrypt(connSettings.databaseserver.userpassword);
		} catch (Exception e) {
			log.warn("Failed to decrypt database password for connection pool: {}", e.getMessage());
		}
		config.setPassword(decryptedPoolPassword);
		log.trace("HikariConfig: Driver={}, URL={}, User={}, Password provided={}", connSettings.databaseserver.driver,
				connSettings.databaseserver.url, connSettings.databaseserver.userid,
				StringUtils.isNotEmpty(connSettings.databaseserver.userpassword));

		// Add common pool properties (can be customized further)
		config.setMaximumPoolSize(10);
		config.setMinimumIdle(0); // connections opened on demand, not at pool creation
		config.setPoolName("HikariPool-" + connectionCode);

		// Prepared statement cache — MySQL/MariaDB only; other drivers reject these properties
		String dbType = connSettings.databaseserver.type != null ? connSettings.databaseserver.type.toLowerCase() : "";
		if ("mysql".equals(dbType) || "mariadb".equals(dbType)) {
			config.addDataSourceProperty("cachePrepStmts", "true");
			config.addDataSourceProperty("prepStmtCacheSize", "250");
			config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
		}
		// DuckDB: open the pool read-only so it doesn't take an exclusive file lock that
		// blocks other processes (chat2db) already holding the same .duckdb file open.
		// HikariCP forwards dataSource properties to DriverManager.getConnection(url, props).
		if ("duckdb".equals(dbType)) {
			config.addDataSourceProperty("duckdb.read_only", "true");
			// The connection opens read-only (property above). Mark the Hikari pool
			// read-only too, otherwise Hikari's connection setup calls setReadOnly(false)
			// to normalize state and DuckDB rejects it ("Can't change read-only status on
			// connection level" — DuckDB fixes read-only at open time). Matching the value
			// makes Hikari's call a no-op instead of a failed state change.
			config.setReadOnly(true);
			// DuckDB requires EVERY connection to a given file (in-process AND across
			// processes) to share IDENTICAL config. The schema fetcher and chat2db open with
			// ONLY duckdb.read_only and no credentials; if Hikari also sends username/password
			// (even ""), DuckDB rejects the shared file with "Can't open a connection to same
			// database file with a different configuration than existing connections". Null
			// the credentials so DriverDataSource omits them and the config matches exactly.
			config.setUsername(null);
			config.setPassword(null);
		}
		log.trace("Hikari pool properties set for code: {}", connectionCode);

		HikariDataSource dataSource = null;
		try {
			log.trace("Creating HikariDataSource instance for code: {}", connectionCode);
			dataSource = new HikariDataSource(config);
			log.debug("HikariDataSource instance created successfully for code: {}", connectionCode);
		} catch (Exception e) {
			log.error("Failed to create HikariDataSource for code '{}': {}", connectionCode, e.getMessage(), e);
			throw new Exception("Failed to create database connection pool for code: " + connectionCode, e);
		}

		// Cache it
		dataSourcePools.put(connectionCode, dataSource);
		// log.info("Created and cached new DataSource pool for code: {}",
		// connectionCode);
		log.trace("Exiting getDataSource (created) for code: {}", connectionCode);
		return dataSource;
	}

	// In DatabaseConnectionManager
	public Query createQuery(String connectionCode, String sql) throws Exception {
		Jdbi jdbi = getJdbi(connectionCode);
		return jdbi.open().createQuery(sql);
	}

	/**
	 * Gets a Jdbi instance configured for the given connection code. Uses the
	 * pooled DataSource obtained via getDataSource.
	 *
	 * @param connectionCode The unique code identifying the database connection.
	 * @return The configured Jdbi instance.
	 * @throws Exception If obtaining the DataSource fails.
	 */
	public synchronized Jdbi getJdbi(String connectionCode) throws Exception {
		log.trace("Entering getJdbi for code: {}", connectionCode);
		if (StringUtils.isBlank(connectionCode)) {
			log.error("getJdbi called with blank connection code.");
			throw new IllegalArgumentException("Connection code cannot be blank.");
		}
		// Check cache first
		if (jdbiInstances.containsKey(connectionCode)) {
			log.debug("Cache hit for Jdbi instance: {}", connectionCode);
			log.trace("Exiting getJdbi (cached) for code: {}", connectionCode);
			return jdbiInstances.get(connectionCode);
		}

		log.debug("Cache miss for Jdbi instance: {}. Creating new instance.", connectionCode);
		// Get the DataSource (which handles creation/caching)
		DataSource dataSource = getDataSource(connectionCode);
		if (dataSource == null) {
			log.error("getDataSource returned null for code: {}. Cannot create Jdbi instance.", connectionCode);
			throw new Exception("Failed to obtain DataSource for code: " + connectionCode);
		}

		// Create Jdbi instance
		log.trace("Creating Jdbi instance using DataSource for code: {}", connectionCode);
		Jdbi jdbi = Jdbi.create(dataSource);
		log.debug("Jdbi instance created successfully for code: {}", connectionCode);

		// Cache it
		jdbiInstances.put(connectionCode, jdbi);
		// log.info("Created and cached new Jdbi instance for code: {}",
		// connectionCode);
		log.trace("Exiting getJdbi (created) for code: {}", connectionCode);
		return jdbi;
	}

	/**
	 * Closes all managed connection pools. Should be called during application
	 * shutdown.
	 */
	public synchronized void shutdownConnections() {
		log.info("Shutting down all managed database connection pools...");
		dataSourcePools.forEach((code, ds) -> {
			try {
				if (ds != null && !ds.isClosed()) {
					log.debug("Closing DataSource pool for code: {}", code);
					ds.close();
				} else {
					log.trace("DataSource pool for code '{}' was already null or closed.", code);
				}
			} catch (Exception e) {
				log.error("Error closing DataSource pool for code '{}': {}", code, e.getMessage(), e);
			}
		});
		dataSourcePools.clear();
		jdbiInstances.clear(); // Clear Jdbi cache as well
		loadedConnectionDetails.clear(); // Clear connection settings cache
		log.info("All connection pools shut down and caches cleared.");
	}

	@Override
	public void close() {
		shutdownConnections();
	}

	// --- Offer lightweight access to server settings for ScriptedReporter ---
	/**
	 * Returns the ServerDatabaseSettings (driver, url, username, password) for the
	 * given connection code.
	 */
	public ServerDatabaseSettings getServerDatabaseSettings(String connectionCode) throws Exception {
		ConnectionDatabaseSettings settings = getConnectionSettings(connectionCode);
		if (settings == null || settings.databaseserver == null) {
			throw new IllegalStateException("No database-server settings found for code: " + connectionCode);
		}
		return settings.databaseserver;
	}

}
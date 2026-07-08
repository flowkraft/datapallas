package com.sourcekraft.documentburster.common;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Collections;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.ProcessResult;
import org.zeroturnaround.exec.stream.slf4j.Slf4jStream;
import org.apache.commons.lang3.StringUtils;

import com.sourcekraft.documentburster.utils.Utils;

import com.sourcekraft.documentburster.common.db.northwind.NorthwindManager;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindManager.DatabaseVendor;

/**
 * Command-line interface for managing different families of "services".
 * Currently supports the 'database' family using NorthwindManager.
 */
public class ServicesManager {

	private static final Logger log = LoggerFactory.getLogger(ServicesManager.class);

	// Keep direct manager for now, assuming 'database' family uses NorthwindManager
	private static final NorthwindManager dbManager;
	static {
		try {
			dbManager = new NorthwindManager();
		} catch (Exception e) {
			throw new RuntimeException("Failed to initialize NorthwindManager", e);
		}
	}

	// Define the family name this CLI currently handles primarily
	private static final String DB_FAMILY = "database";
	private static final String APP_FAMILY = "app";
	private static final String NORTHWIND_PACK = "northwind"; // Specific pack name within the database family
	private static final String CACHE_PACK = "cache"; // Cache services (Redis) — no Northwind provisioning
	private static final String TIMESERIES_PACK = "timeseries"; // Time-series DBs (TimescaleDB) — no Northwind provisioning

	// Command constants
	private static final String CMD_START = "start";
	private static final String CMD_STOP = "stop";
	private static final String CMD_RESTART = "restart";
	private static final String CMD_LIST = "list";
	private static final String CMD_INFO = "info";
	private static final String CMD_QUERY = "query"; // Keep Northwind query capability

	// Programmatic API: Result and execute() entrypoint
	public static class Result {
		public final String status;
		public final String output;

		public Result(String status, String output) {
			this.status = status;
			this.output = output;
		}
	}

	/**
	 * Unified command executor used by both main() and external callers. Supports
	 * global commands (help, exit) and database family commands (start, stop, list,
	 * info, query, help).
	 */
	public static Result execute(String commandLine) throws Exception {
        String[] tokens = commandLine.trim().split("\\s+");

        // Family: database
        if (tokens[0].equalsIgnoreCase(DB_FAMILY)) {
			String subCmd = tokens[1].toLowerCase();

			String packName = tokens[2].toLowerCase();
			String managerArgsString = tokens.length > 3
					? String.join(" ", java.util.Arrays.copyOfRange(tokens, 3, tokens.length))
					: "";

			if (packName.equals(NORTHWIND_PACK)) {
				switch (subCmd) {
					case CMD_START: {
						String out = captureOutput(() -> handleNorthwindStart(managerArgsString));
						String status = (out.contains("✓ Northwind") || out.contains("database is running")) ? "running"
								: (out.contains("✗") ? "error" : "running");
						return new Result(status, out);
					}
					case CMD_STOP: {
						String out = captureOutput(() -> handleNorthwindStop(managerArgsString));
						return new Result("stopped", out);
					}
					case CMD_LIST: {
						String out = captureOutput(() -> handleNorthwindList());
						return new Result("ok", out);
					}
					case CMD_INFO: {
						String out = captureOutput(() -> handleNorthwindInfo(managerArgsString));
						String status = out.contains("Status:    RUNNING") ? "running"
								: (out.contains("is not running") ? "stopped" : "ok");
						return new Result(status, out);
					}
					case CMD_QUERY: {
						String out = captureOutput(() -> handleNorthwindQuery(managerArgsString));
						String status = out.toLowerCase().contains("error") ? "error" : "ok";
						return new Result(status, out);
					}
					default:
						return new Result("error", "Unknown database command: " + subCmd);
				}
			} else if (packName.equals(CACHE_PACK)) {
				// Cache services (e.g. Redis): just docker compose, skip Northwind provisioning
				switch (subCmd) {
					case CMD_START: {
						String out = captureOutput(() -> handleCacheStart(managerArgsString));
						String status = out.contains("✓") ? "running" : (out.contains("✗") ? "error" : "running");
						return new Result(status, out);
					}
					case CMD_STOP: {
						String out = captureOutput(() -> handleCacheStop(managerArgsString));
						return new Result("stopped", out);
					}
					default:
						return new Result("error", "Unknown cache command: " + subCmd);
				}
			} else if (packName.equals(TIMESERIES_PACK)) {
				// Time-series DBs (e.g. TimescaleDB): just docker compose, skip Northwind provisioning
				switch (subCmd) {
					case CMD_START: {
						String out = captureOutput(() -> handleTimeseriesStart(managerArgsString));
						String status = out.contains("✓") ? "running" : (out.contains("✗") ? "error" : "running");
						return new Result(status, out);
					}
					case CMD_STOP: {
						String out = captureOutput(() -> handleTimeseriesStop(managerArgsString));
						return new Result("stopped", out);
					}
					default:
						return new Result("error", "Unknown timeseries command: " + subCmd);
				}
			} else {
				return new Result("error", "Unknown pack name '" + packName + "' in family '" + DB_FAMILY + "'.");
			}
		}

		// Family: app
		else if (tokens[0].equalsIgnoreCase(APP_FAMILY)) {
			String subCmd = tokens[1].toLowerCase();

			String serviceName = tokens[2];
			String args = tokens.length > 3
					? String.join(" ", java.util.Arrays.copyOfRange(tokens, 3, tokens.length))
					: "";

			switch (subCmd) {
				case CMD_START: {
					String out = captureOutput(() -> handleAppStart(serviceName, args));
					String status = out.contains("✓") ? "running" : (out.contains("✗") ? "error" : "running");
					return new Result(status, out);
				}
				case CMD_STOP: {
					String out = captureOutput(() -> handleAppStop(serviceName, args));
					return new Result("stopped", out);
				}
				case CMD_RESTART: {
					String out = captureOutput(() -> handleAppRestart(serviceName, args));
					String status = out.contains("✓") ? "running" : (out.contains("✗") ? "error" : "running");
					return new Result(status, out);
				}
				default:
					return new Result("error", "Unknown app command: " + subCmd);
			}
		}

		return new Result("error", "Unknown family or command: " + tokens[0]);
	}

	// Capture System.out for programmatic use without changing existing handlers
	@FunctionalInterface
	private interface ThrowableRunnable {
		void run() throws Exception;
	}

	private static String captureOutput(ThrowableRunnable action) throws Exception {
		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		PrintStream original = System.out;
		PrintStream ps = new PrintStream(baos);
		try {
			System.setOut(ps);
			action.run();
		} finally {
			System.setOut(original);
			ps.close();
		}
		return baos.toString();
	}

	/**
	 * Handle the 'database start northwind' command. Parses managerArgsString for
	 * vendor, path, port.
	 */
	private static void handleNorthwindStart(String managerArgsString) throws Exception {

		// Parse vendor, path, port from args
		String[] parts = managerArgsString.split("\\s+");
		String vendorName = parts[0].toUpperCase();
		String customPath = null;
		Integer customPort = null;

		// Determine path and port based on number of arguments (same logic as before)
		if (parts.length > 1) {
			// If second argument is numeric, treat as port; otherwise as path
			boolean isNumeric = parts[1].matches("\\d+");
			if (isNumeric) {
				customPort = Integer.parseInt(parts[1]);
			} else {
				customPath = parts[1];
				if (parts.length > 2) {
					customPort = Integer.parseInt(parts[2]);
				}
			}
		}

		DatabaseVendor vendor = DatabaseVendor.valueOf(vendorName);
		dbManager.startDatabase(vendor, customPath, customPort);
	}

	/**
	 * Handle 'database stop northwind <vendor>'
	 * 
	 * @throws Exception
	 */
	private static void handleNorthwindStop(String managerArgsString) throws Exception {

		String vendorName = managerArgsString.split("\\s+")[0].toUpperCase();
		DatabaseVendor vendor = DatabaseVendor.valueOf(vendorName);
		dbManager.stopDatabase(vendor); // Call manager
	}

	/**
	 * Handle 'database start cache <service> [port]'.
	 * Runs docker compose in the db/ folder — no data provisioning needed.
	 */
	private static void handleCacheStart(String managerArgsString) throws Exception {
		String[] parts = managerArgsString.split("\\s+");
		String serviceName = parts[0].toLowerCase();
		Integer customPort = parts.length > 1 ? Integer.parseInt(parts[1]) : null;

		String dbFolderPath = Utils.getDbFolderPath();
		Path workingDir = Paths.get(dbFolderPath);

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add("docker-compose.yml");
		command.add("up");
		command.add("-d");
		command.add("--remove-orphans");
		command.add(serviceName);

		ProcessExecutor executor = new ProcessExecutor()
				.command(command)
				.directory(workingDir.toFile())
				.readOutput(true)
				.timeout(300, TimeUnit.SECONDS);

		if (customPort != null) {
			Map<String, String> env = new HashMap<>(System.getenv());
			env.put("REDIS_PORT", customPort.toString());
			executor.environment(env);
		}

		log.info("[CACHE] Executing: {} in {}", String.join(" ", command), workingDir);
		ProcessResult result = executor.execute();

		if (result.getExitValue() == 0) {
			System.out.println("✓ Cache service '" + serviceName + "' started successfully.");
		} else {
			System.out.println("✗ Failed to start cache service '" + serviceName + "'. Exit code: " + result.getExitValue());
		}
	}

	/**
	 * Handle 'database stop cache <service>'.
	 */
	private static void handleCacheStop(String managerArgsString) throws Exception {
		String serviceName = managerArgsString.split("\\s+")[0].toLowerCase();

		String dbFolderPath = Utils.getDbFolderPath();
		Path workingDir = Paths.get(dbFolderPath);

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add("docker-compose.yml");
		command.add("stop");
		command.add(serviceName);

		log.info("[CACHE] Executing: {} in {}", String.join(" ", command), workingDir);
		new ProcessExecutor()
				.command(command)
				.directory(workingDir.toFile())
				.timeout(120, TimeUnit.SECONDS)
				.execute();

		System.out.println("✓ Cache service '" + serviceName + "' stopped.");
	}

	/**
	 * Handle 'database start timeseries <service> [port]'.
	 * Runs docker compose in the db/ folder — no data provisioning needed.
	 */
	private static void handleTimeseriesStart(String managerArgsString) throws Exception {
		String[] parts = managerArgsString.split("\\s+");
		String serviceName = parts[0].toLowerCase();
		Integer customPort = parts.length > 1 ? Integer.parseInt(parts[1]) : null;

		String dbFolderPath = Utils.getDbFolderPath();
		Path workingDir = Paths.get(dbFolderPath);

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add("docker-compose.yml");
		command.add("up");
		command.add("-d");
		command.add("--remove-orphans");
		command.add(serviceName);

		ProcessExecutor executor = new ProcessExecutor()
				.command(command)
				.directory(workingDir.toFile())
				.readOutput(true)
				.timeout(300, TimeUnit.SECONDS);

		if (customPort != null) {
			Map<String, String> env = new HashMap<>(System.getenv());
			env.put("TIMESCALE_PORT", customPort.toString());
			executor.environment(env);
		}

		log.info("[TIMESERIES] Executing: {} in {}", String.join(" ", command), workingDir);
		ProcessResult result = executor.execute();

		if (result.getExitValue() == 0) {
			System.out.println("✓ Time-series DB '" + serviceName + "' started successfully.");
		} else {
			System.out.println("✗ Failed to start time-series DB '" + serviceName + "'. Exit code: " + result.getExitValue());
		}
	}

	/**
	 * Handle 'database stop timeseries <service>'.
	 */
	private static void handleTimeseriesStop(String managerArgsString) throws Exception {
		String serviceName = managerArgsString.split("\\s+")[0].toLowerCase();

		String dbFolderPath = Utils.getDbFolderPath();
		Path workingDir = Paths.get(dbFolderPath);

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add("docker-compose.yml");
		command.add("stop");
		command.add(serviceName);

		log.info("[TIMESERIES] Executing: {} in {}", String.join(" ", command), workingDir);
		new ProcessExecutor()
				.command(command)
				.directory(workingDir.toFile())
				.timeout(120, TimeUnit.SECONDS)
				.execute();

		System.out.println("✓ Time-series DB '" + serviceName + "' stopped.");
	}

	/**
	 * Handle 'database list northwind'
	 * 
	 * @throws Exception
	 */
	private static void handleNorthwindList() throws Exception {
		// Specific header
		for (DatabaseVendor vendor : DatabaseVendor.values()) {
			boolean running = dbManager.isRunning(vendor);
			if (running) {
				dbManager.getDatabaseVersion(vendor); // Use dbManager method for consistency
			}
		}
	}

	/** Handle 'database info northwind <vendor>' */
	private static void handleNorthwindInfo(String managerArgsString) throws Exception {

		String vendorName = managerArgsString.split("\\s+")[0].toUpperCase();
		DatabaseVendor vendor = DatabaseVendor.valueOf(vendorName);
		if (!dbManager.isRunning(vendor)) {
			return;
		}

		dbManager.getActualDataPath(vendor);
		dbManager.getActualHostPort(vendor);
		dbManager.getJdbcUrl(vendor);
		dbManager.getUsername(vendor);
		dbManager.getPassword(vendor);
		dbManager.getDatabaseVersion(vendor);
		Map<String, String> jpaProps = dbManager.getJpaProperties(vendor, false);
		for (Map.Entry<String, String> entry : jpaProps.entrySet()) {
			if (entry.getKey().startsWith("jakarta.persistence.jdbc")
					|| entry.getKey().startsWith("hibernate.dialect")) {
				// Process entry but don't print
			}
		}
		// Print table count (using existing helper)
		try (Connection conn = dbManager.getConnection(vendor)) {
			if (conn != null) {
				try (Statement stmt = conn.createStatement()) {
					printDatabaseStats(vendor, conn, stmt); // Keep helper
				}
			}
		}
	}

	/** Handle 'database query northwind <vendor> <sql>' */
	private static void handleNorthwindQuery(String managerArgsString) throws Exception {
		String[] parts = managerArgsString.split("\\s+", 2); // Split vendor from SQL

		String vendorName = parts[0].toUpperCase();
		String sql = parts[1].trim();

		DatabaseVendor vendor = DatabaseVendor.valueOf(vendorName);
		if (!dbManager.isRunning(vendor)) {
			return;
		}

		try (Connection conn = dbManager.getConnection(vendor)) {
			if (conn == null)
				return;
			try (Statement stmt = conn.createStatement()) {
				boolean isQuery = stmt.execute(sql);
				if (isQuery) {
					try (ResultSet rs = stmt.getResultSet()) {
						printResultSet(rs); // Keep helper
					}
				} else {
					stmt.getUpdateCount();
				}
			}
		}
	}

	/** Print database statistics (Keep for Northwind info) */
	private static void printDatabaseStats(DatabaseVendor vendor, Connection conn, Statement stmt) throws Exception {
		String tableQuery = null;
		// (Keep the switch statement for different vendor queries as before)
		switch (vendor) {
			case ORACLE:
				tableQuery = "SELECT table_name, num_rows FROM user_tables ORDER BY table_name";
				break;
			case SQLSERVER:
				tableQuery = "SELECT t.name AS table_name, p.rows AS num_rows FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id JOIN sys.partitions p ON t.object_id = p.object_id WHERE p.index_id IN (0, 1) AND s.name = SCHEMA_NAME() ORDER BY t.name";
				break;
			case DB2:
				tableQuery = "SELECT tabname AS table_name, card AS num_rows FROM syscat.tables WHERE tabschema = CURRENT SCHEMA ORDER BY tabname";
				break;
			case POSTGRES:
			case SUPABASE:
				tableQuery = "SELECT tablename AS table_name, COALESCE(n_live_tup, 0) AS num_rows FROM pg_stat_user_tables WHERE schemaname = current_schema() ORDER BY tablename";
				break;
			case MYSQL:
			case MARIADB:
				tableQuery = "SELECT table_name, table_rows AS num_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name";
				break;
			case SQLITE:
				try (ResultSet rs = stmt.executeQuery(
						"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
					while (rs.next()) {
						String tableName = rs.getString(1);
						try (Statement countStmt = conn.createStatement();
								ResultSet countRs = countStmt
										.executeQuery("SELECT COUNT(*) FROM \"" + tableName + "\"")) {
							if (countRs.next())
								countRs.getLong(1);
						}
					}
				}
				return; // Exit after handling SQLite
			default:
				return;
		}
		// Execute query for other databases
		try (ResultSet rs = stmt.executeQuery(tableQuery)) {
			while (rs.next()) {
				rs.getString("table_name");
				rs.getLong("num_rows");
				if (rs.wasNull()) {
					// Handle null case
				}
			}
		}
	}

	/** Print result set (Keep for Northwind query) */
	private static void printResultSet(ResultSet rs) throws Exception {
		ResultSetMetaData metaData = rs.getMetaData();
		int columnCount = metaData.getColumnCount();
		int[] columnWidths = new int[columnCount];
		for (int i = 1; i <= columnCount; i++)
			columnWidths[i - 1] = metaData.getColumnLabel(i).length();
		List<String[]> rows = new java.util.ArrayList<>();
		while (rs.next()) {
			String[] row = new String[columnCount];
			for (int i = 1; i <= columnCount; i++) {
				String value = rs.getString(i);
				value = value == null ? "NULL" : value;
				row[i - 1] = value;
				columnWidths[i - 1] = Math.max(columnWidths[i - 1], value.length());
			}
			rows.add(row);
		}
		final int MAX_COL_WIDTH = 40;
		for (int i = 0; i < columnWidths.length; i++)
			columnWidths[i] = Math.min(columnWidths[i], MAX_COL_WIDTH);
		for (int i = 1; i <= columnCount; i++) {
			// Process column headers but don't print
		}
		if (rows.isEmpty()) {
			// Process empty result but don't print
		} else {
			for (String[] row : rows) {
				for (int i = 0; i < columnCount; i++) {
					String value = row[i];
					if (value.length() > columnWidths[i])
						value = value.substring(0, columnWidths[i] - 3) + "...";
				}
			}
		}
	}

	/** Handle 'app start <serviceName> [args]' */
	private static void handleAppStart(String serviceName, String args) throws Exception {
		// Ensure portable apps config marker exists and .env files are updated when missing
		ensurePortableAppsConfig();
		// System.out.println("Starting app '" + serviceName + "'...");

		String composePath = getComposePath(serviceName);

		// Small, non-intrusive diagnostics to help determine where PORTABLE_EXECUTABLE_DIR comes from
		log.info("PORTABLE_EXECUTABLE_DIR (system property)='{}', env='{}', Utils.getPortableExecutableDir='{}'",
				System.getProperty("PORTABLE_EXECUTABLE_DIR"), System.getenv("PORTABLE_EXECUTABLE_DIR"), Utils.getPortableExecutableDir());

		// Log the compose file path and the JVM process current directory for diagnostics
		log.info("handleAppStart: composePath='{}' | process.cwd='{}'", composePath, Paths.get(".").toAbsolutePath().normalize().toString());

		// Extra diagnostics: resolve the intended working directory absolutely and report file existence
		Path composeFilePathCheck = Paths.get(composePath);
		Path workingDirCheck = composeFilePathCheck.getParent();
		Path absWorkingDir = workingDirCheck.isAbsolute() ? workingDirCheck : Paths.get(".").toAbsolutePath().resolve(workingDirCheck).normalize();
		boolean composeExists = Files.exists(absWorkingDir.resolve(composeFilePathCheck.getFileName()));
		log.info("Resolved workingDir absolute='{}' | compose file exists='{}'", absWorkingDir.toString(), composeExists);

		// Check common testground location presence for quick diagnosis
		boolean testgroundE2eAppsExists = Files.exists(Paths.get(".").toAbsolutePath().resolve("testground").resolve("e2e").resolve("_apps"));
		boolean testgroundAppsExists = Files.exists(Paths.get(".").toAbsolutePath().resolve("testground").resolve("_apps"));
		log.info("testground/e2e/_apps exists='{}' | testground/_apps exists='{}'", testgroundE2eAppsExists, testgroundAppsExists);

		// Set working directory to the compose file's parent (like NorthwindManager)
		Path composeFilePath = Paths.get(composePath);
		Path workingDir = composeFilePath.getParent();
		String composeFileName = composeFilePath.getFileName().toString();

		// Parse flags and port from args
		String customPort = null;
		boolean shouldBuild = false;
		boolean noCache = false;
		boolean enableLiquibase = false;
		boolean enableFull = false;
        
		boolean forceRecreate = false;
		boolean reprovision = false;

		if (args != null && !args.trim().isEmpty()) {
			String[] argParts = args.trim().split("\\s+");
			for (String part : argParts) {
				if (part.matches("\\d+")) {
					customPort = part;
				} else if (part.equalsIgnoreCase("--build")) {
					shouldBuild = true;
				} else if (part.equalsIgnoreCase("--no-cache")) {
					noCache = true;
				} else if (part.equalsIgnoreCase("--liquibase")) {
					enableLiquibase = true;
				} else if (part.equalsIgnoreCase("--full")) {
					// Full = remove local images and use no-cache (heaviest option)
					enableFull = true;
					noCache = true;
				} else if (part.equalsIgnoreCase("--force-recreate")) {
					forceRecreate = true;
				} else if (part.equalsIgnoreCase("--rebuild-theme") || part.equalsIgnoreCase("--theme-rebuild")
						|| part.equalsIgnoreCase("--reprovision")) {
					reprovision = true;
				}
			}
		}

		// Prepare environment variables map (shared between build and up commands)
		java.util.Map<String, String> env = new java.util.HashMap<>(System.getenv());
		if (customPort != null) {
			env.put("HOST_PORT", customPort);
			log.info("Using custom HOST_PORT={}", customPort);
		}
		if (enableLiquibase) {
			env.put("ENABLE_LIQUIBASE_GROOVY_MIGRATIONS", "true");
			env.put("DB_CREATE", "none"); // Disable GORM auto-schema when Liquibase manages migrations (Grails)
			env.put("DDL_AUTO", "none"); // Disable Hibernate ddl-auto when Liquibase manages migrations (Spring Boot)
			log.info(
					"Enabling Liquibase Groovy migrations: ENABLE_LIQUIBASE_GROOVY_MIGRATIONS=true, DB_CREATE=none, DDL_AUTO=none");
		}

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add(composeFileName); // Relative to workingDir
		command.add("up");

		// Add --build flag if requested (rebuilds image from Dockerfile)
		if (shouldBuild) {
			command.add("--build");
			log.info("Using --build flag to rebuild image");
		}

		// Add --no-cache flag if requested (requires --build, forces fresh build
		// without cache)
		// Note: --no-cache is a docker build flag, for compose we need to use docker
		// compose build --no-cache first
		// Actually for docker compose up, we can pass --build, but --no-cache needs
		// docker compose build

		command.add("-d");
		command.add("--remove-orphans");
		//if (forceRecreate || shouldBuild || noCache || reprovision) {
		command.add("--force-recreate");
		//}

		if (reprovision) {
			log.info("Reprovision requested for {} in {}", serviceName, workingDir);

			env.put("FORCE_BUILD", "true");
			
			List<String> helperCmd = new ArrayList<>();
			helperCmd.add("docker");
			helperCmd.add("compose");
			helperCmd.add("-f");
			helperCmd.add(composeFileName);
			helperCmd.add("run");
			helperCmd.add("--rm");
			helperCmd.add("cms-webportal-playground-cli");

			// Run reprovision cleanup:
			// 1. Remove provisioning marker file
			// 2. Remove WordPress provisioning option
			helperCmd.add("sh");
			helperCmd.add("-c");
			helperCmd.add(
				"rm -f /var/www/html/.provisioned || true && " +
				"wp option delete reportburster_demo_data_provisioned --allow-root || true"
			);

			try {
				log.info("Running cms-webportal-playground-cli for reprovision cleanup: {}", helperCmd);

				ProcessResult helperResult = new ProcessExecutor()
					.command(helperCmd)
					.directory(workingDir.toFile())
					.redirectOutput(Slf4jStream.of(log).asInfo())
					.redirectError(Slf4jStream.of(log).asInfo())
					.timeout(600, TimeUnit.SECONDS)
					.environment(env)
					.execute();

				log.info("Reprovision cleanup exit code: {}", helperResult.getExitValue());
			} catch (Exception e) {
				log.warn("Failed to run reprovision cleanup: {}", e.getMessage());
			}
		}

		// For cms-webportal-playground, default behavior is to start the entire compose
		// file
		// instead of a single declared service. This allows docker-compose to
		// orchestrate
		// service dependencies like the CLI and theme-builder, avoiding hardcoded
		// start/stop calls from the UI.
		// Normalize serviceName (trim to avoid whitespace issues) and log decision
		String normalizedServiceName = serviceName == null ? "" : serviceName.trim();
		log.info("handleAppStart: serviceName='{}' | normalized='{}'", serviceName, normalizedServiceName);
		if (!normalizedServiceName.equals("cms-webportal-playground")) {
			// Start the requested service only; docker-compose will bring up declared
			// dependencies automatically for most apps. For cms-webportal-playground
			// avoid specifying the service so all services declared in the compose
			// file are started and their inter-service dependencies handled by
			// docker-compose.
			command.add(serviceName);
		} else {
			log.info("Starting full compose for cms-webportal-playground (letting compose orchestrate all dependent services)");
		}

		// If --full is requested, run docker compose down --remove-orphans --rmi local
		// first
		if (enableFull) {
			log.info("Running docker compose down --remove-orphans --rmi local first (full mode)");
			List<String> downCmd = new ArrayList<>();
			downCmd.add("docker");
			downCmd.add("compose");
			downCmd.add("-f");
			downCmd.add(composeFileName);
			downCmd.add("down");
			downCmd.add("--remove-orphans");
			downCmd.add("--rmi");
			downCmd.add("local");
			
			ProcessExecutor downExecutor = new ProcessExecutor().command(downCmd).directory(workingDir.toFile())
					.redirectOutput(Slf4jStream.of(log).asInfo())
					.redirectError(Slf4jStream.of(log).asInfo())
					.timeout(300, TimeUnit.SECONDS)
					.environment(env);
			log.info("Executing down command (full mode): {} in directory: {}", downCmd, workingDir);
			ProcessResult downResult = downExecutor.execute();
			log.info("Down command exit code: {}", downResult.getExitValue());
			if (downResult.getExitValue() != 0) {
				System.out.println(
						"✗ Failed to run docker compose down for full mode. Exit code: " + downResult.getExitValue());
			}
		}

		// If --no-cache is requested, run docker compose build --no-cache first
		if (noCache) {
			log.info("Running docker compose build --no-cache first");
			List<String> buildCommand = new ArrayList<>();
			buildCommand.add("docker");
			buildCommand.add("compose");
			buildCommand.add("-f");
			buildCommand.add(composeFileName);
			buildCommand.add("build");
			buildCommand.add("--no-cache");
			// Build the requested service (let docker-compose handle service dependencies)
			String buildTarget = serviceName;
			buildCommand.add(buildTarget);

			ProcessExecutor buildExecutor = new ProcessExecutor().command(buildCommand).directory(workingDir.toFile())
					.redirectOutput(Slf4jStream.of(log).asInfo())
					.redirectError(Slf4jStream.of(log).asInfo())
					.timeout(7200, TimeUnit.SECONDS)
					.environment(env);

			log.info("Executing build command: {} in directory: {}", buildCommand, workingDir);
			ProcessResult buildResult = buildExecutor.execute();
			if (buildResult.getExitValue() != 0) {
				System.out.println("✗ Failed to build app '" + serviceName + "' with --no-cache. Exit code: "
						+ buildResult.getExitValue());
				return;
			}
		}

		log.info("Executing command: {} in directory: {}", command, workingDir);

		// Use ProcessExecutor like NorthwindManager for better output handling
		ProcessExecutor executor = new ProcessExecutor().command(command).directory(workingDir.toFile())
				.redirectOutput(Slf4jStream.of(log).asInfo()) // Capture stdout to log
				.redirectError(Slf4jStream.of(log).asInfo()) // Capture stderr to log
				.timeout(7200, TimeUnit.SECONDS) // Add timeout to prevent hanging
				.environment(env); // Pass environment variables including HOST_PORT and
									// ENABLE_LIQUIBASE_GROOVY_MIGRATIONS

		ProcessResult result = executor.execute();

		log.info("Command exit code: {}", result.getExitValue());
		if (result.getExitValue() == 0) {
			System.out.println("✓ App '" + serviceName + "' started successfully.");
		} else {
			System.out.println("✗ Failed to start app '" + serviceName + "'. Exit code: " + result.getExitValue());
		}
	}

	/**
	 * Ensure portable apps config marker exists and update .env files if missing.
	 * Minimal behavior: if PORTABLE_EXECUTABLE_DIR/config/_internal/.pedp-apps does not exist,
	 * update two .env files to contain PORTABLE_EXECUTABLE_DIR_PATH=<portableDir> and
	 * create the .pedp-apps marker file.
	 */
	private static void ensurePortableAppsConfig() throws Exception {
		String portableDir = Utils.getPortableExecutableDir();
		if (StringUtils.isBlank(portableDir)) return;

		Path pedpPath = Paths.get(portableDir).resolve("config").resolve("_internal").resolve(".pedp-apps");
		if (Files.exists(pedpPath)) return;

		// Files to update (relative to repo)
		Path appsDir = Paths.get(portableDir).resolve("_apps");
		Path flowkraftEnv = appsDir.resolve("flowkraft").resolve(".env");
		Path cmsEnv = appsDir.resolve("cms-webportal-playground").resolve(".env");

		String newLine = "PORTABLE_EXECUTABLE_DIR_PATH=" + portableDir;

		Consumer<Path> updateEnv = (path) -> {
			try {
				List<String> lines = new ArrayList<>();
				if (Files.exists(path)) {
					lines = Files.readAllLines(path);
					boolean replaced = false;
					for (int i = 0; i < lines.size(); i++) {
						String l = lines.get(i);
						if (l.startsWith("PORTABLE_EXECUTABLE_DIR_PATH=")) {
							lines.set(i, newLine);
							replaced = true;
							break;
						}
					}
					if (!replaced) {
						lines.add(newLine);
					}
				} else {
					// create parent directories if needed
					Files.createDirectories(path.getParent());
					lines.add(newLine);
				}
				Files.write(path, lines, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
			} catch (Exception e) {
				System.err.println("Failed to update env file " + path + " : " + e.getMessage());
			}
		};

		updateEnv.accept(flowkraftEnv);
		updateEnv.accept(cmsEnv);

		try {
			Files.createDirectories(pedpPath.getParent());
			Files.write(pedpPath, Collections.singletonList(""), StandardOpenOption.CREATE);
		} catch (Exception e) {
			System.err.println("Failed to create .pedp-apps marker: " + e.getMessage());
		}
	}

	/** Handle 'app stop <serviceName> [args]' */
	private static void handleAppStop(String serviceName, String args) throws Exception {
		// System.out.println("Stopping app '" + serviceName + "'...");

		String composePath = getComposePath(serviceName);

		// Log the compose file path and JVM working directory for diagnostics
		log.info("handleAppStop: composePath='{}' | jvm.cwd='{}'", composePath, System.getProperty("user.dir"));

		// Set working directory to the compose file's parent (like NorthwindManager)
		Path composeFilePath = Paths.get(composePath);
		Path workingDir = composeFilePath.getParent();
		String composeFileName = composeFilePath.getFileName().toString();

		// Parse args for --volumes flag to remove volumes
		boolean removeVolumes = false;
		if (args != null && !args.trim().isEmpty()) {
			String[] parts = args.trim().split("\\s+");
			for (String p : parts) {
				if (p.equalsIgnoreCase("--volumes") || p.equalsIgnoreCase("-v")
						|| p.equalsIgnoreCase("--remove-volumes")) {
					removeVolumes = true;
					break;
				}
			}
		}

		// Use 'docker compose down' to stop ALL containers in the compose file
		// This prevents orphaned containers (e.g., matomo-fpm, matomo-db when stopping
		// matomo)
		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add(composeFileName);
		command.add("down");
		command.add("--remove-orphans");
		if (removeVolumes) {
			command.add("--volumes");
		}
		// Note: Not using -v to preserve volumes/data between restarts
		// Add --volumes flag in args if user wants to purge data

		ProcessExecutor executor = new ProcessExecutor().command(command).directory(workingDir.toFile())
				.redirectOutput(Slf4jStream.of(log).asInfo()).redirectError(Slf4jStream.of(log).asInfo())
				.timeout(300, TimeUnit.SECONDS);

		ProcessResult result = executor.execute();

		log.info("Command exit code: {}", result.getExitValue());
		if (result.getExitValue() == 0) {
			System.out.println("✓ App '" + serviceName + "' stopped successfully.");
		} else {
			System.out.println("✗ Failed to stop app '" + serviceName + "'. Exit code: " + result.getExitValue());
		}
	}

	/**
	 * Handle 'app restart <serviceName> [moreServices...]' — recreate one or more compose
	 * services so they pick up a freshly written .env. 'docker compose restart' reuses the
	 * existing container (stale env); 'up -d --force-recreate <services>' replaces them and
	 * re-reads .env.
	 *
	 * We deliberately do NOT pass --no-deps: docker compose then honors depends_on, so a
	 * dependent (e.g. baibot) is only (re)started AFTER its dependency (letta) is healthy
	 * again — exactly like a manual whole-app restart, which is why the bot rejoins its
	 * Matrix rooms cleanly. --force-recreate replaces ONLY the listed containers; already
	 * healthy dependencies (ollama, matrix-synapse, matrix-db) are left running because we
	 * do not pass --always-recreate-deps. So the UI (ai-hub-frend), the Matrix server and
	 * Element all keep running — only the named services cycle, in dependency order.
	 *
	 * Used by the AI Hub provisioning flow as 'app restart letta baibot' after the provider
	 * API key is saved: letta re-reads .env and enumerates the models, then baibot re-couples
	 * to the fresh letta so kraftbot can join the oracle rooms.
	 */
	private static void handleAppRestart(String serviceName, String args) throws Exception {
		String composePath = getComposePath(serviceName);
		log.info("handleAppRestart: composePath='{}' | jvm.cwd='{}'", composePath, System.getProperty("user.dir"));

		Path composeFilePath = Paths.get(composePath);
		Path workingDir = composeFilePath.getParent();
		String composeFileName = composeFilePath.getFileName().toString();

		// Services to recreate: the primary one + any extra names in args (e.g. 'letta baibot').
		List<String> services = new ArrayList<>();
		services.add(serviceName);
		if (args != null && !args.isBlank()) {
			for (String extra : args.trim().split("\\s+")) {
				if (!extra.isBlank() && !extra.startsWith("-")) services.add(extra);
			}
		}

		List<String> command = new ArrayList<>();
		command.add("docker");
		command.add("compose");
		command.add("-f");
		command.add(composeFileName);
		command.add("up");
		command.add("-d");
		command.add("--force-recreate");
		command.addAll(services);

		ProcessResult result = new ProcessExecutor().command(command).directory(workingDir.toFile())
				.redirectOutput(Slf4jStream.of(log).asInfo()).redirectError(Slf4jStream.of(log).asInfo())
				.timeout(300, TimeUnit.SECONDS).execute();

		log.info("handleAppRestart exit code: {}", result.getExitValue());
		String svcList = String.join(", ", services);
		if (result.getExitValue() == 0) {
			System.out.println("✓ Service(s) '" + svcList + "' recreated (re-read .env, depends_on order honored).");
		} else {
			System.out.println("✗ Failed to recreate service(s) '" + svcList + "'. Exit code: " + result.getExitValue());
		}
	}

	/** Get the docker-compose.yml path for the service */
	private static String getComposePath(String serviceName) {
		String appsFolderPath = Utils.getAppsFolderPath();
		// Boot Groovy playground lives in flowkraft subdirectory
		if ("bkend-boot-groovy-playground".equals(serviceName)) {
			return appsFolderPath + "flowkraft/bkend-boot-groovy-playground/docker-compose.yml";
		}
		// Grails unified app lives in flowkraft subdirectory
		if ("grails-playground".equals(serviceName)) {
			return appsFolderPath + "flowkraft/grails-playground/docker-compose.yml";
		}
		// Next.js app lives in flowkraft subdirectory
		if ("next-playground".equals(serviceName)) {
			return appsFolderPath + "flowkraft/next-playground/docker-compose.yml";
		}
		// AI Hub frontend lives in flowkraft/_ai-hub subdirectory
		if ("ai-hub-frend".equals(serviceName)) {
			return appsFolderPath + "flowkraft/_ai-hub/docker-compose.yml";
		}
		// AI Hub internal services (letta, chat2db, ...) share the _ai-hub compose — used by
		// 'app restart letta' to bounce Letta so it re-reads .env after a provider key change.
		if ("letta".equals(serviceName) || "ai-hub-letta".equals(serviceName)
				|| "chat2db".equals(serviceName) || "ai-hub-chat2db".equals(serviceName)) {
			return appsFolderPath + "flowkraft/_ai-hub/docker-compose.yml";
		}
		return appsFolderPath + serviceName + "/docker-compose.yml";
	}
	

}
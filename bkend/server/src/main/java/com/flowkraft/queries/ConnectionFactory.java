package com.flowkraft.queries;

import com.flowkraft.common.AppPaths;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.utils.Utils;
import com.sourcekraft.documentburster.common.db.SqlExecutor;
import com.sourcekraft.documentburster.common.settings.Settings;

/**
 * Single entry-point for REST endpoints that need to read per-connection XML
 * or execute SQL. Guarantees {@code Settings.PORTABLE_EXECUTABLE_DIR_PATH} is
 * synced with {@link AppPaths#PORTABLE_EXECUTABLE_DIR_PATH} before Settings
 * construction so relative-path lookups resolve correctly regardless of JVM cwd.
 *
 * Mirrors the sync ritual performed by JobExecutionService.executeSync/Async,
 * which is why those (legacy) paths worked while REST endpoints intermittently
 * failed with FileNotFoundException on config/connections/{id}/{id}.xml.
 */
public final class ConnectionFactory {

	private ConnectionFactory() {
	}

	/**
	 * Sync the static {@code Settings.PORTABLE_EXECUTABLE_DIR_PATH} with
	 * {@link AppPaths}. Call this before any code path that reads per-connection
	 * XML or decrypts passwords via SecretsCipher — including paths that do not
	 * construct a {@link DatabaseConnectionManager} directly (e.g. DatabaseSchemaFetcher).
	 */
	public static void syncPath() {
		Settings.PORTABLE_EXECUTABLE_DIR_PATH = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
	}

	public static DatabaseConnectionManager newConnectionManager() throws Exception {
		syncPath();
		String settingsPath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
		Settings settings = new Settings(settingsPath);
		// The Settings constructor re-derives PORTABLE_EXECUTABLE_DIR_PATH from the
		// configFilePath (which may fall back to CWD if the file doesn't exist).
		// Re-sync immediately after construction to ensure the static field always
		// reflects the JVM-arg value, not whatever the constructor derived.
		syncPath();
		settings.loadSettings();
		return new DatabaseConnectionManager(settings);
	}

	public static SqlExecutor newSqlExecutor() throws Exception {
		return new SqlExecutor(newConnectionManager());
	}
}

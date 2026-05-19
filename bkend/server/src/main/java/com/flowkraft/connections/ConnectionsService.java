package com.flowkraft.connections;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.services.JobExecutionService;
import com.sourcekraft.documentburster.utils.Utils;
import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.job.CliJob;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Service for managing database and email connections.
 * Handles CRUD operations, connection testing, and metadata file management.
 */
@Service
public class ConnectionsService {

	private static final Logger log = LoggerFactory.getLogger(ConnectionsService.class);

	@org.springframework.beans.factory.annotation.Autowired
	private JobExecutionService jobExecutionService;

	@org.springframework.beans.factory.annotation.Autowired
	private ReportsService reportsService;

	private String getConnectionsDir() {
		return Utils.resolvePathAgainstPortableDir("config/connections");
	}

	/**
	 * Returns true if the given connectionId is one of the synthesized
	 * in-memory sample connections (Northwind on SQLite/DuckDB/ClickHouse).
	 * Mirrors the same check in {@code ConnectionsController.isSampleConnectionCode}.
	 */
	private static boolean isSampleConnectionCode(String connectionId) {
		if (connectionId == null) return false;
		String lower = connectionId.trim().toLowerCase();
		return lower.contains("rbt-sample-northwind-sqlite-4f2")
				|| lower.contains("rbt-sample-northwind-duckdb-4f2")
				|| lower.contains("rbt-sample-northwind-clickhouse-4f2");
	}

	/**
	 * Lazily writes a sample connection's XML to its standard on-disk location
	 * if the file does not yet exist. Sample connections are synthesized
	 * in-memory by {@link ReportsService#synthesizeSampleConnections()} and
	 * have no XML on disk by default — but downstream backend operations
	 * (test connection, fetch schema, ER diagram, DGS, cubes) all expect
	 * a real file at {@code config/connections/{id}/{id}.xml}. This helper
	 * bridges the gap by materializing the file once on demand.
	 *
	 * <p>Behavior:
	 * <ul>
	 *   <li>No-op for non-sample connection IDs.</li>
	 *   <li>Throws {@link IllegalStateException} if the user has disabled the
	 *       "Show sample connections & cubes" preference — in that case the UI
	 *       should not be exposing samples in the first place, but we guard
	 *       against stale state and direct API calls. The error message is
	 *       explicit so the user knows why.</li>
	 *   <li>Idempotent: if the XML already exists, returns immediately
	 *       without overwriting (samples are read-only).</li>
	 *   <li>Side effect: creates the parent directory and writes the XML
	 *       via the standard {@link ReportsService#saveSettingsConnectionDatabase}
	 *       path. The materialized folder name starts with {@code rbt-sample-}
	 *       so it is invisible to {@link ReportsService#loadSettingsConnectionDatabaseAll()},
	 *       which only enumerates folders prefixed with {@code db-}. The
	 *       canonical entry in the connections list remains the synthesized
	 *       one (with {@code isSample=true}); the materialized file is
	 *       purely backend plumbing.</li>
	 * </ul>
	 */
	private void materializeSampleIfNeeded(String connectionId) throws Exception {
		if (!isSampleConnectionCode(connectionId)) {
			return;
		}
		if (!Settings.isShowSamplesEnabled()) {
			throw new IllegalStateException(
					"Sample connections are disabled. Enable them in Skin Options → "
							+ "'Show sample connections & cubes' to use this connection.");
		}
		String xmlPath = getConnectionFilePath(connectionId);
		if (new File(xmlPath).exists()) {
			return; // already materialized — idempotent
		}
		DocumentBursterConnectionDatabaseSettings dto = reportsService
				.getSampleConnectionAsDbSettings(connectionId);
		if (dto == null) {
			throw new IllegalStateException(
					"Unknown sample connection: " + connectionId);
		}
		reportsService.saveSettingsConnectionDatabase(dto, xmlPath);
		log.info("Materialized sample connection {} → {}", connectionId, xmlPath);
	}

	private String getConnectionFilePath(String connectionId) {
		return getConnectionsDir() + "/" + connectionId + "/" + connectionId + ".xml";
	}

	/** Resolve file path for a database connection: config/connections/{id}/{id}.xml */
	public String resolveDbConnectionPath(String connectionId) {
		return getConnectionFilePath(connectionId);
	}

	/**
	 * Ensures the connection is available on disk (materializes sample connections
	 * if needed) and returns its XML file path. Safe to call for any connection type.
	 * Used by both testDatabaseConnection() and QueriesService.getSchema().
	 */
	public String prepareConnectionFilePath(String connectionId) throws Exception {
		materializeSampleIfNeeded(connectionId);
		return getConnectionFilePath(connectionId);
	}

	/** Resolve file path for an email connection: config/connections/{id}.xml */
	public String resolveEmailConnectionPath(String connectionId) {
		return getConnectionsDir() + "/" + connectionId + ".xml";
	}

	/**
	 * Test an email connection by sending a test message.
	 * Goes through DocumentBurster.execute() → CliJob.doCheckEmail() for proper
	 * .job file lifecycle (status bar "Working on...").
	 */
	public void testEmailConnection(String connectionId) throws Throwable {
		String connectionFilePath = resolveEmailConnectionPath(connectionId);
		log.info("Testing email connection: {}", connectionId);
		jobExecutionService.executeSync(new String[] {
				"system", "test-email",
				"--email-connection-file", connectionFilePath
		});
		log.info("Email connection test completed for: {}", connectionId);
	}

	/**
	 * Test inline SMTP email settings from a report config (settings.xml).
	 * Used when useconn=false — the SMTP settings are in the report's own config,
	 * not in a separate connection file.
	 */
	public void testInlineEmailConnection(String reportId) throws Throwable {
		String settingsPath;
		if ("burst".equals(reportId)) {
			settingsPath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
		} else {
			settingsPath = Utils.resolvePathAgainstPortableDir("config/reports/" + reportId + "/settings.xml");
		}
		log.info("Testing inline email connection from report config: {}", settingsPath);
		jobExecutionService.executeSync(new String[] {
				"system", "test-email",
				"--email-connection-file", settingsPath
		});
		log.info("Inline email connection test completed for report: {}", reportId);
	}

	/**
	 * Test a database connection and fetch its schema.
	 * Goes through DocumentBurster.execute() → CliJob.doTestAndFetchDatabaseSchema()
	 * which handles testing, schema fetch, and saving information-schema.json + table-names.txt.
	 */
	public void testDatabaseConnection(String connectionId) throws Throwable {
		String connectionFilePath = prepareConnectionFilePath(connectionId);
		log.info("Testing database connection: {}", connectionId);
		jobExecutionService.executeSync(new String[] {
				"system", "test-and-fetch-database-schema",
				"--database-connection-file", connectionFilePath
		});
		log.info("Database connection test and schema fetch completed for: {}", connectionId);
	}

	/**
	 * Test SMS via Twilio by sending a test message.
	 */
	public void testSms(String fromNumber, String toNumber, String configFilePath) throws Exception {
		log.info("Testing SMS: from={}, to={}", fromNumber, toNumber);

		String fullConfigPath = Utils.resolvePathAgainstPortableDir(configFilePath.replaceFirst("^/", ""));

		CliJob job = new CliJob(fullConfigPath);
		job.doCheckTwilio(fromNumber, toNumber);

		log.info("SMS test completed");
	}

	/**
	 * Delete a connection — removes the folder (for database connections) or
	 * the single XML file (for email connections).
	 */
	public void deleteConnection(String connectionId) throws Exception {
		// Database connections live in a directory: config/connections/{connectionId}/
		File connectionDir = new File(getConnectionsDir() + "/" + connectionId);
		if (connectionDir.exists() && connectionDir.isDirectory()) {
			FileUtils.deleteDirectory(connectionDir);
			log.info("Deleted connection directory: {}", connectionId);
			return;
		}

		// Email connections live as a single file: config/connections/{connectionId}.xml
		File connectionFile = new File(getConnectionsDir() + "/" + connectionId + ".xml");
		if (connectionFile.exists() && connectionFile.isFile()) {
			connectionFile.delete();
			log.info("Deleted connection file: {}", connectionId);
		}
	}

	/**
	 * Read connection metadata file (domain-grouped-schema, er-diagram, ubiquitous-language, information-schema).
	 *
	 * @param connectionId the connection identifier
	 * @param type one of: "domain-grouped-schema", "er-diagram", "ubiquitous-language", "information-schema"
	 * @return the file content, or null if file doesn't exist
	 */
	public String getMetadata(String connectionId, String type) throws Exception {
		String filePath = resolveMetadataPath(connectionId, type);
		File file = new File(filePath);
		if (!file.exists()) {
			return null;
		}
		return Files.readString(file.toPath());
	}

	/**
	 * Save connection metadata file.
	 * If content is empty/null, deletes the file.
	 */
	public void saveMetadata(String connectionId, String type, String content) throws Exception {
		String filePath = resolveMetadataPath(connectionId, type);

		if (StringUtils.isBlank(content)) {
			// Delete the file if content is empty
			File file = new File(filePath);
			if (file.exists()) {
				file.delete();
				log.info("Deleted metadata {}/{}", connectionId, type);
			}
		} else {
			Files.writeString(Path.of(filePath), content);
			log.info("Saved metadata {}/{} ({} chars)", connectionId, type, content.length());
		}
	}

	private String resolveMetadataPath(String connectionId, String type) {
		String baseDir = getConnectionsDir() + "/" + connectionId;
		switch (type) {
		case "domain-grouped-schema":
			return baseDir + "/" + connectionId + "-domain-grouped-schema.json";
		case "er-diagram":
			return baseDir + "/" + connectionId + "-er-diagram.puml";
		case "ubiquitous-language":
			return baseDir + "/" + connectionId + "-ubiquitous-language.md";
		case "information-schema":
			return baseDir + "/" + connectionId + "-information-schema.json";
		case "table-names":
			return baseDir + "/" + connectionId + "-table-names.txt";
		default:
			throw new IllegalArgumentException("Unknown metadata type: " + type);
		}
	}
}

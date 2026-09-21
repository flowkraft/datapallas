package com.sourcekraft.documentburster.unit.documentation.userguide.reporting;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.commons.io.FileUtils;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.settings.Settings;

/**
 * Tests the 3-tier DB connection resolution for standalone JasperReports
 * (pure .jrxml dropped into config/reports-jasper/).
 *
 * DataPallas resolves the database connection using this priority:
 *   1. Per-report override — config/reports-jasper/{report-folder}/datasource.properties
 *   2. Global JasperReports override — config/reports-jasper/datasource.properties
 *   3. DataPallas's default DB connection (marked "default" in Connections settings)
 *
 * This does NOT apply to inline/wrapper .jrxml templates (output type = jasper)
 * which always use the parent report's DB connection from its own conncode.
 */
public class JasperConnectionResolutionTest {

	private static final Logger log = LoggerFactory.getLogger(JasperConnectionResolutionTest.class);

	// Temp root simulating the app's PORTABLE_EXECUTABLE_DIR_PATH
	private static final String TEST_ROOT = "./target/test-output/jasper-3tier-test";

	@BeforeClass
	public static void setUpBeforeClass() throws Exception {
		// Clean any previous run
		File root = new File(TEST_ROOT);
		if (root.exists()) FileUtils.deleteDirectory(root);

		// Create the directory structure:
		// {root}/config/reports-jasper/test-report/settings.xml
		// {root}/config/reports-jasper/test-report/reporting.xml
		// {root}/config/_defaults/reporting.xml (not needed — we create reporting.xml directly)
		// {root}/config/connections/db-test-conn/db-test-conn.xml
		// {root}/config/_internal/settings.xml (needed by loadSettingsInternal — optional)

		createSettingsXml();
		createReportingXml("test-report", "ds.jasper", "");
		createReportingXml("test-report-with-conncode", "ds.jasper", "db-explicit-conn");
		createReportingXml("test-report-non-jasper", "ds.csvfile", "");
		createConnectionXml("db-default-conn", true, "jdbc:duckdb:./target/conn-resolution/default_test.duckdb", "user_default", "");
		createConnectionXml("db-global-conn", false, "jdbc:duckdb:./target/conn-resolution/global_test.duckdb", "user_global", "pass_global");
		createConnectionXml("db-perreport-conn", false, "jdbc:duckdb:./target/conn-resolution/perreport_test.duckdb", "user_perreport", "pass_perreport");
		createConnectionXml("db-explicit-conn", false, "jdbc:duckdb:./target/conn-resolution/explicit_test.duckdb", "user_explicit", "pass_explicit");
	}

	@AfterClass
	public static void tearDownAfterClass() throws Exception {
		File root = new File(TEST_ROOT);
		if (root.exists()) FileUtils.deleteDirectory(root);
	}

	/**
	 * Tier 3: No datasource.properties anywhere — falls back to default DB connection.
	 */
	@Test
	public void testTier3_DefaultConnection() throws Exception {
		log.info("========== testTier3_DefaultConnection ==========");

		// No datasource.properties files — should fall back to default connection
		removeFile("config/reports-jasper/datasource.properties");
		removeFile("config/reports-jasper/test-report/datasource.properties");

		Settings settings = new Settings(absPath("config/reports-jasper/test-report/settings.xml"));
		settings.loadSettings();

		assertNotNull("connectionDatabaseSettings should be resolved via default connection",
				settings.connectionDatabaseSettings);
		assertNotNull("connection should be set", settings.connectionDatabaseSettings.connection);
		assertEquals("JDBC URL should match default connection",
				"jdbc:duckdb:./target/conn-resolution/default_test.duckdb",
				settings.connectionDatabaseSettings.connection.databaseserver.url);
		assertEquals("User should match default connection",
				"user_default", settings.connectionDatabaseSettings.connection.databaseserver.userid);
	}

	/**
	 * Tier 2: Global datasource.properties overrides the default connection.
	 */
	@Test
	public void testTier2_GlobalDatasourceProperties() throws Exception {
		log.info("========== testTier2_GlobalDatasourceProperties ==========");

		// Global datasource.properties points to db-global-conn
		removeFile("config/reports-jasper/test-report/datasource.properties");
		writeDatasourceProperties("config/reports-jasper/datasource.properties", "db-global-conn");

		Settings settings = new Settings(absPath("config/reports-jasper/test-report/settings.xml"));
		settings.loadSettings();

		assertNotNull("connectionDatabaseSettings should be resolved via global datasource.properties",
				settings.connectionDatabaseSettings);
		assertEquals("JDBC URL should match global connection",
				"jdbc:duckdb:./target/conn-resolution/global_test.duckdb",
				settings.connectionDatabaseSettings.connection.databaseserver.url);
		assertEquals("User should match global connection",
				"user_global", settings.connectionDatabaseSettings.connection.databaseserver.userid);

		// Clean up
		removeFile("config/reports-jasper/datasource.properties");
	}

	/**
	 * Tier 1: Per-report datasource.properties overrides global and default.
	 */
	@Test
	public void testTier1_PerReportDatasourceProperties() throws Exception {
		log.info("========== testTier1_PerReportDatasourceProperties ==========");

		// Both global and per-report exist — per-report wins
		writeDatasourceProperties("config/reports-jasper/datasource.properties", "db-global-conn");
		writeDatasourceProperties("config/reports-jasper/test-report/datasource.properties", "db-perreport-conn");

		Settings settings = new Settings(absPath("config/reports-jasper/test-report/settings.xml"));
		settings.loadSettings();

		assertNotNull("connectionDatabaseSettings should be resolved via per-report datasource.properties",
				settings.connectionDatabaseSettings);
		assertEquals("JDBC URL should match per-report connection",
				"jdbc:duckdb:./target/conn-resolution/perreport_test.duckdb",
				settings.connectionDatabaseSettings.connection.databaseserver.url);
		assertEquals("User should match per-report connection",
				"user_perreport", settings.connectionDatabaseSettings.connection.databaseserver.userid);

		// Clean up
		removeFile("config/reports-jasper/datasource.properties");
		removeFile("config/reports-jasper/test-report/datasource.properties");
	}

	/**
	 * When conncode is already set in reporting.xml (e.g., user manually edited it),
	 * the dynamic resolution should NOT override it — the explicit conncode takes precedence.
	 */
	@Test
	public void testExplicitConncode_OverridesDynamicResolution() throws Exception {
		log.info("========== testExplicitConncode_OverridesDynamicResolution ==========");

		// Per-report datasource.properties points to db-perreport-conn
		writeDatasourceProperties("config/reports-jasper/test-report-with-conncode/datasource.properties",
				"db-perreport-conn");

		Settings settings = new Settings(absPath("config/reports-jasper/test-report-with-conncode/settings.xml"));
		settings.loadSettings();

		assertNotNull("connectionDatabaseSettings should be resolved",
				settings.connectionDatabaseSettings);
		// The explicit conncode in reporting.xml (db-explicit-conn) should win
		// over the datasource.properties (db-perreport-conn)
		assertEquals("JDBC URL should match explicit conncode, not datasource.properties",
				"jdbc:duckdb:./target/conn-resolution/explicit_test.duckdb",
				settings.connectionDatabaseSettings.connection.databaseserver.url);

		// Clean up
		removeFile("config/reports-jasper/test-report-with-conncode/datasource.properties");
	}

	/**
	 * Non-jasper reports (ds.csvfile, ds.sqlquery, etc.) should NOT trigger
	 * the dynamic resolution — their conncode stays as-is from reporting.xml.
	 */
	@Test
	public void testNonJasperReport_NoDynamicResolution() throws Exception {
		log.info("========== testNonJasperReport_NoDynamicResolution ==========");

		// Even with datasource.properties, ds.csvfile should NOT resolve dynamically
		writeDatasourceProperties("config/reports-jasper/test-report-non-jasper/datasource.properties",
				"db-perreport-conn");

		Settings settings = new Settings(absPath("config/reports-jasper/test-report-non-jasper/settings.xml"));
		settings.loadSettings();

		// ds.csvfile with empty conncode → connectionDatabaseSettings should be null
		assertNull("connectionDatabaseSettings should be null for non-jasper reports with empty conncode",
				settings.connectionDatabaseSettings);

		// Clean up
		removeFile("config/reports-jasper/test-report-non-jasper/datasource.properties");
	}

	// ─── Helper methods ───

	private static String absPath(String relativePath) {
		return new File(TEST_ROOT, relativePath).getAbsolutePath();
	}

	private static void removeFile(String relativePath) {
		File f = new File(TEST_ROOT, relativePath);
		if (f.exists()) f.delete();
	}

	private static void writeDatasourceProperties(String relativePath, String connectionCode) throws Exception {
		File f = new File(TEST_ROOT, relativePath);
		f.getParentFile().mkdirs();
		Files.writeString(f.toPath(), "connectionCode=" + connectionCode + "\n");
	}

	private static void createSettingsXml() throws Exception {
		// Copy canonical settings.xml and patch for this test
		String[] folders = {"test-report", "test-report-with-conncode", "test-report-non-jasper"};
		String content = FileUtils.readFileToString(
				new File("src/main/external-resources/template/config/burst/settings.xml"), "UTF-8");
		content = content.replace("<template>My Reports</template>",
				"<template>Test Report</template>");
		content = content.replace(
				"<burstfilename>${burst_token}.${output_type_extension}",
				"<burstfilename>${burst_token}.pdf");
		content = content.replace(
				"<reportdistribution>true</reportdistribution>",
				"<reportdistribution>false</reportdistribution>");
		content = content.replace(
				"<reportgenerationmailmerge>false</reportgenerationmailmerge>",
				"<reportgenerationmailmerge>true</reportgenerationmailmerge>");

		for (String folder : folders) {
			File dir = new File(TEST_ROOT, "config/reports-jasper/" + folder);
			dir.mkdirs();
			Files.writeString(new File(dir, "settings.xml").toPath(), content);
		}
	}

	private static void createReportingXml(String reportFolder, String dsType, String conncode) throws Exception {
		File dir = new File(TEST_ROOT, "config/reports-jasper/" + reportFolder);
		dir.mkdirs();
		// Copy canonical reporting.xml and patch for this test
		String content = FileUtils.readFileToString(
				new File("../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml"), "UTF-8");
		content = content.replace("ds.csvfile", dsType);
		content = content.replace("output.none", "output.jasper");
		content = content.replace("<documentpath/>",
				"<documentpath>test.jrxml</documentpath>");
		if (conncode != null && !conncode.isEmpty()) {
			// Replace first <conncode/> (in sqloptions) with the specified conncode
			content = content.replaceFirst("<conncode/>",
					"<conncode>" + conncode + "</conncode>");
		}
		Files.writeString(new File(dir, "reporting.xml").toPath(), content);
	}

	private static void createConnectionXml(String connCode, boolean isDefault,
			String jdbcUrl, String user, String pass) throws Exception {
		File dir = new File(TEST_ROOT, "config/connections/" + connCode);
		dir.mkdirs();
		String content = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
				+ "<documentburster>\n"
				+ "  <connection>\n"
				+ "    <code>" + connCode + "</code>\n"
				+ "    <name>" + connCode + "</name>\n"
				+ "    <default>" + isDefault + "</default>\n"
				+ "    <databaseserver>\n"
				+ "      <type>duckdb</type>\n"
				+ "      <driver>org.duckdb.DuckDBDriver</driver>\n"
				+ "      <url>" + jdbcUrl + "</url>\n"
				+ "      <userid>" + user + "</userid>\n"
				+ "      <userpassword>" + pass + "</userpassword>\n"
				+ "    </databaseserver>\n"
				+ "  </connection>\n"
				+ "</documentburster>";
		Files.writeString(new File(dir, connCode + ".xml").toPath(), content);
	}
}

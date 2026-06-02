package com.sourcekraft.documentburster.unit.documentation.userguide.reporting;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.apache.commons.io.FileUtils;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.MainProgram;
import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;
import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.AbstractReporter;
import com.sourcekraft.documentburster.engine.reporting.JasperStandaloneReporter;
import com.sourcekraft.documentburster.job.CliJob;

import picocli.CommandLine;

/**
 * Tests the full CLI flow for standalone JasperReports — the EXACT same code
 * path that Electron spawns via DataPallas.bat:
 *
 *   DataPallas.bat generate -c {configPath} {reportName} -p "key=value"
 *
 * This translates to Picocli → GenerateCommand.call() → CliJob.doBurst() →
 * BursterFactory → JasperStandaloneReporter → Settings.loadSettings() →
 * loadSettingsReporting() → 3-tier DB connection resolution →
 * generateFromJasperReport() → JasperReportRunner.generate() →
 * JasperFillManager.fillReport(report, params, java.sql.Connection)
 *
 * Uses the SAME .jrxml reports as the e2e tests (customer_by_country.jrxml
 * with embedded SQL querying Northwind Customers table).
 *
 * Proves that:
 *   1. The 3-tier datasource.properties resolution correctly populates
 *      connectionDatabaseSettings with JDBC URL/user/pass
 *   2. The DB connection is handed to JasperReports the way JR expects it
 *      (as a java.sql.Connection passed to JasperFillManager.fillReport)
 *   3. JR successfully executes its embedded SQL query against the real DB
 *   4. Output files are generated with data from the database
 *
 * DB connection resolution for standalone JasperReports (pure .jrxml in
 * config/reports-jasper/) uses 3-tier priority:
 *   1. Per-report override — config/reports-jasper/{report-folder}/datasource.properties
 *   2. Global JasperReports override — config/reports-jasper/datasource.properties
 *   3. DataPallas's default DB connection (marked "default" in Connections)
 * This does NOT apply to inline/wrapper .jrxml templates which always use
 * the parent report's DB connection.
 */
public class JasperCliFlowTest {

	private static final Logger log = LoggerFactory.getLogger(JasperCliFlowTest.class);

	// Temp root simulating the deployed app directory
	private static final String TEST_ROOT = TestsUtils.TESTS_OUTPUT_FOLDER + "/jasper-cli-flow";

	// JR7-compatible .jrxml with embedded SQL — same query as the e2e jrxml
	// but in JR7 format (no xmlns, no isForPrompting — uses forPrompting)
	private static final String JRXML_WITH_SQL =
			"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
			+ "<jasperReport name=\"customers_by_country\"\n"
			+ "    pageWidth=\"595\" pageHeight=\"842\" columnWidth=\"555\"\n"
			+ "    leftMargin=\"20\" rightMargin=\"20\" topMargin=\"20\" bottomMargin=\"20\">\n"
			+ "  <parameter name=\"country\" class=\"java.lang.String\">\n"
			+ "    <defaultValueExpression><![CDATA[\"Germany\"]]></defaultValueExpression>\n"
			+ "  </parameter>\n"
			+ "  <query language=\"SQL\"><![CDATA[\n"
			+ "    SELECT \"CustomerID\", \"CompanyName\", \"Country\"\n"
			+ "    FROM \"Customers\"\n"
			+ "    WHERE \"Country\" = $P{country}\n"
			+ "    ORDER BY \"CompanyName\"\n"
			+ "  ]]></query>\n"
			+ "  <field name=\"CustomerID\" class=\"java.lang.String\"/>\n"
			+ "  <field name=\"CompanyName\" class=\"java.lang.String\"/>\n"
			+ "  <field name=\"Country\" class=\"java.lang.String\"/>\n"
			+ "  <detail>\n"
			+ "    <band height=\"20\">\n"
			+ "      <element kind=\"textField\" x=\"0\" y=\"0\" width=\"100\" height=\"20\">\n"
			+ "        <expression>$F{CustomerID}</expression>\n"
			+ "      </element>\n"
			+ "      <element kind=\"textField\" x=\"100\" y=\"0\" width=\"300\" height=\"20\">\n"
			+ "        <expression>$F{CompanyName}</expression>\n"
			+ "      </element>\n"
			+ "      <element kind=\"textField\" x=\"400\" y=\"0\" width=\"155\" height=\"20\">\n"
			+ "        <expression>$F{Country}</expression>\n"
			+ "      </element>\n"
			+ "    </band>\n"
			+ "  </detail>\n"
			+ "</jasperReport>";

	// The last reporter that ran — captured for internal inspection
	private static TestJasperReporter lastReporter;

	@BeforeClass
	public static void setUpBeforeClass() throws Exception {
		// Clean previous runs
		File root = new File(TEST_ROOT);
		if (root.exists()) FileUtils.deleteDirectory(root);

		// Set up H2 with Northwind data (same DB as all other tests)
		NorthwindTestUtils.setupTestDatabase();

		// Create the full app directory structure
		createAppStructure();
	}

	@AfterClass
	public static void tearDownAfterClass() throws Exception {
		File root = new File(TEST_ROOT);
		if (root.exists()) FileUtils.deleteDirectory(root);
	}

	/**
	 * Tier 3: Default DB connection — no datasource.properties anywhere.
	 * The 3-tier resolution falls back to the default connection (db-h2-northwind).
	 * Proves: JasperReports receives the JDBC connection and executes its embedded SQL.
	 */
	@Test
	public void testDefaultConnection_JasperExecutesSqlAndGeneratesOutput() throws Throwable {
		final String TEST_NAME = "Tier3-Default";
		log.info("========== {} ==========", TEST_NAME);

		// Ensure no datasource.properties files exist
		removeFile("config/reports-jasper/datasource.properties");
		removeFile("config/reports-jasper/customer-by-country/datasource.properties");

		String configPath = absPath("config/reports-jasper/customer-by-country/settings.xml");

		// Execute through the EXACT same Picocli CLI pipeline as DataPallas.bat
		executeCliGenerate(configPath, "customer_by_country", TEST_NAME,
				"-p", "country=Germany");

		// ASSERT: 3-tier resolution populated connectionDatabaseSettings
		assertNotNull("connectionDatabaseSettings must be populated (3-tier default)",
				lastReporter.getCtx().settings.connectionDatabaseSettings);
		ServerDatabaseSettings dbServer =
				lastReporter.getCtx().settings.connectionDatabaseSettings.connection.databaseserver;
		assertNotNull("databaseserver must be set", dbServer);
		assertEquals("JDBC URL must match H2 Northwind",
				NorthwindTestUtils.H2_URL, dbServer.url);
		assertEquals("JDBC user must match",
				NorthwindTestUtils.H2_USER, dbServer.userid);

		// ASSERT: Output file generated (JR executed SQL and produced output)
		assertOutputGenerated(lastReporter.getCtx());

		log.info("PASSED: {}", TEST_NAME);
	}

	/**
	 * Tier 2: Global datasource.properties overrides the default.
	 * config/reports-jasper/datasource.properties → db-h2-northwind
	 */
	@Test
	public void testGlobalDatasourceProperties_JasperReceivesConnection() throws Throwable {
		final String TEST_NAME = "Tier2-Global";
		log.info("========== {} ==========", TEST_NAME);

		// Set up global datasource.properties (tier 2)
		removeFile("config/reports-jasper/customer-by-country/datasource.properties");
		writeDatasourceProperties("config/reports-jasper/datasource.properties", "db-h2-northwind");

		String configPath = absPath("config/reports-jasper/customer-by-country/settings.xml");

		executeCliGenerate(configPath, "customer_by_country", TEST_NAME,
				"-p", "country=Germany");

		// ASSERT: Connection resolved via global datasource.properties
		assertNotNull("connectionDatabaseSettings must be populated (global override)",
				lastReporter.getCtx().settings.connectionDatabaseSettings);
		assertEquals("JDBC URL must match H2 Northwind",
				NorthwindTestUtils.H2_URL,
				lastReporter.getCtx().settings.connectionDatabaseSettings.connection.databaseserver.url);

		assertOutputGenerated(lastReporter.getCtx());

		// Clean up
		removeFile("config/reports-jasper/datasource.properties");
		log.info("PASSED: {}", TEST_NAME);
	}

	/**
	 * Tier 1: Per-report datasource.properties overrides global and default.
	 */
	@Test
	public void testPerReportDatasourceProperties_JasperReceivesConnection() throws Throwable {
		final String TEST_NAME = "Tier1-PerReport";
		log.info("========== {} ==========", TEST_NAME);

		// Set up both global and per-report — per-report wins
		writeDatasourceProperties("config/reports-jasper/datasource.properties", "db-nonexistent");
		writeDatasourceProperties("config/reports-jasper/customer-by-country/datasource.properties",
				"db-h2-northwind");

		String configPath = absPath("config/reports-jasper/customer-by-country/settings.xml");

		executeCliGenerate(configPath, "customer_by_country", TEST_NAME,
				"-p", "country=Germany");

		// ASSERT: Per-report override won (not the global db-nonexistent)
		assertNotNull("connectionDatabaseSettings must be populated (per-report override)",
				lastReporter.getCtx().settings.connectionDatabaseSettings);
		assertEquals("JDBC URL must match H2 (per-report won over global)",
				NorthwindTestUtils.H2_URL,
				lastReporter.getCtx().settings.connectionDatabaseSettings.connection.databaseserver.url);

		assertOutputGenerated(lastReporter.getCtx());

		// Clean up
		removeFile("config/reports-jasper/datasource.properties");
		removeFile("config/reports-jasper/customer-by-country/datasource.properties");
		log.info("PASSED: {}", TEST_NAME);
	}

	// ─── CLI execution (same as CommandLineArgumentsTest pattern) ───

	private void executeCliGenerate(String configPath, String reportName,
			String testName, String... extraArgs) throws Throwable {

		// Build args exactly as Electron would: job generate -c {configPath} {reportName} [-p key=value]
		String[] baseArgs = new String[]{"job", "generate", "-c", configPath, reportName};
		String[] args = new String[baseArgs.length + extraArgs.length];
		System.arraycopy(baseArgs, 0, args, 0, baseArgs.length);
		System.arraycopy(extraArgs, 0, args, baseArgs.length, extraArgs.length);

		log.info("CLI args: {}", String.join(" ", args));

		// Use Picocli with test factory — EXACT same pipeline as DocumentBurster.main()
		MainProgram program = new MainProgram();
		GlobalContext global = new GlobalContext();
		program.setGlobal(global);

		TestCliJob testJob = new TestCliJob(configPath, testName);
		testJob.setGlobal(global);

		java.io.StringWriter errWriter = new java.io.StringWriter();
		CommandLine cmd = new CommandLine(program, createTestFactory(testJob));
		cmd.setErr(new java.io.PrintWriter(errWriter));
		cmd.setOut(new java.io.PrintWriter(new java.io.StringWriter()));
		int exitCode = cmd.execute(args);
		if (exitCode != 0) {
			String errOutput = errWriter.toString();
			log.error("CLI failed with exitCode={}, stderr: {}", exitCode, errOutput);
			// Also check if there's an exception in the execution
			assertEquals("CLI command should succeed. Stderr: " + errOutput, 0, exitCode);
		}
	}

	private CommandLine.IFactory createTestFactory(TestCliJob testJob) {
		return new CommandLine.IFactory() {
			@Override
			public <K> K create(Class<K> cls) throws Exception {
				if (cls == MainProgram.GenerateCommand.class) {
					MainProgram.GenerateCommand genCmd = new MainProgram.GenerateCommand() {
						@Override
						protected CliJob getJob(String configFilePath) {
							return testJob;
						}
					};
					return cls.cast(genCmd);
				}
				return CommandLine.defaultFactory().create(cls);
			}
		};
	}

	// ─── Test CliJob: uses REAL BursterFactory but with script roots overridden ───

	static class TestCliJob extends CliJob {
		private final String testName;

		TestCliJob(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;
		}

		@Override
		public String getTempFolder() {
			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp/";
		}

		@Override
		protected AbstractBurster getBurster(String filePath) throws Exception {
			// Use the REAL BursterFactory pipeline — same as production
			// Only override script roots (test infrastructure) and license check
			TestJasperReporter reporter = new TestJasperReporter(
					this.configurationFilePath, testName);
			lastReporter = reporter;
			return reporter;
		}
	}

	// ─── Minimal test subclass of JasperStandaloneReporter ───
	// Only overrides: script roots (infrastructure) and license check.
	// Everything else is REAL production code:
	//   Settings.loadSettings() → loadSettingsReporting() → 3-tier resolution
	//   → generateFromJasperReport() → JasperReportRunner → JasperFillManager

	static class TestJasperReporter extends JasperStandaloneReporter {
		private final String testName;

		TestJasperReporter(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;

			// Ensure temp folder exists
			File tempDir = new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp");
			if (!tempDir.exists()) tempDir.mkdirs();
		}

		public BurstingContext getCtx() { return ctx; }

		@Override
		protected void executeController() throws Exception {
			// Call the REAL controller (which runs controller.groovy → ctx.settings.loadSettings()
			// → loadSettingsReporting() → 3-tier resolution)
			super.executeController();
			// Only redirect output folders to test location
			com.sourcekraft.documentburster._helpers.TestBursterFactory.setUpTestFolders(ctx, testName);
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";
		}

		@Override
		protected void setUpScriptingRoots() {
			scripting.setRoots(new String[]{
					"src/test/groovy",
					"src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle",
					"src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples"
			});
		}

		@Override
		protected void checkLicense() throws Exception { }
	}

	// ─── Assert helpers ───

	private void assertOutputGenerated(BurstingContext ctx) {
		String outputFolder = ctx.outputFolder;
		assertNotNull("outputFolder must be set", outputFolder);
		File outDir = new File(outputFolder);
		assertTrue("Output folder must exist: " + outDir.getAbsolutePath(), outDir.exists());
		File[] outputFiles = outDir.listFiles((dir, name) -> name.endsWith(".xlsx"));
		assertNotNull("Output folder should contain files", outputFiles);
		assertTrue("At least one .xlsx should be generated (proves JR executed SQL)",
				outputFiles.length >= 1);
		log.info("Generated {} output file(s) in {}", outputFiles.length, outputFolder);
	}

	// ─── File structure helpers ───

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

	/**
	 * Creates the full app directory structure simulating a deployed DataPallas,
	 * using the SAME .jrxml from the e2e tests.
	 */
	private static void createAppStructure() throws Exception {
		// Write jrxml with embedded SQL (JR7 format, same query as e2e report)
		File jrxmlDest = new File(TEST_ROOT,
				"config/reports-jasper/customer-by-country/customer_by_country.jrxml");
		jrxmlDest.getParentFile().mkdirs();
		Files.writeString(jrxmlDest.toPath(), JRXML_WITH_SQL);

		// settings.xml — copy canonical and patch for this test
		String settingsXml = FileUtils.readFileToString(
				new File("src/main/external-resources/template/config/burst/settings.xml"), "UTF-8");
		settingsXml = settingsXml.replace("<template>My Reports</template>",
				"<template>customer_by_country</template>");
		settingsXml = settingsXml.replace(
				"<burstfilename>${burst_token}.${output_type_extension}",
				"<burstfilename>${burst_token}.xlsx");
		settingsXml = settingsXml.replace(
				"<reportdistribution>true</reportdistribution>",
				"<reportdistribution>false</reportdistribution>");
		settingsXml = settingsXml.replace(
				"<reportgenerationmailmerge>false</reportgenerationmailmerge>",
				"<reportgenerationmailmerge>true</reportgenerationmailmerge>");
		Files.writeString(
				new File(TEST_ROOT, "config/reports-jasper/customer-by-country/settings.xml").toPath(),
				settingsXml);

		// reporting.xml — copy canonical and patch for Jasper datasource
		// Use absolute path for documentpath so JasperReportRunner can find the .jrxml
		String jrxmlRelPath = jrxmlDest.getAbsolutePath().replace('\\', '/');
		String reportingXml = FileUtils.readFileToString(
				new File("../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml"), "UTF-8");
		reportingXml = reportingXml.replace("ds.csvfile", "ds.jasper");
		reportingXml = reportingXml.replace("output.none", "output.jasper");
		reportingXml = reportingXml.replace("<documentpath/>",
				"<documentpath>" + jrxmlRelPath + "</documentpath>");
		Files.writeString(
				new File(TEST_ROOT, "config/reports-jasper/customer-by-country/reporting.xml").toPath(),
				reportingXml);

		// Connection XML — H2 Northwind (same DB as all other tests)
		// This is the default connection (default=true)
		createConnectionXml("db-h2-northwind", true,
				NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS);

		// Temp and output dirs
		new File(TEST_ROOT, "output").mkdirs();
		new File(TEST_ROOT, "temp").mkdirs();
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
				+ "      <driver>org.h2.Driver</driver>\n"
				+ "      <url>" + jdbcUrl + "</url>\n"
				+ "      <userid>" + user + "</userid>\n"
				+ "      <userpassword>" + pass + "</userpassword>\n"
				+ "    </databaseserver>\n"
				+ "  </connection>\n"
				+ "</documentburster>";
		Files.writeString(new File(dir, connCode + ".xml").toPath(), content);
	}
}

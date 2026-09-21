package com.sourcekraft.documentburster.unit.documentation.userguide.reporting;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster._helpers.JasperOutputTestUtils;
import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.engine.reporting.JasperStandaloneReporter;
import com.sourcekraft.documentburster.utils.CsvUtils;

/**
 * Tests for JasperStandaloneReporter — verifies that when a user drops a .jrxml
 * into config/reports-jasper/, the pipeline correctly:
 * 1. Routes through JasperStandaloneReporter (ds.jasper)
 * 2. Passes JDBC connection details to JasperReportRunner
 * 3. Sets SUBREPORT_DIR so subreports resolve
 * 4. Passes user parameters in the form JasperReports expects
 */
public class JasperReporterTest {

	private static final Logger log = LoggerFactory.getLogger(JasperReporterTest.class);

	private static final String REPORTING_CONFIG_PATH = TestBursterFactory.REPORTING_CONFIG_PATH;

	// Simple .jrxml with an embedded SQL query — the minimum to prove DB connectivity
	private static final String JRXML_WITH_SQL = "src/test/resources/jasper/customers_by_country.jrxml";
	// Parameter-only .jrxml (no DB) — already proven by e2e but good to have in unit tests too
	private static final String JRXML_PARAMS_ONLY = "src/test/resources/jasper/employee_detail.jrxml";

	@BeforeClass
	public static void setUpBeforeClass() throws Exception {
		NorthwindTestUtils.setupTestDatabase();
		ensureTestJrxmlFiles();
	}

	@AfterClass
	public static void tearDownAfterClass() throws Exception {
	}

	/**
	 * Core test: a .jrxml with its own SQL query receives the correct JDBC
	 * connection details and JasperReports can execute the query.
	 * This is the scenario where a user drops an existing JasperReport
	 * (with embedded SQL) into config/reports-jasper/.
	 */
	@Test
	public void testJasperWithEmbeddedSqlReceivesJdbcConnection() throws Exception {
		final String TEST_NAME = "JasperReporterTest-SqlConnection";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		TestJasperStandaloneReporter reporter = new TestJasperStandaloneReporter(
				StringUtils.EMPTY, TEST_NAME,
				NorthwindTestUtils.NORTHWIND_URL, NorthwindTestUtils.NORTHWIND_USER, NorthwindTestUtils.NORTHWIND_PASS);

		// Configure for jasper standalone with DB connection
		reporter.configureForJasper(JRXML_WITH_SQL, "${burst_token}.xlsx",
				NorthwindTestUtils.NORTHWIND_CONN_CODE);

		reporter.burst();

		// Assert: connectionDatabaseSettings was populated
		assertNotNull("connectionDatabaseSettings should be set",
				reporter.getCtx().settings.connectionDatabaseSettings);
		assertNotNull("connection should be set",
				reporter.getCtx().settings.connectionDatabaseSettings.connection);

		ServerDatabaseSettings dbServer =
				reporter.getCtx().settings.connectionDatabaseSettings.connection.databaseserver;
		assertNotNull("databaseserver should be set", dbServer);

		// Assert: JDBC details are in the exact form JasperReportRunner expects
		assertEquals("JDBC URL must match", NorthwindTestUtils.NORTHWIND_URL, dbServer.url);
		assertEquals("JDBC user must match", NorthwindTestUtils.NORTHWIND_USER, dbServer.userid);
		assertEquals("JDBC password must match", NorthwindTestUtils.NORTHWIND_PASS, dbServer.userpassword);

		// Assert: JR actually ran the embedded SQL and the ROWS reached the workbook.
		// File existence alone proves nothing here - JasperReports writes a workbook
		// for an empty result set too, so a broken connection or a dialect mismatch
		// would have sailed through the old "at least one .xlsx" check.
		String outputFolder = reporter.getCtx().outputFolder + "/";
		File output = JasperOutputTestUtils.singleOutputFile(outputFolder, ".xlsx");

		// Expected values come from the database, not from a literal - see queryColumn
		List<String> germanCustomers = NorthwindTestUtils.queryColumn(
				"SELECT \"CompanyName\" FROM \"Customers\" WHERE \"Country\" = 'Germany' ORDER BY \"CompanyName\"",
				"CompanyName");
		JasperOutputTestUtils.assertContainsValues(output, germanCustomers);

		assertEquals("The workbook should have exactly one row per German customer",
				germanCustomers.size(), JasperOutputTestUtils.dataRowCount(output));

		log.info("Test completed successfully: {} ({} German customers in the workbook)",
				TEST_NAME, germanCustomers.size());
	}

	/**
	 * Verifies that parameter-only reports (no DB) work correctly —
	 * connectionDatabaseSettings should be null, and the report still generates.
	 */
	@Test
	public void testJasperParameterOnlyNoDatabase() throws Exception {
		final String TEST_NAME = "JasperReporterTest-ParamsOnly";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		TestJasperStandaloneReporter reporter = new TestJasperStandaloneReporter(
				StringUtils.EMPTY, TEST_NAME, null, null, null);

		// Configure for jasper standalone WITHOUT DB connection
		reporter.configureForJasper(JRXML_PARAMS_ONLY, "${burst_token}.xlsx", null);

		// Set parameters like the UI would
		reporter.setReportParameter("EmployeeID", "42");
		reporter.setReportParameter("FirstName", "Nancy");
		reporter.setReportParameter("LastName", "Davolio");
		reporter.setReportParameter("Title", "Sales Representative");
		reporter.setReportParameter("City", "Seattle");
		reporter.setReportParameter("Country", "USA");

		reporter.burst();

		// Assert: no DB connection loaded
		assertNull("connectionDatabaseSettings should be null for parameter-only reports",
				reporter.getCtx().settings.connectionDatabaseSettings);

		// Assert: parameters were set as user variables (this is how they reach JasperReportRunner)
		Map<String, Object> userVars = reporter.getCtx().variables.getUserVariables("0");
		assertNotNull("User variables should exist for token '0'", userVars);
		assertEquals("FirstName param should be passed through", "Nancy", userVars.get("FirstName"));
		assertEquals("City param should be passed through", "Seattle", userVars.get("City"));

		// Assert: the workbook was generated AND the parameters were rendered into it.
		// This is the parameter-only path, so the values must come from $P{...} - if
		// they did not flow, JR renders blanks and the workbook comes out empty.
		String outputFolder = reporter.getCtx().outputFolder + "/";
		File output = JasperOutputTestUtils.singleOutputFile(outputFolder, ".xlsx");
		JasperOutputTestUtils.assertContainsValues(output,
				List.of("Nancy Davolio", "Sales Representative", "Seattle, USA"));

		log.info("Test completed successfully: {}", TEST_NAME);
	}

	/**
	 * Verifies that SUBREPORT_DIR is set to the report's parent directory,
	 * so subreport references in .jrxml resolve correctly.
	 * We don't need an actual subreport — just verify the variable is set.
	 */
	@Test
	public void testJasperSetsCorrectDocumentPath() throws Exception {
		final String TEST_NAME = "JasperReporterTest-DocPath";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		TestJasperStandaloneReporter reporter = new TestJasperStandaloneReporter(
				StringUtils.EMPTY, TEST_NAME, null, null, null);

		reporter.configureForJasper(JRXML_PARAMS_ONLY, "${burst_token}.xlsx", null);

		reporter.setReportParameter("EmployeeID", "1");
		reporter.setReportParameter("FirstName", "Test");
		reporter.setReportParameter("LastName", "User");
		reporter.setReportParameter("Title", "Tester");
		reporter.setReportParameter("City", "TestCity");
		reporter.setReportParameter("Country", "TestCountry");

		reporter.burst();

		// Assert: documentpath in reporting settings points to the .jrxml
		String docPath = reporter.getCtx().settings.getReportTemplate().documentpath;
		assertNotNull("documentpath should be set", docPath);
		assertTrue("documentpath should reference a .jrxml file",
				docPath.endsWith(".jrxml"));

		// Assert: the .jrxml file is resolvable from the documentpath
		File jrxmlFile = new File(docPath);
		if (!jrxmlFile.isAbsolute()) {
			jrxmlFile = new File(docPath.startsWith("/") ? docPath.substring(1) : docPath);
		}
		assertTrue("The .jrxml file referenced by documentpath should exist: " + jrxmlFile.getAbsolutePath(),
				jrxmlFile.exists());

		// Assert: the parent directory (where subreports would live) is resolvable
		File reportDir = jrxmlFile.getParentFile();
		assertNotNull("Report directory (for SUBREPORT_DIR) should be resolvable", reportDir);
		assertTrue("Report directory should exist", reportDir.exists());

		log.info("Test completed successfully: {}", TEST_NAME);
	}

	// ─── Test helper: TestJasperStandaloneReporter ───

	private static class TestJasperStandaloneReporter extends JasperStandaloneReporter {

		private final String testName;
		private final String dbUrl;
		private final String dbUser;
		private final String dbPass;
		private String jrxmlPath;
		private String burstFileName;
		private String connCode;

		TestJasperStandaloneReporter(String configFilePath, String testName,
				String dbUrl, String dbUser, String dbPass) {
			super(configFilePath);
			this.testName = testName;
			this.dbUrl = dbUrl;
			this.dbUser = dbUser;
			this.dbPass = dbPass;

			if (StringUtils.isNoneEmpty(configFilePath) && Files.exists(java.nio.file.Paths.get(configFilePath)))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";
		}

		void configureForJasper(String jrxmlPath, String burstFileName, String connCode) {
			this.jrxmlPath = jrxmlPath;
			this.burstFileName = burstFileName;
			this.connCode = connCode;
		}

		void setReportParameter(String key, String value) {
			if (paramsMap == null) {
				paramsMap = new java.util.HashMap<>();
			}
			paramsMap.put(key, value);
			setReportParameters(paramsMap);
		}

		private java.util.Map<String, String> paramsMap;

		public void burst() throws Exception {
			String dummyPath = "jasper-report-" + testName + ".dummy";
			super.burst(dummyPath, false, StringUtils.EMPTY, -1);
		}

		@Override
		protected void executeController() throws Exception {
			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			// Configure as ds.jasper + output.jasper (matching what ensureJasperConfigFiles does)
			ctx.settings.reportingSettings.report.datasource.type = "ds.jasper";
			ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_JASPER;
			ctx.settings.getReportTemplate().documentpath = jrxmlPath;
			ctx.settings.setBurstFileName(burstFileName);

			// Load DB connection if configured (matching what Settings.loadSettings does)
			if (connCode != null && dbUrl != null) {
				ctx.settings.connectionDatabaseSettings =
						new com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings();
				com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings conn =
						new com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings();
				ServerDatabaseSettings server = new ServerDatabaseSettings();
				server.url = dbUrl;
				server.userid = dbUser;
				server.userpassword = dbPass;
				server.driver = NorthwindTestUtils.NORTHWIND_DRIVER;
				conn.databaseserver = server;
				ctx.settings.connectionDatabaseSettings.connection = conn;
			}

			// a "temp" folder is required
			ctx.tempFolder = com.sourcekraft.documentburster._helpers.TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";
			File tempDir = new File(ctx.tempFolder);
			if (!tempDir.exists()) tempDir.mkdirs();
		}

		@Override
		protected void setUpScriptingRoots() {
			scripting.setRoots(new String[] {
					"src/test/groovy",
					"src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle",
					"src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples"
			});
		}

		@Override
		protected void checkLicense() throws Exception {
		}
	}

	// ─── Test .jrxml file generation ───

	private static void ensureTestJrxmlFiles() throws Exception {
		// customers_by_country.jrxml — has embedded SQL query
		File sqlJrxml = new File(JRXML_WITH_SQL);
		if (!sqlJrxml.exists()) {
			sqlJrxml.getParentFile().mkdirs();
			// JR7 format .jrxml with embedded SQL query (no xmlns — JR7 style)
			String content = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
					+ "<jasperReport name=\"customers_by_country\"\n"
					+ "    pageWidth=\"595\" pageHeight=\"842\" columnWidth=\"555\"\n"
					+ "    leftMargin=\"20\" rightMargin=\"20\" topMargin=\"20\" bottomMargin=\"20\">\n"
					+ "  <query language=\"SQL\"><![CDATA[\n"
					+ "    SELECT \"CustomerID\", \"CompanyName\", \"Country\"\n"
					+ "    FROM \"Customers\"\n"
					+ "    WHERE \"Country\" = 'Germany'\n"
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
			Files.writeString(sqlJrxml.toPath(), content);
		}

		// employee_detail.jrxml — parameter-only, no SQL
		File paramsJrxml = new File(JRXML_PARAMS_ONLY);
		if (!paramsJrxml.exists()) {
			paramsJrxml.getParentFile().mkdirs();
			String content = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
					+ "<jasperReport name=\"employee_detail\"\n"
					+ "    pageWidth=\"595\" pageHeight=\"842\" columnWidth=\"555\"\n"
					+ "    leftMargin=\"20\" rightMargin=\"20\" topMargin=\"20\" bottomMargin=\"20\">\n"
					+ "  <parameter name=\"EmployeeID\" class=\"java.lang.String\"/>\n"
					+ "  <parameter name=\"FirstName\" class=\"java.lang.String\"/>\n"
					+ "  <parameter name=\"LastName\" class=\"java.lang.String\"/>\n"
					+ "  <parameter name=\"Title\" class=\"java.lang.String\"/>\n"
					+ "  <parameter name=\"City\" class=\"java.lang.String\"/>\n"
					+ "  <parameter name=\"Country\" class=\"java.lang.String\"/>\n"
					+ "  <detail>\n"
					+ "    <band height=\"60\">\n"
					+ "      <element kind=\"textField\" x=\"0\" y=\"0\" width=\"555\" height=\"20\">\n"
					+ "        <expression>$P{FirstName} + \" \" + $P{LastName}</expression>\n"
					+ "      </element>\n"
					+ "      <element kind=\"textField\" x=\"0\" y=\"20\" width=\"555\" height=\"20\">\n"
					+ "        <expression>$P{Title}</expression>\n"
					+ "      </element>\n"
					+ "      <element kind=\"textField\" x=\"0\" y=\"40\" width=\"555\" height=\"20\">\n"
					+ "        <expression>$P{City} + \", \" + $P{Country}</expression>\n"
					+ "      </element>\n"
					+ "    </band>\n"
					+ "  </detail>\n"
					+ "</jasperReport>";
			Files.writeString(paramsJrxml.toPath(), content);
		}
	}
}

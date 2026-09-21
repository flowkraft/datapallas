package com.sourcekraft.documentburster.unit.documentation.userguide.reporting;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.jdbi.v3.core.Jdbi;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.utils.CsvUtils;

/**
 * Tests for the SQL reporter functionality.
 */
public class SqlReporterTest {

	private static final Logger log = LoggerFactory.getLogger(SqlReporterTest.class);

	@BeforeClass
	public static void setUpBeforeClass() throws Exception {

		// Create test templates using the enhanced utility method
		NorthwindTestUtils.ensureReportingTemplates();

		// Set up database
		NorthwindTestUtils.setupTestDatabase();
	}

	@AfterClass
	public static void tearDownAfterClass() throws Exception {
		// Clean up - can be uncommented to preserve test output for inspection
		// File outputFolder = new File(TEST_OUTPUT_PATH);
		// if (outputFolder.exists())
		// FileUtils.deleteDirectory(outputFolder);
	}

	@Before
	public void setUp() throws Exception {
	}

	@After
	public void tearDown() throws Exception {
	}

	/**
	 * Tests basic SQL reporting against the Northwind DuckDB fixture.
	 */
	@Test
	public void testBasicSqlReporting() throws Exception {
		final String TEST_NAME = "SqlReporterTest-Basic";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Create reporter
		TestBursterFactory.SqlReporter reporter = new TestBursterFactory.SqlReporter(StringUtils.EMPTY, TEST_NAME,
				NorthwindTestUtils.NORTHWIND_URL, NorthwindTestUtils.NORTHWIND_USER, NorthwindTestUtils.NORTHWIND_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure SQL
				ctx.settings.getReportDataSource().sqloptions.conncode = NorthwindTestUtils.NORTHWIND_CONN_CODE;
				ctx.settings.getReportDataSource().sqloptions.idcolumn = "CustomerID";
				ctx.settings
						.getReportDataSource().sqloptions.query = "SELECT \"CustomerID\", \"CompanyName\", \"Country\" FROM \"Customers\" WHERE \"Country\" = 'Germany'";

				// Configure output
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_DOCX;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.CUSTOMER_SUMMARY_TEMPLATE_DOCX;
				ctx.settings.setBurstFileName("${burst_token}.docx");
			}
		};

		// Execute the burst process
		reporter.burst();

		// Verify results
		List<String[]> parsedLines = TestsUtils.toArrayRows(reporter.getCtx().reportData);

		assertNotNull("Parsed lines should not be null", parsedLines);
		assertFalse("Parsed lines should not be empty", parsedLines.isEmpty());

		// Check that reportColumnNames contains expected headers
		assertNotNull("Column names should not be null", reporter.getCtx().reportColumnNames);
		assertTrue("Should have at least 3 columns", reporter.getCtx().reportColumnNames.size() >= 3);
		assertEquals("CustomerID", reporter.getCtx().reportColumnNames.get(0));
		assertEquals("CompanyName", reporter.getCtx().reportColumnNames.get(1));
		assertEquals("Country", reporter.getCtx().reportColumnNames.get(2));

		// Verify a specific German customer
		boolean foundAlfreds = false;
		for (int i = 0; i < parsedLines.size(); i++) {
			String[] row = parsedLines.get(i);
			if ("ALFKI".equals(row[0])) {
				foundAlfreds = true;
				assertEquals("Alfreds Futterkiste", row[1]);
				assertEquals("Germany", row[2]);
				break;
			}
		}
		assertTrue("ALFKI customer should be found in results", foundAlfreds);

		// Verify document generation
		assertTrue("ALFKI document should exist", new File(reporter.getCtx().outputFolder + "/ALFKI.docx").exists());

		// Verify row count and tokens
		assertEquals("Unexpected number of rows", 11, parsedLines.size());
		assertEquals("Unexpected number of tokens", 11, reporter.getCtx().burstTokens.size());
		// Verify variable parsing for ALFKI
		Map<String, Object> userVars = reporter.getCtx().variables.getUserVariables("ALFKI");
		assertEquals("var0 should match", "ALFKI", userVars.get("var0"));
		assertEquals("col0 should match", "ALFKI", userVars.get("col0"));
		assertEquals("col1 should match", "Alfreds Futterkiste", userVars.get("col1"));
		assertEquals("col2 should match", "Germany", userVars.get("col2"));
		// Verify named variables (column-name case is driver-dependent; DuckDB
		// returns them spelled as the query wrote them)
		assertEquals("CustomerID should match", "ALFKI", userVars.get("CustomerID"));
		assertEquals("CompanyName should match", "Alfreds Futterkiste", userVars.get("CompanyName"));
		assertEquals("Country should match", "Germany", userVars.get("Country"));

		log.info("Test completed successfully: {}", TEST_NAME);
	}

	@Test
	public void testSqlReportingWithJava8StreamTransformation() throws Exception {
		NorthwindTestUtils.runDataTransformationTest("java8stream");
	}

	@Test
	public void testSqlReportingWithCalciteTransformation() throws Exception {
		NorthwindTestUtils.runDataTransformationTest("calcite");
	}

	@Test
	public void testSqlReportingWithDflibTransformation() throws Exception {
		NorthwindTestUtils.runDataTransformationTest("dflib");
	}

	@Test
	public void testCustomerStatementReport() throws Exception {
		final String TEST_NAME = "SqlReporterTest-CustomerStatement";
		TestBursterFactory.SqlReporter reporter = new TestBursterFactory.SqlReporter(StringUtils.EMPTY, TEST_NAME,
				NorthwindTestUtils.NORTHWIND_URL, NorthwindTestUtils.NORTHWIND_USER, NorthwindTestUtils.NORTHWIND_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();
				// Configure SQL for single-customer statement
				ctx.settings.getReportDataSource().sqloptions.conncode = NorthwindTestUtils.NORTHWIND_CONN_CODE;
				ctx.settings.getReportDataSource().sqloptions.idcolumn = "CustomerID";
				ctx.settings
						.getReportDataSource().sqloptions.query = "SELECT c.CustomerID AS CustomerID, c.CompanyName AS CompanyName,"
								+ " COUNT(o.OrderID) AS TotalOrders," + " SUM(o.Freight) AS TotalFreight,"
								+ " SUM(CASE WHEN o.ShippedDate IS NULL THEN o.Freight ELSE 0 END) AS OutstandingBalance"
								+ " FROM Customers c" + " LEFT JOIN Orders o ON c.CustomerID=o.CustomerID"
								+ " WHERE c.CustomerID='ALFKI'" + " GROUP BY c.CustomerID, c.CompanyName";

				// ctx.scripts.transformFetchedData =
				// "transformFetchedData_removeheader.groovy";

				// Use statement HTML template
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.CUSTOMER_STATEMENT_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("${burst_token}.html");
			}
		};
		// Execute report
		reporter.burst();
		// Verify parsed data
		List<String[]> parsed = TestsUtils.toArrayRows(reporter.getCtx().reportData);
		assertEquals(1, parsed.size());
		// String[] header = parsed.get(0);
		// assertArrayEquals(
		// new String[] { "CustomerID", "CompanyName", "TotalOrders", "TotalFreight",
		// "OutstandingBalance" },
		// header);
		String[] row = parsed.get(0);
		assertEquals("ALFKI", row[0]);
		assertEquals("Alfreds Futterkiste", row[1]);
		assertTrue(Integer.parseInt(row[2]) > 0);
		assertTrue(Double.parseDouble(row[3]) >= 0.0);
		assertTrue(Double.parseDouble(row[4]) >= 0.0);
		// Verify HTML output file
		assertTrue(new File(reporter.getCtx().outputFolder + "/ALFKI.html").exists());
	}

	/**
	 * Tests DuckDB with direct CSV file query.
	 * This provides basic confidence that DuckDB works for document generation flows.
	 */
	@Test
	public void testDuckDBQueryOverCSV() throws Exception {
		final String TEST_NAME = "SqlReporterTest-DuckDB-CSV";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Use in-memory DuckDB (no file created)
		final String DUCKDB_URL = "jdbc:duckdb:";
		final String DUCKDB_USER = "";
		final String DUCKDB_PASS = "";
		final String DUCKDB_CONN_CODE = "DUCKDB_TEST_CONN";

		TestBursterFactory.SqlReporter reporter = new TestBursterFactory.SqlReporter(StringUtils.EMPTY, TEST_NAME,
				DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure SQL to query CSV file directly (DuckDB feature)
				ctx.settings.getReportDataSource().sqloptions.conncode = DUCKDB_CONN_CODE;
				ctx.settings.getReportDataSource().sqloptions.idcolumn = "employee_id";

				// DuckDB can query CSV files directly without loading them
				String csvPath = new File("src/test/resources/input/unit/other/employees.csv").getAbsolutePath();
				ctx.settings.getReportDataSource().sqloptions.query =
					"SELECT employee_id, email_address, first_name, last_name FROM read_csv_auto('" + csvPath + "') WHERE employee_id IN (1, 2)";

				// Configure output
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_DOCX;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.CUSTOMER_SUMMARY_TEMPLATE_DOCX;
				ctx.settings.setBurstFileName("${burst_token}.docx");
			}

			@Override
			protected Jdbi retrieveJdbiInstance(String connectionCode) throws Exception {
				// For DuckDB test connection, create a Jdbi instance directly
				if (connectionCode.equals(DUCKDB_CONN_CODE)) {
					return Jdbi.create(DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS);
				}
				return super.retrieveJdbiInstance(connectionCode);
			}
		};

		// Execute the burst process
		reporter.burst();

		// Verify results
		List<String[]> parsedLines = TestsUtils.toArrayRows(reporter.getCtx().reportData);

		assertNotNull("Parsed lines should not be null", parsedLines);
		assertEquals("Should have 2 employee records", 2, parsedLines.size());

		// Check column names
		assertNotNull("Column names should not be null", reporter.getCtx().reportColumnNames);
		assertEquals(4, reporter.getCtx().reportColumnNames.size());

		// Verify first employee
		String[] row1 = parsedLines.get(0);
		assertEquals("1", row1[0]); // employee_id
		assertEquals("email1@address1.com", row1[1]); // email_address
		assertEquals("firstName1", row1[2]); // first_name
		assertEquals("lastName1", row1[3]); // last_name

		// Verify document generation
		assertTrue("Document for employee 1 should exist", new File(reporter.getCtx().outputFolder + "/1.docx").exists());
		assertTrue("Document for employee 2 should exist", new File(reporter.getCtx().outputFolder + "/2.docx").exists());

		log.info("Test completed successfully: {}", TEST_NAME);
	}

	/**
	 * Tests the SQL reporter over a plain in-memory DuckDB connection, i.e. a
	 * database other than the file-backed Northwind fixture the rest of this
	 * class uses.
	 */
	@Test
	public void testDuckDBQueryOverJDBC() throws Exception {
		final String TEST_NAME = "SqlReporterTest-DuckDB-JDBC";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Use in-memory DuckDB
		final String DUCKDB_URL = "jdbc:duckdb:";
		final String DUCKDB_USER = "";
		final String DUCKDB_PASS = "";
		final String DUCKDB_CONN_CODE = "DUCKDB_JDBC_TEST_CONN";

		TestBursterFactory.SqlReporter reporter = new TestBursterFactory.SqlReporter(StringUtils.EMPTY, TEST_NAME,
				DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure SQL
				ctx.settings.getReportDataSource().sqloptions.conncode = DUCKDB_CONN_CODE;
				ctx.settings.getReportDataSource().sqloptions.idcolumn = "CustomerID";

				// Literal rows, deliberately: what is under test is the connection
				// and the reporter, not any particular catalog. Reaching a real
				// external database would be ATTACH or postgres_scanner.
				ctx.settings.getReportDataSource().sqloptions.query =
					"SELECT 'DUCK1' AS CustomerID, 'DuckDB Customer 1' AS CompanyName, 'Germany' AS Country " +
					"UNION ALL " +
					"SELECT 'DUCK2' AS CustomerID, 'DuckDB Customer 2' AS CompanyName, 'Mexico' AS Country";

				// Configure output
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_DOCX;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.CUSTOMER_SUMMARY_TEMPLATE_DOCX;
				ctx.settings.setBurstFileName("${burst_token}.docx");
			}

			@Override
			protected Jdbi retrieveJdbiInstance(String connectionCode) throws Exception {
				// For DuckDB test connection, create a Jdbi instance directly
				if (connectionCode.equals(DUCKDB_CONN_CODE)) {
					return Jdbi.create(DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS);
				}
				return super.retrieveJdbiInstance(connectionCode);
			}
		};

		// Execute the burst process
		reporter.burst();

		// Verify results
		List<String[]> parsedLines = TestsUtils.toArrayRows(reporter.getCtx().reportData);

		assertNotNull("Parsed lines should not be null", parsedLines);
		assertEquals("Should have 2 customer records", 2, parsedLines.size());

		// Verify first customer
		String[] row1 = parsedLines.get(0);
		assertEquals("DUCK1", row1[0]);
		assertEquals("DuckDB Customer 1", row1[1]);
		assertEquals("Germany", row1[2]);

		// Verify document generation
		assertTrue("DUCK1 document should exist", new File(reporter.getCtx().outputFolder + "/DUCK1.docx").exists());
		assertTrue("DUCK2 document should exist", new File(reporter.getCtx().outputFolder + "/DUCK2.docx").exists());

		log.info("Test completed successfully: {}", TEST_NAME);
	}

}
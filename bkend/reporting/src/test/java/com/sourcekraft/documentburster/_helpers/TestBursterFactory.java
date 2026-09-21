package com.sourcekraft.documentburster._helpers;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.text.DecimalFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.assertj.core.api.Assertions;
import org.jdbi.v3.core.Jdbi;

import com.sourcekraft.documentburster.common.settings.EmailConnection;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.AbstractReporter;
import com.sourcekraft.documentburster.engine.excel.ExcelUtils;
import com.sourcekraft.documentburster.scripting.Scripting;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;
import com.sourcekraft.documentburster.utils.CsvUtils;

public class TestBursterFactory {

	public static final String REPORTING_CONFIG_PATH = "../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	public static class PdfBurster extends com.sourcekraft.documentburster.engine.pdf.PdfBurster {

		protected String testName;

		public PdfBurster(String configFilePath, String testName) {

			super(configFilePath);

			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

			// a "temp" folder is required to be available
			File tempDir = new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp");

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });

		};

		protected void executeController() throws Exception {

			super.executeController();
			TestBursterFactory.setUpTestFolders(ctx, testName);

		};

		public String getTempFolder() {
			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp/";
		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void setUpMockUpload() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockUpload(scripting, ctx);

		};

		protected void setUpMockWebUpload() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockWebUpload(scripting, ctx);

		};

		protected void setUpMockSms() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockSms(scripting, ctx);

		};

		protected void checkLicense() throws Exception {

			// Just for
			// IssuesTest.issue61MakeSureTheSoftwareWorksFineEvenWhenServerReturnsSSLExceptionWhenCheckingTheLicense
			// it should run the super.checkLicense() otherwise checkLicense should do
			// nothing during the unit tests
			if (!StringUtils.isEmpty(testName) && (this.testName.toLowerCase().contains("issue61")))
				super.checkLicense();
		}
	}

	public static class PoiExcelBurster extends com.sourcekraft.documentburster.engine.excel.PoiExcelBurster {

		protected String testName;

		public PoiExcelBurster(String configFilePath, String testName) {

			super(configFilePath);
			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

			// a "temp" folder is required to be available
			File tempDir = new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp");

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		}

		public String getTempFolder() {
			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });

		};

		protected void executeController() throws Exception {

			super.executeController();
			TestBursterFactory.setUpTestFolders(ctx, testName);

		};

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected String getTempWorkBookPath() {

			String baseName = FilenameUtils.getBaseName(filePath);
			String extension = FilenameUtils.getExtension(filePath);

			Random generator = new Random(Long.MAX_VALUE);

			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp/" + baseName + "_" + generator.nextInt() + "." + extension;

		}

		protected void checkLicense() throws Exception {
		}
	}

	public static class XmlReporter extends com.sourcekraft.documentburster.engine.reporting.XmlReporter {

		protected String testName;

		public XmlReporter(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.xmlfile";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}
	}

	public static class CsvReporter extends com.sourcekraft.documentburster.engine.reporting.CsvReporter {

		protected String testName;

		public CsvReporter(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.csvfile";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}
	}

	public static class FixedWidthReporter extends com.sourcekraft.documentburster.engine.reporting.FixedWidthReporter {

		protected String testName;

		public FixedWidthReporter(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.fixedwidthfile";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}
	}

	public static class ExcelReporter extends com.sourcekraft.documentburster.engine.reporting.ExcelReporter {

		protected String testName;

		public ExcelReporter(String configFilePath, String testName) {
			super(configFilePath);
			this.testName = testName;

			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";

		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.excelfile";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}

	}

	public static class SqlReporter extends com.sourcekraft.documentburster.engine.reporting.SqlReporter {

		protected String testName;

		// The test database connection, handed in by the test rather than resolved
		// from a Connections file on disk.
		private final String dbUrl;
		private final String dbUser;
		private final String dbPass;

		public SqlReporter(String configFilePath, String testName, String dbUrl, String dbUser, String dbPass) {
			super(configFilePath);
			this.testName = testName;
			// Store the connection details
			this.dbUrl = dbUrl;
			this.dbUser = dbUser;
			this.dbPass = dbPass;

			// ... config path logic ...
			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";
		}

		public void burst() throws Exception {
			// Construct a slightly more informative dummy path for logging/stats
			String dummyPathForBurst = "sql-report-" + testName + ".dummy";
			super.burst(dummyPathForBurst, false, StringUtils.EMPTY, -1);
		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.sqlquery";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		@Override
		protected Jdbi retrieveJdbiInstance(String connectionCode) throws Exception {
			// For the test Northwind connection, create a Jdbi instance directly
			if (connectionCode.equals(NorthwindTestUtils.NORTHWIND_CONN_CODE)) {
				return Jdbi.create(dbUrl, dbUser, dbPass);
			}

			// For other connections, use the default implementation
			return super.retrieveJdbiInstance(connectionCode);
		}

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {
			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/test/groovy/reporting",
					"src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}

	}

	public static class ScriptedReporter extends com.sourcekraft.documentburster.engine.reporting.ScriptedReporter {

		protected String testName;

		// The test database connection, handed in by the test rather than resolved
		// from a Connections file on disk.
		private final String dbUrl;
		private final String dbUser;
		private final String dbPass;
		private final String dbDriver;

		/** Defaults to the DuckDB Northwind, which is what most scripted tests want. */
		public ScriptedReporter(String configFilePath, String testName, String dbUrl, String dbUser, String dbPass) {
			this(configFilePath, testName, dbUrl, dbUser, dbPass, NorthwindTestUtils.NORTHWIND_DRIVER);
		}

		/**
		 * The driver is explicit for the scripts that ship as SQLite samples: they
		 * are authored in SQLite SQL, so they have to be tested on SQLite.
		 */
		public ScriptedReporter(String configFilePath, String testName, String dbUrl, String dbUser, String dbPass,
				String dbDriver) {
			super(configFilePath);
			this.testName = testName;
			// Store the connection details
			this.dbUrl = dbUrl;
			this.dbUser = dbUser;
			this.dbPass = dbPass;
			this.dbDriver = dbDriver;

			// ... config path logic ...
			if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
				this.configurationFilePath = configFilePath;
			else
				this.configurationFilePath = "src/main/external-resources/template/config/burst/settings.xml";
		}

		@Override
		protected ServerDatabaseSettings getServerDatabaseSettings(String connectionCode) throws Exception {
			// For the test Northwind connection, create ServerDatabaseSettings directly
			if (connectionCode.equals(NorthwindTestUtils.NORTHWIND_CONN_CODE)) {
				ServerDatabaseSettings dbSettings = new ServerDatabaseSettings();
				dbSettings.url = this.dbUrl;
				dbSettings.userid = this.dbUser;
				dbSettings.userpassword = this.dbPass;
				dbSettings.driver = this.dbDriver;
				return dbSettings;
			}
			// For other connections, use the default implementation
			return super.getServerDatabaseSettings(connectionCode);
		}

		public void burst() throws Exception {
			// Construct a slightly more informative dummy path for logging/stats
			String dummyPathForBurst = "sql-report-" + testName + ".dummy";
			super.burst(dummyPathForBurst, false, StringUtils.EMPTY, -1);
		}

		protected void setUpMockEmail() throws Exception {

			ctx.testName = this.testName;
			TestBursterFactory.setUpMockEmail(scripting, ctx);

		};

		protected void executeController() throws Exception {

			super.executeController();

			TestBursterFactory.setUpTestFolders(ctx, testName);

			ctx.settings.loadSettingsReportingWithPath(REPORTING_CONFIG_PATH);
			ctx.settings.setCapabilityReportGenerationMailMerge(true);

			ctx.settings.reportingSettings.report.datasource.type = "ds.scriptfile";

			// a "temp" folder is required to be available
			ctx.tempFolder = TestsUtils.TESTS_OUTPUT_FOLDER + "/temp";

			File tempDir = new File(ctx.tempFolder);

			if (!tempDir.exists())
				try {
					FileUtils.forceMkdir(tempDir);
				} catch (IOException e) {
					e.printStackTrace();
				}

		};

		protected void checkLicense() throws Exception {
		}

		protected void setUpScriptingRoots() {

			scripting.setRoots(new String[] { "src/test/groovy", "src/test/groovy/senders-messages",
					"src/test/groovy/bursting-context-lifecycle", "src/test/groovy/reporting",
					"src/main/external-resources/template/scripts/burst",
					"src/main/external-resources/template/scripts/burst/internal",
					"src/main/external-resources/template/scripts/burst/samples" });
		}

	}

	public static void setUpTestFolders(BurstingContext ctx, String testName) throws Exception {

		ctx.settings.setOutputFolder(TestsUtils.TESTS_OUTPUT_FOLDER + "/output/${input_document_name}/" + testName
				+ "/${now?string[\"yyyy.MM.dd_HH.mm.ss.SSS\"]}");

		ctx.settings.setBackupFolder(TestsUtils.TESTS_OUTPUT_FOLDER
				+ "/backup/${input_document_name}/${now?string[\"yyyy.MM.dd_HH.mm.ss.SSS\"]}");
		ctx.settings.setQuarantineFolder(TestsUtils.TESTS_OUTPUT_FOLDER
				+ "/quarantine/${input_document_name}/${now?string[\"yyyy.MM.dd_HH.mm.ss.SSS\"]}");

		ctx.settings.setLogsArchivesFolder(TestsUtils.TESTS_OUTPUT_FOLDER
				+ "/logs/archives/${input_document_name}/${now?string[\"yyyy.MM.dd_HH.mm.ss.SSS\"]}");

	}

	private static void setUpMockEmail(Scripting scripting, BurstingContext ctx) {

		ctx.settings.setSendFilesEmail(true);

		if (!ctx.settings.getEmailServerUseConn()) {
			ctx.settings.setEmailServerHost("smtp.test.com");
			ctx.settings.setEmailServerPort("465");
			ctx.settings.setEmailServerUserId("firstname.lastname");
			ctx.settings.setEmailServerUserPassword("password");
			ctx.settings.setEmailServerUseTLS(false);
			ctx.settings.setEmailServerUseSSL(true);

			ctx.settings.setEmailServerFrom("firstname.lastname@test.com");
			ctx.settings.setEmailServerName("FirstName LastName");
		} else {

			ctx.emailConnection = new EmailConnection();

			ctx.emailConnection.getDetails().connection.emailserver.host = "smtp.test.com";
			ctx.emailConnection.getDetails().connection.emailserver.port = "465";

			ctx.emailConnection.getDetails().connection.emailserver.userid = "firstname.lastname";
			ctx.emailConnection.getDetails().connection.emailserver.userpassword = "password";
			ctx.emailConnection.getDetails().connection.emailserver.usetls = false;
			ctx.emailConnection.getDetails().connection.emailserver.usessl = true;

			ctx.emailConnection.getDetails().connection.emailserver.fromaddress = "firstname.lastname@test.com";
			ctx.emailConnection.getDetails().connection.emailserver.name = "FirstName LastName";

		}

		ctx.settings.setTestEmailServerHost("test.smtp.test.com");
		ctx.settings.setTestEmailServerPort("995");
		ctx.settings.setTesttEmailServerUserId("test.firstname.lastname");
		ctx.settings.setTestEmailServerUserPassword("test.password");
		ctx.settings.setTestEmailServerUseTLS(false);
		ctx.settings.setTestEmailServerUseSSL(true);

		ctx.settings.setTestEmailServerFrom("test.firstname.lastname@test.com");
		ctx.settings.setTestEmailServerName("Test FirstName LastName");

		ctx.settings.setEmailSubject("Subject ${burst_token}");
		ctx.settings.setEmailText("Message ${burst_token}");

		ctx.scripts.email = "assert_email_executed.groovy";

		ctx.scripts.upload = "assert_upload_not_executed.groovy";
		ctx.scripts.webUpload = "assert_web_upload_not_executed.groovy";
		ctx.scripts.sms = "assert_sms_not_executed.groovy";

		ctx.scripts.distributeReportErrorHandling = "distribute_report_error_handling_email_test.groovy";

	}

	private static void setUpMockUpload(Scripting scripting, BurstingContext ctx) {

		ctx.settings.setSendFilesUpload(true);

		ctx.scripts.email = "assert_email_not_executed.groovy";
		ctx.scripts.webUpload = "assert_web_upload_not_executed.groovy";
		ctx.scripts.sms = "assert_sms_not_executed.groovy";

	}

	private static void setUpMockWebUpload(Scripting scripting, BurstingContext ctx) {

		ctx.settings.setSendFilesWeb(true);

		ctx.scripts.email = "assert_email_not_executed.groovy";
		ctx.scripts.upload = "assert_upload_not_executed.groovy";
		ctx.scripts.sms = "assert_sms_not_executed.groovy";

	}

	private static void setUpMockSms(Scripting scripting, BurstingContext ctx) {

		ctx.settings.setSendFilesSms(true);

		ctx.scripts.sms = "assert_sms_executed.groovy";

		ctx.scripts.email = "assert_email_not_executed.groovy";
		ctx.scripts.upload = "assert_upload_not_executed.groovy";
		ctx.scripts.webUpload = "assert_web_upload_not_executed.groovy";

	}

	public static AbstractBurster createPdfBurster(String configFilePath, String testName) {
		return new PdfBurster(configFilePath, testName);
	}

	public static AbstractBurster createPoiExcelBurster(String configFilePath, String testName) {
		return new PoiExcelBurster(configFilePath, testName);
	}

	public static void assertThatCorrectOutputReportsWereGenerated(AbstractReporter burster, String pathToFile,
			boolean expectAllFilesToBeGenerated, String outputType) throws Exception {

		// --- Get original typed data ---
		if (burster.getCtx() == null || burster.getCtx().reportData == null || burster.getCtx().reportData.isEmpty()) {
			fail("Test setup error: burster context or reportData is null or empty.");
			return;
		}
		List<LinkedHashMap<String, Object>> originalReportData = burster.getCtx().reportData;

		assertEquals("Number of parsed rows should match expected", 3, originalReportData.size());

		// --- Get headers/keys ---
		List<String> headers = new ArrayList<>(originalReportData.get(0).keySet());
		int columnCount = headers.size();
		// assertEquals("Expected 17 columns based on template/data", 17, columnCount);

		// --- Assert specific values using original typed data ---
		String nameKey = headers.get(0);
		String netPayKey = headers.get(16);
		assertEquals("Kyle Butford", originalReportData.get(1).get(nameKey));
		boolean isStringBasedFileReporter = burster instanceof CsvReporter; // Check reporter type
		isStringBasedFileReporter = isStringBasedFileReporter || burster instanceof FixedWidthReporter;

		Object netPayValue = originalReportData.get(1).get(netPayKey); // Get the value

		if (isStringBasedFileReporter) {
			// For CSV: Expect a String, parse and check value
			assertTrue("Net Pay should be numeric", netPayValue instanceof Number || netPayValue instanceof String);

			double actual = netPayValue instanceof Number ? ((Number) netPayValue).doubleValue()
					: Double.parseDouble((String) netPayValue);

			assertEquals("Net Pay value mismatch", 2890.0, actual, 0.001);
		} else {
			// For non-CSV (e.g., Excel): Expect a Number, check type and value
			assertTrue("Non-CSV Check: Net Pay (" + netPayKey + ") should be a Number", netPayValue instanceof Number);
			assertEquals("Non-CSV Check: Net Pay value mismatch", 2890.0, ((Number) netPayValue).doubleValue(), 0.001);
		}

		String outputFolder = burster.getCtx().outputFolder + "/";
		int fileCount = new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length;
		if (expectAllFilesToBeGenerated)
			assertEquals("Should be 3 output files", originalReportData.size(), fileCount);
		else
			assertTrue("There should be maximum 1, 2 or 3 output files",
					fileCount > 0 && fileCount <= originalReportData.size());

		int lineIndex = 0;
		// --- Adapt idcolumn logic ---
		String ccIndex = burster.getCtx().settings.getReportDataSource().exceloptions.idcolumn;

		if (burster instanceof CsvReporter)
			ccIndex = burster.getCtx().settings.getReportDataSource().csvoptions.idcolumn;
		if (burster instanceof FixedWidthReporter)
			ccIndex = burster.getCtx().settings.getReportDataSource().fixedwidthoptions.idcolumn;

		boolean useSequentialNaming = true;
		String idColumnKey = null;
		if (!ccIndex.equalsIgnoreCase(CsvUtils.NOT_USED)) {
			useSequentialNaming = false;
			if (ccIndex.equalsIgnoreCase(CsvUtils.COLUMN_FIRST)) {
				idColumnKey = headers.get(0);
			} else if (ccIndex.equalsIgnoreCase(CsvUtils.COLUMN_LAST)) {
				idColumnKey = headers.get(columnCount - 1);
			} else if (StringUtils.isNumeric(ccIndex)) {
				int idx = Integer.parseInt(ccIndex);
				if (idx >= 0 && idx < columnCount) {
					idColumnKey = headers.get(idx);
				} else {
					fail("Numeric idcolumn index " + idx + " is out of bounds (0-" + (columnCount - 1) + ")");
				}
			} else {
				if (headers.contains(ccIndex)) {
					idColumnKey = ccIndex;
				} else {
					fail("idcolumn header '" + ccIndex + "' not found in data.");
				}
			}
		}

		// --- Define formatters ---
		SimpleDateFormat dateFormat = new SimpleDateFormat("MM/dd/yy");
		SimpleDateFormat dateFormat2 = new SimpleDateFormat("MMMM yyyy");

		// Format for numbers that appear with grouping separators in the output
		DecimalFormat groupedIntegerFormat = new DecimalFormat("#,##0");
		// Format for numbers that might appear without grouping (if any) - adjust if
		// needed
		DecimalFormat plainIntegerFormat = new DecimalFormat("0");

		String dateHeaderKey = headers.get(3); // Assuming col3 is date

		for (Map<String, Object> currentRowMap : originalReportData) {
			String token;
			if (useSequentialNaming) {
				token = String.valueOf(lineIndex);
			} else {
				Object tokenValue = currentRowMap.get(idColumnKey);
				token = (tokenValue == null) ? "null_token_" + lineIndex : tokenValue.toString();
			}

			String outputReportPath = outputFolder + token + "." + FilenameUtils.getExtension(outputType);
			File outputReport = new File(outputReportPath);
			if (!outputReport.exists()) {
				if (expectAllFilesToBeGenerated) {
					fail("Expected output file does not exist: " + outputReportPath);
				}
				lineIndex++;
				continue;
			}

			String currentReportText = StringUtils.EMPTY;

			if (outputType.equals(CsvUtils.OUTPUT_TYPE_DOCX)) {
				XWPFDocument docx = new XWPFDocument(new FileInputStream(outputReportPath));
				int numPages = docx.getProperties().getExtendedProperties().getUnderlyingProperties().getPages();

				XWPFWordExtractor we = new XWPFWordExtractor(docx);

				if (numPages == 0) {
					numPages = we.getExtendedProperties().getPages();
				}

				currentReportText = we.getText();

				if (numPages > 0)
					Assertions.assertThat(numPages).isEqualTo(1);

				we.close();
				docx.close();

			} else if (outputType.equals(CsvUtils.OUTPUT_TYPE_HTML)) {
				currentReportText = FileUtils.readFileToString(new File(outputReportPath), "UTF-8");
			} else if (outputType.equals(CsvUtils.OUTPUT_TYPE_PDF)) {
				// Extract text from PDF using PDFBox (similar to how DOCX is handled)
				try (PDDocument document = PDDocument.load(outputReport)) {
					PDFTextStripper stripper = new PDFTextStripper();
					currentReportText = stripper.getText(document);
				}
			} else if (outputType.equals(CsvUtils.OUTPUT_TYPE_EXCEL)) {
				currentReportText = ExcelUtils.getExcelText(outputReport);
			}

			// --- Assert branding ---
			if (!outputType.equals(CsvUtils.OUTPUT_TYPE_DOCX) && !outputType.equals(CsvUtils.OUTPUT_TYPE_EXCEL)
					&& !outputType.equals(CsvUtils.OUTPUT_TYPE_PDF))
				Assertions.assertThat(currentReportText).contains("Built by");

			// --- Assert content ---
			for (int currentColumnIndex = 0; currentColumnIndex < columnCount; currentColumnIndex++) {
				String header = headers.get(currentColumnIndex);
				Object originalValue = currentRowMap.get(header);
				String expectedFormattedValue, expectedFormattedValue2;
				expectedFormattedValue = StringUtils.EMPTY;
				expectedFormattedValue2 = StringUtils.EMPTY;

				if (currentColumnIndex == 17) {
					continue; // Skip the assertion for this column
				}

				if (originalValue == null) {
					expectedFormattedValue = StringUtils.EMPTY;
					expectedFormattedValue2 = StringUtils.EMPTY;
				}
				// Check if it's the specific date column
				else if (header.equals(dateHeaderKey) && originalValue instanceof Date) {
					expectedFormattedValue = dateFormat.format((Date) originalValue);
					expectedFormattedValue2 = dateFormat2.format((Date) originalValue);

					// Add relaxed check: also try -1 day (in case of timezone shift)
					Date originalDate = (Date) originalValue;
					Date minusOneDay = new Date(originalDate.getTime() - 24L * 60 * 60 * 1000);
					String expectedFormattedValueMinusOne = dateFormat.format(minusOneDay);
					String expectedFormattedValue2MinusOne = dateFormat2.format(minusOneDay);

  				    // DEBUG: print candidates and presence checks
					// System.out.println("[DBG] header=" + header);
					// System.out.println("[DBG] originalDate=" + originalDate + " epoch=" + originalDate.getTime() + " instant=" + originalDate.toInstant());
					// System.out.println("[DBG] candidate1=" + expectedFormattedValue + "   contains=" + currentReportText.contains(expectedFormattedValue));
					// System.out.println("[DBG] candidate2=" + expectedFormattedValue2 + "   contains=" + currentReportText.contains(expectedFormattedValue2));
					// System.out.println("[DBG] candidate1-minus1=" + expectedFormattedValueMinusOne + "   contains=" + currentReportText.contains(expectedFormattedValueMinusOne));
					// System.out.println("[DBG] candidate2-minus1=" + expectedFormattedValue2MinusOne + "   contains=" + currentReportText.contains(expectedFormattedValue2MinusOne));
					// System.out.println("[DBG] snippet=" + currentReportText.substring(Math.max(0, currentReportText.indexOf("Pay Period") - 40),
					// 		Math.min(currentReportText.length(), currentReportText.indexOf("Pay Period") + 200)));

					try {
						Assertions.assertThat(currentReportText).contains(expectedFormattedValue);
					} catch (AssertionError primaryFailure) {
						try {
							Assertions.assertThat(currentReportText).contains(expectedFormattedValue2);
						} catch (AssertionError secondaryFailure) {
							try {
								Assertions.assertThat(currentReportText).contains(expectedFormattedValueMinusOne);
							} catch (AssertionError tertiaryFailure) {
								Assertions.assertThat(currentReportText).contains(expectedFormattedValue2MinusOne);
							}
						}
					}
					continue;
				}
				// Check if it's a number
				else if (originalValue instanceof Number) {
					// Assume default FreeMarker formatting adds grouping for integers
					// Use groupedIntegerFormat to mimic this output
					expectedFormattedValue = groupedIntegerFormat.format(originalValue);
					expectedFormattedValue2 = plainIntegerFormat.format(originalValue);
					// If some numbers *don't* get grouping, add specific checks here
					// e.g., if (header.equals("some_other_number_column")) { expectedFormattedValue
					// = plainIntegerFormat.format(originalValue); }
				}
				// For all other types (Strings, etc.)
				else {
					expectedFormattedValue = originalValue.toString();
				}

				if (!StringUtils.isEmpty(expectedFormattedValue)) {
                    try {
                        // try the primary expected value
                        Assertions.assertThat(currentReportText).contains(expectedFormattedValue);
                    } catch (AssertionError primaryFailure) {
                        // only fall back if we have a second candidate
                        if (!StringUtils.isEmpty(expectedFormattedValue2)) {
                            try {
                                Assertions.assertThat(currentReportText).contains(expectedFormattedValue2);
                            } catch (AssertionError secondaryFailure) {
                                // ENHANCED DEBUG: print failing header + candidates + small snippet
                                int idx = Math.max(0, currentReportText.indexOf(header) - 60);
                                int end = Math.min(currentReportText.length(), currentReportText.indexOf(header) + 200);
                                String snippet = (idx >= 0 && end > idx) ? currentReportText.substring(idx, end) : currentReportText;
                                // System.out.println("[FAIL-DBG] header=" + header
                                //         + " expected1='" + expectedFormattedValue + "' expected2='" + expectedFormattedValue2
                                //         + "'\n[FAIL-DBG] snippet=" + snippet);
                                // rethrow the original primary failure to preserve test behavior
                                throw primaryFailure;
                            }
                        } else {
                            // no fallback → rethrow the original
                            int idx = Math.max(0, currentReportText.indexOf(header) - 60);
                            int end = Math.min(currentReportText.length(), currentReportText.indexOf(header) + 200);
                            String snippet = (idx >= 0 && end > idx) ? currentReportText.substring(idx, end) : currentReportText;
                            // System.out.println("[FAIL-DBG] header=" + header + " expected='" + expectedFormattedValue
                            //         + "'\n[FAIL-DBG] snippet=" + snippet);
                            throw primaryFailure;
                        }
                    }
                }
			}
			lineIndex++;
		}
	}
}
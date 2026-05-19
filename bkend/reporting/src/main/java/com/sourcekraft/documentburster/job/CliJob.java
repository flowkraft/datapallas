/*
    DocumentBurster is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    DocumentBurster is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with DocumentBurster.  If not, see <http://www.gnu.org/licenses/>
 */
package com.sourcekraft.documentburster.job;

import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Arrays;
import java.util.LinkedHashMap; 

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.common.ServicesManager;
import com.sourcekraft.documentburster.engine.jasper.JasperReportRunner;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionTester;
import com.sourcekraft.documentburster.common.db.DatabaseSchemaFetcher;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;
import com.sourcekraft.documentburster.common.db.schema.TableSchema;
import com.sourcekraft.documentburster.common.settings.EmailConnection;
import com.sourcekraft.documentburster.common.settings.NewFeatureRequest;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.AbstractReporter;
import com.sourcekraft.documentburster.engine.BursterFactory;
import com.sourcekraft.documentburster.engine.pdf.Merger;
import com.sourcekraft.documentburster.job.model.JobDetails;
import com.sourcekraft.documentburster.job.model.JobProgressDetails;
import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.scripting.Scripting;
import com.sourcekraft.documentburster.sender.factory.EmailMessageFactory;
import com.sourcekraft.documentburster.sender.factory.SmsMessageFactory;
import com.sourcekraft.documentburster.sender.model.EmailMessage;
import com.sourcekraft.documentburster.sender.model.SmsMessage;
import com.sourcekraft.documentburster.utils.LicenseUtils;
import com.sourcekraft.documentburster.utils.Scripts;
import com.sourcekraft.documentburster.utils.Utils;

public class CliJob {

	private static Logger log = LoggerFactory.getLogger(CliJob.class);

	private Map<String, String> parameters = new HashMap<>();

	private LicenseUtils licenseUtils = new LicenseUtils();

	public String configurationFilePath;

	private Settings settings;

	private String jobProgressFilePath;
	private String jobFilePath;
	private String jobType = "burst";

	public static String STATUS_COMPLETED = "COMPLETED";
	public static String STATUS_FAILED = "FAILED";

	public static String RUN_MODE_QA = "QA";
	public static String RUN_MODE_LIVE = "LIVE";

	private GlobalContext global;

	public void setGlobal(GlobalContext global) {
		this.global = global;
	}

	public void setParameters(Map<String, String> parameters) {
		// // System.out.println("[DEBUG] CliJob.setParameters called with: " +
		// parameters);
		this.parameters = parameters;
	}

	public CliJob(String configFilePath) {

		log.debug("public CliJob(String configFilePath) constructor configurationFilePath = " + configFilePath);

		if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(Paths.get(configFilePath)))))
			this.configurationFilePath = configFilePath;
		else
			this.configurationFilePath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");

		settings = new Settings(configurationFilePath);

	}

	public Settings getSettings() throws Exception {
		return settings;
	}

	public void setJobProgressFilePath(String jobProgressFilePath) {

		this.jobProgressFilePath = jobProgressFilePath;

	}

	public void setJobType(String jobType) {

		this.jobType = jobType;

	}

	public void doCheckEmail() throws Exception {

		log.info("Sending test email...");

		EmailMessage message;

		if ((configurationFilePath.contains("connections")) && (configurationFilePath.contains("eml-"))) {
			EmailConnection emailConnection = new EmailConnection();
			emailConnection.loadDetails(configurationFilePath);
			message = (new EmailMessageFactory()).createCheckEmailMessageFromConnection(emailConnection);

		} else {
			settings.setConfigurationFilePath(configurationFilePath);
			settings.loadSettings();

			message = (new EmailMessageFactory()).createCheckEmailMessageFromSettings(settings);

		}

		File jobFile = null;

		try {
			jobFile = _createJobFile(Scripts.EMAIL, "check-email");
			(new Scripting()).executeSenderScript(Scripts.EMAIL, message);
			log.info("Test email sent successfully.");

		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	public void doSendFeatureRequestEmail(String newFeatureRequestFilePath) throws Exception {

		log.debug("doSendFeatureRequestEmail()");

		if (StringUtils.isNotBlank(newFeatureRequestFilePath)) {
			File rnfXmlFile = new File(newFeatureRequestFilePath);

			if ((rnfXmlFile != null) && rnfXmlFile.exists()) {
				EmailConnection defaultEmailConnection = new EmailConnection();
				defaultEmailConnection.loadDetailsDefault(StringUtils.EMPTY);
				EmailMessage message = (new EmailMessageFactory())
						.createCheckEmailMessageFromConnection(defaultEmailConnection);

				NewFeatureRequest featureRequest = new NewFeatureRequest();

				featureRequest.loadDetails(newFeatureRequestFilePath);

				message.subject = featureRequest.getDetails().featurerequest.subject;
				message.textMessage = featureRequest.getDetails().featurerequest.message;

				message.tos.clear();
				message.tos.add("support@pdfburst.com");

				File jobFile = null;

				try {
					jobFile = _createJobFile(Scripts.EMAIL, "send-feature-request-email");
					(new Scripting()).executeSenderScript(Scripts.EMAIL, message);

				} finally {
					rnfXmlFile.delete();
					_deleteJobFileWithRetry(jobFile);
				}

			} else
				throw new Exception("'Request New Feature' XML file does not exist: " + newFeatureRequestFilePath);

		}

	}

	public void doResume(String jobProgressFilePath) throws Exception {

		log.debug("doResumeBurst(String jobProgressFilePath) : jobProgressFilePath = " + jobProgressFilePath);

		File jobFile = null;
		File jobProgressFile = new File(jobProgressFilePath);

		try {

			JobProgressDetails jobProgressDetails = JobUtils.loadJobProgressFile(jobProgressFilePath);
			jobProgressFile.delete();

			jobFile = _createJobFile(jobProgressDetails.filepath, jobProgressDetails.jobtype);

			this.configurationFilePath = jobProgressDetails.configurationFilePath;
			this.jobType = jobProgressDetails.jobtype;

			AbstractBurster burster = getBurster(jobProgressDetails.filepath);

			burster.setPreviousJobExecutionProgressDetails(jobProgressDetails);
			burster.setJobFilePath(jobFilePath);

			burster.burst(jobProgressDetails.filepath, jobProgressDetails.testall, jobProgressDetails.listoftesttokens,
					jobProgressDetails.numberofrandomtesttokens);

		} finally {

			_deleteJobFileWithRetry(jobFile);

		}

	}

	public void doBurst(String filePath, boolean testAll, String listOfTestTokens, int numberOfRandomTestTokens)
			throws Exception {

		log.debug("doBurst(String filePath ) : filePath=" + filePath);

		File jobFile = null;

		try {

			jobFile = _createJobFile(filePath, jobType);

			AbstractBurster burster = getBurster(filePath);

			burster.setJobFilePath(jobFilePath);

			if (jobProgressFilePath != null)
				burster.setJobFilePath(jobProgressFilePath);

			// Pass parameters to AbstractReporter if applicable
			if (burster instanceof AbstractReporter && parameters != null && !parameters.isEmpty()) {
				((AbstractReporter) burster).setReportParameters(parameters);
			}

			burster.burst(filePath, testAll, listOfTestTokens, numberOfRandomTestTokens);

		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	/*
	 * public void doReportsGenerate(String filePath, String configFilePath, boolean
	 * testAll, String listOfTestTokens, int numberOfRandomTestTokens) throws
	 * Exception {
	 * 
	 * log.
	 * debug("doReportsGenerate(String filePath, String configFilePath), filePath = "
	 * + filePath + ", configFilePath = " + configFilePath);
	 * 
	 * File jobFile = null;
	 * 
	 * try {
	 * 
	 * jobFile = _createJobFile(filePath, "reporting");
	 * 
	 * AbstractBurster burster = getBurster(filePath);
	 * 
	 * burster.setJobFilePath(jobFilePath);
	 * 
	 * if (jobProgressFilePath != null) burster.setJobFilePath(jobProgressFilePath);
	 * 
	 * burster.burst(filePath, testAll, listOfTestTokens, numberOfRandomTestTokens);
	 * 
	 * } finally { if ((jobFile != null) && (jobFile.exists())) jobFile.delete(); }
	 * 
	 * }
	 */

	private String getJobFilePath() {

		return getTempFolder() + Utils.getRandomJobFileName();

	}

	public String getTempFolder() {

		return Utils.getTempFolder();

	}

	/**
	 * Deletes the job file with retry — on Windows the 250ms WebSocket scheduler
	 * in JobsService.fetchStats() may briefly hold a file handle, causing
	 * File.delete() to fail. Retries up to 5 times with 100ms delay.
	 */
	private void _deleteJobFileWithRetry(File jobFile) {
		if (jobFile == null || !jobFile.exists())
			return;
		for (int attempt = 1; attempt <= 5; attempt++) {
			if (jobFile.delete())
				return;
			try {
				Thread.sleep(100);
			} catch (InterruptedException ie) {
				Thread.currentThread().interrupt();
				break;
			}
		}
		// Last resort: ask the JVM to delete on exit
		if (jobFile.exists()) {
			log.warn("Could not delete job file after retries: {}. Scheduling deleteOnExit.", jobFile.getAbsolutePath());
			jobFile.deleteOnExit();
		}
	}

	private File _createJobFile(String targetFilePath, String jobType) throws Exception {

		jobFilePath = getJobFilePath();

		JobDetails jobDetails = new JobDetails();

		jobDetails.filepath = targetFilePath;
		jobDetails.jobtype = jobType;

		JobUtils.saveJobDetails(jobDetails, jobFilePath);

		return new File(jobFilePath);

	}

	protected AbstractBurster getBurster(String filePath) throws Exception {

		AbstractBurster burster = BursterFactory.create(filePath, configurationFilePath, jobType);
		burster.setGlobal(global);

		return burster;

	}

	protected Merger getMerger() throws Exception {

		settings.setConfigurationFilePath(configurationFilePath);
		settings.loadSettings();
		return new Merger(settings);

	}

	public String getJobPath() {
		return jobFilePath;
	}

	public String doMerge(List<String> filePaths, String outputFileName) throws Exception {

		String mergedFilePath = null;
		File jobFile = null;

		try {

			jobFile = _createJobFile(outputFileName, "merge");

			Merger merger = getMerger();
			mergedFilePath = merger.doMerge(filePaths, outputFileName);

		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

		return mergedFilePath;

	}

	public void doActivateLicenseKey() throws Exception {

		log.debug("doActivateLicenseKey()");

		File jobFile = null;

		try {
			jobFile = _createJobFile(licenseUtils.getLicenseFilePath(), "activate-licenseUtils-key");
			licenseUtils.activateLicense();
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	public void doDeactivateLicense() throws Exception {

		log.debug("doDeActivateLicenseKey()");

		File jobFile = null;

		try {
			jobFile = _createJobFile(licenseUtils.getLicenseFilePath(), "deactivate-licenseUtils-key");
			licenseUtils.deActivateLicense();
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	public void doCheckLicense() throws Exception {

		log.debug("doCheckLicense()");

		File jobFile = null;

		try {
			jobFile = _createJobFile(licenseUtils.getLicenseFilePath(), "check-licenseUtils-key");
			licenseUtils.checkLicense();
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	public void doCheckTwilio(String from, String to) throws Exception {

		log.debug("doCheckTwilio(String from, String to) : from = " + from + ", to = " + to);

		settings.setConfigurationFilePath(configurationFilePath);
		settings.loadSettings();

		SmsMessage message = (new SmsMessageFactory()).createCheckSmsMessage(from, to);
		message.twilio = settings.getSmsSettings().twilio;

		File jobFile = null;

		try {
			jobFile = _createJobFile(Scripts.TWILIO, "check-twilio");
			(new Scripting()).executeSenderScript(Scripts.TWILIO, message);
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}

	}

	/**
	 * Fetch report data for preview/display purposes (read-only operation).
	 * Does NOT create a job file since this is not a trackable job - it's just a database query.
	 * Job files are only needed for operations with side effects (burst, merge, email, etc.).
	 */
	public ReportDataResult doFetchData(Map<String, String> parameters, boolean testMode) throws Exception {

		ReportDataResult result = new ReportDataResult();
		AbstractBurster burster = null;

		try {
			// System.out.println("doFetchData: configurationFilePath = " +
			// configurationFilePath);

			// Load settings and determine job type
			settings.setConfigurationFilePath(configurationFilePath);
			settings.loadSettings();

			String dsType = settings.getReportDataSource().type;
			// System.out.println("doFetchData: Data source type (jobType) = " +
			// dsType);

			this.setJobType(dsType);

			// Get the correct reporter (SqlReporter, ScriptReporter, etc.)
			burster = getBurster(configurationFilePath);
			// System.out.println("doFetchData: Got burster of type: "
			// + (burster != null ? burster.getClass().getName() : "null"));

			// Only AbstractReporter descendants have setPreviewMode
			if (burster instanceof AbstractReporter) {
				// System.out.println("doFetchData: burster is instance of
				// AbstractReporter");
				((AbstractReporter) burster).setPreviewMode(true);
				((AbstractReporter) burster).setTestMode(testMode);
				// System.out.println("doFetchData: setPreviewMode called");

				((AbstractReporter) burster).setReportParameters(parameters);
				// System.out.println("doFetchData: setReportParameters called with: "
				// + (parameters != null ? parameters.toString() : "null"));
			} else {
				// System.out.println("doFetchData: burster is NOT instance of
				// AbstractReporter");
				throw new IllegalStateException("Fetch data only supported for AbstractReporter-based bursters");
			}

			// Fetch data only — skip the burst loop (no token processing needed for View Data)
			long startTime = System.currentTimeMillis();
			((AbstractReporter) burster).fetchDataOnly(settings.getTemplateName());
			long endTime = System.currentTimeMillis();
			// System.out.println("doFetchData: burst finished");

			// Prepare and return the result

			result.reportData = burster.getCtx().reportData;
			result.reportColumnNames = burster.getCtx().reportColumnNames;
			result.executionTimeMillis = endTime - startTime;
			result.totalRows = (result.reportData != null) ? result.reportData.size() : 0;

			// System.out.println("doFetchData: reportData size = "
			// + (result.reportData != null ? result.reportData.size() : "null"));
			// System.out.println("doFetchData: reportColumnNames = "
			// + (result.reportColumnNames != null ? result.reportColumnNames.toString() :
			// "null"));
			return result;

		} catch (Throwable t) {
            String msg = (t.getMessage() == null || t.getMessage().isEmpty()) ? t.toString() : t.getMessage();

			// Log everything (goes through SLF4J/logback appenders)
            if (!msg.toLowerCase().contains("no burst tokens were provided or fetched for the document")) {
				// Check if this is a ClickHouse connection error (non-critical)
				if (isClickHouseConnectionError(t)) {
					log.warn("ClickHouse connection failed (likely not running): {}",
						msg.length() > 200 ? msg.substring(0, 200) + "..." : msg);
				} else {
					log.error("Exception: ", t);
				}
			}
			else {
				log.info(msg);
			}

			// Otherwise, we are invoked from the server (REST preview) — return a safe error payload
            LinkedHashMap<String, Object> row = new LinkedHashMap<>();
            row.put("ERROR_MESSAGE", msg);
            result.reportData = Arrays.asList(row);
            result.reportColumnNames = Arrays.asList("ERROR_MESSAGE");
            result.executionTimeMillis = 0L;
            result.totalRows = 0;

            // If we were invoked from CLI (DocumentBurster/MainProgram set global)
            // rethrow to keep existing behavior (so top-level wrapper records exit and archiving)
            if (this.global != null) {
            	throw t;
            }
			return result;

        } finally {
			// dbManager.close() is handled by AbstractBurster.closeResources()
			// which is called in burst()/fetchDataOnly() finally blocks.
		}
	}

	/**
	 * Check if an exception is a ClickHouse connection error (non-critical).
	 * These errors occur when ClickHouse is simply not running.
	 */
	private boolean isClickHouseConnectionError(Throwable e) {
		if (e == null) {
			return false;
		}

		String message = e.getMessage();
		String causeMessage = e.getCause() != null ? e.getCause().getMessage() : null;

		// Check exception message for ClickHouse indicators
		if (message != null &&
			(message.contains("clickhouse") ||
			 message.contains("localhost:8123") ||
			 message.contains("Connection refused"))) {
			return true;
		}

		// Check cause message for ClickHouse indicators
		if (causeMessage != null &&
			(causeMessage.contains("clickhouse") ||
			 causeMessage.contains("localhost:8123") ||
			 causeMessage.contains("Connection refused"))) {
			return true;
		}

		// Recursively check the cause chain
		if (e.getCause() != null && e.getCause() != e) {
			return isClickHouseConnectionError(e.getCause());
		}

		return false;
	}

	public void doTestAndFetchDatabaseSchema(String connectionFilePath) throws Exception {
		log.info("Starting database connection test and schema fetch for: {}", connectionFilePath);

		File connectionFile = new File(connectionFilePath);
		if (!connectionFile.exists() || !connectionFile.isFile()) {
			// This check is redundant if MainProgram already did it, but good practice.
			throw new FileNotFoundException("Connection file not found or is not a file: " + connectionFilePath);
		}

		// Determine a job name based on the connection file for the temp job file
		String jobName = connectionFile.getName();
		File jobFile = null; // Declare outside try

		try {
			// Create the temporary job file to signal work is in progress
			// Using connectionFilePath as the "target" for context, and jobName for type/id
			jobFile = _createJobFile(connectionFilePath, "test-and-fetch-database-schema-" + jobName);
			log.debug("Created job file: {}", jobFilePath);

			// --- Core Logic ---

			// 2. Test Connection
			DatabaseConnectionTester tester = new DatabaseConnectionTester();
			log.info("Attempting to test database connection...");
			tester.testConnection(connectionFilePath);
			log.info("Database connection test successful.");

			// 3. Fetch Schema
			DatabaseSchemaFetcher fetcher = new DatabaseSchemaFetcher();
			SchemaInfo schemaInfo;
			log.info("Attempting to fetch database schema...");
			schemaInfo = fetcher.fetchSchema(connectionFilePath);
			log.info("Successfully fetched database schema.");

			// 4. Determine Output Path and Save Schema
			String outputJsonPath;
			Path inputPath = connectionFile.toPath();
			Path parentDir = inputPath.getParent();
			if (parentDir == null) {
				throw new Exception("Cannot determine parent directory for connection file.");
			}
			String baseName = connectionFile.getName();
			if (baseName.toLowerCase().endsWith(".xml")) {
				baseName = baseName.substring(0, baseName.length() - 4);
			}
			// Convention: <connection-code>-information-schema.json
			String outputFileName = baseName + "-information-schema.json";
			outputJsonPath = parentDir.resolve(outputFileName).toString();
			log.debug("Determined output schema JSON path: {}", outputJsonPath);

			log.info("Attempting to save schema to JSON file: {}", outputJsonPath);
			fetcher.saveSchemaToJson(schemaInfo, outputJsonPath);
			log.info("Successfully saved schema to: {}", outputJsonPath);

			// Generate lightweight table-names.txt for AI agents to quickly discover table/view names
			String tableNamesFileName = baseName + "-table-names.txt";
			String tableNamesPath = parentDir.resolve(tableNamesFileName).toString();
			StringBuilder tableNamesSb = new StringBuilder();
			for (TableSchema table : schemaInfo.tables) {
				String type = (table.tableType != null) ? table.tableType.toUpperCase() : "TABLE";
				if ("VIEW".equals(type)) {
					tableNamesSb.append(table.tableName).append(" (VIEW)").append("\n");
				} else {
					tableNamesSb.append(table.tableName).append("\n");
				}
			}
			String tableNamesContent = tableNamesSb.toString().trim();
			Files.writeString(Path.of(tableNamesPath), tableNamesContent);
			log.info("Saved table names to: {}", tableNamesPath);

			log.info("Database connection test and schema fetch completed successfully for: {}", connectionFilePath);
			// --- End Core Logic ---

		} finally {
			// Ensure the temporary job file is deleted regardless of success or failure

			// System.out.println("jobFile.getAbsolutePath(): " +
			// jobFile.getAbsolutePath());

			_deleteJobFileWithRetry(jobFile);
		}

	}

	public void doJasperReport(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params) throws Exception {

		File jobFile = null;

		try {
			jobFile = _createJobFile(jrxmlFileName, "jasper-report");

			JasperReportRunner runner = new JasperReportRunner();
			runner.generate(reportDir, jrxmlFileName, format, outputFile, jdbcUrl, jdbcUser, jdbcPass, params);

		} finally {
			_deleteJobFileWithRetry(jobFile);
		}
	}

	public void doService(String serviceName, String commandLine) throws Exception {
		File jobFile = null;
		try {
			jobFile = _createJobFile(serviceName, commandLine);
			ServicesManager.execute(commandLine);
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}
	}

	/**
	 * Execute a Groovy seed script against the database connection at connectionFilePath.
	 * Called by MainProgram.SystemCommand.RunSeedScriptCommand — same job-file lifecycle
	 * as every other CliJob operation.
	 *
	 * @param connectionFilePath absolute path to the connection XML file
	 * @param scriptFilePath     absolute path to the .groovy script file
	 * @param params             key=value parameters passed as Groovy binding "params"
	 */
	public void doRunSeedScript(String connectionFilePath, String scriptFilePath,
			Map<String, String> params) throws Exception {

		File jobFile = null;
		try {
			jobFile = _createJobFile(connectionFilePath, "run-seed-script");

			// Load settings from the connection file — same pattern as DatabaseConnectionTester
			com.sourcekraft.documentburster.common.settings.Settings connSettings =
					new com.sourcekraft.documentburster.common.settings.Settings(StringUtils.EMPTY);
			com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings dbSettings =
					connSettings.loadSettingsConnectionDatabaseByPath(connectionFilePath);
			dbSettings.connection.databaseserver.ensureDriverAndUrl();
			Class.forName(dbSettings.connection.databaseserver.driver);

			String decryptedPassword = dbSettings.connection.databaseserver.userpassword;
			try {
				decryptedPassword = com.sourcekraft.documentburster.common.security.SecretsCipher
						.getInstance(com.sourcekraft.documentburster.common.settings.Settings.PORTABLE_EXECUTABLE_DIR_PATH)
						.decrypt(dbSettings.connection.databaseserver.userpassword);
			} catch (Exception e) {
				log.warn("Failed to decrypt database password: {}", e.getMessage());
			}

			String vendor = normalizeDbVendorType(dbSettings.connection.databaseserver.type);
			String script  = Files.readString(Path.of(scriptFilePath));

			try (java.sql.Connection conn = java.sql.DriverManager.getConnection(
					dbSettings.connection.databaseserver.url,
					dbSettings.connection.databaseserver.userid,
					decryptedPassword)) {

				groovy.sql.Sql dbSql = new groovy.sql.Sql(conn);
				groovy.lang.Binding binding = new groovy.lang.Binding();
				binding.setVariable("dbSql",   dbSql);
				binding.setVariable("vendor",  vendor);
				binding.setVariable("log",     log);
				binding.setVariable("params",  params != null ? params : new LinkedHashMap<>());

				new groovy.lang.GroovyShell(
						Thread.currentThread().getContextClassLoader(),
						binding,
						new org.codehaus.groovy.control.CompilerConfiguration())
						.evaluate(script);
			}

			log.info("Seed script completed for: {}", connectionFilePath);
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}
	}

	public List<Map<String, Object>> doRunSql(String connectionFilePath, String sql) throws Exception {
		File jobFile = null;
		try {
			jobFile = _createJobFile(connectionFilePath, "run-sql");

			com.sourcekraft.documentburster.common.settings.Settings connSettings =
					new com.sourcekraft.documentburster.common.settings.Settings(StringUtils.EMPTY);
			com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings dbSettings =
					connSettings.loadSettingsConnectionDatabaseByPath(connectionFilePath);
			dbSettings.connection.databaseserver.ensureDriverAndUrl();
			Class.forName(dbSettings.connection.databaseserver.driver);

			String decryptedPassword = dbSettings.connection.databaseserver.userpassword;
			try {
				decryptedPassword = com.sourcekraft.documentburster.common.security.SecretsCipher
						.getInstance(com.sourcekraft.documentburster.common.settings.Settings.PORTABLE_EXECUTABLE_DIR_PATH)
						.decrypt(dbSettings.connection.databaseserver.userpassword);
			} catch (Exception e) {
				log.warn("Failed to decrypt database password: {}", e.getMessage());
			}

			List<Map<String, Object>> rows = new java.util.ArrayList<>();
			try (java.sql.Connection conn = java.sql.DriverManager.getConnection(
					dbSettings.connection.databaseserver.url,
					dbSettings.connection.databaseserver.userid,
					decryptedPassword);
					java.sql.Statement stmt = conn.createStatement();
					java.sql.ResultSet rs = stmt.executeQuery(sql)) {
				java.sql.ResultSetMetaData meta = rs.getMetaData();
				int colCount = meta.getColumnCount();
				List<String> colNames = new java.util.ArrayList<>();
				for (int c = 1; c <= colCount; c++) colNames.add(meta.getColumnLabel(c));
				while (rs.next()) {
					Map<String, Object> row = new LinkedHashMap<>();
					for (int c = 1; c <= colCount; c++) row.put(colNames.get(c - 1), rs.getObject(c));
					rows.add(row);
				}
			}
			return rows;
		} finally {
			_deleteJobFileWithRetry(jobFile);
		}
	}

	private String normalizeDbVendorType(String type) {
		if (type == null) return "UNKNOWN";
		switch (type.toLowerCase()) {
			case "postgres": case "postgresql": return "POSTGRES";
			case "mysql":                        return "MYSQL";
			case "mariadb":                      return "MARIADB";
			case "sqlserver":                    return "SQLSERVER";
			case "oracle":                       return "ORACLE";
			case "ibmdb2": case "db2":           return "DB2";
			case "clickhouse":                   return "CLICKHOUSE";
			case "sqlite":                       return "SQLITE";
			case "duckdb":                       return "DUCKDB";
			case "supabase":                     return "SUPABASE";
			case "timescaledb":                  return "TIMESCALEDB";
			default: return type.toUpperCase();
		}
	}

}

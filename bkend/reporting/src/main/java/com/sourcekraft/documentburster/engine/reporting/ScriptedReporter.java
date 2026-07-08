package com.sourcekraft.documentburster.engine.reporting;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Map;

import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ReportSettings.DataSource.ScriptOptions; // Adjust import if needed
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.engine.AbstractReporter;
import com.sourcekraft.documentburster.utils.CsvUtils;
import com.sourcekraft.documentburster.utils.Utils;
import com.sourcekraft.documentburster.variables.Variables;

import groovy.sql.Sql;

public class ScriptedReporter extends AbstractReporter {

	private static final Logger log = LoggerFactory.getLogger(ScriptedReporter.class);

	private transient Sql dbSql = null;

	public ScriptedReporter(String configFilePath) {
		super(configFilePath);
		log.debug("ScriptedReporter initialized with config path: {}", configFilePath);
	}

	@Override
	protected void initializeResources() throws Exception {
	    super.initializeResources();
	    if (!hasRealInputFile()) {
	        String templateName = (ctx.settings != null) ? ctx.settings.getTemplateName() : null;
	        if (StringUtils.isNotBlank(templateName)) {
	            ctx.variables.set(Variables.INPUT_DOCUMENT_NAME, Utils.sanitizeFileName(templateName));
	        }
	    }
	}

	@Override
	protected void fetchData() throws Exception {
		log.trace("Entering fetchData...");
		ScriptOptions scriptOptions = ctx.settings.getReportDataSource().scriptoptions;
		if (scriptOptions == null) {
			log.error("ScriptOptions are null in settings.");
			throw new IllegalStateException("ScriptOptions cannot be null for script data source.");
		}

		String scriptName = scriptOptions.scriptname;

		if (StringUtils.isBlank(scriptName))
			scriptName = this.getReportFolderName() + "-script.groovy";

		String connectionCode = scriptOptions.conncode;

		if (StringUtils.isBlank(scriptName)) {
			throw new IllegalArgumentException("Script name (scriptname) cannot be empty for script data source.");
		}

		// Optional: Validate if the script file actually exists in one of the roots?
		// The GroovyScriptEngine used by 'scripting' will throw an error if not found
		// anyway.

		log.debug("Script Options: scriptName={}, conncode={}", scriptName, connectionCode);

		dbSql = null; // Ensure no leftover Sql instance

		try {
			// Provide a pre-configured Groovy Sql instance if a connection code is
			// specified
			if (StringUtils.isNotBlank(connectionCode)) {
				// Retrieve existing ServerDatabaseSettings and create a groovy Sql instance
				ServerDatabaseSettings dbs = this.getServerDatabaseSettings(connectionCode);
				dbs.ensureDriverAndUrl();

				// Decrypt password at the exact moment of use — never store plaintext
				String decryptedPassword = dbs.userpassword;
				try {
					decryptedPassword = SecretsCipher.getInstance(Settings.PORTABLE_EXECUTABLE_DIR_PATH)
							.decrypt(dbs.userpassword);
				} catch (Exception ex) {
					log.warn("Failed to decrypt database password for scripted reporter: {}", ex.getMessage());
				}

				if ("duckdb".equalsIgnoreCase(dbs.type)) {
					// DuckDB requires EVERY connection to a file (in-process and across
					// processes) to share IDENTICAL config — read-only, no credentials — or
					// it rejects the shared file ("... already open in another process" /
					// "already attached by database"). Open read-only with the exact minimal
					// config the schema fetcher, the query pool, and chat2db use so all four
					// share one read-only instance. Sql.newInstance(url, props, driver) loads
					// the driver but sends ONLY duckdb.read_only to DriverManager.
					java.util.Properties duckProps = new java.util.Properties();
					duckProps.setProperty("duckdb.read_only", "true");
					dbSql = Sql.newInstance(dbs.url, duckProps, dbs.driver);
				} else {
					dbSql = Sql.newInstance(dbs.url, dbs.userid, decryptedPassword, dbs.driver);
				}
				ctx.dbSql = dbSql;
				log.debug("Created and provided dbSql for connection code: {}", connectionCode);
			}

			// Initialize reportData and reportColumnNames in context BEFORE script
			// execution
			ctx.reportData = new ArrayList<>();
			ctx.reportColumnNames = new ArrayList<>();

			log.info("Executing Groovy script '{}' using Scripting engine...", scriptName);

			// *** Use the existing scripting mechanism ***
			scripting.executeBurstingLifeCycleScript(scriptName, ctx);

			log.info("Groovy script execution finished.");

			// --- Post-script processing ---
			// Ensure reportData is not null after script execution
			if (ctx.reportData == null) {
				log.warn("Script did not populate ctx.reportData. Initializing to empty list.");
				ctx.reportData = new ArrayList<>();
			}

			// Derive column names from the first row if the script didn't set
			// ctx.reportColumnNames
			if (ctx.reportColumnNames.isEmpty() && !ctx.reportData.isEmpty()) {
				Map<String, Object> firstRow = ctx.reportData.get(0);
				if (firstRow != null && !firstRow.isEmpty()) {
					ctx.reportColumnNames.addAll(firstRow.keySet());
					log.debug("Derived column names from first data row: {}", ctx.reportColumnNames);
				} else {
					log.warn("First data row is null or empty, cannot derive column names.");
				}
			} else if (!ctx.reportColumnNames.isEmpty()) {
				log.debug("Script explicitly set column names: {}", ctx.reportColumnNames);
			} else {
				log.debug("Source data is empty, no column names to derive or set.");
			}

			log.info("Script generated {} data rows.", ctx.reportData.size());
			if (!ctx.reportData.isEmpty()) {
				log.debug("First row sample: {}", ctx.reportData.get(0));
			}

		} catch (Exception e) {
			// Catch exceptions from script execution or setup
			log.error("Error executing Groovy script '{}': {}", scriptName, e.getMessage(), e);
			// Check if the root cause is script compilation/execution
			Throwable cause = e.getCause();
			String errorMessage = "Failed to fetch data using script '" + scriptName + "': " + e.getMessage();
			if (cause != null && cause.getClass().getName().contains("groovy")) {
				errorMessage = "Error in Groovy script '" + scriptName + "': " + cause.getMessage();
			}
			throw new RuntimeException(errorMessage, e); // Re-throw for AbstractBurster to handle
		} finally {
			// Ensure groovy Sql is closed
			if (dbSql != null) {
				try {
					dbSql.close();
				} catch (Exception ignore) {
				}
				ctx.dbSql = null;
				dbSql = null;
			}
			// Close any extra connections opened via ctx.getConnection()
			if (ctx.namedDbSql != null) {
				for (Map.Entry<String, Sql> entry : ctx.namedDbSql.entrySet()) {
					try {
						entry.getValue().close();
						log.debug("Closed extra connection: {}", entry.getKey());
					} catch (Exception ignore) {
					}
				}
				ctx.namedDbSql.clear();
				ctx.namedDbSql = null;
			}
		}
		log.trace("Exiting fetchData.");
	}

	@Override
	public void parseBurstingMetaData() throws Exception {
		log.debug("Entering parseBurstingMetaData...");

		if (ctx.reportData == null || ctx.reportData.isEmpty()) {
			log.warn("No data available from script (reportData is null or empty). Cannot parse metadata.");
			ctx.burstTokens = new ArrayList<>();
			return; // Nothing to parse
		}

		// Determine the ID column name (must be final for lambda usage)
		String rawIdColumn = ctx.settings.getReportDataSource().scriptoptions.idcolumn;
		final String idColumn;
		if (StringUtils.isEmpty(rawIdColumn)) {
			idColumn = CsvUtils.NOT_USED;
			log.warn("idcolumn not configured in scriptoptions, defaulting to '{}'", idColumn);
		} else {
			idColumn = rawIdColumn;
		}
		log.debug("Using configuredIdColumn: '{}' for token extraction.", idColumn);

		ctx.burstTokens.clear();
		int lineIndex = 0; // Use 0-based index internally

		log.debug("Starting to process {} rows generated by script for metadata parsing.", ctx.reportData.size());

		for (Map<String, Object> row : ctx.reportData) {
			if (row == null) {
				log.warn("Skipping null row at index {}", lineIndex);
				lineIndex++;
				continue; // Skip null rows
			}
			log.trace("Processing script-generated row index: {}", lineIndex);
			log.trace("Row data: {}", row);

			String token;
			if (idColumn.equalsIgnoreCase(CsvUtils.NOT_USED)) {
				token = String.valueOf(lineIndex + 1);
				log.debug("Using 1-based index as token (NOT_USED): '{}'", token);
			} else {
				Object idValue = row.entrySet().stream().filter(entry -> idColumn.equalsIgnoreCase(entry.getKey()))
						.map(Map.Entry::getValue).findFirst().orElse(null);

				log.trace("Attempted to retrieve idValue for column '{}' (case-insensitive): {}", idColumn, idValue);

				if (idValue != null) {
					token = String.valueOf(idValue);
					log.debug("Using value from column '{}' as token: '{}'", idColumn, token);
				} else {
					token = String.valueOf(lineIndex + 1);
					log.warn(
							"idValue was null or column '{}' not found in script row at index {}. Falling back to 1-based index token: '{}'",
							idColumn, lineIndex, token);
					log.debug("Available columns in row: {}", row.keySet());
				}
			}

			ctx.variables.parseUserVariablesFromMap(token, row);
			ctx.burstTokens.add(token);
			lineIndex++;
		}

		log.info("Generated {} tokens from script data.", ctx.burstTokens.size());
		log.debug("Final tokens list: {}", ctx.burstTokens);
		log.debug("Exiting parseBurstingMetaData.");
	}

	protected ServerDatabaseSettings getServerDatabaseSettings(String connectionCode) throws Exception {
		return ctx.dbManager.getServerDatabaseSettings(connectionCode);
	}

	@Override
	protected void backupFile() throws Exception {
		// ScriptedReporter typically doesn't have a single input file like PdfBurster.
		log.debug("Skipping backupFile for ScriptedReporter as there is no single input file.");
	}

	// extractOutputBurstDocument() is inherited from AbstractReporter and should
	// work
	// as long as ctx.variables are populated correctly by parseBurstingMetaData
	// and the template processing methods in AbstractReporter handle Map<String,
	// Object>.
	
	private boolean hasRealInputFile() {
	    if (ctx == null) return false;
	    String p = ctx.inputDocumentFilePath;
	    if (StringUtils.isBlank(p)) return false;
	    if (p.startsWith("file:")) p = p.substring("file:".length());
	    // get filename extension and treat known sqlite DB extensions as NOT a real input document
	    try {
	        String name = Paths.get(p).getFileName().toString();
	        String ext = FilenameUtils.getExtension(name).toLowerCase();
	        java.util.Set<String> sqliteExts = new java.util.HashSet<>(java.util.Arrays.asList("db", "sqlite", "sqlite3", "db3"));
	        if (sqliteExts.contains(ext)) {
	            return false;
	        }
	        return Files.exists(Paths.get(p));
	    } catch (Exception e) {
	        return false;
	    }
	}

}
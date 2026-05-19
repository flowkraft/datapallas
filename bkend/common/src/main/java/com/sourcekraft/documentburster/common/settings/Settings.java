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
package com.sourcekraft.documentburster.common.settings;

import java.io.File;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Properties;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Unmarshaller;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.settings.model.Attachment;
import com.sourcekraft.documentburster.common.settings.model.BursterSettings;
import com.sourcekraft.documentburster.utils.Utils;
import com.sourcekraft.documentburster.common.settings.model.Capabilities;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.common.settings.model.EmailRfc2822Validator;
import com.sourcekraft.documentburster.common.settings.model.EmailSettings;
import com.sourcekraft.documentburster.common.settings.model.FreeMarkerSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.RetryPolicy;
import com.sourcekraft.documentburster.common.settings.model.SendFiles;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerEmailSettings;
import com.sourcekraft.documentburster.common.settings.model.Attachments;
import com.sourcekraft.documentburster.common.settings.model.Items;
import com.sourcekraft.documentburster.common.settings.model.Archive;
import com.sourcekraft.documentburster.common.settings.model.BurstTokenDelimiters;
import com.sourcekraft.documentburster.common.settings.model.QualityAssurance;
import com.sourcekraft.documentburster.common.settings.model.Locale;
import com.sourcekraft.documentburster.common.settings.model.SimpleJavaMail;
import com.sourcekraft.documentburster.common.settings.model.SmsSettings;
import com.sourcekraft.documentburster.common.settings.model.UploadSettings;
import com.sourcekraft.documentburster.common.settings.model.WebUploadSettings;
import com.sourcekraft.documentburster.utils.DumpToString;

public class Settings extends DumpToString {

	/**
	 * 
	 */
	public static String PORTABLE_EXECUTABLE_DIR_PATH = StringUtils.EMPTY;

	private static final long serialVersionUID = 6953576182023603829L;

	private Logger log = LoggerFactory.getLogger(Settings.class);

	private String configurationFilePath;

	public DocumentBursterSettings docSettings;
	public DocumentBursterSettingsInternal docSettingsInternal;
	public ReportingSettings reportingSettings;
	public DocumentBursterConnectionEmailSettings connectionEmailSettings;
	public DocumentBursterConnectionDatabaseSettings connectionDatabaseSettings;

	public Settings(String configFilePath) {

		Path initialPath = Paths.get(configFilePath).toAbsolutePath().normalize();
		if ((StringUtils.isNoneEmpty(configFilePath) && (Files.exists(initialPath))))
			this.configurationFilePath = initialPath.toString();
		else
			// Anchor fallback to PORTABLE_EXECUTABLE_DIR, not CWD. CWD-anchored fallback
			// caused cross-thread corruption of the static PORTABLE_EXECUTABLE_DIR_PATH
			// (constructor below writes it) when parallel /data-canvas requests hit the
			// fallback branch — half of the widgets then read bkend/server as the base
			// and failed with FileNotFoundException on config/connections/*.
			this.configurationFilePath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");

		Path path = Paths.get(this.configurationFilePath).toAbsolutePath().normalize();
		Path parentPath = path.getParent();
		Path grandParentPath = parentPath.getParent().getParent();

		if (this.configurationFilePath.replace("\\", "/").endsWith("config/burst/settings.xml")
				|| this.configurationFilePath.replace("\\", "/").endsWith("config/_internal/settings.xml")) {
			PORTABLE_EXECUTABLE_DIR_PATH = grandParentPath.toAbsolutePath().toString().replace("\\", "/");
		} else {
			PORTABLE_EXECUTABLE_DIR_PATH = grandParentPath.getParent().toAbsolutePath().toString().replace("\\", "/");
		}
	}

	/**
	 * Ensure that after unmarshalling from XML we have sensible, non-null
	 * values for fields that previously were primitive types and for nested
	 * complex objects that calling code expects to exist. This method is
	 * intentionally explicit and centralised so behaviour is easy to reason
	 * about and maintain.
	 */
	private void normalizeDocSettings() {
		if (docSettings == null || docSettings.settings == null) return;

		BursterSettings s = docSettings.settings;

		// Ensure nested complex objects exist (avoid NPEs later).
		if (s.attachments == null) s.attachments = new Attachments();
		if (s.attachments.items == null) s.attachments.items = new Items();
		if (s.attachments.items.attachmentItems == null) s.attachments.items.attachmentItems = new ArrayList<Attachment>();
		if (s.attachments.archive == null) s.attachments.archive = new Archive();

		if (s.freemarker == null) s.freemarker = new FreeMarkerSettings();
		if (s.bursttokendelimiters == null) s.bursttokendelimiters = new BurstTokenDelimiters();
		if (s.retrypolicy == null) s.retrypolicy = new RetryPolicy();
		if (s.emailserver == null) s.emailserver = new ServerEmailSettings();
		if (s.simplejavamail == null) s.simplejavamail = new SimpleJavaMail();
		if (s.uploadsettings == null) s.uploadsettings = new UploadSettings();
		if (s.webuploadsettings == null) s.webuploadsettings = new WebUploadSettings();
		if (s.smssettings == null) s.smssettings = new SmsSettings();
		if (s.qualityassurance == null) s.qualityassurance = new QualityAssurance();
		if (s.qualityassurance.emailserver == null) s.qualityassurance.emailserver = new ServerEmailSettings();
		if (s.locale == null) s.locale = new Locale();

		// Booleans: set explicit false when missing
		if (s.deletefiles == null) s.deletefiles = Boolean.FALSE;
		if (s.quarantinefiles == null) s.quarantinefiles = Boolean.FALSE;
		if (s.sortbyposition == null) s.sortbyposition = Boolean.FALSE;
		if (s.shouldseparatebybeads == null) s.shouldseparatebybeads = Boolean.FALSE;
		if (s.suppressduplicateoverlappingtext == null) s.suppressduplicateoverlappingtext = Boolean.FALSE;
		if (s.htmlemail == null) s.htmlemail = Boolean.FALSE;
		if (s.htmlemaileditcode == null) s.htmlemaileditcode = Boolean.FALSE;
		if (s.reusetokenswhennotfound == null) s.reusetokenswhennotfound = Boolean.FALSE;
		if (s.failjobifanydistributionfails == null) s.failjobifanydistributionfails = Boolean.FALSE;
		if (s.enableretrypolicy == null) s.enableretrypolicy = Boolean.FALSE;
		if (s.split2ndtime == null) s.split2ndtime = Boolean.FALSE;
		if (s.dumprecorddataasxml == null) s.dumprecorddataasxml = Boolean.FALSE;
		if (s.enableincubatingfeatures == null) s.enableincubatingfeatures = Boolean.FALSE;

		// Numeric defaults
		if (s.averagechartolerancevalue == null) s.averagechartolerancevalue = Float.valueOf(0.0f);
		if (s.spacingtolerancevalue == null) s.spacingtolerancevalue = Float.valueOf(0.0f);
		if (s.numberofuservariables == null) s.numberofuservariables = Integer.valueOf(0);
		if (s.delayeachdistributionby == null) s.delayeachdistributionby = Double.valueOf(0.0);

		// SimpleJavaMail defaults
		SimpleJavaMail sjm = s.simplejavamail;
		if (sjm.active == null) sjm.active = Boolean.FALSE;
		if (sjm.javaxmaildebug == null) sjm.javaxmaildebug = Boolean.FALSE;
		if (sjm.transportmodeloggingonly == null) sjm.transportmodeloggingonly = Boolean.FALSE;
		if (sjm.async == null) sjm.async = Boolean.FALSE;

		if (sjm.poolsize == null) sjm.poolsize = Integer.valueOf(0);
		if (sjm.poolsizekeepalivetime == null) sjm.poolsizekeepalivetime = Integer.valueOf(0);
		if (sjm.sessiontimeoutmillis == null) sjm.sessiontimeoutmillis = Integer.valueOf(0);
		if (sjm.trustallhosts == null) sjm.trustallhosts = Boolean.FALSE;
		if (sjm.verifyserveridentity == null) sjm.verifyserveridentity = Boolean.FALSE;
		if (sjm.opportunistictls == null) sjm.opportunistictls = Boolean.FALSE;

		// Ensure attachment order values exist and are non-null
		if (s.attachments != null && s.attachments.items != null && s.attachments.items.attachmentItems != null) {
			for (Attachment a : s.attachments.items.attachmentItems) {
				if (a.order == null) a.order = Integer.valueOf(0);
			}
		}

	}

	// Passwords are kept encrypted in memory (ENC(base64...)) — decryption
	// happens only at the exact runtime moment of use (SMTP/JDBC/Twilio/proxy).

	public String getReportingPrimaryDatabaseConnectionCode() {

		if (Objects.isNull(this.reportingSettings))
			return StringUtils.EMPTY;

		if (!Objects.isNull(this.reportingSettings.report.datasource.sqloptions))
			return this.reportingSettings.report.datasource.sqloptions.conncode;

		return this.reportingSettings.report.datasource.scriptoptions.conncode;

	}

	public DocumentBursterSettings loadSettings() throws Exception {

		log.debug("loadSettings()");

		JAXBContext jc = JAXBContext.newInstance(DocumentBursterSettings.class);

		Unmarshaller u = jc.createUnmarshaller();

		try (FileInputStream fis = new FileInputStream(new File(this.configurationFilePath))) {
			docSettings = (DocumentBursterSettings) u.unmarshal(fis);

			// Normalize settings after successful unmarshal.
			// Rationale: many XML templates (especially older ones) contain empty
			// or missing elements for fields that used to be primitive types.
			// Converting those fields to wrapper types allows JAXB to set null
			// when elements are absent/empty. We must then explicitly populate
			// sensible defaults and instantiate missing nested objects so the
			// rest of the codebase can rely on non-null values and avoid NPEs
			// or primitive conversion errors. We do this intentionally and
			// explicitly here (rather than via XML producers) to keep behaviour
			// controlled server-side.
			normalizeDocSettings();
		}

		_sortAttachments();

		if ((!Objects.isNull(docSettings.settings.capabilities)
				&& docSettings.settings.capabilities.reportgenerationmailmerge))
			loadSettingsReporting();

		// log.debug("loadSettings - settings = [" + docSettings + "], reportingSettings
		// = [" + reportingSettings + "]");

		return docSettings;
	}

	public DocumentBursterSettingsInternal loadSettingsInternal() throws Exception {

		String internalConfigFilePath = Paths.get(PORTABLE_EXECUTABLE_DIR_PATH, "config/_internal/settings.xml")
				.normalize().toString();

		JAXBContext jcr = JAXBContext.newInstance(DocumentBursterSettingsInternal.class);

		Unmarshaller ur = jcr.createUnmarshaller();

		try (FileInputStream fis = new FileInputStream(new File(internalConfigFilePath))) {
			docSettingsInternal = (DocumentBursterSettingsInternal) ur.unmarshal(fis);
		}

		return docSettingsInternal;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// showsamples preference
	// ─────────────────────────────────────────────────────────────────────────
	//
	// CRUD list views (Connections, Reports, Cube Definitions) check this flag
	// when loading. The flag is persisted in config/_internal/settings.xml via
	// the existing loadPreferences/savePreferences flow. To avoid threading a
	// "showSamples" parameter through every list endpoint, the backend reads
	// the preference directly from disk on each list call (cached briefly).
	//
	// Fail-closed: any error → returns false (samples stay hidden).
	// ─────────────────────────────────────────────────────────────────────────

	private static volatile boolean showSamplesCachedValue = false;
	private static volatile long showSamplesCachedAt = 0L;
	private static final long SHOW_SAMPLES_CACHE_TTL_MS = 2000L;

	/**
	 * Reads showsamples preference from the internal settings XML.
	 * Returns false if the file is missing, the field is missing, or any I/O / parsing
	 * error occurs (fail-closed). Cached for 2 seconds to avoid hammering disk on
	 * rapid list calls.
	 */
	public static boolean isShowSamplesEnabled() {
		long now = System.currentTimeMillis();
		if (now - showSamplesCachedAt < SHOW_SAMPLES_CACHE_TTL_MS) {
			return showSamplesCachedValue;
		}

		boolean value = false;
		try {
			String internalConfigFilePath = Utils.resolvePathAgainstPortableDir("config/_internal/settings.xml");
			File f = new File(internalConfigFilePath);
			if (f.exists() && f.isFile()) {
				JAXBContext jcr = JAXBContext.newInstance(DocumentBursterSettingsInternal.class);
				Unmarshaller ur = jcr.createUnmarshaller();
				try (FileInputStream fis = new FileInputStream(f)) {
					DocumentBursterSettingsInternal s = (DocumentBursterSettingsInternal) ur.unmarshal(fis);
					if (s != null && s.settings != null && s.settings.showsamples != null) {
						value = s.settings.showsamples.booleanValue();
					}
				}
			}
		} catch (Exception e) {
			// Fail-closed: never accidentally show samples
			value = false;
		}

		showSamplesCachedValue = value;
		showSamplesCachedAt = now;
		return value;
	}

	/** Invalidate the cache (called when preferences are saved). */
	public static void invalidateShowSamplesCache() {
		showSamplesCachedAt = 0L;
	}

	public void loadSettingsReporting() throws Exception {

		// config/reports/payslips
		String configFolderPath = Paths.get(this.configurationFilePath).getParent().toString();
		String reportingConfigFilePath = configFolderPath + "/reporting.xml";

		JAXBContext jcr = JAXBContext.newInstance(ReportingSettings.class);

		Unmarshaller ur = jcr.createUnmarshaller();

		try (FileInputStream fis = new FileInputStream(new File(reportingConfigFilePath))) {
			reportingSettings = (ReportingSettings) ur.unmarshal(fis);
		}

		// For standalone JasperReports (pure .jrxml dropped into config/reports-jasper/):
		// if conncode is empty, resolve the DB connection dynamically using the
		// 3-tier datasource.properties priority:
		//   1. Per-report override — config/reports-jasper/{report-folder}/datasource.properties
		//   2. Global JasperReports override — config/reports-jasper/datasource.properties
		//   3. ReportBurster's default DB connection (marked as "default" in Connections settings)
		// This does NOT apply to inline/wrapper .jrxml templates (output type = jasper)
		// which always use the parent report's DB connection from its own conncode.
		if ("ds.jasper".equals(reportingSettings.report.datasource.type)
				&& (Objects.isNull(reportingSettings.report.datasource.sqloptions)
						|| Objects.isNull(reportingSettings.report.datasource.sqloptions.conncode)
						|| StringUtils.isBlank(reportingSettings.report.datasource.sqloptions.conncode))) {

			String resolvedConnCode = resolveJasperConnectionCode(configFolderPath);
			if (resolvedConnCode != null) {
				if (reportingSettings.report.datasource.sqloptions == null) {
					reportingSettings.report.datasource.sqloptions = new ReportSettings.DataSource.SQLOptions();
				}
				reportingSettings.report.datasource.sqloptions.conncode = resolvedConnCode;
				log.debug("Dynamically resolved DB connection for ds.jasper: {}", resolvedConnCode);
			}
		}

		if (!Objects.isNull(reportingSettings.report.datasource.sqloptions)
				&& !Objects.isNull(reportingSettings.report.datasource.sqloptions.conncode)) {

			String connCode = reportingSettings.report.datasource.sqloptions.conncode;

			if (StringUtils.isNotBlank(connCode)) {
				// config/reports/payslips
				configFolderPath = Paths.get(this.configurationFilePath).getParent().toString();

				// config/reports
				configFolderPath = Paths.get(configFolderPath).getParent().toString();

				// config
				configFolderPath = Paths.get(configFolderPath).getParent().toString();

				String dbConfigFilePath = configFolderPath + "/connections/" + connCode + "/" + connCode + ".xml";

				// Special-case: synthesize settings for packaged sample Northwind databases
				String codeLower = connCode == null ? "" : connCode.trim().toLowerCase();
				if (codeLower.contains("rbt-sample-northwind-sqlite-4f2")) {
					String dbFilePath = null;
					String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
					if (portable != null && !portable.trim().isEmpty()) {
						dbFilePath = portable + java.io.File.separator + "db" + java.io.File.separator
								+ "sample-northwind-sqlite" + java.io.File.separator + "northwind.db";
					} else {
						try {
							dbFilePath = Utils.getDbFolderPath()
									+ java.io.File.separator + "sample-northwind-sqlite" + java.io.File.separator
									+ "northwind.db";
						} catch (Throwable t) {
							dbFilePath = "db" + java.io.File.separator + "sample-northwind-sqlite"
									+ java.io.File.separator + "northwind.db";
						}
					}

					java.io.File dbFile = new java.io.File(dbFilePath);
					String resolvedPath = dbFile.getAbsolutePath();
					String jdbcUrl = "jdbc:sqlite:" + resolvedPath;

					connectionDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
					ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
					ServerDatabaseSettings server = new ServerDatabaseSettings();
					server.type = "sqlite";
					server.driver = "org.sqlite.JDBC";
					server.url = jdbcUrl;
					server.userid = "";
					server.userpassword = "";
					conn.databaseserver = server;
					connectionDatabaseSettings.connection = conn;

				} else if (codeLower.contains("rbt-sample-northwind-duckdb-4f2")) {
					// Virtual DuckDB connection — file on disk, invisible to UI
					String dbFilePath = null;
					String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
					if (portable != null && !portable.trim().isEmpty()) {
						dbFilePath = portable + java.io.File.separator + "db" + java.io.File.separator
								+ "sample-northwind-duckdb" + java.io.File.separator + "northwind.duckdb";
					} else {
						try {
							dbFilePath = Utils.getDbFolderPath()
									+ java.io.File.separator + "sample-northwind-duckdb" + java.io.File.separator
									+ "northwind.duckdb";
						} catch (Throwable t) {
							dbFilePath = "db" + java.io.File.separator + "sample-northwind-duckdb"
									+ java.io.File.separator + "northwind.duckdb";
						}
					}

					java.io.File dbFile = new java.io.File(dbFilePath);
					String resolvedPath = dbFile.getAbsolutePath();
					String jdbcUrl = "jdbc:duckdb:" + resolvedPath;

					connectionDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
					ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
					ServerDatabaseSettings server = new ServerDatabaseSettings();
					server.type = "duckdb";
					server.driver = "org.duckdb.DuckDBDriver";
					server.url = jdbcUrl;
					server.database = resolvedPath;
					server.userid = "";
					server.userpassword = "";
					conn.databaseserver = server;
					connectionDatabaseSettings.connection = conn;

				} else if (codeLower.contains("rbt-sample-northwind-clickhouse-4f2")) {
					// ClickHouse starter pack connection — hardcoded defaults (localhost:8123/northwind)
					// Requires ClickHouse starter pack to be running; not a file on disk like DuckDB
					connectionDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
					ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
					ServerDatabaseSettings server = new ServerDatabaseSettings();
					server.type = "clickhouse";
					server.host = "localhost";
					server.port = "8123";
					server.database = "northwind";
					server.userid = "default";
					server.userpassword = "clickhouse";
					conn.databaseserver = server;
					connectionDatabaseSettings.connection = conn;

				} else {
					jcr = JAXBContext.newInstance(DocumentBursterConnectionDatabaseSettings.class);
					ur = jcr.createUnmarshaller();
					try (FileInputStream fis = new FileInputStream(new File(dbConfigFilePath))) {
						connectionDatabaseSettings = (DocumentBursterConnectionDatabaseSettings) ur.unmarshal(fis);
					}
				}

				if (connectionDatabaseSettings.connection != null
						&& connectionDatabaseSettings.connection.databaseserver != null) {
					connectionDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();
				}

			}

		}
	}

	/**
	 * Resolves DB connection code for standalone JasperReports (pure .jrxml in
	 * config/reports-jasper/) using 3-tier priority:
	 *   1. Per-report override — {report-folder}/datasource.properties
	 *   2. Global JasperReports override — config/reports-jasper/datasource.properties
	 *   3. ReportBurster's default DB connection (first db-* with default=true)
	 * Does NOT apply to inline/wrapper .jrxml templates (output type = jasper)
	 * which always use the parent report's DB connection.
	 */
	private String resolveJasperConnectionCode(String reportConfigFolderPath) {
		try {
			// 1. Per-report: datasource.properties in the report folder
			File reportDsProps = new File(reportConfigFolderPath, "datasource.properties");
			String code = readConnectionCodeFromProperties(reportDsProps);
			if (code != null) return code;

			// 2. Global: datasource.properties in config/reports-jasper/
			Path parentDir = Paths.get(reportConfigFolderPath).getParent();
			if (parentDir != null) {
				File globalDsProps = new File(parentDir.toFile(), "datasource.properties");
				code = readConnectionCodeFromProperties(globalDsProps);
				if (code != null) return code;
			}

			// 3. Default: first db-* connection folder with <default>true</default>
			String connectionsDir = Paths.get(PORTABLE_EXECUTABLE_DIR_PATH, "config", "connections").toString();
			File connDir = new File(connectionsDir);
			if (connDir.exists() && connDir.isDirectory()) {
				File[] dbFolders = connDir.listFiles(
						(dir, name) -> new File(dir, name).isDirectory() && name.startsWith("db-"));
				if (dbFolders != null) {
					for (File dbFolder : dbFolders) {
						File xmlFile = new File(dbFolder, dbFolder.getName() + ".xml");
						if (xmlFile.exists()) {
							String content = Files.readString(xmlFile.toPath());
							if (content.contains("<default>true</default>")) {
								// Extract the connection code from <code>...</code>
								java.util.regex.Matcher m = java.util.regex.Pattern
										.compile("<code>\\s*([^<]+?)\\s*</code>").matcher(content);
								if (m.find()) return m.group(1);
							}
						}
					}
				}
			}
		} catch (Exception e) {
			log.warn("Failed to resolve jasper DB connection: {}", e.getMessage());
		}
		return null;
	}

	private String readConnectionCodeFromProperties(File propsFile) {
		if (propsFile.exists()) {
			try {
				Properties props = new Properties();
				try (FileInputStream fis = new FileInputStream(propsFile)) {
					props.load(fis);
				}
				String code = props.getProperty("connectionCode");
				if (code != null && !code.isBlank()) return code.trim();
			} catch (Exception e) {
				log.warn("Failed to read {}: {}", propsFile.getAbsolutePath(), e.getMessage());
			}
		}
		return null;
	}

	public ReportingSettings loadSettingsReportingWithCode(String reportCode) throws Exception {

		String reportingFilePath = Paths
				.get(PORTABLE_EXECUTABLE_DIR_PATH, "config/reports", reportCode, "reporting.xml").normalize()
				.toString();

		JAXBContext jcr = JAXBContext.newInstance(ReportingSettings.class);

		Unmarshaller ur = jcr.createUnmarshaller();
		ReportingSettings repSettings;
		try (FileInputStream fis = new FileInputStream(new File(reportingFilePath))) {
			repSettings = (ReportingSettings) ur.unmarshal(fis);
		}
		return repSettings;
	}

	public ReportingSettings loadSettingsReportingWithPath(String reportPath) throws Exception {

		JAXBContext jcr = JAXBContext.newInstance(ReportingSettings.class);

		Unmarshaller ur = jcr.createUnmarshaller();
		try (FileInputStream fis = new FileInputStream(new File(reportPath))) {
			reportingSettings = (ReportingSettings) ur.unmarshal(fis);
		}
		return reportingSettings;
	}

	public DocumentBursterConnectionEmailSettings loadSettingsConnectionEmail(String connectionCode) throws Exception {

		String connectionFilePath = Paths.get(PORTABLE_EXECUTABLE_DIR_PATH, connectionCode).normalize().toString();

		JAXBContext jcr = JAXBContext.newInstance(DocumentBursterConnectionEmailSettings.class);

		Unmarshaller ur = jcr.createUnmarshaller();

		try (FileInputStream fis = new FileInputStream(new File(connectionFilePath))) {
			connectionEmailSettings = (DocumentBursterConnectionEmailSettings) ur.unmarshal(fis);
		}

		return connectionEmailSettings;
	}

	public DocumentBursterConnectionDatabaseSettings loadSettingsConnectionDatabase(String connectionCode)
			throws Exception {

		// Virtual connections: synthesize settings for packaged sample databases
		String codeLower = connectionCode == null ? "" : connectionCode.trim().toLowerCase();

		if (codeLower.contains("rbt-sample-northwind-duckdb-4f2")) {
			String dbFilePath = null;
			String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
			if (portable != null && !portable.trim().isEmpty()) {
				dbFilePath = portable + java.io.File.separator + "db" + java.io.File.separator
						+ "sample-northwind-duckdb" + java.io.File.separator + "northwind.duckdb";
			} else {
				try {
					dbFilePath = Utils.getDbFolderPath()
							+ java.io.File.separator + "sample-northwind-duckdb" + java.io.File.separator
							+ "northwind.duckdb";
				} catch (Throwable t) {
					dbFilePath = "db" + java.io.File.separator + "sample-northwind-duckdb"
							+ java.io.File.separator + "northwind.duckdb";
				}
			}

			java.io.File dbFile = new java.io.File(dbFilePath);
			String resolvedPath = dbFile.getAbsolutePath();
			String jdbcUrl = "jdbc:duckdb:" + resolvedPath;

			DocumentBursterConnectionDatabaseSettings connDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
			ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
			ServerDatabaseSettings server = new ServerDatabaseSettings();
			server.type = "duckdb";
			server.driver = "org.duckdb.DuckDBDriver";
			server.url = jdbcUrl;
			server.database = resolvedPath;
			server.userid = "";
			server.userpassword = "";
			conn.databaseserver = server;
			connDatabaseSettings.connection = conn;

			if (connDatabaseSettings.connection != null && connDatabaseSettings.connection.databaseserver != null)
				connDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();

			return connDatabaseSettings;

		} else if (codeLower.contains("rbt-sample-northwind-clickhouse-4f2")) {
			// ClickHouse starter pack connection — hardcoded defaults (localhost:8123/northwind)
			// Requires ClickHouse starter pack to be running; not a file on disk like DuckDB
			DocumentBursterConnectionDatabaseSettings connDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
			ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
			ServerDatabaseSettings server = new ServerDatabaseSettings();
			server.type = "clickhouse";
			server.host = "localhost";
			server.port = "8123";
			server.database = "northwind";
			server.userid = "default";
			server.userpassword = "clickhouse";
			conn.databaseserver = server;
			connDatabaseSettings.connection = conn;

			if (connDatabaseSettings.connection != null && connDatabaseSettings.connection.databaseserver != null)
				connDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();

			return connDatabaseSettings;
		} else if (codeLower.contains("rbt-sample-northwind-sqlite-4f2")) {
			String dbFilePath = null;
			String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
			if (portable != null && !portable.trim().isEmpty()) {
				dbFilePath = portable + java.io.File.separator + "db" + java.io.File.separator
						+ "sample-northwind-sqlite" + java.io.File.separator + "northwind.db";
			} else {
				try {
					dbFilePath = Utils.getDbFolderPath()
							+ java.io.File.separator + "sample-northwind-sqlite" + java.io.File.separator
							+ "northwind.db";
				} catch (Throwable t) {
					dbFilePath = "db" + java.io.File.separator + "sample-northwind-sqlite"
							+ java.io.File.separator + "northwind.db";
				}
			}

			java.io.File dbFile = new java.io.File(dbFilePath);
			String resolvedPath = dbFile.getAbsolutePath();
			String jdbcUrl = "jdbc:sqlite:" + resolvedPath;

			DocumentBursterConnectionDatabaseSettings connDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
			ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
			ServerDatabaseSettings server = new ServerDatabaseSettings();
			server.type = "sqlite";
			server.driver = "org.sqlite.JDBC";
			server.url = jdbcUrl;
			server.database = resolvedPath;
			server.userid = "";
			server.userpassword = "";
			conn.databaseserver = server;
			connDatabaseSettings.connection = conn;

			if (connDatabaseSettings.connection != null && connDatabaseSettings.connection.databaseserver != null)
				connDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();

			return connDatabaseSettings;
		}

		String connectionConfigFilePath = Paths
				.get(PORTABLE_EXECUTABLE_DIR_PATH, "config/connections", connectionCode, connectionCode + ".xml")
				.normalize().toString();

		return this.loadSettingsConnectionDatabaseByPath(connectionConfigFilePath);

	}

	public DocumentBursterConnectionDatabaseSettings loadSettingsConnectionDatabaseByPath(String connectionFilePath)
			throws Exception {
		// System.out.println("loadSettingsConnection connectionConfigFilePath = " +
		// connectionConfigFilePath);

		// If path references our packaged sample DB folder (db/sample-northwind-sqlite/),
		// synthesize settings instead of reading XML.
		// IMPORTANT: Only match the actual sample DB path pattern, NOT connection config
		// paths like config/connections/db-northwind-sqlite/ which happen to contain
		// "northwind-sqlite" in the folder name due to the db-vendor naming convention.
		String pathLower = connectionFilePath == null ? "" : connectionFilePath.toLowerCase().replace("\\", "/");
		boolean isSampleDbPath = pathLower.contains("db/sample-northwind-sqlite/")
				|| pathLower.contains("db/sample-northwind-sqlite-sample/");
		if (isSampleDbPath) {
			String dbFilePath = null;
			String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
			if (portable != null && !portable.trim().isEmpty()) {
				dbFilePath = portable + java.io.File.separator + "db" + java.io.File.separator
						+ "sample-northwind-sqlite" + java.io.File.separator + "northwind.db";
			} else {
				try {
					dbFilePath = Utils.getDbFolderPath()
							+ java.io.File.separator + "sample-northwind-sqlite" + java.io.File.separator
							+ "northwind.db";
				} catch (Throwable t) {
					dbFilePath = "db" + java.io.File.separator + "sample-northwind-sqlite"
							+ java.io.File.separator + "northwind.db";
				}
			}

			java.io.File dbFile = new java.io.File(dbFilePath);
			String resolvedPath = dbFile.getAbsolutePath();
			String jdbcUrl = "jdbc:sqlite:" + resolvedPath;

			DocumentBursterConnectionDatabaseSettings connDatabaseSettings = new DocumentBursterConnectionDatabaseSettings();
			ConnectionDatabaseSettings conn = new ConnectionDatabaseSettings();
			ServerDatabaseSettings server = new ServerDatabaseSettings();
			server.type = "sqlite";
			server.driver = "org.sqlite.JDBC";
			server.url = jdbcUrl;
			server.userid = "";
			server.userpassword = "";
			conn.databaseserver = server;
			connDatabaseSettings.connection = conn;

			if (connDatabaseSettings.connection != null && connDatabaseSettings.connection.databaseserver != null)
				connDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();

			return connDatabaseSettings;
		}

		JAXBContext jcr = JAXBContext.newInstance(DocumentBursterConnectionDatabaseSettings.class);
		Unmarshaller ur = jcr.createUnmarshaller();
		DocumentBursterConnectionDatabaseSettings connDatabaseSettings;
		try (FileInputStream fis = new FileInputStream(new File(connectionFilePath))) {
			connDatabaseSettings = (DocumentBursterConnectionDatabaseSettings) ur.unmarshal(fis);
		}

		if (connDatabaseSettings != null && connDatabaseSettings.connection != null
				&& connDatabaseSettings.connection.databaseserver != null) {
			connDatabaseSettings.connection.databaseserver.ensureDriverAndUrl();
		}

		return connDatabaseSettings;

	}

	private void _sortAttachments() {

		if (docSettings.settings.attachments.items.attachmentItems == null)
			return;

		if (docSettings.settings.attachments.items.attachmentItems.size() > 0) {

			Comparator<Attachment> COMPARATOR = new Comparator<Attachment>() {
				public int compare(Attachment a1, Attachment a2) {
					return a1.order - a2.order;
				}
			};

			Collections.sort(docSettings.settings.attachments.items.attachmentItems, COMPARATOR);
		}

	}

	public BursterSettings getSettings() {
		return docSettings.settings;
	}

	public FreeMarkerSettings getFreeMarkerSettings() {
		return docSettings.settings.freemarker;
	}

	public ReportSettings.DataSource getReportDataSource() {
		return reportingSettings.report.datasource;
	}

	public String getReportFolderNameId() {

		if (!this.getCapabilities().reportgenerationmailmerge)
			return StringUtils.EMPTY;

		return this.getTemplateName().toLowerCase();
	}

	public ReportSettings.Template getReportTemplate() {
		return reportingSettings.report.template;
	}

	public String getConfigurationFilePath() {
		return this.configurationFilePath;
	}

	public String setConfigurationFilePath(String configurationFilePath) {
		return this.configurationFilePath = configurationFilePath;
	}

	public Capabilities getCapabilities() {
		return docSettings.settings.capabilities;
	}

	public String getTemplateName() {
		return docSettings.settings.template.trim();
	}

	public String getVersion() {
		return docSettings.settings.version;
	}

	public String getBurstFileName() {
		return docSettings.settings.burstfilename.trim();
	}

	public String getOutputFolder() {
		return docSettings.settings.outputfolder.trim();
	}

	public String getBackupFolder() {
		return docSettings.settings.backupfolder.trim();
	}

	public boolean isQuarantineFiles() {
		return docSettings.settings.quarantinefiles;
	}

	public String getQuarantineFolder() {
		return docSettings.settings.quarantinefolder.trim();
	}

	public String getStatsFileName() {
		return docSettings.settings.statsfilename.trim();
	}

	public String getLogsArchivesFolder() {

		return docSettings.settings.logsarchivesfolder.trim();
	}

	public SendFiles getSendFiles() {
		return docSettings.settings.sendfiles;
	}

	public boolean isSettingsLoaded() {
		return docSettings != null && docSettings.settings != null;
	}

	public boolean isDeleteFiles() {
		return docSettings.settings.deletefiles;
	}

	public boolean isHtmlEmail() {
		return docSettings.settings.htmlemail;
	}

	public void setHtmlEmail(boolean htmlEmail) {
		docSettings.settings.htmlemail = htmlEmail;
	}

	public boolean isHtmlEmailEditCode() {
		return docSettings.settings.htmlemaileditcode;
	}

	public boolean isSortByPosition() {
		return docSettings.settings.sortbyposition;
	}

	public boolean isShouldSeparateByBeads() {
		return docSettings.settings.shouldseparatebybeads;
	}

	public boolean isSuppressDuplicateOverlappingText() {
		return docSettings.settings.suppressduplicateoverlappingtext;
	}

	public float getAverageCharTolerance() {
		return docSettings.settings.averagechartolerancevalue;
	}

	public float getSpacingTolerance() {
		return docSettings.settings.spacingtolerancevalue;
	}

	public int getNumberOfUserVariables() {
		return docSettings.settings.numberofuservariables;
	}

	public void setNumberOfVariables(int numberOfUserVariables) {
		docSettings.settings.numberofuservariables = numberOfUserVariables;
	}

	public double getDelayEachDistributionBy() {
		return docSettings.settings.delayeachdistributionby;
	}

	public void setDelayEachDistributionBy(double delayEachDistributionBy) {
		docSettings.settings.delayeachdistributionby = delayEachDistributionBy;
	}

	public boolean isReuseTokensWhenNotFound() {
		return docSettings.settings.reusetokenswhennotfound;
	}

	public boolean isSplit2ndTime() {
		return docSettings.settings.split2ndtime;
	}

	public boolean isFailJobIfAnyDistributionFails() {
		return docSettings.settings.failjobifanydistributionfails;
	}

	public boolean isEnableRetryPolicy() {
		return docSettings.settings.enableretrypolicy;
	}

	public String getLanguage() {
		return docSettings.settings.locale.language;
	}

	public String getCountry() {
		return docSettings.settings.locale.country;
	}

	public List<Attachment> getAttachments() {

		if (docSettings.settings.attachments.items.attachmentItems == null)
			return new ArrayList<Attachment>();

		return docSettings.settings.attachments.items.attachmentItems;

	}

	public boolean isArchiveAttachments() {
		return docSettings.settings.attachments.archive.archiveattachments;
	}

	public String getArchiveFileName() {
		return docSettings.settings.attachments.archive.archivefilename;
	}

	public EmailSettings getEmailSettings() {
		return docSettings.settings.emailsettings;
	}

	public boolean getEmailServerUseConn() {
		return docSettings.settings.emailserver.useconn;
	}

	public String getEmailServerConnCode() {
		return docSettings.settings.emailserver.conncode;
	}

	public String getEmailServerUserId() {
		return docSettings.settings.emailserver.userid;
	}

	public String getEmailServerUserPassword() {
		return docSettings.settings.emailserver.userpassword;
	}

	public String getEmailServerHost() {
		return docSettings.settings.emailserver.host;
	}

	public String getEmailServerPort() {
		return docSettings.settings.emailserver.port;
	}

	public String getEmailServerFrom() {
		return docSettings.settings.emailserver.fromaddress;
	}

	public String getEmailServerName() {
		return docSettings.settings.emailserver.name;
	}

	public boolean isEmailServerUseTLS() {
		return docSettings.settings.emailserver.usetls;
	}

	public boolean isEmailServerUseSSL() {
		return docSettings.settings.emailserver.usessl;
	}

	public String getTestEmailServerUserId() {
		return docSettings.settings.qualityassurance.emailserver.userid;
	}

	public String getTestEmailServerUserPassword() {
		return docSettings.settings.qualityassurance.emailserver.userpassword;
	}

	public String getTestEmailServerHost() {
		return docSettings.settings.qualityassurance.emailserver.host;
	}

	public String getTestEmailServerPort() {
		return docSettings.settings.qualityassurance.emailserver.port;
	}

	public String getTestEmailServerFrom() {
		return docSettings.settings.qualityassurance.emailserver.fromaddress;
	}

	public String getTestEmailServerName() {
		return docSettings.settings.qualityassurance.emailserver.name;
	}

	public boolean isTestEmailServerUseTLS() {
		return docSettings.settings.qualityassurance.emailserver.usetls;
	}

	public boolean isTestEmailServerUseSSL() {
		return docSettings.settings.qualityassurance.emailserver.usessl;
	}

	public SimpleJavaMail getSimpleJavaMail() {
		return docSettings.settings.simplejavamail;
	}

	public SimpleJavaMail setSimpleJavaMail(SimpleJavaMail sjm) {
		return docSettings.settings.simplejavamail = sjm;
	}

	public EmailRfc2822Validator getEmailRfc2822Validator() {
		return docSettings.settings.emailrfc2822validator;
	}

	public UploadSettings getUploadSettings() {
		return docSettings.settings.uploadsettings;
	}

	public WebUploadSettings getWebUploadSettings() {
		return docSettings.settings.webuploadsettings;
	}

	public SmsSettings getSmsSettings() {
		return docSettings.settings.smssettings;
	}

	public RetryPolicy getRetryPolicy() {
		return docSettings.settings.retrypolicy;
	}

	public String getMergeFileName() {
		return docSettings.settings.mergefilename;
	}

	public void setSendFilesEmail(boolean sendFilesEmail) {
		docSettings.settings.sendfiles.email = sendFilesEmail;
	}

	public void setSendFilesUpload(boolean sendFilesUpload) {
		docSettings.settings.sendfiles.upload = sendFilesUpload;
	}

	public void setSendFilesWeb(boolean sendFilesWeb) {
		docSettings.settings.sendfiles.web = sendFilesWeb;
	}

	public void setSendFilesSms(boolean sendFilesSms) {
		docSettings.settings.sendfiles.sms = sendFilesSms;
	}

	public void setCapabilityReportGenerationMailMerge(boolean reportgenerationmailmerge) {
		docSettings.settings.capabilities.reportgenerationmailmerge = reportgenerationmailmerge;
	}

	public void setEmailServerHost(String host) {
		docSettings.settings.emailserver.host = host;
	}

	public void setEmailServerPort(String port) {
		docSettings.settings.emailserver.port = port;
	}

	public void setEmailServerUserId(String userId) {
		docSettings.settings.emailserver.userid = userId;
	}

	public void setEmailServerUserPassword(String userPassword) {
		docSettings.settings.emailserver.userpassword = userPassword;
	}

	public void setEmailServerUseTLS(boolean useTls) {
		docSettings.settings.emailserver.usetls = useTls;
	}

	public void setEmailServerUseSSL(boolean useSsl) {
		docSettings.settings.emailserver.usessl = useSsl;
	}

	public void setEmailServerFrom(String fromAddress) {
		docSettings.settings.emailserver.fromaddress = fromAddress;
	}

	public void setEmailServerName(String name) {
		docSettings.settings.emailserver.name = name;
	}

	public void setTestEmailServerHost(String host) {
		docSettings.settings.qualityassurance.emailserver.host = host;
	}

	public void setTestEmailServerPort(String port) {
		docSettings.settings.qualityassurance.emailserver.port = port;
	}

	public void setTesttEmailServerUserId(String userId) {
		docSettings.settings.qualityassurance.emailserver.userid = userId;
	}

	public void setTestEmailServerUserPassword(String userPassword) {
		docSettings.settings.qualityassurance.emailserver.userpassword = userPassword;
	}

	public void setTestEmailServerUseTLS(boolean useTls) {
		docSettings.settings.qualityassurance.emailserver.usetls = useTls;
	}

	public void setTestEmailServerUseSSL(boolean useSsl) {
		docSettings.settings.qualityassurance.emailserver.usessl = useSsl;
	}

	public void setTestEmailServerFrom(String fromAddress) {
		docSettings.settings.qualityassurance.emailserver.fromaddress = fromAddress;
	}

	public void setTestEmailServerName(String name) {
		docSettings.settings.qualityassurance.emailserver.name = name;
	}

	public void setEmailTo(String to) {
		docSettings.settings.emailsettings.to = to;
	}

	public void setEmailCc(String cc) {
		docSettings.settings.emailsettings.cc = cc;
	}

	public void setEmailBcc(String bcc) {
		docSettings.settings.emailsettings.bcc = bcc;
	}

	public void setEmailSubject(String subject) {
		docSettings.settings.emailsettings.subject = subject;
	}

	public void setEmailText(String text) {
		docSettings.settings.emailsettings.text = text;
	}

	public void addAttachment(Attachment item) {
		getAttachments().add(item);
	}

	public void setSplit2ndTime(boolean split2ndtime) {
		docSettings.settings.split2ndtime = split2ndtime;
	}

	public void setArchiveAttachments(boolean archiveAttachments) {
		docSettings.settings.attachments.archive.archiveattachments = archiveAttachments;
	}

	public void setArchiveFileName(String archiveFileName) {
		docSettings.settings.attachments.archive.archivefilename = archiveFileName;
	}

	public void setDeleteFiles(boolean deleteFiles) {
		docSettings.settings.deletefiles = deleteFiles;
	}

	public void setFtpCommand(String ftpCommand) {
		docSettings.settings.uploadsettings.ftpcommand = ftpCommand;
	}

	public void setOutputFolder(String folder) {
		docSettings.settings.outputfolder = folder;
	}

	public void setBackupFolder(String folder) {
		docSettings.settings.backupfolder = folder;
	}

	public void setQuarantineFolder(String folder) {
		docSettings.settings.quarantinefolder = folder;
	}

	public void setBurstFileName(String burstFileName) {
		docSettings.settings.burstfilename = burstFileName;
	}

	public void setStatsFileName(String statsFileName) {
		docSettings.settings.statsfilename = statsFileName;
	}

	public void setLogsArchivesFolder(String folder) {
		docSettings.settings.logsarchivesfolder = folder;
	}

	public void setReuseTokensWhenNotFound(boolean reuseTokenWhenNotFound) {
		docSettings.settings.reusetokenswhennotfound = reuseTokenWhenNotFound;
	}

	public void setFailJobIfAnyDistributionFails(boolean failJobIfAnyDistributionFails) {

		docSettings.settings.failjobifanydistributionfails = failJobIfAnyDistributionFails;

	}

	public void setEnableRetryPolicy(boolean enableRetryPolicy) {

		docSettings.settings.enableretrypolicy = enableRetryPolicy;

	}

	public String getStartBurstTokenDelimiter() {
		return docSettings.settings.bursttokendelimiters.start;
	}

	public String getEndBurstTokenDelimiter() {
		return docSettings.settings.bursttokendelimiters.end;
	}

	public void setStartBurstTokenDelimiter(String startDelimiter) {
		docSettings.settings.bursttokendelimiters.start = startDelimiter;
	}

	public boolean getDumpRecordDataAsXml() {
		return docSettings.settings.dumprecorddataasxml;
	}

	public void setDumpRecordDataAsXml(boolean dumprecorddataasxml) {
		docSettings.settings.dumprecorddataasxml = dumprecorddataasxml;
	}

	public void setEndBurstTokenDelimiter(String endDelimiter) {
		docSettings.settings.bursttokendelimiters.end = endDelimiter;
	}

	public String getStartBurstTokenDelimiter2nd() {
		return docSettings.settings.bursttokendelimiters.start2nd;
	}

	public String getEndBurstTokenDelimiter2nd() {
		return docSettings.settings.bursttokendelimiters.end2nd;
	}

	public void setStartBurstTokenDelimiter2nd(String startDelimiter) {
		docSettings.settings.bursttokendelimiters.start2nd = startDelimiter;
	}

	public void setEndBurstTokenDelimiter2nd(String endDelimiter) {
		docSettings.settings.bursttokendelimiters.end2nd = endDelimiter;
	}

	public void setFileShareCommand(String fileShareCommand) {
		docSettings.settings.uploadsettings.filesharecommand = fileShareCommand;
	}

	public void setFtpsCommand(String ftpsCommand) {
		docSettings.settings.uploadsettings.ftpscommand = ftpsCommand;
	}

	public void setSftpCommand(String sftpCommand) {
		docSettings.settings.uploadsettings.sftpcommand = sftpCommand;

	}

	public void setHttpCommand(String httpCommand) {
		docSettings.settings.uploadsettings.httpcommand = httpCommand;
	}

	public void setCloudCommand(String cloudCommand) {
		docSettings.settings.uploadsettings.cloudcommand = cloudCommand;
	}

	public void setDocumentBursterWebCommand(String documentBursterWebCommand) {
		docSettings.settings.webuploadsettings.documentbursterwebcommand = documentBursterWebCommand;
	}

	public void setMSSharePointCommand(String msSharePointCommand) {
		docSettings.settings.webuploadsettings.mssharepointcommand = msSharePointCommand;
	}

	public void setWordPressCommand(String wordPressCommand) {
		docSettings.settings.webuploadsettings.wordpresscommand = wordPressCommand;

	}

	public void setDrupalCommand(String drupalCommand) {
		docSettings.settings.webuploadsettings.drupalcommand = drupalCommand;

	}

	public void setJoomlaCommand(String joomlaCommand) {
		docSettings.settings.webuploadsettings.joomlacommand = joomlaCommand;

	}

	public void setOtherWebCommand(String otherWebCommand) {
		docSettings.settings.webuploadsettings.otherwebcommand = otherWebCommand;

	}

	public void setRetryPolicyDelay(int delay) {
		docSettings.settings.retrypolicy.delay = delay;
	}

	public void setRetryPolicyMaxDelay(int maxDelay) {
		docSettings.settings.retrypolicy.maxdelay = maxDelay;
	}

	public void setRetryPolicyMaxRetries(int maxRetries) {
		docSettings.settings.retrypolicy.maxretries = maxRetries;
	}

	public String toString() {
		return ReflectionToStringBuilder.toString(this, ToStringStyle.MULTI_LINE_STYLE);
	}
}

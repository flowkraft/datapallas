package com.flowkraft.reports;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.system.dtos.FindCriteriaDto;
import com.sourcekraft.documentburster.utils.Utils;
import com.flowkraft.system.services.FileSystemService;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser;

import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;
import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptionsParser;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;

@Service
public class ReportsService {

	private static final Logger log = LoggerFactory.getLogger(ReportsService.class);

	@Autowired
	FileSystemService fileSystemService;

	/**
	 * Helper method to safely extract XML tag content.
	 * Returns defaultValue if tag is not found.
	 */
	private String extractXmlTagValue(String xmlContent, String tagName, String defaultValue) {
		String openTag = "<" + tagName + ">";
		String closeTag = "</" + tagName + ">";
		int startPos = xmlContent.indexOf(openTag);
		int endPos = xmlContent.indexOf(closeTag);
		if (startPos >= 0 && endPos > startPos) {
			String raw = xmlContent.substring(startPos + openTag.length(), endPos).trim();
			return raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
					.replace("&quot;", "\"").replace("&apos;", "'");
		}
		return defaultValue;
	}

	/**
	 * MINIMAL LOADING - Fast startup, no DSL parsing.
	 * Returns only basic metadata needed for UI menus.
	 * DSL options (reportParameters, tabulatorOptions, chartOptions, pivotTableOptions) are NOT loaded.
	 */
	public Stream<ConfigurationFileInfo> loadSettingsAllMinimal() throws Exception {

		List<ConfigurationFileInfo> configurationFiles = new ArrayList<ConfigurationFileInfo>();

		List<String> matching = new ArrayList<String>();
		matching.add("*.xml");
		Optional<Boolean> files = Optional.of(true);
		Optional<Boolean> directories = Optional.of(false);
		Optional<Boolean> recursive = Optional.of(false);
		Optional<Boolean> ignoreCase = Optional.of(true);

		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null), directories.orElse(null),
				recursive.orElse(null), ignoreCase.orElse(null));

		List<String> burstConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/burst", criteriaDto);

		matching = new ArrayList<String>();
		matching.add("settings.xml");
		files = Optional.of(true);
		directories = Optional.of(false);
		recursive = Optional.of(true);
		ignoreCase = Optional.of(true);

		criteriaDto = new FindCriteriaDto(matching, files.orElse(null), directories.orElse(null),
				recursive.orElse(null), ignoreCase.orElse(null));

		List<String> reportsConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/reports",
				criteriaDto);

		List<String> samplesConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/samples",
				criteriaDto);

		List<String> configFilePaths = new ArrayList<>();
		configFilePaths.addAll(burstConfigFilePaths);
		configFilePaths.addAll(reportsConfigFilePaths);
		configFilePaths.addAll(samplesConfigFilePaths);

		for (String filePath : configFilePaths) {
			String configurationFileName = Paths.get(filePath).getFileName().toString();

			boolean isFallbackSettings = filePath.endsWith("burst/settings.xml");

			// Exclude: _defaults, preferences, and _frend samples (frontend-only showcases)
			boolean isRealSettingsXmlFile = !filePath.endsWith("_defaults/settings.xml")
					&& !filePath.endsWith("preferences/settings.xml")
					&& !filePath.contains("/_frend/");

			if (isRealSettingsXmlFile) {

				String fullFilePath = Utils.resolvePathAgainstPortableDir(filePath.replaceFirst("^/", ""));
				String settingsFileContent = fileSystemService.unixCliCat(fullFilePath);

				// Parse basic fields using safe helper method
				String configurationName = extractXmlTagValue(settingsFileContent, "template", "Unknown");
				boolean boolReportDistribution = Boolean.parseBoolean(
						extractXmlTagValue(settingsFileContent, "reportdistribution", "false"));
				boolean boolReportGenerationMailMerge = Boolean.parseBoolean(
						extractXmlTagValue(settingsFileContent, "reportgenerationmailmerge", "false"));
				boolean boolUseEmailConnection = Boolean.parseBoolean(
						extractXmlTagValue(settingsFileContent, "useconn", "false"));
				String strEmailConnectionCode = extractXmlTagValue(settingsFileContent, "conncode", StringUtils.EMPTY);

				String templateRelativeFilePath = "./config/burst/" + configurationFileName;
				String typeOfConfiguration = "config-burst-legacy";

				String folderName = Paths.get(filePath).getParent().getFileName().toString();

				String dsInputType = StringUtils.EMPTY;
				String scriptOptionsSelectFileExplorer = "globpattern";

				if (filePath.contains("config/reports/" + folderName)) {
					typeOfConfiguration = "config-reports";
					templateRelativeFilePath = "./config/reports/" + folderName + "/settings.xml";

				} else if (filePath.contains("config/samples/" + folderName)) {
					typeOfConfiguration = "config-samples";
					templateRelativeFilePath = "./config/samples/" + folderName + "/settings.xml";
				}

				String strDbConnectionCode = StringUtils.EMPTY;
				if (boolReportGenerationMailMerge) {
					String reportingXmlFilePath = Paths.get(fullFilePath).getParent().toString() + "/reporting.xml";
					String reportingXmlFileContent = fileSystemService.unixCliCat(reportingXmlFilePath);

					dsInputType = extractXmlTagValue(reportingXmlFileContent, "type", StringUtils.EMPTY);
					scriptOptionsSelectFileExplorer = extractXmlTagValue(reportingXmlFileContent, "selectfileexplorer", "globpattern");

					if (dsInputType.equals("ds.sqlquery") || dsInputType.equals("ds.scriptfile") || dsInputType.equals("ds.dashboard")) {
						strDbConnectionCode = extractXmlTagValue(reportingXmlFileContent, "conncode", StringUtils.EMPTY);
					}
				}

				ConfigurationFileInfo configFile = new ConfigurationFileInfo();
				configFile.fileName = configurationFileName;
				configFile.filePath = filePath.replace("\\", "/");
				configFile.relativeFilePath = templateRelativeFilePath;
				configFile.templateName = configurationName;
				configFile.isFallback = isFallbackSettings;
				configFile.capReportDistribution = boolReportDistribution;
				configFile.capReportGenerationMailMerge = boolReportGenerationMailMerge;
				configFile.dsInputType = dsInputType;
				configFile.scriptOptionsSelectFileExplorer = scriptOptionsSelectFileExplorer;
				configFile.notes = StringUtils.EMPTY;
				configFile.folderName = folderName;
				configFile.type = typeOfConfiguration;
				configFile.activeClicked = false;
				configFile.useEmlConn = boolUseEmailConnection;
				configFile.emlConnCode = strEmailConnectionCode;
				configFile.useDbConn = !strDbConnectionCode.isEmpty();
				configFile.dbConnCode = strDbConnectionCode;

				// NOTE: DSL options are NOT loaded here for performance
				// They will be loaded on-demand via loadConfigDetails()

				configurationFiles.add(configFile);
			}
		}

		// Scan for JasperReports in config/reports-jasper/
		scanJasperReports(configurationFiles);

		return configurationFiles.stream();
	}

	// --- JasperReports scanning ---

	private static final Pattern JRXML_NAME_PATTERN = Pattern
			.compile("<jasperReport[^>]*\\sname=\"([^\"]+)\"", Pattern.DOTALL);

	private void scanJasperReports(List<ConfigurationFileInfo> configurationFiles) throws Exception {
		String jasperReportsDir = Utils.resolvePathAgainstPortableDir("config/reports-jasper");
			File jasperDir = new File(jasperReportsDir);
			if (!jasperDir.exists() || !jasperDir.isDirectory()) {
				return;
			}

			// Find the default DB connection code
			String defaultDbConnectionCode = findDefaultDbConnectionCode();

			// Check for global datasource.properties in config/reports-jasper/
			String globalJasperConnectionCode = null;
			File globalDsProps = new File(jasperDir, "datasource.properties");
			if (globalDsProps.exists()) {
				Properties props = new Properties();
				try (FileInputStream fis = new FileInputStream(globalDsProps)) {
					props.load(fis);
				}
				String code = props.getProperty("connectionCode");
				if (code != null && !code.isBlank()) {
					globalJasperConnectionCode = code.trim();
				}
			}

			File[] reportFolders = jasperDir.listFiles(File::isDirectory);
			if (reportFolders == null)
				return;

			for (File reportFolder : reportFolders) {
				// Find .jrxml files in this folder
				File[] jrxmlFiles = reportFolder.listFiles((dir, name) -> name.toLowerCase().endsWith(".jrxml"));
				if (jrxmlFiles == null || jrxmlFiles.length == 0)
					continue;

				// Use the first .jrxml as the main report
				File mainJrxml = jrxmlFiles[0];
				String jrxmlContent = Files.readString(mainJrxml.toPath());

				// Extract report name
				String reportName = extractJrxmlReportName(jrxmlContent, reportFolder.getName());

				// Parameters are loaded on-demand via loadConfigDetails(), not at scan time

				// DB connection resolution for standalone JasperReports (pure .jrxml in
				// config/reports-jasper/) — highest priority wins:
				//   1. Per-report override — {report-folder}/datasource.properties
				//   2. Global JasperReports override — config/reports-jasper/datasource.properties
				//   3. DataPallas's default DB connection (marked "default" in Connections)
				// This is for UI display (ConfigurationFileInfo.dbConnectionCode).
				// The same 3-tier logic runs again at generation time in
				// Settings.loadSettingsReporting() to dynamically resolve the connection.
				// Does NOT apply to inline/wrapper .jrxml templates (output type = jasper)
				// which always use the parent report's DB connection.
				String connectionCode = defaultDbConnectionCode;
				if (globalJasperConnectionCode != null) {
					connectionCode = globalJasperConnectionCode;
				}
				File dsProps = new File(reportFolder, "datasource.properties");
				if (dsProps.exists()) {
					Properties props = new Properties();
					try (FileInputStream fis = new FileInputStream(dsProps)) {
						props.load(fis);
					}
					String code = props.getProperty("connectionCode");
					if (code != null && !code.isBlank()) {
						connectionCode = code.trim();
					}
				}

				// Auto-generate settings.xml and reporting.xml from defaults if missing
				ensureJasperConfigFiles(reportFolder, mainJrxml.getName(), reportName);

				ConfigurationFileInfo configFile = new ConfigurationFileInfo();
				configFile.fileName = "settings.xml";
				configFile.filePath = ("config/reports-jasper/" + reportFolder.getName() + "/settings.xml")
						.replace("\\", "/");
				configFile.relativeFilePath = "./config/reports-jasper/" + reportFolder.getName() + "/settings.xml";
				configFile.templateName = reportName;
				configFile.isFallback = false;
				configFile.capReportDistribution = false;
				configFile.capReportGenerationMailMerge = true;
				configFile.dsInputType = "ds.jasper";
				configFile.notes = StringUtils.EMPTY;
				configFile.folderName = reportFolder.getName();
				configFile.type = "config-jasper-reports";
				configFile.activeClicked = false;
				configFile.dbConnectionCode = connectionCode;
				configFile.jrxmlFilePath = ("/config/reports-jasper/" + reportFolder.getName() + "/" + mainJrxml.getName())
						.replace("\\", "/");

				configurationFiles.add(configFile);
			}
	}

	private String extractJrxmlReportName(String jrxmlContent, String defaultName) {
		Matcher m = JRXML_NAME_PATTERN.matcher(jrxmlContent);
		return m.find() ? m.group(1) : defaultName;
	}

	/**
	 * Auto-generates settings.xml and reporting.xml in a jasper report folder
	 * from the defaults, with correct overrides for JasperReports output.
	 * Only creates files that don't already exist (user customizations are preserved).
	 */
	private void ensureJasperConfigFiles(File reportFolder, String jrxmlFileName, String reportName) {
		try {
			String burstDir = Utils.resolvePathAgainstPortableDir("config/burst");
			String defaultsDir = Utils.resolvePathAgainstPortableDir("config/_defaults");

			// --- settings.xml (same pattern as NoExeAssembler) ---
			File settingsFile = new File(reportFolder, "settings.xml");
			if (!settingsFile.exists()) {
				String content = Files.readString(Paths.get(burstDir, "settings.xml"));

				// friendly template name
				content = content.replaceAll(
						"(?s)<template\\s*/>|<template>\\s*My Reports\\s*</template>",
						"<template>" + Matcher.quoteReplacement(reportName) + "</template>");

				// enable mailmerge (report generation)
				content = content.replaceAll(
						"(?s)<reportgenerationmailmerge\\s*/>|<reportgenerationmailmerge>\\s*false\\s*</reportgenerationmailmerge>",
						"<reportgenerationmailmerge>true</reportgenerationmailmerge>");

				// burstfilename: default to .pdf for JasperReports
				// (user can change to .xlsx, .csv, .html in General Settings)
				content = content.replaceAll(
						"(?s)<burstfilename>.*?</burstfilename>",
						"<burstfilename>\\$\\{burst_token}.pdf</burstfilename>");

				Files.writeString(settingsFile.toPath(), content);
				log.info("Auto-generated settings.xml for jasper report: {}", reportFolder.getName());
			}

			// --- reporting.xml (same pattern as NoExeAssembler) ---
			File reportingFile = new File(reportFolder, "reporting.xml");
			if (!reportingFile.exists()) {
				String content = Files.readString(Paths.get(defaultsDir, "reporting.xml"));

				// datasource type -> ds.jasper
				content = content.replaceAll("(?si)<type\\s*>\\s*ds\\.csvfile\\s*</type>",
						"<type>ds.jasper</type>");

				// output type -> output.jasper
				content = content.replaceAll("(?s)output\\.none", "output.jasper");

				// document path -> full relative path from app root
				// e.g. config/reports-jasper/employee-detail/employee_detail.jrxml
				Path appRoot = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				String jrxmlRelPath = appRoot.relativize(reportFolder.toPath().resolve(jrxmlFileName))
						.toString().replace('\\', '/');
				content = content.replaceAll(
						"(?s)<documentpath\\s*/>|<documentpath>\\s*</documentpath>",
						"<documentpath>" + Matcher.quoteReplacement(jrxmlRelPath) + "</documentpath>");

					Files.writeString(reportingFile.toPath(), content);
				log.info("Auto-generated reporting.xml for jasper report: {}", reportFolder.getName());
			}
		} catch (Exception e) {
			log.warn("Failed to auto-generate config files for {}: {}", reportFolder.getName(), e.getMessage());
		}
	}


	private String findDefaultDbConnectionCode() {
		try {
			File connectionsDir = new File(Utils.resolvePathAgainstPortableDir("config/connections"));
			if (!connectionsDir.exists())
				return null;

			File[] dbFolders = connectionsDir
					.listFiles((dir, name) -> new File(dir, name).isDirectory() && name.startsWith("db-"));
			if (dbFolders == null)
				return null;

			for (File dbFolder : dbFolders) {
				File xmlFile = new File(dbFolder, dbFolder.getName() + ".xml");
				if (xmlFile.exists()) {
					String content = Files.readString(xmlFile.toPath());
					if (content.contains("<default>true</default>")) {
						// Extract connection code
						String code = extractXmlTagValue(content, "code", null);
						if (code != null)
							return code;
					}
				}
			}
		} catch (Exception e) {
			log.error("Failed to find default DB connection: {}", e.getMessage(), e);
		}
		return null;
	}

	/**
	 * FULL DETAILS LOADING - Load DSL options for a specific configuration.
	 * Called on-demand when user selects a specific report to view/edit.
	 * Parses reportParameters, tabulatorOptions, chartOptions, pivotTableOptions.
	 * 
	 * @param settingsFilePath The absolute path to settings.xml — resolved by the caller via resolveSettingsPath()
	 * @return ConfigurationFileInfo with all DSL options populated
	 */
	public ConfigurationFileInfo loadConfigDetails(String settingsFilePath) throws Exception {
		
		String fullFilePath = settingsFilePath;
		Path settingsPath = Paths.get(fullFilePath);
		
		if (!Files.exists(settingsPath)) {
			return null;
		}
		
		// Get the folder containing settings.xml
		Path itemDir = settingsPath.getParent();
		String folderName = itemDir.getFileName().toString();
		
		ConfigurationFileInfo configDetails = new ConfigurationFileInfo();
		configDetails.folderName = folderName;
		configDetails.filePath = settingsFilePath.replace("\\", "/");
		
		// Determine type based on path
		if (settingsFilePath.contains("/config/reports-jasper/")) {
			configDetails.type = "config-jasper-reports";
			// Find the .jrxml in the same folder and parse parameters from it
			File[] jrxmlFiles = itemDir.toFile().listFiles(
					(dir, name) -> name.toLowerCase().endsWith(".jrxml"));
			if (jrxmlFiles != null && jrxmlFiles.length > 0) {
				String jrxmlContent = Files.readString(jrxmlFiles[0].toPath());
				configDetails.reportParameters = ReportParametersHelper.parseJrxmlParameters(jrxmlContent);
			}
			return configDetails;
		} else if (settingsFilePath.contains("/config/reports/")) {
			configDetails.type = "config-reports";
		} else if (settingsFilePath.contains("/config/samples/")) {
			configDetails.type = "config-samples";
		} else {
			// For burst configs, no DSL files to parse
			return configDetails;
		}
		
		// Load Report Parameters DSL
		String paramsSpecFileName = folderName + "-report-parameters-spec.groovy";
		Path paramsSpecPath = itemDir.resolve(paramsSpecFileName);

		if (Files.exists(paramsSpecPath)) {
			try {
				configDetails.reportParameters = ReportParametersHelper
						.parseGroovyParametersDslCode(Files.readString(paramsSpecPath));
			} catch (Exception e) {
				log.error("Failed to parse Report Parameters DSL for {}: {}", folderName, e.getMessage(), e);
			}
		}
		
		// Load Tabulator DSL
		String tabulatorConfigFileName = folderName + "-tabulator-config.groovy";
		Path tabulatorConfigPath = itemDir.resolve(tabulatorConfigFileName);

		if (Files.exists(tabulatorConfigPath)) {
			try {
				var tabulatorOptions = TabulatorOptionsParser.parseGroovyTabulatorDslCode(Files.readString(tabulatorConfigPath));
				if (tabulatorOptions != null) {
					configDetails.tabulatorOptions = new HashMap<>(tabulatorOptions.getOptions());
				}
			} catch (Exception e) {
				log.error("Failed to parse Tabulator DSL for {}: {}", folderName, e.getMessage(), e);
			}
		}
		
		// Load Chart DSL
		String chartConfigFileName = folderName + "-chart-config.groovy";
		Path chartConfigPath = itemDir.resolve(chartConfigFileName);

		if (Files.exists(chartConfigPath)) {
			try {
				var chartOptions = ChartOptionsParser.parseGroovyChartDslCode(Files.readString(chartConfigPath));
				if (chartOptions != null) {
					configDetails.chartOptions = new HashMap<>();
					if (chartOptions.getType() != null) {
						configDetails.chartOptions.put("type", chartOptions.getType());
					}
					if (chartOptions.getLabelField() != null) {
						configDetails.chartOptions.put("labelField", chartOptions.getLabelField());
					}
					if (chartOptions.getOptions() != null && !chartOptions.getOptions().isEmpty()) {
						configDetails.chartOptions.put("options", chartOptions.getOptions());
					}
					if (chartOptions.getLabels() != null && !chartOptions.getLabels().isEmpty()) {
						configDetails.chartOptions.put("labels", chartOptions.getLabels());
					}
					if (chartOptions.getDatasets() != null && !chartOptions.getDatasets().isEmpty()) {
						configDetails.chartOptions.put("datasets", chartOptions.getDatasets());
					}
					if (chartOptions.getData() != null && !chartOptions.getData().isEmpty()) {
						configDetails.chartOptions.put("data", chartOptions.getData());
					}
				}
			} catch (Exception e) {
				log.error("Failed to parse Chart DSL for {}: {}", folderName, e.getMessage(), e);
			}
		}

		// Load Pivot Table DSL
		String pivotConfigFileName = folderName + "-pivot-config.groovy";
		Path pivotConfigPath = itemDir.resolve(pivotConfigFileName);

		if (Files.exists(pivotConfigPath)) {
			try {
				var pivotOptions = PivotTableOptionsParser.parseGroovyPivotTableDslCode(Files.readString(pivotConfigPath));
				if (pivotOptions != null) {
					configDetails.pivotTableOptions = new HashMap<>();
					if (pivotOptions.getRows() != null && !pivotOptions.getRows().isEmpty()) {
						configDetails.pivotTableOptions.put("rows", pivotOptions.getRows());
					}
					if (pivotOptions.getCols() != null && !pivotOptions.getCols().isEmpty()) {
						configDetails.pivotTableOptions.put("cols", pivotOptions.getCols());
					}
					if (pivotOptions.getVals() != null && !pivotOptions.getVals().isEmpty()) {
						configDetails.pivotTableOptions.put("vals", pivotOptions.getVals());
					}
					if (pivotOptions.getAggregatorName() != null) {
						configDetails.pivotTableOptions.put("aggregatorName", pivotOptions.getAggregatorName());
					}
					if (pivotOptions.getRendererName() != null) {
						configDetails.pivotTableOptions.put("rendererName", pivotOptions.getRendererName());
					}
					if (pivotOptions.getRowOrder() != null) {
						configDetails.pivotTableOptions.put("rowOrder", pivotOptions.getRowOrder());
					}
					if (pivotOptions.getColOrder() != null) {
						configDetails.pivotTableOptions.put("colOrder", pivotOptions.getColOrder());
					}
					if (pivotOptions.getValueFilter() != null && !pivotOptions.getValueFilter().isEmpty()) {
						configDetails.pivotTableOptions.put("valueFilter", pivotOptions.getValueFilter());
					}
					if (pivotOptions.getOptions() != null && !pivotOptions.getOptions().isEmpty()) {
						configDetails.pivotTableOptions.put("options", pivotOptions.getOptions());
					}
					if (pivotOptions.getData() != null && !pivotOptions.getData().isEmpty()) {
						configDetails.pivotTableOptions.put("data", pivotOptions.getData());
					}
				}
			} catch (Exception e) {
				log.error("Failed to parse Pivot Table DSL for {}: {}", folderName, e.getMessage(), e);
			}
		}

		return configDetails;
	}

	/**
	 * FULL LOADING - Original method kept for backward compatibility.
	 * Still used when all details are needed upfront (e.g., during processing).
	 */
	public Stream<ConfigurationFileInfo> loadSettingsAll() throws Exception {

		List<ConfigurationFileInfo> configurationFiles = new ArrayList<ConfigurationFileInfo>();

		// AppPaths.CONFIG_DIR_PATH + "/burst"
		List<String> matching = new ArrayList<String>();

		matching.add("*.xml");
		Optional<Boolean> files = Optional.of(true);
		Optional<Boolean> directories = Optional.of(false);
		Optional<Boolean> recursive = Optional.of(false);
		Optional<Boolean> ignoreCase = Optional.of(true);

		// CORRECTED: Construct the DTO using orElse(null)
		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null), // Use orElse(null) here
				directories.orElse(null), // Use orElse(null) here
				recursive.orElse(null), // Use orElse(null) here
				ignoreCase.orElse(null) // Use orElse(null) here
		);

		// System.out.println("burst folder path = " + AppPaths.CONFIG_DIR_PATH +
		// "/burst");

		List<String> burstConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/burst", criteriaDto);

		// System.out.println("burstConfigFilePaths = " + burstConfigFilePaths);

		// AppPaths.CONFIG_DIR_PATH + "/reports"
		matching = new ArrayList<String>();

		matching.add("settings.xml");
		files = Optional.of(true);
		directories = Optional.of(false);
		recursive = Optional.of(true);
		ignoreCase = Optional.of(true);

		criteriaDto = new FindCriteriaDto(matching, files.orElse(null), directories.orElse(null),
				recursive.orElse(null), ignoreCase.orElse(null));

		List<String> reportsConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/reports",
				criteriaDto);

		// System.out.println("reportsConfigFilePaths = " + reportsConfigFilePaths);

		// AppPaths.CONFIG_DIR_PATH + "/samples"
		// matching = new ArrayList<String>();

		// matching.add("settings.xml");
		// files = Optional.of(true);
		// directories = Optional.of(false);
		// recursive = Optional.of(true);
		// ignoreCase = Optional.of(true);

		// criteria = new FindCriteria(matching, files, directories, recursive,
		// ignoreCase);

		List<String> samplesConfigFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/samples",
				criteriaDto);

		// System.out.println("samplesConfigFilePaths = " + samplesConfigFilePaths);

		List<String> configFilePaths = new ArrayList<>();
		configFilePaths.addAll(burstConfigFilePaths);
		configFilePaths.addAll(reportsConfigFilePaths);
		configFilePaths.addAll(samplesConfigFilePaths);

		for (String filePath : configFilePaths) {
			String configurationFileName = Paths.get(filePath).getFileName().toString();

			boolean isFallbackSettings = filePath.endsWith("burst/settings.xml");

			// Exclude: _defaults, preferences, and _frend samples (frontend-only showcases)
			boolean isRealSettingsXmlFile = !filePath.endsWith("_defaults/settings.xml")
					&& !filePath.endsWith("preferences/settings.xml")
					&& !filePath.contains("/_frend/");

			if (isRealSettingsXmlFile) {

				String fullFilePath = Utils.resolvePathAgainstPortableDir(filePath.replaceFirst("^/", ""));

				// System.out.println("filePath = " + filePath);
				// System.out.println("fullFilePath = " + fullFilePath);

				String settingsFileContent = fileSystemService.unixCliCat(fullFilePath);

				// System.out.println("settingsFileContent = " + settingsFileContent);

				int startPos = settingsFileContent.indexOf("<template>") + "<template>".length();
				int endPos = settingsFileContent.indexOf("</template>");
				String configurationName = settingsFileContent.substring(startPos, endPos).trim();

				startPos = settingsFileContent.indexOf("<reportdistribution>") + "<reportdistribution>".length();
				endPos = settingsFileContent.indexOf("</reportdistribution>");
				boolean boolReportDistribution = Boolean
						.parseBoolean(settingsFileContent.substring(startPos, endPos).trim());

				startPos = settingsFileContent.indexOf("<reportgenerationmailmerge>")
						+ "<reportgenerationmailmerge>".length();
				endPos = settingsFileContent.indexOf("</reportgenerationmailmerge>");
				boolean boolReportGenerationMailMerge = Boolean
						.parseBoolean(settingsFileContent.substring(startPos, endPos).trim());

				startPos = settingsFileContent.indexOf("<useconn>") + "<useconn>".length();
				endPos = settingsFileContent.indexOf("</useconn>");
				boolean boolUseEmailConnection = Boolean
						.parseBoolean(settingsFileContent.substring(startPos, endPos).trim());

				String strEmailConnectionCode = StringUtils.EMPTY;
				if (settingsFileContent.contains("<conncode>")) {
					startPos = settingsFileContent.indexOf("<conncode>") + "<conncode>".length();
					endPos = settingsFileContent.indexOf("</conncode>");
					strEmailConnectionCode = settingsFileContent.substring(startPos, endPos).trim();
				}

				String templateRelativeFilePath = "./config/burst/" + configurationFileName;
				String typeOfConfiguration = "config-burst-legacy";

				String folderName = Paths.get(filePath).getParent().getFileName().toString();

				String dsInputType = StringUtils.EMPTY;
				String scriptOptionsSelectFileExplorer = "globpattern";

				if (filePath.contains("config/reports/" + folderName)) {
					typeOfConfiguration = "config-reports";
					templateRelativeFilePath = "./config/reports/" + folderName + "/settings.xml";

				} else if (filePath.contains("config/samples/" + folderName)) {
					typeOfConfiguration = "config-samples";
					templateRelativeFilePath = "./config/samples/" + folderName + "/settings.xml";
				}

				if (boolReportGenerationMailMerge) {
					String reportingXmlFilePath = Paths.get(fullFilePath).getParent().toString() + "/reporting.xml";

					String reportingXmlFileContent = fileSystemService.unixCliCat(reportingXmlFilePath);

					// System.out.println("reportingXmlFileContent = " + reportingXmlFileContent);

					startPos = reportingXmlFileContent.indexOf("<type>") + "<type>".length();
					endPos = reportingXmlFileContent.indexOf("</type>");
					dsInputType = reportingXmlFileContent.substring(startPos, endPos).trim();

					startPos = reportingXmlFileContent.indexOf("<selectfileexplorer>")
							+ "<selectfileexplorer>".length();
					endPos = reportingXmlFileContent.indexOf("</selectfileexplorer>");
					if (startPos >= 0 && endPos > startPos)
						scriptOptionsSelectFileExplorer = reportingXmlFileContent.substring(startPos, endPos).trim();

				}

				ConfigurationFileInfo configFile = new ConfigurationFileInfo();
				configFile.fileName = configurationFileName;
				configFile.filePath = filePath.replace("\\", "/");
				configFile.relativeFilePath = templateRelativeFilePath;
				configFile.templateName = configurationName;
				configFile.isFallback = isFallbackSettings;
				configFile.capReportDistribution = boolReportDistribution;
				configFile.capReportGenerationMailMerge = boolReportGenerationMailMerge;
				configFile.dsInputType = dsInputType;
				configFile.scriptOptionsSelectFileExplorer = scriptOptionsSelectFileExplorer;
				configFile.notes = StringUtils.EMPTY;
				configFile.folderName = folderName;
				configFile.type = typeOfConfiguration;
				configFile.activeClicked = false;
				configFile.useEmlConn = boolUseEmailConnection;
				configFile.emlConnCode = strEmailConnectionCode;

				if (configFile.capReportGenerationMailMerge
						&& ("config-reports".equals(configFile.type) || "config-samples".equals(configFile.type))) {

					Path baseConfigDir;
					if ("config-reports".equals(configFile.type)) {
						baseConfigDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports");
					} else { // "config-samples"
						baseConfigDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples");
					}
					Path itemDir = baseConfigDir.resolve(configFile.folderName);
					
					// Load Report Parameters DSL
					String paramsSpecFileName = configFile.folderName + "-report-parameters-spec.groovy";
					Path paramsSpecPath = itemDir.resolve(paramsSpecFileName);

					if (Files.exists(paramsSpecPath)) {
						configFile.reportParameters = ReportParametersHelper
								.parseGroovyParametersDslCode(Files.readString(paramsSpecPath));
					}
					
					// Load Tabulator DSL
					String tabulatorConfigFileName = configFile.folderName + "-tabulator-config.groovy";
					Path tabulatorConfigPath = itemDir.resolve(tabulatorConfigFileName);

					if (Files.exists(tabulatorConfigPath)) {
						try {
							var tabulatorOptions = TabulatorOptionsParser.parseGroovyTabulatorDslCode(Files.readString(tabulatorConfigPath));
							if (tabulatorOptions != null) {
								configFile.tabulatorOptions = new HashMap<>(tabulatorOptions.getOptions());
							}
						} catch (Exception e) {
							log.error("Failed to parse Tabulator DSL for {}: {}", configFile.folderName, e.getMessage(), e);
						}
					}
					
					// Load Chart DSL
					String chartConfigFileName = configFile.folderName + "-chart-config.groovy";
					Path chartConfigPath = itemDir.resolve(chartConfigFileName);

					if (Files.exists(chartConfigPath)) {
						try {
							var chartOptions = ChartOptionsParser.parseGroovyChartDslCode(Files.readString(chartConfigPath));
							if (chartOptions != null) {
								configFile.chartOptions = new HashMap<>();
								if (chartOptions.getType() != null) {
									configFile.chartOptions.put("type", chartOptions.getType());
								}
								if (chartOptions.getLabelField() != null) {
									configFile.chartOptions.put("labelField", chartOptions.getLabelField());
								}
								if (chartOptions.getOptions() != null && !chartOptions.getOptions().isEmpty()) {
									configFile.chartOptions.put("options", chartOptions.getOptions());
								}
								if (chartOptions.getLabels() != null && !chartOptions.getLabels().isEmpty()) {
									configFile.chartOptions.put("labels", chartOptions.getLabels());
								}
								if (chartOptions.getDatasets() != null && !chartOptions.getDatasets().isEmpty()) {
									configFile.chartOptions.put("datasets", chartOptions.getDatasets());
								}
								if (chartOptions.getData() != null && !chartOptions.getData().isEmpty()) {
									configFile.chartOptions.put("data", chartOptions.getData());
								}
							}
						} catch (Exception e) {
							log.error("Failed to parse Chart DSL for {}: {}", configFile.folderName, e.getMessage(), e);
						}
					}

					// Load Pivot Table DSL
					String pivotConfigFileName = configFile.folderName + "-pivot-config.groovy";
					Path pivotConfigPath = itemDir.resolve(pivotConfigFileName);

					if (Files.exists(pivotConfigPath)) {
						try {
							var pivotOptions = PivotTableOptionsParser.parseGroovyPivotTableDslCode(Files.readString(pivotConfigPath));
							if (pivotOptions != null) {
								configFile.pivotTableOptions = new HashMap<>();
								if (pivotOptions.getRows() != null && !pivotOptions.getRows().isEmpty()) {
									configFile.pivotTableOptions.put("rows", pivotOptions.getRows());
								}
								if (pivotOptions.getCols() != null && !pivotOptions.getCols().isEmpty()) {
									configFile.pivotTableOptions.put("cols", pivotOptions.getCols());
								}
								if (pivotOptions.getVals() != null && !pivotOptions.getVals().isEmpty()) {
									configFile.pivotTableOptions.put("vals", pivotOptions.getVals());
								}
								if (pivotOptions.getAggregatorName() != null) {
									configFile.pivotTableOptions.put("aggregatorName", pivotOptions.getAggregatorName());
								}
								if (pivotOptions.getRendererName() != null) {
									configFile.pivotTableOptions.put("rendererName", pivotOptions.getRendererName());
								}
								if (pivotOptions.getRowOrder() != null) {
									configFile.pivotTableOptions.put("rowOrder", pivotOptions.getRowOrder());
								}
								if (pivotOptions.getColOrder() != null) {
									configFile.pivotTableOptions.put("colOrder", pivotOptions.getColOrder());
								}
								if (pivotOptions.getValueFilter() != null && !pivotOptions.getValueFilter().isEmpty()) {
									configFile.pivotTableOptions.put("valueFilter", pivotOptions.getValueFilter());
								}
								if (pivotOptions.getOptions() != null && !pivotOptions.getOptions().isEmpty()) {
									configFile.pivotTableOptions.put("options", pivotOptions.getOptions());
								}
								if (pivotOptions.getData() != null && !pivotOptions.getData().isEmpty()) {
									configFile.pivotTableOptions.put("data", pivotOptions.getData());
								}
							}
						} catch (Exception e) {
							log.error("Failed to parse Pivot Table DSL for {}: {}", configFile.folderName, e.getMessage(), e);
						}
					}

				}

				configurationFiles.add(configFile);
			}

		}

		// System.out.println("configurationFiles = " + configurationFiles);

		return configurationFiles.stream();

	}

	public DocumentBursterSettings loadSettings(String configFilePath) throws Exception {
		Settings settings = new Settings(configFilePath);
		return settings.loadSettings();
	}

	public synchronized void saveSettings(DocumentBursterSettings settings, String configFilePath) throws Exception {

		// Encrypt password fields before saving — only encrypt real secrets,
		// not empty strings, placeholder text, or already-encrypted values
		try {
			SecretsCipher cipher = SecretsCipher.getInstance(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);

			if (settings.settings.emailserver != null) {
				settings.settings.emailserver.userpassword = encryptIfSecret(cipher, settings.settings.emailserver.userpassword);
			}
			if (settings.settings.smssettings != null && settings.settings.smssettings.twilio != null) {
				// accountsid is NOT a secret — not encrypted
				settings.settings.smssettings.twilio.authtoken = encryptIfSecret(cipher, settings.settings.smssettings.twilio.authtoken);
			}
			if (settings.settings.simplejavamail != null && settings.settings.simplejavamail.proxy != null) {
				settings.settings.simplejavamail.proxy.password = encryptIfSecret(cipher, settings.settings.simplejavamail.proxy.password);
			}
			if (settings.settings.qualityassurance != null && settings.settings.qualityassurance.emailserver != null) {
				settings.settings.qualityassurance.emailserver.userpassword = encryptIfSecret(cipher, settings.settings.qualityassurance.emailserver.userpassword);
			}
		} catch (Exception e) {
			log.warn("Failed to encrypt settings passwords before save: {}", e.getMessage());
		}

		JAXBContext jc = JAXBContext.newInstance(DocumentBursterSettings.class);
		Marshaller marshaller = jc.createMarshaller();
		marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

		try (OutputStream os = new FileOutputStream(configFilePath)) {
			marshaller.marshal(settings, os);
		}

	}

	/**
	 * Only encrypt values that are real secrets — skip empty, placeholder text,
	 * already-encrypted values, and the API mask.
	 */
	private String encryptIfSecret(SecretsCipher cipher, String value) throws Exception {
		if (value == null || value.isEmpty()) {
			return value;
		}
		if (value.startsWith("ENC(")) {
			return value; // Already encrypted
		}
		if ("******".equals(value)) {
			return value; // API mask — should have been preserved by preserveExistingPasswords
		}
		// Variable references like ${var3} are template placeholders, not secrets
		if (value.contains("${")) {
			return value;
		}
		// Placeholder text (contains spaces and is descriptive) — don't encrypt
		if (value.contains(" ") && value.length() > 10) {
			return value;
		}
		return cipher.encrypt(value);
	}

	public ReportingSettings loadSettingsReporting(String configFilePath) throws Exception {

		Settings settings = new Settings(configFilePath);
		settings.loadSettings();
		return settings.reportingSettings;

	}

	public synchronized void saveSettingsReporting(ReportingSettings settings, String configFilePath) throws Exception {

		String configFolderPath = Paths.get(configFilePath).getParent().toString();
		String reportingConfigFilePath = configFolderPath + "/reporting.xml";

		JAXBContext jc = JAXBContext.newInstance(ReportingSettings.class);
		Marshaller marshaller = jc.createMarshaller();
		marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

		try (OutputStream os = new FileOutputStream(reportingConfigFilePath)) {
			marshaller.marshal(settings, os);
		}

	}

	public Stream<ConnectionFileInfo> loadSettingsConnectionEmailAll() throws Exception {

		List<ConnectionFileInfo> connectionFiles = new ArrayList<ConnectionFileInfo>();

		// AppPaths.CONFIG_DIR_PATH + "/burst"
		List<String> matching = new ArrayList<String>();

		matching.add("*.xml");
		Optional<Boolean> files = Optional.of(true);
		Optional<Boolean> directories = Optional.of(false);
		Optional<Boolean> recursive = Optional.of(false);
		Optional<Boolean> ignoreCase = Optional.of(true);

		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null), directories.orElse(null),
				recursive.orElse(null), ignoreCase.orElse(null));

		List<String> connectionFilePaths = fileSystemService.unixCliFind(AppPaths.CONFIG_DIR_PATH + "/connections",
				criteriaDto);

		// System.out.println("List<String> connectionFilePaths = " +
		// connectionFilePaths.toString());

		for (String filePath : connectionFilePaths) {

			String connectionFileName = Paths.get(filePath).getFileName().toString();

			DocumentBursterConnectionEmailSettings rbConnection = this.loadSettingsConnectionEmail(filePath);

			// System.out.println("rbConnection = " + rbConnection.toString());

			ConnectionFileInfo connFileInfo = new ConnectionFileInfo();
			connFileInfo.fileName = connectionFileName;
			connFileInfo.filePath = filePath.replace("\\", "/");
			connFileInfo.connectionCode = rbConnection.connection.code;
			connFileInfo.connectionName = rbConnection.connection.name;
			connFileInfo.connectionType = connectionFileName.startsWith("eml-") ? "email-connection"
					: "database-connection";
			connFileInfo.activeClicked = false;
			connFileInfo.defaultConnection = rbConnection.connection.defaultConnection;
			connFileInfo.usedBy = StringUtils.EMPTY;

			connFileInfo.emailserver.host = rbConnection.connection.emailserver.host;
			connFileInfo.emailserver.port = rbConnection.connection.emailserver.port;
			connFileInfo.emailserver.userid = rbConnection.connection.emailserver.userid;
			connFileInfo.emailserver.userpassword = rbConnection.connection.emailserver.userpassword;
			connFileInfo.emailserver.usessl = rbConnection.connection.emailserver.usessl;
			connFileInfo.emailserver.usetls = rbConnection.connection.emailserver.usetls;
			connFileInfo.emailserver.fromaddress = rbConnection.connection.emailserver.fromaddress;
			connFileInfo.emailserver.name = rbConnection.connection.emailserver.name;

			connectionFiles.add(connFileInfo);

		}

		return connectionFiles.stream();

	}

	public DocumentBursterConnectionEmailSettings loadSettingsConnectionEmail(String filePath) throws Exception {
		File connectionFile = new File(filePath);

		// If the path is relative, resolve it against PORTABLE_EXECUTABLE_DIR
		if (!connectionFile.isAbsolute()) {
			connectionFile = new File(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, filePath);
		}

		if (!connectionFile.exists()) {
			throw new Exception("Email connection file not found: " + connectionFile.getAbsolutePath());
		}

		DocumentBursterConnectionEmailSettings connEmailSettings;
		try (FileInputStream inputStream = new FileInputStream(connectionFile)) {
			JAXBContext jaxbContext = JAXBContext.newInstance(DocumentBursterConnectionEmailSettings.class);
			Unmarshaller unmarshaller = jaxbContext.createUnmarshaller();
			connEmailSettings = (DocumentBursterConnectionEmailSettings) unmarshaller.unmarshal(inputStream);
		}

		return connEmailSettings;
	}

	public synchronized void saveSettingsConnectionEmail(DocumentBursterConnectionEmailSettings settings, String connectionFilePath)
			throws Exception {

		// Encrypt email connection password and OAuth2 refresh token before saving — skip
		// variable references, placeholders, the API mask, and already-ENC(...)-wrapped values.
		// encryptIfSecret is idempotent: ENC(...) → ENC(...) (no double-wrap), "******" → "******"
		// (preserved by ConnectionsController), empty → empty, plaintext → ENC(...).
		if (settings.connection != null && settings.connection.emailserver != null) {
			try {
				SecretsCipher cipher = SecretsCipher.getInstance(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				settings.connection.emailserver.userpassword = encryptIfSecret(cipher,
						settings.connection.emailserver.userpassword);
				settings.connection.emailserver.oauth2refreshtoken = encryptIfSecret(cipher,
						settings.connection.emailserver.oauth2refreshtoken);
			} catch (Exception e) {
				log.warn("Failed to encrypt email connection secrets before save: {}", e.getMessage());
			}
		}

		JAXBContext jc = JAXBContext.newInstance(DocumentBursterConnectionEmailSettings.class);
		Marshaller marshaller = jc.createMarshaller();
		marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

		try (OutputStream os = new FileOutputStream(connectionFilePath)) {
			marshaller.marshal(settings, os);
		}
	}

	// DATABASE START
	public Stream<ConnectionFileInfo> loadSettingsConnectionDatabaseAll() throws Exception {
		File connectionsFolder = new File(Utils.resolvePathAgainstPortableDir("config/connections"));

		if (!connectionsFolder.exists()) {
			return Stream.empty();
		}

		// Get all folders that start with "db-" instead of files
		File[] connectionFolders = connectionsFolder
				.listFiles((dir, name) -> new File(dir, name).isDirectory() && name.toLowerCase().startsWith("db-"));

		List<ConnectionFileInfo> connectionInfoFiles = new ArrayList<>();

		if (connectionFolders != null) for (File connectionFolder : connectionFolders) {
			// Look for the main XML file inside the folder
			File mainXmlFile = new File(connectionFolder, connectionFolder.getName() + ".xml");

			if (mainXmlFile.exists()) {
				// Load the connection file
				DocumentBursterConnectionDatabaseSettings connectionSettings = loadSettingsConnectionDatabase(
						mainXmlFile.getAbsolutePath());

				if (connectionSettings != null && connectionSettings.connection != null) {
					ConnectionFileInfo connectionInfo = new ConnectionFileInfo();

					// Populate connection info
					connectionInfo.fileName = mainXmlFile.getName();
					connectionInfo.filePath = mainXmlFile.getAbsolutePath().replace("\\", "/");

					connectionInfo.connectionCode = connectionSettings.connection.code;

					connectionInfo.connectionName = connectionSettings.connection.name;
					connectionInfo.connectionType = "database-connection";

					connectionInfo.defaultConnection = connectionSettings.connection.defaultConnection;
					connectionInfo.usedBy = StringUtils.EMPTY;

					// Map all database server fields
					connectionInfo.dbserver.type = connectionSettings.connection.databaseserver.type;
					connectionInfo.dbserver.host = connectionSettings.connection.databaseserver.host;
					connectionInfo.dbserver.port = connectionSettings.connection.databaseserver.port;
					connectionInfo.dbserver.database = connectionSettings.connection.databaseserver.database;
					connectionInfo.dbserver.userid = connectionSettings.connection.databaseserver.userid;
					connectionInfo.dbserver.userpassword = connectionSettings.connection.databaseserver.userpassword;
					connectionInfo.dbserver.usessl = connectionSettings.connection.databaseserver.usessl;
					connectionInfo.dbserver.defaultquery = connectionSettings.connection.databaseserver.defaultquery;
					connectionInfo.dbserver.driver = connectionSettings.connection.databaseserver.driver;
					connectionInfo.dbserver.url = connectionSettings.connection.databaseserver.url;

					connectionInfoFiles.add(connectionInfo);
				}
			}

		}

		if (Settings.isShowSamplesEnabled()) {
			for (String sampleId : new String[]{"rbt-sample-northwind-sqlite-4f2", "rbt-sample-northwind-duckdb-4f2"}) {
				DocumentBursterConnectionDatabaseSettings s = getSampleConnectionAsDbSettings(sampleId);
				if (s != null && s.connection != null) {
					ConnectionFileInfo info = new ConnectionFileInfo();
					info.fileName = sampleId + ".xml";
					info.filePath = sampleId + ".xml";
					info.connectionCode = s.connection.code;
					info.connectionName = s.connection.name;
					info.connectionType = "database-connection";
					info.isSample = true;
					info.dbserver.type = s.connection.databaseserver.type;
					info.dbserver.database = s.connection.databaseserver.database;
					info.dbserver.driver = s.connection.databaseserver.driver;
					info.dbserver.url = s.connection.databaseserver.url;
					connectionInfoFiles.add(info);
				}
			}
		}

		return connectionInfoFiles.stream();
	}

	public DocumentBursterConnectionDatabaseSettings loadSettingsConnectionDatabase(String filePath) throws Exception {
		File connectionFile = new File(filePath);

		if (!connectionFile.exists()) {
			throw new Exception("Database connection file not found: " + filePath);
		}

		DocumentBursterConnectionDatabaseSettings connDbSettings;
		try (FileInputStream inputStream = new FileInputStream(connectionFile)) {
			// Use JAXB to unmarshal the XML content
			JAXBContext jaxbContext = JAXBContext.newInstance(DocumentBursterConnectionDatabaseSettings.class);
			Unmarshaller unmarshaller = jaxbContext.createUnmarshaller();

			connDbSettings = (DocumentBursterConnectionDatabaseSettings) unmarshaller.unmarshal(inputStream);
		}

		return connDbSettings;
	}

	public synchronized void saveSettingsConnectionDatabase(DocumentBursterConnectionDatabaseSettings dbSettings, String filePath)
			throws Exception {
		// Extract folder path from the file path
		File file = new File(filePath);
		File folderPath = file.getParentFile();

		// Create folder if it doesn't exist
		if (!folderPath.exists()) {
			folderPath.mkdirs();
		}

		// Encrypt database connection password before saving — skip variable references and placeholders
		if (dbSettings.connection != null && dbSettings.connection.databaseserver != null) {
			try {
				SecretsCipher cipher = SecretsCipher.getInstance(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
				dbSettings.connection.databaseserver.userpassword = encryptIfSecret(cipher,
						dbSettings.connection.databaseserver.userpassword);
			} catch (Exception e) {
				log.warn("Failed to encrypt database connection password before save: {}", e.getMessage());
			}
		}

		JAXBContext jaxbContext = JAXBContext.newInstance(DocumentBursterConnectionDatabaseSettings.class);
		Marshaller marshaller = jaxbContext.createMarshaller();
		marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

		try (FileOutputStream outputStream = new FileOutputStream(filePath)) {
			marshaller.marshal(dbSettings, outputStream);
		}

	}

	/**
	 * Synthesize in-memory DocumentBursterConnectionDatabaseSettings for the two
	 * built-in sample connections (Northwind SQLite and DuckDB).
	 * Returns null for unknown IDs.
	 */
	public DocumentBursterConnectionDatabaseSettings getSampleConnectionAsDbSettings(String connectionId) {
		if (connectionId == null) return null;
		String id = connectionId.trim().toLowerCase();

		DocumentBursterConnectionDatabaseSettings dto = new DocumentBursterConnectionDatabaseSettings();
		dto.connection = new com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings();
		dto.connection.code = connectionId;
		dto.connection.databaseserver = new com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings();

		if (id.contains("rbt-sample-northwind-sqlite-4f2")) {
			dto.connection.name = "Northwind Sample (SQLite)";
			dto.connection.databaseserver.type = "sqlite";
			dto.connection.databaseserver.database =
				Utils.resolvePathAgainstPortableDir("db/sample-northwind-sqlite/northwind.db");
		} else if (id.contains("rbt-sample-northwind-duckdb-4f2")) {
			dto.connection.name = "Northwind Sample (DuckDB)";
			dto.connection.databaseserver.type = "duckdb";
			dto.connection.databaseserver.database =
				Utils.resolvePathAgainstPortableDir("db/sample-northwind-duckdb/northwind.duckdb");
		} else {
			return null;
		}
		dto.connection.databaseserver.ensureDriverAndUrl();
		return dto;
	}

	// DATABASE END

	public DocumentBursterSettingsInternal loadSettingsInternal(String internalConfigFilePath) throws Exception {

		Settings settings = new Settings(Utils.resolvePathAgainstPortableDir("config/burst/settings.xml"));
		return settings.loadSettingsInternal();
	}

	public synchronized void saveSettingsInternal(DocumentBursterSettingsInternal dbSettingsInternal, String internalConfigFilePath)
			throws Exception {

		JAXBContext jc = JAXBContext.newInstance(DocumentBursterSettingsInternal.class);
		Marshaller marshaller = jc.createMarshaller();
		marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

		try (OutputStream os = new FileOutputStream(internalConfigFilePath)) {
			marshaller.marshal(dbSettingsInternal, os);
		}

	}

	public Stream<ConfigurationFileInfo> loadRbTemplatesAll() throws Exception {

		List<ConfigurationFileInfo> templateFiles = new ArrayList<ConfigurationFileInfo>();

		// AppPaths.CONFIG_DIR_PATH + "/burst"
		List<String> matching = new ArrayList<String>();

		matching.add("*.docx");
		matching.add("*.html");
		
		matching.add("*.fo");
		matching.add("*.xsl");
		matching.add("*.xslt");
		
		Optional<Boolean> files = Optional.of(true);
		Optional<Boolean> directories = Optional.of(false);
		Optional<Boolean> recursive = Optional.of(true);
		Optional<Boolean> ignoreCase = Optional.of(true);

		FindCriteriaDto criteriaDto = new FindCriteriaDto(matching, files.orElse(null), directories.orElse(null),
				recursive.orElse(null), ignoreCase.orElse(null));

		List<String> reportTemplatesFilePaths = fileSystemService.unixCliFind(AppPaths.TEMPLATES_DIR_PATH + "/reports",
				criteriaDto);

		List<String> samplesTemplatesFilePaths = fileSystemService.unixCliFind(AppPaths.SAMPLES_DIR_PATH + "/reports",
				criteriaDto);

		List<String> templateFilePaths = new ArrayList<>();
		templateFilePaths.addAll(reportTemplatesFilePaths);
		templateFilePaths.addAll(samplesTemplatesFilePaths);

		for (String filePath : templateFilePaths) {
			String reportTemplateFileName = Paths.get(filePath).getFileName().toString();
			String folderName = Paths.get(filePath).getParent().getFileName().toString();

			String relativeFilePath = filePath.replace("templates/reports/", "");
			String tplType = "template-report";

			if (filePath.contains("samples/reports")) {
				tplType = "template-report-sample";
				relativeFilePath = filePath.replace("samples/reports/", "");
			}

			ConfigurationFileInfo templateFile = new ConfigurationFileInfo();
			templateFile.fileName = reportTemplateFileName;
			templateFile.filePath = filePath.replace("\\", "/");
			templateFile.folderName = folderName;
			templateFile.type = tplType;

			templateFile.relativeFilePath = relativeFilePath;

			templateFiles.add(templateFile);
		}

		return templateFiles.stream();
	}

	// ── Phase 2: High-level atomic configuration operations ──

	/**
	 * Create a new report configuration atomically.
	 * Creates folder, settings.xml (from defaults or source), and reporting.xml.
	 */
	public ConfigurationFileInfo createConfiguration(String reportId, String templateName,
			boolean capReportDistribution, boolean capReportGenerationMailMerge,
			String copyFromReportId) throws Exception {

		String reportsDir = Utils.resolvePathAgainstPortableDir("config/reports");
		String defaultsDir = Utils.resolvePathAgainstPortableDir("config/_defaults");
		String targetDir = reportsDir + "/" + reportId;

		// 1. Create folder
		Files.createDirectories(Paths.get(targetDir));

		// 2. Load source settings (defaults or another report)
		String sourceSettingsPath;
		if (copyFromReportId != null && !copyFromReportId.isEmpty()) {
			String copyFromDir = reportsDir + "/" + copyFromReportId;
			// If source is "burst" (the legacy fallback), use defaults
			if ("burst".equals(copyFromReportId)) {
				sourceSettingsPath = Utils.resolvePathAgainstPortableDir("config/burst/settings.xml");
			} else {
				sourceSettingsPath = copyFromDir + "/settings.xml";
			}
		} else {
			sourceSettingsPath = defaultsDir + "/settings.xml";
		}

		DocumentBursterSettings settings = loadSettings(sourceSettingsPath);
		settings.settings.template = templateName;
		settings.settings.capabilities.reportdistribution = capReportDistribution;
		settings.settings.capabilities.reportgenerationmailmerge = capReportGenerationMailMerge;

		// When creating (not duplicating) with distribution enabled,
		// link the current default email connection
		if (capReportDistribution && (copyFromReportId == null || copyFromReportId.isEmpty())) {
			String defaultConnCode = findDefaultEmailConnectionCode();
			if (defaultConnCode != null) {
				settings.settings.emailserver.useconn = true;
				settings.settings.emailserver.conncode = defaultConnCode;
			}
		}

		String targetSettingsPath = targetDir + "/settings.xml";
		saveSettings(settings, targetSettingsPath);

		// 3. Copy reporting.xml from source or defaults
		String sourceReportingPath;
		if (copyFromReportId != null && !copyFromReportId.isEmpty() && !"burst".equals(copyFromReportId)) {
			sourceReportingPath = reportsDir + "/" + copyFromReportId + "/reporting.xml";
		} else {
			sourceReportingPath = defaultsDir + "/reporting.xml";
		}

		File sourceReporting = new File(sourceReportingPath);
		if (sourceReporting.exists()) {
			org.apache.commons.io.FileUtils.copyFile(sourceReporting, new File(targetDir + "/reporting.xml"));
		}

		// 4. Build and return ConfigurationFileInfo
		ConfigurationFileInfo configFile = new ConfigurationFileInfo();
		configFile.fileName = "settings.xml";
		configFile.filePath = "config/reports/" + reportId + "/settings.xml";
		configFile.relativeFilePath = "./config/reports/" + reportId + "/settings.xml";
		configFile.templateName = templateName;
		configFile.isFallback = false;
		configFile.capReportDistribution = capReportDistribution;
		configFile.capReportGenerationMailMerge = capReportGenerationMailMerge;
		configFile.dsInputType = capReportGenerationMailMerge ? "ds.csvfile" : "";
		configFile.scriptOptionsSelectFileExplorer = "notused";
		configFile.folderName = reportId;
		configFile.type = "config-reports";
		configFile.notes = "";

		return configFile;
	}

	/**
	 * Duplicate a report configuration atomically.
	 */
	public ConfigurationFileInfo duplicateConfiguration(String sourceReportId, String targetReportId,
			String newTemplateName, boolean capReportDistribution,
			boolean capReportGenerationMailMerge) throws Exception {
		return createConfiguration(targetReportId, newTemplateName, capReportDistribution,
				capReportGenerationMailMerge, sourceReportId);
	}

	/**
	 * Restore default configuration values for a report atomically.
	 * Preserves the template name.
	 */
	public void restoreDefaults(String reportId) throws Exception {

		String defaultsDir = Utils.resolvePathAgainstPortableDir("config/_defaults");

		// Resolve the actual settings path — "burst" lives at config/burst/, others at config/reports/{id}/
		String targetSettingsPath;
		String targetDir;
		if ("burst".equals(reportId)) {
			targetDir = Utils.resolvePathAgainstPortableDir("config/burst");
			targetSettingsPath = targetDir + "/settings.xml";
		} else {
			String reportsDir = Utils.resolvePathAgainstPortableDir("config/reports");
			targetDir = reportsDir + "/" + reportId;
			targetSettingsPath = targetDir + "/settings.xml";
		}

		// 1. Read current template name before overwriting
		DocumentBursterSettings currentSettings = loadSettings(targetSettingsPath);
		String currentTemplateName = currentSettings.settings.template;

		// 2. Load default settings
		DocumentBursterSettings defaultSettings = loadSettings(defaultsDir + "/settings.xml");
		defaultSettings.settings.template = currentTemplateName;

		// 3. Save defaults as the new settings
		saveSettings(defaultSettings, targetSettingsPath);

		// 4. Copy default reporting.xml
		File defaultReporting = new File(defaultsDir + "/reporting.xml");
		if (defaultReporting.exists()) {
			org.apache.commons.io.FileUtils.copyFile(defaultReporting,
					new File(targetDir + "/reporting.xml"), true);
		}
	}

	/**
	 * Delete a report configuration (entire folder).
	 */
	/**
	 * Find the connection code of the current default email connection.
	 * Scans config/connections/ for eml-*.xml files and returns the one marked as default.
	 */
	private String findDefaultEmailConnectionCode() {
		try {
			return loadSettingsConnectionEmailAll()
					.filter(conn -> conn.defaultConnection)
					.map(conn -> conn.connectionCode)
					.findFirst()
					.orElse(null);
		} catch (Exception e) {
			log.debug("Could not find default email connection: {}", e.getMessage());
			return null;
		}
	}

	public void deleteConfiguration(String reportId) throws Exception {
		String reportsDir = Utils.resolvePathAgainstPortableDir("config/reports");
		File targetDir = new File(reportsDir + "/" + reportId);
		if (targetDir.exists() && targetDir.isDirectory()) {
			org.apache.commons.io.FileUtils.deleteDirectory(targetDir);
		}
	}


}

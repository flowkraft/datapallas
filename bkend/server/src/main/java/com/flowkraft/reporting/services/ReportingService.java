package com.flowkraft.reporting.services;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.samples.SamplesFrendOnlyService;

import com.flowkraft.reports.ReportsService;
import com.flowkraft.common.AppPaths;
import com.flowkraft.cubes.CubeDataToday;
import com.flowkraft.cubes.CubeDates;
import com.flowkraft.queries.ConnectionFactory;
import com.flowkraft.queries.SqlOptionRows;
import com.flowkraft.reporting.dtos.ReportFullConfigDto;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.common.db.SqlExecutor;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser;
import com.flowkraft.reporting.dsl.filterpane.FilterPaneOptionsParser;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptionsParser;
import com.sourcekraft.documentburster.job.CliJob;
import com.sourcekraft.documentburster.utils.CsvUtils;
import com.sourcekraft.documentburster.utils.FreemarkerRenderingUtils;

@Service
public class ReportingService {

	private static final Logger log = LoggerFactory.getLogger(ReportingService.class);

	@Autowired
	ReportsService settingsService;

	@Autowired
	SamplesFrendOnlyService samplesFrendOnlyService;

	/** The data's today, read from the data. Held as a field so a test can pin the day. */
	private CubeDataToday cubeDataToday = new CubeDataToday();

	/** The test seam of {@link CubeDataToday}: a pinned day, so the checks' numbers stay true. */
	void useDataToday(CubeDataToday dataToday) {
		this.cubeDataToday = dataToday;
	}

	public ReportDataResult fetchData(String configurationFilePath, Map<String, String> parameters, boolean testMode)
			throws Exception {
		CliJob cliJob = new CliJob(configurationFilePath);

		return cliJob.doFetchData(parameters, testMode);
	}

	/**
	 * Is there a report folder for this code? The lookup {@link #loadReportConfig} makes, asked
	 * without loading anything: config/reports/{code}, config/samples/{code}, then the frend-only
	 * samples under config/samples/_frend/{code}. A code that points out of those folders is no report.
	 */
	public boolean reportExists(String reportCode) {

		if (reportCode == null || reportCode.isBlank())
			return false;

		Path config = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config").normalize();

		for (String parent : new String[] { "reports", "samples", "samples/" + SamplesFrendOnlyService.FREND_SAMPLES_SUBFOLDER }) {
			Path folder = config.resolve(parent);
			Path candidate = folder.resolve(reportCode).normalize();
			if (!candidate.equals(folder) && candidate.startsWith(folder) && Files.isDirectory(candidate))
				return true;
		}

		return false;
	}

	/**
	 * Load full report configuration by report code.
	 * Looks in both config/reports/{code} and config/samples/{code}.
	 */
	public ReportFullConfigDto loadReportConfig(String reportCode) throws Exception {
		log.debug("ReportingService.loadReportConfig(" + reportCode + ") - START");
		log.debug("PORTABLE_EXECUTABLE_DIR_PATH = " + AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
		
		ReportFullConfigDto config = new ReportFullConfigDto();
		config.reportCode = reportCode;
		
		// Try config/reports first, then config/samples
		Path reportsDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports", reportCode);
		Path samplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", reportCode);
		
		log.debug("Checking reportsDir: " + reportsDir + " exists=" + Files.exists(reportsDir));
		log.debug("Checking samplesDir: " + samplesDir + " exists=" + Files.exists(samplesDir));
		
		Path itemDir;
		String configType;
		if (Files.exists(reportsDir)) {
			itemDir = reportsDir;
			configType = "config-reports";
		} else if (Files.exists(samplesDir)) {
			itemDir = samplesDir;
			configType = "config-samples";
		} else {
			// Try frend-only samples under config/samples/_frend/{reportCode}
			Path frendSamplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", SamplesFrendOnlyService.FREND_SAMPLES_SUBFOLDER, reportCode);
			log.debug("Checking frendSamplesDir: " + frendSamplesDir + " exists=" + Files.exists(frendSamplesDir));
			if (Files.exists(frendSamplesDir)) {
				log.debug("Found _frend sample folder: " + reportCode + " - ensuring settings.xml/reporting.xml exist...");
				samplesFrendOnlyService.getOrProvisionFrendSample(reportCode);
				itemDir = frendSamplesDir;
				configType = "config-samples-frend"; // use distinct type for _frend path resolution
				log.debug("Using _frend sample directory: " + itemDir);
			} else {
				log.debug("Report not found: " + reportCode);
				throw new RuntimeException("Report not found: " + reportCode);
			}
		}
		
		log.debug("Using itemDir: " + itemDir);
		
		// Set configuration file path
		if ("config-reports".equals(configType)) {
			config.configurationFilePath = "./config/reports/" + reportCode + "/settings.xml";
		} else if ("config-samples-frend".equals(configType)) {
			config.configurationFilePath = "./config/samples/_frend/" + reportCode + "/settings.xml";
		} else {
			config.configurationFilePath = "./config/samples/" + reportCode + "/settings.xml";
		}
		
		// Load settings.xml for report name and dsInputType
		Path settingsPath = itemDir.resolve("settings.xml");
		if (Files.exists(settingsPath)) {
			String content = Files.readString(settingsPath);
			config.reportName = extractXmlValue(content, "template");
			config.dsInputType = extractReportingDsInputType(itemDir);
		}

		// Read output type and dashboard template from reporting.xml
		Path reportingPath = itemDir.resolve("reporting.xml");
		String reportingConnCode = null;
		if (Files.exists(reportingPath)) {
			String reportingContent = Files.readString(reportingPath);
			config.outputType = extractXmlValue(reportingContent, "outputtype");
			reportingConnCode = extractXmlValue(reportingContent, "conncode");

			// For dashboard output type, load the HTML template content
			if ("output.dashboard".equals(config.outputType)) {
				String documentPath = extractXmlValue(reportingContent, "documentpath");
				if (documentPath != null && !documentPath.isEmpty()) {
					// Strip leading slash so path resolves relative on all platforms
					String relDocPath = documentPath.startsWith("/") ? documentPath.substring(1) : documentPath;
					Path templatePath = itemDir.resolve(relDocPath);
					// Also try relative to PORTABLE_EXECUTABLE_DIR_PATH
					if (!Files.exists(templatePath)) {
						templatePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, relDocPath);
					}
					if (Files.exists(templatePath)) {
						config.dashboardTemplate = Files.readString(templatePath);
					}
				}
			}
		}

		// The questions this dashboard was written to answer, read as the file holds them: the
		// component shows each story's question and text, and sets its params through the same
		// validation a reader's own typing goes through. No file - no field, and the answer is the
		// one this report gave before.
		Path storiesPath = itemDir.resolve(reportCode + "-stories.json");
		if (Files.exists(storiesPath)) {
			try {
				config.stories = new ObjectMapper().readTree(Files.readString(storiesPath));
			} catch (Exception e) {
				// A stories file nobody can parse is not a reason to refuse the dashboard: it opens
				// without its stories, exactly as a dashboard that ships none does.
				log.warn("Could not read stories file " + storiesPath + ": " + e.getMessage());
			}

			// Show Me sets a story's values in the filter bar through the same check a reader's
			// own pick goes through, and a select refuses a value that is not one of its options:
			// a story that says "last year" as a token would do nothing at all. So its dates are
			// turned into days here, exactly as the parameters' defaults are.
			if (config.stories != null && reportingConnCode != null && !reportingConnCode.isEmpty())
				resolveRelativeStoryParams(config.stories, reportingConnCode);
		}

		// Load parameters DSL
		Path paramsPath = itemDir.resolve(reportCode + "-report-parameters-spec.groovy");
		log.debug("Parameters DSL path: " + paramsPath + " exists=" + Files.exists(paramsPath));
		if (Files.exists(paramsPath)) {
			String dslContent = Files.readString(paramsPath);
			config.parametersDsl = dslContent;
			log.debug("Parameters DSL content (first 200 chars): " + dslContent.substring(0, Math.min(200, dslContent.length())));
			config.parameters = ReportParametersHelper.parseGroovyParametersDslCode(dslContent);
			config.hasParameters = config.parameters != null && !config.parameters.isEmpty();
			log.debug("Parameters DSL parsed, hasParameters=" + config.hasParameters);

			// Resolve SQL-based parameter options (e.g., options: "SELECT DISTINCT ...")
			if (config.hasParameters && reportingConnCode != null && !reportingConnCode.isEmpty()) {
				resolveRelativeParameterDefaults(config.parameters, reportingConnCode);
				resolveParameterSqlOptions(config.parameters, reportingConnCode);
			}
		}
		
		// Load Tabulator DSL
		Path tabulatorPath = itemDir.resolve(reportCode + "-tabulator-config.groovy");
		log.debug("Tabulator DSL path: " + tabulatorPath + " exists=" + Files.exists(tabulatorPath));
		if (Files.exists(tabulatorPath)) {
			String dslContent = Files.readString(tabulatorPath);
			config.tabulatorDsl = dslContent;
			log.debug("Tabulator DSL content (first 200 chars): " + dslContent.substring(0, Math.min(200, dslContent.length())));
			var opts = TabulatorOptionsParser.parseGroovyTabulatorDslCode(dslContent);
			log.debug("Tabulator DSL parsed successfully, opts=" + (opts != null ? "not null" : "null"));
			if (opts != null) {
				config.tabulatorOptions = new HashMap<>(opts.getOptions());
				if (opts.getNamedOptions() != null && !opts.getNamedOptions().isEmpty()) {
					config.namedTabulatorOptions = opts.getNamedOptions();
				}
				config.hasTabulator = !opts.getOptions().isEmpty()
						|| (config.namedTabulatorOptions != null);
			}
		}
		
		// Load Chart DSL
		Path chartPath = itemDir.resolve(reportCode + "-chart-config.groovy");
		log.debug("Chart DSL path: " + chartPath + " exists=" + Files.exists(chartPath));
		if (Files.exists(chartPath)) {
			String dslContent = Files.readString(chartPath);
			config.chartDsl = dslContent;
			log.debug("Chart DSL content (first 200 chars): " + dslContent.substring(0, Math.min(200, dslContent.length())));
			var opts = ChartOptionsParser.parseGroovyChartDslCode(dslContent);
			log.debug("Chart DSL parsed successfully, opts=" + (opts != null ? "not null" : "null"));
			if (opts != null) {
				config.chartOptions = new HashMap<>();
				if (opts.getType() != null) {
					config.chartOptions.put("type", opts.getType());
				}
				if (opts.getLabelField() != null) {
					config.chartOptions.put("labelField", opts.getLabelField());
				}
				if (opts.getSeriesField() != null) {
					config.chartOptions.put("seriesField", opts.getSeriesField());
				}
				if (opts.getOptions() != null && !opts.getOptions().isEmpty()) {
					config.chartOptions.put("options", opts.getOptions());
				}
				if (opts.getLabels() != null && !opts.getLabels().isEmpty()) {
					config.chartOptions.put("labels", opts.getLabels());
				}
				if (opts.getDatasets() != null && !opts.getDatasets().isEmpty()) {
					config.chartOptions.put("datasets", opts.getDatasets());
				}
				if (opts.getData() != null && !opts.getData().isEmpty()) {
					config.chartOptions.put("data", opts.getData());
				}
				// Extract named blocks for aggregator reports
				if (opts.getNamedOptions() != null && !opts.getNamedOptions().isEmpty()) {
					config.namedChartOptions = new HashMap<>();
					for (Map.Entry<String, com.flowkraft.reporting.dsl.chart.ChartOptions> entry : opts.getNamedOptions().entrySet()) {
						Map<String, Object> m = new HashMap<>();
						com.flowkraft.reporting.dsl.chart.ChartOptions co = entry.getValue();
						if (co.getType() != null) m.put("type", co.getType());
						if (co.getLabelField() != null) m.put("labelField", co.getLabelField());
						if (co.getSeriesField() != null) m.put("seriesField", co.getSeriesField());
						if (co.getOptions() != null && !co.getOptions().isEmpty()) m.put("options", co.getOptions());
						if (co.getLabels() != null && !co.getLabels().isEmpty()) m.put("labels", co.getLabels());
						if (co.getDatasets() != null && !co.getDatasets().isEmpty()) m.put("datasets", co.getDatasets());
						if (co.getData() != null && !co.getData().isEmpty()) m.put("data", co.getData());
						config.namedChartOptions.put(entry.getKey(), m);
					}
				}
				// hasChart is true when unnamed options or named blocks exist
				config.hasChart = !config.chartOptions.isEmpty()
						|| (config.namedChartOptions != null);
			}
		}

		// Load Pivot DSL
		Path pivotPath = itemDir.resolve(reportCode + "-pivot-config.groovy");
		log.debug("Pivot DSL path: " + pivotPath + " exists=" + Files.exists(pivotPath));
		if (Files.exists(pivotPath)) {
			String dslContent = Files.readString(pivotPath);
			config.pivotTableDsl = dslContent;
			log.debug("Pivot DSL loaded, content length=" + dslContent.length() + ", first 200 chars: " + dslContent.substring(0, Math.min(200, dslContent.length())));
			var opts = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dslContent);
			log.debug("Pivot DSL parsed successfully, opts=" + (opts != null ? "not null" : "null"));
			if (opts != null) {
				config.pivotTableOptions = new HashMap<>();
				if (opts.getRows() != null && !opts.getRows().isEmpty()) {
					config.pivotTableOptions.put("rows", opts.getRows());
				}
				if (opts.getCols() != null && !opts.getCols().isEmpty()) {
					config.pivotTableOptions.put("cols", opts.getCols());
				}
				if (opts.getVals() != null && !opts.getVals().isEmpty()) {
					config.pivotTableOptions.put("vals", opts.getVals());
				}
				if (opts.getAggregatorName() != null) {
					config.pivotTableOptions.put("aggregatorName", opts.getAggregatorName());
				}
				if (opts.getRendererName() != null) {
					config.pivotTableOptions.put("rendererName", opts.getRendererName());
				}
				if (opts.getRowOrder() != null) {
					config.pivotTableOptions.put("rowOrder", opts.getRowOrder());
				}
				if (opts.getColOrder() != null) {
					config.pivotTableOptions.put("colOrder", opts.getColOrder());
				}
				if (opts.getValueFilter() != null && !opts.getValueFilter().isEmpty()) {
					config.pivotTableOptions.put("valueFilter", opts.getValueFilter());
				}
				if (opts.getOptions() != null && !opts.getOptions().isEmpty()) {
					config.pivotTableOptions.put("options", opts.getOptions());
				}
				if (opts.getHiddenAttributes() != null && !opts.getHiddenAttributes().isEmpty()) {
					config.pivotTableOptions.put("hiddenAttributes", opts.getHiddenAttributes());
				}
				if (opts.getHiddenFromAggregators() != null && !opts.getHiddenFromAggregators().isEmpty()) {
					config.pivotTableOptions.put("hiddenFromAggregators", opts.getHiddenFromAggregators());
				}
				if (opts.getHiddenFromDragDrop() != null && !opts.getHiddenFromDragDrop().isEmpty()) {
					config.pivotTableOptions.put("hiddenFromDragDrop", opts.getHiddenFromDragDrop());
				}
				if (opts.getUnusedOrientationCutoff() != null) {
					config.pivotTableOptions.put("unusedOrientationCutoff", opts.getUnusedOrientationCutoff());
				}
				if (opts.getMenuLimit() != null) {
					config.pivotTableOptions.put("menuLimit", opts.getMenuLimit());
				}
				if (opts.getTableName() != null) {
					config.pivotTableOptions.put("tableName", opts.getTableName());
				}
				// Extract named blocks for aggregator reports
				if (opts.getNamedOptions() != null && !opts.getNamedOptions().isEmpty()) {
					config.namedPivotTableOptions = new HashMap<>();
					for (Map.Entry<String, com.flowkraft.reporting.dsl.pivottable.PivotTableOptions> entry : opts.getNamedOptions().entrySet()) {
						Map<String, Object> m = new HashMap<>();
						com.flowkraft.reporting.dsl.pivottable.PivotTableOptions po = entry.getValue();
						if (po.getRows() != null && !po.getRows().isEmpty()) m.put("rows", po.getRows());
						if (po.getCols() != null && !po.getCols().isEmpty()) m.put("cols", po.getCols());
						if (po.getVals() != null && !po.getVals().isEmpty()) m.put("vals", po.getVals());
						if (po.getAggregatorName() != null) m.put("aggregatorName", po.getAggregatorName());
						if (po.getRendererName() != null) m.put("rendererName", po.getRendererName());
						if (po.getRowOrder() != null) m.put("rowOrder", po.getRowOrder());
						if (po.getColOrder() != null) m.put("colOrder", po.getColOrder());
						if (po.getValueFilter() != null && !po.getValueFilter().isEmpty()) m.put("valueFilter", po.getValueFilter());
						if (po.getOptions() != null && !po.getOptions().isEmpty()) m.put("options", po.getOptions());
						if (po.getHiddenAttributes() != null && !po.getHiddenAttributes().isEmpty()) m.put("hiddenAttributes", po.getHiddenAttributes());
						if (po.getHiddenFromAggregators() != null && !po.getHiddenFromAggregators().isEmpty()) m.put("hiddenFromAggregators", po.getHiddenFromAggregators());
						if (po.getHiddenFromDragDrop() != null && !po.getHiddenFromDragDrop().isEmpty()) m.put("hiddenFromDragDrop", po.getHiddenFromDragDrop());
						if (po.getUnusedOrientationCutoff() != null) m.put("unusedOrientationCutoff", po.getUnusedOrientationCutoff());
						if (po.getMenuLimit() != null) m.put("menuLimit", po.getMenuLimit());
						if (po.getTableName() != null) m.put("tableName", po.getTableName());
						config.namedPivotTableOptions.put(entry.getKey(), m);
					}
				}
				// hasPivotTable is true when unnamed options or named blocks exist
				config.hasPivotTable = !config.pivotTableOptions.isEmpty()
						|| (config.namedPivotTableOptions != null);
				log.debug("Pivot config set: hasPivotTable=" + config.hasPivotTable + ", pivotTableDsl length=" + config.pivotTableDsl.length());
			}

			// Detect pivot engine mode from datasource type
			if (config.hasPivotTable) {
				String engineMode = detectPivotEngineMode(itemDir);
				config.pivotEngineMode = engineMode;
				log.debug("Detected pivotEngineMode=" + engineMode + " for report " + reportCode);
			}
		} else {
			log.debug("No pivot DSL file found at: " + pivotPath);
		}

		// Load Filter Pane DSL
		Path filterPanePath = itemDir.resolve(reportCode + "-filterpane-config.groovy");
		if (Files.exists(filterPanePath)) {
			String dslContent = Files.readString(filterPanePath);
			config.filterPaneDsl = dslContent;
			var opts = FilterPaneOptionsParser.parseGroovyFilterPaneDslCode(dslContent);
			if (opts != null) {
				config.filterPaneOptions = new HashMap<>();
				if (opts.getField() != null) config.filterPaneOptions.put("field", opts.getField());
				if (opts.getLabel() != null) config.filterPaneOptions.put("label", opts.getLabel());
				config.filterPaneOptions.put("sort", opts.getSort());
				config.filterPaneOptions.put("maxValues", opts.getMaxValues());
				if (opts.getShowSearch() != null) config.filterPaneOptions.put("showSearch", opts.getShowSearch());
				config.filterPaneOptions.put("showCount", opts.isShowCount());
				if (opts.getDefaultSelected() != null && !opts.getDefaultSelected().isEmpty()) {
					config.filterPaneOptions.put("defaultSelected", opts.getDefaultSelected());
				}
				config.filterPaneOptions.put("multiSelect", opts.isMultiSelect());
				config.filterPaneOptions.put("height", opts.getHeight());

				// Named blocks
				if (opts.getNamedOptions() != null && !opts.getNamedOptions().isEmpty()) {
					config.namedFilterPaneOptions = new HashMap<>();
					for (Map.Entry<String, com.flowkraft.reporting.dsl.filterpane.FilterPaneOptions> entry : opts.getNamedOptions().entrySet()) {
						Map<String, Object> m = new HashMap<>();
						var fo = entry.getValue();
						if (fo.getField() != null) m.put("field", fo.getField());
						if (fo.getLabel() != null) m.put("label", fo.getLabel());
						m.put("sort", fo.getSort());
						m.put("maxValues", fo.getMaxValues());
						if (fo.getShowSearch() != null) m.put("showSearch", fo.getShowSearch());
						m.put("showCount", fo.isShowCount());
						if (fo.getDefaultSelected() != null && !fo.getDefaultSelected().isEmpty()) m.put("defaultSelected", fo.getDefaultSelected());
						m.put("multiSelect", fo.isMultiSelect());
						m.put("height", fo.getHeight());
						config.namedFilterPaneOptions.put(entry.getKey(), m);
					}
				}
				config.hasFilterPane = (opts.getField() != null) || (config.namedFilterPaneOptions != null);
			}
		}

		// Load Map config (plain JSON sidecar — no DSL).
		//
		// Two shapes supported in {reportCode}-map-config.json:
		//   a) single-map report:  { "mapType": "...", "dimension": "...", ... }
		//   b) multi-map report:   { "<componentId>": { ... }, "<componentId2>": { ... } }
		//
		// We detect (b) by testing whether every top-level value is itself an
		// object — if so, treat each entry as a named block (mirrors
		// namedChartOptions). Otherwise the whole document is the unnamed map.
		Path mapPath = itemDir.resolve(reportCode + "-map-config.json");
		if (Files.exists(mapPath)) {
			String json = Files.readString(mapPath);
			config.mapConfigJson = json;
			ObjectMapper mapMapper = new ObjectMapper();
			Map<String, Object> parsed = mapMapper.readValue(json,
				new TypeReference<Map<String, Object>>() {});
			boolean allValuesAreMaps = !parsed.isEmpty()
				&& parsed.values().stream().allMatch(v -> v instanceof Map);
			if (allValuesAreMaps) {
				Map<String, Map<String, Object>> named = new HashMap<>();
				for (Map.Entry<String, Object> e : parsed.entrySet()) {
					@SuppressWarnings("unchecked")
					Map<String, Object> inner = (Map<String, Object>) e.getValue();
					named.put(e.getKey(), inner);
				}
				config.namedMapOptions = named;
				config.hasMap = !named.isEmpty();
			} else {
				config.mapOptions = parsed;
				config.hasMap = !parsed.isEmpty();
			}
		}

		// Same JSON-sidecar pattern for the new viz types added in the data-canvas:
		// sankey, gauge, trend, progress, detail. Each uses {reportCode}-{viz}-config.json
		// and supports both single-block and named-blocks shapes (see map block above).
		loadJsonSidecar(itemDir, reportCode, "sankey",   "sankeyOptions",   "namedSankeyOptions",   "sankeyConfigJson",   "hasSankey",   config);
		loadJsonSidecar(itemDir, reportCode, "gauge",    "gaugeOptions",    "namedGaugeOptions",    "gaugeConfigJson",    "hasGauge",    config);
		loadJsonSidecar(itemDir, reportCode, "trend",    "trendOptions",    "namedTrendOptions",    "trendConfigJson",    "hasTrend",    config);
		loadJsonSidecar(itemDir, reportCode, "progress", "progressOptions", "namedProgressOptions", "progressConfigJson", "hasProgress", config);
		loadJsonSidecar(itemDir, reportCode, "detail",   "detailOptions",   "namedDetailOptions",   "detailConfigJson",   "hasDetail",   config);
		loadJsonSidecar(itemDir, reportCode, "value",   "valueOptions",    "namedValueOptions",    "valueConfigJson",    "hasValue",    config);

		return config;
	}

	/**
	 * Generic loader for the JSON-sidecar widget configs (sankey / gauge / trend /
	 * progress / detail). Auto-detects single-block vs named-blocks shape and writes
	 * to the right DTO fields via reflection. Mirrors the inlined map block above.
	 */
	@SuppressWarnings("unchecked")
	private void loadJsonSidecar(Path itemDir, String reportCode, String vizName,
			String optionsFieldName, String namedFieldName,
			String rawJsonFieldName, String hasFieldName,
			ReportFullConfigDto config) throws Exception {
		Path p = itemDir.resolve(reportCode + "-" + vizName + "-config.json");
		if (!Files.exists(p)) return;
		String json = Files.readString(p);
		ReportFullConfigDto.class.getField(rawJsonFieldName).set(config, json);
		ObjectMapper m = new ObjectMapper();
		Map<String, Object> parsed = m.readValue(json, new TypeReference<Map<String, Object>>() {});
		boolean allValuesAreMaps = !parsed.isEmpty()
			&& parsed.values().stream().allMatch(v -> v instanceof Map);
		if (allValuesAreMaps) {
			Map<String, Map<String, Object>> named = new HashMap<>();
			for (Map.Entry<String, Object> e : parsed.entrySet()) {
				named.put(e.getKey(), (Map<String, Object>) e.getValue());
			}
			ReportFullConfigDto.class.getField(namedFieldName).set(config, named);
			ReportFullConfigDto.class.getField(hasFieldName).setBoolean(config, !named.isEmpty());
		} else {
			ReportFullConfigDto.class.getField(optionsFieldName).set(config, parsed);
			ReportFullConfigDto.class.getField(hasFieldName).setBoolean(config, !parsed.isEmpty());
		}
	}

	/**
	 * Detect whether this report should use browser-side or server-side pivot aggregation
	 * by examining the datasource connection file.
	 * Uses JAXB unmarshalling for proper XML parsing.
	 */
	private String detectPivotEngineMode(Path reportDir) throws Exception {
		Path reportingXml = reportDir.resolve("reporting.xml");
		if (!Files.exists(reportingXml)) {
			return "browser";  // no reporting.xml = fallback to browser mode
		}

		jakarta.xml.bind.JAXBContext jaxbContext = jakarta.xml.bind.JAXBContext.newInstance(
			com.sourcekraft.documentburster.common.settings.model.ReportingSettings.class
		);
		jakarta.xml.bind.Unmarshaller unmarshaller = jaxbContext.createUnmarshaller();

		com.sourcekraft.documentburster.common.settings.model.ReportingSettings reportingSettings;
		try (java.io.FileInputStream fis = new java.io.FileInputStream(reportingXml.toFile())) {
			reportingSettings = (com.sourcekraft.documentburster.common.settings.model.ReportingSettings) unmarshaller.unmarshal(fis);
		}

		if (reportingSettings == null || reportingSettings.report == null || reportingSettings.report.datasource == null) {
			return "browser";
		}

		com.sourcekraft.documentburster.common.settings.model.ReportSettings.DataSource ds = reportingSettings.report.datasource;
		String dsType = ds.type;
		log.debug("detectPivotEngineMode - datasource type: " + dsType);

		String connectionCode = null;

		if ("ds.sqlquery".equals(dsType)) {
			if (ds.sqloptions != null) connectionCode = ds.sqloptions.conncode;
		} else if ("ds.scriptfile".equals(dsType) || "ds.dashboard".equals(dsType)) {
			if (ds.scriptoptions != null) connectionCode = ds.scriptoptions.conncode;
		}

		log.debug("detectPivotEngineMode - extracted connectionCode: " + connectionCode);

		if (connectionCode == null || connectionCode.isEmpty()) {
			return "browser";  // no connection = browser mode
		}

		String codeLower = connectionCode.toLowerCase();
		if (codeLower.contains("duckdb")) return "duckdb";
		if (codeLower.contains("clickhouse")) return "clickhouse";
		return "browser";
	}
	
	/**
	 * Fetch report data using report code and parameters.
	 * If entityCode parameter is provided, also renders the HTML template for that entity.
	 * 
	 * When entityCode is present, it's expected that the SQL query or Groovy script
	 * uses :entityCode as a parameter binding, guaranteeing a single row result.
	 */
	public ReportDataResult fetchReportData(String reportCode, Map<String, String> parameters, boolean testMode) throws Exception {
		log.debug("fetchReportData - START, reportCode=" + reportCode + ", parameters=" + parameters);
		
		// Build config file path
		Path reportsDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports", reportCode);
		Path samplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", reportCode);
		
		log.debug("fetchReportData - reportsDir=" + reportsDir + ", exists=" + Files.exists(reportsDir));
		log.debug("fetchReportData - samplesDir=" + samplesDir + ", exists=" + Files.exists(samplesDir));
		
		String cfgFilePath;
		Path itemDir;
		if (Files.exists(reportsDir)) {
			cfgFilePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports", reportCode, "settings.xml").toString();
			itemDir = reportsDir;
			log.debug("fetchReportData - using reportsDir, cfgFilePath=" + cfgFilePath);
		} else if (Files.exists(samplesDir)) {
			cfgFilePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", reportCode, "settings.xml").toString();
			itemDir = samplesDir;
			log.debug("fetchReportData - using samplesDir, cfgFilePath=" + cfgFilePath);
		} else {
			// Try frend-only samples under config/samples/_frend/{reportCode}
			Path frendSamplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", SamplesFrendOnlyService.FREND_SAMPLES_SUBFOLDER, reportCode);
			log.debug("Checking frendSamplesDir (data fetch): " + frendSamplesDir + " exists=" + Files.exists(frendSamplesDir));
			if (Files.exists(frendSamplesDir)) {
				samplesFrendOnlyService.getOrProvisionFrendSample(reportCode);
				cfgFilePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", SamplesFrendOnlyService.FREND_SAMPLES_SUBFOLDER, reportCode, "settings.xml").toString();
				itemDir = frendSamplesDir;
			} else {
				throw new RuntimeException("Report not found: " + reportCode);
			}
		}
		
		// Fetch the report data (entityCode flows through as a parameter to SQL/Script)
		log.debug("fetchReportData - about to call fetchData with cfgFilePath=" + cfgFilePath);
		ReportDataResult result = fetchData(cfgFilePath, parameters, testMode);
		log.debug("fetchReportData - fetchData returned, reportData size=" + (result.reportData != null ? result.reportData.size() : "null"));
		
		// Check if entityCode was provided for single-entity HTML rendering
		String entityCode = parameters != null ? parameters.get("entityCode") : null;
		log.debug("fetchReportData - entityCode=" + entityCode);
		if (entityCode != null && !entityCode.isEmpty()) {
			result.entityCode = entityCode;
			
			try {
				// Load settings to get template configuration
				Settings settings = new Settings(cfgFilePath);
				settings.loadSettings();
				
				String outputType = settings.getReportTemplate().outputtype;
				log.debug("fetchReportData - outputType=" + outputType);
				
				// Only render if output type is HTML-based
				if (FreemarkerRenderingUtils.isHtmlBasedOutputType(outputType)) {
					String templatePath = settings.getReportTemplate().retrieveTemplateFilePath();
					log.debug("fetchReportData - templatePath=" + templatePath);
					
					// Make template path absolute if relative
					Path absoluteTemplatePath = itemDir.resolve(templatePath);
					log.debug("fetchReportData - absoluteTemplatePath=" + absoluteTemplatePath + ", exists=" + Files.exists(absoluteTemplatePath));
					if (!Files.exists(absoluteTemplatePath)) {
						// Try from PORTABLE_EXECUTABLE_DIR_PATH
						absoluteTemplatePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, templatePath);
						log.debug("fetchReportData - trying PORTABLE path: " + absoluteTemplatePath + ", exists=" + Files.exists(absoluteTemplatePath));
					}
					
					if (Files.exists(absoluteTemplatePath)) {
						// When entityCode is used, the SQL/Script is expected to return exactly one row
						// via :entityCode parameter binding (e.g., WHERE customer_id = :entityCode)
						if (result.reportData != null && !result.reportData.isEmpty()) {
							LinkedHashMap<String, Object> entityRow = result.reportData.get(0);
							log.debug("fetchReportData - entityRow keys=" + entityRow.keySet());
							
							// Build user variables from the entity row
							Map<String, Object> userVariables = new HashMap<>(entityRow);
							
							// Render the template
							result.renderedHtml = FreemarkerRenderingUtils.renderTemplate(
									absoluteTemplatePath.toString(), userVariables);
							log.debug("fetchReportData - renderedHtml length=" + (result.renderedHtml != null ? result.renderedHtml.length() : "null"));
							
							log.info("Rendered HTML for entity '{}' from template '{}'", 
									entityCode, absoluteTemplatePath);
						} else {
							log.debug("fetchReportData - No data returned for entityCode: " + entityCode);
							log.warn("No data returned for entityCode: {}", entityCode);
						}
					} else {
						log.debug("fetchReportData - Template file not found: " + absoluteTemplatePath);
						log.warn("Template file not found: {}", absoluteTemplatePath);
					}
				} else {
					log.debug("fetchReportData - Output type is not HTML-based: " + outputType);
					log.debug("Output type '{}' is not HTML-based, skipping template rendering", outputType);
				}
			} catch (Exception e) {
				log.error("Failed to render HTML for entity '{}' — data is returned without HTML", entityCode, e);
				// Don't fail the entire request — data is still returned, HTML rendering is optional
			}
		}
		
		log.debug("fetchReportData - END, returning result with renderedHtml=" + (result.renderedHtml != null ? result.renderedHtml.length() + " chars" : "null"));
		return result;
	}
	
	/**
	 * Apply server-side filtering, sorting, and pagination to report data in-memory.
	 * Order: filter → sort → count → paginate.
	 *
	 * @param result    The full report data result from fetchData()
	 * @param page      1-based page number (Tabulator convention)
	 * @param size      Page size (rows per page)
	 * @param sortJson  JSON array: [{"field":"name","dir":"asc"}]
	 * @param filterJson JSON array: [{"field":"age","type":">","value":"30"}]
	 * @return Modified result with sliced data, totalRows, and lastPage set
	 */
	public ReportDataResult applyServerSideOperations(ReportDataResult result,
			Integer page, Integer size, String sortJson, String filterJson) throws Exception {
		if (result.reportData == null) return result;

		List<LinkedHashMap<String, Object>> rows = result.reportData;
		ObjectMapper mapper = new ObjectMapper();

		// 1. Apply filters
		if (filterJson != null && !filterJson.isBlank()) {
			List<Map<String, String>> filters = mapper.readValue(filterJson,
					new TypeReference<List<Map<String, String>>>() {});
			for (Map<String, String> f : filters) {
				String field = f.get("field");
				String type = f.get("type");
				String value = f.get("value");
				if (field == null || type == null) continue;
				rows = new ArrayList<>(rows.stream().filter(row -> {
					Object cellVal = row.get(field);
					if (cellVal == null) return "!=".equals(type);
					String cellStr = String.valueOf(cellVal);
					switch (type) {
						case "=": return cellStr.equals(value);
						case "!=": return !cellStr.equals(value);
						case "like": return cellStr.toLowerCase().contains(
								value != null ? value.toLowerCase() : "");
						case "starts": return cellStr.toLowerCase().startsWith(
								value != null ? value.toLowerCase() : "");
						case "ends": return cellStr.toLowerCase().endsWith(
								value != null ? value.toLowerCase() : "");
						case "<": return compareValues(cellVal, value) < 0;
						case ">": return compareValues(cellVal, value) > 0;
						case "<=": return compareValues(cellVal, value) <= 0;
						case ">=": return compareValues(cellVal, value) >= 0;
						default: return true;
					}
				}).toList());
			}
		}

		// 2. Apply sorting
		if (sortJson != null && !sortJson.isBlank()) {
			List<Map<String, String>> sorters = mapper.readValue(sortJson,
					new TypeReference<List<Map<String, String>>>() {});
			if (!sorters.isEmpty()) {
				Comparator<LinkedHashMap<String, Object>> comparator = null;
				for (Map<String, String> s : sorters) {
					String field = s.get("field");
					String dir = s.getOrDefault("dir", "asc");
					if (field == null) continue;
					Comparator<LinkedHashMap<String, Object>> c = (a, b) -> {
						Object va = a.get(field);
						Object vb = b.get(field);
						return compareValues(va, vb);
					};
					if ("desc".equalsIgnoreCase(dir)) c = c.reversed();
					comparator = (comparator == null) ? c : comparator.thenComparing(c);
				}
				if (comparator != null) {
					rows = new ArrayList<>(rows);
					Collections.sort(rows, comparator);
				}
			}
		}

		// 3. Set totalRows AFTER filtering but BEFORE pagination
		result.totalRows = rows.size();

		// 4. Apply pagination
		if (page != null && size != null && size > 0) {
			result.lastPage = Math.max(1, (int) Math.ceil((double) rows.size() / size));
			int from = Math.min((page - 1) * size, rows.size());
			int to = Math.min(from + size, rows.size());
			rows = new ArrayList<>(rows.subList(from, to));
		} else {
			result.lastPage = 1;
		}

		result.reportData = new ArrayList<>(rows);
		return result;
	}

	/** Compare two values — tries numeric first, falls back to string */
	private static int compareValues(Object a, Object b) {
		if (a == null && b == null) return 0;
		if (a == null) return -1;
		if (b == null) return 1;
		try {
			double da = (a instanceof Number) ? ((Number) a).doubleValue() : Double.parseDouble(String.valueOf(a));
			double db = (b instanceof Number) ? ((Number) b).doubleValue() : Double.parseDouble(String.valueOf(b));
			return Double.compare(da, db);
		} catch (NumberFormatException e) {
			return String.valueOf(a).compareToIgnoreCase(String.valueOf(b));
		}
	}

	/**
	 * The samples' relative date defaults, turned into days before the dashboard is served.
	 *
	 * <p>A default written as {@code {dataToday:startOf year}} means the day the data on this
	 * connection calls today, not the day this machine's clock calls today, so that a dashboard
	 * opens on a window its data is actually in however long ago the data was seeded. The live-cube
	 * endpoints already resolve those tokens; a dashboard's configuration is served from here, and
	 * without this the reader would be shown the token itself as the value of a date field.
	 *
	 * <p>A report whose defaults hold no token reads nothing: the marker table is only looked for
	 * when a token asks for it, so an ordinary report on a customer's connection is untouched. When
	 * one does ask and the day cannot be read, {@link CubeDataToday} refuses, with the message that
	 * says which connection and what to do — a date field quietly showing {@code {dataToday}} would
	 * be the worse answer.
	 */
	void resolveRelativeParameterDefaults(List<ReportParameter> parameters, String connectionCode) {

		boolean anyRelative = false;
		for (ReportParameter param : parameters)
			anyRelative = anyRelative || CubeDates.mentions(param.defaultValue);

		if (!anyRelative)
			return;

		LocalDate dataToday = cubeDataToday.ofDashboards(connectionCode);
		for (ReportParameter param : parameters)
			param.defaultValue = CubeDates.resolve(param.defaultValue, dataToday);
	}

	/**
	 * The relative dates in the filter values the stories set ({@code {dataToday:minus 1 year,
	 * startOf year}}), turned into days against the data's today, the way
	 * {@link #resolveRelativeParameterDefaults} does for a default, so that Show Me sets a day the
	 * filter bar can hold. A story whose values hold no token reads nothing.
	 */
	void resolveRelativeStoryParams(JsonNode stories, String connectionCode) {

		if (stories == null || !stories.isArray())
			return;

		LocalDate dataToday = null;
		for (JsonNode story : stories) {
			if (!(story.get("params") instanceof ObjectNode))
				continue;
			ObjectNode values = (ObjectNode) story.get("params");
			List<String> names = new ArrayList<>();
			values.fieldNames().forEachRemaining(names::add);
			for (String name : names) {
				JsonNode value = values.get(name);
				if (!value.isTextual() || !CubeDates.mentions(value.asText()))
					continue;
				if (dataToday == null)
					dataToday = cubeDataToday.ofDashboards(connectionCode);
				values.put(name, CubeDates.resolve(value.asText(), dataToday));
			}
		}
	}

	public void resolveParameterSqlOptions(List<ReportParameter> parameters, String connectionCode) throws Exception {
		for (ReportParameter param : parameters) {
			Object options = param.uiHints.get("options");
			if (options instanceof String) {
				String sql = ((String) options).trim();
				if (sql.toUpperCase().startsWith("SELECT")) {
					try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
						SqlExecutor sqlExec = new SqlExecutor(dbManager);
						List<Map<String, Object>> rows = sqlExec.queryOn(connectionCode, sql);

						// 1-col SQL → flat List<String> (back-compat for single-value selects).
						// 2+-col SQL → List<Object[]> where each entry is [value, label] —
						// the shape `<rb-parameters>` and `FilterBar.tsx` both consume to render
						// `name` while binding `id` to the IN-list. Same convention used by the
						// canvas-side resolver in FilterBar.tsx.
						// The loop that reads those two shapes lives in SqlOptionRows, because a
						// cube dimension's filter_options reads exactly the same rows.
						List<Object> resolved = SqlOptionRows.options(rows);
						param.uiHints.put("options", resolved);
						log.debug("Resolved SQL options for param '" + param.id + "': " + resolved.size() + " values");
					}
				}
			}
		}
	}

	private String extractXmlValue(String content, String tag) {
		int startPos = content.indexOf("<" + tag + ">") + tag.length() + 2;
		int endPos = content.indexOf("</" + tag + ">");
		if (startPos > tag.length() + 1 && endPos > startPos) {
			return content.substring(startPos, endPos).trim();
		}
		return "";
	}
	
	private String extractReportingDsInputType(Path itemDir) throws Exception {
		Path reportingPath = itemDir.resolve("reporting.xml");
		if (Files.exists(reportingPath)) {
			String content = Files.readString(reportingPath);
			return extractXmlValue(content, "type");
		}
		return "";
	}
}

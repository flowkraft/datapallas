package com.flowkraft.reporting.controllers;

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.common.AppPaths;
import com.flowkraft.reporting.dtos.ReportFullConfigDto;
import com.flowkraft.reporting.services.ReportingService;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptions;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptionsParser;
import com.flowkraft.reporting.dsl.chart.ChartOptions;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptions;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser;
import com.flowkraft.reporting.dsl.filterpane.FilterPaneOptions;
import com.flowkraft.reporting.dsl.filterpane.FilterPaneOptionsParser;

import reactor.core.publisher.Mono;

// V4: All endpoints moved to ReportsController under /api/reports/*
//     /api/reporting/reports/{id}/config|data  → /api/reports/{id}/config|data
//     /api/reporting/parse-*                   → /api/reports/{id}/parse/{kind}
//     /api/reporting/fetch-data (no consumer)  → deleted
@Deprecated
@RequestMapping(value = "/api/reporting",
		produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
public class ReportingController {

	private static final Logger log = LoggerFactory.getLogger(ReportingController.class);

	ReportingService reportingService;

	@Autowired
	public ReportingController(ReportingService reportingService) {
		this.reportingService = reportingService;
	}

	@PostMapping("/parse-parameters")
	public Mono<List<ReportParameter>> processGroovyParameters(@RequestBody String groovyParametersDslCode,
			@RequestParam(required = false) String connectionCode) throws Exception {

		String cleanedCode = groovyParametersDslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");

		List<ReportParameter> reportParameters = ReportParametersHelper.parseGroovyParametersDslCode(cleanedCode);

		if (connectionCode != null && !connectionCode.isEmpty()) {
			reportingService.resolveParameterSqlOptions(reportParameters, connectionCode);
		}

		return Mono.just(reportParameters);
	}

	@PostMapping("/parse-tabulator")
	public Mono<TabulatorOptions> processGroovyTabulator(@RequestBody String groovyTabulatorDslCode) throws Exception {
		String cleanedCode = groovyTabulatorDslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");
		return Mono.just(TabulatorOptionsParser.parseGroovyTabulatorDslCode(cleanedCode));
	}

	@PostMapping("/parse-chart")
	public Mono<ChartOptions> processGroovyChart(@RequestBody String groovyChartDslCode) throws Exception {
		String cleanedCode = groovyChartDslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");
		return Mono.just(ChartOptionsParser.parseGroovyChartDslCode(cleanedCode));
	}

	@PostMapping("/parse-pivot")
	public Mono<PivotTableOptions> processGroovyPivotTable(@RequestBody String groovyPivotDslCode) throws Exception {
		String cleanedCode = groovyPivotDslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");
		return Mono.just(PivotTableOptionsParser.parseGroovyPivotTableDslCode(cleanedCode));
	}

	@PostMapping("/parse-filterpane")
	public Mono<FilterPaneOptions> processGroovyFilterPane(@RequestBody String groovyFilterPaneDslCode) throws Exception {
		String cleanedCode = groovyFilterPaneDslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");
		return Mono.just(FilterPaneOptionsParser.parseGroovyFilterPaneDslCode(cleanedCode));
	}

	@GetMapping("/fetch-data")
	public Mono<ReportDataResult> fetchData(@RequestParam String configurationFilePath,
			@RequestParam Map<String, String> parameters) throws Exception {

		String cfgFilePath;
		if (Paths.get(configurationFilePath).isAbsolute()) {
			cfgFilePath = configurationFilePath;
		} else {
			cfgFilePath = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, configurationFilePath).toString();
		}

		return Mono.just(reportingService.fetchData(cfgFilePath, parameters, false));
	}

	/**
	 * Get full configuration for a report by its code.
	 * This is the single endpoint web components need to bootstrap themselves.
	 *
	 * @param reportCode The report folder name (e.g., "sales-summary")
	 * @return Complete configuration including parameters, tabulator, chart, pivot options
	 */
	@GetMapping(value = "/reports/{reportCode}/config", consumes = MediaType.ALL_VALUE)
	public Mono<ReportFullConfigDto> getReportConfig(@PathVariable String reportCode) throws Exception {
		return Mono.just(reportingService.loadReportConfig(reportCode));
	}

	/**
	 * Fetch report data using the report code and parameter values.
	 * Web components call this after user submits parameters.
	 *
	 * @param reportCode The report folder name
	 * @param parameters User-provided parameter values as query params
	 * @return Report data result
	 */
	@GetMapping(value = "/reports/{reportCode}/data", consumes = MediaType.ALL_VALUE)
	public Mono<ReportDataResult> fetchReportData(
			@PathVariable String reportCode,
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false, defaultValue = "false") Boolean testMode,
			@RequestParam(required = false) String componentId,
			@RequestParam Map<String, String> parameters) throws Exception {
		// Remove server-side operation params so they don't reach the Groovy script/SQL
		parameters.remove("page");
		parameters.remove("size");
		parameters.remove("testMode");

		// Extract Tabulator bracket-notation sort/filter params
		// e.g. sort[0][field]=Name&sort[0][dir]=asc&filter[0][field]=Status&filter[0][type]=like&filter[0][value]=Active
		String sort = extractBracketParams(parameters, "sort");
		String filter = extractBracketParams(parameters, "filter");

		log.info("GET /reports/{}/data - params={}, page={}, size={}, sort={}, filter={}, testMode={}, componentId={}",
				reportCode, parameters, page, size, sort, filter, testMode, componentId);

		ReportDataResult result = reportingService.fetchReportData(reportCode, parameters, testMode);
		log.info("GET /reports/{}/data - SUCCESS, rows={}", reportCode,
				result.reportData != null ? result.reportData.size() : "null");

		// Apply server-side filtering, sorting, and pagination
		result = reportingService.applyServerSideOperations(result, page, size, sort, filter);

		return Mono.just(result);
	}

	/**
	 * Parse Tabulator bracket-notation query params into a JSON array string.
	 * e.g. sort[0][field]=Name&sort[0][dir]=asc → [{"field":"Name","dir":"asc"}]
	 * Removes matched keys from the params map so they don't leak downstream.
	 */
	private String extractBracketParams(Map<String, String> params, String prefix) throws Exception {
		TreeMap<Integer, Map<String, String>> indexed = new TreeMap<>();
		String pat = prefix + "[";
		Iterator<Map.Entry<String, String>> it = params.entrySet().iterator();
		while (it.hasNext()) {
			Map.Entry<String, String> e = it.next();
			if (e.getKey().startsWith(pat)) {
				// parse "sort[0][field]" → index=0, key="field"
				String rest = e.getKey().substring(pat.length());
				int cb = rest.indexOf(']');
				int idx = Integer.parseInt(rest.substring(0, cb));
				String key = rest.substring(cb + 2, rest.length() - 1);
				indexed.computeIfAbsent(idx, k -> new LinkedHashMap<>()).put(key, e.getValue());
				it.remove();
			}
		}
		if (indexed.isEmpty()) return null;
		return new ObjectMapper().writeValueAsString(new ArrayList<>(indexed.values()));
	}

}

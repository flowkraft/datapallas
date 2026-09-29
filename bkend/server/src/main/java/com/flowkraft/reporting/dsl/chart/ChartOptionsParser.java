package com.flowkraft.reporting.dsl.chart;

import java.util.Map;
import org.codehaus.groovy.control.CompilerConfiguration;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Parses Chart Groovy DSL and produces ChartOptions DTO.
 * 
 * The parser is intentionally simple - it passes configuration through to the frontend.
 * Data transformation (reportData → Chart.js format) is handled by the frontend's
 * normalizeDataForChart() function, not here.
 */
public class ChartOptionsParser {

	public static ChartOptions parseGroovyChartDslCode(String groovyDslCode) throws Exception {
		// System.out.println("[DEBUG] ChartOptionsParser: entering, code length=" + (groovyDslCode != null ? groovyDslCode.length() : "null"));
		
		// Early return for empty/null input
		if (groovyDslCode == null || groovyDslCode.trim().isEmpty()) {
			// System.out.println("[DEBUG] ChartOptionsParser: empty input, returning empty ChartOptions");
			return new ChartOptions();
		}
		
		Binding binding = new Binding();

		CompilerConfiguration config = new CompilerConfiguration();
		config.setScriptBaseClass(ChartOptionsScript.class.getName());

		// System.out.println("[DEBUG] ChartOptionsParser: creating GroovyShell...");
		// Pass the script base class's classloader as parent — see TabulatorOptionsParser comment.
		GroovyShell shell = new GroovyShell(ChartOptionsScript.class.getClassLoader(), binding, config);
		// System.out.println("[DEBUG] ChartOptionsParser: parsing script...");
		ChartOptionsScript script = (ChartOptionsScript) shell.parse(groovyDslCode);
		script.setBinding(binding);
		// System.out.println("[DEBUG] ChartOptionsParser: running script...");
		script.run();
		// System.out.println("[DEBUG] ChartOptionsParser: script.run() completed");

		Map<String, Object> map = script.getOptions();
		ChartOptions out = new ChartOptions();
		populateChartOptions(out, map);
		// Said out loud rather than thrown: a chart whose author wrote `title` at chart level still
		// renders exactly as it did, and now says why it has no title. See ChartOptionsScript.
		out.setWarnings(script.getWarnings());

		// Extract named blocks for aggregator reports
		Map<String, Map<String, Object>> namedRaw = script.getNamedOptions();
		if (namedRaw != null && !namedRaw.isEmpty()) {
			Map<String, ChartOptions> named = new java.util.LinkedHashMap<>();
			Map<String, java.util.List<Map<String, Object>>> namedWarnings = script.getNamedWarnings();
			for (Map.Entry<String, Map<String, Object>> entry : namedRaw.entrySet()) {
				ChartOptions co = new ChartOptions();
				populateChartOptions(co, entry.getValue());
				if (namedWarnings != null && namedWarnings.containsKey(entry.getKey())) {
					co.setWarnings(namedWarnings.get(entry.getKey()));
				}
				named.put(entry.getKey(), co);
			}
			out.setNamedOptions(named);
		}

		return out;
	}

	/**
	 * Populate a ChartOptions DTO from the canonical Map shape produced by
	 * {@link ChartOptionsScript#getOptions()}:
	 * {@code { type, options, data: { labelField, seriesField, labels, datasets } }}.
	 *
	 * <p>{@code labelField}/{@code seriesField}/{@code labels}/{@code datasets}
	 * live INSIDE the nested {@code data} block (Chart.js shape). The legacy
	 * inline data-rows override keeps {@code data} as a {@code List<Map>} at
	 * the top level and is preserved for backwards compatibility.
	 */
	@SuppressWarnings("unchecked")
	private static void populateChartOptions(ChartOptions out, Map<String, Object> map) {
		if (map.containsKey("type")) out.setType(String.valueOf(map.get("type")));
		if (map.containsKey("options")) out.setOptions((java.util.Map<String,Object>) map.get("options"));

		Object dataValue = map.get("data");
		if (dataValue instanceof Map) {
			Map<String, Object> dataBlock = (Map<String, Object>) dataValue;
			if (dataBlock.containsKey("labelField")) out.setLabelField(String.valueOf(dataBlock.get("labelField")));
			if (dataBlock.containsKey("seriesField")) out.setSeriesField(String.valueOf(dataBlock.get("seriesField")));
			if (dataBlock.containsKey("labels")) out.setLabels((java.util.List<String>) dataBlock.get("labels"));
			if (dataBlock.containsKey("datasets")) out.setDatasets((java.util.List<java.util.Map<String,Object>>) dataBlock.get("datasets"));
		} else if (dataValue instanceof java.util.List) {
			// Legacy inline data-rows override: chart { data([[row1],[row2]]) }
			out.setData((java.util.List<java.util.Map<String,Object>>) dataValue);
		}
	}
}

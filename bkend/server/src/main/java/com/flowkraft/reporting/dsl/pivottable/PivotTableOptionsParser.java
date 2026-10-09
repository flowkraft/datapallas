package com.flowkraft.reporting.dsl.pivottable;

import java.util.List;
import java.util.Map;

import org.codehaus.groovy.control.CompilerConfiguration;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Parses Pivot Table Groovy DSL and produces PivotTableOptions DTO.
 */
public class PivotTableOptionsParser {

	@SuppressWarnings("unchecked")
	public static PivotTableOptions parseGroovyPivotTableDslCode(String groovyDslCode) throws Exception {
		// Early return for empty/null input
		if (groovyDslCode == null || groovyDslCode.trim().isEmpty()) {
			return new PivotTableOptions();
		}

		Binding binding = new Binding();

		CompilerConfiguration config = new CompilerConfiguration();
		config.setScriptBaseClass(PivotTableOptionsScript.class.getName());

		// Pass the script base class's classloader as parent — see TabulatorOptionsParser comment.
		GroovyShell shell = new GroovyShell(PivotTableOptionsScript.class.getClassLoader(), binding, config);
		PivotTableOptionsScript script = (PivotTableOptionsScript) shell.parse(groovyDslCode);
		script.setBinding(binding);
		script.run();

		PivotTableOptions opts = mapToPivotTableOptions(script.getOptions());

		// Extract named blocks for aggregator reports
		Map<String, Map<String, Object>> namedRaw = script.getNamedOptions();
		if (namedRaw != null && !namedRaw.isEmpty()) {
			Map<String, PivotTableOptions> named = new java.util.LinkedHashMap<>();
			for (Map.Entry<String, Map<String, Object>> entry : namedRaw.entrySet()) {
				named.put(entry.getKey(), mapToPivotTableOptions(entry.getValue()));
			}
			opts.setNamedOptions(named);
		}

		return opts;
	}

	/** Maps a raw options map to a PivotTableOptions DTO — shared by unnamed and named blocks */
	@SuppressWarnings("unchecked")
	private static PivotTableOptions mapToPivotTableOptions(Map<String, Object> map) {
		PivotTableOptions opts = new PivotTableOptions();
		if (map.containsKey("rows")) opts.setRows((List<String>) map.get("rows"));
		if (map.containsKey("cols")) opts.setCols((List<String>) map.get("cols"));
		if (map.containsKey("vals")) opts.setVals((List<String>) map.get("vals"));
		if (map.containsKey("aggregatorName")) opts.setAggregatorName(String.valueOf(map.get("aggregatorName")));
		if (map.containsKey("rendererName")) opts.setRendererName(String.valueOf(map.get("rendererName")));
		if (map.containsKey("rowOrder")) opts.setRowOrder(String.valueOf(map.get("rowOrder")));
		if (map.containsKey("colOrder")) opts.setColOrder(String.valueOf(map.get("colOrder")));
		if (map.containsKey("rowTotals")) opts.setRowTotals((Boolean) map.get("rowTotals"));
		if (map.containsKey("colTotals")) opts.setColTotals((Boolean) map.get("colTotals"));
		if (map.containsKey("valueFilter")) opts.setValueFilter((Map<String, Map<String, Boolean>>) map.get("valueFilter"));
		if (map.containsKey("options")) opts.setOptions((Map<String, Object>) map.get("options"));
		if (map.containsKey("data")) opts.setData((List<Map<String, Object>>) map.get("data"));
		if (map.containsKey("hiddenAttributes")) opts.setHiddenAttributes((List<String>) map.get("hiddenAttributes"));
		if (map.containsKey("hiddenFromAggregators")) opts.setHiddenFromAggregators((List<String>) map.get("hiddenFromAggregators"));
		if (map.containsKey("hiddenFromDragDrop")) opts.setHiddenFromDragDrop((List<String>) map.get("hiddenFromDragDrop"));
		if (map.containsKey("unusedOrientationCutoff")) opts.setUnusedOrientationCutoff((Integer) map.get("unusedOrientationCutoff"));
		if (map.containsKey("menuLimit")) opts.setMenuLimit((Integer) map.get("menuLimit"));
		if (map.containsKey("tableName")) opts.setTableName(String.valueOf(map.get("tableName")));
		if (map.containsKey("sorters")) opts.setSorters((Map<String, Object>) map.get("sorters"));
		if (map.containsKey("derivedAttributes")) opts.setDerivedAttributes((Map<String, String>) map.get("derivedAttributes"));
		return opts;
	}
}

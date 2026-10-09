package com.flowkraft.reporting.dsl.pivottable;

import groovy.lang.Script;
import groovy.lang.Closure;

import java.util.*;

/**
 * Groovy DSL base class for Pivot Table configuration.
 * Aligned with react-pivottable API.
 *
 * Minimal DSL:
 * pivotTable {
 *   rows 'region', 'country'
 *   cols 'year', 'quarter'
 *   vals 'revenue'
 *
 *   aggregatorName 'Sum'
 *   rendererName 'Table'
 *
 *   rowOrder 'key_a_to_z'
 *   colOrder 'key_a_to_z'
 *
 *   rowTotals false
 *   colTotals false
 *
 *   valueFilter {
 *     filter 'status', exclude: ['Inactive', 'Pending']
 *   }
 *
 *   options {
 *     menuLimit 500
 *   }
 * }
 */
/**
 * <h2>PivotTableOptionsScript — pivot DSL parser, block form only.</h2>
 *
 * <p>See {@link com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme#iAmImportantReadme()}
 * for full DSL principles + pivot-specific GOOD/BAD examples. Static init below
 * compile-pins this class to that readme.
 *
 * <p><b>Note:</b> {@code data(List&lt;Map&gt;)} accepts inline data rows for
 * tests — that's data, not configuration. The only legitimate list-of-maps
 * literal in this DSL.
 */
public abstract class PivotTableOptionsScript extends Script {

    static { com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme.iAmImportantReadme(); }

	// ── Single source of truth for parsing pivotTable DSL ──
	// Both the unnamed `pivotTable { ... }` and named `pivotTable('id') { ... }` forms
	// dispatch their closure body to a NamedPivotTableDelegate — the ONE class that
	// owns all 17 fields, setters (incl. varargs+list overloads), valueFilter, options{},
	// data() override, and getOptions().
	// Per DSLPrinciplesReadme Principle 2 (DRY): no parallel parser surfaces.

	/** Captures the unnamed default {@code pivotTable { ... }} block, if present. */
	private NamedPivotTableDelegate unnamedDelegate;

	/** Named blocks: id → options map (populated by {@link #pivotTable(String, Closure)}). */
	private final Map<String, Map<String, Object>> namedOptions = new LinkedHashMap<>();

	// DSL root — unnamed (default)
	public void pivotTable(Closure<?> body) {
		NamedPivotTableDelegate delegate = new NamedPivotTableDelegate();
		body.setDelegate(delegate);
		body.setResolveStrategy(Closure.DELEGATE_FIRST);
		body.call();
		this.unnamedDelegate = delegate;
	}

	// DSL root — named block for aggregator reports
	public void pivotTable(String id, Closure<?> body) {
		NamedPivotTableDelegate delegate = new NamedPivotTableDelegate();
		body.setDelegate(delegate);
		body.setResolveStrategy(Closure.DELEGATE_FIRST);
		body.call();
		namedOptions.put(id, delegate.getOptions());
	}

	/** Return final options map for the unnamed form (empty if none was declared). */
	public Map<String, Object> getOptions() {
		return unnamedDelegate != null ? unnamedDelegate.getOptions() : new LinkedHashMap<>();
	}

	/** Return named options map (id → options) for aggregator reports */
	public Map<String, Map<String, Object>> getNamedOptions() {
		return namedOptions;
	}

	@Override
	public Object run() { return null; }

	// ═══════════════════════════════════════════════════════════════════════════
	// Inner classes
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Value filter delegate - handles filter definitions
	 * filter 'column', exclude: ['val1', 'val2']
	 */
	private static class ValueFilterDelegate {
		private final Map<String, Map<String, Boolean>> filters;

		ValueFilterDelegate(Map<String, Map<String, Boolean>> filters) {
			this.filters = filters;
		}

		public void filter(String attribute, Map<String, Object> args) {
			Map<String, Boolean> attrFilter = new LinkedHashMap<>();

			// exclude: ['val1', 'val2'] - these values are filtered OUT (set to true)
			Object excludeObj = args.get("exclude");
			if (excludeObj instanceof List) {
				for (Object val : (List<?>) excludeObj) {
					attrFilter.put(String.valueOf(val), true);
				}
			}

			// include can be handled inversely if needed
			// For now, we follow react-pivottable's valueFilter semantics:
			// values in the filter map with true are EXCLUDED

			if (!attrFilter.isEmpty()) {
				filters.put(attribute, attrFilter);
			}
		}

		// Catch-all for simpler syntax
		@SuppressWarnings("unchecked")
		public Object methodMissing(String name, Object args) {
			// Could be used for: status exclude: ['Inactive']
			// where 'status' is called as a method
			if (args instanceof Object[]) {
				Object[] arr = (Object[]) args;
				if (arr.length > 0 && arr[0] instanceof Map) {
					filter(name, (Map<String, Object>) arr[0]);
				}
			}
			return null;
		}
	}

	/**
	 * Nested map delegate for options block
	 */
	private static class NestedMapDelegate {
		private final Map<String, Object> map;

		NestedMapDelegate(Map<String, Object> map) { this.map = map; }

		public Object methodMissing(String name, Object args) {
			if (args instanceof Object[]) {
				Object[] arr = (Object[]) args;
				if (arr.length == 1 && arr[0] instanceof Closure) {
					Map<String, Object> subMap = new LinkedHashMap<>();
					Closure<?> c = (Closure<?>) arr[0];
					NestedMapDelegate sub = new NestedMapDelegate(subMap);
					c.setDelegate(sub);
					c.setResolveStrategy(Closure.DELEGATE_FIRST);
					c.call();
					map.put(name, subMap);
				} else if (arr.length > 0) {
					map.put(name, arr[0]);
				}
			} else {
				map.put(name, args);
			}
			return null;
		}
	}

	/**
	 * Delegate for pivotTable blocks (both unnamed and named) — single
	 * parse-state owner per DSLPrinciplesReadme Principle 2 (DRY).
	 */
	private static class NamedPivotTableDelegate {
		private final List<String> rows = new ArrayList<>();
		private final List<String> cols = new ArrayList<>();
		private final List<String> vals = new ArrayList<>();
		private String aggregatorName = null;
		private String rendererName = null;
		private String rowOrder = null;
		private String colOrder = null;
		private Boolean rowTotals = null;
		private Boolean colTotals = null;
		private final Map<String, Map<String, Boolean>> valueFilter = new LinkedHashMap<>();
		private final Map<String, Object> options = new LinkedHashMap<>();
		private final List<Map<String, Object>> dataRows = new ArrayList<>();
		private final List<String> hiddenAttributes = new ArrayList<>();
		private final List<String> hiddenFromAggregators = new ArrayList<>();
		private final List<String> hiddenFromDragDrop = new ArrayList<>();
		private Integer unusedOrientationCutoff = null;
		private Integer menuLimit = null;
		private String tableName = null;
		private final Map<String, Object> sorters = new LinkedHashMap<>();
		private final Map<String, String> derivedAttributes = new LinkedHashMap<>();

		public void rows(String... fields) { if (fields != null) rows.addAll(Arrays.asList(fields)); }
		public void rows(List<String> fields) { if (fields != null) rows.addAll(fields); }
		public void cols(String... fields) { if (fields != null) cols.addAll(Arrays.asList(fields)); }
		public void cols(List<String> fields) { if (fields != null) cols.addAll(fields); }
		public void vals(String... fields) { if (fields != null) vals.addAll(Arrays.asList(fields)); }
		public void vals(List<String> fields) { if (fields != null) vals.addAll(fields); }
		public void aggregatorName(String name) { this.aggregatorName = name; }
		public void rendererName(String name) { this.rendererName = name; }
		public void rowOrder(String order) { this.rowOrder = order; }
		public void colOrder(String order) { this.colOrder = order; }
		public void rowTotals(boolean show) { this.rowTotals = show; }
		public void colTotals(boolean show) { this.colTotals = show; }

		public void valueFilter(Closure<?> body) {
			ValueFilterDelegate d = new ValueFilterDelegate(valueFilter);
			body.setDelegate(d);
			body.setResolveStrategy(Closure.DELEGATE_FIRST);
			body.call();
		}

		@SuppressWarnings("unchecked")
		public void valueFilter(Map<String, ?> map) {
			if (map == null) return;
			for (Map.Entry<String, ?> e : map.entrySet()) {
				if (e.getValue() instanceof Map) {
					valueFilter.put(e.getKey(), (Map<String, Boolean>) e.getValue());
				}
			}
		}

		public void options(Map<String, Object> args) { if (args != null) options.putAll(args); }
		public void options(Closure<?> body) {
			NestedMapDelegate d = new NestedMapDelegate(options);
			body.setDelegate(d);
			body.setResolveStrategy(Closure.DELEGATE_FIRST);
			body.call();
		}

		public void data(List<Map<String, Object>> rows) {
			if (rows != null) {
				for (Map<String, Object> r : rows) { this.dataRows.add(new LinkedHashMap<>(r)); }
			}
		}

		public void hiddenAttributes(String... attrs) { if (attrs != null) hiddenAttributes.addAll(Arrays.asList(attrs)); }
		public void hiddenAttributes(List<String> attrs) { if (attrs != null) hiddenAttributes.addAll(attrs); }
		public void hiddenFromAggregators(String... attrs) { if (attrs != null) hiddenFromAggregators.addAll(Arrays.asList(attrs)); }
		public void hiddenFromAggregators(List<String> attrs) { if (attrs != null) hiddenFromAggregators.addAll(attrs); }
		public void hiddenFromDragDrop(String... attrs) { if (attrs != null) hiddenFromDragDrop.addAll(Arrays.asList(attrs)); }
		public void hiddenFromDragDrop(List<String> attrs) { if (attrs != null) hiddenFromDragDrop.addAll(attrs); }
		public void unusedOrientationCutoff(int value) { this.unusedOrientationCutoff = value; }
		public void menuLimit(int value) { this.menuLimit = value; }
		public void tableName(String name) { this.tableName = name; }
		public void sorters(Map<String, Object> map) { if (map != null) sorters.putAll(map); }
		public void derivedAttributes(Map<String, String> map) { if (map != null) derivedAttributes.putAll(map); }

		public Map<String, Object> getOptions() {
			Map<String, Object> out = new LinkedHashMap<>();
			if (!rows.isEmpty()) out.put("rows", new ArrayList<>(rows));
			if (!cols.isEmpty()) out.put("cols", new ArrayList<>(cols));
			if (!vals.isEmpty()) out.put("vals", new ArrayList<>(vals));
			if (aggregatorName != null) out.put("aggregatorName", aggregatorName);
			if (rendererName != null) out.put("rendererName", rendererName);
			if (rowOrder != null) out.put("rowOrder", rowOrder);
			if (colOrder != null) out.put("colOrder", colOrder);
			if (rowTotals != null) out.put("rowTotals", rowTotals);
			if (colTotals != null) out.put("colTotals", colTotals);
			if (!valueFilter.isEmpty()) out.put("valueFilter", new LinkedHashMap<>(valueFilter));
			if (!options.isEmpty()) out.put("options", new LinkedHashMap<>(options));
			if (!dataRows.isEmpty()) out.put("data", new ArrayList<>(dataRows));
			if (!hiddenAttributes.isEmpty()) out.put("hiddenAttributes", new ArrayList<>(hiddenAttributes));
			if (!hiddenFromAggregators.isEmpty()) out.put("hiddenFromAggregators", new ArrayList<>(hiddenFromAggregators));
			if (!hiddenFromDragDrop.isEmpty()) out.put("hiddenFromDragDrop", new ArrayList<>(hiddenFromDragDrop));
			if (unusedOrientationCutoff != null) out.put("unusedOrientationCutoff", unusedOrientationCutoff);
			if (menuLimit != null) out.put("menuLimit", menuLimit);
			if (tableName != null) out.put("tableName", tableName);
			if (!sorters.isEmpty()) out.put("sorters", new LinkedHashMap<>(sorters));
			if (!derivedAttributes.isEmpty()) out.put("derivedAttributes", new LinkedHashMap<>(derivedAttributes));
			return out;
		}
	}
}

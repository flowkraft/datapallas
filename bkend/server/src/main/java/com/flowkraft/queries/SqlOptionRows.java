package com.flowkraft.queries;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * The one place that turns the rows of an options SELECT into the options a picker shows.
 *
 * <p>Two features ask a database for a list of values a person may choose from: a report
 * parameter whose {@code uiHints.options} is a SELECT
 * ({@code ReportingService.resolveParameterSqlOptions}), and a cube dimension's
 * {@code filter_options} ({@link com.flowkraft.cubes.CubeFilterOptions}). Both read the same two
 * shapes of result, and both used to read them with their own copy of this loop — which is how one
 * of them would have kept a column order the other dropped.
 *
 * <p>The shapes, as {@code <rb-parameters>} and {@code FilterBar.tsx} take them:
 * <ul>
 * <li>one column → the value is also the label, so the entry is that one string;</li>
 * <li>two columns or more → {@code [value, label]}, the first column bound into the query and the
 * second one shown; any further column is ignored;</li>
 * <li>a row whose first column is null is left out: there is nothing to bind.</li>
 * </ul>
 *
 * <p>Nothing here is vendor-specific, and nothing here runs SQL: the caller does that, because
 * only the caller knows which connection, which row cap and which guard its own SQL needs.
 */
public final class SqlOptionRows {

	private SqlOptionRows() {
	}

	/**
	 * The options of these rows: a {@code String} for a one-column row, an {@code Object[]} of
	 * {@code {value, label}} for a wider one.
	 */
	public static List<Object> options(List<Map<String, Object>> rows) {

		List<Object> resolved = new ArrayList<>();
		if (rows == null) return resolved;

		for (Map<String, Object> row : rows) {
			if (row == null) continue;
			Iterator<Object> values = row.values().iterator();
			Object first = values.hasNext() ? values.next() : null;
			if (first == null) continue;
			if (values.hasNext()) {
				Object second = values.next();
				resolved.add(new Object[] { String.valueOf(first), String.valueOf(second) });
			} else {
				resolved.add(String.valueOf(first));
			}
		}
		return resolved;
	}

	/**
	 * The same options as {@code [value, label]} pairs throughout — what an endpoint answers with,
	 * where a caller in a browser should not have to tell a string from a pair. A one-column row's
	 * value is its own label.
	 */
	public static List<List<String>> pairs(List<Map<String, Object>> rows) {

		List<List<String>> pairs = new ArrayList<>();
		for (Object option : options(rows)) {
			if (option instanceof Object[]) {
				Object[] pair = (Object[]) option;
				pairs.add(List.of(String.valueOf(pair[0]), String.valueOf(pair[1])));
			} else {
				String value = String.valueOf(option);
				pairs.add(List.of(value, value));
			}
		}
		return pairs;
	}
}

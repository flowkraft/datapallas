package com.flowkraft.cubes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One generated query: the SQL, with a named placeholder wherever the request carried a value, and
 * the typed values those placeholders stand for.
 *
 * <p><b>Why the values are not in the SQL.</b> A filter's value comes from whoever asked the
 * question, and writing it into the statement is how a search for {@code O'Brien} becomes a syntax
 * error and how a crafted value becomes someone else's SQL. So every value is bound: the runtime
 * endpoints hand {@link #getParams()} to the executor, which passes them to the driver as
 * parameters. The names are {@code :cf1}, {@code :cf2}, … — an {@code IN} list takes one number
 * and numbers its own values, {@code :cf3_0}, {@code :cf3_1}, …
 *
 * <p><b>Why {@link #toInlineSql} exists anyway.</b> Design time has nothing to bind to: View SQL
 * shows the author a statement to read, copy and run by hand, and the frozen export keeps one. So
 * the placeholders are replaced by literals from {@link CubeSqlDialect#sqlLiteral}, which is the
 * only place that knows how each database writes a date or a boolean.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b>
 */
public final class CubeQuery {

	private final String sql;
	private final Map<String, Object> params;

	CubeQuery(String sql, Map<String, Object> params) {
		this.sql = sql;
		this.params = Collections.unmodifiableMap(new LinkedHashMap<>(params));
	}

	/** The SQL, with a {@code :cf…} placeholder wherever a value belongs. */
	public String getSql() {
		return sql;
	}

	/** The values, by placeholder name (without the colon), in the order they were bound. */
	public Map<String, Object> getParams() {
		return params;
	}

	/**
	 * The same query with every placeholder replaced by the literal its value is written as on this
	 * database, whether it is a single value ({@code :cf1}) or a list ({@code <dp_user_groups>}).
	 * Longer names go first, so {@code :cf1} never eats the start of {@code :cf1_0}.
	 */
	public String toInlineSql(String vendor) {

		List<String> names = new ArrayList<>(params.keySet());
		names.sort((a, b) -> b.length() - a.length());

		String inlined = sql;
		for (String name : names) {
			Object value = params.get(name);
			// A list of values does not bind as `:name`: JDBI writes it as `<name>` between the
			// brackets the statement already has, which is how an access filter's
			// `IN (${dp_user_groups})` and a dashboard's multi-select are bound. Written out, it is
			// the values themselves, comma by comma. A list with nothing in it becomes NULL, so
			// `IN (NULL)` matches no row where `IN ()` would not parse at all.
			if (value instanceof List<?> list) {
				StringBuilder items = new StringBuilder();
				for (Object item : list) {
					if (items.length() > 0)
						items.append(", ");
					items.append(CubeSqlDialect.sqlLiteral(item, vendor));
				}
				inlined = inlined.replace("<" + name + ">", list.isEmpty() ? "NULL" : items.toString());
				continue;
			}
			inlined = inlined.replace(":" + name, CubeSqlDialect.sqlLiteral(value, vendor));
		}

		return inlined;
	}
}

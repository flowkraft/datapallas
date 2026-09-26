package com.flowkraft.cubes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeRules;

/**
 * Generates SQL from a CubeOptions definition + user field selections.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b> Vendor forms live in
 * {@link CubeSqlDialect}, which is the only place one may be written.
 *
 * Features:
 * - Auto-JOIN: detects cross-table dimension references and adds LEFT JOIN clauses
 * - Segments: selected segments become WHERE clauses
 * - Measure filters, {@code case} dimensions and calculated {@code number} measures
 * - Time granularity: a {@code .day|week|month|quarter|year} suffix on a time dimension
 */
public class CubeSqlGenerator {

	/** The alias an {@code sql}-based cube gets when it declares none: MySQL 8 rejects {@code cube}. */
	static final String DEFAULT_SQL_CUBE_ALIAS = "cube_src";

	/**
	 * The measure types the generator knows. A measure with no type is a {@code count}, as it has
	 * always been; anything else is a mistake in the cube and is refused rather than answered with
	 * a silent {@code COUNT(*)} that looks like a real number.
	 */
	static final List<String> MEASURE_TYPES = List.of(
			"count", "count_distinct", "sum", "avg", "min", "max", "number");

	/** {@code ${Something}} — a measure reference inside a calculated {@code number} measure. */
	private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]*)\\}");

	/**
	 * Generate SQL from cube metadata + user selections.
	 */
	public static String generateSql(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedMeasures,
			String dbVendor) {
		return generateSql(cube, selectedDimensions, selectedMeasures, List.of(), dbVendor);
	}

	/**
	 * One structured query, from the request the caller sent.
	 *
	 * <p>The request may speak either language. {@code dimensions}, {@code measures},
	 * {@code segments}, {@code granularities}, {@code filters}, {@code order} and {@code limit} are
	 * the structured form; {@code selectedDimensions}, {@code selectedMeasures} and
	 * {@code selectedSegments} are what the Angular editor, the report datasource screen and the
	 * canvas send today, and each of them is read whenever its structured twin is absent. Sending
	 * the same fields either way gives the same SQL.
	 */
	@SuppressWarnings("unchecked")
	public static CubeQuery buildQuery(CubeOptions cube, Map<String, Object> request, String dbVendor) {

		List<String> dimensions = new ArrayList<>(requestedList(request, "dimensions", "selectedDimensions"));
		List<String> measures = requestedList(request, "measures", "selectedMeasures");
		List<String> segments = requestedList(request, "segments", "selectedSegments");

		// A granularity may arrive either as a map or already glued to the dimension's name, the
		// form Cube.js uses. Inside, there is only the glued form.
		Object granularities = request.get("granularities");
		if (granularities instanceof Map) {
			for (Map.Entry<String, Object> asked : ((Map<String, Object>) granularities).entrySet()) {
				String granularity = Objects.toString(asked.getValue(), "").trim();
				if (granularity.isEmpty()) continue;
				for (int i = 0; i < dimensions.size(); i++) {
					if (dimensions.get(i).equals(asked.getKey())) {
						dimensions.set(i, asked.getKey() + "." + granularity);
					}
				}
			}
		}

		List<Map<String, Object>> filters = new ArrayList<>();
		if (request.get("filters") instanceof List) {
			for (Object one : (List<Object>) request.get("filters")) {
				if (one instanceof Map) filters.add((Map<String, Object>) one);
			}
		}

		List<String> order = new ArrayList<>();
		if (request.get("order") instanceof List) {
			for (Object one : (List<Object>) request.get("order")) {
				if (one instanceof Map) {
					Map<String, Object> entry = (Map<String, Object>) one;
					String direction = Objects.toString(entry.get("dir"), "").trim();
					order.add(Objects.toString(entry.get("member"), "") + (direction.isEmpty() ? "" : " " + direction));
				} else if (one != null) {
					order.add(one.toString());
				}
			}
		}

		Integer limit = request.get("limit") instanceof Number
				? ((Number) request.get("limit")).intValue()
				: null;

		return build(cube, dimensions, measures, segments, order, filters, limit, dbVendor);
	}

	/** A request key, or the older key that says the same thing when the new one is absent. */
	@SuppressWarnings("unchecked")
	private static List<String> requestedList(Map<String, Object> request, String key, String oldKey) {

		Object value = request.get(key);
		if (!(value instanceof List)) value = request.get(oldKey);
		if (!(value instanceof List)) return List.of();

		List<String> names = new ArrayList<>();
		for (Object one : (List<Object>) value) {
			if (one != null) names.add(one.toString());
		}
		return names;
	}

	/**
	 * Generate SQL from cube metadata + user selections + active segments.
	 */
	public static String generateSql(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedMeasures,
			List<String> selectedSegments,
			String dbVendor) {
		return generateSql(cube, selectedDimensions, selectedMeasures, selectedSegments, List.of(), dbVendor);
	}

	/**
	 * The cube a request asks for, in a file that may hold several.
	 *
	 * <p>A file has at most one unnamed cube — {@code cube { … }} — and any number of named ones,
	 * {@code cube('sales') { … }}. An empty name asks for the unnamed one; a name asks for that
	 * cube. Anything else is a mistake in the request and is answered with the names the file
	 * actually has, never with "No sql_table", which says nothing about what to pick.
	 *
	 * <p>The picked cube keeps the file's named cubes, because a {@code sub_query} dimension counts
	 * on one of them.
	 */
	public static CubeOptions pickCube(CubeOptions file, String cubeName) {
		if (file == null) {
			throw new IllegalArgumentException("There is no cube to generate SQL from.");
		}
		Map<String, CubeOptions> named = file.getNamedOptions() == null
				? Map.of()
				: file.getNamedOptions();
		String wanted = Objects.toString(cubeName, "").trim();

		if (wanted.isEmpty()) {
			boolean hasUnnamed = file.getSqlTable() != null || file.getSql() != null
					|| (file.getDimensions() != null && !file.getDimensions().isEmpty());
			if (hasUnnamed) return file;
			throw new IllegalArgumentException("This file holds only named cubes, so the request must say "
					+ "which one to use. Its cubes are: " + String.join(", ", named.keySet()) + ".");
		}

		CubeOptions picked = named.get(wanted);
		if (picked != null && picked.getNamedOptions() != null && picked.getNamedOptions().isEmpty()) {
			// A named cube keeps its neighbours, because a sub_query dimension reads one of them.
			// Itself is left out: a cube is not its own neighbour.
			Map<String, CubeOptions> neighbours = new LinkedHashMap<>(named);
			neighbours.remove(wanted);
			picked.setNamedOptions(neighbours);
		}
		if (picked == null) {
			throw new IllegalArgumentException("This file has no cube named '" + wanted + "'. Its cubes are: "
					+ String.join(", ", named.keySet()) + ".");
		}
		return picked;
	}

	/**
	 * Generate SQL from cube metadata + user selections, active segments and an order.
	 *
	 * @param requestOrder what the caller asks to order by, each entry a selected member's name
	 *                     followed by an optional {@code asc} or {@code desc}. Empty lets the
	 *                     cube's own {@code order} keys speak, and then the default rule.
	 */
	public static String generateSql(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedMeasures,
			List<String> selectedSegments,
			List<String> requestOrder,
			String dbVendor) {

		return build(cube, selectedDimensions, selectedMeasures, selectedSegments, requestOrder,
				List.of(), null, dbVendor).toInlineSql(dbVendor);
	}

	/**
	 * The one builder every entry point goes through: the SQL, with a placeholder wherever a filter
	 * carried a value, and those values typed by the member they filter.
	 */
	private static CubeQuery build(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedMeasures,
			List<String> selectedSegments,
			List<String> requestOrder,
			List<Map<String, Object>> filters,
			Integer limit,
			String dbVendor) {

		String vendor = CubeSqlDialect.key(dbVendor);
		Binder binder = new Binder();

		// Resolve the source table.
		if (cube.getSqlTable() == null && cube.getSql() == null) {
			return new CubeQuery("-- No sql_table or sql defined in cube", Map.of());
		}

		// The FROM clause, and the name every ${CUBE} expands to. An sql-based cube is a derived
		// table, so it needs an alias to be referenced at all; a table cube is referenced by its
		// own rendered name, or by its sql_alias when it declares one.
		String fromSource;
		String cubeRef;
		String alias = Objects.toString(cube.getSqlAlias(), "").trim();
		if (cube.getSqlTable() != null) {
			String table = CubeSqlDialect.quoteIdent(cube.getSqlTable(), vendor);
			// No AS before a table alias: Oracle rejects it, and no vendor needs it.
			fromSource = alias.isEmpty() ? table : table + " " + alias;
			cubeRef = alias.isEmpty() ? table : alias;
		} else {
			if (alias.isEmpty()) alias = DEFAULT_SQL_CUBE_ALIAS;
			cubeRef = alias;
			fromSource = "(" + cube.getSql() + ") " + alias;
		}

		// Collect all SQL expressions to detect which joined tables are referenced
		Set<String> referencedTables = new LinkedHashSet<>();
		List<Column> columns = new ArrayList<>();
		List<String> measureNames = new ArrayList<>();

		// Dimensions → SELECT + GROUP BY. One dimension is usually one column, and a geo dimension
		// is two: a pair of coordinates is not a value to group by on its own.
		for (String requested : selectedDimensions) {
			String dimName = requested;
			String granularity = null;

			Map<String, Object> dim = findMember(cube.getDimensions(), requested);
			if (dim == null) {
				// Not a dimension under that name: it may carry a granularity suffix,
				// OrderDate.month, the form Cube.js uses and the one the old three lists speak.
				int dot = requested.lastIndexOf('.');
				if (dot > 0) {
					Map<String, Object> base = findMember(cube.getDimensions(), requested.substring(0, dot));
					if (base != null) {
						dim = base;
						dimName = requested.substring(0, dot);
						granularity = requested.substring(dot + 1);
					}
				}
			}
			if (dim == null) continue;

			refuseWhatTheCubeGotWrong(cube, "dimension", dim);

			String type = Objects.toString(dim.get("type"), "").trim().toLowerCase();
			String declaredOrder = Objects.toString(dim.get("order"), null);

			if ("geo".equals(type)) {
				for (String corner : List.of("latitude", "longitude")) {
					String cornerSql = CubeRules.cornerSql(dim, corner).replace("${CUBE}", cubeRef);
					detectReferencedTables(cornerSql, cube, referencedTables);
					Column column = new Column(dimName + ("latitude".equals(corner) ? "_lat" : "_lng"),
							cornerSql, dimName);
					column.geo = true;
					columns.add(column);
				}
				continue;
			}

			Column column;
			if (CubeRules.isTrue(dim.get("sub_query"))) {
				column = new Column(dimName, subQueryExpression(dim, dimName, cube, cubeRef, vendor), dimName);
				column.subQuery = true;
			} else {
				column = new Column(dimName,
						dimensionExpression(dim, dimName, granularity, cube, cubeRef, vendor, referencedTables),
						dimName);
			}
			column.order = declaredOrder;
			column.time = "time".equals(type);
			columns.add(column);
		}

		// A sub_query is a correlated subquery, and SQL Server and Oracle reject one inside GROUP
		// BY. So as soon as one is picked the query takes a two-level form: the subquery is
		// computed once per row of the main table, in an inner SELECT, and the outer query groups
		// by its alias.
		TwoLevel twoLevel = null;
		for (Column column : columns) {
			if (column.subQuery) twoLevel = new TwoLevel();
		}

		// Measures → SELECT with aggregation. In the two-level form each aggregate is taken over
		// the inner query's own column, so the value is still computed once per row.
		List<String> measureExprs = new ArrayList<>();
		List<String> mainTableMeasureExprs = new ArrayList<>();
		for (String measName : selectedMeasures) {
			Map<String, Object> meas = findMember(cube.getMeasures(), measName);
			if (meas == null) continue;
			refuseWhatTheCubeGotWrong(cube, "measure", meas);
			measureNames.add(measName);
			measureExprs.add(measureExpression(measName, cube, cubeRef, vendor, referencedTables,
					new ArrayDeque<>(), twoLevel));
			mainTableMeasureExprs.add(twoLevel == null
					? measureExprs.get(measureExprs.size() - 1)
					: measureExpression(measName, cube, cubeRef, vendor, referencedTables,
							new ArrayDeque<>(), null));
		}

		if (columns.isEmpty() && measureNames.isEmpty()) {
			return new CubeQuery("-- No fields selected", Map.of());
		}

		// Build a join lookup map for parent-chain walking
		Map<String, Map<String, Object>> joinByName = new LinkedHashMap<>();
		if (cube.getJoins() != null) {
			for (Map<String, Object> join : cube.getJoins()) {
				String n = Objects.toString(join.get("name"), "");
				if (!n.isEmpty()) joinByName.put(n, join);
			}
		}

		// Segments become WHERE clauses. Each one is wrapped in its own parentheses, so a segment
		// containing OR cannot swallow the segment next to it, and a segment on a joined table
		// brings that join in exactly as a dimension would.
		List<String> whereClauses = new ArrayList<>();
		if (selectedSegments != null && !selectedSegments.isEmpty() && cube.getSegments() != null) {
			for (String segName : selectedSegments) {
				Map<String, Object> seg = findMember(cube.getSegments(), segName);
				if (seg != null) {
					refuseWhatTheCubeGotWrong(cube, "segment", seg);
					String segSql = Objects.toString(seg.get("sql"), null);
					if (segSql != null) {
						segSql = segSql.replace("${CUBE}", cubeRef);
						detectReferencedTables(segSql, cube, referencedTables);
						whereClauses.add("(" + segSql + ")");
					}
				}
			}
		}

		// Value filters. A filter on a dimension narrows the rows (WHERE); a filter on a measure
		// narrows the answers (HAVING), and is written further down, once it is known whether the
		// no-double-counting rewrite is in the way. A filter works on a dimension whether or not it
		// was selected, and brings that dimension's joins exactly as a selected one would.
		List<Map<String, Object>> measureFilters = new ArrayList<>();
		for (Map<String, Object> filter : filters) {
			String member = Objects.toString(filter.get("member"), "").trim();
			Map<String, Object> dim = findMember(cube.getDimensions(), member);
			if (dim == null) {
				if (findMember(cube.getMeasures(), member) == null) {
					throw new IllegalArgumentException("The answer cannot be filtered on '" + member
							+ "', because this cube has no dimension or measure of that name.");
				}
				measureFilters.add(filter);
				continue;
			}
			refuseWhatTheCubeGotWrong(cube, "dimension", dim);
			String type = Objects.toString(dim.get("type"), "").trim().toLowerCase();
			if ("geo".equals(type)) {
				throw new IllegalArgumentException("Dimension '" + member + "' is a geo dimension, so it "
						+ "cannot be filtered: a pair of coordinates is not one value to compare.");
			}
			// Never the truncated expression: a filter asks about the day the row carries, not about
			// the month its chart groups it under.
			String expr = CubeRules.isTrue(dim.get("sub_query"))
					? subQueryExpression(dim, member, cube, cubeRef, vendor)
					: dimensionExpression(dim, member, null, cube, cubeRef, vendor, referencedTables);
			whereClauses.add(filterCondition(expr, member, type, filter, vendor, binder));
		}

		// Walk transitive parents for every directly-referenced join.
		// Example: if user picked Categories.CategoryName (Categories has parent=Products,
		// Products has parent="Order Details", "Order Details" has parent=CUBE), then
		// requiredJoins = ["Order Details", "Products", "Categories"] in dependency order.
		Set<String> requiredJoins = new LinkedHashSet<>();
		for (String directlyReferenced : referencedTables) {
			addJoinAndAncestors(directlyReferenced, joinByName, requiredJoins);
		}

		// Re-iterate the cube's join declaration order so JOIN clauses are emitted
		// in the order the cube author declared them (which respects dependencies).
		List<String> joinOrder = new ArrayList<>();
		if (cube.getJoins() != null) {
			for (Map<String, Object> join : cube.getJoins()) {
				String n = Objects.toString(join.get("name"), "");
				if (requiredJoins.contains(n)) joinOrder.add(n);
			}
		}

		StringBuilder fromClause = new StringBuilder(fromSource);
		for (String joinName : joinOrder) {
			Map<String, Object> join = joinByName.get(joinName);
			String joinSql = Objects.toString(join.get("sql"), "");
			joinSql = joinSql.replace("${CUBE}", cubeRef);
			// Always a LEFT JOIN, whatever the relationship says: a base row with no match is still
			// a row of the cube, and an inner join made it disappear — a customer with no orders
			// simply vanished from the answer. A segment on the joined table still removes it.
			fromClause.append("\nLEFT JOIN ").append(CubeSqlDialect.quoteIdent(joinName, vendor))
					.append(" ON ").append(joinSql);
		}

		String where = whereClauses.isEmpty() ? "" : "\nWHERE " + String.join("\n  AND ", whereClauses);

		// Which of the picked measures do the query's own joins multiply? A one_to_many join
		// repeats the main table's rows, and a plain SUM then adds one order's freight once per
		// order line. Those measures are summed once per key instead, in a WITH.
		Map<String, String> multipliedBy = new LinkedHashMap<>();
		for (String measName : measureNames) {
			String join = multiplyingJoin(measName, cube, joinByName, requiredJoins);
			if (join != null) multipliedBy.put(measName, join);
		}

		// A measure filter compares an aggregate, so it is a HAVING — except where the rewrite
		// already moved the aggregates into their own queries, and the outer query reads them as
		// plain columns. There it is a WHERE on that column, which says the same thing.
		List<String> havingClauses = new ArrayList<>();
		List<String> outerWhereClauses = new ArrayList<>();
		for (Map<String, Object> filter : measureFilters) {
			String member = Objects.toString(filter.get("member"), "").trim();
			int selected = measureNames.indexOf(member);
			if (selected < 0) {
				throw new IllegalArgumentException("The answer cannot be filtered on measure '" + member
						+ "', because it is not one of the fields it returns. Ask for the measure as well "
						+ "as for the filter on it.");
			}
			if (multipliedBy.isEmpty()) {
				havingClauses.add(filterCondition(measureExprs.get(selected), member, "number", filter,
						vendor, binder));
			} else {
				String side = multipliedBy.containsKey(member) ? "x" : "m";
				outerWhereClauses.add(filterCondition(side + "." + CubeSqlDialect.quoteAlias(member, vendor),
						member, "number", filter, vendor, binder));
			}
		}

		String keyExpr = multipliedBy.isEmpty() ? null
				: mainTableKey(cube, cubeRef, measureNames, multipliedBy);
		String keyInKeys = keyExpr;

		List<String> columnExprs = new ArrayList<>();
		for (Column column : columns) columnExprs.add(column.expr);

		if (twoLevel != null) {
			// The inner query: every dimension once per row of the main table, every measure's own
			// value, and — when a measure is multiplied — the key the WITH aggregates once per.
			List<String> innerParts = new ArrayList<>();
			for (int i = 0; i < columns.size(); i++) {
				innerParts.add(columns.get(i).expr + " AS d" + i);
				columnExprs.set(i, "q.d" + i);
			}
			innerParts.addAll(twoLevel.inner);
			if (keyExpr != null) {
				innerParts.add(keyExpr + " AS " + CubeSqlDialect.internalAlias(PK, vendor));
				keyInKeys = "q." + CubeSqlDialect.internalAlias(PK, vendor);
			}
			fromClause = new StringBuilder("(SELECT " + String.join(", ", innerParts) + " FROM "
					+ fromClause + where + ") q");
			where = "";
		}

		String tail = joinOrder.isEmpty() ? "" : CubeSqlDialect.leftJoinSettings(vendor);
		List<OrderBy> orderBy = orderBy(requestOrder, columns, measureNames, cube);

		// A row limit is two things at once: a clause at the end almost everywhere, and a word
		// inside the SELECT on SQL Server. Both are asked for, and one of them is always empty.
		String selectPrefix = limit == null ? "" : CubeSqlDialect.limitPrefix(limit, vendor);
		String limitClause = limit == null ? "" : CubeSqlDialect.limitClause(limit, vendor);

		String sql;
		if (!multipliedBy.isEmpty()) {
			sql = withoutDoubleCounting(cube, cubeRef, vendor, fromSource, fromClause.toString(), where,
					keyInKeys, keyExpr, columns, columnExprs, measureNames, measureExprs,
					mainTableMeasureExprs, multipliedBy, orderBy, selectPrefix, outerWhereClauses)
					+ limitClause + tail;
		} else {
			List<String> selectParts = new ArrayList<>();
			for (int i = 0; i < columns.size(); i++) {
				selectParts.add(columnExprs.get(i) + " AS "
						+ CubeSqlDialect.quoteAlias(columns.get(i).alias, vendor));
			}
			for (int i = 0; i < measureNames.size(); i++) {
				selectParts.add(measureExprs.get(i) + " AS "
						+ CubeSqlDialect.quoteAlias(measureNames.get(i), vendor));
			}

			StringBuilder plain = new StringBuilder();
			plain.append("SELECT").append(selectPrefix).append("\n  ");
			plain.append(String.join(",\n  ", selectParts));

			plain.append("\nFROM ").append(fromClause);
			plain.append(where);

			// GROUP BY every selected dimension, with or without a measure. Without it, picking one
			// dimension alone returned one row per base row instead of one row per distinct value.
			if (!columnExprs.isEmpty()) {
				plain.append("\nGROUP BY\n  ").append(String.join(",\n  ", columnExprs));
			}
			if (!havingClauses.isEmpty()) {
				plain.append("\nHAVING ").append(String.join("\n  AND ", havingClauses));
			}
			if (!orderBy.isEmpty()) {
				List<String> parts = new ArrayList<>();
				for (OrderBy order : orderBy) {
					String name = order.measure
							? measureNames.get(order.index)
							: columns.get(order.index).alias;
					parts.add(CubeSqlDialect.quoteAlias(name, vendor) + " " + order.direction);
				}
				plain.append("\nORDER BY\n  ").append(String.join(",\n  ", parts));
			}

			plain.append(limitClause).append(tail);
			sql = plain.toString();
		}

		return new CubeQuery(nothingUnresolvedLeft(sql), binder.params);
	}

	/** The operators a value filter may ask for. Anything else is a mistake in the request. */
	static final List<String> OPERATORS = List.of(
			"in", "notIn", "between", "gte", "lte", "contains", "set", "notSet");

	/**
	 * The values a query carries, each under a name the SQL refers to.
	 *
	 * <p>Nothing a caller sent is ever written into the statement: a value is bound, so a name with
	 * an apostrophe in it is a name and not a syntax error, and a value that was meant as SQL stays
	 * a value. See {@link CubeQuery}.
	 */
	private static final class Binder {
		private final Map<String, Object> params = new LinkedHashMap<>();
		private int bound;

		/** Binds one value and returns how the SQL names it. */
		String bind(Object value) {
			String name = "cf" + (++bound);
			params.put(name, value);
			return ":" + name;
		}

		/** Binds a list under one number, {@code :cf3_0, :cf3_1, …}, for an IN. */
		List<String> bindAll(List<Object> values) {
			String stem = "cf" + (++bound);
			List<String> references = new ArrayList<>();
			for (int i = 0; i < values.size(); i++) {
				params.put(stem + "_" + i, values.get(i));
				references.add(":" + stem + "_" + i);
			}
			return references;
		}
	}

	/**
	 * One filter, as SQL: the member's expression, the operator, and a placeholder for every value.
	 *
	 * @param expr   the member's own expression — for a time dimension the untruncated one, so the
	 *               filter asks about the day the row carries and not about the month it is
	 *               grouped under
	 * @param type   the member's declared type, which says what its values are converted to
	 */
	private static String filterCondition(
			String expr,
			String member,
			String type,
			Map<String, Object> filter,
			String vendor,
			Binder binder) {

		String operator = Objects.toString(filter.get("operator"), "").trim();
		List<Object> values = new ArrayList<>();
		if (filter.get("values") instanceof List) {
			values.addAll((List<Object>) filter.get("values"));
		}

		switch (operator) {
			case "set":
				return expr + " IS NOT NULL";

			case "notSet":
				return expr + " IS NULL";

			case "in":
			case "notIn": {
				if (values.isEmpty()) {
					throw new IllegalArgumentException("The filter on '" + member + "' asks for '" + operator
							+ "' without a value to compare with.");
				}
				List<Object> typed = new ArrayList<>();
				for (Object raw : values) typed.add(convert(raw, type, member, vendor, false));
				return expr + ("in".equals(operator) ? " IN (" : " NOT IN (")
						+ String.join(", ", binder.bindAll(typed)) + ")";
			}

			case "gte":
			case "lte": {
				if (values.isEmpty() || values.get(0) == null) {
					throw new IllegalArgumentException("The filter on '" + member + "' asks for '" + operator
							+ "' without a value to compare with.");
				}
				return expr + ("gte".equals(operator) ? " >= " : " <= ")
						+ binder.bind(convert(values.get(0), type, member, vendor, false));
			}

			case "between": {
				Object from = values.size() > 0 ? values.get(0) : null;
				Object to = values.size() > 1 ? values.get(1) : null;
				if (from == null && to == null) {
					throw new IllegalArgumentException("The filter on '" + member + "' asks for 'between' "
							+ "with neither end given, so it filters nothing.");
				}
				List<String> ends = new ArrayList<>();
				if (from != null) {
					ends.add(expr + " >= " + binder.bind(convert(from, type, member, vendor, false)));
				}
				if (to != null) {
					// A time range includes the whole last day, and a timestamp column holds the
					// hours too, so the upper end is the day after, excluded.
					boolean time = "time".equals(type);
					ends.add(expr + (time ? " < " : " <= ")
							+ binder.bind(convert(to, type, member, vendor, time)));
				}
				return "(" + String.join(" AND ", ends) + ")";
			}

			case "contains": {
				if (values.isEmpty() || values.get(0) == null) {
					throw new IllegalArgumentException("The filter on '" + member + "' asks for 'contains' "
							+ "without a text to look for.");
				}
				String text = values.get(0).toString();
				return CubeSqlDialect.containsFilter(expr,
						binder.bind("%" + CubeSqlDialect.likeValue(text, vendor) + "%"), vendor);
			}

			default:
				throw new IllegalArgumentException("The filter on '" + member + "' asks for '" + operator
						+ "', which is not an operator. It may be one of: " + String.join(", ", OPERATORS) + ".");
		}
	}

	/**
	 * A value the caller sent, as the type the member it filters is declared to be. A value that
	 * does not convert is a bad request naming the member, never a database error later on.
	 *
	 * @param dayAfter the day after the value, for the upper end of a time range
	 */
	private static Object convert(Object raw, String type, String member, String vendor, boolean dayAfter) {

		if (raw == null) return null;
		String text = raw.toString().trim();

		if ("number".equals(type)) {
			try {
				return new BigDecimal(text);
			} catch (NumberFormatException wrong) {
				throw refusedValue(member, "a number", text);
			}
		}

		if ("boolean".equals(type)) {
			if ("true".equalsIgnoreCase(text)) return Boolean.TRUE;
			if ("false".equalsIgnoreCase(text)) return Boolean.FALSE;
			throw refusedValue(member, "true or false", text);
		}

		if ("time".equals(type)) {
			try {
				String iso = text.replace(' ', 'T');
				LocalDateTime stamp = iso.length() > 10 ? LocalDateTime.parse(iso) : null;
				LocalDate day = stamp == null ? LocalDate.parse(iso) : null;
				if (dayAfter) {
					if (stamp != null) stamp = stamp.plusDays(1);
					else day = day.plusDays(1);
				}
				// What a date is bound as is the vendor layer's business: on SQLite a time column
				// is read as text, and a date bound as a date would compare with nothing.
				return CubeSqlDialect.timeParameter(day, stamp, vendor);
			} catch (DateTimeParseException wrong) {
				throw refusedValue(member, "a date, as 2024-01-31 or 2024-01-31 18:00:00", text);
			}
		}

		return text;
	}

	private static IllegalArgumentException refusedValue(String member, String wanted, String text) {
		return new IllegalArgumentException("The filter on '" + member + "' was given '" + text
				+ "', and '" + member + "' takes " + wanted + ".");
	}

	/** One column of the answer: a dimension, or one of a geo dimension's two coordinates. */
	private static final class Column {
		final String alias;
		final String expr;
		final String dimension;
		boolean geo;
		boolean subQuery;
		boolean time;
		String order;

		Column(String alias, String expr, String dimension) {
			this.alias = alias;
			this.expr = expr;
			this.dimension = dimension;
		}
	}

	/** One ORDER BY entry: which selected column or measure, and which way. */
	private static final class OrderBy {
		final boolean measure;
		final int index;
		final String direction;

		OrderBy(boolean measure, int index, String direction) {
			this.measure = measure;
			this.index = index;
			this.direction = direction;
		}
	}

	/**
	 * The inner query of the two-level form: the value of every measure, once per row of the main
	 * table, so the outer query can aggregate over a plain column instead of over a subquery.
	 */
	private static final class TwoLevel {
		private final List<String> inner = new ArrayList<>();

		/** Adds {@code valueExpr} to the inner query and returns how the outer query reads it. */
		String column(String valueExpr) {
			String name = "m" + inner.size();
			inner.add(valueExpr + " AS " + name);
			return "q." + name;
		}
	}

	/**
	 * What the answer is ordered by: what the request asks for; else what the selected dimensions
	 * declare; else the rule that makes the first screen useful — the first time dimension
	 * ascending, else the first measure descending, else the first dimension, ascending.
	 *
	 * <p>A geo dimension is never ordered by: a pair of coordinates has no order.
	 */
	private static List<OrderBy> orderBy(
			List<String> requestOrder,
			List<Column> columns,
			List<String> measureNames,
			CubeOptions cube) {

		List<OrderBy> order = new ArrayList<>();
		if (columns.isEmpty()) return order;

		if (requestOrder != null && !requestOrder.isEmpty()) {
			for (String asked : requestOrder) {
				String[] parts = asked.trim().split("\\s+");
				String member = parts[0];
				String direction = parts.length > 1 ? parts[1].toLowerCase() : "asc";
				if (!CubeRules.ORDERS.contains(direction)) {
					throw new IllegalArgumentException("'" + asked + "' asks to be ordered '" + direction
							+ "', which is not an order. An order may be 'asc' or 'desc'.");
				}
				int measureIndex = measureNames.indexOf(member);
				if (measureIndex >= 0) {
					order.add(new OrderBy(true, measureIndex, direction.toUpperCase()));
					continue;
				}
				int columnIndex = -1;
				for (int i = 0; i < columns.size(); i++) {
					if (columns.get(i).dimension.equals(member) && columnIndex < 0) columnIndex = i;
				}
				if (columnIndex < 0) {
					// A time dimension asked for with its granularity - CreatedDate.day, the form
					// the dimensions list itself uses - comes back under its plain name. So the
					// request may name it either way and mean the same column: refusing the glued
					// form here would tell a caller that the field it just asked for and is
					// looking at is "not one of the fields it returns".
					int dot = member.lastIndexOf('.');
					if (dot > 0 && CubeSqlDialect.GRANULARITIES.contains(
							member.substring(dot + 1).toLowerCase())) {
						String plain = member.substring(0, dot);
						for (int i = 0; i < columns.size(); i++) {
							if (columns.get(i).dimension.equals(plain) && columnIndex < 0) columnIndex = i;
						}
					}
				}
				if (columnIndex < 0) {
					throw new IllegalArgumentException("The answer cannot be ordered by '" + member
							+ "', because it is not one of the fields it returns.");
				}
				if (columns.get(columnIndex).geo) {
					throw new IllegalArgumentException("Dimension '" + member + "' is a geo dimension, so "
							+ "it cannot be ordered by: a pair of coordinates has no order.");
				}
				order.add(new OrderBy(false, columnIndex, direction.toUpperCase()));
			}
			return order;
		}

		for (int i = 0; i < columns.size(); i++) {
			Column column = columns.get(i);
			if (column.order == null || column.geo) continue;
			String direction = column.order.trim().toLowerCase();
			if (!CubeRules.ORDERS.contains(direction)) continue;   // refused earlier, by CubeRules
			order.add(new OrderBy(false, i, direction.toUpperCase()));
		}
		if (!order.isEmpty()) return order;

		for (int i = 0; i < columns.size(); i++) {
			if (columns.get(i).time && !columns.get(i).geo) {
				order.add(new OrderBy(false, i, "ASC"));
				return order;
			}
		}
		if (!measureNames.isEmpty()) {
			order.add(new OrderBy(true, 0, "DESC"));
			return order;
		}
		for (int i = 0; i < columns.size(); i++) {
			if (!columns.get(i).geo) {
				order.add(new OrderBy(false, i, "ASC"));
				return order;
			}
		}
		return order;
	}

	/**
	 * A {@code sub_query} dimension's expression: each {@code ${X.m}} becomes a correlated scalar
	 * subquery that reads the joined table X, so the value is one number per row of the main table
	 * however many rows X holds — it cannot double count.
	 */
	private static String subQueryExpression(
			Map<String, Object> dim,
			String dimName,
			CubeOptions cube,
			String cubeRef,
			String vendor) {

		if (!CubeSqlDialect.correlatedSubqueries(vendor)) {
			throw new IllegalArgumentException("Dimension '" + dimName + "' is a sub_query, and this "
					+ "database does not run a correlated subquery in a SELECT. Pick another field, or "
					+ "another connection.");
		}

		String sql = Objects.toString(dim.get("sql"), "");
		Matcher matcher = PLACEHOLDER.matcher(sql);
		StringBuilder out = new StringBuilder();
		while (matcher.find()) {
			String reference = matcher.group(1).trim();
			int dot = reference.lastIndexOf('.');
			if (dot <= 0) continue;

			String joinName = reference.substring(0, dot);
			String measureName = reference.substring(dot + 1);
			Map<String, Object> join = CubeRules.findJoin(cube, joinName);
			String joinSql = Objects.toString(join.get("sql"), "").replace("${CUBE}", cubeRef);
			String joinRef = CubeSqlDialect.quoteIdent(joinName, vendor);

			String aggregate;
			Map<String, Object> measure = CubeRules.measureOfNamedCube(cube, joinName, measureName);
			if (measure == null) {
				aggregate = "COUNT(*)";
			} else {
				// The named cube's own measure, read on the joined table: its type, its sql, its
				// filters and its casts, so the number means the same here as it does there.
				CubeOptions named = cube.getNamedOptions().get(joinName);
				aggregate = measureExpression(measureName, named, joinRef, vendor, new LinkedHashSet<>(),
						new ArrayDeque<>(), null);
			}

			matcher.appendReplacement(out, Matcher.quoteReplacement(
					"(SELECT " + aggregate + " FROM " + joinRef + " WHERE " + joinSql + ")"));
		}
		matcher.appendTail(out);
		return out.toString();
	}

	/**
	 * Throws the first thing {@link CubeRules} finds wrong with a member the caller selected, so
	 * the answer is the sentence that says what to fix rather than a 500 or, worse, a number.
	 */
	private static void refuseWhatTheCubeGotWrong(CubeOptions cube, String block,
			Map<String, Object> member) {
		List<String> errors = CubeRules.errors(cube, block, member);
		if (!errors.isEmpty()) {
			throw new IllegalArgumentException(errors.get(0));
		}
	}

	/**
	 * The safety net: nothing the cube writes as a placeholder may reach the database. A plain
	 * {@code ${param}} is left alone on purpose — report datasources bind it — but {@code ${CUBE}}
	 * and a dotted {@code ${a.b}} mean the generator failed to resolve something.
	 */
	private static String nothingUnresolvedLeft(String sql) {
		Matcher matcher = PLACEHOLDER.matcher(sql);
		while (matcher.find()) {
			String reference = matcher.group(1).trim();
			if ("CUBE".equals(reference) || reference.contains(".")) {
				throw new IllegalArgumentException("The generated SQL still holds '${" + reference
						+ "}', which the database cannot read. Nothing resolves it in this cube.");
			}
		}
		return sql;
	}

	/** The node the main table is, in a cube's join tree. */
	private static final String MAIN_TABLE = "CUBE";

	/** The internal aliases of the no-double-counting rewrite — plain identifiers, never reserved. */
	private static final String KEYS = "__keys";
	private static final String MULT = "__mult";
	private static final String PK = "__pk";

	/**
	 * The query the plain form would answer wrongly, written so that it answers rightly: every
	 * multiplied measure is aggregated once per key of its own table, in a {@code WITH}, and joined
	 * back onto the dimensions.
	 *
	 * <p>This is standard SQL — {@code WITH} is SQL:1999 and every supported database has it — so
	 * there is nothing vendor-specific here. A query it cannot rewrite is refused with a message
	 * naming the measure and the join, never answered with a number that is too big.
	 */
	private static String withoutDoubleCounting(
			CubeOptions cube,
			String cubeRef,
			String vendor,
			String fromSource,
			String fromClause,
			String where,
			String keyInKeys,
			String keyExpr,
			List<Column> columns,
			List<String> columnExprs,
			List<String> measureNames,
			List<String> measureExprs,
			List<String> mainTableMeasureExprs,
			Map<String, String> multipliedBy,
			List<OrderBy> orderBy,
			String selectPrefix,
			List<String> outerWhereClauses) {

		for (Map.Entry<String, String> multiplied : multipliedBy.entrySet()) {
			refuseWhatCannotBeRewritten(multiplied.getKey(), multiplied.getValue(), cube, cubeRef);
		}

		List<String> keyParts = new ArrayList<>();
		for (int i = 0; i < columnExprs.size(); i++) {
			keyParts.add(columnExprs.get(i) + " AS d" + i);
		}
		keyParts.add(keyInKeys + " AS " + CubeSqlDialect.internalAlias(PK, vendor));

		StringBuilder sql = new StringBuilder();
		sql.append("WITH ").append(CubeSqlDialect.internalAlias(KEYS, vendor))
				.append(" AS (\n  SELECT DISTINCT ")
				.append(String.join(", ", keyParts))
				.append("\n  FROM ").append(fromClause).append(where).append("\n),\n");

		// Every multiplied measure, once per key of the main table. This part reads the main table
		// itself, so it takes the measures' plain form even when the outer query is two-level.
		List<String> multParts = new ArrayList<>();
		for (int i = 0; i < columnExprs.size(); i++) multParts.add("k.d" + i);
		for (int i = 0; i < measureNames.size(); i++) {
			if (multipliedBy.containsKey(measureNames.get(i))) {
				multParts.add(mainTableMeasureExprs.get(i) + " AS "
						+ CubeSqlDialect.quoteAlias(measureNames.get(i), vendor));
			}
		}
		sql.append(CubeSqlDialect.internalAlias(MULT, vendor)).append(" AS (\n  SELECT ")
				.append(String.join(", ", multParts))
				.append("\n  FROM ").append(CubeSqlDialect.internalAlias(KEYS, vendor))
				.append(" k LEFT JOIN ").append(fromSource)
				.append(" ON ").append(keyExpr).append(" = k.")
				.append(CubeSqlDialect.internalAlias(PK, vendor));
		if (!columnExprs.isEmpty()) {
			List<String> multGroup = new ArrayList<>();
			for (int i = 0; i < columnExprs.size(); i++) multGroup.add("k.d" + i);
			sql.append("\n  GROUP BY ").append(String.join(", ", multGroup));
		}
		sql.append("\n)\n");

		boolean hasPlainMeasures = measureNames.size() > multipliedBy.size();

		List<String> outerParts = new ArrayList<>();
		String dimSource = hasPlainMeasures ? "m" : "x";
		for (int i = 0; i < columns.size(); i++) {
			outerParts.add(dimSource + ".d" + i + " AS "
					+ CubeSqlDialect.quoteAlias(columns.get(i).alias, vendor));
		}
		for (String measName : measureNames) {
			String side = multipliedBy.containsKey(measName) ? "x" : "m";
			outerParts.add(side + "." + CubeSqlDialect.quoteAlias(measName, vendor));
		}

		sql.append("SELECT").append(selectPrefix).append("\n  ").append(String.join(",\n  ", outerParts));

		if (hasPlainMeasures) {
			// m is the ordinary query, for the measures the joins do not multiply.
			List<String> plainParts = new ArrayList<>();
			for (int i = 0; i < columnExprs.size(); i++) plainParts.add(columnExprs.get(i) + " AS d" + i);
			for (int i = 0; i < measureNames.size(); i++) {
				if (!multipliedBy.containsKey(measureNames.get(i))) {
					plainParts.add(measureExprs.get(i) + " AS "
							+ CubeSqlDialect.quoteAlias(measureNames.get(i), vendor));
				}
			}
			StringBuilder plain = new StringBuilder("SELECT ");
			plain.append(String.join(", ", plainParts)).append(" FROM ").append(fromClause).append(where);
			if (!columnExprs.isEmpty()) {
				plain.append(" GROUP BY ").append(String.join(", ", columnExprs));
			}

			sql.append("\nFROM (").append(plain).append(") m");

			if (columnExprs.isEmpty()) {
				// Both sides are one row, and there is nothing to match them on.
				sql.append("\nCROSS JOIN ").append(CubeSqlDialect.internalAlias(MULT, vendor)).append(" x");
			} else {
				// One NULL-safe equality per dimension, written out: no vendor has to be asked
				// whether it spells this IS NOT DISTINCT FROM, <=> or something else again.
				List<String> on = new ArrayList<>();
				for (int i = 0; i < columnExprs.size(); i++) {
					on.add("(m.d" + i + " = x.d" + i + " OR (m.d" + i + " IS NULL AND x.d" + i + " IS NULL))");
				}
				sql.append("\nLEFT JOIN ").append(CubeSqlDialect.internalAlias(MULT, vendor))
						.append(" x ON ").append(String.join("\n  AND ", on));
			}
		} else {
			sql.append("\nFROM ").append(CubeSqlDialect.internalAlias(MULT, vendor)).append(" x");
		}

		if (!outerWhereClauses.isEmpty()) {
			sql.append("\nWHERE ").append(String.join("\n  AND ", outerWhereClauses));
		}

		if (!orderBy.isEmpty()) {
			List<String> parts = new ArrayList<>();
			for (OrderBy order : orderBy) {
				parts.add((order.measure
						? (multipliedBy.containsKey(measureNames.get(order.index)) ? "x" : "m")
								+ "." + CubeSqlDialect.quoteAlias(measureNames.get(order.index), vendor)
						: dimSource + ".d" + order.index)
						+ " " + order.direction);
			}
			sql.append("\nORDER BY ").append(String.join(", ", parts));
		}

		return sql.toString();
	}

	/**
	 * The join that makes {@code measName} count more than once, or null when nothing does.
	 *
	 * <p>Only SUM, AVG and COUNT can be multiplied by repeated rows — and a {@code number} measure
	 * that uses one. COUNT DISTINCT, MIN and MAX read the same answer however often a row appears.
	 */
	private static String multiplyingJoin(
			String measName,
			CubeOptions cube,
			Map<String, Map<String, Object>> joinByName,
			Set<String> requiredJoins) {

		if (requiredJoins.isEmpty()) return null;
		if (!countsRows(measName, cube, new ArrayDeque<>())) return null;

		Set<String> homes = measureTables(measName, cube, new ArrayDeque<>());
		List<String> starts = new ArrayList<>();
		if (homes.isEmpty()) {
			starts.add(MAIN_TABLE);
		} else {
			for (String home : homes) starts.add(requiredJoins.contains(home) ? home : MAIN_TABLE);
		}

		for (String start : starts) {
			String join = walkToMany(start, joinByName, requiredJoins);
			if (join != null) return join;
		}
		return null;
	}

	/**
	 * Walks the query's join tree away from {@code start} and returns the first join reached
	 * through a "to many" edge — the join whose rows repeat the rows of the start table.
	 *
	 * <p>An edge walked down, parent to child, is the relationship the cube declares; walked up it
	 * is the reverse, because a many_to_one seen from the other side is a one_to_many.
	 */
	private static String walkToMany(
			String start,
			Map<String, Map<String, Object>> joinByName,
			Set<String> requiredJoins) {

		Set<String> nodes = new LinkedHashSet<>();
		nodes.add(MAIN_TABLE);
		nodes.addAll(requiredJoins);
		if (!nodes.contains(start)) return null;

		Deque<String> queue = new ArrayDeque<>();
		Set<String> seen = new LinkedHashSet<>();
		queue.add(start);
		seen.add(start);

		while (!queue.isEmpty()) {
			String node = queue.poll();
			for (String other : nodes) {
				if (seen.contains(other)) continue;

				String relationship = null;
				String multiplier = null;
				if (!MAIN_TABLE.equals(other) && node.equals(parentOf(joinByName.get(other)))) {
					relationship = relationshipOf(joinByName.get(other));   // walked down
					multiplier = other;
				} else if (!MAIN_TABLE.equals(node) && other.equals(parentOf(joinByName.get(node)))) {
					relationship = reverseOf(relationshipOf(joinByName.get(node)));  // walked up
					multiplier = other;
				}
				if (relationship == null) continue;

				if ("one_to_many".equals(relationship)) return multiplier;

				seen.add(other);
				queue.add(other);
			}
		}
		return null;
	}

	/** A join's parent, {@code CUBE} when it declares none — the shape every cube already uses. */
	private static String parentOf(Map<String, Object> join) {
		return join == null ? MAIN_TABLE : Objects.toString(join.get("parent"), MAIN_TABLE);
	}

	/**
	 * A join's relationship, under its one name. The DSL accepts three spellings of each; a join
	 * with none, or with a name nobody knows, counts as many_to_one, which is what the generator
	 * has always assumed.
	 */
	private static String relationshipOf(Map<String, Object> join) {
		String declared = join == null ? "" : Objects.toString(join.get("relationship"), "").trim().toLowerCase();
		switch (declared) {
			case "one_to_many":
			case "has_many":
			case "hasmany":
				return "one_to_many";
			case "one_to_one":
			case "has_one":
			case "hasone":
				return "one_to_one";
			default:
				return "many_to_one";
		}
	}

	/** The same relationship seen from the other table. */
	private static String reverseOf(String relationship) {
		switch (relationship) {
			case "one_to_many": return "many_to_one";
			case "many_to_one": return "one_to_many";
			default:            return relationship;
		}
	}

	/** True when this measure's value grows if its rows are repeated — and a number measure's. */
	private static boolean countsRows(String measName, CubeOptions cube, Deque<String> stack) {
		Map<String, Object> meas = findMember(cube.getMeasures(), measName);
		if (meas == null || stack.contains(measName)) return false;

		String type = Objects.toString(meas.get("type"), "count").toLowerCase();
		if ("sum".equals(type) || "avg".equals(type) || "count".equals(type)) return true;
		if (!"number".equals(type)) return false;

		stack.addLast(measName);
		try {
			Matcher matcher = PLACEHOLDER.matcher(Objects.toString(meas.get("sql"), ""));
			while (matcher.find()) {
				if (countsRows(matcher.group(1).trim(), cube, stack)) return true;
			}
			return false;
		} finally {
			stack.removeLast();
		}
	}

	/**
	 * The joined tables a measure's own SQL lives on — empty when it lives on the main table. A
	 * calculated measure lives where the measures it references live.
	 */
	private static Set<String> measureTables(String measName, CubeOptions cube, Deque<String> stack) {
		Set<String> tables = new LinkedHashSet<>();
		Map<String, Object> meas = findMember(cube.getMeasures(), measName);
		if (meas == null || stack.contains(measName)) return tables;

		String sqlExpr = Objects.toString(meas.get("sql"), null);
		if (sqlExpr == null) return tables;

		if ("number".equals(Objects.toString(meas.get("type"), "count").toLowerCase())) {
			stack.addLast(measName);
			try {
				Matcher matcher = PLACEHOLDER.matcher(sqlExpr);
				while (matcher.find()) {
					tables.addAll(measureTables(matcher.group(1).trim(), cube, stack));
				}
			} finally {
				stack.removeLast();
			}
			return tables;
		}

		detectReferencedTables(sqlExpr, cube, tables);
		return tables;
	}

	/**
	 * The main table's key, as a dimension flagged {@code primary_key} whose SQL is on the main
	 * table. Without one there is nothing to aggregate the multiplied measures once per, so the
	 * query is refused rather than answered with a total that is too big.
	 */
	private static String mainTableKey(
			CubeOptions cube,
			String cubeRef,
			List<String> measureNames,
			Map<String, String> multipliedBy) {

		if (cube.getDimensions() != null) {
			for (Map<String, Object> dim : cube.getDimensions()) {
				if (!Boolean.parseBoolean(Objects.toString(dim.get("primary_key"), "false"))) continue;
				Set<String> tables = new LinkedHashSet<>();
				String sqlExpr = resolveSql(dim, cubeRef);
				detectReferencedTables(sqlExpr, cube, tables);
				// The first one declared wins, as the design says; a second is the cube author's
				// mistake and the parser warns about it.
				if (tables.isEmpty()) return sqlExpr;
			}
		}

		Map.Entry<String, String> first = multipliedBy.entrySet().iterator().next();
		throw new IllegalArgumentException(refusal(first.getKey(), first.getValue(),
				"Add a primary_key dimension on the cube's own table"));
	}

	/** The three things the rewrite cannot do, each a refusal naming the measure and the join. */
	private static void refuseWhatCannotBeRewritten(
			String measName,
			String join,
			CubeOptions cube,
			String cubeRef) {

		Set<String> homes = measureTables(measName, cube, new ArrayDeque<>());
		if (homes.size() > 1) {
			throw new IllegalArgumentException(refusal(measName, join,
					"Give " + measName + " an sql that reads one table only"));
		}
		if (homes.size() == 1) {
			throw new IllegalArgumentException(refusal(measName, join,
					"Only a measure on the cube's own table can be counted once per key, and "
							+ measName + " is on " + homes.iterator().next()));
		}

		Map<String, Object> meas = findMember(cube.getMeasures(), measName);
		Set<String> filterTables = new LinkedHashSet<>();
		String condition = filterCondition(meas, cube, cubeRef, filterTables);
		if (condition != null && !filterTables.isEmpty()) {
			throw new IllegalArgumentException(refusal(measName, join,
					"Its filter reads " + String.join(", ", filterTables)
							+ ", which is not there once per key"));
		}
	}

	/** One refusal, in the shape the design writes down. */
	private static String refusal(String measName, String join, String whatToDo) {
		return measName + " would be counted once per row of " + join + ". " + whatToDo
				+ ", or pick fields that do not use " + join + ".";
	}

	/**
	 * A dimension's SQL expression: its own {@code sql}, or the {@code CASE} a {@code case_} block
	 * describes. The expression is used in SELECT and in GROUP BY alike, so the two cannot drift.
	 *
	 * <p>A {@code time} dimension is read through {@link CubeSqlDialect#timeValue} and, when a
	 * granularity was asked for, truncated with {@link CubeSqlDialect#dateTrunc}.
	 */
	@SuppressWarnings("unchecked")
	private static String dimensionExpression(
			Map<String, Object> dim,
			String dimName,
			String granularity,
			CubeOptions cube,
			String cubeRef,
			String vendor,
			Set<String> referencedTables) {

		boolean isTime = "time".equals(Objects.toString(dim.get("type"), "").trim().toLowerCase());

		if (granularity != null && !isTime) {
			throw new IllegalArgumentException("Dimension '" + dimName + "' is not a time dimension, so it "
					+ "cannot be grouped by '" + granularity + "'. A granularity may only be asked of a "
					+ "dimension declared type 'time'.");
		}

		Object caseBlock = dim.get("case");
		if (!(caseBlock instanceof Map)) {
			String sqlExpr = resolveSql(dim, cubeRef);
			detectReferencedTables(sqlExpr, cube, referencedTables);
			if (isTime) {
				// Read through timeValue first, then truncate: the truncation works on the value
				// the user sees, and SELECT, GROUP BY and ORDER BY all share this one expression.
				sqlExpr = CubeSqlDialect.timeValue(sqlExpr, vendor);
				if (granularity != null) {
					sqlExpr = CubeSqlDialect.dateTrunc(sqlExpr, granularity, vendor);
				}
			}
			return sqlExpr;
		}

		Map<String, Object> caseMap = (Map<String, Object>) caseBlock;
		StringBuilder expr = new StringBuilder("CASE");

		Object whens = caseMap.get("when");
		if (whens instanceof List) {
			for (Object one : (List<Object>) whens) {
				if (!(one instanceof Map)) continue;
				Map<String, Object> when = (Map<String, Object>) one;
				String whenSql = Objects.toString(when.get("sql"), null);
				if (whenSql == null) continue;
				whenSql = whenSql.replace("${CUBE}", cubeRef);
				detectReferencedTables(whenSql, cube, referencedTables);
				expr.append(" WHEN (").append(whenSql).append(") THEN ")
						.append(CubeSqlDialect.stringLiteral(Objects.toString(when.get("label"), ""), vendor));
			}
		}

		Object elseClause = caseMap.get("else");
		if (elseClause instanceof Map) {
			Object label = ((Map<String, Object>) elseClause).get("label");
			if (label != null) {
				expr.append(" ELSE ").append(CubeSqlDialect.stringLiteral(label.toString(), vendor));
			}
		}

		return expr.append(" END").toString();
	}

	/**
	 * A measure's full SQL expression: its aggregate, its {@code filters} folded into that
	 * aggregate, and — for a calculated {@code number} measure — every {@code ${OtherMeasure}}
	 * replaced by that measure's own full expression.
	 *
	 * @param stack the measures being expanded, innermost last, so a reference cycle is named
	 *              rather than followed until the stack overflows.
	 */
	@SuppressWarnings("unchecked")
	private static String measureExpression(
			String measName,
			CubeOptions cube,
			String cubeRef,
			String vendor,
			Set<String> referencedTables,
			Deque<String> stack,
			TwoLevel two) {

		Map<String, Object> meas = findMember(cube.getMeasures(), measName);
		if (meas == null) {
			throw new IllegalArgumentException("Measure '" + measName + "' is not a measure of this cube.");
		}

		if (stack.contains(measName)) {
			List<String> cycle = new ArrayList<>(stack);
			cycle.add(measName);
			throw new IllegalArgumentException(CubeRules.cycleMessage(measName, cycle));
		}

		String type = Objects.toString(meas.get("type"), "count").toLowerCase();
		if (!MEASURE_TYPES.contains(type)) {
			throw new IllegalArgumentException(CubeRules.unknownMeasureType(measName, type));
		}

		String explicitSql = Objects.toString(meas.get("sql"), null);
		String sqlExpr = resolveSql(meas, cubeRef);

		if ("number".equals(type)) {
			// Already an aggregate expression: it is not wrapped and it is not in GROUP BY. Each
			// ${OtherMeasure} becomes that measure's own full expression, filters and casts included.
			stack.addLast(measName);
			try {
				String expanded = expandMeasureReferences(measName, sqlExpr, cube, cubeRef, vendor,
						referencedTables, stack, two);
				detectReferencedTables(expanded, cube, referencedTables);
				return expanded;
			} finally {
				stack.removeLast();
			}
		}

		if (explicitSql != null) {
			detectReferencedTables(sqlExpr, cube, referencedTables);
		}

		String condition = filterCondition(meas, cube, cubeRef, referencedTables);
		if (two == null) {
			return aggregate(type, sqlExpr, explicitSql != null, condition);
		}

		// The two-level form: the value this measure aggregates is computed once per row of the
		// main table, in the inner query, and the outer query aggregates that column. It is the
		// same number the plain form takes — only where it is computed changes.
		if ("count".equals(type) && explicitSql == null) {
			return condition == null
					? "COUNT(*)"
					: "COUNT(" + two.column("CASE WHEN " + condition + " THEN 1 END") + ")";
		}
		String value = condition == null
				? sqlExpr
				: "CASE WHEN " + condition + " THEN " + sqlExpr + " END";
		return aggregate(type, two.column(value), true, null);
	}

	/**
	 * Replaces every {@code ${Name}} left in a calculated measure's SQL with that measure's full
	 * expression. A name that is no measure of the cube is a mistake in the cube, not something to
	 * pass through to the database as text.
	 */
	private static String expandMeasureReferences(
			String owner,
			String sqlExpr,
			CubeOptions cube,
			String cubeRef,
			String vendor,
			Set<String> referencedTables,
			Deque<String> stack,
			TwoLevel two) {

		if (sqlExpr == null) return null;

		Matcher matcher = PLACEHOLDER.matcher(sqlExpr);
		StringBuilder out = new StringBuilder();
		while (matcher.find()) {
			String name = matcher.group(1).trim();
			if (findMember(cube.getMeasures(), name) == null) {
				throw new IllegalArgumentException(
						CubeRules.unknownMeasureReference(owner, matcher.group(1)));
			}
			String replacement = "("
					+ measureExpression(name, cube, cubeRef, vendor, referencedTables, stack, two) + ")";
			matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
		}
		matcher.appendTail(out);

		return out.toString();
	}

	/**
	 * A measure's {@code filters}, as one standard-SQL condition: each filter's own SQL in its own
	 * parentheses, joined with AND. Null when the measure has none.
	 */
	@SuppressWarnings("unchecked")
	private static String filterCondition(
			Map<String, Object> meas,
			CubeOptions cube,
			String cubeRef,
			Set<String> referencedTables) {

		Object raw = meas.get("filters");
		if (!(raw instanceof List)) return null;

		List<String> conditions = new ArrayList<>();
		for (Object one : (List<Object>) raw) {
			if (!(one instanceof Map)) continue;
			String filterSql = Objects.toString(((Map<String, Object>) one).get("sql"), null);
			if (filterSql == null) continue;
			filterSql = filterSql.replace("${CUBE}", cubeRef);
			// A filter on a joined table brings that join, exactly as a dimension would.
			detectReferencedTables(filterSql, cube, referencedTables);
			conditions.add("(" + filterSql + ")");
		}

		return conditions.isEmpty() ? null : String.join(" AND ", conditions);
	}

	/**
	 * The aggregate for a measure, in standard SQL.
	 *
	 * <p>SUM and AVG are cast to a fixed DECIMAL so that the same query answers the same number on
	 * every database: left alone, an integer column sums to an integer here and to a floating-point
	 * value there. COUNT, COUNT DISTINCT, MIN and MAX keep the column's own type.
	 *
	 * <p>A measure's {@code filters} become a {@code CASE} inside the aggregate — the standard way
	 * to aggregate part of the rows without a second query.
	 */
	private static String aggregate(String type, String sqlExpr, boolean hasExplicitSql, String condition) {

		boolean filtered = condition != null;

		if (filtered && "count".equals(type) && !hasExplicitSql) {
			return "COUNT(CASE WHEN " + condition + " THEN 1 END)";
		}

		String value = filtered ? "CASE WHEN " + condition + " THEN " + sqlExpr + " END" : sqlExpr;

		switch (type) {
			case "sum":
				return "CAST(SUM(" + value + ") AS DECIMAL(31,4))";
			case "avg":
				return "CAST(AVG(CAST(" + value + " AS DECIMAL(31,4))) AS DECIMAL(31,4))";
			case "min":
				return "MIN(" + value + ")";
			case "max":
				return "MAX(" + value + ")";
			case "count_distinct":
				return "COUNT(DISTINCT " + value + ")";
			case "count":
			default:
				return hasExplicitSql ? "COUNT(" + value + ")" : "COUNT(*)";
		}
	}

	/**
	 * Which joined tables an SQL expression reads. There is one rule for this, in
	 * {@link CubeRules#referencedJoins}, and every place that asks the question asks it there: a
	 * join the generator misses is a column of a table the FROM clause never brought in.
	 */
	private static void detectReferencedTables(String sqlExpr, CubeOptions cube, Set<String> referencedTables) {
		referencedTables.addAll(CubeRules.referencedJoins(sqlExpr, CubeRules.joinNames(cube)));
	}

	/**
	 * Walks the parent chain for a join, adding all ancestors before the join itself.
	 * The cube source is the root, identified by parent value 'CUBE' (or missing parent,
	 * which defaults to 'CUBE' for backward compatibility with single-level cubes).
	 *
	 * Example: if Categories has parent=Products and Products has parent='Order Details',
	 * calling this with joinName='Categories' adds in order: 'Order Details', 'Products', 'Categories'.
	 */
	private static void addJoinAndAncestors(
			String joinName,
			Map<String, Map<String, Object>> joinByName,
			Set<String> requiredJoins) {
		if (joinName == null || joinName.isEmpty() || "CUBE".equals(joinName)) return;
		if (requiredJoins.contains(joinName)) return; // already added
		Map<String, Object> join = joinByName.get(joinName);
		if (join == null) return; // unknown join — silently skip
		// Recurse to parent FIRST so parent is added before child in iteration order.
		// Backward compatibility: missing parent defaults to 'CUBE' (L1 join).
		String parent = Objects.toString(join.get("parent"), "CUBE");
		addJoinAndAncestors(parent, joinByName, requiredJoins);
		requiredJoins.add(joinName);
	}

	private static Map<String, Object> findMember(List<Map<String, Object>> members, String name) {
		if (members == null) return null;
		return members.stream()
				.filter(m -> name.equals(m.get("name")))
				.findFirst()
				.orElse(null);
	}

	private static String resolveSql(Map<String, Object> member, String cubeRef) {
		String sql = Objects.toString(member.get("sql"), null);
		if (sql == null) {
			sql = Objects.toString(member.get("name"), null);
		}
		if (sql != null) {
			sql = sql.replace("${CUBE}", cubeRef);
		}
		return sql;
	}
}

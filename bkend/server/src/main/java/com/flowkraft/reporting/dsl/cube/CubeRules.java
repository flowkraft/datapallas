package com.flowkraft.reporting.dsl.cube;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;

/**
 * The one place that knows what a cube may say and which table each field is on.
 *
 * <p>Both halves of the product read this class: the parser, to list a file's {@code warnings} and
 * to say which folder each dimension belongs in, and the generator, to find a member's joins and to
 * refuse what it cannot write. Before it existed the two decided separately — the parser accepted
 * any key and any value, and the generator found joins with {@code contains(name + ".")}, which is
 * case-sensitive and is fooled by a longer name and by text inside quotes. A cube that hit the
 * difference got a field in one folder and its SQL from another table.
 *
 * <p>Nothing here is vendor-specific: it is about the cube, not about the database.
 */
public final class CubeRules {

	private CubeRules() {
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What a member may say. The tier is the one of the design's tiers table: it is what the UI
	// and the docs show, and it travels with the key so the two cannot drift apart.
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The keys a {@code cube} block itself may say, each with its tier.
	 *
	 * <p>Unlike a member's keys these cannot be misspelt into silence: the builder has one method
	 * per key and no catch-all, so {@code acces_filter 'x'} is a Groovy failure the author sees at
	 * once. The map is here all the same, because the tier is what the UI and the docs show and it
	 * has to travel with the key like every other one.
	 */
	public static final Map<String, Integer> CUBE_KEYS = keys(
			"sql_table", 3, "sql", 3, "sql_alias", 3, "extends", 5, "title", 1, "description", 2,
			"public", 3, "access_filter", 3, "currency", 4, "condition", 3,
			"meta", 5);

	/**
	 * The keys of one {@code condition} (R1), as the parser stores it: {@code sql} for the raw
	 * form, {@code member} / {@code operator} / {@code values} for the native one.
	 *
	 * <p>The author never writes these — {@code condition '…'} and
	 * {@code condition 'OrderDate', 'between', fromDate, toDate} are positional — but the tier
	 * travels with the key here as it does for every other block, and the UI and the docs read it.
	 */
	public static final Map<String, Integer> CONDITION_KEYS = keys(
			"sql", 3, "member", 3, "operator", 3, "values", 3);

	/** The keys of a {@code dimension} block, as the parser stores them, each with its tier. */
	public static final Map<String, Integer> DIMENSION_KEYS = keys(
			"name", 1, "title", 1, "description", 2, "sql", 3, "type", 3, "primary_key", 3,
			"case", 2, "sub_query", 2, "latitude", 2, "longitude", 2, "order", 3,
			"filter_options", 3, "format", 4, "drill_members", 4, "public", 3, "meta", 5);

	/** The keys of a {@code measure} block. */
	public static final Map<String, Integer> MEASURE_KEYS = keys(
			"name", 1, "title", 1, "description", 2, "sql", 3, "type", 3, "filters", 2,
			"share_of_total", 2, "rolling_window", 2, "time_shift", 2,
			"format", 4, "drill_members", 4, "public", 3, "meta", 5);

	/**
	 * Keys a rule of its own already explains, per block: they are not reported as unknown too,
	 * because one mistake is worth one line. {@code filter_options} on a measure is the one there
	 * is — it is a real key on the wrong member, and the line that says so says what happens to it.
	 */
	private static final Map<String, Set<String>> SAID_ELSEWHERE = Map.of(
			"measure", Set.of("filter_options"));

	/** The keys of a {@code join} block. */
	public static final Map<String, Integer> JOIN_KEYS = keys(
			"name", 3, "sql", 3, "relationship", 3, "parent", 3, "title", 1, "description", 2,
			"meta", 5);

	/** The keys of a {@code segment} block. */
	public static final Map<String, Integer> SEGMENT_KEYS = keys(
			"name", 1, "title", 1, "description", 2, "sql", 3, "public", 3, "meta", 5);

	/** The keys of a {@code hierarchy} block. */
	public static final Map<String, Integer> HIERARCHY_KEYS = keys(
			"name", 1, "title", 1, "description", 2, "levels", 1, "meta", 5);

	/** The measure types the generator knows. A measure with no type is a {@code count}. */
	public static final List<String> MEASURE_TYPES = List.of(
			"count", "count_distinct", "sum", "avg", "min", "max", "number");

	/** The dimension types the generator and the component know. A missing type is a string. */
	public static final List<String> DIMENSION_TYPES = List.of(
			"string", "number", "time", "boolean", "geo");

	/** The relationships a join may declare — the three spellings of each, as in "no double counting". */
	public static final List<String> RELATIONSHIPS = List.of(
			"one_to_many", "has_many", "hasMany", "many_to_one", "belongs_to", "belongsTo",
			"one_to_one", "has_one", "hasOne");

	/** The directions a dimension may ask to be ordered in. */
	public static final List<String> ORDERS = List.of("asc", "desc");

	/** The formats a measure may ask for. */
	public static final List<String> FORMATS = List.of("currency", "percent", "number");

	/**
	 * The units a {@code time_shift} may name, and the grains a query may be grouped by.
	 *
	 * <p>The same five {@code CubeSqlDialect} truncates and adds by. They are written twice because
	 * the vendor layer reads nothing above it — it is a leaf on purpose, so that no vendor form can
	 * grow a dependency on the DSL — and a test holds the two lists against each other, so the copy
	 * cannot drift.
	 */
	public static final List<String> TIME_UNITS = List.of("day", "week", "month", "quarter", "year");

	/** The measure types a share, a running total or a period comparison may be taken of. */
	public static final List<String> ADDS_UP = List.of("sum", "count", "count_distinct");

	/** An ISO 4217 code: three letters, which is all the formatter needs to be handed. */
	private static final Pattern CURRENCY_CODE = Pattern.compile("^[A-Za-z]{3}$");

	// ═══════════════════════════════════════════════════════════════════════════
	// Which joins a piece of SQL names — the one rule (design part 2, item 7)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The joins that {@code sql} names, in the order {@code joinNames} declares them.
	 *
	 * <p>A join is named when its name is followed by a dot and:
	 * <ul>
	 * <li>is not preceded by a letter, a digit or {@code _}, so {@code myOrders.x} does not name
	 * {@code Orders};</li>
	 * <li>is outside {@code '…'} string literals and outside {@code ${…}} — {@code ${CUBE}} is the
	 * main table and {@code ${X.m}} is a sub_query, which brings no join;</li>
	 * <li>matches without regard to case when the join name is a plain identifier, as the database
	 * reads it, and exactly when the name is quoted.</li>
	 * </ul>
	 */
	public static List<String> referencedJoins(String sql, List<String> joinNames) {
		List<String> found = new ArrayList<>();
		if (sql == null || joinNames == null) return found;

		String searchable = maskLiteralsAndPlaceholders(sql);
		for (String joinName : joinNames) {
			if (joinName == null || joinName.isEmpty()) continue;
			boolean quoted = isQuoted(joinName);
			int flags = quoted ? 0 : Pattern.CASE_INSENSITIVE;
			Pattern pattern = Pattern.compile(
					"(?<![A-Za-z0-9_])" + Pattern.quote(joinName) + "\\s*\\.", flags);
			if (pattern.matcher(searchable).find()) {
				found.add(joinName);
			}
		}
		return found;
	}

	/** The names of a cube's joins, in the order they are declared. */
	public static List<String> joinNames(CubeOptions cube) {
		List<String> names = new ArrayList<>();
		if (cube == null || cube.getJoins() == null) return names;
		for (Map<String, Object> join : cube.getJoins()) {
			String name = Objects.toString(join.get("name"), "");
			if (!name.isEmpty()) names.add(name);
		}
		return names;
	}

	/**
	 * Replaces every character inside a {@code '…'} literal or a {@code ${…}} placeholder with a
	 * space, so the rule reads only the SQL the database will read as identifiers.
	 */
	private static String maskLiteralsAndPlaceholders(String sql) {
		char[] out = sql.toCharArray();
		boolean inLiteral = false;
		int placeholder = 0;
		for (int i = 0; i < out.length; i++) {
			char c = out[i];
			if (inLiteral) {
				boolean closing = c == '\'';
				out[i] = ' ';
				if (closing) inLiteral = false;
				continue;
			}
			if (placeholder > 0) {
				if (c == '}') placeholder--;
				out[i] = ' ';
				continue;
			}
			if (c == '\'') {
				inLiteral = true;
				out[i] = ' ';
				continue;
			}
			if (c == '$' && i + 1 < out.length && out[i + 1] == '{') {
				placeholder = 1;
				out[i] = ' ';
				out[i + 1] = ' ';
				i++;
			}
		}
		return new String(out);
	}

	/** True when a join name is written quoted, so it must match exactly. */
	private static boolean isQuoted(String name) {
		if (name.length() < 2) return false;
		char first = name.charAt(0);
		return first == '"' || first == '`' || first == '[';
	}

	/**
	 * Which folder each dimension goes in: dimension name → the join its own SQL names, {@code ""}
	 * for the main table. The component draws the folders from this, and the generator finds its
	 * joins with the same rule, so a field is never in one folder and joined from another table.
	 */
	public static Map<String, String> dimensionTables(CubeOptions cube) {
		Map<String, String> tables = new LinkedHashMap<>();
		if (cube == null || cube.getDimensions() == null) return tables;

		List<String> joins = joinNames(cube);
		for (Map<String, Object> dim : cube.getDimensions()) {
			String name = Objects.toString(dim.get("name"), "");
			if (name.isEmpty()) continue;
			// A sub_query gives one value per row of the main table, however far its ${X.m} reaches.
			if (isTrue(dim.get("sub_query"))) {
				tables.put(name, "");
				continue;
			}
			List<String> referenced = referencedJoins(String.join(" ", dimensionSqlParts(dim)), joins);
			tables.put(name, referenced.isEmpty() ? "" : referenced.get(0));
		}
		return tables;
	}

	/** Every piece of SQL a dimension is written from: its own, its case whens, its geo corners. */
	@SuppressWarnings("unchecked")
	public static List<String> dimensionSqlParts(Map<String, Object> dim) {
		List<String> parts = new ArrayList<>();
		Object sql = dim.get("sql");
		if (sql != null) parts.add(sql.toString());

		Object caseBlock = dim.get("case");
		if (caseBlock instanceof Map) {
			Object whens = ((Map<String, Object>) caseBlock).get("when");
			if (whens instanceof List) {
				for (Object one : (List<Object>) whens) {
					if (one instanceof Map && ((Map<String, Object>) one).get("sql") != null) {
						parts.add(((Map<String, Object>) one).get("sql").toString());
					}
				}
			}
		}
		for (String corner : List.of("latitude", "longitude")) {
			Object value = dim.get(corner);
			if (value instanceof Map && ((Map<String, Object>) value).get("sql") != null) {
				parts.add(((Map<String, Object>) value).get("sql").toString());
			}
		}
		return parts;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What is wrong with a member (design part 2 item 8, part 3)
	// ═══════════════════════════════════════════════════════════════════════════

	/** {@code ${Something}} — a measure reference, a sub_query reference or a report parameter. */
	private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]*)\\}");

	/**
	 * Everything the generator would refuse this member for, as the sentences it would answer with.
	 * Empty when the generator can write it.
	 *
	 * @param block {@code dimension}, {@code measure}, {@code segment} or {@code hierarchy}.
	 */
	public static List<String> errors(CubeOptions cube, String block, Map<String, Object> member) {
		return errors(cube, cube, block, member);
	}

	/**
	 * The same, when the cube is one of several in a file: {@code file} is where a sub_query looks
	 * for the named cube it counts on.
	 */
	public static List<String> errors(CubeOptions cube, CubeOptions file, String block,
			Map<String, Object> member) {
		List<String> errors = new ArrayList<>();
		if (member == null) return errors;
		String name = Objects.toString(member.get("name"), "");

		switch (block) {
			case "dimension":
				dimensionErrors(cube, file, member, name, errors);
				break;
			case "measure":
				measureErrors(cube, member, name, errors);
				break;
			case "segment":
				dottedPlaceholder(member.get("sql"), "Segment", name, errors);
				break;
			case "hierarchy":
				hierarchyErrors(cube, member, name, errors);
				break;
			default:
				break;
		}
		return errors;
	}

	private static void dimensionErrors(CubeOptions cube, CubeOptions file, Map<String, Object> dim,
			String name, List<String> errors) {

		String type = Objects.toString(dim.get("type"), "").trim().toLowerCase();
		boolean isGeo = "geo".equals(type);

		if (isGeo) {
			for (String corner : List.of("latitude", "longitude")) {
				if (cornerSql(dim, corner) == null) {
					errors.add("Dimension '" + name + "' is a geo dimension, so it needs both a latitude "
							+ "and a longitude: " + corner + " is missing.");
				}
			}
		}

		Object order = dim.get("order");
		if (order != null) {
			String direction = order.toString().trim().toLowerCase();
			if (isGeo) {
				errors.add("Dimension '" + name + "' is a geo dimension, so it cannot be ordered by: "
						+ "a pair of coordinates has no order.");
			} else if (!ORDERS.contains(direction)) {
				errors.add("Dimension '" + name + "' asks to be ordered '" + order + "', which is not an "
						+ "order. A dimension may be ordered 'asc' or 'desc'.");
			}
		}

		if (isTrue(dim.get("sub_query"))) {
			subQueryErrors(cube, file, dim, name, errors);
			return;
		}

		for (String part : dimensionSqlParts(dim)) {
			dottedPlaceholder(part, "Dimension", name, errors);
		}
	}

	/**
	 * A {@code sub_query} dimension must read {@code ${X.m}}, where X is a join declared directly on
	 * this cube and m is {@code count} or a measure of a named cube X in the same file.
	 */
	private static void subQueryErrors(CubeOptions cube, CubeOptions file, Map<String, Object> dim,
			String name, List<String> errors) {

		String sql = Objects.toString(dim.get("sql"), "");
		Matcher matcher = PLACEHOLDER.matcher(sql);
		boolean any = false;

		while (matcher.find()) {
			String reference = matcher.group(1).trim();
			int dot = reference.lastIndexOf('.');
			if (dot <= 0) continue;   // ${CUBE} or a report parameter: not a sub_query reference
			any = true;

			String joinName = reference.substring(0, dot);
			String measureName = reference.substring(dot + 1);

			Map<String, Object> join = findJoin(cube, joinName);
			if (join == null) {
				errors.add("Dimension '" + name + "' asks for '${" + reference + "}', but '" + joinName
						+ "' is not a join of this cube. A sub_query reads a table this cube joins directly.");
				continue;
			}
			String parent = Objects.toString(join.get("parent"), "CUBE").trim();
			if (!parent.isEmpty() && !"CUBE".equals(parent)) {
				errors.add("Dimension '" + name + "' asks for '${" + reference + "}', but the join '"
						+ joinName + "' hangs off '" + parent + "' rather than off this cube. A sub_query "
						+ "reads a table this cube joins directly.");
				continue;
			}
			if (!"count".equals(measureName) && measureOfNamedCube(file, joinName, measureName) == null) {
				errors.add("Dimension '" + name + "' asks for '${" + reference + "}', but '" + measureName
						+ "' is not a measure of a cube named '" + joinName + "' in this file. A sub_query "
						+ "may ask for 'count' or for a measure of that cube.");
			}
		}

		if (!any) {
			errors.add("Dimension '" + name + "' is a sub_query, so its sql must read '${<join>.<measure>}'"
					+ " — the table to count and what to count on it.");
		}
	}

	private static void measureErrors(CubeOptions cube, Map<String, Object> meas, String name,
			List<String> errors) {

		String type = Objects.toString(meas.get("type"), "count").toLowerCase();
		if (!MEASURE_TYPES.contains(type)) {
			errors.add(unknownMeasureType(name, type));
			return;
		}

		String sql = Objects.toString(meas.get("sql"), null);
		if ("number".equals(type)) {
			referenceErrors(cube, name, sql, new ArrayList<>(List.of(name)), errors);
			analysisErrors(cube, meas, name, errors);
			return;
		}

		dottedPlaceholder(sql, "Measure", name, errors);
		analysisErrors(cube, meas, name, errors);
		Object filters = meas.get("filters");
		if (filters instanceof List) {
			for (Object one : (List<?>) filters) {
				if (one instanceof Map) {
					dottedPlaceholder(((Map<?, ?>) one).get("sql"), "Measure", name, errors);
				}
			}
		}
	}

	/**
	 * What a measure read over the finished groups — a share of the total, a running total, the
	 * same period an interval earlier — got wrong about itself.
	 *
	 * <p>These live here, and not beside the SQL that writes them, because they are all things the
	 * cube says and none of them depends on the question asked: the author sees them in the cube
	 * editor as soon as the file is saved, and the generator throws the same sentence if a query
	 * reaches it anyway. What a query rather than a cube makes impossible — a running total with no
	 * date to run along, a to-date total no coarser than its own rows — is refused where the query
	 * is built, because only there is it known.
	 *
	 * @param name the measure's name, as every sentence here begins with it
	 */
	public static void analysisErrors(CubeOptions cube, Map<String, Object> meas, String name,
			List<String> errors) {

		List<String> asked = new ArrayList<>();
		if (isTrue(meas.get("share_of_total"))) asked.add("share_of_total");
		if (meas.get("rolling_window") != null) asked.add("rolling_window");
		if (meas.get("time_shift") != null) asked.add("time_shift");
		if (asked.isEmpty()) return;

		if (asked.size() > 1) {
			// Ranking them would answer one of the two and hide that the author has not decided
			// which the measure is.
			errors.add("Measure '" + name + "' asks for " + String.join(" and ", asked)
					+ " at once, and a measure is one of them. Write one measure for each.");
			return;
		}

		baseErrors(cube, meas, name, errors);
		if ("time_shift".equals(asked.get(0))) shiftErrors(meas.get("time_shift"), name, errors);
		if ("rolling_window".equals(asked.get(0))) windowErrors(meas.get("rolling_window"), name, errors);
	}

	/**
	 * The one measure it is computed over: the single {@code ${Measure}} of its {@code sql}, and it
	 * has to add up. A share of an average is not 34% of anything and a running average is not the
	 * average of what has run so far — both are numbers that look right and are not.
	 */
	private static void baseErrors(CubeOptions cube, Map<String, Object> meas, String name,
			List<String> errors) {

		List<String> named = new ArrayList<>();
		Matcher found = PLACEHOLDER.matcher(Objects.toString(meas.get("sql"), ""));
		while (found.find()) {
			String reference = found.group(1).trim();
			if (!"CUBE".equals(reference)) named.add(reference);
		}

		if (named.size() != 1) {
			errors.add("Measure '" + name + "' is computed over one other measure, so its sql is that "
					+ "measure's name in braces, as in sql '${Revenue}'"
					+ (named.isEmpty() ? ", and this one names none."
							: ", and this one names " + named.size() + ": " + String.join(", ", named) + "."));
			return;
		}

		String base = named.get(0);
		Map<String, Object> baseMeasure = null;
		List<String> all = new ArrayList<>();
		for (Map<String, Object> other : cube.getMeasures() == null
				? List.<Map<String, Object>>of()
				: cube.getMeasures()) {
			String otherName = Objects.toString(other.get("name"), "");
			all.add(otherName);
			if (base.equals(otherName)) baseMeasure = other;
		}
		if (baseMeasure == null) {
			errors.add("Measure '" + name + "' is computed over '" + base + "', which is not a measure of "
					+ "this cube. Its measures are: " + (all.isEmpty() ? "(none)" : String.join(", ", all))
					+ ".");
			return;
		}

		String baseType = Objects.toString(baseMeasure.get("type"), "count").trim().toLowerCase();
		if (!ADDS_UP.contains(baseType)) {
			errors.add("Measure '" + name + "' is computed over '" + base + "', which is a '" + baseType
					+ "'. A share, a running total and a period comparison add numbers up, so they are "
					+ "taken of a sum or a count, never of an average, a minimum or a maximum.");
		}
	}

	/** {@code time_shift interval: '<n> <unit>'} — and nothing else. */
	private static void shiftErrors(Object declared, String name, List<String> errors) {

		String interval = declared instanceof Map
				? Objects.toString(((Map<?, ?>) declared).get("interval"), "").trim()
				: Objects.toString(declared, "").trim();

		String[] parts = interval.split("\\s+");
		int amount;
		try {
			if (parts.length != 2) throw new NumberFormatException(interval);
			amount = Integer.parseInt(parts[0]);
		} catch (NumberFormatException wrong) {
			errors.add("Measure '" + name + "': time_shift is written interval: '<how many> <unit>', as "
					+ "in time_shift interval: '1 year'. This one says '" + interval + "'.");
			return;
		}

		String unit = timeUnit(parts[1]);
		if (unit == null) {
			errors.add("Measure '" + name + "': '" + parts[1] + "' is not a time unit. The units a time "
					+ "shift may use are: " + String.join(", ", TIME_UNITS) + ".");
			return;
		}
		if (amount <= 0) {
			errors.add("Measure '" + name + "': a time shift looks back, so its interval is a number of "
					+ unit + "s greater than zero.");
		}
	}

	/** The two {@code rolling_window} forms this server builds, and a sentence for every other. */
	private static void windowErrors(Object declared, String name, List<String> errors) {

		if (!(declared instanceof Map)) {
			errors.add("Measure '" + name + "': rolling_window is written either rolling_window "
					+ "trailing: 'unbounded' or rolling_window type: 'to_date', granularity: 'year'.");
			return;
		}
		Map<?, ?> window = (Map<?, ?>) declared;

		if (window.get("leading") != null || window.get("offset") != null) {
			errors.add("Measure '" + name + "': a rolling_window here runs from the first period the "
					+ "filters leave in up to the row, so it takes neither 'leading' nor 'offset'. Write "
					+ "rolling_window trailing: 'unbounded', or rolling_window type: 'to_date', "
					+ "granularity: 'year'.");
			return;
		}

		String trailing = Objects.toString(window.get("trailing"), "").trim().toLowerCase();
		if (!trailing.isEmpty()) {
			if (!"unbounded".equals(trailing)) {
				errors.add("Measure '" + name + "': rolling_window trailing: '" + trailing + "' is a "
						+ "moving window of its own length, which is not built. The trailing window here is "
						+ "'unbounded', which adds up everything so far.");
			}
			return;
		}

		String type = Objects.toString(window.get("type"), "").trim().toLowerCase();
		if (!"to_date".equals(type)) {
			errors.add("Measure '" + name + "': rolling_window is written either rolling_window "
					+ "trailing: 'unbounded' or rolling_window type: 'to_date', granularity: 'year'"
					+ (type.isEmpty() ? ", and this one says neither." : ", and this one says type: '"
							+ type + "'."));
			return;
		}
		if (timeUnit(Objects.toString(window.get("granularity"), "")) == null) {
			errors.add("Measure '" + name + "': a to_date window restarts every period, so it needs "
					+ "granularity: one of " + String.join(", ", TIME_UNITS) + ".");
		}
	}

	/** One of the five units, written singular or plural, or null when it is not one of them. */
	public static String timeUnit(String written) {

		String unit = Objects.toString(written, "").trim().toLowerCase();
		if (unit.endsWith("s")) unit = unit.substring(0, unit.length() - 1);
		return TIME_UNITS.contains(unit) ? unit : null;
	}

	/** Walks a calculated measure's {@code ${Other}} references: each must exist, and none may loop. */
	private static void referenceErrors(CubeOptions cube, String owner, String sql, List<String> stack,
			List<String> errors) {

		if (sql == null) return;
		Matcher matcher = PLACEHOLDER.matcher(sql);
		while (matcher.find()) {
			String reference = matcher.group(1).trim();
			if ("CUBE".equals(reference)) continue;   // a column of the main table, not a measure
			Map<String, Object> referenced = findMeasure(cube, reference);
			if (referenced == null) {
				errors.add(unknownMeasureReference(owner, matcher.group(1)));
				continue;
			}
			if (stack.contains(reference)) {
				List<String> cycle = new ArrayList<>(stack);
				cycle.add(reference);
				errors.add(cycleMessage(reference, cycle));
				continue;
			}
			if (!"number".equals(Objects.toString(referenced.get("type"), "count").toLowerCase())) {
				continue;   // its sql is columns and filters, and expands no reference of its own
			}
			stack.add(reference);
			try {
				referenceErrors(cube, reference, Objects.toString(referenced.get("sql"), null), stack, errors);
			} finally {
				stack.remove(stack.size() - 1);
			}
		}
	}

	private static void hierarchyErrors(CubeOptions cube, Map<String, Object> hierarchy, String name,
			List<String> errors) {

		Object levels = hierarchy.get("levels");
		if (!(levels instanceof List)) return;
		for (Object level : (List<?>) levels) {
			String dimName = Objects.toString(level, "");
			if (dimName.isEmpty()) continue;
			if (findDimension(cube, dimName) == null) {
				errors.add("Hierarchy '" + name + "' has a level '" + dimName + "', which is not a "
						+ "dimension of this cube.");
			}
		}
	}

	/** A dotted {@code ${a.b}} outside a sub_query resolves to nothing, so it must not reach the database. */
	private static void dottedPlaceholder(Object sql, String blockLabel, String name, List<String> errors) {
		if (sql == null) return;
		Matcher matcher = PLACEHOLDER.matcher(sql.toString());
		while (matcher.find()) {
			String reference = matcher.group(1).trim();
			if (reference.contains(".") && !"CUBE".equals(reference)) {
				errors.add(blockLabel + " '" + name + "' reads '${" + reference + "}', which nothing "
						+ "resolves: a dotted reference is only a sub_query dimension's.");
			}
		}
	}

	// The sentences the generator answers with, written once so the parser and the 400 agree.

	public static String unknownMeasureType(String name, String type) {
		return "Measure '" + name + "' has type '" + type + "', which is not a measure type. The types a "
				+ "measure may have are: " + String.join(", ", MEASURE_TYPES) + ".";
	}

	public static String unknownMeasureReference(String owner, String reference) {
		return "Measure '" + owner + "' refers to '${" + reference + "}', which is not a measure of this cube.";
	}

	public static String cycleMessage(String name, List<String> cycle) {
		return "Measure '" + name + "' refers to itself: " + String.join(" -> ", cycle)
				+ ". A calculated measure cannot be part of a cycle.";
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What a cube's conditions may say (R1)
	// ═══════════════════════════════════════════════════════════════════════════

	/** {@code ${name}} or {@code #{name}} — the two placeholder forms the query plumbing binds. */
	private static final Pattern NAME_PLACEHOLDER = Pattern.compile("[$#]\\{([^}]*)\\}");

	/** A value of a native condition that is a name rather than a literal: {@code ${fromDate}}. */
	private static final Pattern NAMED_VALUE = Pattern.compile("^[$#]\\{([A-Za-z_][A-Za-z0-9_]*)\\}$");

	/**
	 * The operators a filter may ask for — the structured query's own names, and the only list of
	 * them. A native {@code condition} is added to the query exactly as a viewer's filter is, so it
	 * may say anything a filter may say and nothing else; the generator reads the same list.
	 */
	public static final List<String> QUERY_OPERATORS = List.of(
			"equals", "notEquals", "in", "notIn", "gt", "gte", "lt", "lte", "between", "contains",
			"set", "notSet");

	/** The words a raw condition may not hold: it is one condition, not a query. */
	private static final Map<String, String> RAW_REFUSED = Map.of(
			"GROUP BY", "grouping is the query's, not a condition's",
			"HAVING", "a condition on a measure is the native form, condition '<Measure>', '<operator>', <value>",
			"ORDER BY", "the order is the query's, not a condition's");

	/** How many values this operator takes: -1 means one or more. */
	public static int valuesExpected(String operator) {
		switch (operator) {
			case "set":
			case "notSet":
				return 0;
			case "between":
				return 2;
			case "in":
			case "notIn":
				return -1;
			default:
				return 1;
		}
	}

	/**
	 * The dashboard parameters a cube's conditions use, in the order they are written — the names
	 * whose values the dashboard is asked for, builtins left out (they come from the server).
	 *
	 * <p>Read by the runtime, so that a name no dashboard answers is left with no value and its
	 * condition is dropped by the empty-value rule, rather than a {@code ${name}} reaching a
	 * statement that is about to run.
	 */
	public static Set<String> parameterNames(CubeOptions cube) {

		Set<String> names = new LinkedHashSet<>();
		for (ConditionUse use : parameterUses(cube))
			names.addAll(use.parameters());
		return names;
	}

	/**
	 * One condition, as the cube file writes it, and the dashboard parameters it uses.
	 *
	 * <p>The condition's own text is kept beside its names because the dashboard's check (R1) has
	 * to show the author which condition it is talking about: a cube may have several, and a name
	 * on its own says nothing about where it is used.
	 */
	public static final class ConditionUse {

		private final String written;
		private final String where;
		private final Set<String> parameters;

		private ConditionUse(String written, String where, Set<String> parameters) {
			this.written = written;
			this.where = where;
			this.parameters = parameters;
		}

		/** The condition as the cube file writes it. */
		public String written() {
			return written;
		}

		/**
		 * Where in the cube file that text is, as a sentence names it: {@code the condition "…"} or
		 * {@code the source SQL "…"}. A cube uses a name in one of two places, and an author reading
		 * the refusal has to be told which one before they can go and fix it.
		 */
		public String where() {
			return where;
		}

		/** The dashboard parameters it uses, builtins left out. */
		public Set<String> parameters() {
			return parameters;
		}
	}

	/**
	 * The dashboard parameters a cube's source SQL uses — the names inside
	 * {@code sql 'SELECT … WHERE x >= ${fromDate}'}, which the generator inlines as the cube's FROM
	 * and which the same binder binds (R1, 18a).
	 *
	 * <p>Kept apart from the conditions because one rule differs: a condition with no value is
	 * dropped whole, while a line of a source SELECT cannot be dropped without changing what the
	 * cube reads, so a source name with no value is refused instead (R1, 18a).
	 */
	public static Set<String> sourceSqlNames(CubeOptions cube) {

		Set<String> names = new LinkedHashSet<>();
		if (cube == null || cube.getSql() == null)
			return names;

		Matcher placeholder = NAME_PLACEHOLDER.matcher(cube.getSql());
		while (placeholder.find()) {
			String named = placeholder.group(1).trim();
			if ("CUBE".equals(named) || named.startsWith(BuiltinVariables.PREFIX))
				continue;
			names.add(named);
		}
		return names;
	}

	/** A cube's source SQL as a refusal quotes it: one line, and short enough to read. */
	private static String quoted(String sql) {

		String oneLine = sql.replaceAll("\\s+", " ").trim();
		return oneLine.length() <= 120 ? oneLine : oneLine.substring(0, 117) + "\u2026";
	}

	/**
	 * Every condition of this cube that uses a dashboard parameter, with the names it uses.
	 *
	 * <p>Read by the runtime, so that a name no dashboard answers is left with no value and its
	 * condition is dropped by the empty-value rule, rather than a {@code ${name}} reaching a
	 * statement that is about to run; and by the dashboard's check, which refuses a name the
	 * dashboard does not declare.
	 */
	@SuppressWarnings("unchecked")
	public static List<ConditionUse> parameterUses(CubeOptions cube) {

		List<ConditionUse> uses = new ArrayList<>();
		if (cube == null)
			return uses;

		for (Map<String, Object> condition : cube.getConditions() == null ? List.<Map<String, Object>>of()
				: cube.getConditions()) {

			Set<String> names = new LinkedHashSet<>();
			String written;

			if (condition.containsKey("member")) {
				List<Object> values = condition.get("values") instanceof List
						? (List<Object>) condition.get("values")
						: List.of();
				for (Object value : values) {
					Matcher named = NAMED_VALUE.matcher(Objects.toString(value, ""));
					if (named.matches() && !named.group(1).startsWith(BuiltinVariables.PREFIX))
						names.add(named.group(1));
				}
				written = "condition '" + Objects.toString(condition.get("member"), "") + "', '"
						+ Objects.toString(condition.get("operator"), "") + "'"
						+ (values.isEmpty() ? "" : ", " + join(values));
			} else {
				written = Objects.toString(condition.get("sql"), "").trim();
				Matcher placeholder = NAME_PLACEHOLDER.matcher(written);
				while (placeholder.find()) {
					String named = placeholder.group(1).trim();
					if ("CUBE".equals(named) || named.startsWith(BuiltinVariables.PREFIX))
						continue;
					names.add(named);
				}
			}

			if (!names.isEmpty())
				uses.add(new ConditionUse(written, "the condition \"" + written + "\"", names));
		}

		// The cube's source SQL uses names the same way, and the dashboard has to declare them the
		// same way: one list, so the check and the runtime cannot disagree about where a name is.
		Set<String> fromSource = sourceSqlNames(cube);
		if (!fromSource.isEmpty())
			uses.add(new ConditionUse(cube.getSql(), "the source SQL \"" + quoted(cube.getSql()) + "\"",
					fromSource));

		return uses;
	}

	/**
	 * Everything the author can get wrong about a {@code condition} (R1).
	 *
	 * <p>Most of these are errors rather than warnings, because what each one leaves behind is a
	 * condition that does not hold: a raw condition written with a {@code --} comment comments out
	 * the rest of the WHERE once it is folded onto one line, a native one naming a member the cube
	 * has not got cannot be written at all, and a condition naming a dashboard parameter and a
	 * builtin together is dropped, builtin and all, the moment the viewer clears the parameter.
	 */
	private static void conditionWarnings(CubeOptions cube, String cubeName,
			List<Map<String, Object>> all) {

		List<Map<String, Object>> conditions = cube.getConditions() != null
				? cube.getConditions()
				: List.<Map<String, Object>>of();

		for (Map<String, Object> condition : conditions) {

			for (String key : condition.keySet()) {
				if (CONDITION_KEYS.containsKey(key)) continue;
				String suggestion = closest(key, CONDITION_KEYS.keySet());
				all.add(entry(cubeName, "condition", "", key, "warning",
						"unknown key '" + key + "' in condition"
								+ (suggestion == null ? "" : " — did you mean '" + suggestion + "'?")));
			}

			Set<String> parameters = new LinkedHashSet<>();
			Set<String> builtins = new LinkedHashSet<>();
			String written;

			if (condition.containsKey("member")) {
				written = nativeCondition(cube, cubeName, condition, parameters, builtins, all);
			} else {
				written = rawCondition(cubeName, condition, parameters, builtins, all);
			}
			if (written == null) continue;

			if (!parameters.isEmpty() && !builtins.isEmpty()) {
				all.add(entry(cubeName, "condition", "", "", "error",
						bothKindsMessage(cubeName, written, parameters, builtins)));
			} else if (parameters.isEmpty() && builtins.isEmpty()) {
				all.add(entry(cubeName, "condition", "", "", "warning",
						"the condition \"" + written + "\" names no dashboard parameter and no "
								+ "builtin, so it is a condition on every row this cube ever answers. "
								+ "A condition like that is an access_filter or a segment."));
			}
		}
	}

	/** The raw form: any SQL a WHERE allows, folded onto one line. Returns it, or null if refused. */
	private static String rawCondition(String cubeName, Map<String, Object> condition,
			Set<String> parameters, Set<String> builtins, List<Map<String, Object>> all) {

		String sql = Objects.toString(condition.get("sql"), "").trim();
		if (sql.isEmpty()) {
			all.add(entry(cubeName, "condition", "", "sql", "error",
					"a condition is one SQL condition, or a member, an operator and its values: "
							+ "write condition '${CUBE}.order_date >= ${fromDate}' or "
							+ "condition 'OrderDate', 'gte', fromDate."));
			return null;
		}
		String upper = sql.toUpperCase();
		if (upper.startsWith("WHERE ") || upper.equals("WHERE")) {
			all.add(entry(cubeName, "condition", "", "sql", "error",
					"the condition \"" + sql + "\" begins with WHERE. A condition is the condition "
							+ "itself: the generator writes the WHERE, and ANDs every condition into it."));
			return null;
		}
		if (sql.contains("--")) {
			all.add(entry(cubeName, "condition", "", "sql", "error",
					"the condition \"" + sql + "\" holds a -- comment. A condition is read onto one "
							+ "line, where -- would comment out the rest of the WHERE. Write the "
							+ "comment as /* … */, or put it above the condition in the cube file."));
			return null;
		}
		for (Map.Entry<String, String> refused : RAW_REFUSED.entrySet()) {
			if (!upper.contains(refused.getKey())) continue;
			all.add(entry(cubeName, "condition", "", "sql", "error",
					"the condition \"" + sql + "\" holds " + refused.getKey() + ": " + refused.getValue()
							+ "."));
			return null;
		}
		namesUsed(cubeName, sql, sql, parameters, builtins, all);
		return sql;
	}

	/** The native form: a member of this cube, an operator, and the values. */
	private static String nativeCondition(CubeOptions cube, String cubeName,
			Map<String, Object> condition, Set<String> parameters, Set<String> builtins,
			List<Map<String, Object>> all) {

		String memberName = Objects.toString(condition.get("member"), "").trim();
		String operator = Objects.toString(condition.get("operator"), "").trim();
		List<Object> values = condition.get("values") instanceof List
				? new ArrayList<>((List<Object>) condition.get("values"))
				: new ArrayList<>();
		String written = "condition '" + memberName + "', '" + operator + "'"
				+ (values.isEmpty() ? "" : ", " + join(values));

		Map<String, Object> measureMember = findMeasure(cube, memberName);
		Map<String, Object> member = measureMember != null ? measureMember
				: findDimension(cube, memberName);
		if (member == null) {
			Set<String> known = new LinkedHashSet<>();
			for (Map<String, Object> one : cube.getDimensions() != null ? cube.getDimensions()
					: List.<Map<String, Object>>of())
				known.add(Objects.toString(one.get("name"), ""));
			for (Map<String, Object> one : cube.getMeasures() != null ? cube.getMeasures()
					: List.<Map<String, Object>>of())
				known.add(Objects.toString(one.get("name"), ""));
			String suggestion = closest(memberName, known);
			all.add(entry(cubeName, "condition", memberName, "member", "error",
					"the condition " + written + " names '" + memberName + "', which is not a "
							+ "dimension or a measure of this cube"
							+ (suggestion == null ? "" : " — did you mean '" + suggestion + "'?") + "."));
			return null;
		}
		String type = measureMember != null ? "number"
				: Objects.toString(member.get("type"), "").trim().toLowerCase();

		if (!QUERY_OPERATORS.contains(operator)) {
			String suggestion = closest(operator, new LinkedHashSet<>(QUERY_OPERATORS));
			all.add(entry(cubeName, "condition", memberName, "operator", "error",
					"the condition " + written + " asks for '" + operator + "', which is not an "
							+ "operator" + (suggestion == null ? "" : " — did you mean '" + suggestion
							+ "'?") + ". It may be one of: " + String.join(", ", QUERY_OPERATORS) + "."));
			return null;
		}

		int expected = valuesExpected(operator);
		if (expected >= 0 && values.size() != expected) {
			all.add(entry(cubeName, "condition", memberName, "values", "error",
					"the condition " + written + " gives " + values.size() + " value"
							+ (values.size() == 1 ? "" : "s") + ", and '" + operator + "' takes "
							+ expected + "."));
			return null;
		}
		if (expected < 0 && values.isEmpty()) {
			all.add(entry(cubeName, "condition", memberName, "values", "error",
					"the condition " + written + " gives no value, and '" + operator + "' takes one "
							+ "or more."));
			return null;
		}

		if ("contains".equals(operator) && !"string".equals(type)) {
			all.add(entry(cubeName, "condition", memberName, "operator", "error",
					"the condition " + written + " asks for 'contains' on '" + memberName
							+ "', which is " + (type.isEmpty() ? "not text" : "of type " + type)
							+ ". 'contains' looks inside text."));
			return null;
		}
		if ("boolean".equals(type) && List.of("gt", "gte", "lt", "lte", "between", "contains")
				.contains(operator)) {
			all.add(entry(cubeName, "condition", memberName, "operator", "error",
					"the condition " + written + " asks for '" + operator + "' on '" + memberName
							+ "', which is true or false. Use 'equals' or 'notEquals'."));
			return null;
		}

		for (Object value : values) {
			Matcher named = NAMED_VALUE.matcher(Objects.toString(value, ""));
			if (!named.matches()) continue;
			if ("contains".equals(operator)) {
				all.add(entry(cubeName, "condition", memberName, "values", "error",
						"the condition " + written + " asks for 'contains' with the value '"
								+ named.group(1) + "'. 'contains' looks for a value inside the text, "
								+ "and what is looked for is written here, not filled in by the "
								+ "viewer: give it the text, or ask for 'equals'."));
				return null;
			}
			name(cubeName, written, named.group(1), parameters, builtins, all);
		}
		return written;
	}

	/** Every {@code ${name}} a raw condition uses, sorted into the two kinds. */
	private static void namesUsed(String cubeName, String sql, String written,
			Set<String> parameters, Set<String> builtins, List<Map<String, Object>> all) {

		Matcher placeholder = NAME_PLACEHOLDER.matcher(sql);
		while (placeholder.find()) {
			String named = placeholder.group(1).trim();
			if ("CUBE".equals(named)) continue;
			name(cubeName, written, named, parameters, builtins, all);
		}
	}

	/** One name: a builtin the server fills, or a name the dashboard is expected to declare. */
	private static void name(String cubeName, String written, String named,
			Set<String> parameters, Set<String> builtins, List<Map<String, Object>> all) {

		if (named.startsWith(BuiltinVariables.PREFIX)) {
			// Reserved is not the same as filled in: every dp_ name belongs to the server, and only
			// the ones it actually has a value for can be written here. A misspelt one would bind to
			// nothing, match no row, and show an empty widget with nothing said anywhere.
			if (com.flowkraft.embed.UserVariables.isKnownBuiltin(named)) {
				builtins.add(named);
				return;
			}
			all.add(entry(cubeName, "condition", "", "", "error",
					"the condition \"" + written + "\" names '${" + named + "}'. Names beginning with '"
							+ BuiltinVariables.PREFIX + "' are the server's own, and there is no builtin "
							+ "of that name."));
			return;
		}
		parameters.add(named);
	}

	/** The values of a native condition, as the cube file writes them. */
	private static String join(List<Object> values) {
		List<String> written = new ArrayList<>();
		for (Object value : values) {
			String text = Objects.toString(value, "");
			Matcher named = NAMED_VALUE.matcher(text);
			written.add(named.matches() ? named.group(1)
					: value instanceof Number || value instanceof Boolean ? text : "'" + text + "'");
		}
		return String.join(", ", written);
	}

	/**
	 * A condition naming a dashboard parameter and a builtin together, written for the author of
	 * the cube, who may never have read the design: what is wrong, why it is not allowed, and the
	 * four ways to write it instead.
	 */
	private static String bothKindsMessage(String cubeName, String written, Set<String> parameters,
			Set<String> builtins) {

		String p = String.join(", ", parameters);
		String dp = String.join(", ", builtins);
		String cube = cubeName == null || cubeName.isEmpty() ? "this file's cube" : "'" + cubeName + "'";

		return "Cube " + cube + ": the condition \"" + written + "\" uses the dashboard parameter "
				+ p + " and the builtin " + dp + " together. A condition may use dashboard "
				+ "parameters or builtins, but not both.\n"
				+ "\n"
				+ "Why this is not allowed: a condition that uses a dashboard parameter is left out, "
				+ "as a whole, when the viewer leaves that parameter empty or picks All. A builtin "
				+ "(" + BuiltinVariables.PREFIX + "...) usually limits the rows to the person "
				+ "looking: who they are, their team, their tenant. In the same condition, that "
				+ "limit would be left out together with the parameter, and the viewer would see "
				+ "rows the condition was written to hide - with no error and nothing in the log. "
				+ "Kept apart, the builtin part is always applied and the parameter part only when "
				+ "it has a value.\n"
				+ "\n"
				+ "Do this instead (the rows are the same):\n"
				+ "1. Parts joined by AND: write two conditions, one with " + p + " and one with "
				+ dp + ". Conditions are ANDed, so the rows are exactly the same when " + p
				+ " has a value; when " + p + " is empty only its own part is left out.\n"
				+ "2. The builtin part decides who may see which rows (owner, team, tenant): move it "
				+ "to the cube's access_filter. It is applied to every query, total, drill-through "
				+ "and filter list, and nothing can take it out.\n"
				+ "3. The builtin only fills in a value, e.g. \"from fromDate until today\": declare "
				+ "that value as a dashboard parameter with a default (toDate, default today) and "
				+ "write condition 'OrderDate', 'between', fromDate, toDate. The viewer sees the "
				+ "date and can change it, and the period still moves with time_shift.\n"
				+ "4. Parts joined by OR (e.g. owner = " + BuiltinVariables.PREFIX + "user_id OR "
				+ "region = region): two conditions would be ANDed and would change the meaning, so "
				+ "there is no split. If the builtin part limits who may see rows, it belongs in "
				+ "access_filter (2) and the viewer's choice in its own condition. Rows that match "
				+ "either part, one of them chosen by the viewer, are not supported.";
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The file's warnings (design part 3)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * One entry per problem in the whole file — the unnamed cube and every named one — each
	 * {@code {cube, block, member, key, level, message}}. A {@code warning} still works; an
	 * {@code error} is what generate-sql would answer 400 for.
	 */
	public static List<Map<String, Object>> warnings(CubeOptions file) {
		List<Map<String, Object>> all = new ArrayList<>();
		if (file == null) return all;

		collect(file, file, "", all);
		if (file.getNamedOptions() != null) {
			for (Map.Entry<String, CubeOptions> named : file.getNamedOptions().entrySet()) {
				collect(named.getValue(), file, named.getKey(), all);
			}
		}
		return all;
	}

	private static void collect(CubeOptions cube, CubeOptions file, String cubeName,
			List<Map<String, Object>> all) {
		if (cube == null) return;

		if (cube.getExtends_() != null) {
			all.add(entry(cubeName, "cube", Objects.toString(cube.getTitle(), ""), "extends", "warning",
					"extends is not supported: this cube inherits nothing."));
		}
		if (cube.getMeta() != null && !cube.getMeta().isEmpty()) {
			all.add(entry(cubeName, "cube", Objects.toString(cube.getTitle(), ""), "meta", "warning",
					"meta is kept for other tools, and nothing here reads it."));
		}
		if (cube.getAccessFilterCount() > 1) {
			// The second call replaced nothing in the parser - the first condition is kept - but a
			// row filter the author believes is there and is not is exactly the mistake that shows
			// somebody else's rows. It is an error, not a warning.
			all.add(entry(cubeName, "cube", Objects.toString(cube.getTitle(), ""), "access_filter", "error",
					"access_filter is written once per cube, and this cube writes it "
							+ cube.getAccessFilterCount() + " times. Write one condition, joining "
							+ "them with AND or OR."));
		}

		String currency = Objects.toString(cube.getCurrency(), "").trim();
		if (!currency.isEmpty() && !CURRENCY_CODE.matcher(currency).matches()) {
			// Not a check of the world's currencies, which change: a check of the shape the
			// formatter needs. Intl.NumberFormat takes an ISO 4217 code and throws on anything
			// else, and a widget that throws shows no number at all.
			all.add(entry(cubeName, "cube", Objects.toString(cube.getTitle(), ""), "currency", "warning",
					"currency '" + currency + "' is not a currency code, so amounts are shown as plain "
							+ "numbers. A currency code is three letters, as in EUR or USD."));
		}

		block(cube, file, cubeName, "dimension", cube.getDimensions(), DIMENSION_KEYS, all);
		block(cube, file, cubeName, "measure", cube.getMeasures(), MEASURE_KEYS, all);
		block(cube, file, cubeName, "join", cube.getJoins(), JOIN_KEYS, all);
		block(cube, file, cubeName, "segment", cube.getSegments(), SEGMENT_KEYS, all);
		block(cube, file, cubeName, "hierarchy", cube.getHierarchies(), HIERARCHY_KEYS, all);
		conditionWarnings(cube, cubeName, all);

		// The key belongs to whichever dimension declared it first; the rest are told they are not it.
		boolean keySeen = false;
		if (cube.getDimensions() != null) {
			for (Map<String, Object> dim : cube.getDimensions()) {
				if (!isTrue(dim.get("primary_key"))) continue;
				String name = Objects.toString(dim.get("name"), "");
				if (keySeen) {
					all.add(entry(cubeName, "dimension", name, "primary_key", "warning",
							"dimension '" + name + "': primary_key is already declared on another "
									+ "dimension, and the first declared is the key."));
				}
				keySeen = true;
			}
		}
	}

	private static void block(CubeOptions cube, CubeOptions file, String cubeName, String blockName,
			List<Map<String, Object>> members, Map<String, Integer> knownKeys,
			List<Map<String, Object>> all) {

		if (members == null) return;
		for (Map<String, Object> member : members) {
			String name = Objects.toString(member.get("name"), "");

			for (String key : member.keySet()) {
				if (knownKeys.containsKey(key)) continue;
				if (SAID_ELSEWHERE.getOrDefault(blockName, Set.of()).contains(key)) continue;
				String suggestion = closest(key, knownKeys.keySet());
				all.add(entry(cubeName, blockName, name, key, "warning",
						"unknown key '" + key + "' in " + blockName + " " + name
								+ (suggestion == null ? "" : " — did you mean '" + suggestion + "'?")));
			}

			valueWarnings(blockName, name, member, cubeName, all);

			for (String message : errors(cube, file, blockName, member)) {
				all.add(entry(cubeName, blockName, name, "", "error", message));
			}
		}
	}

	private static void valueWarnings(String blockName, String name, Map<String, Object> member,
			String cubeName, List<Map<String, Object>> all) {

		if ("dimension".equals(blockName)) {
			String type = Objects.toString(member.get("type"), "").trim();
			if (!type.isEmpty() && !DIMENSION_TYPES.contains(type.toLowerCase())) {
				String suggestion = closest(type.toLowerCase(), new LinkedHashSet<>(DIMENSION_TYPES));
				all.add(entry(cubeName, blockName, name, "type", "warning",
						"dimension '" + name + "': type '" + type + "' is not a dimension type, so it is "
								+ "read as a plain string"
								+ (suggestion == null ? "" : " — did you mean '" + suggestion + "'?")));
			}
		}

		if ("join".equals(blockName)) {
			String relationship = Objects.toString(member.get("relationship"), "").trim();
			if (!relationship.isEmpty() && !containsIgnoreCase(RELATIONSHIPS, relationship)) {
				String suggestion = closest(relationship.toLowerCase(), new LinkedHashSet<>(RELATIONSHIPS));
				all.add(entry(cubeName, blockName, name, "relationship", "warning",
						"join '" + name + "': relationship '" + relationship + "' is not a relationship, so "
								+ "it is counted as 'many_to_one' and this join is left out of the "
								+ "double-counting fix"
								+ (suggestion == null ? "" : " — did you mean '" + suggestion + "'?")));
			}
		}

		if ("measure".equals(blockName)) {
			String format = Objects.toString(member.get("format"), "").trim();
			if (!format.isEmpty() && !FORMATS.contains(format.toLowerCase())) {
				all.add(entry(cubeName, blockName, name, "format", "warning",
						"measure '" + name + "': format '" + format + "' is not a format, so the number is "
								+ "shown as it is returned."));
			}
			if (member.containsKey("filter_options")) {
				all.add(entry(cubeName, blockName, name, "filter_options", "warning",
						"measure '" + name + "': filter_options is ignored, because only dimensions have "
								+ "filter lists."));
			}
		}

		if (member.containsKey("meta")) {
			all.add(entry(cubeName, blockName, name, "meta", "warning",
					blockName + " '" + name + "': meta is kept for other tools, and nothing here reads it."));
		}
	}

	private static Map<String, Object> entry(String cubeName, String block, String member, String key,
			String level, String message) {
		Map<String, Object> entry = new LinkedHashMap<>();
		entry.put("cube", cubeName);
		entry.put("block", block);
		entry.put("member", member);
		entry.put("key", key);
		entry.put("level", level);
		entry.put("message", message);
		return entry;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Small shared helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** The known word within two edits of {@code word}, or null when the author meant something else. */
	public static String closest(String word, Set<String> known) {
		String best = null;
		int bestDistance = Integer.MAX_VALUE;
		for (String candidate : known) {
			int distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
			if (distance < bestDistance) {
				bestDistance = distance;
				best = candidate;
			}
		}
		return bestDistance <= 2 && bestDistance > 0 ? best : null;
	}

	private static int editDistance(String left, String right) {
		int[] previous = new int[right.length() + 1];
		int[] current = new int[right.length() + 1];
		for (int j = 0; j <= right.length(); j++) previous[j] = j;

		for (int i = 1; i <= left.length(); i++) {
			current[0] = i;
			for (int j = 1; j <= right.length(); j++) {
				int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
				current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
			}
			int[] swap = previous;
			previous = current;
			current = swap;
		}
		return previous[right.length()];
	}

	public static String cornerSql(Map<String, Object> dim, String corner) {
		Object value = dim.get(corner);
		if (value instanceof Map) {
			Object sql = ((Map<?, ?>) value).get("sql");
			return sql == null ? null : sql.toString();
		}
		return value == null ? null : value.toString();
	}

	public static boolean isTrue(Object value) {
		return value instanceof Boolean ? (Boolean) value : Boolean.parseBoolean(Objects.toString(value, ""));
	}

	public static Map<String, Object> findJoin(CubeOptions cube, String name) {
		return find(cube == null ? null : cube.getJoins(), name);
	}

	public static Map<String, Object> findMeasure(CubeOptions cube, String name) {
		return find(cube == null ? null : cube.getMeasures(), name);
	}

	public static Map<String, Object> findDimension(CubeOptions cube, String name) {
		return find(cube == null ? null : cube.getDimensions(), name);
	}

	private static Map<String, Object> find(List<Map<String, Object>> members, String name) {
		if (members == null || name == null) return null;
		for (Map<String, Object> member : members) {
			if (name.equals(member.get("name"))) return member;
		}
		return null;
	}

	/** The measure {@code m} of a cube named {@code cubeName} in the same file, or null. */
	public static Map<String, Object> measureOfNamedCube(CubeOptions cube, String cubeName, String m) {
		if (cube == null || cube.getNamedOptions() == null) return null;
		CubeOptions named = cube.getNamedOptions().get(cubeName);
		return named == null ? null : findMeasure(named, m);
	}

	private static boolean containsIgnoreCase(List<String> known, String value) {
		for (String candidate : known) {
			if (candidate.equalsIgnoreCase(value)) return true;
		}
		return false;
	}

	private static Map<String, Integer> keys(Object... pairs) {
		Map<String, Integer> map = new LinkedHashMap<>();
		for (int i = 0; i < pairs.length; i += 2) {
			map.put((String) pairs[i], (Integer) pairs[i + 1]);
		}
		return map;
	}
}

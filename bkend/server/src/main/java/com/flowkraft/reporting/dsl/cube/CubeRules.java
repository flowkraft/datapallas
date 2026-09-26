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

	/** The keys the parser stores but nothing uses yet, each with the TODO that will use it. */
	private static final Map<String, String> NOT_USED_YET = Map.of(
			"format", "format is not used yet",
			"drill_members", "drill_members is not used yet",
			"rolling_window", "rolling_window is not used yet");

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
			return;
		}

		dottedPlaceholder(sql, "Measure", name, errors);
		Object filters = meas.get("filters");
		if (filters instanceof List) {
			for (Object one : (List<?>) filters) {
				if (one instanceof Map) {
					dottedPlaceholder(((Map<?, ?>) one).get("sql"), "Measure", name, errors);
				}
			}
		}
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

		block(cube, file, cubeName, "dimension", cube.getDimensions(), DIMENSION_KEYS, all);
		block(cube, file, cubeName, "measure", cube.getMeasures(), MEASURE_KEYS, all);
		block(cube, file, cubeName, "join", cube.getJoins(), JOIN_KEYS, all);
		block(cube, file, cubeName, "segment", cube.getSegments(), SEGMENT_KEYS, all);
		block(cube, file, cubeName, "hierarchy", cube.getHierarchies(), HIERARCHY_KEYS, all);

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

		for (Map.Entry<String, String> notUsed : NOT_USED_YET.entrySet()) {
			if (member.containsKey(notUsed.getKey())) {
				all.add(entry(cubeName, blockName, name, notUsed.getKey(), "warning",
						blockName + " '" + name + "': " + notUsed.getValue()));
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

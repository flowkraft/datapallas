package com.flowkraft.cubes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.flowkraft.reporting.dsl.cube.CubeOptions;

/**
 * The rows behind one number: a drill-through, as an ordinary structured query (W4.6).
 *
 * <p>Nothing here runs SQL or writes any. It turns the body of a drill request — a measure, the
 * cell that was clicked, and the query that cell came out of — into the request
 * {@link CubeSqlGenerator#buildQuery} already knows how to answer:
 *
 * <ul>
 * <li>its <b>dimensions and measures</b> are the measure's {@code drill_members}, each of them a
 * member the cube declares and offers. A measure without {@code drill_members} cannot be drilled,
 * and says so: the renderer uses the same fact to decide whether the cell is clickable at all;
 * <li>its <b>filters</b> are the query's own filters, plus one per cell value, plus the drilled
 * measure's own {@code filters} — a "Won Deals" drill shows the won deals it counted, not every
 * deal in the group;
 * <li>its <b>segments</b> are the query's, so an {@code access_filter} and a segment that narrowed
 * the number narrow the rows behind it too;
 * <li>its <b>limit</b> is {@link #LIMIT}, and the answer says {@code truncated} when there were
 * more.
 * </ul>
 *
 * <p><b>A cell is a value, not a condition.</b> A date cell carries the period it was grouped
 * under, so March 2024 becomes {@code between} the first and the last day of March 2024 rather
 * than an equality against a truncation. An empty cell is {@code notSet}: the rows that have no
 * value there are exactly the rows that were counted under it. A geo cell arrives as its two
 * coordinate columns and filters on both.
 *
 * <p><b>A measure read over the finished groups drills through its base.</b> A share, a running
 * total and a to-date total are all one base measure seen differently, so the rows behind them are
 * the base measure's rows. A prior-period measure's rows are the earlier period's, so its cell's
 * date is moved back by the interval before it becomes a filter.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file</b>, and no SQL at all.
 */
final class CubeDrill {

	/** The rows a drill answers with. One more is read, so a cut answer can say it was cut. */
	static final int LIMIT = 1000;

	private CubeDrill() {
	}

	/**
	 * The structured query that answers "which rows made this number".
	 *
	 * @param cube the cube the number came from
	 * @param body {@code { measure, cell, filters, segments, granularities }}
	 * @throws IllegalArgumentException when the measure is not one of this cube's, cannot be
	 *                                  drilled, or names a drill member the cube does not have
	 */
	@SuppressWarnings("unchecked")
	static Map<String, Object> request(CubeOptions cube, Map<String, Object> body) {

		Map<String, Object> sent = body != null ? body : Map.of();
		String asked = Objects.toString(sent.get("measure"), "").trim();
		Map<String, Object> measure = member(cube.getMeasures(), asked);
		if (measure == null) {
			throw new IllegalArgumentException("This cube has no measure called '" + asked
					+ "', so there are no rows behind it. Its measures are: "
					+ names(cube.getMeasures()) + ".");
		}

		// A measure read over the finished groups is its base measure, seen differently: the rows
		// behind it are the base's rows, and behind a prior-period one they are an interval back.
		CubeAnalysis.Analytic analytic = analyticOf(cube, asked);
		Map<String, Object> drilled = measure;
		if (analytic != null) {
			drilled = member(cube.getMeasures(), analytic.base);
			if (drilled == null) {
				throw new IllegalArgumentException("The measure '" + asked + "' is written over '"
						+ analytic.base + "', which this cube does not have.");
			}
		}

		List<String> drillMembers = new ArrayList<>();
		if (drilled.get("drill_members") instanceof List) {
			for (Object one : (List<Object>) drilled.get("drill_members")) {
				if (one != null) drillMembers.add(one.toString().trim());
			}
		}
		if (drillMembers.isEmpty()) {
			throw new IllegalArgumentException("The measure '" + asked + "' does not say which rows are "
					+ "behind its number. Add drill_members to it, listing the fields to show.");
		}

		List<String> dimensions = new ArrayList<>();
		List<String> measures = new ArrayList<>();
		for (String name : drillMembers) {
			if (member(cube.getDimensions(), name) != null) {
				dimensions.add(name);
			} else if (member(cube.getMeasures(), name) != null) {
				measures.add(name);
			} else {
				throw new IllegalArgumentException("The measure '" + Objects.toString(drilled.get("name"), "")
						+ "' drills into '" + name + "', which this cube has no dimension or measure of.");
			}
		}

		List<Map<String, Object>> filters = new ArrayList<>();
		for (Object one : list(sent.get("filters"))) {
			if (one instanceof Map) filters.add(new LinkedHashMap<>((Map<String, Object>) one));
		}
		filters.addAll(cellFilters(cube, sent, analytic));

		// The measure's own filters are SQL the author wrote, so they travel as conditions rather
		// than as a member and a value. Nothing a caller sent can arrive this way; see
		// CubeSqlGenerator.SERVER_CONDITION.
		for (Object one : list(drilled.get("filters"))) {
			if (!(one instanceof Map)) continue;
			String sql = Objects.toString(((Map<String, Object>) one).get("sql"), "").trim();
			if (sql.isEmpty()) continue;
			filters.add(new LinkedHashMap<>(Map.of(CubeSqlGenerator.SERVER_CONDITION, sql)));
		}

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", dimensions);
		request.put("measures", measures);
		request.put("segments", sent.get("segments") instanceof List ? sent.get("segments") : List.of());
		request.put("filters", filters);
		request.put("limit", LIMIT);
		return request;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// The cell
	// ─────────────────────────────────────────────────────────────────────────

	/** One filter per value of the cell that was clicked. */
	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> cellFilters(CubeOptions cube, Map<String, Object> sent,
			CubeAnalysis.Analytic analytic) {

		Map<String, Object> cell = sent.get("cell") instanceof Map
				? (Map<String, Object>) sent.get("cell")
				: Map.of();
		Map<String, Object> granularities = sent.get("granularities") instanceof Map
				? (Map<String, Object>) sent.get("granularities")
				: Map.of();

		List<Map<String, Object>> filters = new ArrayList<>();
		for (Map.Entry<String, Object> one : cell.entrySet()) {

			// A grain rides either on the name, as the answer's own column carries it, or in the
			// granularities the query was asked with.
			String key = one.getKey();
			String name = key;
			String grain = Objects.toString(granularities.get(key), "").trim();
			int dot = key.indexOf('.');
			if (dot > 0) {
				name = key.substring(0, dot);
				grain = key.substring(dot + 1);
			}

			Map<String, Object> dimension = member(cube.getDimensions(), name);
			if (dimension == null && !isGeoCorner(cube, name)) {
				throw new IllegalArgumentException("The cell names '" + name
						+ "', which this cube has no dimension of.");
			}

			Map<String, Object> filter = new LinkedHashMap<>();
			filter.put("member", name);
			if (one.getValue() == null || Objects.toString(one.getValue(), "").isEmpty()) {
				// The rows counted under an empty cell are the rows that have no value there.
				filter.put("operator", "notSet");
				filter.put("values", List.of());
				filters.add(filter);
				continue;
			}

			boolean time = dimension != null
					&& "time".equals(Objects.toString(dimension.get("type"), "").trim().toLowerCase());
			if (time && !grain.isEmpty()) {
				LocalDate from = day(one.getValue(), name);
				if (analytic != null && analytic.kind == CubeAnalysis.Kind.SHIFT) {
					// The number was the earlier period's, so its rows are the earlier period's.
					from = earlier(from, analytic.amount, analytic.unit);
				}
				filter.put("operator", "between");
				filter.put("values", List.of(from.toString(), lastDayOf(from, grain).toString()));
			} else {
				filter.put("operator", "in");
				filter.put("values", List.of(one.getValue()));
			}
			filters.add(filter);
		}
		return filters;
	}

	/** The last day of the period this day starts, for the grain the cell was grouped under. */
	private static LocalDate lastDayOf(LocalDate from, String grain) {

		switch (Objects.toString(com.flowkraft.reporting.dsl.cube.CubeRules.timeUnit(grain), "day")) {
		case "week":
			return from.plusWeeks(1).minusDays(1);
		case "month":
			return from.plusMonths(1).minusDays(1);
		case "quarter":
			return from.plusMonths(3).minusDays(1);
		case "year":
			return from.plusYears(1).minusDays(1);
		default:
			return from;
		}
	}

	/** The same day an interval earlier — the period a prior-period measure was reading. */
	private static LocalDate earlier(LocalDate day, int amount, String unit) {

		switch (unit) {
		case "day":
			return day.minusDays(amount);
		case "week":
			return day.minusWeeks(amount);
		case "month":
			return day.minusMonths(amount);
		case "quarter":
			return day.minusMonths(3L * amount);
		default:
			return day.minusYears(amount);
		}
	}

	/** A cell's date, however the answer wrote it. */
	private static LocalDate day(Object value, String member) {

		String text = Objects.toString(value, "").trim();
		try {
			if (text.length() > 10)
				return LocalDateTime.parse(text.replace(' ', 'T')).toLocalDate();
			return LocalDate.parse(text);
		} catch (RuntimeException notADate) {
			throw new IllegalArgumentException("The cell gives '" + text + "' for '" + member
					+ "', which is a date field, and that is not a date.");
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Members
	// ─────────────────────────────────────────────────────────────────────────

	/** The one analysis measure this name is, or null when it is an ordinary measure. */
	private static CubeAnalysis.Analytic analyticOf(CubeOptions cube, String name) {

		List<CubeAnalysis.Analytic> analytics = CubeAnalysis.analyticsOf(cube, List.of(name));
		return analytics.isEmpty() ? null : analytics.get(0);
	}

	/** Whether this name is one of a geo dimension's two coordinate columns. */
	private static boolean isGeoCorner(CubeOptions cube, String name) {

		for (String suffix : List.of("_lat", "_lng")) {
			if (!name.endsWith(suffix)) continue;
			Map<String, Object> dim = member(cube.getDimensions(),
					name.substring(0, name.length() - suffix.length()));
			if (dim != null && "geo".equals(Objects.toString(dim.get("type"), "").trim().toLowerCase()))
				return true;
		}
		return false;
	}

	/** The member of this name that the cube offers — {@code public false} is not one. */
	private static Map<String, Object> member(List<Map<String, Object>> members, String name) {

		String wanted = Objects.toString(name, "").trim();
		if (wanted.isEmpty())
			return null;
		for (Map<String, Object> one : members != null ? members : List.<Map<String, Object>>of()) {
			if (wanted.equals(Objects.toString(one.get("name"), "")) && !Boolean.FALSE.equals(one.get("public")))
				return one;
		}
		return null;
	}

	private static String names(List<Map<String, Object>> members) {

		List<String> names = new ArrayList<>();
		for (Map<String, Object> one : members != null ? members : List.<Map<String, Object>>of()) {
			if (!Boolean.FALSE.equals(one.get("public")))
				names.add(Objects.toString(one.get("name"), ""));
		}
		return names.isEmpty() ? "(none)" : String.join(", ", names);
	}

	private static List<Object> list(Object value) {
		return value instanceof List ? new ArrayList<>((List<?>) value) : List.of();
	}
}

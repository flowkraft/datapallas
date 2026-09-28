package com.flowkraft.cubes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeRules;

/**
 * The three measures that are read over the finished groups instead of inside them: a share of the
 * total, a running or to-date total, and the same period an interval earlier.
 *
 * <p><b>Why they are not ordinary measures.</b> {@code SUM(x)} is computed while the rows are being
 * grouped. A share of the grand total, a running total and last year's number are all computed
 * <em>after</em> that: they read the finished groups. So the query the plain generator writes
 * becomes the subquery {@code b}, and one outer SELECT over it adds these columns — which is also
 * why a share is a share of <b>all</b> the groups and not only of the ten rows a limit shows: the
 * limit belongs to the outer query, and by then the total is known.
 *
 * <p><b>The same period last year</b> is the one that needs a second query. {@code p} groups the
 * same dimensions and the same base measures over the earlier period, and is LEFT JOINed onto
 * {@code b} on every dimension, with the ticked time column moved forward by the interval so that
 * last March lands on this March's row. Moving the filter's dates is arithmetic on the values and
 * is done here in Java; moving a date in SQL is {@link CubeSqlDialect#addInterval}, which is the
 * vendor layer's, because no two of these databases add to a date the same way.
 *
 * <p><b>What is refused, and why each refusal is a sentence.</b> A share or a running total of an
 * average means nothing, a running total with no date to run along has no order, and a to-date
 * total inside a period coarser than the rows is the running total again. Each is answered with
 * what the author or the viewer would have to change, because the cube editor and the live cube
 * both show this sentence where the numbers would be.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b> Window functions are SQL:2003 and every
 * supported database runs them (SQLite since 3.25; the bundled one is 3.49). The one form ANSI has
 * no spelling for, adding an interval to a date, is asked of {@link CubeSqlDialect}.
 */
final class CubeAnalysis {

	private CubeAnalysis() {
	}

	/** {@code ${Something}} — the one measure an analysis measure is computed over. */
	private static final Pattern BASE = Pattern.compile("\\$\\{([^}]*)\\}");

	/** Which of the three an analysis measure is. */
	enum Kind {
		/** {@code share_of_total true} — the base over the grand total of the whole result. */
		SHARE,
		/** {@code rolling_window trailing: 'unbounded'} — the base added up from the first period. */
		RUNNING,
		/** {@code rolling_window type: 'to_date', granularity: 'year'} — the same, inside a period. */
		TO_DATE,
		/** {@code time_shift interval: '1 year'} — the base for the period that far earlier. */
		SHIFT
	}

	/** One analysis measure, as the outer SELECT needs it: what to compute, and over what. */
	static final class Analytic {

		final String name;
		final Kind kind;
		final String base;
		/** For {@link Kind#TO_DATE}: the period the total restarts in. */
		final String period;
		/** For {@link Kind#SHIFT}: how far back, and in what. */
		final int amount;
		final String unit;

		private Analytic(String name, Kind kind, String base, String period, int amount, String unit) {
			this.name = name;
			this.kind = kind;
			this.base = base;
			this.period = period;
			this.amount = amount;
			this.unit = unit;
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What the cube says
	// ═══════════════════════════════════════════════════════════════════════════

	/** Whether this measure is read over the finished groups rather than inside them. */
	static boolean isAnalytic(Map<String, Object> measure) {

		if (measure == null) return false;
		return CubeRules.isTrue(measure.get("share_of_total"))
				|| measure.get("rolling_window") != null
				|| measure.get("time_shift") != null;
	}

	/**
	 * The analysis measures among the ones asked for, in the order they were asked for. A name the
	 * cube has not got is left to the plain generator, which already says so in its own words.
	 */
	static List<Analytic> analyticsOf(CubeOptions cube, List<String> measures) {

		List<Analytic> analytics = new ArrayList<>();
		for (String name : measures != null ? measures : List.<String>of()) {
			Map<String, Object> measure = member(cube.getMeasures(), name);
			if (isAnalytic(measure)) analytics.add(of(cube, name, measure));
		}
		return analytics;
	}

	/**
	 * One analysis measure, read off the cube.
	 *
	 * <p>Everything the author could have got wrong about it — two of the three keys at once, a
	 * base that is not one measure or does not add up, a {@code rolling_window} form this server
	 * does not build — is {@link CubeRules#analysisErrors}, so the cube editor says the same
	 * sentence before any query is asked. This method is what is left once those hold: reading.
	 */
	private static Analytic of(CubeOptions cube, String name, Map<String, Object> measure) {

		List<String> errors = new ArrayList<>();
		CubeRules.analysisErrors(cube, measure, name, errors);
		if (!errors.isEmpty()) throw new IllegalArgumentException(errors.get(0));

		String base = baseOf(measure);

		if (CubeRules.isTrue(measure.get("share_of_total"))) {
			return new Analytic(name, Kind.SHARE, base, null, 0, null);
		}

		if (measure.get("time_shift") != null) {
			String[] interval = text(measure.get("time_shift"), "interval").split("\\s+");
			return new Analytic(name, Kind.SHIFT, base, null, Integer.parseInt(interval[0]),
					CubeRules.timeUnit(interval[1]));
		}

		String trailing = text(measure.get("rolling_window"), "trailing");
		return trailing.isEmpty()
				? new Analytic(name, Kind.TO_DATE, base, CubeRules.timeUnit(
						text(measure.get("rolling_window"), "granularity")), 0, null)
				: new Analytic(name, Kind.RUNNING, base, null, 0, null);
	}

	/** The one measure it is computed over: the single {@code ${Measure}} of its {@code sql}. */
	private static String baseOf(Map<String, Object> measure) {

		Matcher found = BASE.matcher(Objects.toString(measure.get("sql"), ""));
		while (found.find()) {
			String reference = found.group(1).trim();
			if (!"CUBE".equals(reference)) return reference;
		}
		return "";
	}

	/** One key of a {@code rolling_window} or {@code time_shift} map, trimmed, never null. */
	private static String text(Object declared, String key) {

		return declared instanceof Map
				? Objects.toString(((Map<?, ?>) declared).get(key), "").trim()
				: "";
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The outer query
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The whole query: the plain one as the subquery {@code b}, the earlier one as {@code p} when a
	 * period comparison asks for it, and one outer SELECT that reads the window columns over them.
	 */
	static CubeQuery analysedQuery(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedMeasures,
			List<String> selectedSegments,
			List<String> requestOrder,
			List<Map<String, Object>> filters,
			Integer limit,
			String dbVendor) {

		String vendor = CubeSqlDialect.key(dbVendor);
		List<Analytic> analytics = analyticsOf(cube, selectedMeasures);

		Map<String, Analytic> byName = new LinkedHashMap<>();
		for (Analytic analytic : analytics) byName.put(analytic.name, analytic);

		// What the subquery has to return: every plain measure that was asked for, and every base
		// an analysis measure reads - whether or not the caller ticked that base as well.
		List<String> innerMeasures = new ArrayList<>();
		for (String asked : selectedMeasures) {
			if (!byName.containsKey(asked) && !innerMeasures.contains(asked)) innerMeasures.add(asked);
		}
		for (Analytic analytic : analytics) {
			if (!innerMeasures.contains(analytic.base)) innerMeasures.add(analytic.base);
		}

		// An order on an analysis measure is put on the outer query, where that measure exists; the
		// subquery is asked for the rest of the order so its own default is the one the outer keeps.
		List<String> innerOrder = new ArrayList<>();
		for (String asked : requestOrder != null ? requestOrder : List.<String>of()) {
			if (!byName.containsKey(asked.trim().split("\\s+")[0])) innerOrder.add(asked);
		}

		CubeSqlGenerator.Binder binder = new CubeSqlGenerator.Binder();
		CubeSqlGenerator.Plain base = CubeSqlGenerator.plain(cube, selectedDimensions, innerMeasures,
				selectedSegments, innerOrder, filters, null, dbVendor,
				new CubeSqlGenerator.Nested(binder, "", null, false));

		if (base.body().startsWith("--")) {
			// Nothing was selected, or the cube has no source: the plain form's own answer stands.
			return new CubeQuery(base.body(), binder.params());
		}

		List<Analytic> shifts = new ArrayList<>();
		for (Analytic analytic : analytics) {
			if (analytic.kind == Kind.SHIFT) shifts.add(analytic);
		}
		refuseWhatTheQueryCannotAnswer(analytics, shifts, base);

		String with = base.with();
		String prior = null;
		if (!shifts.isEmpty()) {
			CubeSqlGenerator.Plain earlier = priorQuery(cube, selectedDimensions, selectedSegments,
					filters, shifts, dbVendor, binder);
			with = bothWith(with, earlier.with());
			prior = earlier.body();
		}

		// The select list, in the order the caller asked for its fields.
		List<String> outerParts = new ArrayList<>();
		for (String alias : base.dimensionAliases()) {
			outerParts.add("b." + CubeSqlDialect.quoteAlias(alias, vendor) + " AS "
					+ CubeSqlDialect.quoteAlias(alias, vendor));
		}
		for (String asked : selectedMeasures) {
			Analytic analytic = byName.get(asked);
			String alias = CubeSqlDialect.quoteAlias(asked, vendor);
			if (analytic == null) {
				outerParts.add("b." + alias + " AS " + alias);
			} else {
				outerParts.add(expression(analytic, base, vendor) + " AS " + alias);
			}
		}

		List<String> outerOrder = outerOrder(requestOrder, selectedMeasures, base, byName, vendor);

		String selectPrefix = limit == null ? "" : CubeSqlDialect.limitPrefix(limit, vendor);
		String limitClause = limit == null ? "" : CubeSqlDialect.limitClause(limit, vendor);

		StringBuilder sql = new StringBuilder(with);
		sql.append("SELECT").append(selectPrefix).append("\n  ");
		sql.append(String.join(",\n  ", outerParts));
		sql.append("\nFROM (").append(base.body()).append("\n) b");
		if (prior != null) {
			sql.append("\nLEFT JOIN (").append(prior).append("\n) p ON ")
					.append(joinCondition(base, vendor));
		}
		if (!outerOrder.isEmpty()) {
			sql.append("\nORDER BY\n  ").append(String.join(",\n  ", outerOrder));
		}
		sql.append(limitClause).append(base.tail());

		return new CubeQuery(sql.toString(), binder.params());
	}

	/**
	 * What the query, rather than the cube, makes impossible: a running total with no date to run
	 * along, and a to-date total inside a period no coarser than the rows themselves.
	 */
	private static void refuseWhatTheQueryCannotAnswer(List<Analytic> analytics, List<Analytic> shifts,
			CubeSqlGenerator.Plain base) {

		for (Analytic analytic : analytics) {
			if (analytic.kind == Kind.SHARE) continue;

			if (base.timeAlias() == null) {
				if (analytic.kind == Kind.SHIFT) {
					// Without a date column the shift still answers, as one number for the whole
					// earlier period - but only if the filters say which period that is.
					continue;
				}
				throw new IllegalArgumentException("Measure '" + analytic.name + "' adds up along time, so "
						+ "it needs a date field in the query, for example Order Date by month.");
			}

			if (analytic.kind == Kind.TO_DATE) {
				String rows = Objects.toString(base.timeGranularity(), "");
				if (rows.isEmpty()) {
					throw new IllegalArgumentException("Measure '" + analytic.name + "' restarts every "
							+ analytic.period + ", so its date field needs a granularity: ask for '"
							+ base.timeAlias() + "' by month, quarter or year.");
				}
				if (!finerThan(rows, analytic.period)) {
					throw new IllegalArgumentException("Measure '" + analytic.name + "' restarts every "
							+ analytic.period + ", and this query's rows are already one per " + rows
							+ ", so every row would be its own total. Ask for '" + base.timeAlias()
							+ "' by a grain finer than " + analytic.period + ".");
				}
			}
		}

		if (shifts.size() > 1) {
			String interval = shifts.get(0).amount + " " + shifts.get(0).unit;
			for (Analytic shift : shifts) {
				if (!interval.equals(shift.amount + " " + shift.unit)) {
					throw new IllegalArgumentException("This query asks for two periods at once: '"
							+ shifts.get(0).name + "' looks back " + interval + " and '" + shift.name
							+ "' looks back " + shift.amount + " " + shift.unit
							+ ". Ask for one of them at a time.");
				}
			}
		}
	}

	/** Whether rows one per {@code rows} fit inside a {@code period}: day &lt; week &lt; … &lt; year. */
	private static boolean finerThan(String rows, String period) {
		return CubeSqlDialect.GRANULARITIES.indexOf(rows) < CubeSqlDialect.GRANULARITIES.indexOf(period);
	}

	/** One analysis column, read over the finished groups of {@code b}. */
	private static String expression(Analytic analytic, CubeSqlGenerator.Plain base, String vendor) {

		String value = "b." + CubeSqlDialect.quoteAlias(analytic.base, vendor);
		String time = base.timeAlias() == null ? null
				: "b." + CubeSqlDialect.quoteAlias(base.timeAlias(), vendor);

		switch (analytic.kind) {

			case SHARE:
				// NULLIF, so a result whose total is zero answers null rather than failing: a share
				// of nothing is not a number, and it is not an error either.
				return "(" + value + " / NULLIF(SUM(" + value + ") OVER (), 0))";

			case SHIFT:
				return "p." + CubeSqlDialect.quoteAlias(analytic.base, vendor);

			case RUNNING:
			case TO_DATE:
			default: {
				List<String> partition = new ArrayList<>();
				for (String alias : base.dimensionAliases()) {
					// Every other dimension splits the result into its own series: a running total
					// per country runs along that country's months, not along everybody's.
					if (!alias.equals(base.timeAlias())) {
						partition.add("b." + CubeSqlDialect.quoteAlias(alias, vendor));
					}
				}
				if (analytic.kind == Kind.TO_DATE) {
					partition.add(CubeSqlDialect.dateTrunc(time, analytic.period, vendor));
				}
				return "SUM(" + value + ") OVER ("
						+ (partition.isEmpty() ? "" : "PARTITION BY " + String.join(", ", partition) + " ")
						+ "ORDER BY " + time + " ROWS UNBOUNDED PRECEDING)";
			}
		}
	}

	/**
	 * The earlier period's own grouped query: the same dimensions and the base measures, over rows
	 * whose time filters are all moved back by the interval.
	 */
	private static CubeSqlGenerator.Plain priorQuery(
			CubeOptions cube,
			List<String> selectedDimensions,
			List<String> selectedSegments,
			List<Map<String, Object>> filters,
			List<Analytic> shifts,
			String dbVendor,
			CubeSqlGenerator.Binder binder) {

		List<String> bases = new ArrayList<>();
		for (Analytic shift : shifts) {
			if (!bases.contains(shift.base)) bases.add(shift.base);
		}

		Analytic first = shifts.get(0);
		List<Map<String, Object>> moved = movedBack(cube, filters, first.amount, first.unit);

		// Its own tag for the fan-out rewrite's internal tables, because both queries may need that
		// rewrite and the two stand side by side in one WITH.
		return CubeSqlGenerator.plain(cube, selectedDimensions, bases, selectedSegments, List.of(),
				moved, null, dbVendor, new CubeSqlGenerator.Nested(binder, "p",
						new CubeSqlGenerator.Shift(first.amount, first.unit), false));
	}

	/**
	 * Two {@code WITH} clauses become the one a statement is allowed: {@code WITH a AS (…), b AS
	 * (…)}. Either may be empty, and usually both are — only a cube whose joins multiply a measure
	 * has one at all.
	 */
	private static String bothWith(String first, String second) {

		if (first.isEmpty()) return second;
		if (second.isEmpty()) return first;
		// The first ends with ")\n" and the second starts with "WITH ": a comma joins them.
		return first.substring(0, first.length() - 1) + ",\n" + second.substring("WITH ".length());
	}

	/**
	 * The same filters, with every range on a time dimension moved back by the interval.
	 *
	 * <p>The dates are moved here, in Java, and not in SQL: a filter's ends are values the caller
	 * sent, and a value is the one thing that can be moved without asking any database how it adds
	 * a month. What the SQL still has to do is move the ticked time column forward again, so that
	 * the earlier row lands beside the later one — that is {@link #joinCondition}.
	 */
	private static List<Map<String, Object>> movedBack(CubeOptions cube,
			List<Map<String, Object>> filters, int amount, String unit) {

		List<Map<String, Object>> moved = new ArrayList<>();
		for (Map<String, Object> filter : filters != null ? filters : List.<Map<String, Object>>of()) {
			String member = Objects.toString(filter.get("member"), "").trim();
			Map<String, Object> dimension = member(cube.getDimensions(), member);
			boolean time = dimension != null
					&& "time".equals(Objects.toString(dimension.get("type"), "").trim().toLowerCase(Locale.ROOT));
			if (!time || !(filter.get("values") instanceof List)) {
				moved.add(filter);
				continue;
			}

			List<Object> values = new ArrayList<>();
			for (Object value : (List<?>) filter.get("values")) {
				values.add(earlier(value, member, amount, unit));
			}
			Map<String, Object> copy = new LinkedHashMap<>(filter);
			copy.put("values", values);
			moved.add(copy);
		}
		return moved;
	}

	/** One date, that far earlier, written the way it arrived. */
	private static Object earlier(Object value, String member, int amount, String unit) {

		if (value == null) return null;
		String text = value.toString().trim();
		try {
			String iso = text.replace(' ', 'T');
			if (iso.length() > 10) {
				return minus(LocalDateTime.parse(iso), amount, unit).toString().replace('T', ' ');
			}
			return minus(LocalDate.parse(iso), amount, unit).toString();
		} catch (DateTimeParseException wrong) {
			throw new IllegalArgumentException("The filter on '" + member + "' was given '" + text
					+ "', and a period comparison moves that date back, so it takes a date, as 2024-01-31 "
					+ "or 2024-01-31 18:00:00.");
		}
	}

	private static LocalDate minus(LocalDate day, int amount, String unit) {
		switch (unit) {
			case "day":     return day.minusDays(amount);
			case "week":    return day.minusWeeks(amount);
			case "month":   return day.minusMonths(amount);
			case "quarter": return day.minusMonths(3L * amount);
			default:        return day.minusYears(amount);
		}
	}

	private static LocalDateTime minus(LocalDateTime stamp, int amount, String unit) {
		return minus(stamp.toLocalDate(), amount, unit).atTime(stamp.toLocalTime());
	}

	/**
	 * How the earlier rows meet the later ones: every dimension equal. The date needs nothing said
	 * about it here, because {@code p} already computed its own time column moved forward by the
	 * interval — last March came out of it as this March. The equality is written out NULL-safe,
	 * exactly as the no-double-counting rewrite writes it, because a dimension with no value is
	 * still a group.
	 */
	private static String joinCondition(CubeSqlGenerator.Plain base, String vendor) {

		List<String> on = new ArrayList<>();
		for (String alias : base.dimensionAliases()) {
			String quoted = CubeSqlDialect.quoteAlias(alias, vendor);
			on.add("(b." + quoted + " = p." + quoted
					+ " OR (b." + quoted + " IS NULL AND p." + quoted + " IS NULL))");
		}
		// No dimension at all: both sides are one row, and there is nothing to match them on.
		return on.isEmpty() ? "1 = 1" : String.join("\n  AND ", on);
	}

	/** What the outer query is ordered by: the request's own words, else what the subquery chose. */
	private static List<String> outerOrder(List<String> requestOrder, List<String> selectedMeasures,
			CubeSqlGenerator.Plain base, Map<String, Analytic> byName, String vendor) {

		if (requestOrder == null || requestOrder.isEmpty()) return base.orderAliases();

		Set<String> fields = new LinkedHashSet<>(base.dimensionAliases());
		fields.addAll(selectedMeasures);

		List<String> order = new ArrayList<>();
		for (String asked : requestOrder) {
			String[] parts = asked.trim().split("\\s+");
			String member = parts[0];
			String direction = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "asc";
			if (!"asc".equals(direction) && !"desc".equals(direction)) {
				throw new IllegalArgumentException("'" + asked + "' asks to be ordered '" + direction
						+ "', which is not an order. An order may be 'asc' or 'desc'.");
			}
			String field = member;
			if (!fields.contains(field)) {
				int dot = member.lastIndexOf('.');
				if (dot > 0) field = member.substring(0, dot);
			}
			if (!fields.contains(field)) {
				throw new IllegalArgumentException("The answer cannot be ordered by '" + member
						+ "', because it is not one of the fields it returns.");
			}
			order.add(CubeSqlDialect.quoteAlias(field, vendor) + " " + direction.toUpperCase(Locale.ROOT));
		}
		return order;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Small shared helpers
	// ═══════════════════════════════════════════════════════════════════════════

	private static Map<String, Object> member(List<Map<String, Object>> members, String name) {

		String wanted = Objects.toString(name, "").trim();
		if (wanted.isEmpty()) return null;
		for (Map<String, Object> member : members != null ? members : List.<Map<String, Object>>of()) {
			if (wanted.equals(Objects.toString(member.get("name"), ""))) return member;
		}
		return null;
	}

	private static String names(List<Map<String, Object>> members) {

		List<String> all = new ArrayList<>();
		for (Map<String, Object> member : members != null ? members : List.<Map<String, Object>>of()) {
			all.add(Objects.toString(member.get("name"), ""));
		}
		return all.isEmpty() ? "(none)" : String.join(", ", all);
	}
}

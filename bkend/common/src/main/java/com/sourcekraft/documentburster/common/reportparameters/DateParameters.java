package com.sourcekraft.documentburster.common.reportparameters;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;

/**
 * The day after the day a Date parameter names — the upper bound of a dashboard's date range.
 *
 * <h2>Why it exists</h2>
 * A dashboard's date range is two Date parameters, {@code from} and {@code to}, and the range of
 * whole days they name ends at midnight <em>after</em> {@code to}: a timestamp column holds a time
 * of day, so {@code closed_on <= :to} leaves out every row on the last day except the one stamped
 * midnight. The filter therefore reads {@code c >= :from AND c < :to__next_day}, the same half-open
 * range every other date filter in the product writes.
 *
 * <p>The day after {@code to} is a date, and a date is computed in one place. Not in SQL:
 * {@code to + INTERVAL '1' DAY} is a different text on nearly every vendor, and the generator
 * writes ANSI SQL only. Not in the browser either: the value arrives later, from the filter bar of
 * a published dashboard, long after that SQL was built. So the SQL names a second parameter and its
 * value is derived here, where the first one is bound — by the canvas
 * ({@code QueriesService.prepare}) and by the published script ({@code ScriptAssembler} writes a
 * call to this class) alike, so a dashboard and the canvas it came from ask the database the same
 * question.
 *
 * <p>Only a parameter the dashboard declared as a Date gets one. A DateTime names an instant, and
 * the day after an instant is not what a user asking for "on or before 14:05" means.
 */
public final class DateParameters {

	/**
	 * The suffix of the derived parameter's name. The SQL generator writes the same one
	 * ({@code lib/explore-data/date-parameters.ts}).
	 */
	public static final String NEXT_DAY_SUFFIX = "__next_day";

	private DateParameters() {
	}

	/** The name of the derived parameter of this one: {@code to} → {@code to__next_day}. */
	public static String nextDayName(String parameterId) {
		return parameterId + NEXT_DAY_SUFFIX;
	}

	/** True when this name is a derived one. */
	public static boolean isNextDayName(String name) {
		return name != null && name.length() > NEXT_DAY_SUFFIX.length() && name.endsWith(NEXT_DAY_SUFFIX);
	}

	/** The parameter a derived name derives from: {@code to__next_day} → {@code to}. */
	public static String baseName(String name) {
		return isNextDayName(name) ? name.substring(0, name.length() - NEXT_DAY_SUFFIX.length()) : name;
	}

	/**
	 * True when this declared type is a whole day — the three words
	 * {@link ParameterTypes#typed} reads as a {@code LocalDate}.
	 */
	public static boolean isDayType(String type) {
		if (StringUtils.isBlank(type))
			return false;
		switch (StringUtils.lowerCase(type.trim())) {
		case "date":
		case "localdate":
		case "datepicker":
			return true;
		default:
			return false;
		}
	}

	/**
	 * The day after the day this value names, as text.
	 *
	 * @param parameterId the parameter's id, used in the error message
	 * @param type        the declared type; blank is taken as a date, because a value that is a
	 *                    plain {@code yyyy-MM-dd} names a day whatever the dashboard called it
	 * @param value       the value as text, as every path delivers it
	 * @return the next day as {@code yyyy-MM-dd}, or the value itself when it is empty — no value is
	 *         no filter, and the line that uses it is left out by the rule that reads it
	 *         ({@code SqlParameterLines})
	 * @throws IllegalArgumentException when the parameter is not a date, or its value is not one
	 */
	public static String nextDay(String parameterId, String type, String value) {

		if (value == null || value.trim().isEmpty())
			return value;

		if (!isDayType(type) && !StringUtils.isBlank(type))
			throw new IllegalArgumentException("Parameter '" + parameterId
					+ "' has to be a Date to be read as a range of whole days, not '" + type + "'");

		// ParameterTypes does the parsing and the refusing, so both paths refuse the same value with
		// the same words; a blank type is read as a date here, which is what the value is.
		// Written for this module's Java 8 source level: no pattern matching in instanceof.
		Object day = ParameterTypes.typed(parameterId, "Date", value);
		if (!(day instanceof LocalDate))
			throw new IllegalArgumentException(
					"Parameter '" + parameterId + "' expects a date as yyyy-MM-dd, not '" + value + "'");
		return ((LocalDate) day).plusDays(1).toString();
	}

	/**
	 * The derived values this SQL asks for: one entry per {@code ${p__next_day}} the text names,
	 * whose value is the day after the day {@code p} names.
	 *
	 * <p>A name the SQL does not use gets no entry, so nothing is bound that the query does not ask
	 * for, and a parameter the dashboard itself declared under a derived name is left alone.
	 *
	 * @param sql        the SQL as the generator wrote it, with its {@code ${…}} placeholders
	 * @param params     the values, by parameter id
	 * @param paramTypes the declared type of each parameter, or null
	 * @return derived name → value, empty when this SQL asks for none
	 */
	/**
	 * Whether a SQL text names this parameter, in either form the product writes: <code>${name}</code>
	 * and <code>#{name}</code>. A derived day is declared and bound only when the SQL asks for it, so a
	 * dashboard whose Date parameter is used plainly gets nothing extra - and a value that is not a
	 * single day (an IN list of dates, say) is never handed to {@link #nextDay}.
	 */
	public static boolean mentions(String sql, String name) {
		return sql != null && (sql.contains("${" + name + "}") || sql.contains("#{" + name + "}"));
	}

	public static Map<String, String> derivedValues(String sql, Map<String, Object> params,
			Map<String, String> paramTypes) {

		Map<String, String> derived = new LinkedHashMap<>();
		if (sql == null || params == null || params.isEmpty())
			return derived;

		for (Map.Entry<String, Object> entry : params.entrySet()) {
			String name = entry.getKey();
			String derivedName = nextDayName(name);
			if (params.containsKey(derivedName))
				continue;
			if (!mentions(sql, derivedName))
				continue;
			String type = paramTypes == null ? null : paramTypes.get(name);
			Object value = entry.getValue();
			derived.put(derivedName, nextDay(name, type, value == null ? null : String.valueOf(value)));
		}
		return derived;
	}
}

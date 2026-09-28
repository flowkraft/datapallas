package com.sourcekraft.documentburster.common.reportparameters;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import org.apache.commons.lang3.StringUtils;

/**
 * One text value and the type the dashboard declared for it, turned into the Java type the database
 * expects — the single place where that is decided.
 *
 * <h2>Why it exists</h2>
 * Every dashboard parameter reaches the server as text: the date picker sends {@code 2026-01-31},
 * the number box sends {@code 100}, and the canvas, the published dashboard and a share link all
 * carry them as strings. Bound as text, {@code close_date <= :to} is an error on PostgreSQL
 * ("operator does not exist: date <= character varying"), depends on {@code NLS_DATE_FORMAT} on
 * Oracle, and — worst of the three — silently answers the wrong rows on SQLite, where a date column
 * holds epoch milliseconds and text ranks above every number.
 *
 * <p>So the value is converted where it is bound, once, from the type the dashboard already
 * declares: the canvas path ({@code QueriesService}), the published script
 * ({@code ScriptAssembler} writes a call to this class), and the locked values of a share link
 * ({@code LockedParamsValidator}) all come through here and bind the same Java type.
 *
 * <p>A value that does not parse is refused by name, with the form that was expected — a message a
 * dashboard author can act on, rather than the database's own complaint about a bind variable.
 */
public final class ParameterTypes {

	private ParameterTypes() {
	}

	/**
	 * @param parameterId the parameter's id, used in the error message
	 * @param type        the declared type: String, Integer, Double (or decimal), Boolean, Date or
	 *                    DateTime; blank or unknown means the text is bound as it came
	 * @param value       the value as text, as every path delivers it
	 * @return the value as the declared Java type, or the text itself for String, an unknown type
	 *         and an empty value (an empty value is "no value": what that means for the query is
	 *         the caller's business, not this method's)
	 * @throws IllegalArgumentException when the value does not parse as the declared type
	 */
	public static Object typed(String parameterId, String type, String value) {

		if (value == null || value.isEmpty())
			return value;

		if (StringUtils.isBlank(type))
			return value;

		String trimmed = value.trim();

		switch (StringUtils.lowerCase(type.trim())) {

		case "integer":
		case "int":
		case "long":
			try {
				return Long.valueOf(trimmed);
			} catch (NumberFormatException e) {
				throw refuse(parameterId, "a whole number", value);
			}

		case "double":
		case "decimal":
		case "number":
		case "float":
			try {
				return new BigDecimal(trimmed);
			} catch (NumberFormatException e) {
				throw refuse(parameterId, "a number", value);
			}

		case "boolean":
		case "bool":
			if ("true".equalsIgnoreCase(trimmed))
				return Boolean.TRUE;
			if ("false".equalsIgnoreCase(trimmed))
				return Boolean.FALSE;
			throw refuse(parameterId, "true or false", value);

		case "date":
		case "localdate":
		case "datepicker":
			try {
				// java.time, not java.sql.Date: JDBC 4.2 drivers bind a LocalDate as the date it is,
				// and SQLite - whose dates are the text 2026-01-31, not a number - keeps that text.
				// java.sql.Date on SQLite binds epoch milliseconds, which ranks below every string
				// there, so a date column of a shipped sample answers nothing at all.
				return LocalDate.parse(trimmed);
			} catch (Exception e) {
				throw refuse(parameterId, "a date as yyyy-MM-dd", value);
			}

		case "datetime":
		case "date-time":
		case "localdatetime":
		case "timestamp":
			// The datetime-local control writes `2026-01-31T14:05`, with the seconds left out when
			// they are zero; LocalDateTime.parse reads that form and the one with seconds alike.
			try {
				return LocalDateTime.parse(trimmed);
			} catch (Exception e) {
				throw refuse(parameterId, "a date and time as yyyy-MM-ddTHH:mm", value);
			}

		default:
			// A type nobody here knows says nothing about its values: bind the text, as before.
			return value;
		}
	}

	private static IllegalArgumentException refuse(String parameterId, String expected, String value) {
		return new IllegalArgumentException(
				"Parameter '" + parameterId + "' expects " + expected + ", not '" + value + "'");
	}
}

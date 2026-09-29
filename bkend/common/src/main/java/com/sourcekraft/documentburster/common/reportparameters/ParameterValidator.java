package com.sourcekraft.documentburster.common.reportparameters;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;
import java.util.Map;

public class ParameterValidator {

	public void validate(ReportParameter parameter, Object value, Map<String, Object> context)
			throws ValidationException {
		if (parameter.constraints == null)
			return;

		if (parameter.constraints.containsKey("required") && (boolean) parameter.constraints.get("required")
				&& value == null) {
			throw new ValidationException(parameter.id + " is required");
		}

		switch (parameter.type.toLowerCase()) {
		// The three spellings of a day, all of which ParameterTypes reads into a java.time
		// LocalDate. They are checked by one method, which takes the day whichever of the three
		// forms it arrives in: the old one cast the value to java.util.Date, so a date parameter
		// with a min or a max threw a ClassCastException at the viewer instead of an answer.
		case "date":
		case "localdate":
		case "datepicker":
			validateDay(parameter, value, context);
			break;
		case "string":
			validateString(parameter, (String) value);
			break;
		case "integer":
			// A box left empty is the empty text it arrived as, whatever type was declared:
			// ParameterTypes hands "no value" back unchanged, on purpose, because what no value
			// means for the query is the query's business (the condition naming it leaves the
			// WHERE). There is nothing to check about no value - and the cast alone threw a
			// ClassCastException at the viewer of the first optional whole number ever shipped,
			// on every card of the page, before any of it reached a database.
			if (value instanceof Number)
				validateNumber(parameter, (Number) value);
			break;
		case "boolean":
			// No specific validation needed
			break;
		}
	}

	/**
	 * A day against its {@code min} and {@code max}, either of which may be another parameter.
	 *
	 * <p>A constraint written as {@code min: fromDate} is a {@link ParamRef} — the parameters DSL
	 * turns an undefined property into one — so the value it stands for is looked up in the context,
	 * the values of the parameters read before this one. Until this was here a {@code ParamRef}
	 * resolved to null and the range was not checked at all: a to-date before its from-date went
	 * through and the query answered no rows, with nothing to say why.
	 *
	 * <p>Every report's date parameters go through here, not only a dashboard's: this is the one
	 * place a day is compared with a day.
	 */
	private void validateDay(ReportParameter parameter, Object value, Map<String, Object> context)
			throws ValidationException {

		LocalDate day = day(value);
		if (day == null)
			return;

		LocalDate min = day(named(parameter.constraints.get("min"), context));
		LocalDate max = day(named(parameter.constraints.get("max"), context));

		if (min != null && day.isBefore(min)) {
			throw new ValidationException(parameter.id + " must be on or after " + min);
		}
		if (max != null && day.isAfter(max)) {
			throw new ValidationException(parameter.id + " must be on or before " + max);
		}
	}

	/** A constraint's value: another parameter's, when it names one, or the constraint itself. */
	private static Object named(Object constraint, Map<String, Object> context) {
		if (constraint instanceof ParamRef) {
			return context == null ? null : context.get(((ParamRef) constraint).name);
		}
		if (constraint instanceof String && context != null && context.containsKey(constraint)) {
			return context.get(constraint);
		}
		return constraint;
	}

	/** The day a value is, whichever of the three forms it arrives in; null when it is none of them. */
	private static LocalDate day(Object value) {
		if (value instanceof LocalDate) {
			return (LocalDate) value;
		}
		if (value instanceof Date) {
			return Instant.ofEpochMilli(((Date) value).getTime()).atZone(ZoneId.systemDefault()).toLocalDate();
		}
		if (value instanceof CharSequence) {
			try {
				return LocalDate.parse(((CharSequence) value).toString().trim());
			} catch (Exception notADay) {
				return null;
			}
		}
		return null;
	}

	private void validateString(ReportParameter parameter, String value) throws ValidationException {
		if (parameter.constraints.containsKey("maxLength")
				&& value.length() > (int) parameter.constraints.get("maxLength")) {
			throw new ValidationException(parameter.id + " exceeds maximum length");
		}

		if (parameter.constraints.containsKey("pattern")
				&& !value.matches((String) parameter.constraints.get("pattern"))) {
			throw new ValidationException(parameter.id + " doesn't match pattern");
		}
	}

	private void validateNumber(ReportParameter parameter, Number value) throws ValidationException {
		if (parameter.constraints.containsKey("min")
				&& value.doubleValue() < ((Number) parameter.constraints.get("min")).doubleValue()) {
			throw new ValidationException(parameter.id + " is below minimum");
		}

		if (parameter.constraints.containsKey("max")
				&& value.doubleValue() > ((Number) parameter.constraints.get("max")).doubleValue()) {
			throw new ValidationException(parameter.id + " exceeds maximum");
		}
	}
}

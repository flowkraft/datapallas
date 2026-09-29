package com.sourcekraft.documentburster.common.reportparameters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * What a report's parameters are checked against once they are typed: every report's, not only a
 * dashboard's, because this is the one place a day is compared with a day.
 *
 * <p>Two things are at stake. A range written as {@code min: fromDate} names another parameter, and
 * until that name was resolved the range was not checked at all: a to-date before its from-date
 * went through and the query answered no rows, with nothing to say why. And a day arrives here as a
 * {@code java.time.LocalDate} whichever of the three spellings declared it - {@code date},
 * {@code localdate}, {@code datepicker} - because that is what {@link ParameterTypes#typed} reads
 * it into, so a check that casts it to {@code java.util.Date} shows the viewer a
 * ClassCastException instead of an answer.
 */
public class ParameterValidatorTest {

	private final ParameterValidator validator = new ParameterValidator();

	private static ReportParameter day(String id, String type, Map<String, Object> constraints) {
		ReportParameter parameter = new ReportParameter();
		parameter.id = id;
		parameter.type = type;
		parameter.constraints = constraints;
		return parameter;
	}

	private static Map<String, Object> constraints(Object... pairs) {
		Map<String, Object> constraints = new LinkedHashMap<>();
		for (int i = 0; i < pairs.length; i += 2)
			constraints.put((String) pairs[i], pairs[i + 1]);
		return constraints;
	}

	@Test
	public void aDayIsCheckedWhicheverOfTheThreeSpellingsDeclaredIt() throws Exception {

		for (String type : new String[] { "Date", "date", "localdate", "datepicker" }) {

			ReportParameter to = day("to", type, constraints("min", "2026-01-01", "max", "2026-12-31"));

			// The value is what ParameterTypes.typed answers for all three: a java.time day.
			validator.validate(to, LocalDate.parse("2026-06-30"), Map.of());

			ValidationException tooEarly = assertThrows(ValidationException.class,
					() -> validator.validate(to, LocalDate.parse("2025-12-31"), Map.of()));
			assertTrue(tooEarly.getMessage().contains("to"), tooEarly.getMessage());
			assertEquals("to must be on or after 2026-01-01", tooEarly.getMessage());

			ValidationException tooLate = assertThrows(ValidationException.class,
					() -> validator.validate(to, LocalDate.parse("2027-01-01"), Map.of()));
			assertEquals("to must be on or before 2026-12-31", tooLate.getMessage());
		}
	}

	@Test
	public void aRangeThatNamesAnotherParameterIsCheckedAgainstTheValueThatParameterWasGiven()
			throws Exception {

		// min: fromDate in the parameters DSL: an undefined property, which the DSL turns into a
		// ParamRef, so the day to compare with is the one the viewer answered for 'fromDate'.
		ReportParameter to = day("toDate", "Date", constraints("min", new ParamRef("fromDate")));
		Map<String, Object> answered = Map.of("fromDate", LocalDate.parse("2026-07-01"));

		validator.validate(to, LocalDate.parse("2026-09-30"), answered);
		validator.validate(to, LocalDate.parse("2026-07-01"), answered);

		ValidationException backwards = assertThrows(ValidationException.class,
				() -> validator.validate(to, LocalDate.parse("2026-06-30"), answered));
		assertEquals("toDate must be on or after 2026-07-01", backwards.getMessage());

		// The name is a name, not a day: with nothing answered for it there is nothing to compare
		// with, and the answer the viewer gave stands rather than being refused for a reason that
		// is not theirs.
		validator.validate(to, LocalDate.parse("2026-06-30"), Map.of());
	}

	@Test
	public void aRequiredParameterWithNoAnswerIsRefusedByName() {

		ReportParameter from = day("fromDate", "Date", constraints("required", true));

		ValidationException missing = assertThrows(ValidationException.class,
				() -> validator.validate(from, null, Map.of()));
		assertEquals("fromDate is required", missing.getMessage());
	}

	/**
	 * An optional whole number the viewer left empty.
	 *
	 * <p>{@link ParameterTypes#typed} hands "no value" back as the empty text it came as, whatever
	 * type was declared, because what no value means for the query belongs to the query - a
	 * condition naming it leaves the WHERE and the answer is every row. So the empty text reaches
	 * here under a parameter declared {@code Integer}, and casting it to a {@code Number} threw a
	 * ClassCastException at the viewer: not for the one card that asks, but for the whole page,
	 * because every card reads the dashboard's parameters before it reads anything else.
	 */
	@Test
	public void anOptionalWholeNumberLeftEmptyIsNothingToCheck() throws Exception {

		ReportParameter customerId = day("customerId", "Integer", constraints("required", false,
				"min", 1, "max", 9999));

		// Nothing answered, in the two shapes that means: the empty text ParameterTypes gives
		// back, and no value at all.
		validator.validate(customerId, ParameterTypes.typed("customerId", "Integer", ""), Map.of());
		validator.validate(customerId, null, Map.of());

		// And an answer is still checked, both ends of it: leaving the empty one alone is not
		// leaving the parameter unchecked.
		validator.validate(customerId, ParameterTypes.typed("customerId", "Integer", "26"), Map.of());

		ValidationException tooSmall = assertThrows(ValidationException.class,
				() -> validator.validate(customerId, 0L, Map.of()));
		assertEquals("customerId is below minimum", tooSmall.getMessage());

		ValidationException tooBig = assertThrows(ValidationException.class,
				() -> validator.validate(customerId, 10_000L, Map.of()));
		assertEquals("customerId exceeds maximum", tooBig.getMessage());
	}
}

package com.sourcekraft.documentburster.common.reportparameters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/**
 * The one conversion every path binds through: a dashboard parameter's text and its declared type
 * in, the Java type the database expects out.
 *
 * <p>What is at stake is not tidiness: bound as text, a date comparison is an error on PostgreSQL,
 * a locale question on Oracle and silently the wrong rows on SQLite. The three paths that bind a
 * parameter - the canvas, the published script and a share link's locked value - all call this, so
 * what it answers here is what every database is asked.
 */
public class ParameterTypesTest {

	@Test
	public void eachDeclaredTypeBecomesTheJavaTypeTheDatabaseExpects() {

		assertEquals(java.time.LocalDate.parse("2026-01-31"), ParameterTypes.typed("to", "Date", "2026-01-31"));

		// The datetime-local control leaves the seconds out when they are zero, and writes them when
		// they are not: both forms are the same instant to the database.
		assertEquals(java.time.LocalDateTime.parse("2026-01-31T14:05:00"),
				ParameterTypes.typed("ts", "DateTime", "2026-01-31T14:05"));
		assertEquals(java.time.LocalDateTime.parse("2026-01-31T14:05:09"),
				ParameterTypes.typed("ts", "DateTime", "2026-01-31T14:05:09"));

		assertEquals(Long.valueOf(100L), ParameterTypes.typed("min", "Integer", "100"));
		assertEquals(new BigDecimal("100.5"), ParameterTypes.typed("min", "Double", "100.5"));
		// AI Hub offers "Double"; the DSL and the web component call the same thing "decimal".
		assertEquals(new BigDecimal("100.5"), ParameterTypes.typed("min", "decimal", "100.5"));

		assertEquals(Boolean.TRUE, ParameterTypes.typed("won", "Boolean", "true"));
		assertEquals(Boolean.FALSE, ParameterTypes.typed("won", "Boolean", "FALSE"));

		assertEquals("Berlin", ParameterTypes.typed("city", "String", "Berlin"));
	}

	@Test
	public void aValueThatDoesNotParseIsRefusedByNameAndWithTheFormItExpected() {

		for (String[] bad : new String[][] {
				{ "to", "Date", "31/01/2026", "a date as yyyy-MM-dd" },
				{ "ts", "DateTime", "2026-01-31 14:05", "a date and time as yyyy-MM-ddTHH:mm" },
				{ "min", "Integer", "100.5", "a whole number" },
				{ "min", "Double", "a lot", "a number" },
				{ "won", "Boolean", "yes", "true or false" } }) {

			IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
					() -> ParameterTypes.typed(bad[0], bad[1], bad[2]));

			// The author has to be able to see which parameter, and what was expected of it, without
			// reading the database's own complaint about a bind variable.
			assertTrue(refused.getMessage().contains("'" + bad[0] + "'"), refused.getMessage());
			assertTrue(refused.getMessage().contains(bad[3]), refused.getMessage());
			assertTrue(refused.getMessage().contains(bad[2]), refused.getMessage());
		}
	}

	@Test
	public void noTypeAndAnUnknownTypeBindTheTextAsItCame() {

		assertEquals("2026-01-31", ParameterTypes.typed("to", null, "2026-01-31"));
		assertEquals("2026-01-31", ParameterTypes.typed("to", "", "2026-01-31"));
		assertEquals("2026-01-31", ParameterTypes.typed("to", "   ", "2026-01-31"));
		assertEquals("2026-01-31", ParameterTypes.typed("to", "Geography", "2026-01-31"));
	}

	@Test
	public void anEmptyValueIsLeftAlone() {

		// "No value" is not a bad date: what an empty parameter means for the query is decided where
		// the SQL is built, not here.
		assertEquals("", ParameterTypes.typed("to", "Date", ""));
		assertEquals(null, ParameterTypes.typed("to", "Date", null));
	}
}

package com.flowkraft.queries;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flowkraft.queries.services.QueriesService;
import com.sourcekraft.documentburster.common.reportparameters.DateParameters;

/**
 * A dashboard date range means whole days, and the day it ends at is derived — not written in SQL.
 *
 * <p>The filter bar gives two Date parameters, {@code from} and {@code to}, and the rows wanted are
 * every row of every day between them: {@code c >= :from AND c < :to__next_day}. A timestamp column
 * holds a time of day, so an upper bound of {@code to} itself leaves out everything on the last day
 * but midnight — the whole-day rule the generator already applies to a typed date.
 *
 * <p>The day after {@code to} is a date, and
 * {@link com.sourcekraft.documentburster.common.reportparameters.DateParameters} is the one place it
 * is computed: not in SQL, where {@code + INTERVAL '1' DAY} is a different text on nearly every
 * vendor, and not in the browser, which does not have the value yet. This test asks that class what
 * it derives, and asks {@code QueriesService.prepare} — the production path, called here, not a copy
 * — what it then binds. What the range actually answers on a database is proven by the AI Hub cases
 * p1e and p1f on all nine vendors ({@code GeneratedSqlAllVendorsTest}).
 */
class DateParametersTest {

	private static Map<String, Object> values(String... pairs) {
		Map<String, Object> map = new LinkedHashMap<>();
		for (int i = 0; i < pairs.length; i += 2)
			map.put(pairs[i], pairs[i + 1]);
		return map;
	}

	private static Map<String, String> types(String... pairs) {
		Map<String, String> map = new LinkedHashMap<>();
		for (int i = 0; i < pairs.length; i += 2)
			map.put(pairs[i], pairs[i + 1]);
		return map;
	}

	/** The SQL the generator writes for `closed_on between ${from} and ${to}` on a date column. */
	private static final String RANGE_SQL = "SELECT * FROM \"deals\"\n"
			+ "WHERE \"closed_on\" >= ${from} AND \"closed_on\" < ${to__next_day}";

	@Test
	void ansi_the_derived_day_is_the_day_after_the_one_the_parameter_names() {
		assertEquals("2026-02-01", DateParameters.nextDay("to", "Date", "2026-01-31"));
		// The end of a month, the end of a year, and a leap day: the calendar is java.time's, not
		// arithmetic on a string.
		assertEquals("2026-03-01", DateParameters.nextDay("to", "Date", "2026-02-28"));
		assertEquals("2027-01-01", DateParameters.nextDay("to", "Date", "2026-12-31"));
		assertEquals("2024-02-29", DateParameters.nextDay("to", "datepicker", "2024-02-28"));
		// A value that is a plain day is one whatever the dashboard called it: a dashboard published
		// before types were declared has no type at all, and its range must still mean whole days.
		assertEquals("2026-02-01", DateParameters.nextDay("to", null, "2026-01-31"));
		assertEquals("2026-02-01", DateParameters.nextDay("to", "", " 2026-01-31 "));
	}

	@Test
	void ansi_no_value_derives_no_value_so_the_filter_is_not_applied() {
		// An empty parameter is no filter, and the line that uses it is left out by the rule both
		// paths read the SQL with (SqlParameterLines). The derived value has to be empty too, or the
		// line would stay and ask for rows before an upper bound nobody gave.
		assertEquals("", DateParameters.nextDay("to", "Date", ""));
		assertEquals("   ", DateParameters.nextDay("to", "Date", "   "));
		assertEquals(null, DateParameters.nextDay("to", "Date", null));
	}

	@Test
	void ansi_a_parameter_that_is_not_a_date_is_refused_by_name() {
		// A DateTime names an instant, and the day after an instant is not what "on or before 14:05"
		// means: the generator never writes a derived bound for one, and this says so out loud.
		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> DateParameters.nextDay("cutoff", "DateTime", "2026-01-31T14:05"));
		assertTrue(refused.getMessage().contains("cutoff"), refused.getMessage());
		assertTrue(refused.getMessage().contains("Date"), refused.getMessage());
		// And a Date parameter whose value is not a date is refused with the form that was expected,
		// by ParameterTypes, the one place that message is written.
		assertTrue(assertThrows(IllegalArgumentException.class,
				() -> DateParameters.nextDay("to", "Date", "31/01/2026")).getMessage()
						.contains("yyyy-MM-dd"));
	}

	@Test
	void ansi_only_the_derived_names_the_sql_asks_for_are_derived() {
		Map<String, Object> params = values("from", "2026-01-01", "to", "2026-01-31");
		Map<String, String> declared = types("from", "Date", "to", "Date");

		// `from` is compared directly, so `from__next_day` is nothing this SQL asks for.
		Map<String, String> derived = DateParameters.derivedValues(RANGE_SQL, params, declared);
		assertEquals(1, derived.size(), derived.toString());
		assertEquals("2026-02-01", derived.get("to__next_day"));

		// A query that asks for no derived day gets none, so nothing new is ever bound to a query
		// that did not change.
		assertTrue(DateParameters.derivedValues("SELECT * FROM \"deals\" WHERE \"closed_on\" >= ${from}",
				params, declared).isEmpty());

		// A dashboard that declared the derived name itself keeps its own value: this derives, it
		// does not overwrite.
		Map<String, Object> own = values("from", "2026-01-01", "to", "2026-01-31", "to__next_day", "2026-06-06");
		assertTrue(DateParameters.derivedValues(RANGE_SQL, own, declared).isEmpty());
	}

	@Test
	void ansi_prepare_binds_the_derived_day_as_the_date_it_is() {
		QueriesService.PreparedSql prepared = QueriesService.prepare(RANGE_SQL,
				values("from", "2026-01-01", "to", "2026-01-31"), types("from", "Date", "to", "Date"));

		// The placeholder became a JDBI named parameter, like every other one.
		assertTrue(prepared.sql().contains(":to__next_day"), prepared.sql());
		assertFalse(prepared.sql().contains("${"), prepared.sql());

		// And its value is a LocalDate, not the text of one: bound as text, `date < varchar` is an
		// error on PostgreSQL and answers the wrong rows on SQLite, where a date column holds
		// epoch milliseconds and text ranks above every number.
		assertEquals(LocalDate.of(2026, 1, 1), prepared.params().get("from"));
		assertEquals(LocalDate.of(2026, 2, 1), prepared.params().get("to__next_day"));

		// And `to` itself is not bound: this query never names it, only the day after it. Every
		// derived name begins with the name it derives from, so the question "does the SQL use this
		// parameter" has to be asked on a word boundary - as it does for two parameters a dashboard
		// calls `to` and `total`.
		assertFalse(prepared.params().containsKey("to"), prepared.params().toString());
		assertEquals(2, prepared.params().size(), prepared.params().toString());
	}

	@Test
	void ansi_an_empty_bound_takes_the_whole_filter_with_it() {
		// Both bounds sit on one line, so an empty one leaves that line out - the query answers with
		// every row while the user has filled in only half of the range, instead of asking for rows
		// before an upper bound nobody gave.
		QueriesService.PreparedSql prepared = QueriesService.prepare(RANGE_SQL,
				values("from", "2026-01-01", "to", ""), types("from", "Date", "to", "Date"));

		assertTrue(prepared.sql().contains("1=1"), prepared.sql());
		assertFalse(prepared.sql().contains("closed_on"), prepared.sql());
		assertTrue(prepared.params() == null || prepared.params().isEmpty(),
				String.valueOf(prepared.params()));
	}
}

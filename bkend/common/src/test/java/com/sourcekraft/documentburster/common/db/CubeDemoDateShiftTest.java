package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The whole-day shift the seed script puts the demo rows through.
 *
 * <p>
 * The rows are frozen: they were generated for one day, 2026-09-30. Loaded as they are, a question
 * about "this quarter" answers nothing once the calendar passes that day, so the script moves every
 * day in them by the same whole number of days. This test loads the same rows twice - once for the
 * day they were generated for, which shifts nothing, and once for another day - and holds the two
 * databases against each other: every day must have moved by exactly the shift, no day may have
 * stayed behind, and nothing but the days may have changed.
 * </p>
 *
 * <p>
 * That is what makes the shift safe to ship: it is the difference between two loads of the same
 * rows, not a number anybody typed into an expected value.
 * </p>
 */
class CubeDemoDateShiftTest {

	/** The day the rows were generated for. Loading for this day is the unshifted baseline. */
	private static final String FROZEN_TODAY = NorthwindFixture.CUBE_DEMO_TODAY;

	/**
	 * The day the shifted half loads for, and the shift it asks for. Chosen so the shift crosses 29
	 * February 2028: the last ticket, opened the day before the frozen today, lands exactly on the
	 * leap day, and the rows that end on the frozen today land on 1 March. A shift counted in
	 * anything but whole days - in months, in years, or by re-deriving each day from its own year -
	 * gets those two days wrong.
	 */
	private static final String SHIFTED_TODAY = "2028-03-01";

	private static final long SHIFT_DAYS = 518L;

	/** The whole years the school year moves by: the nearest whole year to {@link #SHIFT_DAYS}. */
	private static final int SHIFT_YEARS = 1;

	/** A day before the frozen today, to show the rows move backwards just as exactly. */
	private static final String EARLIER_TODAY = "2026-01-15";

	private static final long EARLIER_SHIFT_DAYS = -258L;

	private static final int EARLIER_SHIFT_YEARS = -1;

	/**
	 * Every column the script's table map declares DATE. A column missing from here would be a
	 * column this test does not watch, so the count is asserted as well.
	 */
	private static final List<String> DATE_COLUMNS = List.of(
			"crm_sales_reps.hire_date",
			"crm_deals.created_date",
			"crm_deals.expected_close_date",
			"crm_deals.close_date",
			"support_tickets.opened_date",
			"support_tickets.resolved_date",
			"logistics_shipments.booked_date",
			"logistics_shipments.delivered_date",
			"shop_customers.signup_date",
			"shop_orders.order_date",
			"erp_invoices.issue_date",
			"erp_invoices.due_date",
			"erp_payments.paid_date");

	@Test
	void onDuckDbEveryDayMovesByTheSameWholeNumberOfDays(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection frozen = duckDb(temp.resolve("frozen.duckdb"));
				Connection shifted = duckDb(temp.resolve("shifted.duckdb"))) {

			seed(frozen, "DUCKDB", script, FROZEN_TODAY);
			seed(shifted, "DUCKDB", script, SHIFTED_TODAY);

			assertTheShift(frozen, shifted, SHIFTED_TODAY, SHIFT_DAYS, SHIFT_YEARS);
			assertTheLeapDayLandings(shifted);
		}
	}

	@Test
	void onSqliteEveryDayMovesByTheSameWholeNumberOfDays(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection frozen = sqlite(temp, "frozen");
				Connection shifted = sqlite(temp, "shifted")) {

			seed(frozen, "SQLITE", script, FROZEN_TODAY);
			seed(shifted, "SQLITE", script, SHIFTED_TODAY);

			assertTheShift(frozen, shifted, SHIFTED_TODAY, SHIFT_DAYS, SHIFT_YEARS);
			assertTheLeapDayLandings(shifted);
		}
	}

	@Test
	void aDayBeforeTheFrozenTodayMovesTheRowsBack(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection frozen = duckDb(temp.resolve("frozen.duckdb"));
				Connection shifted = duckDb(temp.resolve("earlier.duckdb"))) {

			seed(frozen, "DUCKDB", script, FROZEN_TODAY);
			seed(shifted, "DUCKDB", script, EARLIER_TODAY);

			assertTheShift(frozen, shifted, EARLIER_TODAY, EARLIER_SHIFT_DAYS, EARLIER_SHIFT_YEARS);
		}
	}

	/**
	 * The two days only a whole-day shift lands on: the last ticket on the leap day itself, and the
	 * rows that ended on the frozen today on the day after it.
	 */
	private static void assertTheLeapDayLandings(Connection shifted) throws Exception {

		assertEquals("2028-02-29", day(shifted, "SELECT MAX(opened_date) FROM cube_demo.support_tickets"),
				"The last ticket was opened the day before the frozen today, so it lands on the leap day");

		assertEquals("2028-03-01", day(shifted, "SELECT MAX(paid_date) FROM cube_demo.erp_payments"),
				"The last payment was made on the frozen today, so it lands on the day asked for");

		assertEquals("2028-03-01", day(shifted, "SELECT MAX(close_date) FROM cube_demo.crm_deals"),
				"So does the last deal closed");
	}

	/** Holds the shifted database against the frozen one, column by column. */
	private static void assertTheShift(Connection frozen, Connection shifted, String todayAsked,
			long shiftDays, int shiftYears) throws Exception {

		assertEquals(13, DATE_COLUMNS.size(), "Every DATE column the script declares is watched here");

		// ── what the load says about itself ──────────────────────────────────

		assertEquals(0L, number(frozen, "SELECT shift_days FROM cube_demo.demo_info").longValue(),
				"Loaded for the day the rows were generated for, nothing moves");
		assertEquals(1L, number(shifted, "SELECT COUNT(*) FROM cube_demo.demo_info").longValue(),
				"demo_info holds one row");
		assertEquals(FROZEN_TODAY, day(shifted, "SELECT data_today FROM cube_demo.demo_info"),
				"demo_info remembers the day the rows were generated for");
		assertEquals(todayAsked, day(shifted, "SELECT seeded_on FROM cube_demo.demo_info"),
				"demo_info remembers the day they were loaded for");
		assertEquals(shiftDays, number(shifted, "SELECT shift_days FROM cube_demo.demo_info").longValue(),
				"demo_info remembers the shift");
		assertEquals(day(shifted, "SELECT seeded_on FROM cube_demo.demo_info"),
				LocalDate.parse(FROZEN_TODAY).plusDays(shiftDays).toString(),
				"The invariant demo_info states: seeded_on = data_today + shift_days");

		// ── the dated columns ────────────────────────────────────────────────

		for (String column : DATE_COLUMNS) {

			String table = column.substring(0, column.indexOf('.'));
			String from = " FROM cube_demo." + table;

			assertShiftedDay(frozen, shifted, "SELECT MIN(" + column + ")" + from, shiftDays,
					"The first " + column);
			assertShiftedDay(frozen, shifted, "SELECT MAX(" + column + ")" + from, shiftDays,
					"The last " + column);

			assertEquals(number(frozen, "SELECT COUNT(*)" + from + " WHERE " + column + " IS NULL"),
					number(shifted, "SELECT COUNT(*)" + from + " WHERE " + column + " IS NULL"),
					"The rows with no " + column + " still have none");

			// Same number of distinct days: the shift moves them, it does not fold two into one.
			assertEquals(number(frozen, "SELECT COUNT(DISTINCT " + column + ")" + from),
					number(shifted, "SELECT COUNT(DISTINCT " + column + ")" + from),
					"The days in " + column + " are still as many different days");
		}

		// ── the days that are not in a DATE column ───────────────────────────
		// A year written inside a text column, and the school's year, which has no day at all.

		assertEquals(0L, number(shifted, "SELECT COUNT(*) FROM cube_demo.erp_invoices"
				+ " WHERE SUBSTR(invoice_no, 5, 4) <> SUBSTR(CAST(issue_date AS VARCHAR), 1, 4)").longValue(),
				"Every invoice number still reads the year of the day it was raised on");
		assertEquals(number(frozen, "SELECT COUNT(DISTINCT invoice_no) FROM cube_demo.erp_invoices"),
				number(shifted, "SELECT COUNT(DISTINCT invoice_no) FROM cube_demo.erp_invoices"),
				"And they are still all different");

		assertEquals(0L, number(shifted, "SELECT COUNT(*) FROM cube_demo.logistics_shipments"
				+ " WHERE SUBSTR(tracking_no, 5, 4) <> SUBSTR(CAST(booked_date AS VARCHAR), 1, 4)").longValue(),
				"Every tracking number still reads the year of the day it was booked on");
		assertEquals(number(frozen, "SELECT COUNT(DISTINCT tracking_no) FROM cube_demo.logistics_shipments"),
				number(shifted, "SELECT COUNT(DISTINCT tracking_no) FROM cube_demo.logistics_shipments"),
				"And they are still all different");

		assertEquals(number(frozen, "SELECT MIN(start_year) FROM cube_demo.school_students").intValue()
				+ shiftYears,
				number(shifted, "SELECT MIN(start_year) FROM cube_demo.school_students").intValue(),
				"The first intake year moved by whole years");
		assertEquals(number(frozen, "SELECT MAX(start_year) FROM cube_demo.school_students").intValue()
				+ shiftYears,
				number(shifted, "SELECT MAX(start_year) FROM cube_demo.school_students").intValue(),
				"So did the last one");

		String termYear = "CAST(SUBSTR(term, 1, 4) AS INTEGER)";
		assertEquals(number(frozen, "SELECT MIN(" + termYear + ") FROM cube_demo.school_enrollments").intValue()
				+ shiftYears,
				number(shifted, "SELECT MIN(" + termYear + ") FROM cube_demo.school_enrollments").intValue(),
				"The first term's year moved with them");
		assertEquals(number(frozen, "SELECT MAX(" + termYear + ") FROM cube_demo.school_enrollments").intValue()
				+ shiftYears,
				number(shifted, "SELECT MAX(" + termYear + ") FROM cube_demo.school_enrollments").intValue(),
				"So did the last one");

		String seasons = "SELECT SUBSTR(term, 6), COUNT(*) FROM cube_demo.school_enrollments"
				+ " GROUP BY SUBSTR(term, 6) ORDER BY SUBSTR(term, 6)";
		assertEquals(rows(frozen, seasons), rows(shifted, seasons),
				"Spring is still Spring, and as many enrolled in it");

		// ── and nothing else moved ───────────────────────────────────────────

		String money = "SELECT ROUND(SUM(total_amount), 2) FROM cube_demo.erp_invoices";
		assertEquals(rows(frozen, money), rows(shifted, money), "The invoiced money is untouched");

		String durations = "SELECT COUNT(*), SUM(transit_days), SUM(pallets)"
				+ " FROM cube_demo.logistics_shipments";
		assertEquals(rows(frozen, durations), rows(shifted, durations),
				"So are the shipments, their transit days and their pallets");

		// A duration is a gap between two days, so a shift that is not uniform shows up here.
		String gaps = "SELECT status, COUNT(*) FROM cube_demo.erp_invoices"
				+ " WHERE due_date > issue_date GROUP BY status ORDER BY status";
		assertEquals(rows(frozen, gaps), rows(shifted, gaps), "Every invoice is still due after it was raised");

		assertTrue(number(shifted, "SELECT COUNT(*) FROM cube_demo.crm_deals"
				+ " WHERE close_date IS NOT NULL AND close_date < created_date").longValue() == 0L,
				"No deal closed before it was created");
	}

	/** The same day, moved by the shift and by nothing else. */
	private static void assertShiftedDay(Connection frozen, Connection shifted, String sql, long shiftDays,
			String what) throws Exception {

		LocalDate before = LocalDate.parse(day(frozen, sql));
		LocalDate after = LocalDate.parse(day(shifted, sql));

		assertEquals(shiftDays, ChronoUnit.DAYS.between(before, after),
				what + " was " + before + " and is " + after);
	}

	// ── plumbing ─────────────────────────────────────────────────────────────

	private static void seed(Connection connection, String vendor, Path script, String today) throws Exception {
		SeedScriptRunner.run(connection, vendor, script, Map.of("today", today, "wipe", "true", "dataDir",
				script.getParent().resolve("cube-demo-data").toAbsolutePath().toString()));
	}

	private static Connection duckDb(Path file) throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
	}

	/** SQLite holds the demo data in a second file, attached as the schema the script writes to. */
	private static Connection sqlite(Path temp, String name) throws Exception {

		Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + temp.resolve(name + "-main.db").toAbsolutePath());
		try (Statement statement = connection.createStatement()) {
			statement.execute("ATTACH DATABASE '" + temp.resolve(name + "-cube-demo.db").toAbsolutePath()
					+ "' AS cube_demo");
		}
		return connection;
	}

	/** A day, as the ISO text it is on every database. */
	private static String day(Connection connection, String sql) throws Exception {
		return one(connection, sql).toString();
	}

	private static Object one(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
			assertTrue(rows.next(), "No row from: " + sql);
			return rows.getObject(1);
		}
	}

	private static Number number(Connection connection, String sql) throws Exception {
		return (Number) one(connection, sql);
	}

	/** A whole answer as text, so two databases can be held against each other in one assertion. */
	private static String rows(Connection connection, String sql) throws Exception {

		StringBuilder all = new StringBuilder();
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
			int columns = rows.getMetaData().getColumnCount();
			while (rows.next()) {
				for (int column = 1; column <= columns; column++) {
					all.append(rows.getObject(column)).append(column == columns ? "\n" : " | ");
				}
			}
		}
		return all.toString();
	}
}

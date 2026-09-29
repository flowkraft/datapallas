package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;
import java.util.zip.GZIPOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The Dashboard Demos seed runs once: the first run loads, a later run finds the data complete and
 * does nothing, so a user who clicks Run again does not silently lose what they changed in
 * {@code dash_demo}. A reload is asked for, with {@code wipe}.
 *
 * <p>
 * "Complete" is the marker row plus every table holding exactly the rows its {@code .psv.gz} file
 * holds, so a database that is there but wrong - no marker, a table dropped, a table emptied, a
 * load that stopped halfway - is loaded again rather than trusted. These tests put the database in
 * those states and run the script on it. The rules are the ones cube-demo-data.groovy follows, and
 * this test is modelled on the one that holds them.
 * </p>
 */
class DashboardsDemoRunOnceTest {

	private static final String FROZEN_TODAY = DashboardsDemoDataScriptTest.DASH_DEMO_TODAY;

	/** A second day, a whole 52-week step later, so a reload can be told from a run that did nothing. */
	private static final String ANOTHER_TODAY = "2027-10-05";

	/** The version of the rows, and of the tables they go into, that the script ships with. */
	private static final int DATA_VERSION = 1;

	/** The row every test changes to see whether a run reloaded or left the data alone. */
	private static final String SHIPPED_NAME = "AeroDesk Pro";

	private static final String TOUCHED_NAME = "Touched by the test";

	@Test
	void itLoadsOnceAndReloadsOnlyWhenAsked(@TempDir Path temp) throws Exception {

		Path script = DashboardsDemoDataScriptTest.shipScript(temp);

		try (Connection connection = DashboardsDemoDataScriptTest.duckDb(temp.resolve("demo.duckdb"))) {

			// The first run loads everything and leaves the marker behind.
			seed(connection, script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(FROZEN_TODAY, day(connection, "SELECT seeded_on FROM dash_demo.as_of").substring(0, 10),
					"The marker says which day the data was loaded for");
			assertEquals(DATA_VERSION, number(connection, "SELECT data_version FROM dash_demo.as_of").intValue(),
					"And which version of the rows it is");
			assertEquals(0L, number(connection, "SELECT shift_days FROM dash_demo.as_of").longValue(),
					"Loaded for the day the rows were made for, nothing moved");

			// A table of the user's own, in the same schema: the wipe below must not touch it.
			run(connection, "CREATE TABLE dash_demo.my_own_notes (note VARCHAR)");
			run(connection, "INSERT INTO dash_demo.my_own_notes VALUES ('mine')");

			// A second run leaves the database exactly as the user left it.
			touchARow(connection);
			seed(connection, script, ANOTHER_TODAY, false);

			assertEquals(TOUCHED_NAME, productOne(connection),
					"The second run did nothing, so what the user changed is still changed");
			assertEquals(FROZEN_TODAY, day(connection, "SELECT seeded_on FROM dash_demo.as_of").substring(0, 10),
					"And the marker is the one the first run wrote");

			// Asked to wipe, it loads again - and, with the date shift, for the new day.
			seed(connection, script, ANOTHER_TODAY, true);

			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "The reload brought the shipped row back");
			assertEquals(ANOTHER_TODAY, day(connection, "SELECT seeded_on FROM dash_demo.as_of").substring(0, 10),
					"And the marker is the new one");
			assertEquals(364L, number(connection, "SELECT shift_days FROM dash_demo.as_of").longValue(),
					"A year later the rows moved one whole 52-week step");
			assertEquals(1L, count(connection, "my_own_notes").longValue(),
					"The wipe drops the 23 tables of the demo and nothing else");
		}
	}

	@Test
	void aDatabaseThatIsThereButNotCompleteIsLoadedAgain(@TempDir Path temp) throws Exception {

		Path script = DashboardsDemoDataScriptTest.shipScript(temp);

		try (Connection connection = DashboardsDemoDataScriptTest.duckDb(temp.resolve("demo.duckdb"))) {

			seed(connection, script, FROZEN_TODAY, false);

			// No marker: the load may have stopped before writing it.
			touchARow(connection);
			run(connection, "DELETE FROM dash_demo.as_of");
			seed(connection, script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "No marker, so everything was loaded again");

			// A table dropped by hand.
			touchARow(connection);
			run(connection, "DROP TABLE dash_demo.departments");
			seed(connection, script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "A missing table, so everything was loaded again");

			// A table emptied by hand: the marker is there and says complete, the rows say otherwise.
			touchARow(connection);
			run(connection, "DELETE FROM dash_demo.warehouses");
			seed(connection, script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "A table short, so everything was loaded again");
		}
	}

	@Test
	void aRunThatFailsHalfwayLeavesNoMarkerAndTheNextRunFinishesTheJob(@TempDir Path temp) throws Exception {

		Path script = DashboardsDemoDataScriptTest.shipScript(temp);
		Path tickets = script.getParent().resolve("dashboards-demo-data").resolve("support_tickets.psv.gz");
		byte[] shipped = Files.readAllBytes(tickets);

		try (Connection connection = DashboardsDemoDataScriptTest.duckDb(temp.resolve("demo.duckdb"))) {

			// The last table's file is unreadable: its header is not the one the script expects.
			Files.write(tickets, gzip("not|the|header|this|script|reads\n"));

			Exception stopped = assertThrows(Exception.class,
					() -> seed(connection, script, FROZEN_TODAY, false));
			assertTrue(message(stopped).contains("support_tickets"),
					"The failure names the file it could not read: " + message(stopped));

			assertEquals(DashboardsDemoDataScriptTest.ROWS.get("geo_cities").longValue(),
					count(connection, "geo_cities").longValue(), "The tables before it were loaded");
			assertNull(count(connection, "as_of"), "But there is no marker, because it is written last");

			// The next run sees a database that is not complete and finishes the job.
			Files.write(tickets, shipped);
			seed(connection, script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
		}
	}

	@Test
	void onTheSqliteSampleItSaysItIsDuckDbOnlyAndCreatesNothing(@TempDir Path temp) throws Exception {

		Path script = DashboardsDemoDataScriptTest.shipScript(temp);

		try (Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + temp.resolve("main.db").toAbsolutePath())) {

			SeedScriptRunner.run(connection, "SQLITE", script,
					Map.of("today", FROZEN_TODAY, "wipe", "true", "dataDir",
							script.getParent().resolve("dashboards-demo-data").toAbsolutePath().toString()));

			assertNull(count(connection, "orders"), "Nothing was created on the SQLite sample");
			assertNull(count(connection, "as_of"), "Not even the marker");
		}
	}

	// ── what every run has to leave behind ───────────────────────────────────

	private static void assertTheDataIsAllThere(Connection connection) throws Exception {

		long total = 0;
		for (Map.Entry<String, Integer> table : DashboardsDemoDataScriptTest.ROWS.entrySet()) {
			Long rows = count(connection, table.getKey());
			assertEquals(table.getValue().longValue(), rows == null ? -1L : rows.longValue(),
					"Rows in dash_demo." + table.getKey());
			total += table.getValue();
		}
		assertEquals(DashboardsDemoDataScriptTest.TOTAL_ROWS, total, "The 23 tables together");
	}

	// ── plumbing ─────────────────────────────────────────────────────────────

	private static void seed(Connection connection, Path script, String today, boolean wipe) throws Exception {
		SeedScriptRunner.run(connection, "DUCKDB", script,
				Map.of("today", today, "wipe", String.valueOf(wipe), "dataDir",
						script.getParent().resolve("dashboards-demo-data").toAbsolutePath().toString()));
	}

	private static byte[] gzip(String text) throws Exception {
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (GZIPOutputStream gzip = new GZIPOutputStream(bytes)) {
			gzip.write(text.getBytes(StandardCharsets.UTF_8));
		}
		return bytes.toByteArray();
	}

	private static void touchARow(Connection connection) throws Exception {
		run(connection, "UPDATE dash_demo.products SET name = '" + TOUCHED_NAME + "' WHERE product_id = 5001");
		assertEquals(TOUCHED_NAME, productOne(connection), "The test changed the row it watches");
	}

	private static String productOne(Connection connection) throws Exception {
		return one(connection, "SELECT name FROM dash_demo.products WHERE product_id = 5001").toString();
	}

	private static void run(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement()) {
			statement.execute(sql);
		}
	}

	/** The rows in a table, or null when the table is not there at all. */
	private static Long count(Connection connection, String table) throws Exception {
		try {
			return ((Number) one(connection, "SELECT COUNT(*) FROM dash_demo." + table)).longValue();
		} catch (Exception notThere) {
			return null;
		}
	}

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

	/** The message of the failure, or of the cause a script wraps it in. */
	private static String message(Throwable failure) {
		StringBuilder all = new StringBuilder();
		for (Throwable step = failure; step != null; step = step.getCause()) {
			all.append(step.getMessage()).append(" | ");
		}
		return all.toString();
	}
}

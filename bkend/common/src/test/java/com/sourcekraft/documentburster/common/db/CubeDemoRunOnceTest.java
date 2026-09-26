package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The seed script runs once: the first run loads, a later run finds the data complete and does
 * nothing, so a user who clicks Run again does not silently lose what they changed in
 * {@code cube_demo}. A reload is asked for, with {@code wipe}.
 *
 * <p>
 * "Complete" is the marker row plus every table holding exactly the rows its {@code .psv} file
 * holds, so a database that is there but wrong - no marker, a table dropped, a table emptied, a
 * load that stopped halfway - is loaded again rather than trusted. These tests put the database in
 * each of those states and run the script on it.
 * </p>
 */
class CubeDemoRunOnceTest {

	private static final String FROZEN_TODAY = NorthwindFixture.CUBE_DEMO_TODAY;

	/** A second day, so a reload can be told from a run that did nothing by {@code seeded_on}. */
	private static final String ANOTHER_TODAY = "2027-01-31";

	/** The version of the rows the script ships with. */
	private static final int DATA_VERSION = 2;

	/** The row every test changes to see whether a run reloaded or left the data alone. */
	private static final String SHIPPED_NAME = "Orbit Accessories Pro";

	private static final String TOUCHED_NAME = "Touched by the test";

	@Test
	void onDuckDbItLoadsOnceAndReloadsOnlyWhenAsked(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);
		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			itLoadsOnceAndReloadsOnlyWhenAsked(connection, "DUCKDB", script);
		}
	}

	@Test
	void onSqliteItLoadsOnceAndReloadsOnlyWhenAsked(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);
		try (Connection connection = sqlite(temp)) {
			itLoadsOnceAndReloadsOnlyWhenAsked(connection, "SQLITE", script);
		}
	}

	private void itLoadsOnceAndReloadsOnlyWhenAsked(Connection connection, String vendor, Path script)
			throws Exception {

		// The first run loads everything and leaves the marker behind.
		seed(connection, vendor, script, FROZEN_TODAY, false);
		assertTheDataIsAllThere(connection);
		assertEquals(FROZEN_TODAY, day(connection, "SELECT seeded_on FROM cube_demo.demo_info"),
				"The marker says which day the data was loaded for");
		assertEquals(DATA_VERSION, number(connection, "SELECT data_version FROM cube_demo.demo_info").intValue(),
				"And which version of the rows it is");

		// A second run leaves the database exactly as the user left it.
		touchARow(connection);
		seed(connection, vendor, script, ANOTHER_TODAY, false);

		assertEquals(TOUCHED_NAME, productOne(connection),
				"The second run did nothing, so what the user changed is still changed");
		assertEquals(FROZEN_TODAY, day(connection, "SELECT seeded_on FROM cube_demo.demo_info"),
				"And the marker is the one the first run wrote");

		// Asked to wipe, it loads again - and, with the date shift, for the new day.
		seed(connection, vendor, script, ANOTHER_TODAY, true);

		assertTheDataIsAllThere(connection);
		assertEquals(SHIPPED_NAME, productOne(connection), "The reload brought the shipped row back");
		assertEquals(ANOTHER_TODAY, day(connection, "SELECT seeded_on FROM cube_demo.demo_info"),
				"And the marker is the new one");
	}

	@Test
	void aDatabaseThatIsThereButNotCompleteIsLoadedAgain(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {

			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);

			// No marker: the load may have stopped before writing it.
			touchARow(connection);
			run(connection, "DELETE FROM cube_demo.demo_info");
			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "No marker, so everything was loaded again");

			// A table dropped by hand.
			touchARow(connection);
			run(connection, "DROP TABLE cube_demo.school_courses");
			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "A missing table, so everything was loaded again");

			// A table emptied by hand: the marker is there and says complete, the rows say otherwise.
			touchARow(connection);
			run(connection, "DELETE FROM cube_demo.logistics_depots");
			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
			assertEquals(SHIPPED_NAME, productOne(connection), "A table short, so everything was loaded again");
		}
	}

	@Test
	void olderDataIsReportedButNotReloadedOnItsOwn(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {

			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);

			// The database holds an older version of the rows than the script ships.
			run(connection, "UPDATE cube_demo.demo_info SET data_version = " + (DATA_VERSION - 1));
			touchARow(connection);

			seed(connection, "DUCKDB", script, ANOTHER_TODAY, false);

			assertEquals(TOUCHED_NAME, productOne(connection),
					"Newer data exists, but reloading by itself would lose what the user changed");
			assertEquals(DATA_VERSION - 1,
					number(connection, "SELECT data_version FROM cube_demo.demo_info").intValue(),
					"The marker was not rewritten either - nothing was done");

			// It is a reload like any other when it is asked for.
			seed(connection, "DUCKDB", script, ANOTHER_TODAY, true);
			assertEquals(SHIPPED_NAME, productOne(connection), "Wipe loads the newer data");
			assertEquals(DATA_VERSION,
					number(connection, "SELECT data_version FROM cube_demo.demo_info").intValue(),
					"And the marker says which version it now holds");
		}
	}

	@Test
	void aRunThatFailsHalfwayLeavesNoMarkerAndTheNextRunFinishesTheJob(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);
		Path payments = script.getParent().resolve("cube-demo-data").resolve("erp_payments.psv");
		List<String> rows = Files.readAllLines(payments, StandardCharsets.UTF_8);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {

			// The last table's file is unreadable: its header is not the one the script expects.
			Files.write(payments, List.of("not|the|header|this|script|reads"), StandardCharsets.UTF_8);

			Exception stopped = assertThrows(Exception.class,
					() -> seed(connection, "DUCKDB", script, FROZEN_TODAY, false));
			assertTrue(message(stopped).contains("erp_payments"),
					"The failure names the file it could not read: " + message(stopped));

			assertEquals(CubeDemoDataScriptTest.ROWS.get("crm_accounts").longValue(), count(connection, "crm_accounts"),
					"The tables before it were loaded");
			assertNull(count(connection, "demo_info"),
					"But there is no marker, because it is written last");

			// The next run sees a database that is not complete and finishes the job.
			Files.write(payments, rows, StandardCharsets.UTF_8);
			seed(connection, "DUCKDB", script, FROZEN_TODAY, false);
			assertTheDataIsAllThere(connection);
		}
	}

	// ── what every run has to leave behind ───────────────────────────────────

	private static void assertTheDataIsAllThere(Connection connection) throws Exception {

		long total = 0;
		for (Map.Entry<String, Integer> table : CubeDemoDataScriptTest.ROWS.entrySet()) {
			Long rows = count(connection, table.getKey());
			assertEquals(table.getValue().longValue(), rows == null ? -1L : rows.longValue(),
					"Rows in cube_demo." + table.getKey());
			total += table.getValue();
		}
		assertEquals(CubeDemoDataScriptTest.TOTAL_ROWS, total, "The 19 tables together");
		assertEquals(1L, count(connection, "demo_info").longValue(), "The marker is there");
	}

	// ── plumbing ─────────────────────────────────────────────────────────────

	private static void seed(Connection connection, String vendor, Path script, String today, boolean wipe)
			throws Exception {
		SeedScriptRunner.run(connection, vendor, script,
				Map.of("today", today, "wipe", String.valueOf(wipe), "dataDir",
						script.getParent().resolve("cube-demo-data").toAbsolutePath().toString()));
	}

	private static void touchARow(Connection connection) throws Exception {
		run(connection, "UPDATE cube_demo.shop_products SET name = '" + TOUCHED_NAME + "' WHERE product_id = 1");
		assertEquals(TOUCHED_NAME, productOne(connection), "The test changed the row it watches");
	}

	private static String productOne(Connection connection) throws Exception {
		return one(connection, "SELECT name FROM cube_demo.shop_products WHERE product_id = 1").toString();
	}

	private static void run(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement()) {
			statement.execute(sql);
		}
	}

	/** The rows in a table, or null when the table is not there at all. */
	private static Long count(Connection connection, String table) throws Exception {
		try {
			return ((Number) one(connection, "SELECT COUNT(*) FROM cube_demo." + table)).longValue();
		} catch (Exception notThere) {
			return null;
		}
	}

	private static Connection duckDb(Path file) throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
	}

	private static Connection sqlite(Path temp) throws Exception {

		Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + temp.resolve("main.db").toAbsolutePath());
		try (Statement statement = connection.createStatement()) {
			statement.execute("ATTACH DATABASE '" + temp.resolve("cube-demo.db").toAbsolutePath()
					+ "' AS cube_demo");
		}
		return connection;
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

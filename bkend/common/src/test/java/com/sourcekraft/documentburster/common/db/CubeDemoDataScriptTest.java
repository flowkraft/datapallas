package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.northwind.DuckDBSchemaVerifier;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindManager;

/**
 * The Cube Stories demo data, loaded by the shipped seed script through the runner
 * {@code connection run-seed} uses.
 *
 * <p>
 * The rows are frozen: the script never invents anything, so the same 32,313 rows and the same
 * answers come out on every database and on every run. This test holds those answers next to
 * hand-written SQL, so a change to the script, to the rows or to the runner is caught here rather
 * than in a story that quietly shows a different number.
 * </p>
 */
class CubeDemoDataScriptTest {

	/** The 19 tables and their frozen row counts (32,313 rows in all). */
	private static final Map<String, Integer> ROWS = new LinkedHashMap<>();
	static {
		ROWS.put("crm_accounts", 60);
		ROWS.put("crm_sales_reps", 12);
		ROWS.put("crm_deals", 1200);
		ROWS.put("support_agents", 15);
		ROWS.put("support_tickets", 3000);
		ROWS.put("school_students", 300);
		ROWS.put("school_courses", 24);
		ROWS.put("school_enrollments", 2400);
		ROWS.put("logistics_carriers", 12);
		ROWS.put("logistics_depots", 30);
		ROWS.put("logistics_shipments", 4000);
		ROWS.put("shop_customers", 400);
		ROWS.put("shop_products", 80);
		ROWS.put("shop_orders", 3000);
		ROWS.put("shop_order_lines", 8500);
		ROWS.put("erp_customers", 80);
		ROWS.put("erp_invoices", 2000);
		ROWS.put("erp_invoice_lines", 5500);
		ROWS.put("erp_payments", 1700);
	}

	private static final int TOTAL_ROWS = 32313;

	/** Unpaid invoices, each with what is still owed on it after its payments. */
	private static final String UNPAID = "FROM (SELECT i.invoice_id, i.status,"
			+ " i.total_amount - COALESCE(p.paid, 0) AS balance_due"
			+ " FROM cube_demo.erp_invoices i"
			+ " JOIN cube_demo.erp_customers c ON c.customer_id = i.customer_id"
			+ " LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM cube_demo.erp_payments"
			+ " GROUP BY invoice_id) p ON p.invoice_id = i.invoice_id"
			+ " WHERE i.status <> 'Paid') unpaid";

	@Test
	void theScriptLoadsTheNineteenTablesAndTheirTruths(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);
		Path database = temp.resolve("demo.duckdb");

		try (Connection connection = duckDb(database)) {
			SeedScriptRunner.run(connection, "DUCKDB", script, null);
			assertRowCounts(connection);
			assertTruths(connection);
		}
	}

	@Test
	void runningItTwiceLeavesTheSameRows(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);
		Path database = temp.resolve("demo.duckdb");

		try (Connection connection = duckDb(database)) {
			SeedScriptRunner.run(connection, "DUCKDB", script, null);
			SeedScriptRunner.run(connection, "DUCKDB", script, null);
			assertRowCounts(connection);
			assertTruths(connection);
		}
	}

	@Test
	void withoutItsRowsItStopsAndSaysWhereItLooked(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);
		Path rows = script.getParent().resolve("cube-demo-data");
		Files.move(rows, temp.resolve("moved-away"));

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			Exception refused = assertThrows(Exception.class,
					() -> SeedScriptRunner.run(connection, "DUCKDB", script, null));
			assertTrue(message(refused).contains(rows.toAbsolutePath().toString()),
					"The message names the folder it looked in: " + message(refused));
		}
	}

	@Test
	void anUnknownVendorIsRefusedByName(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);
		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			Exception refused = assertThrows(Exception.class,
					() -> SeedScriptRunner.run(connection, "INFORMIX", script, null));
			assertTrue(message(refused).contains("INFORMIX"),
					"The message names the vendor it does not know: " + message(refused));
		}
	}

	@Test
	void onSqliteItNeedsADatabaseAttachedAsCubeDemo(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + temp.resolve("main.db").toAbsolutePath())) {

			Exception refused = assertThrows(Exception.class,
					() -> SeedScriptRunner.run(connection, "SQLITE", script, null));
			assertTrue(message(refused).contains("cube_demo"),
					"The message says what to attach: " + message(refused));

			// With the second file attached, SQLite holds the same rows as every other database.
			try (Statement statement = connection.createStatement()) {
				statement.execute("ATTACH DATABASE '" + temp.resolve("cube-demo.db").toAbsolutePath()
						+ "' AS cube_demo");
			}
			SeedScriptRunner.run(connection, "SQLITE", script, null);
			assertRowCounts(connection);

			// The days are written as ISO text there, not as the epoch milliseconds a bound
			// java.sql.Date would store, so they read back as the day they are in any time zone.
			assertEquals("2025-01-01", one(connection,
					"SELECT MIN(created_date) FROM cube_demo.crm_deals").toString(),
					"The first deal's day");
		}
	}

	@Test
	void theSampleDuckDbTheProductBuildsHoldsTheDemoDataAndStillVerifies() throws Exception {

		Path sample = NorthwindFixture.duckDbFile();

		assertEquals(List.of(), DuckDBSchemaVerifier.verify(sample.toAbsolutePath().toString(), false),
				"The Northwind warehouse still verifies with the cube_demo schema next to it");

		try (Connection connection = NorthwindFixture.readOnly()) {
			assertRowCounts(connection);
		}
	}

	@Test
	void aSampleBuiltWithNoScriptsFolderIsNorthwindAlone(@TempDir Path temp) throws Exception {

		// The same layout the packager and the product use, minus the scripts/ sibling.
		Path sqliteDir = temp.resolve("db").resolve("sample-northwind-sqlite");
		Path duckDbDir = temp.resolve("db").resolve("sample-northwind-duckdb");
		Files.createDirectories(sqliteDir);
		Files.createDirectories(duckDbDir);
		Files.copy(NorthwindFixture.sqliteFile(), sqliteDir.resolve("northwind.db"),
				StandardCopyOption.REPLACE_EXISTING);

		try (NorthwindManager manager = new NorthwindManager()) {
			manager.startDatabase(NorthwindManager.DatabaseVendor.DUCKDB, duckDbDir.toString());
		}

		try (Connection connection = duckDb(duckDbDir.resolve("northwind.duckdb"))) {
			assertEquals(0L, ((Number) one(connection,
					"SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'cube_demo'"))
							.longValue(),
					"No seed script next to the data folder means no cube_demo schema");
			assertTrue(((Number) one(connection, "SELECT COUNT(*) FROM main.fact_sales")).longValue() > 0,
					"The Northwind warehouse is built as before");
		}
	}

	// ── what every leg checks ────────────────────────────────────────────────

	private static void assertRowCounts(Connection connection) throws Exception {
		int total = 0;
		for (Map.Entry<String, Integer> table : ROWS.entrySet()) {
			assertEquals(table.getValue().longValue(),
					((Number) one(connection, "SELECT COUNT(*) FROM cube_demo." + table.getKey())).longValue(),
					"Rows in cube_demo." + table.getKey());
			total += table.getValue();
		}
		assertEquals(TOTAL_ROWS, total, "The 19 tables together");
	}

	private static void assertTruths(Connection connection) throws Exception {

		assertEquals(1200L, number(connection, "SELECT COUNT(*) FROM cube_demo.crm_deals").longValue(),
				"Deals");
		assertEquals(43402000.00,
				number(connection, "SELECT SUM(amount) FROM cube_demo.crm_deals").doubleValue(), 0.01,
				"Deal value");

		assertEquals(3000L, number(connection, "SELECT COUNT(*) FROM cube_demo.support_tickets").longValue(),
				"Tickets");
		assertEquals(351L, number(connection, "SELECT COUNT(*) FROM cube_demo.support_tickets"
				+ " WHERE status IN ('Open', 'In Progress', 'Waiting on Customer')").longValue(),
				"Open tickets");

		assertEquals(432L, number(connection, "SELECT COUNT(*) " + UNPAID).longValue(), "Unpaid invoices");
		assertEquals(4096696.09, number(connection, "SELECT SUM(balance_due) " + UNPAID).doubleValue(), 0.01,
				"Still due on them");

		assertEquals(749L, number(connection, "SELECT COUNT(*) FROM cube_demo.shop_orders o"
				+ " JOIN cube_demo.shop_customers c ON c.customer_id = o.customer_id"
				+ " WHERE c.country = 'Germany'").longValue(), "German orders");
		assertEquals(1141831.23, number(connection, "SELECT SUM(l.qty * l.unit_price)"
				+ " FROM cube_demo.shop_orders o"
				+ " JOIN cube_demo.shop_order_lines l ON l.order_id = o.order_id"
				+ " JOIN cube_demo.shop_customers c ON c.customer_id = o.customer_id"
				+ " WHERE c.country = 'Germany'").doubleValue(), 0.01, "German gross sales");

		assertEquals(4000L, number(connection, "SELECT COUNT(*) FROM cube_demo.logistics_shipments").longValue(),
				"Shipments");
		assertEquals(48L, number(connection, "SELECT COUNT(*) FROM cube_demo.logistics_shipments s"
				+ " LEFT JOIN cube_demo.logistics_carriers c ON c.carrier_id = s.carrier_id"
				+ " WHERE c.carrier_id IS NULL").longValue(), "Shipments with no known carrier");
	}

	// ── plumbing ─────────────────────────────────────────────────────────────

	/** Copies the shipped script and its rows into {@code temp}, as the packager's folder holds them. */
	private static Path shipScript(Path temp) throws Exception {

		Path shipped = Paths.get(System.getProperty("user.dir")).toAbsolutePath().getParent().getParent()
				.resolve("asbl").resolve("src").resolve("main").resolve("external-resources")
				.resolve("db-template").resolve("db").resolve("scripts");

		Path scripts = temp.resolve("scripts");
		Path rows = scripts.resolve("cube-demo-data");
		Files.createDirectories(rows);

		Path script = scripts.resolve("cube-demo-data.groovy");
		Files.copy(shipped.resolve("cube-demo-data.groovy"), script, StandardCopyOption.REPLACE_EXISTING);

		try (Stream<Path> files = Files.list(shipped.resolve("cube-demo-data"))) {
			for (Path file : files.collect(java.util.stream.Collectors.toList())) {
				Files.copy(file, rows.resolve(file.getFileName()), StandardCopyOption.REPLACE_EXISTING);
			}
		}
		return script;
	}

	private static Connection duckDb(Path file) throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
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

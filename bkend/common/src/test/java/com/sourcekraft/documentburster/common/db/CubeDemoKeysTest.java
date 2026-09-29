package com.sourcekraft.documentburster.common.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The keys and the indexes the Cube Stories seed declares, read back from the engine.
 *
 * <p>
 * The script ships one list of them; this test holds the same list by hand, written out of the
 * plan's table, and asks DuckDB and SQLite what they actually created. Both engines are here
 * because they are the two the product builds a sample database with, and because SQLite is the
 * one that qualifies an index with the attached schema instead of the table.
 * </p>
 *
 * <p>
 * The rows are not supposed to change with the keys, so each leg also counts them against the
 * frozen .psv files the script loads.
 * </p>
 */
class CubeDemoKeysTest {

	/** Every table's primary key: its id, or the pair a line table is keyed by. */
	static final Map<String, String> KEYS = new LinkedHashMap<>();
	static {
		KEYS.put("crm_accounts", "account_id");
		KEYS.put("crm_sales_reps", "rep_id");
		KEYS.put("crm_deals", "deal_id");
		KEYS.put("support_agents", "agent_id");
		KEYS.put("support_tickets", "ticket_id");
		KEYS.put("school_students", "student_id");
		KEYS.put("school_courses", "course_id");
		KEYS.put("school_enrollments", "enrollment_id");
		KEYS.put("logistics_carriers", "carrier_id");
		KEYS.put("logistics_depots", "depot_id");
		KEYS.put("logistics_shipments", "shipment_id");
		KEYS.put("shop_customers", "customer_id");
		KEYS.put("shop_products", "product_id");
		KEYS.put("shop_orders", "order_id");
		KEYS.put("shop_order_lines", "order_id,line_no");
		KEYS.put("erp_customers", "customer_id");
		KEYS.put("erp_invoices", "invoice_id");
		KEYS.put("erp_invoice_lines", "invoice_id,line_no");
		KEYS.put("erp_payments", "payment_id");
	}

	/** Every join column that no key leads with, and the name its index carries. */
	static final Map<String, String> INDEXES = new LinkedHashMap<>();
	static {
		INDEXES.put("crm_deals.account_id", "ix_crm_deals_account_id");
		INDEXES.put("crm_deals.rep_id", "ix_crm_deals_rep_id");
		INDEXES.put("support_tickets.account_id", "ix_support_tickets_account_id");
		INDEXES.put("support_tickets.agent_id", "ix_support_tickets_agent_id");
		INDEXES.put("school_enrollments.student_id", "ix_school_enrollments_student");
		INDEXES.put("school_enrollments.course_id", "ix_school_enrollments_course");
		INDEXES.put("logistics_shipments.carrier_id", "ix_logistics_shipments_carrier");
		INDEXES.put("logistics_shipments.origin_depot_id", "ix_shipments_origin_depot");
		INDEXES.put("shop_orders.customer_id", "ix_shop_orders_customer_id");
		INDEXES.put("shop_order_lines.product_id", "ix_shop_order_lines_product_id");
		INDEXES.put("erp_invoices.customer_id", "ix_erp_invoices_customer_id");
		INDEXES.put("erp_payments.invoice_id", "ix_erp_payments_invoice_id");
	}

	// ── DuckDB ───────────────────────────────────────────────────────────────

	@Test
	void onDuckDbEveryTableCarriesItsKeyAndItsIndexes(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			seed(connection, "DUCKDB", script);

			Map<String, String> keys = new LinkedHashMap<>();
			for (List<String> row : rows(connection, "SELECT table_name,"
					+ " array_to_string(constraint_column_names, ',') FROM duckdb_constraints()"
					+ " WHERE schema_name = 'cube_demo' AND constraint_type = 'PRIMARY KEY'")) {
				keys.put(row.get(0), row.get(1));
			}
			assertEquals(KEYS, keys, "The primary keys DuckDB holds on cube_demo");

			assertEquals(0L, number(connection, "SELECT COUNT(*) FROM duckdb_constraints()"
					+ " WHERE schema_name = 'cube_demo' AND constraint_type = 'FOREIGN KEY'").longValue(),
					"No foreign key is declared: the references are checked by queries instead");

			Set<String> made = new TreeSet<>();
			for (List<String> row : rows(connection,
					"SELECT index_name FROM duckdb_indexes() WHERE schema_name = 'cube_demo'")) {
				made.add(row.get(0));
			}
			assertEquals(List.of(), missing(made), "Indexes DuckDB does not have");

			for (Map.Entry<String, String> table : KEYS.entrySet()) {
				Set<String> notNull = new LinkedHashSet<>();
				for (List<String> row : rows(connection, "SELECT column_name FROM duckdb_columns()"
						+ " WHERE schema_name = 'cube_demo' AND table_name = '" + table.getKey() + "'"
						+ " AND is_nullable = false")) {
					notNull.add(row.get(0));
				}
				assertTrue(notNull.containsAll(List.of(table.getValue().split(","))),
						"The key columns of " + table.getKey() + " are NOT NULL, which Db2 asks for: "
								+ notNull);
			}

			assertTheRowsAreTheFrozenOnes(connection, script);
		}
	}

	// ── SQLite ───────────────────────────────────────────────────────────────

	@Test
	void onSqliteEveryTableCarriesItsKeyAndItsIndexes(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection connection = sqlite(temp)) {
			seed(connection, "SQLITE", script);

			Set<String> made = new TreeSet<>();
			for (String table : KEYS.keySet()) {

				List<String> key = new ArrayList<>();
				Set<String> notNull = new LinkedHashSet<>();
				for (List<String> column : rows(connection, "PRAGMA cube_demo.table_info('" + table + "')")) {
					if (!"0".equals(column.get(5))) {
						key.add(column.get(1));
					}
					if (!"0".equals(column.get(3))) {
						notNull.add(column.get(1));
					}
				}
				assertEquals(KEYS.get(table), String.join(",", key), "The primary key of " + table);
				assertTrue(notNull.containsAll(key), "The key columns of " + table + " are NOT NULL: " + notNull);

				for (List<String> index : rows(connection, "PRAGMA cube_demo.index_list('" + table + "')")) {
					made.add(index.get(1));
				}
			}
			assertEquals(List.of(), missing(made), "Indexes SQLite does not have");

			assertTheRowsAreTheFrozenOnes(connection, script);
		}
	}

	// ── the other half ───────────────────────────────────────────────────────

	@Test
	void anIdThatIsAlreadyTakenIsRefusedOnBothEngines(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			seed(connection, "DUCKDB", script);
			assertThrows(Exception.class, () -> run(connection,
					"INSERT INTO cube_demo.crm_accounts (account_id, name) VALUES (1, 'Twice')"),
					"DuckDB refuses a second account with the id of the first");
			assertThrows(Exception.class, () -> run(connection,
					"INSERT INTO cube_demo.shop_order_lines (order_id, line_no, qty)"
							+ " SELECT order_id, line_no, 1 FROM cube_demo.shop_order_lines LIMIT 1"),
					"And a second line with a line number that order already has");
		}

		try (Connection connection = sqlite(temp)) {
			seed(connection, "SQLITE", script);
			assertThrows(Exception.class, () -> run(connection,
					"INSERT INTO cube_demo.crm_accounts (account_id, name) VALUES (1, 'Twice')"),
					"SQLite refuses it too");
			assertThrows(Exception.class, () -> run(connection,
					"INSERT INTO cube_demo.shop_order_lines (order_id, line_no, qty)"
							+ " SELECT order_id, line_no, 1 FROM cube_demo.shop_order_lines LIMIT 1"),
					"And the pair as well");
		}
	}

	/** An index dropped from the script's list: the test says which one is gone, by name. */
	@Test
	void anIndexLeftOutOfTheScriptIsNamed(@TempDir Path temp) throws Exception {

		Path script = CubeDemoDataScriptTest.shipScript(temp);
		String text = Files.readString(script, StandardCharsets.UTF_8);
		String line = "    shop_orders        : 'customer_id',\n";
		assertTrue(text.contains(line), "The script lists the index this test takes away");
		Files.writeString(script, text.replace(line, ""), StandardCharsets.UTF_8);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			seed(connection, "DUCKDB", script);

			Set<String> made = new TreeSet<>();
			for (List<String> row : rows(connection,
					"SELECT index_name FROM duckdb_indexes() WHERE schema_name = 'cube_demo'")) {
				made.add(row.get(0));
			}
			assertEquals(List.of("ix_shop_orders_customer_id"), missing(made),
					"The one index the script no longer creates is the one named");
		}
	}

	// ── what every leg checks ────────────────────────────────────────────────

	/** The expected index names that the engine does not have, in the order they are listed. */
	private static List<String> missing(Set<String> made) {
		List<String> gone = new ArrayList<>();
		for (Map.Entry<String, String> index : INDEXES.entrySet()) {
			if (!made.contains(index.getValue())) {
				gone.add(index.getValue());
			}
		}
		return gone;
	}

	/** The keys change the tables, not the rows: every table still holds its file, line for line. */
	private static void assertTheRowsAreTheFrozenOnes(Connection connection, Path script) throws Exception {
		Path data = script.getParent().resolve("cube-demo-data");
		for (String table : KEYS.keySet()) {
			long inTheFile = Files.readAllLines(data.resolve(table + ".psv"), StandardCharsets.UTF_8).stream()
					.filter(line -> !line.trim().isEmpty()).count() - 1;
			assertEquals(inTheFile,
					number(connection, "SELECT COUNT(*) FROM cube_demo." + table).longValue(),
					"Rows in cube_demo." + table);
		}
	}

	// ── plumbing ─────────────────────────────────────────────────────────────

	private static void seed(Connection connection, String vendor, Path script) throws Exception {
		SeedScriptRunner.run(connection, vendor, script,
				NorthwindFixture.cubeDemoSeedParams(script.getParent().resolve("cube-demo-data")));
	}

	private static Connection duckDb(Path file) throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
	}

	private static Connection sqlite(Path temp) throws Exception {
		Connection connection = DriverManager
				.getConnection("jdbc:sqlite:" + temp.resolve("main.db").toAbsolutePath());
		run(connection, "ATTACH DATABASE '" + temp.resolve("cube-demo.db").toAbsolutePath()
				+ "' AS cube_demo");
		return connection;
	}

	private static void run(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement()) {
			statement.execute(sql);
		}
	}

	/** Every row of a query, as strings, so a PRAGMA and a catalog table read the same way. */
	private static List<List<String>> rows(Connection connection, String sql) throws Exception {
		List<List<String>> all = new ArrayList<>();
		try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
			int columns = result.getMetaData().getColumnCount();
			while (result.next()) {
				List<String> row = new ArrayList<>();
				for (int column = 1; column <= columns; column++) {
					Object value = result.getObject(column);
					row.add(value == null ? null : value.toString());
				}
				all.add(row);
			}
		}
		return all;
	}

	private static Number number(Connection connection, String sql) throws Exception {
		return Long.valueOf(rows(connection, sql).get(0).get(0));
	}
}

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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The Dashboard Demos data, loaded by the shipped seed script through the runner
 * {@code connection run-seed} uses.
 *
 * <p>
 * The rows are frozen: the script never invents anything, so the same 219,491 rows and the same
 * answers come out on every run. The answers held here are the ones truths.out prints, and they
 * are what the demos quote, so a change to the script, to the rows or to the runner is caught
 * here rather than in a dashboard that quietly shows a different number.
 * </p>
 */
class DashboardsDemoDataScriptTest {

	/**
	 * The day the rows were generated for. Every test pins it: the script moves the rows to the
	 * caller's today, and pinned to this day the shift is zero and the frozen truths are true.
	 */
	static final String DASH_DEMO_TODAY = "2026-09-30";

	/** The data's own today, in the form the truths' SQL uses it. */
	private static final String AS_OF = "DATE '" + DASH_DEMO_TODAY + "'";

	/** Shared with the other tests of this data: the 23 tables and the rows each one holds. */
	static final Map<String, Integer> ROWS = new LinkedHashMap<>();
	static {
		ROWS.put("geo_cities", 60);
		ROWS.put("customers", 5000);
		ROWS.put("products", 200);
		ROWS.put("orders", 24000);
		ROWS.put("order_lines", 59996);
		ROWS.put("web_sessions", 60000);
		ROWS.put("crm_opportunities", 2400);
		ROWS.put("sales_targets", 132);
		ROWS.put("kpi_targets", 10);
		ROWS.put("rep_quotas", 240);
		ROWS.put("invoices", 8933);
		ROWS.put("invoice_payments", 8377);
		ROWS.put("subscriptions", 3200);
		ROWS.put("subscription_changes", 5238);
		ROWS.put("departments", 8);
		ROWS.put("employees", 260);
		ROWS.put("payroll_lines", 6399);
		ROWS.put("warehouses", 5);
		ROWS.put("stock_levels", 1000);
		ROWS.put("stock_movements", 20000);
		ROWS.put("support_agents", 32);
		ROWS.put("support_tickets", 14000);
		ROWS.put("as_of", 1);
	}

	static final int TOTAL_ROWS = 219491;

	/** Every table's primary key: its id, or the columns it is really keyed by (section 6.6). */
	static final Map<String, String> KEYS = new LinkedHashMap<>();
	static {
		KEYS.put("geo_cities", "city_id");
		KEYS.put("customers", "customer_id");
		KEYS.put("products", "product_id");
		KEYS.put("orders", "order_id");
		KEYS.put("order_lines", "order_id,line_no");
		KEYS.put("web_sessions", "session_id");
		KEYS.put("crm_opportunities", "opportunity_id");
		KEYS.put("sales_targets", "month,region");
		KEYS.put("kpi_targets", "area,kpi");
		KEYS.put("rep_quotas", "employee_id,quarter_start");
		KEYS.put("invoices", "invoice_id");
		KEYS.put("invoice_payments", "payment_id");
		KEYS.put("subscriptions", "subscription_id");
		KEYS.put("subscription_changes", "change_id");
		KEYS.put("departments", "department_id");
		KEYS.put("employees", "employee_id");
		KEYS.put("payroll_lines", "period_month,employee_id");
		KEYS.put("warehouses", "warehouse_id");
		KEYS.put("stock_levels", "product_id,warehouse_id");
		KEYS.put("stock_movements", "movement_id");
		KEYS.put("support_agents", "agent_id");
		KEYS.put("support_tickets", "ticket_id");
	}

	/**
	 * Every column naming another table's row that no key leads with: the reference, and the index
	 * it carries. The seed makes no FOREIGN KEY, so this is also the list the orphan queries walk.
	 */
	static final Map<String, String> REFERENCES = new LinkedHashMap<>();
	static {
		REFERENCES.put("customers.city_id", "geo_cities.city_id");
		REFERENCES.put("customers.account_manager_id", "employees.employee_id");
		REFERENCES.put("orders.customer_id", "customers.customer_id");
		REFERENCES.put("orders.city_id", "geo_cities.city_id");
		REFERENCES.put("orders.warehouse_id", "warehouses.warehouse_id");
		REFERENCES.put("order_lines.order_id", "orders.order_id");
		REFERENCES.put("order_lines.product_id", "products.product_id");
		REFERENCES.put("web_sessions.customer_id", "customers.customer_id");
		REFERENCES.put("web_sessions.order_id", "orders.order_id");
		REFERENCES.put("crm_opportunities.customer_id", "customers.customer_id");
		REFERENCES.put("crm_opportunities.owner_employee_id", "employees.employee_id");
		REFERENCES.put("rep_quotas.employee_id", "employees.employee_id");
		REFERENCES.put("invoices.customer_id", "customers.customer_id");
		REFERENCES.put("invoices.order_id", "orders.order_id");
		REFERENCES.put("invoices.subscription_id", "subscriptions.subscription_id");
		REFERENCES.put("invoice_payments.invoice_id", "invoices.invoice_id");
		REFERENCES.put("subscriptions.customer_id", "customers.customer_id");
		REFERENCES.put("subscription_changes.subscription_id", "subscriptions.subscription_id");
		REFERENCES.put("employees.department_id", "departments.department_id");
		REFERENCES.put("employees.city_id", "geo_cities.city_id");
		REFERENCES.put("employees.manager_id", "employees.employee_id");
		REFERENCES.put("payroll_lines.employee_id", "employees.employee_id");
		REFERENCES.put("warehouses.city_id", "geo_cities.city_id");
		REFERENCES.put("stock_levels.product_id", "products.product_id");
		REFERENCES.put("stock_levels.warehouse_id", "warehouses.warehouse_id");
		REFERENCES.put("stock_movements.product_id", "products.product_id");
		REFERENCES.put("stock_movements.warehouse_id", "warehouses.warehouse_id");
		REFERENCES.put("support_agents.employee_id", "employees.employee_id");
		REFERENCES.put("support_tickets.customer_id", "customers.customer_id");
		REFERENCES.put("support_tickets.order_id", "orders.order_id");
		REFERENCES.put("support_tickets.agent_id", "support_agents.agent_id");
	}

	/** The 28 indexes: every reference above that does not lead its table's key. */
	static Set<String> indexNames() {
		Set<String> names = new TreeSet<>();
		for (String reference : REFERENCES.keySet()) {
			String table = reference.substring(0, reference.indexOf('.'));
			String column = reference.substring(reference.indexOf('.') + 1);
			if (!KEYS.get(table).split(",")[0].equals(column)) {
				names.add("ix_" + table + "_" + column);
			}
		}
		return names;
	}

	// ── what the script loads ────────────────────────────────────────────────

	@Test
	void theScriptLoadsTheTwentyThreeTablesAndTheirTruths(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			SeedScriptRunner.run(connection, "DUCKDB", script, seedParams(script));

			assertRowCounts(connection);
			assertNoOrphans(connection);
			assertTheRulesTheDataKeeps(connection);
			assertTheHeadlineTruths(connection);
		}
	}

	@Test
	void theKeysAndTheIndexesAreTheOnesSectionSixSixLists(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			SeedScriptRunner.run(connection, "DUCKDB", script, seedParams(script));

			Map<String, String> keys = new LinkedHashMap<>();
			for (List<String> row : rows(connection, "SELECT table_name,"
					+ " array_to_string(constraint_column_names, ',') FROM duckdb_constraints()"
					+ " WHERE schema_name = 'dash_demo' AND constraint_type = 'PRIMARY KEY'")) {
				keys.put(row.get(0), row.get(1));
			}
			assertEquals(KEYS, keys, "The primary keys DuckDB holds on dash_demo");

			assertEquals(0L, number(connection, "SELECT COUNT(*) FROM duckdb_constraints()"
					+ " WHERE schema_name = 'dash_demo' AND constraint_type = 'FOREIGN KEY'").longValue(),
					"No foreign key is declared: the references are checked by queries instead");

			Set<String> made = new TreeSet<>();
			for (List<String> row : rows(connection,
					"SELECT index_name FROM duckdb_indexes() WHERE schema_name = 'dash_demo'")) {
				made.add(row.get(0));
			}
			assertEquals(indexNames(), made, "The indexes DuckDB holds on dash_demo");

			for (Map.Entry<String, String> table : KEYS.entrySet()) {
				Set<String> notNull = new LinkedHashSet<>();
				for (List<String> row : rows(connection, "SELECT column_name FROM duckdb_columns()"
						+ " WHERE schema_name = 'dash_demo' AND table_name = '" + table.getKey() + "'"
						+ " AND is_nullable = false")) {
					notNull.add(row.get(0));
				}
				assertTrue(notNull.containsAll(List.of(table.getValue().split(","))),
						"The key columns of " + table.getKey() + " are NOT NULL: " + notNull);
			}
		}
	}

	@Test
	void aSecondRowWithAnExistingIdIsRefused(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			SeedScriptRunner.run(connection, "DUCKDB", script, seedParams(script));

			Exception onTheId = assertThrows(Exception.class,
					() -> run(connection, "INSERT INTO dash_demo.orders (order_id, customer_id) VALUES (100001, 1051)"),
					"A second order with id 100001");
			assertTrue(message(onTheId).toLowerCase(Locale.ROOT).contains("primary key")
					|| message(onTheId).toLowerCase(Locale.ROOT).contains("duplicate"),
					"The engine says which constraint it is: " + message(onTheId));

			Exception onThePair = assertThrows(Exception.class, () -> run(connection,
					"INSERT INTO dash_demo.order_lines (order_id, line_no, product_id) VALUES (100001, 1, 5185)"),
					"A second line 1 of order 100001");
			assertTrue(message(onThePair).toLowerCase(Locale.ROOT).contains("primary key")
					|| message(onThePair).toLowerCase(Locale.ROOT).contains("duplicate"),
					"The engine says which constraint it is: " + message(onThePair));
		}
	}

	@Test
	void anOrderLineNamingNoOrderIsFoundByTheOrphanCheck(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {
			SeedScriptRunner.run(connection, "DUCKDB", script, seedParams(script));

			// The schema has no FOREIGN KEY, so nothing stops this row going in: the orphan query
			// is what finds it, and this is the check the whole list above is walked with.
			run(connection, "INSERT INTO dash_demo.order_lines (order_id, line_no, product_id, qty)"
					+ " VALUES (999999, 1, 1, 1)");

			assertEquals(1L, orphans(connection, "order_lines.order_id").longValue(),
					"order_lines.order_id -> orders");
			assertEquals(999999L, number(connection, "SELECT order_id FROM dash_demo.order_lines c"
					+ " WHERE NOT EXISTS (SELECT 1 FROM dash_demo.orders p WHERE p.order_id = c.order_id)")
					.longValue(), "The orphan the check names");
		}
	}

	// ── the date shift (Decision 4) ──────────────────────────────────────────

	@Test
	void aYearLaterEveryDayMovesAWholeNumberOfWeeks(@TempDir Path temp) throws Exception {

		Path script = shipScript(temp);

		try (Connection connection = duckDb(temp.resolve("demo.duckdb"))) {

			Map<String, String> params = new LinkedHashMap<>(seedParams(script));
			params.put("today", "2027-10-05");
			SeedScriptRunner.run(connection, "DUCKDB", script, params);

			assertEquals("364", String.valueOf(number(connection,
					"SELECT shift_days FROM dash_demo.as_of")), "A whole 52-week step, not 370 days");
			assertEquals("2027-09-29", String.valueOf(one(connection,
					"SELECT as_of FROM dash_demo.as_of")), "The data's own today");

			// A Monday stays a Monday, and the peak hour stays where it was.
			assertEquals("Monday 20", one(connection, "SELECT dayname(order_ts) || ' ' ||"
					+ " hour(order_ts) FROM dash_demo.orders WHERE channel IN ('web','mobile_app')"
					+ " GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1"), "The web and app peak");
			assertEquals(11L, number(connection, "SELECT month(order_ts) FROM dash_demo.orders"
					+ " WHERE status <> 'cancelled' AND year(order_ts) = 2026 GROUP BY 1"
					+ " ORDER BY SUM(total_amount) DESC LIMIT 1").longValue(),
					"November is still the peak month");

			// The period columns are months and quarters, so they still start on the 1st.
			for (String period : List.of("sales_targets.month", "rep_quotas.quarter_start",
					"payroll_lines.period_month")) {
				String table = period.substring(0, period.indexOf('.'));
				String column = period.substring(period.indexOf('.') + 1);
				assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo." + table
						+ " WHERE day(" + column + ") <> 1").longValue(),
						period + " still starts on the first of its month");
			}

			assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.orders o,"
					+ " dash_demo.as_of a WHERE o.order_ts > a.as_of + INTERVAL 1 DAY").longValue(),
					"No order lies after the data's own today");
			assertEquals(TOTAL_ROWS - 1, countAllTheRows(connection), "The rows are the same rows");
		}
	}

	// ── the answers ──────────────────────────────────────────────────────────

	static void assertRowCounts(Connection connection) throws Exception {
		for (Map.Entry<String, Integer> table : ROWS.entrySet()) {
			assertEquals(table.getValue().longValue(),
					number(connection, "SELECT COUNT(*) FROM dash_demo." + table.getKey()).longValue(),
					"Rows in dash_demo." + table.getKey());
		}
		assertEquals(TOTAL_ROWS - 1, countAllTheRows(connection), "Rows in the 22 tables");
		assertEquals("2026-09-30", String.valueOf(one(connection, "SELECT as_of FROM dash_demo.as_of")),
				"The data's own today, with the caller's today pinned to it");
		assertEquals(8L, number(connection, "SELECT web_session_sample_rate FROM dash_demo.as_of").longValue(),
				"One web session in eight was kept");
	}

	/** One orphan query per reference: the schema has no FOREIGN KEY, so this is the check. */
	static void assertNoOrphans(Connection connection) throws Exception {
		for (String reference : REFERENCES.keySet()) {
			assertEquals(0L, orphans(connection, reference).longValue(),
					reference + " -> " + REFERENCES.get(reference));
		}
	}

	private static Number orphans(Connection connection, String reference) throws Exception {
		String table = reference.substring(0, reference.indexOf('.'));
		String column = reference.substring(reference.indexOf('.') + 1);
		String parent = REFERENCES.get(reference).substring(0, REFERENCES.get(reference).indexOf('.'));
		String key = REFERENCES.get(reference).substring(REFERENCES.get(reference).indexOf('.') + 1);
		return number(connection, "SELECT COUNT(*) FROM dash_demo." + table + " c WHERE c." + column
				+ " IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dash_demo." + parent + " p WHERE p."
				+ key + " = c." + column + ")");
	}

	/** Section 6.4's coherence rules, each one a count that has to be zero. */
	static void assertTheRulesTheDataKeeps(Connection connection) throws Exception {

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.orders o"
				+ " JOIN dash_demo.customers c USING (customer_id) WHERE o.order_ts < c.signup_date")
				.longValue(), "Orders placed before the customer signed up");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.invoices i"
				+ " JOIN dash_demo.customers c USING (customer_id) WHERE c.customer_type <> 'business'")
				.longValue(), "Invoices for a consumer customer");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.orders o"
				+ " JOIN dash_demo.customers c USING (customer_id) WHERE c.customer_type = 'business'"
				+ " AND o.status <> 'cancelled' AND NOT EXISTS (SELECT 1 FROM dash_demo.invoices i"
				+ " WHERE i.order_id = o.order_id)").longValue(), "Business orders without an invoice");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.invoices"
				+ " WHERE source = 'care_plan' AND subscription_id IS NULL").longValue(),
				"care_plan invoices without a subscription");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.web_sessions"
				+ " WHERE order_id IS NOT NULL AND NOT purchased").longValue(),
				"Sessions with an order_id that did not purchase");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.support_agents a"
				+ " JOIN dash_demo.employees e USING (employee_id) WHERE e.department_id <> 6"
				+ " OR e.hire_date <> a.hire_date").longValue(),
				"Support agents who are not Customer Support employees");

		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.payroll_lines p"
				+ " JOIN dash_demo.employees e USING (employee_id)"
				+ " WHERE p.period_month < date_trunc('month', e.hire_date)"
				+ " OR (e.termination_date IS NOT NULL"
				+ " AND p.period_month > date_trunc('month', e.termination_date))").longValue(),
				"Payroll lines outside the months worked");

		// Stock reconciliation: what a warehouse holds is what its movements come to.
		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.stock_levels l"
				+ " LEFT JOIN (SELECT product_id, warehouse_id, SUM(qty) AS moved"
				+ " FROM dash_demo.stock_movements GROUP BY 1, 2) m USING (product_id, warehouse_id)"
				+ " WHERE COALESCE(m.moved, 0) <> l.qty_on_hand").longValue(),
				"Stock levels that do not match their movements");

		// Nothing has happened after the data's own today.
		for (String late : List.of("orders WHERE order_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"orders WHERE delivered_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"orders WHERE shipped_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"invoice_payments WHERE paid_date > " + AS_OF,
				"invoices WHERE last_paid_date > " + AS_OF,
				"support_tickets WHERE opened_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"support_tickets WHERE resolved_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"subscriptions WHERE cancel_date > " + AS_OF,
				"stock_movements WHERE movement_ts > " + AS_OF + " + INTERVAL 1 DAY",
				"crm_opportunities WHERE closed_date > " + AS_OF)) {
			assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo." + late).longValue(),
					"Nothing after the data's own today: " + late);
		}

		// The two futures that are allowed, because an open deal and an unpaid invoice both look
		// forward: they are counted, not forbidden.
		assertEquals(275L, number(connection, "SELECT COUNT(*) FROM dash_demo.crm_opportunities"
				+ " WHERE expected_close_date > " + AS_OF).longValue(), "Open deals still to close");
		assertEquals(511L, number(connection, "SELECT COUNT(*) FROM dash_demo.invoices"
				+ " WHERE due_date > " + AS_OF).longValue(), "Open invoices not yet due");

		// The edge cases a dashboard has to survive.
		assertEquals(31377L, number(connection, "SELECT COUNT(*) FROM dash_demo.web_sessions"
				+ " WHERE customer_id IS NULL").longValue(), "Anonymous sessions");
		assertEquals(0L, number(connection, "SELECT COUNT(*) FROM dash_demo.orders"
				+ " WHERE status = 'cancelled' AND shipped_ts IS NOT NULL").longValue(),
				"Cancelled orders that shipped anyway");
		assertEquals(1L, number(connection, "SELECT COUNT(*) FROM dash_demo.products p"
				+ " WHERE NOT EXISTS (SELECT 1 FROM dash_demo.order_lines l"
				+ " WHERE l.product_id = p.product_id)").longValue(), "Products never sold");
		assertEquals(75L, number(connection, "SELECT COUNT(*) FROM dash_demo.customers"
				+ " WHERE name LIKE '%''%'").longValue(), "Names with an apostrophe");
		assertEquals(1L, number(connection, "SELECT COUNT(*) FROM dash_demo.employees"
				+ " WHERE termination_date IS NULL AND termination_reason IS NOT NULL").longValue(),
				"The employee who re-joined");
	}

	/**
	 * The headline numbers of truths.out: the ones the demos quote. A cent out of place here is a
	 * dashboard that says something else.
	 */
	static void assertTheHeadlineTruths(Connection connection) throws Exception {

		String sold = "status <> 'cancelled'";

		// 1-3: the three years of revenue, and the growth between the first two.
		assertEquals("21096647.39", money(connection, "SELECT SUM(total_amount) FROM dash_demo.orders"
				+ " WHERE " + sold + " AND year(order_ts) = 2024"), "2024 revenue");
		assertEquals("25260842.79", money(connection, "SELECT SUM(total_amount) FROM dash_demo.orders"
				+ " WHERE " + sold + " AND year(order_ts) = 2025"), "2025 revenue");
		assertEquals("19.74", money(connection, "SELECT 100.0 * ((SELECT SUM(total_amount)"
				+ " FROM dash_demo.orders WHERE " + sold + " AND year(order_ts) = 2025)"
				+ " / (SELECT SUM(total_amount) FROM dash_demo.orders WHERE " + sold
				+ " AND year(order_ts) = 2024) - 1)"), "Revenue growth 2024 -> 2025 (%)");

		// 4-5: November is the peak month, August the quietest.
		assertEquals("2.14", money(connection, "SELECT (SELECT SUM(total_amount) FROM dash_demo.orders"
				+ " WHERE " + sold + " AND year(order_ts) = 2025 AND month(order_ts) = 11)"
				+ " / (SELECT SUM(total_amount) / 12 FROM dash_demo.orders WHERE " + sold
				+ " AND year(order_ts) = 2025)"), "November 2025 against an average month");
		assertEquals(8L, number(connection, "SELECT month(order_ts) FROM dash_demo.orders WHERE "
				+ sold + " AND year(order_ts) = 2025 GROUP BY 1 ORDER BY SUM(total_amount) LIMIT 1")
				.longValue(), "The lowest month of 2025 is August");

		// 6: the web and app peak, the hour every hour-of-day demo is built on.
		assertEquals("Monday 20", one(connection, "SELECT dayname(order_ts) || ' ' || hour(order_ts)"
				+ " FROM dash_demo.orders WHERE channel IN ('web','mobile_app') GROUP BY 1"
				+ " ORDER BY COUNT(*) DESC LIMIT 1"), "The busiest weekday and hour");

		// 7-8: payday, and the Black Friday spike.
		assertEquals("125.14", money(connection, "WITH d AS (SELECT date_trunc('month', order_ts) AS m,"
				+ " day(order_ts) AS dd, COUNT(*) AS n FROM dash_demo.orders GROUP BY 1, 2),"
				+ " avg_m AS (SELECT m, AVG(n) AS a FROM d GROUP BY 1)"
				+ " SELECT 100.0 * AVG(d.n / avg_m.a) FROM d JOIN avg_m USING (m)"
				+ " WHERE d.dd BETWEEN 25 AND 27"), "Orders on the 25th-27th against the daily average");
		assertEquals("3.99", money(connection, "SELECT (SELECT COUNT(*) FROM dash_demo.orders"
				+ " WHERE order_ts::DATE = DATE '2025-11-28') / (SELECT COUNT(*) / 365.0"
				+ " FROM dash_demo.orders WHERE year(order_ts) = 2025)"),
				"Black Friday 2025 against an average day");

		// 9-12: the receivables the finance demo opens on.
		String open = "status IN ('open','overdue','partially_paid')";
		assertEquals("12.78", money(connection, "SELECT 100.0 * SUM(CASE WHEN due_date < " + AS_OF
				+ " THEN amount + tax_amount ELSE 0 END) / SUM(amount + tax_amount)"
				+ " FROM dash_demo.invoices WHERE " + open + ""),
				"The overdue share of the open receivables");
		assertEquals("170829.65", money(connection, "SELECT SUM(amount + tax_amount)"
				+ " FROM dash_demo.invoices WHERE customer_id = 1017 AND " + open + " AND due_date < "
				+ AS_OF + " - INTERVAL 90 DAY"), "Helix Retail Group, more than 90 days overdue");
		assertEquals("37.16", money(connection, dso("2025-06-30")), "DSO in 2025 (days)");
		assertEquals("45.87", money(connection, dso(DASH_DEMO_TODAY)), "DSO in September 2026 (days)");

		// 13: the churn spike the subscriptions demo is about.
		assertEquals("2.43", money(connection, "SELECT 100.0 * COUNT(CASE WHEN"
				+ " date_trunc('month', cancel_date) = DATE '2026-02-01' THEN 1 END)"
				+ " / (SELECT COUNT(*) FROM dash_demo.subscriptions WHERE start_date < DATE '2026-02-01'"
				+ " AND (cancel_date IS NULL OR cancel_date >= DATE '2026-02-01'))"
				+ " FROM dash_demo.subscriptions"), "Churn in February 2026 (%)");
		assertEquals("99781.43", money(connection, "SELECT SUM(mrr) FROM dash_demo.subscriptions"
				+ " WHERE cancel_date IS NULL"), "MRR at as_of");

		// 14: the late carrier the fulfillment demo finds.
		assertEquals("12.30", money(connection, "SELECT 100.0 * COUNT(CASE WHEN"
				+ " delivered_ts::DATE > promised_date THEN 1 END) / COUNT(*) FROM dash_demo.orders"
				+ " WHERE delivered_ts IS NOT NULL AND carrier = 'SwiftPost'"), "SwiftPost late (%)");
		assertEquals("12.06", money(connection, "SELECT 100.0 * COUNT(CASE WHEN"
				+ " delivered_ts::DATE > promised_date THEN 1 END) / COUNT(*) FROM dash_demo.orders"
				+ " WHERE delivered_ts IS NOT NULL AND carrier = 'SwiftPost' AND country_code = 'DE'"),
				"SwiftPost late in Germany (%)");

		// 15: support, where the best channel and the one bad month both matter.
		assertEquals("chat", one(connection, "SELECT channel FROM dash_demo.support_tickets"
				+ " GROUP BY 1 ORDER BY AVG(csat_score) DESC LIMIT 1"), "The best CSAT channel");
		assertEquals("4.41", money(connection, "SELECT AVG(csat_score) FROM dash_demo.support_tickets"
				+ " WHERE channel = 'chat'"), "The chat CSAT");
		assertEquals("3.05", money(connection, "SELECT (100.0 * COUNT(CASE WHEN"
				+ " date_trunc('month', opened_ts) = DATE '2026-06-01' AND sla_breached THEN 1 END)"
				+ " / NULLIF(COUNT(CASE WHEN date_trunc('month', opened_ts) = DATE '2026-06-01'"
				+ " THEN 1 END), 0)) / (100.0 * COUNT(CASE WHEN"
				+ " date_trunc('month', opened_ts) <> DATE '2026-06-01' AND sla_breached THEN 1 END)"
				+ " / NULLIF(COUNT(CASE WHEN date_trunc('month', opened_ts) <> DATE '2026-06-01'"
				+ " THEN 1 END), 0)) FROM dash_demo.support_tickets WHERE priority = 'urgent'"),
				"Urgent SLA breaches in June 2026 against the rest (x)");
	}

	/** Days sales outstanding on a day, the way truths_dashboards_demo.py computes it. */
	private static String dso(String day) {
		return "SELECT 365.0 * (SELECT SUM(amount + tax_amount) FROM dash_demo.invoices"
				+ " WHERE issue_date <= DATE '" + day + "' AND (last_paid_date IS NULL"
				+ " OR last_paid_date > DATE '" + day + "')) / (SELECT SUM(amount + tax_amount)"
				+ " FROM dash_demo.invoices WHERE issue_date > DATE '" + day + "' - INTERVAL 365 DAY"
				+ " AND issue_date <= DATE '" + day + "')";
	}

	// ── the harness ──────────────────────────────────────────────────────────

	/**
	 * What every test in here asks the script for: the frozen day, a reload, and the rows of the
	 * copy this test made. The script loads once and does nothing on a later run, which is right
	 * for a user and wrong for a test handed a database somebody else already seeded.
	 */
	static Map<String, String> seedParams(Path script) {
		return Map.of("today", DASH_DEMO_TODAY, "wipe", "true", "dataDir",
				script.getParent().resolve("dashboards-demo-data").toAbsolutePath().toString());
	}

	/** The shipped script and its rows, copied into a temp folder: the tree is never written to. */
	static Path shipScript(Path temp) throws Exception {

		Path shipped = Paths.get(System.getProperty("user.dir")).toAbsolutePath().getParent().getParent()
				.resolve("asbl").resolve("src").resolve("main").resolve("external-resources")
				.resolve("db-template").resolve("db").resolve("scripts");

		Path scripts = temp.resolve("scripts");
		Path rows = scripts.resolve("dashboards-demo-data");
		Files.createDirectories(rows);

		Path script = scripts.resolve("dashboards-demo-data.groovy");
		Files.copy(shipped.resolve("dashboards-demo-data.groovy"), script, StandardCopyOption.REPLACE_EXISTING);

		try (Stream<Path> files = Files.list(shipped.resolve("dashboards-demo-data"))) {
			for (Path file : files.collect(java.util.stream.Collectors.toList())) {
				Files.copy(file, rows.resolve(file.getFileName()), StandardCopyOption.REPLACE_EXISTING);
			}
		}
		return script;
	}

	static Connection duckDb(Path file) throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:" + file.toAbsolutePath());
	}

	static long countAllTheRows(Connection connection) throws Exception {
		long all = 0;
		for (String table : ROWS.keySet()) {
			if (!"as_of".equals(table)) {
				all += number(connection, "SELECT COUNT(*) FROM dash_demo." + table).longValue();
			}
		}
		return all;
	}

	private static void run(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement()) {
			statement.execute(sql);
		}
	}

	static Object one(Connection connection, String sql) throws Exception {
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
			assertTrue(rows.next(), "No row from: " + sql);
			return rows.getObject(1);
		}
	}

	static Number number(Connection connection, String sql) throws Exception {
		return (Number) one(connection, sql);
	}

	/** A number the way truths.out prints it, so the two can be read side by side. */
	static String money(Connection connection, String sql) throws Exception {
		return String.format(Locale.ROOT, "%.2f", number(connection, sql).doubleValue());
	}

	static List<List<String>> rows(Connection connection, String sql) throws Exception {
		List<List<String>> all = new ArrayList<>();
		try (Statement statement = connection.createStatement(); ResultSet found = statement.executeQuery(sql)) {
			while (found.next()) {
				List<String> row = new ArrayList<>();
				for (int column = 1; column <= found.getMetaData().getColumnCount(); column++) {
					row.add(String.valueOf(found.getObject(column)));
				}
				all.add(row);
			}
		}
		return all;
	}

	/** The message of the failure, or of the cause a script wraps it in. */
	static String message(Throwable failure) {
		StringBuilder all = new StringBuilder();
		for (Throwable step = failure; step != null; step = step.getCause()) {
			all.append(step.getMessage()).append(" | ");
		}
		return all.toString();
	}
}

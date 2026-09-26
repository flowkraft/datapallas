package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.nio.file.Files;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.CubeDslSamples;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;

/**
 * Tests for CubeSqlGenerator — verifies SQL generation from cube metadata + field selections.
 */
class CubeSqlGeneratorTest {

	@Test
	void testBasicDimensionAndMeasure() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'country'; sql 'country'; type 'string' }\n" +
				"  dimension { name 'region'; sql 'region'; type 'string' }\n" +
				"  measure { name 'total'; sql 'revenue'; type 'sum' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("country", "region"),
				List.of("total", "count"),
				"postgres");

		assertNotNull(sql);
		assertTrue(sql.contains("country"), "SQL should contain country dimension");
		assertTrue(sql.contains("region"), "SQL should contain region dimension");
		assertTrue(sql.toLowerCase().contains("sum"), "SQL should contain SUM aggregation");
		assertTrue(sql.toLowerCase().contains("count"), "SQL should contain COUNT aggregation");
		assertTrue(sql.toLowerCase().contains("group by"), "SQL should contain GROUP BY");
		assertTrue(sql.toLowerCase().contains("order by"), "SQL should contain ORDER BY");

		System.out.println("Generated SQL (postgres):\n" + sql);
	}

	@Test
	void testNoFieldsSelected() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'country'; sql 'country'; type 'string' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube, List.of(), List.of(), "postgres");

		assertTrue(sql.contains("No fields selected"));
	}

	@Test
	void testMeasureOnlyNoGroupBy() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  measure { name 'total_count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube, List.of(), List.of("total_count"), "postgres");

		assertNotNull(sql);
		assertTrue(sql.toLowerCase().contains("count"), "SQL should contain COUNT");
		assertFalse(sql.toLowerCase().contains("group by"), "No GROUP BY without dimensions");

		System.out.println("Generated SQL (measure only):\n" + sql);
	}

	@Test
	void testAllAggregationTypes() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'sales'\n" +
				"  dimension { name 'channel'; sql 'sales_channel'; type 'string' }\n" +
				"  measure { name 'total_revenue'; sql 'revenue'; type 'sum' }\n" +
				"  measure { name 'avg_revenue'; sql 'revenue'; type 'avg' }\n" +
				"  measure { name 'min_revenue'; sql 'revenue'; type 'min' }\n" +
				"  measure { name 'max_revenue'; sql 'revenue'; type 'max' }\n" +
				"  measure { name 'tx_count'; type 'count' }\n" +
				"  measure { name 'unique_customers'; sql 'customer_id'; type 'count_distinct' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("channel"),
				List.of("total_revenue", "avg_revenue", "min_revenue", "max_revenue", "tx_count", "unique_customers"),
				"postgres");

		assertTrue(sql.toLowerCase().contains("sum("), "Should have SUM");
		assertTrue(sql.toLowerCase().contains("avg("), "Should have AVG");
		assertTrue(sql.toLowerCase().contains("min("), "Should have MIN");
		assertTrue(sql.toLowerCase().contains("max("), "Should have MAX");
		assertTrue(sql.toLowerCase().contains("count("), "Should have COUNT");
		assertTrue(sql.toLowerCase().contains("count(distinct"), "Should have COUNT DISTINCT");

		System.out.println("Generated SQL (all aggregations):\n" + sql);
	}

	@Test
	void testCubeRefPlaceholder() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql '${CUBE}.status'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube, List.of("status"), List.of("count"), "postgres");

		// ${CUBE} becomes the rendered table name. "orders" is a plain, unreserved name, so it is
		// emitted unquoted — which is how the cube author's own fragments reference it.
		assertTrue(sql.contains("orders.status"), "Should replace ${CUBE} with the rendered table name");
		assertFalse(sql.contains("${CUBE}"), "Should not contain ${CUBE} placeholder");

		System.out.println("Generated SQL (CUBE placeholder):\n" + sql);
	}

	@Test
	void testMySqlDialect() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'country'; sql 'country'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sqlPostgres = CubeSqlGenerator.generateSql(cube, List.of("country"), List.of("count"), "postgres");
		String sqlMysql = CubeSqlGenerator.generateSql(cube, List.of("country"), List.of("count"), "mysql");

		assertNotNull(sqlPostgres);
		assertNotNull(sqlMysql);

		// Both should produce valid SQL — the quote character is the vendor layer's job
		System.out.println("PostgreSQL:\n" + sqlPostgres);
		System.out.println("MySQL:\n" + sqlMysql);
	}

	@Test
	void testNoCubeTable() throws Exception {
		CubeOptions cube = new CubeOptions(); // empty — no sql_table
		String sql = CubeSqlGenerator.generateSql(cube, List.of("x"), List.of(), "postgres");
		assertTrue(sql.contains("No sql_table"));
	}

	// ── Auto-JOIN tests ──

	@Test
	void testAutoJoinDetection() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'public.orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  dimension { name 'customer_name'; sql 'customers.company_name'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'customers'; sql '${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("customer_name"),
				List.of("count"),
				"postgres");

		assertTrue(sql.contains("JOIN"), "Should contain JOIN when cross-table dimension selected");
		assertTrue(sql.contains("customers"), "Should reference customers table");
		// ${CUBE} now expands to the dialect-quoted form ("public.orders" for Postgres which doesn't split on dot)
		assertTrue(sql.contains(".customer_id = customers.id"),
				"Should have JOIN ON clause with ${CUBE} replaced");
		assertFalse(sql.contains("${CUBE}"), "Should not contain ${CUBE} placeholder");

		System.out.println("Generated SQL (auto-JOIN):\n" + sql);
	}

	@Test
	void testAutoJoinNotAddedWhenNotReferenced() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  dimension { name 'customer_name'; sql 'customers.company_name'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'customers'; sql '${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		// Only select main-table dimension — no cross-table reference
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("status"),
				List.of("count"),
				"postgres");

		assertFalse(sql.contains("JOIN"), "Should NOT contain JOIN when only main-table dimensions selected");

		System.out.println("Generated SQL (no JOIN needed):\n" + sql);
	}

	// ── Segment WHERE clause tests ──

	@Test
	void testSegmentWhereClause() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  segment { name 'recent'; sql \"${CUBE}.created_at >= CURRENT_DATE - INTERVAL '30 days'\" }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("status"),
				List.of("count"),
				List.of("recent"),
				"postgres");

		assertTrue(sql.contains("WHERE"), "Should contain WHERE when segment selected");
		// ${CUBE} now expands to the dialect-quoted form (Postgres → "orders".created_at)
		assertTrue(sql.contains("orders.created_at"), "Should have ${CUBE} replaced in segment SQL");
		assertFalse(sql.contains("${CUBE}"), "Should not contain ${CUBE} placeholder");

		System.out.println("Generated SQL (segment WHERE):\n" + sql);
	}

	@Test
	void testMultipleSegments() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  segment { name 'recent'; sql \"${CUBE}.created_at >= CURRENT_DATE - INTERVAL '30 days'\" }\n" +
				"  segment { name 'high_value'; sql '${CUBE}.amount > 1000' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("status"),
				List.of("count"),
				List.of("recent", "high_value"),
				"postgres");

		assertTrue(sql.contains("WHERE"), "Should contain WHERE");
		assertTrue(sql.contains("AND"), "Multiple segments should be AND-joined");

		System.out.println("Generated SQL (multiple segments):\n" + sql);
	}

	@Test
	void testNoSegmentsNoWhere() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  segment { name 'recent'; sql \"${CUBE}.created_at >= CURRENT_DATE - INTERVAL '30 days'\" }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		// Don't select any segments
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("status"),
				List.of("count"),
				List.of(),
				"postgres");

		assertFalse(sql.contains("WHERE"), "Should NOT contain WHERE when no segments selected");

		System.out.println("Generated SQL (no segments):\n" + sql);
	}

	@Test
	void testJoinPlusSegment() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'public.orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  dimension { name 'country'; sql 'customers.country'; type 'string' }\n" +
				"  measure { name 'revenue'; sql 'amount'; type 'sum' }\n" +
				"  join { name 'customers'; sql '${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }\n" +
				"  segment { name 'recent'; sql \"${CUBE}.created_at >= CURRENT_DATE - INTERVAL '30 days'\" }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("country"),
				List.of("revenue"),
				List.of("recent"),
				"postgres");

		assertTrue(sql.contains("JOIN"), "Should contain JOIN for cross-table dimension");
		assertTrue(sql.contains("WHERE"), "Should contain WHERE for segment");
		assertTrue(sql.toLowerCase().contains("sum("), "Should contain SUM aggregation");

		System.out.println("Generated SQL (JOIN + segment):\n" + sql);
	}

	// ── Phase 8.A: Transitive join resolution + jOOQ-quoted FROM/JOIN tests ──

	@Test
	void testTransitiveJoinResolution() throws Exception {
		// Cube source = Orders. Chain: Orders → "Order Details" → Products → Categories.
		// User picks ONE dimension from Categories (the deepest table). Expected: the
		// generator walks the parent chain and emits ALL three joins in dependency order.
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'CategoryName'; sql 'Categories.CategoryName'; type 'string' }\n" +
				"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'Order Details'; parent 'CUBE';          sql '${CUBE}.OrderID = \"Order Details\".OrderID'; relationship 'one_to_many' }\n" +
				"  join { name 'Products';      parent 'Order Details'; sql '\"Order Details\".ProductID = Products.ProductID'; relationship 'many_to_one' }\n" +
				"  join { name 'Categories';    parent 'Products';      sql 'Products.CategoryID = Categories.CategoryID'; relationship 'many_to_one' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("CategoryName"),
				List.of("count"),
				"sqlite");

		// All three joined tables must appear in the SQL — Order Details + Products + Categories
		assertTrue(sql.contains("\"Order Details\""), "Should JOIN \"Order Details\" (transitive ancestor)");
		assertTrue(sql.contains("Products"), "Should JOIN Products (transitive ancestor)");
		assertTrue(sql.contains("Categories"), "Should JOIN Categories (directly referenced)");

		// Verify the order: Order Details before Products before Categories
		int posOrderDetails = sql.indexOf("\"Order Details\"");
		int posProducts = sql.indexOf("JOIN Products") >= 0 ? sql.indexOf("JOIN Products") : sql.indexOf("\"Products\"");
		int posCategories = sql.indexOf("JOIN Categories") >= 0 ? sql.indexOf("JOIN Categories") : sql.indexOf("\"Categories\"");
		assertTrue(posOrderDetails > 0, "Order Details JOIN must be present");
		assertTrue(posProducts > posOrderDetails, "Products JOIN must come AFTER Order Details JOIN");
		assertTrue(posCategories > posProducts, "Categories JOIN must come AFTER Products JOIN");

		System.out.println("Generated SQL (transitive 3-level chain):\n" + sql);
	}

	@Test
	void testL1JoinUnchangedBackwardCompat() throws Exception {
		// Existing single-level cube WITHOUT the new `parent` field should work exactly
		// as before — `parent` defaults to 'CUBE' (L1 join from cube source).
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'CustomerName'; sql 'Customers.CompanyName'; type 'string' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerName"),
				List.of("count"),
				"sqlite");

		assertTrue(sql.contains("Customers"), "Should JOIN Customers");
		assertTrue(sql.contains("JOIN"), "Should have JOIN clause");
		// Only ONE join should be present (no transitive chain)
		assertEquals(1, sql.split("JOIN ").length - 1, "Should have exactly one JOIN clause");

		System.out.println("Generated SQL (L1 backward compat):\n" + sql);
	}

	@Test
	void testJoinTableNameQuotedForSqlite() throws Exception {
		// SQLite requires double-quoting for spaced identifiers like "Order Details".
		// jOOQ's DSL.name() handles this for the FROM/JOIN clauses.
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'Quantity'; sql '\"Order Details\".Quantity'; type 'number' }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'Order Details'; parent 'CUBE'; sql '${CUBE}.OrderID = \"Order Details\".OrderID'; relationship 'one_to_many' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("Quantity"),
				List.of("count"),
				"sqlite");

		// The FROM/JOIN clause must use the double-quoted form so SQLite parses
		// "Order Details" as a single identifier (not "Order" with alias "Details").
		assertTrue(sql.contains("\"Order Details\""), "Should double-quote spaced table name in JOIN clause");
		// Make sure we don't have unquoted "JOIN Order Details ON" (which SQLite would reject)
		assertFalse(sql.contains("JOIN Order Details "),
				"Should NOT contain unquoted 'JOIN Order Details' (SQLite would parse as table+alias)");

		System.out.println("Generated SQL (SQLite quoting for spaced table):\n" + sql);
	}

	@Test
	void testMultipleDimensionsFromSameDeepJoinNoDuplicates() throws Exception {
		// User picks 3 dimensions all reachable through the same chain.
		// Each intermediate join must appear exactly ONCE in the SQL, not duplicated per dimension.
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'CategoryName'; sql 'Categories.CategoryName'; type 'string' }\n" +
				"  dimension { name 'ProductName'; sql 'Products.ProductName'; type 'string' }\n" +
				"  dimension { name 'Quantity'; sql '\"Order Details\".Quantity'; type 'number' }\n" +
				"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
				"  measure { name 'count'; type 'count' }\n" +
				"  join { name 'Order Details'; parent 'CUBE';          sql '${CUBE}.OrderID = \"Order Details\".OrderID'; relationship 'one_to_many' }\n" +
				"  join { name 'Products';      parent 'Order Details'; sql '\"Order Details\".ProductID = Products.ProductID'; relationship 'many_to_one' }\n" +
				"  join { name 'Categories';    parent 'Products';      sql 'Products.CategoryID = Categories.CategoryID'; relationship 'many_to_one' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("CategoryName", "ProductName", "Quantity"),
				List.of("count"),
				"sqlite");

		// Each table should appear in exactly ONE JOIN clause
		// "JOIN \"Order Details\"" should appear once (the join clause itself)
		int orderDetailsJoinCount = countOccurrences(sql, "JOIN \"Order Details\"");
		int productsJoinCount = countOccurrences(sql, "JOIN Products") + countOccurrences(sql, "JOIN \"Products\"");
		int categoriesJoinCount = countOccurrences(sql, "JOIN Categories") + countOccurrences(sql, "JOIN \"Categories\"");

		assertEquals(1, orderDetailsJoinCount, "Order Details should be JOINed exactly once");
		assertEquals(1, productsJoinCount, "Products should be JOINed exactly once");
		assertEquals(1, categoriesJoinCount, "Categories should be JOINed exactly once");

		System.out.println("Generated SQL (no duplicate joins):\n" + sql);
	}

	private static int countOccurrences(String haystack, String needle) {
		if (haystack == null || needle == null || needle.isEmpty()) return 0;
		int count = 0;
		int idx = 0;
		while ((idx = haystack.indexOf(needle, idx)) != -1) {
			count++;
			idx += needle.length();
		}
		return count;
	}

	// ── Phase 8.B: Smoke test for the bundled sample cube DSL files ─────────
	//
	// Parses each of the five Northwind sample cube DSL files from samples-cubes/
	// and generates SQL for a representative dimension+measure combination.
	// This catches DSL syntax errors and ensures the cubes compile against
	// the actual Northwind schema before they ship. The fifteen story cubes that
	// ship next to them are swept whole in CubeSampleSqlExecutesTest, which runs
	// every one of their dimensions against a real database.

	private static String SAMPLES_CUBES_DIR =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes";

	private static String readCubeDsl(String folderName) throws Exception {
		File f = new File(SAMPLES_CUBES_DIR + "/" + folderName + "/" + folderName + "-cube-config.groovy");
		if (!f.exists()) {
			fail("Sample cube DSL file not found: " + f.getAbsolutePath());
		}
		return Files.readString(f.toPath());
	}

	@Test
	void testSampleCube_NorthwindSales_parsesAndGeneratesSql() throws Exception {
		String dsl = readCubeDsl("northwind-sales");
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertNotNull(cube);
		assertEquals("Orders", cube.getSqlTable());
		assertNotNull(cube.getDimensions());
		assertNotNull(cube.getMeasures());
		assertNotNull(cube.getJoins());
		assertEquals(7, cube.getJoins().size(), "Sales cube should have 7 joins");

		// Test 1: pick a CategoryName (3-level transitive: Order Details → Products → Categories)
		String sql1 = CubeSqlGenerator.generateSql(cube,
				List.of("CategoryName"), List.of("Revenue"), "sqlite");
		assertNotNull(sql1);
		assertTrue(sql1.contains("JOIN \"Order Details\""), "Should JOIN \"Order Details\"");
		assertTrue(sql1.contains("JOIN Products"), "Should JOIN Products (transitive)");
		assertTrue(sql1.contains("JOIN Categories"), "Should JOIN Categories");

		// Test 2: pick a SupplierName (also 3-level: Order Details → Products → Suppliers)
		String sql2 = CubeSqlGenerator.generateSql(cube,
				List.of("SupplierName"), List.of("Revenue"), "sqlite");
		assertTrue(sql2.contains("JOIN \"Order Details\""));
		assertTrue(sql2.contains("JOIN Products"));
		assertTrue(sql2.contains("JOIN Suppliers"));

		// Test 3: pick a CustomerCompanyName (L1 join — Customers)
		String sql3 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCompanyName"), List.of("OrderCount"), "sqlite");
		assertTrue(sql3.contains("JOIN Customers"));
		assertFalse(sql3.contains("JOIN Products"), "Should NOT join Products when only Customer is selected");

		// Test 4: with segment
		String sql4 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCountry"), List.of("OrderCount"), List.of("unshipped"), "sqlite");
		assertTrue(sql4.contains("WHERE"));
		assertTrue(sql4.contains("ShippedDate IS NULL"));

		// Test 5: per-order browsing — pick OrderID + OrderDate + OrderValue → invoice ledger
		// OrderValue uses the same SQL as Revenue but is the semantically honest label
		// when grouping at order grain.
		String sql5 = CubeSqlGenerator.generateSql(cube,
				List.of("OrderID", "OrderDate"), List.of("OrderValue"), "sqlite");
		assertTrue(sql5.contains("JOIN \"Order Details\""), "Per-order: should join Order Details for the line totals");
		assertTrue(sql5.toLowerCase().contains("group by"), "Per-order: should GROUP BY");

		System.out.println("[northwind-sales] All 5 SQL gen tests passed");
	}

	@Test
	void testSampleCube_NorthwindInventory_parsesAndGeneratesSql() throws Exception {
		String dsl = readCubeDsl("northwind-inventory");
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Products", cube.getSqlTable());
		assertEquals(2, cube.getJoins().size(), "Inventory cube should have 2 joins");

		// Pick CategoryName + SupplierCountry → both joins activated
		String sql = CubeSqlGenerator.generateSql(cube,
				List.of("CategoryName", "SupplierCountry"),
				List.of("AvgUnitPrice"),
				List.of("active"),
				"sqlite");
		assertTrue(sql.contains("JOIN Categories"));
		assertTrue(sql.contains("JOIN Suppliers"));
		assertTrue(sql.contains("WHERE"));
		assertTrue(sql.contains("Discontinued = 0"));

		System.out.println("[northwind-inventory] SQL gen passed");
	}

	@Test
	void testSampleCube_NorthwindCustomers_parsesAndGeneratesSql() throws Exception {
		String dsl = readCubeDsl("northwind-customers");
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Customers", cube.getSqlTable());
		assertEquals(2, cube.getJoins().size(), "Customer cube should have 2 joins (Orders + Order Details for revenue)");

		// Test 1: customer-only query (no join needed)
		String sql1 = CubeSqlGenerator.generateSql(cube,
				List.of("Country"), List.of("CustomerCount"), "sqlite");
		assertFalse(sql1.contains("JOIN"), "Should NOT have JOIN when only Customers fields selected");

		// Test 2: L1 join-activated by selecting Orders measure (no Order Details)
		String sql2 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCompanyName"), List.of("OrderCount"), "sqlite");
		assertTrue(sql2.contains("JOIN Orders"));
		assertFalse(sql2.contains("JOIN \"Order Details\""), "Should NOT join Order Details when only Orders fields selected");

		// Test 3: decision_makers segment
		String sql3 = CubeSqlGenerator.generateSql(cube,
				List.of("ContactTitle"),
				List.of("CustomerCount"),
				List.of("decision_makers"),
				"sqlite");
		assertTrue(sql3.contains("WHERE"));
		assertTrue(sql3.contains("ContactTitle LIKE"));

		// Test 4: L2 transitive join — CustomerLifetimeValue requires Customers → Orders → Order Details
		// THE entire point of CRM analysis: "who are our biggest customers by revenue"
		String sql4 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCompanyName"), List.of("CustomerLifetimeValue"), "sqlite");
		assertTrue(sql4.contains("JOIN Orders"), "L2: should join Orders (transitive)");
		assertTrue(sql4.contains("JOIN \"Order Details\""), "L2: should join Order Details");
		assertTrue(sql4.toLowerCase().contains("sum("), "Should aggregate revenue");

		// Test 5: AvgOrderValue also goes through L2 chain
		String sql5 = CubeSqlGenerator.generateSql(cube,
				List.of("Country"), List.of("AvgOrderValue"), "sqlite");
		assertTrue(sql5.contains("JOIN Orders"));
		assertTrue(sql5.contains("JOIN \"Order Details\""));

		// Test 6: shipped_orders segment + Orders.ShippedDate
		String sql6 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCompanyName"),
				List.of("OrderCount"),
				List.of("unshipped_orders"),
				"sqlite");
		assertTrue(sql6.contains("JOIN Orders"));
		assertTrue(sql6.contains("WHERE"));
		assertTrue(sql6.contains("ShippedDate IS NULL"));

		// Test 7: per-order browsing — pick OrderID + OrderDate + OrderValue → invoice ledger view
		// OrderValue uses the same SQL as CustomerLifetimeValue but is the semantically honest
		// label when grouping at order grain.
		String sql7 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCompanyName", "OrderID", "OrderDate"),
				List.of("OrderValue"), "sqlite");
		assertTrue(sql7.contains("JOIN Orders"), "Per-order browsing: should join Orders");
		assertTrue(sql7.contains("JOIN \"Order Details\""), "Per-order browsing: should join Order Details");
		assertTrue(sql7.contains("Orders.OrderID"), "Per-order browsing: should select Orders.OrderID");
		assertTrue(sql7.toLowerCase().contains("group by"), "Per-order browsing: should GROUP BY");

		System.out.println("[northwind-customers] All 7 SQL gen tests passed (CLV + OrderValue grain split)");
	}

	@Test
	void testSampleCube_NorthwindHr_parsesAndGeneratesSql() throws Exception {
		String dsl = readCubeDsl("northwind-hr");
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Employees", cube.getSqlTable());
		assertEquals(3, cube.getJoins().size(), "HR cube should have 3 joins (3-level chain)");

		// Test 1: simple Employees-only query
		String sql1 = CubeSqlGenerator.generateSql(cube,
				List.of("Country"), List.of("EmployeeCount"), "sqlite");
		assertFalse(sql1.contains("JOIN"), "Should NOT have JOIN when only Employees fields selected");

		// Test 2: L2 join — TerritoryDescription requires EmployeeTerritories + Territories
		String sql2 = CubeSqlGenerator.generateSql(cube,
				List.of("TerritoryDescription"), List.of("EmployeeCount"), "sqlite");
		assertTrue(sql2.contains("JOIN EmployeeTerritories"), "L2: should join EmployeeTerritories");
		assertTrue(sql2.contains("JOIN Territories"), "L2: should join Territories");
		assertFalse(sql2.contains("JOIN Region"), "Should NOT join Region for L2-only query");

		// Test 3: L3 join — RegionDescription requires the FULL 3-level chain
		// (EmployeeTerritories → Territories → Region)
		String sql3 = CubeSqlGenerator.generateSql(cube,
				List.of("RegionDescription"), List.of("EmployeeCount"), "sqlite");
		assertTrue(sql3.contains("JOIN EmployeeTerritories"), "L3: should join EmployeeTerritories (transitive)");
		assertTrue(sql3.contains("JOIN Territories"), "L3: should join Territories (transitive)");
		assertTrue(sql3.contains("JOIN Region"), "L3: should join Region");

		// Test 4: executives segment
		String sql4 = CubeSqlGenerator.generateSql(cube,
				List.of("Title"), List.of("EmployeeCount"), List.of("executives"), "sqlite");
		assertTrue(sql4.contains("WHERE"));
		assertTrue(sql4.contains("ReportsTo IS NULL"));

		System.out.println("[northwind-hr] All 4 SQL gen tests passed (including L3 transitive chain)");
	}

	@Test
	void testSampleCube_NorthwindWarehouse_parsesAndGeneratesSql() throws Exception {
		String dsl = readCubeDsl("northwind-warehouse");
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("vw_sales_detail", cube.getSqlTable());
		assertTrue(cube.getJoins() == null || cube.getJoins().isEmpty(),
				"Warehouse cube should have no joins (denormalized view)");

		// Test 1: replicate the existing Sales PivotTable sample (sample 19)
		// Rows = customer_country + category_name, vals = net_revenue
		String sql1 = CubeSqlGenerator.generateSql(cube,
				List.of("CustomerCountry", "CategoryName"),
				List.of("NetRevenue"),
				"duckdb");
		assertNotNull(sql1);
		assertFalse(sql1.contains("JOIN"), "Should be a flat SELECT — no joins");
		assertTrue(sql1.toLowerCase().contains("sum("), "Should aggregate net_revenue");
		assertTrue(sql1.toLowerCase().contains("group by"), "Should GROUP BY dimensions");

		// Test 2: time + segment
		String sql2 = CubeSqlGenerator.generateSql(cube,
				List.of("Year", "MonthName"),
				List.of("NetRevenue"),
				List.of("north_america"),
				"duckdb");
		assertTrue(sql2.contains("WHERE"));
		assertTrue(sql2.contains("North America"));

		System.out.println("[northwind-warehouse] All 2 SQL gen tests passed");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// THE RULE: the cube generator writes ANSI SQL; the only vendor-specific
	// forms live in CubeSqlDialect. Tests named ansi_* run over every vendor key
	// and expect the same text on each; tests named vendor_* hold the exact
	// expected form per vendor key, and fail when a key is missing from the table.
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * The same SQL with everything the vendor layer is allowed to change taken back out — the quote
	 * character folded to the ANSI one, and the ClickHouse LEFT JOIN settings dropped from the end —
	 * so an ansi_ test can compare the text across vendors and see only the ANSI part. Each of those
	 * two forms has its own vendor_ test holding the exact expected value per vendor key.
	 */
	private static String ansiText(String sql) {
		String text = sql.replace('`', '"');
		String settings = CubeSqlDialect.leftJoinSettings("clickhouse");
		if (text.endsWith(settings)) {
			text = text.substring(0, text.length() - settings.length());
		}
		return text;
	}

	/**
	 * The rewrite's internal names - __keys, __mult, __pk - written the ANSI way, whatever the
	 * vendor does to them. Oracle and Db2 read a name that begins with an underscore only
	 * delimited, so the text of their rewrite carries the quotes; everything else about it is the
	 * same SQL, and that is what the ansi_ tests below compare. The exact per-vendor form has its
	 * own table, in vendor_internalAlias_exactFormForEveryVendorKey.
	 */
	private static String plainInternals(String text, String vendor) {
		String plain = text;
		for (String name : List.of("__keys", "__mult", "__pk")) {
			plain = plain.replace(CubeSqlDialect.internalAlias(name, vendor), name);
		}
		return plain;
	}

	/** Test 1 — identifier quoting, the exact form for every vendor key. */
	@Test
	void vendor_quoteIdent_exactFormForEveryVendorKey() {

		// The table: one row per vendor key, in the order
		// Customers | Order Details | public.orders | my schema.Order Details | "Pre Quoted"
		Map<String, List<String>> expected = new LinkedHashMap<>();
		List<String> ansiQuote = List.of(
				"Customers", "\"Order Details\"", "public.orders",
				"\"my schema\".\"Order Details\"", "\"Pre Quoted\"");
		List<String> backQuote = List.of(
				"Customers", "`Order Details`", "public.orders",
				"`my schema`.`Order Details`", "\"Pre Quoted\"");
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "sqlserver", "oracle", "db2", "clickhouse"))
			expected.put(vendor, ansiQuote);
		expected.put("mysql", backQuote);
		expected.put("mariadb", backQuote);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			List<String> row = expected.get(vendor);
			assertNotNull(row, "No expected quoting written down for vendor key '" + vendor + "'");

			assertEquals(row.get(0), CubeSqlDialect.quoteIdent("Customers", vendor),
					"A plain, unreserved name stays unquoted on " + vendor);
			assertEquals(row.get(1), CubeSqlDialect.quoteIdent("Order Details", vendor),
					"A name with a space is quoted on " + vendor);
			assertEquals(row.get(2), CubeSqlDialect.quoteIdent("public.orders", vendor),
					"A dotted plain name stays unquoted, part by part, on " + vendor);
			assertEquals(row.get(3), CubeSqlDialect.quoteIdent("my schema.Order Details", vendor),
					"Each part of a dotted name is quoted on its own on " + vendor);
			assertEquals(row.get(4), CubeSqlDialect.quoteIdent("\"Pre Quoted\"", vendor),
					"A name the author already quoted is passed through on " + vendor);
		}

		// The negative half: the two quote characters really are different, so a test that
		// forgot to consult the table could not pass by accident.
		assertNotEquals(CubeSqlDialect.quoteIdent("Order Details", "mysql"),
				CubeSqlDialect.quoteIdent("Order Details", "postgres"));
	}

	/** Test 2 — aggregates: the same ANSI text on every vendor, and never a row limit. */
	@Test
	void ansi_aggregates_sameCastFormOnEveryVendor() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'sales'\n" +
				"  dimension { name 'channel'; sql 'sales_channel'; type 'string' }\n" +
				"  measure { name 'total'; sql 'revenue'; type 'sum' }\n" +
				"  measure { name 'mean'; sql 'revenue'; type 'avg' }\n" +
				"  measure { name 'low'; sql 'revenue'; type 'min' }\n" +
				"  measure { name 'high'; sql 'revenue'; type 'max' }\n" +
				"  measure { name 'rows_seen'; type 'count' }\n" +
				"  measure { name 'buyers'; sql 'customer_id'; type 'count_distinct' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		List<String> measures = List.of("total", "mean", "low", "high", "rows_seen", "buyers");

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("channel"), measures, vendor);

			assertTrue(sql.contains("CAST(SUM(revenue) AS DECIMAL(31,4))"), "SUM cast on " + vendor);
			assertTrue(sql.contains("CAST(AVG(CAST(revenue AS DECIMAL(31,4))) AS DECIMAL(31,4))"),
					"AVG cast on " + vendor);
			assertTrue(sql.contains("MIN(revenue)"), "MIN unwrapped on " + vendor);
			assertTrue(sql.contains("MAX(revenue)"), "MAX unwrapped on " + vendor);
			assertTrue(sql.contains("COUNT(*)"), "COUNT unwrapped on " + vendor);
			assertTrue(sql.contains("COUNT(DISTINCT customer_id)"), "COUNT DISTINCT unwrapped on " + vendor);

			// MIN and MAX must not have picked up the DECIMAL cast SUM and AVG carry.
			assertFalse(sql.contains("CAST(MIN("), "MIN must stay the column's own type on " + vendor);
			assertFalse(sql.contains("CAST(MAX("), "MAX must stay the column's own type on " + vendor);

			// No row limit was asked for, so none may be written, in any vendor's spelling.
			String upper = sql.toUpperCase();
			assertFalse(upper.contains("LIMIT "), "No LIMIT unless the request asks, on " + vendor);
			assertFalse(upper.contains("TOP "), "No TOP unless the request asks, on " + vendor);
			assertFalse(upper.contains("FETCH FIRST"), "No FETCH FIRST unless the request asks, on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor),
					"The aggregate SQL is ANSI, so " + vendor + " must read the same");
		}
	}

	/** Test 3 — a segment on a joined table brings that join, with nothing selected from it. */
	@Test
	void ansi_segmentOnJoinedTable_bringsTheJoin() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql '${CUBE}.status'; type 'string' }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"  join { name 'customers'; parent 'CUBE'; sql '${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }\n" +
				"  segment { name 'german'; sql \"customers.country = 'DE'\" }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String withSegment = CubeSqlGenerator.generateSql(cube,
					List.of("status"), List.of("orders_count"), List.of("german"), vendor);

			assertTrue(withSegment.contains("JOIN customers ON orders.customer_id = customers.id"),
					"The segment's table must be joined on " + vendor + ", got:\n" + withSegment);
			assertTrue(withSegment.contains("(customers.country = 'DE')"),
					"The segment must be in the WHERE clause on " + vendor);

			// The negative half: without the segment the join must not appear, so the test cannot
			// be passing because the join is always emitted.
			String withoutSegment = CubeSqlGenerator.generateSql(cube,
					List.of("status"), List.of("orders_count"), List.of(), vendor);
			assertFalse(withoutSegment.contains("JOIN customers"),
					"An unselected segment must not bring its join on " + vendor);
			assertFalse(withoutSegment.contains("WHERE"), "No segment, no WHERE, on " + vendor);

			if (first == null) first = plainInternals(ansiText(withSegment), vendor);
			else assertEquals(first, plainInternals(ansiText(withSegment), vendor),
					"Joining and filtering is ANSI, so " + vendor + " must read the same");
		}
	}

	/** Test 4 — two segments, each in its own parentheses, joined with AND. */
	@Test
	void ansi_twoSegments_eachParenthesised() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"  segment { name 'urgent'; sql \"priority = 'high' OR rush = 1\" }\n" +
				"  segment { name 'paid'; sql 'paid_amount > 0' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube,
					List.of("status"), List.of("orders_count"), List.of("urgent", "paid"), vendor);

			assertTrue(sql.contains("WHERE (priority = 'high' OR rush = 1)\n  AND (paid_amount > 0)"),
					"Each segment stands in its own parentheses on " + vendor + ", got:\n" + sql);

			// The negative half: without the parentheses the OR would swallow the second segment,
			// which is exactly the text this asserts is gone.
			assertFalse(sql.contains("WHERE priority = 'high' OR rush = 1\n  AND paid_amount > 0"),
					"A bare OR must not reach the WHERE clause on " + vendor);
		}
	}

	/** Test 5 — a lower-case scalar subquery inside a measure survives intact. */
	@Test
	void ansi_scalarSubqueryInMeasure_survivesIntact() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
				"  measure { name 'headroom'; sql '(select max(amount) from payments)'; type 'sum' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("status"), List.of("headroom"), vendor);

			assertTrue(sql.contains("CAST(SUM((select max(amount) from payments)) AS DECIMAL(31,4))"),
					"The subquery must survive whole on " + vendor + ", got:\n" + sql);
			// The negative half: the old generator stripped the first "select " it found anywhere.
			assertFalse(sql.contains("(max(amount) from payments)"),
					"No inner 'select ' may be stripped on " + vendor);
		}
	}

	/** Test 6 — an sql-based cube: FROM (…) alias, with no AS, and ${CUBE} as that alias. */
	@Test
	void ansi_sqlCube_derivedTableAliasAndCubeRef() throws Exception {
		String withoutAlias = "cube {\n" +
				"  sql 'select * from orders where archived = 0'\n" +
				"  dimension { name 'status'; sql '${CUBE}.status'; type 'string' }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"}";
		String withAlias = "cube {\n" +
				"  sql 'select * from orders where archived = 0'\n" +
				"  sql_alias 'live_orders'\n" +
				"  dimension { name 'status'; sql '${CUBE}.status'; type 'string' }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"}";

		CubeOptions plain = CubeOptionsParser.parseGroovyCubeDslCode(withoutAlias);
		CubeOptions aliased = CubeOptionsParser.parseGroovyCubeDslCode(withAlias);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(plain, List.of("status"), List.of("orders_count"), vendor);

			assertTrue(sql.contains("FROM (select * from orders where archived = 0) cube_src"),
					"An sql cube is a derived table with a default alias on " + vendor + ", got:\n" + sql);
			assertTrue(sql.contains("cube_src.status"), "${CUBE} becomes the alias on " + vendor);
			// The negative half: AS before a derived-table alias is what Oracle rejects, and
			// 'cube' is the alias MySQL 8 rejects.
			assertFalse(sql.contains("archived = 0) AS"), "No AS before a derived-table alias on " + vendor);
			assertFalse(sql.contains("archived = 0) cube\n"), "The default alias must not be 'cube' on " + vendor);
			assertFalse(sql.contains("${CUBE}"), "No ${CUBE} may be left on " + vendor);

			String aliasedSql = CubeSqlGenerator.generateSql(aliased, List.of("status"), List.of("orders_count"), vendor);
			assertTrue(aliasedSql.contains("FROM (select * from orders where archived = 0) live_orders"),
					"sql_alias names the derived table on " + vendor);
			assertTrue(aliasedSql.contains("live_orders.status"), "${CUBE} becomes sql_alias on " + vendor);
			assertFalse(aliasedSql.contains("cube_src"), "The default alias is gone once sql_alias is set on " + vendor);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Fixes A–E (design section "Cube generator: fixes A–E") and calculated
	// measures. Same rule: ansi_* over every vendor key, vendor_* with a table.
	// ─────────────────────────────────────────────────────────────────────────

	/** Test 7 — A: dimensions with no measure still group, so the answer has one row per value. */
	@Test
	void ansi_dimensionsOnly_groupByEveryDimensionAndNoAggregate() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'orders'\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  dimension { name 'ShipCity'; sql '${CUBE}.ShipCity'; type 'string' }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry", "ShipCity"), List.of(), vendor);

			String groupBy = sql.substring(sql.indexOf("GROUP BY"));
			assertTrue(groupBy.contains("orders.ShipCountry"), "GROUP BY names the first dimension on " + vendor);
			assertTrue(groupBy.contains("orders.ShipCity"), "GROUP BY names the second dimension on " + vendor);

			// The negative half: with no measure ticked there is no aggregate anywhere, so this
			// really is "one row per distinct value" and not a silently aggregated answer.
			String upper = sql.toUpperCase();
			assertFalse(upper.contains("COUNT("), "No aggregate when no measure is picked, on " + vendor);
			assertFalse(upper.contains("SUM("), "No aggregate when no measure is picked, on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor), "GROUP BY is ANSI, so " + vendor + " must read the same");
		}

		// And the same cube WITH a measure still groups — A did not take the old behaviour away.
		String withMeasure = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
				List.of("orders_count"), "postgres");
		assertTrue(withMeasure.contains("GROUP BY"));
		assertTrue(withMeasure.contains("COUNT(*)"));
	}

	/** The cube tests 8 and 9 join over: Orders, with a join in each direction. */
	private static CubeOptions joinedCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
				"  join { name 'Shippers'; sql '${CUBE}.ShipVia = Shippers.ShipperID'; relationship 'one_to_many' }\n" +
				"  dimension { name 'Company'; sql 'Customers.CompanyName'; type 'string' }\n" +
				"  dimension { name 'Shipper'; sql 'Shippers.CompanyName'; type 'string' }\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"}");
	}

	/** Test 8 — B: every join is a LEFT JOIN, whatever the relationship says. */
	@Test
	void ansi_everyJoinIsALeftJoin() throws Exception {
		CubeOptions cube = joinedCube();

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("Company", "Shipper"),
					List.of("orders_count"), vendor);

			assertTrue(sql.contains("LEFT JOIN Customers ON"), "many_to_one is a LEFT JOIN on " + vendor);
			assertTrue(sql.contains("LEFT JOIN Shippers ON"), "one_to_many is a LEFT JOIN on " + vendor);

			// The negative half: not one plain or inner join survives, or a base row with no
			// match would still disappear from the answer.
			assertFalse(sql.contains("INNER JOIN"), "No INNER JOIN on " + vendor);
			assertFalse(sql.replace("LEFT JOIN", "").contains("JOIN"), "No bare JOIN left on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor), "LEFT JOIN is ANSI, so " + vendor + " must read the same");
		}
	}

	/** Test 8, vendor half — the LEFT JOIN settings ClickHouse needs, and nowhere else. */
	@Test
	void vendor_leftJoinSettings_exactFormForEveryVendorKey() throws Exception {
		CubeOptions cube = joinedCube();

		Map<String, String> expected = new LinkedHashMap<>();
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "mysql", "mariadb",
				"sqlserver", "oracle", "db2"))
			expected.put(vendor, "");
		expected.put("clickhouse", " SETTINGS join_use_nulls = 1");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String tail = expected.get(vendor);
			assertNotNull(tail, "No expected LEFT JOIN settings written down for vendor key '" + vendor + "'");

			assertEquals(tail, CubeSqlDialect.leftJoinSettings(vendor), "leftJoinSettings on " + vendor);

			String joined = CubeSqlGenerator.generateSql(cube, List.of("Company"), List.of("orders_count"), vendor);
			assertTrue(joined.endsWith(tail), "A query with a LEFT JOIN ends with the settings on " + vendor);

			// The negative half: a query with no LEFT JOIN never carries them, on any vendor.
			String unjoined = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("orders_count"), vendor);
			assertFalse(unjoined.contains("SETTINGS"),
					"No LEFT JOIN, so no join settings, on " + vendor);
		}
	}

	/** Test 9 — C: measure filters land inside the aggregate, one case per type. */
	@Test
	void ansi_measureFilters_insideEveryAggregate() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  measure { name 'shipped_count'; type 'count'\n" +
				"    filters { filter sql: \"${CUBE}.ShipCountry <> 'RU'\" } }\n" +
				"  measure { name 'freight_rows'; sql '${CUBE}.Freight'; type 'count'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10' } }\n" +
				"  measure { name 'buyers'; sql '${CUBE}.CustomerID'; type 'count_distinct'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10' } }\n" +
				"  measure { name 'freight'; sql '${CUBE}.Freight'; type 'sum'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10' } }\n" +
				"  measure { name 'mean_freight'; sql '${CUBE}.Freight'; type 'avg'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10' } }\n" +
				"  measure { name 'low'; sql '${CUBE}.Freight'; type 'min'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10' } }\n" +
				"  measure { name 'two_filters'; sql '${CUBE}.Freight'; type 'sum'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 10'; filter sql: '${CUBE}.ShipVia = 1' } }\n" +
				"  measure { name 'german_freight'; sql '${CUBE}.Freight'; type 'sum'\n" +
				"    filters { filter sql: \"Customers.Country = 'Germany'\" } }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		List<String> measures = List.of("shipped_count", "freight_rows", "buyers", "freight",
				"mean_freight", "low", "two_filters");

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), measures, vendor);

			assertTrue(sql.contains("COUNT(CASE WHEN (Orders.ShipCountry <> 'RU') THEN 1 END)"),
					"count with no sql counts the rows the filter keeps, on " + vendor);
			assertTrue(sql.contains("COUNT(CASE WHEN (Orders.Freight > 10) THEN Orders.Freight END)"),
					"count with sql counts that expression, on " + vendor);
			assertTrue(sql.contains(
					"COUNT(DISTINCT CASE WHEN (Orders.Freight > 10) THEN Orders.CustomerID END)"),
					"count_distinct on " + vendor);
			assertTrue(sql.contains(
					"CAST(SUM(CASE WHEN (Orders.Freight > 10) THEN Orders.Freight END) AS DECIMAL(31,4))"),
					"a filtered SUM keeps its DECIMAL cast on " + vendor);
			assertTrue(sql.contains("CAST(AVG(CAST(CASE WHEN (Orders.Freight > 10) THEN Orders.Freight END"
					+ " AS DECIMAL(31,4))) AS DECIMAL(31,4))"),
					"a filtered AVG keeps both DECIMAL casts on " + vendor);
			assertTrue(sql.contains("MIN(CASE WHEN (Orders.Freight > 10) THEN Orders.Freight END)"),
					"MIN gets the same CASE, unwrapped, on " + vendor);
			assertTrue(sql.contains("(Orders.Freight > 10) AND (Orders.ShipVia = 1)"),
					"two filters are each parenthesised and joined with AND, on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor), "Measure filters are ANSI, so " + vendor + " must read the same");
		}

		// A filter on a joined table brings that join, with nothing else selected from it.
		String joined = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
				List.of("german_freight"), "postgres");
		assertTrue(joined.contains("LEFT JOIN Customers ON"),
				"A filter on a joined table brings its join");

		// The negative half: the same measure without its filter has no CASE at all, so the CASE
		// above really comes from the filter and not from the aggregate itself.
		String noFilterCube = CubeSqlGenerator.generateSql(
				CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
						"  sql_table 'Orders'\n" +
						"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
						"  measure { name 'freight'; sql '${CUBE}.Freight'; type 'sum' }\n" +
						"}"),
				List.of("ShipCountry"), List.of("freight"), "postgres");
		assertEquals(-1, noFilterCube.indexOf("CASE WHEN"),
				"A measure with no filters is a plain aggregate");
		assertTrue(noFilterCube.contains("CAST(SUM(Orders.Freight) AS DECIMAL(31,4))"));
	}

	/** Test 10 — D: a case_ dimension becomes a CASE expression, in SELECT and in GROUP BY. */
	@Test
	void ansi_caseDimension_sameExpressionInSelectAndGroupBy() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
				"  dimension { name 'FreightBand'; type 'string'\n" +
				"    case_ {\n" +
				"      when sql: '${CUBE}.Freight > 100', label: 'High'\n" +
				"      when sql: 'Customers.Country = \\'Germany\\'', label: 'Domestic'\n" +
				"      else_ label: 'Low'\n" +
				"    } }\n" +
				"  dimension { name 'NoElse'; type 'string'\n" +
				"    case_ { when sql: '${CUBE}.Freight > 100', label: 'High' } }\n" +
				"  measure { name 'orders_count'; type 'count' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		String expectedCase = "CASE WHEN (Orders.Freight > 100) THEN 'High'"
				+ " WHEN (Customers.Country = 'Germany') THEN 'Domestic' ELSE 'Low' END";

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("FreightBand"),
					List.of("orders_count"), vendor);

			assertTrue(sql.contains(expectedCase + " AS "), "The CASE is the SELECT expression on " + vendor);
			assertTrue(sql.substring(sql.indexOf("GROUP BY")).contains(expectedCase),
					"The same CASE is in GROUP BY on " + vendor);
			// A when on a joined table brings its join, exactly as a plain dimension would.
			assertTrue(sql.contains("LEFT JOIN Customers ON"), "A when on a joined table joins it, on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor), "CASE is ANSI, so " + vendor + " must read the same");
		}

		// No else_ given, so no ELSE is written: an unmatched row is NULL, not a made-up label.
		String noElse = CubeSqlGenerator.generateSql(cube, List.of("NoElse"), List.of("orders_count"), "postgres");
		assertTrue(noElse.contains("CASE WHEN (Orders.Freight > 100) THEN 'High' END"));
		assertFalse(noElse.contains("ELSE"), "No else_ in the DSL means no ELSE in the SQL");
	}

	/** Test 10, vendor half — how a label's own quote and backslash are escaped, per vendor key. */
	@Test
	void vendor_stringLiteral_exactFormForEveryVendorKey() {

		String label = "O'Brien\\Co";

		Map<String, String> expected = new LinkedHashMap<>();
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "sqlserver", "oracle", "db2"))
			expected.put(vendor, "'O''Brien\\Co'");
		for (String vendor : List.of("mysql", "mariadb", "clickhouse"))
			expected.put(vendor, "'O''Brien\\\\Co'");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String literal = expected.get(vendor);
			assertNotNull(literal, "No expected string literal written down for vendor key '" + vendor + "'");
			assertEquals(literal, CubeSqlDialect.stringLiteral(label, vendor), "stringLiteral on " + vendor);
		}

		// The negative half: the two forms really differ, so a test that never consulted the
		// table could not pass by accident.
		assertNotEquals(CubeSqlDialect.stringLiteral(label, "mysql"),
				CubeSqlDialect.stringLiteral(label, "postgres"));
		// And the aliases resolve to the same form as their key.
		assertEquals(CubeSqlDialect.stringLiteral(label, "postgres"),
				CubeSqlDialect.stringLiteral(label, "supabase"));
		assertEquals(CubeSqlDialect.stringLiteral(label, "sqlserver"),
				CubeSqlDialect.stringLiteral(label, "mssql"));
	}

	/** Test 11 — E: an unknown measure type is refused, and the two types that are not aggregates. */
	@Test
	void ansi_measureTypes_unknownIsRefusedAndNumberIsNotWrapped() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  measure { name 'freight'; sql '${CUBE}.Freight'; type 'summ' }\n" +
				"  measure { name 'untyped' }\n" +
				"  measure { name 'rows_x2'; sql 'COUNT(*) * 1.0'; type 'number' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("freight"), vendor));
			assertTrue(refused.getMessage().contains("freight"), "The message names the measure, on " + vendor);
			assertTrue(refused.getMessage().contains("summ"), "The message names the type, on " + vendor);
			assertTrue(refused.getMessage().contains("count_distinct"),
					"The message lists the allowed types, on " + vendor);

			// A measure with no type is still a count — the old behaviour, deliberately kept.
			String untyped = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("untyped"), vendor);
			assertTrue(untyped.contains("COUNT(*)"), "No type still means count, on " + vendor);

			// number is written as the author wrote it, and is not in GROUP BY.
			String number = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("rows_x2"), vendor);
			assertTrue(number.contains("COUNT(*) * 1.0 AS "), "number is not wrapped, on " + vendor);
			assertFalse(number.substring(number.indexOf("GROUP BY")).contains("COUNT(*) * 1.0"),
					"number is not in GROUP BY, on " + vendor);
		}
	}

	/** Test 21 — calculated number measures: ${OtherMeasure}, nesting, cycles and unknown names. */
	@Test
	void ansi_calculatedMeasures_expandTheirReferences() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  measure { name 'Revenue'; sql '${CUBE}.Freight'; type 'sum'\n" +
				"    filters { filter sql: '${CUBE}.Freight > 0' } }\n" +
				"  measure { name 'Cost'; sql '${CUBE}.ShipVia'; type 'sum' }\n" +
				"  measure { name 'Margin'; sql '(${Revenue} - ${Cost}) / NULLIF(${Revenue}, 0)'; type 'number' }\n" +
				"  measure { name 'MarginPct'; sql '${Margin} * 100'; type 'number' }\n" +
				"  measure { name 'Loop'; sql '${Loop2} + 1'; type 'number' }\n" +
				"  measure { name 'Loop2'; sql '${Loop} + 1'; type 'number' }\n" +
				"  measure { name 'Nope'; sql '${NotAMeasure} + 1'; type 'number' }\n" +
				"  segment { name 'byParam'; sql '${CUBE}.ShipCountry = ${param}' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		String revenue = "CAST(SUM(CASE WHEN (Orders.Freight > 0) THEN Orders.Freight END) AS DECIMAL(31,4))";
		String cost = "CAST(SUM(Orders.ShipVia) AS DECIMAL(31,4))";

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("Margin"), vendor);

			assertTrue(sql.contains("(" + revenue + ")"),
					"The referenced measure brings its own filter and cast, on " + vendor);
			assertTrue(sql.contains("(" + cost + ")"), "And so does the other one, on " + vendor);
			assertFalse(sql.substring(sql.indexOf("GROUP BY")).contains("NULLIF"),
					"A calculated measure is not in GROUP BY, on " + vendor);
			assertFalse(sql.contains("${"), "No placeholder is left in a calculated measure, on " + vendor);

			// Nesting: MarginPct uses Margin, which uses Revenue and Cost.
			String nested = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("MarginPct"), vendor);
			assertTrue(nested.contains(revenue) && nested.contains("* 100"), "Nesting resolves on " + vendor);

			// The negative half: a cycle and an unknown name are both refused, by name.
			IllegalArgumentException cycle = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("Loop"), vendor));
			assertTrue(cycle.getMessage().contains("Loop") && cycle.getMessage().contains("Loop2"),
					"The cycle message names the measures in it, on " + vendor);

			IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("Nope"), vendor));
			assertTrue(unknown.getMessage().contains("Nope") && unknown.getMessage().contains("NotAMeasure"),
					"The unknown-reference message names the measure and the text, on " + vendor);

			if (first == null) first = plainInternals(ansiText(sql), vendor);
			else assertEquals(first, plainInternals(ansiText(sql), vendor),
					"A calculated measure is ANSI, so " + vendor + " must read the same");
		}

		// A ${param} in a segment is not a measure reference and survives into the SQL, for the
		// dashboard parameter to bind later.
		String withSegment = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
				List.of("Revenue"), List.of("byParam"), "postgres");
		assertTrue(withSegment.contains("${param}"), "A segment's ${param} is left for binding");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Test 12 — time granularity: the suffix, the truncation forms and timeValue.
	// ─────────────────────────────────────────────────────────────────────────

	/** A cube with a time dimension, a plain one and one measure. */
	private static CubeOptions timeCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'OrderDate'; sql '${CUBE}.OrderDate'; type 'time' }\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  measure { name 'Orders'; type 'count' }\n" +
				"}");
	}

	/** Test 12, vendor half — the exact truncation form for every vendor key × every granularity. */
	@Test
	void vendor_dateTrunc_exactFormForEveryVendorKey() {

		// One row per vendor key, in the order day | week | month | quarter | year.
		Map<String, List<String>> expected = new LinkedHashMap<>();

		List<String> datetrunc = List.of(
				"CAST(DATE_TRUNC('day', x) AS DATE)",
				"CAST(DATE_TRUNC('week', x) AS DATE)",
				"CAST(DATE_TRUNC('month', x) AS DATE)",
				"CAST(DATE_TRUNC('quarter', x) AS DATE)",
				"CAST(DATE_TRUNC('year', x) AS DATE)");
		expected.put("postgres", datetrunc);
		expected.put("duckdb", datetrunc);

		expected.put("oracle", List.of(
				"TRUNC(x, 'DD')", "TRUNC(x, 'IW')", "TRUNC(x, 'MM')", "TRUNC(x, 'Q')", "TRUNC(x, 'YYYY')"));

		expected.put("db2", List.of(
				"DATE(TRUNC_TIMESTAMP(x, 'DD'))", "DATE(TRUNC_TIMESTAMP(x, 'IW'))",
				"DATE(TRUNC_TIMESTAMP(x, 'MM'))", "DATE(TRUNC_TIMESTAMP(x, 'Q'))",
				"DATE(TRUNC_TIMESTAMP(x, 'YYYY'))"));

		expected.put("sqlserver", List.of(
				"CAST(x AS DATE)",
				"DATEADD(day, -((DATEPART(weekday, x) + @@DATEFIRST - 2) % 7), CAST(x AS DATE))",
				"DATEFROMPARTS(YEAR(x), MONTH(x), 1)",
				"DATEFROMPARTS(YEAR(x), (DATEPART(quarter, x) - 1) * 3 + 1, 1)",
				"DATEFROMPARTS(YEAR(x), 1, 1)"));

		List<String> mysqlForms = List.of(
				"DATE(x)",
				"DATE(x) - INTERVAL WEEKDAY(x) DAY",
				"DATE(x) - INTERVAL (DAYOFMONTH(x) - 1) DAY",
				"MAKEDATE(YEAR(x), 1) + INTERVAL (QUARTER(x) - 1) QUARTER",
				"MAKEDATE(YEAR(x), 1)");
		expected.put("mysql", mysqlForms);
		expected.put("mariadb", mysqlForms);

		expected.put("clickhouse", List.of(
				"toDate(x)", "toMonday(x)", "toStartOfMonth(x)", "toStartOfQuarter(x)", "toStartOfYear(x)"));

		expected.put("sqlite", List.of(
				"x",
				"date(x, '-6 days', 'weekday 1')",
				"date(x, 'start of month')",
				"date(x, 'start of month', '-' || ((CAST(strftime('%m', x) AS INTEGER) - 1) % 3) || ' months')",
				"date(x, 'start of year')"));

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			List<String> row = expected.get(vendor);
			assertNotNull(row, "No expected truncation forms written down for vendor key '" + vendor + "'");
			for (int i = 0; i < CubeSqlDialect.GRANULARITIES.size(); i++) {
				String granularity = CubeSqlDialect.GRANULARITIES.get(i);
				assertEquals(row.get(i), CubeSqlDialect.dateTrunc("x", granularity, vendor),
						"dateTrunc " + granularity + " on " + vendor);
			}
		}

		// The negative half: the forms really differ, so a test that never consulted the table
		// could not pass by accident; the aliases resolve to the same form as their key; and a
		// vendor key with no truncation form — default, i.e. no connection — is refused rather
		// than answered with one vendor's form.
		assertNotEquals(CubeSqlDialect.dateTrunc("x", "month", "oracle"),
				CubeSqlDialect.dateTrunc("x", "month", "postgres"));
		assertEquals(CubeSqlDialect.dateTrunc("x", "month", "postgres"),
				CubeSqlDialect.dateTrunc("x", "month", "timescaledb"));
		assertEquals(CubeSqlDialect.dateTrunc("x", "month", "sqlserver"),
				CubeSqlDialect.dateTrunc("x", "month", "mssql"));

		IllegalArgumentException noVendor = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlDialect.dateTrunc("x", "month", null));
		assertTrue(noVendor.getMessage().contains("pick a connection"),
				"With no vendor the message says what to do: " + noVendor.getMessage());

		IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlDialect.dateTrunc("x", "fortnight", "postgres"));
		assertTrue(unknown.getMessage().contains("fortnight"), "The message names the granularity");
	}

	/** Test 12, vendor half — how a time column is read, per vendor key. */
	@Test
	void vendor_timeValue_exactFormForEveryVendorKey() {

		String sqliteForm = "(CASE WHEN typeof(x) IN ('integer','real') THEN date(CASE WHEN x > 100000000000"
				+ " THEN x / 1000 ELSE x END, 'unixepoch') ELSE date(x) END)";

		Map<String, String> expected = new LinkedHashMap<>();
		expected.put("sqlite", sqliteForm);
		for (String vendor : List.of("duckdb", "postgres", "mysql", "mariadb", "sqlserver", "oracle", "db2",
				"clickhouse"))
			expected.put(vendor, "x");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String form = expected.get(vendor);
			assertNotNull(form, "No expected timeValue written down for vendor key '" + vendor + "'");
			assertEquals(form, CubeSqlDialect.timeValue("x", vendor), "timeValue on " + vendor);
		}

		// The negative half: sqlite really differs from the rest.
		assertNotEquals(CubeSqlDialect.timeValue("x", "sqlite"), CubeSqlDialect.timeValue("x", "postgres"));
	}

	/**
	 * Test 12, ANSI half — everything around the truncation is the same on every vendor: the
	 * suffix names the dimension, the alias stays the plain name, and SELECT, GROUP BY and ORDER BY
	 * share the one expression.
	 */
	@Test
	void ansi_timeGranularity_aliasStaysAndTheExpressionIsShared() throws Exception {
		CubeOptions cube = timeCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			for (String granularity : CubeSqlDialect.GRANULARITIES) {
				String sql = CubeSqlGenerator.generateSql(cube,
						List.of("OrderDate." + granularity), List.of("Orders"), vendor);

				String column = "Orders." + "OrderDate";
				String expression = CubeSqlDialect.dateTrunc(
						CubeSqlDialect.timeValue(column, vendor), granularity, vendor);

				assertTrue(sql.contains(expression),
						"The vendor's own truncation is what the generator wrote, on " + vendor + " / "
								+ granularity + ":\n" + sql);
				assertTrue(sql.contains(expression + " AS " + CubeSqlDialect.quoteAlias("OrderDate", vendor)),
						"The alias stays the plain dimension name, on " + vendor + " / " + granularity);
				assertEquals(2, countOccurrences(sql, expression),
						"The same expression is in SELECT and GROUP BY, on " + vendor + " / "
								+ granularity + ":\n" + sql);
				assertTrue(sql.endsWith("ORDER BY\n  " + CubeSqlDialect.quoteAlias("OrderDate", vendor) + " ASC"),
						"and ORDER BY names it, on " + vendor + " / " + granularity + ":\n" + sql);
			}

			// No granularity: the raw value, read through timeValue — which on sqlite is d(x) and
			// everywhere else the column itself.
			String raw = CubeSqlGenerator.generateSql(cube, List.of("OrderDate"), List.of("Orders"), vendor);
			assertTrue(raw.contains(CubeSqlDialect.timeValue("Orders.OrderDate", vendor) + " AS "
					+ CubeSqlDialect.quoteAlias("OrderDate", vendor)),
					"A time dimension with no granularity is still read through timeValue, on " + vendor
							+ ":\n" + raw);
			assertFalse(raw.contains("DATE_TRUNC"), "No granularity, no truncation, on " + vendor);
		}
	}

	/** Test 12, ANSI half — the three things the generator refuses, identically on every vendor. */
	@Test
	void ansi_timeGranularity_refusesWhatItCannotAnswer() throws Exception {
		CubeOptions cube = timeCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			IllegalArgumentException notTime = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("ShipCountry.month"), List.of("Orders"),
							vendor));
			assertTrue(notTime.getMessage().contains("ShipCountry"), "The message names the dimension, on " + vendor);
			assertTrue(notTime.getMessage().contains("time"), "The message says what a granularity needs, on "
					+ vendor);

			IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("OrderDate.hour"), List.of("Orders"),
							vendor));
			assertTrue(unknown.getMessage().contains("hour"), "The message names the granularity, on " + vendor);
		}

		// No connection means no vendor key, and no vendor key means no truncation form: refused,
		// rather than answered with some other database's SQL.
		IllegalArgumentException noVendor = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.generateSql(cube, List.of("OrderDate.month"), List.of("Orders"), null));
		assertTrue(noVendor.getMessage().contains("pick a connection"), noVendor.getMessage());

		// A dimension name that is no dimension of the cube is still ignored, exactly as before —
		// the suffix rules apply only when the part before the dot IS a dimension.
		String unknownDim = CubeSqlGenerator.generateSql(cube, List.of("Nothing.month"), List.of("Orders"),
				"postgres");
		assertFalse(unknownDim.contains("Nothing"), "An unknown dimension is skipped, not truncated");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Test 13 — no double counting across a one_to_many join.
	// ─────────────────────────────────────────────────────────────────────────

	/** The same SQL on one line, so a fragment can be matched whatever the line breaks are. */
	private static String oneLine(String sql) {
		return ansiText(sql).replaceAll("\\s+", " ").trim();
	}

	/**
	 * A Sales-like cube: Orders, its line items one_to_many, Products many_to_one from the lines.
	 *
	 * @param withKey false leaves out the primary_key dimension, which is the cube the rewrite
	 *                cannot use and must refuse.
	 */
	private static CubeOptions salesLikeCube(boolean withKey) throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				(withKey ? "  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" : "") +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  dimension { name 'Quantity'; sql '\"Order Details\".Quantity'; type 'number' }\n" +
				"  dimension { name 'ProductName'; sql 'Products.ProductName'; type 'string' }\n" +
				"  measure { name 'TotalFreight'; sql '${CUBE}.Freight'; type 'sum' }\n" +
				"  measure { name 'Revenue'; sql '\"Order Details\".UnitPrice * \"Order Details\".Quantity'; type 'sum' }\n" +
				"  measure { name 'OrderCount'; type 'count' }\n" +
				"  measure { name 'BigFreight'; sql '${CUBE}.Freight'; type 'sum'; filters([[sql: '${CUBE}.Freight > 50']]) }\n" +
				"  measure { name 'UniqueCustomers'; sql '${CUBE}.CustomerID'; type 'count_distinct' }\n" +
				"  measure { name 'MinFreight'; sql '${CUBE}.Freight'; type 'min' }\n" +
				"  measure { name 'MaxFreight'; sql '${CUBE}.Freight'; type 'max' }\n" +
				"  measure { name 'ProductStock'; sql 'Products.UnitsInStock'; type 'sum' }\n" +
				"  measure { name 'FreightOnLines'; sql '${CUBE}.Freight'; type 'sum'; filters([[sql: '\"Order Details\".Quantity > 5']]) }\n" +
				"  join { name '\"Order Details\"'; parent 'CUBE'; sql '${CUBE}.OrderID = \"Order Details\".OrderID'; relationship 'one_to_many' }\n" +
				"  join { name 'Products'; parent '\"Order Details\"'; sql '\"Order Details\".ProductID = Products.ProductID'; relationship 'many_to_one' }\n" +
				"}");
	}

	/** Test 13 — the rewrite: the WITH, what goes in it, and what stays outside. */
	@Test
	void ansi_noDoubleCounting_theMultipliedMeasureIsSummedOncePerKey() throws Exception {
		CubeOptions cube = salesLikeCube(true);

		String first = null;
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("TotalFreight", "Revenue"), vendor);
			String text = plainInternals(oneLine(sql), vendor);
			String freight = CubeSqlDialect.quoteAlias("TotalFreight", vendor).replace('`', '"');
			String revenue = CubeSqlDialect.quoteAlias("Revenue", vendor).replace('`', '"');

			assertTrue(text.startsWith("WITH __keys AS ( SELECT DISTINCT Orders.ShipCountry AS d0,"
					+ " Orders.OrderID AS __pk"), "The keys of the main table come first, on " + vendor
							+ ":\n" + sql);
			assertTrue(text.contains("__mult AS ( SELECT k.d0, CAST(SUM(Orders.Freight) AS DECIMAL(31,4)) AS "
					+ freight), "The multiplied measure is summed in __mult, on " + vendor + ":\n" + sql);
			assertTrue(text.contains("FROM __keys k LEFT JOIN Orders ON Orders.OrderID = k.__pk"),
					"__mult reads the main table once per key, on " + vendor + ":\n" + sql);
			assertTrue(text.contains("GROUP BY k.d0"), "__mult groups by the dimension, on " + vendor);

			// Revenue lives on the many side: it is not multiplied and stays an ordinary SUM.
			assertTrue(text.contains("AS " + revenue + " FROM Orders LEFT JOIN \"Order Details\""),
					"Revenue is a plain aggregate in m, on " + vendor + ":\n" + sql);
			assertFalse(text.substring(text.indexOf("__mult AS"), text.indexOf(") SELECT")).contains(revenue),
					"Revenue is not in __mult, on " + vendor + ":\n" + sql);

			assertTrue(text.contains("LEFT JOIN __mult x ON (m.d0 = x.d0 OR (m.d0 IS NULL AND x.d0 IS NULL))"),
					"The join back is NULL-safe and written out, on " + vendor + ":\n" + sql);
			assertTrue(text.endsWith("ORDER BY x.\"TotalFreight\" DESC"),
					"ORDER BY is on the outer query, on " + vendor + ":\n" + sql);

			// THE RULE: the rewrite is standard SQL, so every vendor reads the same.
			if (first == null) first = text;
			else assertEquals(first, text, "The rewrite is ANSI, so " + vendor + " must read the same");
		}

		// Without Revenue nothing brings the one_to_many join in, so nothing is multiplied and the
		// SQL is exactly the shape A–E left behind.
		String alone = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"), List.of("TotalFreight"),
				"postgres");
		assertFalse(alone.contains("WITH"), "No multiplied measure, no rewrite:\n" + alone);
		assertTrue(alone.contains("CAST(SUM(Orders.Freight) AS DECIMAL(31,4))"));
	}

	/** Test 13 — what may and may not go into __mult, and the two shapes around it. */
	@Test
	void ansi_noDoubleCounting_whatGoesIntoTheWith() throws Exception {
		CubeOptions cube = salesLikeCube(true);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			// COUNT DISTINCT, MIN and MAX read the same answer however often a row repeats, so
			// they are never rewritten — even with the multiplying join in the query.
			String sql = plainInternals(oneLine(CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("Revenue", "UniqueCustomers", "MinFreight", "MaxFreight", "TotalFreight"), vendor)),
					vendor);
			String inWith = sql.substring(sql.indexOf("__mult AS"), sql.indexOf(") SELECT"));
			assertTrue(inWith.contains("\"TotalFreight\""), "The sum is in __mult, on " + vendor);
			for (String immune : List.of("\"UniqueCustomers\"", "\"MinFreight\"", "\"MaxFreight\"")) {
				assertFalse(inWith.contains(immune), immune + " is never multiplied, on " + vendor + ":\n" + sql);
			}

			// A filtered multiplied sum keeps its filter inside the aggregate, and a multiplied
			// count with no sql is still COUNT(*) — both inside __mult.
			String filtered = plainInternals(oneLine(CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("Revenue", "BigFreight", "OrderCount"), vendor)), vendor);
			String filteredWith = filtered.substring(filtered.indexOf("__mult AS"), filtered.indexOf(") SELECT"));
			assertTrue(filteredWith.contains(
					"CAST(SUM(CASE WHEN (Orders.Freight > 50) THEN Orders.Freight END) AS DECIMAL(31,4))"),
					"The filter is inside the aggregate in __mult, on " + vendor + ":\n" + filtered);
			assertTrue(filteredWith.contains("COUNT(*)"), "A multiplied count is COUNT(*) in __mult, on " + vendor);

			// Only multiplied measures: there is no ordinary query to join back to.
			String onlyMultiplied = plainInternals(oneLine(CubeSqlGenerator.generateSql(cube,
					List.of("Quantity"), List.of("TotalFreight"), vendor)), vendor);
			assertTrue(onlyMultiplied.contains("FROM __mult x"), "__mult alone, on " + vendor + ":\n" + onlyMultiplied);
			assertFalse(onlyMultiplied.contains("LEFT JOIN __mult"), "Nothing to join back, on " + vendor);
			assertTrue(onlyMultiplied.endsWith("ORDER BY x.\"TotalFreight\" DESC"),
					"ORDER BY reads __mult, on " + vendor);

			// No dimension at all: both sides are one row, and nothing matches them but CROSS JOIN.
			String noDimension = plainInternals(oneLine(CubeSqlGenerator.generateSql(cube, List.of(),
					List.of("TotalFreight", "Revenue"), vendor)), vendor);
			assertTrue(noDimension.contains("CROSS JOIN __mult x"), "One row each, on " + vendor + ":\n" + noDimension);
			assertFalse(noDimension.contains("GROUP BY k."), "Nothing to group by, on " + vendor);
			assertFalse(noDimension.contains("ORDER BY"), "Nothing to order by, on " + vendor);
		}
	}

	/**
	 * Test 13, vendor part — the exact form of the rewrite's internal names, for every vendor key.
	 *
	 * <p>An ANSI regular identifier begins with a letter, so __keys, __mult and __pk are legal only
	 * delimited. Seven engines take them bare; Oracle refuses with ORA-00911 and Db2 with
	 * SQLCODE -20521, which is what GeneratedSqlAllVendorsTest caught on story 13. So on those two
	 * the name is delimited, and nowhere else: a delimited name is case-sensitive, and quoting it
	 * for all nine would change SQL the other seven already run.
	 */
	@Test
	void vendor_internalAlias_exactFormForEveryVendorKey() throws Exception {

		// The table: one row per vendor key - what the rewrite calls its keys CTE.
		Map<String, String> expected = new LinkedHashMap<>();
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "mysql", "mariadb", "sqlserver",
				"clickhouse")) {
			expected.put(vendor, "__keys");
		}
		expected.put("oracle", "\"__keys\"");
		expected.put("db2", "\"__keys\"");

		assertEquals(new LinkedHashSet<>(CubeSqlDialect.VENDOR_KEYS), expected.keySet(),
				"Every vendor key has a row in this table");

		CubeOptions cube = salesLikeCube(true);
		for (Map.Entry<String, String> row : expected.entrySet()) {
			String vendor = row.getKey();

			assertEquals(row.getValue(), CubeSqlDialect.internalAlias("__keys", vendor), "on " + vendor);
			assertEquals(row.getValue().replace("__keys", "__mult"),
					CubeSqlDialect.internalAlias("__mult", vendor), "on " + vendor);

			// And that is the form the rewrite actually writes, in all four places it names them.
			String sql = oneLine(CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("TotalFreight", "Revenue"), vendor));
			String keys = row.getValue();
			String mult = keys.replace("__keys", "__mult");
			String pk = keys.replace("__keys", "__pk");
			assertTrue(sql.startsWith("WITH " + keys + " AS ("), "The CTE is named " + keys + ", on " + vendor
					+ ":\n" + sql);
			assertTrue(sql.contains(" AS " + pk), "The key column is named " + pk + ", on " + vendor);
			assertTrue(sql.contains("FROM " + keys + " k LEFT JOIN"), keys + " is read back, on " + vendor);
			assertTrue(sql.contains("LEFT JOIN " + mult + " x ON"), mult + " is joined back, on " + vendor);
		}
	}

	/** Test 13, the negative half — the three queries the rewrite refuses rather than answers. */
	@Test
	void ansi_noDoubleCounting_refusesWhatItCannotRewrite() throws Exception {
		CubeOptions withKey = salesLikeCube(true);
		CubeOptions withoutKey = salesLikeCube(false);

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			// A multiplied measure on a joined table: Products is repeated by the order lines.
			IllegalArgumentException onJoin = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(withKey, List.of("ShipCountry"),
							List.of("ProductStock", "Revenue"), vendor));
			assertTrue(onJoin.getMessage().contains("ProductStock"), "The message names the measure, on " + vendor);
			assertTrue(onJoin.getMessage().contains("Order Details"), "The message names the join, on " + vendor
					+ ": " + onJoin.getMessage());

			// No primary_key: there is no key to aggregate once per.
			IllegalArgumentException noKey = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(withoutKey, List.of("ShipCountry"),
							List.of("TotalFreight", "Revenue"), vendor));
			assertTrue(noKey.getMessage().contains("TotalFreight"), "The message names the measure, on " + vendor);
			assertTrue(noKey.getMessage().contains("primary_key"), "The message says what to add, on " + vendor
					+ ": " + noKey.getMessage());

			// A multiplied measure whose own filter reads the multiplying table: that condition is
			// not there once per key, so the sum cannot be moved into __mult.
			IllegalArgumentException filterOnJoin = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(withKey, List.of("ShipCountry"),
							List.of("FreightOnLines", "Revenue"), vendor));
			assertTrue(filterOnJoin.getMessage().contains("FreightOnLines"), "The message names the measure, on "
					+ vendor);
			assertTrue(filterOnJoin.getMessage().contains("Order Details"), "The message names the join, on "
					+ vendor + ": " + filterOnJoin.getMessage());
		}
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// POWERFUL AND USER FRIENDLY — what a cube may say, and what comes out
	// ═════════════════════════════════════════════════════════════════════════════

	/**
	 * 14. Several cubes in one file. A file is a folder of cubes, so a request has to say which one
	 * it means — and a request that does not say is answered about the cubes the file holds, never
	 * with "No sql_table", which tells the caller nothing.
	 */
	@Test
	void ansi_severalCubesInOneFile_thePickedOneAnswers() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'Country'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"}\n" +
				"cube('hr') {\n" +
				"  sql_table 'Employees'\n" +
				"  dimension { name 'Title'; sql '${CUBE}.Title'; type 'string' }\n" +
				"}\n" +
				"cube('fin') {\n" +
				"  sql_table 'Ledger'\n" +
				"  dimension { name 'Account'; sql '${CUBE}.Account'; type 'string' }\n" +
				"}";
		CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		for (String name : List.of("", "   ")) {
			assertEquals("Orders", CubeSqlGenerator.pickCube(file, name).getSqlTable(),
					"No name asks for the file's own cube");
		}
		assertEquals("Orders", CubeSqlGenerator.pickCube(file, null).getSqlTable(),
				"and so does no cubeName at all");
		assertEquals("Employees", CubeSqlGenerator.pickCube(file, "hr").getSqlTable(), "A name picks that cube");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(CubeSqlGenerator.pickCube(file, "fin"),
					List.of("Account"), List.of(), vendor);
			assertTrue(sql.contains("FROM " + CubeSqlDialect.quoteIdent("Ledger", vendor)),
					"The picked cube's own table is what is read, on " + vendor + ":\n" + sql);
		}

		IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.pickCube(file, "sales"));
		assertTrue(unknown.getMessage().contains("hr") && unknown.getMessage().contains("fin"),
				"An unknown name is answered with the names the file has: " + unknown.getMessage());

		// A file of named cubes only: nothing answers "the cube", so the request has to choose.
		CubeOptions namedOnly = CubeOptionsParser.parseGroovyCubeDslCode(
				CubeDslSamples.MULTI_DEPARTMENT_DASHBOARD);
		IllegalArgumentException mustChoose = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.pickCube(namedOnly, ""));
		assertFalse(mustChoose.getMessage().contains("sql_table"),
				"and is told which cubes there are, not that a table is missing: " + mustChoose.getMessage());
		for (String name : namedOnly.getNamedOptions().keySet()) {
			assertTrue(mustChoose.getMessage().contains(name), mustChoose.getMessage());
		}
	}

	private static CubeOptions geoCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Stores'\n" +
				"  join { name 'Warehouses'; sql '${CUBE}.WarehouseID = Warehouses.ID'; relationship 'many_to_one' }\n" +
				"  dimension { name 'Spot'; type 'geo'; latitude '${CUBE}.Lat'; longitude '${CUBE}.Lng' }\n" +
				"  dimension { name 'Hub'; type 'geo'; latitude 'Warehouses.Lat'; longitude 'Warehouses.Lng' }\n" +
				"  dimension { name 'City'; sql '${CUBE}.City'; type 'string' }\n" +
				"  measure { name 'Stores'; type 'count' }\n" +
				"}");
	}

	/**
	 * 15. A geo dimension is two columns, because a point on a map is two numbers. It is never one
	 * value to group by, and never something to order by.
	 */
	@Test
	void ansi_geo_isTwoColumnsAndIsNeverOrderedBy() throws Exception {
		CubeOptions cube = geoCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("Spot"), List.of("Stores"), vendor);
			assertTrue(sql.contains("Stores.Lat AS " + CubeSqlDialect.quoteAlias("Spot_lat", vendor)),
					"The latitude is its own column, with ${CUBE} expanded, on " + vendor + ":\n" + sql);
			assertTrue(sql.contains("Stores.Lng AS " + CubeSqlDialect.quoteAlias("Spot_lng", vendor)),
					"and so is the longitude, on " + vendor + ":\n" + sql);
			String group = sql.substring(sql.indexOf("GROUP BY"));
			assertTrue(group.contains("Stores.Lat") && group.contains("Stores.Lng"),
					"Both are grouped by, or the count is one row per shop, on " + vendor + ":\n" + sql);
			String order = sql.substring(sql.indexOf("ORDER BY"));
			assertFalse(order.contains("Lat") || order.contains("Lng") || order.contains("Spot"),
					"and neither coordinate is ordered by: the measure is, on " + vendor + ":\n" + sql);
			assertTrue(order.endsWith(CubeSqlDialect.quoteAlias("Stores", vendor) + " DESC"),
					"the default order steps over the geo dimension, on " + vendor + ":\n" + sql);

			// A geo dimension on a joined table brings its join, like any other field there.
			String joined = CubeSqlGenerator.generateSql(cube, List.of("Hub"), List.of("Stores"), vendor);
			assertTrue(joined.contains("LEFT JOIN " + CubeSqlDialect.quoteIdent("Warehouses", vendor)),
					"A geo dimension on a joined table brings it, on " + vendor + ":\n" + joined);

			// The default order skips it and takes the next thing that has an order.
			String withCity = CubeSqlGenerator.generateSql(cube, List.of("Spot", "City"), List.of(), vendor);
			assertTrue(withCity.endsWith("ORDER BY\n  " + CubeSqlDialect.quoteAlias("City", vendor) + " ASC"),
					"The default order steps over a geo dimension, on " + vendor + ":\n" + withCity);
		}

		CubeOptions half = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Stores'\n" +
				"  dimension { name 'Spot'; type 'geo'; latitude '${CUBE}.Lat' }\n" +
				"}");
		assertTrue(assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.generateSql(half, List.of("Spot"), List.of(), "sqlite"))
				.getMessage().contains("longitude"), "Half a point is refused, and it says which half");

		assertTrue(assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.generateSql(cube, List.of("Spot"), List.of(), List.of(),
						List.of("Spot"), "sqlite")).getMessage().contains("no order"),
				"A request cannot order by a pair of coordinates either");

		CubeOptions ordered = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Stores'\n" +
				"  dimension { name 'Spot'; type 'geo'; latitude '${CUBE}.Lat'; longitude '${CUBE}.Lng'; order 'asc' }\n" +
				"}");
		assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.generateSql(ordered, List.of("Spot"), List.of(), "sqlite"),
				"and neither can the cube");
	}

	private static CubeOptions subQueryCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'customers'\n" +
				"  join { name 'orders'; sql '${CUBE}.id = orders.customer_id'; relationship 'one_to_many' }\n" +
				"  join { name 'lines'; parent 'orders'; sql 'orders.id = lines.order_id'; relationship 'one_to_many' }\n" +
				"  dimension { name 'id'; sql '${CUBE}.id'; type 'number'; primary_key true }\n" +
				"  dimension { name 'orderCount'; sql '${orders.count}'; type 'number'; sub_query true }\n" +
				"  dimension { name 'spend'; sql '${orders.total}'; type 'number'; sub_query true }\n" +
				"  dimension { name 'lineCount'; sql '${lines.count}'; type 'number'; sub_query true }\n" +
				"  dimension { name 'nope'; sql '${orders.nothing}'; type 'number'; sub_query true }\n" +
				"  dimension { name 'country'; sql '${CUBE}.country'; type 'string' }\n" +
				"  measure { name 'customers'; type 'count' }\n" +
				"}\n" +
				"cube('orders') {\n" +
				"  sql_table 'orders'\n" +
				"  measure { name 'total'; sql '${CUBE}.amount'; type 'sum' }\n" +
				"}");
	}

	/**
	 * 16. A sub_query dimension is a number from another table, read once per row of this one. It
	 * cannot double count, because it is not a join — and where a database will not run one in a
	 * SELECT, it is refused by name instead of failing as a database error nobody can act on.
	 */
	@Test
	void ansi_subQuery_isOneNumberPerRowAndNeverAJoin() throws Exception {
		CubeOptions file = subQueryCube();
		CubeOptions cube = CubeSqlGenerator.pickCube(file, "");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			if (!CubeSqlDialect.correlatedSubqueries(vendor)) continue;   // its own test, below

			String orders = CubeSqlDialect.quoteIdent("orders", vendor);
			String customers = CubeSqlDialect.quoteIdent("customers", vendor);
			String expected = "(SELECT COUNT(*) FROM " + orders + " WHERE " + customers + ".id = orders.customer_id)";

			String sql = CubeSqlGenerator.generateSql(cube, List.of("orderCount"), List.of("customers"), vendor);
			assertTrue(sql.contains(expected + " AS d0"),
					"The subquery counts the other table's rows, on " + vendor + ":\n" + sql);
			assertFalse(sql.contains("LEFT JOIN"), "and it is not a join, on " + vendor + ":\n" + sql);
			assertFalse(sql.contains("WITH "), "so nothing has to be rewritten, on " + vendor + ":\n" + sql);
			String group = sql.substring(sql.indexOf("GROUP BY"));
			assertTrue(group.contains("q.d0") && !group.contains("SELECT COUNT(*)"),
					"GROUP BY reads the column, never the subquery again, on " + vendor + ":\n" + sql);

			// The same without a measure: still one inner query, still grouped by the alias.
			String alone = CubeSqlGenerator.generateSql(cube, List.of("orderCount"), List.of(), vendor);
			assertTrue(alone.contains(expected + " AS d0") && alone.substring(alone.indexOf("GROUP BY"))
					.contains("q.d0"), "and without a measure too, on " + vendor + ":\n" + alone);

			// A named cube in the same file lends its measure, cast and all.
			String spend = CubeSqlGenerator.generateSql(cube, List.of("spend"), List.of(), vendor);
			assertTrue(spend.contains("(SELECT CAST(SUM(" + orders + ".amount) AS DECIMAL(31,4)) FROM "
					+ orders + " WHERE " + customers + ".id = orders.customer_id)"),
					"The named cube's own measure is what is read, on " + vendor + ":\n" + spend);

			// A join that hangs off another join is not this cube's to read, and a measure that
			// does not exist is not either.
			for (String broken : List.of("lineCount", "nope")) {
				assertTrue(assertThrows(IllegalArgumentException.class,
						() -> CubeSqlGenerator.generateSql(cube, List.of(broken), List.of(), vendor))
						.getMessage().contains(broken),
						"'" + broken + "' is refused by name, on " + vendor);
			}
		}
	}

	/**
	 * 16, vendor part. ClickHouse will not read the outer row inside a SELECT, so a sub_query
	 * dimension is refused there by name — not sent, to come back as a database error about a
	 * missing column.
	 */
	@Test
	void vendor_subQuery_isRefusedWhereADatabaseWillNotRunOne() throws Exception {
		CubeOptions cube = CubeSqlGenerator.pickCube(subQueryCube(), "");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			if (CubeSqlDialect.correlatedSubqueries(vendor)) {
				assertNotNull(CubeSqlGenerator.generateSql(cube, List.of("orderCount"), List.of(), vendor),
						"Every other database runs one, including " + vendor);
				continue;
			}
			assertEquals("clickhouse", vendor, "Only ClickHouse refuses, and the list says which do");
			IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("orderCount"), List.of(), vendor));
			assertTrue(refused.getMessage().contains("orderCount"),
					"The dimension is named, on " + vendor + ": " + refused.getMessage());
		}
	}

	/**
	 * 17. What the answer is ordered by: what the request says, else what the cube says, else the
	 * rule that makes the first screen useful.
	 */
	@Test
	void ansi_order_theRequestThenTheCubeThenTheRule() throws Exception {
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'Country'; sql '${CUBE}.ShipCountry'; type 'string'; order 'desc' }\n" +
				"  dimension { name 'City'; sql '${CUBE}.ShipCity'; type 'string'; order 'asc' }\n" +
				"  dimension { name 'When'; sql '${CUBE}.OrderDate'; type 'time' }\n" +
				"  dimension { name 'Plain'; sql '${CUBE}.ShipVia'; type 'number' }\n" +
				"  measure { name 'Freight'; sql '${CUBE}.Freight'; type 'sum' }\n" +
				"}");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String country = CubeSqlDialect.quoteAlias("Country", vendor);
			String city = CubeSqlDialect.quoteAlias("City", vendor);

			String declared = CubeSqlGenerator.generateSql(cube, List.of("Country", "City"), List.of(), vendor);
			assertTrue(declared.endsWith("ORDER BY\n  " + country + " DESC,\n  " + city + " ASC"),
					"Each dimension in its own direction, in the order they were picked, on " + vendor
							+ ":\n" + declared);

			String asked = CubeSqlGenerator.generateSql(cube, List.of("Country", "City"), List.of(),
					List.of(), List.of("City desc"), vendor);
			assertTrue(asked.endsWith("ORDER BY\n  " + city + " DESC"),
					"What the request asks for wins over what the cube says, on " + vendor + ":\n" + asked);

			String time = CubeSqlGenerator.generateSql(cube, List.of("Plain", "When"), List.of("Freight"), vendor);
			assertTrue(time.endsWith("ORDER BY\n  " + CubeSqlDialect.quoteAlias("When", vendor) + " ASC"),
					"Nothing declared: time runs forwards, on " + vendor + ":\n" + time);

			String biggest = CubeSqlGenerator.generateSql(cube, List.of("Plain"), List.of("Freight"), vendor);
			assertTrue(biggest.endsWith("ORDER BY\n  " + CubeSqlDialect.quoteAlias("Freight", vendor) + " DESC"),
					"No time dimension: the biggest number first, on " + vendor + ":\n" + biggest);

			String plain = CubeSqlGenerator.generateSql(cube, List.of("Plain"), List.of(), vendor);
			assertTrue(plain.endsWith("ORDER BY\n  " + CubeSqlDialect.quoteAlias("Plain", vendor) + " ASC"),
					"No measure either: the field itself, forwards, on " + vendor + ":\n" + plain);

			assertTrue(assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("Plain"), List.of("Freight"), List.of(),
							List.of("Freight sideways"), vendor)).getMessage().contains("sideways"),
					"A direction that is not one is refused, on " + vendor);
			assertTrue(assertThrows(IllegalArgumentException.class,
					() -> CubeSqlGenerator.generateSql(cube, List.of("Plain"), List.of("Freight"), List.of(),
							List.of("City"), vendor)).getMessage().contains("City"),
					"and so is ordering by something the answer does not return, on " + vendor);
		}

		CubeOptions sideways = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'Country'; sql '${CUBE}.ShipCountry'; type 'string'; order 'sideways' }\n" +
				"}");
		assertTrue(assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.generateSql(sideways, List.of("Country"), List.of(), "sqlite"))
				.getMessage().contains("sideways"), "A cube cannot ask for an order that is not one");
	}

	/**
	 * 18. A table cube may name itself something shorter than its table. Then that name is what
	 * every ${CUBE} becomes, and the FROM clause says it without an AS, which Oracle rejects.
	 */
	@Test
	void ansi_sqlAlias_isWhatEveryCubePlaceholderBecomes() throws Exception {
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'FIN_RECON_STAGING_2024'\n" +
				"  sql_alias 'fin_recon'\n" +
				"  join { name 'Ledger'; sql '${CUBE}.LedgerID = Ledger.ID'; relationship 'many_to_one' }\n" +
				"  dimension { name 'Account'; sql '${CUBE}.Account'; type 'string' }\n" +
				"  dimension { name 'LedgerName'; sql 'Ledger.Name'; type 'string' }\n" +
				"  measure { name 'Amount'; sql '${CUBE}.Amount'; type 'sum' }\n" +
				"  segment { name 'posted'; sql '${CUBE}.Status = 1' }\n" +
				"}");

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String sql = CubeSqlGenerator.generateSql(cube, List.of("Account", "LedgerName"),
					List.of("Amount"), List.of("posted"), vendor);

			assertTrue(sql.contains("FROM " + CubeSqlDialect.quoteIdent("FIN_RECON_STAGING_2024", vendor)
					+ " fin_recon"), "The table is read under its short name, on " + vendor + ":\n" + sql);
			assertFalse(sql.contains("AS fin_recon"),
					"and without an AS, which Oracle refuses, on " + vendor + ":\n" + sql);
			assertTrue(sql.contains("fin_recon.Account") && sql.contains("fin_recon.Amount")
					&& sql.contains("fin_recon.Status = 1") && sql.contains("fin_recon.LedgerID = Ledger.ID"),
					"Every ${CUBE} became it — dimension, measure, segment and join, on " + vendor + ":\n" + sql);
			assertFalse(sql.contains("FIN_RECON_STAGING_2024."),
					"and nothing still spells the table out, on " + vendor + ":\n" + sql);
		}
	}

	/**
	 * 19. The drift guard. Every DSL the tests are written against, every cube in it, every field
	 * on its own: the generator has to produce SQL a database can read, the parser has to say where
	 * each field lives, and the two have to agree about what is broken. A DSL feature taught to one
	 * of them alone fails here instead of reaching a user.
	 */
	@Test
	void ansi_driftGuard_everyDslFeatureGeneratesAndTheFoldersAgree() throws Exception {
		Map<String, String> dsls = new LinkedHashMap<>(CubeDslSamples.all());
		dsls.put("ERROR_CASES", CubeDslSamples.ERROR_CASES);

		int fields = 0;
		for (Map.Entry<String, String> entry : dsls.entrySet()) {
			CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(entry.getValue());

			Map<String, CubeOptions> cubes = new LinkedHashMap<>();
			if (file.getSqlTable() != null || file.getSql() != null) cubes.put("", file);
			if (file.getNamedOptions() != null) cubes.putAll(file.getNamedOptions());

			for (Map.Entry<String, CubeOptions> one : cubes.entrySet()) {
				CubeOptions cube = CubeSqlGenerator.pickCube(file, one.getKey());
				String where = entry.getKey() + " / " + (one.getKey().isEmpty() ? "(unnamed)" : one.getKey());

				// What the parser says is wrong with a member, and what the generator says when it
				// is asked for that member alone, is the same list.
				for (String block : List.of("dimension", "measure", "segment")) {
					for (Map<String, Object> member : membersOf(cube, block)) {
						String name = Objects.toString(member.get("name"), "");
						if (name.isEmpty()) continue;
						fields++;

						String parserSaid = errorOf(file, one.getKey(), block, name);
						String generatorSaid = null;
						String sql = null;
						try {
							sql = "segment".equals(block)
									? CubeSqlGenerator.generateSql(cube, List.of(), List.of(), List.of(name), "sqlite")
									: "measure".equals(block)
											? CubeSqlGenerator.generateSql(cube, List.of(), List.of(name), "sqlite")
											: CubeSqlGenerator.generateSql(cube, List.of(name), List.of(), "sqlite");
						} catch (IllegalArgumentException refused) {
							generatorSaid = refused.getMessage();
						}
						assertEquals(parserSaid, generatorSaid,
								"The parser and the generator disagree about " + block + " '" + name
										+ "' of " + where);
						if (generatorSaid != null) continue;

						assertFalse(sql.contains("${"),
								"Nothing unresolved reaches the database — " + block + " '" + name + "' of "
										+ where + ":\n" + sql);
						if (!"segment".equals(block) && member.get("sql") == null) {
							assertFalse(sql.matches("(?s).*[\\s,(]" + Pattern.quote(name) + " AS .*"),
									"A " + block + " with no sql of its own is not a column named after "
											+ "itself — '" + name + "' of " + where + ":\n" + sql);
						}

						// The folder the field picker shows and the FROM clause say the same thing.
						if ("dimension".equals(block)) {
							String table = Objects.toString(cube.getDimensionTables().get(name), "");
							if (table.isEmpty()) {
								assertFalse(sql.contains("JOIN"), "'" + name + "' of " + where
										+ " is on the cube's own table, so nothing is joined:\n" + sql);
							} else {
								assertTrue(sql.contains("JOIN " + table.replace("\"", "")
										.replace("`", "")) || sql.contains("JOIN " + table),
										"'" + name + "' of " + where + " lives on " + table
												+ ", so that table is joined:\n" + sql);
							}
						}
					}
				}
			}
		}
		assertTrue(fields > 80, "Every field of every sample was tried, not a handful: " + fields);
	}

	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> membersOf(CubeOptions cube, String block) {
		List<Map<String, Object>> members = "dimension".equals(block) ? cube.getDimensions()
				: "measure".equals(block) ? cube.getMeasures() : cube.getSegments();
		return members == null ? List.of() : members;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// The structured query: value filters, order, row limit, and the values the
	// query binds instead of writing into the statement.
	// ─────────────────────────────────────────────────────────────────────────

	/** A cube with one of each kind of dimension, and a join nothing selects. */
	private static CubeOptions filterCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
				"  dimension { name 'ShipCountry'; sql '${CUBE}.ShipCountry'; type 'string' }\n" +
				"  dimension { name 'OrderDate'; sql '${CUBE}.OrderDate'; type 'time' }\n" +
				"  dimension { name 'Shipped'; sql '${CUBE}.Shipped'; type 'boolean' }\n" +
				"  dimension { name 'Quantity'; sql '${CUBE}.Quantity'; type 'number' }\n" +
				"  dimension { name 'ProductName'; sql 'Products.ProductName'; type 'string' }\n" +
				"  measure { name 'Revenue'; sql '${CUBE}.Freight'; type 'sum' }\n" +
				"  measure { name 'OrderCount'; type 'count' }\n" +
				"  join { name 'Products'; parent 'CUBE'; sql '${CUBE}.ProductID = Products.ProductID'; relationship 'many_to_one' }\n" +
				"}");
	}

	/** One filter, as the request writes it. */
	private static Map<String, Object> filter(String member, String operator, Object... values) {
		Map<String, Object> one = new LinkedHashMap<>();
		one.put("member", member);
		one.put("operator", operator);
		one.put("values", Arrays.asList(values));
		return one;
	}

	/** A request, as a map, from alternating key/value pairs. */
	private static Map<String, Object> request(Object... keysAndValues) {
		Map<String, Object> asked = new LinkedHashMap<>();
		for (int i = 0; i < keysAndValues.length; i += 2) {
			asked.put(keysAndValues[i].toString(), keysAndValues[i + 1]);
		}
		return asked;
	}

	/** Test 22 — the structured query and its value filters. */
	@Test
	void ansi_structuredQuery_filtersWhereAndHavingAndTheOldListsAgree() throws Exception {
		CubeOptions cube = filterCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {

			// The old three lists and the new request say the same thing.
			String oldWay = CubeSqlGenerator.generateSql(cube, List.of("ShipCountry"),
					List.of("Revenue"), List.of(), vendor);
			String newWay = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue")),
					vendor).toInlineSql(vendor);
			assertEquals(oldWay, newWay, "The two request forms give the same SQL, on " + vendor);
			assertEquals(oldWay, CubeSqlGenerator.buildQuery(cube,
					request("selectedDimensions", List.of("ShipCountry"), "selectedMeasures", List.of("Revenue")),
					vendor).toInlineSql(vendor),
					"The old keys are still read, on " + vendor);

			// A granularity, glued to the name or in the map: the same query either way.
			assertEquals(
					CubeSqlGenerator.buildQuery(cube,
							request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue")),
							vendor).toInlineSql(vendor),
					CubeSqlGenerator.buildQuery(cube,
							request("dimensions", List.of("OrderDate"), "measures", List.of("Revenue"),
									"granularities", Map.of("OrderDate", "month")),
							vendor).toInlineSql(vendor),
					"The suffix and the granularities map are the same request, on " + vendor);

			// in, and its values bound one by one under a single number.
			CubeQuery in = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(filter("ShipCountry", "in", "Germany", "France"))),
					vendor);
			assertTrue(oneLine(ansiText(in.getSql())).contains(
					"WHERE Orders.ShipCountry IN (:cf1_0, :cf1_1)"),
					"in is a WHERE with one placeholder per value, on " + vendor + ":\n" + in.getSql());
			assertEquals(List.of("cf1_0", "cf1_1"), List.copyOf(in.getParams().keySet()));
			assertEquals("Germany", in.getParams().get("cf1_0"));

			// notIn, gte and lte on a dimension; a measure filter is a HAVING.
			CubeQuery more = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(
									filter("ShipCountry", "notIn", "Spain"),
									filter("Quantity", "gte", 5),
									filter("Quantity", "lte", 50),
									filter("Revenue", "gte", 10000))),
					vendor);
			String text = oneLine(ansiText(more.getSql()));
			assertTrue(text.contains("Orders.ShipCountry NOT IN (:cf1_0)"),
					"notIn, on " + vendor + ":\n" + more.getSql());
			assertTrue(text.contains("Orders.Quantity >= :cf2"), "gte, on " + vendor);
			assertTrue(text.contains("Orders.Quantity <= :cf3"), "lte, on " + vendor);
			assertTrue(text.contains("HAVING CAST(SUM(Orders.Freight) AS DECIMAL(31,4)) >= :cf4"),
					"A measure filter is a HAVING, on " + vendor + ":\n" + more.getSql());
			assertTrue(text.indexOf("WHERE") < text.indexOf("HAVING"),
					"The WHERE narrows the rows before the HAVING narrows the answers, on " + vendor);
			assertEquals(new BigDecimal("10000"), more.getParams().get("cf4"),
					"A number filter binds a number, on " + vendor);

			// set and notSet ask about nothing at all, so they bind nothing.
			CubeQuery emptiness = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(filter("ShipCountry", "set"), filter("Quantity", "notSet"))),
					vendor);
			assertTrue(oneLine(ansiText(emptiness.getSql())).contains(
					"WHERE Orders.ShipCountry IS NOT NULL AND Orders.Quantity IS NULL"),
					"set and notSet, on " + vendor + ":\n" + emptiness.getSql());
			assertTrue(emptiness.getParams().isEmpty(), "Nothing to bind, on " + vendor);

			// A time range includes its last day, so the upper end is the day after, excluded, and
			// the comparison is with the column itself and never with the truncated one.
			CubeQuery range = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue"),
							"filters", List.of(filter("OrderDate", "between", "2024-01-01", "2024-06-30"))),
					vendor);
			String dateExpr = CubeSqlDialect.timeValue("Orders.OrderDate", vendor);
			assertTrue(oneLine(range.getSql()).contains(
					"(" + oneLine(dateExpr) + " >= :cf1 AND " + oneLine(dateExpr) + " < :cf2)"),
					"A time range compares the untruncated column, on " + vendor + ":\n" + range.getSql());
			assertEquals("2024-07-01", range.getParams().get("cf2").toString(),
					"The upper end is the day after, on " + vendor);

			// One end may be left open.
			CubeQuery open = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(filter("OrderDate", "between", "2024-01-01", null))),
					vendor);
			assertEquals(1, open.getParams().size(), "An open end binds nothing, on " + vendor);
			assertFalse(oneLine(open.getSql()).contains("< :cf"), "and compares nothing, on " + vendor);

			// A filter brings its dimension's joins, selected or not.
			CubeQuery unselected = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(filter("ProductName", "in", "Chai"))),
					vendor);
			assertTrue(ansiText(unselected.getSql()).contains("LEFT JOIN Products ON"),
					"A filter on an unselected dimension brings its join, on " + vendor + ":\n"
							+ unselected.getSql());
		}

		// What the request may not ask for.
		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
						"filters", List.of(filter("ShipCountry", "startsWith", "G"))),
				"postgres")).getMessage().contains("which is not an operator"));

		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
						"filters", List.of(filter("Quantity", "gte", "abc"))),
				"postgres")).getMessage().contains("'Quantity'"),
				"A value that does not convert names the member it was meant for");

		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
						"filters", List.of(filter("Nowhere", "in", "x"))),
				"postgres")).getMessage().contains("no dimension or measure of that name"));

		// A measure the rewrite moved into its own query is read as a column, so its filter is a
		// WHERE on the outer query and says exactly what the HAVING said.
		CubeQuery multiplied = CubeSqlGenerator.buildQuery(salesLikeCube(true),
				request("dimensions", List.of("ShipCountry"), "measures", List.of("TotalFreight", "Revenue"),
						"filters", List.of(filter("TotalFreight", "gte", 100))),
				"postgres");
		assertFalse(multiplied.getSql().contains("HAVING"), "The rewrite has no HAVING:\n" + multiplied.getSql());
		assertTrue(oneLine(multiplied.getSql()).contains("WHERE x.\"TotalFreight\" >= :cf1"),
				"It filters the column the rewrite produced:\n" + multiplied.getSql());
	}

	/** Test 22, vendor part — the exact "contains" form and escape for every vendor key. */
	@Test
	void vendor_containsFilter_exactFormForEveryVendorKey() throws Exception {
		CubeOptions cube = filterCube();

		// The table: one row per vendor key — the LIKE clause, and "50%" escaped for binding.
		Map<String, List<String>> expected = new LinkedHashMap<>();
		List<String> withEscape = List.of("Orders.ShipCountry LIKE :cf1 ESCAPE '!'", "%50!%%");
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "mysql", "mariadb",
				"sqlserver", "oracle", "db2")) {
			expected.put(vendor, withEscape);
		}
		expected.put("clickhouse", List.of("Orders.ShipCountry LIKE :cf1", "%50\\%%"));

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			List<String> row = expected.get(vendor);
			assertNotNull(row, "No expected contains form written down for vendor key '" + vendor + "'");

			CubeQuery query = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(filter("ShipCountry", "contains", "50%"))),
					vendor);
			assertTrue(oneLine(ansiText(query.getSql())).contains(row.get(0)),
					"The contains form on " + vendor + ":\n" + query.getSql());
			assertEquals(row.get(1), query.getParams().get("cf1"),
					"The bound value is escaped the way " + vendor + " reads it");
		}

		// The negative half: the two escapes really differ, so a row copied from the wrong vendor
		// could not pass by accident.
		assertNotEquals(CubeSqlDialect.likeValue("50%", "clickhouse"),
				CubeSqlDialect.likeValue("50%", "postgres"));
	}

	/** Test 23 — what the answer is ordered by, and how many rows it returns. */
	@Test
	void ansi_order_andRowLimit_areAskedForByTheRequest() throws Exception {
		CubeOptions cube = filterCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String measure = CubeSqlDialect.quoteAlias("Revenue", vendor).replace('`', '"');

			CubeQuery asked = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"order", List.of(Map.of("member", "Revenue", "dir", "desc"))),
					vendor);
			assertTrue(oneLine(ansiText(asked.getSql())).contains("ORDER BY " + measure + " DESC"),
					"The request's order wins, on " + vendor + ":\n" + asked.getSql());
		}

		// A time dimension asked for at a granularity is ordered by under either name: the glued
		// one the dimensions list uses, and the plain one the answer's column carries. Both mean
		// the one column the answer returns, so both give the same ORDER BY.
		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			String glued = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue"),
							"order", List.of(Map.of("member", "OrderDate.month", "dir", "asc"))),
					vendor).getSql();
			String plain = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue"),
							"order", List.of(Map.of("member", "OrderDate", "dir", "asc"))),
					vendor).getSql();
			assertEquals(oneLine(ansiText(plain)), oneLine(ansiText(glued)),
					"OrderDate.month and OrderDate order the same answer, on " + vendor);
			assertTrue(oneLine(ansiText(glued)).contains("ORDER BY"),
					"and the answer is ordered, on " + vendor + ":\n" + glued);
		}

		// The suffix is not a way in for anything else: a granularity on a dimension the answer
		// does not return is still refused, and so is one that is not a granularity at all.
		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue"),
						"order", List.of(Map.of("member", "ShipCountry.month", "dir", "asc"))),
				"postgres")).getMessage().contains("not one of the fields it returns"));

		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("OrderDate.month"), "measures", List.of("Revenue"),
						"order", List.of(Map.of("member", "OrderDate.fortnight", "dir", "asc"))),
				"postgres")).getMessage().contains("not one of the fields it returns"));

		// A member the answer does not return, and a geo dimension, are both refused.
		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
						"order", List.of(Map.of("member", "OrderCount", "dir", "desc"))),
				"postgres")).getMessage().contains("not one of the fields it returns"));

		assertTrue(assertThrows(IllegalArgumentException.class, () -> CubeSqlGenerator.buildQuery(geoCube(),
				request("dimensions", List.of("Spot"), "measures", List.of("Stores"),
						"order", List.of(Map.of("member", "Spot", "dir", "asc"))),
				"postgres")).getMessage().contains("pair of coordinates has no order"));
	}

	/** Test 23, vendor part — the exact row-limit form for every vendor key. */
	@Test
	void vendor_limitClause_exactFormForEveryVendorKey() throws Exception {
		CubeOptions cube = filterCube();

		// The table: one row per vendor key — what a limit of 10 puts after SELECT, and what it
		// puts at the end of the statement.
		Map<String, List<String>> expected = new LinkedHashMap<>();
		for (String vendor : List.of("sqlite", "duckdb", "postgres", "mysql", "mariadb", "clickhouse")) {
			expected.put(vendor, List.of("", "LIMIT 10"));
		}
		expected.put("oracle", List.of("", "FETCH FIRST 10 ROWS ONLY"));
		expected.put("db2", List.of("", "FETCH FIRST 10 ROWS ONLY"));
		expected.put("sqlserver", List.of(" TOP 10", ""));

		List<String> keys = new java.util.ArrayList<>(CubeSqlDialect.VENDOR_KEYS);
		keys.add(CubeSqlDialect.DEFAULT_KEY);
		expected.put(CubeSqlDialect.DEFAULT_KEY, List.of("", "FETCH FIRST 10 ROWS ONLY"));

		for (String vendor : keys) {
			List<String> row = expected.get(vendor);
			assertNotNull(row, "No expected row limit written down for vendor key '" + vendor + "'");

			String sql = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"), "limit", 10),
					vendor).toInlineSql(vendor);
			assertTrue(oneLine(ansiText(sql)).startsWith("SELECT" + row.get(0) + " "),
					"What a limit puts after SELECT, on " + vendor + ":\n" + sql);
			assertTrue(ansiText(sql).endsWith(row.get(1).isEmpty() ? "DESC" : row.get(1)),
					"What a limit puts at the end, on " + vendor + ":\n" + sql);

			// The fan-out form is limited on its outer query, where the answer's rows are.
			String fanOut = CubeSqlGenerator.buildQuery(salesLikeCube(true),
					request("dimensions", List.of("ShipCountry"),
							"measures", List.of("TotalFreight", "Revenue"), "limit", 10),
					vendor).toInlineSql(vendor);
			assertTrue(oneLine(ansiText(fanOut)).contains(") SELECT" + row.get(0) + " m.d0 AS "),
					"The outer query of the rewrite carries the limit, on " + vendor + ":\n" + fanOut);
			assertTrue(ansiText(fanOut).endsWith(row.get(1).isEmpty() ? "DESC" : row.get(1)),
					"and so does its end, on " + vendor + ":\n" + fanOut);

			// No limit asked for, none written.
			String plain = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue")),
					vendor).toInlineSql(vendor);
			assertFalse(plain.contains("LIMIT") || plain.contains("FETCH FIRST") || plain.contains(" TOP "),
					"No limit unless the request asks for one, on " + vendor + ":\n" + plain);
		}
	}

	/** Test 24, vendor part — the exact literal for every vendor key, and the inline rendering. */
	@Test
	void vendor_sqlLiteral_exactFormForEveryVendorKey() throws Exception {

		// The table: one row per vendor key, in the order
		// text with ' and \ | number | true | date | timestamp
		Map<String, List<String>> expected = new LinkedHashMap<>();
		List<String> ansi = List.of("'O''Br\\ien'", "12.5", "TRUE",
				"DATE '2024-01-31'", "TIMESTAMP '2024-01-31 18:00:00'");
		List<String> doubledSlash = List.of("'O''Br\\\\ien'", "12.5", "TRUE",
				"DATE '2024-01-31'", "TIMESTAMP '2024-01-31 18:00:00'");
		expected.put("duckdb", ansi);
		expected.put("postgres", ansi);
		expected.put("mysql", doubledSlash);
		expected.put("mariadb", doubledSlash);
		expected.put("clickhouse", doubledSlash);
		expected.put("oracle", List.of("'O''Br\\ien'", "12.5", "1",
				"DATE '2024-01-31'", "TIMESTAMP '2024-01-31 18:00:00'"));
		expected.put("db2", List.of("'O''Br\\ien'", "12.5", "1",
				"DATE '2024-01-31'", "TIMESTAMP '2024-01-31 18:00:00'"));
		expected.put("sqlite", List.of("'O''Br\\ien'", "12.5", "1",
				"'2024-01-31'", "'2024-01-31 18:00:00'"));
		expected.put("sqlserver", List.of("'O''Br\\ien'", "12.5", "1",
				"'2024-01-31'", "'2024-01-31 18:00:00'"));

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			List<String> row = expected.get(vendor);
			assertNotNull(row, "No expected literal written down for vendor key '" + vendor + "'");

			assertEquals(row.get(0), CubeSqlDialect.sqlLiteral("O'Br\\ien", vendor),
					"A quote and a backslash, on " + vendor);
			assertEquals(row.get(1), CubeSqlDialect.sqlLiteral(new BigDecimal("12.5"), vendor),
					"A number, on " + vendor);
			assertEquals(row.get(2), CubeSqlDialect.sqlLiteral(Boolean.TRUE, vendor),
					"True, on " + vendor);
			assertEquals(row.get(3), CubeSqlDialect.sqlLiteral(LocalDate.parse("2024-01-31"), vendor),
					"A date, on " + vendor);
			assertEquals(row.get(4),
					CubeSqlDialect.sqlLiteral(LocalDateTime.parse("2024-01-31T18:00:00"), vendor),
					"A timestamp, on " + vendor);
			assertEquals("NULL", CubeSqlDialect.sqlLiteral(null, vendor), "Nothing, on " + vendor);
		}

		// The negative half: a boolean really is written differently, so a row copied from the
		// wrong vendor could not pass by accident.
		assertNotEquals(CubeSqlDialect.sqlLiteral(Boolean.TRUE, "sqlite"),
				CubeSqlDialect.sqlLiteral(Boolean.TRUE, "postgres"));
	}

	/** Test 24 — the bound query and the one design time shows say the same thing. */
	@Test
	void ansi_toInlineSql_isTheBoundQueryWithItsValuesWrittenIn() throws Exception {
		CubeOptions cube = filterCube();

		for (String vendor : CubeSqlDialect.VENDOR_KEYS) {
			CubeQuery query = CubeSqlGenerator.buildQuery(cube,
					request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
							"filters", List.of(
									filter("ShipCountry", "in", "Germany", "France"),
									filter("Quantity", "gte", 5),
									filter("OrderDate", "between", "2024-01-01", "2024-06-30"))),
					vendor);

			// The values are typed by the member they filter, not left as the text they arrived as.
			assertEquals("Germany", query.getParams().get("cf1_0"));
			assertEquals(new BigDecimal("5"), query.getParams().get("cf2"));
			assertEquals("sqlite".equals(vendor) ? "2024-01-01" : LocalDate.parse("2024-01-01"),
					query.getParams().get("cf3"), "A time value is a date, on " + vendor);

			String inline = query.toInlineSql(vendor);
			assertFalse(inline.contains(":cf"), "Nothing is left to bind, on " + vendor + ":\n" + inline);

			String byHand = query.getSql();
			for (Map.Entry<String, Object> bound : query.getParams().entrySet()) {
				byHand = byHand.replace(":" + bound.getKey(),
						CubeSqlDialect.sqlLiteral(bound.getValue(), vendor));
			}
			assertEquals(byHand, inline, "Inline is the bound query with its values written in, on " + vendor);

			// :cf1 does not eat the start of :cf1_0 — the longer name goes first.
			assertTrue(inline.contains(CubeSqlDialect.sqlLiteral("France", vendor)),
					"The second value of the IN list is there too, on " + vendor + ":\n" + inline);
		}

		// Past nine values the names are two digits, and :cf1 is the start of :cf11: the longer
		// name has to be written in first, or the eleventh value comes out as the first one's
		// digits with a 1 stuck on the end.
		List<Map<String, Object>> eleven = new ArrayList<>();
		for (int i = 1; i <= 11; i++) {
			eleven.add(filter("Quantity", "gte", 20 + i));
		}
		CubeQuery many = CubeSqlGenerator.buildQuery(cube,
				request("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"),
						"filters", eleven),
				"sqlite");
		assertEquals(new BigDecimal("31"), many.getParams().get("cf11"),
				"The eleventh value is bound under a two-digit name");
		String manyInline = many.toInlineSql("sqlite");
		for (int i = 1; i <= 11; i++) {
			assertTrue(manyInline.contains(" >= " + (20 + i)),
					"Value " + i + " is written in whole:\n" + manyInline);
		}
	}

	/** Test 20 — the databases a person can pick, and how a request says which one it wants. */
	@Test
	void vendor_dialects_areTheListTheScreenShowsAndTheRequestAsksFor() {

		// The list, in the connection screen's order, key and label.
		List<List<String>> expected = List.of(
				List.of("oracle", "Oracle"),
				List.of("sqlserver", "SQL Server"),
				List.of("postgres", "PostgreSQL / Supabase / TimescaleDB"),
				List.of("mysql", "MySQL / MariaDB"),
				List.of("db2", "IBM Db2"),
				List.of("sqlite", "SQLite"),
				List.of("duckdb", "DuckDB"),
				List.of("clickhouse", "ClickHouse"));

		assertEquals(expected.size(), CubeSqlDialect.DIALECTS.size(),
				"One entry per distinct SQL this generator writes:\n" + CubeSqlDialect.DIALECTS);
		for (int i = 0; i < expected.size(); i++) {
			Map<String, String> entry = CubeSqlDialect.DIALECTS.get(i);
			assertEquals(expected.get(i).get(0), entry.get("key"), "Entry " + i + "'s key");
			assertEquals(expected.get(i).get(1), entry.get("label"), "Entry " + i + "'s label");
		}

		// Every entry is a key the per-vendor tables above write a row for (they loop over
		// VENDOR_KEYS and fail on a key with no row), and every key is reachable from the list,
		// itself or through an alias. So a vendor added to this layer either appears in the
		// screen's list with its forms written down, or a test here goes red.
		List<String> listed = new ArrayList<>();
		for (Map<String, String> entry : CubeSqlDialect.DIALECTS) listed.add(entry.get("key"));
		for (String key : listed) {
			assertTrue(CubeSqlDialect.VENDOR_KEYS.contains(key),
					"The list offers '" + key + "', which is not a vendor key: " + CubeSqlDialect.VENDOR_KEYS);
		}
		// MariaDB keeps its own key, because a few of its forms are its own, but it is not its own
		// entry: a person picks "MySQL / MariaDB", whose label has to name it.
		Map<String, String> folded = Map.of("mariadb", "mysql");
		for (String key : CubeSqlDialect.VENDOR_KEYS) {
			String shown = folded.getOrDefault(CubeSqlDialect.key(key), CubeSqlDialect.key(key));
			assertTrue(listed.contains(shown),
					"Vendor key '" + key + "' is in no entry of the list: " + listed);
		}
		for (Map.Entry<String, String> fold : folded.entrySet()) {
			String label = CubeSqlDialect.DIALECTS.get(listed.indexOf(fold.getValue())).get("label");
			assertTrue(label.toLowerCase().contains(fold.getKey()),
					"'" + fold.getValue() + "' is the entry '" + fold.getKey() + "' is folded into, "
							+ "so its label has to name it: " + label);
		}
		// The aliases the tables above test resolve to a listed key, so the label that names them
		// (Supabase, TimescaleDB, MariaDB) is telling the truth.
		for (String alias : List.of("postgresql", "supabase", "timescaledb", "mssql", "ibmdb2")) {
			assertTrue(listed.contains(CubeSqlDialect.key(alias)),
					"Alias '" + alias + "' resolves to " + CubeSqlDialect.key(alias) + ", which is not listed");
		}

		// Which dialect a generate-sql request asks for. Null means "the connection says".
		assertEquals("oracle", CubeSqlDialect.requestedKey(null, "oracle"),
				"dbVendor alone is the dialect");
		assertEquals("postgres", CubeSqlDialect.requestedKey(null, "Supabase"),
				"An alias is the dialect it is an alias of");
		assertEquals(CubeSqlDialect.DEFAULT_KEY, CubeSqlDialect.requestedKey(null, null),
				"Neither: plain ANSI, as before");
		assertEquals(CubeSqlDialect.DEFAULT_KEY, CubeSqlDialect.requestedKey("  ", " "),
				"Blank is not sent");
		assertEquals(CubeSqlDialect.DEFAULT_KEY, CubeSqlDialect.requestedKey(null, "default"),
				"The default asked for by name is the default");
		assertNull(CubeSqlDialect.requestedKey("northwind", null),
				"A connection alone: the caller looks its database up");

		IllegalArgumentException both = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlDialect.requestedKey("northwind", "oracle"));
		assertTrue(both.getMessage().contains("send connectionId or dbVendor, not both"),
				"Both sent, refused in those words: " + both.getMessage());

		IllegalArgumentException unknown = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlDialect.requestedKey(null, "teradata"));
		assertTrue(unknown.getMessage().contains("teradata"),
				"The refusal names what was sent: " + unknown.getMessage());
		for (String key : CubeSqlDialect.VENDOR_KEYS) {
			assertTrue(unknown.getMessage().contains(key),
					"The refusal lists the known key '" + key + "': " + unknown.getMessage());
		}
	}

	/** What the parser says is wrong with one member, or null when it says nothing. */
	private static String errorOf(CubeOptions file, String cubeName, String block, String member) {
		for (Map<String, Object> warning : file.getWarnings()) {
			if (!"error".equals(warning.get("level"))) continue;
			if (!cubeName.equals(Objects.toString(warning.get("cube"), ""))) continue;
			if (!block.equals(warning.get("block")) || !member.equals(warning.get("member"))) continue;
			return warning.get("message").toString();
		}
		return null;
	}
}

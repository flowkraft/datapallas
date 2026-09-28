package com.flowkraft.reporting.dsl;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;

/**
 * Business use-case tests for the Cube Groovy DSL.
 *
 * Each test is a real-world scenario that a DataPallas user would configure
 * in their {reportCode}-cube-config.groovy file:
 *
 *   GETTING STARTED — first cubes a new user creates
 *     #1   CRM Customer List             — simplest useful cube
 *     #2   E-Commerce Revenue Dashboard  — KPI measures with drill-down
 *     #3   Completed Orders Report       — custom SQL + filtered measures
 *
 *   JOINS — connecting related tables
 *     #4   Customer 360 with Order Stats — sub_query dimension for nested aggregation
 *     #5   Product Sales Star Schema     — fact table joining two dimension tables
 *
 *   RICH DIMENSIONS — beyond simple columns
 *     #6   Clothing Store Size Labels    — case_ for conditional value mapping
 *     #7   Delivery Fleet Tracker        — geo dimensions for map visualization
 *     #8   Retail Chain Store Locator    — hierarchies for geographic drill-down
 *
 *   GOVERNANCE & REUSE
 *     #9   Finance Internal Staging Cube — hidden cube with sql_alias
 *     #10  Regional Orders (extends)     — inherit from base cube
 *
 *   MULTI-CUBE & KITCHEN SINK
 *     #11  Multi-Department Dashboard    — two named cubes in one config
 *     #12  Sales Pipeline Full Model     — every feature combined
 *     #13  Empty Config Fallback         — graceful defaults
 *
 *   THE VIEWER'S OWN FILTERS
 *     #16  Filter lists (filter_options)  — a dimension says where its values come from
 *
 * <p><b>📖 Tests are the regression net for the DSL syntax contract.</b>
 * Every test fixture uses canonical block form. Adding a test that uses the
 * legacy parens/list-of-maps form silently weakens the contract — refuse it
 * in review. See
 * {@link com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme#iAmImportantReadme()}
 * for the full principles.
 */
public class CubeOptionsParserTest {

    static { com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme.iAmImportantReadme(); }


	// ═════════════════════════════════════════════════════════════════════════════
	// GETTING STARTED — First cubes a new user would create
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #1  CRM Customer List
	//     A sales rep wants to explore their customer table — just list who's in
	//     the database with name, country, and a count. The simplest useful cube.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testCrmCustomerList() throws Exception {
		String dsl = CubeDslSamples.CRM_CUSTOMER_LIST;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("public.customers", result.getSqlTable());
		assertEquals("Customers", result.getTitle());
		assertEquals("All registered customers", result.getDescription());

		List<Map<String, Object>> dims = result.getDimensions();
		assertEquals(3, dims.size());
		assertEquals(true, dims.get(0).get("primary_key"));
		assertEquals("string", dims.get(1).get("type"));
		// Default sort on country dimension
		assertEquals("asc", dims.get(2).get("order"));

		assertEquals(1, result.getMeasures().size());
		assertEquals("count", result.getMeasures().get(0).get("type"));

		assertTrue(result.getJoins().isEmpty());
		assertTrue(result.getSegments().isEmpty());
		assertTrue(result.getHierarchies().isEmpty());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #2  E-Commerce Revenue Dashboard
	//     The dashboard every online store has: how many orders, total revenue,
	//     average order value. The count measure has drill_members so the user
	//     can click on the number and see the underlying orders.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testEcommerceRevenueDashboard() throws Exception {
		String dsl = CubeDslSamples.ECOMMERCE_REVENUE_DASHBOARD;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Orders", result.getTitle());
		assertEquals("shopping-cart", result.getMeta().get("icon"));

		// Time dimension with default sort descending (newest first)
		assertEquals("desc", result.getDimensions().get(2).get("order"));

		// Drill-down on count measure — click to see underlying orders
		List<Map<String, Object>> meas = result.getMeasures();
		assertEquals(5, meas.size());
		List<String> drillMembers = (List<String>) meas.get(0).get("drill_members");
		assertNotNull(drillMembers);
		assertEquals(3, drillMembers.size());
		assertEquals("order_id", drillMembers.get(0));
		assertEquals("status", drillMembers.get(1));
		assertEquals("created_at", drillMembers.get(2));

		// Revenue measures with currency format
		assertEquals("currency", meas.get(1).get("format"));
		assertEquals("avg", meas.get(2).get("type"));

		// Analysis measures - a share of the total and the same months a year earlier
		assertEquals(Boolean.TRUE, meas.get(3).get("share_of_total"));
		assertEquals("percent", meas.get(3).get("format"));
		assertEquals("1 year",
				((Map<String, Object>) meas.get(4).get("time_shift")).get("interval"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #3  Completed Orders Report
	//     Accounting needs total orders AND completed orders side by side.
	//     The completed_count measure uses a filter — only counts rows where
	//     status = 'completed'. This is the most common measure filter pattern.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testCompletedOrdersFilteredKpis() throws Exception {
		String dsl = CubeDslSamples.COMPLETED_ORDERS_FILTERED_KPIS;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertNull(result.getSqlTable());
		assertTrue(result.getSql().contains("2024-01-01"));
		assertEquals("Orders 2024+", result.getTitle());

		List<Map<String, Object>> meas = result.getMeasures();
		assertEquals(3, meas.size());

		// Unfiltered total
		assertEquals("total_orders", meas.get(0).get("name"));
		assertNull(meas.get(0).get("filters"));

		// Filtered: only completed
		assertEquals("completed_count", meas.get(1).get("name"));
		List<Map<String, Object>> filters1 = (List<Map<String, Object>>) meas.get(1).get("filters");
		assertNotNull(filters1);
		assertEquals(1, filters1.size());
		assertTrue(((String) filters1.get(0).get("sql")).contains("completed"));

		// Filtered: only high-value
		List<Map<String, Object>> filters2 = (List<Map<String, Object>>) meas.get(2).get("filters");
		assertEquals(1, filters2.size());
		assertTrue(((String) filters2.get(0).get("sql")).contains("500"));
		assertEquals("currency", meas.get(2).get("format"));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// JOINS — Connecting related tables
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #4  Customer 360 with Order Stats
	//     Support team wants each customer with their order count displayed as
	//     a dimension (not a measure). The sub_query dimension pulls the count
	//     from the orders cube — enabling "avg orders per customer" in pivots.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testCustomer360WithOrderStats() throws Exception {
		String dsl = CubeDslSamples.CUSTOMER360_WITH_ORDER_STATS;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Customer 360", result.getTitle());

		// Sub-query dimension: order count as a customer attribute
		Map<String, Object> orderCountDim = result.getDimensions().get(4);
		assertEquals("order_count", orderCountDim.get("name"));
		assertEquals("number", orderCountDim.get("type"));
		assertEquals(true, orderCountDim.get("sub_query"));
		assertTrue(((String) orderCountDim.get("sql")).contains("orders.count"));

		// Join
		assertEquals(1, result.getJoins().size());
		assertEquals("one_to_many", result.getJoins().get(0).get("relationship"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #5  Product Sales Star Schema
	//     Product manager wants revenue per product. The order_items fact table
	//     joins to both orders and products. All six standard measure types.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testProductSalesStarSchema() throws Exception {
		String dsl = CubeDslSamples.PRODUCT_SALES_STAR_SCHEMA;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// Computed SQL in measure
		assertEquals("quantity * unit_price", result.getMeasures().get(1).get("sql"));

		// All six measure types
		List<Map<String, Object>> meas = result.getMeasures();
		assertEquals(6, meas.size());
		assertEquals("count", meas.get(0).get("type"));
		assertEquals("sum", meas.get(1).get("type"));
		assertEquals("count_distinct", meas.get(2).get("type"));
		assertEquals("avg", meas.get(3).get("type"));
		assertEquals("min", meas.get(4).get("type"));
		assertEquals("max", meas.get(5).get("type"));

		// Drill-down on items_sold
		List<String> drill = (List<String>) meas.get(0).get("drill_members");
		assertEquals(1, drill.size());
		assertEquals("id", drill.get(0));

		// Two joins
		assertEquals(2, result.getJoins().size());
		for (Map<String, Object> j : result.getJoins()) {
			assertEquals("many_to_one", j.get("relationship"));
		}
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// RICH DIMENSIONS — Beyond simple columns
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #6  Clothing Store Size Labels
	//     The database stores sizes as codes ('xs', 'sm', 'md', 'lg', 'xl').
	//     The report needs human-readable labels. The case_ dimension maps
	//     raw codes to display names — no SQL CASE statement needed in the query.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testClothingStoreSizeLabels() throws Exception {
		String dsl = CubeDslSamples.CLOTHING_STORE_SIZE_LABELS;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// Size label dimension with case_
		Map<String, Object> sizeDim = result.getDimensions().get(2);
		assertEquals("size_label", sizeDim.get("name"));
		Map<String, Object> sizeCase = (Map<String, Object>) sizeDim.get("case");
		assertNotNull(sizeCase);

		List<Map<String, Object>> sizeWhens = (List<Map<String, Object>>) sizeCase.get("when");
		assertEquals(5, sizeWhens.size());
		assertTrue(((String) sizeWhens.get(0).get("sql")).contains("xs"));
		assertEquals("Extra Small", sizeWhens.get(0).get("label"));
		assertEquals("Extra Large", sizeWhens.get(4).get("label"));

		Map<String, Object> sizeElse = (Map<String, Object>) sizeCase.get("else");
		assertEquals("Unknown", sizeElse.get("label"));

		// Price tier dimension — case_ without else
		Map<String, Object> priceDim = result.getDimensions().get(3);
		Map<String, Object> priceCase = (Map<String, Object>) priceDim.get("case");
		List<Map<String, Object>> priceWhens = (List<Map<String, Object>>) priceCase.get("when");
		assertEquals(3, priceWhens.size());
		assertEquals("Budget", priceWhens.get(0).get("label"));
		assertEquals("Premium", priceWhens.get(2).get("label"));
		assertNull(priceCase.get("else")); // no else clause
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #7  Delivery Fleet Tracker
	//     Logistics team needs to see delivery trucks on a map. The geo dimension
	//     type combines latitude and longitude into a single plottable field.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testDeliveryFleetTracker() throws Exception {
		String dsl = CubeDslSamples.DELIVERY_FLEET_TRACKER;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("Delivery Fleet", result.getTitle());

		// Current location — geo dimension with lat/lng
		Map<String, Object> location = result.getDimensions().get(3);
		assertEquals("current_location", location.get("name"));
		assertEquals("geo", location.get("type"));
		Map<String, Object> lat = (Map<String, Object>) location.get("latitude");
		Map<String, Object> lng = (Map<String, Object>) location.get("longitude");
		assertNotNull(lat);
		assertNotNull(lng);
		assertEquals("${CUBE}.lat", lat.get("sql"));
		assertEquals("${CUBE}.lng", lng.get("sql"));

		// Destination — second geo dimension
		Map<String, Object> dest = result.getDimensions().get(4);
		assertEquals("geo", dest.get("type"));
		Map<String, Object> destLat = (Map<String, Object>) dest.get("latitude");
		assertEquals("${CUBE}.dest_lat", destLat.get("sql"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #8  Retail Chain Store Locator
	//     Operations team needs to drill down: Country → Region → City to find
	//     stores. Segments provide quick filters for new vs established stores.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testRetailChainStoreLocator() throws Exception {
		String dsl = CubeDslSamples.RETAIL_CHAIN_STORE_LOCATOR;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// Dimension with extra metadata
		Map<String, Object> openedDim = result.getDimensions().get(5);
		assertEquals("Opening Date", openedDim.get("title"));
		assertEquals("Date the store first opened", openedDim.get("description"));

		// Segment
		assertEquals(1, result.getSegments().size());
		assertEquals("new_stores", result.getSegments().get(0).get("name"));
		assertEquals("Opened within the last year", result.getSegments().get(0).get("description"));

		// Hierarchy
		assertEquals(1, result.getHierarchies().size());
		List<String> levels = (List<String>) result.getHierarchies().get(0).get("levels");
		assertEquals(3, levels.size());
		assertEquals("country", levels.get(0));
		assertEquals("region", levels.get(1));
		assertEquals("city", levels.get(2));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// GOVERNANCE & REUSE
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #9  Finance Internal Staging Cube
	//     The finance team has a staging table for reconciliation. Hidden from
	//     the dashboard picker (public_ false) but joinable from other cubes.
	//     Uses sql_alias because the table name exceeds Postgres' 63-char limit.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFinanceInternalStagingCube() throws Exception {
		String dsl = CubeDslSamples.FINANCE_INTERNAL_STAGING_CUBE;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		assertEquals("fin_recon", result.getSqlAlias());
		assertEquals(false, result.getPublic_());
		assertEquals("Reconciliation (staging)", result.getTitle());
		assertEquals("debit - credit", result.getMeasures().get(1).get("sql"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #10  Regional Orders (extends base)
	//     The company has orders_us and orders_eu tables with identical structure.
	//     A base cube defines the common dimensions/measures, then each regional
	//     cube extends it and only overrides the table name. DRY principle.
	//     (Actual inheritance resolution happens in the backend, not the parser —
	//     the parser just captures the extends_ reference as a string.)
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testRegionalOrdersExtends() throws Exception {
		String dsl = CubeDslSamples.REGIONAL_ORDERS_EXTENDS;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		Map<String, CubeOptions> named = result.getNamedOptions();
		assertEquals(3, named.size());

		// Base cube — no extends
		CubeOptions base = named.get("base_orders");
		assertNotNull(base);
		assertNull(base.getExtends_());
		assertEquals("public.orders", base.getSqlTable());
		assertEquals(3, base.getDimensions().size());
		assertEquals(2, base.getMeasures().size());

		// US cube — extends base, adds state dimension
		CubeOptions us = named.get("orders_us");
		assertNotNull(us);
		assertEquals("base_orders", us.getExtends_());
		assertEquals("public.orders_us", us.getSqlTable());
		assertEquals(1, us.getDimensions().size());
		assertEquals("us_state", us.getDimensions().get(0).get("name"));

		// EU cube — extends base, adds country dimension
		CubeOptions eu = named.get("orders_eu");
		assertEquals("base_orders", eu.getExtends_());
		assertEquals("public.orders_eu", eu.getSqlTable());
		assertEquals("eu_country", eu.getDimensions().get(0).get("name"));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// MULTI-CUBE & KITCHEN SINK
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #11  Multi-Department Dashboard
	//     The CEO's dashboard shows HR headcount alongside Sales revenue.
	//     Two named cubes in one config file — one for each department.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testMultiDepartmentDashboard() throws Exception {
		String dsl = CubeDslSamples.MULTI_DEPARTMENT_DASHBOARD;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// Unnamed default is empty
		assertNull(result.getSqlTable());

		Map<String, CubeOptions> named = result.getNamedOptions();
		assertEquals(2, named.size());

		CubeOptions hr = named.get("hr_headcount");
		assertEquals("hr.employees", hr.getSqlTable());
		assertEquals("Headcount", hr.getTitle());
		assertEquals("time", hr.getDimensions().get(2).get("type"));

		CubeOptions sales = named.get("sales_revenue");
		assertEquals("Revenue", sales.getTitle());
		assertEquals("currency", sales.getMeasures().get(1).get("format"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #12  Sales Pipeline Full Model
	//     A complete, realistic cube that a BI analyst would build: the sales
	//     fact table with every feature — metadata, KPI measures with drill-down
	//     and filters, joins, segments, hierarchy, and a geo dimension.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	@SuppressWarnings("unchecked")
	public void testSalesPipelineFullModel() throws Exception {
		String dsl = CubeDslSamples.SALES_PIPELINE_FULL_MODEL;

		CubeOptions result = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// ── Cube-level metadata ──
		assertEquals("public.sales", result.getSqlTable());
		assertEquals("sales", result.getSqlAlias());
		assertEquals("Sales Transactions", result.getTitle());
		assertEquals("Point-of-sale transactions across all channels", result.getDescription());
		assertEquals(true, result.getPublic_());
		assertEquals("dollar-sign", result.getMeta().get("icon"));
		assertEquals(1, result.getMeta().get("priority"));

		// ── Dimensions ──
		assertEquals(8, result.getDimensions().size());

		// Primary key
		assertEquals(true, result.getDimensions().get(0).get("primary_key"));

		// Case dimension
		Map<String, Object> channelLabel = result.getDimensions().get(5);
		assertEquals("channel_label", channelLabel.get("name"));
		Map<String, Object> caseBlock = (Map<String, Object>) channelLabel.get("case");
		List<Map<String, Object>> whens = (List<Map<String, Object>>) caseBlock.get("when");
		assertEquals(2, whens.size());
		assertEquals("Website", whens.get(0).get("label"));
		assertEquals("Other", ((Map<String, Object>) caseBlock.get("else")).get("label"));

		// Time dimension with sort
		assertEquals("desc", result.getDimensions().get(6).get("order"));

		// Geo dimension
		Map<String, Object> geo = result.getDimensions().get(7);
		assertEquals("geo", geo.get("type"));
		assertEquals("${CUBE}.store_lat", ((Map<String, Object>) geo.get("latitude")).get("sql"));

		// ── Measures ──
		List<Map<String, Object>> meas = result.getMeasures();
		assertEquals(6, meas.size());

		// Drill-down on count
		List<String> drill = (List<String>) meas.get(0).get("drill_members");
		assertEquals(3, drill.size());

		// Filtered measure
		List<Map<String, Object>> filters = (List<Map<String, Object>>) meas.get(3).get("filters");
		assertEquals(1, filters.size());
		assertTrue(((String) filters.get(0).get("sql")).contains("web"));

		// Analysis measures - a running total and a year-to-date total over the same base
		Map<String, Object> running = (Map<String, Object>) meas.get(4).get("rolling_window");
		assertEquals("unbounded", running.get("trailing"));
		Map<String, Object> ytd = (Map<String, Object>) meas.get(5).get("rolling_window");
		assertEquals("to_date", ytd.get("type"));
		assertEquals("year", ytd.get("granularity"));

		// ── Joins ──
		assertEquals(2, result.getJoins().size());

		// ── Segments ──
		assertEquals(2, result.getSegments().size());
		assertEquals("high_value", result.getSegments().get(0).get("name"));

		// ── Hierarchies ──
		assertEquals(1, result.getHierarchies().size());
		List<String> levels = (List<String>) result.getHierarchies().get(0).get("levels");
		assertEquals(3, levels.size());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #13  Empty Config Fallback
	//      User hasn't created a cube config yet, or the file is blank.
	//      Must return a valid empty CubeOptions, never throw.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testEmptyConfigFallback() throws Exception {
		CubeOptions result1 = CubeOptionsParser.parseGroovyCubeDslCode(null);
		assertNotNull(result1);
		assertNull(result1.getSqlTable());
		assertNull(result1.getTitle());
		assertNull(result1.getExtends_());
		assertTrue(result1.getDimensions().isEmpty());
		assertTrue(result1.getMeasures().isEmpty());
		assertTrue(result1.getJoins().isEmpty());
		assertTrue(result1.getSegments().isEmpty());
		assertTrue(result1.getHierarchies().isEmpty());

		CubeOptions result2 = CubeOptionsParser.parseGroovyCubeDslCode("");
		assertNotNull(result2);

		CubeOptions result3 = CubeOptionsParser.parseGroovyCubeDslCode("   ");
		assertNotNull(result3);
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// WHAT THE PARSER TELLS THE AUTHOR — warnings, errors and folders
	// ═════════════════════════════════════════════════════════════════════════════

	/** A cube whose author misspelled things, one mistake per member. */
	private static final String TYPOS = "cube {\n" +
			"  sql_table 'Orders'\n" +
			"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationshp 'many_to_one' }\n" +
			"  join { name 'Shippers'; sql '${CUBE}.ShipVia = Shippers.ShipperID'; relationship 'has_mnay' }\n" +
			"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primay_key true }\n" +
			"  dimension { name 'Key1'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
			"  dimension { name 'Key2'; sql '${CUBE}.CustomerID'; type 'string'; primary_key true }\n" +
			"  dimension { name 'Country'; sql '${CUBE}.ShipCountry'; type 'strng'; owner_team 'analytics' }\n" +
			"  measure { name 'Freight'; sql '${CUBE}.Freight'; type 'sum'; format 'krona'; titel 'Freight' }\n" +
			"}";

	private static List<String> messages(CubeOptions cube, String level) {
		List<String> lines = new ArrayList<>();
		for (Map<String, Object> warning : cube.getWarnings()) {
			if (level.equals(warning.get("level"))) lines.add(warning.get("message").toString());
		}
		return lines;
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #14  What the author is told
	//      A cube nobody can run is worth saying so about, and a cube that runs but
	//      ignores half of what its author wrote is worth saying so too. Both are in
	//      the parsed cube, so the editor shows them without asking again.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testWarningsAndErrorsSayWhatToFix() throws Exception {
		// The tests' own cubes are written correctly, so the only warnings they hear are about the
		// two keys DataPallas keeps for other tools and does not read. A new warning that fires on
		// a good cube fails here — and so does a key that says it is "not used yet" once something
		// uses it: W4 reads format, rolling_window and drill_members, and none of the three may
		// still be telling the author that nothing does.
		Set<String> kept = Set.of("meta", "extends");
		for (Map.Entry<String, String> sample : CubeDslSamples.all().entrySet()) {
			CubeOptions parsed = CubeOptionsParser.parseGroovyCubeDslCode(sample.getValue());
			for (Map<String, Object> warning : parsed.getWarnings()) {
				String key = Objects.toString(warning.get("key"), "");
				assertEquals("warning", warning.get("level"),
						sample.getKey() + " is a correct cube, so it has no error: " + warning);
				assertTrue(kept.contains(key),
						sample.getKey() + " should say nothing about '" + key + "': " + warning);
				assertFalse(warning.get("message").toString().contains("is not used yet"),
						"W4 reads these keys, so nothing may still say they are unused: " + warning);
			}
		}

		CubeOptions typos = CubeOptionsParser.parseGroovyCubeDslCode(TYPOS);
		List<String> said = messages(typos, "warning");
		assertTrue(messages(typos, "error").isEmpty(), "A typo is not an error: the cube still runs");

		assertTrue(said.contains("unknown key 'primay_key' in dimension OrderID — did you mean 'primary_key'?"),
				"A misspelled key is named, with the key it is close to: " + said);
		assertTrue(said.contains("unknown key 'titel' in measure Freight — did you mean 'title'?"), said.toString());
		assertTrue(said.contains("unknown key 'relationshp' in join Customers — did you mean 'relationship'?"), said.toString());
		assertEquals(1, said.stream().filter(line -> line.contains("'relationshp'")).count(),
				"One line per mistake, not one per rule that noticed it: " + said);
		assertTrue(said.contains("unknown key 'owner_team' in dimension Country"),
				"A key far from every known one is still kept and still mentioned, with no guess: " + said);

		assertTrue(said.contains("dimension 'Country': type 'strng' is not a dimension type, so it is read "
				+ "as a plain string — did you mean 'string'?"), said.toString());
		assertTrue(said.contains("join 'Shippers': relationship 'has_mnay' is not a relationship, so it is "
				+ "counted as 'many_to_one' and this join is left out of the double-counting fix — did you "
				+ "mean 'has_many'?"), said.toString());
		assertTrue(said.contains("measure 'Freight': format 'krona' is not a format, so the number is shown "
				+ "as it is returned."), said.toString());
		assertTrue(said.contains("dimension 'Key2': primary_key is already declared on another dimension, "
				+ "and the first declared is the key."), said.toString());

		// P2/P4: what the author wrote is still there, in the order they wrote it — the warning is
		// about what DataPallas reads, not about what it throws away.
		Map<String, Object> orderId = typos.getDimensions().get(0);
		assertEquals("true", Objects.toString(orderId.get("primay_key")), "The unknown key is kept");
		assertEquals(List.of("name", "sql", "type", "primay_key"), new ArrayList<>(orderId.keySet()),
				"and it is kept where the author wrote it");
		assertEquals("many_to_one", typos.getJoins().get(0).get("relationshp"), "and so is a join's");

		// The error DSL: one member per thing a cube can get wrong, one error each, and the member
		// is named in the entry itself so the editor can point at it.
		CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(CubeDslSamples.ERROR_CASES);
		List<Map<String, Object>> errors = new ArrayList<>();
		for (Map<String, Object> warning : file.getWarnings()) {
			if ("error".equals(warning.get("level"))) errors.add(warning);
		}
		assertEquals(11, errors.size(), "One error per broken member: " + errors);
		List<String> members = new ArrayList<>();
		for (Map<String, Object> error : errors) {
			assertEquals("broken", error.get("cube"), "A named cube is checked like any other: " + error);
			assertTrue(error.get("message").toString().contains("'" + error.get("member") + "'"),
					"The message names the member it is about: " + error);
			members.add(error.get("member").toString());
		}
		assertEquals(List.of("HalfWhere", "Where", "FarAway", "Sideways", "Median", "Dotted", "Nope",
				"ShareOfAnAverage", "ThreeMonths", "Muddled", "Nowhere"), members,
				"Every error case has exactly one member");
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #15  Which table each field lives on
	//      The field picker groups a cube's dimensions by the table they read, so it
	//      needs the answer next to the cube, not one HTTP call per field.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testDimensionTablesSayWhereEachFieldLives() throws Exception {
		String sales = Files.readString(Paths.get(
				"../../asbl/src/main/external-resources/db-template/config/samples-cubes/northwind",
				"northwind-sales-cube-config.groovy"));
		Map<String, String> where = CubeOptionsParser.parseGroovyCubeDslCode(sales).getDimensionTables();
		// The Northwind cubes name every table the ANSI way, because that is how their bundled
		// SQLite Northwind creates them, so the table a field lives on comes back as the cube
		// writes it - quotes and all. A picker that wants it plain unquotes it for display.
		assertEquals("\"Categories\"", where.get("CategoryName"), "A field of a joined table names it");
		assertEquals("\"Order Details\"", where.get("Quantity"),
				"and a joined table whose name needs quotes is named as the cube writes it");
		assertEquals("", where.get("ShipCountry"), "A field of the cube's own table names nothing");

		String rules = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  join { name 'Orders2'; sql '${CUBE}.OrderID = Orders2.OrderID'; relationship 'many_to_one' }\n" +
				"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
				"  join { name 'Shippers'; sql '${CUBE}.ShipVia = Shippers.ShipperID'; relationship 'many_to_one' }\n" +
				"  join { name 'Regions'; parent 'Customers'; sql 'Customers.Region = Regions.Region'; relationship 'many_to_one' }\n" +
				"  dimension { name 'NotAJoin'; sql 'myOrders2.Freight'; type 'number' }\n" +
				"  dimension { name 'Cased'; sql 'orders2.Freight'; type 'number' }\n" +
				"  dimension { name 'InAString'; sql \"CASE WHEN ${CUBE}.ShipCountry = 'Customers.Region' THEN 1 END\"; type 'number' }\n" +
				"  dimension { name 'HowMany'; sql '${Customers.count}'; type 'number'; sub_query true }\n" +
				"  dimension { name 'Both'; sql 'Customers.Region || Shippers.CompanyName'; type 'string' }\n" +
				"  dimension { name 'FarSide'; sql 'Regions.Description'; type 'string' }\n" +
				"}";
		Map<String, String> byRule = CubeOptionsParser.parseGroovyCubeDslCode(rules).getDimensionTables();
		assertEquals("", byRule.get("NotAJoin"), "A longer name that ends in a join's name is not that join");
		assertEquals("Orders2", byRule.get("Cased"), "A table name is read whichever case it is written in");
		assertEquals("", byRule.get("InAString"), "A join's name inside a string literal is text, not a table");
		assertEquals("", byRule.get("HowMany"),
				"A sub_query reads its table inside itself, so the field is the cube's own");
		assertEquals("Customers", byRule.get("Both"), "Two tables: the first the cube declares");
		assertEquals("Regions", byRule.get("FarSide"),
				"A join hanging off another join is still the one table the field reads");

		// A file with several cubes: each one gets its own map, because each has its own joins.
		CubeOptions file = CubeOptionsParser.parseGroovyCubeDslCode(CubeDslSamples.MULTI_DEPARTMENT_DASHBOARD);
		for (Map.Entry<String, CubeOptions> named : file.getNamedOptions().entrySet()) {
			assertEquals(named.getValue().getDimensions().size(), named.getValue().getDimensionTables().size(),
					"Every dimension of '" + named.getKey() + "' is in its own map");
		}
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #16  The keys the viewer's own filters bring (W1)
	//      A filter list is a dimension's business: the author says where its values
	//      come from, and a measure asking for one is told that nothing reads it.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFilterOptionsIsADimensionKey() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  dimension { name 'ShipCountry'; title 'Ship Country'; sql '\"ShipCountry\"'; type 'string'\n" +
				"    filter_options 'SELECT Country FROM Customers ORDER BY Country' }\n" +
				"  dimension { name 'OrderDate'; sql '\"OrderDate\"'; type 'time' }\n" +
				"  measure { name 'Freight'; sql '\"Freight\"'; type 'sum'\n" +
				"    filter_options 'SELECT 1' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);

		// The author's SQL is kept exactly as written: the endpoint runs it, so a changed character
		// is a changed query.
		assertEquals("SELECT Country FROM Customers ORDER BY Country",
				cube.getDimensions().get(0).get("filter_options"),
				"filter_options is stored on the dimension, verbatim");
		assertFalse(cube.getDimensions().get(1).containsKey("filter_options"),
				"and a dimension the author left alone has no filter list of its own");

		List<String> said = messages(cube, "warning");
		assertTrue(messages(cube, "error").isEmpty(), "Nothing here stops the cube from running: " + said);
		assertTrue(said.stream().noneMatch(line -> line.contains("unknown key 'filter_options' in dimension")),
				"filter_options is a known dimension key, not a typo: " + said);
		assertEquals(1, said.stream().filter(line -> line.contains("filter_options")).count(),
				"One line about it, and it is the measure's: " + said);
		assertTrue(said.contains("measure 'Freight': filter_options is ignored, because only dimensions have "
				+ "filter lists."), said.toString());

		// A dimension with no filter_options says nothing at all: the list is then the generator's,
		// which is the usual case and not worth a word.
		assertTrue(said.stream().noneMatch(line -> line.contains("OrderDate")),
				"A dimension without filter_options is not mentioned: " + said);
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #17  The keys the analysis features bring (W4)
	//      What a number means (format, currency) and how it is read over the
	//      finished groups (share, window, prior period) - each reaching the parsed
	//      output as written, and each refused where it cannot mean anything.
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testAnalysisKeysReachTheParsedCube() throws Exception {
		String dsl = "cube {\n" +
				"  sql_table 'Orders'\n" +
				"  currency 'EUR'\n" +
				"  dimension { name 'OrderDate'; sql '${CUBE}.OrderDate'; type 'time' }\n" +
				"  dimension { name 'Depot'; type 'geo'; latitude '${CUBE}.Lat'; longitude '${CUBE}.Lng' }\n" +
				"  measure { name 'Revenue'; sql '${CUBE}.Amount'; type 'sum'; format 'currency'\n" +
				"            drill_members 'OrderDate' }\n" +
				"  measure { name 'RevenueShare'; type 'number'; sql '${Revenue}'; share_of_total true; format 'percent' }\n" +
				"  measure { name 'RevenueRunning'; type 'number'; sql '${Revenue}'; rolling_window trailing: 'unbounded' }\n" +
				"  measure { name 'RevenueYTD'; type 'number'; sql '${Revenue}'; rolling_window type: 'to_date', granularity: 'year' }\n" +
				"  measure { name 'RevenuePriorYear'; type 'number'; sql '${Revenue}'; time_shift interval: '1 year' }\n" +
				"}";

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
		assertTrue(messages(cube, "error").isEmpty(), "Nothing here is wrong: " + messages(cube, "error"));

		// What the numbers are in, for the one formatter every mode uses.
		assertEquals("EUR", cube.getCurrency(), "The cube's currency is the cube's");
		assertEquals("currency", measure(cube, "Revenue").get("format"));
		assertEquals("percent", measure(cube, "RevenueShare").get("format"));
		assertEquals(List.of("OrderDate"), measure(cube, "Revenue").get("drill_members"));

		// The three ways of reading a measure over the finished groups, each stored as written: the
		// generator is what turns them into SQL, and it reads exactly these keys.
		assertEquals(Boolean.TRUE, measure(cube, "RevenueShare").get("share_of_total"));
		assertEquals(Map.of("trailing", "unbounded"), measure(cube, "RevenueRunning").get("rolling_window"),
				"The moving form of rolling_window");
		assertEquals(Map.of("type", "to_date", "granularity", "year"),
				measure(cube, "RevenueYTD").get("rolling_window"), "and its to-date form");
		assertEquals(Map.of("interval", "1 year"), measure(cube, "RevenuePriorYear").get("time_shift"));

		// A map point is a pair, and both halves of it are the author's own SQL.
		Map<String, Object> depot = cube.getDimensions().get(1);
		assertEquals("${CUBE}.Lat", depot.get("latitude"));
		assertEquals("${CUBE}.Lng", depot.get("longitude"));

		// A cube that says nothing about money is still in something: a formatter with no currency
		// to write has to guess, and the answer is the same everywhere instead.
		assertEquals("USD", CubeOptionsParser.parseGroovyCubeDslCode("cube { sql_table 'Orders' }").getCurrency(),
				"A cube that does not say is in USD");
		assertTrue(messages(CubeOptionsParser.parseGroovyCubeDslCode(
				"cube { sql_table 'Orders'; currency 'euros' }"), "warning").stream()
						.anyMatch(line -> line.contains("is not a currency code")),
				"and one that says something that is not a currency code is told so");
	}

	/** #17, the other half — the two analysis measures a cube cannot mean. */
	@Test
	public void testAnalysisKeysThatCannotMeanAnythingAreRefused() throws Exception {

		// A share of an average is not a share of anything: averages do not add up to a total.
		List<String> ofAnAverage = messages(CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  measure { name 'AvgRevenue'; sql '${CUBE}.Amount'; type 'avg' }\n" +
				"  measure { name 'AvgShare'; type 'number'; sql '${AvgRevenue}'; share_of_total true }\n" +
				"}"), "error");
		assertTrue(ofAnAverage.stream().anyMatch(line -> line.contains("never of an average")),
				"A share of an average is an error, not a warning: " + ofAnAverage);

		// Only the two window forms the generator writes are offered, and the message says which.
		List<String> aMovingWindow = messages(CubeOptionsParser.parseGroovyCubeDslCode("cube {\n" +
				"  sql_table 'Orders'\n" +
				"  measure { name 'Revenue'; sql '${CUBE}.Amount'; type 'sum' }\n" +
				"  measure { name 'Revenue3M'; type 'number'; sql '${Revenue}'; rolling_window trailing: '3 month' }\n" +
				"}"), "error");
		assertTrue(aMovingWindow.stream().anyMatch(line -> line.contains("which is not built")),
				"trailing: '3 month' is refused, and the message says what is built: " + aMovingWindow);
	}

	/** One measure of a parsed cube, by name. */
	private static Map<String, Object> measure(CubeOptions cube, String name) {
		for (Map<String, Object> one : cube.getMeasures()) {
			if (name.equals(one.get("name"))) return one;
		}
		throw new AssertionError("No measure called '" + name + "'");
	}
}

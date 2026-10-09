package com.flowkraft.reporting.dsl;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flowkraft.reporting.dsl.pivottable.PivotTableOptions;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser;

/**
 * Business use-case tests for the Pivot Table Groovy DSL.
 *
 * Tests #1-#16 mirror the 16 pivot table examples in pivottables.mdx
 * (the ground truth documentation), in the exact same order:
 *   #1-#4   Fundamentals          — sum, cross-tab, multi-dimension, average
 *   #5-#7   Filtering & Sorting   — value filter, sorted descending, custom sorters
 *   #8-#10  Renderers             — heatmap, grouped bar chart, line chart
 *   #11-#13 Aggregators           — sum over sum, fraction of total, count unique
 *   #14-#15 Advanced              — derived attributes, field visibility
 *   #16     Putting It All Together — full 64-row sales overview
 *   #17+    Edge cases & utilities — inline data, empty/null, kitchen sink, named blocks
 *
 * Each test contains the exact Groovy DSL a user would write in their
 * {reportCode}-pivot-config.groovy file. Every assertion validates that the
 * parsed output matches react-pivottable's API structure.
 *
 * <p><b>📖 Tests are the regression net for the DSL syntax contract.</b>
 * Every test fixture uses canonical block form. Adding a test that uses the
 * legacy parens/list-of-maps form silently weakens the contract — refuse it
 * in review. See
 * {@link com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme#iAmImportantReadme()}
 * for the full principles.
 */
public class PivotTableOptionsParserTest {

    static { com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme.iAmImportantReadme(); }


	// ═════════════════════════════════════════════════════════════════════════════
	// FUNDAMENTALS
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #1  Basic Sum Pivot Table
	//     One row dimension, one value field, Sum aggregation — the four properties
	//     every pivot config needs. Groups revenue by region.
	//     Mirrors: pivottables.mdx → salesByRegionSum
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testSalesByRegionSumPivot() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'sales_data'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(1, result.getRows().size());
		assertEquals("region", result.getRows().get(0));
		assertEquals(1, result.getVals().size());
		assertEquals("revenue", result.getVals().get(0));
		assertEquals("Sum", result.getAggregatorName());
		assertEquals("Table", result.getRendererName());
		assertEquals("sales_data", result.getTableName());
		assertTrue(result.getCols().isEmpty());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #2  Cross-Tabulation
	//     Adding cols turns a flat list into a matrix. Products form rows,
	//     quarters form columns, Count aggregator tallies orders per cell.
	//     Mirrors: pivottables.mdx → orderCountByProductQuarter
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testOrderCountByProductAndQuarter() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'product'\n" +
			"  cols 'quarter'\n" +
			"  aggregatorName 'Count'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'orders'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(1, result.getRows().size());
		assertEquals("product", result.getRows().get(0));
		assertEquals(1, result.getCols().size());
		assertEquals("quarter", result.getCols().get(0));
		assertEquals("Count", result.getAggregatorName());
		assertTrue(result.getVals().isEmpty());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #3  Multi-Dimension
	//     Multiple entries in rows and cols create nested hierarchies — region
	//     then country on the left, product line across the top.
	//     Mirrors: pivottables.mdx → revenueMultiDimension
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testRevenueByRegionAndProductMultiDimension() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region', 'country'\n" +
			"  cols 'productLine'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'sales_warehouse'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(2, result.getRows().size());
		assertEquals("region", result.getRows().get(0));
		assertEquals("country", result.getRows().get(1));
		assertEquals(1, result.getCols().size());
		assertEquals("productLine", result.getCols().get(0));
		assertEquals(1, result.getVals().size());
		assertEquals("revenue", result.getVals().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #4  Average Aggregator
	//     Average instead of Sum reveals that Enterprise orders are 10x the size
	//     of Marketplace orders — information hidden when you only look at totals.
	//     Mirrors: pivottables.mdx → avgOrderValueByChannel
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testAverageOrderValueByChannel() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'salesChannel'\n" +
			"  vals 'orderValue'\n" +
			"  aggregatorName 'Average'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'ecommerce_orders'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Average", result.getAggregatorName());
		assertEquals("salesChannel", result.getRows().get(0));
		assertEquals("orderValue", result.getVals().get(0));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// FILTERING & SORTING
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #5  Value Filter — Revenue Excluding Inactive/Pending
	//     valueFilter removes specific dimension values before any calculation
	//     runs. Here Inactive and Pending records are excluded so the pivot shows
	//     only Active revenue.
	//     Mirrors: pivottables.mdx → filteredByStatus
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFilteredPivotExcludingInactiveRecords() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'category'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  valueFilter {\n" +
			"    status exclude: ['Inactive', 'Pending']\n" +
			"  }\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		Map<String, Map<String, Boolean>> vf = result.getValueFilter();
		assertNotNull(vf);
		assertTrue(vf.containsKey("status"));

		Map<String, Boolean> statusFilter = vf.get("status");
		assertEquals(true, statusFilter.get("Inactive"));
		assertEquals(true, statusFilter.get("Pending"));
		assertEquals(2, statusFilter.size());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #6  Sorted by Value Descending — rowOrder + colOrder
	//     rowOrder 'value_z_to_a' ranks rows by aggregated total (highest first),
	//     colOrder 'key_a_to_z' keeps years chronological. Standard executive
	//     summary layout: value-ranked rows, time-ordered columns.
	//     Mirrors: pivottables.mdx → sortedRevenue
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testSortedPivotRevenueLargestFirst() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  cols 'year'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  rowOrder 'value_z_to_a'\n" +
			"  colOrder 'key_a_to_z'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("value_z_to_a", result.getRowOrder());
		assertEquals("key_a_to_z", result.getColOrder());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #7  Custom Sort Order — sorters override alphabetical
	//     sorters overrides alphabetical ordering with a business-specific
	//     sequence: West → Central → East → International, matching how the
	//     sales organization is structured.
	//     Mirrors: pivottables.mdx → customSorters
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testCustomSortersForRegionalOrder() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  sorters region: ['West', 'Central', 'East', 'International']\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		Map<String, Object> sorters = result.getSorters();
		assertTrue(sorters.containsKey("region"));

		@SuppressWarnings("unchecked")
		List<String> regionOrder = (List<String>) sorters.get("region");
		assertEquals(4, regionOrder.size());
		assertEquals("West", regionOrder.get(0));
		assertEquals("Central", regionOrder.get(1));
		assertEquals("East", regionOrder.get(2));
		assertEquals("International", regionOrder.get(3));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// RENDERERS
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #8  Heatmap — Table Heatmap Renderer
	//     Table Heatmap colors every cell relative to the global maximum.
	//     In this CRM pipeline, Nora's Negotiation deals stand out as the peak.
	//     Mirrors: pivottables.mdx → pipelineHeatmap
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testHeatmapRendererForPipelineAnalysis() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'dealStage'\n" +
			"  cols 'salesRep'\n" +
			"  vals 'dealValue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table Heatmap'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Table Heatmap", result.getRendererName());
		assertEquals("dealStage", result.getRows().get(0));
		assertEquals("salesRep", result.getCols().get(0));
		assertEquals("dealValue", result.getVals().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #9  Grouped Bar Chart — side-by-side bars per rep
	//     Grouped Bar Chart places one bar per column value side by side for each
	//     row. Nora dominates Negotiation, Priya leads Qualification, Marco
	//     dominates Closed Won.
	//     Mirrors: pivottables.mdx → pipelineGroupedBar
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testPipelineGroupedBarChart() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'dealStage'\n" +
			"  cols 'salesRep'\n" +
			"  vals 'dealValue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Grouped Bar Chart'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Grouped Bar Chart", result.getRendererName());
		assertEquals("dealStage", result.getRows().get(0));
		assertEquals("salesRep", result.getCols().get(0));
		assertEquals("dealValue", result.getVals().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #10 Line Chart — pipeline trajectory per rep
	//     Line Chart draws one line per sales rep across deal stages. All three
	//     reps peak at Negotiation before dropping at Closed Won — the classic
	//     pipeline funnel shape.
	//     Mirrors: pivottables.mdx → pipelineLineChart
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testPipelineLineChart() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'dealStage'\n" +
			"  cols 'salesRep'\n" +
			"  vals 'dealValue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Line Chart'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Line Chart", result.getRendererName());
		assertEquals("dealStage", result.getRows().get(0));
		assertEquals("salesRep", result.getCols().get(0));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// AGGREGATORS
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #11 Revenue per Unit — Sum over Sum (ratio aggregator)
	//     Sum over Sum divides the first val by the second — revenue / quantity —
	//     producing price-per-unit. The only aggregator using TWO value fields.
	//     Mirrors: pivottables.mdx → revenuePerUnit
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testRevenuePerUnitSumOverSum() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'product'\n" +
			"  cols 'quarter'\n" +
			"  vals 'revenue', 'quantity'\n" +
			"  aggregatorName 'Sum over Sum'\n" +
			"  rendererName 'Table'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Sum over Sum", result.getAggregatorName());
		assertEquals(2, result.getVals().size());
		assertEquals("revenue", result.getVals().get(0));
		assertEquals("quantity", result.getVals().get(1));
		assertEquals("product", result.getRows().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #12 Percentage of Total — Sum as Fraction of Total
	//     Converts raw numbers into percentages of the grand total. North America
	//     Software alone accounts for nearly a third of all revenue.
	//     Mirrors: pivottables.mdx → fractionOfTotal
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFractionOfTotalPercentages() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  cols 'productLine'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum as Fraction of Total'\n" +
			"  rendererName 'Table'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Sum as Fraction of Total", result.getAggregatorName());
		assertEquals("region", result.getRows().get(0));
		assertEquals("productLine", result.getCols().get(0));
		assertEquals("revenue", result.getVals().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #13 Count Distinct — Count Unique Values
	//     Counts how many distinct values appear, not how many rows exist.
	//     "How many different products were ordered per region per quarter?"
	//     Mirrors: pivottables.mdx → countUniqueValues
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testCountUniqueValues() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  cols 'quarter'\n" +
			"  vals 'product'\n" +
			"  aggregatorName 'Count Unique Values'\n" +
			"  rendererName 'Table'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals("Count Unique Values", result.getAggregatorName());
		assertEquals("region", result.getRows().get(0));
		assertEquals("quarter", result.getCols().get(0));
		assertEquals("product", result.getVals().get(0));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// ADVANCED
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #14 Derived Attributes — Year/Quarter from Date
	//     derivedAttributes creates new dimensions from existing fields at render
	//     time. year and quarter are extracted from raw orderDate timestamps.
	//     Mirrors: pivottables.mdx → derivedAttributes
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testDerivedAttributeYearExtraction() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  cols 'year'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  derivedAttributes year: 'dateFormat(orderDate, \"%y\")', quarter: 'dateFormat(orderDate, \"Q%q\")'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		Map<String, String> derived = result.getDerivedAttributes();
		assertEquals(2, derived.size());
		assertTrue(derived.containsKey("year"));
		assertTrue(derived.containsKey("quarter"));
		assertEquals("dateFormat(orderDate, \"%y\")", derived.get("year"));
		assertEquals("dateFormat(orderDate, \"Q%q\")", derived.get("quarter"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #15 Field Visibility Controls — Three Restriction Levels
	//     hiddenAttributes removes fields entirely (internal IDs, timestamps).
	//     hiddenFromAggregators keeps fields draggable but prevents sum/average
	//     (employee names, free-text notes). hiddenFromDragDrop locks a field in
	//     place so users cannot rearrange it.
	//     Mirrors: pivottables.mdx → fieldVisibility
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFieldVisibilityThreeLevels() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'department'\n" +
			"  vals 'salary'\n" +
			"  aggregatorName 'Average'\n" +
			"  rendererName 'Table'\n" +
			"  hiddenAttributes 'employee_id', 'manager_id', 'created_at'\n" +
			"  hiddenFromAggregators 'employeeName', 'notes'\n" +
			"  hiddenFromDragDrop 'department'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		// hiddenAttributes — completely removed from UI
		List<String> hidden = result.getHiddenAttributes();
		assertEquals(3, hidden.size());
		assertEquals("employee_id", hidden.get(0));
		assertEquals("manager_id", hidden.get(1));
		assertEquals("created_at", hidden.get(2));

		// hiddenFromAggregators — draggable but not summable
		List<String> hiddenAgg = result.getHiddenFromAggregators();
		assertEquals(2, hiddenAgg.size());
		assertEquals("employeeName", hiddenAgg.get(0));
		assertEquals("notes", hiddenAgg.get(1));

		// hiddenFromDragDrop — locked in place
		List<String> hiddenDrag = result.getHiddenFromDragDrop();
		assertEquals(1, hiddenDrag.size());
		assertEquals("department", hiddenDrag.get(0));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// PUTTING IT ALL TOGETHER
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #16 Sales Overview — Region × Product × Quarter
	//     64 rows (4 regions × 4 products × 4 quarters). The full analysis grid
	//     with row and column ordering for a clean executive summary.
	//     Mirrors: pivottables.mdx → salesOverview
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testSalesOverviewFullPivot() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'Region', 'Product'\n" +
			"  cols 'Quarter'\n" +
			"  vals 'Revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  rowOrder 'key_a_to_z'\n" +
			"  colOrder 'key_a_to_z'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(2, result.getRows().size());
		assertEquals("Region", result.getRows().get(0));
		assertEquals("Product", result.getRows().get(1));
		assertEquals(1, result.getCols().size());
		assertEquals("Quarter", result.getCols().get(0));
		assertEquals("Revenue", result.getVals().get(0));
		assertEquals("Sum", result.getAggregatorName());
		assertEquals("Table", result.getRendererName());
		assertEquals("key_a_to_z", result.getRowOrder());
		assertEquals("key_a_to_z", result.getColOrder());
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// UTILITY & EDGE CASES — Parser features not tied to specific MDX examples
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #13 Inline Data for Prototyping — data override
	//     During development or in demo modes, users provide inline data directly
	//     in the DSL instead of querying a database. Useful for unit tests,
	//     prototypes, and offline demos.
	//     Used by: Any app type — development, testing, offline demos
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testInlineDataOverride() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'color'\n" +
			"  vals 'count'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  data([[color: 'Red', count: 10], [color: 'Blue', count: 20], [color: 'Red', count: 5]])\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		List<Map<String, Object>> data = result.getData();
		assertEquals(3, data.size());
		assertEquals("Red", data.get(0).get("color"));
		assertEquals(10, data.get(0).get("count"));
		assertEquals("Blue", data.get(1).get("color"));
		assertEquals(20, data.get(1).get("count"));
		assertEquals("Red", data.get(2).get("color"));
		assertEquals(5, data.get(2).get("count"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #14 UI Performance Tuning — menuLimit + unusedOrientationCutoff
	//     For large datasets with 1000+ distinct values, the filter dropdown
	//     menus become slow. menuLimit caps the values shown.
	//     unusedOrientationCutoff controls when unused attributes switch from
	//     horizontal to vertical layout.
	//     Used by: ERP, SaaS — large dataset performance tuning
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testMenuLimitAndOrientationCutoff() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'product'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'large_catalog'\n" +
			"  menuLimit 500\n" +
			"  unusedOrientationCutoff 120\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(Integer.valueOf(500), result.getMenuLimit());
		assertEquals(Integer.valueOf(120), result.getUnusedOrientationCutoff());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #15 Nested Options Block — options closure passthrough
	//     The options block passes through arbitrary configuration to the
	//     frontend. This is the escape hatch for any react-pivottable property
	//     not explicitly modeled in the DSL.
	//     Used by: Any app type — advanced frontend configuration
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testOptionsNestedMapPassthrough() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'category'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'products'\n" +
			"  options {\n" +
			"    menuLimit 250\n" +
			"    customThreshold 0.05\n" +
			"  }\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		Map<String, Object> opts = result.getOptions();
		assertEquals(250, opts.get("menuLimit"));
		assertEquals(new java.math.BigDecimal("0.05"), opts.get("customThreshold"));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #16 List Syntax for Rows/Cols — alternative to varargs
	//     The DSL supports both varargs (rows 'a', 'b') and list (rows ['a','b'])
	//     syntax. Some users prefer the list form, especially when generating DSL
	//     programmatically.
	//     Used by: Any app type — programmatic DSL generation
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testRowsAndColsAsListSyntax() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows(['region', 'country'])\n" +
			"  cols(['year', 'quarter'])\n" +
			"  vals(['revenue'])\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table'\n" +
			"  tableName 'sales'\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(2, result.getRows().size());
		assertEquals("region", result.getRows().get(0));
		assertEquals("country", result.getRows().get(1));
		assertEquals(2, result.getCols().size());
		assertEquals("year", result.getCols().get(0));
		assertEquals("quarter", result.getCols().get(1));
		assertEquals(1, result.getVals().size());
		assertEquals("revenue", result.getVals().get(0));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// EDGE CASES & FUTURE-PROOFING
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #17 Edge Case — Empty/Null DSL Returns Default Options
	//     Guards against misconfigured or missing .groovy files.
	//     Used by: Internal — error handling for missing config files
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testEmptyAndNullDslReturnsDefaults() throws Exception {
		PivotTableOptions resultEmpty = PivotTableOptionsParser.parseGroovyPivotTableDslCode("");
		assertNotNull(resultEmpty);
		assertTrue(resultEmpty.getRows().isEmpty());
		assertTrue(resultEmpty.getCols().isEmpty());
		assertTrue(resultEmpty.getVals().isEmpty());
		assertEquals("Count", resultEmpty.getAggregatorName());
		assertEquals("Table", resultEmpty.getRendererName());

		PivotTableOptions resultNull = PivotTableOptionsParser.parseGroovyPivotTableDslCode(null);
		assertNotNull(resultNull);
		assertTrue(resultNull.getRows().isEmpty());
		assertEquals("Count", resultNull.getAggregatorName());
		assertEquals("Table", resultNull.getRendererName());
	}

	// rowTotals / colTotals: the Canvas writes them, the published pivot reads them back
	@Test
	public void testRowAndColumnTotalsSwitchedOff() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'region'\n" +
			"  cols 'year'\n" +
			"  rowOrder 'value_z_to_a'\n" +
			"  rowTotals false\n" +
			"  colTotals false\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		assertEquals(Boolean.FALSE, result.getRowTotals());
		assertEquals(Boolean.FALSE, result.getColTotals());
		assertEquals("value_z_to_a", result.getRowOrder());
	}

	@Test
	public void testTotalsLeftAloneWhenNotWritten() throws Exception {
		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode("pivotTable {\n  rows 'region'\n}");

		assertEquals(null, result.getRowTotals());
		assertEquals(null, result.getColTotals());
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #18 Kitchen Sink — every DSL feature combined in one config
	//     Validates that all DSL features work together without interference:
	//     rows, cols, vals, aggregatorName, rendererName, rowOrder, colOrder,
	//     valueFilter, options, hiddenAttributes, hiddenFromAggregators,
	//     hiddenFromDragDrop, unusedOrientationCutoff, menuLimit, tableName,
	//     sorters, derivedAttributes.
	//     Used by: Internal — regression safety net for all 17 DTO fields
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testFullKitchenSinkConfiguration() throws Exception {
		String dsl = "pivotTable {\n" +
			"  rows 'customer_country', 'category_name'\n" +
			"  cols 'year_quarter'\n" +
			"  vals 'net_revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table Heatmap'\n" +
			"  rowOrder 'value_z_to_a'\n" +
			"  colOrder 'key_a_to_z'\n" +
			"  tableName 'vw_sales_detail'\n" +
			"  menuLimit 1000\n" +
			"  unusedOrientationCutoff 85\n" +
			"  hiddenAttributes 'sales_key'\n" +
			"  hiddenFromAggregators 'customer_name', 'product_name'\n" +
			"  hiddenFromDragDrop 'continent'\n" +
			"  sorters customer_country: ['USA', 'UK', 'Germany']\n" +
			"  derivedAttributes fiscal_year: 'extractYear(orderDate)'\n" +
			"  valueFilter {\n" +
			"    status exclude: ['Cancelled']\n" +
			"  }\n" +
			"  options {\n" +
			"    responsive true\n" +
			"  }\n" +
			"}";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		// Dimensions
		assertEquals(2, result.getRows().size());
		assertEquals("customer_country", result.getRows().get(0));
		assertEquals("category_name", result.getRows().get(1));
		assertEquals(1, result.getCols().size());
		assertEquals("year_quarter", result.getCols().get(0));
		assertEquals(1, result.getVals().size());
		assertEquals("net_revenue", result.getVals().get(0));

		// Aggregation & rendering
		assertEquals("Sum", result.getAggregatorName());
		assertEquals("Table Heatmap", result.getRendererName());

		// Sorting
		assertEquals("value_z_to_a", result.getRowOrder());
		assertEquals("key_a_to_z", result.getColOrder());

		// Server-side table
		assertEquals("vw_sales_detail", result.getTableName());

		// UI tuning
		assertEquals(Integer.valueOf(1000), result.getMenuLimit());
		assertEquals(Integer.valueOf(85), result.getUnusedOrientationCutoff());

		// Hidden attributes
		assertEquals(1, result.getHiddenAttributes().size());
		assertEquals("sales_key", result.getHiddenAttributes().get(0));
		assertEquals(2, result.getHiddenFromAggregators().size());
		assertEquals(1, result.getHiddenFromDragDrop().size());
		assertEquals("continent", result.getHiddenFromDragDrop().get(0));

		// Sorters
		assertTrue(result.getSorters().containsKey("customer_country"));

		// Derived attributes
		assertEquals("extractYear(orderDate)", result.getDerivedAttributes().get("fiscal_year"));

		// Value filter
		Map<String, Map<String, Boolean>> vf = result.getValueFilter();
		assertTrue(vf.containsKey("status"));
		assertEquals(true, vf.get("status").get("Cancelled"));

		// Options passthrough
		assertEquals(true, result.getOptions().get("responsive"));
	}

	// ═════════════════════════════════════════════════════════════════════════════
	// AGGREGATOR REPORTS — Named blocks for multi-component dashboards
	// ═════════════════════════════════════════════════════════════════════════════

	// ─────────────────────────────────────────────────────────────────────────────
	// #19 Named Pivot Table Blocks — Multi-Component Dashboard Pattern
	//     When a single report needs multiple pivot tables side-by-side (e.g., a
	//     CFO dashboard with a regional revenue pivot AND a product breakdown
	//     pivot), each pivotTable block gets a unique string ID. The parser stores
	//     each named block independently in namedOptions, leaving the unnamed
	//     defaults empty.
	//     Used by: Multi-component reports, aggregator dashboards — see
	//     /docs/bi-analytics/dashboards#multi-component-reports
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testNamedPivotTableBlocks() throws Exception {
		String dsl =
			"pivotTable('regionPivot') {\n" +
			"  rows 'region'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"  rendererName 'Table Heatmap'\n" +
			"}\n" +
			"\n" +
			"pivotTable('productPivot') {\n" +
			"  rows 'product', 'category'\n" +
			"  cols 'quarter'\n" +
			"  vals 'quantity'\n" +
			"  aggregatorName 'Average'\n" +
			"  rendererName 'Table'\n" +
			"  hiddenAttributes 'internal_id'\n" +
			"}\n";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		// Unnamed options should have defaults (no unnamed pivotTable block)
		assertTrue(result.getRows().isEmpty());

		// Named options should have 2 entries
		Map<String, PivotTableOptions> named = result.getNamedOptions();
		assertEquals(2, named.size());

		// Verify regionPivot
		PivotTableOptions region = named.get("regionPivot");
		assertNotNull(region);
		assertEquals(1, region.getRows().size());
		assertEquals("region", region.getRows().get(0));
		assertEquals("Sum", region.getAggregatorName());
		assertEquals("Table Heatmap", region.getRendererName());

		// Verify productPivot
		PivotTableOptions product = named.get("productPivot");
		assertNotNull(product);
		assertEquals(2, product.getRows().size());
		assertEquals("product", product.getRows().get(0));
		assertEquals("category", product.getRows().get(1));
		assertEquals(1, product.getCols().size());
		assertEquals("quarter", product.getCols().get(0));
		assertEquals("Average", product.getAggregatorName());
		assertEquals(1, product.getHiddenAttributes().size());
		assertEquals("internal_id", product.getHiddenAttributes().get(0));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// #20 Mixed Unnamed + Named Blocks — Coexistence Pattern
	//     A report can have ONE unnamed pivotTable block (the default/primary
	//     visualization) alongside one or more named blocks. The unnamed block
	//     populates the root-level DTO fields; named blocks populate namedOptions.
	//     This pattern is used when a report has a main pivot table plus
	//     supplementary detail pivots embedded alongside it.
	//     Used by: Reports that need a primary view plus secondary detail views
	// ─────────────────────────────────────────────────────────────────────────────
	@Test
	public void testMixedUnnamedAndNamedPivotTableBlocks() throws Exception {
		String dsl =
			"pivotTable {\n" +
			"  rows 'region'\n" +
			"  vals 'revenue'\n" +
			"  aggregatorName 'Sum'\n" +
			"}\n" +
			"\n" +
			"pivotTable('detailPivot') {\n" +
			"  rows 'customer'\n" +
			"  cols 'month'\n" +
			"  vals 'amount'\n" +
			"  aggregatorName 'Count'\n" +
			"}\n";

		PivotTableOptions result = PivotTableOptionsParser.parseGroovyPivotTableDslCode(dsl);

		// Unnamed block should be populated
		assertEquals(1, result.getRows().size());
		assertEquals("region", result.getRows().get(0));
		assertEquals("Sum", result.getAggregatorName());

		// Named block should also be populated
		assertEquals(1, result.getNamedOptions().size());
		PivotTableOptions detail = result.getNamedOptions().get("detailPivot");
		assertNotNull(detail);
		assertEquals("customer", detail.getRows().get(0));
		assertEquals("Count", detail.getAggregatorName());
		assertEquals(1, detail.getCols().size());
		assertEquals("month", detail.getCols().get(0));
	}
}

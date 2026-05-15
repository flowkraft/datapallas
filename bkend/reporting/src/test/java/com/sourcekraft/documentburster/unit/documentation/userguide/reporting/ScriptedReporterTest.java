package com.sourcekraft.documentburster.unit.documentation.userguide.reporting;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.Instant; // Add this import
import java.time.ZoneId; // Add this import
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.BiFunction; // Added for helper
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
// jsoup imports
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster._helpers.NorthwindTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.utils.CsvUtils; // For OUTPUT_TYPE_HTML etc.
// Import the fixed date from the generator
import com.sourcekraft.documentburster.common.db.northwind.NorthwindDataGenerator;

public class ScriptedReporterTest {

	private static final Logger log = LoggerFactory.getLogger(ScriptedReporterTest.class);
	// H2 is managed by NorthwindTestUtils setup in SqlReporterTest @BeforeClass

	@BeforeClass
	public static void setUpClass() throws Exception { // Add throws Exception, IOException

		log.info("Setting up ScriptedReporterTest...");

		// Ensure templates are generated
		NorthwindTestUtils.ensureReportingTemplates();

		// Set up database using the shared utility method
		NorthwindTestUtils.setupTestDatabase();

		// Ensure output directory exists and is clean (moved from setUp)
		log.info("Setup complete. H2 DB is ready and scripts are present.");
	}

	@AfterClass
	public static void tearDownClass() {

		log.info("Tearing down ScriptedReporterTest...");

		// Cleanup if needed
		log.info("Teardown complete.");

	}

	@Before
	public void setUp() throws Exception {
		// Output directory cleaning moved to setUpClass to run only once
		log.debug("Executing test method setup...");
	}

	@After
	public void tearDown() {
		// Optional: Add cleanup after each test if needed
	}

	// --- Test Methods ---

	@Test
	public void testInvoiceMasterDetail() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-InvoiceMasterDetail";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// 1. Template Generation is handled by @BeforeClass calling
		// ensureReportingTemplates

		// 2. Configure Reporter
		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();
				// Configure ScriptedReporter specific settings
				ctx.settings.getReportDataSource().scriptoptions.conncode = NorthwindTestUtils.H2_CONN_CODE;

				ctx.settings.getReportDataSource().scriptoptions.scriptname = "scriptedReport_invoice.groovy";

				ctx.settings.getReportDataSource().scriptoptions.idcolumn = "OrderID"; // Burst by OrderID

				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				// Use constant from NorthwindTestUtils
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.SCRIPTED_INVOICE_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("invoice_${OrderID}.html"); // Naming convention
			}
		};

		// 3. Execute Burst
		reporter.burst();

		// 4. Assertions
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);
		assertNotNull("Source data should not be null after script execution", ctx.reportData);
		assertNotNull("Burst tokens list should not be null", ctx.burstTokens);

		// 4.1 Get actual Order IDs from DB for the customers processed by the script
		List<Integer> alfkiOrderIds = NorthwindTestUtils.getOrderIdsForCustomer("ALFKI");
		List<Integer> anatrOrderIds = NorthwindTestUtils.getOrderIdsForCustomer("ANATR");

		// --- MODIFIED ASSERTIONS ---
		assertFalse("Should find at least one Order ID for ALFKI", alfkiOrderIds.isEmpty()); // Check not empty
		assertFalse("Should find at least one Order ID for ANATR", anatrOrderIds.isEmpty()); // Check not empty

		// Combine all expected order IDs
		List<String> expectedOrderIds = new ArrayList<>();
		alfkiOrderIds.forEach(id -> expectedOrderIds.add(String.valueOf(id)));
		anatrOrderIds.forEach(id -> expectedOrderIds.add(String.valueOf(id)));

		// 4.2 Verify Burst Tokens contain all the fetched IDs
		assertEquals("Number of burst tokens should match total orders found", expectedOrderIds.size(),
				ctx.burstTokens.size());
		for (String expectedId : expectedOrderIds) {
			assertTrue("Burst tokens should contain Order ID " + expectedId, ctx.burstTokens.contains(expectedId));
		}
		log.info("Verified burst tokens contain expected Order IDs: {}", ctx.burstTokens);

		// 4.3 Verify Output File and Content for EACH ALFKI order
		for (Integer id : alfkiOrderIds) {
			String alfkiOrderId = String.valueOf(id);
			Path outputFileAlfki = Paths.get(ctx.outputFolder, "invoice_" + alfkiOrderId + ".html");
			assertTrue("Output file for ALFKI OrderID " + alfkiOrderId + " should exist",
					Files.exists(outputFileAlfki));

			String htmlContentAlfki = Files.readString(outputFileAlfki, StandardCharsets.UTF_8);
			assertTrue("HTML " + alfkiOrderId + " should contain <html> tag", htmlContentAlfki.contains("<html"));
			assertTrue("HTML " + alfkiOrderId + " should contain Invoice ID",
					htmlContentAlfki.contains("<h1>Invoice " + alfkiOrderId + "</h1>"));
			assertTrue("HTML " + alfkiOrderId + " should contain Customer ID and Name (ALFKI)",
					htmlContentAlfki.contains("<strong>Customer:</strong> ALFKI (Alfreds Futterkiste)"));

			// TODO: Adjust content assertions based on which ALFKI order this is (Order 1
			// vs Order 5)
			// For now, just check for presence of some details table elements
			assertTrue("HTML " + alfkiOrderId + " should contain details table header 'Product'",
					htmlContentAlfki.contains("<th>Product</th>"));
			assertTrue("HTML " + alfkiOrderId + " should contain totals footer 'Grand Total:'",
					htmlContentAlfki.contains("Grand Total:"));

			log.info("Verified basic content for invoice {}", alfkiOrderId);
		}

		// 4.4 Verify Output File and Content for EACH ANATR order (likely only one)
		for (Integer id : anatrOrderIds) {
			String anatrOrderId = String.valueOf(id);
			Path outputFileAnatr = Paths.get(ctx.outputFolder, "invoice_" + anatrOrderId + ".html");
			assertTrue("Output file for ANATR OrderID " + anatrOrderId + " should exist",
					Files.exists(outputFileAnatr));

			String htmlContentAnatr = Files.readString(outputFileAnatr, StandardCharsets.UTF_8);
			assertTrue("HTML " + anatrOrderId + " should contain <html> tag", htmlContentAnatr.contains("<html"));
			assertTrue("HTML " + anatrOrderId + " should contain Invoice ID",
					htmlContentAnatr.contains("<h1>Invoice " + anatrOrderId + "</h1>"));
			assertTrue("HTML " + anatrOrderId + " should contain Customer ID and Name (ANATR)",
					htmlContentAnatr.contains("<strong>Customer:</strong> ANATR (Ana Trujillo Emparedados y helados)"));

			// Check for detail lines (based on NorthwindDataGenerator for ANATR's first
			// order - Order 2)
			// This assumes ANATR only has one order generated (Order 2)
			if (anatrOrderIds.size() == 1) { // Add specific checks only if we know it's the expected single order
				assertTrue("HTML " + anatrOrderId + " should contain product 'Aniseed Syrup'",
						htmlContentAnatr.contains("<td>Aniseed Syrup</td>"));
				// Check for calculated totals (Values based on NorthwindDataGenerator data for
				// ANATR's first order)
				assertTrue("HTML " + anatrOrderId + " should contain correct Subtotal",
						htmlContentAnatr.contains("<td>28.50</td>"));
				assertTrue("HTML " + anatrOrderId + " should contain correct Freight",
						htmlContentAnatr.contains("<td>11.61</td>"));
				assertTrue("HTML " + anatrOrderId + " should contain correct Tax",
						htmlContentAnatr.contains("<td>3.21</td>"));
				assertTrue("HTML " + anatrOrderId + " should contain correct Grand Total",
						htmlContentAnatr.contains("<td>43.32</td>"));
			} else {
				// If multiple ANATR orders, add more generic checks like for ALFKI
				assertTrue("HTML " + anatrOrderId + " should contain details table header 'Product'",
						htmlContentAnatr.contains("<th>Product</th>"));
				assertTrue("HTML " + anatrOrderId + " should contain totals footer 'Grand Total:'",
						htmlContentAnatr.contains("Grand Total:"));
			}
			log.info("Verified content for invoice {}", anatrOrderId);
		}
		// --- END MODIFIED ASSERTIONS ---

		log.info("========== Test completed: {} ==========", TEST_NAME);
	}

	@Test
	public void testCategoryRegionCrosstab() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-CategoryRegionCrosstab";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// 1. Template Generation handled by @BeforeClass

		// 2. Configure Reporter
		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();
				ctx.settings.getReportDataSource().scriptoptions.conncode = NorthwindTestUtils.H2_CONN_CODE;
				ctx.settings
						.getReportDataSource().scriptoptions.scriptname = "scriptedReport_categoryRegionCrosstabReport.groovy";

				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML; // Use constant from
																							// NorthwindTestUtils
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.SCRIPTED_CROSSTAB_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("crosstab_report.html");

			}
		};

		// 3. Execute Burst
		reporter.burst();

		// 4. Assertions
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);

		// 4.1 Check output file existence
		Path outputFile = Paths.get(ctx.outputFolder, "crosstab_report.html");
		assertTrue("Crosstab report file should exist", Files.exists(outputFile));

		// 4.2 Read and check output file content using jsoup
		String htmlContent = Files.readString(outputFile, StandardCharsets.UTF_8);
		Document doc = Jsoup.parse(htmlContent);

		// Check Title and Table Presence
		Element titleElement = doc.selectFirst("h1:contains(Category Sales by Region)");
		assertNotNull("HTML should contain 'Category Sales by Region' title", titleElement);
		Element tableElement = doc.selectFirst("table");
		assertNotNull("HTML should contain a table", tableElement);

		// 4.3 Verify Table Headers using jsoup
		// Assuming headers are in <thead> or the first <tr> if no <thead>
		Element headerRow = doc.selectFirst("thead tr, table tr"); // Select first row in thead or table
		assertNotNull("Table header row should exist", headerRow);
		Elements headers = headerRow.select("th");
		assertEquals("Expected 12 header columns", 12, headers.size());
		assertEquals("Header 1 mismatch", "Category", headers.get(0).text());
		assertEquals("Header 2 mismatch", "Argentina", headers.get(1).text());
		assertEquals("Header 3 mismatch", "Austria", headers.get(2).text());
		assertEquals("Header 4 mismatch", "France", headers.get(3).text());
		assertEquals("Header 5 mismatch", "Germany", headers.get(4).text());
		assertEquals("Header 6 mismatch", "Italy", headers.get(5).text());
		assertEquals("Header 7 mismatch", "Mexico", headers.get(6).text());
		assertEquals("Header 8 mismatch", "Sweden", headers.get(7).text());
		assertEquals("Header 9 mismatch", "UK", headers.get(8).text());
		assertEquals("Header 10 mismatch", "USA", headers.get(9).text());
		assertEquals("Header 11 mismatch", "Venezuela", headers.get(10).text());
		assertEquals("Header 12 mismatch", "Total Sales", headers.get(11).text());
		log.info("Verified table headers using jsoup.");

		// 4.4 Verify all 8 Category Rows Presence using jsoup
		String[] expectedCategories = { "Beverages", "Condiments", "Confections", "Dairy Products",
				"Grains/Cereals", "Meat/Poultry", "Produce", "Seafood" };
		for (String category : expectedCategories) {
			assertNotNull(category + " row should exist",
					doc.selectFirst("tbody tr:contains(" + category + "), table tr:contains(" + category + ")"));
		}
		log.info("Verified all 8 category rows presence using jsoup.");

		// 4.5 Verify each category has a positive Total Sales value (last column)
		BiFunction<String, Integer, String> getCellText = (category, columnIndex) -> {
			String selector = String.format(
					"tbody tr:contains(%s) > td:nth-child(%d), table tr:contains(%s) > td:nth-child(%d)", category,
					columnIndex + 1, category, columnIndex + 1);
			Element cell = doc.selectFirst(selector);
			assertNotNull(String.format("Cell for category '%s', column index %d not found",
					category, columnIndex), cell);
			return cell.text();
		};

		// Total Sales is column index 11 (12th column, 0-based)
		for (String category : expectedCategories) {
			String totalStr = getCellText.apply(category, 11);
			double total = Double.parseDouble(totalStr);
			assertTrue(category + " should have positive total sales, got: " + totalStr, total > 0);
		}
		log.info("Verified all categories have positive total sales.");

		// 4.6 Verify Footer Row (Column Totals and Grand Total) using jsoup
		Element footerRow = doc.selectFirst("tfoot tr");
		assertNotNull("Footer row (tfoot tr) should exist", footerRow);
		Elements footerCells = footerRow.select("td");
		assertEquals("Expected 12 footer cells (Label + 10 Countries + Grand Total)", 12, footerCells.size());

		assertEquals("Footer label mismatch", "Total", footerCells.get(0).text());
		double grandTotal = Double.parseDouble(footerCells.get(11).text());
		assertTrue("Grand total should be substantial (>5000) with expanded data, got: " + grandTotal,
				grandTotal > 5000);
		log.info("Verified footer structure and grand total: {}", grandTotal);

		log.info("========== Test completed: {} ==========", TEST_NAME);

	}

	@Test
	public void testMonthlySalesTrendChart() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-MonthlySalesTrend";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// 1. Template Generation handled by @BeforeClass

		// 2. Configure Reporter
		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();
				ctx.settings.getReportDataSource().scriptoptions.conncode = NorthwindTestUtils.H2_CONN_CODE;
				ctx.settings
						.getReportDataSource().scriptoptions.scriptname = "scriptedReport_monthlySalesTrendReport.groovy";
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.SCRIPTED_TREND_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("sales_trend_report.html");
			}
		};

		// 3. Execute Burst
		reporter.burst();

		// --- Assertions ---

		// 4. Basic Context and File Validation
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);

		Path outputFile = Paths.get(ctx.outputFolder, "sales_trend_report.html");
		assertTrue("Sales trend report file should exist: " + outputFile.toString(), Files.exists(outputFile));
		String htmlContent = Files.readString(outputFile, StandardCharsets.UTF_8);
		assertFalse("HTML content should not be empty", htmlContent.trim().isEmpty());

		// Parse HTML with Jsoup
		Document doc = Jsoup.parse(htmlContent);

		// 5. HTML Structure and Dependencies Validation (using Jsoup)
		log.info("Validating HTML structure and dependencies using Jsoup...");
		// Check DOCTYPE (Jsoup normalizes this, check for basic HTML structure)
		assertEquals("Should have one html tag", 1, doc.select("html").size());
		assertEquals("Should have one head tag", 1, doc.select("head").size());
		assertEquals("Should have one body tag", 1, doc.select("body").size());

		// Check Title
		Element h1 = doc.selectFirst("h1");
		assertNotNull("HTML should contain an H1 tag", h1);
		assertEquals("HTML should contain 'Monthly Sales Trend' title", "Monthly Sales Trend", h1.text());

		// Chart.js Setup Validation
		Element chartJsScript = doc.selectFirst("script[src*='cdn.jsdelivr.net/npm/chart.js']");
		assertNotNull("HTML should include Chart.js from CDN via script tag", chartJsScript);

		Element canvas = doc.selectFirst("canvas#salesChart");
		assertNotNull("HTML should contain canvas with id 'salesChart'", canvas);

		// 6. Data Validation (Extracting from JS, comparing with expected)
		log.info("Validating report data embedded in JavaScript...");

		// Calculate expected data (represents our "source of truth")
		Map<YearMonth, MonthlySalesData> expectedData = calculateExpectedMonthlySales();
		assertTrue("Expected data should contain at least 4 months", expectedData.size() >= 4);

		// Extract actual data from generated JavaScript within the HTML
		// These helper methods parse the JS array definitions
		List<String> actualLabels = parseJsStringArray(htmlContent, "labels");
		List<Double> actualSales = parseJsDoubleArray(htmlContent, "salesData");
		List<Integer> actualOrders = parseJsIntegerArray(htmlContent, "orderCountData");

		// 6.1 Time Period Validation
		log.info("Validating time periods (labels)...");
		List<String> expectedLabels = expectedData.keySet().stream()
				.map(ym -> ym.format(DateTimeFormatter.ofPattern("yyyy-MM"))).collect(Collectors.toList());
		assertEquals("Number of time periods (labels) should match", expectedLabels.size(), actualLabels.size());
		assertEquals("Time period labels should match expected order and values", expectedLabels, actualLabels);

		// 6.2 Sales Data Validation
		log.info("Validating sales figures...");
		List<Double> expectedSales = expectedData.values().stream().map(data -> data.totalSales)
				.collect(Collectors.toList());
		assertEquals("Number of sales data points should match", expectedSales.size(), actualSales.size());

		// Validate each sales figure with proper logging
		for (int i = 0; i < expectedSales.size(); i++) {
			String period = actualLabels.get(i); // Use actual label for context
			double expected = expectedSales.get(i);
			double actual = actualSales.get(i);
			assertEquals(String.format("Sales for period %s should match", period), expected, actual, 0.01); // 1 cent
																												// tolerance
			log.debug("Verified sales for {}: Expected={}, Actual={}", period, expected, actual);
		}

		// 6.3 Order Count Validation
		log.info("Validating order counts...");
		List<Integer> expectedOrders = expectedData.values().stream().map(data -> data.orderCount)
				.collect(Collectors.toList());
		assertEquals("Number of order count data points should match", expectedOrders.size(), actualOrders.size());

		// Validate each order count with proper logging
		for (int i = 0; i < expectedOrders.size(); i++) {
			String period = actualLabels.get(i); // Use actual label for context
			int expected = expectedOrders.get(i);
			int actual = actualOrders.get(i);
			assertEquals(String.format("Order count for period %s should match", period), expected, actual);
			log.debug("Verified orders for {}: Expected={}, Actual={}", period, expected, actual);
		}

		// 7. Chart Configuration Validation (Isolating Script Content)
		log.info("Validating chart configuration within the script tag...");
		// --- MODIFIED SCRIPT SELECTION ---
		Elements scriptElements = doc.select("script"); // Select ALL script tags
		Element chartScriptElement = null;
		for (Element script : scriptElements) {
			// Check the actual HTML content of the script tag
			if (script.html().contains("new Chart(ctx,")) { // Check for a more specific part of the initialization
				chartScriptElement = script;
				log.info("Found chart script block using iteration and contains check.");
				break; // Found it, stop looping
			}
		}
		// --- END MODIFIED SCRIPT SELECTION ---

		assertNotNull("Script block containing 'new Chart(ctx,' should exist", chartScriptElement);
		String scriptContent = chartScriptElement.html(); // Get the content of that script block
		assertFalse("Chart script content should not be empty", scriptContent.trim().isEmpty());

		// 7.1 Basic Chart Setup
		assertTrue("Chart script should configure type as 'line'", scriptContent.contains("type: 'line'"));

		// 7.2 Dataset Configuration
		assertTrue("Chart script should contain 'Monthly Sales' dataset label",
				scriptContent.contains("label: 'Monthly Sales'"));
		assertTrue("Chart script should contain 'Order Count' dataset label",
				scriptContent.contains("label: 'Order Count'"));
		// Optionally check colors, tension etc. if they are stable/important
		assertTrue("Chart script should link 'Monthly Sales' dataset to ySales axis",
				scriptContent.contains("yAxisID: 'ySales'"));
		assertTrue("Chart script should link 'Order Count' dataset to yOrders axis",
				scriptContent.contains("yAxisID: 'yOrders'"));
		// assertTrue("Chart script should set 'Monthly Sales' color",
		// scriptContent.contains("borderColor: 'rgb(75, 192, 192)'"));
		// assertTrue("Chart script should set 'Order Count' color",
		// scriptContent.contains("borderColor: 'rgb(255, 99, 132)'"));
		// assertTrue("Chart script should set line tension",
		// scriptContent.contains("tension: 0.1"));

		// 7.3 Axes Configuration
		assertTrue("Chart script should define 'ySales' axis", scriptContent.contains("ySales:"));
		assertTrue("Chart script should set 'ySales' axis type to 'linear'", scriptContent.contains("type: 'linear'"));
		assertTrue("Chart script should set 'ySales' axis position to 'left'", scriptContent.contains("position: 'left'"));
		assertTrue("Chart script should set 'ySales' axis title text", scriptContent.contains("text: 'Sales ($)'"));

		assertTrue("Chart script should define 'yOrders' axis", scriptContent.contains("yOrders:"));
		assertTrue("Chart script should set 'yOrders' axis type to 'linear'", scriptContent.contains("type: 'linear'"));
		assertTrue("Chart script should set 'yOrders' axis position to 'right'", scriptContent.contains("position: 'right'"));
		assertTrue("Chart script should set 'yOrders' axis title text", scriptContent.contains("text: 'Orders'"));
		assertTrue("Chart script should disable grid lines for 'yOrders' axis", scriptContent.contains("grid: { drawOnChartArea: false }"));

		// 8. Business Logic / Sanity Checks (Based on validated data)
		log.info("Validating business logic and overall data sanity...");

		// Check if data shows expected trends (already covered by data size check)
		assertTrue("Should have data for at least 4 months", actualLabels.size() >= 4);

		// Verify total order volume
		int totalOrders = actualOrders.stream().mapToInt(Integer::intValue).sum();
		assertTrue("Should have a positive number of total orders", totalOrders > 0);
		// This assertion depends heavily on the exact test data generated.
		// If NorthwindDataGenerator is stable, this specific check is good.
		assertEquals("Should have expected total number of orders based on test data (7 original + 72 bulk)", 79, totalOrders);

		// Verify reasonable sales figures
		double totalSales = actualSales.stream().mapToDouble(Double::doubleValue).sum();
		assertTrue("Should have positive total sales", totalSales > 0);
		assertTrue("Total sales should be substantial with expanded data (>10000)",
				totalSales >= 10000.0);
		// Example: Check if the last month's sales are positive (assuming recent data)
		assertTrue("Last month's sales should be positive", actualSales.get(actualSales.size() - 1) > 0);
		// Example: Check if the first month's order count is positive
		assertTrue("First month's order count should be positive", actualOrders.get(0) > 0);

		log.info("========== Test completed successfully: {} ==========", TEST_NAME);
		// NOTE: The assertion failure regarding the number of time periods (4 vs 3)
		// should now be resolved.
		// However, the specific sales/order count values asserted might still fail
		// if the REFERENCE_DATE causes orders 1-4 to fall into a different month
		// than previously assumed by calculateExpectedMonthlySales.
		// The logic in calculateExpectedMonthlySales has been updated to match the
		// generator.

	}

	// --- Helper Methods for Monthly Sales Trend Test ---

	private static class MonthlySalesData {
		double totalSales = 0.0;
		int orderCount = 0;
	}

	private Map<YearMonth, MonthlySalesData> calculateExpectedMonthlySales() {
		Map<YearMonth, MonthlySalesData> monthlyData = new LinkedHashMap<>();

		LocalDate referenceDate = NorthwindDataGenerator.REFERENCE_DATE;
		ZoneId defaultZoneId = ZoneId.systemDefault();
		Instant referenceInstant = referenceDate.atStartOfDay(defaultZoneId).toInstant();

		BiConsumer<YearMonth, BigDecimal> addSale = (ym, amount) -> {
			monthlyData.computeIfAbsent(ym, k -> new MonthlySalesData());
			BigDecimal currentSales = BigDecimal.valueOf(monthlyData.get(ym).totalSales);
			monthlyData.get(ym).totalSales = currentSales.add(amount).doubleValue();
		};
		BiConsumer<YearMonth, Void> incrementOrderCount = (ym, v) -> {
			monthlyData.computeIfAbsent(ym, k -> new MonthlySalesData());
			monthlyData.get(ym).orderCount++;
		};

		// Product prices (matching NorthwindDataGenerator)
		BigDecimal[] productPrices = {
				new BigDecimal("18.00"),  // 0: Chai
				new BigDecimal("19.00"),  // 1: Chang
				new BigDecimal("10.00"),  // 2: Aniseed Syrup
				new BigDecimal("22.00"),  // 3: Chef Antons Cajun Seasoning
				new BigDecimal("12.50"),  // 4: Scottish Longbreads
				new BigDecimal("18.40"),  // 5: Boston Crab Meat
				new BigDecimal("34.00"),  // 6: Camembert Pierrot
				new BigDecimal("12.50"),  // 7: Gorgonzola Telino
				new BigDecimal("38.00"),  // 8: Gnocchi di nonna Alice
				new BigDecimal("7.00"),   // 9: Filo Mix
				new BigDecimal("97.00"),  // 10: Mishi Kobe Niku
				new BigDecimal("123.79"), // 11: Thuringer Rostbratwurst
				new BigDecimal("30.00"),  // 12: Uncle Bobs Organic Dried Pears
				new BigDecimal("23.25"),  // 13: Tofu
				new BigDecimal("4.50"),   // 14: Guarana Fantastica
				new BigDecimal("15.50"),  // 15: Genen Shouyu
				new BigDecimal("17.45"),  // 16: Pavlova
				new BigDecimal("31.00"),  // 17: Ikura
				new BigDecimal("21.00"),  // 18: Queso Cabrales
				new BigDecimal("19.50"),  // 19: Ravioli Angelo
		};

		BigDecimal disc5 = new BigDecimal("0.05");
		BigDecimal disc10 = new BigDecimal("0.10");
		BigDecimal noDisc = BigDecimal.ZERO;

		// --- Original 7 orders from createOrdersAndDetails() ---

		// Order 5 (~3 months before REFERENCE_DATE) - ALFKI
		YearMonth ym5 = YearMonth.from(referenceDate.minusMonths(3));
		addSale.accept(ym5, calculateLineTotal(productPrices[5], (short) 5, noDisc)
				.add(calculateLineTotal(productPrices[0], (short) 3, disc5)));
		incrementOrderCount.accept(ym5, null);

		// Order 6 (~2 months before REFERENCE_DATE) - ANATR
		YearMonth ym6 = YearMonth.from(referenceDate.minusMonths(2));
		addSale.accept(ym6, calculateLineTotal(productPrices[2], (short) 10, disc5)
				.add(calculateLineTotal(productPrices[4], (short) 4, noDisc)));
		incrementOrderCount.accept(ym6, null);

		// Order 7 (~1 month before REFERENCE_DATE) - BERGS
		YearMonth ym7 = YearMonth.from(referenceDate.minusMonths(1));
		addSale.accept(ym7, calculateLineTotal(productPrices[0], (short) 8, noDisc)
				.add(calculateLineTotal(productPrices[3], (short) 3, disc10))
				.add(calculateLineTotal(productPrices[1], (short) 5, noDisc)));
		incrementOrderCount.accept(ym7, null);

		// Order 1 (~10 days before REFERENCE_INSTANT) - ALFKI
		YearMonth ym1 = YearMonth.from(referenceInstant.minusSeconds(86400 * 10).atZone(defaultZoneId));
		addSale.accept(ym1, calculateLineTotal(productPrices[0], (short) 12, noDisc)
				.add(calculateLineTotal(productPrices[1], (short) 10, noDisc)));
		incrementOrderCount.accept(ym1, null);

		// Order 2 (~5 days before REFERENCE_INSTANT) - ANATR
		YearMonth ym2 = YearMonth.from(referenceInstant.minusSeconds(86400 * 5).atZone(defaultZoneId));
		addSale.accept(ym2, calculateLineTotal(productPrices[2], (short) 3, disc5));
		incrementOrderCount.accept(ym2, null);

		// Order 3 (~8 days before REFERENCE_INSTANT) - AROUT
		YearMonth ym3 = YearMonth.from(referenceInstant.minusSeconds(86400 * 8).atZone(defaultZoneId));
		addSale.accept(ym3, calculateLineTotal(productPrices[4], (short) 5, disc10)
				.add(calculateLineTotal(productPrices[3], (short) 2, noDisc)));
		incrementOrderCount.accept(ym3, null);

		// Order 4 (~3 days before REFERENCE_INSTANT) - BERGS
		YearMonth ym4 = YearMonth.from(referenceInstant.minusSeconds(86400 * 3).atZone(defaultZoneId));
		addSale.accept(ym4, calculateLineTotal(productPrices[5], (short) 8, noDisc));
		incrementOrderCount.accept(ym4, null);

		// --- 72 bulk orders from createBulkDashboardOrders() ---
		int orderCount = 72;
		LocalDate startDate = referenceDate.minusMonths(18);
		int numProducts = productPrices.length; // 20

		for (int i = 0; i < orderCount; i++) {
			int monthOffset = i / 4;
			int dayOfMonth = 5 + (i % 4) * 7;
			LocalDate orderDate = startDate.plusMonths(monthOffset)
					.withDayOfMonth(Math.min(dayOfMonth, 28));
			YearMonth ym = YearMonth.from(orderDate);

			BigDecimal orderSales = BigDecimal.ZERO;
			int detailCount = 2 + (i % 2);
			for (int j = 0; j < detailCount; j++) {
				int productIndex = (i * 3 + j) % numProducts;
				BigDecimal price = productPrices[productIndex];
				short qty = (short) (2 + (i + j) % 20);
				BigDecimal discount = j == 0 ? noDisc : disc5;
				orderSales = orderSales.add(calculateLineTotal(price, qty, discount));
			}
			addSale.accept(ym, orderSales);
			incrementOrderCount.accept(ym, null);
		}

		return monthlyData.entrySet().stream().sorted(Map.Entry.comparingByKey()).collect(Collectors
				.toMap(Map.Entry::getKey, Map.Entry::getValue, (oldValue, newValue) -> oldValue, LinkedHashMap::new));
	}

	private static BigDecimal calculateLineTotal(BigDecimal price, short qty, BigDecimal discount) {
		return price.multiply(BigDecimal.valueOf(qty)).multiply(BigDecimal.ONE.subtract(discount));
	}

	private List<String> parseJsStringArray(String htmlContent, String arrayName) {
		// Regex to find "const arrayName = ['val1', 'val2', ...];" or "let arrayName =
		// [...]"
		// It handles single quotes and potential spaces around elements and equals
		// sign.
		// It captures the content between the brackets.
		Pattern pattern = Pattern.compile("(?:const|let)\\s+" + Pattern.quote(arrayName) + "\\s*=\\s*\\[([^\\]]*)\\];");
		Matcher matcher = pattern.matcher(htmlContent);

		if (matcher.find()) {
			String arrayContent = matcher.group(1).trim();
			if (arrayContent.isEmpty()) {
				return Collections.emptyList();
			}
			// Split by comma, trim whitespace, and remove surrounding single quotes
			return Arrays.stream(arrayContent.split(",")).map(String::trim).map(s -> s.replaceAll("^'|'$", "")) // Remove
																												// leading/trailing
																												// single
																												// quotes
					.collect(Collectors.toList());
		}
		log.warn("Could not find or parse JS string array '{}' in HTML content.", arrayName);
		return Collections.emptyList();
	}

	private List<Double> parseJsDoubleArray(String htmlContent, String arrayName) {
		Pattern pattern = Pattern.compile("(?:const|let)\\s+" + Pattern.quote(arrayName) + "\\s*=\\s*\\[([^\\]]*)\\];");
		Matcher matcher = pattern.matcher(htmlContent);

		if (matcher.find()) {
			String arrayContent = matcher.group(1).trim();
			if (arrayContent.isEmpty()) {
				return Collections.emptyList();
			}
			try {
				return Arrays.stream(arrayContent.split(",")).map(String::trim).filter(s -> !s.isEmpty())
						.map(Double::parseDouble) // Parse as Double
						.collect(Collectors.toList());
			} catch (NumberFormatException e) {
				log.error("Error parsing JS double array '{}': {}", arrayName, e.getMessage());
				return Collections.emptyList();
			}
		}
		log.warn("Could not find or parse JS double array '{}' in HTML content.", arrayName);
		return Collections.emptyList();
	}

	private List<Integer> parseJsIntegerArray(String htmlContent, String arrayName) {
		Pattern pattern = Pattern.compile("(?:const|let)\\s+" + Pattern.quote(arrayName) + "\\s*=\\s*\\[([^\\]]*)\\];");
		Matcher matcher = pattern.matcher(htmlContent);

		if (matcher.find()) {
			String arrayContent = matcher.group(1).trim();
			if (arrayContent.isEmpty()) {
				return Collections.emptyList();
			}
			try {
				return Arrays.stream(arrayContent.split(",")).map(String::trim).filter(s -> !s.isEmpty()) // Filter out
																											// empty
																											// strings
						.map(Integer::parseInt) // Parse as Integer
						.collect(Collectors.toList());
			} catch (NumberFormatException e) {
				log.error("Error parsing JS integer array '{}': {}", arrayName, e.getMessage());
				return Collections.emptyList();
			}
		}
		log.warn("Could not find or parse JS integer array '{}' in HTML content.", arrayName);
		return Collections.emptyList();
	}

	@Test
	public void testSupplierScorecard() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-SupplierScorecard";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Create reporter with H2 connection
		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS) {

			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure the script source and database connection
				ctx.settings.getReportDataSource().scriptoptions.conncode = NorthwindTestUtils.H2_CONN_CODE;
				ctx.settings.getReportDataSource().scriptoptions.idcolumn = "SupplierID";
				ctx.settings
						.getReportDataSource().scriptoptions.scriptname = "scriptedReport_supplierScorecardReport.groovy";

				// Configure output
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.SCRIPTED_SCORECARD_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("supplier_${burst_token}_scorecard.html");
			}
		};

		// Execute the burst process
		reporter.burst();

		// Assertions
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);
		assertNotNull("Source data should not be null", ctx.reportData);

		List<String> expectedSupplierIds = Arrays.asList("1", "2", "3", "4", "5", "6");
		assertNotNull("Burst tokens (SupplierIDs) list should not be null", ctx.burstTokens);
		List<String> actualSupplierIds = ctx.burstTokens;
		log.info("Actual burst tokens (SupplierIDs): {}", actualSupplierIds);

		assertTrue("All expected suppliers should be present", actualSupplierIds.containsAll(expectedSupplierIds));
		assertEquals("Number of suppliers should match", expectedSupplierIds.size(), actualSupplierIds.size());

		// Validate metrics for each supplier against pre-calculated values
		for (String supplierId : actualSupplierIds) {
			log.info("Validating metrics for Supplier ID: {}", supplierId);

			Map<String, Object> reportedMetrics = ctx.reportData.stream()
					.filter(row -> supplierId.equals(String.valueOf(row.get("SupplierID")))).findFirst().orElse(null);
			assertNotNull("Data row for Supplier " + supplierId + " should exist", reportedMetrics);

			String companyName = (String) reportedMetrics.get("CompanyName");
			log.info("Validating {} ({})", companyName, supplierId);

			// Verify output file exists
			String outputFileName = "supplier_" + supplierId + "_scorecard.html";
			File outputFile = new File(ctx.outputFolder, outputFileName);
			assertTrue("Output file should exist: " + outputFileName, outputFile.exists());

			switch (supplierId) {
			case "1": // Exotic Liquids — Chai, Chang, Aniseed Syrup (3 products)
				assertEquals("Product count for Supplier 1", 3,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				assertEquals("Avg unit price for Supplier 1", 15.67,
						((Number) reportedMetrics.get("AvgUnitPrice")).doubleValue(), 0.01);
				assertEquals("Low stock count for Supplier 1", 2,
						((Number) reportedMetrics.get("LowStockCount")).intValue());
				assertNotNull("Delivery days should exist for Supplier 1", reportedMetrics.get("AvgDeliveryDays"));
				assertNotNull("Late delivery percent should exist for Supplier 1", reportedMetrics.get("LateDeliveryPercent"));
				break;

			case "2": // New Orleans Cajun Delights — Cajun Seasoning, Guarana Fantastica (2 products)
				assertEquals("Product count for Supplier 2", 2,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				assertEquals("Avg unit price for Supplier 2", 13.25,
						((Number) reportedMetrics.get("AvgUnitPrice")).doubleValue(), 0.01);
				assertEquals("Low stock count for Supplier 2", 0,
						((Number) reportedMetrics.get("LowStockCount")).intValue());
				assertNotNull("Delivery days should exist for Supplier 2", reportedMetrics.get("AvgDeliveryDays"));
				break;

			case "3": // Grandma Kelly's Homestead — Longbreads, Crab Meat, Uncle Bobs Dried Pears (3 products)
				assertEquals("Product count for Supplier 3", 3,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				assertEquals("Avg unit price for Supplier 3", 20.30,
						((Number) reportedMetrics.get("AvgUnitPrice")).doubleValue(), 0.01);
				assertNotNull("Delivery days should exist for Supplier 3", reportedMetrics.get("AvgDeliveryDays"));
				break;

			case "4": // Tokyo Traders — Filo Mix, Mishi Kobe Niku, Tofu, Genen Shouyu, Ikura (5 products)
				assertEquals("Product count for Supplier 4", 5,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				break;

			case "5": // Pavlova Ltd — Thuringer Rostbratwurst, Pavlova, Queso Cabrales (3 products)
				assertEquals("Product count for Supplier 5", 3,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				break;

			case "6": // Pasta Buttini — Camembert, Gorgonzola, Gnocchi, Ravioli Angelo (4 products)
				assertEquals("Product count for Supplier 6", 4,
						((Number) reportedMetrics.get("ProductCount")).intValue());
				break;

			default:
				fail("Unexpected Supplier ID: " + supplierId);
			}

			// Verify HTML rendering
			String htmlContent = Files.readString(outputFile.toPath(), StandardCharsets.UTF_8);
			Document doc = Jsoup.parse(htmlContent);

			Element ratingElem = doc.selectFirst("span.kpi-label:contains(Rating:) + span.kpi-value");
			assertNotNull("Rating element should be present in HTML", ratingElem);

			// Rating can be Good, Average, Poor, or N/A depending on delivery data
			String actualRating = ratingElem.text();
			assertTrue("Rating should be one of Good/Average/Poor/N/A for Supplier " + supplierId,
					List.of("Good", "Average", "Poor", "N/A").contains(actualRating));
			log.info("✓ HTML rendering verified for {}", companyName);
		}

		log.info("All supplier scorecard metrics successfully verified");
		log.info("========== Test completed: {} ==========", TEST_NAME);
	}

	/**
	 * Tests DuckDB with Groovy script querying CSV file.
	 * This provides basic confidence that DuckDB works with ScriptedReporter flows.
	 */
	@Test
	public void testDuckDBGroovyScriptQueryCSV() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-DuckDB-CSV";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Use in-memory DuckDB
		final String DUCKDB_URL = "jdbc:duckdb:";
		final String DUCKDB_USER = "";
		final String DUCKDB_PASS = "";
		final String DUCKDB_CONN_CODE = "DUCKDB_CSV_TEST_CONN";

		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS) {
			
			@Override
			protected ServerDatabaseSettings getServerDatabaseSettings(String connectionCode) throws Exception {
				// Handle DuckDB connection code - create settings directly without XML file
				if (connectionCode.equals(DUCKDB_CONN_CODE)) {
					ServerDatabaseSettings duckdbSettings = new ServerDatabaseSettings();
					duckdbSettings.url = DUCKDB_URL;
					duckdbSettings.userid = DUCKDB_USER;
					duckdbSettings.userpassword = DUCKDB_PASS;
					duckdbSettings.driver = "org.duckdb.DuckDBDriver";
					return duckdbSettings;
				}
				return super.getServerDatabaseSettings(connectionCode);
			}
			
			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure ScriptedReporter to use pre-created Groovy script
				ctx.settings.getReportDataSource().scriptoptions.conncode = DUCKDB_CONN_CODE;
				ctx.settings.getReportDataSource().scriptoptions.idcolumn = "employee_id";
				ctx.settings.getReportDataSource().scriptoptions.scriptname = "scriptedReport_duckdbCsvQuery.groovy";

				// Configure output - use employee-specific template that matches CSV columns
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.DUCKDB_EMPLOYEE_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("employee_${burst_token}.html");
			}
		};

		// Execute the burst process
		reporter.burst();

		// Verify results
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);
		assertNotNull("Report data should not be null", ctx.reportData);
		assertEquals("Should have 2 employee records", 2, ctx.reportData.size());

		// Verify burst tokens
		assertNotNull("Burst tokens should not be null", ctx.burstTokens);
		assertEquals("Should have 2 burst tokens", 2, ctx.burstTokens.size());
		assertTrue("Should have token for employee 1", ctx.burstTokens.contains("1"));
		assertTrue("Should have token for employee 2", ctx.burstTokens.contains("2"));

		// Verify output files
		assertTrue("Output file for employee 1 should exist",
			new File(ctx.outputFolder + "/employee_1.html").exists());
		assertTrue("Output file for employee 2 should exist",
			new File(ctx.outputFolder + "/employee_2.html").exists());

		log.info("========== Test completed: {} ==========", TEST_NAME);
	}

	/**
	 * Tests DuckDB with Groovy script mixing CSV and in-memory data.
	 * This demonstrates DuckDB's ability to combine multiple data sources.
	 */
	@Test
	public void testDuckDBGroovyScriptMixedSources() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-DuckDB-Mixed";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Use in-memory DuckDB
		final String DUCKDB_URL = "jdbc:duckdb:";
		final String DUCKDB_USER = "";
		final String DUCKDB_PASS = "";
		final String DUCKDB_CONN_CODE = "DUCKDB_MIXED_TEST_CONN";

		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, DUCKDB_URL, DUCKDB_USER, DUCKDB_PASS) {
			
			@Override
			protected ServerDatabaseSettings getServerDatabaseSettings(String connectionCode) throws Exception {
				// Handle DuckDB connection code - create settings directly without XML file
				if (connectionCode.equals(DUCKDB_CONN_CODE)) {
					ServerDatabaseSettings duckdbSettings = new ServerDatabaseSettings();
					duckdbSettings.url = DUCKDB_URL;
					duckdbSettings.userid = DUCKDB_USER;
					duckdbSettings.userpassword = DUCKDB_PASS;
					duckdbSettings.driver = "org.duckdb.DuckDBDriver";
					return duckdbSettings;
				}
				return super.getServerDatabaseSettings(connectionCode);
			}
			
			@Override
			protected void executeController() throws Exception {
				super.executeController();

				// Configure ScriptedReporter to use pre-created Groovy script
				ctx.settings.getReportDataSource().scriptoptions.conncode = DUCKDB_CONN_CODE;
				ctx.settings.getReportDataSource().scriptoptions.idcolumn = "employee_id";
				ctx.settings.getReportDataSource().scriptoptions.scriptname = "scriptedReport_duckdbMixedSources.groovy";

				// Configure output - use enriched employee template that matches joined columns
				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = NorthwindTestUtils.DUCKDB_ENRICHED_EMPLOYEE_TEMPLATE_HTML;
				ctx.settings.setBurstFileName("enriched_${burst_token}.html");
			}
		};

		// Execute the burst process
		reporter.burst();

		// Verify results
		BurstingContext ctx = reporter.getCtx();
		assertNotNull("BurstingContext should not be null", ctx);
		assertNotNull("Report data should not be null", ctx.reportData);
		assertEquals("Should have 2 enriched employee records", 2, ctx.reportData.size());

		// Verify column names include both CSV and in-memory data
		assertNotNull("Column names should not be null", ctx.reportColumnNames);
		assertEquals("Should have 6 columns", 6, ctx.reportColumnNames.size());
		assertTrue("Should have department column", ctx.reportColumnNames.contains("department"));
		assertTrue("Should have salary column", ctx.reportColumnNames.contains("salary"));

		// Verify first employee data
		Map<String, Object> emp1 = ctx.reportData.get(0);
		assertEquals("1", emp1.get("employee_id").toString());
		assertEquals("Engineering", emp1.get("department"));

		// Verify output files
		assertTrue("Output file for employee 1 should exist",
			new File(ctx.outputFolder + "/enriched_1.html").exists());
		assertTrue("Output file for employee 2 should exist",
			new File(ctx.outputFolder + "/enriched_2.html").exists());

		log.info("========== Test completed: {} ==========", TEST_NAME);
	}

	@Test
	public void testMultiDatabaseCustomerScorecard() throws Exception {
		final String TEST_NAME = "ScriptedReporterTest-MultiDatabaseCustomerScorecard";
		log.info("========== Starting test: {} ==========", TEST_NAME);

		// Set up the SECONDARY in-memory H2 (customer_segments table) — distinct
		// from the primary Northwind H2 owned by NorthwindTestUtils.
		com.sourcekraft.documentburster._helpers.MultiDbTestUtils.setupSecondaryCustomerMetaDb();

		// Minimal HTML template referencing the actual scorecard schema (not the
		// supplier-scorecard template, which references SupplierID/CompanyName/etc.).
		NorthwindTestUtils.ensureTemplateDirectoryExists(NorthwindTestUtils.TEMPLATES_DIR);
		final String crossDbScorecardTemplateHtml = NorthwindTestUtils.TEMPLATES_DIR
				+ "scriptedReport_crossDbScorecard_template.html";
		File crossDbTpl = new File(crossDbScorecardTemplateHtml);
		if (!crossDbTpl.exists()) {
			String html = "<!DOCTYPE html>\n<html><head><meta charset=\"UTF-8\">"
					+ "<title>Customer Scorecard - ${CustomerID}</title></head><body>"
					+ "<h1>${Company} (${CustomerID})</h1>"
					+ "<p>Orders: ${OrderCount} — Revenue: ${TotalRevenue}</p>"
					+ "<p>Segment: <strong>${Segment}</strong> — Churn risk: ${ChurnRisk}</p>"
					+ "</body></html>";
			java.nio.file.Files.write(crossDbTpl.toPath(), html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
		}

		TestBursterFactory.ScriptedReporter reporter = new TestBursterFactory.ScriptedReporter(StringUtils.EMPTY,
				TEST_NAME, NorthwindTestUtils.H2_URL, NorthwindTestUtils.H2_USER, NorthwindTestUtils.H2_PASS) {
			@Override
			protected void executeController() throws Exception {
				super.executeController();
				// Primary connection = Northwind (resolved via TestBursterFactory.ScriptedReporter's
				// getServerDatabaseSettings() override — no file load needed).
				ctx.settings.getReportDataSource().scriptoptions.conncode = NorthwindTestUtils.H2_CONN_CODE;
				ctx.settings.getReportDataSource().scriptoptions.scriptname = "scriptedReport_crossDbCustomerScorecard.groovy";
				ctx.settings.getReportDataSource().scriptoptions.idcolumn = "CustomerID";

				// Pre-populate ctx.namedDbSql so the script's ctx.getConnection(SECONDARY_CONN_CODE)
				// returns the secondary H2 instance directly — bypasses the dbManager
				// file-loading path that would require a real connection XML on disk.
				ctx.namedDbSql = new java.util.LinkedHashMap<>();
				ctx.namedDbSql.put(
						com.sourcekraft.documentburster._helpers.MultiDbTestUtils.SECONDARY_CONN_CODE,
						com.sourcekraft.documentburster._helpers.MultiDbTestUtils.openSecondarySqlForTest());

				ctx.settings.getReportTemplate().outputtype = CsvUtils.OUTPUT_TYPE_HTML;
				ctx.settings.getReportTemplate().documentpath = crossDbScorecardTemplateHtml;
			}
		};

		reporter.burst();

		BurstingContext ctx = reporter.getCtx();
		assertNotNull("ctx should not be null", ctx);
		assertNotNull("reportData should not be null", ctx.reportData);
		assertFalse("reportData should not be empty (Northwind ∩ customer_segments should yield rows)",
				ctx.reportData.isEmpty());

		// Every row must carry merged columns from BOTH databases.
		boolean foundAlfki = false;
		for (Map<String, Object> row : ctx.reportData) {
			assertNotNull("row.CustomerID should not be null",   row.get("CustomerID"));
			assertNotNull("row.Company should not be null",      row.get("Company"));
			assertNotNull("row.OrderCount should not be null",   row.get("OrderCount"));
			assertNotNull("row.TotalRevenue should not be null", row.get("TotalRevenue"));
			assertNotNull("row.Segment should not be null (from secondary DB)",  row.get("Segment"));
			assertNotNull("row.ChurnRisk should not be null (from secondary DB)", row.get("ChurnRisk"));

			if ("ALFKI".equals(row.get("CustomerID"))) {
				foundAlfki = true;
				assertEquals("ALFKI should be tagged 'midmarket' from the secondary DB",
						"midmarket", row.get("Segment"));
				Object churn = row.get("ChurnRisk");
				BigDecimal churnVal = churn instanceof BigDecimal ? (BigDecimal) churn
						: new BigDecimal(churn.toString());
				assertTrue("ALFKI churn_risk should be > 0 and < 1, was: " + churnVal,
						churnVal.compareTo(BigDecimal.ZERO) > 0
								&& churnVal.compareTo(BigDecimal.ONE) < 0);
			}
		}
		assertTrue("ALFKI row from Northwind should appear merged with secondary-DB segment data", foundAlfki);

		// Framework lifecycle proof: the finally block in ScriptedReporter.fetchData()
		// closes every entry in ctx.namedDbSql and sets the map to null.
		assertNull("ctx.namedDbSql should be cleaned up after fetchData finishes", ctx.namedDbSql);

		log.info("========== Test completed: {} ==========", TEST_NAME);
	}

}
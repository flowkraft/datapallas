package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.cubes.CubeQuery;
import com.flowkraft.cubes.CubeSqlGenerator;
import com.flowkraft.reporting.dsl.chart.ChartOptions;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Story 24, the Country Sales Dashboard: a country manager picks their country at the top of a
 * published dashboard and every tile follows.
 *
 * <p>The author built the tiles from the Shop cube on the canvas and bound the dashboard's one
 * {@code country} parameter to the cube's {@code Country} dimension. That binding is a cube filter
 * whose value is the parameter's name, so the SQL the canvas freezes carries {@code ${country}} -
 * and from there it is an ordinary published dashboard: {@link ScriptAssembler} writes the guard
 * that leaves the line out when nothing is picked, and the bind rewrites {@code *} to {@code 1=1}.
 *
 * <p>Everything here is the real path: the real generator writes the SQL, the real exporter writes
 * the files, the files it writes are the ones the sample ships, and the script it writes is run on
 * the frozen {@code cube_demo} rows. The numbers are the plan's, which are
 * {@code truths-stories-21-30.out}'s.
 */
class CubeCountrySalesDashboardTest {

	private static final String SHOP =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes/retail-ecommerce/"
					+ "online-sales-cube-config.groovy";

	private static final String SAMPLE_DIR =
			"../../asbl/src/main/external-resources/db-template/config/samples/g-cube-country-sales";

	private static final String REPORT_ID = "g-cube-country-sales";

	/** The DuckDB Northwind sample connection, which is where {@code cube_demo} lives. */
	private static final String CONNECTION = "rbt-sample-northwind-duckdb-4f2";

	private static final String API = "http://localhost:9090/api";

	/** What the viewer picks for "every country": the wildcard the bind rewrites to {@code 1=1}. */
	private static final String ALL = "*";

	@TempDir
	Path tempDir;

	// ── The canvas the author built ──────────────────────────────────────────────

	/**
	 * One widget's question. Every tile excludes the cancelled and the returned orders, as Net
	 * Sales does by itself - a KPI that counted them would not agree with the money beside it -
	 * and every tile carries the binding, which is what makes the dashboard's filter reach it.
	 */
	private static Map<String, Object> selection(List<String> dimensions, List<String> measures,
			boolean bound) {

		// Written in the order the page writes a filter in - member, operator, values - because a
		// shipped sample is compared byte for byte, and a Map.of is in no order at all.
		List<Map<String, Object>> filters = new ArrayList<>();
		filters.add(ordered("member", "Status", "operator", "notIn",
				"values", List.of("Cancelled", "Returned")));
		if (bound)
			filters.add(ordered("member", "Country", "operator", "in", "values", List.of("${country}")));

		Map<String, Object> selection = new LinkedHashMap<>();
		selection.put("dimensions", dimensions);
		selection.put("measures", measures);
		selection.put("segments", List.of());
		selection.put("filters", filters);
		selection.put("granularities", Map.of());
		selection.put("order", List.of());
		selection.put("limit", 500);
		if (bound)
			selection.put("paramBindings",
					List.of(ordered("param", "country", "member", "Country", "operator", "in")));
		return selection;
	}

	/** One cube widget, in the shape the AI Hub canvas sends it in. */
	private static Map<String, Object> widget(String id, String type, Map<String, Object> selection,
			Map<String, Object> displayConfig, int x, int y, int w, int h) throws Exception {

		Map<String, Object> visualQuery = new LinkedHashMap<>();
		visualQuery.put("kind", "cube");
		visualQuery.put("cubeId", "online-sales");
		visualQuery.put("table", "");
		visualQuery.put("filters", List.of());
		visualQuery.put("summarize", List.of());
		visualQuery.put("groupBy", List.of());
		visualQuery.put("sort", List.of());
		visualQuery.put("limit", 500);
		visualQuery.put("cubeSelection", selection);

		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "visual");
		dataSource.put("visualQuery", visualQuery);
		dataSource.put("generatedSql", frozenSql(selection));

		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", id);
		widget.put("type", type);
		widget.put("dataSource", dataSource);
		widget.put("gridPosition", Map.of("x", x, "y", y, "w", w, "h", h));
		widget.put("displayConfig", displayConfig);
		return widget;
	}

	/**
	 * The four tiles of the story: the two KPIs, the channels and the categories. Each one answers a
	 * question the country manager has about the country they picked - how much it sold (Net Sales),
	 * how much of it went out of the door (Units), where the orders came from (Channel) and what was
	 * bought (Category) - and they are ordered as the reader reads them, the money first.
	 *
	 * <p>The chart's {@code dslConfig} is the chart DSL's own shape, which is the shape the canvas
	 * writes: a {@code data} block with the column the bars are labelled by and one dataset per
	 * column plotted, and the title where Chart.js keeps it. Written any other way - {@code title},
	 * {@code xField}, {@code yFields} - the names fall into the options map, Chart.js ignores them,
	 * and the chart is drawn with no dataset at all: labels on an empty axis (D3).
	 */
	private static List<Map<String, Object>> canvas(boolean bound) throws Exception {
		return List.of(
				widget("w-kpi-net", "number", selection(List.of(), List.of("NetSales"), bound),
						ordered("numberField", "NetSales", "numberLabel", "Net Sales",
								"numberFormat", "currency"),
						0, 1, 3, 2),
				widget("w-kpi-units", "number", selection(List.of(), List.of("Units"), bound),
						ordered("numberField", "Units", "numberLabel", "Units", "numberFormat", "number"),
						3, 1, 3, 2),
				widget("w-orders-channel", "chart",
						selection(List.of("Channel"), List.of("Orders"), bound),
						ordered("chartTitle", "Orders by Channel", "xFields", List.of("Channel"),
								"yFields", List.of("Orders"),
								"dslConfig", ordered("type", "bar",
										"data", ordered("labelField", "Channel",
												"datasets", List.of(ordered("field", "Orders",
														"label", "Orders"))),
										"options", ordered("plugins", ordered("title",
												ordered("display", true,
														"text", "Orders by Channel"))))),
						0, 3, 6, 4),
				widget("w-net-category", "tabulator",
						selection(List.of("Category"), List.of("NetSales"), bound),
						ordered("dslConfig", ordered("layout", "fitColumns", "autoColumns", true),
								"columnSettings", settledAsMoney()),
						6, 3, 6, 4));
	}

	/**
	 * What the canvas settles Net Sales to be, the moment the author picks it (W4.2): the cube
	 * declares the measure money and declares itself read in EUR, so the column is money in EUR -
	 * in the table on the canvas, and, since the exporter writes it into the table's own DSL, in
	 * the published one too. Nobody typed it; it is the cube's own word, carried.
	 *
	 * <p>The canvas seeds this on every widget built on a cube. Only the tables read it back.
	 */
	private static Map<String, Object> settledAsMoney() {
		return ordered("NetSales", ordered("numberStyle", "currency", "currency", "EUR"));
	}

	/**
	 * The title the page opens with, the way a user puts one there: a text widget at the top of the
	 * canvas, above the parameter bar's own row.
	 *
	 * <p>It says what the page is for and what it answers, so a reader who arrives at it by a share
	 * link - with no sample list and no menu around it - knows what they are looking at. A text
	 * widget carries no query of any kind, so it has no data source: the exporter reads its markdown
	 * and nothing else.
	 */
	private static Map<String, Object> titleWidget() {
		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", "w-title");
		widget.put("type", "text");
		widget.put("gridPosition", Map.of("x", 0, "y", 0, "w", 12, "h", 1));
		widget.put("displayConfig", ordered("textContent",
				"# Country Sales\n\n"
						+ "What the country you picked sold: the money and the units, the channels its"
						+ " orders came through, the categories that earned it - and the shop cube"
						+ " itself, for the questions this page does not answer."));
		return widget;
	}

	/**
	 * The dashboard as it ships: its title, the four frozen tiles, and the Shop cube itself beside
	 * them (R8, TODO 21a).
	 *
	 * The country manager gets both kinds at once - numbers they read, and a cube they tick their
	 * own breakdowns in - and the one `country` at the top drives them the same way. The frozen
	 * tiles carry `${country}` in their SQL; the live one carries the binding in its entry, and
	 * the server applies it to every question the viewer asks.
	 */
	private static List<Map<String, Object>> shippedCanvas(boolean bound) throws Exception {
		List<Map<String, Object>> widgets = new ArrayList<>();
		widgets.add(titleWidget());
		widgets.addAll(canvas(bound));
		widgets.add(liveCube(bound));
		return widgets;
	}

	/**
	 * The live cube widget: Show In Dashboard checked, opening on Net Sales by Channel.
	 *
	 * It has no frozen SQL at all - that is the whole difference between the two modes - so what
	 * it is asked, and what the dashboard's filter does to it, is decided at run time out of the
	 * entry the exporter writes for it.
	 */
	private static Map<String, Object> liveCube(boolean bound) throws Exception {
		Map<String, Object> selection = selection(List.of("Channel"), List.of("NetSales"), bound);
		if (bound) {
			// A live cube carries the binding and not the filter the binding would freeze: the
			// question it opens with is the author's own, and the dashboard's country is added to
			// it for each viewer, with their answer bound. `${country}` is how a frozen tile
			// carries a filter nobody has answered yet; a live one has no frozen anything.
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> filters = new ArrayList<>(
					(List<Map<String, Object>>) selection.get("filters"));
			filters.removeIf(filter -> "Country".equals(filter.get("member")));
			selection.put("filters", filters);
		}
		Map<String, Object> widget = widget("w-live-shop", "tabulator", selection,
				ordered("dslConfig", ordered("layout", "fitColumns", "autoColumns", true),
						"columnSettings", settledAsMoney()),
				0, 7, 12, 6);
		@SuppressWarnings("unchecked")
		Map<String, Object> dataSource = (Map<String, Object>) widget.get("dataSource");
		@SuppressWarnings("unchecked")
		Map<String, Object> visualQuery = (Map<String, Object>) dataSource.get("visualQuery");
		visualQuery.put("showInDashboard", true);
		// The six stories this dashboard offers, in the order a reader reads them. A dashboard is
		// not a cube catalogue: the Online Sales cube answers ten questions, and the six named
		// here are the ones that still mean something once a country is picked at the top of the
		// page. The two that group by Country would answer in one row.
		visualQuery.put("showHints", STORIES);
		// A live cube publishes no SQL: the dashboard carries the cube, not an answer to it.
		dataSource.put("generatedSql", "");
		return widget;
	}

	/** The stories the live tile offers, in the order it offers them (D7). */
	private static final List<String> STORIES = List.of("revenue-mix", "sales-by-month",
			"sales-by-city", "discount-by-category", "category-margin", "sales-for-a-period");

	/** A map whose keys stay in the order they were written in, which is the order they are emitted in. */
	private static Map<String, Object> ordered(Object... keysAndValues) {
		Map<String, Object> map = new LinkedHashMap<>();
		for (int i = 0; i < keysAndValues.length; i += 2)
			map.put(String.valueOf(keysAndValues[i]), keysAndValues[i + 1]);
		return map;
	}

	/** The dashboard's one parameter: a select with All, which travels as the wildcard. */
	private static List<Map<String, Object>> parameters() {
		Map<String, Object> country = new LinkedHashMap<>();
		country.put("id", "country");
		country.put("type", "String");
		country.put("label", "Country");
		country.put("defaultValue", ALL);
		country.put("constraints", ordered("required", false));
		country.put("uiHints", ordered("control", "select", "options",
				"SELECT '*' AS value, 'All countries' AS label"
						+ " UNION ALL SELECT DISTINCT country AS value, country AS label"
						+ " FROM cube_demo.shop_customers WHERE country IS NOT NULL ORDER BY 1"));
		return List.of(country);
	}

	// ── What the canvas freezes ──────────────────────────────────────────────────

	@Test
	@DisplayName("Every tile's frozen SQL carries the dashboard's parameter, not a country")
	void theBindingIsWhatTheFrozenSqlCarries() throws Exception {

		for (Map<String, Object> widget : canvas(true)) {
			@SuppressWarnings("unchecked")
			String sql = String.valueOf(((Map<String, Object>) widget.get("dataSource")).get("generatedSql"));
			// The binding's own line, in the form a list parameter is bound in: the name stands
			// alone, so `Germany` binds as one value and `*` is rewritten to 1=1.
			assertTrue(sql.contains("cube_demo.shop_customers.country IN (${country})"),
					widget.get("id") + " carries the parameter: " + sql);
			// And the author's own filter is beside it, on its own line, as the cube wrote it.
			assertTrue(sql.contains("cube_demo.shop_orders.status NOT IN ('Cancelled', 'Returned')"),
					widget.get("id") + " excludes the cancelled and the returned: " + sql);
			assertFalse(sql.contains("'Germany'"),
					"No country is frozen into the dashboard: " + sql);
		}

		// The negative half: the same four questions without the binding freeze the same SQL with
		// no parameter in it at all - which is the dashboard that ignores its own filter.
		for (Map<String, Object> widget : canvas(false)) {
			@SuppressWarnings("unchecked")
			String sql = String.valueOf(((Map<String, Object>) widget.get("dataSource")).get("generatedSql"));
			assertFalse(sql.contains("${country}"), widget.get("id") + ": " + sql);
			assertFalse(sql.contains("shop_customers.country"), widget.get("id") + ": " + sql);
		}
	}

	@Test
	@DisplayName("The exported dashboard is the sample that ships")
	void theSampleIsWhatTheExporterWrites() throws Exception {

		DashboardFileGenerator.GeneratedFiles files = DashboardFileGenerator.generate(
				shippedCanvas(true), parameters(), REPORT_ID, API, CONNECTION);
		String script = ScriptAssembler.assemble(shippedCanvas(true), parameters()).text();

		assertEquals(shipped(REPORT_ID + "-script.groovy"), script,
				"The shipped script is the one the exporter writes for the story's canvas");
		assertEquals(shipped(REPORT_ID + "-template.html"), files.templateHtml());
		assertEquals(shipped(REPORT_ID + "-report-parameters-spec.groovy"), files.parametersSpecGroovy());
		assertEquals(shipped(REPORT_ID + "-chart-config.groovy"), files.chartConfigGroovy());
		assertEquals(shipped(REPORT_ID + "-tabulator-config.groovy"), files.tabulatorConfigGroovy());
		assertEquals(shipped(REPORT_ID + "-value-config.json"), files.valueConfigJson());

		// The page opens with what it is: the title widget's heading and the line under it, above
		// everything else the reader sees. A dashboard reached by a share link has nothing else to
		// say so (D2).
		assertTrue(files.templateHtml().contains("<h1>Country Sales</h1>"), files.templateHtml());
		assertTrue(files.templateHtml().contains("What the country you picked sold"),
				files.templateHtml());
		assertTrue(files.templateHtml().indexOf("Country Sales</h1>")
				< files.templateHtml().indexOf("<rb-value"), files.templateHtml());

		// Both modes on one dashboard: four tiles carry frozen SQL, and the fifth is the cube.
		assertEquals(shipped(REPORT_ID + "-cube-widgets.json"), files.cubeWidgetsJson());

		// The live tile offers exactly these six stories, in this order (D7): a reader opening the
		// dashboard cold is told what the cube can answer, in the words of this dashboard.
		int at = -1;
		for (String story : STORIES) {
			int found = files.cubeWidgetsJson().indexOf("\"" + story + "\"");
			assertTrue(found > at, "exactly these six ids, in this order: " + story
					+ " in " + files.cubeWidgetsJson());
			at = found;
		}
		// The negative half: the stories that would fight this dashboard are named nowhere, and a
		// tile that named none would carry no key at all.
		for (String left : List.of("sales-by-country", "customers-by-country", "what-sells",
				"customers-by-category")) {
			assertFalse(files.cubeWidgetsJson().contains("\"" + left + "\""),
					left + " is not one of this dashboard's six: " + files.cubeWidgetsJson());
		}
		assertTrue(files.templateHtml().contains("rb-cube-renderer"), files.templateHtml());
		// The binding rides in the entry, never in the markup and never in a request.
		assertTrue(files.cubeWidgetsJson().contains("\"paramBindings\""), files.cubeWidgetsJson());
		assertTrue(files.cubeWidgetsJson().contains("\"param\" : \"country\""), files.cubeWidgetsJson());
		assertTrue(files.cubeWidgetsJson().contains("\"member\" : \"Country\""), files.cubeWidgetsJson());
		// And what the live cube opens with is the author's own question, with no parameter name
		// standing in it: `${country}` is the frozen tiles' way of carrying the filter, not this
		// one's.
		assertFalse(files.cubeWidgetsJson().contains("${country}"), files.cubeWidgetsJson());
		// And the parameter the tiles are bound to is the one the dashboard offers.
		assertTrue(files.parametersSpecGroovy().contains("id: 'country'"), files.parametersSpecGroovy());
		assertTrue(files.templateHtml().contains("<rb-parameters"), files.templateHtml());
	}

	@Test
	@DisplayName("The script binds the country and leaves the line out when nothing is picked")
	void theScriptBindsRatherThanWritesTheCountry() throws Exception {

		String script = ScriptAssembler.assemble(canvas(true), parameters()).text();

		// The value is bound, never written into the SQL text: a dashboard that pasted it in would
		// be one quote away from being a different question.
		assertTrue(script.contains("def country = userVars?.get('country')?.toString()"), script);
		assertTrue(script.contains("hasCountry"), script);
		assertFalse(script.contains("'Germany'"), script);
		assertFalse(script.contains("${country}"), script);
	}

	// ── What the published dashboard answers ─────────────────────────────────────

	@Test
	@DisplayName("Germany is picked and every tile follows; All is more than the countries add up to")
	void theWholeChainOnTheFrozenRows() throws Exception {

		try (Connection connection = duckdb()) {

			Map<String, List<Map<String, Object>>> germany = answers(canvas(true), "Germany", connection);
			assertEquals(859422.88, money(germany, "number_netsales_net", "NetSales"), 0.01,
					"Germany's net sales");
			assertEquals(3508.0, money(germany, "number_units_units", "Units"), 0.5, "Germany's units");
			assertEquals(Map.of("Web", 295.0, "Mobile App", 164.0, "Marketplace", 94.0, "Phone", 43.0),
					breakdown(germany, "chart_channel_channel", "Channel", "Orders"),
					"Germany's orders, by channel");
			// Story 23's eight Germany rows, the same eight the Revenue Mix hint answers.
			Map<String, Double> categories = breakdown(germany, "tabulator_net-category",
					"Category", "NetSales");
			assertEquals(8, categories.size(), categories.toString());
			assertEquals(261897.29, categories.get("Displays"), 0.005);
			assertEquals(204407.62, categories.get("Video"), 0.005);
			assertEquals(12210.33, categories.get("Cables & Power"), 0.005);
			assertEquals(859422.88, categories.values().stream().mapToDouble(Double::doubleValue).sum(),
					0.05, "the categories add up to the KPI beside them");

			Map<String, List<Map<String, Object>>> all = answers(canvas(true), ALL, connection);
			assertEquals(3571889.64, money(all, "number_netsales_net", "NetSales"), 0.01,
					"the whole shop's net sales");
			assertEquals(14438.0, money(all, "number_units_units", "Units"), 0.5, "the whole shop's units");
			assertEquals(Map.of("Web", 1141.0, "Mobile App", 683.0, "Marketplace", 390.0, "Phone", 182.0),
					breakdown(all, "chart_channel_channel", "Channel", "Orders"),
					"every order, by channel");

			// The question every real dashboard gets asked: All is more than the countries add up
			// to, because the guest orders have no customer and so belong to no country.
			Map<String, List<Map<String, Object>>> guestless = answers(canvas(true), "Germany", connection);
			assertTrue(money(all, "number_netsales_net", "NetSales")
					> money(guestless, "number_netsales_net", "NetSales"),
					"All holds what no country does");
		}
	}

	@Test
	@DisplayName("A tile that is not bound stays on the whole shop, whatever the viewer picks")
	void theNegativeHalfIsATileWithoutTheBinding() throws Exception {

		try (Connection connection = duckdb()) {

			// The same canvas with the binding dropped - what the dashboard was before this TODO.
			Map<String, List<Map<String, Object>>> germany = answers(canvas(false), "Germany", connection);
			assertEquals(3571889.64, money(germany, "number_netsales_net", "NetSales"), 0.01,
					"Germany is picked and the unbound KPI still answers the whole shop");
			assertEquals(14438.0, money(germany, "number_units_units", "Units"), 0.5,
					"and so does the unbound Units KPI");

			// Which is the check going red: the story's own number is not what it answers.
			assertTrue(Math.abs(money(germany, "number_netsales_net", "NetSales") - 859422.88) > 1.0,
					"an unbound tile cannot pass the Germany check");
		}
	}

	@Test
	@DisplayName("The shipped chart plots a column its own SQL returns, and says so in its title")
	void aChartWithNoDatasetPlotsNothing() throws Exception {

		Map<String, List<Map<String, Object>>> reported;
		try (Connection connection = duckdb()) {
			reported = answers(canvas(true), ALL, connection);
		}

		// The positive half: the file the sample ships, parsed by the chart DSL the runtime parses it
		// with, plots a column the widget's SQL really returned - so there is something to draw.
		assertChartsPlotColumnsTheirSqlReturns(shipped(REPORT_ID + "-chart-config.groovy"), reported);

		// And the reader is told what they are looking at, where Chart.js looks for it.
		ChartOptions chart = ChartOptionsParser
				.parseGroovyChartDslCode(shipped(REPORT_ID + "-chart-config.groovy"))
				.getNamedOptions().get("chart_channel_channel");
		assertEquals("Orders by Channel", titleOf(chart), String.valueOf(chart.getOptions()));

		// The negative half, and the defect the owner met: `title`, `xField` and `yFields` are not
		// chart DSL keywords, so they fall into the options map where Chart.js ignores them and the
		// chart is built with no dataset at all - four channel names on an empty 0-1 axis. This is
		// the assertion that would have caught it.
		String asItWasShipped = "chart('chart_channel_channel') {\n"
				+ "  type 'bar'\n"
				+ "  title 'Orders by Channel'\n"
				+ "  xField 'Channel'\n"
				+ "  yFields 'Orders'\n"
				+ "}\n";
		AssertionError red = assertThrows(AssertionError.class,
				() -> assertChartsPlotColumnsTheirSqlReturns(asItWasShipped, reported));
		assertTrue(red.getMessage().contains("nothing is plotted"), red.getMessage());
	}

	/**
	 * Every chart a dashboard ships plots at least one column the widget's own SQL returned, and
	 * labels the bars by one too.
	 *
	 * <p>This is the check the sample's equality assertion cannot make: that one compares the
	 * shipped file with the generator's output, so a chart configured with keys the DSL does not
	 * know is compared with itself and stays green while the reader sees an empty axis.
	 */
	private static void assertChartsPlotColumnsTheirSqlReturns(String chartConfigGroovy,
			Map<String, List<Map<String, Object>>> reported) throws Exception {

		Map<String, ChartOptions> charts = ChartOptionsParser
				.parseGroovyChartDslCode(chartConfigGroovy).getNamedOptions();
		assertFalse(charts.isEmpty(), "the chart config declares no chart at all");

		for (Map.Entry<String, ChartOptions> entry : charts.entrySet()) {
			String componentId = entry.getKey();
			ChartOptions chart = entry.getValue();

			List<Map<String, Object>> rows = reported.get(componentId);
			if (rows == null || rows.isEmpty())
				throw new AssertionError(componentId + " was asked and answered nothing: "
						+ reported.keySet());
			Set<String> columns = rows.get(0).keySet();

			if (chart.getDatasets().isEmpty())
				throw new AssertionError(componentId + " has no dataset, so nothing is plotted;"
						+ " its SQL returns " + columns);
			for (Map<String, Object> dataset : chart.getDatasets())
				assertTrue(columns.contains(String.valueOf(dataset.get("field"))),
						componentId + " plots '" + dataset.get("field")
								+ "', which its SQL does not return: " + columns);
			assertTrue(columns.contains(String.valueOf(chart.getLabelField())),
					componentId + " labels its bars by '" + chart.getLabelField()
							+ "', which its SQL does not return: " + columns);
		}
	}

	/** A chart's title, where Chart.js keeps it: {@code options.plugins.title.text}. */
	@SuppressWarnings("unchecked")
	private static String titleOf(ChartOptions chart) {
		Object plugins = chart.getOptions().get("plugins");
		if (!(plugins instanceof Map<?, ?> pluginsMap)) return "";
		Object title = ((Map<String, Object>) pluginsMap).get("title");
		if (!(title instanceof Map<?, ?> titleMap)) return "";
		return String.valueOf(((Map<String, Object>) titleMap).get("text"));
	}

	// ── The two paths ────────────────────────────────────────────────────────────

	/** What the published dashboard answers for this canvas and this picked country. */
	private static Map<String, List<Map<String, Object>>> answers(List<Map<String, Object>> widgets,
			String country, Connection connection) throws Exception {

		String script = ScriptAssembler.assemble(widgets, parameters()).text();

		Binding binding = new Binding();
		Map<String, List<Map<String, Object>>> reported = new LinkedHashMap<>();
		Map<String, Object> values = new LinkedHashMap<>();
		values.put("country", country);
		binding.setVariable("reported", reported);
		binding.setVariable("userVarsIn", values);
		binding.setVariable("connectionIn", notClosing(connection));
		GroovyShell shell = new GroovyShell(binding);
		binding.setVariable("ctx", shell.evaluate("""
				def dbSql = new groovy.sql.Sql(connectionIn)
				def vars = new Expando()
				vars.get = { k -> null }
				vars.getUserVariables = { t -> userVarsIn }
				def ctx = new Expando(dbSql: dbSql, variables: vars, token: '')
				ctx.reportData = { id, rows -> reported[id] = rows }
				ctx
				"""));
		shell.evaluate(script);
		return reported;
	}

	/** The one number a KPI tile reported. */
	private static double money(Map<String, List<Map<String, Object>>> reported, String componentId,
			String column) {
		List<Map<String, Object>> rows = reported.get(componentId);
		if (rows == null || rows.isEmpty())
			throw new IllegalStateException(componentId + " reported nothing: " + reported.keySet());
		return ((Number) rows.get(0).get(column)).doubleValue();
	}

	/** A breakdown tile's rows, as the pairs a reader of the dashboard sees. */
	private static Map<String, Double> breakdown(Map<String, List<Map<String, Object>>> reported,
			String componentId, String keyColumn, String valueColumn) {
		List<Map<String, Object>> rows = reported.get(componentId);
		if (rows == null || rows.isEmpty())
			throw new IllegalStateException(componentId + " reported nothing: " + reported.keySet());
		Map<String, Double> out = new LinkedHashMap<>();
		for (Map<String, Object> row : rows)
			out.put(String.valueOf(row.get(keyColumn)), ((Number) row.get(valueColumn)).doubleValue());
		return out;
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────

	/** The SQL the canvas freezes: what {@code POST /api/cubes/{id}/generate-sql} answers. */
	private static String frozenSql(Map<String, Object> selection) throws Exception {
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(Path.of(SHOP)));
		CubeQuery query = CubeSqlGenerator.buildQuery(cube, selection, "duckdb");
		return query.toInlineSql("duckdb");
	}

	/** One of the sample's shipped files. */
	private static String shipped(String name) throws Exception {
		Path path = Paths.get(SAMPLE_DIR, name);
		if (!Files.exists(path))
			throw new IllegalStateException("The sample is missing a file: " + path.toAbsolutePath());
		return Files.readString(path);
	}

	/** A throwaway DuckDB carrying the frozen {@code cube_demo} rows. */
	private Connection duckdb() throws Exception {
		return DriverManager.getConnection("jdbc:duckdb:"
				+ NorthwindFixture.writableCopy(tempDir.resolve("northwind.duckdb")).toAbsolutePath());
	}

	/** The one connection of the throwaway database, handed over so a handle cannot close it. */
	private static Connection notClosing(Connection connection) {
		return (Connection) java.lang.reflect.Proxy.newProxyInstance(
				CubeCountrySalesDashboardTest.class.getClassLoader(), new Class<?>[] { Connection.class },
				(proxy, method, arguments) -> {
					if ("close".equals(method.getName())) return null;
					try {
						return method.invoke(connection, arguments);
					} catch (java.lang.reflect.InvocationTargetException wrapped) {
						throw wrapped.getCause();
					}
				});
	}
}

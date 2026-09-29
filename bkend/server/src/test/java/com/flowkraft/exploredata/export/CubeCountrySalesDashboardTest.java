package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.cubes.CubeQuery;
import com.flowkraft.cubes.CubeSqlGenerator;
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

	/** The four tiles of the story: the two KPIs, the channels and the categories. */
	private static List<Map<String, Object>> canvas(boolean bound) throws Exception {
		return List.of(
				widget("w-kpi-net", "number", selection(List.of(), List.of("NetSales"), bound),
						ordered("numberField", "NetSales", "numberLabel", "Net Sales",
								"numberFormat", "currency"),
						0, 0, 3, 2),
				widget("w-kpi-units", "number", selection(List.of(), List.of("Units"), bound),
						ordered("numberField", "Units", "numberLabel", "Units", "numberFormat", "number"),
						3, 0, 3, 2),
				widget("w-orders-channel", "chart",
						selection(List.of("Channel"), List.of("Orders"), bound),
						ordered("chartTitle", "Orders by Channel", "xFields", List.of("Channel"),
								"yFields", List.of("Orders"),
								"dslConfig", ordered("type", "bar", "title", "Orders by Channel",
										"xField", "Channel", "yFields", List.of("Orders"))),
						0, 2, 6, 4),
				widget("w-net-category", "tabulator",
						selection(List.of("Category"), List.of("NetSales"), bound),
						ordered("dslConfig", ordered("layout", "fitColumns", "autoColumns", true)),
						6, 2, 6, 4));
	}

	/**
	 * The dashboard as it ships: the four frozen tiles, and the Shop cube itself beside them
	 * (R8, TODO 21a).
	 *
	 * The country manager gets both kinds at once - numbers they read, and a cube they tick their
	 * own breakdowns in - and the one `country` at the top drives them the same way. The frozen
	 * tiles carry `${country}` in their SQL; the live one carries the binding in its entry, and
	 * the server applies it to every question the viewer asks.
	 */
	private static List<Map<String, Object>> shippedCanvas(boolean bound) throws Exception {
		List<Map<String, Object>> widgets = new ArrayList<>(canvas(bound));
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
				ordered("dslConfig", ordered("layout", "fitColumns", "autoColumns", true)),
				0, 6, 12, 6);
		@SuppressWarnings("unchecked")
		Map<String, Object> dataSource = (Map<String, Object>) widget.get("dataSource");
		@SuppressWarnings("unchecked")
		Map<String, Object> visualQuery = (Map<String, Object>) dataSource.get("visualQuery");
		visualQuery.put("showInDashboard", true);
		// A live cube publishes no SQL: the dashboard carries the cube, not an answer to it.
		dataSource.put("generatedSql", "");
		return widget;
	}

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

		// Both modes on one dashboard: four tiles carry frozen SQL, and the fifth is the cube.
		assertEquals(shipped(REPORT_ID + "-cube-widgets.json"), files.cubeWidgetsJson());
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

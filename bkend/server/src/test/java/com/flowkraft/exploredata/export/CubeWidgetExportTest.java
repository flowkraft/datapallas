package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.cubes.CubeQuery;
import com.flowkraft.cubes.CubeSqlGenerator;
import com.flowkraft.cubes.CubeWidgets;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;

/**
 * How a cube widget is published — the two modes of the design, side by side on one canvas.
 *
 * <p><b>Show In Dashboard unchecked</b> is the mode that has always existed: the selection is
 * turned into SQL on the canvas and the dashboard carries that frozen SQL. Nothing about it
 * changes, which is half of what is asserted here, and the SQL it freezes now says everything the
 * author picked — the segments and the filters included.
 *
 * <p><b>Show In Dashboard checked</b> publishes the cube itself: no SQL anywhere in the dashboard,
 * an {@code <rb-cube-renderer>} in the markup and an entry in {@code {reportId}-cube-widgets.json}
 * saying which cube, on which connection, opened with which selection. That file is read back here
 * with {@link CubeWidgets} — the runtime's own reader — because a file only the writer understands
 * is not a published dashboard.
 *
 * <p>The cube is the shipped Northwind Sales sample, so the SQL asserted on is SQL a real cube
 * generates. Nothing here runs a query.
 */
class CubeWidgetExportTest {

	private static final String SAMPLE_DSL =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes/northwind/"
					+ "northwind-sales-cube-config.groovy";

	private static final String CONNECTION = "rbt-sample-northwind-sqlite-4f2";
	private static final String REPORT_ID = "sales-board";

	private static final ObjectMapper JSON = new ObjectMapper();

	@TempDir
	Path dir;

	private String portableDirBefore;

	/**
	 * What the author picked in the field tree: a country, the money, orders that shipped, and only
	 * Germany. The segment and the filter are the point — they are what a frozen SQL used to be
	 * missing, and what a shown cube opens its chips with.
	 */
	private static Map<String, Object> selection() {
		Map<String, Object> selection = new LinkedHashMap<>();
		selection.put("dimensions", List.of("ShipCountry"));
		selection.put("measures", List.of("Revenue"));
		selection.put("segments", List.of("shipped"));
		selection.put("filters", List.of(Map.of("member", "ShipCountry", "operator", "in",
				"values", List.of("Germany"))));
		selection.put("granularities", Map.of());
		selection.put("order", List.of());
		selection.put("limit", 500);
		return selection;
	}

	@BeforeEach
	void aPortableDirOfItsOwn() {
		portableDirBefore = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", dir.toString());
	}

	@AfterEach
	void andBackAsItWas() {
		if (portableDirBefore == null)
			System.clearProperty("PORTABLE_EXECUTABLE_DIR");
		else
			System.setProperty("PORTABLE_EXECUTABLE_DIR", portableDirBefore);
	}

	// ── Mode 2: the cube itself ───────────────────────────────────────────────

	@Test
	@DisplayName("Show In Dashboard: the widget is published as the cube, and nothing of it reaches the data script")
	void aShownCubeIsPublishedAsTheCubeItself() throws Exception {

		String frozenSql = frozenSql(selection());
		Map<String, Object> shown = cubeWidget("w-live", "chart", true, frozenSql);

		String script = ScriptAssembler.assemble(List.of(shown), List.of()).text();
		DashboardFileGenerator.GeneratedFiles files = DashboardFileGenerator.generate(
				List.of(shown), List.of(), REPORT_ID, "http://localhost:9090/api", CONNECTION);

		// The negative half: the frozen SQL is gone from the dashboard entirely. A viewer's question
		// is answered live, so a script block for this widget would be a second, stale answer.
		assertFalse(script.contains("Revenue"), "No SQL of the shown cube belongs in the script: " + script);
		assertFalse(script.contains("Widget: "), "A shown cube gets no widget block at all: " + script);
		assertFalse(files.templateHtml().contains("<rb-chart"),
				"A shown cube is the cube, not the chart its widget type names: " + files.templateHtml());

		// The positive half: the markup and the file that unlocks it, and they name the same widget.
		Map<String, Map<String, Object>> declared = JSON.readValue(files.cubeWidgetsJson(),
				new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {
				});
		assertEquals(1, declared.size(), files.cubeWidgetsJson());
		String componentId = declared.keySet().iterator().next();
		assertTrue(files.templateHtml().contains("<rb-cube-renderer report-id=\"" + REPORT_ID
				+ "\" api-base-url=\"http://localhost:9090/api\" component-id=\"" + componentId + "\">"),
				files.templateHtml());

		// And the runtime's own reader understands it: the cube, the connection, the selection the
		// dashboard opens with and how its result is drawn.
		Files.createDirectories(dir.resolve("config/reports/" + REPORT_ID));
		Files.writeString(dir.resolve("config/reports/" + REPORT_ID + "/" + REPORT_ID + CubeWidgets.SUFFIX),
				files.cubeWidgetsJson());

		CubeWidgets.Widget widget = CubeWidgets.of(REPORT_ID, componentId);
		assertEquals("northwind-sales", widget.cubeId());
		assertNull(widget.cubeName(), "The file's own cube");
		assertEquals(CONNECTION, widget.connectionId());
		// display is always the list of shapes offered, whether the file wrote one name or several
		// (design part 8: the Table | Chart switch).
		assertEquals(List.of("chart"), widget.display());
		assertEquals(List.of("ShipCountry"), widget.initial().get("dimensions"));
		assertEquals(List.of("Revenue"), widget.initial().get("measures"));
		assertEquals(List.of("shipped"), widget.initial().get("segments"));
		assertEquals(List.of(Map.of("member", "ShipCountry", "operator", "in", "values", List.of("Germany"))),
				widget.initial().get("filters"));
		assertEquals(500, widget.initial().get("limit"));
	}

	@Test
	@DisplayName("The widget type decides how the result under the field tree is drawn, not what is published")
	void theWidgetTypeBecomesTheDisplay() throws Exception {
		assertEquals("value", displayOfShown("number"));
		assertEquals("chart", displayOfShown("chart"));
		assertEquals("table", displayOfShown("tabulator"));
		assertEquals("table", displayOfShown("pivot"));
	}

	// ── Mode 1: the frozen SQL, exactly as before ─────────────────────────────

	@Test
	@DisplayName("Show In Dashboard unchecked: the widget exports its frozen SQL and its own element, and declares no live cube")
	void anUncheckedCubeWidgetExportsExactlyAsBefore() throws Exception {

		String frozenSql = frozenSql(selection());
		Map<String, Object> frozen = cubeWidget("w-frozen", "tabulator", false, frozenSql);

		String script = ScriptAssembler.assemble(List.of(frozen), List.of()).text();
		DashboardFileGenerator.GeneratedFiles files = DashboardFileGenerator.generate(
				List.of(frozen), List.of(), REPORT_ID, "http://localhost:9090/api", CONNECTION);

		assertTrue(script.contains("Widget: "), script);
		assertTrue(script.contains("dataSource=visual"), script);
		// The frozen SQL is published line by line, as it always was.
		for (String line : frozenSql.split("\n")) {
			if (line.isBlank() || line.contains("'")) continue;
			assertTrue(script.contains("sql << '" + line + "\\n'"),
					"Missing line of the frozen SQL: " + line + "\n" + script);
		}
		assertTrue(files.templateHtml().contains("<rb-tabulator"), files.templateHtml());
		assertFalse(files.templateHtml().contains("rb-cube-renderer"), files.templateHtml());
		// The negative half of the file: a dashboard that shows no cube declares none, so nothing is
		// written and the runtime answers 404 for it rather than something half-locked.
		assertEquals("", files.cubeWidgetsJson());
	}

	@Test
	@DisplayName("The frozen SQL carries the segments and the filters the author picked")
	void theFrozenSqlCarriesSegmentsAndFilters() throws Exception {

		String withEverything = frozenSql(selection());

		// The positive half: both conditions are in the SQL the canvas freezes, and that SQL is what
		// the published dashboard runs.
		assertTrue(withEverything.contains("\"Orders\".\"ShippedDate\" IS NOT NULL"),
				"The 'shipped' segment's condition: " + withEverything);
		assertTrue(withEverything.contains("'Germany'"), "The ShipCountry filter's value: " + withEverything);

		Map<String, Object> frozen = cubeWidget("w-frozen", "tabulator", false, withEverything);
		String script = ScriptAssembler.assemble(List.of(frozen), List.of()).text();
		assertTrue(script.contains("IS NOT NULL"), script);
		assertTrue(script.contains("Germany"), script);

		// The negative half: they are in the SQL because the selection said so. Ask the same cube for
		// the same dimension and measure with the segments and the filters dropped - which is what a
		// canvas that forgot to send them did - and neither condition is there.
		Map<String, Object> dropped = selection();
		dropped.put("segments", List.of());
		dropped.put("filters", List.of());
		String withoutEither = frozenSql(dropped);
		assertFalse(withoutEither.contains("IS NOT NULL"), withoutEither);
		assertFalse(withoutEither.contains("Germany"), withoutEither);
	}

	// ── The canvas, as it is handed to the exporter ───────────────────────────

	private static String displayOfShown(String widgetType) throws Exception {
		Map<String, Object> shown = cubeWidget("w-live", widgetType, true, "");
		DashboardFileGenerator.GeneratedFiles files = DashboardFileGenerator.generate(
				List.of(shown), List.of(), REPORT_ID, "http://localhost:9090/api", CONNECTION);
		Map<String, Map<String, Object>> declared = JSON.readValue(files.cubeWidgetsJson(),
				new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {
				});
		return String.valueOf(declared.values().iterator().next().get("display"));
	}

	/** One cube widget of a canvas, in the shape the AI Hub sends it in. */
	private static Map<String, Object> cubeWidget(String id, String type, boolean showInDashboard,
			String generatedSql) {

		Map<String, Object> visualQuery = new LinkedHashMap<>();
		visualQuery.put("kind", "cube");
		visualQuery.put("cubeId", "northwind-sales");
		visualQuery.put("table", "");
		visualQuery.put("filters", List.of());
		visualQuery.put("summarize", List.of());
		visualQuery.put("groupBy", List.of());
		visualQuery.put("sort", List.of());
		visualQuery.put("limit", 500);
		visualQuery.put("cubeSelection", selection());
		if (showInDashboard)
			visualQuery.put("showInDashboard", true);

		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "visual");
		dataSource.put("visualQuery", visualQuery);
		dataSource.put("generatedSql", generatedSql);

		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", id);
		widget.put("type", type);
		widget.put("dataSource", dataSource);
		widget.put("gridPosition", Map.of("x", 0, "y", 0, "w", 6, "h", 4));
		widget.put("displayConfig", Map.of());
		return widget;
	}

	/**
	 * The SQL the canvas freezes: exactly what {@code POST /api/cubes/{id}/generate-sql} answers for
	 * this selection, values written in, because that is what the canvas stores on the widget.
	 */
	private static String frozenSql(Map<String, Object> selection) throws Exception {
		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(Path.of(SAMPLE_DSL)));
		CubeQuery query = CubeSqlGenerator.buildQuery(cube, selection, "sqlite");
		return query.toInlineSql("sqlite");
	}
}

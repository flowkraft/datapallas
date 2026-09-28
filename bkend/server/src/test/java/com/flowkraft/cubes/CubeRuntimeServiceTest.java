package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;

/**
 * The live cube of a published dashboard: what a viewer sees of it, what they may ask of it, and
 * where the answer is read from.
 *
 * <p>The cube is the shipped Northwind Sales sample, read from its own file rather than pasted here,
 * so these are the questions a real cube answers. The database is a stub, because the point of every
 * test below is which connection was asked, what statement was sent and which values were bound —
 * three things a real query hides. A second, small cube carries the members an author hid with
 * {@code public false}, which the samples happen not to use.
 */
class CubeRuntimeServiceTest {

	private static final String SAMPLE_DSL =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes/northwind/"
					+ "northwind-sales-cube-config.groovy";

	/** The connection the dashboard declares. Every answer must be read on this one. */
	private static final String THE_FILES_CONNECTION = "rbt-sample-northwind-sqlite-4f2";

	@TempDir
	Path dir;

	private String portableDirBefore;
	private CubeRuntimeService runtime;
	private StubDatabase database;

	@BeforeEach
	void aDashboardWithTwoLiveCubes() throws Exception {

		portableDirBefore = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", dir.toString());

		cube("northwind-sales", "Northwind Sales Analysis", Files.readString(Path.of(SAMPLE_DSL)));
		cube("parts-with-hidden-members", "Parts", """
				cube {
				  sql_table '"Parts"'
				  title 'Parts'
				  dimension {
				    name 'PartName'
				    title 'Part'
				    sql '"PartName"'
				    type 'string'
				  }
				  // A hidden member is written in the map form: 'public' is a Groovy keyword, so the
				  // closure form cannot say it.
				  dimension name: 'CostPrice', title: 'Cost Price', sql: '"CostPrice"', type: 'number',
				      public: false
				  measure {
				    name 'PartCount'
				    title 'Parts'
				    sql '${CUBE}."PartID"'
				    type 'count'
				  }
				  measure name: 'Margin', title: 'Margin', sql: '${CUBE}."Margin"', type: 'sum',
				      public: false
				  segment {
				    name 'in_stock'
				    title 'In stock'
				    sql '${CUBE}."OnHand" > 0'
				  }
				  segment name: 'discontinued_internal', title: 'Discontinued',
				      sql: '${CUBE}."Discontinued" = 1', public: false
				}
				""");

		write("config/reports/sales-board/sales-board-cube-widgets.json", """
				{
				  "cube1": {
				    "cubeId": "northwind-sales",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["Revenue"] },
				    "display": "chart"
				  },
				  "cube2": {
				    "cubeId": "parts-with-hidden-members",
				    "connectionId": "the-other-connection",
				    "initial": { "measures": ["PartCount"] },
				    "display": "value"
				  }
				}
				""");

		CubesService cubesService = new CubesService();
		LimitsSandbox sandbox = new LimitsSandbox(new LimitsService(null, null));
		ReflectionTestUtils.setField(cubesService, "limitsSandbox", sandbox);

		runtime = new CubeRuntimeService();
		ReflectionTestUtils.setField(runtime, "cubesService", cubesService);
		ReflectionTestUtils.setField(runtime, "cubeFilterOptions", new CubeFilterOptions());
		ReflectionTestUtils.setField(runtime, "limitsSandbox", sandbox);

		database = new StubDatabase();
		runtime.useDatabase(database);
	}

	@AfterEach
	void putThePortableDirBack() {
		if (portableDirBefore == null)
			System.clearProperty("PORTABLE_EXECUTABLE_DIR");
		else
			System.setProperty("PORTABLE_EXECUTABLE_DIR", portableDirBefore);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /meta — the field tree, and nothing underneath it
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * A viewer of a dashboard is not its author: they get the words a field tree is drawn from, and
	 * not one line of the SQL the author wrote. The keys are pinned exactly, in both directions, so
	 * that adding {@code sql} to a member — or dropping {@code format}, which the result area needs —
	 * fails here rather than in somebody's browser.
	 */
	@Test
	void metaIsTheFieldTreeAndNeverTheSqlUnderneathIt() throws Exception {

		Map<String, Object> meta = runtime.meta("sales-board", "cube1");

		assertEquals(List.of("componentId", "cubeId", "title", "description", "dimensions", "measures",
				"segments", "hierarchies", "initial", "display"), new ArrayList<>(meta.keySet()));
		assertEquals("Northwind Sales Analysis", meta.get("title"));

		for (Map<String, Object> dimension : members(meta, "dimensions")) {
			assertEquals(List.of("name", "title", "description", "type", "format", "hasFilterOptions"),
					new ArrayList<>(dimension.keySet()), "A dimension as a viewer sees it");
		}
		for (Map<String, Object> measure : members(meta, "measures")) {
			assertEquals(List.of("name", "title", "description", "type", "format"),
					new ArrayList<>(measure.keySet()), "A measure as a viewer sees it");
		}
		for (Map<String, Object> segment : members(meta, "segments")) {
			assertEquals(List.of("name", "title", "description"), new ArrayList<>(segment.keySet()),
					"A segment as a viewer sees it");
		}

		assertEquals("Ship Country", titleOf(meta, "dimensions", "ShipCountry"));
		assertEquals("Revenue", titleOf(meta, "measures", "Revenue"));
		assertTrue(names(meta, "segments").contains("shipped"), "The author's segments are offered");
		assertFalse(names(meta, "hierarchies").isEmpty(), "The author's hierarchies are offered");
	}

	/** The one thing a viewer does need to know about a dimension's filter_options: that it has one. */
	@Test
	void metaSaysWhichDimensionsHaveAListOfTheirOwnWithoutSayingWhatItReads() throws Exception {

		Map<String, Object> meta = runtime.meta("sales-board", "cube1");

		assertEquals(Boolean.TRUE, memberOf(meta, "dimensions", "CustomerCompanyName").get("hasFilterOptions"));
		assertEquals(Boolean.FALSE, memberOf(meta, "dimensions", "ShipCountry").get("hasFilterOptions"));
		assertFalse(meta.toString().contains("SELECT CompanyName"),
				"The statement behind the list is the author's, not the viewer's");
	}

	/** The dashboard opens where its author left it, and the file is where that is written down. */
	@Test
	void metaCarriesTheDashboardsOwnOpeningSelection() throws Exception {

		Map<String, Object> meta = runtime.meta("sales-board", "cube1");

		assertEquals(Map.of("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue")),
				meta.get("initial"));
		assertEquals("chart", meta.get("display"));
		assertEquals("cube1", meta.get("componentId"));
		assertEquals("northwind-sales", meta.get("cubeId"));
	}

	/** A member the author hid is not in the tree at all: {@code public false} is what the key is for. */
	@Test
	void aMemberTheAuthorHidIsNotInTheTree() throws Exception {

		Map<String, Object> meta = runtime.meta("sales-board", "cube2");

		assertEquals(List.of("PartName"), names(meta, "dimensions"));
		assertEquals(List.of("PartCount"), names(meta, "measures"));
		assertEquals(List.of("in_stock"), names(meta, "segments"));
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The lock: a request names a report and a component, and nothing else
	// ═══════════════════════════════════════════════════════════════════════════

	/** A component the dashboard does not declare does not exist, and the answer says what does. */
	@Test
	void aComponentTheDashboardDoesNotDeclareDoesNotExist() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.meta("sales-board", "cube9"));

		assertEquals(404, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("cube1, cube2"), refused.getReason());
	}

	@Test
	void aReportWithNoLiveCubeInItHasNoneToAnswerAbout() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.meta("payslips", "cube1"));

		assertEquals(404, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("payslips"), refused.getReason());
	}

	/** A report id is turned into a path exactly once, and only inside its own folder. */
	@Test
	void aReportIdThatTriesToLeaveItsFolderIsRefused() {

		for (String id : List.of("../../etc", "sales-board/../payslips", "a\\b")) {
			ResponseStatusException refused = assertThrows(ResponseStatusException.class,
					() -> runtime.meta(id, "cube1"), id);
			assertEquals(404, refused.getStatusCode().value(), id);
		}
	}

	/**
	 * The connection is the dashboard's, and a request that names another one is refused rather than
	 * quietly ignored: a caller who asked for a different database should hear that they cannot have
	 * it, not receive the first database's rows as though they had.
	 */
	@Test
	void theConnectionComesFromTheFileAndNeverFromTheRequest() throws Exception {

		runtime.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipCountry")));
		assertEquals(THE_FILES_CONNECTION, database.readOn, "The rows are read on the file's connection");
		assertEquals(THE_FILES_CONNECTION, database.vendorAskedOf, "And the vendor is that connection's");

		runtime.query("sales-board", "cube2", Map.of("measures", List.of("PartCount")));
		assertEquals("the-other-connection", database.readOn, "Each widget its own connection");
	}

	@Test
	void aRequestMayNotCarryACubeAConnectionAVendorOrAnySql() {

		for (String refusedKey : List.of("cubeId", "cubeName", "connectionId", "dbVendor", "dialect", "sql",
				"dsl", "dslCode", "reportId")) {

			ResponseStatusException refused = assertThrows(ResponseStatusException.class,
					() -> runtime.query("sales-board", "cube1",
							Map.of("measures", List.of("Revenue"), refusedKey, "anything")),
					refusedKey);

			assertEquals(400, refused.getStatusCode().value(), refusedKey);
			assertTrue(refused.getReason().contains("'" + refusedKey + "'"), refused.getReason());
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /query — how much, bound how, and whether it was all of it
	// ═══════════════════════════════════════════════════════════════════════════

	/** One row more than the answer may carry is read, which is how a cut answer is told from a whole one. */
	@Test
	void aQueryReadsOneRowMoreThanItAnswersWith() throws Exception {

		runtime.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipCountry")));
		assertEquals(CubeRuntimeService.DEFAULT_LIMIT + 1, database.readAtMost, "The default, plus the probe");

		runtime.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipCountry"), "limit", 10));
		assertEquals(11, database.readAtMost);

		runtime.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipCountry"), "limit", 99999));
		assertEquals(CubeRuntimeService.MAX_LIMIT + 1, database.readAtMost, "However many were asked for");

		runtime.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipCountry"), "limit", 0));
		assertEquals(CubeRuntimeService.DEFAULT_LIMIT + 1, database.readAtMost, "Nothing sensible asked for");
	}

	@Test
	void anAnswerThatWasCutSaysSoAndOneThatWasNotDoesNot() throws Exception {

		database.rows = rows(11);
		Map<String, Object> cut = runtime.query("sales-board", "cube1",
				Map.of("dimensions", List.of("ShipCountry"), "limit", 10));
		assertEquals(10, ((List<?>) cut.get("rows")).size(), "The answer carries the limit, not the probe");
		assertEquals(Boolean.TRUE, cut.get("truncated"));

		database.rows = rows(10);
		Map<String, Object> whole = runtime.query("sales-board", "cube1",
				Map.of("dimensions", List.of("ShipCountry"), "limit", 10));
		assertEquals(10, ((List<?>) whole.get("rows")).size());
		assertEquals(Boolean.FALSE, whole.get("truncated"));
	}

	/**
	 * A filter value comes from whoever is looking at the dashboard, so it goes to the driver as a
	 * parameter. The statement carries a placeholder and the value is nowhere in it.
	 */
	@Test
	void everyValueAViewerFiltersByIsBoundAndNotWrittenIntoTheStatement() throws Exception {

		runtime.query("sales-board", "cube1", Map.of(
				"dimensions", List.of("ShipCountry"),
				"measures", List.of("Revenue"),
				"filters", List.of(Map.of("member", "ShipCity", "operator", "in",
						"values", List.of("O'Brien Street")))));

		assertTrue(database.sql.contains(":cf"), database.sql);
		assertFalse(database.sql.contains("O'Brien"), "The value is not in the SQL: " + database.sql);
		assertTrue(database.params.values().toString().contains("O'Brien Street"), "It is bound instead");
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// A viewer may ask only what the cube offers
	// ═══════════════════════════════════════════════════════════════════════════

	/** The refusal names what the cube does have, because the renderer shows that sentence. */
	@Test
	void aMemberTheCubeDoesNotHaveIsRefusedAndTheAnswerSaysWhatItDoesHave() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class, () -> runtime
				.query("sales-board", "cube1", Map.of("dimensions", List.of("ShipContinent"))));

		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("ShipContinent"), refused.getReason());
		assertTrue(refused.getReason().contains("ShipCountry"), refused.getReason());
	}

	/** Hidden is hidden from the question too, not only from the tree. */
	@Test
	void aMemberTheAuthorHidCannotBeAskedForEither() {

		assertEquals(400, refusedBy(Map.of("dimensions", List.of("CostPrice"))), "A hidden dimension");
		assertEquals(400, refusedBy(Map.of("measures", List.of("Margin"))), "A hidden measure");
		assertEquals(400, refusedBy(Map.of("segments", List.of("discontinued_internal"))), "A hidden segment");
		assertEquals(400, refusedBy(Map.of("measures", List.of("PartCount"),
				"filters", List.of(Map.of("member", "CostPrice", "operator", "set")))),
				"A filter on a hidden dimension");
		assertEquals(400, refusedBy(Map.of("dimensions", List.of("PartName"),
				"order", List.of(Map.of("member", "Margin", "dir", "desc")))), "An order by a hidden measure");
	}

	@Test
	void aGranularityASegmentAndAnOrderAreCheckedByNameToo() {

		Map<String, Object> badGranularity = new LinkedHashMap<>();
		badGranularity.put("granularities", Map.of("NoSuchDate", "month"));
		assertEquals(400, refusedBy("cube1", badGranularity));

		assertEquals(400, refusedBy("cube1", Map.of("segments", List.of("no_such_segment"))));
		assertEquals(400, refusedBy("cube1", Map.of("order", List.of(Map.of("member", "Nope", "dir", "asc")))));
	}

	/** And the whole of a real question goes through, granularity, segment, order and all. */
	@Test
	void aWholeQuestionTheCubeDoesOfferIsAnswered() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("OrderDate", "ShipCountry"));
		request.put("measures", List.of("Revenue", "OrderCount"));
		request.put("granularities", Map.of("OrderDate", "month"));
		request.put("segments", List.of("shipped"));
		request.put("order", List.of(Map.of("member", "Revenue", "dir", "desc")));
		request.put("limit", 25);

		database.rows = rows(3);
		Map<String, Object> answer = runtime.query("sales-board", "cube1", request);

		assertEquals(3, ((List<?>) answer.get("rows")).size());
		assertEquals(Boolean.FALSE, answer.get("truncated"));
		assertEquals(26, database.readAtMost);
		assertTrue(database.sql.toUpperCase().startsWith("SELECT"), database.sql);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The runtime filter-options
	// ═══════════════════════════════════════════════════════════════════════════

	/** The same helper the cube editor asks, so the two lists can never differ. */
	@Test
	void aDateNeedsNoListOfValuesAndNoDatabaseIsTouchedForOne() throws Exception {

		Map<String, Object> answer = runtime.filterOptions("sales-board", "cube1", "OrderDate", null);

		assertEquals(List.of(), answer.get("values"), "A range, from the type alone");
		assertEquals(Boolean.FALSE, answer.get("truncated"));
	}

	@Test
	void filterOptionsAreOfferedOnlyForADimensionTheCubeOffers() {

		ResponseStatusException unknown = assertThrows(ResponseStatusException.class,
				() -> runtime.filterOptions("sales-board", "cube1", "ShipContinent", null));
		assertEquals(400, unknown.getStatusCode().value());
		assertTrue(unknown.getReason().contains("ShipCountry"), unknown.getReason());

		ResponseStatusException hidden = assertThrows(ResponseStatusException.class,
				() -> runtime.filterOptions("sales-board", "cube2", "CostPrice", null));
		assertEquals(400, hidden.getStatusCode().value());
		assertTrue(hidden.getReason().contains("PartName"), hidden.getReason());
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** The status of the refusal this request earns on cube2, whose hidden members it names. */
	private int refusedBy(Map<String, Object> request) {
		return refusedBy("cube2", request);
	}

	private int refusedBy(String componentId, Map<String, Object> request) {
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("sales-board", componentId, request), request.toString());
		return refused.getStatusCode().value();
	}

	@SuppressWarnings("unchecked")
	private static List<Map<String, Object>> members(Map<String, Object> meta, String block) {
		return (List<Map<String, Object>>) meta.get(block);
	}

	private static List<String> names(Map<String, Object> meta, String block) {
		List<String> names = new ArrayList<>();
		for (Map<String, Object> member : members(meta, block))
			names.add((String) member.get("name"));
		return names;
	}

	private static Map<String, Object> memberOf(Map<String, Object> meta, String block, String name) {
		for (Map<String, Object> member : members(meta, block)) {
			if (name.equals(member.get("name")))
				return member;
		}
		throw new AssertionError("No " + block + " called " + name + " in " + names(meta, block));
	}

	private static String titleOf(Map<String, Object> meta, String block, String name) {
		return (String) memberOf(meta, block, name).get("title");
	}

	private static List<Map<String, Object>> rows(int howMany) {
		List<Map<String, Object>> rows = new ArrayList<>();
		for (int i = 0; i < howMany; i++)
			rows.add(Map.of("ShipCountry", "Country " + i));
		return rows;
	}

	private void cube(String cubeId, String name, String dslCode) throws Exception {
		write("config/cubes/" + cubeId + "/cube.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<cube>\n"
				+ "    <name>" + name + "</name>\n    <description>A cube of a dashboard</description>\n"
				+ "    <connectionId>" + THE_FILES_CONNECTION + "</connectionId>\n</cube>\n");
		write("config/cubes/" + cubeId + "/" + cubeId + "-cube-config.groovy", dslCode);
	}

	private void write(String relativePath, String content) throws Exception {
		Path path = dir.resolve(relativePath);
		Files.createDirectories(path.getParent());
		Files.writeString(path, content);
	}

	/** The database, as a notebook: which connection was asked, what was sent, and what came back. */
	private static final class StubDatabase implements CubeRuntimeService.Database {

		private String vendorAskedOf;
		private String readOn;
		private String sql;
		private Map<String, Object> params;
		private int readAtMost;
		private List<Map<String, Object>> rows = new ArrayList<>();

		@Override
		public String vendorOf(String connectionId) {
			this.vendorAskedOf = connectionId;
			return "sqlite";
		}

		@Override
		public List<Map<String, Object>> read(String connectionId, String sql, Map<String, Object> params,
				int limit) {
			this.readOn = connectionId;
			this.sql = sql;
			this.params = params;
			this.readAtMost = limit;
			return rows;
		}
	}
}

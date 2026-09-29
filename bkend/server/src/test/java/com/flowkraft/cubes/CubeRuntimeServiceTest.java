package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.flowkraft.common.AppPaths;
import com.flowkraft.embed.LockedParams;
import com.flowkraft.reports.ReportsController;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.UserSettingsRepository;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;

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

	/**
	 * The Support Desk sample, also read from its own file: story 31 writes the desk's own rule
	 * about who may read which rows into it, so the five people below are answered by the rule as
	 * it ships and not by a copy of it kept here.
	 */
	private static final String SUPPORT_DESK_DSL =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes/customer-support/"
					+ "support-desk-cube-config.groovy";

	/** The connection the dashboard declares. Every answer must be read on this one. */
	private static final String THE_FILES_CONNECTION = "rbt-sample-northwind-sqlite-4f2";

	@TempDir
	Path dir;

	/** Two people looking at the same dashboard, each with an account of their own (W5). */
	private static final CubeViewer ANNA = new CubeViewer("user:1", "default");
	private static final CubeViewer BORIS = new CubeViewer("user:2", "default");

	private String portableDirBefore;
	private String appPathBefore;
	private CubeRuntimeService runtime;
	private StubDatabase database;
	private IamDatabase iamDatabase;
	private UserSettingsRepository userSettings;

	@BeforeEach
	void aDashboardWithTwoLiveCubes() throws Exception {

		portableDirBefore = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", dir.toString());
		// The IAM store is found the way every other part of the installation is found, so the same
		// temporary folder holds the cubes, the widget file and the views saved for them (W5).
		appPathBefore = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = dir.toString();

		cube("northwind-sales", "Northwind Sales Analysis", Files.readString(Path.of(SAMPLE_DSL)));
		cube("support-desk", "Support Desk", Files.readString(Path.of(SUPPORT_DESK_DSL)));
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

		// R1: a cube with a question in it, in story 25's shape. The name in the condition is the
		// dashboard's to answer, and a card of this cube is the only card of the page that has to
		// ask it. With nothing answered the condition goes out of the WHERE, which is what a
		// statement of every customer means.
		cube("statement-of-one-customer", "Statement of one customer", """
				cube {
				  sql_table '"Orders"'
				  title 'Statement of one customer'
				  condition 'CustomerId', 'equals', customerId
				  dimension {
				    name 'CustomerId'
				    title 'Customer'
				    sql '${CUBE}."CustomerID"'
				    type 'number'
				  }
				  dimension {
				    name 'ShipCountry'
				    title 'Country'
				    sql '${CUBE}."ShipCountry"'
				    type 'string'
				  }
				  measure {
				    name 'OrderCount'
				    title 'Orders'
				    sql '${CUBE}."OrderID"'
				    type 'count'
				  }
				}
				""");

		cube("orders-of-mine", "My orders", """
				cube {
				  sql_table '"Orders"'
				  title 'My orders'
				  // What "mine" means here: my own orders, my team's, or - for a viewer the host
				  // application vouches for and this installation has no account for - my customer's.
				  access_filter '${CUBE}."SalesRepEmail" = ${dp_user_email} OR ${CUBE}."TeamSlug" IN (${dp_user_groups}) OR ${CUBE}."CustomerID" = ${dp_attr_customer_id}'
				  dimension {
				    name 'ShipCountry'
				    title 'Ship Country'
				    sql '${CUBE}."ShipCountry"'
				    type 'string'
				  }
				  measure {
				    name 'OrderCount'
				    title 'Orders'
				    sql '${CUBE}."OrderID"'
				    type 'count'
				  }
				}
				""");

		// A cube whose rows belong to somebody, with the owner and the team as members of their
		// own: what a binding the server answers narrows (R9). No access filter on it, because
		// that is the other half of the promise and this half must hold on its own.
		cube("tickets-of-mine", "My tickets", """
				cube {
				  sql_table '"Tickets"'
				  title 'My tickets'
				  dimension {
				    name 'OwnerEmail'
				    title 'Owner Email'
				    sql '${CUBE}."OwnerEmail"'
				    type 'string'
				  }
				  dimension {
				    name 'Team'
				    title 'Team'
				    sql '${CUBE}."Team"'
				    type 'string'
				  }
				  dimension {
				    name 'Status'
				    title 'Status'
				    sql '${CUBE}."Status"'
				    type 'string'
				  }
				  measure {
				    name 'Tickets'
				    title 'Tickets'
				    sql '${CUBE}."TicketID"'
				    type 'count'
				  }
				}
				""");

		// A cube of the Cube Stories kind: one field the parser refuses, so the error rule has
		// something to refuse, and a hints file, so the questions have somewhere to come from.
		cube("stories-cube", "Deals", """
				cube {
				  sql_table '"Deals"'
				  title 'Deals'
				  dimension {
				    name 'Stage'
				    title 'Stage'
				    sql '${CUBE}."Stage"'
				    type 'string'
				  }
				  dimension {
				    name 'Owner'
				    title 'Owner'
				    sql '${CUBE}."Owner"'
				    type 'string'
				    order 'sideways'
				  }
				  measure {
				    name 'Deals'
				    title 'Deals'
				    sql '${CUBE}."DealID"'
				    type 'count'
				  }
				}
				""");

		write("config/cubes/stories-cube/hints.json", """
				[
				  { "id": "deals-by-stage", "fromStory": 1,
				    "question": "How many deals are at each stage?",
				    "text": "Tick Stage and Deals.",
				    "query": { "dimensions": ["Stage"], "measures": ["Deals"] },
				    "variants": [
				      { "id": "by-owner", "text": "The same, by owner.",
				        "query": { "dimensions": ["Owner"], "measures": ["Deals"] } }
				    ] },
				  { "id": "deals-of-another-cube",
				    "question": "A question about another cube of the same file",
				    "text": "Not this widget's.",
				    "query": { "cubeName": "Payments", "measures": ["Deals"] } }
				]
				""");

		// The dashboard's own parameters, in the one place a dashboard declares them (R1). The
		// filter bar at the top of this board offers a country, a region nothing is bound to, and
		// a floor for the money - and All travels as the wildcard.
		write("config/reports/sales-board/sales-board-report-parameters-spec.groovy", """
				reportParameters {
				    parameter(
				        id:           'country',
				        type:         'String',
				        label:        'Country',
				        defaultValue: '*'
				    ) {
				        ui(control: 'select')
				    }
				    parameter(
				        id:           'region',
				        type:         'String',
				        label:        'Region',
				        defaultValue: '*'
				    ) {
				        ui(control: 'select')
				    }
				    parameter(
				        id:           'customerId',
				        type:         'Integer',
				        label:        'Customer',
				        defaultValue: ''
				    ) {
				        constraints(required: false)
				        ui(control: 'select')
				    }
				    parameter(
				        id:           'minSales',
				        type:         'Double',
				        label:        'At least',
				        defaultValue: ''
				    ) {
				        ui(control: 'number')
				    }
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
				  },
				  "cube31": {
				    "cubeId": "support-desk",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Priority"], "measures": ["Tickets", "BreachedTickets", "BreachRate"] },
				    "display": "table"
				  },
				  "cube3": {
				    "cubeId": "orders-of-mine",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["OrderCount"] },
				    "display": "table"
				  },
				  "cube4": {
				    "cubeId": "northwind-sales",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "measures": ["Revenue"] },
				    "display": "value",
				    "saveView": false
				  },
				  "cube5": {
				    "cubeId": "stories-cube",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Stage"], "measures": ["Deals"] },
				    "display": ["table", "chart"],
				    "showSql": true,
				    "showCode": true,
				    "showHints": true,
				    "saveView": false
				  },
				  "cube6": {
				    "cubeId": "stories-cube",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Stage"], "measures": ["Deals"] }
				  },
				  "cube7": {
				    "cubeId": "northwind-sales",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["Revenue"] },
				    "display": "table",
				    "showSql": true,
				    "paramBindings": [
				      { "param": "country", "member": "ShipCountry", "operator": "in" }
				    ]
				  },
				  "cube8": {
				    "cubeId": "orders-of-mine",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["OrderCount"] },
				    "display": "table",
				    "paramBindings": [
				      { "param": "country", "member": "ShipCountry", "operator": "equals" }
				    ]
				  },
				  "cube10": {
				    "cubeId": "northwind-sales",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["Revenue"] },
				    "display": "table",
				    "paramBindings": [
				      { "param": "minSales", "member": "Revenue", "operator": "greater_or_equal" }
				    ]
				  },
				  "cube11": {
				    "cubeId": "tickets-of-mine",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Status"], "measures": ["Tickets"] },
				    "display": "table",
				    "showSql": true,
				    "paramBindings": [
				      { "param": "dp_user_email", "member": "OwnerEmail", "operator": "equals" }
				    ]
				  },
				  "cube12": {
				    "cubeId": "tickets-of-mine",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Status"], "measures": ["Tickets"] },
				    "display": "table",
				    "paramBindings": [
				      { "param": "dp_user_groups", "member": "Team", "operator": "in" }
				    ]
				  },
				  "cube14": {
				    "cubeId": "statement-of-one-customer",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["ShipCountry"], "measures": ["OrderCount"] },
				    "display": "table"
				  },
				  "cube13": {
				    "cubeId": "tickets-of-mine",
				    "connectionId": "rbt-sample-northwind-sqlite-4f2",
				    "initial": { "dimensions": ["Status"], "measures": ["Tickets"] },
				    "display": "table",
				    "paramBindings": [
				      { "param": "dp_user_email", "member": "OwnerEmail", "operator": "equals" },
				      { "param": "region", "member": "Status", "operator": "in" }
				    ]
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

		iamDatabase = new IamDatabase();
		iamDatabase.init();
		userSettings = new UserSettingsRepository(iamDatabase);
		ReflectionTestUtils.setField(runtime, "userSettings", userSettings);

		database = new StubDatabase();
		runtime.useDatabase(database);
	}

	@AfterEach
	void putThePortableDirBack() {
		if (iamDatabase != null)
			iamDatabase.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = appPathBefore;
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

		// No "parameters": this card's cube asks nothing of the page's three, and nothing on the
		// filter bar is bound to it. The whole key list, with them, is pinned on cube14 below.
		assertEquals(List.of("componentId", "cubeId", "title", "description", "dimensions", "measures",
				"segments", "hierarchies", "currency", "initial", "display", "viewStorage",
				"myView", "myViewDropped"), new ArrayList<>(meta.keySet()));
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

		// What the money in this cube is, so the formatter writes it the same way everywhere (W4.2).
		// A cube that says nothing is in USD, so the key is always there to read.
		assertEquals("USD", meta.get("currency"));
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
		// A widget's display is the list of shapes it offers, even where that list holds one: the
		// renderer draws a switch from it, and a switch of one is a shape that cannot be changed.
		assertEquals(List.of("chart"), meta.get("display"));
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

	/**
	 * A grained date is a column of the answer, so an order may name one: the canvas offers
	 * {@code OrderDate.month} to the sort exactly as it offers it to the grouping, and a live cube
	 * that refused it would refuse the very selection its author published (7j, the two modes).
	 */
	@Test
	void anOrderMayNameAGrainOfADateJustAsTheGroupingDoes() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("OrderDate.month"));
		request.put("measures", List.of("Revenue"));
		request.put("order", List.of(Map.of("member", "OrderDate.month", "dir", "asc")));

		runtime.query("sales-board", "cube1", request, Map.of());

		assertTrue(database.sql.contains("ORDER BY"), database.sql);

		// The negative half: the grain is not a way past the check. A name the cube does not offer
		// is refused whether or not something follows a dot.
		for (String unknown : List.of("NoSuchDate.month", "NoSuchDate")) {
			Map<String, Object> nonsense = new LinkedHashMap<>();
			nonsense.put("dimensions", List.of("ShipCountry"));
			nonsense.put("measures", List.of("Revenue"));
			nonsense.put("order", List.of(Map.of("member", unknown, "dir", "asc")));
			ResponseStatusException refused = assertThrows(ResponseStatusException.class,
					() -> runtime.query("sales-board", "cube1", nonsense, Map.of()), unknown);
			assertEquals(400, refused.getStatusCode().value(), unknown);
			assertTrue(refused.getReason().contains("NoSuchDate"), refused.getReason());
		}
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
	// totals — one number per measure, over all the rows, not the rows shown
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * A total is a second query, because a distinct count, an average and a share are each wrong
	 * when the rows are added up — and because a cut answer still totals everything.
	 */
	@Test
	void totalsAreASecondQuestionAndNotTheSumOfTheRowsShown() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("ShipCountry"));
		request.put("measures", List.of("Revenue", "UniqueCustomers"));
		request.put("limit", 3);
		request.put("totals", true);

		database.rows = List.of(Map.of("Revenue", 250, "UniqueCustomers", 91));
		Map<String, Object> answer = runtime.query("sales-board", "cube1", request);

		assertEquals(2, database.statements.size(), "The rows, then the totals");
		assertTrue(database.statements.get(0).contains("GROUP BY"), database.statements.get(0));
		assertFalse(database.statements.get(1).contains("GROUP BY"),
				"The totals are one row over everything: " + database.statements.get(1));
		assertEquals(2, database.readAtMost, "and two rows are read, so a second one would be noticed");

		@SuppressWarnings("unchecked")
		Map<String, Object> totals = (Map<String, Object>) answer.get("totals");
		assertEquals(List.of("Revenue", "UniqueCustomers"), List.copyOf(totals.keySet()),
				"In the order they were asked for, so the table's bottom row lines up");
		assertEquals(91, totals.get("UniqueCustomers"),
				"A distinct count over everything, never the sum of the rows");

		// Nobody asked, nobody pays: one query, and no totals key at all.
		database.statements.clear();
		Map<String, Object> plain = runtime.query("sales-board", "cube1",
				Map.of("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue")));
		assertEquals(1, database.statements.size());
		assertFalse(plain.containsKey("totals"));
	}

	/** The analysis measures: what a share, a running total and an earlier period total to. */
	@Test
	void anAnalysisMeasureTotalsToWhatItMeansOrToNothing() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("OrderDate"));
		request.put("granularities", Map.of("OrderDate", "month"));
		request.put("measures", List.of("Revenue", "RevenueShare", "RevenueRunning", "RevenuePriorYear"));
		request.put("totals", true);

		database.rows = List.of(new LinkedHashMap<>(Map.of("Revenue", 250)));
		@SuppressWarnings("unchecked")
		Map<String, Object> totals = (Map<String, Object>) runtime
				.query("sales-board", "cube1", request).get("totals");

		assertEquals(1, totals.get("RevenueShare"), "Every group's share adds up to the whole of it");
		assertTrue(totals.containsKey("RevenueRunning"), "A running total is still a column");
		assertNull(totals.get("RevenueRunning"),
				"but its total would be a total of totals, so there is none");
		assertNull(totals.get("RevenuePriorYear"),
				"and with no date filter there is no earlier period to total");

		// With a time filter there is one: the earlier period's own total, asked for.
		request.put("filters", List.of(Map.of("member", "OrderDate", "operator", "between",
				"values", List.of("2024-01-01", "2024-12-31"))));
		database.rows = List.of(new LinkedHashMap<>(Map.of("Revenue", 250, "RevenuePriorYear", 190)));
		@SuppressWarnings("unchecked")
		Map<String, Object> overAYear = (Map<String, Object>) runtime
				.query("sales-board", "cube1", request).get("totals");
		assertEquals(190, overAYear.get("RevenuePriorYear"), "The year before, over the whole year");
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /drill — the rows behind one number
	// ═══════════════════════════════════════════════════════════════════════════

	/** What the author wrote in {@code drill_members}, filtered by the cell that was clicked. */
	@Test
	void theRowsBehindANumberAreTheMeasuresOwnDrillMembersNarrowedToTheCell() throws Exception {

		Map<String, Object> body = new LinkedHashMap<>();
		body.put("dimensions", List.of("ShipCountry"));
		body.put("measures", List.of("Revenue"));
		body.put("segments", List.of("shipped"));
		body.put("measure", "Revenue");
		body.put("cell", Map.of("ShipCountry", "Germany"));

		database.rows = rows(4);
		Map<String, Object> answer = runtime.drill("sales-board", "cube1", body);

		assertEquals(4, ((List<?>) answer.get("rows")).size());
		assertEquals(Boolean.FALSE, answer.get("truncated"));
		assertEquals(THE_FILES_CONNECTION, database.readOn, "On the dashboard's own connection");
		assertEquals(CubeDrill.LIMIT + 1, database.readAtMost, "The cap, plus the probe");

		String sql = database.sql;
		for (String member : List.of("OrderID", "OrderDate", "CustomerCompanyName", "EmployeeName",
				"OrderValue")) {
			assertTrue(sql.contains("AS \"" + member + "\""),
					"'" + member + "' is one of Revenue's drill members:\n" + sql);
		}
		assertFalse(sql.contains("AS \"ShipCountry\""),
				"The clicked field narrows the rows, it is not one of their columns:\n" + sql);
		assertTrue(sql.contains("\"ShipCountry\" IN (:"), "and it narrows them by name:\n" + sql);
		assertFalse(sql.contains("Germany"), "The value is bound, never written in:\n" + sql);
		assertTrue(database.params.containsValue("Germany"), database.params.toString());
		assertTrue(sql.contains("\"ShippedDate\" IS NOT NULL"),
				"The segment the cell was asked under still holds:\n" + sql);
	}

	/** A thousand rows is what a person reads; the thousand-and-first only says there are more. */
	@Test
	void aDrillIsCappedAndSaysWhenItWasCut() throws Exception {

		database.rows = rows(CubeDrill.LIMIT + 1);
		Map<String, Object> cut = runtime.drill("sales-board", "cube1",
				Map.of("measure", "Revenue", "cell", Map.of("ShipCountry", "Germany")));

		assertEquals(CubeDrill.LIMIT, ((List<?>) cut.get("rows")).size());
		assertEquals(Boolean.TRUE, cut.get("truncated"));
	}

	/**
	 * A share has no rows of its own: the rows behind it are the rows behind the measure it is a
	 * share of, which is where {@code drill_members} is written.
	 */
	@Test
	void aDrillOfAnAnalysisMeasureGoesThroughTheMeasureItIsReadOver() throws Exception {

		Map<String, Object> body = new LinkedHashMap<>();
		body.put("dimensions", List.of("CategoryName"));
		body.put("measures", List.of("Revenue", "RevenueShare"));
		body.put("measure", "RevenueShare");
		body.put("cell", Map.of("CategoryName", "Beverages"));

		runtime.drill("sales-board", "cube1", body);

		assertTrue(database.sql.contains("AS \"OrderID\""),
				"Revenue's drill members, reached through the share:\n" + database.sql);
		assertFalse(database.sql.contains("OVER ("),
				"and the rows themselves, with no analysis over them:\n" + database.sql);
	}

	/** The drill is the same lock as the query: a name the cube does not offer is not one here. */
	@Test
	void aDrillMayNotNameWhatTheCubeDoesNotOffer() {

		ResponseStatusException hidden = assertThrows(ResponseStatusException.class,
				() -> runtime.drill("sales-board", "cube2",
						Map.of("measure", "Margin", "cell", Map.of("PartName", "Bolt"))));
		assertEquals(400, hidden.getStatusCode().value());
		assertTrue(hidden.getReason().contains("PartCount"), hidden.getReason());

		ResponseStatusException unknownCell = assertThrows(ResponseStatusException.class,
				() -> runtime.drill("sales-board", "cube1",
						Map.of("measure", "Revenue", "cell", Map.of("ShipContinent", "Europe"))));
		assertEquals(400, unknownCell.getStatusCode().value());
		assertTrue(unknownCell.getReason().contains("ShipContinent"), unknownCell.getReason());
	}

	/**
	 * The server puts SQL into a filter when it drills, from the cube's own text. A request that
	 * carries one is refused rather than cleaned up: there is no innocent request that would.
	 */
	@Test
	void aFilterFromOutsideMayNotCarrySql() {

		Map<String, Object> sneaky = Map.of("member", "ShipCountry", "operator", "in",
				"values", List.of("Germany"),
				CubeSqlGenerator.SERVER_CONDITION, "1=1) OR (1=1");

		Map<String, Object> asQuery = new LinkedHashMap<>();
		asQuery.put("measures", List.of("Revenue"));
		asQuery.put("filters", List.of(sneaky));

		Map<String, Object> asDrill = new LinkedHashMap<>();
		asDrill.put("measure", "Revenue");
		asDrill.put("cell", Map.of("ShipCountry", "Germany"));
		asDrill.put("filters", List.of(sneaky));

		for (Map<String, Object> request : List.of(asQuery, asDrill)) {

			ResponseStatusException refused = assertThrows(ResponseStatusException.class, () -> {
				if (request.containsKey("measure"))
					runtime.drill("sales-board", "cube1", request);
				else
					runtime.query("sales-board", "cube1", request);
			}, request.toString());
			assertEquals(400, refused.getStatusCode().value());
			assertTrue(refused.getReason().contains("does not carry SQL"), refused.getReason());
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The author's own copy of the two endpoints: one cube, no dashboard
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The cube editor asks the same two questions of a cube nothing has published yet. It reaches
	 * the same method, so the keys, the refusals, the limit and the totals cannot drift apart from
	 * the runtime's.
	 */
	@Test
	void theAuthorsOwnQueryIsTheRuntimesQueryOnACubeNoDashboardDeclares() throws Exception {

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(Path.of(SAMPLE_DSL)));

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("ShipCountry"));
		request.put("measures", List.of("Revenue"));
		request.put("limit", 5);

		runtime.query("sales-board", "cube1", new LinkedHashMap<>(request));
		String throughTheDashboard = database.sql;

		runtime.rows(cube, "some-other-connection", new LinkedHashMap<>(request), Map.of());
		assertEquals(throughTheDashboard, database.sql, "The same question, the same statement");
		assertEquals("some-other-connection", database.readOn, "read where the author is editing");
		assertEquals(6, database.readAtMost, "with the same limit and the same probe");

		// And the same refusals, which is the point of there being one method.
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.rows(cube, "some-other-connection",
						Map.of("measures", List.of("Revenue"), "connectionId", "another"), Map.of()));
		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("'connectionId'"), refused.getReason());
	}

	/**
	 * The one thing the two answers do not share: the author is told the statement the rows were
	 * read by, and a viewer is not (W4.8). The component's {@code dataLoaded} carries {@code sql}
	 * in author mode only, and this is what lets it.
	 */
	@Test
	void onlyTheAuthorsOwnQueryAnswersWithTheStatementItRan() throws Exception {

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(Path.of(SAMPLE_DSL)));
		Map<String, Object> request = Map.of("dimensions", List.of("ShipCountry"), "measures",
				List.of("Revenue"));

		Map<String, Object> forTheAuthor = runtime.rows(cube, "some-other-connection",
				new LinkedHashMap<>(request), Map.of(), true);
		assertEquals(database.sql, forTheAuthor.get("sql"), "the statement the rows were read by");

		Map<String, Object> forAViewer = runtime.query("sales-board", "cube1", new LinkedHashMap<>(request));
		assertFalse(forAViewer.containsKey("sql"), "a viewer is never shown SQL: " + forAViewer.keySet());
	}

	/** And the author's drill, on a cube whose rows every viewer sees a different slice of. */
	@Test
	void theAuthorsOwnDrillStillBindsWhoeverIsAsking() throws Exception {

		CubeOptions mine = CubeOptionsParser.parseGroovyCubeDslCode(Files.readString(
				dir.resolve("config/cubes/orders-of-mine/orders-of-mine-cube-config.groovy")));

		runtime.rows(mine, THE_FILES_CONNECTION, Map.of("dimensions", List.of("ShipCountry")),
				asking("rep@example.com", "'sales'", ""));

		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertEquals("rep@example.com", database.params.get("dp_user_email"),
				"The condition is the cube's, the value is the caller's");
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
	// The access filter: one widget, one statement, each viewer their own rows
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The same widget, the same question, two people - one answer each. The statement they are
	 * answered from is the same bytes: the cube's condition is in it with a placeholder where the
	 * person goes, and who they are arrives as a bound value. That is what makes the answer theirs
	 * and not the first viewer's, on a database that caches statements as much as on one that does
	 * not.
	 */
	@Test
	void twoPeopleAskingTheSameQuestionEachGetTheirOwnValuesBound() throws Exception {

		runtime.query("sales-board", "cube3", Map.of("dimensions", List.of("ShipCountry")),
				asking("anna@example.com", "sales,tier-2", "4711"));
		String forAnna = database.sql;
		Map<String, Object> annasValues = database.params;

		runtime.query("sales-board", "cube3", Map.of("dimensions", List.of("ShipCountry")),
				asking("boris@example.com", "billing", "0815"));

		assertEquals(forAnna, database.sql, "The same question is the same statement");
		assertTrue(forAnna.contains(":dp_user_email"), forAnna);
		assertTrue(forAnna.contains("<dp_user_groups>"), "The groups are a bound list: " + forAnna);
		assertTrue(forAnna.contains(":dp_attr_customer_id"), forAnna);
		assertFalse(forAnna.contains("anna@example.com"), "Nobody is written into the SQL: " + forAnna);
		assertFalse(forAnna.contains("boris@example.com"), forAnna);

		assertEquals("anna@example.com", annasValues.get("dp_user_email"));
		assertEquals(List.of("sales", "tier-2"), annasValues.get("dp_user_groups"));
		assertEquals("4711", annasValues.get("dp_attr_customer_id"));

		assertEquals("boris@example.com", database.params.get("dp_user_email"));
		assertEquals(List.of("billing"), database.params.get("dp_user_groups"));
		assertEquals("0815", database.params.get("dp_attr_customer_id"));
	}

	/**
	 * A saved view (W5) is a selection replayed as a request, and a request cannot reach the
	 * condition: it is not in the question at all, it is in the cube. So a view saved by one person
	 * and opened by another shows the second person their own rows - the selection travels, the
	 * rows do not.
	 */
	@Test
	void aSavedViewNeverRemovesTheCondition() throws Exception {

		Map<String, Object> savedView = new LinkedHashMap<>();
		savedView.put("dimensions", List.of("ShipCountry"));
		savedView.put("measures", List.of("OrderCount"));
		savedView.put("filters", List.of(Map.of("member", "ShipCountry", "operator", "in",
				"values", List.of("Germany"))));
		savedView.put("order", List.of(Map.of("member", "OrderCount", "dir", "desc")));
		savedView.put("limit", 50);

		runtime.query("sales-board", "cube3", savedView, asking("anna@example.com", "sales", ""));
		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertEquals("anna@example.com", database.params.get("dp_user_email"));

		runtime.query("sales-board", "cube3", savedView, asking("boris@example.com", "billing", ""));
		assertTrue(database.sql.contains(":dp_user_email"), "The view carried the selection, not the rows");
		assertEquals("boris@example.com", database.params.get("dp_user_email"));
		assertTrue(database.params.values().toString().contains("Germany"), "And the view's own filter is still bound");
	}

	/**
	 * Row 0 of the precedence table, on this endpoint: a viewer naming themselves somebody else in
	 * the request body is answered their own rows. The names are not among the keys a question may
	 * carry, so they never reach the generator, and the values bound are the session's either way.
	 */
	@Test
	void aRequestNamingSomebodyElseChangesNothing() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("ShipCountry"));
		request.put("dp_user_id", "boss");
		request.put("dp_user_email", "boss@example.com");
		request.put("dp_attr_customer_id", "9999");

		runtime.query("sales-board", "cube3", request, asking("anna@example.com", "sales", "4711"));

		assertEquals("anna@example.com", database.params.get("dp_user_email"), "Their own, not the one asked for");
		assertEquals("4711", database.params.get("dp_attr_customer_id"));
		assertFalse(database.sql.contains("boss"), database.sql);
		assertFalse(database.params.values().toString().contains("boss"), database.params.toString());
		assertFalse(database.params.values().toString().contains("9999"), database.params.toString());
	}

	/**
	 * An embed token's attributes reach the live cube exactly as they reach {@code /data}: the same
	 * {@code UserVariables} map, bound the same way. A token has no person behind it, so the four
	 * person variables are empty and match no row - the attribute is the whole of what such a
	 * viewer is - and an attribute the token does not carry is empty too, which shows them nothing
	 * rather than everything.
	 */
	@Test
	void anEmbedTokensAttributesReachTheLiveCubeExactlyAsTheyReachData() throws Exception {

		Map<String, String> tokenViewer = new LinkedHashMap<>();
		tokenViewer.put("dp_user_id", "");
		tokenViewer.put("dp_user_email", "");
		tokenViewer.put("dp_user_groups", "");
		tokenViewer.put("dp_user_role", "");
		tokenViewer.put("dp_attr_customer_id", "4711");

		runtime.query("sales-board", "cube3", Map.of("dimensions", List.of("ShipCountry")), tokenViewer);

		assertEquals("4711", database.params.get("dp_attr_customer_id"), "What the host application vouched for");
		assertEquals("", database.params.get("dp_user_email"), "Nobody, which matches no row");
		assertEquals(List.of(""), database.params.get("dp_user_groups"),
				"A person in no group is IN (''), which matches no row - never IN (), which is not SQL");

		// The same token without that attribute: the condition stays, with nothing in it.
		runtime.query("sales-board", "cube3", Map.of("dimensions", List.of("ShipCountry")), Map.of());
		assertTrue(database.sql.contains(":dp_attr_customer_id"), database.sql);
		assertEquals("", database.params.get("dp_attr_customer_id"),
				"An attribute the credential does not carry is empty, not missing");
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Story 31: the shipped Support Desk, and the five people who open it
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The desk's rule has three lines - your own team, the managers' group, and the roles that see
	 * everything - and all three are the author's SQL. What the runtime owes them is the same on
	 * every line: the condition is in the statement with a placeholder where the person goes, and
	 * the person arrives as a bound value. These five tests are that promise, once per kind of
	 * person who opens the card; which rows each of them then gets back is the vendor loop's
	 * access-filter case, which asks real databases.
	 */
	private static final String TIER_2 = "chiara.muller@support.cube-demo.example";
	private static final String BILLING = "jonas.berg@support.cube-demo.example";

	/** An agent of Tier 2: the first line finds their team from the email they signed in with. */
	@Test
	void anAgentOfTierTwoIsBoundTheirOwnEmailAndNothingElse() throws Exception {

		runtime.query("sales-board", "cube31", deskAsked(), atTheDesk(TIER_2, "support-agents", "dashboard-viewer"));

		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertTrue(database.sql.contains("<dp_user_groups>"), "The groups are a bound list: " + database.sql);
		assertTrue(database.sql.contains(":dp_user_role"), database.sql);
		assertTrue(database.sql.contains("support_agents"), "The team is read from the desk's own table: " + database.sql);
		assertFalse(database.sql.contains(TIER_2), "Nobody is written into the SQL: " + database.sql);

		assertEquals(TIER_2, database.params.get("dp_user_email"));
		assertEquals(List.of("support-agents"), database.params.get("dp_user_groups"));
		assertEquals("dashboard-viewer", database.params.get("dp_user_role"));
	}

	/**
	 * An agent of Billing, asking the very same question: the same statement, to the byte, and
	 * their own email bound into it. Two agents of two teams share a statement and not an answer.
	 */
	@Test
	void anAgentOfBillingAsksTheSameStatementAndIsBoundTheirOwn() throws Exception {

		runtime.query("sales-board", "cube31", deskAsked(), atTheDesk(TIER_2, "support-agents", "dashboard-viewer"));
		String forTierTwo = database.sql;

		runtime.query("sales-board", "cube31", deskAsked(), atTheDesk(BILLING, "support-agents", "dashboard-viewer"));

		assertEquals(forTierTwo, database.sql, "The same question is the same statement");
		assertEquals(BILLING, database.params.get("dp_user_email"));
		assertFalse(database.sql.contains(BILLING), database.sql);
		assertFalse(database.sql.contains(TIER_2), database.sql);
	}

	/** A support manager: the second line lets them in, and it is their group that does it. */
	@Test
	void aSupportManagerIsLetInByTheirGroupAndTheGroupIsBoundAsAList() throws Exception {

		runtime.query("sales-board", "cube31", deskAsked(),
				atTheDesk("marta.klein@support.cube-demo.example", "support-managers,support-agents",
						"dashboard-viewer"));

		assertTrue(database.sql.contains("'support-managers' IN (<dp_user_groups>)"),
				"The group the author named is the author's own text, and the viewer's groups are bound: "
						+ database.sql);
		assertEquals(List.of("support-managers", "support-agents"), database.params.get("dp_user_groups"));
	}

	/** An admin: the third line, and the role is bound rather than believed. */
	@Test
	void anAdminIsLetInByTheirRoleAndTheRoleIsBound() throws Exception {

		runtime.query("sales-board", "cube31", deskAsked(),
				atTheDesk("admin@support.cube-demo.example", "", "admin"));

		assertTrue(database.sql.contains(":dp_user_role IN ('admin', 'report-author', 'platform-admin')"),
				database.sql);
		assertEquals("admin", database.params.get("dp_user_role"));
		assertEquals(List.of(""), database.params.get("dp_user_groups"),
				"A person in no group is IN (''), which matches no row - never IN (), which is not SQL");
	}

	/**
	 * A share link (question 3): nobody is behind it, so the four person variables are empty. The
	 * condition stays in the statement with nothing in it, which shows such a viewer no rows at
	 * all - the answer a desk of other people's tickets owes a link.
	 */
	@Test
	void aShareLinkHasNobodyBehindItAndTheConditionStays() throws Exception {

		runtime.query("sales-board", "cube31", deskAsked(), atTheDesk("", "", ""));

		assertTrue(database.sql.contains(":dp_user_email"), "The condition is still there: " + database.sql);
		assertEquals("", database.params.get("dp_user_email"), "Nobody, which matches no agent");
		assertEquals("", database.params.get("dp_user_role"), "And no role, which is none of the three");
		assertEquals(List.of(""), database.params.get("dp_user_groups"));
	}

	/** The card's own question: this morning's plate, by priority. */
	private static Map<String, Object> deskAsked() {
		return Map.of("dimensions", List.of("Priority"),
				"measures", List.of("Tickets", "BreachedTickets", "BreachRate"));
	}

	/** Who is asking the desk, as {@code UserVariables} hands them over: text, and never a request's. */
	private static Map<String, String> atTheDesk(String email, String groups, String role) {

		Map<String, String> values = new LinkedHashMap<>();
		values.put("dp_user_email", email);
		values.put("dp_user_groups", groups);
		values.put("dp_user_role", role);
		return values;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Cube Stories: the five opt-ins, /sql and the error rule (design part 8)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * What an author opens up is opened up for their widget alone. Two widgets on one dashboard
	 * read the very same cube here: one says so in its file, the other says nothing, and the
	 * second is the negative half — a key it never asked for is absent, not empty, so a page
	 * cannot draw a View SQL it would have nothing to fill.
	 */
	@Test
	void theOptInsAreTheAuthorsAndNobodyElsesDefault() throws Exception {

		Map<String, Object> opened = runtime.meta("sales-board", "cube5");

		assertEquals(CubeSqlDialect.DIALECTS, opened.get("sqlDialects"));
		assertEquals("sqlite", opened.get("dbVendor"), "The database the rows really come from");
		assertTrue(String.valueOf(opened.get("code")).contains("sql_table"), "The cube's own DSL");
		assertNotNull(opened.get("warnings"), "What the parser found wrong with it");
		assertNotNull(opened.get("hints"), "The questions the cube was written to answer");
		// saveView false, so nothing this viewer does is kept anywhere (W5).
		assertEquals("none", opened.get("viewStorage"));

		Map<String, Object> shut = runtime.meta("sales-board", "cube6");

		for (String key : List.of("sqlDialects", "dbVendor", "code", "warnings", "hints")) {
			assertFalse(shut.containsKey(key), "A widget that did not ask for " + key + " gets none");
		}
		// The same cube, so the difference really is the file's opt-ins and not the cube's fields.
		assertEquals(names(opened, "dimensions"), names(shut, "dimensions"));
	}

	/**
	 * A hint and each of its variants is one ask of its own, because each is a different answer.
	 * The id is what the page's markup is built from and the check is what the e2e truth file
	 * calls the same ask; they differ in one character, and both travel so neither side guesses.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void everyHintAndEveryVariantIsOneAskWithItsOwnId() throws Exception {

		List<Map<String, Object>> asks =
				(List<Map<String, Object>>) runtime.meta("sales-board", "cube5").get("hints");

		assertEquals(List.of("deals-by-stage", "deals-by-stage--by-owner"),
				asks.stream().map(ask -> ask.get("id")).toList());
		assertEquals(List.of("deals-by-stage", "deals-by-stage/by-owner"),
				asks.stream().map(ask -> ask.get("check")).toList());

		// A variant asks the hint's question again; its own sentence says what changed.
		assertEquals("How many deals are at each stage?", asks.get(1).get("question"));
		assertEquals("The same, by owner.", asks.get(1).get("text"));
		assertEquals(Map.of("dimensions", List.of("Owner"), "measures", List.of("Deals")),
				asks.get(1).get("query"));

		// The negative half: a hint of another cube of the same file is not this widget's, and no
		// ask carries a cubeName - /query refuses that key, so a Show Me that sent it would fail.
		assertFalse(asks.toString().contains("deals-of-another-cube"));
		assertFalse(asks.toString().contains("cubeName"), asks.toString());
	}

	/**
	 * A field the parser refuses is shown as broken and cannot be asked for — on every dashboard,
	 * opt-ins or not. The cube's other fields go on working, which is the point: one bad line in a
	 * file does not take the whole cube off the page.
	 */
	@Test
	void aMemberInErrorIsMarkedAndRefused() throws Exception {

		Map<String, Object> meta = runtime.meta("sales-board", "cube6");

		assertEquals(Boolean.TRUE, memberOf(meta, "dimensions", "Owner").get("error"));
		assertNull(memberOf(meta, "dimensions", "Stage").get("error"),
				"A field with nothing wrong with it carries no error");
		assertFalse(meta.toString().contains("sideways"),
				"What is wrong with it is the author's business, not every viewer's");

		// The positive half: the rest of the cube answers.
		Map<String, Object> good = new LinkedHashMap<>();
		good.put("dimensions", List.of("Stage"));
		good.put("measures", List.of("Deals"));
		assertNotNull(runtime.query("sales-board", "cube6", good, Map.of()));

		// The negative half: the broken one is refused, in words, naming it.
		Map<String, Object> broken = new LinkedHashMap<>();
		broken.put("dimensions", List.of("Owner"));
		broken.put("measures", List.of("Deals"));
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("sales-board", "cube6", broken, Map.of()));
		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("Owner"), refused.getReason());
	}

	/**
	 * View SQL: the statement this selection would be answered by, for the database a viewer
	 * picked. It runs nothing and opens no connection — the rows always come from {@code /query},
	 * on the widget's own connection, whatever vendor is chosen here.
	 */
	@Test
	void sqlIsWrittenForTheDatabaseAskedForAndNothingIsRun() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Stage"));
		request.put("measures", List.of("Deals"));

		Map<String, Object> onItsOwn = runtime.sql("sales-board", "cube5", request);
		assertEquals("sqlite", onItsOwn.get("dialect"), "The connection's own database, by default");
		assertTrue(String.valueOf(onItsOwn.get("sql")).contains("\"Deals\""), onItsOwn.toString());

		request.put("dbVendor", "oracle");
		Map<String, Object> onOracle = runtime.sql("sales-board", "cube5", request);
		assertEquals("oracle", onOracle.get("dialect"));
		assertNotEquals(onItsOwn.get("sql"), onOracle.get("sql"),
				"Another database is another SQL, or the vendor select says nothing");

		assertNull(database.readOn, "Nothing is read: View SQL is not a second way to the rows");
	}

	/** A widget whose author did not turn View SQL on has no SQL to give, and says so. */
	@Test
	void sqlIsRefusedWhereTheAuthorDidNotTurnItOn() throws Exception {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Stage"));
		request.put("measures", List.of("Deals"));

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.sql("sales-board", "cube6", request));
		assertEquals(403, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("showSql"), refused.getReason());

		// The negative half of the negative half: a broken field is refused here too, so the SQL
		// panel cannot be used to read what the tree will not let anybody tick.
		Map<String, Object> broken = new LinkedHashMap<>();
		broken.put("dimensions", List.of("Owner"));
		broken.put("measures", List.of("Deals"));
		assertEquals(400, refusedBy(() -> runtime.sql("sales-board", "cube5", broken)));
	}

	/** The shapes a widget offers are a list, whichever of the two ways its file wrote them. */
	@Test
	void theShapesOfferedAreAlwaysAList() throws Exception {

		assertEquals(List.of("table", "chart"), runtime.meta("sales-board", "cube5").get("display"));
		assertEquals(List.of("value"), runtime.meta("sales-board", "cube4").get("display"));
		assertEquals(List.of(), runtime.meta("sales-board", "cube6").get("display"),
				"A widget that says nothing offers nothing, and the answer's own shape decides");
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** What {@code UserVariables.of(request)} answers for one signed-in person, as far as this cube asks. */
	// ═══════════════════════════════════════════════════════════════════════════
	// R9 — a binding the server answers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The author binds this widget to {@code dp_user_email}, and every viewer sees their own rows
	 * through it - nobody picked anything.
	 *
	 * <p>The entry looks exactly like the dashboard's own binding (R8); what differs is who
	 * answers. A reserved name is nobody's to answer, so the filter's value is the
	 * {@code ${dp_user_email}} the statement carries on, bound a moment before it runs with the
	 * value {@code UserVariables} holds for whoever asked - the same map {@code /data} binds, made
	 * from the session or the credential and never from the request.
	 */
	@Test
	void aBindingTheServerAnswersFollowsWhoeverIsLookingAndNotTheFilterBar() throws Exception {

		runtime.query("sales-board", "cube11", ticketsAsked(Map.of()),
				asking("anna@example.com", "sales", "4711"));
		String annas = database.sql;

		assertTrue(annas.contains("OwnerEmail"), "The owner is filtered on: " + annas);
		assertTrue(annas.contains(":dp_user_email"),
				"by the name the server fills in, bound: " + annas);
		assertFalse(annas.contains("anna@example.com"), "and never written in: " + annas);
		assertEquals("anna@example.com", database.params.get("dp_user_email"),
				database.params.toString());

		runtime.query("sales-board", "cube11", ticketsAsked(Map.of()),
				asking("boris@example.com", "support", "4712"));

		assertEquals(annas, database.sql,
				"The same widget asks the same question of everybody: " + database.sql);
		assertEquals("boris@example.com", database.params.get("dp_user_email"),
				"and each one is answered with their own value: " + database.params);
	}

	/**
	 * Nobody in particular is still somebody: the filter stays and matches no row.
	 *
	 * <p>This is R1's rule for a builtin with nothing behind it, and it is the difference between
	 * a share link that shows a stranger nothing and one that shows them every owner's rows. A
	 * dashboard filter answered with All drops out of the question; a reserved name never does,
	 * because nobody answered All - nobody answered at all.
	 */
	@Test
	void aBindingTheServerAnswersIsNeverDroppedAndAnEmptyValueMatchesNoRow() throws Exception {

		runtime.query("sales-board", "cube11", ticketsAsked(Map.of()), asking("", "", ""));

		assertTrue(database.sql.contains("OwnerEmail"),
				"A viewer with no email of their own is still filtered: " + database.sql);
		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertEquals("", database.params.get("dp_user_email"),
				"bound to nothing, which matches no row: " + database.params);

		// And a caller the server knows nothing at all about - no map, as a request with no
		// session and no token arrives - is the same viewer: bound empty, not left out.
		runtime.query("sales-board", "cube11", ticketsAsked(Map.of()), Map.of());
		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertEquals("", database.params.get("dp_user_email"), database.params.toString());
	}

	/**
	 * A viewer cannot answer a reserved name, wherever they write it: not in the filter bar's
	 * values, not as a binding of their own, and not in a filter they tick themselves.
	 *
	 * <p>The three are one rule seen from three sides - the value of a {@code dp_} name is the
	 * server's - and each of the three is a way somebody would try to read another person's rows.
	 */
	@Test
	void aViewerCannotAnswerAReservedNameFromTheRequest() throws Exception {

		// In the filter bar's answers: the dashboard declares no such parameter, and a value for a
		// parameter that does not exist is a mistake rather than a value (R1). Nothing is read.
		database.sql = null;
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("sales-board", "cube11",
						ticketsAsked(Map.of("dp_user_email", "boris@example.com")),
						asking("anna@example.com", "sales", "4711")));
		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("dp_user_email"), refused.getReason());
		assertNull(database.sql, "and nothing was read for it: " + database.sql);

		// As a binding in the body: the bindings are the entry's, and a request key the runtime
		// does not know is dropped with the rest.
		Map<String, Object> ownBinding = ticketsAsked(Map.of());
		ownBinding.put("paramBindings", List.of(Map.of(
				"param", "dp_user_email", "member", "OwnerEmail", "operator", "equals")));
		runtime.query("sales-board", "cube11", ownBinding, asking("anna@example.com", "sales", "4711"));
		assertEquals(1, occurrencesOf(database.sql, ":dp_user_email"),
				"The entry's binding, once, and not the body's as well: " + database.sql);
		assertEquals("anna@example.com", database.params.get("dp_user_email"),
				database.params.toString());

		// And written into a filter of their own: the name is still the server's to answer, so
		// what comes back is this viewer's rows and not the rows of whoever they named.
		Map<String, Object> ownFilter = ticketsAsked(Map.of());
		ownFilter.put("filters", List.of(Map.of("member", "OwnerEmail", "operator", "equals",
				"values", List.of("${dp_user_email}"))));
		runtime.query("sales-board", "cube11", ownFilter, asking("anna@example.com", "sales", "4711"));
		assertFalse(database.sql.contains("boris@example.com"), database.sql);
		assertEquals("anna@example.com", database.params.get("dp_user_email"),
				"The value is the server's, wherever the name was written: " + database.params);
	}

	/**
	 * The teams a person is in are a list, and a list is an {@code IN} - the same {@code IN
	 * (${dp_user_groups})} a published script and an access filter carry, spread into one
	 * placeholder per group when it is bound.
	 */
	@Test
	void aServerSetListIsSpreadIntoAnInExactlyAsAnAccessFiltersIs() throws Exception {

		runtime.query("sales-board", "cube12", ticketsAsked(Map.of()),
				asking("anna@example.com", "sales,billing", "4711"));

		assertTrue(database.sql.contains("Team"), database.sql);
		assertTrue(database.sql.contains("IN ("), "A list is an IN: " + database.sql);
		// A list is bound as a list, which is the one placeholder the plumbing spreads into as
		// many as there are groups - <name> rather than :name, the form DatabaseHelper reads.
		assertTrue(database.sql.contains("<dp_user_groups>"), database.sql);
		assertEquals(List.of("sales", "billing"), database.params.get("dp_user_groups"),
				"each group bound, and not one text with a comma in it: " + database.params);

		// A person in no group is filtered to nothing, which is R1's empty list and not every row.
		runtime.query("sales-board", "cube12", ticketsAsked(Map.of()),
				asking("anna@example.com", "", "4711"));
		assertTrue(database.sql.contains("Team"), "The filter is still there: " + database.sql);
	}

	/**
	 * The page draws a chip for what the viewer picked, and there is nothing to pick here.
	 *
	 * <p>A fixed chip reading "Owner Email:" with no value beside it would say less than nothing.
	 * The filter is applied all the same - {@code /meta} says which of the dashboard's own
	 * parameters narrow this widget, and a reserved name is not one of them.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void metaSaysNothingAboutABindingNobodyAnswers() throws Exception {

		assertNull(runtime.meta("sales-board", "cube11").get("paramBindings"),
				"Nothing on the filter bar narrows this widget");

		List<Map<String, Object>> bindings =
				(List<Map<String, Object>>) runtime.meta("sales-board", "cube13").get("paramBindings");
		assertEquals(1, bindings.size(), "Only the one a viewer answers: " + bindings);
		assertEquals("region", bindings.get(0).get("param"));
		assertEquals("Status", bindings.get(0).get("member"));
	}

	/**
	 * R1: a card asks for the parameters it is about, and for no others.
	 *
	 * <p>A dashboard declares its parameters once, for the whole page, and the Cube Stories page
	 * is fifteen cards of fifteen cubes. Were {@code /meta} to hand every card the whole list,
	 * every one of them would draw a form asking which customer - on cards that have no customer
	 * in them. A card is about a name when its own cube's conditions use it, or when the page
	 * binds that name to one of its members.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void metaAsksOnlyForTheParametersThisCardIsAbout() throws Exception {

		// The card of a cube with no condition and no binding: the page declares three parameters
		// and this card asks for none of them, so it draws no form at all.
		assertNull(runtime.meta("sales-board", "cube1").get("parameters"),
				"This card has no question of its own to ask");

		// The card whose cube has the question in it.
		Map<String, Object> ofItsOwnCube = runtime.meta("sales-board", "cube14");
		assertEquals(List.of("componentId", "cubeId", "title", "description", "dimensions", "measures",
				"segments", "hierarchies", "parameters", "currency", "initial", "display", "viewStorage",
				"myView", "myViewDropped"), new ArrayList<>(ofItsOwnCube.keySet()),
				"and a card that does ask one is the whole of /meta, parameters included");
		assertEquals(List.of("customerId"), idsOf(ofItsOwnCube),
				"the name its condition uses, and none of the other three");

		// The card the page filters: the parameter is the viewer's to answer even though this cube
		// never mentions it, because the chip beside it says what it is filtered by.
		assertEquals(List.of("country"), idsOf(runtime.meta("sales-board", "cube7")),
				"what this card is bound by is what it asks for");
		assertEquals(List.of("minSales"), idsOf(runtime.meta("sales-board", "cube10")));

		// A binding the server answers is nobody's question: dp_user_email is not asked for, and
		// the parameter beside it still is.
		assertEquals(List.of("region"), idsOf(runtime.meta("sales-board", "cube13")),
				"a reserved name is not a question put to the viewer");
	}

	/** The ids of the parameters one card asks for, in the order the dashboard declares them. */
	@SuppressWarnings("unchecked")
	private static List<String> idsOf(Map<String, Object> meta) {
		List<String> ids = new ArrayList<>();
		for (ReportParameter parameter : (List<ReportParameter>) meta.getOrDefault("parameters", List.of()))
			ids.add(parameter.id);
		return ids;
	}

	/**
	 * Both kinds of binding on one widget, ANDed: the dashboard's filter bar narrows what the
	 * viewer may see, and never widens it.
	 */
	@Test
	void theServersOwnBindingIsAndedWithTheDashboardsAndNeverReplacedByIt() throws Exception {

		runtime.query("sales-board", "cube13", ticketsAsked(Map.of("region", "Open")),
				asking("anna@example.com", "sales", "4711"));

		assertTrue(database.sql.contains(":dp_user_email"),
				"The owner is still filtered: " + database.sql);
		assertTrue(database.sql.contains(":cf"), "and the viewer's status beside it: " + database.sql);
		assertTrue(database.params.values().toString().contains("Open"), database.params.toString());
		assertEquals("anna@example.com", database.params.get("dp_user_email"),
				database.params.toString());

		// All on the filter bar takes the status away and leaves the owner where it was: the one
		// thing the filter bar cannot do is show this viewer somebody else's rows.
		runtime.query("sales-board", "cube13", ticketsAsked(Map.of("region", "*")),
				asking("anna@example.com", "sales", "4711"));
		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertFalse(database.sql.contains(":cf"), "and nothing of the status: " + database.sql);
	}

	/**
	 * View SQL shows the statement the answer was read with, and a reserved name in it is a name
	 * and not a value: an author reading it sees the rule, and a viewer reading it learns nothing
	 * about anybody else.
	 */
	@Test
	void theSqlHandedBackNamesTheServersValueRatherThanHoldingIt() throws Exception {

		Map<String, Object> shown = runtime.sql("sales-board", "cube11", ticketsAsked(Map.of()));

		String sql = String.valueOf(shown.get("sql"));
		assertTrue(sql.contains("OwnerEmail"), "The owner is filtered on in it too: " + sql);
		assertFalse(sql.contains("@example.com"), "and nobody's address is in it: " + sql);
		// The export form beside it is the one a published dashboard would carry: the name
		// standing, for whoever runs it to bind - the same text `/data` gets.
		assertTrue(String.valueOf(shown.get("exportSql")).contains("${dp_user_email}"),
				"The published form names the server's value: " + shown.get("exportSql"));
	}

	/** A question of the tickets cube, with the dashboard's answers on it. */
	private static Map<String, Object> ticketsAsked(Map<String, Object> params) {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Status"));
		request.put("measures", List.of("Tickets"));
		request.put(DashboardParameters.REQUEST_KEY, params);
		return request;
	}

	// ════════════════════════════════════════════════════════════════════════════
	// W5 — my view
	// ════════════════════════════════════════════════════════════════════════════

	/**
	 * Where a viewer's own view lives is the server's answer, not the renderer's guess: a person has
	 * an account to keep it in, a share link has none and keeps it in its browser, and a widget whose
	 * author turned the whole thing off keeps none anywhere.
	 */
	@Test
	void whereAViewIsKeptIsSaidPerCaller() throws Exception {

		Map<String, Object> mine = runtime.meta("sales-board", "cube1", ANNA);
		assertEquals("account", mine.get("viewStorage"));
		assertNull(mine.get("myView"), "Nothing saved yet is nothing to send");
		assertEquals(List.of(), mine.get("myViewDropped"));

		assertEquals("browser", runtime.meta("sales-board", "cube1", CubeViewer.NOBODY).get("viewStorage"));
		assertEquals("none", runtime.meta("sales-board", "cube4", ANNA).get("viewStorage"));
	}

	/**
	 * Layer 2 over layer 1: what the viewer saved is what they get back, whole. The author's own
	 * opening selection is still in {@code initial} - the two layers are kept apart, so republishing
	 * the dashboard rewrites one of them and leaves the other alone.
	 */
	@Test
	void aSavedViewReplacesTheAuthorsOpeningSelectionAsAWhole() throws Exception {

		runtime.saveMyView("sales-board", "cube1", view(selection("CategoryName", "Revenue"), true), ANNA);

		Map<String, Object> meta = runtime.meta("sales-board", "cube1", ANNA);
		assertEquals(Map.of("dimensions", List.of("ShipCountry"), "measures", List.of("Revenue")),
				meta.get("initial"), "The author's default is untouched");

		Map<String, Object> myView = viewIn(meta);
		assertEquals(1, myView.get("v"));
		assertEquals(Boolean.TRUE, myView.get("collapsed"), "How the viewer left the panel");
		assertEquals(List.of("CategoryName"), selectionIn(myView).get("dimensions"));
		assertEquals(List.of(), meta.get("myViewDropped"));
	}

	/** One viewer's clicks are one viewer's: the next person opens the dashboard the author built. */
	@Test
	void oneViewersViewIsNeverAnotherViewers() throws Exception {

		runtime.saveMyView("sales-board", "cube1", view(selection("CategoryName", "Revenue"), true), ANNA);

		assertNull(runtime.meta("sales-board", "cube1", BORIS).get("myView"));
		assertNotNull(runtime.meta("sales-board", "cube1", ANNA).get("myView"));
	}

	/**
	 * A cube is edited after a view of it was saved. What the cube no longer offers is dropped and
	 * named - the renderer says one line about it - and the rest of the view still opens.
	 */
	@Test
	void aFieldTheCubeNoLongerOffersIsDroppedAndNamed() throws Exception {

		saveByHand("cube2", "{ \"v\": 1, \"selection\": { \"dimensions\": [\"CostPrice\"], "
				+ "\"measures\": [\"PartCount\"] }, \"collapsed\": false }");

		Map<String, Object> meta = runtime.meta("sales-board", "cube2", ANNA);

		assertEquals(List.of("CostPrice"), meta.get("myViewDropped"), "The hidden one is named");
		assertEquals(List.of(), selectionIn(viewIn(meta)).get("dimensions"));
		assertEquals(List.of("PartCount"), selectionIn(viewIn(meta)).get("measures"), "The rest still opens");
	}

	/** Nothing valid left in it is not a view: the author's own comes back, and says why. */
	@Test
	void aSavedViewWithNothingLeftInItFallsBackToTheAuthorsOwn() throws Exception {

		saveByHand("cube2", "{ \"v\": 1, \"selection\": { \"dimensions\": [\"CostPrice\"], "
				+ "\"measures\": [\"Margin\"] }, \"collapsed\": true }");

		Map<String, Object> meta = runtime.meta("sales-board", "cube2", ANNA);

		assertEquals(Map.of("measures", List.of("PartCount")), selectionIn(viewIn(meta)),
				"The author's opening selection");
		assertEquals(Boolean.TRUE, viewIn(meta).get("collapsed"), "A panel cannot stop existing");
		assertTrue(((List<?>) meta.get("myViewDropped")).containsAll(List.of("CostPrice", "Margin")),
				String.valueOf(meta.get("myViewDropped")));
	}

	/**
	 * A view is a question that will be asked again, so it is checked by the code that checks a
	 * question: a name this cube does not offer is refused now rather than every time it is opened.
	 */
	@Test
	void aViewIsCheckedExactlyAsAQuestionIs() {

		assertEquals(400, refusedView("cube1", view(selection("NoSuchField", "Revenue"), false)));
		assertEquals(400, refusedView("cube2", view(selection("CostPrice", "PartCount"), false)),
				"A hidden member is not on offer, even though its SQL is perfectly good");
		assertEquals(400, refusedView("cube1", Map.of("collapsed", true)), "A view without a selection");
	}

	/** And its limit is capped where a question's is, so a saved view cannot ask for more later. */
	@Test
	void aSavedViewsLimitIsCappedTheSameWay() throws Exception {

		Map<String, Object> selection = selection("CategoryName", "Revenue");
		selection.put("limit", 999_999);

		Map<String, Object> saved = runtime.saveMyView("sales-board", "cube1", view(selection, false), ANNA);

		assertEquals(CubeRuntimeService.MAX_LIMIT, selectionIn(saved).get("limit"));
	}

	/** One viewer cannot fill the store: a value this large is not a view of anything. */
	@Test
	void aViewTooLargeToBeAViewIsRefused() {

		List<String> manyValues = new ArrayList<>();
		for (int i = 0; i < 4000; i++)
			manyValues.add("a-country-with-a-long-name-" + i);

		Map<String, Object> selection = selection("ShipCountry", "Revenue");
		selection.put("filters", List.of(Map.of("member", "ShipCountry", "operator", "in", "values", manyValues)));

		assertEquals(413, refusedView("cube1", view(selection, false)));
	}

	/**
	 * The lock first, for all three: a component this dashboard does not declare has no view either,
	 * and neither has one whose author keeps no view for anybody.
	 */
	@Test
	void aLiveCubeThisDashboardDoesNotDeclareHasNoViewEither() {

		assertEquals(404, refusedBy(() -> runtime.myView("sales-board", "cube9", ANNA)));
		assertEquals(404, refusedBy(() -> runtime.myView("sales-board", "cube4", ANNA)));
		assertEquals(404, refusedBy(() -> runtime.saveMyView("sales-board", "cube4",
				view(selection("CategoryName", "Revenue"), false), ANNA)));
	}

	/**
	 * A caller with no account of their own is refused rather than given somebody's row: a share link
	 * names no person, and two people holding the same link are not two viewers this server can tell
	 * apart. Their view is their browser's. (A token request never reaches here at all: the three
	 * my-view paths are not the report-scoped ones the embed manager opens.)
	 */
	@Test
	void aViewerWithNoAccountIsRefusedRatherThanGivenSomebodyElses() {

		assertEquals(403, refusedBy(() -> runtime.myView("sales-board", "cube1", CubeViewer.NOBODY)));
		assertEquals(403, refusedBy(() -> runtime.saveMyView("sales-board", "cube1",
				view(selection("CategoryName", "Revenue"), false), CubeViewer.NOBODY)));
	}

	/** Reset view: the author's default is what this viewer gets again, now and in future. */
	@Test
	void resetViewLeavesTheAuthorsOwnBehind() throws Exception {

		runtime.saveMyView("sales-board", "cube1", view(selection("CategoryName", "Revenue"), true), ANNA);
		assertNotNull(runtime.meta("sales-board", "cube1", ANNA).get("myView"));

		runtime.deleteMyView("sales-board", "cube1", ANNA);

		assertNull(runtime.meta("sales-board", "cube1", ANNA).get("myView"));
		assertNull(runtime.myView("sales-board", "cube1", ANNA));
	}

	/** The one thing a saved view may never carry: anything that points at another cube or database. */
	@Test
	void aViewMayNotCarryACubeAConnectionOrAnySqlEither() {

		Map<String, Object> selection = selection("CategoryName", "Revenue");
		selection.put("connectionId", "somewhere-else");

		assertEquals(400, refusedView("cube1", view(selection, false)));
	}

	private static Map<String, Object> selection(String dimension, String measure) {

		Map<String, Object> selection = new LinkedHashMap<>();
		selection.put("dimensions", List.of(dimension));
		selection.put("measures", List.of(measure));
		return selection;
	}

	private static Map<String, Object> view(Map<String, Object> selection, boolean collapsed) {

		Map<String, Object> view = new LinkedHashMap<>();
		view.put("selection", selection);
		view.put("collapsed", collapsed);
		return view;
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> viewIn(Map<String, Object> meta) {
		return (Map<String, Object>) meta.get("myView");
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> selectionIn(Map<String, Object> view) {
		return (Map<String, Object>) view.get("selection");
	}

	/** A row written straight into the store: a view saved before the cube was edited. */
	private void saveByHand(String componentId, String json) {
		userSettings.upsert(ANNA.owner(), ANNA.tenantCode(),
				UserSettingsRepository.cubeViewKey("sales-board", componentId), json);
	}

	private int refusedView(String componentId, Map<String, Object> body) {
		return refusedBy(() -> runtime.saveMyView("sales-board", componentId, body, ANNA));
	}

	private static int refusedBy(org.junit.jupiter.api.function.Executable call) {
		return assertThrows(ResponseStatusException.class, call).getStatusCode().value();
	}

	private static Map<String, String> asking(String email, String groups, String customerId) {

		Map<String, String> values = new LinkedHashMap<>();
		values.put("dp_user_email", email);
		values.put("dp_user_groups", groups);
		values.put("dp_attr_customer_id", customerId);
		return values;
	}

	/** The status of the refusal this request earns on cube2, whose hidden members it names. */
	private int refusedBy(Map<String, Object> request) {
		return refusedBy("cube2", request);
	}

	private int refusedBy(String componentId, Map<String, Object> request) {
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("sales-board", componentId, request), request.toString());
		return refused.getStatusCode().value();
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// R8 — the dashboard's own filter, on a live cube
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The country manager picks Germany at the top of the dashboard, and the cube beside the KPIs
	 * is on Germany too.
	 *
	 * <p>What makes it so is the widget's own entry: the author said, once, that this dashboard's
	 * {@code country} narrows this cube's {@code ShipCountry}. The value the viewer answered is
	 * bound like every other value a viewer supplies - the statement carries a placeholder and
	 * the country is nowhere in it.
	 */
	@Test
	void theDashboardsOwnFilterNarrowsTheLiveCubeAndItsValueIsBound() throws Exception {

		runtime.query("sales-board", "cube7", asked(Map.of("country", "Germany")));

		assertTrue(database.sql.contains(":cf"), "The bound filter is a placeholder: " + database.sql);
		assertFalse(database.sql.contains("Germany"), "and never the country itself: " + database.sql);
		assertTrue(database.params.values().toString().contains("Germany"),
				"which is bound beside it: " + database.params);
		assertTrue(database.sql.contains("ShipCountry"), database.sql);
	}

	/**
	 * All is not a filter. The dashboard's wildcard means "every country", and the answer is the
	 * one the widget gives when nobody has picked anything at all - the same statement, not a
	 * statement that compares a column with a star.
	 */
	@Test
	void theWildcardIsEveryCountryAndAddsNoFilterAtAll() throws Exception {

		runtime.query("sales-board", "cube7", asked(Map.of("country", "*")));
		String withAll = database.sql;

		runtime.query("sales-board", "cube7", new LinkedHashMap<>(Map.of(
				"dimensions", List.of("ShipCountry"), "measures", List.of("Revenue"))));
		assertEquals(database.sql, withAll, "All asks what nothing picked asks");
		assertFalse(withAll.contains("*'"), withAll);
		assertFalse(database.params.values().toString().contains("*"), database.params.toString());

		// And an empty answer - a cleared box - is the same: no value, no filter.
		runtime.query("sales-board", "cube7", asked(Map.of("country", "")));
		assertEquals(withAll, database.sql, "A cleared filter filters nothing: " + database.sql);
	}

	/**
	 * A dashboard filter nothing on this widget is bound to changes nothing about it. One filter
	 * bar drives a page of widgets, and each one follows only what its author bound it to - which
	 * is what lets a dashboard hold a tile that is deliberately not narrowed.
	 */
	@Test
	void aParameterThisWidgetIsNotBoundToIsIgnored() throws Exception {

		runtime.query("sales-board", "cube7", asked(Map.of("region", "EMEA")));

		assertFalse(database.sql.contains(":cf"), "Nothing was bound into it: " + database.sql);
		assertFalse(database.params.values().toString().contains("EMEA"), database.params.toString());

		// And a widget with no bindings at all is untouched by a filter bar it never reads.
		runtime.query("sales-board", "cube1", asked(Map.of("country", "Germany")));
		assertFalse(database.params.values().toString().contains("Germany"),
				"An unbound widget stays on the whole world: " + database.params);
	}

	/**
	 * The binding is the author's, not the viewer's: one sent in the request body is dropped
	 * before the question is read.
	 *
	 * <p>It is the same rule as the cube id and the connection. A viewer who could send a binding
	 * could bind {@code dp_user_email} to any member they liked, and a share link's locked value
	 * would be one request away from meaning nothing.
	 */
	@Test
	void aBindingSentInTheRequestIsNotABinding() throws Exception {

		Map<String, Object> request = asked(Map.of("country", "Germany"));
		request.put("paramBindings", List.of(Map.of(
				"param", "country", "member", "ShipCity", "operator", "in")));

		runtime.query("sales-board", "cube7", request);

		assertTrue(database.sql.contains("ShipCountry"), database.sql);
		assertFalse(database.sql.contains("ShipCity"),
				"The request's own binding was never read: " + database.sql);
	}

	/**
	 * The viewer's own filter and the dashboard's are both true at once: Germany, and within it
	 * the category they ticked. A dashboard filter that replaced the viewer's ticks - or was
	 * replaced by them - would answer a question nobody asked.
	 */
	@Test
	void theViewersOwnFilterIsAndedWithTheDashboards() throws Exception {

		Map<String, Object> request = asked(Map.of("country", "Germany"));
		request.put("filters", List.of(Map.of("member", "ProductName", "operator", "equals",
				"values", List.of("Chai"))));

		runtime.query("sales-board", "cube7", request);

		assertTrue(database.params.values().toString().contains("Germany"), database.params.toString());
		assertTrue(database.params.values().toString().contains("Chai"), database.params.toString());
		assertTrue(occurrencesOf(database.sql, ":cf") >= 2,
				"Two bound values in the one statement: " + database.sql);
		assertTrue(database.sql.contains("ShipCountry") && database.sql.contains("ProductName"),
				"on the two members they narrow: " + database.sql);
	}

	/**
	 * A cube that only ever shows a person their own rows keeps doing so (AF2, the precedence
	 * table). The dashboard's filter is ANDed with the {@code access_filter}: it can only ever
	 * narrow what the viewer may see, never widen it, whatever the filter bar says.
	 */
	@Test
	void theBoundCountryIsAndedWithTheAccessFilterAndNeverInsteadOfIt() throws Exception {

		runtime.query("sales-board", "cube8", askedOf("OrderCount", Map.of("country", "Germany")),
				asking("anna@example.com", "sales", "4711"));

		assertTrue(database.sql.contains(":dp_user_email"),
				"The access filter is still in the statement: " + database.sql);
		assertEquals("anna@example.com", database.params.get("dp_user_email"), database.params.toString());
		assertTrue(database.params.values().toString().contains("Germany"), database.params.toString());
		assertTrue(database.sql.contains("ShipCountry"), database.sql);

		// The same widget, asked the same thing with nothing picked: the access filter is there
		// either way, so the dashboard's country took rows away and gave none back.
		String withGermany = database.sql;
		runtime.query("sales-board", "cube8", askedOf("OrderCount", Map.of("country", "*")),
				asking("anna@example.com", "sales", "4711"));
		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertTrue(withGermany.length() > database.sql.length(),
				"Germany is the unfiltered question with one condition more: " + withGermany);

		// Row 0 of that table: a viewer cannot name themselves in the filter bar either. The name
		// is not one the dashboard declares, so the request is refused - and nothing is read.
		database.sql = null;
		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("sales-board", "cube8", askedOf("OrderCount",
						Map.of("dp_user_id", "boss")), asking("anna@example.com", "sales", "4711")));
		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("dp_user_id"), refused.getReason());
		assertNull(database.sql, "Nothing was read for it: " + database.sql);
	}

	/**
	 * A binding on a measure is a HAVING, because that is what a measure filter is (owner,
	 * 2026-09-28): "only the countries that bought for at least this much" is a question about
	 * the total, not about a row.
	 */
	@Test
	void aBindingOnAMeasureIsAHavingAndAnEmptyOneIsNoFilter() throws Exception {

		runtime.query("sales-board", "cube10", asked(Map.of("minSales", "400000")));

		String having = database.sql.substring(database.sql.indexOf("HAVING"));
		assertTrue(database.sql.contains("HAVING"), "The floor is a HAVING: " + database.sql);
		assertTrue(having.contains(":cf"), "bound there: " + having);
		assertFalse(database.sql.substring(0, database.sql.indexOf("HAVING")).contains(":cf"),
				"and nowhere in the WHERE: " + database.sql);
		assertTrue(database.params.values().toString().contains("400000"), database.params.toString());

		// Nothing typed in the box is not a floor of zero: the question is the unfiltered one.
		runtime.query("sales-board", "cube10", asked(Map.of("minSales", "")));
		assertFalse(database.sql.contains("HAVING"), "No floor, no HAVING: " + database.sql);
	}

	/**
	 * A share link decides for the viewer (R4). The value locked into the link beats the one the
	 * dashboard's own filter bar carries, on the live cube exactly as on {@code /data} - which is
	 * why both read their locks in the same two lines of {@code ReportsController}.
	 */
	@Test
	void aLockedValueBeatsTheDashboardsOwn() throws Exception {

		MockHttpServletRequest locked = new MockHttpServletRequest();
		locked.setAttribute(LockedParams.REQUEST_ATTRIBUTE, Map.of("country", "Germany"));

		Map<String, Object> body = asked(Map.of("country", "France"));
		Map<String, Object> asItReachesTheCube = ReflectionTestUtils.invokeMethod(
				ReportsController.class, "withLockedParams", body, locked);

		runtime.query("sales-board", "cube7", asItReachesTheCube);

		assertTrue(database.params.values().toString().contains("Germany"),
				"The link's country is the one bound: " + database.params);
		assertFalse(database.params.values().toString().contains("France"),
				"and the viewer's own answer is not: " + database.params);
	}

	/**
	 * Story 25, the positive half of the chain: a link that answers the card's own question for
	 * the viewer. The signed answer is read off the request, written over the body's params by the
	 * controller, and bound - so the statement that runs is the one customer's, whatever the query
	 * string says. cube14's cube is story 25's shape: a condition on a customer the page declares.
	 */
	@Test
	void story25TheLinksCustomerIsTheOneBoundAndTheUrlsIsNot() throws Exception {

		MockHttpServletRequest linkedToSouthridge = new MockHttpServletRequest();
		linkedToSouthridge.setAttribute(LockedParams.REQUEST_ATTRIBUTE, Map.of("customerId", "26"));

		// The negative half in the same breath: the recipient edits the URL to another customer.
		Map<String, Object> body = askedOf("OrderCount", Map.of("customerId", "7"));
		Map<String, Object> asItReachesTheCube = ReflectionTestUtils.invokeMethod(
				ReportsController.class, "withLockedParams", body, linkedToSouthridge);

		runtime.query("sales-board", "cube14", asItReachesTheCube);

		assertTrue(database.sql.contains("CustomerID"),
				"The customer of the link is a condition of the statement: " + database.sql);
		assertTrue(database.params.values().contains(26L),
				"bound as the whole number the page declares: " + database.params);
		assertFalse(database.params.values().contains(7L),
				"and the customer written into the URL is not bound: " + database.params);
		assertFalse(database.sql.contains("26"),
				"never written into the statement: " + database.sql);
	}

	/**
	 * Story 25, the other negative half: the same card without a link. Nothing answers the
	 * question, the condition leaves the statement, and what comes back is every customer - which
	 * is exactly what a statement of all customers means, and not one customer's rows under
	 * another's name.
	 */
	@Test
	void story25WithoutALockTheStatementIsOfEveryCustomer() throws Exception {

		MockHttpServletRequest noLink = new MockHttpServletRequest();
		Map<String, Object> body = askedOf("OrderCount", Map.of("customerId", ""));
		Map<String, Object> asItReachesTheCube = ReflectionTestUtils.invokeMethod(
				ReportsController.class, "withLockedParams", body, noLink);

		runtime.query("sales-board", "cube14", asItReachesTheCube);

		assertFalse(database.sql.contains("CustomerID"),
				"No customer was asked for, so the condition is not in the statement: " + database.sql);
		assertTrue(database.params.values().isEmpty()
				|| !database.params.values().contains(26L),
				"and nothing of the earlier link is left bound: " + database.params);
	}

	/**
	 * Story 26, R3: the viewer explores the live cube on a published page - they tick a second
	 * dimension and add a filter of their own, and both reach the statement, bound. What they
	 * cannot do is widen it: the link's customer is still the one the condition binds, however
	 * many ticks and whatever query string arrive with the question.
	 */
	@Test
	void story26TheViewersOwnTicksNarrowAndNeverWidenWhatTheLinkFixed() throws Exception {

		MockHttpServletRequest linkedToSouthridge = new MockHttpServletRequest();
		linkedToSouthridge.setAttribute(LockedParams.REQUEST_ATTRIBUTE, Map.of("customerId", "26"));

		Map<String, Object> body = askedOf("OrderCount", Map.of("customerId", "7"));
		body.put("dimensions", List.of("CustomerId", "ShipCountry"));
		body.put("filters", List.of(Map.of("member", "ShipCountry", "operator", "equals", "values",
				List.of("Germany"))));
		Map<String, Object> asItReachesTheCube = ReflectionTestUtils.invokeMethod(
				ReportsController.class, "withLockedParams", body, linkedToSouthridge);

		runtime.query("sales-board", "cube14", asItReachesTheCube);

		assertTrue(database.params.values().contains("Germany"),
				"The filter the viewer ticked is bound: " + database.params);
		assertTrue(database.sql.contains("CustomerID"),
				"and the link's condition is in the statement beside it: " + database.sql);
		assertTrue(database.params.values().contains(26L),
				"bound to the customer the link fixed: " + database.params);
		assertFalse(database.params.values().contains(7L),
				"and never to the one the query string asked for: " + database.params);

		// The negative half, one tick further: the viewer tries to answer the card's own question
		// with a filter instead, on the very member the condition uses. It is ANDed in, like any
		// other filter of theirs - the condition is still there, and still bound to 26.
		Map<String, Object> tryingToWiden = askedOf("OrderCount", Map.of("customerId", "7"));
		tryingToWiden.put("filters", List.of(Map.of("member", "CustomerId", "operator", "equals",
				"values", List.of("7"))));
		runtime.query("sales-board", "cube14", ReflectionTestUtils.invokeMethod(
				ReportsController.class, "withLockedParams", tryingToWiden, linkedToSouthridge));

		assertTrue(database.params.values().contains(26L),
				"The link's customer is still bound: " + database.params);
		assertEquals(2, occurrencesOf(database.sql, "CustomerID"),
				"and their own filter narrows on top of it rather than replacing it: " + database.sql);
	}

	/**
	 * What the page needs to draw the fixed chip: which member each binding narrows, said by
	 * {@code /meta} rather than guessed from the answer.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void metaSaysWhichOfItsMembersTheDashboardsFilterNarrows() throws Exception {

		List<Map<String, Object>> bindings =
				(List<Map<String, Object>>) runtime.meta("sales-board", "cube7").get("paramBindings");

		assertEquals(1, bindings.size(), String.valueOf(bindings));
		assertEquals("country", bindings.get(0).get("param"));
		assertEquals("ShipCountry", bindings.get(0).get("member"));
		assertEquals("in", bindings.get(0).get("operator"));

		// A widget nothing is bound on says nothing, so the page draws no chip for it.
		assertNull(runtime.meta("sales-board", "cube1").get("paramBindings"));
	}

	/** The exported SQL a viewer may read carries the bound filter too, bound and not written in. */
	@Test
	void theSqlHandedBackCarriesTheBoundFilter() throws Exception {

		Map<String, Object> shown = runtime.sql("sales-board", "cube7", asked(Map.of("country", "Germany")));

		assertTrue(String.valueOf(shown.get("sql")).contains("ShipCountry"),
				"The dashboard's filter is in the statement a viewer may read: " + shown.get("sql"));
		assertTrue(String.valueOf(shown.get("sql")).contains("Germany"),
				"which is the one the answer was read with: " + shown.get("sql"));

		// It is the shown statement that carries the country, never the statement that ran: the
		// same question through /query binds it (the first test of this section).
		runtime.query("sales-board", "cube7", asked(Map.of("country", "Germany")));
		assertFalse(database.sql.contains("Germany"), database.sql);
	}

	/** A request with the dashboard's answers on it, in the one key they travel under. */
	private static Map<String, Object> asked(Map<String, Object> params) {
		return askedOf("Revenue", params);
	}

	/** The same, of a cube that answers about something else. */
	private static Map<String, Object> askedOf(String measure, Map<String, Object> params) {

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("ShipCountry"));
		request.put("measures", List.of(measure));
		request.put(DashboardParameters.REQUEST_KEY, params);
		return request;
	}

	private static int occurrencesOf(String text, String part) {
		int count = 0;
		for (int at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + 1))
			count++;
		return count;
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
		private final List<String> statements = new ArrayList<>();
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
			this.statements.add(sql);
			this.params = params;
			this.readAtMost = limit;
			return rows;
		}
	}
}

package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.flowkraft.common.AppPaths;
import com.flowkraft.exploredata.export.CanvasExportException;
import com.flowkraft.exploredata.export.CanvasExportService;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.UserSettingsRepository;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.flowkraft.reporting.dsl.cube.CubeRules;

/**
 * A cube's {@code condition} (R1): what the two forms become in the SQL, what the cube file is
 * told it got wrong, and what a viewer of a dashboard actually gets asked and answered.
 *
 * <p><b>One place for parameters</b> (owner, 2026-09-28). A cube declares none: the dashboard
 * declares them in its {@code {reportId}-report-parameters-spec.groovy}, and a cube only uses the
 * names. So this test has both halves of that pairing — a cube file with conditions, and a
 * dashboard that declares (or fails to declare) what they name — and the full chain below runs
 * against a stub database, exactly as {@code CubeRuntimeServiceTest} does, because what is being
 * proved is which statement was sent and which values were bound with it.
 *
 * <p>The numbers those statements come back with are proved where real databases are: story 21's
 * hints answer their checks on SQLite and DuckDB in {@code GeneratedSqlAllVendorsTest}.
 *
 * <p><b>ANSI SQL only.</b> Nothing here writes a vendor's SQL: the vendor forms it does assert
 * are asked of {@link CubeSqlDialect}, the one place they live.
 */
class CubeConditionTest {

	// ═══════════════════════════════════════════════════════════════════════════
	// The two forms, in the SQL
	// ═══════════════════════════════════════════════════════════════════════════

	/** A cube with one condition of each kind, over a plain table so the WHERE is readable. */
	private static CubeOptions conditionsCube() throws Exception {
		return CubeOptionsParser.parseGroovyCubeDslCode("""
				cube {
				  sql_table 'shop_order_lines'
				  title 'Shop'
				  dimension { name 'OrderDate'; sql '${CUBE}.order_date'; type 'time' }
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  // Raw, written over three lines the way a condition reads best.
				  condition '''
				      ${CUBE}.order_date
				          >= ${sinceDate}
				  '''
				  // Native, on a dimension and on a measure.
				  condition 'OrderDate', 'between', fromDate, toDate
				  condition 'NetSales', 'gte', minSales
				}
				""");
	}

	/**
	 * The raw form is the author's own SQL, on one line, in the WHERE; the native form is added to
	 * the query as the viewer's own filter on that member is, so a condition on a dimension is a
	 * WHERE and one on a measure is a HAVING. Every name is still a name: nobody has answered
	 * anything at generation time, which is what makes this text the export form.
	 */
	@Test
	void ansi_condition_theRawFormIsAWhereAndANativeOneKnowsWhatItsMemberIs() throws Exception {

		CubeOptions cube = conditionsCube();
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Category"));
		request.put("measures", List.of("NetSales"));

		String sql = CubeSqlGenerator.buildQuery(cube, request, "postgres").getSql();
		String where = between(sql, "WHERE", "GROUP BY");
		String having = between(sql, "HAVING", null);

		// Folded: the three lines of the cube file are one line here, because the empty-value rule
		// works line by line and a condition split over two lines could only be half dropped.
		assertTrue(where.contains("(shop_order_lines.order_date >= ${sinceDate})"),
				"The raw condition, on one line, in its own brackets:\n" + sql);
		assertFalse(sql.contains("${CUBE}"), "${CUBE} is the cube itself, and is expanded:\n" + sql);

		assertTrue(where.contains("shop_order_lines.order_date >= ${fromDate}")
				&& where.contains("shop_order_lines.order_date <= ${toDate}"),
				"The native range is a WHERE on both ends:\n" + sql);
		assertTrue(having.contains("${minSales}"), "The one on a measure is a HAVING:\n" + sql);
		assertFalse(where.contains("${minSales}"), "and only a HAVING:\n" + sql);

		// Nothing was bound: every value of every condition is still a name.
		assertEquals(Map.of(), CubeSqlGenerator.buildQuery(cube, request, "postgres").getParams(),
				"A condition's values are answered by the dashboard, not by the generator");
	}

	/** The names a cube's conditions use, which is what the dashboard is checked against. */
	@Test
	void ansi_condition_theNamesACubeUsesAreTheOnesItsConditionsWrite() throws Exception {

		CubeOptions cube = conditionsCube();

		assertEquals(List.of("sinceDate", "fromDate", "toDate", "minSales"),
				new ArrayList<>(CubeRules.parameterNames(cube)));

		List<CubeRules.ConditionUse> uses = CubeRules.parameterUses(cube);
		assertEquals(3, uses.size(), "One entry per condition that uses a name");
		assertEquals("${CUBE}.order_date >= ${sinceDate}", uses.get(0).written());
		assertEquals("condition 'OrderDate', 'between', fromDate, toDate", uses.get(1).written());
		assertEquals(Set.of("fromDate", "toDate"), uses.get(1).parameters());
	}

	/**
	 * A prior-period query asks the same question one interval earlier, and a native range knows
	 * that: it is a filter on a time dimension, so the earlier query's column is moved forward to
	 * meet it. A raw condition is text, and moves with nothing — which is the difference the DSL's
	 * own documentation of the key tells the author about.
	 */
	@Test
	void ansi_condition_aNativeRangeMovesWithATimeShiftAndARawConditionDoesNot() throws Exception {

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode("""
				cube {
				  sql_table 'shop_order_lines'
				  dimension { name 'OrderDate'; sql '${CUBE}.order_date'; type 'time' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  measure { name 'NetSalesLastYear'; type 'number'; sql '${NetSales}'; time_shift interval: '1 year' }
				  condition '${CUBE}.order_date >= ${sinceDate}'
				  condition 'OrderDate', 'between', fromDate, toDate
				}
				""");

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("OrderDate.month"));
		request.put("measures", List.of("NetSales", "NetSalesLastYear"));
		String sql = oneLine(CubeSqlGenerator.buildQuery(cube, request, "postgres").getSql());

		// The statement holds both queries: this year's and the earlier one's. What the interval
		// looks like is the dialect's to say; that it is there, and where, is this test's.
		String moved = CubeSqlDialect.addInterval("@", 1, "year", "postgres");
		String tail = moved.substring(moved.indexOf('@') + 1);
		assertEquals(1, occurrences(sql, tail + " >= ${fromDate}"),
				"The earlier query's own range is asked of the moved column, once:\n" + sql);
		assertEquals(2, occurrences(sql, ">= ${fromDate}"),
				"and both queries carry the range:\n" + sql);

		assertEquals(2, occurrences(sql, "shop_order_lines.order_date >= ${sinceDate}"),
				"The raw condition is the same text in both queries: it moves with nothing:\n" + sql);
		assertEquals(0, occurrences(sql, tail + " >= ${sinceDate}"),
				"and nothing moved it:\n" + sql);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What the cube file is told it got wrong
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Each of the mistakes a condition can hold, and the sentence the author reads. They are errors
	 * rather than warnings because what each one leaves behind is a condition that does not hold.
	 */
	@Test
	void ansi_condition_everyMistakeInTheCubeFileIsSaidInWords() throws Exception {

		assertEquals("the condition \"WHERE ${CUBE}.a = ${p}\" begins with WHERE. A condition is the "
				+ "condition itself: the generator writes the WHERE, and ANDs every condition into it.",
				onlyError("condition 'WHERE ${CUBE}.a = ${p}'"));

		assertTrue(onlyError("condition '${CUBE}.a = ${p} -- only the ones that matter'")
				.contains("holds a -- comment"), "A -- comment would comment out the rest of the WHERE");

		assertTrue(onlyError("condition '${CUBE}.a = ${p} GROUP BY 1'").contains("holds GROUP BY"),
				"A condition is one condition, not a query");

		assertTrue(onlyError("condition 'OrderDat', 'gte', fromDate")
				.contains("names 'OrderDat', which is not a dimension or a measure of this cube "
						+ "— did you mean 'OrderDate'?"),
				"An unknown member, with the member it was nearly");

		assertTrue(onlyError("condition 'OrderDate', 'greater_than', fromDate")
				.contains("asks for 'greater_than', which is not an operator"),
				"An operator is one of the query's own names");
		assertTrue(onlyError("condition 'OrderDate', 'greater_than', fromDate")
				.contains(String.join(", ", CubeRules.QUERY_OPERATORS)), "and the answer lists them");

		assertTrue(onlyError("condition 'OrderDate', 'between', fromDate")
				.contains("gives 1 value, and 'between' takes 2"), "A between takes both ends");

		assertTrue(onlyError("condition '${CUBE}.a = ${dp_user_emails}'")
				.contains("Names beginning with 'dp_' are the server's own, and there is no builtin "
						+ "of that name"),
				"A dp_ name that is not a builtin is a mistake, not a dashboard parameter");
	}

	/**
	 * The one refusal that is about the two kinds together, in each of the three forms an author
	 * writes it in — and, underneath, the rewrites the message offers, which are refused by
	 * nothing.
	 *
	 * <p>Why it is refused at all is in the message itself: the condition is dropped as a whole
	 * the moment the viewer clears the parameter, and the builtin half — which is usually what
	 * limits the rows to the person looking — goes with it.
	 */
	/**
	 * A hint presets a period as an R7 token ({@code {dataToday: startOf quarter}}), and
	 * {@link CubeHints} resolves it against the data's own today before the page ever sees it. If
	 * one ever reached the query unresolved, the token itself would be the filter's value - and a
	 * period nobody can read must be refused, not quietly dropped: an unfiltered cube answers
	 * every date it has and looks exactly like an answer.
	 */
	@Test
	void ansi_condition_aPeriodTokenNobodyResolvedIsRefusedRatherThanIgnored() throws Exception {

		CubeOptions cube = conditionsCube();
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Category"));
		request.put("measures", List.of("NetSales"));
		request.put("filters", List.of(Map.of("member", "OrderDate", "operator", "between",
				"values", List.of("{dataToday: startOf quarter}", "{dataToday: endOf quarter}"))));

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> CubeSqlGenerator.buildQuery(cube, request, "postgres"),
				"a token nobody resolved is not a day, and the whole quarter would be answered as all time");
		assertTrue(refused.getMessage().contains("OrderDate")
				&& refused.getMessage().contains("{dataToday: startOf quarter}")
				&& refused.getMessage().contains("a date"),
				"It says which filter, what it was given and what it takes: " + refused.getMessage());

		// Resolved, the same hint is an ordinary period: this is the one the vendor loop runs.
		Map<String, Object> resolved = new LinkedHashMap<>(request);
		resolved.put("filters", List.of(Map.of("member", "OrderDate", "operator", "between",
				"values", List.of("2026-07-01", "2026-09-30"))));
		String sql = CubeSqlGenerator.buildQuery(cube, resolved, "postgres").getSql();
		assertTrue(sql.contains("WHERE"), "and it filters:\n" + sql);
	}

	@Test
	void ansi_condition_aConditionNamingBothKindsIsRefusedInAllThreeForms() throws Exception {

		List<String> forms = List.of(
				"condition '${CUBE}.order_date >= ${fromDate} AND ${CUBE}.rep_email = ${dp_user_email}'",
				"condition '${CUBE}.order_date >= ${fromDate} OR ${CUBE}.rep_email = ${dp_user_email}'",
				"condition 'OrderDate', 'between', fromDate, dp_today");

		for (String form : forms) {
			String message = onlyError(form);
			assertTrue(message.contains("uses the dashboard parameter fromDate and the builtin dp_"),
					form + " ->\n" + message);
			assertTrue(message.contains("A condition may use dashboard parameters or builtins, but not "
					+ "both."), form + " ->\n" + message);
			// The four ways out, each one a whole sentence the author can act on.
			assertTrue(message.contains("Why this is not allowed:"), form + " ->\n" + message);
			for (String way : List.of("1.", "2.", "3.", "4."))
				assertTrue(message.contains("\n" + way + " "), form + " has no way " + way + ":\n" + message);
			assertTrue(message.contains("access_filter"), form + " ->\n" + message);
		}

		// And the rewrites the message offers pass: two conditions instead of one, and a second
		// dashboard parameter instead of the builtin.
		assertEquals(List.of(), errors("""
				condition '${CUBE}.order_date >= ${fromDate}'
				condition '${CUBE}.rep_email = ${dp_user_email}'
				"""));
		assertEquals(List.of(), errors("condition 'OrderDate', 'between', fromDate, toDate"));
	}

	/**
	 * A condition naming nothing at all is a condition on every row the cube ever answers — which
	 * is what an access_filter or a segment is for. A warning, not an error: it works.
	 */
	@Test
	void ansi_condition_oneThatNamesNothingIsWhatASegmentIsFor() throws Exception {

		List<Map<String, Object>> warnings = warningsOf("condition '${CUBE}.order_date IS NOT NULL'");

		assertEquals(1, warnings.size(), warnings.toString());
		assertEquals("warning", warnings.get(0).get("level"));
		assertTrue(Objects.toString(warnings.get(0).get("message"), "")
				.contains("A condition like that is an access_filter or a segment."));
	}

	/**
	 * The operators a filter may ask for are one list, and the page's own names for them map onto
	 * it in one place. Read from the AI Hub's TypeScript, so that adding an operator on one side
	 * and not the other fails here rather than in a browser.
	 */
	@Test
	void ansi_condition_theOperatorsAreTheSameListOnBothSides() throws Exception {

		Path operators = Path.of("../../asbl/src/main/external-resources/db-template/_apps/flowkraft/"
				+ "_ai-hub/ui-startpage/lib/explore-data/filter-operators.ts");
		assertTrue(Files.exists(operators), "The page's operator names live at " + operators);

		String mapping = between(Files.readString(operators), "CUBE_QUERY_OPERATORS", "};");
		Set<String> queryNames = new LinkedHashSet<>();
		Matcher pair = Pattern.compile("\"([a-zA-Z]+)\"").matcher(mapping);
		while (pair.find())
			queryNames.add(pair.group(1));

		assertEquals(new LinkedHashSet<>(CubeRules.QUERY_OPERATORS), queryNames,
				"Every operator the page can send is one the cube's own list knows, and the other "
						+ "way round");
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The full chain: a dashboard, its parameters, and the statement that ran
	// ═══════════════════════════════════════════════════════════════════════════

	@TempDir
	Path dir;

	private String portableDirBefore;
	private String appPathBefore;
	private CubeRuntimeService runtime;
	private CubesService cubesService;
	private StubDatabase database;
	private IamDatabase iamDatabase;

	/** The day the data calls today, pinned, so an R7 default is the quarter the checks are of. */
	private static final LocalDate PINNED_TODAY = LocalDate.of(2026, 9, 30);

	@BeforeEach
	void aDashboardThatDeclaresWhatItsCubeUses() throws Exception {

		portableDirBefore = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", dir.toString());
		appPathBefore = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = dir.toString();

		cube("shop-for-a-period", "Sales for a period", """
				cube {
				  sql_table 'shop_order_lines'
				  title 'Sales for a period'
				  dimension { name 'OrderDate'; sql '${CUBE}.order_date'; type 'time' }
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  dimension { name 'RepEmail'; sql '${CUBE}.rep_email'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  condition 'OrderDate', 'between', fromDate, toDate
				}
				""");

		cube("shop-raw-conditions", "Sales for a period, written out", """
				cube {
				  sql_table 'shop_order_lines'
				  title 'Sales for a period, written out'
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  condition '''
				      ${CUBE}.order_date >= ${fromDate}
				  '''
				  condition '${CUBE}.order_date <= ${toDate}'
				}
				""");

		cube("shop-of-mine", "My sales", """
				cube {
				  sql_table 'shop_order_lines'
				  title 'My sales'
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  condition '${CUBE}.rep_email = ${dp_user_email}'
				}
				""");

		// A cube that reads from a SELECT of its own instead of from a table (R1, 18a): the names
		// inside it are the dashboard's, exactly as a condition's are.
		cube("shop-from-a-select", "Sales read from a SELECT", """
				cube {
				  sql \'\'\'
				      SELECT order_date, category, net_amount, rep_email
				        FROM shop_order_lines
				       WHERE order_date >= ${fromDate}
				         AND rep_email <> ${dp_user_email}
				  \'\'\'
				  title 'Sales read from a SELECT'
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				}
				""");

		cube("shop-from-a-select-nobody-declares", "A SELECT of a name nobody declares", """
				cube {
				  sql 'SELECT * FROM shop_order_lines WHERE order_date >= ${sinceDate}'
				  title 'A SELECT of a name nobody declares'
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				}
				""");

		cube("shop-with-a-name-nobody-declares", "Sales by a name nobody declares", """
				cube {
				  sql_table 'shop_order_lines'
				  title 'Sales by a name nobody declares'
				  dimension { name 'Category'; sql '${CUBE}.category'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				  condition '${CUBE}.order_date >= ${fromDat}'
				}
				""");

		// The dashboard declares the parameters, in the one place a dashboard declares them: its
		// own spec, in the reportParameters DSL, exactly as par-employee-hire-dates does. The
		// defaults are the data's current quarter, written relative to it (R7).
		write("config/reports/period-board/period-board-report-parameters-spec.groovy", """
				import java.time.LocalDate

				reportParameters {
				    parameter(
				        id:           'fromDate',
				        type:         LocalDate,
				        label:        'From',
				        defaultValue: '{dataToday: startOf quarter}'
				    ) {
				        constraints(max: toDate)
				        ui(control: 'date', format: 'yyyy-MM-dd')
				    }
				    parameter(
				        id:           'toDate',
				        type:         LocalDate,
				        label:        'To',
				        defaultValue: '{dataToday: endOf quarter}'
				    ) {
				        constraints(min: fromDate)
				        ui(control: 'date', format: 'yyyy-MM-dd')
				    }
				}
				""");

		write("config/reports/period-board/period-board-cube-widgets.json", """
				{
				  "cube1": {
				    "cubeId": "shop-for-a-period",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table",
				    "showSql": true
				  },
				  "cube2": {
				    "cubeId": "shop-raw-conditions",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table"
				  },
				  "cube3": {
				    "cubeId": "shop-of-mine",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table"
				  },
				  "cube4": {
				    "cubeId": "shop-with-a-name-nobody-declares",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table"
				  },
				  "cube5": {
				    "cubeId": "shop-from-a-select",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table",
				    "showSql": true
				  },
				  "cube6": {
				    "cubeId": "shop-from-a-select-nobody-declares",
				    "connectionId": "the-connection",
				    "initial": { "dimensions": ["Category"], "measures": ["NetSales"] },
				    "display": "table"
				  }
				}
				""");

		cubesService = new CubesService();
		LimitsSandbox sandbox = new LimitsSandbox(new LimitsService(null, null));
		ReflectionTestUtils.setField(cubesService, "limitsSandbox", sandbox);

		runtime = new CubeRuntimeService();
		ReflectionTestUtils.setField(runtime, "cubesService", cubesService);
		ReflectionTestUtils.setField(runtime, "cubeFilterOptions", new CubeFilterOptions());
		ReflectionTestUtils.setField(runtime, "limitsSandbox", sandbox);

		iamDatabase = new IamDatabase();
		iamDatabase.init();
		ReflectionTestUtils.setField(runtime, "userSettings", new UserSettingsRepository(iamDatabase));

		runtime.useDataToday(new CubeDataToday() {
			@Override
			public LocalDate of(String connectionId) {
				return PINNED_TODAY;
			}
		});

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

	/**
	 * The viewer's dates reach the database as dates, bound, and nothing of them is written into
	 * the statement: a date compared with a date is what an index and a timestamp column both
	 * need, and text that looks like a date is neither.
	 */
	@Test
	void aDashboardParameterIsBoundAsTheTypeTheDashboardDeclaredIt() throws Exception {

		runtime.query("period-board", "cube1", askingFor("2026-07-01", "2026-09-30"));

		assertFalse(database.sql.contains("${fromDate}"),
				"The name was bound, not left standing:\n" + database.sql);
		assertTrue(database.sql.contains(":fromDate") && database.sql.contains(":toDate"),
				"and it is a placeholder, never a literal:\n" + database.sql);
		assertEquals(LocalDate.of(2026, 7, 1), database.params.get("fromDate"),
				"A date parameter binds as a date: " + database.params);
		assertEquals(LocalDate.of(2026, 9, 30), database.params.get("toDate"), database.params.toString());
	}

	/**
	 * The dashboard's own defaults are the answer when the viewer has not touched the boxes, and a
	 * default written relative to the data's today is a day by the time it is bound (R7).
	 */
	@Test
	void whatTheViewerHasNotAnsweredIsTheDashboardsOwnDefault() throws Exception {

		runtime.query("period-board", "cube1", selection());

		assertEquals(LocalDate.of(2026, 7, 1), database.params.get("fromDate"), database.params.toString());
		assertEquals(LocalDate.of(2026, 9, 30), database.params.get("toDate"), database.params.toString());
	}

	/**
	 * A parameter left empty takes its own condition out of the WHERE and leaves the rest of the
	 * question standing — which is what a cleared date, and what All, mean. The raw form is the one
	 * that shows it: two conditions, and only the cleared one goes.
	 */
	@Test
	void aParameterWithNoValueDropsItsOwnConditionAndNothingElse() throws Exception {

		runtime.query("period-board", "cube2", askingFor("2026-07-01", ""));

		assertTrue(database.sql.contains(":fromDate"), "The answered one still asks:\n" + database.sql);
		assertFalse(database.sql.contains("toDate"),
				"and the cleared one is out of the statement altogether:\n" + database.sql);
		assertTrue(database.sql.contains("1=1"), "Its line is what is left of it:\n" + database.sql);

		runtime.query("period-board", "cube2", askingFor("", ""));
		assertFalse(database.sql.contains("fromDate") || database.sql.contains("toDate"),
				"Both cleared is the whole period:\n" + database.sql);
	}

	/**
	 * The two SQL forms, one under the other: what a person reads is every value a literal, and
	 * what Show In Dashboard would freeze keeps the names, to be bound at run time by the
	 * dashboard's own parameters.
	 */
	@Test
	void theSqlEndpointShowsThePreviewFormAndTheExportFormBothAtOnce() throws Exception {

		Map<String, Object> answer = runtime.sql("period-board", "cube1",
				askingFor("2026-07-01", "2026-09-30"));

		String preview = Objects.toString(answer.get("sql"), "");
		assertTrue(preview.contains("2026-07-01") && preview.contains("2026-09-30"),
				"The preview stands on its own, to be copied into a database tool:\n" + preview);
		assertFalse(preview.contains("${fromDate}"), preview);

		String export = Objects.toString(answer.get("exportSql"), "");
		assertTrue(export.contains("${fromDate}") && export.contains("${toDate}"),
				"The export form is bound at run time, by the dashboard:\n" + export);
	}

	/**
	 * A builtin is the server's own value and is never dropped: an empty one matches no row, which
	 * is the whole point of a condition written to limit the rows to the person looking.
	 */
	@Test
	void aBuiltinIsAlwaysBoundAndAnEmptyOneMatchesNoRow() throws Exception {

		runtime.query("period-board", "cube3", selection(), Map.of("dp_user_email", "anna@x.test"));

		assertTrue(database.sql.contains(":dp_user_email"), database.sql);
		assertEquals("anna@x.test", database.params.get("dp_user_email"), database.params.toString());

		runtime.query("period-board", "cube3", selection(), Map.of());

		assertTrue(database.sql.contains(":dp_user_email"),
				"An empty builtin is still asked about:\n" + database.sql);
		assertEquals("", database.params.get("dp_user_email"), database.params.toString());
	}

	/**
	 * A day that cannot be after the day it must be after is a question with no answer, and the
	 * viewer is told so by name — before any SQL exists, so the refusal arrives with no statement
	 * attached and nothing has been asked of the database.
	 */
	@Test
	void aRangeTheWrongWayRoundIsRefusedByNameAndNoSqlIsWritten() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("period-board", "cube1", askingFor("2026-09-30", "2026-07-01")));

		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("toDate") && refused.getReason().contains("2026-09-30"),
				refused.getReason());
		assertNull(database.sql, "Nothing was sent: " + database.sql);
	}

	/**
	 * A name the dashboard does not declare is a mistake, not an empty value: left alone it would
	 * drop its whole condition and quietly show the viewer more rows than the cube's author wrote
	 * it to show. Both directions are refused — a cube naming what the dashboard has not got, and
	 * a request naming what it does not declare either.
	 */
	@Test
	void aNameTheDashboardDoesNotDeclareIsRefusedRatherThanLeftEmpty() {

		ResponseStatusException undeclared = assertThrows(ResponseStatusException.class,
				() -> runtime.query("period-board", "cube4", selection()));

		assertEquals(400, undeclared.getStatusCode().value());
		assertTrue(undeclared.getReason().contains("uses 'fromDat'"), undeclared.getReason());
		assertTrue(undeclared.getReason().contains("It declares: fromDate, toDate."),
				undeclared.getReason());
		assertNull(database.sql, "Nothing was sent: " + database.sql);

		Map<String, Object> request = selection();
		request.put(DashboardParameters.REQUEST_KEY, Map.of("whenever", "2026-07-01"));
		ResponseStatusException unknown = assertThrows(ResponseStatusException.class,
				() -> runtime.query("period-board", "cube1", request));
		assertEquals(400, unknown.getStatusCode().value());
		assertTrue(unknown.getReason().contains("no parameter 'whenever'"), unknown.getReason());
	}

	/**
	 * The same pairing, checked where the dashboard is made rather than where it is opened.
	 *
	 * <p>Publishing is the moment the author can still fix it: the canvas holds the names it is
	 * about to write into the spec, and the widget says which cube goes live. Both sides call
	 * {@link DashboardParameters#mustDeclare}, so the sentence the author reads is the same one -
	 * and that is the point of asserting it twice rather than trusting one call site.
	 */
	@Test
	void aNameTheDashboardDoesNotDeclareIsRefusedAtPublishTimeToo() {

		CanvasExportService export = new CanvasExportService();
		ReflectionTestUtils.setField(export, "cubesService", cubesService);

		List<Map<String, Object>> declared = List.of(Map.of("id", "fromDate"), Map.of("id", "toDate"));

		Exception refused = assertThrows(IllegalArgumentException.class,
				() -> ReflectionTestUtils.invokeMethod(export, "assertCubeConditionsAreDeclared",
						List.of(liveWidget("shop-with-a-name-nobody-declares")), declared, "period-board"),
				"a dashboard that cannot answer its own cube is never written");
		assertTrue(refused.getMessage().contains("uses 'fromDat'")
				&& refused.getMessage().contains("It declares: fromDate, toDate."),
				refused.getMessage());

		// And the cube whose names it does declare publishes, as it must.
		ReflectionTestUtils.invokeMethod(export, "assertCubeConditionsAreDeclared",
				List.of(liveWidget("shop-for-a-period")), declared, "period-board");
	}

	/**
	 * A cube may read from a SELECT of its own rather than from a table, and a {@code ${name}} in
	 * that SELECT is bound by the same binder, under the same rules, as one in a condition (R1,
	 * 18a): the generator inlines the source SQL as the cube's FROM, so the name travels into the
	 * statement and stops where every other one does.
	 */
	@Test
	void aNameInTheCubesOwnSelectIsBoundLikeAnyOther() throws Exception {

		runtime.query("period-board", "cube5", askingFor("2026-07-01", "2026-09-30"),
				Map.of("dp_user_email", "anna@x.test"));

		assertFalse(database.sql.contains("${fromDate}") || database.sql.contains("${dp_user_email}"),
				"Both names were bound, neither was left standing:\n" + database.sql);
		assertTrue(database.sql.contains(":fromDate") && database.sql.contains(":dp_user_email"),
				"and each is a placeholder, inside the cube's own SELECT:\n" + database.sql);
		assertEquals(LocalDate.of(2026, 7, 1), database.params.get("fromDate"),
				"A date binds as a date wherever it is used: " + database.params);
		assertEquals("anna@x.test", database.params.get("dp_user_email"), database.params.toString());

		// And the export form keeps them, so a published dashboard binds them at run time.
		Map<String, Object> shown = runtime.sql("period-board", "cube5",
				askingFor("2026-07-01", "2026-09-30"));
		assertTrue(Objects.toString(shown.get("exportSql"), "").contains("${fromDate}"),
				Objects.toString(shown.get("exportSql"), ""));
		assertFalse(Objects.toString(shown.get("sql"), "").contains("${fromDate}"),
				Objects.toString(shown.get("sql"), ""));
	}

	/**
	 * The one place the empty-value rule does not apply (R1, 18a). Everywhere else no value means
	 * no filter and the condition goes; a line of the cube's own SELECT cannot go without changing
	 * what the cube reads, so the viewer is told which answer is missing.
	 */
	@Test
	void aNameInTheCubesOwnSelectWithNoValueIsRefusedRatherThanDropped() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("period-board", "cube5", askingFor("", "")));

		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("'fromDate' has no value"), refused.getReason());
		assertTrue(refused.getReason().contains("cannot be taken out"), refused.getReason());
		assertNull(database.sql, "Nothing was sent: " + database.sql);
	}

	/** And a name in that SELECT that the dashboard does not declare is refused as any other is. */
	@Test
	void aNameInTheCubesOwnSelectMustBeDeclaredToo() {

		ResponseStatusException refused = assertThrows(ResponseStatusException.class,
				() -> runtime.query("period-board", "cube6", selection()));

		assertEquals(400, refused.getStatusCode().value());
		assertTrue(refused.getReason().contains("the source SQL"), refused.getReason());
		assertTrue(refused.getReason().contains("uses 'sinceDate'"), refused.getReason());
		assertNull(database.sql, "Nothing was sent: " + database.sql);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// R8 — what a binding may say, refused where the author can still fix it
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * A binding to a member the cube does not offer is refused when the dashboard is published.
	 *
	 * <p>It is the one mistake the author cannot see by looking at the page: a binding that named
	 * nothing would simply not filter, and the dashboard would open with a filter bar that moves
	 * every tile but this one.
	 */
	@Test
	void aBindingToAMemberTheCubeDoesNotHaveIsRefusedAtPublishTime() {

		CanvasExportException refused = assertThrows(CanvasExportException.class,
				() -> publish(boundWidget("shop-for-a-period", "country", "ShipCountry", "in")));

		assertTrue(refused.getMessage().contains("'ShipCountry'"), refused.getMessage());
		assertTrue(refused.getMessage().contains("Category"),
				"and the author is told what the cube does offer: " + refused.getMessage());

		// The same binding on a member it has publishes, which is what makes the refusal a rule
		// about this binding rather than about bindings.
		publish(boundWidget("shop-for-a-period", "country", "Category", "in"));
	}

	/** A binding to a name the dashboard does not declare is refused for the same reason. */
	@Test
	void aBindingToANameTheDashboardDoesNotDeclareIsRefusedAtPublishTime() {

		CanvasExportException refused = assertThrows(CanvasExportException.class,
				() -> publish(boundWidget("shop-for-a-period", "countr", "Category", "in")));

		assertTrue(refused.getMessage().contains("'countr'"), refused.getMessage());
		assertTrue(refused.getMessage().contains("country"), refused.getMessage());
	}

	/**
	 * A comparison the member's type does not allow is refused: {@code >} on a category is not a
	 * question, and PostgreSQL refuses it outright. A measure takes all nine, because a measure is
	 * a number whatever its own {@code sum} or {@code count} says.
	 */
	@Test
	void aComparisonTheMembersTypeForbidsIsRefusedAndAMeasureTakesThemAll() {

		CanvasExportException refused = assertThrows(CanvasExportException.class,
				() -> publish(boundWidget("shop-for-a-period", "country", "Category", "greater_than")));
		assertTrue(refused.getMessage().contains("'greater_than' on 'Category'"), refused.getMessage());
		assertTrue(refused.getMessage().contains("It may be compared with: equals, notEquals, in, notIn."),
				"and the author is told which comparisons text takes: " + refused.getMessage());

		// The same comparison on the money is a floor under a total - the one binding that is a
		// HAVING - and it publishes.
		publish(boundWidget("shop-for-a-period", "minSales", "NetSales", "greater_than"));
		publish(boundWidget("shop-for-a-period", "minSales", "NetSales", "greater_or_equal"));

		// A date is ordered, so it takes the comparisons; it is not a list anybody types out.
		publish(boundWidget("shop-for-a-period", "fromDate", "OrderDate", "greater_or_equal"));
		assertThrows(CanvasExportException.class,
				() -> publish(boundWidget("shop-for-a-period", "country", "OrderDate", "in")),
				"a day is not one of a list of days");
	}

	/** {@code between} binds one parameter per end, so an entry with one end is not a binding. */
	@Test
	void aBetweenBindingWithoutItsOtherEndIsRefused() {

		CanvasExportException refused = assertThrows(CanvasExportException.class,
				() -> publish(boundWidget("shop-for-a-period", "fromDate", "OrderDate", "between")));
		assertTrue(refused.getMessage().contains("other end"), refused.getMessage());

		Map<String, Object> bothEnds = boundWidget("shop-for-a-period", "fromDate", "OrderDate", "between");
		binding(bothEnds).put("paramTo", "toDate");
		publish(bothEnds);
	}

	/**
	 * The two halves of the operator mapping are one list: the page's {@code CUBE_QUERY_OPERATORS}
	 * and the server's {@code CubeParamBindings.QUERY_OPERATORS}, pair for pair.
	 *
	 * <p>{@code ansi_condition_theOperatorsAreTheSameListOnBothSides} above compares the names a
	 * cube query knows. This compares what each chip name is mapped to, which is the half that
	 * matters for a binding: an entry is written by the page and read by the server months later,
	 * and a single pair drifting - {@code greater_than} mapped to {@code gte} on one side - turns
	 * a dashboard's "more than" into "at least" with nothing anywhere to show for it.
	 */
	@Test
	void everyChipOperatorMeansTheSameThingOnBothSides() throws Exception {

		String text = Files.readString(Path.of("../../asbl/src/main/external-resources/db-template/"
				+ "_apps/flowkraft/_ai-hub/ui-startpage/lib/explore-data/filter-operators.ts"));

		Map<String, String> onThePage = new LinkedHashMap<>();
		Matcher pair = Pattern.compile("([a-z_]+): \"([a-zA-Z]+)\",")
				.matcher(between(text, "CUBE_QUERY_OPERATORS", "};"));
		while (pair.find())
			onThePage.put(pair.group(1), pair.group(2));

		assertEquals(CubeParamBindings.QUERY_OPERATORS, onThePage,
				"Each chip operator means the same cube operator on both sides");

		// And the nine a value can be bound to are the same nine.
		List<String> bindableOnThePage = new ArrayList<>();
		Matcher named = Pattern.compile("\"([a-z_]+)\"")
				.matcher(between(text, "PARAM_BINDABLE_OPS", "]);"));
		while (named.find())
			bindableOnThePage.add(named.group(1));

		assertEquals(CubeParamBindings.BINDABLE, bindableOnThePage,
				"The operators a dashboard parameter can be bound to, on both sides");
		assertEquals(9, bindableOnThePage.size(), String.valueOf(bindableOnThePage));
		assertFalse(bindableOnThePage.contains("contains"),
				"A LIKE needs its own % around the value, which a bound parameter cannot carry");
		assertFalse(bindableOnThePage.contains("is_null"),
				"and nobody answers a filter bar with 'is null'");
	}

	/**
	 * The older link is still a link: a cube whose {@code condition} names the dashboard's
	 * parameter follows it with no binding at all (R1). A binding is for a cube that says nothing
	 * about the dashboard - it is not what makes a dashboard parameter reach a cube.
	 */
	@Test
	void theNameItselfIsStillTheLinkWhereACubeWritesIt() throws Exception {

		runtime.query("period-board", "cube1", askingFor("2026-07-01", "2026-09-30"));

		assertTrue(database.sql.contains(":fromDate") && database.sql.contains(":toDate"),
				"The condition's own names, bound: " + database.sql);
		assertEquals(LocalDate.of(2026, 7, 1), database.params.get("fromDate"), database.params.toString());
		assertNull(CubeWidgets.of("period-board", "cube1").paramBindings().stream().findAny()
				.orElse(null), "and this widget declares no binding at all");
	}

	/** The widget as the canvas hands it over, with one parameter binding on it. */
	private static Map<String, Object> boundWidget(String cubeId, String param, String member,
			String operator) {

		Map<String, Object> bound = new LinkedHashMap<>();
		bound.put("param", param);
		bound.put("member", member);
		bound.put("operator", operator);

		Map<String, Object> visualQuery = new LinkedHashMap<>();
		visualQuery.put("showInDashboard", Boolean.TRUE);
		visualQuery.put("cubeId", cubeId);
		visualQuery.put("cubeSelection", new LinkedHashMap<>(Map.of("paramBindings",
				new ArrayList<>(List.of(bound)))));

		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", "w-live");
		widget.put("type", "table");
		widget.put("dataSource", new LinkedHashMap<>(Map.of("visualQuery", visualQuery)));
		return widget;
	}

	/** That widget's one binding, to be given a second end. */
	@SuppressWarnings("unchecked")
	private static Map<String, Object> binding(Map<String, Object> widget) {
		Map<String, Object> visualQuery = (Map<String, Object>) ((Map<String, Object>) widget
				.get("dataSource")).get("visualQuery");
		Map<String, Object> selection = (Map<String, Object>) visualQuery.get("cubeSelection");
		return ((List<Map<String, Object>>) selection.get("paramBindings")).get(0);
	}

	/**
	 * What the exporter checks before it writes a dashboard: the one rule under test here, with a
	 * filter bar that declares a country, a floor and the two days.
	 */
	private void publish(Map<String, Object> widget) {

		CanvasExportService export = new CanvasExportService();
		ReflectionTestUtils.setField(export, "cubesService", cubesService);
		ReflectionTestUtils.invokeMethod(export, "assertCubeConditionsAreDeclared", List.of(widget),
				List.of(Map.of("id", "country"), Map.of("id", "minSales"), Map.of("id", "fromDate"),
						Map.of("id", "toDate")),
				"period-board");
	}

	/** A canvas widget with Show In Dashboard ticked: what makes a cube go live on a dashboard. */
	private static Map<String, Object> liveWidget(String cubeId) {
		return Map.of("type", "table", "dataSource",
				Map.of("visualQuery", Map.of("showInDashboard", Boolean.TRUE, "cubeId", cubeId)));
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** The selection every request below carries: what the viewer ticked. */
	private static Map<String, Object> selection() {
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Category"));
		request.put("measures", List.of("NetSales"));
		return request;
	}

	/** The same selection, with the viewer's answers, either of which may be empty. */
	private static Map<String, Object> askingFor(String fromDate, String toDate) {
		Map<String, Object> request = selection();
		request.put(DashboardParameters.REQUEST_KEY, Map.of("fromDate", fromDate, "toDate", toDate));
		return request;
	}

	/** The cube of the checks above, with these condition lines in it. */
	private static List<Map<String, Object>> warningsOf(String conditions) throws Exception {
		return CubeRules.warnings(CubeOptionsParser.parseGroovyCubeDslCode("""
				cube {
				  sql_table 'shop_order_lines'
				  dimension { name 'OrderDate'; sql '${CUBE}.order_date'; type 'time' }
				  dimension { name 'RepEmail'; sql '${CUBE}.rep_email'; type 'string' }
				  measure { name 'NetSales'; sql '${CUBE}.net_amount'; type 'sum' }
				""" + conditions + "\n}\n"));
	}

	/** Every error those conditions earn, in order. */
	private static List<String> errors(String conditions) throws Exception {
		List<String> errors = new ArrayList<>();
		for (Map<String, Object> warning : warningsOf(conditions)) {
			if ("error".equals(warning.get("level")))
				errors.add(Objects.toString(warning.get("message"), ""));
		}
		return errors;
	}

	/** The one error this condition earns — the checks above each make exactly one mistake. */
	private static String onlyError(String condition) throws Exception {
		List<String> errors = errors(condition);
		assertEquals(1, errors.size(), condition + " earned " + errors);
		return errors.get(0);
	}

	private static String oneLine(String sql) {
		return sql.replaceAll("\\s+", " ").trim();
	}

	/** The part of a statement between two words, for asserting on a WHERE without its GROUP BY. */
	private static String between(String text, String from, String to) {
		String one = oneLine(text);
		int start = one.indexOf(from);
		if (start < 0)
			return "";
		int end = to == null ? -1 : one.indexOf(to, start);
		return end < 0 ? one.substring(start) : one.substring(start, end);
	}

	private static int occurrences(String text, String part) {
		return text.split(Pattern.quote(part), -1).length - 1;
	}

	private void cube(String cubeId, String name, String dslCode) throws Exception {
		write("config/cubes/" + cubeId + "/cube.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<cube>\n"
				+ "    <name>" + name + "</name>\n    <description>A cube of a dashboard</description>\n"
				+ "    <connectionId>the-connection</connectionId>\n</cube>\n");
		write("config/cubes/" + cubeId + "/" + cubeId + "-cube-config.groovy", dslCode);
	}

	private void write(String relativePath, String content) throws Exception {
		Path path = dir.resolve(relativePath);
		Files.createDirectories(path.getParent());
		Files.writeString(path, content);
	}

	/** The database, as a notebook: what was sent, and what was bound with it. */
	private static final class StubDatabase implements CubeRuntimeService.Database {

		private String sql;
		private Map<String, Object> params;

		@Override
		public String vendorOf(String connectionId) {
			return "sqlite";
		}

		@Override
		public List<Map<String, Object>> read(String connectionId, String sql, Map<String, Object> params,
				int limit) {
			this.sql = sql;
			this.params = params;
			return List.of();
		}
	}
}

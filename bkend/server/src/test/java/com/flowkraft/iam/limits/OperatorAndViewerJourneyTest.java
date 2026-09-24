package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.ServerApplication;
import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The two roles below an author, each doing the one thing their screens are for: an operator
 * running a report, and a viewer opening a dashboard somebody granted them.
 *
 * <h2>The risk this answers</h2>
 * Neither role can be refused by the connection limits themselves — {@code limitsFor} answers for
 * them like it answers for anyone, and an operator entitled to the report is entitled to run it.
 * Their risk is the other axis, and it is a risk of <em>incompleteness</em> rather than of leakage:
 * a role annotation or a dashboard grant that holds on the first request of a screen and not on the
 * fourth. The symptom is not a refusal the person can read — it is a page that opens and then shows
 * an empty widget, a job that is accepted and then cannot be followed, half a dashboard. Nobody
 * files that as a security bug, so nothing ever fixes it.
 *
 * <h2>Why the viewer's doors are asserted together</h2>
 * {@code everyDoorOfAGrantedDashboardAnswersForTheViewer} walks all four requests one page load
 * makes and collects <em>every</em> failure before it fails, rather than stopping at the first.
 * That is deliberate: a test that stops at the first closed door reports "the config is refused"
 * when the truth is "the config, the data and the pivot are all refused", and the difference is the
 * difference between a typo and a missing design. The same set is then walked against a dashboard
 * nobody granted, where every one of them must refuse and none of them may say what it is refusing.
 *
 * <h2>What it drives</h2>
 * A real server on a random port, signed in over {@code POST /api/auth/login} with the cookie and
 * the CSRF header the Angular app carries — the same fixture {@link FullChainAuthorJourneyTest}
 * uses, and for the same reason: {@code @PreAuthorize}, the grant check and the translation of a
 * refusal into a status code exist only in a real filter chain.
 */
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OperatorAndViewerJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/operator-and-viewer-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** The connection the operator's own groups allow, and the one the dashboards read. */
	private static final String CONNECTION_A = "db-operations-sqlite";
	/** Somewhere else entirely: what the viewer's group limits them to, and never what they open. */
	private static final String CONNECTION_B = "db-elsewhere-sqlite";

	private static final String OPS_REPORT = "monthly-invoices";
	private static final String GRANTED_DASHBOARD = "sales-dashboard";
	private static final String UNGRANTED_DASHBOARD = "board-only-dashboard";

	private static final String TABLE = "Customers";
	private static final String QUERY = "SELECT CustomerID, CompanyName, Country FROM \"Customers\"";

	private static final String OPERATOR = "olga-operator";
	private static final String OPERATOR_NO_GROUP = "owen-no-group";
	private static final String VIEWER = "vera-viewer";
	private static final String PASSWORD = "journey-fixture-pw";

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static Path northwind;
	private static ReportsService installer;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());
			Files.createDirectories(root.resolve("config/reports"));
			Files.createDirectories(root.resolve("config/connections"));
			Files.createDirectories(root.resolve("config/samples"));
			Files.createDirectories(root.resolve("logs"));
			Files.createDirectories(root.resolve("db"));
			// The two folders the operator's housekeeping empties. They have to exist before the
			// request, or a 404 would be mistaken for "the operator may not do this".
			Files.createDirectories(root.resolve("quarantine"));
			Files.createDirectories(root.resolve("temp"));

			System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
			AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
			AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
			AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
			AppPaths.QUARANTINE_DIR_PATH = root.resolve("quarantine").toString();
			Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

			installer = new ReportsService();
			ReflectionTestUtils.setField(installer, "fileSystemService", new FileSystemService());

			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/burst/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/_defaults/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), root.resolve("config/_defaults/reporting.xml").toFile());

			northwind = NorthwindFixture.writableSqliteCopy(root.resolve("db/northwind.db"));

			writeConnection(CONNECTION_A);
			writeConnection(CONNECTION_B);

			writeReport(OPS_REPORT, CONNECTION_A, "ds.sqlquery");
			writeReport(GRANTED_DASHBOARD, CONNECTION_A, "ds.dashboard");
			writeReport(UNGRANTED_DASHBOARD, CONNECTION_A, "ds.dashboard");
		} catch (Exception installationFailed) {
			throw new ExceptionInInitializerError(installationFailed);
		}
	}

	@LocalServerPort
	private int port;

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private IamService iamService;

	@Autowired
	private LimitsService limitsService;

	@Autowired
	private DashboardGrants dashboardGrants;

	private Session operator;
	private Session operatorInNoGroup;
	private Session viewer;

	@BeforeEach
	void createTheThreeCallers() {

		createIfMissing(OPERATOR, Role.JOB_OPERATOR);
		createIfMissing(OPERATOR_NO_GROUP, Role.JOB_OPERATOR);
		createIfMissing(VIEWER, Role.DASHBOARD_VIEWER);

		// The operator this journey is about: in a group that limits, and limited to the very
		// connection the report they run reads. They are entitled to the report, so no step of their
		// day may refuse them — which is the whole assertion of the first test.
		UserGroup operations = limitsService.createGroup(Tenant.DEFAULT_CODE, "Operations " + System.nanoTime(),
				limitedTo(CONNECTION_A));
		limitsService.setUserGroups(OPERATOR, List.of(operations.id()));

		// The unchanged case, kept beside it on purpose: before groups existed every operator was
		// this one, and decision 1 must not have changed what they can do.
		limitsService.setUserGroups(OPERATOR_NO_GROUP, List.of());

		// The viewer's group grants one dashboard and limits its members to a connection that
		// dashboard does not read. That combination is the carve-out in one line: the grant is an
		// administrator's deliberate act, and it opens the dashboard whatever the connection limits
		// say. A viewer whose group happened to allow the connection would prove nothing.
		UserGroup boardroom = limitsService.createGroup(Tenant.DEFAULT_CODE, "Boardroom " + System.nanoTime(),
				limitedTo(CONNECTION_B));
		limitsService.setUserGroups(VIEWER, List.of(boardroom.id()));
		dashboardGrants.setGroupDashboards(boardroom.id(), List.of(GRANTED_DASHBOARD), null);

		operator = new Session(OPERATOR, PASSWORD);
		operatorInNoGroup = new Session(OPERATOR_NO_GROUP, PASSWORD);
		viewer = new Session(VIEWER, PASSWORD);
	}

	// ============================================================
	// the operator: no failure in the middle
	// ============================================================

	@Test
	void anOperatorWhoseGroupAllowsTheReportMeetsNoRefusalAnywhereInTheirDay() throws Exception {
		walkTheOperatorsDay(operator, "an operator in a group that allows the report's connection");
	}

	@Test
	void anOperatorInNoGroupAtAllDoesExactlyTheSameDay() throws Exception {
		walkTheOperatorsDay(operatorInNoGroup, "an operator in no group at all");
	}

	/**
	 * Everything the Processing screens ask for around one run, in the order they ask for it. Every
	 * step that carries content is asserted on the content — a job id, the report's own settings,
	 * the list of log files, real rows — because "not refused" is not the same as "worked".
	 */
	private void walkTheOperatorsDay(Session caller, String who) throws Exception {

		// 1 - the list the Processing screen opens on, and the report inside it.
		List<String> reports = listedReportIds(caller);
		assertTrue(reports.contains(OPS_REPORT), who + " must be offered the report they run: " + reports);

		JsonNode details = json(caller.get("/api/reports/" + OPS_REPORT));
		assertTrue(details.toString().contains(OPS_REPORT),
				who + " must be able to open the report's entry: " + details);

		JsonNode settings = json(caller.get("/api/reports/" + OPS_REPORT + "/settings"));
		assertEquals(OPS_REPORT, settings.path("settings").path("template").asText(),
				who + " must read the report's own settings, and get that report's: " + settings);

		// 2 - the job list before, the run, and the job itself afterwards.
		assertTrue(json(caller.get("/api/jobs")).isArray(), who + " must be able to list the jobs");

		ResponseEntity<String> submitted = caller.postJson("/api/jobs",
				Map.of("type", "generate", "reportId", OPS_REPORT));
		assertEquals(HttpStatus.ACCEPTED, submitted.getStatusCode(),
				who + " must be able to run the report they are entitled to: " + submitted.getBody());
		String jobId = json(submitted).path("jobId").asText(null);
		assertNotNull(jobId, "an accepted job comes back with an id: " + submitted.getBody());

		ResponseEntity<String> followed = caller.get("/api/jobs/" + jobId);
		assertSucceeded(followed, who + " following the job they just started");

		// 3 - the logs. The list of log files is the door the Processing screen opens before it
		// tails one; the tailer is the request that starts the stream. The stream itself
		// (GET /api/jobs/{id}/logs, text/event-stream) is left alone on purpose: reading it here
		// would hold this test open for as long as the server kept the stream alive, and what is
		// under test is the door, which the two requests below already ask for.
		assertTrue(json(caller.getAsTheClientDoes("/api/jobs/logs")).isArray(),
				who + " must be able to list the log files");
		assertSucceeded(caller.postJson("/api/jobs/logs/tailer",
				Map.of("fileName", "documentburster.log", "command", "start")),
				who + " starting the log tailer");

		// 4 - the report's own rows, which is what the operator looks at to see the run was real.
		JsonNode data = json(caller.get("/api/reports/" + OPS_REPORT + "/data"));
		assertEquals(countCustomers(), data.path("totalRows").asInt(),
				who + " must read the rows the report returned: " + data.path("totalRows").asInt());
		assertFalse(data.path("data").path(0).path("CompanyName").asText().isBlank(),
				"the rows carry real values, not empty cells: " + data.path("data").path(0));

		// 5 - the housekeeping the same screen offers: emptying quarantine, and emptying a temp
		// folder. Both are destructive and both are an operator's own business.
		assertSucceeded(caller.delete("/api/jobs/quarantine"), who + " clearing quarantine");
		assertSucceeded(caller.deleteAsTheClientDoes("/api/jobs/temp/" + jobId),
				who + " clearing a temp folder");
	}

	// ============================================================
	// the viewer: a whole dashboard, or none of it
	// ============================================================

	@Test
	void everyDoorOfAGrantedDashboardAnswersForTheViewer() throws Exception {

		List<String> closed = new ArrayList<>();

		// Door 1 - the page itself. It is HTML, and what makes it the dashboard rather than an
		// error page is the report-id it hands the web component.
		door(closed, "the dashboard page", () -> {
			ResponseEntity<String> page = viewer.get("/dashboard/" + GRANTED_DASHBOARD);
			assertEquals(HttpStatus.OK, page.getStatusCode(), String.valueOf(page.getBody()));
			assertTrue(page.getBody().contains("report-id=\"" + GRANTED_DASHBOARD + "\""),
					"the page served is this dashboard's page: " + page.getBody());
		});

		// Door 2 - the config every widget of that page reads first.
		door(closed, "the report config", () -> {
			JsonNode config = json(viewer.get("/api/reports/" + GRANTED_DASHBOARD + "/config"));
			assertEquals(GRANTED_DASHBOARD, config.path("reportCode").asText(),
					"the config that came back is this dashboard's: " + config);
		});

		// Door 3 - the data behind the widgets, on a connection this viewer's group does not allow:
		// the grant is what opens it.
		door(closed, "the report data", () -> {
			JsonNode data = json(viewer.get("/api/reports/" + GRANTED_DASHBOARD + "/data"));
			// CliJob.doFetchData turns a failed fetch into a 200 carrying a single ERROR_MESSAGE
			// row, so "it answered" is not enough to call this door open: the rows have to be the
			// dashboard's own rows. That is exactly the half-a-dashboard this TODO is about.
			assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
					"the data door answered with an error row, not with data: " + data.path("data").path(0));
			assertEquals(countCustomers(), data.path("totalRows").asInt(),
					"the dashboard's rows really came back: " + data.path("totalRows").asInt());
			assertFalse(data.path("data").path(0).path("CompanyName").asText().isBlank(),
					"the rows carry real values: " + data.path("data").path(0));
		});

		// Door 4 - the server-side pivot a pivot widget uses instead of aggregating in the browser.
		door(closed, "the server-side pivot of the report", () -> {
			JsonNode pivot = json(viewer.postJson("/api/analytics/pivot?reportId=" + GRANTED_DASHBOARD,
					pivotBody()));
			assertTrue(cellCount(pivot) > 0, "a pivot with no cells is not a pivot: " + pivot);
		});

		assertTrue(closed.isEmpty(),
				"a dashboard a viewer was granted must open completely, and " + closed.size()
						+ " of its doors did not:\n" + String.join("\n", closed));
	}

	@Test
	void theSameDoorsOnADashboardNobodyGrantedThemAllRefuseAndSayNothingAboutIt() throws Exception {

		String aCompanyInTheDatabase = firstCompanyName();

		List<String> leaked = new ArrayList<>();

		refusesAndSaysNothing(leaked, "the dashboard page",
				viewer.get("/dashboard/" + UNGRANTED_DASHBOARD), aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report config",
				viewer.get("/api/reports/" + UNGRANTED_DASHBOARD + "/config"), aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report data",
				viewer.get("/api/reports/" + UNGRANTED_DASHBOARD + "/data"), aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the server-side pivot of the report",
				viewer.postJson("/api/analytics/pivot?reportId=" + UNGRANTED_DASHBOARD, pivotBody()),
				aCompanyInTheDatabase);

		assertTrue(leaked.isEmpty(), "an ungranted dashboard must refuse at every door and leak nothing:\n"
				+ String.join("\n", leaked));

		// And the refusal is about this one dashboard, not about dashboards: the granted one still
		// opens in the same session, in the same test.
		assertEquals(HttpStatus.OK, viewer.get("/dashboard/" + GRANTED_DASHBOARD).getStatusCode(),
				"refusing one dashboard must not close the one they were granted");
	}

	// ============================================================
	// the journey's own vocabulary
	// ============================================================

	/** Runs one door and remembers how it failed, so that every closed door is reported at once. */
	private void door(List<String> closed, String what, Executable step) {
		try {
			step.execute();
		} catch (Throwable failed) {
			closed.add("  - " + what + ": " + failed.getMessage());
		}
	}

	/**
	 * A refused door, checked for the two failures that matter: it has to refuse with 403, and the
	 * refusal must not tell the caller anything about what it refused — not a row of the data, not
	 * the connection the dashboard reads, and not the template it would have rendered.
	 */
	private void refusesAndSaysNothing(List<String> leaked, String what, ResponseEntity<String> answer,
			String aCompanyInTheDatabase) {

		String body = answer.getBody() == null ? "" : answer.getBody();

		if (answer.getStatusCode() != HttpStatus.FORBIDDEN)
			leaked.add("  - " + what + " answered " + answer.getStatusCode() + " instead of 403: " + body);

		if (body.contains(aCompanyInTheDatabase))
			leaked.add("  - " + what + " refused, and handed back a row of the data anyway: " + body);

		if (body.contains(CONNECTION_A))
			leaked.add("  - " + what + " named the connection the dashboard reads: " + body);

		if (body.contains("rb-dashboard"))
			leaked.add("  - " + what + " served the dashboard page it was refusing: " + body);
	}

	/**
	 * Every step of a day that is supposed to work has to come back 2xx. "Not 403" is the weaker
	 * claim, and it passes on a 404 — which is exactly the failure in the middle of a job this TODO
	 * exists to catch.
	 */
	private void assertSucceeded(ResponseEntity<String> answer, String what) {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				what + " must answer, and answer properly: " + answer.getStatusCode() + " "
						+ answer.getBody());
	}

	private Map<String, Object> pivotBody() {
		return Map.of("connectionCode", CONNECTION_A, "tableName", TABLE, "rows", List.of("Country"),
				"vals", List.of("CustomerID"), "aggregatorName", "Count");
	}

	private int cellCount(JsonNode pivot) {
		JsonNode data = pivot.has("data") ? pivot.path("data") : pivot;
		if (data.isArray())
			return data.size();
		if (data.path("rows").isArray())
			return data.path("rows").size();
		return 0;
	}

	private List<String> listedReportIds(Session caller) throws Exception {
		List<String> ids = new ArrayList<>();
		json(caller.get("/api/reports")).forEach(entry -> ids.add(entry.path("folderName").asText()));
		ids.remove("burst");
		return ids;
	}

	private void createIfMissing(String username, Role role) {
		if (iamService.findUser(username).isEmpty())
			iamService.createUser(username, null, PASSWORD, role, Tenant.DEFAULT_CODE);
	}

	private LimitSettings limitedTo(String... connectionCodes) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionCodes));
		settings.setScripts(true);
		return settings;
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this step of the journey must not be refused: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	/** What the database really holds, counted by this test rather than by the code under test. */
	private int countCustomers() throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + northwind);
				Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery("SELECT count(*) FROM \"Customers\"")) {
			rs.next();
			return rs.getInt(1);
		}
	}

	/** A value that only somebody who read the data could know — the needle of the leak check. */
	private String firstCompanyName() throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + northwind);
				Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery(
						"SELECT \"CompanyName\" FROM \"Customers\" ORDER BY \"CustomerID\" LIMIT 1")) {
			rs.next();
			return rs.getString(1);
		}
	}

	// ============================================================
	// a browser session, as the Angular app holds one
	// ============================================================

	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = postJson("/api/auth/login",
					Map.of("username", username, "password", password));
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"the journey starts with a real sign-in as " + username + ": " + loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, null);
		}

		/**
		 * A GET that carries {@code Content-Type: application/json}. {@code LogsController} is
		 * mapped with a class-level {@code consumes = application/json} and no method-level
		 * override, so on Spring 6 a plain GET to {@code /api/jobs/logs} matches no handler and
		 * comes back 404. The renderer's own client always sends the header, and so does the
		 * REST e2e (<code>interface-client-rest.spec.ts</code>, "GET /api/jobs/logs returns array
		 * of FileInfo entries"), so this is the request the product really makes, not a workaround.
		 */
		private ResponseEntity<String> getAsTheClientDoes(String path) {
			return exchange(HttpMethod.GET, path, null, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> delete(String path) {
			return exchange(HttpMethod.DELETE, path, null, null);
		}

		/**
		 * A DELETE that carries the JSON content type. {@code JobsController} overrides the
		 * class-level {@code consumes} on most of its methods but not on {@code /temp/{folderName}},
		 * so that one needs the header the renderer's client always sends.
		 */
		private ResponseEntity<String> deleteAsTheClientDoes(String path) {
			return exchange(HttpMethod.DELETE, path, null, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> postJson(String path, Object body) {
			return exchange(HttpMethod.POST, path, body, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> exchange(HttpMethod method, String path, Object body, MediaType contentType) {

			HttpHeaders headers = new HttpHeaders();
			if (!cookies.isEmpty()) {
				List<String> pairs = new ArrayList<>();
				cookies.forEach((name, value) -> pairs.add(name + "=" + value));
				headers.add(HttpHeaders.COOKIE, String.join("; ", pairs));
			}
			if (cookies.containsKey("XSRF-TOKEN"))
				headers.add("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
			if (contentType != null)
				headers.setContentType(contentType);

			ResponseEntity<String> answer = rest.exchange("http://localhost:" + port + path, method,
					new HttpEntity<>(bodyOf(body), headers), String.class);

			remember(answer.getHeaders().get(HttpHeaders.SET_COOKIE));
			return answer;
		}

		private Object bodyOf(Object body) {
			if (body == null || body instanceof String)
				return body;
			try {
				return JSON.writeValueAsString(body);
			} catch (Exception notSerializable) {
				throw new IllegalStateException(notSerializable);
			}
		}

		private void remember(List<String> setCookies) {
			if (setCookies == null)
				return;
			for (String cookie : setCookies) {
				String pair = cookie.split(";", 2)[0];
				int equals = pair.indexOf('=');
				if (equals <= 0)
					continue;
				String name = pair.substring(0, equals).trim();
				String value = pair.substring(equals + 1).trim();
				if (value.isEmpty())
					cookies.remove(name);
				else
					cookies.put(name, value);
			}
		}
	}

	// ============================================================
	// the installation on disk
	// ============================================================

	private static void writeConnection(String code) throws Exception {

		ServerDatabaseSettings server = new ServerDatabaseSettings();
		server.type = "sqlite";
		server.driver = "org.sqlite.JDBC";
		server.database = northwind.toString();
		server.url = "jdbc:sqlite:" + northwind;
		server.userid = "";
		server.userpassword = "";

		ConnectionDatabaseSettings connection = new ConnectionDatabaseSettings();
		connection.code = code;
		connection.name = code;
		connection.databaseserver = server;

		DocumentBursterConnectionDatabaseSettings settings = new DocumentBursterConnectionDatabaseSettings();
		settings.connection = connection;

		installer.saveSettingsConnectionDatabase(settings,
				root.resolve("config/connections/" + code + "/" + code + ".xml").toString());
	}

	private static void writeReport(String reportId, String connectionCode, String datasourceType) throws Exception {

		Path reportDir = root.resolve("config/reports/" + reportId);
		Files.createDirectories(reportDir);

		String settingsPath = reportDir.resolve("settings.xml").toString();
		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), new File(settingsPath));
		FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), reportDir.resolve("reporting.xml").toFile());

		DocumentBursterSettings settings = installer.loadSettings(settingsPath);
		settings.settings.template = reportId;
		settings.settings.capabilities.reportdistribution = false;
		settings.settings.capabilities.reportgenerationmailmerge = true;
		installer.saveSettings(settings, settingsPath);

		ReportingSettings reporting = installer.loadSettingsReporting(settingsPath);
		reporting.report.datasource.type = datasourceType;
		reporting.report.datasource.sqloptions.conncode = connectionCode;
		reporting.report.datasource.sqloptions.query = QUERY;
		reporting.report.datasource.sqloptions.idcolumn = "CustomerID";

		// A published dashboard is not a query report with a different type: CanvasExportService
		// writes its connection under scriptoptions, a <reportId>-script.groovy beside the config
		// and an HTML template under templates/reports/. Everything the viewer's four doors ask —
		// the data fetch, which runs that script, and the server-side pivot, which reads the
		// connection code from scriptoptions - only answers for a dashboard written that way, so
		// the fixture writes one, rather than a query report wearing the dashboard's type.
		if ("ds.dashboard".equals(datasourceType)) {

			String scriptName = reportId + "-script.groovy";
			reporting.report.datasource.scriptoptions.conncode = connectionCode;
			reporting.report.datasource.scriptoptions.scriptname = scriptName;
			reporting.report.datasource.sqloptions.scriptname = scriptName;
			reporting.report.template.outputtype = "output.dashboard";
			reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId
					+ "-template.html";

			Files.writeString(reportDir.resolve(scriptName), String.join("\n",
					"import groovy.sql.Sql",
					"",
					"// One widget's worth of data, fetched the way a published dashboard's script does:",
					"// through ctx.dbSql, which ScriptedReporter opens on the connection named in",
					"// scriptoptions.conncode - the connection this viewer's own group does not allow.",
					"def dbSql = ctx.dbSql",
					"ctx.reportData('customers', dbSql.rows('" + QUERY.replace("\"", "\\\"") + "'))",
					""));

			Path templateDir = root.resolve("templates/reports/" + reportId);
			Files.createDirectories(templateDir);
			Files.writeString(templateDir.resolve(reportId + "-template.html"),
					"<div class=\"rb-dashboard-root\" data-report=\"" + reportId + "\"></div>\n");
		}

		installer.saveSettingsReporting(reporting, settingsPath);
	}
}

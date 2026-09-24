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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
 * One limited author, one working day: the whole authoring chain over real HTTP, on the connection
 * their group allows and on the one it does not.
 *
 * <h2>Why this one boots a server</h2>
 * Everything else in this package calls the controllers directly, which proves the rule but not the
 * door. {@code @PreAuthorize}, the CSRF token, the session cookie, the API-key filter and the
 * exception translation that turns a refusal into a status code exist only in a real filter chain,
 * and the most expensive bug this server has had — the one written down in {@code SecurityConfig}
 * above {@code shouldFilterAllDispatcherTypes(false)} — lived in exactly that gap. So this journey
 * signs in through {@code POST /api/auth/login} and carries the cookie and the {@code X-XSRF-TOKEN}
 * header exactly as the Angular app does, and reads status codes rather than exceptions.
 *
 * <h2>What "walked the chain" means here</h2>
 * Every allowed step asserts what actually came back, never merely that nothing was thrown: the
 * connection list really contains A and B and not C; the schema really names the table; run-sql
 * really returns rows; the chart DSL really parses into the chart it describes; the pivot really
 * returns cells; the saved datasource really reads back with connection A; the report really runs
 * and {@code /data} really returns every row the database holds. A step that answered 200 with an
 * empty body fails this test, because that is the shape a broken installation answers in.
 *
 * <h2>The installation</h2>
 * Built before the context starts — the server reads {@code PORTABLE_EXECUTABLE_DIR} while it boots
 * — and thrown away after. Three real connection files point at a real Northwind SQLite, and the
 * reports are written through the product's own writers, so what the checks read is what the engine
 * would open rather than what this test imagines a report looks like.
 */
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FullChainAuthorJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/full-chain-author-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** The two connections the author's group names. */
	private static final String CONNECTION_A = "db-sales-sqlite";
	private static final String CONNECTION_B = "db-marketing-sqlite";
	/** The third one: just as real, just as runnable — and not theirs. */
	private static final String CONNECTION_C = "db-payroll-sqlite";

	/** A report that already exists on A, for the day the group is narrowed to B. */
	private static final String REPORT_ON_A = "sales-orders";
	/** The same situation, published as a dashboard and granted: the carve-out. */
	private static final String DASHBOARD_ON_A = "sales-dashboard";
	/** The report the author creates while walking the chain. */
	private static final String NEW_REPORT = "journey-report";

	private static final String TABLE = "Customers";
	private static final String QUERY =
			"SELECT \"CustomerID\", \"CompanyName\", \"Country\" FROM \"Customers\"";

	private static final String AUTHOR = "ana-journey";
	/** A fixture account created by this test in its own throwaway installation. */
	private static final String AUTHOR_PASSWORD = "journey-fixture-pw";

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
			// The list door reads this folder before anything else: an install without it is not an
			// install, and every list assertion below would fail on the folder rather than on the rule.
			Files.createDirectories(root.resolve("config/samples"));
			Files.createDirectories(root.resolve("logs"));
			Files.createDirectories(root.resolve("db"));

			// Before anything of the server loads: AppPaths reads this property in its static block,
			// and the IAM store, the reports and the logs of the booted context all hang off it.
			System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
			AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
			AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
			AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
			Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

			installer = new ReportsService();
			ReflectionTestUtils.setField(installer, "fileSystemService", new FileSystemService());

			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
					root.resolve("config/burst/settings.xml").toFile());
			// What POST /api/reports copies a new report from — the same two files the installer lays
			// down, so the report the author creates below is the report the product would create.
			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
					root.resolve("config/_defaults/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_REPORTING_XML),
					root.resolve("config/_defaults/reporting.xml").toFile());

			northwind = NorthwindFixture.writableSqliteCopy(root.resolve("db/northwind.db"));

			writeConnection(CONNECTION_A);
			writeConnection(CONNECTION_B);
			writeConnection(CONNECTION_C);

			writeReport(REPORT_ON_A, CONNECTION_A, "ds.sqlquery");
			writeReport(DASHBOARD_ON_A, CONNECTION_A, "ds.dashboard");
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

	private UserGroup group;
	private Session author;

	@BeforeEach
	void signIn() {

		if (iamService.findUser(AUTHOR).isEmpty())
			iamService.createUser(AUTHOR, null, AUTHOR_PASSWORD, Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		// A fresh group each test: the narrowing test changes what this group allows, and a group
		// carried between tests would make the order they run in part of the result.
		group = limitsService.createGroup(Tenant.DEFAULT_CODE, "Journey " + System.nanoTime(),
				limitedTo(CONNECTION_A, CONNECTION_B));
		limitsService.setUserGroups(AUTHOR, List.of(group.id()));

		author = new Session(AUTHOR, AUTHOR_PASSWORD);
	}

	@AfterEach
	void removeWhatTheJourneyCreated() {
		FileUtils.deleteQuietly(root.resolve("config/reports/" + NEW_REPORT).toFile());
	}

	// ============================================================
	// the positive half
	// ============================================================

	@Test
	void theLimitedAuthorWalksTheWholeChainOnAnAllowedConnection() throws Exception {

		// 1 — the list they open the morning on.
		List<String> connections = connectionCodes();
		assertTrue(connections.contains(CONNECTION_A), connections.toString());
		assertTrue(connections.contains(CONNECTION_B), connections.toString());
		assertFalse(connections.contains(CONNECTION_C),
				"a connection they may not use must not be offered: " + connections);

		// 2 — the connection itself, its metadata and its schema.
		JsonNode connection = json(author.get("/api/connections/" + CONNECTION_A));
		assertEquals(CONNECTION_A, connection.path("connection").path("code").asText(),
				"the connection they picked really opened: " + connection);

		JsonNode metadata = json(author.get("/api/connections/" + CONNECTION_A + "/metadata/er-diagram"));
		assertTrue(metadata.has("exists"), "the metadata door answered with its own shape: " + metadata);

		JsonNode schema = json(author.get("/api/queries/schema/" + CONNECTION_A));
		assertTrue(tableNames(schema).contains(TABLE),
				"the schema really came from this database: " + tableNames(schema));

		// 3 — the four ways an author interrogates a database before writing a report.
		JsonNode rows = json(author.postJson("/api/queries/run-sql",
				Map.of("connectionId", CONNECTION_A, "sql", QUERY)));
		assertEquals(countCustomers(), rows.path("rowCount").asInt(),
				"run-sql returned every row the database holds: " + rows.path("rowCount").asInt());
		assertEquals("CompanyName", firstRowFieldName(rows, 1), "the rows carry the columns asked for");

		JsonNode chart = json(author.postJson("/api/dsl/chart/parse",
				Map.of("dslCode", CHART_DSL, "connectionCode", CONNECTION_A)));
		assertEquals("bar", chart.path("options").path("type").asText(),
				"the DSL parsed into the chart it describes: " + chart);

		JsonNode explored = json(author.postJson("/api/analytics/explore",
				Map.of("connectionCode", CONNECTION_A, "tableName", TABLE, "fields", List.of("Country"))));
		assertTrue(explored.toString().contains("Country"),
				"the explore answered about the field it was asked about: " + explored);

		JsonNode pivotOfATable = json(author.postJson("/api/analytics/pivot", pivotBody()));
		assertTrue(cellCount(pivotOfATable) > 0, "a pivot with no cells is not a pivot: " + pivotOfATable);

		// 4 — the report itself, pointed at the connection they are allowed to use.
		ResponseEntity<String> created = author.postJson("/api/reports",
				Map.of("reportId", NEW_REPORT, "templateName", NEW_REPORT,
						"capReportGenerationMailMerge", true));
		assertEquals(HttpStatus.CREATED, created.getStatusCode(), created.getBody());

		pointDatasourceAt(NEW_REPORT, CONNECTION_A);

		JsonNode readBack = json(author.get("/api/reports/" + NEW_REPORT + "/datasource"));
		assertEquals(CONNECTION_A,
				readBack.path("report").path("datasource").path("sqloptions").path("conncode").asText(),
				"the datasource really saved, and really carries connection A: " + readBack);

		// 5 — its template.
		ResponseEntity<String> template = author.putText("/api/reports/" + NEW_REPORT + "/template/html",
				"<html><body>${CustomerID}</body></html>");
		assertTrue(template.getStatusCode().is2xxSuccessful(), "saving the template: " + template);

		// 5b - the script inside the report, and the ad-hoc script an author runs while writing it.
		// Both are server code on their own connection, which a group that allows scripts allows.
		ResponseEntity<String> script = author.putText(
				"/api/reports/" + NEW_REPORT + "/script/datasourceScript",
				"return []");
		assertTrue(script.getStatusCode().is2xxSuccessful(), "saving the script: " + script);

		JsonNode ranScript = json(author.postJson("/api/queries/run-script",
				Map.of("connectionId", CONNECTION_A, "script", "return [[one: 1]]")));
		assertEquals(1, ranScript.path("rowCount").asInt(),
				"the script really ran on their own connection, and returned its row: " + ranScript);

		// 6 — running it, reading its data, and pivoting what it returned.
		ResponseEntity<String> submitted = author.postJson("/api/jobs",
				Map.of("type", "generate", "reportId", NEW_REPORT));
		assertEquals(HttpStatus.ACCEPTED, submitted.getStatusCode(), submitted.getBody());
		assertNotNull(json(submitted).path("jobId").asText(null), "an accepted job comes back with an id");

		JsonNode data = json(author.get("/api/reports/" + NEW_REPORT + "/data"));
		assertEquals(countCustomers(), data.path("totalRows").asInt(),
				"the report really ran, and every row came back: " + data.path("totalRows").asInt());
		assertEquals(List.of("CustomerID", "CompanyName", "Country"),
				JSON.convertValue(data.path("reportColumnNames"), List.class),
				"the columns the report asked the database for are the columns that came back");
		assertTrue(data.path("data").size() > 0, "a data door that answers with no rows: " + data);
		assertFalse(data.path("data").path(0).path("CompanyName").asText().isBlank(),
				"the rows carry real values, not empty cells: " + data.path("data").path(0));

		JsonNode pivotOfTheReport = json(author.postJson(
				"/api/analytics/pivot?reportId=" + NEW_REPORT, pivotBody()));
		assertTrue(cellCount(pivotOfTheReport) > 0,
				"pivoting the report they just built returned cells: " + pivotOfTheReport);
	}

	// ============================================================
	// the negative half
	// ============================================================

	@Test
	void theSameChainOnAConnectionTheirGroupDoesNotAllowIsRefusedAtEveryStepAndNamesTheConnection()
			throws Exception {

		// Created first, on the connection they are allowed to use: the last assertion of this test
		// is that nothing was half-written while the refusals were happening.
		assertEquals(HttpStatus.CREATED, author.postJson("/api/reports",
				Map.of("reportId", NEW_REPORT, "templateName", NEW_REPORT,
						"capReportGenerationMailMerge", true)).getStatusCode());
		pointDatasourceAt(NEW_REPORT, CONNECTION_A);

		refused(author.get("/api/queries/schema/" + CONNECTION_C), "schema");
		refused(author.get("/api/connections/" + CONNECTION_C), "the connection itself");
		refused(author.get("/api/connections/" + CONNECTION_C + "/metadata/er-diagram"), "metadata");
		refused(author.postJson("/api/queries/run-sql",
				Map.of("connectionId", CONNECTION_C, "sql", QUERY)), "run-sql");
		refused(author.postJson("/api/dsl/chart/parse",
				Map.of("dslCode", CHART_DSL, "connectionCode", CONNECTION_C)), "the DSL parser");
		refused(author.postJson("/api/analytics/explore",
				Map.of("connectionCode", CONNECTION_C, "tableName", TABLE, "fields", List.of("Country"))),
				"explore");
		refused(author.postJson("/api/analytics/pivot", pivotBodyOn(CONNECTION_C)), "a pivot by table");
		refused(author.postJson("/api/queries/run-script",
				Map.of("connectionId", CONNECTION_C, "script", "return [[one: 1]]")), "run-script");
		refused(author.putJson("/api/reports/" + NEW_REPORT + "/datasource",
				datasourceOn(NEW_REPORT, CONNECTION_C)), "the datasource save");

		// The short way round every check above: read the hidden connection off disk. The file is
		// the connection — its server, its database and its credentials — so the fs guard refuses
		// the read the same way the list refuses to show it.
		refused(author.get("/api/system/fs/content?path=config/connections/" + CONNECTION_C + "/"
				+ CONNECTION_C + ".xml"), "reading the connection file through /fs/content");

		// Nothing was half-written: the report is still on the connection it was saved with.
		JsonNode readBack = json(author.get("/api/reports/" + NEW_REPORT + "/datasource"));
		assertEquals(CONNECTION_A,
				readBack.path("report").path("datasource").path("sqloptions").path("conncode").asText(),
				"a refused datasource save left the report exactly as it was: " + readBack);
	}

	// ============================================================
	// the day the group is narrowed — TODO 23 decision 1, and its carve-out
	// ============================================================

	@Test
	void narrowingTheGroupClosesTheReportTheyHadAndLeavesTheGrantedDashboardOpen() throws Exception {

		// While A is still theirs, both open — otherwise the assertions below would prove nothing
		// but a missing installation.
		assertTrue(author.get("/api/reports/" + REPORT_ON_A).getStatusCode().is2xxSuccessful());
		assertTrue(listedReportIds().contains(REPORT_ON_A));

		dashboardGrants.setGroupDashboards(group.id(), List.of(DASHBOARD_ON_A), null);
		limitsService.updateGroup(group.id(), group.name(), limitedTo(CONNECTION_B));

		// Layer 1, the invariant: a report whose datasource names a connection that is no longer
		// theirs is no longer listed, no longer readable and no longer runnable.
		assertFalse(listedReportIds().contains(REPORT_ON_A),
				"a report they would now be refused must not be offered: " + listedReportIds());

		ResponseEntity<String> refusedReport = author.get("/api/reports/" + REPORT_ON_A);
		assertEquals(HttpStatus.FORBIDDEN, refusedReport.getStatusCode(), refusedReport.getBody());
		assertTrue(refusedReport.getBody().contains(CONNECTION_A),
				"the refusal names the connection they are missing: " + refusedReport.getBody());

		ResponseEntity<String> refusedRun = author.postJson("/api/jobs",
				Map.of("type", "generate", "reportId", REPORT_ON_A));
		assertEquals(HttpStatus.FORBIDDEN, refusedRun.getStatusCode(), refusedRun.getBody());

		// The carve-out: an administrator ticked this dashboard for their group, and that decision
		// survives the narrowing — it is what the person was given, connection or no connection.
		ResponseEntity<String> dashboard = author.get("/api/reports/" + DASHBOARD_ON_A);
		assertTrue(dashboard.getStatusCode().is2xxSuccessful(),
				"a granted dashboard still opens: " + dashboard.getStatusCode() + " " + dashboard.getBody());
	}

	// ============================================================
	// the journey's own vocabulary
	// ============================================================

	private static final String CHART_DSL = String.join("\n",
			"chart {",
			"  type 'bar'",
			"  data {",
			"    labelField 'Country'",
			"    datasets {",
			"      dataset {",
			"        field 'CustomerID'",
			"        label 'Customers'",
			"      }",
			"    }",
			"  }",
			"}");

	/** The refusal every step of the negative half must answer with. */
	private void refused(ResponseEntity<String> answer, String what) {
		assertEquals(HttpStatus.FORBIDDEN, answer.getStatusCode(),
				what + " must refuse a connection this author may not use, and refuse it as 403: "
						+ answer.getStatusCode() + " " + answer.getBody());
		assertTrue(answer.getBody() != null && answer.getBody().contains(CONNECTION_C),
				what + " must name the connection in its refusal: " + answer.getBody());
	}

	private Map<String, Object> pivotBody() {
		return pivotBodyOn(CONNECTION_A);
	}

	private Map<String, Object> pivotBodyOn(String connectionCode) {
		return Map.of("connectionCode", connectionCode, "tableName", TABLE,
				"rows", List.of("Country"), "vals", List.of("CustomerID"), "aggregatorName", "Count");
	}

	/** How many cells a pivot answered with, whichever of its shapes it used. */
	private int cellCount(JsonNode pivot) {
		JsonNode data = pivot.has("data") ? pivot.path("data") : pivot;
		if (data.isArray())
			return data.size();
		if (data.path("rows").isArray())
			return data.path("rows").size();
		return 0;
	}

	private List<String> tableNames(JsonNode schema) {
		List<String> names = new ArrayList<>();
		schema.path("tables").forEach(table -> names.add(table.path("tableName").asText()));
		return names;
	}

	private String firstRowFieldName(JsonNode rows, int index) {
		JsonNode first = rows.path("data").path(0);
		List<String> fields = new ArrayList<>();
		first.fieldNames().forEachRemaining(fields::add);
		return index < fields.size() ? fields.get(index) : null;
	}

	private List<String> connectionCodes() throws Exception {
		List<String> codes = new ArrayList<>();
		json(author.get("/api/connections?type=database"))
				.forEach(entry -> codes.add(entry.path("connectionCode").asText()));
		return codes;
	}

	private List<String> listedReportIds() throws Exception {
		List<String> ids = new ArrayList<>();
		json(author.get("/api/reports")).forEach(entry -> ids.add(entry.path("folderName").asText()));
		ids.remove("burst");
		return ids;
	}

	/** The datasource of a report, as the Reports screen saves it: read, change, write back. */
	private void pointDatasourceAt(String reportId, String connectionCode) throws Exception {
		ResponseEntity<String> saved =
				author.putJson("/api/reports/" + reportId + "/datasource", datasourceOn(reportId, connectionCode));
		assertTrue(saved.getStatusCode().is2xxSuccessful(),
				"pointing " + reportId + " at " + connectionCode + ": " + saved.getStatusCode() + " "
						+ saved.getBody());
	}

	private String datasourceOn(String reportId, String connectionCode) throws Exception {
		JsonNode current = json(author.get("/api/reports/" + reportId + "/datasource"));
		com.fasterxml.jackson.databind.node.ObjectNode datasource =
				(com.fasterxml.jackson.databind.node.ObjectNode) current.path("report").path("datasource");
		datasource.put("type", "ds.sqlquery");
		com.fasterxml.jackson.databind.node.ObjectNode sqloptions =
				datasource.path("sqloptions").isObject()
						? (com.fasterxml.jackson.databind.node.ObjectNode) datasource.path("sqloptions")
						: datasource.putObject("sqloptions");
		sqloptions.put("conncode", connectionCode);
		sqloptions.put("query", QUERY);
		sqloptions.put("idcolumn", "CustomerID");
		return JSON.writeValueAsString(current);
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this step of the journey must not be refused: " + answer.getStatusCode() + " "
						+ answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	private LimitSettings limitedTo(String... connectionCodes) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionCodes));
		// Scripts on: the chain this test walks includes the script an author saves inside their
		// report and the ad-hoc script they run while writing it. A group with scripts off is a
		// different question, and ConnectionLimitsEnforcementTest asks it.
		settings.setScripts(true);
		return settings;
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

	// ============================================================
	// a browser session, as the Angular app holds one
	// ============================================================

	/**
	 * Cookie jar and CSRF token, nothing more. The point of driving the journey through this rather
	 * than through {@code @WithMockUser} is that everything it carries — the session the login
	 * created, the token the filter minted — is something the server itself handed out, so a chain
	 * that stops issuing one fails this test instead of passing it.
	 */
	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			// A GET first, exactly as the login screen does: that is what mints the XSRF-TOKEN
			// cookie the POST below has to echo back.
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = postJson("/api/auth/login",
					Map.of("username", username, "password", password));
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"the journey starts with a real sign-in: " + loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, null);
		}

		private ResponseEntity<String> postJson(String path, Object body) {
			return exchange(HttpMethod.POST, path, body, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> putJson(String path, Object body) {
			return exchange(HttpMethod.PUT, path, body, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> putText(String path, String body) {
			return exchange(HttpMethod.PUT, path, body, MediaType.TEXT_PLAIN);
		}

		private ResponseEntity<String> exchange(HttpMethod method, String path, Object body,
				MediaType contentType) {

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

	/** A real connection file, written by the product's own writer, pointing at the real database. */
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

	/**
	 * A real report: the two files that ship, filled in through the product's own writers.
	 *
	 * @param datasourceType {@code ds.sqlquery} for an ordinary report, {@code ds.dashboard} for one
	 *        that is also a published dashboard — which is what makes it grantable, and what the
	 *        carve-out test needs. It still declares the connection its widgets read.
	 */
	private static void writeReport(String reportId, String connectionCode, String datasourceType)
			throws Exception {

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
		installer.saveSettingsReporting(reporting, settingsPath);
	}
}

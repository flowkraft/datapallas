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
 * The four callers nothing limits, walking the same chain {@link FullChainAuthorJourneyTest} walks
 * — on the connection that belongs to no group at all, which is the one a limited author is refused.
 *
 * <h2>The risk this answers</h2>
 * {@code LimitsService.limitsFor} short-circuits for administrators and for the installation key
 * before it looks at a single group, so by the rule neither is ever limited. The danger is not the
 * rule: it is a call site that asks a <em>different</em> question — a hard-coded role, a path check,
 * a guard that never consults {@code limitsService} — and limits an administrator by accident. That
 * is the worst failure of the lot, because an admin who is refused has nobody above them to unblock
 * it. The same goes for the two authors nobody has limited: a report author in no group at all, and
 * one in a group that sets no limits. Both are "unlimited" by the rule, and both are the cases a
 * widened {@code limitsFor} breaks first.
 *
 * <h2>Why every assertion is positive</h2>
 * An unlimited caller is refused nothing, so a test that only looks for refusals here checks
 * nothing at all. Every step asserts the real result: the list holds <em>every</em> connection, the
 * metadata comes back, the schema names the table, run-sql returns every row the database holds,
 * the DSL parses into the chart it describes, the cube DSL parses into the cube it describes, the
 * pivot returns cells, the file endpoints read the file, the script runs, the report runs and
 * {@code /data} returns its rows, and the files under {@code config/connections/} and
 * {@code config/_internal/} — the two folders a limited author may not touch — are served.
 *
 * <h2>The negative control</h2>
 * Removing the administrative short-circuit in {@code LimitsService.isAdministrativePrincipal}
 * turns these tests red at the first door, rather than letting them pass quietly: the admin, the
 * key and the two unlimited authors would all be limited to the connections of their groups, which
 * for three of the four is no connection at all.
 */
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UnlimitedCallersJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/unlimited-callers-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** Two connections a group could name, and one nobody names — the one that must open anyway. */
	private static final String CONNECTION_A = "db-sales-sqlite";
	private static final String CONNECTION_B = "db-marketing-sqlite";
	private static final String IN_NO_GROUP = "db-payroll-sqlite";

	/**
	 * A DuckDB connection, also in no group. The three analytics endpoints that read a FILE read it
	 * through the DuckDB session their connection supplies — `read_csv_auto` is DuckDB's own reader —
	 * so asking a SQLite connection for a file is asking the wrong database, and answers 500 rather
	 * than anything about limits. This is the connection those three steps walk through, and it is
	 * just as ungranted as the one above.
	 */
	private static final String FILES_CONNECTION = "db-files-duckdb";

	private static final String TABLE = "Customers";
	private static final String QUERY =
			"SELECT \"CustomerID\", \"CompanyName\", \"Country\" FROM \"Customers\"";

	/** Fixture accounts, created by this test inside its own throwaway installation. */
	private static final String ADMIN = "aziz-admin-journey";
	private static final String AUTHOR_NO_GROUP = "nina-no-group";
	private static final String AUTHOR_EMPTY_GROUP = "eli-empty-group";
	private static final String PASSWORD = "journey-fixture-pw";

	/**
	 * The installation key this test writes into its own installation before the context boots, so
	 * that nothing anywhere has to read the key of a real one.
	 */
	private static final String FIXTURE_API_KEY = "journey-fixture-api-key";

	/** A file under config/_internal/ that is not a credential, so the read can be asserted. */
	private static final String INTERNAL_MARKER = "config/_internal/journey-marker.txt";
	private static final String INTERNAL_MARKER_TEXT = "an unlimited caller reads this";

	/** A small CSV for the three analytics endpoints that read a file through a connection. */
	private static final String SAMPLE_CSV = "temp/journey-sample.csv";

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

	private static final String CUBE_DSL = String.join("\n",
			"cube {",
			"  sql_table 'Customers'",
			"  title 'Customers'",
			"  dimension { name 'customer_id'; sql 'CustomerID'; type 'string'; primary_key true }",
			"  dimension { name 'country'; sql 'Country'; type 'string' }",
			"  measure { name 'count'; type 'count' }",
			"}");

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static Path northwind;
	private static Path duckdb;
	private static ReportsService installer;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());
			Files.createDirectories(root.resolve("config/reports"));
			Files.createDirectories(root.resolve("config/connections"));
			Files.createDirectories(root.resolve("config/samples"));
			Files.createDirectories(root.resolve("config/_internal"));
			Files.createDirectories(root.resolve("logs"));
			Files.createDirectories(root.resolve("db"));
			Files.createDirectories(root.resolve("temp"));

			System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
			AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
			AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
			AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
			Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

			// Written before the context starts, because ApiKeyManager generates one in @PostConstruct
			// when the file is missing. A fixture value in a throwaway installation: no real key is
			// read, printed or needed anywhere in this test.
			Files.writeString(root.resolve("config/_internal/api-key.txt"), FIXTURE_API_KEY);
			Files.writeString(root.resolve(INTERNAL_MARKER), INTERNAL_MARKER_TEXT);
			Files.writeString(root.resolve(SAMPLE_CSV),
					"id,city,amount\n1,Berlin,10\n2,Lisbon,20\n3,Oslo,30\n");

			installer = new ReportsService();
			ReflectionTestUtils.setField(installer, "fileSystemService", new FileSystemService());

			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
					root.resolve("config/burst/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
					root.resolve("config/_defaults/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_REPORTING_XML),
					root.resolve("config/_defaults/reporting.xml").toFile());

			northwind = NorthwindFixture.writableSqliteCopy(root.resolve("db/northwind.db"));

			writeConnection(CONNECTION_A);
			writeConnection(CONNECTION_B);
			writeConnection(IN_NO_GROUP);
			duckdb = root.resolve("db/journey.duckdb");
			// Created empty here, because the product opens a DuckDB connection READ-ONLY (it avoids
			// the exclusive lock), and a read-only in-memory DuckDB cannot be launched at all. A real
			// file on disk is what an installation's DuckDB connection is anyway.
			Class.forName("org.duckdb.DuckDBDriver");
			DriverManager.getConnection("jdbc:duckdb:" + duckdb).close();
			writeDuckDbConnection(FILES_CONNECTION);

			writeReport("existing-report", CONNECTION_A);
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

	private final List<String> reportsToRemove = new ArrayList<>();

	@BeforeEach
	void createTheFourCallers() {

		createIfMissing(ADMIN, Role.ADMIN);
		createIfMissing(AUTHOR_NO_GROUP, Role.REPORT_AUTHOR);
		createIfMissing(AUTHOR_EMPTY_GROUP, Role.REPORT_AUTHOR);

		// A group that limits nothing: it exists to organise people, and takes no part in the
		// combining rule. Somebody in it is exactly as unlimited as somebody in no group at all.
		UserGroup organisational = limitsService.createGroup(Tenant.DEFAULT_CODE,
				"Organisational " + System.nanoTime(), new LimitSettings());
		limitsService.setUserGroups(AUTHOR_EMPTY_GROUP, List.of(organisational.id()));

		// The administrator is put in a group that DOES limit — a team group, the ordinary reason an
		// administrator is in one at all. Their own rule is the only thing that lets them past it, so
		// this is what makes the negative control below bite: with the administrative short-circuit
		// taken out of LimitsService, this group is what refuses them, loudly, at the first door.
		UserGroup adminsTeam = limitsService.createGroup(Tenant.DEFAULT_CODE,
				"Sales team " + System.nanoTime(), limitedTo(CONNECTION_A));
		limitsService.setUserGroups(ADMIN, List.of(adminsTeam.id()));
	}

	@AfterEach
	void removeWhatTheJourneysCreated() {
		reportsToRemove.forEach(
				reportId -> FileUtils.deleteQuietly(root.resolve("config/reports/" + reportId).toFile()));
		reportsToRemove.clear();
	}

	// ============================================================
	// the four callers
	// ============================================================

	@Test
	void anAdministratorWalksTheWholeChainOnAConnectionNoGroupNames() throws Exception {
		walkTheWholeChain(signedIn(ADMIN), "admin-journey-report", "an administrator");
	}

	@Test
	void theInstallationKeyWalksTheWholeChainOnAConnectionNoGroupNames() throws Exception {
		walkTheWholeChain(withTheInstallationKey(), "api-key-journey-report", "the installation key");
	}

	@Test
	void anAuthorInNoGroupAtAllWalksTheWholeChain() throws Exception {
		walkTheWholeChain(signedIn(AUTHOR_NO_GROUP), "no-group-journey-report", "an author in no group");
	}

	@Test
	void anAuthorInAGroupThatSetsNoLimitsWalksTheWholeChain() throws Exception {
		walkTheWholeChain(signedIn(AUTHOR_EMPTY_GROUP), "empty-group-journey-report",
				"an author in a group that limits nothing");
	}

	// ============================================================
	// the chain itself
	// ============================================================

	/**
	 * Every step a limited author is refused, walked by somebody nobody has limited — and asserted by
	 * what came back rather than by the absence of a refusal.
	 */
	private void walkTheWholeChain(Caller caller, String reportId, String who) throws Exception {

		reportsToRemove.add(reportId);

		// 1 — the list: every connection, including the one no group names.
		List<String> connections = connectionCodes(caller);
		for (String code : List.of(CONNECTION_A, CONNECTION_B, IN_NO_GROUP, FILES_CONNECTION))
			assertTrue(connections.contains(code),
					who + " sees every connection, " + code + " included: " + connections);

		// 2 — the connection nobody granted them, its metadata and its schema.
		JsonNode connection = json(caller.get("/api/connections/" + IN_NO_GROUP), who);
		assertEquals(IN_NO_GROUP, connection.path("connection").path("code").asText(),
				who + " really opened the connection: " + connection);

		JsonNode metadata = json(caller.get("/api/connections/" + IN_NO_GROUP + "/metadata/er-diagram"), who);
		assertTrue(metadata.has("exists"), who + " got the metadata door's own answer: " + metadata);

		JsonNode schema = json(caller.get("/api/queries/schema/" + IN_NO_GROUP), who);
		assertTrue(tableNames(schema).contains(TABLE),
				who + " really read this database's schema: " + tableNames(schema));

		// 3 — reading the data itself, in each of the shapes the product offers.
		JsonNode rows = json(caller.postJson("/api/queries/run-sql",
				Map.of("connectionId", IN_NO_GROUP, "sql", QUERY)), who);
		assertEquals(countCustomers(), rows.path("rowCount").asInt(),
				who + " got every row the database holds: " + rows.path("rowCount").asInt());

		JsonNode chart = json(caller.postJson("/api/dsl/chart/parse",
				Map.of("dslCode", CHART_DSL, "connectionCode", IN_NO_GROUP)), who);
		assertEquals("bar", chart.path("options").path("type").asText(),
				who + " got the chart the DSL describes: " + chart);

		JsonNode cube = json(caller.postJson("/api/cubes/parse-dsl", Map.of("dslCode", CUBE_DSL)), who);
		assertEquals("Customers", cube.path("title").asText(),
				who + " got the cube the DSL describes: " + cube);

		JsonNode explored = json(caller.postJson("/api/analytics/explore",
				Map.of("connectionCode", IN_NO_GROUP, "tableName", TABLE, "fields", List.of("Country"))), who);
		assertTrue(explored.toString().contains("Country"),
				who + " got the exploration they asked for: " + explored);

		JsonNode pivotOfATable = json(caller.postJson("/api/analytics/pivot", pivotBody()), who);
		assertTrue(cellCount(pivotOfATable) > 0, who + " got cells, not an empty pivot: " + pivotOfATable);

		// 4 — the three endpoints that read a file through the DuckDB session a connection supplies.
		String csvPath = root.resolve(SAMPLE_CSV).toString();


		JsonNode fileSchema = json(caller.postJson("/api/analytics/file-schema",
				Map.of("connectionCode", FILES_CONNECTION, "filePath", csvPath, "format", "CSV")), who);
		assertTrue(fileSchema.toString().contains("city"),
				who + " read the file's own columns: " + fileSchema);

		JsonNode fileSample = json(caller.postJson("/api/analytics/file-sample",
				Map.of("connectionCode", FILES_CONNECTION, "filePath", csvPath, "format", "CSV", "limit", 10)), who);
		assertTrue(fileSample.toString().contains("Lisbon"),
				who + " read the file's own rows: " + fileSample);

		JsonNode fileQuery = json(caller.postJson("/api/analytics/query-file",
				Map.of("connectionCode", FILES_CONNECTION, "filePath", csvPath, "format", "CSV",
						"query", "SELECT city FROM data ORDER BY id")), who);
		assertTrue(fileQuery.toString().contains("Berlin"),
				who + " queried the file and got its data back: " + fileQuery);

		// 5 — the report, pointed at the connection no group names.
		ResponseEntity<String> created = caller.postJson("/api/reports",
				Map.of("reportId", reportId, "templateName", reportId,
						"capReportGenerationMailMerge", true));
		assertEquals(HttpStatus.CREATED, created.getStatusCode(),
				who + " creates a report: " + created.getBody());

		ResponseEntity<String> saved = caller.putJson("/api/reports/" + reportId + "/datasource",
				datasourceOn(caller, reportId, IN_NO_GROUP, who));
		assertTrue(saved.getStatusCode().is2xxSuccessful(),
				who + " points it at " + IN_NO_GROUP + ": " + saved.getStatusCode() + " " + saved.getBody());

		JsonNode readBack = json(caller.get("/api/reports/" + reportId + "/datasource"), who);
		assertEquals(IN_NO_GROUP,
				readBack.path("report").path("datasource").path("sqloptions").path("conncode").asText(),
				who + " saved a datasource that really reads back: " + readBack);

		// 6 — the template, the script inside the report, and an ad-hoc script.
		ResponseEntity<String> template = caller.putText("/api/reports/" + reportId + "/template/html",
				"<html><body>${CustomerID}</body></html>");
		assertTrue(template.getStatusCode().is2xxSuccessful(),
				who + " saves the template: " + template.getStatusCode() + " " + template.getBody());

		ResponseEntity<String> script = caller.putText(
				"/api/reports/" + reportId + "/script/datasourceScript", "return []");
		assertTrue(script.getStatusCode().is2xxSuccessful(),
				who + " saves server code: " + script.getStatusCode() + " " + script.getBody());

		JsonNode ranScript = json(caller.postJson("/api/queries/run-script",
				Map.of("connectionId", IN_NO_GROUP, "script", "return [[one: 1]]")), who);
		assertEquals(1, ranScript.path("rowCount").asInt(),
				who + " really ran the script: " + ranScript);

		// 7 — running the report, its data, and a pivot of it.
		ResponseEntity<String> submitted = caller.postJson("/api/jobs",
				Map.of("type", "generate", "reportId", reportId));
		assertEquals(HttpStatus.ACCEPTED, submitted.getStatusCode(),
				who + " runs it: " + submitted.getStatusCode() + " " + submitted.getBody());
		assertNotNull(json(submitted, who).path("jobId").asText(null),
				who + " gets a job id back");

		JsonNode data = json(caller.get("/api/reports/" + reportId + "/data"), who);
		assertEquals(countCustomers(), data.path("totalRows").asInt(),
				who + " reads every row the report produced: " + data.path("totalRows").asInt());
		assertEquals(List.of("CustomerID", "CompanyName", "Country"),
				JSON.convertValue(data.path("reportColumnNames"), List.class),
				who + " reads the columns the report asked the database for: " + data.path("reportColumnNames"));
		assertTrue(data.path("data").size() > 0, who + " reads real rows: " + data);
		assertFalse(data.path("data").path(0).path("CompanyName").asText().isBlank(),
				who + " reads real values, not empty cells: " + data.path("data").path(0));

		JsonNode pivotOfTheReport = json(
				caller.postJson("/api/analytics/pivot?reportId=" + reportId, pivotBody()), who);
		assertTrue(cellCount(pivotOfTheReport) > 0,
				who + " pivots the report they just built: " + pivotOfTheReport);

		// 8 — the two folders a limited author may not touch at all. For an unlimited caller they are
		//     ordinary files, and the content proves the read really happened. The key file itself is
		//     never read here: a marker file beside it answers the same question about the folder.
		ResponseEntity<String> connectionFile = caller.get("/api/system/fs/content?path="
				+ "config/connections/" + IN_NO_GROUP + "/" + IN_NO_GROUP + ".xml");
		assertTrue(connectionFile.getStatusCode().is2xxSuccessful(),
				who + " reads a connection file: " + connectionFile.getStatusCode());
		assertTrue(connectionFile.getBody() != null && connectionFile.getBody().contains(IN_NO_GROUP),
				who + " reads the file of that very connection");

		ResponseEntity<String> internalFile = caller.get("/api/system/fs/content?path=" + INTERNAL_MARKER);
		assertTrue(internalFile.getStatusCode().is2xxSuccessful(),
				who + " reads under config/_internal/: " + internalFile.getStatusCode());
		assertEquals(INTERNAL_MARKER_TEXT, internalFile.getBody() == null ? null : internalFile.getBody().trim(),
				who + " reads what that file really holds");
	}

	// ============================================================
	// helpers
	// ============================================================

	private void createIfMissing(String username, Role role) {
		if (iamService.findUser(username).isEmpty())
			iamService.createUser(username, null, PASSWORD, role, Tenant.DEFAULT_CODE);
	}

	private Caller signedIn(String username) {
		return new Caller(username, PASSWORD, null);
	}

	private Caller withTheInstallationKey() {
		return new Caller(null, null, FIXTURE_API_KEY);
	}

	/** A group that allows exactly these connections, and the scripts this chain writes. */
	private LimitSettings limitedTo(String... connectionCodes) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionCodes));
		settings.setScripts(true);
		return settings;
	}

	private Map<String, Object> pivotBody() {
		return Map.of("connectionCode", IN_NO_GROUP, "tableName", TABLE,
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

	private List<String> connectionCodes(Caller caller) throws Exception {
		List<String> codes = new ArrayList<>();
		json(caller.get("/api/connections?type=database"), "the caller")
				.forEach(entry -> codes.add(entry.path("connectionCode").asText()));
		return codes;
	}

	private String datasourceOn(Caller caller, String reportId, String connectionCode, String who)
			throws Exception {
		JsonNode current = json(caller.get("/api/reports/" + reportId + "/datasource"), who);
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

	private JsonNode json(ResponseEntity<String> answer, String who) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				who + " must not be refused anywhere on this chain: " + answer.getStatusCode() + " "
						+ answer.getBody());
		assertNotNull(answer.getBody(), who + " got an empty body, which is not an answer");
		return JSON.readTree(answer.getBody());
	}

	private int countCustomers() throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + northwind);
				Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery("SELECT count(*) FROM \"Customers\"")) {
			rs.next();
			return rs.getInt(1);
		}
	}

	// ============================================================
	// one caller: a browser session, or the installation key
	// ============================================================

	/**
	 * Either a signed-in person — cookie jar and CSRF token, exactly as the Angular app holds one —
	 * or a machine carrying {@code X-API-Key}, which the filter chain exempts from CSRF because it
	 * has no cookie to be ridden. Both go through the same journey below, which is the point: the
	 * question "is this caller limited" must be answered the same way whoever asks it.
	 */
	private final class Caller {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private final String apiKey;

		private Caller(String username, String password, String apiKey) {
			this.apiKey = apiKey;
			if (apiKey != null)
				return;
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
			if (apiKey != null)
				headers.add("X-API-Key", apiKey);
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

	/** The same, for the in-memory DuckDB the file endpoints read files through. */
	private static void writeDuckDbConnection(String code) throws Exception {

		ServerDatabaseSettings server = new ServerDatabaseSettings();
		server.type = "duckdb";
		server.driver = "org.duckdb.DuckDBDriver";
		server.database = duckdb.toString();
		server.url = "jdbc:duckdb:" + duckdb;
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

	private static void writeReport(String reportId, String connectionCode) throws Exception {

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
		reporting.report.datasource.type = "ds.sqlquery";
		reporting.report.datasource.sqloptions.conncode = connectionCode;
		reporting.report.datasource.sqloptions.query = QUERY;
		reporting.report.datasource.sqloptions.idcolumn = "CustomerID";
		installer.saveSettingsReporting(reporting, settingsPath);
	}
}

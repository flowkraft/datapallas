package com.flowkraft.cubes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.commons.io.FileUtils;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.ServerApplication;
import com.flowkraft.common.AppPaths;
import com.flowkraft.exploredata.export.ScriptAssembler;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.limits.LimitSettings;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.flowkraft.reporting.dsl.cube.CubeOptionsParser;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * A cube's access filter, frozen into a published dashboard, and asked by two people.
 *
 * <h2>What "frozen" means, and why the chain matters</h2>
 * A canvas widget over a cube with <b>Show In Dashboard</b> unchecked keeps no cube: the SQL the
 * generator wrote is exported into the dashboard's script, and from then on the dashboard runs that
 * text. If the generator had bound the author's own values into it, every viewer of that dashboard
 * would see the author's rows - the worst outcome this feature has, because it looks like it works.
 * So the generated text carries {@code ${dp_…}} on, and the server fills each one in from whoever
 * is asking, on every request.
 *
 * <p>The links between the two ends each have their own test - {@code AccessFilterGeneratorTest}
 * for the condition in the SQL, {@code BuiltinVariablesJourneyTest} for the variables over HTTP -
 * and both pass while the chain leaks, because nothing in either of them puts a cube's SQL into a
 * dashboard. That is this test: one cube, one export, two people, two answers.
 */
/*
 * Its own application context: the RANDOM_PORT journey tests replace the installation the server
 * runs on, so they each carry this annotation and boot their own.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccessFilterFrozenChainTest {

	private static final String TEST_ROOT = "./target/test-output/access-filter-frozen-chain";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-frozen-cube-sqlite";
	private static final String DASHBOARD = "frozen-cube-dashboard";
	private static final String GROUP = "Desk";

	private static final String ANNA = "adesk";
	private static final String ANNA_EMAIL = "adesk@example.com";
	private static final String BORIS = "bdesk";
	private static final String BORIS_EMAIL = "bdesk@example.com";
	private static final String PASSWORD = "frozen-cube-fixture-pw";

	/** Anna owns three tickets, Boris two, and one belongs to somebody who never signs in. */
	private static final int ANNA_TICKETS = 3;
	private static final int BORIS_TICKETS = 2;

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static Path database;
	private static ReportsService installer;

	/** The SQL the cube generated, as the export froze it - kept to assert on its text. */
	private static String frozenSql;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());
			Files.createDirectories(root.resolve("config/reports"));
			Files.createDirectories(root.resolve("config/connections"));
			Files.createDirectories(root.resolve("config/samples"));
			Files.createDirectories(root.resolve("logs"));
			Files.createDirectories(root.resolve("db"));
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

			database = writeDatabase(root.resolve("db/tickets.db"));
			writeConnection(CONNECTION);

			frozenSql = generateFromTheCube();
			writeDashboard(DASHBOARD, frozenSql);
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

	private Session anna;
	private Session boris;

	@BeforeEach
	void twoPeopleAtTheSameDesk() {

		createIfMissing(ANNA, ANNA_EMAIL);
		createIfMissing(BORIS, BORIS_EMAIL);

		UserGroup desk = groupIdOf(GROUP);
		limitsService.setUserGroups(ANNA, List.of(desk.id()));
		limitsService.setUserGroups(BORIS, List.of(desk.id()));

		anna = new Session(ANNA, PASSWORD);
		boris = new Session(BORIS, PASSWORD);
	}

	@Test
	void theSameFrozenWidgetGivesEachPersonTheirOwnRows() throws Exception {

		List<String> hers = answer(anna, "");
		List<String> his = answer(boris, "");

		assertEquals(ANNA_TICKETS, hers.size(), "Anna's own tickets, and only those: " + hers);
		assertEquals(BORIS_TICKETS, his.size(), "Boris's own tickets, from the same dashboard: " + his);

		assertTrue(hers.stream().allMatch(row -> row.contains(ANNA_EMAIL)), "every row of hers is hers: " + hers);
		assertTrue(his.stream().allMatch(row -> row.contains(BORIS_EMAIL)), "and every row of his is his: " + his);

		// Not merely different counts: neither of them has seen a row of the other's.
		assertTrue(hers.stream().noneMatch(row -> row.contains(BORIS_EMAIL)), "nothing of his is in hers: " + hers);
		assertTrue(his.stream().noneMatch(row -> row.contains(ANNA_EMAIL)), "and nothing of hers in his: " + his);
	}

	@Test
	void theExportedSqlCarriesThePlaceholderAndNobodysValue() {

		assertTrue(frozenSql.contains("${dp_user_email}"),
				"the frozen SQL asks for whoever is running it:\n" + frozenSql);
		assertFalse(frozenSql.contains(ANNA_EMAIL) || frozenSql.contains(BORIS_EMAIL),
				"and it names nobody - a value frozen in here would be shown to every viewer:\n" + frozenSql);

		// The condition is the generator's, in its own brackets, and it is in the exported text.
		// Matched rather than compared, because how ${CUBE} is written - the table's name or an
		// alias - is the generator's business and this test is about the brackets around it.
		assertTrue(frozenSql.matches("(?s).*\\([^()]*agent_email = \\$\\{dp_user_email\\}\\).*"),
				"the access filter travelled into the export, bracketed:\n" + frozenSql);
	}

	@Test
	void namingSomebodyElseInTheQueryStringChangesNothing() throws Exception {

		List<String> asked = answer(anna, "dp_user_email=" + BORIS_EMAIL);

		assertEquals(ANNA_TICKETS, asked.size(), "Anna asking to be Boris still gets her own rows: " + asked);
		assertTrue(asked.stream().noneMatch(row -> row.contains(BORIS_EMAIL)), "and none of his: " + asked);
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** The rows the frozen widget answered this person with, each as its JSON text. */
	private List<String> answer(Session caller, String queryString) throws Exception {

		ResponseEntity<String> response = caller.get("/api/reports/" + DASHBOARD + "/data"
				+ (queryString.isEmpty() ? "" : "?" + queryString));
		assertTrue(response.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + response.getStatusCode() + " " + response.getBody());

		JsonNode data = JSON.readTree(response.getBody()).path("data");
		assertTrue(data.path(0).path("ERROR_MESSAGE").isMissingNode(),
				"the widget failed rather than answered: " + data.path(0));

		List<String> rows = new ArrayList<>();
		data.forEach(row -> rows.add(row.toString()));
		return rows;
	}

	private void createIfMissing(String username, String email) {
		if (iamService.findUser(username).isEmpty())
			iamService.createUser(username, email, PASSWORD, Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);
	}

	/** The group that lets both of them reach the connection, created once. */
	private UserGroup groupIdOf(String name) {

		Optional<UserGroup> existing = limitsService.groupsInTenant(Tenant.DEFAULT_CODE).stream()
				.filter(group -> name.equals(group.name())).findFirst();
		if (existing.isPresent())
			return existing.get();

		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(CONNECTION));
		settings.setScripts(true);
		return limitsService.createGroup(Tenant.DEFAULT_CODE, name, settings);
	}

	/** A signed-in person: the cookie jar and the CSRF header the Angular app sends. */
	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = exchange(HttpMethod.POST, "/api/auth/login",
					Map.of("username", username, "password", password), MediaType.APPLICATION_JSON);
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"every case here starts with a real sign-in: " + loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, null);
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

	/**
	 * The cube the canvas widget was built on, and the SQL the export freezes.
	 *
	 * <p>The generator is called exactly as the generate-sql endpoint calls it, for the vendor the
	 * connection is on. Nobody is asking at this moment - that is the whole point of a frozen
	 * export - so the condition's {@code ${dp_user_email}} travels into the dashboard's script.
	 */
	private static String generateFromTheCube() throws Exception {

		CubeOptions cube = CubeOptionsParser.parseGroovyCubeDslCode(String.join("\n",
				"cube {",
				"  sql_table 'af_tickets'",
				"  access_filter '${CUBE}.agent_email = ${dp_user_email}'",
				"  dimension { name 'Id'; sql '${CUBE}.id'; type 'number'; primary_key true }",
				"  dimension { name 'AgentEmail'; sql '${CUBE}.agent_email'; type 'string' }",
				"  measure { name 'Tickets'; type 'count' }",
				"}"));

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of("Id", "AgentEmail"));

		return CubeSqlGenerator.buildQuery(cube, request, "sqlite").toInlineSql("sqlite");
	}

	/** Six tickets: three of Anna's, two of Boris's, and one nobody here owns. */
	private static Path writeDatabase(Path file) throws Exception {

		Files.deleteIfExists(file);

		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + file);
				Statement statement = connection.createStatement()) {

			statement.executeUpdate("CREATE TABLE af_tickets (id INTEGER PRIMARY KEY, agent_email TEXT, subject TEXT)");
			insert(statement, 1, ANNA_EMAIL);
			insert(statement, 2, ANNA_EMAIL);
			insert(statement, 3, ANNA_EMAIL);
			insert(statement, 4, BORIS_EMAIL);
			insert(statement, 5, BORIS_EMAIL);
			insert(statement, 6, "nobody@example.com");
		}

		return file.toAbsolutePath();
	}

	private static void insert(Statement statement, int id, String email) throws Exception {
		statement.executeUpdate("INSERT INTO af_tickets VALUES (" + id + ", '" + email + "', 'ticket " + id + "')");
	}

	private static void writeConnection(String code) throws Exception {

		ServerDatabaseSettings server = new ServerDatabaseSettings();
		server.type = "sqlite";
		server.driver = "org.sqlite.JDBC";
		server.database = database.toString();
		server.url = "jdbc:sqlite:" + database;
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
	 * A published dashboard of one widget, written the way {@code CanvasExportService} writes one -
	 * with the script {@link ScriptAssembler} really assembles, because the {@code ${dp_…}}
	 * declaration this test depends on is written by the assembler and by nothing else.
	 */
	private static void writeDashboard(String reportId, String sql) throws Exception {

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

		String scriptName = reportId + "-script.groovy";

		ReportingSettings reporting = installer.loadSettingsReporting(settingsPath);
		reporting.report.datasource.type = "ds.dashboard";
		reporting.report.datasource.sqloptions.conncode = CONNECTION;
		reporting.report.datasource.sqloptions.query = sql;
		reporting.report.datasource.sqloptions.idcolumn = "id";
		reporting.report.datasource.sqloptions.scriptname = scriptName;
		reporting.report.datasource.scriptoptions.conncode = CONNECTION;
		reporting.report.datasource.scriptoptions.scriptname = scriptName;
		reporting.report.template.outputtype = "output.dashboard";
		reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";

		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "sql");
		dataSource.put("sql", sql);
		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", "w-a");
		widget.put("type", "tabulator");
		widget.put("dataSource", dataSource);

		Files.writeString(reportDir.resolve(scriptName),
				ScriptAssembler.assemble(List.of(widget), List.of()).text());

		Path templateDir = root.resolve("templates/reports/" + reportId);
		Files.createDirectories(templateDir);
		Files.writeString(templateDir.resolve(reportId + "-template.html"), String.join("\n",
				"<div class=\"rb-dashboard-root\" data-report=\"" + reportId + "\">",
				"  <rb-tabulator component-id=\"tabulator_a\" api-base-url=\"http://localhost:9090/api\"></rb-tabulator>",
				"</div>",
				""));

		installer.saveSettingsReporting(reporting, settingsPath);
	}
}

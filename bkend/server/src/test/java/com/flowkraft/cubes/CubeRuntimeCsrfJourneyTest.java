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
import com.flowkraft.embed.EmbedTokenService;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.limits.LimitSettings;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The live cube of a published dashboard, asked for its rows by a signed-in person.
 *
 * <h2>Why over real HTTP, and why no {@code .with(csrf())}</h2>
 * A live cube tile asks for its rows with POST, and POST from a browser session goes through the
 * CSRF filter before any authorization runs. That filter is the whole subject here: a session write
 * that does not carry back the token the server put in the XSRF-TOKEN cookie is refused, and the
 * reader is shown a red line where the numbers should be (D4). MockMvc's {@code .with(csrf())}
 * shortcut puts a valid token on every request it builds, so a test written that way passes whether
 * the header travels or not - which is exactly the question. So: a real port, a real sign-in, a real
 * cookie jar, and the header added or left off by hand.
 *
 * <p>The component's own half of this - reading the cookie and sending it - is
 * {@code src/shared/session-request.ts} and its node test, and the e2e; what is pinned here is the
 * server contract the component relies on, in both directions.
 */
/*
 * Its own application context: the RANDOM_PORT journey tests replace the installation the server
 * runs on, so they each carry this annotation and boot their own.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CubeRuntimeCsrfJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/cube-runtime-csrf";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-csrf-cube-sqlite";
	private static final String DASHBOARD = "csrf-cube-dashboard";
	private static final String COMPONENT = "cube1";
	private static final String CUBE = "csrf-sales";
	private static final String GROUP = "Desk";

	private static final String VIEWER = "cdesk";
	private static final String VIEWER_EMAIL = "cdesk@example.com";
	private static final String PASSWORD = "csrf-cube-fixture-pw";

	/** Two countries in the table, and the money each of them spent. */
	private static final String GERMANY = "Germany";
	private static final String FRANCE = "France";
	private static final double GERMAN_REVENUE = 300d;
	private static final double FRENCH_REVENUE = 120d;

	private static final String THE_SELECTION =
			"{\"dimensions\":[\"Country\"],\"measures\":[\"Revenue\"]}";

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static Path database;
	private static ReportsService installer;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());
			Files.createDirectories(root.resolve("config/reports"));
			Files.createDirectories(root.resolve("config/connections"));
			Files.createDirectories(root.resolve("config/cubes"));
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

			database = writeDatabase(root.resolve("db/sales.db"));
			writeConnection(CONNECTION);
			writeCube();
			writeDashboard(DASHBOARD);
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
	private EmbedTokenService embedTokens;

	private Session viewer;

	@BeforeEach
	void somebodyOpensTheDashboard() {

		if (iamService.findUser(VIEWER).isEmpty())
			iamService.createUser(VIEWER, VIEWER_EMAIL, PASSWORD, Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		limitsService.setUserGroups(VIEWER, List.of(groupIdOf(GROUP).id()));

		viewer = new Session(VIEWER, PASSWORD);
	}

	/**
	 * The negative half, and the defect itself: the same request, signed in, refused for the one
	 * reason that it left without the token.
	 */
	@Test
	void aSessionAsksForItsRowsWithoutTheTokenAndIsRefused() {

		ResponseEntity<String> refused = viewer.post("/api/reports/" + DASHBOARD + "/cube/" + COMPONENT
				+ "/query", THE_SELECTION, false);

		assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode(),
				"a session write with no X-XSRF-TOKEN is refused before anything else: " + refused.getBody());

		// And it is refused by the filter, not by the cube: no rows were read and nothing says why
		// in words - which is why the tile could only show the reader the bare status (D4).
		assertFalse(String.valueOf(refused.getBody()).contains(GERMANY),
				"no row may travel in a refusal: " + refused.getBody());
	}

	/** The positive half: the same request, the same session, the cookie's token on it. */
	@Test
	void theSameRequestWithTheCookiesTokenIsAnsweredWithTheRows() throws Exception {

		ResponseEntity<String> answered = viewer.post("/api/reports/" + DASHBOARD + "/cube/" + COMPONENT
				+ "/query", THE_SELECTION, true);

		assertEquals(HttpStatus.OK, answered.getStatusCode(),
				"the only difference is the header: " + answered.getStatusCode() + " " + answered.getBody());

		Map<String, Double> revenue = revenueByCountry(answered.getBody());
		assertEquals(2, revenue.size(), "one row per country: " + answered.getBody());
		assertEquals(GERMAN_REVENUE, revenue.get(GERMANY), 0.001, "Germany's money: " + answered.getBody());
		assertEquals(FRENCH_REVENUE, revenue.get(FRANCE), 0.001, "France's money: " + answered.getBody());
	}

	/** Saving what the viewer just ticked is a PUT, and was refused for the same reason. */
	@Test
	void savingMyViewNeedsTheTokenAndWorksWithIt() {

		String path = "/api/reports/" + DASHBOARD + "/cube/" + COMPONENT + "/my-view";
		String view = "{\"selection\":{\"dimensions\":[\"Country\"],\"measures\":[\"Revenue\"]},\"collapsed\":false}";

		assertEquals(HttpStatus.FORBIDDEN, viewer.put(path, view, false).getStatusCode(),
				"this is the red \"Your view was not saved\" line");

		assertTrue(viewer.put(path, view, true).getStatusCode().is2xxSuccessful(),
				"and with the token the view is kept");
	}

	/**
	 * No regression for the callers the server exempts: an embedded page carries a token of its own
	 * and no session cookie, so it neither has a CSRF token nor needs one.
	 */
	@Test
	void anEmbeddedPageNeedsNoCsrfTokenAtAll() throws Exception {

		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.add("X-Embed-Token", embedTokens.mint(DASHBOARD, 0));

		ResponseEntity<String> answered = rest.exchange("http://localhost:" + port + "/api/reports/" + DASHBOARD
				+ "/cube/" + COMPONENT + "/query", HttpMethod.POST,
				new HttpEntity<>(THE_SELECTION, headers), String.class);

		assertEquals(HttpStatus.OK, answered.getStatusCode(),
				"an embed token is exempt and stays exempt: " + answered.getBody());
		assertEquals(GERMAN_REVENUE, revenueByCountry(answered.getBody()).get(GERMANY), 0.001,
				"and it is the same data: " + answered.getBody());
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** What the answer says each country spent. */
	private Map<String, Double> revenueByCountry(String body) throws Exception {

		JsonNode rows = JSON.readTree(body).path("rows");
		assertTrue(rows.isArray() && rows.size() > 0, "the answer carries rows: " + body);

		Map<String, Double> revenue = new LinkedHashMap<>();
		rows.forEach(row -> revenue.put(row.path("Country").asText(), row.path("Revenue").asDouble()));
		return revenue;
	}

	/** The group that lets this person reach the connection, created once. */
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

	/**
	 * A signed-in person, with the cookie jar a browser keeps - and with the CSRF header sent or
	 * left off by hand, because that choice is what this test is about.
	 */
	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = exchange(HttpMethod.POST, "/api/auth/login",
					"{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}", true);
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"every case here starts with a real sign-in: " + loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, true);
		}

		private ResponseEntity<String> post(String path, String body, boolean withCsrfHeader) {
			return exchange(HttpMethod.POST, path, body, withCsrfHeader);
		}

		private ResponseEntity<String> put(String path, String body, boolean withCsrfHeader) {
			return exchange(HttpMethod.PUT, path, body, withCsrfHeader);
		}

		private ResponseEntity<String> exchange(HttpMethod method, String path, String body,
				boolean withCsrfHeader) {

			HttpHeaders headers = new HttpHeaders();
			if (!cookies.isEmpty()) {
				List<String> pairs = new ArrayList<>();
				cookies.forEach((name, value) -> pairs.add(name + "=" + value));
				headers.add(HttpHeaders.COOKIE, String.join("; ", pairs));
			}
			// The one line the whole defect is about: the page reads the cookie the server issued
			// and sends it back. Left off, this is a browser that was made to ask on somebody's
			// behalf - which is the thing CSRF exists to refuse.
			if (withCsrfHeader && cookies.containsKey("XSRF-TOKEN"))
				headers.add("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
			if (body != null)
				headers.setContentType(MediaType.APPLICATION_JSON);

			ResponseEntity<String> answer = rest.exchange("http://localhost:" + port + path, method,
					new HttpEntity<>(body, headers), String.class);

			remember(answer.getHeaders().get(HttpHeaders.SET_COOKIE));
			return answer;
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

	/** Four orders, in two countries. */
	private static Path writeDatabase(Path file) throws Exception {

		Files.deleteIfExists(file);

		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + file);
				Statement statement = connection.createStatement()) {

			statement.executeUpdate("CREATE TABLE csrf_sales (id INTEGER PRIMARY KEY, country TEXT, amount REAL)");
			statement.executeUpdate("INSERT INTO csrf_sales VALUES (1, '" + GERMANY + "', 200)");
			statement.executeUpdate("INSERT INTO csrf_sales VALUES (2, '" + GERMANY + "', 100)");
			statement.executeUpdate("INSERT INTO csrf_sales VALUES (3, '" + FRANCE + "', 70)");
			statement.executeUpdate("INSERT INTO csrf_sales VALUES (4, '" + FRANCE + "', 50)");
		}

		return file.toAbsolutePath();
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

	/** One cube, one dimension, one measure: enough to have an answer worth asserting on. */
	private static void writeCube() throws Exception {

		Path cubeDir = root.resolve("config/cubes/" + CUBE);
		Files.createDirectories(cubeDir);

		Files.writeString(cubeDir.resolve("cube.xml"), String.join("\n",
				"<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
				"<cube>",
				"    <name>CSRF Sales</name>",
				"    <description>Sales by country</description>",
				"    <connectionId>" + CONNECTION + "</connectionId>",
				"</cube>",
				""));

		Files.writeString(cubeDir.resolve(CUBE + "-cube-config.groovy"), String.join("\n",
				"cube {",
				"  sql_table 'csrf_sales'",
				"  dimension { name 'Id'; sql '${CUBE}.id'; type 'number'; primary_key true }",
				"  dimension { name 'Country'; sql '${CUBE}.country'; type 'string' }",
				"  measure { name 'Revenue'; type 'sum'; sql '${CUBE}.amount' }",
				"}",
				""));
	}

	/** A published dashboard of one live cube: the widgets file is the lock the runtime reads. */
	private static void writeDashboard(String reportId) throws Exception {

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
		reporting.report.datasource.type = "ds.dashboard";
		reporting.report.datasource.sqloptions.conncode = CONNECTION;
		reporting.report.datasource.scriptoptions.conncode = CONNECTION;
		reporting.report.template.outputtype = "output.dashboard";
		installer.saveSettingsReporting(reporting, settingsPath);

		Files.writeString(reportDir.resolve(reportId + CubeWidgets.SUFFIX), String.join("\n",
				"{",
				"  \"" + COMPONENT + "\": {",
				"    \"cubeId\": \"" + CUBE + "\",",
				"    \"connectionId\": \"" + CONNECTION + "\",",
				"    \"initial\": { \"dimensions\": [\"Country\"], \"measures\": [\"Revenue\"] },",
				"    \"display\": \"table\",",
				"    \"saveView\": true",
				"  }",
				"}",
				""));
	}
}

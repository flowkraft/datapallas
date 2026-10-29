package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Base64;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.io.FileUtils;
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
import com.flowkraft.cubes.CubeWidgets;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * Try it on a desktop install: the dashboard opens in the user's own browser, which is signed in to
 * nothing.
 *
 * <h2>The way it opens</h2>
 * The desktop window is signed in by the installation key; the browser it hands the link to is not.
 * So the shell (app/main.ts, openInUsersBrowser) mints a read-only embed token for that one
 * dashboard with the key - {@code POST /api/embed/token}, eight hours - and opens
 * {@code /dashboard/<code>?token=<t>}. The page swaps it for a page token of its own, as it does for a
 * share link, and every widget reads with that. This walks the same: the mint as the shell makes it,
 * then the page, its config, its data and one live cube, by a caller holding nothing but the page's
 * answer.
 *
 * <h2>What the link must not open</h2>
 * Another dashboard (the token names one), any {@code /api/**} door with the token in the query
 * string (only the page reads it from the URL), and nothing at all once it has expired - which a
 * reader is told in words, not by a sign-in screen they have no account for. With no token the page
 * stays what it is for everyone else: the sign-in.
 */
/*
 * Its own application context: this test replaces the installation the server runs on, and reads
 * the installation key the server caches while it boots (see UnlimitedCallersJourneyTest).
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TryItLinkJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/try-it-link-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** A fixture value in a throwaway installation: no real key is read or printed here. */
	private static final String FIXTURE_API_KEY = "try-it-journey-fixture-api-key";

	/** What the shell asks for: a working day (DASHBOARD_LINK_TTL_SECONDS in app/main.ts). */
	private static final long LINK_TTL_SECONDS = 8 * 3600;

	private static final String CONNECTION = "db-try-it-sqlite";
	private static final String DASHBOARD = "try-it-dashboard";
	private static final String OTHER_DASHBOARD = "other-dashboard";
	private static final String CUBE_COMPONENT = "cube1";
	private static final String CUBE = "try-it-sales";

	private static final String QUERY = "SELECT id, country, amount FROM try_it_sales";
	private static final String GERMANY = "Germany";
	private static final double GERMAN_REVENUE = 300d;

	private static final Pattern EMBED_TOKEN_IN_PAGE = Pattern.compile("embed-token=\"([^\"]+)\"");

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
			Files.createDirectories(root.resolve("config/_internal"));
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

			// Written before the context starts, because ApiKeyManager generates one in @PostConstruct
			// when the file is missing.
			Files.writeString(root.resolve("config/_internal/api-key.txt"), FIXTURE_API_KEY);

			installer = new ReportsService();
			ReflectionTestUtils.setField(installer, "fileSystemService", new FileSystemService());

			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/burst/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/_defaults/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), root.resolve("config/_defaults/reporting.xml").toFile());

			database = writeDatabase(root.resolve("db/sales.db"));
			writeConnection(CONNECTION);
			writeCube();
			writeDashboard(DASHBOARD);
			writeDashboard(OTHER_DASHBOARD);
		} catch (Exception installationFailed) {
			throw new ExceptionInInitializerError(installationFailed);
		}
	}

	@LocalServerPort
	private int port;

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private EmbedTokenService embedTokenService;

	// ============================================================
	// the whole page, opened as Try it opens it
	// ============================================================

	@Test
	void theLinkTheShellOpensRendersTheWholeDashboardWithoutASignIn() throws Exception {

		String linkToken = mintAsTheShellDoes(DASHBOARD);

		ResponseEntity<String> page = anonymous(HttpMethod.GET, "/dashboard/" + DASHBOARD + "?token=" + linkToken,
				null, null);
		assertEquals(HttpStatus.OK, page.getStatusCode(),
				"the link Try it opens must be the dashboard, not the sign-in: " + page.getStatusCode()
						+ " " + page.getHeaders().getLocation());
		assertTrue(page.getBody().contains("report-id=\"" + DASHBOARD + "\""),
				"the page served is this dashboard's page: " + page.getBody());

		String pageToken = embedTokenOf(page);
		assertNotNull(pageToken, "the page must hand its components a credential: " + page.getBody());
		assertTrue(expiryOf(pageToken) <= expiryOf(linkToken),
				"the page's own token is the short one; the link's lasts the working day");

		JsonNode config = json(anonymous(HttpMethod.GET, "/api/reports/" + DASHBOARD + "/config", null, pageToken));
		assertEquals(DASHBOARD, config.path("reportCode").asText(), "the config is this dashboard's: " + config);

		JsonNode data = json(anonymous(HttpMethod.GET, "/api/reports/" + DASHBOARD + "/data", null, pageToken));
		assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
				"the data door answered with an error row, not with data: " + data.path("data").path(0));
		assertEquals(4, data.path("totalRows").asInt(), "the dashboard's own rows came back: " + data);

		JsonNode cube = json(anonymous(HttpMethod.POST,
				"/api/reports/" + DASHBOARD + "/cube/" + CUBE_COMPONENT + "/query",
				"{\"dimensions\":[\"Country\"],\"measures\":[\"Revenue\"]}", pageToken));
		double germany = 0;
		for (JsonNode row : cube.path("rows"))
			if (GERMANY.equals(row.path("Country").asText()))
				germany = row.path("Revenue").asDouble();
		assertEquals(GERMAN_REVENUE, germany, 0.001, "the live cube answers the page's token: " + cube);
	}

	// ============================================================
	// what the link does not open
	// ============================================================

	@Test
	void theLinkOpensItsOwnDashboardAndNoOther() throws Exception {

		String linkToken = mintAsTheShellDoes(DASHBOARD);

		ResponseEntity<String> other = anonymous(HttpMethod.GET,
				"/dashboard/" + OTHER_DASHBOARD + "?token=" + linkToken, null, null);
		assertEquals(HttpStatus.NOT_FOUND, other.getStatusCode(),
				"a link for one dashboard opens no other: " + other.getStatusCode());
		assertFalse(String.valueOf(other.getBody()).contains("<rb-dashboard"),
				"and serves nothing of it: " + other.getBody());
		assertFalse(String.valueOf(other.getBody()).contains("embed-token="),
				"nor a credential: " + other.getBody());
	}

	@Test
	void theApiNeverReadsTheLinksTokenFromTheUrl() throws Exception {

		String linkToken = mintAsTheShellDoes(DASHBOARD);

		for (String door : new String[] { "/api/reports/" + DASHBOARD + "/config",
				"/api/reports/" + DASHBOARD + "/data" }) {
			ResponseEntity<String> refused = anonymous(HttpMethod.GET, door + "?token=" + linkToken, null, null);
			assertEquals(HttpStatus.UNAUTHORIZED, refused.getStatusCode(),
					door + " must not take an embed token from its query string: " + refused.getBody());
		}

		ResponseEntity<String> cube = anonymous(HttpMethod.POST,
				"/api/reports/" + DASHBOARD + "/cube/" + CUBE_COMPONENT + "/query?token=" + linkToken,
				"{\"dimensions\":[\"Country\"],\"measures\":[\"Revenue\"]}", null);
		assertFalse(cube.getStatusCode().is2xxSuccessful(),
				"nor the live cube: " + cube.getStatusCode() + " " + cube.getBody());
		assertFalse(String.valueOf(cube.getBody()).contains(GERMANY), "and no row travels: " + cube.getBody());
	}

	@Test
	void anExpiredLinkSaysItIsNoLongerAvailable() throws Exception {

		String expired = expiredToken(DASHBOARD);
		assertTrue(embedTokenService.verify(expired).isEmpty(), "the fixture is an expired token");

		ResponseEntity<String> page = anonymous(HttpMethod.GET, "/dashboard/" + DASHBOARD + "?token=" + expired,
				null, null);
		assertEquals(HttpStatus.NOT_FOUND, page.getStatusCode(),
				"an expired link is not the sign-in: " + page.getStatusCode() + " " + page.getHeaders().getLocation());
		assertTrue(String.valueOf(page.getBody()).contains("no longer available"),
				"it says so in words: " + page.getBody());
	}

	@Test
	void withNoTokenTheDashboardIsTheSignInAsBefore() throws Exception {

		// The redirect itself, not where it leads: this server has no Angular bundle to land on.
		HttpResponse<String> page = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
				.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/dashboard/" + DASHBOARD))
						.GET().build(), HttpResponse.BodyHandlers.ofString());
		assertEquals(HttpStatus.FOUND.value(), page.statusCode(), "no token, no dashboard: " + page.statusCode());
		assertTrue(page.headers().firstValue("Location").orElse("").contains("/#/login"),
				"the reader is sent to sign in: " + page.headers().firstValue("Location"));
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** The request openInUsersBrowser makes: the installation key, the report, eight hours. */
	private String mintAsTheShellDoes(String reportId) throws Exception {

		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.add("X-API-Key", FIXTURE_API_KEY);

		ResponseEntity<String> minted = rest.exchange("http://localhost:" + port + "/api/embed/token",
				HttpMethod.POST,
				new HttpEntity<>(JSON.writeValueAsString(Map.of("reportId", reportId, "ttlSeconds", LINK_TTL_SECONDS)),
						headers),
				String.class);

		JsonNode answer = json(minted);
		assertEquals(LINK_TTL_SECONDS, answer.path("expiresInSeconds").asLong(),
				"the link's token lives the working day the shell asks for: " + answer);
		return answer.path("token").asText();
	}

	/**
	 * A token this server signed, whose time is up: the real signature over an {@code exp} in the
	 * past. Re-signed through the service's own key, read by reflection, so the only thing wrong with
	 * it is the clock.
	 */
	private String expiredToken(String reportId) throws Exception {

		String header = Base64.getUrlEncoder().withoutPadding()
				.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
		String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(
				("{\"rid\":\"" + reportId + "\",\"exp\":" + (System.currentTimeMillis() / 1000 - 60) + "}")
						.getBytes(StandardCharsets.UTF_8));
		String signature = (String) ReflectionTestUtils.invokeMethod(embedTokenService, "sign",
				header + "." + payload);
		return header + "." + payload + "." + signature;
	}

	private long expiryOf(String embedToken) throws Exception {
		String payload = new String(Base64.getUrlDecoder().decode(embedToken.split("\\.")[1]),
				StandardCharsets.UTF_8);
		return JSON.readTree(payload).path("exp").asLong();
	}

	private String embedTokenOf(ResponseEntity<String> page) {
		Matcher found = EMBED_TOKEN_IN_PAGE.matcher(String.valueOf(page.getBody()));
		return found.find() ? found.group(1) : null;
	}

	/** No cookie, no session, no CSRF token: the user's browser, holding at most the page's token. */
	private ResponseEntity<String> anonymous(HttpMethod method, String path, String body, String embedToken) {

		HttpHeaders headers = new HttpHeaders();
		if (embedToken != null)
			headers.add("X-Embed-Token", embedToken);
		if (body != null)
			headers.setContentType(MediaType.APPLICATION_JSON);

		return rest.exchange("http://localhost:" + port + path, method, new HttpEntity<>(body, headers),
				String.class);
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	// ============================================================
	// the installation on disk
	// ============================================================

	/** Four orders, in two countries. */
	private static Path writeDatabase(Path file) throws Exception {

		Files.deleteIfExists(file);

		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + file);
				Statement statement = connection.createStatement()) {

			statement.executeUpdate("CREATE TABLE try_it_sales (id INTEGER PRIMARY KEY, country TEXT, amount REAL)");
			statement.executeUpdate("INSERT INTO try_it_sales VALUES (1, '" + GERMANY + "', 200)");
			statement.executeUpdate("INSERT INTO try_it_sales VALUES (2, '" + GERMANY + "', 100)");
			statement.executeUpdate("INSERT INTO try_it_sales VALUES (3, 'France', 70)");
			statement.executeUpdate("INSERT INTO try_it_sales VALUES (4, 'France', 50)");
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

	private static void writeCube() throws Exception {

		Path cubeDir = root.resolve("config/cubes/" + CUBE);
		Files.createDirectories(cubeDir);

		Files.writeString(cubeDir.resolve("cube.xml"), String.join("\n",
				"<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
				"<cube>",
				"    <name>Try It Sales</name>",
				"    <description>Sales by country</description>",
				"    <connectionId>" + CONNECTION + "</connectionId>",
				"</cube>",
				""));

		Files.writeString(cubeDir.resolve(CUBE + "-cube-config.groovy"), String.join("\n",
				"cube {",
				"  sql_table 'try_it_sales'",
				"  dimension { name 'Id'; sql '${CUBE}.id'; type 'number'; primary_key true }",
				"  dimension { name 'Country'; sql '${CUBE}.country'; type 'string' }",
				"  measure { name 'Revenue'; type 'sum'; sql '${CUBE}.amount' }",
				"}",
				""));
	}

	/**
	 * A published dashboard as the canvas writes one: a script that fetches the rows, the template
	 * that holds the widget, and the widgets file of its one live cube.
	 */
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

		String scriptName = reportId + "-script.groovy";

		ReportingSettings reporting = installer.loadSettingsReporting(settingsPath);
		reporting.report.datasource.type = "ds.dashboard";
		reporting.report.datasource.sqloptions.conncode = CONNECTION;
		reporting.report.datasource.sqloptions.query = QUERY;
		reporting.report.datasource.sqloptions.idcolumn = "id";
		reporting.report.datasource.sqloptions.scriptname = scriptName;
		reporting.report.datasource.scriptoptions.conncode = CONNECTION;
		reporting.report.datasource.scriptoptions.scriptname = scriptName;
		reporting.report.template.outputtype = "output.dashboard";
		reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";
		installer.saveSettingsReporting(reporting, settingsPath);

		Files.writeString(reportDir.resolve(scriptName), String.join("\n",
				"def dbSql = ctx.dbSql",
				"ctx.reportData('sales', dbSql.rows('" + QUERY + "'))",
				""));

		Path templateDir = root.resolve("templates/reports/" + reportId);
		Files.createDirectories(templateDir);
		Files.writeString(templateDir.resolve(reportId + "-template.html"), String.join("\n",
				"<div class=\"rb-dashboard-root\" data-report=\"" + reportId + "\">",
				"  <rb-tabulator component-id=\"sales\" api-base-url=\"http://localhost:9090/api\"></rb-tabulator>",
				"</div>",
				""));

		Files.writeString(reportDir.resolve(reportId + CubeWidgets.SUFFIX), String.join("\n",
				"{",
				"  \"" + CUBE_COMPONENT + "\": {",
				"    \"cubeId\": \"" + CUBE + "\",",
				"    \"connectionId\": \"" + CONNECTION + "\",",
				"    \"initial\": { \"dimensions\": [\"Country\"], \"measures\": [\"Revenue\"] },",
				"    \"display\": \"table\"",
				"  }",
				"}",
				""));
	}
}

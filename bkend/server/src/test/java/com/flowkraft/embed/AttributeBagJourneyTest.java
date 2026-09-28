package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The viewer this installation has no account for: {@code ${dp_attr_&lt;name&gt;}}, end to end.
 *
 * <h2>What the bag is for</h2>
 * A host portal renders a page for its own signed-in customer and mints a token saying "this viewer
 * is customer 4711"; the widget writes {@code WHERE customer_id = ${dp_attr_customer_id}} and that
 * viewer sees three rows where another sees two. Nobody signs in here, and no account is created —
 * which is the only way a dashboard can be embedded in somebody else's application at all.
 *
 * <h2>Why over HTTP, anonymously</h2>
 * Every case below is a request with no cookie, no session and no CSRF token: a header token, or a
 * share link's {@code ?token=}, and nothing else. That is exactly what a recipient has, and the
 * property being tested is a property of the chain — {@link EmbedTokenService} signs it,
 * {@link EmbedTokenAuthorizationManager} is the only thing that may believe it,
 * {@link UserVariables} turns it into variables, and the published script binds them.
 *
 * <h2>The negatives are the point</h2>
 * An attribute that does not arrive must show <em>no</em> row rather than every row; a viewer who
 * types {@code ?dp_attr_customer_id=…} must change nothing; a name that could never be read from
 * SQL must be refused while the host application is still there to be told; and a zone must come
 * from the signed token rather than from the query string, because {@code ${dp_today}} decides
 * which rows somebody sees.
 */
/*
 * Its own application context: this test replaces the installation the server runs on, and the
 * RANDOM_PORT journey tests would otherwise share one server booted on whichever installation was
 * set first. See UnlimitedCallersJourneyTest for the whole mechanism.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AttributeBagJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/attribute-bag-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-attribute-bag-sqlite";

	/** A fixed moment, because two of the variables are a date and a timestamp. */
	private static final Instant NOW = Instant.parse("2026-09-28T00:30:00Z");
	private static final ZoneId EAST = ZoneId.of("Pacific/Kiritimati");
	private static final ZoneId WEST = ZoneId.of("Pacific/Pago_Pago");
	private static final String EAST_TODAY = "2026-09-28";
	private static final String WEST_TODAY = "2026-09-27";

	/** The server's own zone, which is what a token that asks for none falls back to. */
	private static final ZoneId SERVER_ZONE = EAST;

	private static final String ONE_CUSTOMER = "4711";
	private static final String ANOTHER_CUSTOMER = "4712";

	private static final String ADMIN = "tvaldez";
	private static final String PASSWORD = "attribute-bag-fixture-pw";

	// One widget each, so /data answers with that widget's rows and nothing else.
	private static final String CUSTOMER_DASHBOARD = "attr-customer-dashboard";
	private static final String REGION_DASHBOARD = "attr-region-dashboard";
	private static final String TODAY_DASHBOARD = "attr-today-dashboard";
	private static final String ECHO_DASHBOARD = "attr-echo-dashboard";

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

			database = writeDatabase(root.resolve("db/accounts.db"));
			writeConnection(CONNECTION);

			writeDashboard(CUSTOMER_DASHBOARD,
					"SELECT id FROM af_rows\nWHERE customer_id = ${dp_attr_customer_id}");
			writeDashboard(REGION_DASHBOARD, "SELECT id FROM af_rows\nWHERE region = ${dp_attr_region}");
			writeDashboard(TODAY_DASHBOARD, "SELECT id FROM af_rows\nWHERE close_date = ${dp_today}");
			writeDashboard(ECHO_DASHBOARD, "SELECT ${dp_attr_customer_id} AS cust, ${dp_user_timezone} AS zone,"
					+ " ${dp_user_locale} AS tag, ${dp_today} AS today FROM af_rows LIMIT 1");
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

	@Autowired
	private ShareTokenService shareTokenService;

	@Autowired
	private IamService iamService;

	@Autowired
	private UserVariables userVariables;

	@BeforeEach
	void aFixedMomentAndOnePersonWhoDoesHaveAnAccount() {

		userVariables.setClock(Clock.fixed(NOW, SERVER_ZONE));

		if (iamService.findUser(ADMIN).isEmpty())
			iamService.createUser(ADMIN, ADMIN + "@example.com", PASSWORD, Role.ADMIN, Tenant.DEFAULT_CODE);

		// Set every time, so a test that changes a preference leaves the next one as it found it.
		iamService.setUserPreferences(ADMIN, "", "");
		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, "", "");
	}

	// ============================================================
	// the positive half: the host application says who the viewer is
	// ============================================================

	@Test
	void theSameWidgetGivesEachEmbeddedViewerTheirOwnCustomersRows() throws Exception {

		assertEquals(3, rowsWithToken(CUSTOMER_DASHBOARD, tokenFor(CUSTOMER_DASHBOARD, ONE_CUSTOMER)),
				"customer " + ONE_CUSTOMER + "'s rows, named by the token and by nothing else");

		assertEquals(2, rowsWithToken(CUSTOMER_DASHBOARD, tokenFor(CUSTOMER_DASHBOARD, ANOTHER_CUSTOMER)),
				"the very same widget, for the customer the next token names");
	}

	@Test
	void aShareLinkCarriesAnAttributeTheSameWay() throws Exception {

		String link = shareTokenService.createShareToken(CUSTOMER_DASHBOARD, null, null,
				Map.of("customer_id", ANOTHER_CUSTOMER));

		assertEquals(2, rowsWithShareLink(CUSTOMER_DASHBOARD, link),
				"a link created for one customer shows that customer's rows and no others");
	}

	@Test
	void anAttributeTheWidgetNamesAndTheTokenDoesNotCarryShowsNoRow() throws Exception {

		// The leak this whole feature exists to prevent. The line is never dropped, so the missing
		// attribute binds as nothing and matches nothing; drop it and the answer is every row.
		assertEquals(0, rowsWithToken(REGION_DASHBOARD, tokenFor(REGION_DASHBOARD, ONE_CUSTOMER)),
				"a widget filtering on an attribute nobody handed over must show nothing, not everything");
	}

	@Test
	void aSignedInPersonHasEveryAttributeEmpty() throws Exception {

		Session admin = new Session(ADMIN, PASSWORD);

		assertEquals(0, rows(admin.get("/api/reports/" + CUSTOMER_DASHBOARD + "/data")),
				"attributes describe a viewer a credential vouches for, and a session vouches for none");

		JsonNode echoed = echo(admin.get("/api/reports/" + ECHO_DASHBOARD + "/data"));
		assertTrue(isEmptyValue(echoed.path("cust")),
				"${dp_attr_customer_id} is empty for somebody who signed in: " + echoed);
	}

	// ============================================================
	// the negative half
	// ============================================================

	@Test
	void namingAnAttributeInTheQueryStringChangesNothing() throws Exception {

		String token = tokenFor(CUSTOMER_DASHBOARD, ONE_CUSTOMER);

		// The server's values are merged after the query string is read, and an attribute is read
		// from the verified credential and from nowhere else. Take either away and this goes red.
		assertEquals(3, rowsWithToken(CUSTOMER_DASHBOARD, token,
				"dp_attr_customer_id=" + ANOTHER_CUSTOMER),
				"the viewer asking to be another customer still gets their own rows");

		String link = shareTokenService.createShareToken(CUSTOMER_DASHBOARD, null, null,
				Map.of("customer_id", ONE_CUSTOMER));

		assertEquals(3, rows(anonymous(HttpMethod.GET, "/api/reports/" + CUSTOMER_DASHBOARD + "/data?token=" + link
				+ "&dp_attr_customer_id=" + ANOTHER_CUSTOMER, null, null)),
				"and the same through a share link, where the token is already in the query string");
	}

	@Test
	void anAttributeNameThatCouldNotBeReadFromSqlIsRefusedWhereItIsCreated() {

		for (String impossible : List.of("Customer-ID", "1st")) {

			IllegalArgumentException refusedAtMint = assertThrows(IllegalArgumentException.class,
					() -> embedTokenService.mint(CUSTOMER_DASHBOARD, 600, null, Map.of(impossible, "4711"), null,
							null),
					"'" + impossible + "' can never be written as ${dp_attr_…}, so it must not be mintable");

			assertTrue(refusedAtMint.getMessage().contains(impossible),
					"and the refusal names it: " + refusedAtMint.getMessage());
		}

		// An ordinary name goes through the same door, so the refusal is about the name and not
		// about attributes being unmintable.
		assertFalse(embedTokenService.mint(CUSTOMER_DASHBOARD, 600, null, Map.of("customer_id", ONE_CUSTOMER),
				null, null).isBlank());

		// The link door too — its names are checked when the link is created, for the same reason:
		// afterwards there is nobody to tell, and an attribute nothing can read is a filter that
		// quietly stops filtering.
		Session admin = new Session(ADMIN, PASSWORD);

		ResponseEntity<String> refusedLink = admin.postJson("/api/embed/share-link",
				Map.of("reportId", CUSTOMER_DASHBOARD, "attributes", Map.of("Customer-ID", ONE_CUSTOMER)));
		assertEquals(HttpStatus.BAD_REQUEST, refusedLink.getStatusCode(),
				"a share link may not carry an unreadable attribute name: " + refusedLink.getBody());

		ResponseEntity<String> acceptedLink = admin.postJson("/api/embed/share-link",
				Map.of("reportId", CUSTOMER_DASHBOARD, "attributes", Map.of("customer_id", ONE_CUSTOMER)));
		assertTrue(acceptedLink.getStatusCode().is2xxSuccessful(),
				"and an ordinary one is created: " + acceptedLink.getStatusCode() + " " + acceptedLink.getBody());
	}

	@Test
	void aTokensZoneMovesItsViewersTodayAndAQueryStringValueDoesNot() throws Exception {

		String inTheWest = embedTokenService.mint(TODAY_DASHBOARD, 600, null,
				Map.of("customer_id", ONE_CUSTOMER), WEST.getId(), "fr-FR");
		String saysNothing = tokenFor(TODAY_DASHBOARD, ONE_CUSTOMER);

		assertEquals(2, rowsWithToken(TODAY_DASHBOARD, inTheWest),
				"the token says its viewer is in " + WEST + ", so ${dp_today} is " + WEST_TODAY);
		assertEquals(1, rowsWithToken(TODAY_DASHBOARD, saysNothing),
				"a token that says nothing gets the server's today, " + EAST_TODAY);

		// The zone is a claim of a signed token, never a value the viewer types: one that could be
		// typed would let a viewer pick which day's rows they are shown.
		assertEquals(1, rowsWithToken(TODAY_DASHBOARD, saysNothing, "tz=" + WEST.getId()
				+ "&dp_user_timezone=" + WEST.getId()),
				"asking for another zone in the query string changes nothing");

		JsonNode echoed = echo(withEmbedToken(HttpMethod.GET, "/api/reports/" + ECHO_DASHBOARD + "/data", null,
				embedTokenService.mint(ECHO_DASHBOARD, 600, null, Map.of("customer_id", ONE_CUSTOMER), WEST.getId(),
						"fr-FR")));

		assertEquals(ONE_CUSTOMER, echoed.path("cust").asText(), "the attribute, as the database received it");
		assertEquals(WEST.getId(), echoed.path("zone").asText(), "the token's zone");
		assertEquals(WEST_TODAY, echoed.path("today").asText(), "and therefore the token's today");
		assertEquals("fr-FR", echoed.path("tag").asText(), "and the token's language tag");
	}

	@Test
	void aTenantThatSaysWhereItsPeopleAreStillLosesToTheToken() throws Exception {

		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, EAST.getId(), "en-GB");

		String inTheWest = embedTokenService.mint(ECHO_DASHBOARD, 600, null, Map.of(), WEST.getId(), null);

		JsonNode echoed = echo(withEmbedToken(HttpMethod.GET, "/api/reports/" + ECHO_DASHBOARD + "/data", null,
				inTheWest));

		assertEquals(WEST.getId(), echoed.path("zone").asText(),
				"the host application knows where its own customer is; the tenant is the fallback: " + echoed);
		assertEquals("en-GB", echoed.path("tag").asText(),
				"and what the token does not say, the tenant still answers: " + echoed);
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** A token for this dashboard, minted for one customer, the way a host application mints one. */
	private String tokenFor(String reportId, String customerId) {
		return embedTokenService.mint(reportId, 600, null, Map.of("customer_id", customerId), null, null);
	}

	private int rowsWithToken(String reportId, String embedToken) throws Exception {
		return rowsWithToken(reportId, embedToken, "");
	}

	private int rowsWithToken(String reportId, String embedToken, String queryString) throws Exception {
		return rows(withEmbedToken(HttpMethod.GET, "/api/reports/" + reportId + "/data"
				+ (queryString.isEmpty() ? "" : "?" + queryString), null, embedToken));
	}

	private int rowsWithShareLink(String reportId, String shareToken) throws Exception {
		return rows(anonymous(HttpMethod.GET, "/api/reports/" + reportId + "/data?token=" + shareToken, null, null));
	}

	/**
	 * How many rows the one widget answered with. A failed fetch comes back 200 carrying one
	 * ERROR_MESSAGE row, so the rows are read rather than the status.
	 */
	private int rows(ResponseEntity<String> answer) throws Exception {

		JsonNode data = json(answer);

		assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
				"the widget failed rather than answered: " + data.path("data").path(0));

		return data.path("totalRows").asInt();
	}

	/** The one row of the echo dashboard: the variables as the database received them. */
	private JsonNode echo(ResponseEntity<String> answer) throws Exception {
		JsonNode data = json(answer);
		JsonNode row = data.path("data").path(0);
		assertFalse(row.isMissingNode(), "the echo widget answered with no row at all: " + data);
		return row;
	}

	/** SQL NULL and the empty string are the same answer here: a value that matches no row. */
	private boolean isEmptyValue(JsonNode value) {
		return value.isMissingNode() || value.isNull() || value.asText("").isEmpty();
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		return JSON.readTree(answer.getBody());
	}

	private ResponseEntity<String> withEmbedToken(HttpMethod method, String path, Object body, String embedToken) {
		return anonymous(method, path, body, embedToken);
	}

	/** No cookie, no session, no CSRF token — everything a link recipient does not have. */
	private ResponseEntity<String> anonymous(HttpMethod method, String path, Object body, String embedToken) {

		HttpHeaders headers = new HttpHeaders();
		if (embedToken != null)
			headers.add("X-Embed-Token", embedToken);
		if (body != null)
			headers.setContentType(MediaType.APPLICATION_JSON);

		return rest.exchange("http://localhost:" + port + path, method, new HttpEntity<>(bodyOf(body), headers),
				String.class);
	}

	private static Object bodyOf(Object body) {
		if (body == null || body instanceof String)
			return body;
		try {
			return JSON.writeValueAsString(body);
		} catch (Exception notSerializable) {
			throw new IllegalStateException(notSerializable);
		}
	}

	/** A signed-in person: the cookie jar and the CSRF header the Angular app sends. */
	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = exchange(HttpMethod.POST, "/api/auth/login",
					Map.of("username", username, "password", password), MediaType.APPLICATION_JSON);
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"this case starts with a real sign-in: " + loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, null);
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
	 * Six rows: three for one customer, two for another, one for a third, on three different days.
	 * Written here rather than taken from a shipped sample, because every count this test asserts
	 * is a property of exactly these rows.
	 */
	private static Path writeDatabase(Path file) throws Exception {

		Files.deleteIfExists(file);

		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + file);
				Statement statement = connection.createStatement()) {

			statement.executeUpdate("CREATE TABLE af_rows ("
					+ "id INTEGER PRIMARY KEY, customer_id TEXT, region TEXT, close_date DATE)");

			insert(statement, 1, ONE_CUSTOMER, "EMEA", EAST_TODAY);
			insert(statement, 2, ONE_CUSTOMER, "APAC", WEST_TODAY);
			insert(statement, 3, ONE_CUSTOMER, "APAC", "2019-05-05");
			insert(statement, 4, ANOTHER_CUSTOMER, "EMEA", WEST_TODAY);
			insert(statement, 5, ANOTHER_CUSTOMER, "APAC", "2019-05-05");
			insert(statement, 6, "9999", "APAC", "2019-05-05");
		}

		return file.toAbsolutePath();
	}

	private static void insert(Statement statement, int id, String customerId, String region, String closeDate)
			throws Exception {
		statement.executeUpdate("INSERT INTO af_rows VALUES (" + id + ", '" + customerId + "', '" + region + "', '"
				+ closeDate + "')");
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
	 * A published dashboard of one widget, written the way {@code CanvasExportService} writes one —
	 * with the script {@link ScriptAssembler} really assembles, because the {@code ${dp_attr_…}}
	 * declaration this test is about is written by the assembler and by nothing else.
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

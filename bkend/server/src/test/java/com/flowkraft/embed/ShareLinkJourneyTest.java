package com.flowkraft.embed;

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
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.io.FileUtils;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.ServerApplication;
import com.flowkraft.common.AppPaths;
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
 * Someone with no DataPallas account opens a share link, and the dashboard renders completely — or
 * not at all, never half.
 *
 * <h2>What "half" means here, and why it needs a test of its own</h2>
 * A share-linked dashboard is not one request. It is the page, then the report's config, then the
 * data behind every widget, then a server-side pivot for the pivot widget — and the visitor has no
 * session, so every single one of them is authorised by the token or by nothing at all. A
 * credential that opens the page and not the data produces no error anybody reports: it produces a
 * page that looks like the dashboard, with empty tiles. So this walks the whole sequence the page
 * makes, in the order it makes it, and asserts each answer carries what the widget needed —
 * {@code totalRows}, real cells, a report code — rather than merely a 2xx.
 *
 * <h2>The negatives are the same sequence</h2>
 * Two of them, because they fail differently. <b>No token at all</b> is the stranger who was
 * forwarded the URL without the {@code ?token=}; <b>a token for another dashboard</b> is the
 * recipient of one link trying it on another, which is the case the whole design rests on: one
 * link, one report. In both, every door refuses, and no answer contains a row of the data, the
 * connection the dashboard reads, or the page it would have served.
 *
 * <h2>Expiry</h2>
 * The last test holds the decision recorded in {@link com.flowkraft.reports.DashboardController}:
 * the page renews itself from the still-valid share token before the embed token it was given can
 * expire. A test for that decision is a test that the renewal really mints a new, working
 * credential — not that a line of script is present.
 */
/*
 * Its own application context, because this test replaces the installation the server runs on: the
 * RANDOM_PORT journey tests all carry the same @SpringBootTest annotation, so without this they
 * share one server, booted on whichever installation happened to be set first. The comment on
 * UnlimitedCallersJourneyTest has the whole mechanism.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ShareLinkJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/share-link-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-shared-sqlite";

	/** The dashboard the link in this test opens. */
	private static final String SHARED_DASHBOARD = "quarterly-dashboard";
	/** A second published dashboard, so "a token for another report" is a real token, not a broken one. */
	private static final String OTHER_DASHBOARD = "payroll-dashboard";

	private static final String QUERY = "SELECT CustomerID, CompanyName, Country FROM \"Customers\"";
	private static final String TABLE = "Customers";

	private static final Pattern EMBED_TOKEN_IN_PAGE = Pattern.compile("embed-token=\"([^\"]+)\"");
	private static final Pattern RELOAD_DELAY_IN_PAGE = Pattern.compile("window\\.location\\.reload\\(\\); \\}, (\\d+)\\)");

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

			northwind = NorthwindFixture.writableSqliteCopy(root.resolve("db/northwind.db"));

			writeConnection(CONNECTION);
			writeDashboard(SHARED_DASHBOARD);
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
	private ShareTokenService shareTokenService;

	// ============================================================
	// the whole page, for a visitor who has nothing but the link
	// ============================================================

	@Test
	void everyRequestAShareLinkedDashboardMakesIsAuthorisedByItsToken() throws Exception {

		String shareToken = shareTokenService.createShareToken(SHARED_DASHBOARD, null);

		// 1 - the page. What makes it the dashboard rather than a sign-in redirect is the report it
		// hands the web component, and what makes it usable is the credential it hands it with.
		ResponseEntity<String> page = anonymous(HttpMethod.GET,
				"/dashboard/" + SHARED_DASHBOARD + "?token=" + shareToken, null, null);
		assertEquals(HttpStatus.OK, page.getStatusCode(),
				"a visitor holding the link must get the dashboard page: " + page.getStatusCode());
		assertTrue(page.getBody().contains("report-id=\"" + SHARED_DASHBOARD + "\""),
				"the page served is this dashboard's page: " + page.getBody());

		String embedToken = embedTokenOf(page);
		assertNotNull(embedToken, "the page must hand its components a credential: " + page.getBody());

		List<String> closed = new ArrayList<>();

		// 2 - the config every rb-* widget on that page reads before it reads anything else.
		door(closed, "the report config", () -> {
			JsonNode config = json(withEmbedToken(HttpMethod.GET,
					"/api/reports/" + SHARED_DASHBOARD + "/config", null, embedToken));
			assertEquals(SHARED_DASHBOARD, config.path("reportCode").asText(),
					"the config that came back is this dashboard's: " + config);
			assertEquals("output.dashboard", config.path("outputType").asText(),
					"and it is a published dashboard's config: " + config);
		});

		// 3 - the data behind the widgets. A failed fetch comes back 200 carrying one ERROR_MESSAGE
		// row (CliJob.doFetchData), which is precisely the empty tile this test exists to catch, so
		// the rows are checked rather than the status.
		door(closed, "the report data", () -> {
			JsonNode data = json(withEmbedToken(HttpMethod.GET,
					"/api/reports/" + SHARED_DASHBOARD + "/data", null, embedToken));
			assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
					"the data door answered with an error row, not with data: " + data.path("data").path(0));
			assertEquals(countCustomers(), data.path("totalRows").asInt(),
					"the dashboard's own rows came back: " + data.path("totalRows").asInt());
			assertFalse(data.path("data").path(0).path("CompanyName").asText().isBlank(),
					"the rows carry real values, not empty cells: " + data.path("data").path(0));
		});

		// 4 - the same data a widget asks for by component id, which is how a dashboard's tiles ask.
		door(closed, "the data of one widget", () -> {
			JsonNode data = json(withEmbedToken(HttpMethod.GET,
					"/api/reports/" + SHARED_DASHBOARD + "/data?componentId=customers", null, embedToken));
			assertTrue(data.path("totalRows").asInt() > 0,
					"a widget asking for its own component's rows got none: " + data);
		});

		// 5 - the server-side pivot the pivot widget uses instead of aggregating in the browser.
		door(closed, "the server-side pivot of the report", () -> {
			JsonNode pivot = json(withEmbedToken(HttpMethod.POST,
					"/api/analytics/pivot?reportId=" + SHARED_DASHBOARD, pivotBody(), embedToken));
			assertTrue(cellCount(pivot) > 0, "a pivot with no cells is not a pivot: " + pivot);
		});

		assertTrue(closed.isEmpty(),
				"a share link must open the whole dashboard, and " + closed.size()
						+ " of its requests did not:\n" + String.join("\n", closed));
	}

	// ============================================================
	// the same sequence, without a credential and with the wrong one
	// ============================================================

	@Test
	void theSameSequenceWithoutATokenIsRefusedAtEveryStepAndLeaksNothing() throws Exception {

		String aCompanyInTheDatabase = firstCompanyName();
		List<String> leaked = new ArrayList<>();

		refusesAndSaysNothing(leaked, "the dashboard page",
				anonymous(HttpMethod.GET, "/dashboard/" + SHARED_DASHBOARD, null, null), aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report config",
				anonymous(HttpMethod.GET, "/api/reports/" + SHARED_DASHBOARD + "/config", null, null),
				aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report data",
				anonymous(HttpMethod.GET, "/api/reports/" + SHARED_DASHBOARD + "/data", null, null),
				aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the server-side pivot of the report",
				anonymous(HttpMethod.POST, "/api/analytics/pivot?reportId=" + SHARED_DASHBOARD, pivotBody(), null),
				aCompanyInTheDatabase);

		assertTrue(leaked.isEmpty(),
				"a visitor with no credential must be refused at every door, and told nothing:\n"
						+ String.join("\n", leaked));
	}

	@Test
	void aTokenForAnotherDashboardOpensNoDoorOfThisOne() throws Exception {

		String aCompanyInTheDatabase = firstCompanyName();

		// A real, working link — to the other dashboard. That is what makes this test about scope
		// rather than about validity: the same token opens everything it was minted for, below.
		String otherShareToken = shareTokenService.createShareToken(OTHER_DASHBOARD, null);
		ResponseEntity<String> otherPage = anonymous(HttpMethod.GET,
				"/dashboard/" + OTHER_DASHBOARD + "?token=" + otherShareToken, null, null);
		assertEquals(HttpStatus.OK, otherPage.getStatusCode(), "the other link must work on its own dashboard");
		String otherEmbedToken = embedTokenOf(otherPage);
		assertNotNull(otherEmbedToken, "the other page must hand out a credential too");

		List<String> leaked = new ArrayList<>();

		refusesAndSaysNothing(leaked, "the dashboard page, with the other link's share token",
				anonymous(HttpMethod.GET, "/dashboard/" + SHARED_DASHBOARD + "?token=" + otherShareToken, null, null),
				aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report config, with the other dashboard's embed token",
				withEmbedToken(HttpMethod.GET, "/api/reports/" + SHARED_DASHBOARD + "/config", null, otherEmbedToken),
				aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the report data, with the other dashboard's embed token",
				withEmbedToken(HttpMethod.GET, "/api/reports/" + SHARED_DASHBOARD + "/data", null, otherEmbedToken),
				aCompanyInTheDatabase);
		refusesAndSaysNothing(leaked, "the pivot, with the other dashboard's embed token",
				withEmbedToken(HttpMethod.POST, "/api/analytics/pivot?reportId=" + SHARED_DASHBOARD, pivotBody(),
						otherEmbedToken),
				aCompanyInTheDatabase);

		assertTrue(leaked.isEmpty(), "one link opens one report, and this one opened more:\n"
				+ String.join("\n", leaked));

		// And the token is not simply broken: it opens its own dashboard's data in the same test.
		JsonNode ownData = json(withEmbedToken(HttpMethod.GET, "/api/reports/" + OTHER_DASHBOARD + "/data", null,
				otherEmbedToken));
		assertTrue(ownData.path("totalRows").asInt() > 0,
				"the other token has to work on its own report, or this test proves nothing: " + ownData);
	}

	// ============================================================
	// the expiry decision
	// ============================================================

	@Test
	void aSharedPageRenewsItsEmbedTokenFromTheShareTokenBeforeItCanExpire() throws Exception {

		String shareToken = shareTokenService.createShareToken(SHARED_DASHBOARD, null);
		String shareUrl = "/dashboard/" + SHARED_DASHBOARD + "?token=" + shareToken;

		ResponseEntity<String> firstLoad = anonymous(HttpMethod.GET, shareUrl, null, null);
		assertEquals(HttpStatus.OK, firstLoad.getStatusCode(), "the link opens");

		// The page renews itself, and it does so before the credential it holds can be refused.
		Matcher delay = RELOAD_DELAY_IN_PAGE.matcher(firstLoad.getBody());
		assertTrue(delay.find(), "a shared page must renew itself: " + firstLoad.getBody());
		long renewAfterMillis = Long.parseLong(delay.group(1));
		assertTrue(renewAfterMillis < EmbedTokenService.DEFAULT_TTL_SECONDS * 1000,
				"the renewal must happen before the token expires, not after it: " + renewAfterMillis);
		assertTrue(renewAfterMillis > 0, "a renewal at zero would reload the page for ever: " + renewAfterMillis);

		// What the renewal actually does: the reload carries the share token that is still in the
		// URL, and comes back with a credential good for another hour from the moment of the
		// reload, which opens the data just as the first one did. That is the whole decision — no
		// refresh endpoint, no 401 in the middle of a page.
		//
		// The wait is not padding. An embed token is a deterministic HMAC of its claims, and the
		// only claim that moves is the expiry, which is counted in whole seconds: two loads inside
		// the same second are handed the identical token, correctly, because it expires an hour
		// after that second either way. A second apart, the renewed one has to last longer — and
		// that, rather than "a different string", is what renewal means.
		Thread.sleep(1100);

		ResponseEntity<String> reloaded = anonymous(HttpMethod.GET, shareUrl, null, null);
		assertEquals(HttpStatus.OK, reloaded.getStatusCode(), "the reload opens the same link");

		String firstToken = embedTokenOf(firstLoad);
		String renewedToken = embedTokenOf(reloaded);
		assertNotNull(renewedToken, "the reloaded page must hand out a credential: " + reloaded.getBody());
		assertTrue(expiryOf(renewedToken) > expiryOf(firstToken),
				"a renewal that hands back a credential expiring no later renews nothing: "
						+ expiryOf(firstToken) + " -> " + expiryOf(renewedToken));

		JsonNode data = json(withEmbedToken(HttpMethod.GET, "/api/reports/" + SHARED_DASHBOARD + "/data", null,
				renewedToken));
		assertEquals(countCustomers(), data.path("totalRows").asInt(),
				"the renewed credential must read the dashboard's data: " + data);

		// And a revoked link ends the page cleanly rather than leaving it to fail widget by widget.
		shareTokenService.listShareLinks(SHARED_DASHBOARD)
				.forEach(link -> shareTokenService.revoke(link.id()));

		ResponseEntity<String> afterRevocation = anonymous(HttpMethod.GET, shareUrl, null, null);
		assertFalse(afterRevocation.getStatusCode() == HttpStatus.OK
				&& String.valueOf(afterRevocation.getBody()).contains("rb-dashboard"),
				"a revoked link must not serve the dashboard any more: " + afterRevocation.getStatusCode());
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** Runs one request of the page and remembers how it failed, so every failure is reported at once. */
	private void door(List<String> closed, String what, Executable step) {
		try {
			step.execute();
		} catch (Throwable failed) {
			closed.add("  - " + what + ": " + failed.getMessage());
		}
	}

	/**
	 * A refused door, checked for both failures that matter: it has to refuse — anything but a 2xx
	 * that carries the page or the data — and the refusal must say nothing about what it refused.
	 */
	private void refusesAndSaysNothing(List<String> leaked, String what, ResponseEntity<String> answer,
			String aCompanyInTheDatabase) {

		String body = answer.getBody() == null ? "" : answer.getBody();
		HttpStatus status = HttpStatus.valueOf(answer.getStatusCode().value());

		boolean refused = status == HttpStatus.UNAUTHORIZED || status == HttpStatus.FORBIDDEN
				|| status == HttpStatus.NOT_FOUND || status.is3xxRedirection();

		if (!refused)
			leaked.add("  - " + what + " answered " + status + " instead of refusing: " + body);

		if (body.contains(aCompanyInTheDatabase))
			leaked.add("  - " + what + " refused, and handed back a row of the data anyway: " + body);

		if (body.contains(CONNECTION))
			leaked.add("  - " + what + " named the connection the dashboard reads: " + body);

		if (body.contains("<rb-dashboard"))
			leaked.add("  - " + what + " served the dashboard page it was refusing: " + body);

		if (body.contains("embed-token="))
			leaked.add("  - " + what + " handed out a credential while refusing: " + body);
	}

	/** When a token says it stops working — read from the token itself, not from the clock. */
	private long expiryOf(String embedToken) throws Exception {
		String payload = new String(java.util.Base64.getUrlDecoder().decode(embedToken.split("\\.")[1]),
				java.nio.charset.StandardCharsets.UTF_8);
		return JSON.readTree(payload).path("exp").asLong();
	}

	private String embedTokenOf(ResponseEntity<String> page) {
		Matcher found = EMBED_TOKEN_IN_PAGE.matcher(String.valueOf(page.getBody()));
		return found.find() ? found.group(1) : null;
	}

	/** A widget's request: the credential rides in the header, exactly as every rb-* component sends it. */
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

		return rest.exchange("http://localhost:" + port + path, method,
				new HttpEntity<>(bodyOf(body), headers), String.class);
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

	private Map<String, Object> pivotBody() {
		return Map.of("connectionCode", CONNECTION, "tableName", TABLE, "rows", List.of("Country"),
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

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request of the page must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
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

	/** A value only somebody who read the data could know — the needle of the leak check. */
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

	/**
	 * A published dashboard as {@code CanvasExportService} writes one: the connection under
	 * scriptoptions, a {@code <reportId>-script.groovy} beside the config, and an HTML template that
	 * holds the widgets. Written any other way, the data door answers with an error row and the pivot
	 * cannot find a connection — the two failures this journey has to be able to tell apart from a
	 * refusal.
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
		reporting.report.datasource.sqloptions.idcolumn = "CustomerID";
		reporting.report.datasource.sqloptions.scriptname = scriptName;
		reporting.report.datasource.scriptoptions.conncode = CONNECTION;
		reporting.report.datasource.scriptoptions.scriptname = scriptName;
		reporting.report.template.outputtype = "output.dashboard";
		reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";

		Files.writeString(reportDir.resolve(scriptName), String.join("\n",
				"import groovy.sql.Sql",
				"",
				"// One widget's worth of data, fetched the way a published dashboard's script does.",
				"def dbSql = ctx.dbSql",
				"ctx.reportData('customers', dbSql.rows('" + QUERY.replace("\"", "\\\"") + "'))",
				""));

		Path templateDir = root.resolve("templates/reports/" + reportId);
		Files.createDirectories(templateDir);
		Files.writeString(templateDir.resolve(reportId + "-template.html"), String.join("\n",
				"<div class=\"rb-dashboard-root\" data-report=\"" + reportId + "\">",
				"  <rb-tabulator component-id=\"customers\" api-base-url=\"http://localhost:9090/api\"></rb-tabulator>",
				"</div>",
				""));

		installer.saveSettingsReporting(reporting, settingsPath);
	}
}

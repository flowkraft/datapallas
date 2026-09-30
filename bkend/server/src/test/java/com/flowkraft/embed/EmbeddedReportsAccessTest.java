package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.ServerApplication;
import com.flowkraft.common.AppPaths;
import com.flowkraft.exploredata.export.ScriptAssembler;
import com.flowkraft.iam.Role;
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
 * A page that is mostly other dashboards: what its link and its token open, and what they do not.
 *
 * <h2>Why a whole journey for it</h2>
 * Every credential DataPallas hands out opens one report. A Gallery page breaks that assumption
 * without changing it: the page is a report of its own, and the tiles on it are other published
 * dashboards, each fetching its own config and its own data with the credential the page handed it.
 * So either those requests are authorised — and the page renders — or they are not, and the visitor
 * gets a screen of empty tiles that nobody reports as an error. This walks the requests such a page
 * really makes, with a share link and with an embed token, and then walks the ones it must never
 * make.
 *
 * <h2>The list is fixed when the credential is made</h2>
 * The dashboards a credential admits are read from the page's template once, while the link or the
 * token is created, and stored with it. Nothing re-reads the template per request, and that is the
 * property the last test is about: a page that embeds a further dashboard tomorrow does not widen
 * the links handed out today, and a link stored before any of this existed carries no list at all
 * and still opens exactly its own report.
 *
 * <h2>The locks are the other half</h2>
 * A lock is a parameter value forced on the viewer, and it was validated against the page. An
 * embedded dashboard is a different report with different parameters, so a lock reaches it only when
 * it declares a parameter of that name; a dashboard that declares none is left unlocked rather than
 * handed a value it would ignore. Caller attributes are not parameters and reach every dashboard the
 * credential admits.
 */
/*
 * Its own application context, because this test replaces the installation the server runs on: the
 * RANDOM_PORT journey tests all carry the same @SpringBootTest annotation, so without this they
 * share one server, booted on whichever installation happened to be set first. The comment on
 * UnlimitedCallersJourneyTest has the whole mechanism.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EmbeddedReportsAccessTest {

	private static final String TEST_ROOT = "./target/test-output/embedded-reports-access";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-gallery-sqlite";

	/** The page: a dashboard of its own, which embeds two others. */
	private static final String GALLERY = "gallery-dashboard";
	/** Embedded, and declares a {@code country} parameter, so a lock can reach it. */
	private static final String COUNTRY_DASHBOARD = "country-dashboard";
	/** Embedded, and declares no parameter at all, so the same lock must not reach it. */
	private static final String PLAIN_DASHBOARD = "plain-dashboard";
	/** Published, and on no page: what a Gallery credential must never open. */
	private static final String OUTSIDE_DASHBOARD = "outside-dashboard";
	/** Published, and added to the page's template in the middle of the last test. */
	private static final String LATER_DASHBOARD = "later-dashboard";

	/** Where the product's own samples are, read from bkend/server the way every sample test reads them. */
	private static final String SHIPPED_SAMPLES =
			"../../asbl/src/main/external-resources/db-template/config/samples";
	/** The Gallery the product ships: one page, and 25 dashboards on it. */
	private static final String SHIPPED_GALLERY = "g-dashboard-demos";
	/** A shipped dashboard that is on no Gallery card, which a Gallery credential must refuse. */
	private static final String NOT_ON_THE_GALLERY = "g-cube-stories";

	/** The value a link forces on the parameter the page and one embedded dashboard declare. */
	private static final String LOCKED_COUNTRY = "Germany";
	/** Who the recipient is, said as an attribute rather than as a parameter. */
	private static final String HOME_COUNTRY = "France";

	/** The widget every dashboard here has, and the one that reads the attribute. */
	private static final String ROWS = "tabulator_rows";
	private static final String WHO = "tabulator_who";

	private static final String ALL_ROWS_SQL = "SELECT CustomerID, CompanyName, Country FROM \"Customers\"";
	private static final String FILTERED_SQL = ALL_ROWS_SQL + "\nWHERE Country = ${country}";
	private static final String ATTRIBUTE_SQL =
			"SELECT CustomerID, CompanyName, Country FROM \"Customers\"\nWHERE Country = ${dp_attr_home}";

	private static final Pattern EMBED_TOKEN_IN_PAGE = Pattern.compile("embed-token=\"([^\"]+)\"");

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

			// The page itself declares the parameter a link locks, because a lock is validated
			// against the report the credential is for.
			writeDashboard(GALLERY, FILTERED_SQL, true);
			writeDashboard(COUNTRY_DASHBOARD, FILTERED_SQL, true);
			writeDashboard(PLAIN_DASHBOARD, ALL_ROWS_SQL, false);
			writeDashboard(OUTSIDE_DASHBOARD, ALL_ROWS_SQL, false);
			writeDashboard(LATER_DASHBOARD, ALL_ROWS_SQL, false);

			writeGalleryTemplate(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD));
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

	/*
	 * The two doors a credential is made at, called in process: what they read from the page's
	 * template is the whole subject of this test, so neither the link nor the token may be made by
	 * reaching past them into the services.
	 */
	@Autowired
	private EmbedController embedController;

	/**
	 * An administrator, for the two doors that make a credential.
	 *
	 * <p>Who may mint or share is not what this test is about — it is about what those doors read
	 * from the page's template, and about what the credential they hand back opens — so the caller
	 * here is one that both doors admit and that no group rule narrows. The other half, a sharer who
	 * may not open one of the embedded dashboards themselves, is the {@code omittedEmbeddedReports}
	 * list and belongs with the tests of who may share what.
	 */
	@BeforeEach
	void anAdministratorMakesTheCredentials() {
		SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
				"an-administrator", "n/a",
				List.of(new SimpleGrantedAuthority(Role.ADMIN.authority()),
						new SimpleGrantedAuthority(Role.REPORT_AUTHOR.authority()),
						new SimpleGrantedAuthority(Role.JOB_OPERATOR.authority()))));
	}

	@AfterEach
	void andNobodyAfterwards() {
		SecurityContextHolder.clearContext();
	}

	// ============================================================
	// the page: a link, a token, and the dashboards on it
	// ============================================================

	@Test
	void aGalleryLinkOpensTheDashboardsThePageEmbedsWithTheLocksEachOfThemDeclares() throws Exception {

		Set<Long> existing = linkIdsOf(GALLERY);

		JsonNode made = shareLink(Map.of("reportId", GALLERY,
				"lockedParams", Map.of("country", LOCKED_COUNTRY),
				"attributes", Map.of("home", HOME_COUNTRY)));

		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), idsOf(made.path("embeddedReports")),
				"the answer must say what the link opens besides the page: " + made);
		assertTrue(made.path("omittedEmbeddedReports").isEmpty(),
				"nothing was refused for this caller, so nothing may be left out: " + made);

		ShareTokenService.ShareLink stored = shareTokenService.listShareLinks(GALLERY).stream()
				.filter(link -> !existing.contains(link.id())).findFirst().orElseThrow();
		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), stored.embeddedReports(),
				"the list is stored with the link, which is what makes it fixed for the link's life");

		// 1 - the page, as the recipient of the link opens it, and the credential it hands its tiles.
		String shareToken = made.path("token").asText();
		ResponseEntity<String> page = anonymous(GET, "/dashboard/" + GALLERY + "?token=" + shareToken, null, null);
		assertEquals(HttpStatus.OK, page.getStatusCode(),
				"a visitor holding the link must get the Gallery page: " + page.getStatusCode());

		String embedToken = embedTokenOf(page);
		assertNotNull(embedToken, "the page must hand its tiles a credential: " + page.getBody());
		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), embeddedReportsClaimOf(embedToken),
				"the credential the page hands out carries the link's own list, so a tile can use it");

		// 2 - each tile's own config, which every rb-* component reads before anything else.
		for (String embedded : List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD)) {
			JsonNode config = json(withEmbedToken(GET, "/api/reports/" + embedded + "/config", null, embedToken));
			assertEquals(embedded, config.path("reportCode").asText(),
					"a tile of the page must be able to read its own config: " + config);
			assertEquals("output.dashboard", config.path("outputType").asText(),
					"and it is a published dashboard's config: " + config);
		}

		// 3 - the lock. It was validated against the page; it reaches the embedded dashboard that
		// declares a parameter of that name, and no further.
		JsonNode lockedConfig = json(withEmbedToken(GET,
				"/api/reports/" + COUNTRY_DASHBOARD + "/config", null, embedToken));
		assertEquals(LOCKED_COUNTRY, lockedConfig.path("lockedParameters").path("country").asText(),
				"the dashboard that declares country must be told the value is fixed: " + lockedConfig);

		JsonNode unlockedConfig = json(withEmbedToken(GET,
				"/api/reports/" + PLAIN_DASHBOARD + "/config", null, embedToken));
		assertTrue(lockedParameterCount(unlockedConfig) == 0,
				"a dashboard that declares no such parameter must be left unlocked, not handed a value"
						+ " it would draw as fixed: " + unlockedConfig.path("lockedParameters"));

		// 4 - the rows behind the tiles. A failed fetch comes back 200 carrying one ERROR_MESSAGE row
		// (CliJob.doFetchData), which is the empty tile this test exists to catch, so the rows are
		// counted rather than the status.
		assertEquals(countIn(LOCKED_COUNTRY), rowsOf(COUNTRY_DASHBOARD, ROWS, embedToken, ""),
				"the locked dashboard answers for the locked value only");
		assertEquals(countCustomers(), rowsOf(PLAIN_DASHBOARD, ROWS, embedToken, ""),
				"and the unlocked one answers everything, which is what its own SQL asks");

		// The lock is the signed one, not the one in the query string a viewer can edit.
		assertEquals(countIn(LOCKED_COUNTRY), rowsOf(COUNTRY_DASHBOARD, ROWS, embedToken, "&country=" + HOME_COUNTRY),
				"a viewer naming another value must still get the locked one");

		// 5 - the attributes, which are nobody's parameter and reach every dashboard the link opens.
		assertEquals(countIn(HOME_COUNTRY), rowsOf(COUNTRY_DASHBOARD, WHO, embedToken, ""),
				"${dp_attr_home} must reach an embedded dashboard");
		assertEquals(countIn(HOME_COUNTRY), rowsOf(PLAIN_DASHBOARD, WHO, embedToken, ""),
				"and the other one, which declares no parameters at all");

		// 6 - the same doors with the link itself in the query string, which is how a tile that was
		// handed the URL rather than the token asks.
		assertTrue(json(anonymous(GET, "/api/reports/" + COUNTRY_DASHBOARD + "/config?token=" + shareToken, null,
				null)).path("reportCode").asText().equals(COUNTRY_DASHBOARD),
				"the link itself must open an embedded dashboard's config");
	}

	@Test
	void aMintedTokenCarriesTheSameListAndOpensTheSameDashboards() throws Exception {

		JsonNode minted = mintToken(Map.of("reportId", GALLERY, "ttlSeconds", 600,
				"attrs", Map.of("home", HOME_COUNTRY)));

		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), idsOf(minted.path("embeddedReports")),
				"a token for the page opens the page's dashboards: " + minted);

		String token = minted.path("token").asText();
		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), embeddedReportsClaimOf(token),
				"and says so in the token itself, which is what is checked per request");

		assertEquals(countCustomers(), rowsOf(PLAIN_DASHBOARD, ROWS, token, ""),
				"an embedded dashboard's rows come back for a minted token too");
		assertEquals(countIn(HOME_COUNTRY), rowsOf(COUNTRY_DASHBOARD, WHO, token, ""),
				"and the attributes the host application named reach it");
	}

	// ============================================================
	// the Gallery the product ships
	// ============================================================

	/**
	 * The page above is built by this test, so it proves the rule and not the product's own page. This
	 * one is the shipped Gallery: its template is the file that ships, copied in as it is, and the 25
	 * report ids the credential admits are read from it by the server, never from this test.
	 *
	 * <p>The demos themselves are installed here as ordinary published dashboards under their own
	 * report ids, because what is asserted is which ids a Gallery credential opens - the demos' own
	 * tiles are Phase B2's other tests.
	 */
	@Test
	void theShippedGalleryLinkOpensAllTwentyFiveDemosAndNothingElse() throws Exception {

		List<String> demos = shippedDemoIds();
		assertEquals(25, demos.size(), "the index lists the demos the Gallery shows: " + demos);

		for (String reportId : demos)
			writeDashboard(reportId, ALL_ROWS_SQL, false);
		writeDashboard(NOT_ON_THE_GALLERY, ALL_ROWS_SQL, false);

		// The page: a published dashboard like any other, with the template the product ships put in
		// place of the one writeDashboard writes.
		writeDashboard(SHIPPED_GALLERY, ALL_ROWS_SQL, false);
		FileUtils.copyFile(
				new File(SHIPPED_SAMPLES + "/" + SHIPPED_GALLERY + "/" + SHIPPED_GALLERY + "-template.html"),
				root.resolve("templates/reports/" + SHIPPED_GALLERY + "/" + SHIPPED_GALLERY + "-template.html")
						.toFile());

		JsonNode made = shareLink(Map.of("reportId", SHIPPED_GALLERY));
		assertEquals(demos, idsOf(made.path("embeddedReports")),
				"the Gallery's link must open the 25 dashboards its page holds, in the page's order: " + made);
		assertTrue(made.path("omittedEmbeddedReports").isEmpty(),
				"nothing was refused for this caller, so nothing may be left out: " + made);

		String shareToken = made.path("token").asText();
		ResponseEntity<String> page = anonymous(GET,
				"/dashboard/" + SHIPPED_GALLERY + "?token=" + shareToken, null, null);
		assertEquals(HttpStatus.OK, page.getStatusCode(),
				"a visitor holding the Gallery's link must get the Gallery: " + page.getStatusCode());

		String embedToken = embedTokenOf(page);
		assertNotNull(embedToken, "the Gallery must hand its cards a credential: " + page.getBody());
		assertEquals(demos, embeddedReportsClaimOf(embedToken),
				"the credential the Gallery hands its cards carries the same 25");

		// Every card reads its own config with that one credential, which is the whole page rendering.
		for (String reportId : demos) {
			JsonNode config = json(withEmbedToken(GET, "/api/reports/" + reportId + "/config", null, embedToken));
			assertEquals(reportId, config.path("reportCode").asText(),
					"a card of the Gallery must be able to read its own config: " + config);
		}

		// And nothing else: Cube Stories is a shipped, published dashboard, and it is on no card.
		List<String> admitted = new ArrayList<>();
		refuses(admitted, "Cube Stories, which the Gallery does not embed, by the page's credential",
				withEmbedToken(GET, "/api/reports/" + NOT_ON_THE_GALLERY + "/config", null, embedToken));
		refuses(admitted, "Cube Stories, by the Gallery's link itself",
				anonymous(GET, "/api/reports/" + NOT_ON_THE_GALLERY + "/config?token=" + shareToken));
		refuses(admitted, "Cube Stories' page, by the Gallery's link",
				anonymous(GET, "/dashboard/" + NOT_ON_THE_GALLERY + "?token=" + shareToken, null, null));
		assertTrue(admitted.isEmpty(), "the Gallery's link opens more than the Gallery's own dashboards:\n"
				+ String.join("\n", admitted));
	}

	/** The demos of the shipped index, in the order the Gallery lists them. */
	private static List<String> shippedDemoIds() throws Exception {
		JsonNode index = JSON.readTree(new File(SHIPPED_SAMPLES + "/dashboard-demos.json"));
		List<String> ids = new ArrayList<>();
		index.path("demos").forEach(demo -> ids.add(demo.path("reportId").asText()));
		return ids;
	}

	// ============================================================
	// everything the page does not embed
	// ============================================================

	@Test
	void nothingButWhatThePageEmbeddedIsAdmitted() throws Exception {

		JsonNode made = shareLink(Map.of("reportId", GALLERY));
		String shareToken = made.path("token").asText();
		String embedToken = embedTokenOf(anonymous(GET, "/dashboard/" + GALLERY + "?token=" + shareToken, null, null));

		List<String> admitted = new ArrayList<>();

		// A published dashboard that is on no page: neither credential may open it.
		refuses(admitted, "a dashboard the page does not embed, by token",
				withEmbedToken(GET, "/api/reports/" + OUTSIDE_DASHBOARD + "/config", null, embedToken));
		refuses(admitted, "its data, by token",
				withEmbedToken(GET, "/api/reports/" + OUTSIDE_DASHBOARD + "/data", null, embedToken));
		refuses(admitted, "a dashboard the page does not embed, by link",
				anonymous(GET, "/api/reports/" + OUTSIDE_DASHBOARD + "/config?token=" + shareToken, null, null));

		// A reportId in the query string is not a credential: the pivot door reads the report from
		// there, and the credential still decides.
		refuses(admitted, "the pivot of another report, named in the query",
				withEmbedToken(POST, "/api/analytics/pivot?reportId=" + OUTSIDE_DASHBOARD, pivotBody(), embedToken));

		// The relation does not run backwards, and it does not run sideways: a link for one of the
		// embedded dashboards opens that dashboard, and neither the page nor its sibling.
		String tileToken = shareLink(Map.of("reportId", COUNTRY_DASHBOARD)).path("token").asText();
		assertTrue(idsOf(shareLink(Map.of("reportId", COUNTRY_DASHBOARD)).path("embeddedReports")).isEmpty(),
				"a dashboard that embeds nothing has an empty list");

		refuses(admitted, "the page, from a link for a dashboard on it",
				anonymous(GET, "/api/reports/" + GALLERY + "/config?token=" + tileToken));
		refuses(admitted, "the page itself, from a link for a dashboard on it",
				anonymous(GET, "/dashboard/" + GALLERY + "?token=" + tileToken));
		refuses(admitted, "a sibling tile, from a link for a dashboard on it",
				anonymous(GET, "/api/reports/" + PLAIN_DASHBOARD + "/config?token=" + tileToken));

		// And it does open its own report, so every refusal above is about the report and not about
		// the link being broken.
		assertEquals(COUNTRY_DASHBOARD,
				json(anonymous(GET, "/api/reports/" + COUNTRY_DASHBOARD + "/config?token=" + tileToken))
						.path("reportCode").asText(),
				"the link for the tile must open the tile");

		assertTrue(admitted.isEmpty(), admitted.size() + " request(s) were admitted that must not be:\n"
				+ String.join("\n", admitted));
	}

	// ============================================================
	// the page changes, the credentials already handed out do not
	// ============================================================

	@Test
	void aPageThatEmbedsMoreLaterDoesNotWidenTheCredentialsAlreadyHandedOut() throws Exception {

		JsonNode before = shareLink(Map.of("reportId", GALLERY));
		String oldShareToken = before.path("token").asText();
		String oldEmbedToken = mintToken(Map.of("reportId", GALLERY, "ttlSeconds", 600)).path("token").asText();
		assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD), idsOf(before.path("embeddedReports")),
				"the page embeds two dashboards when these credentials are made");

		List<String> admitted = new ArrayList<>();
		try {
			// The author adds a third dashboard to the page.
			writeGalleryTemplate(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD, LATER_DASHBOARD));

			refuses(admitted, "a newly embedded dashboard, by a token made before",
					withEmbedToken(GET, "/api/reports/" + LATER_DASHBOARD + "/config", null, oldEmbedToken));
			refuses(admitted, "a newly embedded dashboard, by a link made before",
					anonymous(GET, "/api/reports/" + LATER_DASHBOARD + "/config?token=" + oldShareToken));

			// A credential made after the edit opens it: the refusals above are about when the
			// credential was made, not about the dashboard.
			JsonNode after = shareLink(Map.of("reportId", GALLERY));
			assertEquals(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD, LATER_DASHBOARD),
					idsOf(after.path("embeddedReports")), "a link made now opens the page as it is now: " + after);
			assertEquals(LATER_DASHBOARD,
					json(anonymous(GET, "/api/reports/" + LATER_DASHBOARD + "/config?token="
							+ after.path("token").asText())).path("reportCode").asText(),
					"and really opens the dashboard that was added");

			// A link stored before any of this existed has no list at all, and opens its own report.
			String legacyLink = shareTokenService.createShareToken(GALLERY, null);
			assertEquals(GALLERY, json(anonymous(GET, "/api/reports/" + GALLERY + "/config?token=" + legacyLink))
					.path("reportCode").asText(), "a link stored with no list must still open its own report");
			refuses(admitted, "an embedded dashboard, by a link stored with no list",
					anonymous(GET, "/api/reports/" + COUNTRY_DASHBOARD + "/config?token=" + legacyLink));

			assertTrue(admitted.isEmpty(), admitted.size() + " request(s) were admitted that must not be:\n"
					+ String.join("\n", admitted));
		} finally {
			// The page as the other tests installed it, whatever happened above.
			writeGalleryTemplate(List.of(COUNTRY_DASHBOARD, PLAIN_DASHBOARD));
		}
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** A share link, made at the door that reads the page — never by calling the service. */
	private JsonNode shareLink(Map<String, Object> request) {
		ResponseEntity<?> made = embedController.createShareLink(new LinkedHashMap<>(request));
		assertTrue(made.getStatusCode().is2xxSuccessful(), "creating the link must succeed: " + made.getBody());
		return JSON.valueToTree(made.getBody());
	}

	/** An embed token, made at the same kind of door, for the host application that renders the page. */
	private JsonNode mintToken(Map<String, Object> request) {
		ResponseEntity<?> minted = embedController.mintToken(new LinkedHashMap<>(request));
		assertTrue(minted.getStatusCode().is2xxSuccessful(), "minting must succeed: " + minted.getBody());
		return JSON.valueToTree(minted.getBody());
	}

	private Set<Long> linkIdsOf(String reportId) {
		Set<Long> ids = new HashSet<>();
		shareTokenService.listShareLinks(reportId).forEach(link -> ids.add(link.id()));
		return ids;
	}

	private List<String> idsOf(JsonNode array) {
		List<String> ids = new ArrayList<>();
		array.forEach(id -> ids.add(id.asText()));
		return ids;
	}

	/** What a token says it admits, read from the token itself rather than from the code that made it. */
	private List<String> embeddedReportsClaimOf(String embedToken) throws Exception {
		String payload = new String(Base64.getUrlDecoder().decode(embedToken.split("\\.")[1]),
				StandardCharsets.UTF_8);
		return idsOf(JSON.readTree(payload).path("emb"));
	}

	/** How many rows one widget of one dashboard answers with, for this credential. */
	private int rowsOf(String reportId, String componentId, String embedToken, String extraQuery) throws Exception {
		JsonNode data = json(withEmbedToken(GET,
				"/api/reports/" + reportId + "/data?componentId=" + componentId + extraQuery, null, embedToken));
		assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
				reportId + "/" + componentId + " answered with an error row, not with data: "
						+ data.path("data").path(0));
		return data.path("totalRows").asInt();
	}

	private int lockedParameterCount(JsonNode config) {
		JsonNode locked = config.path("lockedParameters");
		return locked.isMissingNode() || locked.isNull() ? 0 : locked.size();
	}

	/**
	 * A door that has to refuse, and to say nothing while refusing: anything but a 2xx that carries
	 * the report, its rows or the page it would have served.
	 */
	private void refuses(List<String> admitted, String what, ResponseEntity<String> answer) throws Exception {

		String body = answer.getBody() == null ? "" : answer.getBody();
		HttpStatus status = HttpStatus.valueOf(answer.getStatusCode().value());

		boolean refused = status == HttpStatus.UNAUTHORIZED || status == HttpStatus.FORBIDDEN
				|| status == HttpStatus.NOT_FOUND || status.is3xxRedirection();

		if (!refused)
			admitted.add("  - " + what + " answered " + status + " instead of refusing: " + body);

		if (body.contains(firstCompanyName()))
			admitted.add("  - " + what + " refused, and handed back a row of the data anyway: " + body);

		if (body.contains(CONNECTION))
			admitted.add("  - " + what + " named the connection the dashboard reads: " + body);

		if (body.contains("<rb-dashboard"))
			admitted.add("  - " + what + " served the page it was refusing: " + body);

		if (body.contains("embed-token="))
			admitted.add("  - " + what + " handed out a credential while refusing: " + body);
	}

	private String embedTokenOf(ResponseEntity<String> page) {
		Matcher found = EMBED_TOKEN_IN_PAGE.matcher(String.valueOf(page.getBody()));
		return found.find() ? found.group(1) : null;
	}

	/** A tile's request: the credential rides in the header, exactly as every rb-* component sends it. */
	private ResponseEntity<String> withEmbedToken(HttpMethod method, String path, Object body, String embedToken) {
		return anonymous(method, path, body, embedToken);
	}

	private ResponseEntity<String> anonymous(HttpMethod method, String path) {
		return anonymous(method, path, null, null);
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
		return Map.of("connectionCode", CONNECTION, "tableName", "Customers", "rows", List.of("Country"),
				"vals", List.of("CustomerID"), "aggregatorName", "Count");
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	/** What the database really holds, counted by this test rather than by the code under test. */
	private int countCustomers() throws Exception {
		return count("SELECT count(*) FROM \"Customers\"");
	}

	private int countIn(String country) throws Exception {
		int rows = count("SELECT count(*) FROM \"Customers\" WHERE \"Country\" = '" + country + "'");
		assertTrue(rows > 0 && rows < countCustomers(),
				"the fixture needs " + country + " to be some of the rows and not all of them: " + rows);
		return rows;
	}

	private int count(String sql) throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + northwind);
				Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery(sql)) {
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
	 * A published dashboard as {@code CanvasExportService} writes one, with two widgets: the rows the
	 * tile shows, and one that reads a caller attribute, so "the attributes reached this dashboard"
	 * is a row count rather than a claim. The script is assembled by the generator the product uses,
	 * because how a filter value and a {@code ${dp_…}} name reach the database is exactly what these
	 * tests are about.
	 *
	 * @param declaresCountry whether the dashboard declares the parameter a link locks
	 */
	private static void writeDashboard(String reportId, String rowsSql, boolean declaresCountry) throws Exception {

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
		reporting.report.datasource.sqloptions.query = rowsSql;
		reporting.report.datasource.sqloptions.idcolumn = "CustomerID";
		reporting.report.datasource.sqloptions.scriptname = scriptName;
		reporting.report.datasource.scriptoptions.conncode = CONNECTION;
		reporting.report.datasource.scriptoptions.scriptname = scriptName;
		reporting.report.template.outputtype = "output.dashboard";
		reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";

		List<Map<String, Object>> parameters = declaresCountry
				? List.of(Map.of("id", "country", "type", "String"))
				: List.of();

		Files.writeString(reportDir.resolve(scriptName),
				ScriptAssembler.assemble(List.of(widget("w-rows", rowsSql), widget("w-who", ATTRIBUTE_SQL)),
						parameters).text());

		if (declaresCountry)
			Files.writeString(reportDir.resolve(reportId + "-report-parameters-spec.groovy"), String.join("\n",
					"reportParameters {",
					"    parameter(id: 'country', type: 'String', label: 'Country') { }",
					"}",
					""));

		writeTemplate(reportId, List.of());

		installer.saveSettingsReporting(reporting, settingsPath);
	}

	private static Map<String, Object> widget(String id, String sql) {
		Map<String, Object> dataSource = new LinkedHashMap<>();
		dataSource.put("mode", "sql");
		dataSource.put("sql", sql);
		Map<String, Object> widget = new LinkedHashMap<>();
		widget.put("id", id);
		widget.put("type", "tabulator");
		widget.put("dataSource", dataSource);
		return widget;
	}

	/** The page's own template, which is the one place that says which dashboards it embeds. */
	private static void writeGalleryTemplate(List<String> embedded) throws Exception {
		writeTemplate(GALLERY, embedded);
	}

	private static void writeTemplate(String reportId, List<String> embedded) throws Exception {

		Path templateDir = root.resolve("templates/reports/" + reportId);
		Files.createDirectories(templateDir);

		StringBuilder html = new StringBuilder();
		html.append("<div class=\"rb-dashboard-root\" data-report=\"").append(reportId).append("\">\n");
		for (String id : embedded)
			html.append("  <rb-dashboard report-id=\"").append(id).append("\"></rb-dashboard>\n");
		html.append("  <rb-tabulator component-id=\"").append(ROWS)
				.append("\" api-base-url=\"http://localhost:9090/api\"></rb-tabulator>\n");
		html.append("  <rb-tabulator component-id=\"").append(WHO)
				.append("\" api-base-url=\"http://localhost:9090/api\"></rb-tabulator>\n");
		html.append("</div>\n");

		Files.writeString(templateDir.resolve(reportId + "-template.html"), html.toString());
	}
}

package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
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
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.limits.LimitSettings;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.AppUser;
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
 * Who is asking, as the database sees it: the {@code dp_} variables, end to end.
 *
 * <h2>Why the whole chain, over HTTP</h2>
 * An access filter is only worth what the last link of the chain does with it. The value is decided
 * from the session ({@link UserVariables}), merged into the request's parameters after the query
 * string has been read ({@code ReportsController.fetchReportData}), written into the published
 * script as a declared bind ({@code ScriptAssembler}), and finally bound by the driver. A unit test
 * of any one of those links passes happily while the chain leaks, so every case here signs in as a
 * real person, asks {@code /api/reports/&lt;id&gt;/data} the way a widget does, and counts the rows
 * that came back.
 *
 * <h2>The negatives are the point</h2>
 * A filter that is merely absent shows every row, so each negative states the failure it stands
 * against: the internal id instead of the login, a viewer naming themselves somebody else in the
 * query string, a person with no email being shown everybody's rows, a group slug carrying a quote
 * out of its bind, a {@code dp_} name being declared or locked as if it were a dashboard's own.
 *
 * <p>The clock is fixed, because two of the variables are a date and a timestamp and a test whose
 * answer changes at midnight is not a test.
 */
/*
 * Its own application context, because this test replaces the installation the server runs on: the
 * RANDOM_PORT journey tests all carry the same @SpringBootTest annotation, so without this they
 * share one server, booted on whichever installation happened to be set first. The comment on
 * UnlimitedCallersJourneyTest has the whole mechanism.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BuiltinVariablesJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/builtin-variables-journey";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	private static final String CONNECTION = "db-access-filter-sqlite";

	/**
	 * The moment everything below is asked at. Chosen so that the two zones the plan names are on
	 * two different days: 14:30 on the 28th in Kiritimati, 13:30 on the 27th in Pago Pago.
	 */
	private static final Instant NOW = Instant.parse("2026-09-28T00:30:00Z");
	private static final ZoneId EAST = ZoneId.of("Pacific/Kiritimati");
	private static final ZoneId WEST = ZoneId.of("Pacific/Pago_Pago");
	private static final String EAST_TODAY = "2026-09-28";
	private static final String WEST_TODAY = "2026-09-27";

	/** The server's own zone, so "no zone anywhere" is a third, distinguishable answer. */
	private static final ZoneId SERVER_ZONE = EAST;

	private static final String ANNA = "jwalker";
	private static final String ANNA_EMAIL = "jwalker@example.com";
	private static final String BORIS = "msmith";
	private static final String BORIS_EMAIL = "msmith@example.com";
	/** A real account with no email address at all — the person a filter on email must show nothing to. */
	private static final String NOBODY = "kpatel";
	/** Fixture accounts, created by this test inside its own throwaway installation. */
	private static final String PASSWORD = "builtin-variables-fixture-pw";

	private static final String GROUP = "Analysts";
	private static final String GROUP_SLUG = "analysts";
	/** A group name that would end the string literal, if a slug were ever pasted into SQL. */
	private static final String SNEAKY_GROUP = "x') OR ('1'='1";

	// The dashboards. One widget each, so `/data` answers with that widget's rows and nothing else.
	private static final String OWNER_DASHBOARD = "owner-dashboard";
	private static final String EMAIL_DASHBOARD = "email-dashboard";
	private static final String GROUP_DASHBOARD = "group-dashboard";
	private static final String ROLE_DASHBOARD = "role-dashboard";
	private static final String TENANT_DASHBOARD = "tenant-dashboard";
	private static final String TODAY_DASHBOARD = "today-dashboard";
	private static final String NOW_DASHBOARD = "now-dashboard";
	private static final String PLAIN_DASHBOARD = "plain-dashboard";
	private static final String ECHO_DASHBOARD = "echo-dashboard";
	private static final String DECLARED_DASHBOARD = "declared-dashboard";

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

			database = writeDatabase(root.resolve("db/deals.db"));
			writeConnection(CONNECTION);

			writeDashboard(OWNER_DASHBOARD, "SELECT id FROM af_deals\nWHERE owner = ${dp_user_id}");
			writeDashboard(EMAIL_DASHBOARD, "SELECT id FROM af_deals\nWHERE owner_email = ${dp_user_email}");
			writeDashboard(GROUP_DASHBOARD, "SELECT id FROM af_deals\nWHERE '" + GROUP_SLUG + "' IN (${dp_user_groups})");
			writeDashboard(ROLE_DASHBOARD, "SELECT id FROM af_deals\nWHERE role = ${dp_user_role}");
			writeDashboard(TENANT_DASHBOARD, "SELECT id FROM af_deals\nWHERE tenant = ${dp_tenant_id}");
			writeDashboard(TODAY_DASHBOARD, "SELECT id FROM af_deals\nWHERE close_date = ${dp_today}");
			writeDashboard(NOW_DASHBOARD, "SELECT id FROM af_deals\nWHERE seen_at <= ${dp_now}");
			writeDashboard(PLAIN_DASHBOARD, "SELECT id FROM af_deals\nWHERE close_date = '" + EAST_TODAY + "'");
			writeDashboard(ECHO_DASHBOARD, "SELECT ${dp_user_id} AS who, ${dp_tenant_id} AS tenant_code,"
					+ " ${dp_user_timezone} AS zone, ${dp_user_locale} AS tag, ${dp_today} AS today"
					+ " FROM af_deals LIMIT 1");

			// A dashboard whose parameters spec declares a dp_ name anyway — which the save door
			// refuses, so the only way to get one is the hand-edited file this writes.
			writeDashboard(DECLARED_DASHBOARD, "SELECT id FROM af_deals\nWHERE owner = ${dp_user_id}");
			Files.writeString(root.resolve("config/reports/" + DECLARED_DASHBOARD + "/" + DECLARED_DASHBOARD
					+ "-report-parameters-spec.groovy"), String.join("\n",
							"reportParameters {",
							"    parameter(id: 'region', type: 'String', label: 'Region') { }",
							"    parameter(id: 'dp_user_id', type: 'String', label: 'Pretend') { }",
							"}",
							""));
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
	private IamRepository repository;

	@Autowired
	private LimitsService limitsService;

	@Autowired
	private UserVariables userVariables;

	@Autowired
	private LockedParamsValidator lockedParamsValidator;

	private Session anna;
	private Session boris;
	private Session nobody;

	@BeforeEach
	void aFixedMomentAndThreePeople() {

		userVariables.setClock(Clock.fixed(NOW, SERVER_ZONE));

		createIfMissing(ANNA, ANNA_EMAIL, Role.REPORT_AUTHOR);
		createIfMissing(BORIS, BORIS_EMAIL, Role.ADMIN);
		createIfMissing(NOBODY, null, Role.REPORT_AUTHOR);

		// Set every time: a test that changes a preference leaves the next one the way it found it.
		iamService.setUserPreferences(ANNA, EAST.getId(), "en-GB");
		iamService.setUserPreferences(BORIS, WEST.getId(), "");
		iamService.setUserPreferences(NOBODY, "", "");
		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, "", "");

		// Anna is in the group the group dashboard names; Boris is in none, which is the case an
		// empty IN-list has to answer. Both the group and its membership survive between tests: the
		// slug is written once, when the group is created, and the SQL above names it.
		limitsService.setUserGroups(ANNA, List.of(groupIdOf(GROUP).id()));
		limitsService.setUserGroups(BORIS, List.of());

		anna = new Session(ANNA, PASSWORD);
		boris = new Session(BORIS, PASSWORD);
		nobody = new Session(NOBODY, PASSWORD);
	}

	// ============================================================
	// the positive half: each person's own rows
	// ============================================================

	@Test
	void theSameWidgetGivesEachPersonTheirOwnRowsByLoginAndByEmail() throws Exception {

		assertEquals(3, rows(anna, OWNER_DASHBOARD), "Anna's own deals, filtered by ${dp_user_id}");
		assertEquals(2, rows(boris, OWNER_DASHBOARD), "Boris's own deals, from the same widget");

		assertEquals(3, rows(anna, EMAIL_DASHBOARD), "the same, filtered by ${dp_user_email}");
		assertEquals(2, rows(boris, EMAIL_DASHBOARD), "and the same widget for Boris");
	}

	@Test
	void aGroupConditionMatchesAMemberAndNotANonMember() throws Exception {

		assertEquals(TOTAL_ROWS, rows(anna, GROUP_DASHBOARD),
				"Anna is in " + GROUP_SLUG + ", so the condition holds and the widget answers everything");
		assertEquals(0, rows(boris, GROUP_DASHBOARD),
				"Boris is in no group: an empty list must match no row, never every row");
	}

	@Test
	void theRoleIsItsSlugAndTheTenantIsItsCode() throws Exception {

		assertEquals(3, rows(anna, ROLE_DASHBOARD), "the rows of ${dp_user_role} = report-author");
		assertEquals(3, rows(boris, ROLE_DASHBOARD), "the rows of ${dp_user_role} = admin");

		assertEquals(4, rows(anna, TENANT_DASHBOARD),
				"${dp_tenant_id} is the tenant's code, and four rows carry it");
	}

	@Test
	void todayIsTodayWhereThePersonIs() throws Exception {

		// Two people, one clock, two dates — which is the whole reason the variable exists.
		assertEquals(EAST_TODAY, echo(anna).path("today").asText(), "Anna's today, in " + EAST);
		assertEquals(WEST_TODAY, echo(boris).path("today").asText(), "Boris's today, in " + WEST);

		assertEquals(2, rows(anna, TODAY_DASHBOARD), "the deals closing on Anna's today");
		assertEquals(2, rows(boris, TODAY_DASHBOARD), "the deals closing on Boris's today");
	}

	@Test
	void withNoZoneOnTheProfileTheTenantsIsUsedAndWithNoneThereTheServers() throws Exception {

		// Nobody has said nothing about themselves, so the tenant answers for them.
		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, WEST.getId(), "fr-FR");
		assertEquals(WEST.getId(), echo(nobody).path("zone").asText(), "the tenant's zone");
		assertEquals(WEST_TODAY, echo(nobody).path("today").asText(), "so the tenant's today");
		assertEquals("fr-FR", echo(nobody).path("tag").asText(), "and the tenant's language tag");

		// Nor has the tenant: the server's own zone is the last word, never an error.
		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, "", "");
		assertEquals(SERVER_ZONE.getId(), echo(nobody).path("zone").asText(), "the server's zone");
		assertEquals(EAST_TODAY, echo(nobody).path("today").asText(), "so the server's today");

		// And the person's own zone still wins over both.
		iamService.setTenantPreferences(Tenant.DEFAULT_CODE, WEST.getId(), "fr-FR");
		assertEquals(EAST.getId(), echo(anna).path("zone").asText(), "Anna said her own zone");
		assertEquals("en-GB", echo(anna).path("tag").asText(), "and her own language tag");
	}

	@Test
	void nowComparesWithATimestampColumnWithoutACast() throws Exception {
		assertEquals(4, rows(anna, NOW_DASHBOARD),
				"the four rows already seen at " + NOW + ", and neither of the two in the future");
	}

	@Test
	void aWidgetThatUsesNoneOfThemAnswersTheSameToEverybody() throws Exception {
		assertEquals(2, rows(anna, PLAIN_DASHBOARD), "a widget with no ${dp_…} in it is untouched");
		assertEquals(2, rows(boris, PLAIN_DASHBOARD), "and answers the same to the next person");
	}

	// ============================================================
	// the negative half
	// ============================================================

	@Test
	void theInternalIdNeverLeaves() throws Exception {

		AppUser user = repository.findUserByUsername(ANNA).orElseThrow();
		Tenant tenant = repository.findTenantByCode(Tenant.DEFAULT_CODE).orElseThrow();

		JsonNode echoed = echo(anna);

		// THE RULE: the login and the code, never the auto-increment numbers. Point
		// UserVariables at app_user.id or tenant.id and this is the test that goes red.
		assertEquals(ANNA, echoed.path("who").asText(), "${dp_user_id} is the login name");
		assertNotEquals(String.valueOf(user.id()), echoed.path("who").asText(),
				"${dp_user_id} must never be app_user.id: " + echoed);
		assertEquals(Tenant.DEFAULT_CODE, echoed.path("tenant_code").asText(), "${dp_tenant_id} is the tenant code");
		assertNotEquals(String.valueOf(tenant.id()), echoed.path("tenant_code").asText(),
				"${dp_tenant_id} must never be tenant.id: " + echoed);
	}

	@Test
	void namingSomebodyElseInTheQueryStringChangesNothing() throws Exception {

		// The override is merged after the query string is read, so this is the whole security
		// property of the feature. Move that line above the query string and this goes red.
		assertEquals(3, rows(anna, OWNER_DASHBOARD, "dp_user_id=" + BORIS),
				"Anna asking to be Boris still gets Anna's rows");
		assertEquals(3, rows(anna, EMAIL_DASHBOARD, "dp_user_email=" + BORIS_EMAIL + "&dp_user_id=" + BORIS),
				"and the same with every person variable she can think of");
	}

	@Test
	void aPersonWithNoEmailIsShownNoRowRatherThanEveryRow() throws Exception {

		// An empty value is still a value: the line stays, binds the empty string and matches
		// nothing. Put the line back behind the script's has<P> guard and the answer becomes six.
		assertEquals(0, rows(nobody, EMAIL_DASHBOARD),
				"a person with no email must see no row, not everybody's");
	}

	@Test
	void aGroupSlugStaysInsideOneBoundValue() throws Exception {

		UserGroup sneaky = groupIdOf(SNEAKY_GROUP);
		limitsService.setUserGroups(NOBODY, List.of(sneaky.id()));

		// The slug is derived from the name once and holds no quote at all — but a value bound as
		// text could not end the literal even if it did, and this asks the database to prove it.
		String matchesTheSneakyGroup = "sneaky-group-dashboard";
		writeDashboard(matchesTheSneakyGroup,
				"SELECT id FROM af_deals\nWHERE '" + sneaky.slug() + "' IN (${dp_user_groups})");

		try {
			assertEquals(0, rows(nobody, GROUP_DASHBOARD),
					"the odd group is not " + GROUP_SLUG + ", and nothing about it may make it match");
			assertEquals(TOTAL_ROWS, rows(nobody, matchesTheSneakyGroup),
					"and it matches itself exactly, as one bound value: " + sneaky.slug());
		} finally {
			limitsService.setUserGroups(NOBODY, List.of());
			FileUtils.deleteQuietly(root.resolve("config/reports/" + matchesTheSneakyGroup).toFile());
		}
	}

	@Test
	void aDashboardParameterNamedDpAnythingIsRefusedOnSave() throws Exception {

		String spec = String.join("\n",
				"reportParameters {",
				"    parameter(id: 'dp_user_id', type: 'String', label: 'Pretend') { }",
				"}",
				"");

		ResponseEntity<String> refused = boris.putText(
				"/api/reports/" + OWNER_DASHBOARD + "/script/paramsSpecScript", spec);

		assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode(),
				"a parameter taking the server's namespace must be refused where it is saved: " + refused.getBody());
		assertTrue(String.valueOf(refused.getBody()).contains("dp_user_id"),
				"and the refusal must say which name: " + refused.getBody());

		// An ordinary name goes through the same door, so the refusal is about the prefix and not
		// about the door being shut.
		ResponseEntity<String> accepted = boris.putText(
				"/api/reports/" + OWNER_DASHBOARD + "/script/paramsSpecScript",
				"reportParameters {\n    parameter(id: 'region', type: 'String', label: 'Region') { }\n}\n");
		assertTrue(accepted.getStatusCode().is2xxSuccessful(),
				"an ordinary parameter still saves: " + accepted.getStatusCode() + " " + accepted.getBody());
	}

	@Test
	void aHandEditedDashboardThatDeclaresOneAnywayStillGetsTheServersValue() throws Exception {

		// Nothing declared can be a dp_ name, whatever the file says: the assembler drops it, the
		// lock validator does not see it, and the value still comes from the session.
		assertEquals(3, rows(anna, DECLARED_DASHBOARD), "Anna's own rows, from the hand-edited dashboard");
		assertEquals(2, rows(boris, DECLARED_DASHBOARD), "and Boris's, from the same one");

		@SuppressWarnings("unchecked")
		Map<String, Object> declared = (Map<String, Object>) ReflectionTestUtils.invokeMethod(
				lockedParamsValidator, "declaredParameters", DECLARED_DASHBOARD);

		assertTrue(declared.containsKey("region"),
				"the dashboard's own parameter is declared: " + declared.keySet());
		assertFalse(declared.containsKey("dp_user_id"),
				"row 0 of the precedence table: no dp_ name is ever a declared parameter: " + declared.keySet());
	}

	@Test
	void aShareLinkCannotLockABuiltinVariable() {

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> lockedParamsValidator.validate(DECLARED_DASHBOARD, Map.of("dp_user_id", BORIS)),
				"a lock on a built-in would be a lock that locks nothing");

		assertTrue(refused.getMessage().contains("dp_user_id"),
				"and the refusal names it: " + refused.getMessage());

		// The same validator still accepts the dashboard's own parameter, so the refusal above is
		// about the name rather than about the report.
		assertEquals(Map.of("region", "EMEA"), lockedParamsValidator.validate(DECLARED_DASHBOARD,
				Map.of("region", "EMEA")));
	}

	@Test
	void aZoneThatIsNotAZoneAndATagThatIsNotATagAreRefusedOnSave() {

		ResponseEntity<String> badZone = boris.putJson("/api/iam/users/" + ANNA + "/preferences",
				Map.of("timezone", "Mars/Olympus", "locale", "en-GB"));
		assertEquals(HttpStatus.BAD_REQUEST, badZone.getStatusCode(),
				"Mars/Olympus is not an IANA zone: " + badZone.getBody());

		ResponseEntity<String> badTag = boris.putJson("/api/iam/users/" + ANNA + "/preferences",
				Map.of("timezone", EAST.getId(), "locale", "xx-!!"));
		assertEquals(HttpStatus.BAD_REQUEST, badTag.getStatusCode(),
				"xx-!! is not a BCP 47 tag: " + badTag.getBody());

		ResponseEntity<String> good = boris.putJson("/api/iam/users/" + ANNA + "/preferences",
				Map.of("timezone", EAST.getId(), "locale", "en-GB"));
		assertTrue(good.getStatusCode().is2xxSuccessful(),
				"a real zone and a real tag save: " + good.getStatusCode() + " " + good.getBody());

		// Blank is not "invalid": it is how somebody says they have no opinion.
		ResponseEntity<String> cleared = boris.putJson("/api/iam/users/" + ANNA + "/preferences",
				Map.of("timezone", "", "locale", ""));
		assertTrue(cleared.getStatusCode().is2xxSuccessful(),
				"clearing both fields is allowed: " + cleared.getStatusCode() + " " + cleared.getBody());
	}

	// ============================================================
	// this journey's vocabulary
	// ============================================================

	/** How many rows the one widget of this dashboard answered with, for this person. */
	private int rows(Session caller, String reportId) throws Exception {
		return rows(caller, reportId, "");
	}

	/**
	 * The same, with a query string of the caller's own — which is where somebody tries to name
	 * themselves. A failed fetch comes back 200 carrying one ERROR_MESSAGE row, so the rows are
	 * read rather than the status.
	 */
	private int rows(Session caller, String reportId, String queryString) throws Exception {

		JsonNode data = json(caller.get("/api/reports/" + reportId + "/data"
				+ (queryString.isEmpty() ? "" : "?" + queryString)));

		assertTrue(data.path("data").path(0).path("ERROR_MESSAGE").isMissingNode(),
				"the widget failed rather than answered: " + data.path("data").path(0));

		return data.path("totalRows").asInt();
	}

	/** The one row of the echo dashboard: every variable as the database received it. */
	private JsonNode echo(Session caller) throws Exception {
		JsonNode data = json(caller.get("/api/reports/" + ECHO_DASHBOARD + "/data"));
		JsonNode row = data.path("data").path(0);
		assertFalse(row.isMissingNode(), "the echo widget answered with no row at all: " + data);
		return row;
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		return JSON.readTree(answer.getBody());
	}

	private void createIfMissing(String username, String email, Role role) {
		if (iamService.findUser(username).isEmpty())
			iamService.createUser(username, email, PASSWORD, role, Tenant.DEFAULT_CODE);
	}

	/**
	 * The group of this name, created once. The slug is derived when a group is created and never
	 * again, so a group made fresh per test would carry a different slug every time and the SQL
	 * above names one.
	 */
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

		private ResponseEntity<String> putJson(String path, Object body) {
			return exchange(HttpMethod.PUT, path, body, MediaType.APPLICATION_JSON);
		}

		private ResponseEntity<String> putText(String path, String body) {
			return exchange(HttpMethod.PUT, path, body, MediaType.TEXT_PLAIN);
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

	/** Every row of the fixture — what a condition that holds for everybody answers with. */
	private static final int TOTAL_ROWS = 6;

	/**
	 * Six deals, owned by two of the three people, in two tenants, closing on three days, two of
	 * them seen in the future. Written here rather than taken from a shipped sample, because every
	 * count this test asserts is a property of exactly these rows.
	 */
	private static Path writeDatabase(Path file) throws Exception {

		Files.deleteIfExists(file);

		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + file);
				Statement statement = connection.createStatement()) {

			statement.executeUpdate("CREATE TABLE af_deals ("
					+ "id INTEGER PRIMARY KEY, owner TEXT, owner_email TEXT, tenant TEXT, role TEXT,"
					+ " close_date DATE, seen_at TIMESTAMP)");

			String here = Tenant.DEFAULT_CODE;
			String elsewhere = "other-tenant";
			String past = "2019-01-01T00:00:00";
			String future = "2031-01-01T00:00:00";

			insert(statement, 1, ANNA, ANNA_EMAIL, here, "report-author", EAST_TODAY, past);
			insert(statement, 2, ANNA, ANNA_EMAIL, here, "report-author", WEST_TODAY, past);
			insert(statement, 3, ANNA, ANNA_EMAIL, here, "report-author", "2019-05-05", future);
			insert(statement, 4, BORIS, BORIS_EMAIL, here, "admin", EAST_TODAY, past);
			insert(statement, 5, BORIS, BORIS_EMAIL, elsewhere, "admin", "2019-05-05", future);
			insert(statement, 6, "someone-else", "someone-else@example.com", elsewhere, "admin", WEST_TODAY, past);
		}

		return file.toAbsolutePath();
	}

	private static void insert(Statement statement, int id, String owner, String email, String tenant, String role,
			String closeDate, String seenAt) throws Exception {
		statement.executeUpdate("INSERT INTO af_deals VALUES (" + id + ", '" + owner + "', '"
				+ (email == null ? "" : email) + "', '" + tenant + "', '" + role + "', '" + closeDate + "', '"
				+ seenAt + "')");
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
	 * and with the script {@link ScriptAssembler} really assembles, because the {@code ${dp_…}}
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

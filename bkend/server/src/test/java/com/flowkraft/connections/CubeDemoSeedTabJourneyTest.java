package com.flowkraft.connections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
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
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.db.SeedScriptRunner;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The Seed Data tab, running the cube demo seed the way a user does.
 *
 * <p>
 * The tab's flow is: pick a script in <b>Examples</b>, copy it into <b>Run</b>, click Run. Run sends
 * the script <b>as text</b>; the server writes that text to a temp file in the jobs folder and runs
 * it from there. So the folder a seed script is executed from says nothing about where the script
 * lives - and a script that looked for its data files next to itself worked from the package build
 * and from the tests, and nowhere else. Nothing ran it the way the tab does, which is why nobody
 * saw it.
 * </p>
 *
 * <p>
 * This is that run: a real sign-in, the real endpoint a browser calls, the installation's own
 * {@code db/scripts}, and no {@code dataDir} - so the only way the 32,313 rows can arrive is the
 * rule the script now follows, the installation's copy. The invoice seeder is run through the same
 * endpoint in the same installation, because the runner it shares must keep working for the seeds
 * that were there first.
 * </p>
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CubeDemoSeedTabJourneyTest {

	private static final String TEST_ROOT = "./target/test-output/cube-demo-seed-tab";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** The db/scripts folder the packager ships, and the Examples tab lists. */
	private static final String SHIPPED_DB_SCRIPTS = "../../asbl/src/main/external-resources/db-template/db/scripts";

	private static final String CONNECTION = "db-cube-demo-duckdb";

	private static final String ADMIN = "seed-tab-admin";
	private static final String PASSWORD = "Seed-tab-admin-1";

	private static final int TOTAL_ROWS = 32313;

	/** How long the tab's fire-and-forget job is given to finish. */
	private static final long WAIT_MS = 300_000;

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static Path database;
	private static Path scripts;
	private static ReportsService installer;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());

			// Loudly, because deleteQuietly is quiet: a database left behind by an earlier run
			// already holds the rows this test is here to see arrive, and the test would pass
			// without the seed ever running.
			if (Files.exists(root)) {
				throw new IllegalStateException("The installation of an earlier run is still at " + root
						+ " - this test needs an empty one, or it proves nothing");
			}

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

			// The installation holds db/scripts exactly as the packager lays it out: the scripts
			// and, next to them, the cube demo's rows.
			scripts = root.resolve("db/scripts");
			FileUtils.copyDirectory(new File(SHIPPED_DB_SCRIPTS), scripts.toFile());

			database = root.resolve("db/demo.duckdb");
			writeConnection();
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

	private Session admin;

	@BeforeEach
	void signIn() {
		if (iamService.findUser(ADMIN).isEmpty()) {
			iamService.createUser(ADMIN, null, PASSWORD, Role.ADMIN, Tenant.DEFAULT_CODE);
		}
		admin = new Session(ADMIN, PASSWORD);
	}

	@Test
	void theExamplesTabListsTheCubeDemoScriptWithWhatItDoes() throws Exception {

		JsonNode templates = json(admin.get("/api/connections/seed-templates"));

		JsonNode cubeDemo = null;
		for (JsonNode template : templates) {
			if ("cube-demo-data".equals(template.path("id").asText())) {
				cubeDemo = template;
			}
		}

		assertNotNull(cubeDemo, "the dropdown lists the cube demo script: " + templates);
		assertTrue(cubeDemo.path("description").asText().contains("cube_demo demo data"),
				"with the description from its own header: " + cubeDemo);
	}

	@Test
	void theRunTabLoadsTheCubeDemoDataFromTheInstallation() throws Exception {

		String scriptText = Files.readString(scripts.resolve("cube-demo-data.groovy"), StandardCharsets.UTF_8);

		// What the tab sends: the text, and the parameters the user typed. No dataDir - the script
		// has to find the rows in the installation by itself.
		JsonNode answer = json(admin.postJson("/api/connections/" + CONNECTION + "/run-seed",
				Map.of("script", scriptText,
						"params", Map.of("today", NorthwindFixture.CUBE_DEMO_TODAY, "wipe", "true"))));

		assertTrue(answer.path("ok").asBoolean(), "the tab's Run was accepted: " + answer);

		waitForTheRunToFinish();

		assertEquals(TOTAL_ROWS, rowsInTheDemoTables(),
				"the 19 tables the script found in the installation, with nothing but the text to go on");
		assertEquals(NorthwindFixture.CUBE_DEMO_TODAY, inTheDatabase("SELECT seeded_on FROM cube_demo.demo_info"),
				"the day the user asked for is the day the data was loaded for");
		assertEquals("1200", inTheDatabase("SELECT COUNT(*) FROM cube_demo.crm_deals"), "the deals are there");
	}

	@Test
	void theRunTabStillRunsTheSeedThatWasThereBeforeIt() throws Exception {

		String scriptText = Files.readString(scripts.resolve("invoice-seeder.groovy"), StandardCharsets.UTF_8);

		JsonNode answer = json(admin.postJson("/api/connections/" + CONNECTION + "/run-seed",
				Map.of("script", scriptText, "params", Map.of("N", "200"))));

		assertTrue(answer.path("ok").asBoolean(), "the invoice seeder was accepted too: " + answer);

		waitForTheRunToFinish();

		assertEquals("200", inTheDatabase("SELECT COUNT(*) FROM seed_inv_invoice"),
				"the seed that was there before the cube demo still loads through the same endpoint");
	}

	@Test
	void withoutTheInstallationsRowsItSaysWhereItLooked() throws Exception {

		Path rows = scripts.resolve("cube-demo-data");
		Path movedAway = root.resolve("moved-away");
		Files.move(rows, movedAway);

		// Run from text, as the tab does, but in this thread, so the message can be read here
		// rather than out of a log.
		try (Connection connection = DriverManager
				.getConnection("jdbc:duckdb:" + root.resolve("db/no-rows.duckdb").toAbsolutePath())) {

			String scriptText = Files.readString(scripts.resolve("cube-demo-data.groovy"), StandardCharsets.UTF_8);
			Exception refused = assertThrows(Exception.class,
					() -> SeedScriptRunner.run(connection, "DUCKDB", scriptText, Map.of()));

			assertTrue(message(refused).contains(rows.toAbsolutePath().toString()),
					"the message names the folder of the installation it looked in: " + message(refused));
			assertTrue(message(refused).contains("db/scripts"),
					"and says where to put the rows: " + message(refused));
		} finally {
			Files.move(movedAway, rows);
		}
	}

	// ── the database the tab wrote into ──────────────────────────────────────

	private static int rowsInTheDemoTables() {

		int total = 0;
		try (Connection connection = DriverManager.getConnection("jdbc:duckdb:" + database.toAbsolutePath())) {
			for (String table : CUBE_DEMO_TABLES) {
				try (Statement statement = connection.createStatement();
						ResultSet rows = statement.executeQuery("SELECT COUNT(*) FROM cube_demo." + table)) {
					total += rows.next() ? rows.getInt(1) : 0;
				}
			}
		} catch (Exception notYet) {
			return -1;
		}
		return total;
	}

	private static String inTheDatabase(String sql) throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:duckdb:" + database.toAbsolutePath());
				Statement statement = connection.createStatement();
				ResultSet rows = statement.executeQuery(sql)) {
			assertTrue(rows.next(), "No row from: " + sql);
			return String.valueOf(rows.getObject(1));
		}
	}

	private static final List<String> CUBE_DEMO_TABLES = List.of("crm_accounts", "crm_sales_reps", "crm_deals",
			"support_agents", "support_tickets", "school_students", "school_courses", "school_enrollments",
			"logistics_carriers", "logistics_depots", "logistics_shipments", "shop_customers", "shop_products",
			"shop_orders", "shop_order_lines", "erp_customers", "erp_invoices", "erp_invoice_lines",
			"erp_payments");

	/**
	 * The tab's Run is fire-and-forget: the answer is in the database once the job is done with it.
	 *
	 * <p>What is waited on is the job, not the data. The server writes the script the tab sent to a
	 * temp file in the jobs folder and deletes it when the run ends, so that file is the run. Reading
	 * the database while the job still holds it is not only early, it is refused - DuckDB will not
	 * open the same file twice with two configurations - and a test that polled the data would fail
	 * for that reason instead of the one it is about.
	 */
	private static void waitForTheRunToFinish() throws Exception {

		long until = System.currentTimeMillis() + WAIT_MS;
		while (System.currentTimeMillis() < until) {
			try (java.util.stream.Stream<Path> jobs = Files.list(root.resolve("temp"))) {
				if (jobs.noneMatch(file -> file.getFileName().toString().startsWith("seed-"))) {
					return;
				}
			}
			Thread.sleep(1000);
		}
		throw new AssertionError("The Seed tab's run had not finished after " + (WAIT_MS / 1000) + " s");
	}

	// ── the installation ─────────────────────────────────────────────────────

	private static void writeConnection() throws Exception {

		ServerDatabaseSettings server = new ServerDatabaseSettings();
		server.type = "duckdb";
		server.driver = "org.duckdb.DuckDBDriver";
		server.database = database.toString();
		server.url = "jdbc:duckdb:" + database;
		server.userid = "";
		server.userpassword = "";

		ConnectionDatabaseSettings connection = new ConnectionDatabaseSettings();
		connection.code = CONNECTION;
		connection.name = CONNECTION;
		connection.databaseserver = server;

		DocumentBursterConnectionDatabaseSettings settings = new DocumentBursterConnectionDatabaseSettings();
		settings.connection = connection;

		installer.saveSettingsConnectionDatabase(settings,
				root.resolve("config/connections/" + CONNECTION + "/" + CONNECTION + ".xml").toString());
	}

	private JsonNode json(ResponseEntity<String> answer) throws Exception {
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this step must not be refused: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	private static String message(Throwable failure) {
		StringBuilder all = new StringBuilder();
		for (Throwable step = failure; step != null; step = step.getCause()) {
			all.append(step.getMessage()).append(" | ");
		}
		return all.toString();
	}

	// ── a browser session, as the Angular app holds one ──────────────────────

	private final class Session {

		private final Map<String, String> cookies = new LinkedHashMap<>();

		private Session(String username, String password) {
			get("/api/auth/first-run");
			ResponseEntity<String> loggedIn = postJson("/api/auth/login",
					Map.of("username", username, "password", password));
			assertEquals(HttpStatus.OK, loggedIn.getStatusCode(),
					"the tab is an administrator's screen, so it starts with a real sign-in: "
							+ loggedIn.getStatusCode());
		}

		private ResponseEntity<String> get(String path) {
			return exchange(HttpMethod.GET, path, null, MediaType.APPLICATION_JSON);
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
			if (cookies.containsKey("XSRF-TOKEN")) {
				headers.add("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
			}
			if (contentType != null) {
				headers.setContentType(contentType);
			}

			ResponseEntity<String> answer = rest.exchange("http://localhost:" + port + path, method,
					new HttpEntity<>(bodyOf(body), headers), String.class);

			remember(answer.getHeaders().get(HttpHeaders.SET_COOKIE));
			return answer;
		}

		private Object bodyOf(Object body) {
			if (body == null || body instanceof String) {
				return body;
			}
			try {
				return JSON.writeValueAsString(body);
			} catch (Exception notSerializable) {
				throw new IllegalStateException(notSerializable);
			}
		}

		private void remember(List<String> setCookies) {
			if (setCookies == null) {
				return;
			}
			for (String cookie : setCookies) {
				String pair = cookie.split(";", 2)[0];
				int equals = pair.indexOf('=');
				if (equals <= 0) {
					continue;
				}
				cookies.put(pair.substring(0, equals).trim(), pair.substring(equals + 1).trim());
			}
		}
	}
}

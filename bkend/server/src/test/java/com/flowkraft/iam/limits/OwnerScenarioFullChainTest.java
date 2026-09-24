package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

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
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.dashboards.DashboardAccess;
import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;
import com.flowkraft.iam.reports.ReportGrantAccess;
import com.flowkraft.iam.reports.ReportNotGrantedException;
import com.flowkraft.jobs.controllers.JobsController;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.jobs.services.JobStore;
import com.flowkraft.reporting.services.ReportingService;
import com.flowkraft.samples.SamplesFrendOnlyService;
import com.flowkraft.reports.ReportsController;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;
import com.sourcekraft.documentburster.common.settings.model.ConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The owner's own scenario, walked from end to end on a real installation.
 *
 * <p>Everything else in this package pins one rule or one door. This class exists because the
 * question that was actually asked was not "does {@code assertRunnable} refuse" but "an author is
 * in a group that allows two connections and a report needs a third — what happens to that person,
 * from the list they open to the rows they read?". So nothing here is stubbed that could be real:
 * the reports are real settings files written by the product's own writers, the connections are
 * real connection files, the database is a real Northwind SQLite, the catalog is the real
 * {@link ReportsDeclaredConnections} reading those files, the store is a real SQLite IAM database
 * and the rows at the end come out of the real engine. A test built on a map of fake connection
 * codes cannot see a report the product writes one way and reads another; this one can.
 *
 * <p><b>The one thing that is mocked, and why.</b> {@code JobExecutionService} — the thread pool
 * that runs the engine as a background job. The positive claim it would carry ("the data really
 * comes back") is made here through the {@code /data} door instead, which runs the same engine, in
 * this thread, against the same file, and hands back rows this test compares with a direct JDBC
 * count of the same table. Spawning the job executor inside a unit test would add a second, slower
 * and flakier copy of that claim, not a stronger one. The job door is therefore asserted for what
 * only it can show: that a refusal happens before {@code jobStore.create}, so a refused run leaves
 * no job record, no log and no output behind — and that an allowed run is really accepted, with an
 * id.
 */
class OwnerScenarioFullChainTest {

	private static final String TEST_ROOT = "./target/test-output/owner-scenario-full-chain";

	/**
	 * The settings.xml and reporting.xml that ship, so the reports under test have the shape the
	 * product gives them rather than the shape this test imagines.
	 */
	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** The two connections the author's group names. */
	private static final String CONNECTION_A = "db-sales-sqlite";
	private static final String CONNECTION_B = "db-marketing-sqlite";
	/** The third one: just as real, just as runnable — and not theirs. */
	private static final String CONNECTION_C = "db-payroll-sqlite";

	private static final String REPORT_ON_A = "sales-orders";
	private static final String REPORT_ON_C = "payroll-monthly";
	/** A file datasource: no connection at all, so no connection limit can touch it. */
	private static final String FILE_REPORT = "csv-invoices";

	private static final String QUERY = "SELECT \"CustomerID\", \"CompanyName\", \"Country\" FROM \"Customers\"";

	private String previousPortableDir;
	private String previousConfigDir;
	private String previousLogsDir;
	private String previousJobsDir;
	private String previousSettingsDir;
	private String previousProperty;

	private Path root;
	private Path northwind;

	private IamDatabase database;
	private IamRepository repository;
	private LimitsService limitsService;
	private com.flowkraft.iam.reports.ReportGrants reportGrants;
	private ReportAccess reportAccess;

	private ReportsService reportsService;
	private ReportingService reportingService;

	private JobStore jobStore;
	private JobExecutionService jobExecutionService;

	/** The group the author and the operator are both in: connections A and B, no report grants. */
	private UserGroup limitedGroup;

	@BeforeEach
	void setUp() throws Exception {

		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root.resolve("config/reports"));
		Files.createDirectories(root.resolve("config/samples"));
		Files.createDirectories(root.resolve("logs"));

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		previousConfigDir = AppPaths.CONFIG_DIR_PATH;
		previousLogsDir = AppPaths.LOGS_DIR_PATH;
		previousJobsDir = AppPaths.JOBS_DIR_PATH;
		previousSettingsDir = Settings.PORTABLE_EXECUTABLE_DIR_PATH;
		previousProperty = System.getProperty("PORTABLE_EXECUTABLE_DIR");

		// The whole installation, as every layer of the product asks for it: the server's AppPaths,
		// the engine's Settings, and the system property Utils resolves report paths against.
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
		AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
		AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
		AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
		Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
		System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());

		assertTrue(new File(SHIPPED_SETTINGS_XML).isFile(),
				"the shipped settings.xml is where this test expects it: " + SHIPPED_SETTINGS_XML);
		assertTrue(new File(SHIPPED_REPORTING_XML).isFile(),
				"the shipped reporting.xml is where this test expects it: " + SHIPPED_REPORTING_XML);

		reportsService = new ReportsService();
		ReflectionTestUtils.setField(reportsService, "fileSystemService", new FileSystemService());

		reportingService = new ReportingService();
		ReflectionTestUtils.setField(reportingService, "settingsService", reportsService);
		ReflectionTestUtils.setField(reportingService, "samplesFrendOnlyService",
				mock(SamplesFrendOnlyService.class));

		// One real database, three connections pointing at it. C points at the same file on purpose:
		// it has to be a connection that genuinely works, or "the administrator runs it too" would be
		// proved by a broken connection refusing everybody equally.
		// config/burst is the installation's own folder, and the report list reads it before anything
		// else: an install without it is not an install, and every list assertion below would fail on
		// the folder rather than on the rule under test.
		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
				root.resolve("config/burst/settings.xml").toFile());

		northwind = NorthwindFixture.writableSqliteCopy(root.resolve("db/northwind.db"));
		writeConnection(CONNECTION_A);
		writeConnection(CONNECTION_B);
		writeConnection(CONNECTION_C);

		writeReport(REPORT_ON_A, CONNECTION_A);
		writeReport(REPORT_ON_C, CONNECTION_C);
		writeReport(FILE_REPORT, null);

		database = new IamDatabase();
		database.init();
		repository = new IamRepository(database);
		repository.insertTenant(Tenant.DEFAULT_CODE, "Default", root.toString(), null);

		limitsService = new LimitsService(repository, () -> List.of(CONNECTION_A, CONNECTION_B, CONNECTION_C));
		reportGrants = new com.flowkraft.iam.reports.ReportGrants(repository,
				() -> List.of(new CatalogReport(REPORT_ON_A, "Sales orders"),
						new CatalogReport(REPORT_ON_C, "Payroll monthly"),
						new CatalogReport(FILE_REPORT, "Invoices")));

		reportAccess = new ReportAccess(limitsService, new ReportsDeclaredConnections(reportsService), repository,
				new DashboardGrants(repository, List::of),
				new ReportGrantAccess(limitsService, repository, reportGrants));

		jobStore = new JobStore();
		jobExecutionService = mock(JobExecutionService.class);

		limitedGroup = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales and marketing",
				limitedTo(CONNECTION_A, CONNECTION_B));

		repository.insertUser("ana", null, "{noop}x", false);
		limitsService.setUserGroups("ana", List.of(limitedGroup.id()));

		repository.insertUser("otto", null, "{noop}x", false);
		limitsService.setUserGroups("otto", List.of(limitedGroup.id()));

		repository.insertUser("boss", null, "{noop}x", false);
	}

	@AfterEach
	void tearDown() {
		SecurityContextHolder.clearContext();
		if (database != null)
			database.close();

		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		AppPaths.CONFIG_DIR_PATH = previousConfigDir;
		AppPaths.LOGS_DIR_PATH = previousLogsDir;
		AppPaths.JOBS_DIR_PATH = previousJobsDir;
		Settings.PORTABLE_EXECUTABLE_DIR_PATH = previousSettingsDir;
		if (previousProperty == null)
			System.clearProperty("PORTABLE_EXECUTABLE_DIR");
		else
			System.setProperty("PORTABLE_EXECUTABLE_DIR", previousProperty);

		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// the negative half: the third connection
	// ============================================================

	@Test
	void theReportOnTheThirdConnectionIsNotInTheListTheAuthorGets() throws Exception {
		signInAs("ana", Role.REPORT_AUTHOR);

		List<String> listed = listedReportIds();

		assertFalse(listed.contains(REPORT_ON_C), "a report they would be refused must not be offered: " + listed);
		assertTrue(listed.contains(REPORT_ON_A), listed.toString());
		assertTrue(listed.contains(FILE_REPORT), listed.toString());
	}

	@Test
	void submittingItByIdIsRefusedWithTheConnectionNamedAndNothingIsLeftBehind() throws Exception {
		signInAs("ana", Role.REPORT_AUTHOR);

		ReportNotRunnableException refused = assertThrows(ReportNotRunnableException.class,
				() -> jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_C)));

		assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());
		// Not a generic 403: the sentence names the connection that stopped it, the report, and what
		// this person does have — which is what they forward to their administrator.
		assertTrue(refused.getReason().contains(CONNECTION_C), refused.getReason());
		assertTrue(refused.getReason().contains(REPORT_ON_C), refused.getReason());
		assertTrue(refused.getReason().contains(CONNECTION_A), refused.getReason());

		// No job record, no log, no partial output: the refusal happened before any of them existed.
		assertTrue(jobStore.list(null, 100).isEmpty(), "a refused job must leave no job record");
		verifyNoInteractions(jobExecutionService);
		assertTrue(isEmptyOrMissing(root.resolve("logs")), "a refused job must leave no log");
		assertTrue(isEmptyOrMissing(root.resolve("output")), "a refused job must leave no output");
	}

	@Test
	void everyOtherDoorOnThatReportRefusesTheSameAuthorToo() throws Exception {
		signInAs("ana", Role.REPORT_AUTHOR);
		ReportsController reports = reportsController();

		// The id typed into the URL, wherever it is typed.
		assertThrows(ReportNotRunnableException.class, () -> reports.getReportDetails(REPORT_ON_C));
		assertThrows(ReportNotRunnableException.class, () -> reports.loadReportSettings(REPORT_ON_C));
		assertThrows(ReportNotRunnableException.class,
				() -> reports.fetchReportData(REPORT_ON_C, null, null, false, null, new java.util.HashMap<>(),
						new MockHttpServletRequest()));
	}

	// ============================================================
	// the positive half: the connection they do have
	// ============================================================

	@Test
	void theAllowedReportIsListedSubmittedAndItsRealRowsComeBack() throws Exception {
		signInAs("ana", Role.REPORT_AUTHOR);
		ReportsController reports = reportsController();

		assertTrue(listedReportIds().contains(REPORT_ON_A));

		// The list really read this report and really saw connection A. Without this the filter
		// assertions elsewhere would still pass on a report whose connection came back blank — which
		// is exactly what a wrong capability flag or a missing reporting.xml produces.
		assertEquals(CONNECTION_A, listedReport(REPORT_ON_A).dbConnCode,
				"the listing resolved the connection this report declares");

		assertNotNull(reports.getReportDetails(REPORT_ON_A).block(), "the report they picked opens");

		ResponseEntity<Map<String, Object>> accepted =
				jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_A));

		assertEquals(HttpStatus.ACCEPTED, accepted.getStatusCode());
		assertNotNull(accepted.getBody().get("jobId"), "an accepted job comes back with an id");
		assertEquals(1, jobStore.list(null, 100).size());

		// And the rows themselves, through the real engine, from the real database. Asserted against
		// a count this test takes itself, so "it returned something" cannot pass for "it returned the
		// data": an empty result, a truncated result or somebody else's table all fail here.
		ReportDataResult data = reports.fetchReportData(REPORT_ON_A, null, null, false, null,
				new java.util.HashMap<>(), new MockHttpServletRequest()).block();

		assertNotNull(data, "the data door answered");
		assertEquals(List.of("CustomerID", "CompanyName", "Country"), data.reportColumnNames);
		assertEquals(countCustomers(), data.totalRows, "every row the database holds came back");
		assertTrue(data.totalRows > 0, "a fixture with no rows would make every assertion here vacuous");

		for (LinkedHashMap<String, Object> row : data.reportData) {
			assertNotNull(row.get("CustomerID"), row.toString());
			assertNotNull(row.get("CompanyName"), row.toString());
		}
	}

	@Test
	void theFileDatasourceReportIsListedAndRunsForTheLimitedAuthor() throws Exception {
		signInAs("ana", Role.REPORT_AUTHOR);

		assertEquals(HttpStatus.ACCEPTED,
				jobsController().submitJob(Map.of("type", "generate", "reportId", FILE_REPORT)).getStatusCode());
	}

	// ============================================================
	// the same two reports, for the people who are not limited
	// ============================================================

	@Test
	void anAdministratorSeesBothReportsAndRunsBoth() throws Exception {
		signInAs("boss", Role.ADMIN);
		ReportsController reports = reportsController();

		List<String> listed = listedReportIds();
		assertTrue(listed.containsAll(List.of(REPORT_ON_A, REPORT_ON_C, FILE_REPORT)), listed.toString());

		JobsController jobs = jobsController();
		assertEquals(HttpStatus.ACCEPTED,
				jobs.submitJob(Map.of("type", "generate", "reportId", REPORT_ON_A)).getStatusCode());
		assertEquals(HttpStatus.ACCEPTED,
				jobs.submitJob(Map.of("type", "generate", "reportId", REPORT_ON_C)).getStatusCode());

		// Including the one the author could not read: the administrator really gets C's rows.
		ReportDataResult data = reports.fetchReportData(REPORT_ON_C, null, null, false, null,
				new java.util.HashMap<>(), new MockHttpServletRequest()).block();
		assertEquals(countCustomers(), data.totalRows);
	}

	@Test
	void aPureJobOperatorIsLimitedExactlyAsTheAuthorIs() throws Exception {
		// Decision 1: the limit follows the group, not the role. An operator in the author's group
		// sees and runs what that group allows, and nothing else.
		signInAs("otto", Role.JOB_OPERATOR);

		List<String> listed = listedReportIds();
		assertFalse(listed.contains(REPORT_ON_C), listed.toString());
		assertTrue(listed.contains(REPORT_ON_A), listed.toString());

		assertThrows(ReportNotRunnableException.class,
				() -> jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_C)));

		assertEquals(HttpStatus.ACCEPTED,
				jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_A)).getStatusCode());

		ReportDataResult data = reportsController().fetchReportData(REPORT_ON_A, null, null, false, null,
				new java.util.HashMap<>(), new MockHttpServletRequest()).block();
		assertEquals(countCustomers(), data.totalRows);
	}

	// ============================================================
	// layer 2 on top of the same installation
	// ============================================================

	@Test
	void aGroupThatGrantsOneReportHidesTheOthers() throws Exception {
		reportGrants.setGroupReports(limitedGroup.id(), List.of(REPORT_ON_A));
		signInAs("ana", Role.REPORT_AUTHOR);

		List<String> listed = listedReportIds();
		assertEquals(List.of(REPORT_ON_A), listed, "granting one report grants that report only");

		// Layer 2 refuses in its own words: this report is not blocked by a connection, it is simply
		// not one of the reports this group was given.
		assertThrows(ReportNotGrantedException.class, () -> reportsController().getReportDetails(FILE_REPORT));
	}

	@Test
	void aGrantedReportOnAConnectionTheGroupDoesNotAllowIsStillRefused() throws Exception {
		// Layer 1 wins: an administrator who ticks the report has not thereby handed out the
		// connection it reads.
		reportGrants.setGroupReports(limitedGroup.id(), List.of(REPORT_ON_A, REPORT_ON_C));
		signInAs("ana", Role.REPORT_AUTHOR);

		assertFalse(listedReportIds().contains(REPORT_ON_C));

		ReportNotRunnableException refused = assertThrows(ReportNotRunnableException.class,
				() -> jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_C)));
		assertTrue(refused.getReason().contains(CONNECTION_C), refused.getReason());
		assertTrue(jobStore.list(null, 100).isEmpty());
	}

	@Test
	void grantedAndAllowedRunsTheWholeChain() throws Exception {
		reportGrants.setGroupReports(limitedGroup.id(), List.of(REPORT_ON_A));
		signInAs("ana", Role.REPORT_AUTHOR);

		assertTrue(listedReportIds().contains(REPORT_ON_A));
		assertNotNull(reportsController().getReportDetails(REPORT_ON_A).block());
		assertEquals(HttpStatus.ACCEPTED,
				jobsController().submitJob(Map.of("type", "generate", "reportId", REPORT_ON_A)).getStatusCode());

		ReportDataResult data = reportsController().fetchReportData(REPORT_ON_A, null, null, false, null,
				new java.util.HashMap<>(), new MockHttpServletRequest()).block();
		assertEquals(countCustomers(), data.totalRows);
	}

	// ============================================================
	// the installation
	// ============================================================

	/** A real connection file, written by the product's own writer, pointing at the real database. */
	private void writeConnection(String code) throws Exception {

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

		reportsService.saveSettingsConnectionDatabase(settings,
				root.resolve("config/connections/" + code + "/" + code + ".xml").toString());
	}

	/**
	 * A real report: the two files that ship, filled in through the product's own writers. Written
	 * by hand it would prove this test's idea of a report; written this way it proves the product's.
	 *
	 * @param connectionCode null for the file datasource, which declares no connection at all
	 */
	private void writeReport(String reportId, String connectionCode) throws Exception {

		Path reportDir = root.resolve("config/reports/" + reportId);
		Files.createDirectories(reportDir);

		String settingsPath = reportDir.resolve("settings.xml").toString();
		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), new File(settingsPath));
		FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), reportDir.resolve("reporting.xml").toFile());

		DocumentBursterSettings settings = reportsService.loadSettings(settingsPath);
		settings.settings.template = reportId;
		settings.settings.capabilities.reportdistribution = false;
		// The reports capability, which is also what makes the list read reporting.xml for the
		// connection code it filters on — a report without it would be filtered on a blank.
		settings.settings.capabilities.reportgenerationmailmerge = true;
		reportsService.saveSettings(settings, settingsPath);

		ReportingSettings reporting = reportsService.loadSettingsReporting(settingsPath);
		if (connectionCode == null) {
			reporting.report.datasource.type = "ds.csvfile";
		} else {
			reporting.report.datasource.type = "ds.sqlquery";
			reporting.report.datasource.sqloptions.conncode = connectionCode;
			reporting.report.datasource.sqloptions.query = QUERY;
			reporting.report.datasource.sqloptions.idcolumn = "CustomerID";
		}
		reportsService.saveSettingsReporting(reporting, settingsPath);
	}

	// ============================================================
	// helpers
	// ============================================================

	private ReportsController reportsController() {
		ReportsController controller = new ReportsController();
		ReflectionTestUtils.setField(controller, "rbSettingsService", reportsService);
		ReflectionTestUtils.setField(controller, "reportingService", reportingService);
		ReflectionTestUtils.setField(controller, "reportAccess", reportAccess);
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);
		ReflectionTestUtils.setField(controller, "dashboardAccess", new DashboardAccess(repository,
				new DashboardGrants(repository, List::of)));
		ReflectionTestUtils.setField(controller, "objectMapper", new ObjectMapper());
		return controller;
	}

	private JobsController jobsController() {
		JobsController controller = new JobsController();
		ReflectionTestUtils.setField(controller, "jobStore", jobStore);
		ReflectionTestUtils.setField(controller, "jobExecutionService", jobExecutionService);
		ReflectionTestUtils.setField(controller, "reportAccess", reportAccess);
		return controller;
	}

	/** One entry of that list, as the caller gets it — connection code included. */
	private ConfigurationFileInfo listedReport(String reportId) throws Exception {
		return reportsController().listReports(null, null).toStream()
				.filter(report -> reportId.equals(report.folderName)).findFirst()
				.orElseThrow(() -> new AssertionError(reportId + " is not in the list"));
	}

	/** The reports the signed-in caller is offered, in the order the list gives them. */
	private List<String> listedReportIds() throws Exception {
		List<String> ids = new ArrayList<>();
		reportsController().listReports(null, null).toStream()
				.forEach(report -> ids.add(report.folderName));
		ids.remove("burst");
		return ids;
	}

	/** What the database really holds, read by this test rather than by the code under test. */
	private int countCustomers() throws Exception {
		try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + northwind);
				Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery("SELECT count(*) FROM \"Customers\"")) {
			rs.next();
			return rs.getInt(1);
		}
	}

	private boolean isEmptyOrMissing(Path directory) {
		if (!Files.isDirectory(directory))
			return true;
		try (Stream<Path> entries = Files.list(directory)) {
			return entries.findAny().isEmpty();
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private LimitSettings limitedTo(String... connectionIds) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionIds));
		settings.setScripts(false);
		return settings;
	}

	/** Own role plus every weaker one, exactly as {@code IamUserDetailsService} grants them. */
	private void signInAs(String username, Role held) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));

		Authentication authentication = new UsernamePasswordAuthenticationToken(username, null, authorities);
		SecurityContextHolder.getContext().setAuthentication(authentication);
	}
}

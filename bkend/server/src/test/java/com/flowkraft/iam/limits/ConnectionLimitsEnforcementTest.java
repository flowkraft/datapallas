package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.analytics.controllers.AnalyticsController;
import com.flowkraft.analytics.engine.dto.ExploreRequest;
import com.flowkraft.analytics.engine.dto.PivotRequest;
import com.flowkraft.common.AppPaths;
import com.flowkraft.connections.ConnectionsController;
import com.flowkraft.connections.ConnectionsService;
import com.flowkraft.embed.EmbedController;
import com.flowkraft.embed.EmbedTokenService;
import com.flowkraft.embed.LockedParamsValidator;
import com.flowkraft.embed.ShareTokenService;
import com.flowkraft.exploredata.ExploreDataService;
import com.flowkraft.fs.config.FileExplorerConfiguration;
import com.flowkraft.fs.controllers.FileExplorerController;
import com.flowkraft.fs.services.FileExplorerService;
import com.flowkraft.exploredata.export.CanvasExportService;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.dashboards.DashboardAccess;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;
import com.flowkraft.queries.services.QueriesService;
import com.flowkraft.reporting.dsl.common.DslController;
import com.flowkraft.reporting.services.ReportingService;
import com.flowkraft.reports.ReportsController;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;
import com.sourcekraft.documentburster.common.settings.model.ReportSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;

/**
 * The connection limit where it is enforced: ad-hoc SQL, schema, an inline script, the connection
 * list and single read, a report's datasource, and a canvas export.
 *
 * <p>Each choke point is driven through the object that actually serves the request, with the store
 * real and everything downstream of the refusal mocked. That is the whole point of these tests: a
 * rule that {@link LimitsService} computes correctly but that some endpoint forgot to ask for is
 * not a limit, so what is pinned here is the asking — including that a refusal happens <em>before</em>
 * the work, and that the paths which must stay open (email connections, an unlimited author, an
 * administrator, a blank connection) stay open.
 */
class ConnectionLimitsEnforcementTest {

	private static final String TEST_ROOT = "./target/test-output/connection-limits-enforcement-test";

	/** In the author's group. */
	private static final String ALLOWED = "db-sales";
	/** A real connection that the author's group does not name. */
	private static final String BLOCKED = "db-hr";
	/** A database connection whose code carries no {@code db-} prefix. */
	private static final String SAMPLE = "rbt-sample-northwind-sqlite-4f2";
	/** An email connection: never hidden by a database limit. */
	private static final String EMAIL = "my-smtp";
	/** The report the stand-in {@link ReportAccess} of the typed-id tests below refuses. */
	private static final String UNRUNNABLE_REPORT = "payroll-monthly";

	private String previousPortableDir;
	private String previousPortableProperty;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private LimitsService limitsService;

	private List<String> knownConnections;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		// The installation directory is read in two places, and this fixture has to pin both: AppPaths
		// above, and the PORTABLE_EXECUTABLE_DIR system property, which is what
		// Utils.resolveWithinPortableDir - and through it FsLimitsGuard.installationRelative - actually
		// asks. Pinning only the first left the guard resolving this test's paths against whatever
		// installation the last test that booted a server happened to leave behind: outside it, the
		// path normalizes to nothing and no file rule can bite, so the three explorer tests below
		// passed or failed according to the order the suite ran in.
		previousPortableProperty = System.getProperty("PORTABLE_EXECUTABLE_DIR");
		System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());

		database = new IamDatabase();
		database.init();
		repository = new IamRepository(database);

		// Only for the default tenant the groups hang from; no endpoint under test goes near it.
		new IamService(repository, new BCryptPasswordEncoder(), new LicenseService() {
			@Override
			public LicenseDetails loadLicenseFile() {
				return new LicenseDetails();
			}
		}).bootstrap();

		knownConnections = new ArrayList<>(List.of(ALLOWED, BLOCKED, SAMPLE));
		limitsService = new LimitsService(repository, () -> knownConnections);

		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limitedTo(ALLOWED));
		AppUser author = repository.insertUser("author", null, null, false);
		repository.replaceUserGroups(author.id(), List.of(sales.id()));
		repository.insertUser("free", null, null, false);

		signInAs("author", Role.REPORT_AUTHOR);
	}

	@AfterEach
	void tearDown() {
		SecurityContextHolder.clearContext();
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		if (previousPortableProperty == null)
			System.clearProperty("PORTABLE_EXECUTABLE_DIR");
		else
			System.setProperty("PORTABLE_EXECUTABLE_DIR", previousPortableProperty);
		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// the rule itself, as the choke points ask it
	// ============================================================

	@Test
	void refusesABlockedConnection() {
		ConnectionNotAllowedException refused =
				assertThrows(ConnectionNotAllowedException.class, () -> limitsService.assertConnectionAllowed(BLOCKED));

		assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());
		assertTrue(refused.getReason().contains(BLOCKED), "the message names the connection");
	}

	@Test
	void allowsAConnectionTheGroupNames() {
		limitsService.assertConnectionAllowed(ALLOWED);
		assertTrue(limitsService.allowsConnection(ALLOWED));
	}

	@Test
	void allowsABlankConnection() {
		limitsService.assertConnectionAllowed(null);
		limitsService.assertConnectionAllowed("");
		assertTrue(limitsService.allowsConnection("   "));
	}

	@Test
	void anAuthorInNoGroupIsNotLimited() {
		signInAs("free", Role.REPORT_AUTHOR);
		limitsService.assertConnectionAllowed(BLOCKED);
	}

	@Test
	void anAdministratorIsNotLimited() {
		signInAs("author", Role.ADMIN);
		limitsService.assertConnectionAllowed(BLOCKED);
	}

	@Test
	void refusesADatabaseConnectionWhoseCodeCarriesNoPrefix() {
		assertThrows(ConnectionNotAllowedException.class, () -> limitsService.assertDatabaseConnectionAllowed(SAMPLE));
	}

	@Test
	void anEmailConnectionIsNotHiddenByADatabaseLimit() {
		limitsService.assertDatabaseConnectionAllowed(EMAIL);
	}

	// ============================================================
	// ad-hoc SQL, schema and inline scripts
	// ============================================================

	@Test
	void runSqlRefusesABlockedConnectionBeforeItLooksAtTheSql() {
		QueriesService queries = new QueriesService();
		ReflectionTestUtils.setField(queries, "limitsService", limitsService);

		// SQL the guard would refuse too: the exception proves which check ran first.
		assertThrows(ConnectionNotAllowedException.class,
				() -> queries.executeAdHocQuery(BLOCKED, "DROP TABLE orders", null));
	}

	@Test
	void schemaRefusesABlockedConnection() {
		QueriesService queries = new QueriesService();
		ReflectionTestUtils.setField(queries, "limitsService", limitsService);

		assertThrows(ConnectionNotAllowedException.class, () -> queries.getSchema(BLOCKED));
	}

	// ============================================================
	// the connection list and the single read
	// ============================================================

	@Test
	void theDatabaseListKeepsOnlyTheAllowedConnections() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		when(reports.loadSettingsConnectionDatabaseAll())
				.thenReturn(List.of(databaseConnection(ALLOWED), databaseConnection(BLOCKED)).stream());

		List<ConnectionFileInfo> listed = connectionsController(reports).listConnections("database").collectList().block();

		assertEquals(1, listed.size());
		assertEquals(ALLOWED, listed.get(0).connectionCode);
	}

	@Test
	void theEmailListIsNotFiltered() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		when(reports.loadSettingsConnectionEmailAll())
				.thenReturn(List.of(emailConnection(EMAIL), emailConnection("another-smtp")).stream());

		List<ConnectionFileInfo> listed = connectionsController(reports).listConnections("email").collectList().block();

		assertEquals(2, listed.size());
		verify(reports, never()).loadSettingsConnectionDatabaseAll();
	}

	@Test
	void anUnlimitedAuthorSeesTheWholeDatabaseList() throws Exception {
		signInAs("free", Role.REPORT_AUTHOR);

		ReportsService reports = mock(ReportsService.class);
		when(reports.loadSettingsConnectionDatabaseAll())
				.thenReturn(List.of(databaseConnection(ALLOWED), databaseConnection(BLOCKED)).stream());

		List<ConnectionFileInfo> listed = connectionsController(reports).listConnections("database").collectList().block();

		assertEquals(2, listed.size());
	}

	@Test
	void readingABlockedConnectionIsRefused() {
		ReportsService reports = mock(ReportsService.class);
		ConnectionsController controller = connectionsController(reports);

		assertThrows(ConnectionNotAllowedException.class, () -> controller.loadConnection(BLOCKED));
	}

	// ============================================================
	// pointing a report at a connection
	// ============================================================

	@Test
	void savingADatasourceOnABlockedConnectionIsRefused() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		ReportsController controller = reportsController(reports);

		assertThrows(ConnectionNotAllowedException.class,
				() -> controller.saveReportDataSource("sales-report", sqlDataSource(BLOCKED)));

		verify(reports, never()).saveSettingsReporting(any(), anyString());
	}

	@Test
	void savingADatasourceOnAScriptConnectionIsRefusedToo() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		ReportsController controller = reportsController(reports);

		assertThrows(ConnectionNotAllowedException.class,
				() -> controller.saveReportDataSource("sales-report", scriptDataSource(BLOCKED)));

		verify(reports, never()).saveSettingsReporting(any(), anyString());
	}

	@Test
	void savingADatasourceOnAnAllowedConnectionGoesThrough() throws Exception {
		ReportsService reports = mock(ReportsService.class);

		reportsController(reports).saveReportDataSource("sales-report", sqlDataSource(ALLOWED));

		verify(reports, times(1)).saveSettingsReporting(any(), anyString());
	}

	@Test
	void aDatasourceWithNoConnectionAtAllGoesThrough() throws Exception {
		ReportsService reports = mock(ReportsService.class);

		reportsController(reports).saveReportDataSource("csv-report", new ReportingSettings());

		verify(reports, times(1)).saveSettingsReporting(any(), anyString());
	}

	// ============================================================
	// publishing a canvas
	// ============================================================

	@Test
	void exportingACanvasOnABlockedConnectionIsRefusedAndWritesNothing() throws Exception {
		ExploreDataService canvases = mock(ExploreDataService.class);
		when(canvases.getCanvas("c1"))
				.thenReturn(Optional.of(Map.of("name", "Headcount", "connectionId", BLOCKED, "state", "{}")));
		ReportsService reports = mock(ReportsService.class);

		CanvasExportService export = new CanvasExportService();
		ReflectionTestUtils.setField(export, "limitsService", limitsService);
		ReflectionTestUtils.setField(export, "dataCanvasService", canvases);
		ReflectionTestUtils.setField(export, "reportsService", reports);
		ReflectionTestUtils.setField(export, "objectMapper", new ObjectMapper());

		assertThrows(ConnectionNotAllowedException.class, () -> export.export("c1"));

		verify(reports, never()).deleteConfiguration(anyString());
		verify(reports, never()).createConfiguration(anyString(), anyString(), org.mockito.ArgumentMatchers.anyBoolean(),
				org.mockito.ArgumentMatchers.anyBoolean(), any());
	}

	// ============================================================
	// the doors the review of 2026-09-24 closed
	// ============================================================
	//
	// Five endpoints reached a database the caller's groups do not name, each in its own way, and
	// none of them is a report someone else authored: they are all the caller's own query, told to
	// run on a connection of the caller's choosing. The tests below are the refusals, plus the one
	// case that had to keep working in each place.

	@Test
	void connectionMetadataOfABlockedConnectionIsRefusedAndNothingIsRead() throws Exception {
		ConnectionsService connections = mock(ConnectionsService.class);
		ConnectionsController controller = new ConnectionsController(connections, mock(ReportsService.class));
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);

		// The information schema, the table names, the ER diagram and the glossary all arrive here.
		assertThrows(ConnectionNotAllowedException.class,
				() -> controller.getMetadata(BLOCKED, "information-schema"));

		verify(connections, never()).getMetadata(anyString(), anyString());
	}

	@Test
	void connectionMetadataOfAnAllowedConnectionIsStillServed() throws Exception {
		ConnectionsService connections = mock(ConnectionsService.class);
		when(connections.getMetadata(ALLOWED, "er-diagram")).thenReturn("erDiagram { }");
		ConnectionsController controller = new ConnectionsController(connections, mock(ReportsService.class));
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);

		Map<String, String> body = controller.getMetadata(ALLOWED, "er-diagram").block().getBody();

		assertEquals("true", body.get("exists"));
		assertEquals("erDiagram { }", body.get("content"));
	}

	@Test
	void connectionMetadataOfAnEmailConnectionIsNotHiddenByADatabaseLimit() throws Exception {
		ConnectionsService connections = mock(ConnectionsService.class);
		ConnectionsController controller = new ConnectionsController(connections, mock(ReportsService.class));
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);

		controller.getMetadata(EMAIL, "glossary").block();

		verify(connections, times(1)).getMetadata(EMAIL, "glossary");
	}

	@Test
	void aParametersDslIsRefusedOnABlockedConnectionBeforeAnySelectRuns() throws Exception {
		ReportingService reporting = mock(ReportingService.class);
		DslController dsl = dslController(reporting);

		// A blank DSL: the sandbox lets it straight through, so what refuses here can only be the
		// connection check. `options: 'SELECT ...'` in a real one is what the check exists for.
		assertThrows(ConnectionNotAllowedException.class,
				() -> dsl.parse("reportparameters", Map.of("dslCode", "", "connectionCode", BLOCKED)));

		verify(reporting, never()).resolveParameterSqlOptions(any(), anyString());
	}

	@Test
	void aParametersDslOnAnAllowedConnectionStillResolvesItsOptions() throws Exception {
		ReportingService reporting = mock(ReportingService.class);

		dslController(reporting).parse("reportparameters", Map.of("dslCode", "", "connectionCode", ALLOWED));

		verify(reporting, times(1)).resolveParameterSqlOptions(any(), anyString());
	}

	@Test
	void aWidgetDslWithNoConnectionAtAllIsParsedAsBefore() throws Exception {
		ReportingService reporting = mock(ReportingService.class);

		dslController(reporting).parse("chart", Map.of("dslCode", ""));

		verify(reporting, never()).resolveParameterSqlOptions(any(), anyString());
	}

	@Test
	void exploringATableOnABlockedConnectionIsRefused() {
		assertThrows(ConnectionNotAllowedException.class, () -> analyticsController().explore(exploreOf(BLOCKED)));
	}

	@Test
	void pivotingATableOnABlockedConnectionIsRefused() {
		assertThrows(ConnectionNotAllowedException.class,
				() -> analyticsController().executePivot(pivotOfATable(BLOCKED), null, null));
	}

	@Test
	void queryingAFileThroughABlockedConnectionIsRefused() {
		assertThrows(ConnectionNotAllowedException.class, () -> analyticsController().queryFile(fileRequest(BLOCKED)));
	}

	@Test
	void readingAFileSchemaThroughABlockedConnectionIsRefused() {
		assertThrows(ConnectionNotAllowedException.class,
				() -> analyticsController().getFileSchema(fileRequest(BLOCKED)));
	}

	@Test
	void samplingAFileThroughABlockedConnectionIsRefused() {
		assertThrows(ConnectionNotAllowedException.class,
				() -> analyticsController().getFileSample(fileRequest(BLOCKED)));
	}

	@Test
	void pivotingAReportIsNotRefusedByTheConnectionLimit() {
		PivotRequest byReport = pivotOfATable(BLOCKED);
		byReport.setReportId("sales-report");

		// Opening and running a report somebody already authored stays allowed for a limited author,
		// here as everywhere else in the plan. It fails for its own reasons in a unit test — there is
		// no report on disk and no settings file to build a connection manager from — but the one
		// thing it must never fail with is the connection refusal.
		assertNotRefused(() -> analyticsController().executePivot(byReport, null, null));
	}

	@Test
	void anUnlimitedAuthorKeepsTodaysPathThroughTheAnalyticsEndpoints() {
		signInAs("free", Role.REPORT_AUTHOR);

		assertNotRefused(() -> analyticsController().explore(exploreOf(BLOCKED)));
		assertNotRefused(() -> analyticsController().queryFile(fileRequest(BLOCKED)));
		assertNotRefused(() -> analyticsController().executePivot(pivotOfATable(BLOCKED), null, null));
	}

	// ============================================================
	// the doors where a report id is typed rather than picked
	// ============================================================
	//
	// A filtered list is a courtesy; these are the places that take a report id straight from the
	// caller and hand back what it names, so each of them has to ask the question the list asked.
	// Only the asking is pinned here: which reports are refused is ReportAccessTest's subject, and a
	// stand-in that refuses exactly one report makes it unmistakable which check fired.

	@Test
	void readingOneReportByIdAsksTheQuestionTheListAsked() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		ReportsController controller = reportsController(reports, refusing(UNRUNNABLE_REPORT));

		assertThrows(ReportNotRunnableException.class, () -> controller.getReportDetails(UNRUNNABLE_REPORT));

		verify(reports, never()).loadConfigDetails(anyString());
	}

	@Test
	void readingAReportTheCallerMayRunIsStillServed() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		when(reports.loadConfigDetails(anyString())).thenReturn(new ConfigurationFileInfo());

		assertNotNull(reportsController(reports, refusing(UNRUNNABLE_REPORT)).getReportDetails("sales-report").block());
	}

	@Test
	void mintingAnEmbedTokenForAReportTheCallerMayNotRunIsRefusedAndMintsNothing() {
		EmbedTokenService tokens = mock(EmbedTokenService.class);
		EmbedController controller = embedController(tokens, mock(ShareTokenService.class), UNRUNNABLE_REPORT);

		assertThrows(ReportNotRunnableException.class,
				() -> controller.mintToken(Map.of("reportId", UNRUNNABLE_REPORT, "ttlSeconds", 3600)));

		verify(tokens, never()).mint(anyString(), anyLong(), any());
	}

	@Test
	void mintingAnEmbedTokenForAReportTheCallerMayRunStillWorks() {
		EmbedTokenService tokens = mock(EmbedTokenService.class);
		when(tokens.mint(anyString(), anyLong(), any())).thenReturn("a-token");

		ResponseEntity<?> minted = embedController(tokens, mock(ShareTokenService.class), UNRUNNABLE_REPORT)
				.mintToken(Map.of("reportId", "sales-report"));

		assertEquals(HttpStatus.OK, minted.getStatusCode());
		verify(tokens, times(1)).mint(anyString(), anyLong(), any());
	}

	@Test
	void aShareLinkForAReportItsAuthorMayNotOpenIsRefusedAndNoLinkIsCreated() {
		ShareTokenService links = mock(ShareTokenService.class);
		EmbedController controller = embedController(mock(EmbedTokenService.class), links, UNRUNNABLE_REPORT);

		assertThrows(ReportNotRunnableException.class,
				() -> controller.createShareLink(Map.of("reportId", UNRUNNABLE_REPORT, "expiresInDays", 30)));

		verify(links, never()).createShareToken(anyString(), any(), any());
	}

	@Test
	void aShareLinkForAReportItsAuthorMayOpenIsStillCreated() {
		ShareTokenService links = mock(ShareTokenService.class);
		when(links.createShareToken(anyString(), any(), any())).thenReturn("a-share-token");

		ResponseEntity<?> created = embedController(mock(EmbedTokenService.class), links, UNRUNNABLE_REPORT)
				.createShareLink(Map.of("reportId", "sales-report"));

		assertEquals(HttpStatus.OK, created.getStatusCode());
		verify(links, times(1)).createShareToken(anyString(), any(), any());
	}

	@Test
	void readingTheRawSettingsOfAReportTheCallerMayNotRunIsRefused() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		ReportsController controller = reportsController(reports, refusing(UNRUNNABLE_REPORT));

		assertThrows(ReportNotRunnableException.class, () -> controller.loadReportSettings(UNRUNNABLE_REPORT));

		// The settings name the connection the report runs on, so nothing may be read or written on
		// the way to the refusal.
		verify(reports, never()).loadSettings(anyString());
		verify(reports, never()).saveSettings(any(), anyString());
	}

	@Test
	void readingTheRawSettingsOfTheirOwnReportStillWorks() throws Exception {
		ReportsService reports = mock(ReportsService.class);
		DocumentBursterSettings stored = new DocumentBursterSettings();
		when(reports.loadSettings(anyString())).thenReturn(stored);

		assertEquals(stored,
				reportsController(reports, refusing(UNRUNNABLE_REPORT)).loadReportSettings("sales-report").block());
	}

	@Test
	void theProductsOwnDefaultsAreNotAReportAndStayReadable() throws Exception {
		// Every screen loads `_defaults` before any report is chosen, and no report list ever offered
		// it. A stand-in that refuses every id at all makes it plain that no report question is asked.
		ReportsService reports = mock(ReportsService.class);
		DocumentBursterSettings stored = new DocumentBursterSettings();
		when(reports.loadSettings(anyString())).thenReturn(stored);

		ReportAccess refusesEverything = mock(ReportAccess.class);
		doThrow(new ReportNotRunnableException("_defaults", BLOCKED, List.of(ALLOWED))).when(refusesEverything)
				.assertReportRunnable(anyString());

		assertEquals(stored, reportsController(reports, refusesEverything).loadReportSettings("_defaults").block());
	}

	// ============================================================
	// the file explorer, which opens on the folder the databases live in
	// ============================================================
	//
	// db/ is where a SQLite or DuckDB connection keeps its file — and the file is the connection:
	// whoever downloads it can query it at home, whatever the connection list showed them. Beside
	// the files sits the compose file that names and credentials the containerized databases. So
	// the explorer asks the same filesystem guard the rest of /api/system/fs/* asks.

	@Test
	void theExplorerRefusesTheDatabaseFileOfAConnectionTheCallerMayNotUse() {
		FileExplorerController controller = fileExplorerController();

		assertThrows(FileAccessNotAllowedException.class, () -> controller.downloadFile("hr/hr.db"));
		assertThrows(FileAccessNotAllowedException.class, () -> controller.viewFile("hr/hr.db"));
		assertThrows(FileAccessNotAllowedException.class, () -> controller.getFileTree("hr/hr.db"));
	}

	@Test
	void theExplorerRefusesTheComposeFileThatNamesEveryDatabase() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> fileExplorerController().viewFile("docker-compose.yml"));
	}

	@Test
	void uploadingOverADatabaseFileTheCallerMayNotUseIsRefused() {
		FilePart part = mock(FilePart.class);
		when(part.filename()).thenReturn("hr.db");

		assertThrows(FileAccessNotAllowedException.class, () -> fileExplorerController().upload(part, "hr"));

		// The refusal comes before a single byte is read from the upload.
		verify(part, never()).transferTo(any(java.nio.file.Path.class));
	}

	@Test
	void theExplorerStillServesTheDatabaseOfAConnectionTheyAreAllowed() throws Exception {
		Files.createDirectories(root.resolve("db/sales"));
		Files.writeString(root.resolve("db/sales/sales.db"), "a database, for this test");

		ResponseEntity<?> served = fileExplorerController().downloadFile("sales/sales.db").block();

		assertEquals(HttpStatus.OK, served.getStatusCode());
	}

	@Test
	void theExplorerKeepsServingTheOrdinaryFilesBesideThem() {
		assertDoesNotThrow(() -> fileExplorerController().downloadFile("sales/export.csv").block());
	}

	@Test
	void anUnlimitedAuthorKeepsTodaysExplorer() {
		signInAs("free", Role.REPORT_AUTHOR);

		assertDoesNotThrow(() -> fileExplorerController().downloadFile("hr/hr.db").block());
		assertDoesNotThrow(() -> fileExplorerController().viewFile("docker-compose.yml").block());
	}

	// ============================================================
	// helpers
	// ============================================================

	private DslController dslController(ReportingService reporting) {
		DslController controller = new DslController();
		ReflectionTestUtils.setField(controller, "reportingService", reporting);
		ReflectionTestUtils.setField(controller, "limitsSandbox", new LimitsSandbox(limitsService));
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);
		return controller;
	}

	private AnalyticsController analyticsController() {
		AnalyticsController controller = new AnalyticsController();
		ReflectionTestUtils.setField(controller, "dashboardAccess", mock(DashboardAccess.class));
		// Layer 2 of the same door, added with the report check (TODO 24). Mocked rather than real:
		// this file is about the connection a request names, and a mock ReportAccess answers
		// isLimited() = false, which leaves every refusal below coming from the connection limit.
		ReflectionTestUtils.setField(controller, "reportAccess", mock(ReportAccess.class));
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);
		return controller;
	}

	private static ExploreRequest exploreOf(String conncode) {
		ExploreRequest request = new ExploreRequest();
		request.setConnectionCode(conncode);
		request.setTableName("employees");
		request.setFields(List.of("salary"));
		return request;
	}

	private static PivotRequest pivotOfATable(String conncode) {
		PivotRequest request = new PivotRequest();
		request.setConnectionCode(conncode);
		request.setTableName("employees");
		request.setRows(List.of("department"));
		request.setVals(List.of("salary"));
		return request;
	}

	/** The body /query-file, /file-schema and /file-sample all read the connection out of. */
	private static Map<String, Object> fileRequest(String conncode) {
		return Map.of("connectionCode", conncode, "filePath", "temp/people.csv", "format", "csv",
				"query", "SELECT * FROM people");
	}

	/**
	 * Runs something that is expected to fail for its own reasons — no settings file, no report on
	 * disk — and pins the only failure that would be wrong: the connection refusal.
	 */
	private static void assertNotRefused(Executable call) {
		try {
			call.execute();
		} catch (Throwable failedForAnotherReason) {
			assertFalse(failedForAnotherReason instanceof ConnectionNotAllowedException,
					"the connection limit must not refuse this: " + failedForAnotherReason);
		}
	}

	private ConnectionsController connectionsController(ReportsService reports) {
		ConnectionsController controller = new ConnectionsController(mock(ConnectionsService.class), reports);
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);
		return controller;
	}

	/**
	 * The file explorer over the test installation, with its base directory on {@code db/} and its
	 * guard given the two file-based connections the group limits above talk about.
	 */
	private FileExplorerController fileExplorerController() {

		FileExplorerConfiguration config = mock(FileExplorerConfiguration.class);
		when(config.getBaseDirPath()).thenReturn(root.resolve("db").toString());
		when(config.getRestrictToBaseDir()).thenReturn(true);

		FsLimitsGuard fsGuard = new FsLimitsGuard(limitsService,
				() -> List.of(new DatabaseFileCatalog.DatabaseFile(ALLOWED, root.resolve("db/sales/sales.db").toString()),
						new DatabaseFileCatalog.DatabaseFile(BLOCKED, root.resolve("db/hr/hr.db").toString())));

		FileExplorerController controller = new FileExplorerController();
		ReflectionTestUtils.setField(controller, "fileSystemService", mock(FileSystemService.class));
		ReflectionTestUtils.setField(controller, "fileExplorerService", mock(FileExplorerService.class));
		ReflectionTestUtils.setField(controller, "fileExplorerConfig", config);
		ReflectionTestUtils.setField(controller, "fsGuard", fsGuard);
		return controller;
	}

	private ReportsController reportsController(ReportsService reports) {
		return reportsController(reports, mock(ReportAccess.class));
	}

	private ReportsController reportsController(ReportsService reports, ReportAccess reportAccess) {
		ReportsController controller = new ReportsController();
		ReflectionTestUtils.setField(controller, "rbSettingsService", reports);
		ReflectionTestUtils.setField(controller, "reportAccess", reportAccess);
		ReflectionTestUtils.setField(controller, "limitsService", limitsService);
		return controller;
	}

	/**
	 * A {@link ReportAccess} that refuses one named report and waves every other one through — the
	 * shape of the real thing seen from an endpoint, with the rule itself left to ReportAccessTest.
	 */
	private static ReportAccess refusing(String reportId) {
		ReportAccess reportAccess = mock(ReportAccess.class);
		doThrow(new ReportNotRunnableException(reportId, BLOCKED, List.of(ALLOWED))).when(reportAccess)
				.assertReportRunnable(reportId);
		return reportAccess;
	}

	/** The mint door, with the validator stubbed to the empty parameter lock it returns by default. */
	private EmbedController embedController(EmbedTokenService tokens, ShareTokenService links, String refusedReport) {
		LockedParamsValidator validator = mock(LockedParamsValidator.class);
		when(validator.validate(anyString(), any())).thenReturn(Map.of());

		EmbedController controller = new EmbedController();
		ReflectionTestUtils.setField(controller, "embedTokenService", tokens);
		ReflectionTestUtils.setField(controller, "shareTokenService", links);
		ReflectionTestUtils.setField(controller, "lockedParamsValidator", validator);
		ReflectionTestUtils.setField(controller, "reportAccess", refusing(refusedReport));
		return controller;
	}

	private static ReportingSettings sqlDataSource(String conncode) {
		ReportingSettings settings = new ReportingSettings();
		settings.report = new ReportSettings();
		settings.report.datasource = new ReportSettings.DataSource();
		settings.report.datasource.sqloptions = new ReportSettings.DataSource.SQLOptions();
		settings.report.datasource.sqloptions.conncode = conncode;
		return settings;
	}

	private static ReportingSettings scriptDataSource(String conncode) {
		ReportingSettings settings = new ReportingSettings();
		settings.report = new ReportSettings();
		settings.report.datasource = new ReportSettings.DataSource();
		settings.report.datasource.scriptoptions = new ReportSettings.DataSource.ScriptOptions();
		settings.report.datasource.scriptoptions.conncode = conncode;
		return settings;
	}

	private static ConnectionFileInfo databaseConnection(String code) {
		ConnectionFileInfo info = new ConnectionFileInfo();
		info.connectionCode = code;
		info.connectionType = "database-connection";
		return info;
	}

	private static ConnectionFileInfo emailConnection(String code) {
		ConnectionFileInfo info = new ConnectionFileInfo();
		info.connectionCode = code;
		info.connectionType = "email-connection";
		return info;
	}

	private static LimitSettings limitedTo(String connectionId) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionId));
		return settings;
	}

	/** Own role plus every weaker one, exactly as {@code IamUserDetailsService} grants them. */
	private void signInAs(String username, Role held) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));

		SecurityContextHolder.getContext()
				.setAuthentication(new UsernamePasswordAuthenticationToken(username, null, authorities));
		assertFalse(authorities.isEmpty());
	}
}

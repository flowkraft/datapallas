package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;
import com.flowkraft.iam.reports.ReportGrantAccess;
import com.flowkraft.iam.reports.ReportGrants;
import com.flowkraft.iam.reports.ReportNotGrantedException;
import com.flowkraft.iam.model.UserGroup;

/**
 * Layer 1: may this caller run this report at all?
 *
 * <p>The rule, not the plumbing. Which connections a report on disk declares is
 * {@code ReportsDeclaredConnections}' job and is pinned down separately; here the catalog is a map,
 * so every case below is about who is refused and what the refusal says.
 *
 * <p>Wired by hand against a real SQLite store, like {@code LimitsServiceTest} and
 * {@code DashboardGrantsTest}: the groups, the membership and the grants are the schema's work.
 */
class ReportAccessTest {

	private static final String TEST_ROOT = "./target/test-output/report-access-test";

	/** A report on the connection the group allows, one on a connection it does not, one on a file. */
	private static final String SALES_REPORT = "sales-monthly";
	private static final String PAYROLL_REPORT = "payroll-monthly";
	private static final String CSV_REPORT = "csv-invoices";
	private static final String GRANTED_DASHBOARD = "board-revenue";

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private LimitsService limitsService;
	private DashboardGrants grants;
	private ReportGrants reportGrants;
	private ReportAccess reportAccess;

	/** What each report declares; "not in the map" means a report that could not be read. */
	private Map<String, List<String>> declared;

	private List<PublishedDashboard> published;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteDirectory(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		database = new IamDatabase();
		database.init();
		repository = new IamRepository(database);
		limitsService = new LimitsService(repository, () -> List.of("sales-pg", "hr-mysql", "payroll-oracle"));

		declared = new HashMap<>();
		declared.put(SALES_REPORT, List.of("sales-pg"));
		declared.put(PAYROLL_REPORT, List.of("payroll-oracle"));
		declared.put(CSV_REPORT, List.of());
		declared.put(GRANTED_DASHBOARD, List.of("payroll-oracle"));

		published = new ArrayList<>(List.of(new PublishedDashboard(GRANTED_DASHBOARD, "Revenue")));
		grants = new DashboardGrants(repository, () -> published);

		// Layer 2 over the same store. No grant row is written unless a test writes one, so every case
		// above this one is a person whose groups name no report — which means all reports, and which
		// is why they still read as pure layer-1 cases.
		reportGrants = new ReportGrants(repository,
				() -> List.of(new CatalogReport(SALES_REPORT, "Sales"), new CatalogReport(PAYROLL_REPORT, "Payroll"),
						new CatalogReport(CSV_REPORT, "Invoices"), new CatalogReport(GRANTED_DASHBOARD, "Revenue")));

		reportAccess = new ReportAccess(limitsService, catalog(), repository, grants,
				new ReportGrantAccess(limitsService, repository, reportGrants));

		repository.insertTenant(Tenant.DEFAULT_CODE, "Default", root.toString(), null);
	}

	@AfterEach
	void tearDown() {
		SecurityContextHolder.clearContext();
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
	}

	// ============================================================
	// the refusal
	// ============================================================

	@Test
	void aReportOnAConnectionTheCallerMayNotUseIsRefusedByName() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		ReportNotRunnableException refused = assertThrows(ReportNotRunnableException.class,
				() -> reportAccess.assertReportRunnable(PAYROLL_REPORT));

		// The connection has to be named: "you failed somewhere" is the experience this replaces.
		assertTrue(refused.getReason().contains("payroll-oracle"), refused.getReason());
		assertTrue(refused.getReason().contains(PAYROLL_REPORT), refused.getReason());
		// And what they do have, so the person can ask their administrator for the right thing.
		assertTrue(refused.getReason().contains("sales-pg"), refused.getReason());
	}

	@Test
	void anOperatorIsRefusedTheSameReport() {
		// The whole point of decision 1: the operator runs what the author wrote.
		signedInAs("otto", Role.JOB_OPERATOR, limitedTo("sales-pg"));

		assertThrows(ReportNotRunnableException.class, () -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
	}

	@Test
	void aReportThatCannotBeReadIsRefusedRatherThanAllowed() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		assertThrows(ReportNotRunnableException.class, () -> reportAccess.assertReportRunnable("gone-missing"));
	}

	@Test
	void aSettingsFileIsCheckedWhenNoReportIdWasSent() {
		// A burst with no reportId, and a resumed job: both arrive as a settings file and nothing else.
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		assertThrows(ReportNotRunnableException.class,
				() -> reportAccess.assertSettingsFileRunnable(null, PAYROLL_REPORT));
		assertDoesNotThrow(() -> reportAccess.assertSettingsFileRunnable(null, SALES_REPORT));
	}

	@Test
	void aResumeWithNoConfigurationInItsProgressFileIsRefused() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		// null is what JobsController hands over when the .progress file cannot be read or names no
		// configuration — fail closed, or the one door with no report id becomes the way around this.
		assertThrows(ReportNotRunnableException.class, () -> reportAccess.assertSettingsFileRunnable(null, null));
	}

	// ============================================================
	// who is not refused
	// ============================================================

	@Test
	void theAllowedReportRuns() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(SALES_REPORT));
		assertTrue(reportAccess.allowsDeclaredConnections(List.of("sales-pg")));
	}

	@Test
	void aReportWithAFileDatasourceRunsForEverybody() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(CSV_REPORT));
		assertTrue(reportAccess.allowsDeclaredConnections(List.of()));
	}

	@Test
	void anAdministratorIsNeverRefused() {
		signedInAs("boss", Role.ADMIN, limitedTo("sales-pg"));

		assertFalse(reportAccess.isLimited());
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
		// Not even a report nobody can read, which is refused only because somebody is limited.
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable("gone-missing"));
	}

	@Test
	void somebodyInNoLimitingGroupIsNeverRefused() {
		signedInAs("otto", Role.JOB_OPERATOR, null);

		assertFalse(reportAccess.isLimited());
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
	}

	// ============================================================
	// the carve-out
	// ============================================================

	@Test
	void aDashboardGrantedToTheirGroupsOpensAlthoughItsConnectionIsNotTheirs() {
		UserGroup viewers = signedInAs("vera", Role.DASHBOARD_VIEWER, limitedTo("sales-pg"));
		grants.setGroupDashboards(viewers.id(), List.of(GRANTED_DASHBOARD), GRANTED_DASHBOARD);

		// Ticking it IS the decision that they may see what it reads (decision 1's carve-out).
		assertTrue(reportAccess.isGrantedDashboard(GRANTED_DASHBOARD));
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(GRANTED_DASHBOARD));
	}

	@Test
	void theSameDashboardIsRefusedWhenNobodyGrantedIt() {
		signedInAs("vera", Role.DASHBOARD_VIEWER, limitedTo("sales-pg"));

		// It fails if the carve-out is widened from "granted to their groups" to "is a dashboard".
		assertFalse(reportAccess.isGrantedDashboard(GRANTED_DASHBOARD));
		assertThrows(ReportNotRunnableException.class, () -> reportAccess.assertReportRunnable(GRANTED_DASHBOARD));
	}

	@Test
	void theCarveOutDoesNotWidenToOrdinaryReports() {
		UserGroup viewers = signedInAs("vera", Role.DASHBOARD_VIEWER, limitedTo("sales-pg"));
		grants.setGroupDashboards(viewers.id(), List.of(GRANTED_DASHBOARD), GRANTED_DASHBOARD);

		// Granting a dashboard says nothing about a report that is not one.
		assertThrows(ReportNotRunnableException.class, () -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
	}

	// ============================================================
	// layer 2, and how the two layers meet
	// ============================================================

	@Test
	void aReportNoGroupOfTheirsNamesRunsAllTheSame() {
		signedInAs("otto", Role.JOB_OPERATOR, limitedTo("sales-pg"));

		// Decision 7's default, and the reason an upgraded installation keeps working: grants narrow
		// only once somebody has made one.
		assertNull(reportAccess.reportIdsAllowedByGrants());
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(SALES_REPORT));
	}

	@Test
	void aReportOutsideTheGrantsIsRefusedAlthoughItsConnectionIsAllowed() {
		UserGroup group = signedInAs("otto", Role.JOB_OPERATOR, limitedTo("sales-pg"));
		reportGrants.setGroupReports(group.id(), List.of(SALES_REPORT));

		// CSV_REPORT needs no connection at all, so layer 1 has nothing to say about it. This is
		// therefore layer 2 refusing on its own, and the message says so without naming a connection.
		ReportNotGrantedException refused = assertThrows(ReportNotGrantedException.class,
				() -> reportAccess.assertReportRunnable(CSV_REPORT));
		assertTrue(refused.getReason().contains(CSV_REPORT), refused.getReason());
		assertFalse(refused.getReason().contains("sales-pg"), refused.getReason());

		assertEquals(Set.of(SALES_REPORT), reportAccess.reportIdsAllowedByGrants());
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(SALES_REPORT));
	}

	@Test
	void aGrantedReportOnAConnectionTheCallerMayNotUseIsStillRefused() {
		UserGroup group = signedInAs("otto", Role.JOB_OPERATOR, limitedTo("sales-pg"));
		reportGrants.setGroupReports(group.id(), List.of(PAYROLL_REPORT));

		// The mistake this design most invites: granting a report is not granting its connection.
		// Layer 2 admits it, layer 1 refuses it, and the message is layer 1's.
		ReportNotRunnableException refused = assertThrows(ReportNotRunnableException.class,
				() -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
		assertTrue(refused.getReason().contains("payroll-oracle"), refused.getReason());
	}

	@Test
	void grantsNarrowSomebodyWhoIsUnderNoConnectionLimitAtAll() {
		signedInAs("otto", Role.JOB_OPERATOR, null);
		UserGroup group = limitsService.createGroup(Tenant.DEFAULT_CODE, "reporting-team", new LimitSettings());
		limitsService.setUserGroups("otto", List.of(group.id()));
		reportGrants.setGroupReports(group.id(), List.of(SALES_REPORT));

		// A group that limits no connection still grants reports: the two layers are independent, and
		// layer 2 would be trivially bypassable if it only applied to people layer 1 already limits.
		assertFalse(reportAccess.isLimited());
		assertThrows(ReportNotGrantedException.class, () -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(SALES_REPORT));
	}

	@Test
	void theSettingsFileDoorIsCheckedByLayerTwoAsWell() {
		UserGroup group = signedInAs("otto", Role.JOB_OPERATOR, limitedTo("sales-pg"));
		reportGrants.setGroupReports(group.id(), List.of(SALES_REPORT));

		// A resumed job names a settings file, not a report id. The door that has no id is the one a
		// grant would otherwise be walked around.
		assertThrows(ReportNotGrantedException.class,
				() -> reportAccess.assertSettingsFileRunnable(CSV_REPORT, CSV_REPORT));
		assertDoesNotThrow(() -> reportAccess.assertSettingsFileRunnable(SALES_REPORT, SALES_REPORT));
	}

	@Test
	void aGrantedDashboardStillOpensForAViewerWhoseGroupsNameReports() {
		UserGroup viewers = signedInAs("vera", Role.DASHBOARD_VIEWER, limitedTo("sales-pg"));
		grants.setGroupDashboards(viewers.id(), List.of(GRANTED_DASHBOARD), GRANTED_DASHBOARD);
		reportGrants.setGroupReports(viewers.id(), List.of(SALES_REPORT));

		// The carve-out is asked before either layer: ticking a dashboard is the decision, and a
		// report grant made in the same group must not quietly take it back.
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(GRANTED_DASHBOARD));
	}

	@Test
	void anAdministratorIsSubjectToNoGrant() {
		signedInAs("boss", Role.ADMIN, null);
		UserGroup group = limitsService.createGroup(Tenant.DEFAULT_CODE, "everyone", new LimitSettings());
		limitsService.setUserGroups("boss", List.of(group.id()));
		reportGrants.setGroupReports(group.id(), List.of(SALES_REPORT));

		assertNull(reportAccess.reportIdsAllowedByGrants());
		assertDoesNotThrow(() -> reportAccess.assertReportRunnable(PAYROLL_REPORT));
	}

	// ============================================================
	// the listing side
	// ============================================================

	@Test
	void theListAsksTheSameQuestionDispatchAsks() {
		signedInAs("dana", Role.REPORT_AUTHOR, limitedTo("sales-pg"));

		assertTrue(reportAccess.isLimited());
		assertTrue(reportAccess.allowsDeclaredConnections(List.of("sales-pg")));
		assertFalse(reportAccess.allowsDeclaredConnections(List.of("payroll-oracle")));
		// A report reading two connections needs both, not either.
		assertFalse(reportAccess.allowsDeclaredConnections(List.of("sales-pg", "payroll-oracle")));
		// Nothing known about it is not permission.
		assertFalse(reportAccess.allowsDeclaredConnections(null));
	}

	// ============================================================
	// helpers
	// ============================================================

	private ReportConnectionCatalog catalog() {
		return new ReportConnectionCatalog() {

			@Override
			public Optional<List<String>> connectionsOfSettingsFile(String settingsFilePath) {
				return settingsFilePath == null ? Optional.empty()
						: Optional.ofNullable(declared.get(settingsFilePath));
			}

			@Override
			public Optional<List<String>> connectionsOfReport(String reportId) {
				return Optional.ofNullable(declared.get(reportId));
			}
		};
	}

	/** Creates the user, puts them in a group with these limits, and makes them the caller. */
	private UserGroup signedInAs(String username, Role role, LimitSettings settings) {

		repository.insertUser(username, null, "{noop}x", false);

		UserGroup group = null;
		if (settings != null) {
			group = limitsService.createGroup(Tenant.DEFAULT_CODE, username + "-group", settings);
			limitsService.setUserGroups(username, List.of(group.id()));
		}

		SecurityContextHolder.getContext().setAuthentication(authenticationFor(username, role));
		return group;
	}

	private LimitSettings limitedTo(String connectionId) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(List.of(connectionId));
		settings.setScripts(false);
		return settings;
	}

	/** Own role plus every weaker one, exactly as {@code IamUserDetailsService} grants them. */
	private Authentication authenticationFor(String username, Role held) {

		List<GrantedAuthority> authorities = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));

		return new UsernamePasswordAuthenticationToken(username, null, authorities);
	}
}

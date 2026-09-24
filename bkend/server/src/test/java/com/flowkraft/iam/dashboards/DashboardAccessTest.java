package com.flowkraft.iam.dashboards;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.analytics.controllers.AnalyticsController;
import com.flowkraft.analytics.engine.dto.PivotRequest;
import com.flowkraft.common.AppPaths;
import com.flowkraft.embed.TokenRequest;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.reports.DashboardController;
import com.flowkraft.reports.ReportsController;

/**
 * The refusal itself, and the four requests it has to fire on.
 *
 * <p>Opening a dashboard is four requests — the page, the report's config, its data and a server-side
 * pivot of it — and a viewer refused the page but served the data has not been refused anything. So
 * the rule is tested once, here, and then each of the four controllers is called with a viewer's
 * session to prove that it asks at all: they are wired by hand with nothing but the check, because a
 * refusal has to happen before any of the work does.
 */
class DashboardAccessTest {

	private static final String TEST_ROOT = "./target/test-output/dashboard-access-test";

	private static final PublishedDashboard REVENUE = new PublishedDashboard("g-dashboard", "Monthly revenue");
	private static final PublishedDashboard PIVOT = new PublishedDashboard("g-pivottable", "Cash flow");

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private DashboardGrants grants;
	private DashboardAccess dashboardAccess;
	private Tenant tenant;

	private List<PublishedDashboard> published;

	/** A viewer of "Monthly revenue" and nothing else. */
	private Authentication viewer;

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

		published = new ArrayList<>(List.of(REVENUE, PIVOT));
		grants = new DashboardGrants(repository, () -> published.stream()
				.sorted(Comparator.comparing(PublishedDashboard::name, String.CASE_INSENSITIVE_ORDER)).toList());
		dashboardAccess = new DashboardAccess(repository, grants);

		tenant = repository.insertTenant(Tenant.DEFAULT_CODE, "Default", root.toString(), null);

		AppUser mark = repository.insertUser("mark", null, "{noop}x", false);
		repository.upsertMembership(mark.id(), tenant.id(), Role.DASHBOARD_VIEWER);
		UserGroup finance = repository.insertGroup(tenant.id(), "Finance", "{}");
		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id()), null);
		repository.replaceUserGroups(mark.id(), List.of(finance.id()));

		viewer = authenticationFor("mark", Role.DASHBOARD_VIEWER);
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
	}

	// ============================================================
	// the rule
	// ============================================================

	@Test
	void aViewerOpensWhatTheirGroupsGrant() {
		assertDoesNotThrow(() -> dashboardAccess.check(viewer, REVENUE.id(), new MockHttpServletRequest()));
	}

	@Test
	void aViewerIsRefusedADashboardNobodyGrantedThem() {

		DashboardNotGrantedException refused = assertThrows(DashboardNotGrantedException.class,
				() -> dashboardAccess.check(viewer, PIVOT.id(), new MockHttpServletRequest()));

		assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());
	}

	@Test
	void aViewerIsRefusedAReportThatIsNotADashboard() {

		// The gap this closes: every signed-in caller could read any report by id. For a viewer, a
		// report that is not a dashboard is now as refused as an ungranted one.
		assertThrows(DashboardNotGrantedException.class,
				() -> dashboardAccess.check(viewer, "payroll-report", new MockHttpServletRequest()));
	}

	@Test
	void aViewerIsRefusedAGrantWhoseDashboardIsGone() {

		published.remove(REVENUE);

		assertThrows(DashboardNotGrantedException.class,
				() -> dashboardAccess.check(viewer, REVENUE.id(), new MockHttpServletRequest()));
	}

	@Test
	void aViewerIsRefusedAnEmptyReportId() {
		assertThrows(DashboardNotGrantedException.class,
				() -> dashboardAccess.check(viewer, " ", new MockHttpServletRequest()));
	}

	@Test
	void everyOtherRoleIsLeftAlone() {

		// An author is not asked about grants at all — not even for a report that does not exist.
		for (Role role : List.of(Role.JOB_OPERATOR, Role.REPORT_AUTHOR, Role.ADMIN))
			assertDoesNotThrow(() -> dashboardAccess.check(authenticationFor("author", role), "anything-at-all",
					new MockHttpServletRequest()), role.name() + " must not be checked against dashboard grants");
	}

	@Test
	void aRequestATokenOpenedIsNotChecked() {

		MockHttpServletRequest request = new MockHttpServletRequest();
		TokenRequest.mark(request, PIVOT.id());

		// The token was verified against that one report, which is narrower than any grant. Checking it
		// again against the viewer's grants would refuse the share link its own creator sent out.
		assertDoesNotThrow(() -> dashboardAccess.check(viewer, PIVOT.id(), request));
	}

	@Test
	void anAnonymousCallerIsNotAViewer() {
		assertFalse(dashboardAccess.isDashboardViewer(null));
		assertTrue(dashboardAccess.isDashboardViewer(viewer));
		assertFalse(dashboardAccess.isDashboardViewer(authenticationFor("ann", Role.ADMIN)));
	}

	// ============================================================
	// the four requests that are one act of opening a dashboard
	// ============================================================

	@Test
	void theDashboardPageAsks() {

		DashboardController controller = new DashboardController();
		ReflectionTestUtils.setField(controller, "dashboardAccess", dashboardAccess);

		assertThrows(DashboardNotGrantedException.class,
				() -> as(viewer, () -> controller.viewDashboard(PIVOT.id(), null, new MockHttpServletRequest())));
	}

	@Test
	void theReportConfigAsks() {

		ReportsController controller = new ReportsController();
		ReflectionTestUtils.setField(controller, "dashboardAccess", dashboardAccess);

		assertThrows(DashboardNotGrantedException.class,
				() -> as(viewer, () -> controller.getReportConfig(PIVOT.id(), new MockHttpServletRequest())));
	}

	@Test
	void theReportDataAsks() {

		ReportsController controller = new ReportsController();
		ReflectionTestUtils.setField(controller, "dashboardAccess", dashboardAccess);

		assertThrows(DashboardNotGrantedException.class,
				() -> as(viewer, () -> controller.fetchReportData(PIVOT.id(), null, null, false, null,
						new java.util.HashMap<String, String>(), new MockHttpServletRequest())));
	}

	@Test
	void theServerSidePivotAsks() {

		AnalyticsController controller = new AnalyticsController();
		ReflectionTestUtils.setField(controller, "dashboardAccess", dashboardAccess);

		assertThrows(DashboardNotGrantedException.class, () -> as(viewer,
				() -> controller.executePivot(new PivotRequest(), PIVOT.id(), new MockHttpServletRequest())));
	}

	// ============================================================
	// helpers
	// ============================================================

	/** Runs the call with that caller in the security context, as a request being served would. */
	private void as(Authentication authentication, ThrowingCall call) throws Exception {
		org.springframework.security.core.context.SecurityContextHolder.getContext()
				.setAuthentication(authentication);
		try {
			call.run();
		} finally {
			org.springframework.security.core.context.SecurityContextHolder.clearContext();
		}
	}

	private interface ThrowingCall {
		void run() throws Exception;
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

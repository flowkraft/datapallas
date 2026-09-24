package com.flowkraft.iam.dashboards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.GroupsController;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.UsersController;
import com.flowkraft.iam.dashboards.DashboardsController.MyDashboardsDto;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.dtos.CreateUserRequestDto;
import com.flowkraft.iam.dtos.GroupDto;
import com.flowkraft.iam.dtos.TenantUserDto;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;
import com.flowkraft.iam.reports.ReportGrants;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;

/**
 * The two dashboard lists, called as the screens call them.
 *
 * <p>{@code GET /api/iam/dashboards} is what the group dialog offers to tick;
 * {@code GET /api/me/dashboards} is what the AI Hub renders its viewer page and its switcher from;
 * and {@code opensOn} on the user listing is what the Edit User dialog shows an admin. All three have
 * to agree about which dashboards a viewer has, which is why they are tested together and against one
 * store.
 */
class DashboardsEndpointsTest {

	private static final String TEST_ROOT = "./target/test-output/dashboards-endpoints-test";

	private static final PublishedDashboard REVENUE = new PublishedDashboard("g-dashboard", "Monthly revenue");
	private static final PublishedDashboard PIVOT = new PublishedDashboard("g-pivottable", "Cash flow");

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private IamService iamService;
	private LimitsService limitsService;
	private DashboardGrants grants;
	private DashboardsController dashboardsController;
	private GroupsController groupsController;
	private UsersController usersController;

	private List<PublishedDashboard> published;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		database = new IamDatabase();
		database.init();
		repository = new IamRepository(database);
		iamService = new IamService(repository, new BCryptPasswordEncoder(), new LicenseService() {
			@Override
			public LicenseDetails loadLicenseFile() {
				return new LicenseDetails();
			}
		});
		iamService.bootstrap();

		limitsService = new LimitsService(repository, () -> List.of("sales-pg"));

		published = new ArrayList<>(List.of(REVENUE, PIVOT));
		grants = new DashboardGrants(repository, () -> published.stream()
				.sorted(Comparator.comparing(PublishedDashboard::name, String.CASE_INSENSITIVE_ORDER)).toList());

		dashboardsController = new DashboardsController();
		ReflectionTestUtils.setField(dashboardsController, "grants", grants);
		ReflectionTestUtils.setField(dashboardsController, "dashboardAccess", new DashboardAccess(repository, grants));
		ReflectionTestUtils.setField(dashboardsController, "repository", repository);

		// Report grants over the same store. Nothing here ever grants a report, so every group made
		// below keeps handing its members every report — which is what these dashboard tests assume.
		// The catalogue is the two published dashboards, because a dashboard is a report like any other.
		ReportGrants reportGrants = new ReportGrants(repository,
				() -> published.stream().map(dashboard -> new CatalogReport(dashboard.id(), dashboard.name()))
						.toList());

		groupsController = new GroupsController();
		ReflectionTestUtils.setField(groupsController, "limitsService", limitsService);
		ReflectionTestUtils.setField(groupsController, "iamService", iamService);
		ReflectionTestUtils.setField(groupsController, "dashboardGrants", grants);
		ReflectionTestUtils.setField(groupsController, "reportGrants", reportGrants);

		usersController = new UsersController();
		ReflectionTestUtils.setField(usersController, "iamService", iamService);
		ReflectionTestUtils.setField(usersController, "limitsService", limitsService);
		ReflectionTestUtils.setField(usersController, "dashboardGrants", grants);
		ReflectionTestUtils.setField(usersController, "reportGrants", reportGrants);

		signInAsAdmin();
	}

	@AfterEach
	void tearDown() {
		SecurityContextHolder.clearContext();
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// what the group dialog offers
	// ============================================================

	@Test
	void theAdminListSortsEveryPublishedDashboardByName() {
		assertEquals(List.of("Cash flow", "Monthly revenue"),
				dashboardsController.publishedDashboards().stream().map(PublishedDashboard::name).toList());
	}

	// ============================================================
	// what the signed-in person may open
	// ============================================================

	@Test
	void aViewerIsAnsweredTheirOwnDashboardsAndDefault() {
		newViewer("mark", "Finance", List.of(REVENUE.id()), REVENUE.id());
		signInAs("mark", Role.DASHBOARD_VIEWER);

		MyDashboardsDto mine = dashboardsController.myDashboards();

		assertEquals(List.of(REVENUE.id()), mine.dashboards().stream().map(PublishedDashboard::id).toList());
		assertEquals(REVENUE.id(), mine.defaultDashboard());
	}

	@Test
	void aViewerGrantedNothingIsAnsweredAnEmptyList() {
		newViewer("lisa", "Everyone", List.of(), null);
		signInAs("lisa", Role.DASHBOARD_VIEWER);

		MyDashboardsDto mine = dashboardsController.myDashboards();

		assertEquals(List.of(), mine.dashboards());
		assertNull(mine.defaultDashboard());
	}

	@Test
	void everybodyElseIsAnsweredTheWholeCatalogAndNoDefault() {
		signInAs("ann", Role.REPORT_AUTHOR);

		MyDashboardsDto mine = dashboardsController.myDashboards();

		// No role but the viewer has ever been restricted to a list of dashboards, and this is not
		// where that would start.
		assertEquals(List.of(PIVOT.id(), REVENUE.id()), mine.dashboards().stream().map(PublishedDashboard::id).toList());
		assertNull(mine.defaultDashboard());
	}

	// ============================================================
	// what the Edit User dialog shows
	// ============================================================

	@Test
	void theUserListingSaysWhereAViewerLands() {
		newViewer("mark", "Finance", List.of(REVENUE.id(), PIVOT.id()), PIVOT.id());

		assertEquals(PIVOT.id(), listedUser("mark").opensOn());
	}

	@Test
	void everyOtherRoleOpensOnNothing() {
		usersController.createUser(
				new CreateUserRequestDto("ann", null, "secret-1", Role.REPORT_AUTHOR.name(), null, null));

		assertNull(listedUser("ann").opensOn());
	}

	// ============================================================
	// helpers
	// ============================================================

	/** A dashboard viewer in one group, granted these dashboards, landing on that one. */
	private void newViewer(String username, String groupName, List<String> dashboards, String defaultDashboard) {

		Map<String, Object> body = defaultDashboard == null
				? Map.of("name", groupName, "dashboards", dashboards)
				: Map.of("name", groupName, "dashboards", dashboards, "defaultDashboard", defaultDashboard);

		ResponseEntity<?> group = groupsController.createGroup(body);
		long groupId = ((GroupDto) group.getBody()).id();

		usersController.createUser(new CreateUserRequestDto(username, null, "secret-1",
				Role.DASHBOARD_VIEWER.name(), null, List.of(groupId)));
	}

	private TenantUserDto listedUser(String username) {
		return usersController.listUsers(null).stream().filter(user -> username.equals(user.username())).findFirst()
				.orElseThrow(() -> new AssertionError("No such user in the listing: " + username));
	}

	private void signInAsAdmin() {
		signInAs(IamService.DEFAULT_SERVER_USERNAME, Role.ADMIN);
	}

	/** Own role plus every weaker one, exactly as {@code IamUserDetailsService} grants them. */
	private void signInAs(String username, Role held) {
		List<GrantedAuthority> authorities = new ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));
		SecurityContextHolder.getContext()
				.setAuthentication(new UsernamePasswordAuthenticationToken(username, null, authorities));
	}
}

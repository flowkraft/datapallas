package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.dashboards.DashboardGrants;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.dtos.CreateUserRequestDto;
import com.flowkraft.iam.dtos.GroupDto;
import com.flowkraft.iam.dtos.TenantUserDto;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;
import com.flowkraft.iam.reports.ReportGrants;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;

/**
 * The group endpoints, called as the Angular screen calls them.
 *
 * <p>The controllers are wired by hand against a real store rather than through a Spring context: what
 * is worth pinning down here is which failure becomes which status code — a 409 the screen shows next
 * to the name field, a 404 it reports as "already gone", a 400 it shows in the dialog — and a full
 * application context would add a minute to the build without testing any of it.
 *
 * <p>Method-level {@code @PreAuthorize} is not exercised here, for the same reason: that rule is
 * Spring's to apply, and the end-to-end specs prove it is applied.
 */
class GroupsEndpointsTest {

	private static final String TEST_ROOT = "./target/test-output/groups-endpoints-test";

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private IamService iamService;
	private LimitsService limitsService;
	private GroupsController groupsController;
	private UsersController usersController;

	private List<String> knownConnections;

	/** What the installation's Reports screen would show as published dashboards. */
	private List<PublishedDashboard> publishedDashboards;

	/** And every report it would show — what an admin may grant a group. */
	private List<CatalogReport> availableReports;

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

		knownConnections = new java.util.ArrayList<>(List.of("sales-pg", "hr-mysql"));
		limitsService = new LimitsService(repository, () -> knownConnections);

		publishedDashboards = new java.util.ArrayList<>(List.of(new PublishedDashboard("g-dashboard", "Monthly revenue"),
				new PublishedDashboard("g-pivottable", "Cash flow")));
		DashboardGrants dashboardGrants = new DashboardGrants(repository, () -> List.copyOf(publishedDashboards));

		availableReports = new java.util.ArrayList<>(List.of(new CatalogReport("sales-monthly", "Monthly sales"),
				new CatalogReport("payroll-monthly", "Payroll"), new CatalogReport("g-dashboard", "Monthly revenue")));
		ReportGrants reportGrants = new ReportGrants(repository, () -> List.copyOf(availableReports));

		groupsController = new GroupsController();
		ReflectionTestUtils.setField(groupsController, "limitsService", limitsService);
		ReflectionTestUtils.setField(groupsController, "iamService", iamService);
		ReflectionTestUtils.setField(groupsController, "dashboardGrants", dashboardGrants);
		ReflectionTestUtils.setField(groupsController, "reportGrants", reportGrants);

		usersController = new UsersController();
		ReflectionTestUtils.setField(usersController, "iamService", iamService);
		ReflectionTestUtils.setField(usersController, "limitsService", limitsService);
		ReflectionTestUtils.setField(usersController, "dashboardGrants", dashboardGrants);
		ReflectionTestUtils.setField(usersController, "reportGrants", reportGrants);

		// Both controllers default to the caller's own tenant, so there has to be a caller.
		SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
				IamService.DEFAULT_SERVER_USERNAME, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
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
	// groups
	// ============================================================

	@Test
	void createsAGroupAndListsIt() {
		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "Sales", "settings",
				Map.of("connections", List.of("sales-pg"), "scripts", false)));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		GroupDto created = (GroupDto) response.getBody();
		assertNotNull(created);
		assertEquals("Sales", created.name());
		assertEquals(List.of("sales-pg"), created.settings().getConnections());
		assertEquals(List.of(), created.members());

		List<GroupDto> listed = groupsController.listGroups(null);
		assertEquals(1, listed.size());
		assertEquals("Sales", listed.get(0).name());
	}

	@Test
	void aGroupWithoutSettingsIsCreatedWithNoLimits() {
		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "Everyone"));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		assertTrue(((GroupDto) response.getBody()).settings().setsNoLimits());
	}

	@Test
	void aDuplicateNameIs409() {
		groupsController.createGroup(Map.of("name", "Sales"));

		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "sales"));

		assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
		assertTrue(errorOf(response).contains("Sales") || errorOf(response).contains("sales"));
	}

	@Test
	void anUnknownSettingIs400() {
		ResponseEntity<?> response = groupsController
				.createGroup(Map.of("name", "Sales", "settings", Map.of("maxRows", 1000)));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(errorOf(response).contains("maxRows"), errorOf(response));
		assertEquals(List.of(), groupsController.listGroups(null));
	}

	@Test
	void anUnknownConnectionIs400() {
		ResponseEntity<?> response = groupsController.createGroup(
				Map.of("name", "Sales", "settings", Map.of("connections", List.of("sales-pgg"))));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(errorOf(response).contains("sales-pgg"), errorOf(response));
		assertEquals(List.of(), groupsController.listGroups(null));
	}

	@Test
	void aMissingNameIs400() {
		assertEquals(HttpStatus.BAD_REQUEST, groupsController.createGroup(Map.of("settings", Map.of())).getStatusCode());
	}

	@Test
	void editsAGroup() {
		long id = createdGroupId("Sales", Map.of("connections", List.of("sales-pg")));

		ResponseEntity<?> response = groupsController.updateGroup(id,
				Map.of("name", "Sales EMEA", "settings", Map.of("connections", List.of("hr-mysql"), "scripts", false)));

		assertEquals(HttpStatus.OK, response.getStatusCode());
		GroupDto edited = (GroupDto) response.getBody();
		assertEquals("Sales EMEA", edited.name());
		assertEquals(List.of("hr-mysql"), edited.settings().getConnections());
		assertFalse(edited.settings().allowsScripts());
	}

	@Test
	void editingAnUnknownGroupIs404() {
		assertEquals(HttpStatus.NOT_FOUND, groupsController.updateGroup(4242L, Map.of("name", "Sales")).getStatusCode());
	}

	@Test
	void deletesAnEmptyGroup() {
		long id = createdGroupId("Sales", null);

		assertEquals(HttpStatus.NO_CONTENT, groupsController.deleteGroup(id).getStatusCode());
		assertEquals(List.of(), groupsController.listGroups(null));
	}

	@Test
	void deletingAGroupThatHasMembersIs409() {
		long id = createdGroupId("Contractors", null);
		newAuthor("dana");
		usersController.setUserGroups("dana", Map.of("groupIds", List.of(id)));

		ResponseEntity<?> response = groupsController.deleteGroup(id);

		assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
		assertTrue(errorOf(response).contains("Contractors"), errorOf(response));
		assertTrue(errorOf(response).contains("1"), errorOf(response));
	}

	@Test
	void deletingAnUnknownGroupIs404() {
		assertEquals(HttpStatus.NOT_FOUND, groupsController.deleteGroup(4242L).getStatusCode());
	}

	// ============================================================
	// a user's groups
	// ============================================================

	@Test
	void setsAUsersGroups() {
		long sales = createdGroupId("Sales", Map.of("connections", List.of("sales-pg"), "scripts", false));
		newAuthor("dana");

		assertEquals(HttpStatus.NO_CONTENT,
				usersController.setUserGroups("dana", Map.of("groupIds", List.of(sales))).getStatusCode());

		TenantUserDto dana = listedUser("dana");
		assertEquals(List.of("Sales"), dana.groups().stream().map(g -> g.name()).toList());
		assertNotNull(dana.effectiveLimits());
		assertTrue(dana.effectiveLimits().allowsConnection("sales-pg"));
		assertFalse(dana.effectiveLimits().allowsScripts());

		assertEquals(List.of("dana"), groupsController.listGroups(null).get(0).members());
	}

	@Test
	void clearingAUsersGroupsLeavesThemUnlimited() {
		long sales = createdGroupId("Sales", Map.of("connections", List.of("sales-pg")));
		newAuthor("dana");
		usersController.setUserGroups("dana", Map.of("groupIds", List.of(sales)));

		usersController.setUserGroups("dana", Map.of("groupIds", List.of()));

		TenantUserDto dana = listedUser("dana");
		assertEquals(List.of(), dana.groups());
		assertNull(dana.effectiveLimits());
	}

	@Test
	void anUnknownUserIs404() {
		assertEquals(HttpStatus.NOT_FOUND,
				usersController.setUserGroups("nobody", Map.of("groupIds", List.of())).getStatusCode());
	}

	@Test
	void anUnknownGroupIs400() {
		newAuthor("dana");

		ResponseEntity<?> response = usersController.setUserGroups("dana", Map.of("groupIds", List.of(4242)));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(errorOf(response).contains("4242"), errorOf(response));
	}

	/** An admin is in the same groups as anybody else, and is still not limited by them. */
	@Test
	void anAdminInALimitingGroupShowsNoEffectiveLimits() {
		long sales = createdGroupId("Sales", Map.of("connections", List.of("sales-pg")));
		usersController.setUserGroups(IamService.DEFAULT_SERVER_USERNAME, Map.of("groupIds", List.of(sales)));

		TenantUserDto admin = listedUser(IamService.DEFAULT_SERVER_USERNAME);
		assertEquals(List.of("Sales"), admin.groups().stream().map(g -> g.name()).toList());
		assertNull(admin.effectiveLimits());
	}

	// ============================================================
	// creating a user with groups
	// ============================================================

	@Test
	void createsAUserInGroups() {
		long sales = createdGroupId("Sales", Map.of("connections", List.of("sales-pg")));

		ResponseEntity<?> response = usersController.createUser(new CreateUserRequestDto("dana", null, "secret-1",
				Role.REPORT_AUTHOR.name(), null, List.of(sales)));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		assertEquals(List.of("Sales"), listedUser("dana").groups().stream().map(g -> g.name()).toList());
	}

	@Test
	void creatingAUserWithAnUnknownGroupCreatesNoUser() {
		ResponseEntity<?> response = usersController.createUser(new CreateUserRequestDto("dana", null, "secret-1",
				Role.REPORT_AUTHOR.name(), null, List.of(4242L)));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(errorOf(response).contains("4242"), errorOf(response));
		assertTrue(iamService.findUser("dana").isEmpty(), "no user should have been created");
	}

	@Test
	void creatingAUserWithoutGroupsBehavesAsBefore() {
		ResponseEntity<?> response = usersController
				.createUser(new CreateUserRequestDto("dana", null, "secret-1", Role.REPORT_AUTHOR.name(), null, null));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		TenantUserDto dana = listedUser("dana");
		assertEquals(List.of(), dana.groups());
		assertNull(dana.effectiveLimits());
	}

	// ============================================================
	// the dashboards a group grants
	// ============================================================

	@Test
	void createsAGroupWithDashboards() {
		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "Finance", "dashboards",
				List.of("g-dashboard", "g-pivottable"), "defaultDashboard", "g-pivottable"));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		GroupDto created = (GroupDto) response.getBody();
		assertEquals(List.of("g-dashboard", "g-pivottable"), created.dashboards());
		assertEquals("g-pivottable", created.defaultDashboard());
	}

	@Test
	void aGroupThatGrantsNoDashboardSaysSo() {
		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "Sales"));

		GroupDto created = (GroupDto) response.getBody();
		assertEquals(List.of(), created.dashboards());
		assertNull(created.defaultDashboard());
	}

	@Test
	void aReportThatIsNotADashboardCreatesNoGroup() {
		ResponseEntity<?> response = groupsController
				.createGroup(Map.of("name", "Finance", "dashboards", List.of("payroll-report")));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(errorOf(response).contains("payroll-report"), errorOf(response));
		assertTrue(limitsService.groupsInTenant(Tenant.DEFAULT_CODE).isEmpty(), "no group should have been created");
	}

	@Test
	void aDefaultTheGroupDoesNotGrantCreatesNoGroup() {
		ResponseEntity<?> response = groupsController.createGroup(Map.of("name", "Finance", "dashboards",
				List.of("g-dashboard"), "defaultDashboard", "g-pivottable"));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertTrue(limitsService.groupsInTenant(Tenant.DEFAULT_CODE).isEmpty(), "no group should have been created");
	}

	@Test
	void updatingAGroupReplacesItsDashboards() {
		long finance = ((GroupDto) groupsController.createGroup(Map.of("name", "Finance", "dashboards",
				List.of("g-dashboard", "g-pivottable"), "defaultDashboard", "g-dashboard")).getBody()).id();

		ResponseEntity<?> response = groupsController.updateGroup(finance,
				Map.of("name", "Finance", "dashboards", List.of("g-pivottable")));

		assertEquals(HttpStatus.OK, response.getStatusCode());
		GroupDto updated = (GroupDto) response.getBody();
		assertEquals(List.of("g-pivottable"), updated.dashboards());
		// The default the dialog no longer sends is cleared with them, never left pointing at a
		// dashboard the group has stopped granting.
		assertNull(updated.defaultDashboard());
	}

	@Test
	void aDashboardThatNoLongerExistsIsStillListedSoItCanBeUnticked() {
		long finance = ((GroupDto) groupsController
				.createGroup(Map.of("name", "Finance", "dashboards", List.of("g-dashboard", "g-pivottable")))
				.getBody()).id();

		publishedDashboards.removeIf(dashboard -> "g-pivottable".equals(dashboard.id()));

		GroupDto listed = groupsController.listGroups(null).stream().filter(g -> g.id() == finance).findFirst()
				.orElseThrow();
		assertEquals(List.of("g-dashboard", "g-pivottable"), listed.dashboards());
	}

	// ============================================================
	// helpers
	// ============================================================

	private long createdGroupId(String name, Map<String, Object> settings) {
		Map<String, Object> body = settings == null ? Map.of("name", name) : Map.of("name", name, "settings", settings);
		return ((GroupDto) groupsController.createGroup(body).getBody()).id();
	}

	private void newAuthor(String username) {
		usersController.createUser(
				new CreateUserRequestDto(username, null, "secret-1", Role.REPORT_AUTHOR.name(), null, null));
	}

	private TenantUserDto listedUser(String username) {
		return usersController.listUsers(null).stream().filter(u -> username.equals(u.username())).findFirst()
				.orElseThrow(() -> new AssertionError("No such user in the listing: " + username));
	}

	@SuppressWarnings("unchecked")
	private String errorOf(ResponseEntity<?> response) {
		return String.valueOf(((Map<String, Object>) response.getBody()).get("error"));
	}

	// ============================================================
	// report grants (layer 2)
	// ============================================================

	@Test
	void aGroupIsCreatedWithTheReportsTheDialogTicked() {
		ResponseEntity<?> response = groupsController.createGroup(
				Map.of("name", "Sales", "settings", Map.of(), "reports", List.of("sales-monthly")));

		assertEquals(HttpStatus.CREATED, response.getStatusCode());
		assertEquals(List.of("sales-monthly"), ((GroupDto) response.getBody()).reports());
	}

	@Test
	void aGroupSavedByAScreenThatKnowsNothingAboutReportGrantsKeepsGrantingNothing() {
		GroupDto sales = (GroupDto) groupsController
				.createGroup(Map.of("name", "Sales", "settings", Map.of())).getBody();

		// No "reports" key at all — what every screen written before layer 2 sends. It must mean
		// "this group names no report", which narrows nobody, and never "keep whatever was there".
		groupsController.updateGroup(sales.id(), Map.of("name", "Sales", "settings", Map.of()));

		assertEquals(List.of(), groupsController.listGroups(null).get(0).reports());
	}

	@Test
	void grantingAReportThatDoesNotExistIsA400() {
		GroupDto sales = (GroupDto) groupsController
				.createGroup(Map.of("name", "Sales", "settings", Map.of())).getBody();

		ResponseEntity<?> response = groupsController.updateGroup(sales.id(),
				Map.of("name", "Sales", "settings", Map.of(), "reports", List.of("no-such-report")));

		assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
		assertEquals(List.of(), groupsController.listGroups(null).get(0).reports());
	}

	@Test
	void theUsersScreenShowsWhatTheirGroupsActuallyGiveThem() {
		GroupDto sales = (GroupDto) groupsController
				.createGroup(Map.of("name", "Sales", "settings", Map.of(), "reports", List.of("sales-monthly")))
				.getBody();

		usersController.createUser(new CreateUserRequestDto("otto", null, "secret-pass-1",
				Role.JOB_OPERATOR.name(), null, List.of(sales.id())));

		TenantUserDto otto = listedUser("otto");
		assertEquals(List.of("sales-monthly"), otto.effectiveReports());

		// And the default, which is the opposite of an empty list: nobody has named a report for
		// them, so they may see every one.
		limitsService.setUserGroups("otto", List.of());
		assertNull(listedUser("otto").effectiveReports());
	}
}

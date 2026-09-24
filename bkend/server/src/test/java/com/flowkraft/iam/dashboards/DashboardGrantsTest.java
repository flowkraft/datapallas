package com.flowkraft.iam.dashboards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.dashboards.PublishedDashboardCatalog.PublishedDashboard;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;

/**
 * Which dashboards a group grants, and what a viewer therefore sees.
 *
 * <p>Wired by hand against a real SQLite store, like {@code LimitsServiceTest}: the union across
 * groups, the cascade when a group is deleted and the all-or-nothing write are the schema's work, and
 * a mocked repository would assert that the code calls SQL rather than that the SQL is right.
 *
 * <p>The catalog is a stub, because "which reports are dashboards" is a question about
 * {@code config/reports} on disk and is pinned down separately in
 * {@link ReportsPublishedDashboardsTest}.
 */
class DashboardGrantsTest {

	private static final String TEST_ROOT = "./target/test-output/dashboard-grants-test";

	/** The two dashboards every install ships, plus one an author published. */
	private static final PublishedDashboard REVENUE = new PublishedDashboard("g-dashboard", "Monthly revenue");
	private static final PublishedDashboard PIVOT = new PublishedDashboard("g-pivottable", "Cash flow");
	private static final PublishedDashboard PIPELINE = new PublishedDashboard("sales-pipeline", "Sales pipeline");

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private DashboardGrants grants;
	private Tenant tenant;

	/** What the installation would show; mutated by the "deleted dashboard" tests. */
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

		// Deliberately not in name order: every "sorted by name" assertion below would pass by accident
		// if the catalog were already sorted the way the tests expect.
		published = new java.util.ArrayList<>(List.of(PIPELINE, REVENUE, PIVOT));
		// The real catalog sorts by name (ReportsPublishedDashboards), so the stub must too, or every
		// assertion below about order would be testing the order this list happens to be written in.
		grants = new DashboardGrants(repository, () -> published.stream()
				.sorted(Comparator.comparing(PublishedDashboard::name, String.CASE_INSENSITIVE_ORDER)).toList());

		tenant = repository.insertTenant(Tenant.DEFAULT_CODE, "Default", root.toString(), null);
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
	}

	// ============================================================
	// granting
	// ============================================================

	@Test
	void aGroupGrantsTheDashboardsItIsGiven() {
		UserGroup finance = group("Finance");

		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), PIVOT.id()), REVENUE.id());

		assertEquals(List.of(REVENUE.id(), PIVOT.id()), grants.dashboardsOfGroup(finance.id()));
		assertEquals(REVENUE.id(), repository.findGroupById(finance.id()).get().defaultDashboard());
	}

	@Test
	void savingAgainReplacesTheWholeSet() {
		UserGroup finance = group("Finance");
		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), PIVOT.id()), REVENUE.id());

		grants.setGroupDashboards(finance.id(), List.of(PIVOT.id()), null);

		assertEquals(List.of(PIVOT.id()), grants.dashboardsOfGroup(finance.id()));
		assertNull(repository.findGroupById(finance.id()).get().defaultDashboard());
	}

	@Test
	void aReportThatIsNotAPublishedDashboardIsRefused() {
		UserGroup finance = group("Finance");

		assertThrows(IllegalArgumentException.class,
				() -> grants.setGroupDashboards(finance.id(), List.of("payroll-report"), null));

		assertTrue(grants.dashboardsOfGroup(finance.id()).isEmpty());
	}

	@Test
	void aDefaultTheGroupDoesNotGrantIsRefused() {
		UserGroup finance = group("Finance");

		assertThrows(IllegalArgumentException.class,
				() -> grants.setGroupDashboards(finance.id(), List.of(REVENUE.id()), PIVOT.id()));

		// Nothing at all was written: a refused save leaves the group as it was.
		assertTrue(grants.dashboardsOfGroup(finance.id()).isEmpty());
		assertNull(repository.findGroupById(finance.id()).get().defaultDashboard());
	}

	@Test
	void theSameDashboardTickedTwiceIsStoredOnce() {
		UserGroup finance = group("Finance");

		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), REVENUE.id()), null);

		assertEquals(List.of(REVENUE.id()), grants.dashboardsOfGroup(finance.id()));
	}

	@Test
	void deletingAGroupTakesItsGrantsWithIt() {
		UserGroup finance = group("Finance");
		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id()), null);

		repository.deleteGroup(finance.id());

		assertTrue(repository.findGroupDashboards(finance.id()).isEmpty());
	}

	// ============================================================
	// what a viewer sees
	// ============================================================

	@Test
	void aViewerSeesTheUnionOfTheirGroupsSortedByName() {
		AppUser mark = user("mark");
		UserGroup finance = group("Finance");
		UserGroup sales = group("Sales");

		grants.setGroupDashboards(finance.id(), List.of(PIVOT.id(), REVENUE.id()), null);
		grants.setGroupDashboards(sales.id(), List.of(PIPELINE.id(), REVENUE.id()), null);
		repository.replaceUserGroups(mark.id(), List.of(finance.id(), sales.id()));

		// Distinct — g-dashboard is granted twice — and by name: Cash flow, Monthly revenue, Sales
		// pipeline.
		assertEquals(List.of(PIVOT.id(), REVENUE.id(), PIPELINE.id()),
				grants.dashboardsOf(mark.id()).stream().map(PublishedDashboard::id).toList());
	}

	@Test
	void aViewerInNoGrantingGroupSeesNothing() {
		AppUser lisa = user("lisa");
		UserGroup everyone = group("Everyone");
		repository.replaceUserGroups(lisa.id(), List.of(everyone.id()));

		assertTrue(grants.dashboardsOf(lisa.id()).isEmpty());
		assertNull(grants.defaultDashboardOf(lisa.id()));
	}

	@Test
	void everyOtherRoleIsHandedTheWholeCatalog() {
		AppUser author = user("author");

		// Nobody granted them anything, and that is exactly the point: dashboard grants give a viewer
		// something, they never take anything away from the roles above.
		assertEquals(List.of(PIVOT.id(), REVENUE.id(), PIPELINE.id()),
				grants.dashboardsFor(author.id(), false).stream().map(PublishedDashboard::id).toList());
	}

	@Test
	void aDashboardThatNoLongerExistsIsIgnored() {
		AppUser mark = user("mark");
		UserGroup finance = group("Finance");
		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), PIPELINE.id()), PIPELINE.id());
		repository.replaceUserGroups(mark.id(), List.of(finance.id()));

		// The author deletes the dashboard the grant and the default both name.
		published.remove(PIPELINE);

		assertEquals(List.of(REVENUE.id()),
				grants.dashboardsOf(mark.id()).stream().map(PublishedDashboard::id).toList());
		assertEquals(REVENUE.id(), grants.defaultDashboardOf(mark.id()));

		// It is still stored, so the group dialog can show it as "(missing)" and the admin can untick it.
		assertTrue(grants.dashboardsOfGroup(finance.id()).contains(PIPELINE.id()));
	}

	// ============================================================
	// the default
	// ============================================================

	@Test
	void theDefaultComesFromTheFirstGroupByNameThatHasOne() {
		AppUser mark = user("mark");
		UserGroup finance = group("Finance");
		UserGroup sales = group("Sales");

		// Finance grants two and says nothing; Sales, later by name, names one.
		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), PIVOT.id()), null);
		grants.setGroupDashboards(sales.id(), List.of(PIPELINE.id()), PIPELINE.id());
		repository.replaceUserGroups(mark.id(), List.of(finance.id(), sales.id()));

		assertEquals(PIPELINE.id(), grants.defaultDashboardOf(mark.id()));
	}

	@Test
	void anEarlierGroupsDefaultWins() {
		AppUser mark = user("mark");
		UserGroup finance = group("Finance");
		UserGroup sales = group("Sales");

		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id()), REVENUE.id());
		grants.setGroupDashboards(sales.id(), List.of(PIPELINE.id()), PIPELINE.id());
		repository.replaceUserGroups(mark.id(), List.of(sales.id(), finance.id()));

		// Finance sorts before Sales, whatever order the memberships were written in.
		assertEquals(REVENUE.id(), grants.defaultDashboardOf(mark.id()));
	}

	@Test
	void withoutADefaultTheFirstDashboardByNameIsUsed() {
		AppUser mark = user("mark");
		UserGroup finance = group("Finance");

		grants.setGroupDashboards(finance.id(), List.of(REVENUE.id(), PIVOT.id()), null);
		repository.replaceUserGroups(mark.id(), List.of(finance.id()));

		// "Cash flow" before "Monthly revenue".
		assertEquals(PIVOT.id(), grants.defaultDashboardOf(mark.id()));
	}

	// ============================================================
	// the catalog question
	// ============================================================

	@Test
	void onlyAPublishedDashboardCountsAsOne() {
		assertTrue(grants.isPublishedDashboard(REVENUE.id()));
		assertFalse(grants.isPublishedDashboard("payroll-report"));
		assertFalse(grants.isPublishedDashboard(null));
		assertFalse(grants.isPublishedDashboard(" "));
	}

	// ============================================================
	// helpers
	// ============================================================

	private UserGroup group(String name) {
		return repository.insertGroup(tenant.id(), name, "{}");
	}

	private AppUser user(String username) {
		return repository.insertUser(username, null, "{noop}x", false);
	}
}

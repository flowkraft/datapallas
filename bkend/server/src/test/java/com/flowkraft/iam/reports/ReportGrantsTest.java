package com.flowkraft.iam.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;
import com.flowkraft.iam.reports.ReportCatalog.CatalogReport;

/**
 * Which reports a group grants, and what a person therefore gets — layer 2.
 *
 * <p>Wired by hand against a real SQLite store, like {@code DashboardGrantsTest} beside it: the union
 * across groups, the cascade when a group is deleted and the all-or-nothing write are the schema's
 * work, and a mocked repository would assert that the code calls SQL rather than that the SQL is
 * right.
 *
 * <p>The half of this that is easy to get wrong is not the union, it is the <b>default</b>: no rows
 * anywhere means every report, and the rule is judged across all of somebody's groups rather than one
 * group at a time. Both are asserted here, in the two tests that would pass with a per-group reading
 * and mean the opposite.
 */
class ReportGrantsTest {

	private static final String TEST_ROOT = "./target/test-output/report-grants-test";

	private static final CatalogReport SALES = new CatalogReport("sales-monthly", "Monthly sales");
	private static final CatalogReport PAYROLL = new CatalogReport("payroll-monthly", "Payroll");
	private static final CatalogReport INVOICES = new CatalogReport("csv-invoices", "Invoices");

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private ReportGrants grants;
	private Tenant tenant;

	/** What the installation's Reports screen would show; mutated by the "deleted report" tests. */
	private List<CatalogReport> available;

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

		// Deliberately not in name order, and sorted by the stub the way the real catalog sorts, so no
		// assertion about order below can pass by accident.
		available = new ArrayList<>(List.of(SALES, PAYROLL, INVOICES));
		grants = new ReportGrants(repository, () -> available.stream()
				.sorted(Comparator.comparing(CatalogReport::name, String.CASE_INSENSITIVE_ORDER)).toList());

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
	void aGroupGrantsTheReportsItIsGiven() {
		UserGroup sales = group("Sales");

		grants.setGroupReports(sales.id(), List.of(SALES.id(), INVOICES.id()));

		assertEquals(List.of(INVOICES.id(), SALES.id()), grants.reportsOfGroup(sales.id()));
	}

	@Test
	void savingAgainReplacesTheWholeSet() {
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(SALES.id(), INVOICES.id()));

		grants.setGroupReports(sales.id(), List.of(SALES.id()));

		assertEquals(List.of(SALES.id()), grants.reportsOfGroup(sales.id()));
	}

	@Test
	void aReportThatDoesNotExistIsRefusedAndNothingIsWritten() {
		UserGroup sales = group("Sales");

		assertThrows(IllegalArgumentException.class,
				() -> grants.setGroupReports(sales.id(), List.of(SALES.id(), "no-such-report")));

		// Validated before the write, so a typo in one box does not half-save the dialog.
		assertTrue(grants.reportsOfGroup(sales.id()).isEmpty());
	}

	@Test
	void theSameReportTickedTwiceIsStoredOnce() {
		UserGroup sales = group("Sales");

		grants.setGroupReports(sales.id(), List.of(SALES.id(), SALES.id()));

		assertEquals(List.of(SALES.id()), grants.reportsOfGroup(sales.id()));
	}

	// ============================================================
	// the default, and why it is the opposite of the dashboards one
	// ============================================================

	@Test
	void somebodyWhoseGroupsNameNoReportGetsEveryReport() {
		AppUser otto = user("otto");
		UserGroup everyone = group("Everyone");
		repository.replaceUserGroups(otto.id(), List.of(everyone.id()));

		// The upgrade case: an installation where nobody has ticked anything must keep working.
		assertFalse(grants.isRestricted(otto.id()));
		assertNull(grants.restrictedToOrNull(otto.id()));
		assertNull(grants.effectiveReportsOf(otto.id()));
		assertTrue(grants.grants(otto.id(), PAYROLL.id()));
	}

	@Test
	void somebodyInNoGroupAtAllGetsEveryReport() {
		AppUser otto = user("otto");

		assertFalse(grants.isRestricted(otto.id()));
		assertTrue(grants.grants(otto.id(), PAYROLL.id()));
	}

	@Test
	void oneGrantingGroupNarrowsThemToWhatItNames() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(SALES.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id()));

		assertTrue(grants.isRestricted(otto.id()));
		assertEquals(Set.of(SALES.id()), grants.restrictedToOrNull(otto.id()));
		assertTrue(grants.grants(otto.id(), SALES.id()));
		assertFalse(grants.grants(otto.id(), PAYROLL.id()));
	}

	@Test
	void aMemberOfTwoGrantingGroupsGetsTheUnion() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		UserGroup finance = group("Finance");
		grants.setGroupReports(sales.id(), List.of(SALES.id()));
		grants.setGroupReports(finance.id(), List.of(PAYROLL.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id(), finance.id()));

		assertEquals(Set.of(SALES.id(), PAYROLL.id()), grants.restrictedToOrNull(otto.id()));
		assertFalse(grants.grants(otto.id(), INVOICES.id()));
	}

	@Test
	void aGroupThatGrantsNothingHandsNothingBack() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		UserGroup allStaff = group("All staff");
		grants.setGroupReports(sales.id(), List.of(SALES.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id(), allStaff.id()));

		// The test that matters (decision 7): judged per group, "grants nothing means all" would let
		// "All staff" give everything back and the feature would undo itself the moment anybody joined
		// an unrestricted group.
		assertEquals(Set.of(SALES.id()), grants.restrictedToOrNull(otto.id()));
		assertFalse(grants.grants(otto.id(), PAYROLL.id()));
	}

	@Test
	void takingTheLastGrantAwayGivesThemEverythingBack() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(SALES.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id()));

		grants.setGroupReports(sales.id(), List.of());

		// Symmetrical with the default above, and the shape an administrator will expect: unticking
		// everything is "no opinion", not "nothing".
		assertFalse(grants.isRestricted(otto.id()));
		assertTrue(grants.grants(otto.id(), PAYROLL.id()));
	}

	@Test
	void deletingTheGrantingGroupGivesThemEverythingBack() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(SALES.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id()));

		repository.replaceUserGroups(otto.id(), List.of());
		repository.deleteGroup(sales.id());

		// ON DELETE CASCADE, so the rows go with the group rather than lingering as a grant nobody
		// can see or untick.
		assertTrue(repository.findGroupReports(sales.id()).isEmpty());
		assertFalse(grants.isRestricted(otto.id()));
	}

	// ============================================================
	// deleted reports
	// ============================================================

	@Test
	void aGrantOnADeletedReportIsStillShownToTheAdminButGrantsNothing() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(SALES.id(), PAYROLL.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id()));

		available.remove(PAYROLL);

		// Kept in the dialog, so an administrator can untick it — dropping it silently leaves a row
		// nobody can remove. Reconciled out of what the person effectively has, like the dashboards.
		assertEquals(List.of(PAYROLL.id(), SALES.id()), grants.reportsOfGroup(sales.id()));
		assertEquals(List.of(SALES.id()), grants.effectiveReportsOf(otto.id()));
	}

	@Test
	void aGroupThatNowGrantsOnlyDeletedReportsStillNarrows() {
		AppUser otto = user("otto");
		UserGroup sales = group("Sales");
		grants.setGroupReports(sales.id(), List.of(PAYROLL.id()));
		repository.replaceUserGroups(otto.id(), List.of(sales.id()));

		available.remove(PAYROLL);

		// The part worth knowing, and the opposite of what "reconciled on read" might suggest: the
		// group still names a report, so its members are still restricted — to nothing. Falling back
		// to "all" here would turn deleting a report into a way of widening access.
		assertTrue(grants.isRestricted(otto.id()));
		assertFalse(grants.grants(otto.id(), SALES.id()));
		assertEquals(List.of(), grants.effectiveReportsOf(otto.id()));
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

package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;

/**
 * Groups, membership and the combining rule, against a real SQLite store.
 *
 * <p>Wired by hand like {@code IamServiceTest}: the things worth testing here — the unique group name
 * under {@code COLLATE NOCASE}, the cascade when a user is deleted, the all-or-nothing membership
 * write — live in the schema, and a mocked repository would assert that the code calls SQL rather than
 * that the SQL is right.
 *
 * <p>The authorities in {@code authorFrom}/{@code adminFrom} are built the way
 * {@code IamUserDetailsService} builds them — own role plus every weaker one — because that hierarchy
 * is precisely what makes "is this caller a report author" a question with a wrong obvious answer.
 */
class LimitsServiceTest {

	private static final String TEST_ROOT = "./target/test-output/limits-service-test";

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private LimitsService limitsService;
	private Tenant tenant;

	/** What the installation's Connections screen would show; mutated by the validation tests. */
	private List<String> knownConnections;

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
		knownConnections = new java.util.ArrayList<>(List.of("sales-pg", "hr-mysql", "finance-oracle"));
		limitsService = new LimitsService(repository, () -> knownConnections);

		tenant = repository.insertTenant(Tenant.DEFAULT_CODE, "Default", root.toString(), null);
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
	}

	// ============================================================
	// groups
	// ============================================================

	@Test
	void createsAndListsAGroup() {
		UserGroup created = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));

		assertEquals("Sales", created.name());
		assertEquals(tenant.id(), created.tenantId());

		List<UserGroup> groups = limitsService.groupsInTenant(Tenant.DEFAULT_CODE);
		assertEquals(1, groups.size());
		LimitSettings settings = LimitSettings.parse(groups.get(0).settingsJson());
		assertEquals(List.of("sales-pg"), settings.getConnections());
		assertFalse(settings.allowsScripts());
	}

	@Test
	void aGroupWithNoSettingsStoresAnEmptyObject() {
		UserGroup created = limitsService.createGroup(Tenant.DEFAULT_CODE, "Everyone", null);

		assertEquals("{}", created.settingsJson());
		assertTrue(LimitSettings.parse(created.settingsJson()).setsNoLimits());
	}

	@Test
	void theNameIsTrimmedAndRequired() {
		assertEquals("Sales", limitsService.createGroup(Tenant.DEFAULT_CODE, "  Sales  ", null).name());
		assertThrows(IllegalArgumentException.class, () -> limitsService.createGroup(Tenant.DEFAULT_CODE, "  ", null));
		assertThrows(IllegalArgumentException.class, () -> limitsService.createGroup(Tenant.DEFAULT_CODE, null, null));
	}

	@Test
	void aDuplicateNameIsRefusedWhateverTheCase() {
		limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);

		assertThrows(LimitsService.GroupNameTakenException.class,
				() -> limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null));
		assertThrows(LimitsService.GroupNameTakenException.class,
				() -> limitsService.createGroup(Tenant.DEFAULT_CODE, "sales", null));
		assertThrows(LimitsService.GroupNameTakenException.class,
				() -> limitsService.createGroup(Tenant.DEFAULT_CODE, "SALES", null));
	}

	@Test
	void editsAGroup() {
		UserGroup created = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));

		UserGroup edited = limitsService.updateGroup(created.id(), "Sales EMEA", limits(List.of("hr-mysql"), true));

		assertEquals("Sales EMEA", edited.name());
		LimitSettings settings = LimitSettings.parse(edited.settingsJson());
		assertEquals(List.of("hr-mysql"), settings.getConnections());
		assertTrue(settings.allowsScripts());
	}

	@Test
	void aGroupCanKeepItsOwnNameWhileItsLimitsChange() {
		UserGroup created = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);

		UserGroup edited = limitsService.updateGroup(created.id(), "Sales", limits(List.of("sales-pg"), true));

		assertEquals("Sales", edited.name());
		assertFalse(LimitSettings.parse(edited.settingsJson()).setsNoLimits());
	}

	@Test
	void renamingOntoAnotherGroupIsRefused() {
		limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		UserGroup contractors = limitsService.createGroup(Tenant.DEFAULT_CODE, "Contractors", null);

		assertThrows(LimitsService.GroupNameTakenException.class,
				() -> limitsService.updateGroup(contractors.id(), "sales", null));
	}

	@Test
	void editingAnUnknownGroupIsRefused() {
		assertThrows(LimitsService.UnknownGroupException.class, () -> limitsService.updateGroup(4242L, "Sales", null));
	}

	@Test
	void deletesAnEmptyGroup() {
		UserGroup created = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);

		limitsService.deleteGroup(created.id());

		assertEquals(List.of(), limitsService.groupsInTenant(Tenant.DEFAULT_CODE));
	}

	@Test
	void deletingAGroupThatStillHasMembersIsRefused() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		AppUser author = newUser("author");
		limitsService.setUserGroups(author.username(), List.of(sales.id()));

		LimitsService.GroupHasMembersException refused = assertThrows(LimitsService.GroupHasMembersException.class,
				() -> limitsService.deleteGroup(sales.id()));

		assertTrue(refused.getMessage().contains("Sales"), refused.getMessage());
		assertTrue(refused.getMessage().contains("1"), refused.getMessage());
		assertEquals(1, limitsService.groupsInTenant(Tenant.DEFAULT_CODE).size());
	}

	@Test
	void deletingAnUnknownGroupIsRefused() {
		assertThrows(LimitsService.UnknownGroupException.class, () -> limitsService.deleteGroup(4242L));
	}

	@Test
	void aConnectionThatDoesNotExistIsRefused() {
		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pgg"), true)));

		assertTrue(refused.getMessage().contains("sales-pgg"), refused.getMessage());
		assertEquals(List.of(), limitsService.groupsInTenant(Tenant.DEFAULT_CODE));
	}

	@Test
	void aConnectionThatDoesNotExistIsRefusedOnEditToo() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), true));

		assertThrows(IllegalArgumentException.class,
				() -> limitsService.updateGroup(sales.id(), "Sales", limits(List.of("sales-pgg"), true)));

		// The group is exactly as it was.
		assertEquals(List.of("sales-pg"),
				LimitSettings.parse(limitsService.findGroup(sales.id()).orElseThrow().settingsJson()).getConnections());
	}

	@Test
	void aGroupThatLimitsNoConnectionsNeedsNoCheck() {
		knownConnections.clear();

		assertEquals("{}", limitsService.createGroup(Tenant.DEFAULT_CODE, "Everyone", null).settingsJson());
	}

	@Test
	void anUnreadableConnectionsFolderDoesNotBlockSaving() {
		// An empty catalog means "cannot tell", not "nothing exists" — refusing every save would be the
		// wrong answer, and nothing is granted by allowing it: enforcement still compares against this
		// list, so an id that matches no connection matches nothing.
		knownConnections.clear();

		UserGroup saved = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), true));

		assertEquals(List.of("sales-pg"), LimitSettings.parse(saved.settingsJson()).getConnections());
	}

	// ============================================================
	// membership
	// ============================================================

	@Test
	void setsAndClearsAUsersGroups() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		UserGroup contractors = limitsService.createGroup(Tenant.DEFAULT_CODE, "Contractors", null);
		AppUser author = newUser("author");

		limitsService.setUserGroups("author", List.of(sales.id(), contractors.id()));
		assertEquals(List.of("Contractors", "Sales"),
				limitsService.groupsOf(author.id()).stream().map(UserGroup::name).toList());
		assertEquals(List.of("author"), limitsService.membersOf(sales.id()));

		limitsService.setUserGroups("author", List.of());
		assertEquals(List.of(), limitsService.groupsOf(author.id()));
		assertEquals(List.of(), limitsService.membersOf(sales.id()));
	}

	@Test
	void settingTheSameGroupTwiceIsNotAnError() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		AppUser author = newUser("author");

		limitsService.setUserGroups("author", List.of(sales.id(), sales.id()));

		assertEquals(1, limitsService.groupsOf(author.id()).size());
	}

	@Test
	void anUnknownGroupLeavesTheUsersGroupsUntouched() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		AppUser author = newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id()));

		IllegalArgumentException refused = assertThrows(IllegalArgumentException.class,
				() -> limitsService.setUserGroups("author", List.of(sales.id(), 4242L)));

		assertTrue(refused.getMessage().contains("4242"), refused.getMessage());
		assertEquals(List.of("Sales"), limitsService.groupsOf(author.id()).stream().map(UserGroup::name).toList());
	}

	@Test
	void anUnknownUserIsRefused() {
		assertThrows(LimitsService.UnknownUserException.class, () -> limitsService.setUserGroups("nobody", List.of()));
	}

	@Test
	void deletingAUserRemovesTheirMemberRows() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", null);
		AppUser author = newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id()));

		repository.deleteUser(author.id());

		// The ON DELETE CASCADE only works because foreign keys are on for every pooled connection.
		assertEquals(List.of(), limitsService.membersOf(sales.id()));
		limitsService.deleteGroup(sales.id());
	}

	// ============================================================
	// the rule
	// ============================================================

	@Test
	void anAuthorInNoGroupIsUnlimited() {
		newUser("author");

		assertNull(limitsService.limitsFor(authorFrom("author")));
	}

	@Test
	void anAuthorInOnlyUnlimitedGroupsIsUnlimited() {
		UserGroup everyone = limitsService.createGroup(Tenant.DEFAULT_CODE, "Everyone", null);
		newUser("author");
		limitsService.setUserGroups("author", List.of(everyone.id()));

		assertNull(limitsService.limitsFor(authorFrom("author")));
	}

	@Test
	void oneLimitingGroupAppliesItsSettings() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id()));

		LimitSettings applied = limitsService.limitsFor(authorFrom("author"));

		assertNotNull(applied);
		assertTrue(applied.allowsConnection("sales-pg"));
		assertFalse(applied.allowsConnection("hr-mysql"));
		assertFalse(applied.allowsScripts());
	}

	@Test
	void twoLimitingGroupsUnionTheirConnections() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		UserGroup hr = limitsService.createGroup(Tenant.DEFAULT_CODE, "HR", limits(List.of("hr-mysql"), false));
		newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id(), hr.id()));

		LimitSettings applied = limitsService.limitsFor(authorFrom("author"));

		assertTrue(applied.allowsConnection("sales-pg"));
		assertTrue(applied.allowsConnection("hr-mysql"));
		assertFalse(applied.allowsConnection("finance-oracle"));
		assertFalse(applied.allowsScripts());
	}

	@Test
	void scriptsAreAllowedIfAnyGroupAllowsThem() {
		UserGroup strict = limitsService.createGroup(Tenant.DEFAULT_CODE, "Strict", limits(List.of("sales-pg"), false));
		UserGroup relaxed = limitsService.createGroup(Tenant.DEFAULT_CODE, "Relaxed", limits(List.of("sales-pg"), true));
		newUser("author");
		limitsService.setUserGroups("author", List.of(strict.id(), relaxed.id()));

		assertTrue(limitsService.limitsFor(authorFrom("author")).allowsScripts());
	}

	@Test
	void aGroupThatAllowsAllConnectionsWidensTheOthers() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		UserGroup scriptsOnly = limitsService.createGroup(Tenant.DEFAULT_CODE, "NoScripts", limits(null, false));
		newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id(), scriptsOnly.id()));

		LimitSettings applied = limitsService.limitsFor(authorFrom("author"));

		// "NoScripts" says nothing about connections, so it allows all of them — and groups only add.
		assertTrue(applied.allowsAllConnections());
		assertTrue(applied.allowsConnection("finance-oracle"));
		assertFalse(applied.allowsScripts());
	}

	@Test
	void aGroupAllowingNoConnectionsStillLimits() {
		UserGroup locked = limitsService.createGroup(Tenant.DEFAULT_CODE, "Locked", limits(List.of(), false));
		newUser("author");
		limitsService.setUserGroups("author", List.of(locked.id()));

		LimitSettings applied = limitsService.limitsFor(authorFrom("author"));

		assertFalse(applied.allowsAllConnections());
		assertFalse(applied.allowsConnection("sales-pg"));
	}

	@Test
	void anAdminInALimitingGroupIsNotLimited() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		newUser("boss");
		limitsService.setUserGroups("boss", List.of(sales.id()));

		// An ADMIN also holds ROLE_REPORT_AUTHOR — this is the case the admin check exists for.
		assertNull(limitsService.limitsFor(adminFrom("boss")));
	}

	/**
	 * Changed with decision 1 (2026-09-24), deliberately and not deleted: this used to assert
	 * {@code null} — an operator authors no SQL, so nothing to limit — and that was the hole. An
	 * operator runs reports somebody else pointed at a connection.
	 */
	@Test
	void aJobOperatorInALimitingGroupIsLimitedToo() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		newUser("operator");
		limitsService.setUserGroups("operator", List.of(sales.id()));

		LimitSettings applied = limitsService.limitsFor(authenticationFor("operator", Role.JOB_OPERATOR));

		assertNotNull(applied);
		assertTrue(applied.allowsConnection("sales-pg"));
		assertFalse(applied.allowsConnection("hr-mysql"));
	}

	@Test
	void aDashboardViewerInALimitingGroupIsLimitedToo() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		newUser("viewer");
		limitsService.setUserGroups("viewer", List.of(sales.id()));

		LimitSettings applied = limitsService.limitsFor(authenticationFor("viewer", Role.DASHBOARD_VIEWER));

		assertNotNull(applied);
		assertFalse(applied.allowsConnection("hr-mysql"));
	}

	@Test
	void anOperatorInNoLimitingGroupIsStillUnlimited() {
		// The upgrade promise: nobody's access changes until an admin puts them in a limiting group.
		newUser("operator");

		assertNull(limitsService.limitsFor(authenticationFor("operator", Role.JOB_OPERATOR)));
	}

	@Test
	void theInstallationKeyIsNeverLimited() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		AppUser machine = repository.insertUser(LimitsService.API_KEY_PRINCIPAL, null, null, false);
		repository.replaceUserGroups(machine.id(), List.of(sales.id()));

		assertNull(limitsService.limitsFor(authorFrom(LimitsService.API_KEY_PRINCIPAL)));
	}

	@Test
	void noAuthenticationIsNotLimited() {
		assertNull(limitsService.limitsFor(null));
	}

	@Test
	void anAuthorWhoIsNotInTheStoreIsNotLimited() {
		// A directory-backed principal that has not been provisioned locally has no groups to read.
		assertNull(limitsService.limitsFor(authorFrom("ghost")));
	}

	@Test
	void theUsersScreenSeesTheSameLimits() {
		UserGroup sales = limitsService.createGroup(Tenant.DEFAULT_CODE, "Sales", limits(List.of("sales-pg"), false));
		AppUser author = newUser("author");
		limitsService.setUserGroups("author", List.of(sales.id()));

		assertNotNull(limitsService.effectiveLimitsFor(author.id(), Role.REPORT_AUTHOR));
		assertNull(limitsService.effectiveLimitsFor(author.id(), Role.ADMIN));
		// Changed with decision 1: an operator in a limiting group is limited, and the Users screen
		// must show it rather than an empty column.
		assertNotNull(limitsService.effectiveLimitsFor(author.id(), Role.JOB_OPERATOR));
	}

	// ============================================================
	// helpers
	// ============================================================

	private AppUser newUser(String username) {
		return repository.insertUser(username, null, "{noop}x", false);
	}

	private LimitSettings limits(List<String> connections, boolean scripts) {
		LimitSettings settings = new LimitSettings();
		settings.setConnections(connections);
		settings.setScripts(scripts);
		return settings;
	}

	private Authentication authorFrom(String username) {
		return authenticationFor(username, Role.REPORT_AUTHOR);
	}

	private Authentication adminFrom(String username) {
		return authenticationFor(username, Role.ADMIN);
	}

	/** Own role plus every weaker one, exactly as {@code IamUserDetailsService} grants them. */
	private Authentication authenticationFor(String username, Role held) {
		List<GrantedAuthority> authorities = new java.util.ArrayList<>();
		for (Role weaker : Role.values())
			if (weaker != Role.PLATFORM_ADMIN && held.includes(weaker))
				authorities.add(new SimpleGrantedAuthority(weaker.authority()));

		return new UsernamePasswordAuthenticationToken(username, null, authorities);
	}
}

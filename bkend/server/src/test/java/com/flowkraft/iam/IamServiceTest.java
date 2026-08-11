package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.dtos.TenantUserDto;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;

/**
 * Tests the IAM layer against a real SQLite store.
 *
 * <p>No Spring context: the beans take their collaborators through constructors, so a test can wire
 * them in three lines and keep each case fast and obvious. The store is a real database in a temp
 * directory rather than a mock, because the things most worth testing here — the UNIQUE constraint on
 * username, {@code COLLATE NOCASE}, the membership upsert — live in the schema, and a mock would assert
 * that the code calls SQL rather than that the SQL is right.
 *
 * <p>Endpoint-level role enforcement is covered end-to-end in
 * {@code frend/reporting/e2e/specs/features/auth-authrorization.spec.ts}; what is tested here is the
 * domain underneath it.
 */
class IamServiceTest {

	private static final String TEST_ROOT = "./target/test-output/iam-service-test";

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private IamRepository repository;
	private IamService iamService;
	private AuthenticationManager authenticationManager;

	/** Entitlements the fake license reports; mutated by the license tests. */
	private int maxUsers;
	private int maxTenants;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteDirectory(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		maxUsers = 0;
		maxTenants = 0;

		database = new IamDatabase();
		database.init();

		repository = new IamRepository(database);

		PasswordEncoder encoder = new BCryptPasswordEncoder();
		iamService = new IamService(repository, encoder, fakeLicenseService());

		// Sign-in goes through the same AuthenticationManager the application uses, so these tests
		// exercise the real path rather than a parallel implementation that could drift from it.
		authenticationManager = authenticationManagerFor(iamService, encoder);
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		// Quietly: on Windows a just-closed SQLite file can linger for a moment, and a failed cleanup
		// must not be reported as a failed test.
		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// the role hierarchy
	// ============================================================

	/**
	 * The chain every {@code @PreAuthorize} in the codebase depends on.
	 *
	 * <p>Endpoints name only the weakest role allowed to use them and rely on stronger roles passing
	 * automatically, so this ordering is not a detail of the enum — it is the authorization model.
	 * And it is expressed as {@code ordinal()}, which means reordering the constants in
	 * {@link Role}, or inserting one in the middle, changes who can do what without breaking a single
	 * compile. This test is the thing that notices.
	 */
	@Test
	void roleHierarchyRunsFromStrongestToWeakest() {

		assertTrue(Role.ADMIN.includes(Role.REPORT_AUTHOR));
		assertTrue(Role.REPORT_AUTHOR.includes(Role.JOB_OPERATOR));
		assertTrue(Role.ADMIN.includes(Role.JOB_OPERATOR));

		// ...and not the other way round, which is the half that actually constrains anything.
		assertFalse(Role.REPORT_AUTHOR.includes(Role.ADMIN));
		assertFalse(Role.JOB_OPERATOR.includes(Role.REPORT_AUTHOR));
		assertFalse(Role.JOB_OPERATOR.includes(Role.ADMIN));

		// PLATFORM_ADMIN sits outside the tenant chain — it includes everything and nothing includes it.
		assertTrue(Role.PLATFORM_ADMIN.includes(Role.ADMIN));
		assertFalse(Role.ADMIN.includes(Role.PLATFORM_ADMIN));
	}

	/**
	 * The names live in the IAM store, so an installation upgraded from an earlier release still has
	 * rows saying TENANT_ADMIN. If those stop resolving, every membership orphans — starting with the
	 * administrator's, which locks the upgrader out of their own server.
	 */
	@Test
	void rolesStoredUnderTheirFormerNamesStillResolve() {

		assertEquals(Role.ADMIN, Role.parse("TENANT_ADMIN"));
		assertEquals(Role.REPORT_AUTHOR, Role.parse("AUTHOR"));
		assertEquals(Role.JOB_OPERATOR, Role.parse("OPERATOR"));

		assertEquals(Role.ADMIN, Role.parse("ADMIN"));
		assertEquals(Role.JOB_OPERATOR, Role.parse(" job_operator "));
	}

	/**
	 * REPORT_VIEWER was removed, but the rows naming it were not — nobody rewrites an IAM store during
	 * an upgrade. An unparseable role is not a degraded login, it is no login at all, so both spellings
	 * resolve to the weakest role that still exists.
	 */
	@Test
	void theRemovedViewerRoleResolvesToTheWeakestRemainingRole() {

		assertEquals(Role.JOB_OPERATOR, Role.parse("VIEWER"));
		assertEquals(Role.JOB_OPERATOR, Role.parse("REPORT_VIEWER"));
		assertEquals(Role.JOB_OPERATOR, Role.parse(" report_viewer "));
	}

	// ============================================================
	// desktop bootstrap — the desktop experience
	// ============================================================

	/**
	 * The defining requirement for Electron: after boot there is exactly one tenant and one
	 * administrator, and the user was never asked for anything.
	 */
	@Test
	void standaloneBootstrapCreatesExactlyOneTenantAndOneAdmin() {

		iamService.bootstrap();

		assertEquals(1, repository.countTenants());
		assertEquals(1, repository.countUsers());

		Tenant tenant = repository.findTenantByCode(Tenant.DEFAULT_CODE).orElseThrow();
		assertEquals(Tenant.DEFAULT_CODE, tenant.code());
		assertTrue(tenant.isActive());

		AppUser admin = repository.findUserByUsername(AppUser.DEFAULT_USERNAME).orElseThrow();
		assertTrue(admin.platformAdmin());
		assertEquals(Role.ADMIN, repository.findRole(admin.id(), tenant.id()).orElseThrow());
	}

	/**
	 * The DEFAULT administrator has no password at all — not a generated one, not a well-known one.
	 * A desktop user has the installation on their own filesystem, so a credential would protect
	 * nothing while forcing exactly the setup experience this design avoids.
	 */
	@Test
	void theDefaultAdminHasNoUsablePassword() {

		iamService.bootstrap();

		AppUser admin = repository.findUserByUsername(AppUser.DEFAULT_USERNAME).orElseThrow();
		assertNull(admin.passwordHash(), "the default admin must not have a password hash");

		// And it cannot be logged into, with anything.
		assertTrue(!signIn(iamService, AppUser.DEFAULT_USERNAME, ""));
		assertTrue(!signIn(iamService, AppUser.DEFAULT_USERNAME, "admin"));
		assertTrue(!signIn(iamService, AppUser.DEFAULT_USERNAME, "password"));
	}

	/** Restarting must not pile up duplicate tenants or admins. */
	@Test
	void standaloneBootstrapIsIdempotent() {

		iamService.bootstrap();
		iamService.bootstrap();
		iamService.bootstrap();

		assertEquals(1, repository.countTenants());
		assertEquals(1, repository.countUsers());
	}

	// ============================================================
	// the default server account
	// ============================================================

	/**
	 * A server must be usable straight after download — that is the whole reason this replaced a
	 * one-time setup token.
	 */
	@Test
	void aServerBootstrapsWithAWorkingDefaultAccount() {

		IamService server = serverModeService();
		server.bootstrap();

		assertTrue(signIn(server, IamService.DEFAULT_SERVER_USERNAME, IamService.DEFAULT_SERVER_PASSWORD),
				"burst/burst must work on a fresh server");
		assertTrue(server.isUsingDefaultCredentials());
	}

	/** The flag is derived from the password, so changing it silences the warning with nothing to clear. */
	@Test
	void changingTheDefaultPasswordClearsTheWarning() {

		IamService server = serverModeService();
		server.bootstrap();
		assertTrue(server.isUsingDefaultCredentials());

		server.changePassword(IamService.DEFAULT_SERVER_USERNAME, "SomethingElse123!");

		assertFalse(server.isUsingDefaultCredentials(), "the warning must clear once the password changes");
		assertTrue(signIn(server, IamService.DEFAULT_SERVER_USERNAME, "SomethingElse123!"));
		assertFalse(signIn(server, IamService.DEFAULT_SERVER_USERNAME, IamService.DEFAULT_SERVER_PASSWORD),
				"the old password must stop working");
	}

	/** Deleting the account is the other legitimate way to deal with it. */
	@Test
	void deletingTheDefaultAccountClearsTheWarning() {

		IamService server = serverModeService();
		server.bootstrap();
		server.createUser("real-admin", null, "RealPassword123!", Role.ADMIN, Tenant.DEFAULT_CODE);

		server.deleteUser(IamService.DEFAULT_SERVER_USERNAME);

		assertFalse(server.isUsingDefaultCredentials());
	}

	/** Restarting must not resurrect the default account after someone deliberately removed it. */
	@Test
	void theDefaultAccountIsNotRecreatedOnRestart() {

		IamService server = serverModeService();
		server.bootstrap();
		server.createUser("real-admin", null, "RealPassword123!", Role.ADMIN, Tenant.DEFAULT_CODE);
		server.deleteUser(IamService.DEFAULT_SERVER_USERNAME);

		server.bootstrap();

		assertTrue(repository.findUserByUsername(IamService.DEFAULT_SERVER_USERNAME).isEmpty(),
				"a removed default account must stay removed");
	}

	/** An install provisioned from the environment must not also get a burst/burst back door. */
	@Test
	void seedingFromTheEnvironmentSuppressesTheDefaultAccount() {

		IamService server = serverModeService();
		// Simulate the seeded case by creating the admin before bootstrap runs its default step.
		server.ensureDefaultTenant();
		repository.insertUser("seeded-admin", null, new BCryptPasswordEncoder().encode("Seeded123!"), true);

		server.bootstrap();

		assertTrue(repository.findUserByUsername(IamService.DEFAULT_SERVER_USERNAME).isEmpty());
		assertFalse(server.isUsingDefaultCredentials());
	}

	/** The desktop has no login, so it must never grow a default password. */
	@Test
	void theDesktopNeverGetsTheDefaultAccount() {

		iamService.bootstrap();

		assertTrue(repository.findUserByUsername(IamService.DEFAULT_SERVER_USERNAME).isEmpty());
		assertFalse(iamService.isUsingDefaultCredentials());
	}

	// ============================================================
	// how the enforcement decision is made
	// ============================================================

	/**
	 * The anti-tamper property. Once real accounts exist, authentication stays on even if the
	 * installation now looks like a desktop — because the only way to switch it off is to delete every
	 * account that can sign in, which does not weaken the system quietly, it breaks it loudly.
	 */
	@Test
	void realAccountsKeepAuthenticationEnforcedEvenIfTheInstallLooksLikeDesktop() {

		iamService.bootstrap();
		assertFalse(iamService.getMode().isDataPallasServer(), "a bare install starts out as desktop");

		iamService.createUser("tanya", null, "TanyaPassword123!", Role.ADMIN, Tenant.DEFAULT_CODE);

		assertTrue(iamService.resolveEffectiveMode().isDataPallasServer(),
				"a real account must pin authentication on");
	}

	/** An explicit RB_ROLE must not be able to disable authentication on a server that has accounts. */
	@Test
	void anExplicitDesktopRoleCannotDisableAuthenticationOnAServerWithAccounts() {

		iamService.bootstrap();
		iamService.createUser("victor", null, "VictorPassword123!", Role.ADMIN, Tenant.DEFAULT_CODE);

		String previous = System.getProperty("RB_ROLE");
		System.setProperty("RB_ROLE", "standalone");
		try {
			assertTrue(iamService.resolveEffectiveMode().isDataPallasServer(),
					"RB_ROLE=standalone must not open up a server that has real users");
		} finally {
			if (previous != null)
				System.setProperty("RB_ROLE", previous);
			else
				System.clearProperty("RB_ROLE");
		}
	}

	/**
	 * The password-less DEFAULT administrator does NOT count — otherwise every desktop would flip
	 * itself into multi-user mode on first boot and start demanding a login.
	 */
	@Test
	void theDefaultPasswordlessAdminDoesNotCountAsARealAccount() {

		iamService.bootstrap();

		assertEquals(1, repository.countUsers());
		assertEquals(0, repository.countUsersWithPassword());
		assertFalse(iamService.resolveEffectiveMode().isDataPallasServer());
	}

	// ============================================================
	// authentication
	// ============================================================

	@Test
	void aCorrectPasswordAuthenticates() {

		iamService.bootstrap();
		iamService.createUser("alice", "alice@example.com", "AlicePassword123!", Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		assertTrue(signIn(iamService, "alice", "AlicePassword123!"));
		assertEquals("alice", repository.findUserByUsername("alice").orElseThrow().username());
	}

	@Test
	void aWrongPasswordDoesNotAuthenticate() {

		iamService.bootstrap();
		iamService.createUser("alice", null, "AlicePassword123!", Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		assertTrue(!signIn(iamService, "alice", "AlicePassword124!"));
		assertTrue(!signIn(iamService, "alice", ""));
		assertTrue(!signIn(iamService, "alice", null));
	}

	@Test
	void anUnknownUserDoesNotAuthenticate() {

		iamService.bootstrap();

		assertTrue(!signIn(iamService, "nobody", "AnyPassword123!"));
	}

	@Test
	void aDisabledUserCannotAuthenticateEvenWithTheRightPassword() {

		iamService.bootstrap();
		iamService.createUser("bob", null, "BobPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);
		assertTrue(signIn(iamService, "bob", "BobPassword123!"));

		iamService.disableUser("bob");

		assertTrue(!signIn(iamService, "bob", "BobPassword123!"));
	}

	/** The password is hashed, so the store never holds anything that could be replayed. */
	@Test
	void passwordsAreStoredAsBcryptHashesNotPlaintext() {

		iamService.bootstrap();
		iamService.createUser("carol", null, "CarolPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		String hash = repository.findUserByUsername("carol").orElseThrow().passwordHash();

		assertNotNull(hash);
		assertFalse(hash.contains("CarolPassword123!"), "the password must not appear in the store");
		assertTrue(hash.startsWith("$2"), "expected a BCrypt hash, got: " + hash);
	}

	// ============================================================
	// user management
	// ============================================================

	/**
	 * A duplicate username is a distinct, recognisable failure so the controller can answer 409 —
	 * which is what lets provisioning scripts and e2e setup be re-run safely.
	 */
	@Test
	void aDuplicateUsernameIsRejectedDistinctly() {

		iamService.bootstrap();
		iamService.createUser("dave", null, "DavePassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		assertThrows(IamService.UsernameTakenException.class,
				() -> iamService.createUser("dave", null, "Another123!", Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE));
	}

	/** Usernames are case-insensitive, so "Alice" cannot shadow "alice". */
	@Test
	void usernamesAreCaseInsensitive() {

		iamService.bootstrap();
		iamService.createUser("erin", null, "ErinPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		assertThrows(IamService.UsernameTakenException.class,
				() -> iamService.createUser("ERIN", null, "Other123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE));

		assertTrue(signIn(iamService, "ERIN", "ErinPassword123!"));
	}

	/** PLATFORM_ADMIN is not a tenant role and must not be grantable as one. */
	@Test
	void platformAdminCannotBeGrantedAsATenantRole() {

		iamService.bootstrap();

		assertThrows(IllegalArgumentException.class, () -> iamService.createUser("frank", null, "FrankPassword123!",
				Role.PLATFORM_ADMIN, Tenant.DEFAULT_CODE));
	}

	@Test
	void aBlankUsernameOrPasswordIsRejected() {

		iamService.bootstrap();

		assertThrows(IllegalArgumentException.class,
				() -> iamService.createUser("  ", null, "Password123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE));
		assertThrows(IllegalArgumentException.class,
				() -> iamService.createUser("grace", null, "", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE));
	}

	@Test
	void changingARoleReplacesItRatherThanAddingASecondOne() {

		iamService.bootstrap();
		iamService.createUser("heidi", null, "HeidiPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		iamService.setRole("heidi", Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		assertEquals(Role.REPORT_AUTHOR, iamService.roleIn(repository.findUserByUsername("heidi").orElseThrow().id(),
				Tenant.DEFAULT_CODE).orElseThrow());
		assertEquals(1, iamService.membershipsOf(repository.findUserByUsername("heidi").orElseThrow().id()).size());
	}

	@Test
	void aChangedPasswordReplacesTheOldOne() {

		iamService.bootstrap();
		iamService.createUser("ivan", null, "IvanPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		iamService.changePassword("ivan", "IvanNewPassword456!");

		assertTrue(!signIn(iamService, "ivan", "IvanPassword123!"));
		assertTrue(signIn(iamService, "ivan", "IvanNewPassword456!"));
	}

	/** Deleting the DEFAULT admin would leave a desktop install with no principal at all. */
	@Test
	void theDefaultAdminCannotBeDeleted() {

		iamService.bootstrap();

		assertThrows(IllegalArgumentException.class, () -> iamService.deleteUser(AppUser.DEFAULT_USERNAME));
		assertEquals(1, repository.countUsers());
	}

	@Test
	void deletingAUserRemovesTheirMembership() {

		iamService.bootstrap();
		iamService.createUser("judy", null, "JudyPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);
		long judyId = repository.findUserByUsername("judy").orElseThrow().id();

		iamService.deleteUser("judy");

		assertTrue(repository.findUserByUsername("judy").isEmpty());
		assertTrue(repository.findMembershipsByTenantCode(judyId).isEmpty(),
				"the membership row must go with the user");
	}

	@Test
	void usersAreListedPerTenant() {

		iamService.bootstrap();
		iamService.createTenant("finance", "Finance", root.toString());
		iamService.createUser("karl", null, "KarlPassword123!", Role.REPORT_AUTHOR, "finance");

		List<TenantUserDto> inDefault = iamService.usersInTenant(Tenant.DEFAULT_CODE);
		List<TenantUserDto> inFinance = iamService.usersInTenant("finance");

		assertEquals(List.of(AppUser.DEFAULT_USERNAME), inDefault.stream().map(TenantUserDto::username).toList());
		assertEquals(List.of("karl"), inFinance.stream().map(TenantUserDto::username).toList());
	}

	/**
	 * The listing carries the role each user holds <em>in that tenant</em> — the same person can be an
	 * admin in one department and a viewer in another, so a role only means anything paired with a
	 * tenant.
	 */
	@Test
	void listedUsersCarryTheirRoleInThatTenant() {

		iamService.bootstrap();
		iamService.createTenant("finance", "Finance", root.toString());
		iamService.createUser("nora", null, "NoraPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);
		iamService.setRole("nora", Role.ADMIN, "finance");

		assertEquals(Role.JOB_OPERATOR.name(), roleOf(iamService.usersInTenant(Tenant.DEFAULT_CODE), "nora"));
		assertEquals(Role.ADMIN.name(), roleOf(iamService.usersInTenant("finance"), "nora"));
	}

	/**
	 * Nothing that leaves the server may carry a password hash. {@link TenantUserDto} has no such
	 * field at all, so this is guaranteed by the type rather than by remembering to blank it — which
	 * is what this test pins down.
	 */
	@Test
	void listedUsersNeverCarryTheirPasswordHash() {

		iamService.bootstrap();
		iamService.createUser("liam", null, "LiamPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		for (RecordComponent component : TenantUserDto.class.getRecordComponents())
			assertFalse(component.getName().toLowerCase().contains("password"),
					"TenantUserDto must not have a password component, found: " + component.getName());

		// createUser still returns an AppUser, so that path is checked directly.
		assertNull(iamService.createUser("mona", null, "MonaPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE)
				.passwordHash());
	}

	private static String roleOf(List<TenantUserDto> users, String username) {
		return users.stream().filter(u -> u.username().equals(username)).findFirst()
				.orElseThrow(() -> new AssertionError("No such user in the listing: " + username)).role();
	}

	// ============================================================
	// role hierarchy
	// ============================================================

	/**
	 * The hierarchy is what keeps {@code @PreAuthorize} readable: an endpoint names the weakest role
	 * allowed and stronger roles pass automatically, so no endpoint grows a list of every role.
	 */
	@Test
	void aStrongerRoleIncludesTheWeakerOnes() {

		assertTrue(Role.ADMIN.includes(Role.REPORT_AUTHOR));
		assertTrue(Role.ADMIN.includes(Role.JOB_OPERATOR));
		assertTrue(Role.REPORT_AUTHOR.includes(Role.JOB_OPERATOR));

		assertFalse(Role.JOB_OPERATOR.includes(Role.REPORT_AUTHOR));
		assertFalse(Role.JOB_OPERATOR.includes(Role.ADMIN));
		assertFalse(Role.REPORT_AUTHOR.includes(Role.ADMIN));
	}

	@Test
	void authoritiesExpandDownTheHierarchy() {

		iamService.bootstrap();
		iamService.createUser("nina", null, "NinaPassword123!", Role.REPORT_AUTHOR, Tenant.DEFAULT_CODE);

		IamUserDetailsService userDetails = new IamUserDetailsService(iamService);
		List<String> authorities = userDetails.authoritiesOf(repository.findUserByUsername("nina").orElseThrow())
				.stream().map(GrantedAuthority::getAuthority).sorted().toList();

		assertTrue(authorities.contains("ROLE_REPORT_AUTHOR"));
		assertTrue(authorities.contains("ROLE_JOB_OPERATOR"));
		assertFalse(authorities.contains("ROLE_ADMIN"), "an REPORT_AUTHOR must not gain admin rights");
		assertFalse(authorities.contains("ROLE_PLATFORM_ADMIN"));
	}

	/**
	 * The weakest role must expand to itself and stop. This is the assertion that fails loudly if a new
	 * constant is ever appended below {@code JOB_OPERATOR} without anyone deciding what it may do.
	 */
	@Test
	void anOperatorGetsNothingButOperator() {

		iamService.bootstrap();
		iamService.createUser("oscar", null, "OscarPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		IamUserDetailsService userDetails = new IamUserDetailsService(iamService);
		List<String> authorities = userDetails.authoritiesOf(repository.findUserByUsername("oscar").orElseThrow())
				.stream().map(GrantedAuthority::getAuthority).toList();

		assertEquals(List.of("ROLE_JOB_OPERATOR"), authorities);
	}

	// ============================================================
	// tenants
	// ============================================================

	@Test
	void aSecondTenantCanBeCreatedAndIsSeparate() {

		iamService.bootstrap();

		Tenant finance = iamService.createTenant("finance", "Finance Department", root.toString());

		assertEquals("finance", finance.code());
		assertEquals(2, repository.countTenants());
		assertThrows(IamService.TenantCodeTakenException.class,
				() -> iamService.createTenant("finance", "Duplicate", root.toString()));
	}

	/** One person, two departments, a different role in each — what makes a tenant switcher possible. */
	@Test
	void aUserCanHoldADifferentRoleInEachTenant() {

		iamService.bootstrap();
		iamService.createTenant("finance", "Finance", root.toString());
		iamService.createUser("peggy", null, "PeggyPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);
		iamService.setRole("peggy", Role.ADMIN, "finance");

		long peggyId = repository.findUserByUsername("peggy").orElseThrow().id();

		assertEquals(Role.JOB_OPERATOR, iamService.roleIn(peggyId, Tenant.DEFAULT_CODE).orElseThrow());
		assertEquals(Role.ADMIN, iamService.roleIn(peggyId, "finance").orElseThrow());
	}

	// ============================================================
	// license entitlements — the only coupling to the billing portal
	// ============================================================

	@Test
	void aUserSeatLimitIsEnforced() {

		iamService.bootstrap();
		maxUsers = 2; // the DEFAULT admin already occupies one seat

		iamService.createUser("quinn", null, "QuinnPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		assertThrows(IamService.LicenseLimitException.class,
				() -> iamService.createUser("rita", null, "RitaPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE));
	}

	@Test
	void aTenantLimitIsEnforced() {

		iamService.bootstrap();
		maxTenants = 1; // the DEFAULT tenant already occupies it

		assertThrows(IamService.LicenseLimitException.class,
				() -> iamService.createTenant("finance", "Finance", root.toString()));
	}

	/** An absent entitlement means unlimited, so existing licences and the desktop are unaffected. */
	@Test
	void noEntitlementMeansUnlimited() {

		iamService.bootstrap();
		maxUsers = 0;
		maxTenants = 0;

		for (int i = 0; i < 5; i++)
			iamService.createUser("user" + i, null, "Password123!" + i, Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);
		iamService.createTenant("finance", "Finance", root.toString());
		iamService.createTenant("hr", "HR", root.toString());

		assertEquals(6, repository.countUsers());
		assertEquals(3, repository.countTenants());
	}

	/**
	 * An unreadable license must never lock an administrator out of user management — an entitlement is
	 * a commercial limit, not an authentication mechanism.
	 */
	@Test
	void anUnreadableLicenseIsTreatedAsUnlimited() {

		IamService withBrokenLicense = new IamService(repository, new BCryptPasswordEncoder(), new LicenseService() {
			@Override
			public LicenseDetails loadLicenseFile() throws Exception {
				throw new IllegalStateException("license.xml is corrupt");
			}
		});

		withBrokenLicense.bootstrap();
		withBrokenLicense.createUser("sam", null, "SamPassword123!", Role.JOB_OPERATOR, Tenant.DEFAULT_CODE);

		assertTrue(signIn(withBrokenLicense, "sam", "SamPassword123!"));
	}

	// ============================================================
	// schema
	// ============================================================

	/** The store lands beside the master key so everything that backs up config/_internal takes it too. */
	@Test
	void theStoreLivesInConfigInternal() throws Exception {

		Path dbPath = database.resolveDbPath();

		assertEquals(root.resolve("config").resolve("_internal").resolve("iam.db"), dbPath);
		assertTrue(Files.exists(dbPath));
	}

	/** Re-running the bootstrap against an existing store must be a no-op, not an error. */
	@Test
	void schemaCreationIsIdempotentAcrossRestarts() throws Exception {

		iamService.bootstrap();
		database.close();

		IamDatabase reopened = new IamDatabase();
		reopened.init();
		try {
			IamRepository repositoryAfterRestart = new IamRepository(reopened);
			assertEquals(1, repositoryAfterRestart.countUsers());
			assertEquals(1, repositoryAfterRestart.countTenants());
		} finally {
			reopened.close();
			database = reopened; // so tearDown closes the one that is open
		}
	}

	// ============================================================
	// helpers
	// ============================================================

	/**
	 * A LicenseService whose entitlements the test controls. Subclassed rather than mocked so the test
	 * depends on the real type and would fail to compile if the contract changed.
	 */
	/**
	 * An IamService that believes it is DataPallas Server.
	 *
	 * <p>Achieved by planting {@code startServer.sh} in the temp installation, because that is exactly
	 * how the real edition is detected — so these tests exercise the same path a packaged server does
	 * rather than a flag only tests can set.
	 */
	private IamService serverModeService() {
		try {
			Files.writeString(root.resolve("startServer.sh"), "#!/bin/sh");
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
		return new IamService(repository, new BCryptPasswordEncoder(), fakeLicenseService());
	}

	/**
	 * The same wiring {@code SecurityConfig} uses in production — a {@code ProviderManager} holding a
	 * {@code DaoAuthenticationProvider} over {@link IamUserDetailsService}.
	 *
	 * <p>Built here rather than calling a service method directly so that a sign-in test exercises the
	 * real path. It is also the seam an LDAP or Active Directory provider would slot into: adding one
	 * would mean another provider in this list and nothing else.
	 */
	private AuthenticationManager authenticationManagerFor(IamService service, PasswordEncoder encoder) {
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
		provider.setUserDetailsService(new IamUserDetailsService(service));
		provider.setPasswordEncoder(encoder);
		return new ProviderManager(provider);
	}

	/**
	 * Attempt a sign-in exactly as the login endpoint does.
	 *
	 * @return true when the credentials are accepted; false for a wrong password, an unknown user, a
	 *         disabled account or a password-less one — the caller cannot tell which, and neither can
	 *         a real attacker
	 */
	private boolean signIn(IamService service, String username, String password) {
		AuthenticationManager manager = service == iamService ? authenticationManager
				: authenticationManagerFor(service, new BCryptPasswordEncoder());
		try {
			return manager.authenticate(new UsernamePasswordAuthenticationToken(username, password))
					.isAuthenticated();
		} catch (AuthenticationException e) {
			return false;
		}
	}

	private LicenseService fakeLicenseService() {
		return new LicenseService() {
			@Override
			public LicenseDetails loadLicenseFile() {
				LicenseDetails details = new LicenseDetails();
				details.maxusers = maxUsers > 0 ? String.valueOf(maxUsers) : "";
				details.maxtenants = maxTenants > 0 ? String.valueOf(maxTenants) : "";
				details.customername = "Test Customer";
				details.customeremail = "test@example.com";
				return details;
			}
		};
	}

}

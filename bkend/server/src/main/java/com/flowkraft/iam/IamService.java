package com.flowkraft.iam;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.dtos.TenantUserDto;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;

import jakarta.annotation.PostConstruct;

/**
 * The IAM use cases: who exists, what they may do, and the first-boot provisioning that keeps the
 * desktop free of any authentication experience.
 */
@Service
public class IamService {

	private static final Logger log = LoggerFactory.getLogger(IamService.class);

	private final IamRepository repository;
	private final PasswordEncoder passwordEncoder;
	private final LicenseService licenseService;

	@Autowired
	public IamService(IamRepository repository, PasswordEncoder passwordEncoder, LicenseService licenseService) {
		this.repository = repository;
		this.passwordEncoder = passwordEncoder;
		this.licenseService = licenseService;
	}

	/**
	 * Bring the store to a usable state before the first request — the same way in every deployment.
	 *
	 * <p>Desktop used to be the exception: it created a password-less {@code admin} and let a filter
	 * hand that identity to whoever turned up, so nothing had to be typed. That exception is gone.
	 * One installation folder can be run as a desktop, as a host JVM and as a container — the compose
	 * bundle bind-mounts {@code ./config}, so all three share one {@code iam.db} — and a mode that
	 * authenticates callers for free is a mode that can be pointed at someone else's data. So every
	 * deployment seeds the same working {@code burst}/{@code burst} administrator, loudly flagged until
	 * the password changes, and every caller proves who it is.
	 *
	 * <p>Nobody has to type it on the desktop, because the Electron shell signs itself in with this
	 * installation's API key ({@code config/_internal/api-key.txt}, owner-readable and generated per
	 * install) rather than with a password. The login screen is simply never reached there — and if it
	 * ever is, it works.
	 */
	@PostConstruct
	public void bootstrap() {

		seedFirstAdminFromEnvironmentIfRequested();

		ensureDefaultAdmin();
	}

	// ============================================================
	// the default server account
	// ============================================================

	public static final String DEFAULT_SERVER_USERNAME = "burst";
	public static final String DEFAULT_SERVER_PASSWORD = "burst";

	/**
	 * Give a fresh server a working account so it can be downloaded, started and used.
	 *
	 * <h2>Why a default account rather than a one-time setup token</h2>
	 * The token approach (Jenkins' {@code initialAdminPassword}) is stricter, and it was tried here
	 * first. It was removed because it puts a wall in front of the very first thing a new user does:
	 * download, start, open the browser — and get told to go find a file on the server's filesystem.
	 * For a product people evaluate before they buy, that is friction in exactly the wrong place, and
	 * the people most likely to hit it are the ones least invested in getting past it.
	 *
	 * <h2>What replaces the strictness</h2>
	 * A default credential is only dangerous when it is <em>quiet</em>. So this one is loud:
	 * {@link #isUsingDefaultCredentials()} keeps reporting true for as long as the password is still
	 * {@code burst}, the login screen states the credentials outright, and the application shows a
	 * warning banner on every screen until it changes. The moment someone changes the password — or
	 * creates their own user and removes this one — every one of those disappears on its own.
	 *
	 * <p>Skipped entirely when {@code RB_ADMIN_USERNAME} / {@code RB_ADMIN_PASSWORD} already seeded a
	 * real administrator, or when any sign-in-capable account already exists.
	 *
	 * <h2>Why the guard counts sign-in-capable users, not users</h2>
	 * The same installation directory can be started as a desktop and later as a Server — that is
	 * the normal way someone evaluates this: run it, like it, expose it. Desktop mode auto-creates a
	 * password-less {@code admin} to own its loopback session, so by the time it is started as a
	 * Server the store is not empty, and a plain {@code countUsers() > 0} concluded an administrator
	 * already existed. Nothing was seeded, {@link #isUsingDefaultCredentials()} reported false, and
	 * the only account present could not log in — a server nobody could get into, with no message
	 * saying why. {@link IamRepository#countSignInCapableUsers()} asks the question this guard always
	 * meant to ask, and keeps honouring a federated-only store, where real users exist with no
	 * password hash between them.
	 */
	private void ensureDefaultAdmin() {

		if (repository.countSignInCapableUsers() > 0)
			return;

		Tenant tenant = ensureDefaultTenant();
		AppUser defaultAdmin = repository.insertUser(DEFAULT_SERVER_USERNAME, null,
				passwordEncoder.encode(DEFAULT_SERVER_PASSWORD), true);
		repository.upsertMembership(defaultAdmin.id(), tenant.id(), Role.ADMIN);

		log.warn("");
		log.warn("*******************************************************************");
		log.warn("Created the default administrator:  {} / {}", DEFAULT_SERVER_USERNAME, DEFAULT_SERVER_PASSWORD);
		log.warn("CHANGE THIS PASSWORD. Until you do, anyone who can reach this");
		log.warn("server can sign in as an administrator.");
		log.warn("*******************************************************************");
		log.warn("");
	}

	/**
	 * Is the shipped {@code burst}/{@code burst} account still usable as-is?
	 *
	 * <p>Derived by checking the password rather than by storing a flag, so it cannot drift: it turns
	 * false the instant the password changes or the account is removed, with nothing to remember to
	 * update. This is what drives the login-screen hint and the in-app warning banner.
	 */
	public boolean isUsingDefaultCredentials() {

		return repository.findUserByUsername(DEFAULT_SERVER_USERNAME)
				.filter(AppUser::isActive)
				.filter(user -> StringUtils.isNotBlank(user.passwordHash()))
				.map(user -> passwordEncoder.matches(DEFAULT_SERVER_PASSWORD, user.passwordHash()))
				.orElse(false);
	}


	// ============================================================
	// bootstrap
	// ============================================================

	Tenant ensureDefaultTenant() {
		return repository.findTenantByCode(Tenant.DEFAULT_CODE)
				.orElseGet(() -> repository.insertTenant(Tenant.DEFAULT_CODE, "Default",
						StringUtils.defaultIfBlank(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH,
								System.getProperty("user.dir")),
						readCustomerRefFromLicense()));
	}

	/**
	 * Lets an unattended install create its first administrator without a human at a browser — which is
	 * what the packaged-server UAT needs so {@code run-tests.bat} stays unchanged.
	 */
	private void seedFirstAdminFromEnvironmentIfRequested() {
		String username = System.getenv("RB_ADMIN_USERNAME");
		String password = System.getenv("RB_ADMIN_PASSWORD");

		if (StringUtils.isAnyBlank(username, password))
			return;
		if (repository.findUserByUsername(username).isPresent())
			return;

		Tenant tenant = ensureDefaultTenant();
		AppUser admin = repository.insertUser(username, null, passwordEncoder.encode(password), true);
		repository.upsertMembership(admin.id(), tenant.id(), Role.ADMIN);

		log.info("Seeded the first administrator '{}' from the environment", username);
	}

	// ============================================================
	// authentication
	// ============================================================

	/*
	 * There is deliberately no authenticate() here.
	 *
	 * Checking passwords is Spring Security's job, through the AuthenticationManager wired up in
	 * SecurityConfig. A second implementation living here would be a second place for the rules to
	 * drift — and it is exactly what would have to be bypassed to point DataPallas at Active Directory
	 * or LDAP, which is the change this arrangement exists to keep cheap.
	 *
	 * What stays here is everything a directory cannot answer: which tenant someone belongs to and
	 * what they may do there. IamUserDetailsService is the join between the two.
	 */

	// ============================================================
	// queries used by the controllers
	// ============================================================

	public Optional<AppUser> findUser(String username) {
		return repository.findUserByUsername(username);
	}

	public Map<String, Role> membershipsOf(long userId) {
		return repository.findMembershipsByTenantCode(userId);
	}

	public Optional<Role> roleIn(long userId, String tenantCode) {
		return repository.findTenantByCode(tenantCode).flatMap(t -> repository.findRole(userId, t.id()));
	}

	public Optional<Tenant> findTenant(String code) {
		return repository.findTenantByCode(code);
	}

	public List<Tenant> allTenants() {
		return repository.findAllTenants();
	}

	/**
	 * Every user in a tenant, each with the role they hold <em>in that tenant</em>. Returned as one
	 * list so the admin screen needs a single request rather than one per row, and as a DTO that has
	 * no password field at all rather than one that has to be blanked.
	 */
	public List<TenantUserDto> usersInTenant(String tenantCode) {
		return repository.findTenantByCode(tenantCode).map(tenant -> repository.findUsersInTenant(tenant.id())
				.stream()
				.map(user -> new TenantUserDto(user.id(), user.username(), user.email(), user.status(),
						user.platformAdmin(),
						repository.findRole(user.id(), tenant.id()).map(Role::name).orElse(null),
						user.createdAt()))
				.toList()).orElseGet(List::of);
	}

	// ============================================================
	// user management
	// ============================================================

	/**
	 * Create a user and give them a role in a tenant.
	 *
	 * @throws UsernameTakenException  when the username already exists — the caller turns this into a
	 *                                 409 so provisioning scripts and e2e setup can be re-run safely
	 * @throws LicenseLimitException   when the license does not allow another user
	 */
	public AppUser createUser(String username, String email, String password, Role role, String tenantCode) {

		String cleanUsername = StringUtils.trimToEmpty(username);
		if (StringUtils.isBlank(cleanUsername))
			throw new IllegalArgumentException("Username is required");
		if (StringUtils.isBlank(password))
			throw new IllegalArgumentException("Password is required");
		if (role == Role.PLATFORM_ADMIN)
			throw new IllegalArgumentException("PLATFORM_ADMIN is not a tenant role");

		if (repository.findUserByUsername(cleanUsername).isPresent())
			throw new UsernameTakenException(cleanUsername);

		assertLicenceAllowsAnotherUser();

		Tenant tenant = repository.findTenantByCode(tenantCode)
				.orElseThrow(() -> new IllegalArgumentException("No such tenant: " + tenantCode));

		AppUser created = repository.insertUser(cleanUsername, email, passwordEncoder.encode(password), false);
		repository.upsertMembership(created.id(), tenant.id(), role);

		log.info("Created user '{}' with role {} in tenant '{}'", cleanUsername, role, tenantCode);

		return created.withoutSecret();
	}

	public void setRole(String username, Role role, String tenantCode) {
		AppUser user = repository.findUserByUsername(username)
				.orElseThrow(() -> new IllegalArgumentException("No such user: " + username));
		Tenant tenant = repository.findTenantByCode(tenantCode)
				.orElseThrow(() -> new IllegalArgumentException("No such tenant: " + tenantCode));
		repository.upsertMembership(user.id(), tenant.id(), role);
	}

	public void changePassword(String username, String newPassword) {
		if (StringUtils.isBlank(newPassword))
			throw new IllegalArgumentException("Password is required");
		AppUser user = repository.findUserByUsername(username)
				.orElseThrow(() -> new IllegalArgumentException("No such user: " + username));
		repository.updateUserPassword(user.id(), passwordEncoder.encode(newPassword));
	}

	/**
	 * Stops someone signing in without destroying anything of theirs.
	 *
	 * <p>The point of disabling rather than deleting is that it is reversible — somebody leaves for
	 * three months, or an account looks compromised and you want it shut immediately while you find
	 * out. See {@link #enableUser}, which is the other half; without it this was a one-way door and
	 * deleting the user was the only way out of it.
	 */
	public void disableUser(String username) {
		AppUser user = repository.findUserByUsername(username)
				.orElseThrow(() -> new IllegalArgumentException("No such user: " + username));
		repository.updateUserStatus(user.id(), AppUser.STATUS_DISABLED);
	}

	/** Lets a disabled account sign in again. The role and memberships were never touched. */
	public void enableUser(String username) {
		AppUser user = repository.findUserByUsername(username)
				.orElseThrow(() -> new IllegalArgumentException("No such user: " + username));
		repository.updateUserStatus(user.id(), AppUser.STATUS_ACTIVE);
	}

	public void deleteUser(String username) {
		if (AppUser.DEFAULT_USERNAME.equals(username))
			throw new IllegalArgumentException("The default administrator cannot be deleted");
		repository.findUserByUsername(username).ifPresent(u -> repository.deleteUser(u.id()));
	}

	// ============================================================
	// tenants
	// ============================================================

	public Tenant createTenant(String code, String displayName, String homeDir) {
		String cleanCode = StringUtils.trimToEmpty(code);
		if (StringUtils.isBlank(cleanCode))
			throw new IllegalArgumentException("Tenant code is required");
		if (repository.findTenantByCode(cleanCode).isPresent())
			throw new TenantCodeTakenException(cleanCode);

		assertLicenceAllowsAnotherTenant();

		return repository.insertTenant(cleanCode, StringUtils.defaultIfBlank(displayName, cleanCode), homeDir,
				readCustomerRefFromLicense());
	}

	// ============================================================
	// licence entitlements
	// ============================================================

	/**
	 * Seat limits live in the license file, not in a table, and not in the billing portal's database.
	 *
	 * <p>That is the whole coupling between DataPallas and the customer portal: the portal issues a
	 * license carrying an entitlement, DataPallas enforces it locally. The portal never needs to know
	 * who the users are — which is what makes it possible to keep it correct for self-hosted installs.
	 *
	 * <p>A license that says nothing means unlimited, so existing installs and the desktop are
	 * unaffected.
	 */
	private void assertLicenceAllowsAnotherUser() {
		int max = licenceLimit(LicenseDetails::getMaxUsers);
		if (max > 0 && repository.countUsers() >= max)
			throw new LicenseLimitException("This license allows " + max + " user(s)");
	}

	private void assertLicenceAllowsAnotherTenant() {
		int max = licenceLimit(LicenseDetails::getMaxTenants);
		if (max > 0 && repository.countTenants() >= max)
			throw new LicenseLimitException("This license allows " + max + " tenant(s)");
	}

	private int licenceLimit(java.util.function.ToIntFunction<LicenseDetails> which) {
		try {
			LicenseDetails license = licenseService.loadLicenseFile();
			return license == null ? 0 : which.applyAsInt(license);
		} catch (Exception e) {
			// No license file, or an unreadable one, must never block user administration — the license
			// is an entitlement, not an authentication mechanism.
			log.debug("Could not read license entitlements, treating as unlimited: {}", e.getMessage());
			return 0;
		}
	}

	private String readCustomerRefFromLicense() {
		try {
			LicenseDetails license = licenseService.loadLicenseFile();
			return license == null ? null
					: StringUtils.defaultIfBlank(license.customeremail, license.customername);
		} catch (Exception e) {
			return null;
		}
	}

	// ============================================================
	// failures the controllers translate into HTTP status codes
	// ============================================================

	public static class UsernameTakenException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public UsernameTakenException(String username) {
			super("Username '" + username + "' already exists");
		}
	}

	public static class TenantCodeTakenException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public TenantCodeTakenException(String code) {
			super("Tenant '" + code + "' already exists");
		}
	}

	public static class LicenseLimitException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public LicenseLimitException(String message) {
			super(message);
		}
	}
}

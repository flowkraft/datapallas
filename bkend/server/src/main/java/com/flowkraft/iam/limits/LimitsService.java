package com.flowkraft.iam.limits;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.Role;
import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;

/**
 * Groups, and the limits an admin sets on the members of them.
 *
 * <h2>The rule: groups only add access</h2>
 * Take only the caller's groups that actually <em>set</em> limits. None of them means unlimited — which
 * is today's behaviour, so nobody's access changes on upgrade. One or more means the union: every
 * connection any of them allows, and scripts allowed if any of them allows scripts. This is how
 * Metabase, Power BI row-level security and Superset combine groups, and it has one consequence the
 * admin screen states outright: putting a limited author into a more permissive group gives them more.
 *
 * <h2>No cache</h2>
 * {@link #limitsFor(Authentication)} reads {@code iam.db} on every call. That is a sub-millisecond
 * SQLite lookup on a handful of rows, and a cache here would be a second source of truth that keeps
 * enforcing a limit the admin has just removed.
 */
@Service
public class LimitsService {

	/**
	 * The installation key's principal. It identifies a machine caller — the Electron shell, the AI Hub
	 * proxy — not a person, and it is never limited. It already holds ROLE_ADMIN, so the admin rule
	 * below would cover it anyway; it is named here so that stays true on purpose rather than by luck.
	 */
	static final String API_KEY_PRINCIPAL = "api-key-user";

	private final IamRepository repository;

	private final DatabaseConnectionCatalog connections;

	@Autowired
	public LimitsService(IamRepository repository, DatabaseConnectionCatalog connections) {
		this.repository = repository;
		this.connections = connections;
	}

	// ============================================================
	// the rule
	// ============================================================

	/**
	 * The limits that apply to this caller, or {@code null} when they are unlimited.
	 *
	 * <p>Who is limited is read from the authorities Spring has already resolved for this request,
	 * rather than looked up again. Asking the same object every {@code @PreAuthorize} asks means this
	 * can never admit or limit a different set of people than the endpoints do.
	 *
	 * <p><b>Everyone who is not an administrator is limited</b> (the owner's decision 1, 2026-09-24).
	 * This used to ask for ROLE_REPORT_AUTHOR first, on the reasoning that an operator authors no SQL
	 * and reaches no connection. That reasoning was wrong in the one direction that matters: an
	 * operator <em>runs</em> reports, and a report someone else wrote reaches whatever connection it
	 * declares. A group that names connections now constrains every member of it — author, operator
	 * and dashboard viewer alike — and the one carve-out lives elsewhere: a published dashboard
	 * granted to a viewer's groups opens whatever it reads, because an administrator ticked it by
	 * hand ({@code DashboardAccess}).
	 *
	 * <p>Roles are hierarchical — an ADMIN also holds ROLE_REPORT_AUTHOR — which is why the admin
	 * check comes first and is the only role check left.
	 */
	public LimitSettings limitsFor(Authentication authentication) {

		if (isAdministrativePrincipal(authentication))
			return null;

		return repository.findUserByUsername(authentication.getName())
				.map(user -> combine(repository.findGroupsOfUser(user.id())))
				.orElse(null);
	}

	/**
	 * Is this caller above every group rule — nobody at all, the installation key, or an
	 * administrator?
	 *
	 * <p>The three early returns {@link #limitsFor(Authentication)} has always made, named so that
	 * layer 2 can ask the same question instead of writing its own version of it
	 * ({@code ReportGrantAccess}). Two layers that constrain different sets of people would be a bug
	 * nobody could see from either side, and this is the one sentence that prevents it. Extracted
	 * while building the report grants; the rule itself is unchanged.
	 */
	public boolean isAdministrativePrincipal(Authentication authentication) {

		if (authentication == null || !authentication.isAuthenticated())
			return true;

		if (API_KEY_PRINCIPAL.equals(authentication.getName()))
			return true;

		return hasAuthority(authentication, Role.ADMIN) || hasAuthority(authentication, Role.PLATFORM_ADMIN);
	}

	/**
	 * The same rule for a user who is not the caller — what the Users screen shows in its column.
	 *
	 * <p>Since decision 1 the only role that escapes is an administrator, so this asks the same
	 * question {@link #limitsFor(Authentication)} asks and the column cannot say one thing while the
	 * server does another.
	 */
	public LimitSettings effectiveLimitsFor(long userId, Role role) {
		if (role == Role.ADMIN || role == Role.PLATFORM_ADMIN)
			return null;
		return combine(repository.findGroupsOfUser(userId));
	}

	/**
	 * The union across the groups that set limits, or {@code null} when none of them does.
	 *
	 * <p>Union, never intersection: a group grants, so a second group can only ever widen what its
	 * members reach. The alternative — the narrowest limit wins — would mean adding somebody to a group
	 * could silently take away access they already had, which is the surprise this design avoids.
	 */
	LimitSettings combine(List<UserGroup> groups) {

		List<LimitSettings> limiting = groups.stream().map(group -> LimitSettings.parse(group.settingsJson()))
				.filter(settings -> !settings.setsNoLimits()).toList();

		if (limiting.isEmpty())
			return null;

		boolean allowsAllConnections = limiting.stream().anyMatch(LimitSettings::allowsAllConnections);
		boolean allowsScripts = limiting.stream().anyMatch(LimitSettings::allowsScripts);

		LimitSettings combined = new LimitSettings();
		if (!allowsAllConnections) {
			Set<String> connections = new LinkedHashSet<>();
			limiting.forEach(settings -> connections.addAll(settings.connectionsOrEmpty()));
			combined.setConnections(new ArrayList<>(connections));
		}
		combined.setScripts(allowsScripts);
		return combined;
	}

	private boolean hasAuthority(Authentication authentication, Role role) {
		String authority = role.authority();
		for (GrantedAuthority granted : authentication.getAuthorities())
			if (authority.equals(granted.getAuthority()))
				return true;
		return false;
	}

	// ============================================================
	// groups
	// ============================================================

	public List<UserGroup> groupsInTenant(String tenantCode) {
		return repository.findTenantByCode(tenantCode).map(tenant -> repository.findGroupsInTenant(tenant.id()))
				.orElseGet(List::of);
	}

	public Optional<UserGroup> findGroup(long groupId) {
		return repository.findGroupById(groupId);
	}

	public List<String> membersOf(long groupId) {
		return repository.findGroupMemberUsernames(groupId);
	}

	public List<UserGroup> groupsOf(long userId) {
		return repository.findGroupsOfUser(userId);
	}

	public UserGroup createGroup(String tenantCode, String name, LimitSettings settings) {
		String cleanName = StringUtils.trimToEmpty(name);
		if (StringUtils.isBlank(cleanName))
			throw new IllegalArgumentException("Group name is required");

		Tenant tenant = repository.findTenantByCode(tenantCode)
				.orElseThrow(() -> new IllegalArgumentException("No such tenant: " + tenantCode));

		if (repository.findGroupByName(tenant.id(), cleanName).isPresent())
			throw new GroupNameTakenException(cleanName);

		LimitSettings checked = settingsOrEmpty(settings);
		assertConnectionsExist(checked);

		return repository.insertGroup(tenant.id(), cleanName, checked.toJson());
	}

	public UserGroup updateGroup(long groupId, String name, LimitSettings settings) {
		UserGroup existing = repository.findGroupById(groupId).orElseThrow(() -> new UnknownGroupException(groupId));

		String cleanName = StringUtils.trimToEmpty(name);
		if (StringUtils.isBlank(cleanName))
			throw new IllegalArgumentException("Group name is required");

		// Renaming a group to a name it already has is not a conflict with itself.
		repository.findGroupByName(existing.tenantId(), cleanName).filter(clash -> clash.id() != groupId)
				.ifPresent(clash -> {
					throw new GroupNameTakenException(cleanName);
				});

		LimitSettings checked = settingsOrEmpty(settings);
		assertConnectionsExist(checked);

		repository.updateGroup(groupId, cleanName, checked.toJson());
		return repository.findGroupById(groupId).orElseThrow(() -> new UnknownGroupException(groupId));
	}

	/**
	 * Deleting a group that still has members is refused rather than cascaded.
	 *
	 * <p>The cascade would work — the schema has it — but it would quietly change what those people may
	 * do, and the admin deleting a group named "Contractors" is not necessarily thinking about the
	 * three authors who lose their only connection limit with it.
	 */
	public void deleteGroup(long groupId) {
		UserGroup group = repository.findGroupById(groupId).orElseThrow(() -> new UnknownGroupException(groupId));

		int members = repository.countGroupMembers(groupId);
		if (members > 0)
			throw new GroupHasMembersException(group.name(), members);

		repository.deleteGroup(groupId);
	}

	// ============================================================
	// membership
	// ============================================================

	/**
	 * Replace a user's groups with exactly this set. An empty list clears them.
	 *
	 * <p>Every group id is checked before anything is written, so a request naming one bad id leaves the
	 * user's groups exactly as they were rather than half applied.
	 */
	public void setUserGroups(String username, List<Long> groupIds) {
		AppUser user = repository.findUserByUsername(username)
				.orElseThrow(() -> new UnknownUserException(username));

		repository.replaceUserGroups(user.id(), validated(groupIds));
	}

	/**
	 * @throws IllegalArgumentException naming the first id that does not exist — a 400, because the
	 *                                  caller sent something that was never valid
	 */
	public List<Long> validated(List<Long> groupIds) {
		if (groupIds == null)
			return List.of();

		List<Long> distinct = new ArrayList<>(new LinkedHashSet<>(groupIds));
		for (Long groupId : distinct)
			if (groupId == null || repository.findGroupById(groupId).isEmpty())
				throw new IllegalArgumentException("No such group: " + groupId);

		return distinct;
	}

	/**
	 * Refuse a connection id that does not exist, so a typo is caught at the moment the admin makes it
	 * rather than becoming a limit that silently matches nothing.
	 *
	 * <p>Skipped when the catalog is empty — an unreadable or absent {@code config/connections} means
	 * the question cannot be answered, and refusing every group save would be the wrong answer to
	 * "I do not know". Nothing is granted by skipping it: enforcement compares against the group's
	 * list either way, so an id that matches no connection simply matches nothing.
	 */
	private void assertConnectionsExist(LimitSettings settings) {
		if (settings.allowsAllConnections())
			return;

		List<String> known = connections.databaseConnectionIds();
		if (known.isEmpty())
			return;

		for (String connectionId : settings.connectionsOrEmpty())
			if (!known.contains(connectionId))
				throw new IllegalArgumentException("No database connection '" + connectionId + "'");
	}

	private LimitSettings settingsOrEmpty(LimitSettings settings) {
		return settings == null ? new LimitSettings() : settings;
	}

	// ============================================================
	// connections
	// ============================================================

	/** The limits that apply to whoever is making the request being served, or {@code null}. */
	public LimitSettings currentLimits() {
		return limitsFor(SecurityContextHolder.getContext().getAuthentication());
	}

	/**
	 * May the caller use this database connection?
	 *
	 * <p>A blank id is allowed: it means the query, the report or the canvas is not pointed at a
	 * database at all, and there is nothing to refuse.
	 */
	public boolean allowsConnection(String connectionId) {

		if (StringUtils.isBlank(connectionId))
			return true;

		LimitSettings limits = currentLimits();
		return limits == null || limits.allowsConnection(connectionId);
	}

	/**
	 * Refuses, with 403, when the caller may not use this database connection. For the choke points
	 * where the id names a database by construction: ad-hoc SQL, schema, an inline script, a report's
	 * datasource, a canvas export.
	 */
	public void assertConnectionAllowed(String connectionId) {
		if (!allowsConnection(connectionId))
			throw new ConnectionNotAllowedException(connectionId);
	}

	/**
	 * Refuses, with 403, when the caller may not use this connection <em>and</em> it is a database
	 * one. For {@code GET /api/connections/{id}}, which serves email connections through the same
	 * path: the limit is on databases, so an email connection is never hidden by it.
	 */
	public void assertDatabaseConnectionAllowed(String connectionId) {
		if (isDatabaseConnection(connectionId))
			assertConnectionAllowed(connectionId);
	}

	/**
	 * A database connection is one the catalog lists, or one carrying the {@code db-} prefix that
	 * names its folder on disk. Both, because the sample connections are listed without the prefix,
	 * and a connection whose file the catalog could not read is a database one all the same.
	 */
	private boolean isDatabaseConnection(String connectionId) {

		if (StringUtils.isBlank(connectionId))
			return false;

		return StringUtils.startsWithIgnoreCase(connectionId, "db-")
				|| connections.databaseConnectionIds().contains(connectionId);
	}

	// ============================================================
	// scripts and files
	// ============================================================

	/**
	 * Is this caller limited at all? The filesystem guard applies to every limited author whatever
	 * their groups say about connections or scripts, because the files it protects are the ones that
	 * would take their limits off.
	 */
	public boolean isLimited() {
		return currentLimits() != null;
	}

	/** May the caller get server code run: an inline script, a Groovy hook, a Jasper template? */
	public boolean allowsScripts() {
		LimitSettings limits = currentLimits();
		return limits == null || limits.allowsScripts();
	}

	/**
	 * Refuses, with 403, when the caller may not get server code run. {@code what} completes the
	 * sentence "You are not allowed to …".
	 */
	public void assertScriptsAllowed(String what) {
		if (!allowsScripts())
			throw new ScriptsNotAllowedException(what);
	}

	// ============================================================
	// failures the controllers translate into HTTP status codes
	// ============================================================

	public static class GroupNameTakenException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public GroupNameTakenException(String name) {
			super("Group '" + name + "' already exists");
		}
	}

	public static class UnknownGroupException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public UnknownGroupException(long groupId) {
			super("No such group: " + groupId);
		}
	}

	public static class GroupHasMembersException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public GroupHasMembersException(String name, int members) {
			super("Group '" + name + "' has " + members + " member(s). Remove them first.");
		}
	}

	public static class UnknownUserException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		public UnknownUserException(String username) {
			super("No such user: " + username);
		}
	}
}

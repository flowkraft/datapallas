package com.flowkraft.iam;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.flowkraft.iam.model.AppUser;
import com.flowkraft.iam.model.Tenant;
import com.flowkraft.iam.model.UserGroup;

/**
 * Plain JDBC over the IAM store.
 *
 * <p>Tenants, users and memberships are one aggregate — an identity only means something in the
 * context of a tenant — so they share a repository rather than being split into three classes that
 * would have to be joined by every caller anyway.
 *
 * <p>Every statement binds its parameters. That is not ceremony: usernames and tenant codes arrive
 * from HTTP.
 */
@Repository
public class IamRepository {

	private final IamDatabase db;

	@Autowired
	public IamRepository(IamDatabase db) {
		this.db = db;
	}

	// ============================================================
	// tenants
	// ============================================================

	public Optional<Tenant> findTenantByCode(String code) {
		return queryOne("SELECT * FROM tenant WHERE code = ?", this::readTenant, code);
	}

	public List<Tenant> findAllTenants() {
		return queryMany("SELECT * FROM tenant ORDER BY code", this::readTenant);
	}

	public int countTenants() {
		return count("SELECT COUNT(*) FROM tenant");
	}

	public Tenant insertTenant(String code, String displayName, String homeDir, String customerRef) {
		long id = insert(
				"INSERT INTO tenant (code, display_name, home_dir, customer_ref, status, created_at) "
						+ "VALUES (?, ?, ?, ?, ?, datetime('now'))",
				code, displayName, homeDir, customerRef, Tenant.STATUS_ACTIVE);

		return findTenantById(id).orElseThrow(() -> new IllegalStateException("Tenant " + code + " vanished after insert"));
	}

	public Optional<Tenant> findTenantById(long id) {
		return queryOne("SELECT * FROM tenant WHERE id = ?", this::readTenant, id);
	}

	// ============================================================
	// users
	// ============================================================

	public Optional<AppUser> findUserByUsername(String username) {
		return queryOne("SELECT * FROM app_user WHERE username = ?", this::readUser, username);
	}

	public List<AppUser> findUsersInTenant(long tenantId) {
		return queryMany(
				"SELECT u.* FROM app_user u JOIN membership m ON m.user_id = u.id "
						+ "WHERE m.tenant_id = ? ORDER BY u.username",
				this::readUser, tenantId);
	}

	public int countUsers() {
		return count("SELECT COUNT(*) FROM app_user");
	}

	/**
	 * Users who can actually sign in — i.e. real accounts, excluding the password-less DEFAULT
	 * administrator that desktop mode creates for itself.
	 *
	 * <p>This is the signal that decides whether authentication is enforced, because it cannot be
	 * turned off without destroying the accounts it protects. See
	 * {@link IamService#resolveEffectiveMode()}.
	 */
	public int countUsersWithPassword() {
		return count("SELECT COUNT(*) FROM app_user WHERE password_hash IS NOT NULL AND password_hash <> ''");
	}

	/**
	 * Users somebody can actually sign in as — every account except the password-less {@code admin}
	 * that desktop mode creates for itself.
	 *
	 * <p>Deliberately wider than {@link #countUsersWithPassword()}: a federated user is provisioned
	 * with no password hash at all (see {@code FederatedUserProvisioner}), so an SSO-only server has
	 * plenty of people who can sign in and zero passwords stored. Counting passwords there would
	 * conclude the server is empty.
	 *
	 * <p>And it is narrower than {@link #countUsers()}, because the desktop {@code admin} is not an
	 * account anyone can sign in as — it is created with a null hash purely to own the loopback
	 * session. Counting it makes an install that has ever been started as a desktop look occupied,
	 * which is what used to lock out an install converted from desktop to Server: seeding was skipped
	 * on the strength of an account that cannot log in, and nothing could reach the application.
	 *
	 * <p>This is the "is there a real administrator here" question, and it is what decides whether
	 * {@link IamService} seeds its default administrator at startup.
	 */
	public int countSignInCapableUsers() {
		return count("SELECT COUNT(*) FROM app_user WHERE username <> ?"
				+ " OR (password_hash IS NOT NULL AND password_hash <> '')", AppUser.DEFAULT_USERNAME);
	}


	public AppUser insertUser(String username, String email, String passwordHash, boolean platformAdmin) {
		long id = insert(
				"INSERT INTO app_user (username, email, password_hash, status, platform_admin, created_at) "
						+ "VALUES (?, ?, ?, ?, ?, datetime('now'))",
				username, email, passwordHash, AppUser.STATUS_ACTIVE, platformAdmin ? 1 : 0);

		return findUserById(id).orElseThrow(() -> new IllegalStateException("User " + username + " vanished after insert"));
	}

	public Optional<AppUser> findUserById(long id) {
		return queryOne("SELECT * FROM app_user WHERE id = ?", this::readUser, id);
	}

	public void updateUserStatus(long userId, String status) {
		execute("UPDATE app_user SET status = ? WHERE id = ?", status, userId);
	}

	public void updateUserPassword(long userId, String passwordHash) {
		execute("UPDATE app_user SET password_hash = ? WHERE id = ?", passwordHash, userId);
	}

	public void deleteUser(long userId) {
		execute("DELETE FROM app_user WHERE id = ?", userId);
	}

	// ============================================================
	// memberships
	// ============================================================

	public void upsertMembership(long userId, long tenantId, Role role) {
		execute("INSERT INTO membership (user_id, tenant_id, role) VALUES (?, ?, ?) "
				+ "ON CONFLICT(user_id, tenant_id) DO UPDATE SET role = excluded.role",
				userId, tenantId, role.name());
	}

	public Optional<Role> findRole(long userId, long tenantId) {
		return queryOne("SELECT role FROM membership WHERE user_id = ? AND tenant_id = ?",
				rs -> Role.parse(rs.getString("role")), userId, tenantId);
	}

	/** Every tenant this user belongs to, keyed by tenant code — what the tenant switcher needs. */
	public Map<String, Role> findMembershipsByTenantCode(long userId) {
		Map<String, Role> memberships = new LinkedHashMap<>();
		try (Connection conn = db.getConnection();
				PreparedStatement ps = conn.prepareStatement(
						"SELECT t.code AS code, m.role AS role FROM membership m "
								+ "JOIN tenant t ON t.id = m.tenant_id WHERE m.user_id = ? ORDER BY t.code")) {
			ps.setLong(1, userId);
			try (ResultSet rs = ps.executeQuery()) {
				while (rs.next())
					memberships.put(rs.getString("code"), Role.parse(rs.getString("role")));
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Failed to read memberships for user " + userId, e);
		}
		return memberships;
	}

	// ============================================================
	// groups
	// ============================================================

	public List<UserGroup> findGroupsInTenant(long tenantId) {
		return queryMany("SELECT * FROM user_group WHERE tenant_id = ? ORDER BY name", this::readGroup, tenantId);
	}

	public Optional<UserGroup> findGroupById(long groupId) {
		return queryOne("SELECT * FROM user_group WHERE id = ?", this::readGroup, groupId);
	}

	/** Case-insensitive, because the column is {@code COLLATE NOCASE} — "Sales" and "sales" are one group. */
	public Optional<UserGroup> findGroupByName(long tenantId, String name) {
		return queryOne("SELECT * FROM user_group WHERE tenant_id = ? AND name = ?", this::readGroup, tenantId, name);
	}

	public UserGroup insertGroup(long tenantId, String name, String settingsJson) {
		long id = insert("INSERT INTO user_group (tenant_id, name, settings_json, created_at) "
				+ "VALUES (?, ?, ?, datetime('now'))", tenantId, name, settingsJson);

		return findGroupById(id)
				.orElseThrow(() -> new IllegalStateException("Group " + name + " vanished after insert"));
	}

	public void updateGroup(long groupId, String name, String settingsJson) {
		execute("UPDATE user_group SET name = ?, settings_json = ? WHERE id = ?", name, settingsJson, groupId);
	}

	public void deleteGroup(long groupId) {
		execute("DELETE FROM user_group WHERE id = ?", groupId);
	}

	// ============================================================
	// dashboards granted to a group
	// ============================================================

	/** The report ids this group grants, in id order. A report that no longer exists is still listed here. */
	public List<String> findGroupDashboards(long groupId) {
		return queryMany("SELECT report_id FROM user_group_dashboard WHERE group_id = ? ORDER BY report_id",
				rs -> rs.getString("report_id"), groupId);
	}

	/**
	 * The distinct union of the dashboards granted to every group this user is in.
	 *
	 * <p>Groups only ever add access, so the union is the whole rule: being in a second group can widen
	 * what somebody sees and can never narrow it.
	 */
	public List<String> findDashboardsOfUser(long userId) {
		return queryMany("SELECT DISTINCT d.report_id FROM user_group_dashboard d "
				+ "JOIN user_group_member m ON m.group_id = d.group_id WHERE m.user_id = ? ORDER BY d.report_id",
				rs -> rs.getString("report_id"), userId);
	}

	/**
	 * Replace a group's dashboards, and its default, with exactly this set.
	 *
	 * <p>One transaction for the same reason {@link #replaceUserGroups} is one: the dialog sends the
	 * whole set of ticked boxes and the radio together, and a default left pointing at a dashboard the
	 * same save has just unticked is a group nobody can open.
	 */
	public void setGroupDashboards(long groupId, List<String> reportIds, String defaultDashboard) {
		try (Connection conn = db.getConnection()) {
			boolean autoCommit = conn.getAutoCommit();
			conn.setAutoCommit(false);
			try {
				try (PreparedStatement clear = conn
						.prepareStatement("DELETE FROM user_group_dashboard WHERE group_id = ?")) {
					clear.setLong(1, groupId);
					clear.executeUpdate();
				}
				try (PreparedStatement add = conn
						.prepareStatement("INSERT INTO user_group_dashboard (group_id, report_id) VALUES (?, ?)")) {
					for (String reportId : reportIds) {
						add.setLong(1, groupId);
						add.setString(2, reportId);
						add.executeUpdate();
					}
				}
				try (PreparedStatement setDefault = conn
						.prepareStatement("UPDATE user_group SET default_dashboard = ? WHERE id = ?")) {
					setDefault.setString(1, defaultDashboard);
					setDefault.setLong(2, groupId);
					setDefault.executeUpdate();
				}
				conn.commit();
			} catch (SQLException e) {
				conn.rollback();
				throw e;
			} finally {
				conn.setAutoCommit(autoCommit);
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Failed to set the dashboards of group " + groupId, e);
		}
	}

	// ============================================================
	// reports granted to a group
	// ============================================================

	/** The report ids this group grants, in id order. A report that no longer exists is still listed here. */
	public List<String> findGroupReports(long groupId) {
		return queryMany("SELECT report_id FROM user_group_report WHERE group_id = ? ORDER BY report_id",
				rs -> rs.getString("report_id"), groupId);
	}

	/**
	 * The distinct union of the reports granted to every group this user is in.
	 *
	 * <p>The union is the whole rule here too, but it is read the other way round: <b>no rows means
	 * every report</b>, not none, and rows narrow to what they name. That is the one place layer 2
	 * differs from the dashboards above, and {@code ReportGrants} is where it is decided — this method
	 * only ever reports what is stored, so a caller cannot get "all" by accident.
	 */
	public List<String> findReportsOfUser(long userId) {
		return queryMany("SELECT DISTINCT r.report_id FROM user_group_report r "
				+ "JOIN user_group_member m ON m.group_id = r.group_id WHERE m.user_id = ? ORDER BY r.report_id",
				rs -> rs.getString("report_id"), userId);
	}

	/**
	 * Replace a group's reports with exactly this set.
	 *
	 * <p>One transaction for the same reason {@link #setGroupDashboards} is one: the dialog sends the
	 * whole set of ticked boxes, and a half-written set is a group whose members can run some of what
	 * an admin meant and not the rest. There is no default to keep in step, so it is the two
	 * statements and no third.
	 */
	public void setGroupReports(long groupId, List<String> reportIds) {
		try (Connection conn = db.getConnection()) {
			boolean autoCommit = conn.getAutoCommit();
			conn.setAutoCommit(false);
			try {
				try (PreparedStatement clear = conn
						.prepareStatement("DELETE FROM user_group_report WHERE group_id = ?")) {
					clear.setLong(1, groupId);
					clear.executeUpdate();
				}
				try (PreparedStatement add = conn
						.prepareStatement("INSERT INTO user_group_report (group_id, report_id) VALUES (?, ?)")) {
					for (String reportId : reportIds) {
						add.setLong(1, groupId);
						add.setString(2, reportId);
						add.executeUpdate();
					}
				}
				conn.commit();
			} catch (SQLException e) {
				conn.rollback();
				throw e;
			} finally {
				conn.setAutoCommit(autoCommit);
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Failed to set the reports of group " + groupId, e);
		}
	}

	// ============================================================
	// group membership
	// ============================================================

	public List<UserGroup> findGroupsOfUser(long userId) {
		return queryMany("SELECT g.* FROM user_group g JOIN user_group_member m ON m.group_id = g.id "
				+ "WHERE m.user_id = ? ORDER BY g.name", this::readGroup, userId);
	}

	public List<String> findGroupMemberUsernames(long groupId) {
		return queryMany("SELECT u.username FROM app_user u JOIN user_group_member m ON m.user_id = u.id "
				+ "WHERE m.group_id = ? ORDER BY u.username", rs -> rs.getString("username"), groupId);
	}

	public int countGroupMembers(long groupId) {
		return count("SELECT COUNT(*) FROM user_group_member WHERE group_id = ?", groupId);
	}

	/**
	 * Replace a user's groups with exactly this set.
	 *
	 * <p>Delete-then-insert in one transaction: the admin screen sends the whole set of ticked boxes,
	 * and half-applying it would leave somebody in a group the admin has just taken them out of.
	 */
	public void replaceUserGroups(long userId, List<Long> groupIds) {
		try (Connection conn = db.getConnection()) {
			boolean autoCommit = conn.getAutoCommit();
			conn.setAutoCommit(false);
			try {
				try (PreparedStatement clear = conn.prepareStatement("DELETE FROM user_group_member WHERE user_id = ?")) {
					clear.setLong(1, userId);
					clear.executeUpdate();
				}
				try (PreparedStatement add = conn
						.prepareStatement("INSERT INTO user_group_member (group_id, user_id) VALUES (?, ?)")) {
					for (Long groupId : groupIds) {
						add.setLong(1, groupId);
						add.setLong(2, userId);
						add.executeUpdate();
					}
				}
				conn.commit();
			} catch (SQLException e) {
				conn.rollback();
				throw e;
			} finally {
				conn.setAutoCommit(autoCommit);
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Failed to set the groups of user " + userId, e);
		}
	}

	// ============================================================
	// tiny JDBC plumbing — kept private so callers only see the domain
	// ============================================================

	private interface RowReader<T> {
		T read(ResultSet rs) throws SQLException;
	}

	private <T> Optional<T> queryOne(String sql, RowReader<T> reader, Object... params) {
		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			bind(ps, params);
			try (ResultSet rs = ps.executeQuery()) {
				return rs.next() ? Optional.of(reader.read(rs)) : Optional.empty();
			}
		} catch (SQLException e) {
			throw new IllegalStateException("IAM query failed: " + sql, e);
		}
	}

	private <T> List<T> queryMany(String sql, RowReader<T> reader, Object... params) {
		List<T> rows = new ArrayList<>();
		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			bind(ps, params);
			try (ResultSet rs = ps.executeQuery()) {
				while (rs.next())
					rows.add(reader.read(rs));
			}
		} catch (SQLException e) {
			throw new IllegalStateException("IAM query failed: " + sql, e);
		}
		return rows;
	}

	private int count(String sql, Object... params) {
		return queryOne(sql, rs -> rs.getInt(1), params).orElse(0);
	}

	private void execute(String sql, Object... params) {
		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			bind(ps, params);
			ps.executeUpdate();
		} catch (SQLException e) {
			throw new IllegalStateException("IAM statement failed: " + sql, e);
		}
	}

	private long insert(String sql, Object... params) {
		try (Connection conn = db.getConnection();
				PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
			bind(ps, params);
			ps.executeUpdate();
			try (ResultSet keys = ps.getGeneratedKeys()) {
				if (keys.next())
					return keys.getLong(1);
			}
			throw new IllegalStateException("Insert returned no generated key: " + sql);
		} catch (SQLException e) {
			throw new IllegalStateException("IAM insert failed: " + sql, e);
		}
	}

	private void bind(PreparedStatement ps, Object... params) throws SQLException {
		for (int i = 0; i < params.length; i++)
			ps.setObject(i + 1, params[i]);
	}

	private Tenant readTenant(ResultSet rs) throws SQLException {
		return new Tenant(rs.getLong("id"), rs.getString("code"), rs.getString("display_name"),
				rs.getString("home_dir"), rs.getString("customer_ref"), rs.getString("status"),
				rs.getString("created_at"));
	}

	private UserGroup readGroup(ResultSet rs) throws SQLException {
		return new UserGroup(rs.getLong("id"), rs.getLong("tenant_id"), rs.getString("name"),
				rs.getString("settings_json"), rs.getString("default_dashboard"), rs.getString("created_at"));
	}

	private AppUser readUser(ResultSet rs) throws SQLException {
		return new AppUser(rs.getLong("id"), rs.getString("username"), rs.getString("email"),
				rs.getString("password_hash"), rs.getString("status"), rs.getInt("platform_admin") == 1,
				rs.getString("created_at"));
	}
}

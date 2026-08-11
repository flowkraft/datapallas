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

	private int count(String sql) {
		return queryOne(sql, rs -> rs.getInt(1)).orElse(0);
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

	private AppUser readUser(ResultSet rs) throws SQLException {
		return new AppUser(rs.getLong("id"), rs.getString("username"), rs.getString("email"),
				rs.getString("password_hash"), rs.getString("status"), rs.getInt("platform_admin") == 1,
				rs.getString("created_at"));
	}
}

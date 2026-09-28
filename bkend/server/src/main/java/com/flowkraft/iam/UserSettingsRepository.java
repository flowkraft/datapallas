package com.flowkraft.iam;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

/**
 * What one viewer set for themselves, as a key and a JSON value, in the IAM store's
 * {@code user_setting} table.
 *
 * <p>Deliberately generic — an owner, a tenant, a key, a value — and deliberately small. Today the
 * only thing written through it is a dashboard viewer's own cube view
 * ({@code cube-view:<reportId>:<componentId>}, W5), which is the second of the two layers a live
 * cube has: the dashboard's own file holds the lock and the author's default, this holds what each
 * viewer changed. One viewer's clicks therefore never reach another viewer, and republishing the
 * dashboard rewrites the author's layer without touching anybody's view.
 *
 * <p><b>{@code owner} is text, not a foreign key.</b> A person is {@code user:<app_user.id>}, and
 * the desktop's installation key — which is one person on one machine, with no row in
 * {@code app_user} of its own — is {@code machine:api-key}. Because there is no foreign key to
 * cascade, {@link IamRepository#deleteUser(long)} deletes a person's rows itself, in the same
 * transaction that deletes the person.
 *
 * <p>Plain JDBC on {@link IamDatabase}, like {@link IamRepository}, and every statement binds its
 * parameters: a report id and a component id arrive from HTTP.
 */
@Repository
public class UserSettingsRepository {

	/** The desktop: the installation's own API key, which is one person on one machine. */
	public static final String MACHINE_OWNER = "machine:api-key";

	/** The most a single setting may hold, so one viewer cannot fill the store (W5: → 413). */
	public static final int MAX_VALUE_BYTES = 16 * 1024;

	private final IamDatabase db;

	@Autowired
	public UserSettingsRepository(IamDatabase db) {
		this.db = db;
	}

	/** A signed-in person, by the id their own installation gave them. */
	public static String ownerOfUser(long userId) {
		return "user:" + userId;
	}

	/** The key one live cube of one dashboard is saved under. */
	public static String cubeViewKey(String reportId, String componentId) {
		return "cube-view:" + reportId + ":" + componentId;
	}

	public Optional<String> find(String owner, String tenantCode, String key) {

		String sql = "SELECT value_json FROM user_setting WHERE owner = ? AND tenant_code = ? AND setting_key = ?";
		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setString(1, owner);
			ps.setString(2, tenant(tenantCode));
			ps.setString(3, key);
			try (ResultSet rs = ps.executeQuery()) {
				return rs.next() ? Optional.ofNullable(rs.getString("value_json")) : Optional.empty();
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Reading a user setting failed: " + key, e);
		}
	}

	/** Saves it, or replaces what was saved before: one row per owner, tenant and key. */
	public void upsert(String owner, String tenantCode, String key, String valueJson) {

		String sql = "INSERT INTO user_setting (owner, tenant_code, setting_key, value_json, updated_at) "
				+ "VALUES (?, ?, ?, ?, datetime('now')) "
				+ "ON CONFLICT(owner, tenant_code, setting_key) "
				+ "DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at";

		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setString(1, owner);
			ps.setString(2, tenant(tenantCode));
			ps.setString(3, key);
			ps.setString(4, valueJson);
			ps.executeUpdate();
		} catch (SQLException e) {
			throw new IllegalStateException("Saving a user setting failed: " + key, e);
		}
	}

	/** @return true when there was one to delete — what "Reset view" needs to know. */
	public boolean delete(String owner, String tenantCode, String key) {

		String sql = "DELETE FROM user_setting WHERE owner = ? AND tenant_code = ? AND setting_key = ?";
		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setString(1, owner);
			ps.setString(2, tenant(tenantCode));
			ps.setString(3, key);
			return ps.executeUpdate() > 0;
		} catch (SQLException e) {
			throw new IllegalStateException("Deleting a user setting failed: " + key, e);
		}
	}

	/** Everything this owner ever saved, in every tenant: what deleting them has to take with it. */
	public int deleteAllFor(String owner) {

		try (Connection conn = db.getConnection()) {
			return deleteAllFor(conn, owner);
		} catch (SQLException e) {
			throw new IllegalStateException("Deleting the settings of " + owner + " failed", e);
		}
	}

	/**
	 * The same delete, on a connection somebody else owns — so that deleting a person and deleting
	 * what that person saved are one transaction and not two.
	 */
	static int deleteAllFor(Connection conn, String owner) throws SQLException {
		try (PreparedStatement ps = conn.prepareStatement("DELETE FROM user_setting WHERE owner = ?")) {
			ps.setString(1, owner);
			return ps.executeUpdate();
		}
	}

	/** An installation with no tenants says so with an empty string, never with null: it is a key. */
	private static String tenant(String tenantCode) {
		return tenantCode == null ? "" : tenantCode;
	}
}

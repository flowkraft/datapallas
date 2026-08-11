package com.flowkraft.embed;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamService;
import com.flowkraft.iam.model.Tenant;

/**
 * Long-lived, revocable links that let someone without an account open one published dashboard.
 *
 * <h2>Why this is not an embed token</h2>
 * An {@link EmbedTokenService} token lives for an hour because the page's server re-mints it on every
 * render — short life <em>is</em> its protection, so it needs no storage and can be a self-verifying
 * HMAC. A share link is the opposite: a person pastes it into an email and expects it to work next
 * week. Its protection therefore cannot be time, and has to be
 * <b>unguessability plus the ability to revoke</b> — which means the token must be stored.
 *
 * <p>Stored as a SHA-256 hash, like a password. A leaked database gives an attacker hashes, not
 * working links. There is no way to display an existing link again for the same reason: reissue it.
 *
 * <h2>How the two compose</h2>
 * The share token is validated when the dashboard page is requested. The page then embeds a normal
 * one-hour embed token for the components, so the durable secret stays in the URL and never reaches
 * the data-fetching layer. Revoking the row breaks the link on the next page load.
 */
@Service
public class ShareTokenService {

	private static final Logger log = LoggerFactory.getLogger(ShareTokenService.class);

	public static final String RESOURCE_REPORT = "report";

	@Autowired
	private IamDatabase db;

	@Autowired
	private IamService iamService;

	/**
	 * Create a share link for a report.
	 *
	 * @param expiresInDays optional; null or non-positive means the link never expires on its own and
	 *                      can only be revoked
	 * @return the raw token — the ONLY time it is ever available, since only its hash is stored
	 */
	public String createShareToken(String reportId, Integer expiresInDays) {

		if (StringUtils.isBlank(reportId))
			throw new IllegalArgumentException("reportId is required");

		byte[] random = new byte[32];
		new SecureRandom().nextBytes(random);
		String token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);

		long tenantId = currentTenantId();
		String expiresAt = (expiresInDays == null || expiresInDays <= 0) ? null
				: "datetime('now', '+" + expiresInDays + " days')";

		String sql = "INSERT INTO share_token (tenant_id, resource_type, resource_id, token_hash, expires_at, created_at) "
				+ "VALUES (?, ?, ?, ?, " + (expiresAt == null ? "NULL" : expiresAt) + ", datetime('now'))";

		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setLong(1, tenantId);
			ps.setString(2, RESOURCE_REPORT);
			ps.setString(3, reportId);
			ps.setString(4, hash(token));
			ps.executeUpdate();
		} catch (SQLException e) {
			throw new IllegalStateException("Could not create the share link", e);
		}

		log.info("Created a share link for report '{}'", reportId);
		return token;
	}

	/**
	 * @return the report the token opens, or empty when it is unknown, revoked or expired.
	 */
	public Optional<String> resolveReportId(String token) {

		if (StringUtils.isBlank(token))
			return Optional.empty();

		String sql = "SELECT resource_id FROM share_token WHERE token_hash = ? AND resource_type = ? "
				+ "AND (expires_at IS NULL OR expires_at > datetime('now'))";

		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setString(1, hash(token.trim()));
			ps.setString(2, RESOURCE_REPORT);
			try (ResultSet rs = ps.executeQuery()) {
				return rs.next() ? Optional.of(rs.getString("resource_id")) : Optional.empty();
			}
		} catch (SQLException e) {
			// A failure to read must never be read as "allowed".
			log.error("Could not resolve a share token", e);
			return Optional.empty();
		}
	}

	/** Every live link for a report, so an administrator can see what is shared and revoke it. */
	public List<ShareLink> listShareLinks(String reportId) {

		List<ShareLink> links = new ArrayList<>();
		String sql = "SELECT id, resource_id, expires_at, created_at FROM share_token "
				+ "WHERE resource_type = ? AND resource_id = ? ORDER BY created_at DESC";

		try (Connection conn = db.getConnection(); PreparedStatement ps = conn.prepareStatement(sql)) {
			ps.setString(1, RESOURCE_REPORT);
			ps.setString(2, reportId);
			try (ResultSet rs = ps.executeQuery()) {
				while (rs.next())
					links.add(new ShareLink(rs.getLong("id"), rs.getString("resource_id"),
							rs.getString("expires_at"), rs.getString("created_at")));
			}
		} catch (SQLException e) {
			throw new IllegalStateException("Could not list share links", e);
		}
		return links;
	}

	/** Revocation is deletion: the link stops working on the next page load. */
	public void revoke(long shareTokenId) {
		try (Connection conn = db.getConnection();
				PreparedStatement ps = conn.prepareStatement("DELETE FROM share_token WHERE id = ?")) {
			ps.setLong(1, shareTokenId);
			ps.executeUpdate();
		} catch (SQLException e) {
			throw new IllegalStateException("Could not revoke the share link", e);
		}
	}

	// ============================================================
	// internals
	// ============================================================

	/**
	 * SHA-256 rather than BCrypt: a share token is 256 bits of randomness, not a human-chosen
	 * password, so there is nothing to brute-force and every lookup would otherwise pay a
	 * deliberately slow hash on a page load.
	 */
	private String hash(String token) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			return Base64.getUrlEncoder().withoutPadding()
					.encodeToString(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException("Could not hash the share token", e);
		}
	}

	private long currentTenantId() {
		return iamService.findTenant(Tenant.DEFAULT_CODE).map(Tenant::id).orElse(1L);
	}

	/** A share link as shown to an administrator — never including the token itself. */
	public record ShareLink(long id, String reportId, String expiresAt, String createdAt) {
	}
}

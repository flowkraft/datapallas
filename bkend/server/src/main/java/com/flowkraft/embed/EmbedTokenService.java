package com.flowkraft.embed;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.flowkraft.common.AppPaths;

import jakarta.annotation.PostConstruct;

/**
 * Mints and verifies short-lived tokens that let an embedded web component read ONE report.
 *
 * <h2>The problem this solves</h2>
 * A page that embeds {@code <rb-tabulator>} cannot hold a secret — everything in the HTML is visible
 * in view-source to every visitor. Injecting the installation API key there, which is what the product
 * used to do, published an administrator credential to the internet.
 *
 * <p>The established answer (Metabase signed embedding, Looker SSO embed, Power BI app-owns-data) is
 * to let the <em>embedding page's server</em> mint a credential per render that is:
 * <ul>
 *   <li><b>short-lived</b> — a token found in view-source is useless within the hour;</li>
 *   <li><b>scoped to one report</b> — it unlocks exactly the data the page already displays.</li>
 * </ul>
 * The visitor authenticates with nothing and sees no login. That is the whole point: signed embedding
 * exists so the viewer never signs in.
 *
 * <h2>Why HS256 by hand instead of a JWT library</h2>
 * The verification this needs is one algorithm, one claim set, no key rotation and no discovery. A JWT
 * library would be a new dependency for about forty lines, and the two ways JWT verification usually
 * goes wrong are closed explicitly here: the algorithm is pinned so a token claiming {@code alg: none}
 * is refused rather than negotiated, and {@code exp} is mandatory rather than optional. The AI Hub's
 * middleware verifies the same shape the same way.
 */
@Service
public class EmbedTokenService {

	private static final Logger log = LoggerFactory.getLogger(EmbedTokenService.class);

	private static final String SIGNING_KEY_FILENAME = ".embed-key";

	/** An hour, not ten minutes: a dashboard left open while someone changes a filter must not 401. */
	public static final long DEFAULT_TTL_SECONDS = 3600;

	/** Refuse absurd lifetimes — a token good for a year is an API key with extra steps. */
	private static final long MAX_TTL_SECONDS = 24 * 3600;

	private static final String HEADER_B64 = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");

	private byte[] signingKey;

	@PostConstruct
	public void init() {
		try {
			Path keyPath = signingKeyPath();
			Files.createDirectories(keyPath.getParent());

			if (Files.exists(keyPath)) {
				signingKey = Base64.getUrlDecoder().decode(Files.readString(keyPath).trim());
			} else {
				byte[] random = new byte[32];
				new SecureRandom().nextBytes(random);
				signingKey = random;
				Files.writeString(keyPath, Base64.getUrlEncoder().withoutPadding().encodeToString(random));
				log.info("Generated the embed-token signing key at {}", keyPath);
			}
		} catch (Exception e) {
			// Never leave the field null — an unreadable key must fail every verification, not NPE
			// somewhere further down the filter chain.
			byte[] fallback = new byte[32];
			new SecureRandom().nextBytes(fallback);
			signingKey = fallback;
			log.error("Could not load the embed-token signing key; embed tokens will not survive a restart", e);
		}
	}

	/**
	 * Mint a token that authorises reading {@code reportId} until it expires.
	 *
	 * @param ttlSeconds requested lifetime, clamped to {@link #MAX_TTL_SECONDS}; non-positive means
	 *                   {@link #DEFAULT_TTL_SECONDS}
	 */
	public String mint(String reportId, long ttlSeconds) {

		if (StringUtils.isBlank(reportId))
			throw new IllegalArgumentException("reportId is required");

		long ttl = ttlSeconds <= 0 ? DEFAULT_TTL_SECONDS : Math.min(ttlSeconds, MAX_TTL_SECONDS);
		long expiresAt = System.currentTimeMillis() / 1000 + ttl;

		// Hand-built rather than serialised: the claim set is two fields and a Jackson round-trip would
		// only add a way for the shape to drift from what verify() expects.
		String payload = base64Url("{\"rid\":\"" + escapeJson(reportId) + "\",\"exp\":" + expiresAt + "}");
		String signingInput = HEADER_B64 + "." + payload;

		return signingInput + "." + sign(signingInput);
	}

	/**
	 * @return the report the token authorises, or empty when the token is missing, malformed, signed
	 *         with the wrong key, or expired. Callers get no detail — telling a caller <em>why</em> a
	 *         token failed helps them forge a better one.
	 */
	public Optional<String> verifyAndGetReportId(String token) {

		if (StringUtils.isBlank(token))
			return Optional.empty();

		String[] parts = token.trim().split("\\.");
		if (parts.length != 3)
			return Optional.empty();

		// Pin the algorithm by comparing the whole encoded header: a token declaring "alg":"none" or
		// an RSA algorithm never reaches the signature check.
		if (!MessageDigest.isEqual(HEADER_B64.getBytes(StandardCharsets.UTF_8),
				parts[0].getBytes(StandardCharsets.UTF_8)))
			return Optional.empty();

		String expectedSignature = sign(parts[0] + "." + parts[1]);
		if (!MessageDigest.isEqual(expectedSignature.getBytes(StandardCharsets.UTF_8),
				parts[2].getBytes(StandardCharsets.UTF_8)))
			return Optional.empty();

		try {
			String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);

			long expiresAt = Long.parseLong(extractJsonValue(payload, "exp"));
			if (expiresAt <= System.currentTimeMillis() / 1000)
				return Optional.empty();

			String reportId = extractJsonValue(payload, "rid");
			return StringUtils.isBlank(reportId) ? Optional.empty() : Optional.of(reportId);

		} catch (Exception e) {
			return Optional.empty();
		}
	}

	// ============================================================
	// internals
	// ============================================================

	private String sign(String signingInput) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
			return Base64.getUrlEncoder().withoutPadding()
					.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
		} catch (Exception e) {
			throw new IllegalStateException("Could not sign the embed token", e);
		}
	}

	Path signingKeyPath() {
		String portableDir = StringUtils.defaultIfBlank(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH,
				System.getProperty("user.dir"));
		return Paths.get(portableDir, "config", "_internal", SIGNING_KEY_FILENAME).toAbsolutePath().normalize();
	}

	private static String base64Url(String value) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}

	/** Report ids are slugs, but a quote or backslash must never be able to break out of the claim. */
	private static String escapeJson(String value) {
		return value.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	/**
	 * Two known claims, so a full JSON parse would be more machinery than the job needs.
	 *
	 * <p>The string branch walks the value honouring backslash escapes rather than scanning for the
	 * next quote: mint() escapes a quote inside a report id as {@code \"}, and stopping at that quote
	 * would truncate the value and resolve the token to the wrong report.
	 */
	private static String extractJsonValue(String json, String key) {
		String quoted = "\"" + key + "\":\"";
		int start = json.indexOf(quoted);
		if (start >= 0) {
			start += quoted.length();

			StringBuilder value = new StringBuilder();
			for (int i = start; i < json.length(); i++) {
				char c = json.charAt(i);
				if (c == '\\' && i + 1 < json.length()) {
					value.append(json.charAt(++i));
				} else if (c == '"') {
					return value.toString();
				} else {
					value.append(c);
				}
			}
			return null;
		}

		String bare = "\"" + key + "\":";
		start = json.indexOf(bare);
		if (start < 0)
			return null;
		start += bare.length();
		int end = start;
		while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-'))
			end++;
		return json.substring(start, end);
	}
}

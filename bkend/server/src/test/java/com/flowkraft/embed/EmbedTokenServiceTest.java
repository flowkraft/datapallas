package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flowkraft.common.AppPaths;

/**
 * Adversarial tests for embed tokens.
 *
 * <p>An embed token is published into HTML that anyone can read, so the interesting cases are not
 * "does a good token work" but "what happens to a token someone has taken apart and rebuilt". Each
 * test below is an attack: swap the algorithm, edit the report, extend the expiry, re-sign with your
 * own key.
 */
class EmbedTokenServiceTest {

	private static final String TEST_ROOT = "./target/test-output/embed-token-test";

	private String previousPortableDir;
	private Path root;
	private EmbedTokenService service;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		service = new EmbedTokenService();
		service.init();
	}

	@AfterEach
	void tearDown() {
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// the happy path
	// ============================================================

	@Test
	void aMintedTokenVerifiesAndNamesItsReport() {

		String token = service.mint("sales-summary", 600);

		assertEquals("sales-summary", service.verifyAndGetReportId(token).orElseThrow());
	}

	@Test
	void theSigningKeySurvivesARestartSoLiveEmbedsKeepWorking() throws Exception {

		String token = service.mint("sales-summary", 600);

		EmbedTokenService afterRestart = new EmbedTokenService();
		afterRestart.init();

		assertEquals("sales-summary", afterRestart.verifyAndGetReportId(token).orElseThrow());
	}

	// ============================================================
	// attacks on the token
	// ============================================================

	/**
	 * The classic JWT break. A token that declares no algorithm must be refused outright, not
	 * "verified" against an empty signature.
	 */
	@Test
	void aTokenClaimingAlgNoneIsRefused() {

		String header = base64Url("{\"alg\":\"none\",\"typ\":\"JWT\"}");
		String payload = base64Url("{\"rid\":\"payroll\",\"exp\":" + far() + "}");

		assertTrue(service.verifyAndGetReportId(header + "." + payload + ".").isEmpty());
		assertTrue(service.verifyAndGetReportId(header + "." + payload + ".anything").isEmpty());
	}

	/** Swapping the report id invalidates the signature — one token cannot be retargeted. */
	@Test
	void editingTheReportIdInvalidatesTheToken() {

		String token = service.mint("sales-summary", 600);
		String[] parts = token.split("\\.");

		String tampered = parts[0] + "." + base64Url("{\"rid\":\"payroll\",\"exp\":" + far() + "}") + "."
				+ parts[2];

		assertTrue(service.verifyAndGetReportId(tampered).isEmpty());
	}

	/** Nor can a visitor extend their own access by rewriting the expiry. */
	@Test
	void extendingTheExpiryInvalidatesTheToken() {

		String token = service.mint("sales-summary", 1);
		String[] parts = token.split("\\.");

		String tampered = parts[0] + "." + base64Url("{\"rid\":\"sales-summary\",\"exp\":" + far() + "}") + "."
				+ parts[2];

		assertTrue(service.verifyAndGetReportId(tampered).isEmpty());
	}

	/** A token signed by a different installation must not be accepted by this one. */
	@Test
	void aTokenSignedWithAnotherKeyIsRefused() throws Exception {

		String foreign = service.mint("sales-summary", 600);

		// A second installation with its own signing key.
		Files.delete(service.signingKeyPath());
		EmbedTokenService otherInstallation = new EmbedTokenService();
		otherInstallation.init();

		assertTrue(otherInstallation.verifyAndGetReportId(foreign).isEmpty());
	}

	@Test
	void anExpiredTokenIsRefused() throws Exception {

		// Mint against a payload that is already in the past, signed with the real key, so only the
		// expiry can be what rejects it.
		String header = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
		String payload = base64Url(
				"{\"rid\":\"sales-summary\",\"exp\":" + (System.currentTimeMillis() / 1000 - 60) + "}");
		String signature = signWithServiceKey(header + "." + payload);

		assertTrue(service.verifyAndGetReportId(header + "." + payload + "." + signature).isEmpty());
	}

	/** A token with no expiry would never die, so it must not be honoured either. */
	@Test
	void aTokenWithoutAnExpiryIsRefused() throws Exception {

		String header = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
		String payload = base64Url("{\"rid\":\"sales-summary\"}");
		String signature = signWithServiceKey(header + "." + payload);

		assertTrue(service.verifyAndGetReportId(header + "." + payload + "." + signature).isEmpty());
	}

	@Test
	void malformedInputIsRefusedRatherThanThrowing() {

		for (String bad : new String[] { null, "", "   ", "not-a-token", "a.b", "a.b.c.d", "....",
				"eyJhbGciOiJIUzI1NiJ9.%%%.zzz" })
			assertTrue(service.verifyAndGetReportId(bad).isEmpty(), "should refuse: " + bad);
	}

	// ============================================================
	// minting rules
	// ============================================================

	@Test
	void aBlankReportIdCannotBeMinted() {
		assertThrows(IllegalArgumentException.class, () -> service.mint(null, 600));
		assertThrows(IllegalArgumentException.class, () -> service.mint("  ", 600));
	}

	/** A token good for a year would be an API key with extra steps, so the lifetime is capped. */
	@Test
	void anAbsurdLifetimeIsClamped() {

		String token = service.mint("sales-summary", 365L * 24 * 3600);
		long expiresAt = Long.parseLong(claim(token, "exp"));

		long maxAllowed = System.currentTimeMillis() / 1000 + 24 * 3600 + 5;
		assertTrue(expiresAt <= maxAllowed, "expiry should be clamped to 24h, was " + expiresAt);
	}

	@Test
	void aNonPositiveLifetimeFallsBackToTheDefault() {

		long expiresAt = Long.parseLong(claim(service.mint("sales-summary", 0), "exp"));
		long expected = System.currentTimeMillis() / 1000 + EmbedTokenService.DEFAULT_TTL_SECONDS;

		assertTrue(Math.abs(expiresAt - expected) < 10);
	}

	/** A report id containing a quote must not be able to break out of the claim it sits in. */
	@Test
	void aReportIdCannotBreakOutOfTheJsonClaim() {

		String hostile = "x\",\"exp\":9999999999,\"rid\":\"payroll";

		assertEquals(hostile, service.verifyAndGetReportId(service.mint(hostile, 600)).orElseThrow());
	}

	@Test
	void theSigningKeyLivesBesideTheOtherInternalState() {
		assertTrue(service.signingKeyPath().endsWith(Path.of("config", "_internal", ".embed-key")));
		assertTrue(Files.exists(service.signingKeyPath()));
	}

	@Test
	void twoInstallationsDoNotShareASigningKey() throws Exception {

		String first = Files.readString(service.signingKeyPath());

		Files.delete(service.signingKeyPath());
		EmbedTokenService other = new EmbedTokenService();
		other.init();

		assertFalse(first.equals(Files.readString(other.signingKeyPath())));
	}

	// ============================================================
	// helpers
	// ============================================================

	private static String base64Url(String value) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}

	private static long far() {
		return System.currentTimeMillis() / 1000 + 99999;
	}

	private String claim(String token, String key) {
		String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
		int start = payload.indexOf("\"" + key + "\":") + key.length() + 3;
		int end = start;
		while (end < payload.length() && Character.isDigit(payload.charAt(end)))
			end++;
		return payload.substring(start, end);
	}

	/** Sign with the service's real key, so a test can isolate a claim check from the signature check. */
	private String signWithServiceKey(String signingInput) throws Exception {
		byte[] key = Base64.getUrlDecoder().decode(Files.readString(service.signingKeyPath()).trim());
		javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
		mac.init(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA256"));
		return Base64.getUrlEncoder().withoutPadding()
				.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
	}
}

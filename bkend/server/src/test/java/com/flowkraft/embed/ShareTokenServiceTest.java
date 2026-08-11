package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.flowkraft.common.AppPaths;
import com.flowkraft.iam.IamDatabase;
import com.flowkraft.iam.IamRepository;
import com.flowkraft.iam.IamService;
import com.flowkraft.license.LicenseService;
import com.flowkraft.license.model.LicenseDetails;

/**
 * Tests for share links — the credential a person pastes into an email.
 *
 * <p>Unlike an embed token, a share link is long-lived, so its protection is unguessability and the
 * ability to revoke rather than a short expiry. The cases that matter are therefore: is the raw token
 * kept out of the database, does revoking actually break the link, and does one link open exactly one
 * dashboard.
 */
class ShareTokenServiceTest {

	private static final String TEST_ROOT = "./target/test-output/share-token-test";

	private String previousPortableDir;
	private Path root;

	private IamDatabase database;
	private ShareTokenService shareTokenService;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		database = new IamDatabase();
		database.init();

		IamRepository repository = new IamRepository(database);
		IamService iamService = new IamService(repository, new BCryptPasswordEncoder(), new LicenseService() {
			@Override
			public LicenseDetails loadLicenseFile() {
				return new LicenseDetails();
			}
		});
		iamService.bootstrap();

		shareTokenService = new ShareTokenService();
		ReflectionTestUtils.setField(shareTokenService, "db", database);
		ReflectionTestUtils.setField(shareTokenService, "iamService", iamService);
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		FileUtils.deleteQuietly(root.toFile());
	}

	@Test
	void aShareLinkOpensTheReportItWasCreatedFor() {

		String token = shareTokenService.createShareToken("sales-summary", null);

		assertEquals("sales-summary", shareTokenService.resolveReportId(token).orElseThrow());
	}

	/** One link, one dashboard. Holding a link to sales must not open payroll. */
	@Test
	void aShareLinkOpensOnlyItsOwnReport() {

		String salesToken = shareTokenService.createShareToken("sales-summary", null);
		shareTokenService.createShareToken("payroll", null);

		assertEquals("sales-summary", shareTokenService.resolveReportId(salesToken).orElseThrow());
	}

	/**
	 * The raw token must never be recoverable from the store: a database copy has to yield hashes, not
	 * working links.
	 */
	@Test
	void onlyTheHashIsStored() throws Exception {

		String token = shareTokenService.createShareToken("sales-summary", null);

		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			var rs = st.executeQuery("SELECT token_hash FROM share_token");
			assertTrue(rs.next());
			String stored = rs.getString("token_hash");

			assertFalse(token.equals(stored), "the raw token must not be stored");
			assertFalse(stored.contains(token), "the raw token must not appear in the stored value");
		}
	}

	/** Revoking is the whole point of a long-lived credential. */
	@Test
	void revokingBreaksTheLink() {

		String token = shareTokenService.createShareToken("sales-summary", null);
		long id = shareTokenService.listShareLinks("sales-summary").get(0).id();

		shareTokenService.revoke(id);

		assertTrue(shareTokenService.resolveReportId(token).isEmpty());
	}

	/** Revoking one link must not disturb another for the same dashboard. */
	@Test
	void revokingOneLinkLeavesTheOthersWorking() {

		String first = shareTokenService.createShareToken("sales-summary", null);
		String second = shareTokenService.createShareToken("sales-summary", null);

		long firstId = shareTokenService.listShareLinks("sales-summary").stream()
				.filter(link -> shareTokenService.resolveReportId(first).isPresent()).findFirst().orElseThrow()
				.id();
		shareTokenService.revoke(firstId);

		// Exactly one of the two is now dead, and one still works.
		assertTrue(shareTokenService.resolveReportId(first).isEmpty()
				|| shareTokenService.resolveReportId(second).isEmpty());
		assertTrue(shareTokenService.resolveReportId(first).isPresent()
				|| shareTokenService.resolveReportId(second).isPresent());
	}

	@Test
	void anExpiredLinkStopsWorking() throws Exception {

		shareTokenService.createShareToken("sales-summary", 30);
		String token = shareTokenService.createShareToken("sales-summary", 30);

		// Push both expiries into the past rather than waiting thirty days.
		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			st.executeUpdate("UPDATE share_token SET expires_at = datetime('now', '-1 day')");
		}

		assertTrue(shareTokenService.resolveReportId(token).isEmpty());
	}

	/** A link with no expiry is legitimate — "until I revoke it" is a real choice. */
	@Test
	void aLinkWithoutAnExpiryKeepsWorking() {

		String token = shareTokenService.createShareToken("sales-summary", null);

		assertTrue(shareTokenService.resolveReportId(token).isPresent());
		assertEquals(null, shareTokenService.listShareLinks("sales-summary").get(0).expiresAt());
	}

	@Test
	void anUnknownOrMalformedTokenIsRefused() {

		shareTokenService.createShareToken("sales-summary", null);

		for (String bad : new String[] { null, "", "   ", "not-a-real-token", "../../etc/passwd" })
			assertTrue(shareTokenService.resolveReportId(bad).isEmpty(), "should refuse: " + bad);
	}

	@Test
	void twoLinksForTheSameReportAreDifferent() {

		String first = shareTokenService.createShareToken("sales-summary", null);
		String second = shareTokenService.createShareToken("sales-summary", null);

		assertFalse(first.equals(second));
	}

	@Test
	void aBlankReportIdIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> shareTokenService.createShareToken(null, null));
		assertThrows(IllegalArgumentException.class, () -> shareTokenService.createShareToken("  ", null));
	}

	/** The listing is for an administrator to audit and revoke — it must never leak the tokens. */
	@Test
	void theListingNeverExposesTheTokens() {

		String token = shareTokenService.createShareToken("sales-summary", null);

		List<ShareTokenService.ShareLink> links = shareTokenService.listShareLinks("sales-summary");

		assertEquals(1, links.size());
		assertFalse(links.toString().contains(token), "the listing must not contain the raw token");
	}
}

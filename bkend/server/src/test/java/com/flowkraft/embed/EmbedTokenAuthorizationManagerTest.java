package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import com.flowkraft.common.AppPaths;

/**
 * An embed token opens the reads of its own report — config, data and the server-side pivot — and
 * nothing else. Every request here comes from nobody signed in (the delegate refuses), so whatever is
 * granted is granted by the token alone.
 */
class EmbedTokenAuthorizationManagerTest {

	private static final String TEST_ROOT = "./target/test-output/embed-token-authorization-test";

	private String previousPortableDir;
	private Path root;
	private EmbedTokenService embedTokenService;
	private EmbedTokenAuthorizationManager manager;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		embedTokenService = new EmbedTokenService();
		embedTokenService.init();

		// No share tokens in play: none of these requests carries ?token=.
		manager = new EmbedTokenAuthorizationManager(embedTokenService, null,
				(authentication, context) -> new AuthorizationDecision(false));
	}

	@AfterEach
	void tearDown() {
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		FileUtils.deleteQuietly(root.toFile());
	}

	// ============================================================
	// locked parameters
	// ============================================================

	/**
	 * This is the only place that holds both the credential and the report it was checked against, so
	 * it is the only place that can tell the controller what the request may read.
	 */
	@Test
	void theLocksATokenCarriesReachTheRequest() {

		MockHttpServletRequest request = data("sales-summary",
				embedTokenService.mint("sales-summary", 600, Map.of("region", "EU")));

		assertTrue(granted(request));
		assertEquals(Map.of("region", "EU"), LockedParams.of(request));
	}

	@Test
	void aTokenThatLocksNothingLeavesTheRequestUnrestricted() {

		MockHttpServletRequest request = data("sales-summary", embedTokenService.mint("sales-summary", 600));

		assertTrue(granted(request));
		assertTrue(LockedParams.of(request).isEmpty());
	}

	/** Fail closed: a request nothing authorised never carries locks, because it carries no decision. */
	@Test
	void aRefusedRequestCarriesNoLocks() {

		MockHttpServletRequest request = data("payroll",
				embedTokenService.mint("sales-summary", 600, Map.of("region", "EU")));

		assertFalse(granted(request));
		assertTrue(LockedParams.of(request).isEmpty());
	}

	/**
	 * The share-link path has to attach its locks too. It is the path a browser takes —
	 * {@code /api/reports/x/data?token=…} — and forgetting it would hand every recipient of a locked
	 * link a way around the lock: just ask for the data directly.
	 */
	@Test
	void aShareLinkAttachesItsLocksAsWell() {

		ShareTokenService shareTokens = mock(ShareTokenService.class);
		when(shareTokens.resolve("share-me"))
				.thenReturn(Optional.of(new ShareTokenService.SharedReport("sales-summary", Map.of("region", "EU"))));

		EmbedTokenAuthorizationManager sharing = new EmbedTokenAuthorizationManager(embedTokenService, shareTokens,
				(authentication, context) -> new AuthorizationDecision(false));

		MockHttpServletRequest request = data("sales-summary", null);
		request.addParameter("token", "share-me");

		assertTrue(sharing.check(() -> null, new RequestAuthorizationContext(request)).isGranted());
		assertEquals(Map.of("region", "EU"), LockedParams.of(request));
	}

	// ============================================================
	// the mark a token leaves
	// ============================================================

	/**
	 * A request a token authorised carries no user and no role, so everything downstream that asks "may
	 * this caller see this report?" — the dashboard grants above all — has to know to stand aside. The
	 * mark is how it knows, and this is the only place that can leave it.
	 */
	@Test
	void anEmbedTokenMarksTheRequestWithItsReport() {

		MockHttpServletRequest request = data("sales-summary", embedTokenService.mint("sales-summary", 600));

		assertTrue(granted(request));
		assertTrue(TokenRequest.isTokenRequest(request));
		assertEquals("sales-summary", TokenRequest.reportIdOf(request));
	}

	@Test
	void aShareLinkMarksItToo() {

		ShareTokenService shareTokens = mock(ShareTokenService.class);
		when(shareTokens.resolve("share-me"))
				.thenReturn(Optional.of(new ShareTokenService.SharedReport("sales-summary", Map.of())));

		EmbedTokenAuthorizationManager sharing = new EmbedTokenAuthorizationManager(embedTokenService, shareTokens,
				(authentication, context) -> new AuthorizationDecision(false));

		MockHttpServletRequest request = data("sales-summary", null);
		request.addParameter("token", "share-me");

		assertTrue(sharing.check(() -> null, new RequestAuthorizationContext(request)).isGranted());
		assertEquals("sales-summary", TokenRequest.reportIdOf(request));
	}

	/** Fail closed: nothing authorised the request, so nothing may stand aside for it either. */
	@Test
	void aRefusedRequestIsNotMarked() {

		MockHttpServletRequest request = data("payroll", embedTokenService.mint("sales-summary", 600));

		assertFalse(granted(request));
		assertFalse(TokenRequest.isTokenRequest(request));
	}

	private MockHttpServletRequest data(String reportId, String embedToken) {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/reports/" + reportId + "/data");
		if (embedToken != null)
			request.addHeader("X-Embed-Token", embedToken);
		return request;
	}

	private MockHttpServletRequest pivot(String reportIdParam, String embedToken) {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/analytics/pivot");
		if (reportIdParam != null) {
			request.setQueryString("reportId=" + reportIdParam);
			request.addParameter("reportId", reportIdParam);
		}
		if (embedToken != null)
			request.addHeader("X-Embed-Token", embedToken);
		return request;
	}

	private boolean granted(MockHttpServletRequest request) {
		return manager.check(() -> null, new RequestAuthorizationContext(request)).isGranted();
	}

	@Test
	void aTokenPivotsItsOwnReport() {
		MockHttpServletRequest request = pivot("sales-summary", embedTokenService.mint("sales-summary", 600));

		assertTrue(granted(request));
		assertTrue(manager.carriesValidEmbedToken(request));
	}

	@Test
	void aTokenCannotPivotAnotherReport() {
		MockHttpServletRequest request = pivot("payroll", embedTokenService.mint("sales-summary", 600));

		assertFalse(granted(request));
		assertFalse(manager.carriesValidEmbedToken(request));
	}

	@Test
	void aTokenCannotPivotWithoutNamingItsReport() {
		// The any-connection, any-table form of the pivot: never opened by a token.
		MockHttpServletRequest request = pivot(null, embedTokenService.mint("sales-summary", 600));

		assertFalse(granted(request));
		assertFalse(manager.carriesValidEmbedToken(request));
	}

	@Test
	void aPivotWithoutATokenNeedsASignIn() {
		MockHttpServletRequest request = pivot("sales-summary", null);

		assertFalse(granted(request));
		assertFalse(manager.carriesValidEmbedToken(request));
	}

	@Test
	void aForgedTokenOpensNothing() {
		MockHttpServletRequest request = pivot("sales-summary", "not-a-token");

		assertFalse(granted(request));
		assertFalse(manager.carriesValidEmbedToken(request));
	}

	@Test
	void theReportDataReadStillAnswersToItsToken() {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/reports/sales-summary/data");
		request.addHeader("X-Embed-Token", embedTokenService.mint("sales-summary", 600));

		assertTrue(granted(request));
	}

	@Test
	void aTokenOpensNoOtherAnalyticsEndpoint() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/analytics/explore");
		request.addParameter("reportId", "sales-summary");
		request.addHeader("X-Embed-Token", embedTokenService.mint("sales-summary", 600));

		assertFalse(granted(request));
		assertFalse(manager.carriesValidEmbedToken(request));
	}
}

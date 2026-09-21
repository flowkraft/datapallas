package com.flowkraft.embed;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

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

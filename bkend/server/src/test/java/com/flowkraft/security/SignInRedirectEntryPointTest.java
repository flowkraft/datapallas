package com.flowkraft.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.InsufficientAuthenticationException;

class SignInRedirectEntryPointTest {

	private final SignInRedirectEntryPoint entryPoint = new SignInRedirectEntryPoint();

	private MockHttpServletResponse commence(String method, String uri, String query) throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
		request.setQueryString(query);
		MockHttpServletResponse response = new MockHttpServletResponse();
		entryPoint.commence(request, response, new InsufficientAuthenticationException("no session"));
		return response;
	}

	@Test
	void aDashboardLinkGoesToSignInAndComesBack() throws Exception {
		MockHttpServletResponse response = commence("GET", "/dashboard/my-dashboard", "region=EU");

		assertEquals(302, response.getStatus());
		assertEquals("/#/login?returnUrl=%2Fdashboard%2Fmy-dashboard%3Fregion%3DEU", response.getRedirectedUrl());
	}

	@Test
	void aDeadShareLinkIsNotAvailableInsteadOfASignIn() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dashboard/my-dashboard");
		request.setQueryString("token=revoked");
		request.addParameter("token", "revoked");
		MockHttpServletResponse response = new MockHttpServletResponse();
		entryPoint.commence(request, response, new InsufficientAuthenticationException("no session"));

		assertEquals(404, response.getStatus());
		assertNull(response.getRedirectedUrl());
		assertTrue(response.getContentAsString().contains("This link is no longer available."));
	}

	@Test
	void theApiKeepsItsClean401() throws Exception {
		MockHttpServletResponse response = commence("GET", "/api/reports/my-dashboard/data", null);

		assertEquals(401, response.getStatus());
		assertNull(response.getRedirectedUrl());
	}

	@Test
	void onlyTheDashboardPageItselfAndOnlyForAGet() throws Exception {
		assertEquals(401, commence("POST", "/dashboard/my-dashboard", null).getStatus());
		assertEquals(401, commence("GET", "/dashboard/my-dashboard/extra", null).getStatus());
		assertEquals(401, commence("GET", "/dashboard/", null).getStatus());
		assertEquals(401, commence("GET", "/api/system/fs/content", "path=config").getStatus());
	}
}

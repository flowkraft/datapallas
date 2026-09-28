package com.flowkraft.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * The one page that may be framed, and every other one that may not.
 *
 * <p>No Spring context: the writer is a plain object over a request and a response, so the test is
 * the writer itself on mock requests, which is also what makes it fast enough to run on every
 * build. That the chain really installs it is the start-up check of the quality gate.
 */
class DashboardFramingTest {

	private final DashboardFraming framing = new DashboardFraming();

	private MockHttpServletResponse headersFor(String path) {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
		MockHttpServletResponse response = new MockHttpServletResponse();
		framing.writeHeaders(request, response);
		return response;
	}

	@Test
	@DisplayName("The Cube Stories page names the origins that may frame it, and sends no X-Frame-Options")
	void cubeStoriesIsFramable() {

		MockHttpServletResponse response = headersFor("/dashboard/g-cube-stories");

		assertEquals("frame-ancestors 'self' https://datapallas.com https://www.datapallas.com",
				response.getHeader("Content-Security-Policy"));
		// The negative half: X-Frame-Options has no origin list, so if it were sent at all the site
		// could not frame the page, whatever the policy above says.
		assertNull(response.getHeader("X-Frame-Options"));
	}

	@Test
	@DisplayName("A trailing slash is the same page")
	void trailingSlashIsTheSamePage() {

		MockHttpServletResponse response = headersFor("/dashboard/g-cube-stories/");

		assertEquals(DashboardFraming.FRAME_ANCESTORS, response.getHeader("Content-Security-Policy"));
		assertNull(response.getHeader("X-Frame-Options"));
	}

	@Test
	@DisplayName("Another dashboard is refused a frame")
	void anotherDashboardIsDenied() {

		MockHttpServletResponse response = headersFor("/dashboard/g-pivottable");

		assertEquals("DENY", response.getHeader("X-Frame-Options"));
		assertNull(response.getHeader("Content-Security-Policy"));
	}

	@Test
	@DisplayName("An API answer is refused a frame")
	void apiIsDenied() {

		MockHttpServletResponse response = headersFor("/api/reports/x/data");

		assertEquals("DENY", response.getHeader("X-Frame-Options"));
		assertNull(response.getHeader("Content-Security-Policy"));
	}

	@Test
	@DisplayName("A path that only starts like the page is refused a frame")
	void alikePathIsDenied() {

		// The match is on the whole path: a report whose id begins with the page's name, and a
		// dashboard whose id merely starts with it, are two other pages.
		assertEquals("DENY", headersFor("/dashboard/g-cube-stories-copy").getHeader("X-Frame-Options"));
		assertEquals("DENY", headersFor("/api/reports/g-cube-stories/data").getHeader("X-Frame-Options"));
		assertNull(headersFor("/dashboard/g-cube-stories-copy").getHeader("Content-Security-Policy"));
	}

	@Test
	@DisplayName("The page is the page wherever the application is deployed")
	void contextPathIsTakenOff() {

		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/datapallas/dashboard/g-cube-stories");
		request.setContextPath("/datapallas");
		MockHttpServletResponse response = new MockHttpServletResponse();
		framing.writeHeaders(request, response);

		assertEquals(DashboardFraming.FRAME_ANCESTORS, response.getHeader("Content-Security-Policy"));
		assertNull(response.getHeader("X-Frame-Options"));
	}
}

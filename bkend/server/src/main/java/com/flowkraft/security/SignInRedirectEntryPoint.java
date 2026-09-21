package com.flowkraft.security;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * What a caller without a credential gets.
 *
 * <p>A person who opens a dashboard link ({@code /dashboard/{id}}) in a browser is a reader, not a
 * program: a bare 401 page is a dead end for them. They are sent to the sign-in screen instead, with
 * the dashboard's address in {@code returnUrl}, and land on the dashboard once signed in.
 *
 * <p>Except when the link is a share link ({@code ?token=…}) whose token no longer opens it (revoked,
 * or for another dashboard): its reader has no account to sign in with. They get the same "no longer
 * available" 404 the dashboard page itself answers to a signed-in user holding a dead link.
 *
 * <p>Everything else keeps the clean 401 — the API, the embedded components, scripts and the
 * Angular app, which all react to the status themselves and would only be confused by a redirect to
 * an HTML page. The login screen is an Angular route, hence {@code /#/login}, as for a federated
 * sign-in that failed.
 */
public class SignInRedirectEntryPoint implements AuthenticationEntryPoint {

	static final String LOGIN_URL = "/#/login?returnUrl=";

	/** The same page DashboardController answers with for a dead share link. */
	static final String LINK_NOT_AVAILABLE_HTML = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\">"
			+ "<title>Not available</title></head><body>"
			+ "<p>This link is no longer available.</p></body></html>";

	private final AuthenticationEntryPoint unauthorized = new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED);

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException, jakarta.servlet.ServletException {

		if (isDashboardPage(request) && StringUtils.isNotBlank(request.getParameter("token"))) {
			response.setStatus(HttpServletResponse.SC_NOT_FOUND);
			response.setContentType("text/html;charset=UTF-8");
			response.getWriter().write(LINK_NOT_AVAILABLE_HTML);
			return;
		}

		if (isDashboardPage(request)) {
			String target = request.getRequestURI()
					+ (request.getQueryString() != null ? "?" + request.getQueryString() : "");
			response.sendRedirect(request.getContextPath() + LOGIN_URL
					+ URLEncoder.encode(target, StandardCharsets.UTF_8));
			return;
		}

		unauthorized.commence(request, response, authException);
	}

	/** A browser opening a dashboard page: GET /dashboard/{id}, nothing deeper. */
	static boolean isDashboardPage(HttpServletRequest request) {
		if (!"GET".equalsIgnoreCase(request.getMethod()))
			return false;
		String path = request.getRequestURI().substring(request.getContextPath().length());
		return path.matches("/dashboard/[^/]+");
	}
}

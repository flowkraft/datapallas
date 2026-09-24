package com.flowkraft.embed;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The mark {@link EmbedTokenAuthorizationManager} leaves on a request that an embed or share token
 * authorised, and the report that token was checked against.
 *
 * <p>Such a request has no user and no role: the token <em>is</em> the permission, and it was already
 * verified against exactly this one report. Everything downstream that asks "may this caller see this
 * report?" — the dashboard grants a signed-in viewer has, above all — has to stand aside for it, or a
 * share link would answer 403 to the very person it was created for.
 *
 * <p>A sibling of {@link LockedParams}, and for the same reason: the one place that holds both the
 * credential and the report it opened is the only place that can say so.
 */
public final class TokenRequest {

	/** Set by {@link EmbedTokenAuthorizationManager} on a request a token authorised. */
	public static final String REQUEST_ATTRIBUTE = "dp.tokenReportId";

	private TokenRequest() {
	}

	/** Records that a token opened this request, for that report. */
	public static void mark(HttpServletRequest request, String reportId) {
		if (request != null && reportId != null && !reportId.isBlank())
			request.setAttribute(REQUEST_ATTRIBUTE, reportId);
	}

	/** @return the report a token opened this request for, or null when the caller is simply signed in. */
	public static String reportIdOf(HttpServletRequest request) {
		Object attribute = request == null ? null : request.getAttribute(REQUEST_ATTRIBUTE);
		return attribute instanceof String reportId ? reportId : null;
	}

	/** @return true when a token, rather than a session, authorised this request. */
	public static boolean isTokenRequest(HttpServletRequest request) {
		return reportIdOf(request) != null;
	}
}

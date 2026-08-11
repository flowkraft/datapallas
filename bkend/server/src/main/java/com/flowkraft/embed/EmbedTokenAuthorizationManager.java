package com.flowkraft.embed;

import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Grants a report-data read when the request carries a valid embed token for <em>that</em> report.
 *
 * <p>Deliberately narrow. It authorises one request against one report; it does not authenticate
 * anybody, create a session, or grant a role. An embed token therefore cannot reach connections, the
 * filesystem API, {@code run-sql}, the DSL parser, or even a different report — a caller holding a
 * token for {@code sales-summary} asking for {@code payroll} is refused.
 *
 * <p>When no usable token is present the decision falls through to the delegate (normal
 * authentication), so a signed-in user keeps reading reports exactly as before.
 */
public class EmbedTokenAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

	/** Header, not a query parameter: query strings end up in access logs and Referer headers. */
	private static final String EMBED_TOKEN_HEADER = "X-Embed-Token";

	/**
	 * Share links are the one exception, because a browser navigating to a URL cannot set a header.
	 * The page mitigates the exposure with {@code referrer: no-referrer}, and the token is revocable.
	 */
	private static final String SHARE_TOKEN_PARAM = "token";

	/** {@code /api/reports/{reportId}/data}, its config, and {@code /dashboard/{reportId}}. */
	private static final Pattern REPORT_DATA = Pattern.compile("^/api/reports/([^/]+)/data/?$");

	/**
	 * Reading a report is two requests, not one: every {@code rb-*} component asks for the config
	 * first — the columns, the chart type, the parameters — and only then for the data it describes.
	 * Authorising the second without the first grants nothing, because the component never gets far
	 * enough to make it. Both are the same act of reading the same report, so both answer to the same
	 * token for that report.
	 */
	private static final Pattern REPORT_CONFIG = Pattern.compile("^/api/reports/([^/]+)/config/?$");

	private static final Pattern DASHBOARD = Pattern.compile("^/dashboard/([^/]+)/?$");

	private final EmbedTokenService embedTokenService;
	private final ShareTokenService shareTokenService;
	private final AuthorizationManager<RequestAuthorizationContext> delegate;

	public EmbedTokenAuthorizationManager(EmbedTokenService embedTokenService,
			ShareTokenService shareTokenService,
			AuthorizationManager<RequestAuthorizationContext> delegate) {
		this.embedTokenService = embedTokenService;
		this.shareTokenService = shareTokenService;
		this.delegate = delegate;
	}

	@Override
	public AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {

		HttpServletRequest request = context.getRequest();
		Optional<String> requestedReportId = reportIdOf(request);

		if (requestedReportId.isPresent()) {

			// An embedded component fetching data: the credential rides in a header.
			String embedToken = request.getHeader(EMBED_TOKEN_HEADER);
			if (embedToken != null && !embedToken.isBlank()
					&& embedTokenService.verifyAndGetReportId(embedToken).filter(requestedReportId.get()::equals)
							.isPresent())
				return new AuthorizationDecision(true);

			// Someone opening a share link. A browser navigating to a URL cannot set a header, so the
			// credential has to be in the query string — the only place it can be for a link a person
			// pastes into an email.
			String shareToken = request.getParameter(SHARE_TOKEN_PARAM);
			if (shareToken != null && !shareToken.isBlank()
					&& shareTokenService.resolveReportId(shareToken).filter(requestedReportId.get()::equals)
							.isPresent())
				return new AuthorizationDecision(true);
		}

		// No token, a bad one, or one for a different report — fall back to being properly signed in.
		return delegate.check(authentication, context);
	}

	private Optional<String> reportIdOf(HttpServletRequest request) {

		String path = request.getRequestURI();
		if (path == null)
			return Optional.empty();

		String contextPath = request.getContextPath();
		if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath))
			path = path.substring(contextPath.length());

		Matcher data = REPORT_DATA.matcher(path);
		if (data.matches())
			return Optional.of(decode(data.group(1)));

		Matcher config = REPORT_CONFIG.matcher(path);
		if (config.matches())
			return Optional.of(decode(config.group(1)));

		Matcher dashboard = DASHBOARD.matcher(path);
		if (dashboard.matches())
			return Optional.of(decode(dashboard.group(1)));

		return Optional.empty();
	}

	private String decode(String value) {
		try {
			return java.net.URLDecoder.decode(value, java.nio.charset.StandardCharsets.UTF_8);
		} catch (Exception e) {
			return value;
		}
	}
}

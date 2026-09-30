package com.flowkraft.embed;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
 * <p>"That report" means one report and the dashboards its page embedded when the credential was
 * made, because a gallery page whose tiles are other dashboards would otherwise render with every
 * tile refused. The list is carried <em>by the credential</em> - signed into the token, stored with
 * the link - and {@link #admits} is the only place that reads it. So nothing a request says can widen
 * it, and editing a page afterwards cannot widen a credential somebody already holds.
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

	/**
	 * A live cube of a published dashboard: its field tree, the rows one selection asks for, the
	 * rows behind one number, the values a dimension may be filtered by, and — where the author
	 * turned it on — the SQL a selection would be answered by. All of them are ways of reading the
	 * same report, and all of them are scoped by that report's own {@code -cube-widgets.json}, so a
	 * token for a report opens the live cubes that report declares and nothing else.
	 */
	private static final List<String> CUBE_READS = List.of("meta", "query", "filter-options", "drill",
			"sql");

	private static final Pattern REPORT_CUBE = Pattern
			.compile("^/api/reports/([^/]+)/cube/[^/]+/(" + String.join("|", CUBE_READS) + ")/?$");

	/**
	 * The same five reads as request-matcher patterns, for the security chain that has to send them
	 * here. Both are built from one list on purpose: a read added to the pattern but left out of the
	 * chain answers 401 to the very viewer the author shared the dashboard with, and a read added to
	 * the chain but left out of the pattern falls through to being signed in, which is the same
	 * refusal by a different route. Neither is visible until somebody opens a share link.
	 */
	public static final String[] CUBE_PATHS = CUBE_READS.stream()
			.map(read -> "/api/reports/*/cube/*/" + read).toArray(String[]::new);

	private static final Pattern DASHBOARD = Pattern.compile("^/dashboard/([^/]+)/?$");

	/**
	 * A server-side pivot (DuckDB, ClickHouse) of a report is one more way of reading that report, only
	 * already aggregated. Its body cannot be read at this point, so the report it pivots rides in the
	 * query string, and the controller pivots exactly that report's configured source.
	 */
	private static final Pattern PIVOT = Pattern.compile("^/api/analytics/pivot/?$");

	private static final String PIVOT_REPORT_PARAM = "reportId";

	private final EmbedTokenService embedTokenService;
	private final ShareTokenService shareTokenService;
	private final LockedParamsValidator lockedParamsValidator;
	private final AuthorizationManager<RequestAuthorizationContext> delegate;

	public EmbedTokenAuthorizationManager(EmbedTokenService embedTokenService,
			ShareTokenService shareTokenService,
			AuthorizationManager<RequestAuthorizationContext> delegate) {
		this(embedTokenService, shareTokenService, null, delegate);
	}

	/**
	 * @param lockedParamsValidator asked which parameters an embedded dashboard declares, so a page's
	 *                              locks reach it by name; null keeps every lock for every report the
	 *                              credential opens, which is narrower and never wider
	 */
	public EmbedTokenAuthorizationManager(EmbedTokenService embedTokenService,
			ShareTokenService shareTokenService, LockedParamsValidator lockedParamsValidator,
			AuthorizationManager<RequestAuthorizationContext> delegate) {
		this.embedTokenService = embedTokenService;
		this.shareTokenService = shareTokenService;
		this.lockedParamsValidator = lockedParamsValidator;
		this.delegate = delegate;
	}

	/**
	 * The one rule about which report a credential opens: its own, or one the page it was made for
	 * embedded at that moment.
	 *
	 * <p>Every check in this class goes through here, and so does {@code DashboardController}, because
	 * two comparisons of a requested report id with a credential's would be two answers, and the wider
	 * one would decide. It reads nothing from disk and nothing from the request: the list comes from
	 * the signed token or the stored link, so a {@code reportId} added to a query string, or an
	 * {@code <rb-dashboard>} added to the page in a browser, admits nothing.
	 */
	public static boolean admits(String grantedReportId, List<String> embeddedReports, String requestedReportId) {

		if (grantedReportId == null || requestedReportId == null)
			return false;

		return grantedReportId.equals(requestedReportId)
				|| (embeddedReports != null && embeddedReports.contains(requestedReportId));
	}

	@Override
	public AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {

		HttpServletRequest request = context.getRequest();

		Optional<String> requestedReportId = reportIdOf(request);

		if (requestedReportId.isPresent()) {

			// An embedded component fetching data: the credential rides in a header.
			Optional<EmbedTokenService.Claims> claims = embedClaimsFor(request, requestedReportId.get());
			if (claims.isPresent()) {
				TokenRequest.mark(request, requestedReportId.get());
				attachLocks(request, claims.get().lockedParams(), claims.get().reportId(),
						requestedReportId.get());
				attachCaller(request, claims.get().attributes(), claims.get().timezone(), claims.get().locale());
				return new AuthorizationDecision(true);
			}

			// Someone opening a share link. A browser navigating to a URL cannot set a header, so the
			// credential has to be in the query string — the only place it can be for a link a person
			// pastes into an email.
			String shareToken = request.getParameter(SHARE_TOKEN_PARAM);
			if (shareToken != null && !shareToken.isBlank() && shareTokenService != null) {

				Optional<ShareTokenService.SharedReport> shared = shareTokenService.resolve(shareToken)
						.filter(report -> admits(report.reportId(), report.embeddedReports(),
								requestedReportId.get()));

				if (shared.isPresent()) {
					TokenRequest.mark(request, requestedReportId.get());
					attachLocks(request, shared.get().lockedParams(), shared.get().reportId(),
							requestedReportId.get());
					attachCaller(request, shared.get().attributes(), null, null);
					return new AuthorizationDecision(true);
				}
			}
		}

		// No token, a bad one, or one for a different report — fall back to being properly signed in.
		return delegate.check(authentication, context);
	}

	/**
	 * Hand the locks the credential carries to whoever serves the request.
	 *
	 * <p>This is the only place that holds both the credential and the report it was checked against,
	 * so it is the only place that can say what the request is allowed to read. A request that nothing
	 * here authorised never gets the attribute, and a controller that finds no attribute overrides
	 * nothing — which is the right answer for everyone who is simply signed in.
	 */
	private void attachLocks(HttpServletRequest request, Map<String, Object> lockedParams,
			String grantedReportId, String requestedReportId) {

		Map<String, Object> locks = locksFor(lockedParams, grantedReportId, requestedReportId);
		if (locks != null && !locks.isEmpty())
			request.setAttribute(LockedParams.REQUEST_ATTRIBUTE, locks);
	}

	/**
	 * The page's locks as they reach one of the dashboards it embeds: by name, keeping the ones that
	 * dashboard declares as filters and dropping the rest.
	 *
	 * <p>A page shared with {@code region} locked to EU shows EU in every embedded dashboard that has
	 * a {@code region} filter — the same value in the filter bar and in the data, because both read
	 * this. A dashboard with no {@code region} filter is told nothing about it, which is the honest
	 * answer: a lock on a filter it does not have could only be drawn as a control it does not have.
	 *
	 * <p>The credential's own report keeps every lock untouched, and so does an embedded report whose
	 * declared parameters cannot be read at all — dropping locks widens what a viewer sees, so the
	 * unknown case keeps them.
	 */
	private Map<String, Object> locksFor(Map<String, Object> lockedParams, String grantedReportId,
			String requestedReportId) {

		if (lockedParams == null || lockedParams.isEmpty() || requestedReportId.equals(grantedReportId)
				|| lockedParamsValidator == null)
			return lockedParams;

		Optional<Set<String>> declared = lockedParamsValidator.declaredParameterNamesOf(requestedReportId);
		if (declared.isEmpty())
			return lockedParams;

		Map<String, Object> narrowed = new LinkedHashMap<>();
		lockedParams.forEach((name, value) -> {
			if (declared.get().contains(name))
				narrowed.put(name, value);
		});
		return narrowed;
	}

	/**
	 * Hand over what the credential says about the viewer behind it: the attribute bag, and the zone
	 * and locale it asks for.
	 *
	 * <p>Here for exactly the reason the locks are here, and it is worth saying twice: this is the
	 * only place holding a verified credential, so it is the only place that may say a request
	 * carries an attribute. {@code ?dp_attr_customer_id=1} in a query string reaches nothing, because
	 * nothing downstream reads attributes from anywhere but this attribute.
	 */
	private void attachCaller(HttpServletRequest request, Map<String, String> attributes, String timezone,
			String locale) {

		if (attributes != null && !attributes.isEmpty())
			request.setAttribute(CallerAttributes.REQUEST_ATTRIBUTE, attributes);

		if (timezone != null && !timezone.isBlank())
			request.setAttribute(CallerAttributes.ZONE_REQUEST_ATTRIBUTE, timezone);

		if (locale != null && !locale.isBlank())
			request.setAttribute(CallerAttributes.LOCALE_REQUEST_ATTRIBUTE, locale);
	}

	/**
	 * Does the request carry an embed token for exactly the report it asks for?
	 *
	 * <p>Also what exempts such a request from CSRF: a header the page sets itself is not an ambient
	 * credential a hostile page could ride on, and a token for any other report earns nothing.
	 */
	public boolean carriesValidEmbedToken(HttpServletRequest request) {

		Optional<String> requestedReportId = reportIdOf(request);
		return requestedReportId.isPresent() && embedClaimsFor(request, requestedReportId.get()).isPresent();
	}

	/**
	 * @return the claims of a header token that is valid <em>for this report</em> — its own, or one its
	 *         page embeds ({@link #admits}) — locks included.
	 */
	private Optional<EmbedTokenService.Claims> embedClaimsFor(HttpServletRequest request, String reportId) {

		String embedToken = request.getHeader(EMBED_TOKEN_HEADER);
		if (embedToken == null || embedToken.isBlank())
			return Optional.empty();

		return embedTokenService.verify(embedToken)
				.filter(claims -> admits(claims.reportId(), claims.embeddedReports(), reportId));
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

		Matcher cube = REPORT_CUBE.matcher(path);
		if (cube.matches())
			return Optional.of(decode(cube.group(1)));

		Matcher dashboard = DASHBOARD.matcher(path);
		if (dashboard.matches())
			return Optional.of(decode(dashboard.group(1)));

		if (PIVOT.matcher(path).matches()) {
			String reportId = request.getParameter(PIVOT_REPORT_PARAM);
			if (reportId != null && !reportId.isBlank())
				return Optional.of(reportId);
		}

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

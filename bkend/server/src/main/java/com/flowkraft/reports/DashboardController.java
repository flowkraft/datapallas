package com.flowkraft.reports;

import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.embed.EmbedTokenAuthorizationManager;
import com.flowkraft.embed.EmbedTokenService;
import com.flowkraft.embed.ShareTokenService;
import com.flowkraft.iam.dashboards.DashboardAccess;
import com.flowkraft.iam.limits.ReportAccess;
import com.flowkraft.system.services.SystemService;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;

import jakarta.servlet.http.HttpServletRequest;
import reactor.core.publisher.Mono;

/**
 * Serves a published dashboard as a standalone page.
 *
 * <h2>Two ways in</h2>
 * <ul>
 *   <li><b>Signed in</b> — the page is same-origin with the API, so the session cookie carries
 *       through to the component's data fetch. Nothing extra is needed.</li>
 *   <li><b>A share link</b> — {@code /dashboard/{id}?token=…}. A browser typing a URL cannot set a
 *       header, which is why the durable credential has to live in the query string here rather than
 *       being an embed token like everywhere else.</li>
 * </ul>
 *
 * <h2>How the two token types meet</h2>
 * The share token is validated once, here, when the page is requested. The page then embeds a
 * short-lived {@link EmbedTokenService} token for the component. So the durable, revocable secret
 * stays in the URL and never reaches the data layer, and the component needs no special case — it
 * receives exactly the same {@code embed-token} it would get from any host application.
 *
 * <h2>What happens when the embed token expires</h2>
 * The embed token lives an hour; the share link does not expire with it. A dashboard still open
 * after that hour would otherwise watch its widgets fail one at a time with a 401 and no
 * explanation, which is the same half-rendered page this design exists to prevent. So a shared page
 * reloads itself shortly before its token expires: the reload carries the share token that is still
 * in the URL, and comes back with a freshly minted embed token. If the link was revoked or expired
 * in the meantime, the reload lands on the "no longer available" page instead — one clear ending
 * rather than a screen of broken tiles. The alternative, a refresh endpoint the page could call, was
 * not taken: it would be one more door open to an unauthenticated caller for something a reload
 * already does exactly once an hour. The cost is that a recipient's filter selections reset with the
 * reload, which is the honest price of a page that never shows stale-credential errors.
 *
 * <h2>The page wears the application's theme</h2>
 * A dashboard opened here is the same product as the application that published it, so it is the
 * same colours. The theme name is the one the application boots with - the server setting
 * {@code documentburster.settings.theme} - written onto {@code <html>} as {@code data-theme}, with
 * daisyUI's own palettes served next to the bundle as {@code /rb-webcomponents/themes.css}. Taking
 * it from the server rather than from the browser is what lets a share-link visitor, who has no
 * preference of ours stored anywhere, see the dashboard the way its author sees it.
 */
@RestController
public class DashboardController {

	@Autowired
	private ShareTokenService shareTokenService;

	@Autowired
	private EmbedTokenService embedTokenService;

	@Autowired
	private DashboardAccess dashboardAccess;

	@Autowired
	private ReportAccess reportAccess;

	@Autowired
	private SystemService systemService;

	/**
	 * The theme a dashboard wears when the application has stored none: the same value the
	 * application itself starts on, {@code DP_DEFAULT_THEME} in {@code theme-defaults.ts}.
	 */
	static final String DEFAULT_THEME = "dark";

	/** What a daisyUI theme name looks like, and the only thing allowed onto the page. */
	private static final Pattern THEME_NAME = Pattern.compile("[a-z][a-z0-9-]{0,31}");

	@GetMapping(value = "/dashboard/{reportCode}", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewDashboard(@PathVariable String reportCode,
			@RequestParam(required = false) String token, HttpServletRequest httpRequest) {

		String embedToken = "";

		// The signed-in way in: a dashboard viewer opens what their groups grant them and nothing else.
		// The share-link way in is checked below by the token itself, and the request the authorization
		// manager already opened with a token is not checked here at all.
		dashboardAccess.check(reportCode, httpRequest);
		// Layer 1 on the dashboard page itself; a dashboard granted to this caller's groups is the
		// deliberate carve-out and is admitted inside ReportAccess.
		reportAccess.assertReportReadable(reportCode, httpRequest);

		if (token != null && !token.isBlank()) {
			Optional<ShareTokenService.SharedReport> shared = shareTokenService.resolve(token);

			// A token for a different dashboard is as good as no token — one link opens the report it
			// was made for and the dashboards that report's page embedded then, and the one place that
			// decides it is EmbedTokenAuthorizationManager.admits.
			if (shared.isEmpty() || !EmbedTokenAuthorizationManager.admits(shared.get().reportId(),
					shared.get().embeddedReports(), reportCode))
				return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND)
						.header("Content-Type", "text/html")
						.body(notFoundHtml()));

			// The page's components read with an embed token, so a link that locks parameters, or says
			// who its recipient is, has to sign both into it. This is where the durable credential
			// hands over to the short-lived one, and everything the link carries has to survive the
			// handover or it stops at the door: the locks, the attributes the widgets filter with
			// (${dp_attr_...}), and the dashboards the page embeds.
			// Minted from the list stored with the link, never from a fresh read of the template: the
			// reload this page does before its token expires therefore keeps opening exactly what the
			// link opened when it was created.
			embedToken = embedTokenService.mint(reportCode, EmbedTokenService.DEFAULT_TTL_SECONDS,
					shared.get().lockedParams(), shared.get().attributes(), null, null,
					shared.get().embeddedReports());
		}

		// Two minutes' margin, so the page is replaced before anything it holds can be refused, and
		// never sooner than a minute after it loaded whatever the TTL is set to.
		long renewAfterSeconds = Math.max(60, EmbedTokenService.DEFAULT_TTL_SECONDS - 120);

		String html = "<!DOCTYPE html>\n"
				+ htmlOpenTag(pageTheme()) + "\n"
				+ "<head>\n"
				+ "  <meta charset=\"UTF-8\">\n"
				+ "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
				// Keep the share token out of anything the browser sends onward.
				+ "  <meta name=\"referrer\" content=\"no-referrer\">\n"
				+ "  <title>" + escapeHtml(reportCode) + "</title>\n"
				// The palettes the data-theme above names: daisyUI's own file, from the version the
				// application compiles its themes with, shipped beside the bundle. A page that cannot
				// fetch it falls back to the colours every stylesheet here carries next to its variables.
				+ "  <link rel=\"stylesheet\" href=\"/rb-webcomponents/themes.css\">\n"
				+ "  <script src=\"/rb-webcomponents/rb-webcomponents.umd.js\"></script>\n"
				+ "  <style>html, body { margin: 0; padding: 0; height: 100%;"
				+ " background: var(--color-base-200, #ffffff);"
				+ " color: var(--color-base-content, #1e293b); }</style>\n"
				+ "</head>\n"
				+ "<body>\n"
				+ "  <rb-dashboard\n"
				+ "    id=\"publishedDashboard\"\n"
				+ "    report-id=\"" + escapeHtml(reportCode) + "\"\n"
				+ (embedToken.isEmpty() ? "" : "    embed-token=\"" + escapeHtml(embedToken) + "\"\n")
				+ (embedToken.isEmpty() ? ""
						: "    data-embed-token-ttl=\"" + EmbedTokenService.DEFAULT_TTL_SECONDS + "\"\n")
				+ "    api-base-url=\"/api\">\n"
				+ "  </rb-dashboard>\n"
				// A signed-in visitor needs none of this: their cookie outlives the page. Only a page
				// that was opened with a share token holds a credential that dies before the reader
				// does, so only that page renews itself.
				+ (embedToken.isEmpty() ? ""
						: "  <script>\n"
								+ "    setTimeout(function () { window.location.reload(); }, "
								+ (renewAfterSeconds * 1000) + ");\n"
								+ "  </script>\n")
				+ "</body>\n"
				+ "</html>";

		return Mono.just(ResponseEntity.ok().header("Content-Type", "text/html").body(html));
	}

	/**
	 * The theme the application is on, or the same default it starts on when nothing is stored.
	 *
	 * <p>Unreadable settings are not a reason to refuse a dashboard, so a failure here is the default
	 * theme and a served page, not a stack trace on somebody's screen.
	 */
	private String pageTheme() {
		try {
			DocumentBursterSettingsInternal settings = systemService.loadInternalSettings();
			return themeName(settings != null && settings.settings != null ? settings.settings.theme : null);
		} catch (Exception themeUnreadable) {
			return DEFAULT_THEME;
		}
	}

	/**
	 * The page's opening tag, carrying the theme every colour on it is written against.
	 *
	 * <p>Static and small on purpose: what a reader wants to check about this page is that the theme
	 * the application stored is the theme the page asks for, and that nothing else arrives with it.
	 */
	static String htmlOpenTag(String theme) {
		return "<html lang=\"en\" data-theme=\"" + escapeHtml(themeName(theme)) + "\">";
	}

	/**
	 * A stored value, once it is a theme name and nothing else.
	 *
	 * <p>The shape is daisyUI's: a lower-case letter, then letters, digits and dashes. Anything else
	 * - an empty setting, a file edited by hand, a quote with an event handler after it - is not a
	 * theme, so the page wears the default rather than carrying it into its own markup. The escaping
	 * downstream is the second lock on the same door.
	 */
	static String themeName(String stored) {
		String trimmed = stored == null ? "" : stored.trim();
		return THEME_NAME.matcher(trimmed).matches() ? trimmed : DEFAULT_THEME;
	}

	/**
	 * Deliberately identical whether the link was revoked, has expired, or never existed — a page that
	 * distinguished them would confirm which dashboards exist to anyone guessing.
	 */
	private String notFoundHtml() {
		return "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\">"
				+ "<title>Not available</title></head><body>"
				+ "<p>This link is no longer available.</p></body></html>";
	}

	private static String escapeHtml(String input) {
		if (input == null)
			return "";
		return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&#39;");
	}
}

package com.flowkraft.reports;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.embed.EmbedTokenService;
import com.flowkraft.embed.ShareTokenService;
import com.flowkraft.iam.dashboards.DashboardAccess;
import com.flowkraft.iam.limits.ReportAccess;

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

			// A token for a different dashboard is as good as no token — one link opens one report.
			if (shared.isEmpty() || !shared.get().reportId().equals(reportCode))
				return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND)
						.header("Content-Type", "text/html")
						.body(notFoundHtml()));

			// The page's components read with an embed token, so a link that locks parameters has to
			// sign those locks into it. This is where the durable credential hands over to the
			// short-lived one, and the locks have to survive the handover or they stop at the door.
			embedToken = embedTokenService.mint(reportCode, EmbedTokenService.DEFAULT_TTL_SECONDS,
					shared.get().lockedParams());
		}

		// Two minutes' margin, so the page is replaced before anything it holds can be refused, and
		// never sooner than a minute after it loaded whatever the TTL is set to.
		long renewAfterSeconds = Math.max(60, EmbedTokenService.DEFAULT_TTL_SECONDS - 120);

		String html = "<!DOCTYPE html>\n"
				+ "<html lang=\"en\">\n"
				+ "<head>\n"
				+ "  <meta charset=\"UTF-8\">\n"
				+ "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
				// Keep the share token out of anything the browser sends onward.
				+ "  <meta name=\"referrer\" content=\"no-referrer\">\n"
				+ "  <title>" + escapeHtml(reportCode) + "</title>\n"
				+ "  <script src=\"/rb-webcomponents/rb-webcomponents.umd.js\"></script>\n"
				+ "  <style>html, body { margin: 0; padding: 0; height: 100%; }</style>\n"
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

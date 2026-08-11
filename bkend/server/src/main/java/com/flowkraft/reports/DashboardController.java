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
 */
@RestController
public class DashboardController {

	@Autowired
	private ShareTokenService shareTokenService;

	@Autowired
	private EmbedTokenService embedTokenService;

	@GetMapping(value = "/dashboard/{reportCode}", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewDashboard(@PathVariable String reportCode,
			@RequestParam(required = false) String token) {

		String embedToken = "";

		if (token != null && !token.isBlank()) {
			Optional<String> sharedReportId = shareTokenService.resolveReportId(token);

			// A token for a different dashboard is as good as no token — one link opens one report.
			if (sharedReportId.isEmpty() || !sharedReportId.get().equals(reportCode))
				return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND)
						.header("Content-Type", "text/html")
						.body(notFoundHtml()));

			embedToken = embedTokenService.mint(reportCode, EmbedTokenService.DEFAULT_TTL_SECONDS);
		}

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
				+ "    api-base-url=\"/api\">\n"
				+ "  </rb-dashboard>\n"
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

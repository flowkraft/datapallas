package com.flowkraft.reports;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;

@RestController
public class DashboardController {

	@GetMapping(value = "/dashboard/{reportCode}", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewDashboard(@PathVariable String reportCode) {
		String html = "<!DOCTYPE html>\n"
				+ "<html lang=\"en\">\n"
				+ "<head>\n"
				+ "  <meta charset=\"UTF-8\">\n"
				+ "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
				+ "  <title>" + escapeHtml(reportCode) + "</title>\n"
				+ "  <script src=\"/rb-webcomponents/rb-webcomponents.umd.js\"></script>\n"
				+ "  <style>html, body { margin: 0; padding: 0; height: 100%; }</style>\n"
				+ "</head>\n"
				+ "<body>\n"
				+ "  <rb-dashboard\n"
				+ "    report-id=\"" + escapeHtml(reportCode) + "\"\n"
				+ "    api-base-url=\"/api\">\n"
				+ "  </rb-dashboard>\n"
				+ "</body>\n"
				+ "</html>";

		return Mono.just(ResponseEntity.ok().header("Content-Type", "text/html").body(html));
	}

	private static String escapeHtml(String input) {
		if (input == null)
			return "";
		return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
				.replace("\"", "&quot;").replace("'", "&#39;");
	}
}

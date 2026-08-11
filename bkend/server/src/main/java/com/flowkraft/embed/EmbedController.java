package com.flowkraft.embed;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mints embed tokens for host applications.
 *
 * <p>Called <b>server to server</b>, never from a browser: the caller is the application that renders
 * the embedding page — the Grails or Next.js portal, a customer's own backend — authenticating with
 * its long-lived API key. It asks for a token while rendering a page, drops that token into the
 * {@code <rb-*>} markup, and the visitor's browser uses it. The visitor never signs in and never sees
 * a login.
 *
 * <p>Minting requires no more privilege than reading the report does: a token grants exactly the read
 * its holder could already perform, narrowed to one report and bounded in time.
 */
@RestController
@RequestMapping(value = "/api/embed", produces = MediaType.APPLICATION_JSON_VALUE)
public class EmbedController {

	@Autowired
	private EmbedTokenService embedTokenService;

	@Autowired
	private ShareTokenService shareTokenService;

	/**
	 * {@code POST /api/embed/token} with {@code {"reportId": "...", "ttlSeconds": 3600}}.
	 *
	 * @return {@code {"token": "...", "expiresInSeconds": 3600}}
	 */
	@PreAuthorize("hasRole('JOB_OPERATOR')")
	@PostMapping("/token")
	public ResponseEntity<?> mintToken(@RequestBody Map<String, Object> request) {

		String reportId = request.get("reportId") == null ? null : String.valueOf(request.get("reportId"));

		long ttlSeconds = EmbedTokenService.DEFAULT_TTL_SECONDS;
		Object requestedTtl = request.get("ttlSeconds");
		if (requestedTtl != null) {
			try {
				ttlSeconds = Long.parseLong(String.valueOf(requestedTtl));
			} catch (NumberFormatException ignored) {
				// A malformed ttl falls back to the default rather than failing the render.
			}
		}

		try {
			String token = embedTokenService.mint(reportId, ttlSeconds);
			return ResponseEntity.ok(Map.of("token", token, "expiresInSeconds", ttlSeconds));
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	// ============================================================
	// share links — a URL a person can send to someone with no account
	// ============================================================

	/**
	 * {@code POST /api/embed/share-link} with {@code {"reportId": "...", "expiresInDays": 30}}.
	 *
	 * <p>Creating one lets anybody holding the URL read that dashboard without signing in. That is the
	 * author's own decision: they built the dashboard, the Share dialog sits on the canvas they built it
	 * in, and an author who has to file a request to hand somebody a link cannot finish the job they
	 * were given. The returned URL is the only time the token is ever visible — only its hash is
	 * stored, so a lost link is reissued, never recovered, and any link can be revoked here.
	 *
	 * <p>Omit {@code expiresInDays} for a link that never expires on its own and can only be revoked.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping("/share-link")
	public ResponseEntity<?> createShareLink(@RequestBody Map<String, Object> request) {

		String reportId = request.get("reportId") == null ? null : String.valueOf(request.get("reportId"));

		Integer expiresInDays = null;
		if (request.get("expiresInDays") != null) {
			try {
				expiresInDays = Integer.parseInt(String.valueOf(request.get("expiresInDays")));
			} catch (NumberFormatException ignored) {
				// Unparseable means "no expiry", which is the documented default.
			}
		}

		try {
			String token = shareTokenService.createShareToken(reportId, expiresInDays);
			return ResponseEntity.ok(Map.of(
					"token", token,
					"url", "/dashboard/" + reportId + "?token=" + token));
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping("/share-link")
	public ResponseEntity<?> listShareLinks(@RequestParam String reportId) {
		return ResponseEntity.ok(shareTokenService.listShareLinks(reportId));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@DeleteMapping("/share-link/{id}")
	public ResponseEntity<Void> revokeShareLink(@PathVariable long id) {
		shareTokenService.revoke(id);
		return ResponseEntity.ok().build();
	}
}

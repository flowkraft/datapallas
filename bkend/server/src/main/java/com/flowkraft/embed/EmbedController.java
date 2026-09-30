package com.flowkraft.embed;

import java.util.ArrayList;
import java.util.List;
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

import com.flowkraft.iam.limits.ReportAccess;

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

	@Autowired
	private LockedParamsValidator lockedParamsValidator;

	/**
	 * Which dashboards the page embeds, read here - while the credential is made - and never while a
	 * request is served. That is what makes what a link or a token opens fixed for its life.
	 */
	@Autowired
	private EmbeddedReports embeddedReports;

	/**
	 * The two layers, asked of the person minting. The class comment above promises that minting takes
	 * no more privilege than reading the report does; without this it took none at all, and an operator
	 * could mint themselves a token for a report no screen would offer them and then read it through the
	 * token door, which is exempt by design. An API-key caller — which is what the portals this
	 * endpoint exists for authenticate as — is administrative and passes through untouched.
	 */
	@Autowired
	private ReportAccess reportAccess;

	/**
	 * {@code POST /api/embed/token} with {@code {"reportId": "...", "ttlSeconds": 3600}}, and
	 * optionally {@code "lockedParams": {"region": "EU"}} — the parameter values the host application
	 * forces on whoever it renders the page for. This is where a portal turns "the sales dashboard"
	 * into "this customer's sales dashboard", from its own signed-in user, on every render.
	 *
	 * @return {@code {"token": "...", "expiresInSeconds": 3600, "lockedParams": {...}}}
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

		if (reportId == null || reportId.isBlank())
			return ResponseEntity.badRequest().body(Map.of("error", "reportId is required"));

		reportAccess.assertReportRunnable(reportId);

		try {
			Map<String, Object> lockedParams = lockedParamsValidator.validate(reportId, request.get("lockedParams"));

			// Who the page is being rendered for: the attribute bag, and the zone and tag that viewer
			// reads in. Both are checked inside mint, where a bad name or a zone nobody can read is
			// answered to the host application's face rather than stored and ignored per request.
			Map<String, String> attributes = CallerAttributes.validated(request.get("attrs"));
			String timezone = text(request.get("tz"));
			String locale = text(request.get("locale"));

			// A gallery page is mostly other dashboards: the token opens the ones this caller could
			// mint a token for on their own, and says which it left out. A host application reading
			// the template again on its next mint therefore picks up a changed page by itself.
			List<String> omitted = new ArrayList<>();
			List<String> embedded = shareableEmbeddedReports(reportId, omitted);

			String token = embedTokenService.mint(reportId, ttlSeconds, lockedParams, attributes, timezone, locale,
					embedded);
			return ResponseEntity.ok(Map.of("token", token, "expiresInSeconds", ttlSeconds,
					"lockedParams", lockedParams, "attrs", attributes,
					"embeddedReports", embedded, "omittedEmbeddedReports", omitted));
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
	 *
	 * <p>Optional {@code lockedParams} — {@code {"region": "EU"}}, or a list of values for a
	 * multi-value parameter — restricts the link to those parameter values for its whole life. They
	 * cannot be edited afterwards, for the same reason the link itself cannot be shown again: change
	 * what a recipient may see by creating a new link and revoking this one.
	 *
	 * <p>Optional {@code attributes} — {@code {"customer_id": "4711"}} — says who the recipient is,
	 * for the widgets that filter with {@code ${dp_attr_customer_id}}. Unlike a lock it names no
	 * declared parameter and is never shown to the viewer; it is fixed for the link's life on the
	 * same terms.
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

		if (reportId == null || reportId.isBlank())
			return ResponseEntity.badRequest().body(Map.of("error", "reportId is required"));

		// An author hands out a link to a dashboard they may open themselves — the link cannot be a way
		// to give away what its author was never allowed to see.
		reportAccess.assertReportRunnable(reportId);

		try {
			Map<String, Object> lockedParams = lockedParamsValidator.validate(reportId, request.get("lockedParams"));

			// Validation first, then creation: a link that named a parameter the report does not have
			// would look restricted in the list and show every row, and nobody ever opens it again to
			// find out.
			Map<String, String> attributes = CallerAttributes.validated(request.get("attributes"));

			// What this link opens besides the page itself, decided once, now. Removing a dashboard
			// from the page later does not take it out of links already made: revoke the link and
			// create a new one - the list above shows which links exist.
			List<String> omitted = new ArrayList<>();
			List<String> embedded = shareableEmbeddedReports(reportId, omitted);

			String token = shareTokenService.createShareToken(reportId, expiresInDays, lockedParams, attributes,
					embedded);
			return ResponseEntity.ok(Map.of(
					"token", token,
					"url", "/dashboard/" + reportId + "?token=" + token,
					"lockedParams", lockedParams,
					"attributes", attributes,
					"embeddedReports", embedded,
					"omittedEmbeddedReports", omitted));
		} catch (IllegalArgumentException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
	}

	/**
	 * The dashboards the page embeds that this caller could share on their own.
	 *
	 * <p>Who may share what is decided per report here — {@code ReportAccess.assertReportRunnable}
	 * asks the caller's report grants and their connection limits about that one report — so a page
	 * embedding a dashboard its sharer may not open themselves must not become a way to hand it out.
	 * Such a dashboard is left out of the list and named in the answer, because a link that silently
	 * opens less than the page shows is a screen of refused tiles nobody can explain. A caller who is
	 * not limited at all keeps every embedded dashboard.
	 *
	 * @param omitted filled with what was left out, in the page's own order
	 */
	private List<String> shareableEmbeddedReports(String reportId, List<String> omitted) {

		List<String> shareable = new ArrayList<>();

		for (String embedded : embeddedReports.of(reportId)) {
			try {
				reportAccess.assertReportRunnable(embedded);
				shareable.add(embedded);
			} catch (RuntimeException refused) {
				// Refused for this caller, whatever the reason: not their report, a connection they do
				// not have, or a report that has stopped existing.
				omitted.add(embedded);
			}
		}

		return shareable;
	}

	/** A request body value as text, or null when it is absent or blank - which means "not said". */
	private static String text(Object value) {
		String text = value == null ? null : String.valueOf(value).trim();
		return text == null || text.isEmpty() ? null : text;
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

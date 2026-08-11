/*
    DocumentBurster is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    DocumentBurster is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with DocumentBurster.  If not, see <http://www.gnu.org/licenses/>
 */
package com.sourcekraft.documentburster.utils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import javax.ws.rs.client.Client;
import javax.ws.rs.client.ClientBuilder;
import javax.ws.rs.client.Entity;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sourcekraft.documentburster.common.settings.License;

/**
 * Licence client for the DataPallas licensing API at datapallas.com.
 *
 * <h2>The server decides, every time</h2>
 * Exactly as the old pdfburst.com store worked: the application asks, the server
 * answers, and that answer IS the licence status. Nothing is verified locally
 * and nothing is trusted between calls. The endpoints differ — three JSON POSTs
 * rather than one query string — because the new API is shaped differently, but
 * the model is the same one.
 *
 * <h2>curl first, JAX-RS second</h2>
 * The transport is unchanged from the old client, deliberately. curl is tried
 * first from the bundled copy under {@code tools/curl/win}, then from the PATH,
 * with the working path cached for the rest of the run; only if every candidate
 * fails does this fall back to the in-JVM JAX-RS client and remember that
 * decision. That order exists because the JVM's own TLS stack was the thing that
 * kept failing in the field, while a bundled curl kept working.
 *
 * <h2>Never get in the customer's way</h2>
 * The licence server is not a runtime dependency of somebody's report run. When
 * it cannot be reached the status becomes {@link License#STATUS_SERVER_DOWN} and
 * <b>the software carries on working</b>: the licence screen shows it as
 * invalid, because we genuinely could not confirm anything, but nothing throws,
 * nothing blocks, and a customer confirmed earlier keeps their entitlements —
 * see {@link License#itWasPaid()}.
 *
 * <p>
 * That last part is the one deliberate change from the old client, which caught
 * every exception and set the status to VALID. Being unable to reach the server
 * was reported as a good licence, so pulling the network cable licensed the
 * product.
 */
public class LicenseUtils {

	private Logger log = LoggerFactory.getLogger(LicenseUtils.class);

	private License license = new License();

	/** Overridable so tests and staging can point elsewhere. */
	private static final String BASE_URL = System.getProperty("license.server.url",
			System.getenv().getOrDefault("LICENSE_SERVER_URL", "https://datapallas.com/api/licenses"));

	/**
	 * Release announcements live beside the licence API rather than inside it, and
	 * are derived from the same setting so that pointing at staging moves both.
	 */
	private static final String PRODUCTS_URL = BASE_URL.replaceAll("/licenses/?$", "") + "/products";

	/** Remembers the curl that worked, or "JAXRS" once curl has been given up on. */
	private volatile String cachedCurlPath = null;

	// seconds timeout for curl; can be overridden with env
	// LICENSE_CURL_TIMEOUT_SECS
	private final int CURL_TIMEOUT_SECS = Integer
			.parseInt(System.getenv().getOrDefault("LICENSE_CURL_TIMEOUT_SECS", "90"));

	private final int CURL_ATTEMPTS = Integer.parseInt(System.getenv().getOrDefault("LICENSE_CURL_ATTEMPTS", "3"));

	/**
	 * What the licence reads after the activation has been released. Carried over
	 * from the old store, which returned it as a status of its own — the licence
	 * screen still tests for this exact word.
	 */
	private static final String STATUS_DEACTIVATED = "deactivated";

	private final ObjectMapper mapper = new ObjectMapper();

	public License getLicense() {
		return this.license;
	}

	public String getLicenseFilePath() {
		return this.license.getLicenseFilePath();
	}

	public void setLicenseFilePath(String licenseFilePath) {
		this.license.setLicenseFilePath(licenseFilePath);
	}

	// -----------------------------------------------------------------------
	// Public operations. Signatures unchanged, so CliJob, the local
	// /system/license/* endpoints and the Angular UI are all untouched.
	// -----------------------------------------------------------------------

	/**
	 * Bind this installation to the licence key and record what the server says
	 * about it.
	 */
	public void activateLicense() throws Exception {

		license.loadLicense();
		requireKey("activate");

		ObjectNode body = mapper.createObjectNode();
		body.put("key", license.getKey());
		body.put("instanceId", ensureInstanceId());
		body.put("hostname", hostname());
		body.put("appVersion", appVersion());
		body.put("osInfo", System.getProperty("os.name", "") + " " + System.getProperty("os.version", ""));

		try {
			JsonNode response = post("/activate", body);

			JsonNode details = response.path("license");
			if (!details.isMissingNode()) {
				license.setLicenseId(details.path("id").asText(license.getLicenseId()));
				license.setProduct(details.path("productKey").asText(license.getProduct()));
				license.setLicenseType(details.path("licenseType").asText(""));
				license.setSeats(details.path("seats").asText(""));
				license.setMaintenanceUntil(text(details, "maintenanceUntil"));
				license.setExpires(expiryOf(details));
			}

			// Over the activation limit is a WARNING, never a refusal — a customer
			// mid-migration must not be locked out of their own software.
			String warning = response.path("warning").asText("");
			if (StringUtils.isNotEmpty(warning))
				log.warn("Licence warning: {}", warning);

			// Activation binds the instance; the verdict itself always comes from the
			// same place a later check would get it, so there is one answer to explain
			// to a customer rather than two that can disagree.
			checkAgainstServer();
			fetchReleaseInfo();

		} catch (LicenseServerException e) {
			// The server answered and said no. That IS an answer, so record it.
			log.warn("Activation refused: {}", e.getMessage());
			license.setStatus("invalid");
			license.setLastVerdict("invalid");
			license.setCustomerName(StringUtils.EMPTY);
			license.setCustomerEmail(StringUtils.EMPTY);
		} catch (Exception e) {
			serverUnreachable("activate", e);
		} finally {
			license.saveLicense();
		}
	}

	/**
	 * Ask the server whether the key is currently good. Called before every run, so
	 * it must be quick to fail and must never throw.
	 */
	public void checkLicense() throws Exception {

		license.loadLicense();

		if (StringUtils.isEmpty(license.getKey())) {
			// No key at all is not a failure — it is the demo.
			license.setStatus(StringUtils.EMPTY);
			return;
		}

		try {
			checkAgainstServer();
			fetchReleaseInfo();
		} catch (LicenseServerException e) {
			log.warn("Licence check refused: {}", e.getMessage());
			license.setStatus("invalid");
			license.setLastVerdict("invalid");
		} catch (Exception e) {
			serverUnreachable("check", e);
		} finally {
			license.saveLicense();
		}
	}

	/**
	 * What the latest release is, and what changed in it — the What's New panel
	 * and the update-available badge.
	 *
	 * <p>
	 * Never allowed to fail a licence check. It is an announcement, and a customer
	 * whose run stops because we could not tell them about a new version would be
	 * entitled to be annoyed. Anything that goes wrong leaves the previously known
	 * values in place; the UI reads a blank version as "nothing to report".
	 */
	/**
	 * The latest release, for callers outside a licence check — the server's About screen and its
	 * update badge.
	 *
	 * <p>Exposed so those callers do not build an HTTP client of their own. The transport here is
	 * curl-first for a reason that applies just as much to this call as to a licence check: it is the
	 * JVM's own TLS stack that failed in the field, not the network, and a second client elsewhere in
	 * the product would quietly reintroduce exactly that failure. Deriving the URL from the same
	 * setting also means pointing an installation at staging still moves everything together.
	 */
	public JsonNode fetchLatestRelease() throws Exception {
		return get(PRODUCTS_URL + "/version?product=" + Utils.encodeURIComponent(Utils.getProductPermalink()));
	}

	private void fetchReleaseInfo() {
		try {
			JsonNode release = fetchLatestRelease();

			license.setLatestVersion(release.path("version").asText(StringUtils.EMPTY));
			license.setChangeLog(release.path("changelog").asText(StringUtils.EMPTY));

		} catch (Exception e) {
			log.debug("Could not read the latest release information: {}", e.getMessage());
		}
	}

	/**
	 * Release this installation's activation so the licence can be used on another
	 * machine.
	 *
	 * <p>
	 * The local record is cleared whether or not the server was told. A customer
	 * rebuilding a machine with no connectivity must still be able to move their
	 * licence, and refusing to forget it locally would stop them.
	 */
	public void deActivateLicense() throws Exception {

		license.loadLicense();

		try {
			// The key is sent as well as the id: an installation that was activated
			// before this field existed, or whose licence.xml was hand-copied from
			// another machine, has the key but no id — and would otherwise never
			// release its seat.
			if (StringUtils.isNotEmpty(license.getKey()) || StringUtils.isNotEmpty(license.getLicenseId())) {
				ObjectNode body = mapper.createObjectNode();
				if (StringUtils.isNotEmpty(license.getKey()))
					body.put("key", license.getKey());
				if (StringUtils.isNotEmpty(license.getLicenseId()))
					body.put("licenseId", license.getLicenseId());
				body.put("instanceId", ensureInstanceId());
				post("/deactivate", body);
			}
		} catch (Exception e) {
			log.warn("Could not tell the licence server about the deactivation, clearing locally anyway: {}",
					e.getMessage());
		} finally {
			license.setLicenseId(StringUtils.EMPTY);
			license.setLicenseType(StringUtils.EMPTY);
			license.setSeats(StringUtils.EMPTY);
			license.setMaintenanceUntil(StringUtils.EMPTY);
			license.setCustomerName(StringUtils.EMPTY);
			license.setCustomerEmail(StringUtils.EMPTY);
			license.setExpires(StringUtils.EMPTY);

			// Forgotten deliberately: this installation is no longer entitled to
			// anything, so a later outage must not resurrect the old verdict.
			license.setLastVerdict(StringUtils.EMPTY);

			// "deactivated", not blank. The licence screen tests for it by name to
			// decide between the Check and Activate buttons, and the key itself is
			// kept so the customer can re-activate without typing it again.
			license.setStatus(STATUS_DEACTIVATED);

			license.saveLicense();
		}
	}

	// -----------------------------------------------------------------------
	// The verdict
	// -----------------------------------------------------------------------

	/**
	 * The single place licence status is decided: whatever {@code /check} says.
	 *
	 * <p>
	 * {@code revoked} and {@code suspended} are folded into {@code invalid} — the
	 * licence screen has three states, and both mean the same thing to the person
	 * looking at it. {@code rate_limited} and {@code error} are not verdicts at all
	 * and are treated as "could not ask".
	 */
	private void checkAgainstServer() throws Exception {

		ObjectNode body = mapper.createObjectNode();
		body.put("key", license.getKey());

		JsonNode response = post("/check", body);

		String status = response.path("status").asText("invalid");

		if ("rate_limited".equalsIgnoreCase(status) || "error".equalsIgnoreCase(status))
			throw new IOException("The licence server could not answer right now (" + status + ")");

		license.setProduct(response.path("productKey").asText(license.getProduct()));
		license.setLicenseType(response.path("licenseType").asText(""));
		license.setSeats(response.path("seats").asText(""));
		license.setMaintenanceUntil(text(response, "maintenanceUntil"));
		license.setExpires(expiryOf(response));

		// Shown on the licence screen as "Active (Acme Ltd)".
		license.setCustomerName(response.path("customerName").asText(StringUtils.EMPTY));
		license.setCustomerEmail(response.path("customerEmail").asText(StringUtils.EMPTY));

		if ("valid".equalsIgnoreCase(status) || "expired".equalsIgnoreCase(status))
			license.setStatus(status.toLowerCase());
		else
			license.setStatus("invalid");

		// Remembered so a later outage has something to fall back on. Only ever
		// written when the server actually answered.
		license.setLastVerdict(license.getStatus());
	}

	/**
	 * We could not get an answer. Say so, and get out of the way.
	 *
	 * <p>
	 * Not "invalid": the key may be perfectly good and we simply could not ask. The
	 * licence screen renders this as invalid all the same, because an unconfirmed
	 * licence should not look active, but the distinct value is what tells support
	 * — and the log — that this was our problem and not the customer's.
	 */
	private void serverUnreachable(String action, Exception e) {
		log.warn("Could not reach the licence server for '{}' ({}: {}). The licence cannot be confirmed right now; "
				+ "DataPallas continues to run.", action, e.getClass().getSimpleName(), e.getMessage());
		license.setStatus(License.STATUS_SERVER_DOWN);
	}

	// -----------------------------------------------------------------------
	// Transport — curl first, JAX-RS as the fallback. Unchanged from the old
	// client apart from carrying a JSON body, which the new API requires.
	// -----------------------------------------------------------------------

	/**
	 * The single exit to the network, and the seam the tests replace to simulate a
	 * licence server that cannot be reached.
	 *
	 * @return the response body as a String (curl) or a {@link Response} (JAX-RS)
	 */
	protected Object makeRequest(Client client, String url, String action, String jsonBody) throws Exception {

		final String reqId = UUID.randomUUID().toString().substring(0, 8);

		// If we've previously decided to use JAX-RS, do it immediately
		if ("JAXRS".equals(cachedCurlPath)) {
			log.debug("[{}] using cached JAXRS fallback for url={}", reqId, url);
			return jaxrsPost(client, url, jsonBody);
		}

		// If we have a cached working curl path, try it first (with attempts)
		if (cachedCurlPath != null && !"JAXRS".equals(cachedCurlPath)) {
			for (int a = 1; a <= CURL_ATTEMPTS; a++) {
				String out = tryCurlAndReturnString(cachedCurlPath, url, jsonBody, reqId);
				if (out != null) {
					if (isValidResponse(out, action)) {
						log.debug("[{}] cached candidate {} produced valid response", reqId, cachedCurlPath);
						return out;
					}
					// Answered, just not with anything of ours. Retrying cannot change
					// what the server sends back — see the candidate loop below.
					log.debug("[{}] cached curl {} reached the server, which answered with something else", reqId,
							cachedCurlPath);
					break;
				}
				log.debug("[{}] cached curl {} attempt {}/{} failed", reqId, cachedCurlPath, a, CURL_ATTEMPTS);
				try {
					Thread.sleep(150);
				} catch (InterruptedException ie) {
					Thread.currentThread().interrupt();
					break;
				}
			}
			// cached path didn't produce a validated response -> clear and continue to try
			// other candidates
			cachedCurlPath = null;
			log.debug("[{}] cleared cachedCurlPath after failed attempts", reqId);
		}

		// Build ordered candidate list: bundled (preferred) -> system "curl.exe" ->
		// located via where/which
		List<String> candidates = new ArrayList<>();

		String portableEnv = System.getenv("PORTABLE_EXECUTABLE_DIR");
		if (portableEnv != null && !portableEnv.isEmpty()) {
			candidates.add(Paths.get(portableEnv).resolve("tools").resolve("curl").resolve("win").resolve("curl.exe")
					.toAbsolutePath().toString());
		}
		candidates.add(Paths.get(System.getProperty("user.dir")).resolve("tools").resolve("curl").resolve("win")
				.resolve("curl.exe").toAbsolutePath().toString());
		candidates.add(Paths.get("").toAbsolutePath().resolve("tools").resolve("curl").resolve("win")
				.resolve("curl.exe").toAbsolutePath().toString());
		candidates.add("curl.exe");
		String located = findCurlWithWhere();
		if (located != null && !located.isEmpty())
			candidates.add(located);

		LinkedHashSet<String> uniq = new LinkedHashSet<>(candidates);

		// Set when curl reached the server and the server answered with something
		// that is not a licensing response. Stops the walk: the remaining binaries
		// would ask the same server the same question and get the same answer.
		boolean serverAnsweredSomethingElse = false;

		for (String cand : uniq) {
			Path p = Paths.get(cand);
			boolean allowPathLookup = "curl.exe".equalsIgnoreCase(cand) || "curl".equalsIgnoreCase(cand);
			if (!allowPathLookup && (!p.toFile().exists() || !p.toFile().isFile())) {
				log.debug("[{}] curl candidate not present on disk, skipping: {}", reqId, cand);
				continue;
			}

			for (int a = 1; a <= CURL_ATTEMPTS; a++) {
				String out = tryCurlAndReturnString(cand, url, jsonBody, reqId);

				if (out != null) {
					if (isValidResponse(out, action)) {
						cachedCurlPath = cand;
						log.debug("[{}] candidate {} produced valid response and is cached", reqId, cand);
						return out;
					}
					// curl RAN and the server ANSWERED — the answer simply is not ours
					// (a 404 page, a proxy notice). Neither another attempt nor another
					// curl binary can change what the server chose to send, so stop
					// here instead of asking the same question nine times.
					//
					// This is the difference between "we could not ask" and "we asked
					// and got something else", and it is worth the extra branch: when
					// the products endpoint was missing, every single lookup spawned
					// nine curl processes to be told the same thing nine times.
					serverAnsweredSomethingElse = true;
					break;
				}
				log.debug("[{}] curl (candidate {}) failed attempt {}/{}", reqId, cand, a, CURL_ATTEMPTS);
				try {
					Thread.sleep(150);
				} catch (InterruptedException ie) {
					Thread.currentThread().interrupt();
					break;
				}
			}

			if (serverAnsweredSomethingElse) {
				logNotALicensingAnswer(action, reqId, url, cand);
				break;
			}

			// emit a single warn for this candidate exhaustion
			logCurlExhausted(action, reqId, url, cand);
		}

		// none of the curl candidates produced a validated response -> fallback to
		// JAX-RS and cache that decision
		cachedCurlPath = "JAXRS";
		log.debug("[{}] falling back to JAX-RS for url={}", reqId, url);
		return jaxrsPost(client, url, jsonBody);
	}

	/**
	 * curl reached the server and the server answered with something that is not a
	 * licensing response.
	 *
	 * <p>
	 * A licence answer that is not a licence answer is worth saying out loud. A
	 * release announcement that does not arrive is worth nothing to the person
	 * using the software — they did not ask for it, it changes nothing about their
	 * run, and a warning in their log only makes a working installation look
	 * broken. This is the same distinction {@link #isReleaseAnnouncement} already
	 * draws for the body of the response; it was simply never applied to the
	 * transport's own warnings, which is why a missing products endpoint filled the
	 * warnings panel with lines about licence payloads.
	 */
	private void logNotALicensingAnswer(String action, String reqId, String url, String cand) {
		if (isReleaseAnnouncement(action)) {
			log.debug("[{}] url={} answered, but not with a release announcement (via {})", reqId, url, cand);
			return;
		}
		log.warn("[{}] url={} answered, but not with a licensing response (via {}) — most likely a proxy or an "
				+ "error page rather than the API", reqId, url, cand);
	}

	/** curl could not get an answer at all: it failed to run, or the call failed. */
	private void logCurlExhausted(String action, String reqId, String url, String cand) {
		if (isReleaseAnnouncement(action)) {
			log.debug("[{}] url={} curl candidate {} exhausted after {} attempts (release announcement)", reqId, url,
					cand, CURL_ATTEMPTS);
			return;
		}
		log.warn("[{}] url={} curl candidate {} exhausted after {} attempts and did not return a valid "
				+ "license payload", reqId, url, cand, CURL_ATTEMPTS);
	}

	/** A null body means GET — the release lookup takes no payload. */
	private Response jaxrsPost(Client client, String url, String jsonBody) {
		if (jsonBody == null)
			return client.target(url).request(MediaType.APPLICATION_JSON_TYPE).get();

		return client.target(url).request(MediaType.APPLICATION_JSON_TYPE)
				.post(Entity.entity(jsonBody, MediaType.APPLICATION_JSON_TYPE));
	}

	/**
	 * A response only counts as an answer when it is JSON shaped like something the
	 * licensing API sends. Everything else — an HTML error page from a proxy, a
	 * captive portal, a truncated body — means try the next transport.
	 */
	private boolean isValidResponse(String responseStr, String action) {

		boolean announcement = isReleaseAnnouncement(action);

		if (responseStr == null)
			return false;
		String trimmed = responseStr.trim();
		if (!trimmed.startsWith("{")) {
			logInvalid(announcement, "not JSON", trimmed);
			return false;
		}
		try {
			JsonNode n = (new ObjectMapper()).readTree(trimmed);

			// The announcement endpoint answers with a version and a changelog — none of the keys a
			// licence answer carries. Judging it by the licence shape marked every good response
			// invalid, so the version was thrown away even when the server was working.
			boolean ok = announcement
					? n.has("version") || n.has("changelog")
					// /check answers with a status, /activate with a token and a license, and
					// either can answer with an error.
					: n.has("status") || n.has("token") || n.has("license") || n.has("error") || n.has("ok");

			if (!ok)
				logInvalid(announcement, "missing expected keys", trimmed);

			return ok;
		} catch (Exception e) {
			logInvalid(announcement, "parse error: " + e.getMessage(), trimmed);
			return false;
		}
	}

	/**
	 * A licence answer that is not one gets said out loud, with the body, because somebody will have to
	 * work out what a proxy did to it. A missing release announcement gets a single debug line and no
	 * body: it changes nothing the customer can act on, and an nginx error page in their Info log makes
	 * a working installation look broken.
	 */
	private void logInvalid(boolean announcement, String why, String body) {
		if (announcement) {
			log.debug("No release announcement available ({})", why);
			return;
		}
		String preview = body.length() > 1000 ? body.substring(0, 1000) + "..." : body;
		log.info("Invalid license response ({}). preview: {}", why, preview);
	}

	private String tryCurlAndReturnString(String curlPath, String url, String jsonBody, String reqId) {

		List<String> cmd = new ArrayList<>();
		cmd.add(curlPath);
		cmd.add("-sS");

		boolean useInsecure = Boolean.parseBoolean(System.getenv().getOrDefault("LICENSE_CURL_INSECURE", "false"));
		if (useInsecure)
			cmd.add("-k");

		cmd.add("-H");
		cmd.add("Accept: application/json");

		if (jsonBody == null) {
			// The release lookup is a plain GET, and follows redirects because a
			// host move is exactly the sort of thing that gets a 301.
			cmd.add("-L");
		} else {
			cmd.add("-X");
			cmd.add("POST");
			cmd.add("-H");
			cmd.add("Content-Type: application/json");
			cmd.add("-d");
			cmd.add(jsonBody);
		}

		cmd.add(url);

		log.debug("[{}] invoking curl: {}", reqId, cmd.stream().collect(Collectors.joining(" ")));

		ProcessBuilder pb = new ProcessBuilder(cmd);
		pb.redirectErrorStream(false); // keep streams separate but we will drain both
		Process p = null;

		ByteArrayOutputStream stdoutBaos = new ByteArrayOutputStream();
		ByteArrayOutputStream stderrBaos = new ByteArrayOutputStream();
		Thread stdoutReader = null;
		Thread stderrReader = null;

		try {
			p = pb.start();

			// start threads that continuously drain stdout/stderr into buffers
			final InputStream pis = p.getInputStream();
			final InputStream perr = p.getErrorStream();

			stdoutReader = new Thread(() -> {
				try (InputStream is = pis) {
					byte[] buf = new byte[4096];
					int r;
					while ((r = is.read(buf)) != -1) {
						stdoutBaos.write(buf, 0, r);
					}
				} catch (Throwable ignored) {
				}
			}, "curl-stdout-" + reqId);
			stderrReader = new Thread(() -> {
				try (InputStream is = perr) {
					byte[] buf = new byte[4096];
					int r;
					while ((r = is.read(buf)) != -1) {
						stderrBaos.write(buf, 0, r);
					}
				} catch (Throwable ignored) {
				}
			}, "curl-stderr-" + reqId);

			stdoutReader.setDaemon(true);
			stderrReader.setDaemon(true);
			stdoutReader.start();
			stderrReader.start();

			// wait for process with timeout
			boolean finished = p.waitFor(CURL_TIMEOUT_SECS, TimeUnit.SECONDS);
			if (!finished) {
				p.destroyForcibly();
				log.debug("[{}] curl timeout for: {}", reqId, curlPath);
				// give readers a moment to collect partial output
				try {
					stdoutReader.join(200);
					stderrReader.join(200);
				} catch (InterruptedException ie) {
					Thread.currentThread().interrupt();
				}
				return null;
			}

			// process exited — wait for readers to finish reading remaining bytes
			try {
				stdoutReader.join(1000);
				stderrReader.join(1000);
			} catch (InterruptedException ie) {
				Thread.currentThread().interrupt();
			}

			String out = stdoutBaos.toString(StandardCharsets.UTF_8.name());
			String stderrPreview = stderrBaos.toString(StandardCharsets.UTF_8.name());

			int exit = p.exitValue();
			if (exit == 0) {
				log.debug("[{}] curl succeeded (path={}) exit=0 stderrPreview={}", reqId, curlPath,
						stderrPreview.isEmpty() ? "none" : stderrPreview.replaceAll("\\r?\\n", " | "));
				return out;
			} else {
				log.debug("[{}] curl failed (path={}, exit={}) stderrPreview={}", reqId, curlPath, exit,
						stderrPreview.isEmpty() ? "none" : stderrPreview.replaceAll("\\r?\\n", " | "));
				return null;
			}
		} catch (Exception e) {
			log.debug("[{}] curl invocation failed for {}: {}", reqId, curlPath, e.getMessage());
			return null;
		} finally {
			if (p != null)
				p.destroyForcibly();
		}
	}

	private String findCurlWithWhere() {
		boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
		try {
			ProcessBuilder pb;
			if (isWindows) {
				pb = new ProcessBuilder("where.exe", "curl.exe");
			} else {
				pb = new ProcessBuilder("which", "curl");
			}
			pb.redirectErrorStream(true);
			Process p = pb.start();
			ByteArrayOutputStream baos = new ByteArrayOutputStream();
			try (InputStream is = p.getInputStream()) {
				byte[] buf = new byte[4096];
				int r;
				while ((r = is.read(buf)) != -1)
					baos.write(buf, 0, r);
			}
			int exit = p.waitFor();
			if (exit == 0) {
				String out = baos.toString(StandardCharsets.UTF_8.name()).trim();
				if (!out.isEmpty())
					return out.split("\\r?\\n")[0].trim();
			}
		} catch (Exception ignored) {
		}
		return null;
	}

	/**
	 * The JAX-RS fallback client.
	 *
	 * <p>
	 * The old version disabled certificate validation outright, with a comment
	 * saying to remove that once the pdfburst.com certificate was fixed. The host
	 * has changed, so the default trust store is used — and
	 * {@code LICENSE_CURL_INSECURE}, which already existed to relax the curl path,
	 * now relaxes this one too, so one switch still covers both transports if a
	 * certificate problem ever comes back.
	 */
	private Client _newClient() throws Exception {

		if (!Boolean.parseBoolean(System.getenv().getOrDefault("LICENSE_CURL_INSECURE", "false")))
			return ClientBuilder.newClient();

		log.warn("LICENSE_CURL_INSECURE is set — the licence exchange is NOT protected against interception. "
				+ "Use this only to work around a broken certificate, and only temporarily.");

		TrustManager[] trustManager = new X509TrustManager[] { new X509TrustManager() {

			@Override
			public X509Certificate[] getAcceptedIssuers() {
				return null;
			}

			@Override
			public void checkClientTrusted(X509Certificate[] certs, String authType) {
			}

			@Override
			public void checkServerTrusted(X509Certificate[] certs, String authType) {
			}
		} };

		SSLContext sslContext = SSLContext.getInstance("SSL");
		sslContext.init(null, trustManager, null);

		return ClientBuilder.newBuilder().sslContext(sslContext).hostnameVerifier((s1, s2) -> true).build();
	}

	// -----------------------------------------------------------------------
	// Plumbing
	// -----------------------------------------------------------------------

	/**
	 * One request, and one decision about what its answer means.
	 *
	 * <p>
	 * Only the licensing API may declare a licence bad. A 403 from a reverse proxy,
	 * an HTML error page and a 502 from a load balancer are not statements about
	 * the customer's key; reading them as "invalid" would put a red badge on a
	 * perfectly good licence every time something in between hiccuped. So a failure
	 * only counts as an answer when it came back as JSON from the API itself.
	 */
	private JsonNode post(String path, JsonNode body) throws Exception {
		return exchange(BASE_URL + path, path, mapper.writeValueAsString(body));
	}

	/** GET, for the endpoints that ask a question rather than change something. */
	private JsonNode get(String url) throws Exception {
		return exchange(url, "version", null);
	}

	/**
	 * Is this the announcement endpoint rather than the licence API?
	 *
	 * <p>The two answer different shapes and deserve different treatment. A licence answer that is not
	 * a licence answer is worth saying out loud; a release announcement that does not arrive is worth
	 * nothing to the person using the software, and printing a proxy's error page into their log only
	 * makes a working installation look broken.
	 */
	private static boolean isReleaseAnnouncement(String action) {
		return "version".equals(action);
	}

	private JsonNode exchange(String url, String action, String jsonBody) throws Exception {

		Client client = _newClient();

		try {
			Object responseObj = makeRequest(client, url, action, jsonBody);

			String responseStr;
			if (responseObj instanceof String) {
				responseStr = (String) responseObj;
			} else if (responseObj instanceof Response) {
				responseStr = ((Response) responseObj).readEntity(String.class);
			} else {
				throw new IOException("makeRequest returned unexpected type: "
						+ (responseObj == null ? "null" : responseObj.getClass()));
			}

			if (!isValidResponse(responseStr, action))
				throw new IOException("The licence server did not return a licensing answer — most likely a proxy "
						+ "or an error page rather than the API");

			JsonNode answer = mapper.readTree(responseStr);

			// Being told to slow down is not a verdict about the licence.
			if ("rate_limited".equals(answer.path("code").asText("")))
				throw new IOException("The licence server is rate limiting us");

			if (answer.has("error"))
				throw new LicenseServerException(answer.path("error").asText("refused"));

			return answer;

		} finally {
			try {
				client.close();
			} catch (Exception ignored) {
				// nothing useful to do if the client will not close
			}
		}
	}

	/** The right to run has no end date; the dated entitlement is support. */
	private String expiryOf(JsonNode node) {
		String validUntil = text(node, "validUntil");
		return StringUtils.isNotEmpty(validUntil) ? validUntil : text(node, "maintenanceUntil");
	}

	/** JSON null and a missing field both mean "not set", not the string "null". */
	private String text(JsonNode node, String field) {
		JsonNode value = node.path(field);
		return value.isMissingNode() || value.isNull() ? StringUtils.EMPTY : value.asText("");
	}

	/** Stable per-installation id, generated once. */
	private String ensureInstanceId() {
		if (StringUtils.isEmpty(license.getInstanceId())) {
			license.setInstanceId(UUID.randomUUID().toString());
		}
		return license.getInstanceId();
	}

	private void requireKey(String action) {
		if (StringUtils.isEmpty(license.getKey())) {
			throw new IllegalStateException("License key is not defined. Cannot perform action '" + action
					+ "'. Please enter a valid license key before performing this action.");
		}
	}

	private String hostname() {
		try {
			return java.net.InetAddress.getLocalHost().getHostName();
		} catch (Exception e) {
			return StringUtils.EMPTY;
		}
	}

	private String appVersion() {
		return System.getProperty("documentburster.version", StringUtils.EMPTY);
	}

	/** The server answered and declined — distinct from "could not reach it". */
	private static class LicenseServerException extends RuntimeException {
		private static final long serialVersionUID = 1L;

		LicenseServerException(String message) {
			super(message);
		}
	}

}

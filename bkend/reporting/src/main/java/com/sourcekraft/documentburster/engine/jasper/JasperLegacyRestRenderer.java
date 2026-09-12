package com.sourcekraft.documentburster.engine.jasper;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Renders classic JRXML (JasperReports 1.x - 6.21) through the JasperReports 6
 * container under tools/jasper-legacy.
 *
 * The container is addressed over HTTP rather than started per report: a
 * container start costs seconds, an HTTP call costs milliseconds, and wrapper
 * reports call the renderer once per row.
 *
 * Deliberately free of Spring and of DockerService, because this class also runs
 * under the CLI, which has no application context. Docker being down and the
 * service not being started both surface here as a failed health probe, and the
 * message tells the user which of the two it was.
 */
public class JasperLegacyRestRenderer implements JasperRenderer {

	private static final Logger log = LoggerFactory.getLogger(JasperLegacyRestRenderer.class);

	/** Overridable so a Server install can point at a renderer on another host. */
	public static final String PROPERTY_BASE_URL = "datapallas.jasper.legacy.url";
	public static final String ENV_BASE_URL = "JASPER_LEGACY_URL";
	private static final String DEFAULT_BASE_URL = "http://localhost:9095";

	/**
	 * The two folders the renderer mounts, and the paths it sees them at. Reports
	 * are the classic templates dropped into config/reports-jasper-legacy/;
	 * templates are the inline .jrxml files written in the Output tab of a normal
	 * report, which live under templates/reports/{report}/.
	 */
	private static final String HOST_REPORTS_DIR = "/config/reports-jasper-legacy/";
	private static final String CONTAINER_REPORTS_DIR = "/work/report";
	private static final String HOST_TEMPLATES_DIR = "/templates/";
	private static final String CONTAINER_TEMPLATES_DIR = "/work/templates";

	private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(3);
	private static final Duration RENDER_TIMEOUT = Duration.ofMinutes(10);

	private static final String MSG_NOT_REACHABLE = "The JasperReports Legacy renderer is not running."
			+ " Open the tools/jasper-legacy folder in your DataPallas installation and run"
			+ " startJasperLegacyServer.bat (startJasperLegacyServer.sh on Linux/macOS)."
			+ " It needs Docker: if Docker Desktop is not running, start it first.";

	/**
	 * Health is probed once and remembered. A renderer that answered a moment ago
	 * is not re-probed for every row of a thousand-row wrapper report; a render
	 * that fails on a dead connection clears the flag, so the next attempt probes
	 * again and the user gets the actionable message rather than a socket error.
	 */
	private static volatile boolean healthy = false;

	private final ObjectMapper mapper = new ObjectMapper();
	private final HttpClient http = HttpClient.newBuilder().connectTimeout(HEALTH_TIMEOUT).build();

	@Override
	public File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			String jdbcUrl, String jdbcUser, String jdbcPass, Map<String, String> params) throws Exception {
		return render(reportDir, jrxmlFileName, format, outputFile, null, params, jdbcUrl, jdbcUser, jdbcPass);
	}

	@Override
	public File generate(File reportDir, String jrxmlFileName, String format, File outputFile,
			List<LinkedHashMap<String, Object>> reportData, Map<String, String> params,
			String jdbcUrl, String jdbcUser, String jdbcPass) throws Exception {
		return render(reportDir, jrxmlFileName, format, outputFile, reportData, params, jdbcUrl, jdbcUser, jdbcPass);
	}

	private File render(File reportDir, String jrxmlFileName, String format, File outputFile,
			List<LinkedHashMap<String, Object>> reportData, Map<String, String> params,
			String jdbcUrl, String jdbcUser, String jdbcPass) throws Exception {

		ensureHealthy();

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("reportDir", toContainerReportDir(reportDir));
		request.put("jrxml", jrxmlFileName);
		request.put("format", format);
		if (params != null && !params.isEmpty()) {
			request.put("params", params);
		}
		if (reportData != null && !reportData.isEmpty()) {
			request.put("data", reportData);
		}
		if (jdbcUrl != null && !jdbcUrl.isEmpty()) {
			request.put("jdbcUrl", toContainerJdbcUrl(jdbcUrl));
			request.put("jdbcUser", jdbcUser);
			request.put("jdbcPass", jdbcPass != null ? jdbcPass : "");
		}

		log.info("Rendering {} through the JasperReports Legacy renderer ...", jrxmlFileName);

		HttpRequest post = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/reports/render"))
				.header("Content-Type", "application/json")
				.timeout(RENDER_TIMEOUT)
				.POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(request)))
				.build();

		HttpResponse<byte[]> response;
		try {
			response = http.send(post, HttpResponse.BodyHandlers.ofByteArray());
		} catch (Exception e) {
			// The renderer went away mid-run. Probe again next time rather than
			// failing every remaining row with a raw connection error.
			healthy = false;
			throw new IllegalStateException(MSG_NOT_REACHABLE, e);
		}

		if (response.statusCode() != 200) {
			throw new IllegalStateException(
					"JasperReports Legacy render failed: " + describeError(response.body()));
		}

		if (outputFile.getParentFile() != null) {
			outputFile.getParentFile().mkdirs();
		}
		Files.write(outputFile.toPath(), response.body());

		log.info("Output written to: {}", outputFile.getAbsolutePath());
		return outputFile;
	}

	// ------------------------------------------------------------------- health

	private void ensureHealthy() {
		if (healthy) {
			return;
		}
		synchronized (JasperLegacyRestRenderer.class) {
			if (healthy) {
				return;
			}
			HttpRequest probe = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/health"))
					.timeout(HEALTH_TIMEOUT)
					.GET()
					.build();
			try {
				HttpResponse<String> response = http.send(probe, HttpResponse.BodyHandlers.ofString());
				if (response.statusCode() != 200) {
					throw new IllegalStateException(MSG_NOT_REACHABLE);
				}
				log.info("JasperReports Legacy renderer available at {}", baseUrl());
				healthy = true;
			} catch (IllegalStateException e) {
				throw e;
			} catch (Exception e) {
				throw new IllegalStateException(MSG_NOT_REACHABLE, e);
			}
		}
	}

	/** Forces the next render to probe again — used after a configuration change. */
	public static void resetHealth() {
		healthy = false;
	}

	// -------------------------------------------------------------- translation

	/**
	 * Rewrites a path on this machine into the path the renderer sees, because the
	 * container has only the two mounted folders to work with. So
	 * config/reports-jasper-legacy/monthly-payslip becomes /work/report/monthly-payslip,
	 * and templates/reports/invoices becomes /work/templates/reports/invoices.
	 */
	private String toContainerReportDir(File reportDir) {
		String normalized = reportDir.getAbsolutePath().replace('\\', '/');

		int marker = normalized.indexOf(HOST_REPORTS_DIR);
		if (marker >= 0) {
			return CONTAINER_REPORTS_DIR + "/" + normalized.substring(marker + HOST_REPORTS_DIR.length());
		}

		marker = normalized.indexOf(HOST_TEMPLATES_DIR);
		if (marker >= 0) {
			return CONTAINER_TEMPLATES_DIR + "/" + normalized.substring(marker + HOST_TEMPLATES_DIR.length());
		}

		throw new IllegalArgumentException("The JasperReports Legacy renderer can only reach templates under"
				+ " config/reports-jasper-legacy/ or templates/, because those are the folders it mounts."
				+ " This one is at " + reportDir.getAbsolutePath());
	}

	/**
	 * Inside the container "localhost" is the container. Databases reached as
	 * localhost from DataPallas — including the ones DataPallas starts, which
	 * publish their port on the host — are reached as host.docker.internal.
	 */
	private String toContainerJdbcUrl(String jdbcUrl) {
		return jdbcUrl.replace("localhost", "host.docker.internal").replace("127.0.0.1",
				"host.docker.internal");
	}

	private String baseUrl() {
		String configured = System.getProperty(PROPERTY_BASE_URL);
		if (configured == null || configured.isBlank()) {
			configured = System.getenv(ENV_BASE_URL);
		}
		if (configured == null || configured.isBlank()) {
			return DEFAULT_BASE_URL;
		}
		return configured.endsWith("/") ? configured.substring(0, configured.length() - 1) : configured;
	}

	private String describeError(byte[] body) {
		if (body == null || body.length == 0) {
			return "no detail returned";
		}
		try {
			Map<?, ?> parsed = mapper.readValue(body, Map.class);
			Object message = parsed.get("message");
			if (message != null) {
				return String.valueOf(message);
			}
		} catch (Exception ignored) {
			// Not JSON — fall through and show whatever came back.
		}
		return new String(body).trim();
	}
}

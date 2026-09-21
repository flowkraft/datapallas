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
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sourcekraft.documentburster.common.db.ContainerAddresses;

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
	/** SQLite databases are files: the renderer reaches the installation's db/ folder here. */
	private static final String CONTAINER_DB_DIR = "/work/db";
	private static final String SQLITE_URL_PREFIX = "jdbc:sqlite:";

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
			request.put("jdbcUrl", toContainerJdbcUrl(jdbcUrl, reportDir));
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
	 *
	 * A SQLite connection is a file on this machine instead, typically the sample
	 * Northwind database under db/. The renderer mounts the installation's db/ folder
	 * at /work/db, so the path is translated like the report folder is; the
	 * installation folder is the one the report folder lives in.
	 */
	static String toContainerJdbcUrl(String jdbcUrl, File reportDir) {
		if (jdbcUrl.regionMatches(true, 0, SQLITE_URL_PREFIX, 0, SQLITE_URL_PREFIX.length())) {
			return toContainerSqliteUrl(jdbcUrl, reportDir);
		}
		return toRendererReachableUrl(jdbcUrl);
	}

	/**
	 * The renderer dials this URL from its own container, so a database saved as localhost has to be named
	 * the way a container can reach it: by container name on the shared 'datapallas' network when the
	 * database is one of ours, and through the host gateway when it is a service of the user's machine
	 * (plan §4 F2n). Ports are not touched when the address is not localhost.
	 */
	static String toRendererReachableUrl(String jdbcUrl) {
		return toRendererReachableUrl(jdbcUrl, ContainerAddresses::resolveForContainer);
	}

	/** The same, with the lookup handed in - Docker in production, a known answer in the tests. */
	static String toRendererReachableUrl(String jdbcUrl,
			BiFunction<String, String, String[]> resolver) {
		Matcher m = LOCALHOST_WITH_PORT.matcher(jdbcUrl);
		if (!m.find())
			return jdbcUrl.replace("localhost", ContainerAddresses.HOST_GATEWAY).replace("127.0.0.1",
					ContainerAddresses.HOST_GATEWAY);
		String[] reachable = resolver.apply(m.group(1), m.group(2));
		return jdbcUrl.replace(m.group(1) + ":" + m.group(2), reachable[0] + ":" + reachable[1]);
	}

	private static final Pattern LOCALHOST_WITH_PORT = Pattern.compile("(localhost|127\\.0\\.0\\.1):(\\d+)");

	private static String toContainerSqliteUrl(String jdbcUrl, File reportDir) {
		String location = jdbcUrl.substring(SQLITE_URL_PREFIX.length());
		String options = "";
		int query = location.indexOf('?');
		if (query >= 0) {
			options = location.substring(query);
			location = location.substring(0, query);
		}

		String installDir = installDirOf(reportDir);
		String dbFile = location.replace('\\', '/');
		boolean absolute = new File(location).isAbsolute() || dbFile.startsWith("/") || dbFile.matches("[A-Za-z]:/.*");
		if (installDir != null && !absolute) {
			dbFile = installDir + "/" + dbFile;   // relative to the installation, like DataPallas resolves it
		}
		String dbDir = installDir == null ? null : installDir + "/db/";
		if (dbDir == null || !dbFile.regionMatches(true, 0, dbDir, 0, dbDir.length())) {
			throw new IllegalArgumentException("The JasperReports Legacy renderer can only open SQLite databases"
					+ " inside the db/ folder of the DataPallas installation, because that is the folder it mounts."
					+ " This connection points at " + location);
		}
		return SQLITE_URL_PREFIX + CONTAINER_DB_DIR + "/" + dbFile.substring(dbDir.length()) + options;
	}

	/** The installation folder a report folder belongs to, or null when it is not in one of the mounted folders. */
	private static String installDirOf(File reportDir) {
		String normalized = reportDir.getAbsolutePath().replace('\\', '/');
		for (String marker : new String[] { HOST_REPORTS_DIR, HOST_TEMPLATES_DIR }) {
			int at = normalized.indexOf(marker);
			if (at >= 0) {
				return normalized.substring(0, at);
			}
		}
		return null;
	}

	private String baseUrl() {
		String configured = System.getProperty(PROPERTY_BASE_URL);
		if (configured == null || configured.isBlank()) {
			configured = System.getenv(ENV_BASE_URL);
		}
		if (configured == null || configured.isBlank()) {
			// In the Docker server the renderer is a sibling container: reached by name on the shared network,
			// so no port has to be published and no host firewall is in the way (plan §4 F2n). On the desktop
			// and on a host-JVM Server this stays http://localhost:9095.
			String[] reachable = ContainerAddresses.resolve("localhost", "9095");
			return "http://" + reachable[0] + ":" + reachable[1];
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

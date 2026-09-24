package com.flowkraft.reports;

import java.io.File;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Stream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.flowkraft.common.MimeTypeUtils;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Utils;
import com.flowkraft.embed.LockedParams;
import com.flowkraft.iam.dashboards.DashboardAccess;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.iam.limits.ReportAccess;
import static com.sourcekraft.documentburster.utils.Utils.resolvePathAgainstPortableDir;
import com.flowkraft.reporting.dtos.ReportFullConfigDto;
import com.flowkraft.reporting.dsl.chart.ChartOptionsParser;
import com.flowkraft.reporting.dsl.filterpane.FilterPaneOptionsParser;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptionsParser;
import com.flowkraft.reporting.services.ReportingService;
import com.flowkraft.exploredata.export.CanvasExportService;
import com.flowkraft.system.services.IOUtilsService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.ConfigurationFileInfo;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/api/reports")
public class ReportsController {

	private static final Logger log = LoggerFactory.getLogger(ReportsController.class);
	private static final String PASSWORD_MASK = "******";

	@Autowired
	ReportsService rbSettingsService;

	@Autowired
	ReportingService reportingService;

	@Autowired
	FileSystemService fileSystemService;

	@Autowired
	IOUtilsService ioUtilsService;

	@Autowired
	CanvasExportService canvasExportService;

	@Autowired
	LimitsService limitsService;

	/** Layer 1: a report whose connection this caller may not use is neither listed nor readable. */
	@Autowired
	ReportAccess reportAccess;

	@Autowired
	LimitsSandbox limitsSandbox;

	@Autowired
	DashboardAccess dashboardAccess;

	private final ObjectMapper objectMapper = new ObjectMapper();

	// ── Password masking helpers ──

	/**
	 * Replace all password/secret fields with PASSWORD_MASK before returning to
	 * the frontend.
	 */
	private void maskPasswords(DocumentBursterSettings dbSettings) {
		if (dbSettings == null || dbSettings.settings == null)
			return;

		if (dbSettings.settings.emailserver != null) {
			dbSettings.settings.emailserver.userpassword = maskIfSecret(dbSettings.settings.emailserver.userpassword);
		}
		if (dbSettings.settings.smssettings != null && dbSettings.settings.smssettings.twilio != null) {
			dbSettings.settings.smssettings.twilio.authtoken = maskIfSecret(dbSettings.settings.smssettings.twilio.authtoken);
			// accountsid is NOT a secret — displayed as normal text
		}
		if (dbSettings.settings.simplejavamail != null && dbSettings.settings.simplejavamail.proxy != null) {
			dbSettings.settings.simplejavamail.proxy.password = maskIfSecret(dbSettings.settings.simplejavamail.proxy.password);
		}
		if (dbSettings.settings.qualityassurance != null && dbSettings.settings.qualityassurance.emailserver != null) {
			dbSettings.settings.qualityassurance.emailserver.userpassword = maskIfSecret(dbSettings.settings.qualityassurance.emailserver.userpassword);
		}
	}

	/**
	 * Only mask values that look like actual secrets — not empty strings,
	 * not placeholder/help text (e.g., "From Email Password").
	 * Encrypted values (ENC(...)) and short non-placeholder values are masked.
	 */
	private String maskIfSecret(String value) {
		if (value == null || value.isEmpty()) {
			return value; // Empty = no secret, don't mask
		}
		if (value.startsWith("ENC(")) {
			return PASSWORD_MASK; // Encrypted = real secret, always mask
		}
		// Variable references like ${var3} are template placeholders, not secrets
		if (value.contains("${")) {
			return value;
		}
		// Placeholder text contains spaces or is long descriptive text — don't mask
		if (value.contains(" ") && value.length() > 10) {
			return value;
		}
		// Short values without spaces are likely real passwords — mask them
		return PASSWORD_MASK;
	}

	/**
	 * When the frontend sends PASSWORD_MASK for a password field, load the
	 * existing encrypted value from disk so we never overwrite with the literal
	 * mask string.
	 */
	private void preserveExistingPasswords(DocumentBursterSettings incoming, String fullPath) throws Exception {
		// Only load existing settings if the incoming data actually contains masked passwords
		boolean hasMaskedPasswords = false;

		if (incoming.settings != null) {
			if (incoming.settings.emailserver != null
					&& PASSWORD_MASK.equals(incoming.settings.emailserver.userpassword)) {
				hasMaskedPasswords = true;
			}
			if (incoming.settings.smssettings != null && incoming.settings.smssettings.twilio != null
					&& PASSWORD_MASK.equals(incoming.settings.smssettings.twilio.authtoken)) {
				hasMaskedPasswords = true;
			}
			if (incoming.settings.simplejavamail != null && incoming.settings.simplejavamail.proxy != null
					&& PASSWORD_MASK.equals(incoming.settings.simplejavamail.proxy.password)) {
				hasMaskedPasswords = true;
			}
			if (incoming.settings.qualityassurance != null && incoming.settings.qualityassurance.emailserver != null
					&& PASSWORD_MASK.equals(incoming.settings.qualityassurance.emailserver.userpassword)) {
				hasMaskedPasswords = true;
			}
		}

		if (!hasMaskedPasswords) {
			return;
		}

		DocumentBursterSettings existing = rbSettingsService.loadSettings(fullPath);
		if (existing == null || existing.settings == null) {
			return;
		}

		if (incoming.settings.emailserver != null
				&& PASSWORD_MASK.equals(incoming.settings.emailserver.userpassword)
				&& existing.settings.emailserver != null) {
			incoming.settings.emailserver.userpassword = existing.settings.emailserver.userpassword;
		}

		if (incoming.settings.smssettings != null && incoming.settings.smssettings.twilio != null) {
			if (PASSWORD_MASK.equals(incoming.settings.smssettings.twilio.authtoken)
					&& existing.settings.smssettings != null
					&& existing.settings.smssettings.twilio != null) {
				incoming.settings.smssettings.twilio.authtoken = existing.settings.smssettings.twilio.authtoken;
			}
			// accountsid is NOT a secret — no preservation needed
		}

		if (incoming.settings.simplejavamail != null && incoming.settings.simplejavamail.proxy != null
				&& PASSWORD_MASK.equals(incoming.settings.simplejavamail.proxy.password)
				&& existing.settings.simplejavamail != null
				&& existing.settings.simplejavamail.proxy != null) {
			incoming.settings.simplejavamail.proxy.password = existing.settings.simplejavamail.proxy.password;
		}

		if (incoming.settings.qualityassurance != null && incoming.settings.qualityassurance.emailserver != null
				&& PASSWORD_MASK.equals(incoming.settings.qualityassurance.emailserver.userpassword)
				&& existing.settings.qualityassurance != null
				&& existing.settings.qualityassurance.emailserver != null) {
			incoming.settings.qualityassurance.emailserver.userpassword = existing.settings.qualityassurance.emailserver.userpassword;
		}
	}

	// Connection password masking moved to ConnectionsController

	// ── V4: Collection list (replaces /load-all, /load-all-minimal, /load-templates-all) ──

	/**
	 * {@code JOB_OPERATOR} — the list is how Processing offers a report to run, so an operator needs it.
	 * Reading a report's <em>contents</em> (templates, scripts, datasource) is {@code REPORT_AUTHOR}
	 * below: those are the files that can hold a query, a path or a credential.
	 */
	@PreAuthorize("hasRole('JOB_OPERATOR')")
	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Flux<ConfigurationFileInfo> listReports(
			@RequestParam(required = false) Boolean withDetails,
			@RequestParam(required = false) String type) throws Exception {
		if ("templates".equals(type)) {
			return Flux.fromStream(rbSettingsService.loadRbTemplatesAll());
		}
		if (Boolean.TRUE.equals(withDetails)) {
			return Flux.fromStream(visibleToCaller(rbSettingsService.loadSettingsAll()));
		}
		return Flux.fromStream(visibleToCaller(rbSettingsService.loadSettingsAllMinimal()));
	}

	/**
	 * Offering a report that would be refused the moment it is submitted is a worse answer than not
	 * offering it, so the list asks the same question dispatch asks.
	 *
	 * <p>The connection codes come out of the scan that has already read every report — the filter
	 * costs no second pass over {@code config/reports} — and for an unlimited caller, which is every
	 * administrator and everybody in no limiting group, it costs one null check per report.
	 */
	private Stream<ConfigurationFileInfo> visibleToCaller(Stream<ConfigurationFileInfo> reports) {

		// Both questions are asked once here, not once per report: layer 2 is a single query for the
		// ids the caller's groups name, and layer 1 a single read of their limits.
		Set<String> grantedIds = reportAccess.reportIdsAllowedByGrants();
		boolean limited = reportAccess.isLimited();

		if (grantedIds == null && !limited)
			return reports;

		return reports.filter(report -> visibleToCaller(report, grantedIds, limited));
	}

	/**
	 * @param grantedIds the ids layer 2 restricts this caller to, or null when it restricts them to
	 *                   nothing at all — which is every report, the default decision 7 settled
	 */
	private boolean visibleToCaller(ConfigurationFileInfo report, Set<String> grantedIds, boolean limited) {

		if (reportAccess.isGrantedDashboard(report.folderName))
			return true;

		if (grantedIds != null && !grantedIds.contains(report.folderName))
			return false;

		if (!limited)
			return true;

		return reportAccess.allowsDeclaredConnections(
				Stream.of(report.dbConnCode, report.dbConnectionCode).filter(StringUtils::isNotBlank).toList());
	}

	// ── V4: Single report detail by ID (replaces /load-config-details?path=...) ──

	/**
	 * The same question the list asks, asked of one report.
	 *
	 * <p>This is where a report id is <em>typed</em> rather than picked: the screens reach it with an
	 * id they read out of the filtered list, but nothing stops a caller asking for an id that list
	 * never offered. A filtered list is a courtesy; this is the rule.
	 */
	@PreAuthorize("hasRole('JOB_OPERATOR')")
	@GetMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
	public Mono<ConfigurationFileInfo> getReportDetails(@PathVariable String id) throws Exception {
		reportAccess.assertReportRunnable(id);
		String path = resolveSettingsPath(id);
		ConfigurationFileInfo details = rbSettingsService.loadConfigDetails(path);
		// System.out.println("[RB-DIAG] getReportDetails id=" + id + " path=" + path
		// 		+ " details=" + (details != null ? "OK" : "null")
		// 		+ " reportParameters=" + (details != null && details.reportParameters != null
		// 				? details.reportParameters.size() : "null"));
		return details != null ? Mono.just(details) : Mono.empty();
	}

	// ── V4.1: Report config for web component (moved from ReportingController) ──

	@Operation(summary = "Full wired config (resolved paths + merged defaults) — runtime-assembled; never stored as-is on disk")
	@GetMapping(value = "/{reportId}/config", consumes = MediaType.ALL_VALUE)
	public Mono<ReportFullConfigDto> getReportConfig(@PathVariable String reportId,
			HttpServletRequest httpRequest) throws Exception {

		// Reading a report's config is half of opening it, so a dashboard viewer may only ask for a
		// report their groups grant. A token request carries its own, narrower permission and is left
		// alone; every other role passes through unchanged.
		dashboardAccess.check(reportId, httpRequest);
		// Reading a report's config is the other half of opening it, and layer 1 applies to a
		// signed-in caller here exactly as it does at dispatch. A granted dashboard is the carve-out
		// and passes through ReportAccess untouched.
		reportAccess.assertReportReadable(reportId, httpRequest);

		ReportFullConfigDto config = reportingService.loadReportConfig(reportId);

		Map<String, Object> lockedParams = LockedParams.of(httpRequest);
		if (!lockedParams.isEmpty())
			config.lockedParameters = lockedParams;

		return Mono.just(config);
	}

	// ── V4.1: Report data (moved from ReportingController) ──

	@GetMapping(value = "/{reportId}/data", consumes = MediaType.ALL_VALUE)
	public Mono<ReportDataResult> fetchReportData(
			@PathVariable String reportId,
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false, defaultValue = "false") Boolean testMode,
			@RequestParam(required = false) String componentId,
			@RequestParam Map<String, String> parameters,
			HttpServletRequest httpRequest) throws Exception {

		dashboardAccess.check(reportId, httpRequest);
		// The data door. Reading C's rows here is the same act as running the report that reads C.
		reportAccess.assertReportReadable(reportId, httpRequest);

		parameters.remove("page");
		parameters.remove("size");
		parameters.remove("testMode");

		// A share link or embed token that locks parameters wins over whatever the viewer put in the
		// query string — the value is read from the signed token, not from the request, so editing the
		// URL changes nothing. testMode goes with it: it serves sample rows from a different path, and
		// a locked view must not have a second, unlocked way to produce data.
		Map<String, Object> lockedParams = LockedParams.of(httpRequest);
		if (!lockedParams.isEmpty()) {
			lockedParams.forEach((name, value) -> parameters.put(name, LockedParams.asQueryValue(value)));
			testMode = Boolean.FALSE;
		}

		String sort = extractBracketParams(parameters, "sort");
		String filter = extractBracketParams(parameters, "filter");
		ReportDataResult result = reportingService.fetchReportData(reportId, parameters, testMode);
		result = reportingService.applyServerSideOperations(result, page, size, sort, filter);
		return Mono.just(result);
	}

	private String extractBracketParams(Map<String, String> params, String prefix) throws Exception {
		TreeMap<Integer, Map<String, String>> indexed = new TreeMap<>();
		String pat = prefix + "[";
		Iterator<Map.Entry<String, String>> it = params.entrySet().iterator();
		while (it.hasNext()) {
			Map.Entry<String, String> e = it.next();
			if (e.getKey().startsWith(pat)) {
				String rest = e.getKey().substring(pat.length());
				int cb = rest.indexOf(']');
				int idx = Integer.parseInt(rest.substring(0, cb));
				String key = rest.substring(cb + 2, rest.length() - 1);
				indexed.computeIfAbsent(idx, k -> new LinkedHashMap<>()).put(key, e.getValue());
				it.remove();
			}
		}
		if (indexed.isEmpty()) return null;
		return objectMapper.writeValueAsString(new ArrayList<>(indexed.values()));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/serve-asset", produces = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<?>> serveAsset(@RequestParam String path) throws Exception {
		// System.out.println("========== SERVE ASSET ENDPOINT CALLED ==========");
		// System.out.println("Path requested: " + path);

		String fullPath = resolvePathAgainstPortableDir(
				URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		// System.out.println("Full path: " + fullPath);

		// Determine content type based on file extension
		String contentType = MimeTypeUtils.determineContentType(fullPath);

		// Return 404 gracefully for missing assets — avoids a 500 stack trace in
		// errors.log when a report template references fonts/images that haven't been
		// copied yet (e.g. gallery assets used in a report template directory).
		if (!new File(fullPath).exists()) {
			return Mono.just(ResponseEntity.notFound().<Object>build());
		}

		// For images and binary files
		if (!contentType.startsWith("text/")) {
			return Mono.fromCallable(() -> {
				byte[] fileData = ioUtilsService.readBinaryFile(fullPath);
				return ResponseEntity.ok().header("Content-Type", contentType) // Set content type explicitly
						.header("Accept", "*/*") // Accept any content type
						.body(fileData);
			});
		}
		// For text files (CSS, JS, etc.)
		else {
			return Mono.fromCallable(() -> {
				String fileContent = fileSystemService.unixCliCat(fullPath);
				return ResponseEntity.ok().header("Content-Type", contentType) // Set content type explicitly
						.header("Accept", "*/*") // Accept any content type
						.body(fileContent);
			});
		}
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/preview-template", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewTemplate(@RequestParam String path) throws Exception {
		String fullPath = resolvePathAgainstPortableDir(
				URLDecoder.decode(path, StandardCharsets.UTF_8.toString()));

		boolean isXml = path.toLowerCase().endsWith(".xml");

		return Mono.fromCallable(() -> {
			// Read the HTML content
			String htmlContent = StringUtils.EMPTY;

			if (isXml) {
				// Parse XML using Settings and get EmailSettings.html
				Settings settings = new Settings(fullPath);

				settings.loadSettings();
				htmlContent = settings.getEmailSettings().html;
				if (htmlContent == null) {
					htmlContent = "<!-- No HTML email content found in XML -->";
				}
			} else {
				// Read the HTML content as before
				htmlContent = fileSystemService.unixCliCat(fullPath);
			}

			// Get the base directory from the path
			String baseDir = path.substring(0, path.lastIndexOf('/') + 1);

			// Process the HTML to fix relative URLs
			Document doc = Jsoup.parse(htmlContent);

			// Fix image sources
			Elements images = doc.select("img[src]");
			for (Element img : images) {
				String src = img.attr("src");
				if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("/api/")) {
					// Remove ./ if present
					src = src.replaceFirst("^\\./", "");
					img.attr("src", "/api/reports/serve-asset?path=" + Utils.encodeURIComponent(baseDir + src));
				}
			}

			// Fix CSS links
			Elements links = doc.select("link[href]");
			for (Element link : links) {
				String href = link.attr("href");
				if (!href.startsWith("http") && !href.startsWith("data:") && !href.startsWith("/api/")) {
					// Remove ./ if present
					href = href.replaceFirst("^\\./", "");
					link.attr("href", "/api/reports/serve-asset?path=" + Utils.encodeURIComponent(baseDir + href));
				}
			}

			// Fix background images and font URLs in style elements
			Elements styles = doc.select("style");
			for (Element style : styles) {
				String css = style.html();

				// Fix background-image URLs
				Pattern bgPattern = Pattern
						.compile("background-image:\\s*url\\(['\"]((?!http|data:|/api)[^'\"]*)['\"]*\\)");
				Matcher bgMatcher = bgPattern.matcher(css);
				StringBuffer bgSb = new StringBuffer();
				while (bgMatcher.find()) {
					String path1 = bgMatcher.group(1).replaceFirst("^\\./", "");
					bgMatcher.appendReplacement(bgSb,
							"background-image: url('/api/reports/serve-asset?path=" + baseDir + path1 + "')");
				}
				bgMatcher.appendTail(bgSb);
				css = bgSb.toString();

				// Fix @font-face src URLs
				Pattern fontPattern = Pattern.compile("src:\\s*url\\(['\"]((?!http|data:|/api)[^'\"]*)['\"]*\\)");
				Matcher fontMatcher = fontPattern.matcher(css);
				StringBuffer fontSb = new StringBuffer();
				while (fontMatcher.find()) {
					String path1 = fontMatcher.group(1).replaceFirst("^\\./", "");
					fontMatcher.appendReplacement(fontSb,
							"src: url('/api/reports/serve-asset?path=" + baseDir + path1 + "')");
				}
				fontMatcher.appendTail(fontSb);
				css = fontSb.toString();

				style.html(css);
			}

			// Fix background images in style attributes
			Elements elementsWithStyle = doc.select("[style*=background-image]");
			for (Element el : elementsWithStyle) {
				String style = el.attr("style");
				Pattern pattern = Pattern
						.compile("background-image:\\s*url\\(['\"]((?!http|data:|/api)[^'\"]*)['\"]*\\)");
				Matcher matcher = pattern.matcher(style);
				StringBuffer sb = new StringBuffer();
				while (matcher.find()) {
					String path1 = matcher.group(1).replaceFirst("^\\./", "");
					matcher.appendReplacement(sb,
							"background-image: url('/api/reports/serve-asset?path=" + baseDir + path1 + "')");
				}
				matcher.appendTail(sb);
				el.attr("style", sb.toString());
			}

			// Inject web components bundle if dashboard components are present
			String rawHtml = doc.outerHtml();
			if (rawHtml.contains("<rb-tabulator") || rawHtml.contains("<rb-chart")
					|| rawHtml.contains("<rb-pivot-table") || rawHtml.contains("<rb-parameters")) {
				doc.body().appendElement("script")
						.attr("src", "/rb-webcomponents/rb-webcomponents.umd.js");
			}

			// Convert back to HTML string
			String processedHtml = doc.outerHtml();

			return ResponseEntity.ok().header("Content-Type", "text/html").body(processedHtml);
		});
	}


	// ── Phase 2: High-level atomic configuration endpoints ──

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<ConfigurationFileInfo>> createConfiguration(@RequestBody Map<String, Object> request)
			throws Exception {

		String reportId = (String) request.get("reportId");
		String templateName = (String) request.get("templateName");
		boolean capReportDistribution = Boolean.TRUE.equals(request.get("capReportDistribution"));
		boolean capReportGenerationMailMerge = Boolean.TRUE.equals(request.get("capReportGenerationMailMerge"));
		String copyFromReportId = (String) request.get("copyFromReportId");

		ConfigurationFileInfo result = rbSettingsService.createConfiguration(reportId, templateName,
				capReportDistribution, capReportGenerationMailMerge, copyFromReportId);

		return Mono.just(ResponseEntity.status(HttpStatus.CREATED).body(result));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping(value = "/{reportId}/duplicate", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<ConfigurationFileInfo>> duplicateConfiguration(@PathVariable String reportId,
			@RequestBody Map<String, Object> request) throws Exception {

		String targetReportId = (String) request.get("targetReportId");
		String newTemplateName = (String) request.get("templateName");
		boolean capReportDistribution = Boolean.TRUE.equals(request.get("capReportDistribution"));
		boolean capReportGenerationMailMerge = Boolean.TRUE.equals(request.get("capReportGenerationMailMerge"));

		ConfigurationFileInfo result = rbSettingsService.duplicateConfiguration(reportId, targetReportId,
				newTemplateName, capReportDistribution, capReportGenerationMailMerge);

		return Mono.just(ResponseEntity.status(HttpStatus.CREATED).body(result));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PostMapping(value = "/{reportId}/restore-defaults", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> restoreDefaults(@PathVariable String reportId) throws Exception {
		rbSettingsService.restoreDefaults(reportId);
		return Mono.just(ResponseEntity.ok().build());
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@DeleteMapping(value = "/{reportId}")
	public Mono<ResponseEntity<Void>> deleteConfiguration(@PathVariable String reportId) throws Exception {
		rbSettingsService.deleteConfiguration(reportId);
		return Mono.just(ResponseEntity.ok().build());
	}

	// ── Phase 3: ID-based REST endpoints ──

	@Operation(summary = "Raw settings XML as stored on disk — the source of truth before path resolution or defaults are applied")
	@PreAuthorize("hasRole('JOB_OPERATOR')")
	@GetMapping(value = "/{reportId}/settings", consumes = MediaType.ALL_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<DocumentBursterSettings> loadReportSettings(@PathVariable String reportId) throws Exception {
		// The list already hides a report whose connection the caller may not use; this endpoint takes
		// the id straight from the caller and answers with the settings, connection code included, so
		// it asks the same question the list asked before it answers.
		//
		// `_defaults` is the exception because it is not a report: it is the product's own defaults
		// file, which every screen loads before any report is chosen, and which no report list ever
		// offered. Asking a report question about it would refuse it to everybody who is limited.
		if (!"_defaults".equals(reportId))
			reportAccess.assertReportRunnable(reportId);
		String fullPath = resolveSettingsPath(reportId);
		// System.out.println("[RB-DIAG] loadReportSettings reportId=" + reportId + " fullPath=" + fullPath);
		DocumentBursterSettings dbSettings = rbSettingsService.loadSettings(fullPath);
		// System.out.println("[RB-DIAG] loadReportSettings settings=" + (dbSettings.settings != null ? "OK version=" + dbSettings.settings.version : "NULL"));
		preserveExistingPasswords(dbSettings, fullPath);
		rbSettingsService.saveSettings(dbSettings, fullPath);
		maskPasswords(dbSettings);
		return Mono.just(dbSettings);
	}

	/**
	 * Load any settings.xml-shaped file by its path under PORTABLE_EXECUTABLE_DIR.
	 *
	 * Distinct from loadReportSettings(reportId), which always resolves to
	 * {reportId}/settings.xml. This endpoint is used by the configuration-load
	 * workflow (Configuration → reports list → Load) when the file under
	 * load is NOT the default settings.xml — e.g. migrated configs named
	 * {something}/15-settings-6.2-custom.xml.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/load-by-path", consumes = MediaType.ALL_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<DocumentBursterSettings> loadSettingsByPath(@RequestParam String path) throws Exception {
		String fullPath = resolvePathAgainstPortableDir(path);
		// System.out.println("[RB-DIAG] loadSettingsByPath path=" + path + " fullPath=" + fullPath);
		DocumentBursterSettings dbSettings = rbSettingsService.loadSettings(fullPath);
		// System.out.println("[RB-DIAG] loadSettingsByPath settings=" + (dbSettings.settings != null ? "OK version=" + dbSettings.settings.version : "NULL"));
		maskPasswords(dbSettings);
		return Mono.just(dbSettings);
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/{reportId}/settings")
	public void saveReportSettings(@PathVariable String reportId, @RequestBody DocumentBursterSettings settings)
			throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		// System.out.println("[RB-DIAG] saveReportSettings reportId=" + reportId + " fullPath=" + fullPath);
		// System.out.println("[RB-DIAG] saveReportSettings settings=" + (settings.settings != null ? "OK burstfilename=" + settings.settings.burstfilename : "NULL"));
		preserveExistingPasswords(settings, fullPath);
		rbSettingsService.saveSettings(settings, fullPath);
	}

	@Operation(summary = "Data-source section from a separate datasource XML file on disk — distinct from the main settings.xml")
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/{reportId}/datasource", consumes = MediaType.ALL_VALUE)
	public Mono<ReportingSettings> loadReportDataSource(@PathVariable String reportId) throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		return Mono.just(rbSettingsService.loadSettingsReporting(fullPath));
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/{reportId}/datasource")
	public void saveReportDataSource(@PathVariable String reportId, @RequestBody ReportingSettings settings)
			throws Exception {
		assertDataSourceConnectionsAllowed(settings);
		String fullPath = resolveSettingsPath(reportId);
		rbSettingsService.saveSettingsReporting(settings, fullPath);
	}

	/**
	 * Refuses a datasource save that points the report at a database connection the caller may not
	 * use. Checked even when the connection is the one already saved: otherwise a limited author
	 * copies a report that is already on a blocked connection and gives it new SQL.
	 */
	private void assertDataSourceConnectionsAllowed(ReportingSettings settings) {

		if (settings == null || settings.report == null || settings.report.datasource == null)
			return;

		if (settings.report.datasource.sqloptions != null)
			limitsService.assertConnectionAllowed(settings.report.datasource.sqloptions.conncode);

		if (settings.report.datasource.scriptoptions != null)
			limitsService.assertConnectionAllowed(settings.report.datasource.scriptoptions.conncode);
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/{reportId}/template/{type}", produces = MediaType.TEXT_PLAIN_VALUE, consumes = MediaType.ALL_VALUE)
	public Mono<String> loadReportTemplate(@PathVariable String reportId, @PathVariable String type) throws Exception {
		String templatePath = resolveTemplatePath(reportId, type);
		String content = fileSystemService.unixCliCat(templatePath);
		return Mono.just(content != null ? content : "");
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/{reportId}/template/{type}", consumes = "text/plain",
			produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<java.util.Map<String, String>>> saveReportTemplate(@PathVariable String reportId,
			@PathVariable String type, @RequestBody Optional<String> content,
			@RequestParam(required = false) String assetSourceDir) throws Exception {
		String templatePath = resolveTemplatePath(reportId, type);
		assertTemplateSaveAllowed(templatePath);
		String relativeTemplatePath = resolveRelativeTemplatePath(reportId, type);
		return Mono.fromCallable(() -> {
			// Save template content
			fileSystemService.fsWriteStringToFile(templatePath, content);
			// Update ONLY documentpath in reporting.xml — do NOT overwrite other fields
			// (outputtype, conncode, etc.) which the frontend may have changed in memory.
			updateDocumentPathOnly(reportId, relativeTemplatePath);
			// Copy companion assets (fonts, images) from the gallery source directory into
			// the report template directory so that serve-asset can find them.
			// Uses StandardCopyOption.REPLACE_EXISTING — safe to call repeatedly (1st use
			// or 20th use); idempotent, never fails if files are already present.
			if (assetSourceDir != null && !assetSourceDir.isBlank()) {
				File srcDir = new File(resolvePathAgainstPortableDir(assetSourceDir));
				File dstDir = new File(templatePath).getParentFile();
				if (srcDir.isDirectory()) {
					for (File asset : srcDir.listFiles()) {
						String name = asset.getName().toLowerCase();
						if (asset.isFile() && !name.endsWith(".html") && !name.endsWith(".md")) {
							java.nio.file.Files.copy(asset.toPath(),
									new File(dstDir, asset.getName()).toPath(),
									java.nio.file.StandardCopyOption.REPLACE_EXISTING);
						}
					}
				}
			}
			// Return the new documentpath so the frontend can sync its in-memory copy
			return ResponseEntity.ok(java.util.Map.of("documentpath", relativeTemplatePath));
		});
	}

	// ── Simplified template endpoints (backend resolves path from config) ──

	/**
	 * GET /api/reports/{id}/preview — return the saved HTML dashboard template fragment
	 * (moved from ExploreDataController GET /api/explorations/template/{reportId}).
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/{id}/preview", produces = MediaType.TEXT_HTML_VALUE, consumes = MediaType.ALL_VALUE)
	public ResponseEntity<String> getDashboardPreview(@PathVariable String id) throws Exception {
		String html = canvasExportService.getTemplateHtml(id);
		if (html == null) return ResponseEntity.notFound().build();
		return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html);
	}

	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/{reportId}/template", produces = MediaType.TEXT_PLAIN_VALUE, consumes = MediaType.ALL_VALUE)
	public Mono<String> loadReportTemplateAuto(@PathVariable String reportId) throws Exception {
		String templatePath = resolveTemplatePathFromConfig(reportId);
		if (templatePath == null || templatePath.isEmpty()) {
			return Mono.just("");
		}
		// Skip binary template formats — they can't be displayed in a text editor
		if (templatePath.endsWith(".docx") || templatePath.endsWith(".xlsx")
				|| templatePath.endsWith(".pptx") || templatePath.endsWith(".odt")) {
			return Mono.just("");
		}
		String fullPath = resolvePathAgainstPortableDir(templatePath);
		String content = fileSystemService.unixCliCat(fullPath);
		return Mono.just(content != null ? content : "");
	}

	/**
	 * A report template is FreeMarker, so saving one is authoring executable content — not the same
	 * capability as viewing a report.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/{reportId}/template", consumes = "text/plain")
	public Mono<ResponseEntity<Void>> saveReportTemplateAuto(@PathVariable String reportId,
			@RequestBody Optional<String> content) throws Exception {
		String templatePath = resolveTemplatePathFromConfig(reportId);
		if (templatePath == null || templatePath.isEmpty()) {
			return Mono.just(new ResponseEntity<>(HttpStatus.NO_CONTENT));
		}
		assertTemplateSaveAllowed(templatePath);
		String fullPath = resolvePathAgainstPortableDir(templatePath);
		return Mono.fromCallable(() -> {
			fileSystemService.fsWriteStringToFile(fullPath, content);
			return new ResponseEntity<Void>(HttpStatus.OK);
		});
	}

	/**
	 * A Jasper template is code: its expressions compile and run inside the report. FreeMarker, HTML,
	 * XSL and DOCX stay allowed — FreeMarker is already hardened with SAFER_RESOLVER.
	 */
	private void assertTemplateSaveAllowed(String templatePath) {
		if (StringUtils.endsWithIgnoreCase(templatePath, ".jrxml"))
			limitsService.assertScriptsAllowed("save a Jasper template");
	}

	/**
	 * Load a Groovy DSL script for a report by type.
	 * Scripts live in the report's config folder: config/reports/{reportId}/{reportId}-{suffix}.groovy
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@GetMapping(value = "/{reportId}/script/{scriptType}", produces = MediaType.TEXT_PLAIN_VALUE, consumes = MediaType.ALL_VALUE)
	public Mono<String> loadReportScript(@PathVariable String reportId, @PathVariable String scriptType)
			throws Exception {
		String suffix = resolveScriptSuffix(scriptType);
		if (suffix == null) {
			return Mono.just("");
		}
		String settingsPath = resolveSettingsPath(reportId);
		String configDir = new File(settingsPath).getParent();
		String scriptPath = configDir + "/" + reportId + "-" + suffix + ".groovy";
		File scriptFile = new File(scriptPath);
		if (!scriptFile.exists()) {
			return Mono.just("");
		}
		String content = fileSystemService.unixCliCat(scriptPath);
		return Mono.just(content != null ? content : "");
	}

	/**
	 * Save a Groovy DSL script for a report by type.
	 */
	@PreAuthorize("hasRole('REPORT_AUTHOR')")
	@PutMapping(value = "/{reportId}/script/{scriptType}", consumes = "text/plain")
	public Mono<ResponseEntity<Void>> saveReportScript(@PathVariable String reportId,
			@PathVariable String scriptType, @RequestBody Optional<String> content) throws Exception {
		String suffix = resolveScriptSuffix(scriptType);
		if (suffix == null) {
			return Mono.just(new ResponseEntity<>(HttpStatus.BAD_REQUEST));
		}
		assertScriptSaveAllowed(suffix, content);
		String settingsPath = resolveSettingsPath(reportId);
		String configDir = new File(settingsPath).getParent();
		String scriptPath = configDir + "/" + reportId + "-" + suffix + ".groovy";
		return Mono.fromCallable(() -> {
			fileSystemService.fsWriteStringToFile(scriptPath, content);
			return new ResponseEntity<Void>(HttpStatus.OK);
		});
	}

	/**
	 * Two of the six script types are programs the reporting engine runs as it bursts a report — the
	 * datasource script and the additional transformation — and a caller who may not run scripts may
	 * not save one. The other four are widget DSLs: the same authoring a chart needs, so they are
	 * sandbox-checked and saved, not refused.
	 */
	private void assertScriptSaveAllowed(String suffix, Optional<String> content) {

		if ("script".equals(suffix) || "additional-transformation".equals(suffix)) {
			limitsService.assertScriptsAllowed("save a Groovy script for a report");
			return;
		}

		limitsSandbox.check(content.orElse(""));
	}

	private String resolveScriptSuffix(String scriptType) {
		switch (scriptType) {
			case "datasourceScript": return "script";
			case "paramsSpecScript": return "report-parameters-spec";
			case "transformScript": return "additional-transformation";
			case "tabulatorConfigScript": return "tabulator-config";
			case "chartConfigScript": return "chart-config";
			case "pivotTableConfigScript": return "pivot-config";
			default: return null;
		}
	}

	/**
	 * Resolve template file path by reading the report's reporting.xml config.
	 * The template path is stored in reporting.xml → report.template.documentpath
	 */
	private String resolveTemplatePathFromConfig(String reportId) throws Exception {
		String settingsPath = resolveSettingsPath(reportId);
		String configDir = new File(settingsPath).getParent();
		String reportingPath = configDir + "/reporting.xml";

		if (!new File(reportingPath).exists()) {
			return null;
		}

		ReportingSettings reporting = rbSettingsService.loadSettingsReporting(settingsPath);
		if (reporting != null && reporting.report != null && reporting.report.template != null) {
			return reporting.report.template.retrieveTemplateFilePath();
		}
		return null;
	}

	// ── Private helpers for ID-based path resolution ──

	private String resolveSettingsPath(String reportId) {
		// Check all config locations: reports, samples, _frend samples, reports-jasper, burst (legacy)
		String reportsPath = resolvePathAgainstPortableDir("config/reports/" + reportId + "/settings.xml");
		if (new File(reportsPath).exists())
			return reportsPath;

		String samplesPath = resolvePathAgainstPortableDir("config/samples/" + reportId + "/settings.xml");
		if (new File(samplesPath).exists())
			return samplesPath;

		String frendSamplesPath = resolvePathAgainstPortableDir("config/samples/_frend/" + reportId + "/settings.xml");
		if (new File(frendSamplesPath).exists())
			return frendSamplesPath;

		String jasperPath = resolvePathAgainstPortableDir("config/reports-jasper/" + reportId + "/settings.xml");
		if (new File(jasperPath).exists())
			return jasperPath;

		String jasperLegacyPath = resolvePathAgainstPortableDir(
				"config/reports-jasper-legacy/" + reportId + "/settings.xml");
		if (new File(jasperLegacyPath).exists())
			return jasperLegacyPath;

		String burstPath = resolvePathAgainstPortableDir("config/burst/settings.xml");
		if ("burst".equals(reportId) && new File(burstPath).exists())
			return burstPath;

		String defaultsPath = resolvePathAgainstPortableDir("config/_defaults/settings.xml");
		if ("_defaults".equals(reportId) && new File(defaultsPath).exists())
			return defaultsPath;

		// Default to reports path even if doesn't exist yet (for create)
		return reportsPath;
	}

	private String resolveTemplatePath(String reportId, String type) {
		return resolvePathAgainstPortableDir(resolveRelativeTemplatePath(reportId, type));
	}

	private String resolveRelativeTemplatePath(String reportId, String type) {
		// Docx uses a different naming convention: {reportId}-template.docx
		if ("docx".equals(type)) {
			return "templates/reports/" + reportId + "/" + reportId + "-template.docx";
		}

		String extension = type;
		if ("fop2pdf".equals(type))
			extension = "xsl";
		if ("jasper".equals(type))
			extension = "jrxml";
		if ("dashboard".equals(type))
			extension = "html";

		return "templates/reports/" + reportId + "/" + reportId + "-" + type + "." + extension;
	}

	/**
	 * Targeted update of ONLY the documentpath tag in reporting.xml.
	 * Uses string replacement instead of full JAXB unmarshal/marshal to avoid
	 * overwriting other fields (outputtype, conncode, etc.) that the frontend
	 * may have changed in memory but not yet saved.
	 */
	private void updateDocumentPathOnly(String reportId, String newDocumentPath) throws Exception {
		String settingsPath = resolveSettingsPath(reportId);
		if (settingsPath == null) return;
		String configDir = new java.io.File(settingsPath).getParent();
		java.io.File reportingFile = new java.io.File(configDir, "reporting.xml");
		if (!reportingFile.exists()) return;

		// Atomic load → mutate → save on the same monitor that saveSettingsReporting
		// uses. Without this outer lock, the unsynchronized load can read reporting.xml
		// in the brief window after FileOutputStream truncates it to 0 bytes but before
		// the JAXB marshaller has written any content — surfacing as a SAXParseException
		// "Premature end of file". Java's synchronized is reentrant, so the nested
		// saveSettingsReporting call from the same thread re-acquires safely.
		synchronized (rbSettingsService) {
			com.sourcekraft.documentburster.common.settings.model.ReportingSettings reporting =
					rbSettingsService.loadSettingsReporting(settingsPath);
			if (reporting != null && reporting.report != null && reporting.report.template != null) {
				reporting.report.template.documentpath = newDocumentPath;
				rbSettingsService.saveSettingsReporting(reporting, settingsPath);
			}
		}
	}
}

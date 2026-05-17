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
import java.util.TreeMap;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

import com.flowkraft.common.AppPaths;
import com.flowkraft.common.Utils;
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

	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Flux<ConfigurationFileInfo> listReports(
			@RequestParam(required = false) Boolean withDetails,
			@RequestParam(required = false) String type) throws Exception {
		if ("templates".equals(type)) {
			return Flux.fromStream(rbSettingsService.loadRbTemplatesAll());
		}
		if (Boolean.TRUE.equals(withDetails)) {
			return Flux.fromStream(rbSettingsService.loadSettingsAll());
		}
		return Flux.fromStream(rbSettingsService.loadSettingsAllMinimal());
	}

	// ── V4: Single report detail by ID (replaces /load-config-details?path=...) ──

	@GetMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
	public Mono<ConfigurationFileInfo> getReportDetails(@PathVariable String id) throws Exception {
		String path = resolveSettingsPath(id);
		ConfigurationFileInfo details = rbSettingsService.loadConfigDetails(path);
		return details != null ? Mono.just(details) : Mono.empty();
	}

	// ── V4.1: Report config for web component (moved from ReportingController) ──

	@GetMapping(value = "/{reportId}/config", consumes = MediaType.ALL_VALUE)
	public Mono<ReportFullConfigDto> getReportConfig(@PathVariable String reportId) throws Exception {
		return Mono.just(reportingService.loadReportConfig(reportId));
	}

	// ── V4.1: Report data (moved from ReportingController) ──

	@GetMapping(value = "/{reportId}/data", consumes = MediaType.ALL_VALUE)
	public Mono<ReportDataResult> fetchReportData(
			@PathVariable String reportId,
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false, defaultValue = "false") Boolean testMode,
			@RequestParam(required = false) String componentId,
			@RequestParam Map<String, String> parameters) throws Exception {
		parameters.remove("page");
		parameters.remove("size");
		parameters.remove("testMode");
		String sort = extractBracketParams(parameters, "sort");
		String filter = extractBracketParams(parameters, "filter");
		ReportDataResult result = reportingService.fetchReportData(reportId, parameters, testMode);
		result = reportingService.applyServerSideOperations(result, page, size, sort, filter);
		return Mono.just(result);
	}

	// ── V4.3: Unified DSL parse (replaces 5 /parse-* endpoints in ReportingController) ──

	@PostMapping(value = "/{reportId}/parse/{kind}")
	public Mono<?> parseDsl(
			@PathVariable String reportId,
			@PathVariable String kind,
			@RequestBody String dslCode,
			@RequestParam(required = false) String connectionCode) throws Exception {
		String cleaned = dslCode.replaceAll("^\"|\"$", "")
				.replace("\\n", "\n")
				.replace("\\t", "\t")
				.replace("\\\"", "\"");
		switch (kind) {
			case "parameters": {
				List<ReportParameter> params = ReportParametersHelper.parseGroovyParametersDslCode(cleaned);
				if (connectionCode != null && !connectionCode.isEmpty()) {
					reportingService.resolveParameterSqlOptions(params, connectionCode);
				}
				return Mono.just(params);
			}
			case "tabulator":
				return Mono.just(TabulatorOptionsParser.parseGroovyTabulatorDslCode(cleaned));
			case "chart":
				return Mono.just(ChartOptionsParser.parseGroovyChartDslCode(cleaned));
			case "pivot":
				return Mono.just(PivotTableOptionsParser.parseGroovyPivotTableDslCode(cleaned));
			case "filterpane":
				return Mono.just(FilterPaneOptionsParser.parseGroovyFilterPaneDslCode(cleaned));
			default:
				return Mono.error(new IllegalArgumentException("Unknown DSL kind: " + kind));
		}
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

	@GetMapping(value = "/serve-asset", produces = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<?>> serveAsset(@RequestParam String path) throws Exception {
		// System.out.println("========== SERVE ASSET ENDPOINT CALLED ==========");
		// System.out.println("Path requested: " + path);

		String fullPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/"
				+ URLDecoder.decode(path, StandardCharsets.UTF_8.toString());

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

	@GetMapping(value = "/preview-template", produces = MediaType.TEXT_HTML_VALUE)
	public Mono<ResponseEntity<String>> viewTemplate(@RequestParam String path) throws Exception {
		String fullPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/"
				+ URLDecoder.decode(path, StandardCharsets.UTF_8.toString());

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

	@PostMapping(value = "/configurations", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
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

	@PostMapping(value = "/configurations/{reportId}/duplicate", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
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

	@PostMapping(value = "/configurations/{reportId}/restore-defaults", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Void>> restoreDefaults(@PathVariable String reportId) throws Exception {
		rbSettingsService.restoreDefaults(reportId);
		return Mono.just(ResponseEntity.ok().build());
	}

	@DeleteMapping(value = "/configurations/{reportId}")
	public Mono<ResponseEntity<Void>> deleteConfiguration(@PathVariable String reportId) throws Exception {
		rbSettingsService.deleteConfiguration(reportId);
		return Mono.just(ResponseEntity.ok().build());
	}

	// ── Phase 3: ID-based REST endpoints ──

	@GetMapping(value = "/{reportId}/settings", consumes = MediaType.ALL_VALUE)
	public Mono<DocumentBursterSettings> loadReportSettings(@PathVariable String reportId) throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		DocumentBursterSettings dbSettings = rbSettingsService.loadSettings(fullPath);
		maskPasswords(dbSettings);
		return Mono.just(dbSettings);
	}

	@PutMapping(value = "/{reportId}/settings")
	public void saveReportSettings(@PathVariable String reportId, @RequestBody DocumentBursterSettings settings)
			throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		preserveExistingPasswords(settings, fullPath);
		rbSettingsService.saveSettings(settings, fullPath);
	}

	@GetMapping(value = "/{reportId}/datasource", consumes = MediaType.ALL_VALUE)
	public Mono<ReportingSettings> loadReportDataSource(@PathVariable String reportId) throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		return Mono.just(rbSettingsService.loadSettingsReporting(fullPath));
	}

	@PutMapping(value = "/{reportId}/datasource")
	public void saveReportDataSource(@PathVariable String reportId, @RequestBody ReportingSettings settings)
			throws Exception {
		String fullPath = resolveSettingsPath(reportId);
		rbSettingsService.saveSettingsReporting(settings, fullPath);
	}

	@GetMapping(value = "/{reportId}/template/{type}", produces = MediaType.TEXT_PLAIN_VALUE, consumes = MediaType.ALL_VALUE)
	public Mono<String> loadReportTemplate(@PathVariable String reportId, @PathVariable String type) throws Exception {
		String templatePath = resolveTemplatePath(reportId, type);
		String content = fileSystemService.unixCliCat(templatePath);
		return Mono.just(content != null ? content : "");
	}

	@PutMapping(value = "/{reportId}/template/{type}", consumes = "text/plain",
			produces = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<java.util.Map<String, String>>> saveReportTemplate(@PathVariable String reportId,
			@PathVariable String type, @RequestBody Optional<String> content,
			@RequestParam(required = false) String assetSourceDir) throws Exception {
		String templatePath = resolveTemplatePath(reportId, type);
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
				File srcDir = new File(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/" + assetSourceDir);
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
	@GetMapping(value = "/{id}/preview", produces = MediaType.TEXT_HTML_VALUE, consumes = MediaType.ALL_VALUE)
	public ResponseEntity<String> getDashboardPreview(@PathVariable String id) throws Exception {
		String html = canvasExportService.getTemplateHtml(id);
		if (html == null) return ResponseEntity.notFound().build();
		return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html);
	}

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
		String fullPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/" + templatePath;
		String content = fileSystemService.unixCliCat(fullPath);
		return Mono.just(content != null ? content : "");
	}

	@PutMapping(value = "/{reportId}/template", consumes = "text/plain")
	public Mono<ResponseEntity<Void>> saveReportTemplateAuto(@PathVariable String reportId,
			@RequestBody Optional<String> content) throws Exception {
		String templatePath = resolveTemplatePathFromConfig(reportId);
		if (templatePath == null || templatePath.isEmpty()) {
			return Mono.just(new ResponseEntity<>(HttpStatus.NO_CONTENT));
		}
		String fullPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/" + templatePath;
		return Mono.fromCallable(() -> {
			fileSystemService.fsWriteStringToFile(fullPath, content);
			return new ResponseEntity<Void>(HttpStatus.OK);
		});
	}

	/**
	 * Load a Groovy DSL script for a report by type.
	 * Scripts live in the report's config folder: config/reports/{reportId}/{reportId}-{suffix}.groovy
	 */
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
	@PutMapping(value = "/{reportId}/script/{scriptType}", consumes = "text/plain")
	public Mono<ResponseEntity<Void>> saveReportScript(@PathVariable String reportId,
			@PathVariable String scriptType, @RequestBody Optional<String> content) throws Exception {
		String suffix = resolveScriptSuffix(scriptType);
		if (suffix == null) {
			return Mono.just(new ResponseEntity<>(HttpStatus.BAD_REQUEST));
		}
		String settingsPath = resolveSettingsPath(reportId);
		String configDir = new File(settingsPath).getParent();
		String scriptPath = configDir + "/" + reportId + "-" + suffix + ".groovy";
		return Mono.fromCallable(() -> {
			fileSystemService.fsWriteStringToFile(scriptPath, content);
			return new ResponseEntity<Void>(HttpStatus.OK);
		});
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
		String reportsPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/reports/" + reportId + "/settings.xml";
		if (new File(reportsPath).exists())
			return reportsPath;

		String samplesPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/samples/" + reportId + "/settings.xml";
		if (new File(samplesPath).exists())
			return samplesPath;

		String frendSamplesPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/samples/_frend/" + reportId + "/settings.xml";
		if (new File(frendSamplesPath).exists())
			return frendSamplesPath;

		String jasperPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/reports-jasper/" + reportId + "/settings.xml";
		if (new File(jasperPath).exists())
			return jasperPath;

		String burstPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/burst/settings.xml";
		if ("burst".equals(reportId) && new File(burstPath).exists())
			return burstPath;

		String defaultsPath = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/config/_defaults/settings.xml";
		if ("_defaults".equals(reportId) && new File(defaultsPath).exists())
			return defaultsPath;

		// Default to reports path even if doesn't exist yet (for create)
		return reportsPath;
	}

	private String resolveTemplatePath(String reportId, String type) {
		return AppPaths.PORTABLE_EXECUTABLE_DIR_PATH + "/" + resolveRelativeTemplatePath(reportId, type);
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
		String configDir = new java.io.File(settingsPath).getParent();
		String reportingPath = configDir + "/reporting.xml";
		java.io.File reportingFile = new java.io.File(reportingPath);
		if (!reportingFile.exists()) return;

		String xml = java.nio.file.Files.readString(reportingFile.toPath());
		String updated = xml.replaceFirst(
			"<documentpath>[^<]*</documentpath>",
			"<documentpath>" + newDocumentPath + "</documentpath>"
		);
		if (!xml.equals(updated)) {
			java.nio.file.Files.writeString(reportingFile.toPath(), updated);
		}
	}
}

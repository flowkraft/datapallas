package com.flowkraft.connections;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.utils.Utils;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper.TokenResult;
import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.model.ConnectionFileInfo;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * REST API for managing database and email connections.
 */
@RestController
@RequestMapping(value = "/api/connections", produces = MediaType.APPLICATION_JSON_VALUE)
public class ConnectionsController {

	private static final Logger log = LoggerFactory.getLogger(ConnectionsController.class);
	private static final String PASSWORD_MASK = "******";
	private static final long EMITTER_TIMEOUT_MS = 6L * 60L * 1000L;

	private final ConnectionsService connectionsService;
	private final ReportsService reportsService;

	@Autowired
	private ObjectMapper objectMapper;

	/** In-flight OAuth flows: flowId → SSE emitter bound to the waiting Angular client. */
	private final ConcurrentHashMap<String, SseEmitter> flows = new ConcurrentHashMap<>();

	public ConnectionsController(ConnectionsService connectionsService, ReportsService reportsService) {
		this.connectionsService = connectionsService;
		this.reportsService = reportsService;
	}

	// ── OAuth DTOs ──────────────────────────────────────────────────────────────

	public record OAuthStartRequest(
			String provider,
			String tenantId,
			String clientId,
			String authorizeUrl,
			String tokenUrl,
			String scope) {}

	public record OAuthStartResponse(String flowId) {}

	public record OAuthEvent(
			String status,
			String userEmail,
			String refreshToken,
			String error) {

		static OAuthEvent pending() { return new OAuthEvent("pending", null, null, null); }
		static OAuthEvent success(String email, String rt) { return new OAuthEvent("success", email, rt, null); }
		static OAuthEvent error(String msg) { return new OAuthEvent("error", null, null, msg); }
	}

	// ========== LIST ALL CONNECTIONS (V3.1) ==========

	@GetMapping(consumes = MediaType.ALL_VALUE)
	public Flux<ConnectionFileInfo> listConnections(
			@RequestParam(required = false, defaultValue = "email") String type) throws Exception {
		if ("database".equals(type)) {
			return Flux.fromStream(reportsService.loadSettingsConnectionDatabaseAll()
					.peek(this::maskConnectionFileInfoPasswords));
		}
		return Flux.fromStream(reportsService.loadSettingsConnectionEmailAll()
				.peek(this::maskConnectionFileInfoPasswords));
	}

	// ========== LOAD SINGLE CONNECTION (V3.2) ==========

	@GetMapping(value = "/{connectionId}", consumes = MediaType.ALL_VALUE)
	public Mono<Object> loadConnection(@PathVariable String connectionId) throws Exception {
		if (connectionId.startsWith("db-")) {
			String fullPath = connectionsService.resolveDbConnectionPath(connectionId);
			DocumentBursterConnectionDatabaseSettings result = reportsService.loadSettingsConnectionDatabase(fullPath);
			if (result != null && result.connection != null && result.connection.databaseserver != null) {
				result.connection.databaseserver.userpassword = maskIfSecret(result.connection.databaseserver.userpassword);
			}
			return Mono.just(result);
		} else {
			String fullPath = connectionsService.resolveEmailConnectionPath(connectionId);
			DocumentBursterConnectionEmailSettings result = reportsService.loadSettingsConnectionEmail(fullPath);
			if (result != null && result.connection != null && result.connection.emailserver != null) {
				result.connection.emailserver.userpassword = maskIfSecret(result.connection.emailserver.userpassword);
				result.connection.emailserver.oauth2refreshtoken = maskIfSecret(result.connection.emailserver.oauth2refreshtoken);
			}
			return Mono.just(result);
		}
	}

	// ========== SAVE CONNECTION (V3.2) ==========

	@PutMapping(value = "/{connectionId}", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Void>> saveConnection(
			@PathVariable String connectionId,
			@RequestBody Map<String, Object> body) throws Exception {
		if (isSampleConnectionCode(connectionId)) {
			log.warn("Refused to save sample connection (read-only): {}", connectionId);
			return Mono.just(ResponseEntity.status(HttpStatus.FORBIDDEN).<Void>build());
		}
		if (connectionId.startsWith("db-")) {
			log.info("Saving database connection: {}", connectionId);
			DocumentBursterConnectionDatabaseSettings settings =
					objectMapper.convertValue(body, DocumentBursterConnectionDatabaseSettings.class);
			String fullPath = connectionsService.resolveDbConnectionPath(connectionId);
			if (settings.connection != null && settings.connection.databaseserver != null
					&& PASSWORD_MASK.equals(settings.connection.databaseserver.userpassword)
					&& new File(fullPath).exists()) {
				DocumentBursterConnectionDatabaseSettings existing = reportsService.loadSettingsConnectionDatabase(fullPath);
				if (existing != null && existing.connection != null && existing.connection.databaseserver != null) {
					settings.connection.databaseserver.userpassword = existing.connection.databaseserver.userpassword;
				}
			}
			reportsService.saveSettingsConnectionDatabase(settings, fullPath);
		} else {
			log.info("Saving email connection: {}", connectionId);
			DocumentBursterConnectionEmailSettings settings =
					objectMapper.convertValue(body, DocumentBursterConnectionEmailSettings.class);
			String filePath = connectionsService.resolveEmailConnectionPath(connectionId);
			if (settings.connection != null && settings.connection.emailserver != null
					&& new File(filePath).exists()) {
				boolean userPwdMasked = PASSWORD_MASK.equals(settings.connection.emailserver.userpassword);
				boolean refreshTokenMasked = PASSWORD_MASK.equals(settings.connection.emailserver.oauth2refreshtoken);
				if (userPwdMasked || refreshTokenMasked) {
					DocumentBursterConnectionEmailSettings existing = reportsService.loadSettingsConnectionEmail(filePath);
					if (existing != null && existing.connection != null && existing.connection.emailserver != null) {
						if (userPwdMasked)
							settings.connection.emailserver.userpassword = existing.connection.emailserver.userpassword;
						if (refreshTokenMasked)
							settings.connection.emailserver.oauth2refreshtoken = existing.connection.emailserver.oauth2refreshtoken;
					}
				}
			}
			reportsService.saveSettingsConnectionEmail(settings, filePath);
		}
		return Mono.just(ResponseEntity.ok().<Void>build());
	}

	// ========== TEST CONNECTIONS (V3.3) ==========

	@PostMapping(value = "/{connectionId}/test-email",
	             consumes = { MediaType.APPLICATION_JSON_VALUE, MediaType.ALL_VALUE })
	public Mono<ResponseEntity<Map<String, Object>>> testEmailConnection(
			@PathVariable String connectionId,
			@RequestBody(required = false) Map<String, String> request) throws Throwable {
		boolean inline = request != null && "true".equals(request.get("inline"));
		log.info("Testing {} email connection: {}", inline ? "inline" : "standard", connectionId);
		if (inline) {
			connectionsService.testInlineEmailConnection(connectionId);
		} else {
			connectionsService.testEmailConnection(connectionId);
		}
		return Mono.just(ResponseEntity.ok(Map.<String, Object>of(
				"status", "success",
				"message", "Email connection test passed")));
	}

	@PostMapping(value = "/{connectionId}/test-database",
	             consumes = { MediaType.APPLICATION_JSON_VALUE, MediaType.ALL_VALUE })
	public Mono<ResponseEntity<Map<String, Object>>> testDatabaseConnection(
			@PathVariable String connectionId,
			@RequestBody(required = false) Map<String, String> request) throws Throwable {
		log.info("Testing database connection: {}", connectionId);
		connectionsService.testDatabaseConnection(connectionId);
		return Mono.just(ResponseEntity.ok(Map.<String, Object>of(
				"status", "success",
				"message", "Database connection test passed")));
	}

	// ========== TEST SMS (V3.4 — {id} added) ==========

	@PostMapping(value = "/{connectionId}/test-sms", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, Object>>> testSms(
			@PathVariable String connectionId,
			@RequestBody Map<String, String> request) throws Exception {
		String fromNumber = request.get("fromNumber");
		String toNumber = request.get("toNumber");
		String configPath = request.get("configPath");
		log.info("Testing SMS for connection {}: from={}, to={}", connectionId, fromNumber, toNumber);
		connectionsService.testSms(fromNumber, toNumber, configPath);
		return Mono.just(ResponseEntity.ok(Map.<String, Object>of(
				"status", "success",
				"message", "SMS test sent successfully")));
	}

	// ========== TEST QUERY STUB (V3.7) ==========

	@PostMapping(value = "/{connectionId}/test-query", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Map<String, Object>>> testQuery(
			@PathVariable String connectionId,
			@RequestBody Map<String, String> request) {
		return Mono.just(ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
				.body(Map.<String, Object>of(
						"status", "not_implemented",
						"message", "POST /api/connections/{id}/test-query — reserved, not yet implemented")));
	}

	// ========== OAUTH FLOW (V3.6 — moved from /api/oauth/email/*) ==========

	@PostMapping(value = "/{connectionId}/oauth-sign-in",
	             consumes = MediaType.APPLICATION_JSON_VALUE,
	             produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<OAuthStartResponse> startOAuth(
			@PathVariable String connectionId,
			@RequestBody OAuthStartRequest req) {
		String flowId = UUID.randomUUID().toString();

		SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
		flows.put(flowId, emitter);
		emitter.onCompletion(() -> flows.remove(flowId));
		emitter.onTimeout(() -> { flows.remove(flowId); emitter.complete(); });
		emitter.onError(e -> flows.remove(flowId));

		Thread worker = new Thread(() -> {
			try {
				emitter.send(SseEmitter.event().name("pending").data(OAuthEvent.pending()));
				log.info("Starting OAuth2 flow [{}] for connection={}, provider={}", flowId, connectionId, req.provider());
				TokenResult result = OAuthFlowHelper.runAuthCodeFlow(
						req.provider(), req.tenantId(), req.clientId(),
						req.authorizeUrl(), req.tokenUrl(), req.scope());
				emitter.send(SseEmitter.event()
						.name("success")
						.data(OAuthEvent.success(result.userEmail, result.refreshToken)));
				emitter.complete();
			} catch (Exception ex) {
				log.error("OAuth2 flow [{}] failed: {}", flowId, ex.getMessage());
				try {
					emitter.send(SseEmitter.event()
							.name("error")
							.data(OAuthEvent.error(ex.getMessage())));
				} catch (IOException ignored) {}
				emitter.complete();
			} finally {
				flows.remove(flowId);
			}
		}, "oauth-flow-" + flowId);
		worker.setDaemon(true);
		worker.start();

		return ResponseEntity.ok(new OAuthStartResponse(flowId));
	}

	@GetMapping(value = "/{connectionId}/oauth-flow/{flowId}/events",
	            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter oauthEvents(@PathVariable String connectionId, @PathVariable String flowId) {
		SseEmitter emitter = flows.get(flowId);
		if (emitter != null) {
			return emitter;
		}
		SseEmitter dead = new SseEmitter(0L);
		try {
			dead.send(SseEmitter.event()
					.name("error")
					.data(OAuthEvent.error("Unknown flowId: " + flowId)));
		} catch (IOException ignored) {}
		dead.complete();
		return dead;
	}

	@PostMapping("/{connectionId}/oauth-flow/{flowId}/cancel")
	public ResponseEntity<Void> cancelOAuth(@PathVariable String connectionId, @PathVariable String flowId) {
		SseEmitter emitter = flows.remove(flowId);
		if (emitter != null) {
			try {
				emitter.send(SseEmitter.event()
						.name("error")
						.data(OAuthEvent.error("cancelled by user")));
			} catch (IOException ignored) {}
			emitter.complete();
		}
		return ResponseEntity.noContent().build();
	}

	// ========== DELETE / METADATA / REVEAL-PASSWORD (unchanged) ==========

	@DeleteMapping("/{connectionId}")
	public Mono<ResponseEntity<Void>> deleteConnection(@PathVariable String connectionId) throws Exception {
		log.info("Deleting connection: {}", connectionId);
		if (isSampleConnectionCode(connectionId)) {
			log.warn("Refused to delete sample connection (read-only): {}", connectionId);
			return Mono.just(ResponseEntity.status(HttpStatus.FORBIDDEN).<Void>build());
		}
		connectionsService.deleteConnection(connectionId);
		return Mono.just(ResponseEntity.ok().<Void>build());
	}

	@GetMapping(value = "/{connectionId}/metadata/{type}", consumes = MediaType.ALL_VALUE)
	public Mono<ResponseEntity<Map<String, String>>> getMetadata(
			@PathVariable String connectionId,
			@PathVariable String type) throws Exception {
		String content = connectionsService.getMetadata(connectionId, type);
		if (content == null) {
			return Mono.just(ResponseEntity.ok(Map.of("exists", "false", "content", "")));
		}
		return Mono.just(ResponseEntity.ok(Map.of("exists", "true", "content", content)));
	}

	@PutMapping(value = "/{connectionId}/metadata/{type}", consumes = MediaType.APPLICATION_JSON_VALUE)
	public Mono<ResponseEntity<Void>> saveMetadata(
			@PathVariable String connectionId,
			@PathVariable String type,
			@RequestBody Map<String, String> request) throws Exception {
		String content = request.get("content");
		connectionsService.saveMetadata(connectionId, type, content);
		return Mono.just(ResponseEntity.ok().<Void>build());
	}

	@PostMapping(value = "/{connectionId}/reveal-password")
	public Mono<ResponseEntity<Map<String, String>>> revealPassword(
			@PathVariable String connectionId,
			@RequestBody Map<String, String> request) throws Exception {
		String field = request.get("field");
		String reportId = request.get("reportId");

		final String configPath;
		if (reportId != null && !reportId.isEmpty()) {
			String reportsPath = "config/reports/" + reportId + "/settings.xml";
			if (new File(Utils.resolvePathAgainstPortableDir(reportsPath)).exists()) {
				configPath = reportsPath;
			} else {
				String samplesPath = "config/samples/" + reportId + "/settings.xml";
				if (new File(Utils.resolvePathAgainstPortableDir(samplesPath)).exists()) {
					configPath = samplesPath;
				} else if ("burst".equals(reportId)) {
					configPath = "config/burst/settings.xml";
				} else {
					configPath = reportsPath;
				}
			}
		} else {
			configPath = null;
		}

		SecretsCipher cipher = SecretsCipher.getInstance(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH);
		String encryptedValue = null;

		if ("authtoken".equals(field) || "accountsid".equals(field) || "proxypassword".equals(field)) {
			if (configPath == null || configPath.isEmpty()) {
				return Mono.just(ResponseEntity.badRequest()
						.body(Map.of("error", "configPath is required for field: " + field)));
			}
			String fullPath = Utils.resolvePathAgainstPortableDir(configPath.replaceFirst("^/", ""));
			DocumentBursterSettings dbSettings = reportsService.loadSettings(fullPath);

			if ("authtoken".equals(field)
					&& dbSettings.settings.smssettings != null
					&& dbSettings.settings.smssettings.twilio != null) {
				encryptedValue = dbSettings.settings.smssettings.twilio.authtoken;
			} else if ("accountsid".equals(field)
					&& dbSettings.settings.smssettings != null
					&& dbSettings.settings.smssettings.twilio != null) {
				encryptedValue = dbSettings.settings.smssettings.twilio.accountsid;
			} else if ("proxypassword".equals(field)
					&& dbSettings.settings.simplejavamail != null
					&& dbSettings.settings.simplejavamail.proxy != null) {
				encryptedValue = dbSettings.settings.simplejavamail.proxy.password;
			}
		} else {
			String dbConnPath = Utils.resolvePathAgainstPortableDir(
					"config/connections/" + connectionId + "/" + connectionId + ".xml");
			if (new File(dbConnPath).exists()) {
				DocumentBursterConnectionDatabaseSettings dbConn = reportsService
						.loadSettingsConnectionDatabase(dbConnPath);
				encryptedValue = dbConn.connection.databaseserver.userpassword;
			} else {
				String emlConnPath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + ".xml");
				if (new File(emlConnPath).exists()) {
					DocumentBursterConnectionEmailSettings emlConn = reportsService
							.loadSettingsConnectionEmail(emlConnPath);
					encryptedValue = emlConn.connection.emailserver.userpassword;
				} else if (configPath != null && !configPath.isEmpty()) {
					String fullPath = Utils.resolvePathAgainstPortableDir(configPath.replaceFirst("^/", ""));
					DocumentBursterSettings dbSettings = reportsService.loadSettings(fullPath);
					if (dbSettings.settings.emailserver != null) {
						encryptedValue = dbSettings.settings.emailserver.userpassword;
					}
				}
			}
		}

		if (encryptedValue == null || encryptedValue.isEmpty()) {
			return Mono.just(ResponseEntity.ok(Map.of("password", "")));
		}

		String decrypted = cipher.decrypt(encryptedValue);
		return Mono.just(ResponseEntity.ok(Map.of("password", decrypted)));
	}

	// ========== PRIVATE HELPERS ==========

	private static boolean isSampleConnectionCode(String connectionId) {
		if (connectionId == null) return false;
		String lower = connectionId.trim().toLowerCase();
		return lower.contains("rbt-sample-northwind-sqlite-4f2")
				|| lower.contains("rbt-sample-northwind-duckdb-4f2")
				|| lower.contains("rbt-sample-northwind-clickhouse-4f2");
	}

	private String maskIfSecret(String value) {
		if (value == null || value.isEmpty()) return value;
		if (value.startsWith("ENC(")) return PASSWORD_MASK;
		if (value.contains("${")) return value;
		if (value.contains(" ") && value.length() > 10) return value;
		return PASSWORD_MASK;
	}

	private void maskConnectionFileInfoPasswords(ConnectionFileInfo connFileInfo) {
		if (connFileInfo == null) return;
		if (connFileInfo.emailserver != null) {
			connFileInfo.emailserver.userpassword = maskIfSecret(connFileInfo.emailserver.userpassword);
		}
		if (connFileInfo.dbserver != null) {
			connFileInfo.dbserver.userpassword = maskIfSecret(connFileInfo.dbserver.userpassword);
		}
	}
}

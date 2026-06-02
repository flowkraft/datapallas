package com.flowkraft.oauth;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper.TokenResult;

/**
 * @deprecated Endpoints moved to ConnectionsController under
 *             /api/connections/{id}/oauth-sign-in,
 *             /api/connections/{id}/oauth-flow/{flowId}/events,
 *             /api/connections/{id}/oauth-flow/{flowId}/cancel (V3.6).
 *             This class is kept as a dead reference only — @RestController
 *             removed so Spring does not register any routes from it.
 */
@Deprecated
public class EmailOAuthController {

    private static final Logger log = LoggerFactory.getLogger(EmailOAuthController.class);

    /** Browser PKCE wait is 5 min; emitter timeout is set just over that. */
    private static final long EMITTER_TIMEOUT_MS = 6L * 60L * 1000L;

    /** In-flight flows: flowId → emitter bound to the waiting Angular client's SSE response. */
    private final ConcurrentHashMap<String, SseEmitter> flows = new ConcurrentHashMap<>();

    // ── DTOs ─────────────────────────────────────────────────────────────────

    public record StartRequest(
            String provider,
            String tenantId,
            String clientId,
            String authorizeUrl,
            String tokenUrl,
            String scope) {}

    public record StartResponse(String flowId) {}

    public record OAuthEvent(
            String status,        // pending | browser_opened | success | error
            String userEmail,
            String refreshToken,
            String error) {

        static OAuthEvent pending()   { return new OAuthEvent("pending",        null, null, null); }
        static OAuthEvent opened()    { return new OAuthEvent("browser_opened", null, null, null); }
        static OAuthEvent success(String email, String rt) {
            return new OAuthEvent("success", email, rt, null);
        }
        static OAuthEvent error(String msg) {
            return new OAuthEvent("error", null, null, msg);
        }
    }

    // ── Endpoints ─────────────────────────────────────────────────────────────

    /**
     * Start an OAuth2 authorization flow.
     * Returns immediately with a flowId; use /events to stream progress.
     */
    @PostMapping(value = "/start", consumes = MediaType.APPLICATION_JSON_VALUE,
                                   produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<StartResponse> start(@RequestBody StartRequest req) {
        String flowId = UUID.randomUUID().toString();

        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        flows.put(flowId, emitter);
        emitter.onCompletion(() -> flows.remove(flowId));
        emitter.onTimeout(() -> { flows.remove(flowId); emitter.complete(); });
        emitter.onError(e -> flows.remove(flowId));

        // Run the blocking PKCE flow on a daemon worker thread so we don't hold a request thread.
        // SseEmitter buffers send() calls until the client subscribes via /events, so events
        // emitted before the GET /events arrives are replayed on subscribe.
        Thread worker = new Thread(() -> {
            try {
                emitter.send(SseEmitter.event().name("pending").data(OAuthEvent.pending()));
                log.info("Starting OAuth2 flow [{}] for provider={}", flowId, req.provider());
                TokenResult result = OAuthFlowHelper.runAuthCodeFlow(
                        req.provider(),
                        req.tenantId(),
                        req.clientId(),
                        req.authorizeUrl(),
                        req.tokenUrl(),
                        req.scope());
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
                } catch (IOException ignored) {
                    // Client already gone; nothing useful we can do.
                }
                emitter.complete();
            } finally {
                flows.remove(flowId);
            }
        }, "oauth-flow-" + flowId);
        worker.setDaemon(true);
        worker.start();

        return ResponseEntity.ok(new StartResponse(flowId));
    }

    /**
     * SSE stream for a running OAuth2 flow.
     * Angular subscribes immediately after /start and listens for status events.
     */
    @GetMapping(value = "/{flowId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String flowId) {
        SseEmitter emitter = flows.get(flowId);
        if (emitter != null) {
            return emitter;
        }
        // Unknown flowId: send one error event and close the stream.
        SseEmitter dead = new SseEmitter(0L);
        try {
            dead.send(SseEmitter.event()
                    .name("error")
                    .data(OAuthEvent.error("Unknown flowId: " + flowId)));
        } catch (IOException ignored) {
            // The emitter buffers until subscribe; IOException here is unlikely.
        }
        dead.complete();
        return dead;
    }

    /**
     * Cancel an in-flight OAuth2 flow (e.g. user closed the dialog before completing).
     */
    @PostMapping("/{flowId}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable String flowId) {
        SseEmitter emitter = flows.remove(flowId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data(OAuthEvent.error("cancelled by user")));
            } catch (IOException ignored) {
                // Client already gone.
            }
            emitter.complete();
        }
        return ResponseEntity.noContent().build();
    }
}

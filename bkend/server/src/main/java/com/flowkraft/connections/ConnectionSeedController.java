package com.flowkraft.connections;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;

/**
 * REST endpoints for the Seed Data tab in the Connection Details modal.
 *
 * POST /api/connections/{connectionCode}/run-seed     — execute a Groovy seed script
 * GET  /api/connections/{connectionCode}/seed-status  — check seed_inv_* table state
 * GET  /api/connections/seed-templates                — list bundled .groovy templates
 *
 * <p>{@code ADMIN} throughout. The tab lives inside the Connection Details modal, which is an
 * administrator's screen, and every endpoint here either runs Groovy against a connection or reports
 * on the data it wrote.
 */
@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
public class ConnectionSeedController {

    private static final Logger log = LoggerFactory.getLogger(ConnectionSeedController.class);

    private final GenericSeedExecutor seedExecutor;

    public ConnectionSeedController(GenericSeedExecutor seedExecutor) {
        this.seedExecutor = seedExecutor;
    }

    /**
     * Execute a Groovy seed script against the named connection.
     *
     * Body: { "script": "...", "params": { "N": 10000, ... } }
     * Response: { "ok": bool, "durationMs": long, "rowCounts": { table: count }, "error"?: string }
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(value = "/api/connections/{connectionCode}/run-seed",
                 consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<Map<String, Object>> runCustomSeed(
            @PathVariable String connectionCode,
            @RequestBody Map<String, Object> body) {

        return Mono.fromCallable(() -> {
            String script = (String) body.get("script");
            if (script == null || script.isBlank()) {
                return Map.of("ok", false, "durationMs", 0L,
                        "error", "Request body must contain a non-empty 'script' field");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> params = (Map<String, Object>) body.get("params");
            log.info("run-custom-seed: connectionCode={}, scriptLen={}", connectionCode, script.length());
            return seedExecutor.execute(connectionCode, script, params);
        });
    }

    /**
     * Check whether seed_inv_* tables exist and contain data.
     *
     * Response: { "hasSeedData": bool, "tables": [{ "name": string, "count": long }] }
     */
    @GetMapping(value = "/api/connections/{connectionCode}/seed-status",
                consumes = MediaType.ALL_VALUE)
    public Mono<Map<String, Object>> seedStatus(@PathVariable String connectionCode) {
        return Mono.fromCallable(() -> {
            log.debug("seed-status: connectionCode={}", connectionCode);
            return seedExecutor.checkSeedStatus(connectionCode);
        });
    }

    /**
     * List bundled Groovy seed templates from db/scripts/.
     *
     * Response: [{ "id": string, "displayName": string, "description": string, "source": string }]
     */
    @GetMapping(value = "/api/connections/seed-templates", consumes = MediaType.ALL_VALUE)
    public Mono<List<Map<String, Object>>> listSeedTemplates() {
        return Mono.fromCallable(() -> {
            log.debug("list-seed-templates");
            return seedExecutor.listTemplates();
        });
    }
}

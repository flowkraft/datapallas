package com.flowkraft.queries.controllers;

import com.flowkraft.queries.services.QueriesService;
import com.flowkraft.scripts.ScriptsService;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * REST controller for ad-hoc SQL and script execution.
 *
 * <p>All endpoints deliberately catch and return {@code {error: "..."}} with
 * HTTP 200 — exploration errors are expected and the UI renders them inline.
 */
@RestController
@RequestMapping("/api/queries")
@CrossOrigin
public class QueriesController {

    private static final Logger log = LoggerFactory.getLogger(QueriesController.class);

    @Autowired
    private QueriesService queriesService;

    @Autowired
    private ScriptsService scriptsService;

    /** POST /api/queries/run-sql — execute an ad-hoc SQL query. */
    @PostMapping("/run-sql")
    public Mono<Map<String, Object>> executeQuery(@RequestBody Map<String, Object> request) {
        String connectionId = (String) request.get("connectionId");
        String sql = (String) request.get("sql");

        @SuppressWarnings("unchecked")
        Map<String, Object> params = (Map<String, Object>) request.get("params");

        log.info("Executing ad-hoc query on connection '{}': {}", connectionId,
                sql != null && sql.length() > 100 ? sql.substring(0, 100) + "..." : sql);

        try {
            List<Map<String, Object>> rows = queriesService.executeQuery(connectionId, sql, params);
            return Mono.just(Map.of("data", rows, "rowCount", rows.size()));
        } catch (Exception e) {
            log.debug("Ad-hoc query failed on '{}': {}", connectionId, e.getMessage());
            return Mono.just(Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
        }
    }

    /** GET /api/queries/schema/{connectionId} — fetch schema for a connection. */
    @GetMapping(value = "/schema/{connectionId}", consumes = MediaType.ALL_VALUE)
    public Mono<SchemaInfo> getSchema(@PathVariable String connectionId) throws Exception {
        log.info("Fetching schema for connection '{}'", connectionId);
        return Mono.just(queriesService.getSchema(connectionId));
    }

    /** POST /api/queries/run-script — execute an inline Groovy script. */
    @PostMapping("/run-script")
    public Mono<Map<String, Object>> executeScript(@RequestBody Map<String, Object> request) {
        String connectionId = (String) request.get("connectionId");
        String script = (String) request.get("script");

        @SuppressWarnings("unchecked")
        Map<String, Object> filterValues = (Map<String, Object>) request.get("filterValues");

        log.info("Executing inline script on connection '{}'", connectionId);

        try {
            List<Map<String, Object>> rows = scriptsService.executeScript(connectionId, script, filterValues);
            return Mono.just(Map.of("data", rows, "rowCount", rows.size()));
        } catch (Exception e) {
            log.debug("Inline script failed on '{}': {}", connectionId, e.getMessage());
            return Mono.just(Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
        }
    }
}

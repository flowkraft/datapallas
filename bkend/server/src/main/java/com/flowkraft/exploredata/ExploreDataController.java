package com.flowkraft.exploredata;

import com.flowkraft.exploredata.export.CanvasExportService;
import com.flowkraft.queries.services.QueriesService;
import com.flowkraft.scripts.ScriptsService;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * REST controller for the Explore Data canvas feature.
 *
 * <p>Canvas CRUD and export follow the project exception-handling philosophy:
 * controllers NEVER catch — every {@code Throwable} propagates to
 * {@link com.flowkraft.common.GlobalExceptionHandler}.
 *
 * <p>Ad-hoc execute/schema endpoints deliberately catch and return
 * {@code {error: "..."}} with HTTP 200 — exploration errors are expected
 * and the UI renders them inline (keeps errors.log clean).
 */
@RestController
@RequestMapping("/api/explorations")
@CrossOrigin
public class ExploreDataController {

    private static final Logger log = LoggerFactory.getLogger(ExploreDataController.class);

    @Autowired
    private ExploreDataService service;

    @Autowired
    private CanvasExportService exportService;

    @Autowired
    private QueriesService queriesService;

    @Autowired
    private ScriptsService scriptsService;

    // ── Canvas CRUD ───────────────────────────────────────────────────────────

    /** GET /api/explore-data — list all canvases, newest-first. */
    @GetMapping
    public List<Map<String, Object>> listCanvases() throws Exception {
        return service.listCanvases();
    }

    /** POST /api/explore-data — create a new canvas. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createCanvas(@RequestBody Map<String, Object> body)
            throws Exception {
        return ResponseEntity.status(201).body(service.createCanvas(body));
    }

    /** GET /api/explore-data/{id} — get one canvas by ID. */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getCanvas(@PathVariable String id) throws Exception {
        return service.getCanvas(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** PUT /api/explore-data/{id} — update name / description / connectionId / state. */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateCanvas(
            @PathVariable String id, @RequestBody Map<String, Object> body) throws Exception {
        return service.updateCanvas(id, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** DELETE /api/explore-data/{id} — delete a canvas. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteCanvas(@PathVariable String id) throws Exception {
        service.deleteCanvas(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── Export ────────────────────────────────────────────────────────────────

    /**
     * POST /api/explore-data/{id}/export — export the canvas to a DataPallas
     * dashboard report.  No request body required: all canvas data (name,
     * connectionId, widgets, parametersConfig) is read from SQLite. The dashboard
     * slug is derived server-side from {@code exportedReportCode} (re-export)
     * or by slugifying the canvas name (first export).
     */
    @PostMapping("/{id}/export")
    public ResponseEntity<Map<String, Object>> exportCanvas(@PathVariable String id) throws Exception {
        return ResponseEntity.ok(exportService.export(id));
    }

    // ── Ad-hoc execution (explore-data canvas only) ───────────────────────────

    /** POST /api/explorations/queries/run-sql — execute an ad-hoc SQL query. */
    @PostMapping("/queries/run-sql")
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

    /** GET /api/explore-data/schema/{connectionId} — fetch schema for a connection. */
    @GetMapping(value = "/schema/{connectionId}", consumes = MediaType.ALL_VALUE)
    public Mono<SchemaInfo> getSchema(@PathVariable String connectionId) throws Exception {
        log.info("Fetching schema for connection '{}'", connectionId);
        return Mono.just(queriesService.getSchema(connectionId));
    }

    /** POST /api/explorations/queries/run-script — execute an inline Groovy script. */
    @PostMapping("/queries/run-script")
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

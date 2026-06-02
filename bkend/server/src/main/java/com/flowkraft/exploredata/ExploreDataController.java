package com.flowkraft.exploredata;

import com.flowkraft.exploredata.export.CanvasExportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    // ── Canvas CRUD ───────────────────────────────────────────────────────────

    /** GET /api/explorations — list all canvases, newest-first. */
    @GetMapping
    public List<Map<String, Object>> listCanvases() throws Exception {
        return service.listCanvases();
    }

    /** POST /api/explorations — create a new canvas. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createCanvas(@RequestBody Map<String, Object> body)
            throws Exception {
        return ResponseEntity.status(201).body(service.createCanvas(body));
    }

    /** GET /api/explorations/{id} — get one canvas by ID. */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getCanvas(@PathVariable String id) throws Exception {
        return service.getCanvas(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** PUT /api/explorations/{id} — update name / description / connectionId / state. */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateCanvas(
            @PathVariable String id, @RequestBody Map<String, Object> body) throws Exception {
        return service.updateCanvas(id, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** DELETE /api/explorations/{id} — delete a canvas. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteCanvas(@PathVariable String id) throws Exception {
        service.deleteCanvas(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── Export ────────────────────────────────────────────────────────────────

    /**
     * POST /api/explorations/{id}/export — export the canvas to a DataPallas
     * dashboard report.  No request body required: all canvas data (name,
     * connectionId, widgets, parametersConfig) is read from SQLite. The dashboard
     * slug is derived server-side from {@code exportedReportCode} (re-export)
     * or by slugifying the canvas name (first export).
     */
    @PostMapping("/{id}/export")
    public ResponseEntity<Map<String, Object>> exportCanvas(@PathVariable String id) throws Exception {
        return ResponseEntity.ok(exportService.export(id));
    }

}

package com.flowkraft.analytics.controllers;

import com.flowkraft.common.AppPaths;
import com.flowkraft.analytics.services.ClickHouseAnalyticsService;
import com.flowkraft.analytics.services.DuckDBAnalyticsService;
import com.flowkraft.analytics.engine.dto.ExploreRequest;
import com.flowkraft.analytics.engine.dto.ExploreResponse;
import com.flowkraft.analytics.engine.dto.PivotRequest;
import com.flowkraft.analytics.engine.dto.PivotResponse;
import com.flowkraft.analytics.engine.duckdb.DuckDBFileHandler;
import com.flowkraft.queries.ConnectionFactory;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API Controller for OLAP analytics operations.
 * Provides endpoints for server-side pivot table processing using DuckDB or ClickHouse.
 * 
 * Engine routing:
 * - engine="duckdb": Uses DuckDB for OLAP processing
 * - engine="clickhouse": Uses ClickHouse for OLAP processing
 * - engine not specified: Auto-detects from connection database type
 *   - duckdb connection → duckdb engine
 *   - clickhouse connection → clickhouse engine
 *   - other connections → browser (client-side processing)
 */
@RestController
@RequestMapping("/api/explorations/analytics")
@CrossOrigin(origins = "*")
public class AnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsController.class);


    /**
     * Resolve connectionCode and tableName from a reportCode by reading reporting.xml.
     * Populates the PivotRequest with the resolved values.
     *
     * @param request The pivot request with reportCode set
     * @throws RuntimeException if reporting.xml not found or invalid
     */
    private void resolveConnectionFromReportCode(PivotRequest request, DatabaseConnectionManager cm) throws Exception {
        String reportCode = request.getReportId();

        // Find the report directory (same logic as ReportingService)
        java.nio.file.Path reportsDir = java.nio.file.Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports", reportCode);
        java.nio.file.Path samplesDir = java.nio.file.Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", reportCode);
        java.nio.file.Path frendSamplesDir = java.nio.file.Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", "_frend", reportCode);

        java.nio.file.Path reportDir = null;
        if (java.nio.file.Files.exists(reportsDir)) {
            reportDir = reportsDir;
        } else if (java.nio.file.Files.exists(samplesDir)) {
            reportDir = samplesDir;
        } else if (java.nio.file.Files.exists(frendSamplesDir)) {
            reportDir = frendSamplesDir;
        } else {
            throw new RuntimeException("Report not found: " + reportCode);
        }

        // Read reporting.xml using JAXB (same as Settings.java)
        java.nio.file.Path reportingXml = reportDir.resolve("reporting.xml");
        if (!java.nio.file.Files.exists(reportingXml)) {
            throw new RuntimeException("reporting.xml not found for report: " + reportCode);
        }

        // Use JAXB to properly parse the XML (same pattern as Settings.java)
        jakarta.xml.bind.JAXBContext jaxbContext = jakarta.xml.bind.JAXBContext.newInstance(
            com.sourcekraft.documentburster.common.settings.model.ReportingSettings.class
        );
        jakarta.xml.bind.Unmarshaller unmarshaller = jaxbContext.createUnmarshaller();

        com.sourcekraft.documentburster.common.settings.model.ReportingSettings reportingSettings;
        try (java.io.FileInputStream fis = new java.io.FileInputStream(reportingXml.toFile())) {
            reportingSettings = (com.sourcekraft.documentburster.common.settings.model.ReportingSettings) unmarshaller.unmarshal(fis);
        }

        if (reportingSettings == null || reportingSettings.report == null || reportingSettings.report.datasource == null) {
            throw new RuntimeException("Invalid reporting.xml structure for report: " + reportCode);
        }

        com.sourcekraft.documentburster.common.settings.model.ReportSettings.DataSource ds = reportingSettings.report.datasource;
        String dsType = ds.type;
        log.debug("resolveConnectionFromReportCode - datasource type: {}", dsType);

        String connectionCode = null;

        // Extract connection code from the appropriate section
        if ("ds.sqlquery".equals(dsType) && ds.sqloptions != null) {
            connectionCode = ds.sqloptions.conncode;
        } else if (("ds.scriptfile".equals(dsType) || "ds.dashboard".equals(dsType)) && ds.scriptoptions != null) {
            connectionCode = ds.scriptoptions.conncode;
        }

        log.debug("resolveConnectionFromReportCode - extracted connectionCode: {}", connectionCode);

        if (connectionCode == null || connectionCode.isEmpty()) {
            throw new RuntimeException("No connection code found in reporting.xml for report: " + reportCode);
        }

        // Load optional tableName from pivot DSL — let parse errors propagate (malformed DSL = bug to fix)
        String tableName = null;
        java.nio.file.Path pivotConfigPath = reportDir.resolve(reportCode + "-pivot-config.groovy");
        if (java.nio.file.Files.exists(pivotConfigPath)) {
            String pivotDsl = java.nio.file.Files.readString(pivotConfigPath);
            com.flowkraft.reporting.dsl.pivottable.PivotTableOptions pivotOpts =
                com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsParser.parseGroovyPivotTableDslCode(pivotDsl);
            tableName = pivotOpts.getTableName();
            if (tableName != null && !tableName.isEmpty()) {
                log.info("Using explicit tableName from pivot DSL: '{}'", tableName);
            }
        }

        // If no explicit tableName, use auto-plumbing sentinel
        if (tableName == null || tableName.isEmpty()) {
            tableName = "__SCRIPT_DATA__";
            log.info("No explicit tableName in pivot DSL - will auto-plumb script data for report '{}'", reportCode);
        }

        // Populate the request
        request.setConnectionCode(connectionCode);
        request.setTableName(tableName);

        // Smart auto-substitution: if client explicitly requests DuckDB but report has non-DuckDB connection,
        // auto-configure virtual DuckDB connection (only if not already DuckDB)
        String clientEngine = request.getEngine();
        if ("duckdb".equalsIgnoreCase(clientEngine)) {
            String detectedEngine = detectEngineFromConnection(connectionCode, cm);
            if (!"duckdb".equalsIgnoreCase(detectedEngine)) {
                log.info("Client requested DuckDB engine but report uses '{}' connection - auto-configuring virtual DuckDB",
                        connectionCode);
                request.setConnectionCode("rbt-sample-northwind-duckdb-4f2");
            }
        }

        log.info("Resolved reportCode '{}' to connectionCode='{}', tableName='{}'",
                reportCode, connectionCode, tableName);
    }

    /**
     * Auto-detect the appropriate OLAP engine from the database connection type.
     *
     * @param connectionCode The connection code to look up
     * @return The detected engine: "duckdb", "clickhouse", or "browser"
     */
    private String detectEngineFromConnection(String connectionCode, DatabaseConnectionManager cm) throws Exception {
        ServerDatabaseSettings dbSettings = cm.getServerDatabaseSettings(connectionCode);
        String dbType = dbSettings.type != null ? dbSettings.type.toLowerCase() : "";

        switch (dbType) {
            case "duckdb":
                log.debug("Auto-detected engine 'duckdb' from connection type '{}'", dbType);
                return "duckdb";
            case "clickhouse":
                log.debug("Auto-detected engine 'clickhouse' from connection type '{}'", dbType);
                return "clickhouse";
            default:
                log.debug("Connection type '{}' is not an OLAP database, falling back to 'browser' engine", dbType);
                return "browser";
        }
    }

    /**
     * Execute a pivot table query.
     *
     * POST /api/analytics/pivot
     *
     * Request body example (Option 1 - recommended):
     * {
     *   "reportId": "piv-northwind-warehouse-duckdb",
     *   "rows": ["country", "city"],
     *   "cols": ["product_category"],
     *   "vals": ["revenue"],
     *   "aggregatorName": "Sum",
     *   "filters": {
     *     "year": ["2023", "2024"]
     *   }
     * }
     *
     * Request body example (Option 2 - legacy):
     * {
     *   "connectionCode": "my-connection",
     *   "tableName": "orders",
     *   "engine": "duckdb",
     *   "rows": ["country", "city"],
     *   "cols": ["product_category"],
     *   "vals": ["revenue"],
     *   "aggregatorName": "Sum"
     * }
     *
     * @param request The pivot configuration
     * @return PivotResponse with aggregated data
     */
    @PostMapping("/pivot")
    public ResponseEntity<?> executePivot(@RequestBody PivotRequest request) throws Exception {
        try (DatabaseConnectionManager cm = ConnectionFactory.newConnectionManager()) {
            DuckDBAnalyticsService duckDBService = new DuckDBAnalyticsService(cm);
            ClickHouseAnalyticsService clickHouseService = new ClickHouseAnalyticsService(cm);

            if (request.getReportId() != null && !request.getReportId().isEmpty()) {
                log.info("Received pivot request for reportCode: {}", request.getReportId());
                resolveConnectionFromReportCode(request, cm);
            } else {
                log.info("Received pivot request for table: {}, engine: {}",
                        request.getTableName(), request.getEngine());
            }

            if (request.getConnectionCode() == null || request.getConnectionCode().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(createErrorResponse("connectionCode is required (or provide reportCode)"));
            }
            if (request.getTableName() == null || request.getTableName().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(createErrorResponse("tableName is required (or provide reportCode)"));
            }

            String engine;
            if (request.getEngine() != null && !request.getEngine().isEmpty()) {
                engine = request.getEngine().toLowerCase();
                log.debug("Using explicitly provided engine: {}", engine);
            } else {
                engine = detectEngineFromConnection(request.getConnectionCode(), cm);
                log.info("Auto-detected engine '{}' from connection '{}'", engine, request.getConnectionCode());
            }

            if ("browser".equals(engine)) {
                log.debug("Engine is 'browser', returning indication for client-side processing");
                Map<String, Object> browserResponse = new HashMap<>();
                browserResponse.put("engine", "browser");
                browserResponse.put("message", "Connection type requires client-side (browser) pivot processing");
                return ResponseEntity.ok(browserResponse);
            }

            PivotResponse response;
            java.util.List<String> availableColumns = null;
            switch (engine) {
                case "clickhouse":
                    log.debug("Routing to ClickHouse analytics service");
                    response = clickHouseService.executePivot(request);
                    availableColumns = clickHouseService.getTableColumns(request.getConnectionCode(), request.getTableName());
                    break;
                case "duckdb":
                default:
                    log.debug("Routing to DuckDB analytics service");
                    response = duckDBService.executePivot(request);
                    availableColumns = duckDBService.getTableColumns(request.getConnectionCode(), request.getTableName());
                    break;
            }

            if (availableColumns != null) {
                response.getMetadata().setAvailableColumns(availableColumns);
            }

            return ResponseEntity.ok(response);
        }
    }

    /**
     * Execute associative exploration — compute associated/excluded values per field
     * given active selections.
     *
     * POST /api/analytics/explore
     *
     * Works transparently across all database types:
     * - DuckDB: fastest (columnar SELECT DISTINCT)
     * - ClickHouse: fast (columnar, backtick quoting)
     * - Regular SQL (MySQL, Postgres, etc.): works fine, just slower on large datasets
     *
     * Unlike /pivot, there is NO "browser" fallback — SELECT DISTINCT is standard SQL
     * that every database handles. The difference is only performance.
     *
     * Request body example:
     * {
     *   "connectionCode": "northwind-duckdb",
     *   "tableName": "orders",
     *   "selections": [
     *     { "field": "ShipCountry", "value": "Germany" }
     *   ],
     *   "fields": ["ShipCountry", "ShipCity", "CategoryName"],
     *   "limit": 500
     * }
     *
     * @param request The explore configuration
     * @return ExploreResponse with per-field associated/excluded states
     */
    @PostMapping("/explore")
    public ResponseEntity<?> explore(@RequestBody ExploreRequest request) throws Exception {
        if (request.getConnectionCode() == null || request.getConnectionCode().isEmpty()) {
            return ResponseEntity.badRequest().body(createErrorResponse("connectionCode is required"));
        }
        if (request.getTableName() == null || request.getTableName().isEmpty()) {
            return ResponseEntity.badRequest().body(createErrorResponse("tableName is required"));
        }
        if (request.getFields() == null || request.getFields().isEmpty()) {
            return ResponseEntity.badRequest().body(createErrorResponse("fields is required (list of fields to explore)"));
        }

        log.info("Received explore request for table: {}, selections: {}, fields: {}",
                request.getTableName(), request.getSelections().size(), request.getFields().size());

        try (DatabaseConnectionManager cm = ConnectionFactory.newConnectionManager()) {
            DuckDBAnalyticsService duckDBService = new DuckDBAnalyticsService(cm);
            ClickHouseAnalyticsService clickHouseService = new ClickHouseAnalyticsService(cm);

            String engine = detectEngineFromConnection(request.getConnectionCode(), cm);

            ExploreResponse response;
            switch (engine) {
                case "clickhouse":
                    log.debug("Routing explore to ClickHouse service");
                    response = clickHouseService.executeExplore(request);
                    break;
                case "duckdb":
                    log.debug("Routing explore to DuckDB service");
                    response = duckDBService.executeExplore(request);
                    break;
                default:
                    log.debug("Routing explore to DuckDB service for regular SQL database (engine: {})", engine);
                    response = duckDBService.executeExplore(request);
                    response.getMetadata().setEngine(engine);
                    response.getMetadata().setHint(
                            "Associative exploration works on all databases. " +
                            "For best performance on large datasets, use a DuckDB or ClickHouse connection.");
                    break;
            }

            return ResponseEntity.ok(response);
        }
    }

    /**
     * Get list of supported aggregators.
     *
     * GET /api/analytics/aggregators
     * GET /api/analytics/aggregators?engine=clickhouse
     *
     * @param engine Optional engine parameter (duckdb or clickhouse)
     * @return List of aggregator names
     */
    @GetMapping("/aggregators")
    public ResponseEntity<List<String>> getSupportedAggregators(
            @RequestParam(defaultValue = "duckdb") String engine) {
        List<String> aggregators;
        if ("clickhouse".equalsIgnoreCase(engine)) {
            aggregators = new ClickHouseAnalyticsService(null).getSupportedAggregators();
        } else {
            aggregators = new DuckDBAnalyticsService(null).getSupportedAggregators();
        }
        return ResponseEntity.ok(aggregators);
    }

    @GetMapping("/aggregators/display-names")
    public ResponseEntity<Map<String, String>> getAggregatorDisplayNames() {
        return ResponseEntity.ok(new DuckDBAnalyticsService(null).getAggregatorDisplayNames());
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        DuckDBAnalyticsService duckDBService = new DuckDBAnalyticsService(null);
        ClickHouseAnalyticsService clickHouseService = new ClickHouseAnalyticsService(null);
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("service", "Analytics (DuckDB + ClickHouse)");
        health.put("engines", Map.of(
            "duckdb", Map.of(
                "supportedAggregators", duckDBService.getSupportedAggregators().size(),
                "cache", duckDBService.getCacheStats()
            ),
            "clickhouse", Map.of(
                "supportedAggregators", clickHouseService.getSupportedAggregators().size(),
                "cache", clickHouseService.getCacheStats()
            )
        ));
        return ResponseEntity.ok(health);
    }

    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats(
            @RequestParam(defaultValue = "duckdb") String engine) {
        Map<String, Object> stats;
        if ("clickhouse".equalsIgnoreCase(engine)) {
            stats = new ClickHouseAnalyticsService(null).getCacheStats();
        } else {
            stats = new DuckDBAnalyticsService(null).getCacheStats();
        }
        return ResponseEntity.ok(stats);
    }

    @DeleteMapping("/cache")
    public ResponseEntity<Map<String, Object>> clearCache(
            @RequestParam(defaultValue = "duckdb") String engine) {
        Map<String, Object> response = new HashMap<>();
        if ("all".equalsIgnoreCase(engine)) {
            new DuckDBAnalyticsService(null).clearCache();
            new ClickHouseAnalyticsService(null).clearCache();
            response.put("message", "All caches cleared successfully");
            response.put("engines", List.of("duckdb", "clickhouse"));
        } else if ("clickhouse".equalsIgnoreCase(engine)) {
            new ClickHouseAnalyticsService(null).clearCache();
            response.put("message", "ClickHouse cache cleared successfully");
            response.put("engine", "clickhouse");
        } else {
            new DuckDBAnalyticsService(null).clearCache();
            response.put("message", "DuckDB cache cleared successfully");
            response.put("engine", "duckdb");
        }
        response.put("timestamp", System.currentTimeMillis());
        return ResponseEntity.ok(response);
    }

    /**
     * Query a file directly (CSV, Parquet, JSON).
     *
     * POST /api/analytics/query-file
     *
     * Request body example:
     * {
     *   "connectionCode": "my-connection",
     *   "filePath": "/path/to/data.csv",
     *   "format": "CSV",
     *   "query": "SELECT * FROM data WHERE amount > 100",
     *   "options": {
     *     "delimiter": ",",
     *     "header": "true"
     *   }
     * }
     *
     * @param request The file query configuration
     * @return Query results
     */
    @PostMapping("/query-file")
    public ResponseEntity<?> queryFile(@RequestBody Map<String, Object> request) throws Exception {
        log.info("Received file query request");

        String connectionCode = (String) request.get("connectionCode");
        String filePath = (String) request.get("filePath");
        String format = (String) request.get("format");
        String query = (String) request.get("query");

        if (connectionCode == null || connectionCode.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("connectionCode is required"));
        }
        if (filePath == null || filePath.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("filePath is required"));
        }
        if (query == null || query.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("query is required"));
        }

        // Detect format if not provided
        DuckDBFileHandler.FileFormat fileFormat;
        if (format == null || format.isEmpty()) {
            fileFormat = DuckDBFileHandler.detectFormat(filePath);
            if (fileFormat == null) {
                return ResponseEntity.badRequest()
                        .body(createErrorResponse("Could not detect file format. Please specify format (CSV, PARQUET, or JSON)"));
            }
        } else {
            fileFormat = DuckDBFileHandler.FileFormat.valueOf(format.toUpperCase());
        }

        // Get options if provided
        @SuppressWarnings("unchecked")
        Map<String, String> options = (Map<String, String>) request.getOrDefault("options", new HashMap<>());

        DuckDBFileHandler.FileQueryConfig config = new DuckDBFileHandler.FileQueryConfig(filePath, fileFormat, options);
        try (DatabaseConnectionManager cm = ConnectionFactory.newConnectionManager()) {
            List<Map<String, Object>> results = new DuckDBAnalyticsService(cm).queryFile(connectionCode, config, query);
            Map<String, Object> response = new HashMap<>();
            response.put("data", results);
            response.put("rowCount", results.size());
            response.put("filePath", filePath);
            response.put("format", fileFormat.name());
            return ResponseEntity.ok(response);
        }
    }

    /**
     * Get schema information from a file.
     *
     * POST /api/analytics/file-schema
     *
     * Request body example:
     * {
     *   "connectionCode": "my-connection",
     *   "filePath": "/path/to/data.csv",
     *   "format": "CSV"
     * }
     *
     * @param request The file schema request
     * @return File schema
     */
    @PostMapping("/file-schema")
    public ResponseEntity<?> getFileSchema(@RequestBody Map<String, Object> request) throws Exception {
        log.info("Received file schema request");

        String connectionCode = (String) request.get("connectionCode");
        String filePath = (String) request.get("filePath");
        String format = (String) request.get("format");

        if (connectionCode == null || connectionCode.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("connectionCode is required"));
        }
        if (filePath == null || filePath.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("filePath is required"));
        }

        // Detect format if not provided
        DuckDBFileHandler.FileFormat fileFormat;
        if (format == null || format.isEmpty()) {
            fileFormat = DuckDBFileHandler.detectFormat(filePath);
            if (fileFormat == null) {
                return ResponseEntity.badRequest()
                        .body(createErrorResponse("Could not detect file format"));
            }
        } else {
            fileFormat = DuckDBFileHandler.FileFormat.valueOf(format.toUpperCase());
        }

        DuckDBFileHandler.FileQueryConfig config = new DuckDBFileHandler.FileQueryConfig(filePath, fileFormat);
        try (DatabaseConnectionManager cm = ConnectionFactory.newConnectionManager()) {
            List<Map<String, String>> schema = new DuckDBAnalyticsService(cm).getFileSchema(connectionCode, config);
            Map<String, Object> response = new HashMap<>();
            response.put("schema", schema);
            response.put("filePath", filePath);
            response.put("format", fileFormat.name());
            return ResponseEntity.ok(response);
        }
    }

    /**
     * Get sample data from a file.
     *
     * POST /api/analytics/file-sample
     *
     * Request body example:
     * {
     *   "connectionCode": "my-connection",
     *   "filePath": "/path/to/data.csv",
     *   "format": "CSV",
     *   "limit": 10
     * }
     *
     * @param request The file sample request
     * @return Sample data
     */
    @PostMapping("/file-sample")
    public ResponseEntity<?> getFileSample(@RequestBody Map<String, Object> request) throws Exception {
        log.info("Received file sample request");

        String connectionCode = (String) request.get("connectionCode");
        String filePath = (String) request.get("filePath");
        String format = (String) request.get("format");
        Integer limit = request.containsKey("limit") ? (Integer) request.get("limit") : 10;

        if (connectionCode == null || connectionCode.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("connectionCode is required"));
        }
        if (filePath == null || filePath.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(createErrorResponse("filePath is required"));
        }

        // Detect format if not provided
        DuckDBFileHandler.FileFormat fileFormat;
        if (format == null || format.isEmpty()) {
            fileFormat = DuckDBFileHandler.detectFormat(filePath);
            if (fileFormat == null) {
                return ResponseEntity.badRequest()
                        .body(createErrorResponse("Could not detect file format"));
            }
        } else {
            fileFormat = DuckDBFileHandler.FileFormat.valueOf(format.toUpperCase());
        }

        DuckDBFileHandler.FileQueryConfig config = new DuckDBFileHandler.FileQueryConfig(filePath, fileFormat);
        try (DatabaseConnectionManager cm = ConnectionFactory.newConnectionManager()) {
            List<Map<String, Object>> sample = new DuckDBAnalyticsService(cm).getFileSample(connectionCode, config, limit);
            Map<String, Object> response = new HashMap<>();
            response.put("data", sample);
            response.put("rowCount", sample.size());
            response.put("filePath", filePath);
            response.put("format", fileFormat.name());
            return ResponseEntity.ok(response);
        }
    }

    private boolean hasCause(Throwable e, String className) {
        Throwable t = e;
        while (t != null) {
            if (t.getClass().getName().equals(className)) return true;
            t = t.getCause();
        }
        return false;
    }

    private Map<String, Object> createErrorResponse(String message) {
        Map<String, Object> error = new HashMap<>();
        error.put("error", message);
        error.put("timestamp", System.currentTimeMillis());
        return error;
    }
}

package com.flowkraft.analytics.services;

import com.flowkraft.common.AppPaths;
import com.flowkraft.analytics.engine.PivotSQLGenerator;
import com.flowkraft.analytics.engine.dto.AggregatorType;
import com.flowkraft.analytics.engine.dto.PivotRequest;
import com.flowkraft.analytics.engine.dto.PivotResponse;
import com.flowkraft.analytics.engine.duckdb.DuckDBFileHandler;
import com.flowkraft.analytics.engine.duckdb.DuckDBPivotProcessor;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.ReportDataResult;
import com.sourcekraft.documentburster.job.CliJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.flowkraft.analytics.engine.dto.ExploreRequest;
import com.flowkraft.analytics.engine.dto.ExploreResponse;

/**
 * Service for executing OLAP analytics queries using DuckDB.
 * Handles pivot table operations with server-side processing.
 */
public class DuckDBAnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(DuckDBAnalyticsService.class);

    private final DatabaseConnectionManager connectionManager;
    private final PivotSQLGenerator sqlGenerator;
    private final DuckDBFileHandler fileHandler;
    private final QueryCache queryCache;

    public DuckDBAnalyticsService(DatabaseConnectionManager connectionManager) {
        this.connectionManager = connectionManager;
        this.sqlGenerator = new DuckDBPivotProcessor();
        this.fileHandler = new DuckDBFileHandler();
        this.queryCache = new QueryCache(100, 5 * 60 * 1000); // 100 entries, 5 minutes TTL
    }

    /**
     * Execute a pivot query and return the aggregated results.
     *
     * @param request The pivot configuration
     * @return PivotResponse with data and metadata
     * @throws Exception if query execution fails
     */
    public PivotResponse executePivot(PivotRequest request) throws Exception {
        log.info("Executing pivot query for table: {}, aggregator: {}",
                request.getTableName(), request.getAggregatorName());

        // Check if this is script-based in-memory data (auto-plumb to DuckDB)
        if ("__SCRIPT_DATA__".equals(request.getTableName())) {
            log.info("Detected script-based data - auto-plumbing DuckDB: script → CSV → CREATE TABLE AS → pivot");
            return executePivotWithScriptData(request);
        }

        long startTime = System.currentTimeMillis();

        // Generate SQL
        String sql = sqlGenerator.generateSQL(request);
        log.debug("Generated SQL: {}", sql);

        // Check cache
        String cacheKey = QueryCache.generateKey(request.getConnectionCode(), sql);
        PivotResponse cachedResponse = queryCache.get(cacheKey);
        if (cachedResponse != null) {
            log.info("Returning cached result for query (cache hit)");
            return cachedResponse;
        }

        // Execute query
        List<Map<String, Object>> results = executeQuery(request.getConnectionCode(), sql);

        // Build response
        PivotResponse response = new PivotResponse();
        response.setData(results);

        // Set metadata
        PivotResponse.PivotMetadata metadata = response.getMetadata();
        metadata.setExecutionTimeMs(System.currentTimeMillis() - startTime);
        metadata.setRowCount(results.size());
        metadata.setAggregatorUsed(request.getAggregatorName());
        metadata.setCached(false);

        log.info("Pivot query completed in {}ms, returned {} rows",
                metadata.getExecutionTimeMs(), metadata.getRowCount());

        // Cache the result
        queryCache.put(cacheKey, response);

        return response;
    }

    /**
     * Execute SQL query and return results as list of maps.
     */
    private List<Map<String, Object>> executeQuery(String connectionCode, String sql) throws Exception {
        List<Map<String, Object>> results = new ArrayList<>();

        try (Connection conn = connectionManager.getJdbcConnection(connectionCode);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            ResultSetMetaData metaData = rs.getMetaData();
            int columnCount = metaData.getColumnCount();

            while (rs.next()) {
                Map<String, Object> row = new HashMap<>();
                for (int i = 1; i <= columnCount; i++) {
                    String columnName = metaData.getColumnName(i);
                    Object value = rs.getObject(i);
                    row.put(columnName, value);
                }
                results.add(row);
            }
        }

        return results;
    }

    /**
     * Get all column names for a table/view.
     */
    public List<String> getTableColumns(String connectionCode, String tableName) throws Exception {
        List<String> columns = new ArrayList<>();
        String sql = "SELECT * FROM \"" + tableName.replace("\"", "\"\"") + "\" LIMIT 0";
        try (Connection conn = connectionManager.getJdbcConnection(connectionCode);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            ResultSetMetaData metaData = rs.getMetaData();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                columns.add(metaData.getColumnName(i));
            }
        }
        return columns;
    }

    /**
     * Get all column names for a table/view using an already-open connection (does not close it).
     * Used by the script-data path, where the scratch table lives only in the in-memory
     * connection and cannot be re-read from a separate one.
     */
    private List<String> getColumnsOnConnection(Connection conn, String tableName) throws Exception {
        List<String> columns = new ArrayList<>();
        String sql = "SELECT * FROM \"" + tableName.replace("\"", "\"\"") + "\" LIMIT 0";
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            ResultSetMetaData metaData = rs.getMetaData();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                columns.add(metaData.getColumnName(i));
            }
        }
        return columns;
    }

    /**
     * Execute associative exploration: for each field, compute associated and excluded values
     * given the current selections.
     *
     * @param request The explore request with selections and target fields
     * @return ExploreResponse with per-field associated/excluded states
     */
    public ExploreResponse executeExplore(ExploreRequest request) throws Exception {
        log.info("Executing explore for table: {}, selections: {}, fields: {}",
                request.getTableName(), request.getSelections().size(), request.getFields().size());

        long startTime = System.currentTimeMillis();
        String tableName = request.getTableName();
        String connectionCode = request.getConnectionCode();
        int limit = request.getLimit() > 0 ? request.getLimit() : 500;

        // Build WHERE clause from selections
        String whereClause = buildExploreWhereClause(request.getSelections());

        Map<String, ExploreResponse.FieldState> fieldStates = new LinkedHashMap<>();

        for (String field : request.getFields()) {
            String quotedField = "\"" + field.replace("\"", "\"\"") + "\"";
            String quotedTable = "\"" + tableName.replace("\"", "\"\"") + "\"";

            // Query 1: All distinct values (unfiltered)
            String allSql = "SELECT DISTINCT " + quotedField
                    + " FROM " + quotedTable
                    + " WHERE " + quotedField + " IS NOT NULL"
                    + " ORDER BY " + quotedField
                    + " LIMIT " + limit;

            List<String> allValues = executeDistinctQuery(connectionCode, allSql, field);

            if (whereClause.isEmpty()) {
                // No selections — everything is associated
                fieldStates.put(field, new ExploreResponse.FieldState(allValues, new ArrayList<>()));
            } else {
                // Query 2: Associated values (filtered by selections)
                String assocSql = "SELECT DISTINCT " + quotedField
                        + " FROM " + quotedTable
                        + " WHERE " + whereClause
                        + " AND " + quotedField + " IS NOT NULL"
                        + " ORDER BY " + quotedField
                        + " LIMIT " + limit;

                List<String> associated = executeDistinctQuery(connectionCode, assocSql, field);

                // Excluded = all - associated
                Set<String> assocSet = new HashSet<>(associated);
                List<String> excluded = allValues.stream()
                        .filter(v -> !assocSet.contains(v))
                        .collect(Collectors.toList());

                fieldStates.put(field, new ExploreResponse.FieldState(associated, excluded));
            }
        }

        ExploreResponse response = new ExploreResponse(fieldStates);
        response.getMetadata().setExecutionTimeMs(System.currentTimeMillis() - startTime);
        response.getMetadata().setEngine("duckdb");

        log.info("Explore completed in {}ms for {} fields",
                response.getMetadata().getExecutionTimeMs(), request.getFields().size());

        return response;
    }

    /**
     * Execute a SELECT DISTINCT query and return values as strings.
     */
    private List<String> executeDistinctQuery(String connectionCode, String sql, String field) throws Exception {
        List<Map<String, Object>> rows = executeQuery(connectionCode, sql);
        List<String> values = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Object val = row.get(field);
            if (val != null) {
                values.add(String.valueOf(val));
            }
        }
        return values;
    }

    /**
     * Build a WHERE clause from explore selections (AND logic).
     * Returns empty string if no selections.
     */
    private String buildExploreWhereClause(List<ExploreRequest.Selection> selections) {
        if (selections == null || selections.isEmpty()) return "";
        List<String> conditions = new ArrayList<>();
        for (ExploreRequest.Selection sel : selections) {
            String quotedField = "\"" + sel.getField().replace("\"", "\"\"") + "\"";
            String escapedValue = sel.getValue().replace("'", "''");
            conditions.add(quotedField + " = '" + escapedValue + "'");
        }
        return String.join(" AND ", conditions);
    }

    /**
     * Get list of supported aggregators.
     */
    public List<String> getSupportedAggregators() {
        return sqlGenerator.getSupportedAggregators();
    }

    /**
     * Check if an aggregator is supported.
     */
    public boolean supportsAggregator(String aggregatorName) {
        return sqlGenerator.supportsAggregator(aggregatorName);
    }

    /**
     * Auto-plumb script-based data to DuckDB using CREATE TABLE AS with CSV.
     *
     * Flow:
     * 1. Execute Groovy script to get in-memory data
     * 2. Convert data to CSV string
     * 3. Use DuckDB's read_csv_auto() to infer schema automatically
     * 4. CREATE TEMP TABLE AS SELECT * FROM read_csv_auto(?) - one statement!
     * 5. Execute normal pivot query on the temp table
     * 6. Temp table auto-drops when connection closes
     */
    private PivotResponse executePivotWithScriptData(PivotRequest request) throws Exception {
        long startTime = System.currentTimeMillis();

        String reportCode = request.getReportId();
        if (reportCode == null || reportCode.isEmpty()) {
            throw new IllegalArgumentException("reportCode is required for script-based reports");
        }

        // Use reportCode as stable table name
        String tableName = sanitizeTableName(reportCode);

        // Step 1: Auto-plumb with DuckDB (check table existence BEFORE executing script).
        // Script data is self-contained (script → CSV → CREATE TABLE → pivot) and never joins
        // any real table, so it needs its own WRITABLE, throwaway DuckDB — NOT the resolved
        // connection, which for this path is the shared sample .duckdb file opened read-only
        // (exclusive-lock avoidance). Writing the scratch table there fails with
        // "Cannot execute statement of type CREATE ... read-only". An in-memory DuckDB is
        // writable, isolated, and auto-dropped when the connection closes.
        try (Connection conn = openWritableInMemoryDuckDb()) {

            // Optimization: Check if table already exists (skip script execution for subsequent requests)
            if (!tableExists(conn, tableName)) {
                log.info("Table '{}' does not exist - executing script and creating table", tableName);

                // Execute Groovy script to get in-memory data
                log.debug("Fetching script data for report: {}", reportCode);
                ReportDataResult scriptResult = fetchReportData(reportCode);
                List<LinkedHashMap<String, Object>> data = scriptResult.reportData;

                if (data == null || data.isEmpty()) {
                    log.warn("Script returned no data for report: {}", reportCode);
                    return createEmptyResponse();
                }

                log.info("Script generated {} rows of data", data.size());

                // Create table with schema inferred from first row
                createTableFromData(conn, tableName, data, scriptResult.reportColumnNames);
                log.info("Created table '{}' with {} rows (schema auto-inferred)", tableName, data.size());
            } else {
                log.info("Table '{}' already exists - reusing (skipping script execution)", tableName);
            }

            // Step 2: Update request to use table and execute normal pivot
            request.setTableName(tableName);
            String pivotSql = sqlGenerator.generateSQL(request);
            log.debug("Generated pivot SQL: {}", pivotSql);

            List<Map<String, Object>> results = executeQueryOnConnection(conn, pivotSql);

            // Build response
            PivotResponse response = new PivotResponse();
            response.setData(results);

            PivotResponse.PivotMetadata metadata = response.getMetadata();
            metadata.setExecutionTimeMs(System.currentTimeMillis() - startTime);
            metadata.setRowCount(results.size());
            metadata.setAggregatorUsed(request.getAggregatorName());
            metadata.setCached(false);

            // Populate availableColumns here while the in-memory scratch table still exists —
            // the connection (and the table) are gone once we return, so the controller must
            // NOT try to re-read them from a separate connection.
            metadata.setAvailableColumns(getColumnsOnConnection(conn, tableName));

            log.info("Auto-plumbed pivot complete: {} result rows in {}ms", results.size(), metadata.getExecutionTimeMs());
            return response;
        }
    }

    /**
     * Open a fresh, writable, in-memory DuckDB connection for materializing script-generated
     * data. An empty JDBC url ("jdbc:duckdb:") means an in-memory database — no file, no lock,
     * discarded when the connection closes. Used only by the script-data auto-plumb path, which
     * must CREATE its scratch table and therefore cannot use the read-only sample connection.
     */
    private Connection openWritableInMemoryDuckDb() throws Exception {
        Class.forName("org.duckdb.DuckDBDriver");
        return DriverManager.getConnection("jdbc:duckdb:");
    }

    /**
     * Execute Groovy script to get in-memory data (reuses existing infrastructure).
     */
    private ReportDataResult fetchReportData(String reportCode) throws Exception {
        // Find report config path (same logic as ReportingService.fetchReportData)
        Path reportsDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "reports", reportCode);
        Path samplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", reportCode);
        Path frendSamplesDir = Paths.get(AppPaths.PORTABLE_EXECUTABLE_DIR_PATH, "config", "samples", "_frend", reportCode);

        Path reportDir = null;
        if (Files.exists(reportsDir)) {
            reportDir = reportsDir;
        } else if (Files.exists(frendSamplesDir)) {
            reportDir = frendSamplesDir;
        } else if (Files.exists(samplesDir)) {
            reportDir = samplesDir;
        }

        if (reportDir == null || !Files.exists(reportDir)) {
            throw new RuntimeException("Report not found: " + reportCode);
        }

        String cfgFilePath = reportDir.resolve("settings.xml").toString();

        // Execute script via CliJob (same as ReportingService.fetchData)
        CliJob cliJob = new CliJob(cfgFilePath);
        return cliJob.doFetchData(null, false);
    }

    /**
     * Convert Java List<Map> to CSV string for DuckDB read_csv_auto().
     * DuckDB will automatically infer schema from the CSV.
     */
    private String convertToCsvString(List<LinkedHashMap<String, Object>> data, List<String> columnNames) {
        if (data == null || data.isEmpty()) {
            return "";
        }

        StringBuilder csv = new StringBuilder();
        List<String> columns = columnNames != null && !columnNames.isEmpty()
            ? columnNames
            : new ArrayList<>(data.get(0).keySet());

        // Header row
        csv.append(String.join(",", columns)).append("\n");

        // Data rows
        for (Map<String, Object> row : data) {
            List<String> values = new ArrayList<>();
            for (String col : columns) {
                Object val = row.get(col);
                String strValue = val != null ? val.toString() : "";
                values.add(escapeCsvValue(strValue));
            }
            csv.append(String.join(",", values)).append("\n");
        }

        return csv.toString();
    }

    /**
     * Escape CSV value (handle commas, quotes, newlines).
     */
    private String escapeCsvValue(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        // If contains special characters, wrap in quotes and escape internal quotes
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }

        return value;
    }

    /**
     * Create DuckDB table from in-memory data with automatic schema inference.
     * Uses batch INSERT for performance.
     */
    private void createTableFromData(Connection conn, String tableName,
                                     List<LinkedHashMap<String, Object>> data,
                                     List<String> columnNames) throws Exception {
        if (data == null || data.isEmpty()) {
            throw new IllegalArgumentException("Cannot create table from empty data");
        }

        List<String> columns = columnNames != null && !columnNames.isEmpty()
            ? columnNames
            : new ArrayList<>(data.get(0).keySet());

        // Infer column types from first row
        Map<String, String> columnTypes = inferColumnTypes(data.get(0), columns);

        // Build CREATE TABLE statement
        StringBuilder createSql = new StringBuilder();
        createSql.append("CREATE TABLE ").append(quoteIdentifier(tableName)).append(" (");

        for (int i = 0; i < columns.size(); i++) {
            if (i > 0) createSql.append(", ");
            String colName = columns.get(i);
            String colType = columnTypes.get(colName);
            createSql.append(quoteIdentifier(colName)).append(" ").append(colType);
        }
        createSql.append(")");

        // Create table
        try (Statement stmt = conn.createStatement()) {
            stmt.execute(createSql.toString());
        }

        // Build INSERT statement with placeholders
        StringBuilder insertSql = new StringBuilder();
        insertSql.append("INSERT INTO ").append(quoteIdentifier(tableName)).append(" VALUES (");
        for (int i = 0; i < columns.size(); i++) {
            if (i > 0) insertSql.append(", ");
            insertSql.append("?");
        }
        insertSql.append(")");

        // Batch insert all rows
        try (PreparedStatement pstmt = conn.prepareStatement(insertSql.toString())) {
            for (Map<String, Object> row : data) {
                for (int i = 0; i < columns.size(); i++) {
                    Object value = row.get(columns.get(i));
                    pstmt.setObject(i + 1, value);
                }
                pstmt.addBatch();
            }
            pstmt.executeBatch();
        }
    }

    /**
     * Infer SQL types from Java objects in first data row.
     */
    private Map<String, String> inferColumnTypes(Map<String, Object> firstRow, List<String> columns) {
        Map<String, String> types = new HashMap<>();
        for (String col : columns) {
            Object value = firstRow.get(col);
            String sqlType = inferSqlType(value);
            types.put(col, sqlType);
        }
        return types;
    }

    /**
     * Infer SQL type from Java object.
     */
    private String inferSqlType(Object value) {
        if (value == null) {
            return "VARCHAR"; // Default to VARCHAR for nulls
        }

        if (value instanceof Integer || value instanceof Long) {
            return "BIGINT";
        } else if (value instanceof Double || value instanceof Float) {
            return "DOUBLE";
        } else if (value instanceof Boolean) {
            return "BOOLEAN";
        } else if (value instanceof java.sql.Date || value instanceof java.sql.Timestamp) {
            return "TIMESTAMP";
        } else {
            return "VARCHAR";
        }
    }

    /**
     * Execute query on existing connection (doesn't close it).
     */
    private List<Map<String, Object>> executeQueryOnConnection(Connection conn, String sql) throws Exception {
        List<Map<String, Object>> results = new ArrayList<>();
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            ResultSetMetaData metaData = rs.getMetaData();
            int columnCount = metaData.getColumnCount();

            while (rs.next()) {
                Map<String, Object> row = new HashMap<>();
                for (int i = 1; i <= columnCount; i++) {
                    String columnName = metaData.getColumnName(i);
                    Object value = rs.getObject(i);
                    row.put(columnName, value);
                }
                results.add(row);
            }
        }
        return results;
    }

    /**
     * Create empty response when script returns no data.
     */
    private PivotResponse createEmptyResponse() {
        PivotResponse response = new PivotResponse();
        response.setData(new ArrayList<>());
        PivotResponse.PivotMetadata metadata = response.getMetadata();
        metadata.setRowCount(0);
        metadata.setExecutionTimeMs(0);
        return response;
    }

    /**
     * Quote identifier for SQL (DuckDB uses double quotes).
     */
    private String quoteIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    /**
     * Sanitize reportCode to use as DuckDB table name.
     * Replaces hyphens and dots with underscores.
     */
    private String sanitizeTableName(String reportCode) {
        if (reportCode == null || reportCode.isEmpty()) {
            throw new IllegalArgumentException("reportCode cannot be null or empty");
        }
        // "piv-sales-region-prod-qtr" → "piv_sales_region_prod_qtr"
        return reportCode.replace("-", "_").replace(".", "_").toLowerCase();
    }

    /**
     * Check if table exists in DuckDB.
     * Uses information_schema.tables for existence check.
     */
    private boolean tableExists(Connection conn, String tableName) throws Exception {
        String query = "SELECT COUNT(1) FROM information_schema.tables WHERE LOWER(table_name) = ?";
        try (PreparedStatement pstmt = conn.prepareStatement(query)) {
            pstmt.setString(1, tableName.toLowerCase());
            try (ResultSet rs = pstmt.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    /**
     * Get aggregator display names for UI.
     */
    public Map<String, String> getAggregatorDisplayNames() {
        Map<String, String> displayNames = new HashMap<>();
        for (AggregatorType type : AggregatorType.values()) {
            displayNames.put(type.name(), type.getDisplayName());
        }
        return displayNames;
    }

    /**
     * Query a file directly (CSV, Parquet, JSON).
     *
     * @param connectionCode Database connection code
     * @param config File query configuration
     * @param query SQL query
     * @return Query results
     * @throws Exception if query execution fails
     */
    public List<Map<String, Object>> queryFile(String connectionCode, DuckDBFileHandler.FileQueryConfig config, String query) throws Exception {
        log.info("Executing file query for: {}, format: {}", config.getFilePath(), config.getFormat());

        try (Connection conn = connectionManager.getJdbcConnection(connectionCode)) {
            return fileHandler.queryFile(conn, config, query);
        }
    }

    /**
     * Get schema information from a file.
     *
     * @param connectionCode Database connection code
     * @param config File query configuration
     * @return List of column information
     * @throws Exception if schema fetch fails
     */
    public List<Map<String, String>> getFileSchema(String connectionCode, DuckDBFileHandler.FileQueryConfig config) throws Exception {
        log.info("Getting schema for file: {}, format: {}", config.getFilePath(), config.getFormat());

        try (Connection conn = connectionManager.getJdbcConnection(connectionCode)) {
            return fileHandler.getFileSchema(conn, config);
        }
    }

    /**
     * Get sample data from a file.
     *
     * @param connectionCode Database connection code
     * @param config File query configuration
     * @param limit Number of rows to return
     * @return Sample data
     * @throws Exception if query fails
     */
    public List<Map<String, Object>> getFileSample(String connectionCode, DuckDBFileHandler.FileQueryConfig config, int limit) throws Exception {
        log.info("Getting sample from file: {}, format: {}, limit: {}", config.getFilePath(), config.getFormat(), limit);

        try (Connection conn = connectionManager.getJdbcConnection(connectionCode)) {
            return fileHandler.getSample(conn, config, limit);
        }
    }

    /**
     * Count rows in a file.
     *
     * @param connectionCode Database connection code
     * @param config File query configuration
     * @return Number of rows
     * @throws Exception if count fails
     */
    public long countFileRows(String connectionCode, DuckDBFileHandler.FileQueryConfig config) throws Exception {
        log.info("Counting rows in file: {}, format: {}", config.getFilePath(), config.getFormat());

        try (Connection conn = connectionManager.getJdbcConnection(connectionCode)) {
            return fileHandler.countRows(conn, config);
        }
    }

    /**
     * Clear query cache.
     */
    public void clearCache() {
        queryCache.clear();
    }

    /**
     * Get cache statistics.
     *
     * @return Map with cache stats
     */
    public Map<String, Object> getCacheStats() {
        return queryCache.getStats();
    }
}

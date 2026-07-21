package com.flowkraft.connections;

import java.io.File;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.queries.ConnectionFactory;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionDatabaseSettings;
import com.sourcekraft.documentburster.utils.Utils;

/**
 * Executes arbitrary Groovy scripts against any configured database connection.
 * All scripts receive three standard bindings: dbSql (groovy.sql.Sql),
 * vendor (uppercase String), log (SLF4J), and params (Map from caller).
 */
@Service
public class GenericSeedExecutor {

    private static final Logger log = LoggerFactory.getLogger(GenericSeedExecutor.class);

    private static final String[] SEED_TABLES = {
        "seed_inv_customer", "seed_inv_product", "seed_inv_invoice", "seed_inv_invoice_line"
    };

    @Autowired
    private ConnectionsService connectionsService;

    @Autowired
    private JobExecutionService jobExecutionService;

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Execute a Groovy script against the given connection — fire-and-forget,
     * exactly like the Burst button: delegates to JobExecutionService.executeAsync()
     * which runs on the job-executor thread pool, creates/deletes the .job file via
     * CliJob._createJobFile(), and sends the on.process.complete WebSocket event.
     *
     * Returns { ok: true, submitted: true } immediately.
     */
    public Map<String, Object> execute(String connectionCode, String script, Map<String, Object> params)
            throws Exception {

        ConnectionFactory.syncPath();
        // Side-effect: materializes the sample connection's XML file on first
        // access for sample connections (`rbt-sample-northwind-*`). Must run
        // before the CLI command tries to load the connection by id.
        connectionsService.prepareConnectionFilePath(connectionCode);

        // Make the source connection code available to the seed script as params.connectionCode.
        // Seed scripts only get dbSql/vendor/log/params bindings — no connection code — yet some
        // (e.g. the billing-portal app-seed writing a DataPallas report) need to know which
        // connection they were launched from to bind a report's <conncode> to it. Don't overwrite
        // a caller-supplied value.
        if (params == null) params = new LinkedHashMap<>();
        params.putIfAbsent("connectionCode", connectionCode);

        // Write script to a temp file — CliJob.doRunSeedScript() reads it by path
        new File(AppPaths.JOBS_DIR_PATH).mkdirs();
        File tempScript = File.createTempFile("seed-", ".groovy", new File(AppPaths.JOBS_DIR_PATH));
        Files.writeString(tempScript.toPath(), script);

        // Build CLI args for the post-refactor structure:
        //   connection run-seed --id <connectionCode> --script-file <path> [-p k=v ...]
        // The old shape (`system run-seed-script --database-connection-file <fullPath>`)
        // was lost when the CLI tree was re-parented under `connection` and switched to
        // `--id` (connection ID) instead of full path. The `connection run-seed`
        // command's call() invokes CliJob.doRunSeedScript() with the same semantics,
        // so we keep the async fire-and-forget pattern; only the args change.
        List<String> argList = new ArrayList<>(Arrays.asList(
                "connection", "run-seed",
                "--id", connectionCode,
                "--script-file", tempScript.getAbsolutePath()
        ));
        if (params != null) {
            for (Map.Entry<String, Object> e : params.entrySet()) {
                argList.add("-p");
                argList.add(e.getKey() + "=" + e.getValue());
            }
        }

        // Fire-and-forget — same pattern as Burst; temp file cleaned up after CLI job finishes
        jobExecutionService.executeAsync(argList.toArray(new String[0]), tempScript::delete);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok",        true);
        result.put("submitted", true);
        return result;
    }

    /**
     * Check whether seed_inv_* tables exist and contain data.
     * Returns { hasSeedData, tables: [{name, count}] }.
     */
    public Map<String, Object> checkSeedStatus(String connectionCode) throws Exception {
        ConnectionFactory.syncPath();
        connectionsService.prepareConnectionFilePath(connectionCode);

        try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
            Connection conn = dbManager.getJdbcConnection(connectionCode);
            try {
                boolean hasSeedData = false;
                List<Map<String, Object>> tables = new ArrayList<>();

                for (String table : SEED_TABLES) {
                    try (Statement stmt = conn.createStatement()) {
                        ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM " + table);
                        if (rs.next()) {
                            long count = rs.getLong(1);
                            Map<String, Object> t = new LinkedHashMap<>();
                            t.put("name",  table);
                            t.put("count", count);
                            tables.add(t);
                            if (count > 0) hasSeedData = true;
                        }
                    } catch (Exception e) {
                        log.debug("Table {} not found or empty: {}", table, e.getMessage());
                    }
                }

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("hasSeedData", hasSeedData);
                result.put("tables",      tables);
                return result;

            } finally {
                try { conn.close(); } catch (Exception ignored) {}
            }
        }
    }

    /**
     * List Groovy seed templates: bundled ones from db/scripts/ plus custom-app
     * seeders from _apps/<app>/_custom/app-seed.groovy (scaffold + seed scripts
     * authored next to each custom app's manifest).
     * Returns [{ id, displayName, description, source }].
     */
    public List<Map<String, Object>> listTemplates() throws Exception {
        List<Map<String, Object>> templates = new ArrayList<>();

        String scriptsDir = Utils.resolvePathAgainstPortableDir("db/scripts");
        File dir = new File(scriptsDir);
        if (!dir.isDirectory()) {
            log.warn("db/scripts/ directory not found at {}", scriptsDir);
        } else {
            File[] groovyFiles = dir.listFiles((d, name) -> name.endsWith(".groovy"));
            if (groovyFiles != null) {
                Arrays.sort(groovyFiles, (a, b) -> a.getName().compareTo(b.getName()));
                for (File f : groovyFiles) {
                    String source      = Files.readString(f.toPath());
                    String id          = f.getName().replace(".groovy", "");
                    String displayName = toDisplayName(id);
                    String description = extractDescription(source);

                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("id",          id);
                    t.put("displayName", displayName);
                    t.put("description", description);
                    t.put("source",      source);
                    templates.add(t);
                }
            }
        }

        // Custom-app seeders — the FlowKraft-shipped examples first, then the user's own apps, in the
        // order Utils.getCustomAppDirs() returns them. Each carries isExample so the Seed-Data dropdown
        // can group them (examples above a separator, the user's own apps below). Display name comes
        // from the sibling app.json manifest's "name" when available.
        for (File appDir : Utils.getCustomAppDirs()) {
            File seedFile = new File(new File(appDir, "_custom"), "app-seed.groovy");
            if (!seedFile.isFile()) continue;

            String source      = Files.readString(seedFile.toPath());
            String displayName = readAppJsonName(new File(new File(appDir, "_custom"), "app.json"));
            if (displayName == null || displayName.isBlank()) displayName = toDisplayName(appDir.getName());

            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id",          "app-" + appDir.getName());
            t.put("displayName", displayName);
            t.put("description", extractDescription(source));
            t.put("source",      source);
            t.put("isExample",   Utils.isExampleAppDir(appDir));
            templates.add(t);
        }
        return templates;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String resolveVendorType(String connectionCode) throws Exception {
        ConnectionFactory.syncPath();
        Settings settings = new Settings(
                Utils.resolvePathAgainstPortableDir("config/burst/settings.xml"));
        ConnectionFactory.syncPath(); // re-sync after Settings constructor (mirrors ConnectionFactory.newConnectionManager)
        settings.loadSettings();
        DocumentBursterConnectionDatabaseSettings dbSettings =
                settings.loadSettingsConnectionDatabase(connectionCode);
        return normalizeVendorType(dbSettings.connection.databaseserver.type);
    }

    private String normalizeVendorType(String type) {
        if (type == null) return "UNKNOWN";
        switch (type.toLowerCase()) {
            case "postgres": case "postgresql": return "POSTGRES";
            case "mysql":                        return "MYSQL";
            case "mariadb":                      return "MARIADB";
            case "sqlserver":                    return "SQLSERVER";
            case "oracle":                       return "ORACLE";
            case "ibmdb2": case "db2":           return "DB2";
            case "clickhouse":                   return "CLICKHOUSE";
            case "sqlite":                       return "SQLITE";
            case "duckdb":                       return "DUCKDB";
            case "supabase":                     return "SUPABASE";
            case "timescaledb":                  return "TIMESCALEDB";
            default: return type.toUpperCase();
        }
    }

    private Map<String, Long> queryRowCounts(Connection conn) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String table : SEED_TABLES) {
            try (Statement stmt = conn.createStatement()) {
                ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM " + table);
                counts.put(table, rs.next() ? rs.getLong(1) : 0L);
            } catch (Exception e) {
                counts.put(table, -1L);
            }
        }
        return counts;
    }

    private String toDisplayName(String id) {
        StringBuilder sb = new StringBuilder();
        for (String part : id.split("-")) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.toString();
    }

    private String extractDescription(String source) {
        for (String line : source.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("// @description ")) {
                return trimmed.substring("// @description ".length()).trim();
            }
        }
        return "";
    }

    /** Read the "name" field from an app.json manifest; null when missing or unparseable. */
    private String readAppJsonName(File appJson) {
        if (!appJson.isFile()) return null;
        try {
            JsonNode node = new ObjectMapper().readTree(appJson);
            return node.hasNonNull("name") ? node.get("name").asText() : null;
        } catch (Exception e) {
            log.warn("Could not parse {}: {}", appJson, e.getMessage());
            return null;
        }
    }

}

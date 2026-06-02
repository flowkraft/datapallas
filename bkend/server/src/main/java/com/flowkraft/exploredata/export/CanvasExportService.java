package com.flowkraft.exploredata.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.exploredata.ExploreDataService;
import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;
import com.sourcekraft.documentburster.utils.Utils;
import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

/**
 * Orchestrates the full "Save to DataPallas" export pipeline for a canvas.
 *
 * <p>Flow:
 * <ol>
 *   <li>Assemble + compile-check {@code {reportId}-script.groovy} via
 *       {@link ScriptAssembler} — atomic fail-fast: nothing is written to disk
 *       until this passes.</li>
 *   <li>Delete any existing report with the same {@code reportId} (idempotent —
 *       this is the "clean-sweep": all stale widget configs are removed because
 *       the entire folder is deleted and recreated from scratch).</li>
 *   <li>Create report folder + {@code settings.xml} via
 *       {@link ReportsService#createConfiguration}.</li>
 *   <li>Set {@code burstfilename = "dashboard.html"} in the generated settings.xml.</li>
 *   <li>Overwrite {@code reporting.xml} with the dashboard-specific version
 *       (datasource type {@code ds.dashboard}, connection code, script path).</li>
 *   <li>Write the ScriptAssembler-generated dispatcher script.</li>
 *   <li>Generate and write all sidecar files (HTML template, chart/table/pivot
 *       DSL configs, JSON sidecars) server-side via {@link DashboardFileGenerator}.</li>
 *   <li>Update {@code exportedReportCode} in the canvas DB record (best-effort —
 *       files are already written, so a DB failure does not abort the export).</li>
 * </ol>
 */
@Service
public class CanvasExportService {

    private static final Logger log = LoggerFactory.getLogger(CanvasExportService.class);

    @Autowired
    private ReportsService reportsService;

    @Autowired
    private ExploreDataService dataCanvasService;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${rb.api.base-url:http://localhost:9090/api}")
    private String rbApiBaseUrl;

    // ── Public entry point ────────────────────────────────────────────────────

    /**
     * Exports the canvas identified by {@code canvasId} to a DataPallas
     * dashboard.  All data is read from SQLite — no request body is needed.
     *
     * <p>The dashboard slug ({@code reportId}) is derived server-side:
     * <ul>
     *   <li>If the canvas has an {@code exportedReportCode} from a prior export,
     *       that slug is reused — guaranteeing the same folder is overwritten.</li>
     *   <li>Otherwise the canvas {@code name} is slugified (lower-case, hyphens)
     *       to produce the slug for the first export.</li>
     * </ul>
     *
     * @param canvasId  the canvas ID (path variable)
     * @return {@code { success: true, reportId, dashboardUrl }} on success
     * @throws Exception for any I/O, configuration, or Groovy compile error
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> export(String canvasId) throws Exception {

        // ── Load everything from SQLite (auto-saved bulletproof by the client) ─
        // generatedSql for visual-mode widgets is written to the store (and
        // therefore to SQLite) every time the user edits a visual query in
        // VisualQueryBuilder — it is NOT transient.  No need to re-derive it.
        Map<String, Object> canvas = dataCanvasService.getCanvas(canvasId)
                .orElseThrow(() -> new IllegalArgumentException("Canvas not found: " + canvasId));

        String canvasName   = (String) canvas.getOrDefault("name", "untitled");
        String connectionId = (String) canvas.getOrDefault("connectionId", "");
        if (connectionId == null) connectionId = "";

        // Reuse the prior slug on re-export; slugify the name on first export.
        String exportedCode = (String) canvas.get("exportedReportCode");
        String reportId = (exportedCode != null && !exportedCode.isBlank())
                ? exportedCode
                : slugify(canvasName);

        String stateJson = (String) canvas.getOrDefault("state", "{}");
        Map<String, Object> stateMap = objectMapper.readValue(stateJson, Map.class);

        List<Map<String, Object>> widgets =
                (List<Map<String, Object>>) stateMap.getOrDefault("widgets", List.of());
        // Single source of truth: parametersConfig Map. The DSL text is
        // serialized server-side at publish time via DashboardFileGenerator.
        Map<String, Object> parametersConfig = (Map<String, Object>)
                stateMap.getOrDefault("parametersConfig", Map.of("parameters", List.of()));
        List<Map<String, Object>> parametersList = (List<Map<String, Object>>)
                parametersConfig.getOrDefault("parameters", List.of());

        // ── Step 1: Compile check (before touching disk) ──────────────────────
        ScriptAssembler.AssembledScript assembled = ScriptAssembler.assemble(widgets, parametersList);

        // ── Step 2: Delete existing report (clean-sweep + idempotent) ─────────
        try { reportsService.deleteConfiguration(reportId); } catch (Exception ignored) {}

        // ── Define paths (used from Step 3 onwards) ───────────────────────────
        String configDir   = Utils.resolvePathAgainstPortableDir("config/reports/"   + reportId);
        String templateDir = Utils.resolvePathAgainstPortableDir("templates/reports/" + reportId);

        // ── Step 3: Create report folder + settings.xml + default reporting.xml ─
        reportsService.createConfiguration(reportId, canvasName, false, true, null);

        // ── Step 3.1: Set burstfilename = "dashboard.html" in settings.xml ────
        String settingsPath = configDir + "/settings.xml";
        DocumentBursterSettings docSettings = reportsService.loadSettings(settingsPath);
        docSettings.settings.burstfilename = "dashboard.html";
        reportsService.saveSettings(docSettings, settingsPath);

        // ── Step 4: Overwrite reporting.xml with dashboard-specific version ────
        generateDashboardReportingXml(configDir + "/reporting.xml", reportId, connectionId);

        // ── Step 5: Write the ScriptAssembler-generated dispatcher script ──────
        writeFile(configDir + "/" + reportId + "-script.groovy", assembled.text());

        // ── Step 6: Generate + write all sidecar files server-side ────────────
        DashboardFileGenerator.GeneratedFiles files = DashboardFileGenerator.generate(
                widgets, parametersList, reportId, rbApiBaseUrl);

        writeIfPresent(templateDir, reportId + "-template.html",                 files.templateHtml());
        writeIfPresent(configDir,   reportId + "-chart-config.groovy",           files.chartConfigGroovy());
        writeIfPresent(configDir,   reportId + "-tabulator-config.groovy",       files.tabulatorConfigGroovy());
        writeIfPresent(configDir,   reportId + "-pivot-config.groovy",           files.pivotConfigGroovy());
        writeIfPresent(configDir,   reportId + "-filterpane-config.groovy",      files.filterPaneConfigGroovy());
        writeIfPresent(configDir,   reportId + "-report-parameters-spec.groovy", files.parametersSpecGroovy());
        writeIfPresent(configDir,   reportId + "-value-config.json",             files.valueConfigJson());
        writeIfPresent(configDir,   reportId + "-map-config.json",               files.mapConfigJson());
        writeIfPresent(configDir,   reportId + "-sankey-config.json",            files.sankeyConfigJson());
        writeIfPresent(configDir,   reportId + "-gauge-config.json",             files.gaugeConfigJson());
        writeIfPresent(configDir,   reportId + "-trend-config.json",             files.trendConfigJson());
        writeIfPresent(configDir,   reportId + "-progress-config.json",          files.progressConfigJson());
        writeIfPresent(configDir,   reportId + "-detail-config.json",            files.detailConfigJson());

        // ── Step 7: Update exportedReportCode in DB (best-effort) ─────────────
        try {
            dataCanvasService.updateCanvas(canvasId, Map.of("exportedReportCode", reportId));
        } catch (Exception e) {
            log.warn("Could not update exportedReportCode for canvas {}: {}", canvasId, e.getMessage());
        }

        // Absolute URL so the frontend link (and e2e tests) open the Java-served
        // dashboard page on port 9090 — not the Next.js app on 8440 which would 404.
        String host = rbApiBaseUrl.replaceFirst("/api/?$", "");
        return Map.of(
                "success",      true,
                "reportId",     reportId,
                "dashboardUrl", host + "/dashboard/" + reportId
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Generates a dashboard-specific {@code reporting.xml} by loading the
     * {@code _defaults/reporting.xml} via JAXB, overriding only the fields
     * that differ for dashboards, then saving to the target path.
     */
    private static void generateDashboardReportingXml(String targetPath,
                                                      String reportId,
                                                      String connectionId) throws Exception {
        String defaultsDir = Utils.resolvePathAgainstPortableDir("config/_defaults");
        JAXBContext jc = JAXBContext.newInstance(ReportingSettings.class);
        Unmarshaller unmarshaller = jc.createUnmarshaller();
        ReportingSettings settings = (ReportingSettings) unmarshaller.unmarshal(
                new File(defaultsDir, "reporting.xml"));

        var ds = settings.report.datasource;
        ds.type = "ds.dashboard";
        ds.scriptoptions.conncode = connectionId;
        ds.scriptoptions.scriptname = reportId + "-script.groovy";
        ds.sqloptions.conncode = connectionId;
        ds.sqloptions.scriptname = reportId + "-script.groovy";

        var tmpl = settings.report.template;
        tmpl.outputtype = "output.dashboard";
        tmpl.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";

        Marshaller marshaller = jc.createMarshaller();
        marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
        try (OutputStream os = new FileOutputStream(targetPath)) {
            marshaller.marshal(settings, os);
        }
    }

    /**
     * Returns the HTML template content for a dashboard.
     *
     * @param reportId the dashboard slug
     * @return template HTML string, or {@code null} if not found
     */
    public String getTemplateHtml(String reportId) throws IOException {
        Path path = Paths.get(
            Utils.resolvePathAgainstPortableDir("templates/reports/" + reportId + "/" + reportId + "-template.html")
        );
        if (!Files.exists(path)) return null;
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static void writeFile(String filePath, String content) throws IOException {
        Path path = Paths.get(filePath);
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }

    private static void writeIfPresent(String dir, String filename, String content) throws IOException {
        if (content != null && !content.isBlank()) {
            writeFile(dir + "/" + filename, content);
        }
    }

    /** Mirrors the TypeScript slugify() in ExportDialog.tsx. */
    private static String slugify(String text) {
        String s = text.toLowerCase()
                       .replaceAll("[^a-z0-9]+", "-")
                       .replaceAll("^-|-$", "");
        return s.substring(0, Math.min(50, s.length()));
    }
}

package com.flowkraft.exploredata.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.reporting.dsl.common.BlockFormEmitter;
import com.flowkraft.reporting.dsl.common.BlockFormRules;
import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Generates all dashboard sidecar files (HTML template, Groovy DSL configs,
 * JSON sidecars) from canvas widget state. Mirrors the TypeScript
 * {@code exportGenerator.ts} so that file generation moves fully server-side
 * and the client no longer needs to send generated content over the wire.
 *
 * <p>See {@link com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme#iAmImportantReadme()}
 * for the DSL architecture principles + GOOD/BAD examples. Static init below
 * compile-pins this class to that readme.
 *
 * <p>Every Groovy-DSL output here goes through {@link BlockFormEmitter} —
 * NEVER hand-rolled {@code sb.append}. Each widget's DSL is built from its
 * canonical Map at displayConfig.dslConfig (Principle 4 — same Map that flows
 * to the canvas widget render).
 */
@SuppressWarnings("unchecked")
public class DashboardFileGenerator {

    static { com.flowkraft.reporting.dsl.common.DSLPrinciplesReadme.iAmImportantReadme(); }

    private static final ObjectMapper JSON = new ObjectMapper();

    // Markdown → HTML for text-block widgets. GFM tables extension mirrors the
    // `remark-gfm` plugin the editor uses (react-markdown side), so published
    // output matches the canvas preview. Parser/renderer are thread-safe per
    // commonmark-java docs, so one shared instance is enough.
    private static final List<Extension> MARKDOWN_EXTENSIONS = List.of(TablesExtension.create());
    private static final Parser MARKDOWN_PARSER = Parser.builder().extensions(MARKDOWN_EXTENSIONS).build();
    private static final HtmlRenderer MARKDOWN_RENDERER = HtmlRenderer.builder().extensions(MARKDOWN_EXTENSIONS).build();

    public record GeneratedFiles(
        String templateHtml,
        String chartConfigGroovy,
        String tabulatorConfigGroovy,
        String pivotConfigGroovy,
        String filterPaneConfigGroovy,
        String parametersSpecGroovy,
        String valueConfigJson,
        String mapConfigJson,
        String sankeyConfigJson,
        String gaugeConfigJson,
        String trendConfigJson,
        String progressConfigJson,
        String detailConfigJson,
        String cubeWidgetsJson
    ) {}

    public static GeneratedFiles generate(
            List<Map<String, Object>> widgets,
            List<Map<String, Object>> parametersList,
            String reportId,
            String apiBaseUrl,
            String connectionId) throws Exception {

        // Single source of truth (Principle 4): parametersConfig.parameters Map.
        // Serialize to canonical DSL text for the published spec file.
        List<Map<String, Object>> safeParams = parametersList != null ? parametersList : List.of();
        String parametersSpec = "";
        if (!safeParams.isEmpty()) {
            Map<String, Object> opts = new LinkedHashMap<>();
            opts.put("parameters", safeParams);
            parametersSpec = BlockFormEmitter.emit("reportParameters", opts, BlockFormRules.REPORTPARAMETERS);
        }

        return new GeneratedFiles(
            generateTemplate(widgets, !safeParams.isEmpty(), reportId, apiBaseUrl),
            generateChartConfig(byType(widgets, "chart")),
            generateTabulatorConfig(byType(widgets, "tabulator")),
            generatePivotConfig(byType(widgets, "pivot")),
            generateFilterPaneConfig(byType(widgets, "filter-pane")),
            parametersSpec,
            generateValueConfig(byType(widgets, "number")),
            generateMapConfig(byType(widgets, "map")),
            generateJsonSidecar(byType(widgets, "sankey"),   "sourceField", "targetField", "valueField", "nodePadding", "nodeWidth", "palette"),
            generateGaugeConfig(byType(widgets, "gauge")),
            generateJsonSidecar(byType(widgets, "trend"),    "dateField", "valueField", "format", "label"),
            generateJsonSidecar(byType(widgets, "progress"), "field", "goal", "label", "format", "color"),
            generateJsonSidecar(byType(widgets, "detail"),   "hiddenColumns", "rowIndex"),
            // The live cubes this dashboard declares - the file the runtime reads its cube, its
            // cube name and its connection from, and never from a request.
            LiveCubeWidgets.json(widgets, DashboardFileGenerator::componentId, connectionId)
        );
    }

    // ── HTML Template ─────────────────────────────────────────────────────────

    private static String generateTemplate(List<Map<String, Object>> widgets,
                                           boolean hasParameters, String reportId, String apiBaseUrl) {
        List<Map<String, Object>> sorted = widgets.stream()
            .sorted(Comparator.comparingInt((Map<String, Object> w) -> gridInt(w, "y"))
                              .thenComparingInt(w -> gridInt(w, "x")))
            .collect(Collectors.toList());

        StringBuilder components = new StringBuilder();
        for (Map<String, Object> w : sorted) {
            String html = widgetHtml(w, reportId, apiBaseUrl);
            if (html != null && !html.isBlank()) {
                components.append(html).append("\n");
            }
        }

        // D11: one database picker for the page, where a page has a cube tile to write SQL for.
        // It is the tiles that say what there is to choose from, so a dashboard whose cubes show no
        // SQL draws the element and it shows nothing at all.
        String vendorHtml = sorted.stream().noneMatch(LiveCubeWidgets::isLive) ? "" :
            "    <div class=\"rb-page-bar\">\n" +
            "      <rb-sql-vendor></rb-sql-vendor>\n" +
            "    </div>";

        String paramsHtml = !hasParameters ? "" :
            String.format("    <div id=\"parameterBarContainer\" class=\"params-bar\">\n" +
                          "      <rb-parameters report-id=\"%s\" api-base-url=\"%s\" show-reload=\"true\"></rb-parameters>\n" +
                          "    </div>", reportId, apiBaseUrl);

        // Every colour below is a daisyUI variable with the colour it used to be as its fallback, so
        // one dashboard file serves both places it is opened: inside a DataPallas page, where <html>
        // names a theme and the palette comes from it, and on somebody else's site or straight off
        // disk, where nothing names a theme and the page looks exactly as it did (D10).
        return "<meta charset=\"utf-8\">\n" +
               "<div class=\"rb-dashboard-root\">\n" +
               "  <style>\n" +
               "    .rb-dashboard-root {\n" +
               "      all: initial;\n" +
               "      display: block;\n" +
               "      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;\n" +
               "      box-sizing: border-box;\n" +
               "      color: var(--color-base-content, #1e293b);\n" +
               "      background: var(--color-base-200, #f8fafc);\n" +
               "      padding: 24px;\n" +
               "    }\n" +
               "    .rb-dashboard-root *, .rb-dashboard-root *::before, .rb-dashboard-root *::after {\n" +
               "      box-sizing: inherit;\n" +
               "    }\n" +
               "    .rb-dashboard-root .dashboard-grid {\n" +
               "      display: grid;\n" +
               "      grid-template-columns: repeat(12, 1fr);\n" +
               "      gap: 16px;\n" +
               "      grid-auto-rows: minmax(80px, auto);\n" +
               "    }\n" +
               "    .rb-dashboard-root .grid-item {\n" +
               "      background: var(--color-base-100, #ffffff);\n" +
               "      border: 1px solid var(--color-base-300, #e2e8f0);\n" +
               "      border-radius: 8px;\n" +
               "      padding: 16px;\n" +
               "      overflow: hidden;\n" +
               "    }\n" +
               "    .rb-dashboard-root .number-card {\n" +
               "      display: flex;\n" +
               "      flex-direction: column;\n" +
               "      align-items: flex-start;\n" +
               "      justify-content: center;\n" +
               "      background: var(--color-base-100, #ffffff);\n" +
               "      border: 1px solid var(--color-base-300, #e2e8f0);\n" +
               "      border-radius: 10px;\n" +
               "      padding: 20px 22px;\n" +
               "      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);\n" +
               "      position: relative;\n" +
               "      overflow: hidden;\n" +
               "    }\n" +
               "    .rb-dashboard-root .number-card::before,\n" +
               "    .rb-dashboard-root .kpi-card::before {\n" +
               "      content: '';\n" +
               "      position: absolute;\n" +
               "      top: 0; left: 0; right: 0;\n" +
               "      height: 3px;\n" +
               "      background: var(--color-primary, #0f766e);\n" +
               "    }\n" +
               "    .rb-dashboard-root .kpi-card {\n" +
               "      background: var(--color-base-100, #ffffff);\n" +
               "      border: 1px solid var(--color-base-300, #e2e8f0);\n" +
               "      border-radius: 10px;\n" +
               "      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);\n" +
               "      position: relative;\n" +
               "      overflow: hidden;\n" +
               "    }\n" +
               "    .rb-dashboard-root .number-label {\n" +
               "      font-size: 11px;\n" +
               "      font-weight: 600;\n" +
               "      text-transform: uppercase;\n" +
               "      letter-spacing: 0.6px;\n" +
               "      color: var(--color-base-content, #94a3b8);\n" +
               "      margin: 0 0 6px 0;\n" +
               "    }\n" +
               "    .rb-dashboard-root .number-value {\n" +
               "      font-size: 28px;\n" +
               "      font-weight: 800;\n" +
               "      color: var(--color-primary, #064e3b);\n" +
               "      margin: 0;\n" +
               "      line-height: 1.1;\n" +
               "    }\n" +
               "    .rb-dashboard-root .text-block {\n" +
               "      font-size: 14px;\n" +
               "      line-height: 1.6;\n" +
               "      color: var(--color-base-content, #334155);\n" +
               "    }\n" +
               "    .rb-dashboard-root .text-block h1 { font-size: 1.75em; font-weight: 700; margin: 0 0 0.5em; color: var(--color-base-content, #0f172a); }\n" +
               "    .rb-dashboard-root .text-block h2 { font-size: 1.4em; font-weight: 700; margin: 0 0 0.5em; color: var(--color-base-content, #0f172a); }\n" +
               "    .rb-dashboard-root .text-block h3 { font-size: 1.15em; font-weight: 600; margin: 0 0 0.4em; color: var(--color-base-content, #0f172a); }\n" +
               "    .rb-dashboard-root .text-block p { margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .text-block ul { list-style: disc; padding-left: 1.5em; margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .text-block ol { list-style: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .text-block li { margin-bottom: 0.25em; }\n" +
               "    .rb-dashboard-root .text-block a { color: var(--color-primary, #2563eb); text-decoration: underline; }\n" +
               "    .rb-dashboard-root .text-block strong { font-weight: 600; }\n" +
               "    .rb-dashboard-root .text-block em { font-style: italic; }\n" +
               "    .rb-dashboard-root .text-block code { background: var(--color-base-200, #f1f5f9); padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }\n" +
               "    .rb-dashboard-root .text-block pre { background: var(--color-base-200, #f1f5f9); padding: 0.75em; border-radius: 4px; overflow: auto; margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .text-block pre code { background: transparent; padding: 0; }\n" +
               "    .rb-dashboard-root .text-block table { border-collapse: collapse; width: 100%; margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .text-block th { border: 1px solid var(--color-base-300, #e2e8f0); padding: 0.4em 0.6em; background: var(--color-base-200, #f8fafc); font-weight: 600; text-align: left; }\n" +
               "    .rb-dashboard-root .text-block td { border: 1px solid var(--color-base-300, #e2e8f0); padding: 0.4em 0.6em; }\n" +
               "    .rb-dashboard-root .text-block blockquote { border-left: 3px solid var(--color-base-300, #e2e8f0); padding-left: 0.75em; color: var(--color-base-content, #64748b); margin: 0 0 0.75em; }\n" +
               "    .rb-dashboard-root .divider {\n" +
               "      border: none;\n" +
               "      border-top: 1px solid var(--color-base-300, #e2e8f0);\n" +
               "      margin: 8px 0;\n" +
               "    }\n" +
               "    .rb-dashboard-root .params-bar {\n" +
               "      margin-bottom: 20px;\n" +
               "    }\n" +
               "    .rb-dashboard-root .rb-page-bar {\n" +
               "      display: flex;\n" +
               "      justify-content: flex-end;\n" +
               "      margin-bottom: 12px;\n" +
               "    }\n" +
               "  </style>\n\n" +
               (vendorHtml.isBlank() ? "" : vendorHtml + "\n") +
               (paramsHtml.isBlank() ? "" : paramsHtml + "\n") +
               "  <div class=\"dashboard-grid\">\n" +
               components +
               "  </div>\n" +
               "</div>\n";
    }

    private static String widgetHtml(Map<String, Object> w, String reportId, String apiBaseUrl) {
        String type  = str(w, "type");
        String id    = componentId(w);
        int    x     = gridInt(w, "x");
        int    y     = gridInt(w, "y");
        int    col   = gridInt(w, "w");
        int    row   = gridInt(w, "h");
        String attrs = String.format("report-id=\"%s\" api-base-url=\"%s\" component-id=\"%s\"", reportId, apiBaseUrl, id);
        // CSS Grid is 1-indexed, react-grid-layout x/y are 0-indexed → +1.
        // Explicit start positions (not just span) so the canvas layout is
        // preserved instead of the browser auto-flowing items left-to-right.
        String style = String.format(
            "grid-column: %d / span %d; grid-row: %d / span %d;",
            x + 1, col, y + 1, row);

        // Charts (<rb-chart>) have no intrinsic content height — Chart.js sizes
        // its canvas from the parent, the parent's auto-row sizes to canvas →
        // circular dependency resolves at Chart.js's ~300px default, far less
        // than the h spans intended. Emit an explicit min-height proportional
        // to the row span (80px per row matches grid-auto-rows' minimum) so the
        // chart fills its allotted vertical real estate.
        String chartStyle = style + String.format(" min-height: %dpx;", row * 80);

        // Show In Dashboard: this widget is the cube, whatever type the widget picker says. The
        // type only decides how the result under the field tree is drawn, and that travels in the
        // `display` of its -cube-widgets.json entry, not in the markup. The field tree needs the
        // height a chart needs, for the same reason: nothing here has an intrinsic one.
        if (LiveCubeWidgets.isLive(w))
            return String.format(
                "    <div class=\"grid-item\" style=\"%s\">\n      <rb-cube-renderer %s></rb-cube-renderer>\n    </div>",
                chartStyle, attrs);

        return switch (type) {
            case "chart" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-chart %s></rb-chart>\n    </div>", chartStyle, attrs);
            case "tabulator" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-tabulator %s></rb-tabulator>\n    </div>", style, attrs);
            case "pivot" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-pivot-table %s></rb-pivot-table>\n    </div>", style, attrs);
            case "number" -> {
                Map<String, Object> dc = displayConfig(w);
                String numberField  = resolveNumberField(w, dc);
                String numberFormat = strOr(dc, "numberFormat", "");
                if (numberFormat.isEmpty())
                    numberFormat = isCurrencyFieldName(numberField) ? "currency" : "number";
                String numberLabel  = strOr(dc, "numberLabel",  numberField);
                yield String.format(
                    "    <div class=\"grid-item number-card\" style=\"%s\">\n" +
                    "      <p class=\"number-label\">%s</p>\n" +
                    "      <p class=\"number-value\"><rb-value %s field=\"%s\" format=\"%s\"></rb-value></p>\n" +
                    "    </div>", style,
                    numberLabel, attrs, numberField, numberFormat);
            }
            case "map" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-map %s></rb-map>\n    </div>", style, attrs);
            case "sankey" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-sankey %s></rb-sankey>\n    </div>", style, attrs);
            case "gauge" ->
                String.format("    <div class=\"grid-item kpi-card\" style=\"%s\">\n      <rb-gauge %s></rb-gauge>\n    </div>", style, attrs);
            case "trend" ->
                String.format("    <div class=\"grid-item kpi-card\" style=\"%s\">\n      <rb-trend %s></rb-trend>\n    </div>", style, attrs);
            case "progress" ->
                String.format("    <div class=\"grid-item kpi-card\" style=\"%s\">\n      <rb-progress %s></rb-progress>\n    </div>", style, attrs);
            case "detail" ->
                String.format("    <div class=\"grid-item\" style=\"%s\">\n      <rb-detail %s></rb-detail>\n    </div>", style, attrs);
            case "text" -> {
                Map<String, Object> dc = displayConfig(w);
                String markdown = strOr(dc, "textContent", "");
                String html = MARKDOWN_RENDERER.render(MARKDOWN_PARSER.parse(markdown));
                yield String.format(
                    "    <div class=\"grid-item\" style=\"%s\">\n      <div class=\"text-block\">%s</div>\n    </div>",
                    style, html);
            }
            case "filter-pane" -> {
                Map<String, Object> dc = displayConfig(w);
                yield String.format(
                    "    <div class=\"grid-item\" style=\"%s\">\n      <rb-filter-pane %s field=\"%s\" table-name=\"%s\" connection-code=\"\"></rb-filter-pane>\n    </div>",
                    style, attrs, strOr(dc, "filterField", ""), visualQueryTable(w));
            }
            case "divider" ->
                String.format(
                    "    <div class=\"grid-item\" style=\"%s\">\n      <hr class=\"divider\" />\n    </div>",
                    style);
            case "iframe" -> {
                Map<String, Object> dc = displayConfig(w);
                String url = escapeHtmlAttr(strOr(dc, "iframeUrl", ""));
                if (url.isBlank()) yield "";
                yield String.format(
                    "    <div class=\"grid-item\" style=\"%s; padding: 0;\">\n" +
                    "      <iframe src=\"%s\" title=\"%s\" sandbox=\"%s\" referrerpolicy=\"no-referrer\" loading=\"lazy\" style=\"width:100%%; height:100%%; border:0; display:block;\"></iframe>\n" +
                    "    </div>", style, url,
                    escapeHtmlAttr(strOr(dc, "iframeTitle", "Embedded content")),
                    escapeHtmlAttr(strOr(dc, "iframeSandbox", "allow-scripts allow-same-origin allow-popups allow-forms")));
            }
            default -> "";
        };
    }

    // ── Chart Config (Groovy DSL) ─────────────────────────────────────────────

    private static String generateChartConfig(List<Map<String, Object>> charts) {
        if (charts.isEmpty()) return "";
        return charts.stream().map(w -> {
            String id = componentId(w);
            Map<String, Object> cfg = displayConfig(w);
            // Single source of truth: displayConfig.dslConfig (Map). See
            // Principle 4 in DSLPrinciplesReadme.java.
            Object dslConfig = cfg.get("dslConfig");
            if (dslConfig instanceof Map<?, ?> map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> opts = (Map<String, Object>) map;
                return BlockFormEmitter.emitNamed("chart", id, opts, BlockFormRules.CHART);
            }
            // Empty fallback — widget never opened in canvas, so no Map yet.
            Map<String, Object> opts = new LinkedHashMap<>();
            opts.put("type", "bar");
            return BlockFormEmitter.emitNamed("chart", id, opts, BlockFormRules.CHART);
        }).collect(Collectors.joining("\n\n"));
    }

    // ── Tabulator Config (Groovy DSL) ─────────────────────────────────────────

    private static String generateTabulatorConfig(List<Map<String, Object>> tabulators) {
        if (tabulators.isEmpty()) return "";
        return tabulators.stream().map(w -> {
            String id = componentId(w);
            Map<String, Object> cfg = displayConfig(w);
            // Single source of truth: displayConfig.dslConfig (Map). See
            // Principle 4 in DSLPrinciplesReadme.java. The canvas's lazy
            // migration ensures dslConfig is populated for every widget the
            // first time it's rendered — by the time the publisher runs,
            // every widget has a Map here.
            Object dslConfig = cfg.get("dslConfig");
            if (dslConfig instanceof Map<?, ?> map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> opts = (Map<String, Object>) map;
                return BlockFormEmitter.emitNamed("tabulator", id, opts, BlockFormRules.TABULATOR, true);
            }
            // Empty fallback — widget never opened in canvas, so no Map yet.
            // Render an empty auto-columns table so it at least shows data.
            Map<String, Object> opts = new LinkedHashMap<>();
            opts.put("layout", "fitColumns");
            opts.put("autoColumns", true);
            return BlockFormEmitter.emitNamed("tabulator", id, opts, BlockFormRules.TABULATOR, true);
        }).collect(Collectors.joining("\n\n"));
    }

    // ── Pivot Config (Groovy DSL) ─────────────────────────────────────────────

    private static String generatePivotConfig(List<Map<String, Object>> pivots) {
        if (pivots.isEmpty()) return "";
        return pivots.stream().map(w -> {
            String id = componentId(w);
            Map<String, Object> cfg = displayConfig(w);
            // Single source of truth: displayConfig.dslConfig (Map). See
            // Principle 4 in DSLPrinciplesReadme.java.
            Object dslConfig = cfg.get("dslConfig");
            if (dslConfig instanceof Map<?, ?> map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> opts = (Map<String, Object>) map;
                return BlockFormEmitter.emitNamed("pivotTable", id, opts, BlockFormRules.PIVOT, true);
            }
            Map<String, Object> opts = new LinkedHashMap<>();
            opts.put("aggregatorName", "Count");
            opts.put("rendererName", "Table");
            return BlockFormEmitter.emitNamed("pivotTable", id, opts, BlockFormRules.PIVOT, true);
        }).collect(Collectors.joining("\n\n"));
    }

    // ── Filter Pane Config (Groovy DSL) ───────────────────────────────────────

    private static String generateFilterPaneConfig(List<Map<String, Object>> filterPanes) {
        if (filterPanes.isEmpty()) return "";
        return filterPanes.stream().map(w -> {
            String id = componentId(w);
            Map<String, Object> cfg = displayConfig(w);
            // Single source of truth: displayConfig.dslConfig (Map). See
            // Principle 4 in DSLPrinciplesReadme.java.
            Object dslConfig = cfg.get("dslConfig");
            if (dslConfig instanceof Map<?, ?> map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> opts = (Map<String, Object>) map;
                Object field = opts.get("field");
                if (!(field instanceof String fs) || fs.isBlank()) {
                    return "// filterPane('" + id + "') — no field configured";
                }
                return BlockFormEmitter.emitNamed("filterPane", id, opts, BlockFormRules.FILTERPANE);
            }
            return "// filterPane('" + id + "') — no field configured";
        }).collect(Collectors.joining("\n\n"));
    }

    // ── Map Config (JSON) ─────────────────────────────────────────────────────

    private static String generateMapConfig(List<Map<String, Object>> maps) throws Exception {
        if (maps.isEmpty()) return "";
        Map<String, Object> out = new LinkedHashMap<>();
        List<String> keys = List.of("mapType", "region", "dimension", "metric",
            "latField", "lonField", "geoJsonUrl", "geoJsonKey",
            "tileUrl", "attribution", "colorScale", "zoom", "center", "fitBounds");
        for (Map<String, Object> w : maps) {
            Map<String, Object> cfg = displayConfig(w);
            Map<String, Object> entry = new LinkedHashMap<>();
            for (String k : keys) {
                Object v = cfg.get(k);
                if (v != null && !v.toString().isEmpty()) entry.put(k, v);
            }
            out.put(componentId(w), entry);
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out) + "\n";
    }

    // ── Value / Number Config (JSON) ──────────────────────────────────────────

    private static String generateValueConfig(List<Map<String, Object>> numbers) throws Exception {
        if (numbers.isEmpty()) return "";
        Map<String, Object> out = new LinkedHashMap<>();
        // numberField gets resolved via resolveNumberField (visual-mode SQL alias
        // derivation) — copying it raw produces stale source-column names like
        // `equity` / `qty` / `net_pnl` instead of the actual aggregate aliases
        // `equity_avg` / `qty_count` / `net_pnl_max` the script returns.
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("numberFormat",   "format");
        mapping.put("numberLabel",    "label");
        mapping.put("numberPrefix",   "prefix");
        mapping.put("numberSuffix",   "suffix");
        mapping.put("numberDecimals", "decimals");
        for (Map<String, Object> w : numbers) {
            Map<String, Object> cfg = displayConfig(w);
            Map<String, Object> entry = new LinkedHashMap<>();
            String resolvedField = resolveNumberField(w, cfg);
            if (!resolvedField.isEmpty()) entry.put("field", resolvedField);
            for (Map.Entry<String, String> e : mapping.entrySet()) {
                Object v = cfg.get(e.getKey());
                if (v != null && !v.toString().isEmpty()) entry.put(e.getValue(), v);
            }
            out.put(componentId(w), entry);
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out) + "\n";
    }

    /**
     * Resolve the SQL alias for a Number widget's chosen field. The displayConfig's
     * `numberField` is the source-table column name (e.g. `net_pnl`); the actual
     * SQL the script generates aliases the aggregate (e.g. `MAX(net_pnl) AS net_pnl_max`).
     * The published `<rb-value field="...">` must reference the alias, not the source.
     *
     * Visual mode: derive from the visualQuery's summarize. Formula matches
     * sql-builder.ts:154 — `{field}_{aggregation}` (lowercase), or `count` for COUNT(*).
     * If numberField doesn't match any summarize entry, fall back to first summarize alias.
     *
     * SQL mode: returns empty — rb-value falls back to the first result column,
     * which is the right thing for the typical Number widget (one summary column).
     */
    @SuppressWarnings("unchecked")
    private static String resolveNumberField(Map<String, Object> widget, Map<String, Object> dc) {
        String numberField = strOr(dc, "numberField", "");
        Object dsObj = widget.get("dataSource");
        if (!(dsObj instanceof Map<?, ?> ds)) return numberField;
        String mode = strOr((Map<String, Object>) ds, "mode", "");
        if (!"visual".equals(mode) && !mode.isEmpty()) return ""; // SQL/AI-SQL — let rb-value pick first column

        Object vqObj = ((Map<String, Object>) ds).get("visualQuery");
        if (!(vqObj instanceof Map<?, ?> vq)) return numberField;
        Object summObj = ((Map<String, Object>) vq).get("summarize");
        if (!(summObj instanceof List<?> summList) || summList.isEmpty()) return numberField;

        // Build alias from first matching summarize entry (or first entry if no match).
        String firstAlias = null;
        for (Object e : summList) {
            if (!(e instanceof Map<?, ?> agg)) continue;
            String field = strOr((Map<String, Object>) agg, "field", "");
            String aggregation = strOr((Map<String, Object>) agg, "aggregation", "").toLowerCase();
            if (field.isEmpty() || aggregation.isEmpty()) continue;
            String alias = ("*".equals(field) && "count".equals(aggregation))
                ? "count"
                : field + "_" + aggregation;
            if (firstAlias == null) firstAlias = alias;
            if (field.equals(numberField)) return alias;
        }
        return firstAlias != null ? firstAlias : numberField;
    }

    /**
     * Resolve a chart's series-breakout column. The Display tab's `xFields[1]` is
     * the explicit pick; when missing, fall back to the first non-X column in
     * `visualQuery.groupBy`. Mirrors ChartWidget.tsx:404 (`userSeriesField ?? groupByCols[1]`)
     * so the published chart renders the same N-line breakout the live editor shows.
     */
    @SuppressWarnings("unchecked")
    private static String resolveChartSeriesField(Map<String, Object> widget, String xField) {
        Object dsObj = widget.get("dataSource");
        if (!(dsObj instanceof Map<?, ?> ds)) return "";
        Object vqObj = ((Map<String, Object>) ds).get("visualQuery");
        if (!(vqObj instanceof Map<?, ?> vq)) return "";
        Object gbObj = ((Map<String, Object>) vq).get("groupBy");
        if (!(gbObj instanceof List<?> gb)) return "";
        for (Object col : gb) {
            if (col instanceof String s && !s.isEmpty() && !s.equals(xField)) return s;
        }
        return "";
    }

    // ── Gauge Config (JSON) ───────────────────────────────────────────────────

    /**
     * Translate the canvas-side gauge displayConfig (prefixed keys: gaugeFormat,
     * gaugeBands, gaugeBandsReverse) into the wire shape the rb-gauge web component
     * consumes (unprefixed: format, bands). Reading gauge config via the generic
     * sidecar would silently drop these fields because of the prefix mismatch —
     * see Plan: "Fix canvas-vs-published drift on Gauge + Number + Chart widgets".
     *
     * <p>Mirrors the canvas-side resolution in
     * {@code asbl/.../components/explore-data/widgets/GaugeWidget.tsx}:
     * <ul>
     *   <li>{@code gaugeBandsReverse: true} → swap colors (keep thresholds), so
     *       "Higher = worse" risk metrics render green-on-left / red-on-right.</li>
     *   <li>{@code gaugeFormat} unset → default to {@code "currency"} when the
     *       picked field name matches the currency heuristic, else {@code "number"}.
     *       Mirrors the Number widget's auto-detect at {@link #widgetHtml}.</li>
     * </ul>
     */
    private static String generateGaugeConfig(List<Map<String, Object>> widgets) throws Exception {
        if (widgets.isEmpty()) return "";
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> w : widgets) {
            Map<String, Object> cfg = displayConfig(w);
            Map<String, Object> entry = new LinkedHashMap<>();

            String field = strOr(cfg, "field", "");
            if (!field.isEmpty()) entry.put("field", field);
            if (cfg.get("min")   instanceof Number mn) entry.put("min",   mn);
            if (cfg.get("max")   instanceof Number mx) entry.put("max",   mx);
            String label = strOr(cfg, "label", "");
            if (!label.isEmpty()) entry.put("label", label);

            // Format: explicit gaugeFormat wins; else auto-detect currency from field name.
            String format = strOr(cfg, "gaugeFormat", "");
            if (format.isEmpty() && !field.isEmpty()) {
                format = isCurrencyFieldName(field) ? "currency" : "number";
            }
            if (!format.isEmpty()) entry.put("format", format);

            // Bands: pass-through, with optional color swap when "Higher = worse" is on.
            Object bandsObj = cfg.get("gaugeBands");
            if (bandsObj instanceof List<?> bandsList && !bandsList.isEmpty()) {
                boolean reverse = Boolean.TRUE.equals(cfg.get("gaugeBandsReverse"));
                List<Map<String, Object>> bandsOut = new ArrayList<>();
                int n = bandsList.size();
                for (int i = 0; i < n; i++) {
                    Object item = bandsList.get(i);
                    if (!(item instanceof Map<?, ?> band)) continue;
                    Object to    = band.get("to");
                    Object color = band.get("color");
                    if (reverse && n > 1) {
                        Object swap = bandsList.get(n - 1 - i);
                        if (swap instanceof Map<?, ?> sm) color = sm.get("color");
                    }
                    Map<String, Object> bandOut = new LinkedHashMap<>();
                    if (to    != null) bandOut.put("to",    to);
                    if (color != null) bandOut.put("color", color);
                    bandsOut.add(bandOut);
                }
                if (!bandsOut.isEmpty()) entry.put("bands", bandsOut);
            }

            out.put(componentId(w), entry);
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out) + "\n";
    }

    // ── Generic JSON Sidecar ──────────────────────────────────────────────────

    private static String generateJsonSidecar(List<Map<String, Object>> widgets, String... forwardKeys) throws Exception {
        if (widgets.isEmpty()) return "";
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> w : widgets) {
            Map<String, Object> cfg = displayConfig(w);
            Map<String, Object> entry = new LinkedHashMap<>();
            for (String k : forwardKeys) {
                Object v = cfg.get(k);
                if (v != null && !v.toString().isEmpty()) entry.put(k, v);
            }
            out.put(componentId(w), entry);
        }
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out) + "\n";
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private static List<Map<String, Object>> byType(List<Map<String, Object>> widgets, String type) {
        return widgets.stream()
            .filter(w -> type.equals(w.get("type")))
            .collect(Collectors.toList());
    }

    /** Must match {@code ScriptAssembler.componentId()} — semantic slug + short suffix when inferrable. */
    private static String componentId(Map<String, Object> widget) {
        String type    = str(widget, "type");
        String id      = str(widget, "id");
        String stripped = id.replaceFirst("^w-", "");
        String slug    = inferSemanticSlug(type, widget);
        if (slug.isEmpty()) return type + "_" + stripped;
        int lastDash = stripped.lastIndexOf('-');
        String suffix = lastDash >= 0 ? stripped.substring(lastDash + 1) : stripped;
        return type + "_" + slug + "_" + suffix;
    }

    private static String inferSemanticSlug(String type, Map<String, Object> widget) {
        Map<String, Object> dc = displayConfig(widget);
        // Primary: field/table name derived from data binding — most precise
        String raw = switch (type) {
            case "number"      -> strOr(dc, "numberField",  "");
            case "chart"       -> { List<String> f = listOfStr(dc, "xFields");   yield f.isEmpty() ? "" : f.get(0); }
            case "tabulator"   -> visualQueryTable(widget);
            case "pivot"       -> { List<String> r = listOfStr(dc, "pivotRows"); yield r.isEmpty() ? "" : r.get(0); }
            case "filter-pane" -> strOr(dc, "filterField",  "");
            case "gauge"       -> strOr(dc, "field",        "");
            case "trend"       -> strOr(dc, "dateField",    "");
            case "sankey"      -> strOr(dc, "sourceField",  "");
            default            -> "";
        };
        if (!raw.isBlank()) return slugify(raw);
        // Fallback: user-provided title/label — semantic because the user chose it
        String label = switch (type) {
            case "number"      -> strOr(dc, "numberLabel",     "");
            case "chart"       -> strOr(dc, "chartTitle",      "");
            case "filter-pane" -> strOr(dc, "filterPaneLabel", "");
            case "gauge"       -> strOr(dc, "label",           "");
            case "trend"       -> strOr(dc, "label",           "");
            default            -> "";
        };
        return label.isBlank() ? "" : slugify(label);
    }

    private static String slugify(String s) {
        return s.toLowerCase().replaceAll("[^a-z0-9]+", "_").replaceAll("(^_+|_+$)", "");
    }

    private static String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? String.valueOf(v) : "";
    }

    private static String strOr(Map<String, Object> map, String key, String def) {
        Object v = map.get(key);
        if (v instanceof String s && !s.isBlank()) return s;
        return def;
    }

    private static boolean isCurrencyFieldName(String f) {
        String lower = f.toLowerCase();
        return lower.matches(".*(revenue|price|amount|freight|total|cost|salary|" +
                             "fee|balance|earnings|income|budget|expense|payment|value).*");
    }

    private static Map<String, Object> displayConfig(Map<String, Object> widget) {
        Object dc = widget.get("displayConfig");
        return dc instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static int gridInt(Map<String, Object> widget, String field) {
        Object gp = widget.get("gridPosition");
        if (gp instanceof Map<?, ?> m) {
            Object v = m.get(field);
            if (v instanceof Number n) return n.intValue();
        }
        return 0;
    }

    private static List<String> listOfStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof List<?> l) {
            return l.stream().filter(Objects::nonNull).map(Object::toString).collect(Collectors.toList());
        }
        return List.of();
    }

    private static String visualQueryTable(Map<String, Object> widget) {
        Object ds = widget.get("dataSource");
        if (ds instanceof Map<?, ?> dsMap) {
            Object vq = dsMap.get("visualQuery");
            if (vq instanceof Map<?, ?> vqMap) {
                Object t = vqMap.get("table");
                return t != null ? String.valueOf(t) : "";
            }
        }
        return "";
    }

    private static String escapeHtmlAttr(String s) {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}

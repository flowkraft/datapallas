package com.flowkraft.reporting.dtos;

import java.util.List;
import java.util.Map;

import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;

/**
 * Complete report configuration returned to web components.
 * Server is the single source of truth - client just displays.
 */
public class ReportFullConfigDto {
    
    /** Report folder name (e.g., "sales-summary") */
    public String reportCode;
    
    /** Display name from settings.xml */
    public String reportName;
    
    /** Data source type (e.g., "ds-csvfile", "ds-database") */
    public String dsInputType;
    
    /** Relative path to settings.xml */
    public String configurationFilePath;
    
    /** Parameters parsed from {reportCode}-report-parameters-spec.groovy */
    public List<ReportParameter> parameters;
    
    /** Tabulator options parsed from {reportCode}-tabulator-config.groovy */
    public Map<String, Object> tabulatorOptions;
    
    /** Chart options parsed from {reportCode}-chart-config.groovy */
    public Map<String, Object> chartOptions;
    
    /** Pivot table options parsed from {reportCode}-pivot-config.groovy */
    public Map<String, Object> pivotTableOptions;

    /** Filter pane options parsed from {reportCode}-filterpane-config.groovy */
    public Map<String, Object> filterPaneOptions;

    /** Map options parsed from {reportCode}-map-config.json.
     *  Unlike the other widget configs this is plain JSON (no DSL) — map has
     *  no callback surface, so Groovy buys us nothing. Shape mirrors the
     *  `options` prop of <rb-map>: { mapType, region, dimension, metric,
     *  latField, lonField, colorScale, tileUrl, geoJsonUrl, zoom, center }. */
    public Map<String, Object> mapOptions;

    /** Sankey, gauge, trend, progress, detail options — same JSON-sidecar pattern
     *  as map. Each viz reads its own {reportCode}-{viz}-config.json file.
     *  Single-block form: top-level keys are option names.
     *  Named-blocks form: top-level keys are componentIds, values are options. */
    public Map<String, Object> sankeyOptions;
    public Map<String, Object> gaugeOptions;
    public Map<String, Object> trendOptions;
    public Map<String, Object> progressOptions;
    public Map<String, Object> detailOptions;

    /** Raw DSL source code for display/copy */
    public String tabulatorDsl;
    public String chartDsl;
    public String pivotTableDsl;
    public String filterPaneDsl;
    public String parametersDsl;
    /** Raw JSON source for the map config — served to UI for Configuration tab. */
    public String mapConfigJson;
    /** Raw JSON sources for the new viz sidecars (Configuration tab). */
    public String sankeyConfigJson;
    public String gaugeConfigJson;
    public String trendConfigJson;
    public String progressConfigJson;
    public String detailConfigJson;

    /** Named options for aggregator reports (componentId → options) */
    public Map<String, Map<String, Object>> namedTabulatorOptions;
    public Map<String, Map<String, Object>> namedChartOptions;
    public Map<String, Map<String, Object>> namedPivotTableOptions;
    public Map<String, Map<String, Object>> namedFilterPaneOptions;
    public Map<String, Map<String, Object>> namedMapOptions;
    public Map<String, Map<String, Object>> namedSankeyOptions;
    public Map<String, Map<String, Object>> namedGaugeOptions;
    public Map<String, Map<String, Object>> namedTrendOptions;
    public Map<String, Map<String, Object>> namedProgressOptions;
    public Map<String, Map<String, Object>> namedDetailOptions;

    /** Value/Number widget options parsed from {reportCode}-value-config.json.
     *  Same named-blocks shape as the other JSON sidecars:
     *  single-block: top-level keys are option names (field, format, label, …).
     *  Named-blocks: top-level keys are componentIds, values are options. */
    public Map<String, Object> valueOptions;
    public Map<String, Map<String, Object>> namedValueOptions;
    /** Raw JSON source for the value config — served to UI for Configuration tab. */
    public String valueConfigJson;

    /** Which visualizations are configured */
    public boolean hasTabulator;
    public boolean hasChart;
    public boolean hasPivotTable;
    public boolean hasFilterPane;
    public boolean hasParameters;
    public boolean hasMap;
    public boolean hasSankey;
    public boolean hasGauge;
    public boolean hasTrend;
    public boolean hasProgress;
    public boolean hasDetail;
    public boolean hasValue;

    /**
     * Pivot engine mode: "browser" (download all data, aggregate client-side)
     * or "server" (aggregate server-side on DuckDB/ClickHouse, send only results).
     * Only relevant when hasPivotTable=true.
     */
    public String pivotEngineMode = "browser";  // default

    /**
     * The parameter values the link or token this config was fetched with forces, if any.
     * Present only for a request authorised by a locking share link or embed token, so that
     * &lt;rb-parameters&gt; can show a locked parameter as fixed instead of letting the viewer
     * change something the server is going to overwrite anyway. Null for a signed-in caller.
     * The server override on /data is the guard; this is only so the viewer is not misled.
     */
    public Map<String, Object> lockedParameters;

    /** Output type from reporting.xml (e.g., "output.html", "output.dashboard") */
    public String outputType;

    /** Raw HTML template content for dashboard mode (only populated when outputType = "output.dashboard") */
    public String dashboardTemplate;
}

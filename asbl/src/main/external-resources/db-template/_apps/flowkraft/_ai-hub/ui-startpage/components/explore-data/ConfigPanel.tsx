"use client";

import { useState, useEffect, useMemo } from "react";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { DataSource, WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { fetchSchema, executeQuery, getConnectionType } from "@/lib/explore-data/rb-api";
import { sqlForDataSource } from "@/lib/explore-data/sql-builder";
import { isTemporalExtraction, probeCardinality, probeSemanticType, pickDefaultAxes, canReuseAxisPicks, splitDimsAndMeasures, groupWidgetsByShape, groupWidgetsBySensibility, rankChartSubtypes, type CardinalityMap } from "@/lib/explore-data/smart-defaults";
import { seedDisplayConfigForType, synthesizePostAggColumns, temporalColumnNamesOf } from "@/lib/explore-data/widget-defaults";
import type { TableSchema } from "@/lib/explore-data/types";
// lucide-react removed — icons replaced with inline heroicons below
// Icon components used from lucide: Settings2, Database, Palette, Wand2, Loader2, Table,
// BarChart3, PieChart, Hash, MapIcon, Workflow, GaugeIcon, TrendingUp, BarChartHorizontal,
// FileText, Sparkles, ChevronDown, ChevronRight — now inlined as SVG or passed via WIDGET_META
import type { ComponentType } from "react";
type IconComponent = ComponentType<{ className?: string }>;
// Inline heroicon factories for WIDGET_META palette entries
const _TableIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 19.5m9.75-14.25c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h.008v.008h-.008v-.008Zm0 3.75h.008v.008h-.008v-.008Zm-3 3.75h.008v.008h-.008v-.008Z" /></svg>;
const _BarChart3Icon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>;
const _PieChartIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>;
const _HashIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" /></svg>;
const _MapIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>;
const _WorkflowIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 0-4.5H6v4.5Zm0 0H3.75m2.25 0v4.5m0-4.5v-4.5m0 9H3.75" /></svg>;
const _GaugeIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>;
const _TrendingUpIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>;
const _BarChartHorizontalIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>;
const _FileTextIcon: IconComponent = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>;
import type { WidgetType } from "@/lib/stores/canvas-store";
import { QueryBuilder } from "./query-builder/QueryBuilder";
import { ChartConfig, CHART_TYPES } from "./config-panels/ChartConfig";
import { TabulatorConfig } from "./config-panels/TabulatorConfig";
import { PivotConfig } from "./config-panels/PivotConfig";
import { NumberConfig } from "./config-panels/NumberConfig";
import { MapConfig } from "./config-panels/MapConfig";
import { SankeyConfig } from "./config-panels/SankeyConfig";
import { GaugeConfig } from "./config-panels/GaugeConfig";
import { TrendConfig } from "./config-panels/TrendConfig";
import { ProgressConfig } from "./config-panels/ProgressConfig";
import { DetailConfig } from "./config-panels/DetailConfig";
import { FilterPaneConfig } from "./config-panels/FilterPaneConfig";
import { BidirectionalDslCustomizer } from "./config-panels/BidirectionalDslCustomizer";

// Auto-switch helpers (`seedDisplayConfigForType`, `inferColumnsFromRow`)
// moved to `lib/explore-data/widget-defaults.ts` so the canvas-store's
// one-shot auto-switch mutator and this palette's onClick share one source
// of truth. Imported at the top of the file.


// Stable empty array for the `widget.columns ?? EMPTY_COLS` fallback so
// downstream useMemo/useEffect deps don't invalidate on every render of a
// widget with no columns yet.
const EMPTY_COLS: ColumnSchema[] = [];

let _cpRenderN = 0;

export function ConfigPanel({ onCollapse }: { onCollapse?: () => void }) {
  const { widgets, selectedWidgetId, connectionId, updateWidgetDataSource, updateWidgetDisplayConfig, changeWidgetRenderMode, setWidgetColumnsFromSchema } = useCanvasStore();
  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId);
  _cpRenderN++;
  console.log('[ConfigPanel] #' + _cpRenderN + ' widgetId=' + selectedWidget?.id +
    ' type=' + (selectedWidget?.type ?? 'none') +
    ' cols=' + (selectedWidget?.columns?.length ?? 0) +
    ' shape=' + (selectedWidget?.shape ? 'yes' : 'no'));
  // `columns` is a DERIVED read from the widget record — no local state.
  // Populated by `setWidgetQueryResult` (any mode, post-query) or
  // `setWidgetColumnsFromSchema` (visual mode, pre-query schema fetch).
  // This eliminates the two competing `setColumns` effects that previously
  // raced against each other and against the palette re-render.
  const columns: ColumnSchema[] = selectedWidget?.columns ?? EMPTY_COLS;
  const [sampleData, setSampleData] = useState<Record<string, unknown>[]>([]);
  // Local validation error for the "Detect columns" button (e.g. "Write a
  // query first"). Fetch/runtime errors come from the shared store instead —
  // see `combinedDetectError` below.
  const [detectError, setDetectError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "display">("data");
  // Per-column distinct-count probe — drives pie/doughnut demote-or-promote in
  // the Chart subtype ranker. Probed only for chart widgets in visual mode
  // with a table + group-by columns. Cached (5-min TTL) inside probeCardinality.
  const [cardinality, setCardinality] = useState<CardinalityMap>({});
  // Row count from the last executed query. undefined = no query run yet (schema-
  // only mode). When set, the sensibility gate rowCount>1 fires and hides chart
  // recommendations for single-row results (e.g. a bare SUM with no GROUP BY).
  const [lastRowCount, setLastRowCount] = useState<number | undefined>(undefined);

  // Set of group-by columns using a temporal-extraction bucket (day-of-week,
  // hour-of-day, month-of-year, quarter-of-year). The Chart subtype ranker
  // treats these as categorical so `line` gets demoted below `bar`/`row`.
  const extractionsSet = useMemo<Set<string>>(() => {
    const buckets = selectedWidget?.dataSource?.visualQuery?.groupByBuckets;
    if (!buckets) return new Set();
    const out = new Set<string>();
    for (const [col, bucket] of Object.entries(buckets)) {
      if (isTemporalExtraction(bucket)) out.add(col);
    }
    return out;
  }, [selectedWidget?.dataSource?.visualQuery?.groupByBuckets]);

  // Visual-mode table schema, enriched with semanticHints from the
  // fingerprint probe.  Intermediate state — NOT the authoritative
  // classified view.  The synthesis effect below consumes this + the
  // widget's visualQuery to compute the post-aggregation effective
  // columns and write them (together with the computed PickShape) onto
  // the widget record via setWidgetColumnsFromSchema.  Every palette /
  // config consumer reads from widget.columns + widget.shape; this local
  // state is internal scaffolding and never leaves ConfigPanel.
  const [schemaCols, setSchemaCols] = useState<ColumnSchema[]>(EMPTY_COLS);
  const [schemaTable, setSchemaTable] = useState<TableSchema | null>(null);

  // Effect 1 — fetch schema + enrich with semantic hints.
  // Re-fires only when the connection/table changes, NOT on visualQuery
  // edits.  Keeping schema fetch out of the visualQuery deps prevents
  // an HTTP hit on every summarize/groupBy chip change.
  useEffect(() => {
    setDetectError(null);
    const ds = selectedWidget?.dataSource;
    if (!connectionId || !ds) { setSchemaCols(EMPTY_COLS); setSchemaTable(null); setLastRowCount(undefined); return; }

    const tableInVisual = ds.mode === "visual" ? ds.visualQuery?.table : undefined;
    if (!tableInVisual) {
      setSchemaCols(EMPTY_COLS);
      setSchemaTable(null);
      setSampleData([]);
      setLastRowCount(undefined);
      return;
    }

    let cancelled = false;
    fetchSchema(connectionId)
      .then(async (schema) => {
        if (cancelled) return;
        const t = schema.tables.find((t) => t.tableName === tableInVisual);
        const baseCols = t?.columns || [];
        setSchemaCols(baseCols);
        setSchemaTable(t ?? null);
        setSampleData([]);

        // Kick off value-fingerprinting in the background; when it resolves,
        // merge semanticHint into each column (drives isEmail/isURL/isState etc).
        if (baseCols.length > 0) {
          try {
            const hints = await probeSemanticType(connectionId, tableInVisual, baseCols);
            if (cancelled) return;
            if (Object.keys(hints).length > 0) {
              setSchemaCols(baseCols.map((c) => hints[c.columnName]
                ? { ...c, semanticHint: hints[c.columnName] }
                : c));
            }
          } catch { /* ignore — predicates still work from name regexes */ }
        }
      })
      .catch(() => { if (!cancelled) { setSchemaCols(EMPTY_COLS); setSchemaTable(null); setSampleData([]); setLastRowCount(undefined); } });
    return () => { cancelled = true; };
  }, [connectionId, selectedWidget?.id, selectedWidget?.dataSource?.mode, selectedWidget?.dataSource?.visualQuery?.table]);

  // Effect 2 — synthesize post-aggregation columns + write to widget record.
  // Re-fires when EITHER the fetched schema changes OR the visualQuery's
  // summarize/groupBy changes.  Output is the "what will appear in the
  // result" view, which is what every palette / config panel / widget
  // renderer should see via widget.columns + widget.shape.  Keeping this
  // synthesis in a single place (synthesizePostAggColumns) + writing to
  // the store eliminates the old local `effectiveColumns` memo that every
  // consumer was reading divergently from widget.columns.
  useEffect(() => {
    const widgetId = selectedWidget?.id;
    if (!widgetId) return;
    const ds = selectedWidget?.dataSource;
    // Only visual mode populates this path; SQL/script widget.columns is
    // written by setWidgetQueryResult on query-result-land.
    if (ds?.mode !== "visual") return;
    const effective = synthesizePostAggColumns(schemaCols, ds.visualQuery);
    setWidgetColumnsFromSchema(widgetId, effective, schemaTable);
  }, [
    selectedWidget?.id,
    selectedWidget?.dataSource?.mode,
    schemaCols,
    schemaTable,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (selectedWidget?.dataSource?.visualQuery?.groupBy ?? []).join("\u0000"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(selectedWidget?.dataSource?.visualQuery?.summarize ?? []),
    setWidgetColumnsFromSchema,
  ]);

  // Auto-update columns + rowCount from actual query result when groupBy/summarize change.
  // Mirrors reference behavior: uses result data (rows+cols) for viz recommendations, not source schema.
  // The schema-loading effect above sets columns for raw table drops; this effect overrides for
  // aggregated queries so the palette classifies [OrderDate, Freight_sum] not 14 schema cols.
  useEffect(() => {
    const ds = selectedWidget?.dataSource;
    if (!connectionId || !ds || ds.mode !== "visual") return;
    const tableInVisual = ds.visualQuery?.table;
    if (!tableInVisual) return;
    const isAgg = (ds.visualQuery?.summarize?.length ?? 0) > 0
      || (ds.visualQuery?.groupBy?.length ?? 0) > 0;
    if (!isAgg) return; // raw table drop: schema columns from the effect above are correct

    const sql = sqlForDataSource(
      ds,
      getConnectionType(connectionId),
      temporalColumnNamesOf(selectedWidget?.shape),
    );
    if (!sql) return;

    let cancelled = false;
    executeQuery(connectionId, sql)
      .then((res) => {
        if (cancelled || !res.data || res.data.length === 0) return;
        // Only update rowCount — column types come from widget.columns
        // (written by setWidgetColumnsFromSchema; type-preserving).
        // [SQL-TRACE] diagnostic — leave commented; uncomment to debug what
        // value flows into the engine's `hints.rowCount` palette gate.
        // console.log(
        //   '[SQL-TRACE ConfigPanel setLastRowCount] widgetId=' + selectedWidget?.id +
        //   ' lastRowCount=' + res.rowCount +
        //   ' dataLen=' + res.data.length,
        // );
        setLastRowCount(res.rowCount);
      })
      .catch(() => { /* ignore — schema columns from main effect remain as fallback */ });
    return () => { cancelled = true; };
  }, [
    connectionId,
    selectedWidget?.id,
    selectedWidget?.dataSource?.mode,
    selectedWidget?.dataSource?.visualQuery?.table,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (selectedWidget?.dataSource?.visualQuery?.groupBy ?? []).join("\u0000"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(selectedWidget?.dataSource?.visualQuery?.summarize ?? []),
  ]);

  // Probe distinct-value counts for the group-by columns — only for chart
  // widgets (pie/doughnut cardinality rules don't apply to Number/tabulator/etc.)
  // and only when we have a resolved table. Re-runs when the groupBy set
  // changes; the underlying cache dedupes repeated probes across session.
  useEffect(() => {
    if (selectedWidget?.type !== "chart") { setCardinality({}); return; }
    const ds = selectedWidget.dataSource;
    const tableName = ds?.mode === "visual" ? ds.visualQuery?.table : undefined;
    const groupBy = ds?.mode === "visual" ? ds.visualQuery?.groupBy : undefined;
    if (!connectionId || !tableName || !groupBy || groupBy.length === 0) {
      setCardinality({});
      return;
    }
    let cancelled = false;
    probeCardinality(connectionId, tableName, groupBy)
      .then((result) => { if (!cancelled) setCardinality(result); })
      .catch(() => { if (!cancelled) setCardinality({}); });
    return () => { cancelled = true; };
  }, [
    connectionId,
    selectedWidget?.id,
    selectedWidget?.type,
    selectedWidget?.dataSource?.mode,
    selectedWidget?.dataSource?.visualQuery?.table,
    // Stringify groupBy so the effect re-fires when columns are added/removed.
    (selectedWidget?.dataSource?.visualQuery?.groupBy ?? []).join("\u0000"),
  ]);

  // ── Auto-pick X/Y axes for chart widgets ──────────────────────────────
  // Compute defaults on every columns/chartType/cardinality change, but only
  // apply them when the user's current picks are missing or reference columns
  // that no longer exist in the schema. User overrides persist across query
  // edits as long as their columns stay in the result.
  useEffect(() => {
    if (selectedWidget?.type !== "chart") return;
    if (columns.length === 0) return;
    // Read all chart config from the canonical DSL Map (Principle 4).
    const dslMap = (selectedWidget.displayConfig.dslConfig ?? {}) as Record<string, unknown>;
    const dataBlock = (dslMap.data ?? {}) as { labelField?: string; seriesField?: string; datasets?: { field: string; label?: string }[] };
    const chartType = (dslMap.type as string | undefined) ?? "bar";
    const currentXFields: string[] = [];
    if (typeof dataBlock.labelField === "string" && dataBlock.labelField) currentXFields.push(dataBlock.labelField);
    if (typeof dataBlock.seriesField === "string" && dataBlock.seriesField) currentXFields.push(dataBlock.seriesField);
    const currentYFields: string[] = (dataBlock.datasets ?? []).map((d) => d.field).filter((f): f is string => Boolean(f));
    const currentBubble = dslMap.bubbleSizeField as string | undefined;
    const { dims, measures } = splitDimsAndMeasures(columns);
    const defaults = pickDefaultAxes(dims, measures, chartType, { cardinality });

    const keepX = canReuseAxisPicks(currentXFields, columns);
    const keepY = canReuseAxisPicks(currentYFields, columns);
    const nextX = keepX ? currentXFields : defaults.xFields;
    const nextY = keepY ? currentYFields : defaults.yFields;
    const nextBubble = currentBubble ?? defaults.bubbleSizeField;

    const changed =
      nextX.join(" ") !== currentXFields.join(" ") ||
      nextY.join(" ") !== currentYFields.join(" ") ||
      nextBubble !== currentBubble;
    if (!changed) return;

    const newData: { labelField?: string; seriesField?: string; datasets?: { field: string; label?: string }[] } = { ...dataBlock };
    if (nextX[0]) newData.labelField = nextX[0]; else delete newData.labelField;
    if (nextX[1]) newData.seriesField = nextX[1]; else delete newData.seriesField;
    if (nextY.length > 0) newData.datasets = nextY.map((f) => ({ field: f, label: f }));
    else delete newData.datasets;

    const newMap: Record<string, unknown> = { ...dslMap };
    if (newData.labelField || newData.seriesField || newData.datasets) newMap.data = newData;
    else delete newMap.data;
    if (nextBubble !== undefined) newMap.bubbleSizeField = nextBubble;
    else delete newMap.bubbleSizeField;

    updateWidgetDisplayConfig(selectedWidget.id, {
      ...selectedWidget.displayConfig,
      dslConfig: newMap,
    });
  }, [
    selectedWidget?.id,
    selectedWidget?.type,
    (selectedWidget?.displayConfig?.dslConfig as { type?: unknown } | undefined)?.type,
    // Stringify so the effect re-fires on real changes, not on identity flips.
    columns.map((c) => c.columnName).join("\u0000"),
    Object.entries(cardinality).map(([k, v]) => `${k}:${v}`).join("\u0000"),
  ]);

  // Shared query-result for the selected widget.  useWidgetData (the single
  // fetcher) writes here after each execution; we subscribe so that SQL/script
  // modes automatically populate `columns` + `sampleData` + `lastRowCount` as
  // soon as a Run completes — without a separate backend call of our own.
  const widgetQR = useCanvasStore((s) =>
    selectedWidget?.id ? s.queryResults[selectedWidget.id] : undefined,
  );
  const widgetQueryLoading = widgetQR?.loading ?? false;
  const widgetQueryError = widgetQR?.error ?? null;

  // Manually trigger a detection — used only when the user clicks the
  // "Detect columns from query" button in the Display / FilterPane tabs.
  // Bumps the appropriate version on dataSource so useWidgetData does a single
  // execution (which then populates the store entry the effect below watches).
  // Keeps the button meaningful for the "wrote SQL but hasn't clicked Run yet"
  // case while routing all network traffic through the shared fetcher.
  const detectColumnsFromQuery = () => {
    if (!connectionId || !selectedWidget?.dataSource) return;
    const ds = selectedWidget.dataSource;
    if (ds.mode === "script") {
      if (!ds.script) { setDetectError("Write a script first"); return; }
      updateWidgetDataSource(selectedWidget.id, {
        ...ds,
        scriptExecuteVersion: (ds.scriptExecuteVersion ?? 0) + 1,
      });
    } else {
      const sql = sqlForDataSource(
        ds,
        getConnectionType(connectionId),
        temporalColumnNamesOf(selectedWidget?.shape),
      );
      if (!sql) { setDetectError("Write or generate a query first"); return; }
      const nextVersion = (ds.executeVersion ?? 0) + 1;
      // Persist sql/generatedSql for visual→SQL consistency, same as handleRun.
      updateWidgetDataSource(selectedWidget.id, {
        ...ds,
        sql: (ds.mode === "sql" || ds.mode === "ai-sql") ? ds.sql : sql,
        generatedSql: sql,
        executeVersion: nextVersion,
      });
    }
    setDetectError(null);
  };

  // Auto-populate sampleData + lastRowCount from the shared store entry.
  // Fires whenever useWidgetData writes a new result.  The `columns` /
  // `shape` fields are written onto the widget record by the store mutator
  // `setWidgetQueryResult` itself — no local `setColumns` call needed.
  useEffect(() => {
    const ds = selectedWidget?.dataSource;
    if (!ds) return;
    if (ds.mode !== "sql" && ds.mode !== "ai-sql" && ds.mode !== "script") return;
    const result = widgetQR?.result;
    if (!result || !result.data || result.data.length === 0) return;
    setSampleData(result.data.slice(0, 5));
    setLastRowCount(result.rowCount);
    setDetectError(null);
  }, [widgetQR, selectedWidget?.dataSource?.mode]);

  // Palette grouping: recommended / sensible / nonsensible.
  // Re-evaluates whenever columns or cardinality change (e.g. user picks a
  // different table / changes group-by / aggregation in the Data tab).
  // Hooks MUST be declared before the `if (!selectedWidget) return` below —
  // hooks called after an early return violate the Rules of Hooks and cause
  // React error #310 when the user toggles selection.
  //
  // `isAggregated` drives the "no aggregation, no native" branch — when the
  // user has neither summarized nor grouped, we bias recommendations toward
  // Table/Detail (+Map if geo) instead of pushing Chart/Trend at a raw table
  // drop where they'd just render noise.
  //
  // Derived from `visualQuery.summarize`/`groupBy` ONLY — NOT from
  // `dataSource.mode`. A silent mode flip to sql/ai-sql/script (triggered
  // by simply clicking into the Finetune tab) used to make this unconditionally
  // true, which trapped the palette in "aggregated mode" even after the user
  // cleared all chips and returned to Visual. The visualQuery is the source
  // of truth; ignore mode.
  // SQL/script modes return undefined so the widget picker skips Rule 0
  // ("raw unaggregated browse → tabulator only") and evaluates the actual
  // result shape instead. Rule 0 fires on strict === false, so undefined
  // falls through to the scalar/chart/etc. rules.
  const isAggregated = useMemo<boolean | undefined>(() => {
    const ds = selectedWidget?.dataSource;
    if (!ds || ds.mode === "sql" || ds.mode === "ai-sql" || ds.mode === "script") return undefined;
    const vq = ds.visualQuery;
    if (vq?.kind === "cube") return true;
    const hasSummarize = (vq?.summarize?.length ?? 0) > 0;
    const hasGroupBy = (vq?.groupBy?.length ?? 0) > 0;
    return hasSummarize || hasGroupBy;
  }, [selectedWidget?.dataSource]);

  // `columns` (= `selectedWidget.columns`) IS the post-aggregation effective
  // view — Effect 2 above synthesizes it via `synthesizePostAggColumns`
  // and writes it to the widget record via `setWidgetColumnsFromSchema`.
  // The widget also carries a pre-classified `shape: PickShape` computed
  // alongside `columns`.  When present, the palette calls
  // `groupWidgetsByShape` which skips the local shape-rebuild that used
  // to run once per palette render (one of the original drift sources).
  // The pre-data / pre-schema case falls back to `groupWidgetsBySensibility`
  // (which internally calls shapeFromColumns once for legacy parity).
  const sensibilityGroups = useMemo(
    () => selectedWidget?.shape
      ? groupWidgetsByShape(selectedWidget.shape, columns, { cardinality, isAggregated, rowCount: lastRowCount })
      : groupWidgetsBySensibility(columns, { cardinality, isAggregated, rowCount: lastRowCount }),
    [selectedWidget?.shape, columns, cardinality, isAggregated, lastRowCount],
  );
  const selectedIsNonsensible =
    !!selectedWidget && sensibilityGroups.nonsensible.includes(selectedWidget.type);
  const [showMoreWidgets, setShowMoreWidgets] = useState(false);
  useEffect(() => {
    setShowMoreWidgets(selectedIsNonsensible);
  }, [selectedIsNonsensible]);

  // Auto-switch (tabulator/pivot → best data-shape fit on first query result)
  // lives ENTIRELY inside canvas-store's `setWidgetQueryResult` mutator.
  // No reactive observer here — a discrete store event drives a single
  // atomic (widgets, queryResults) write.  Structurally impossible to loop,
  // unlike the prior useEffect implementation that triggered React #185
  // "Maximum update depth exceeded" during visual→sql mode transitions.
  // User-explicit palette clicks set `userPicked: true` (see button onClick
  // below) which pins the type permanently against future auto-switches.

  if (!selectedWidget) {
    return (
      <div className="w-80 shrink-0 border-l border-base-300 bg-base-200/30 overflow-y-auto">
        <div className="flex items-center justify-end border-b border-base-300 px-2 py-1.5">
          <button id="btnCollapseRightPanel" onClick={onCollapse} className="p-1 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" title="Hide config panel">
            {/* Heroicon: chevron-right */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-center h-[calc(100%-36px)]">
          <div className="text-center p-6">
            {/* Heroicon: adjustments-horizontal */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8 mx-auto mb-2 text-base-content/30"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
            <p className="text-sm text-base-content/60">Select a component to configure</p>
          </div>
        </div>
      </div>
    );
  }

  const isDataWidget = ["chart", "tabulator", "pivot", "number", "map", "sankey", "gauge", "trend", "progress", "detail"].includes(selectedWidget.type);
  const isFilterPane = selectedWidget.type === "filter-pane";
  const isText = selectedWidget.type === "text";
  const isDivider = selectedWidget.type === "divider";
  const isIframe = selectedWidget.type === "iframe";

  const handleDisplayChange = (config: WidgetDisplayConfig) => {
    updateWidgetDisplayConfig(selectedWidget.id, config);
  };

  return (
    <div id="configPanel" className="w-80 shrink-0 border-l border-base-300 bg-base-200/30 flex flex-col overflow-hidden">
      <div className="flex items-center justify-end border-b border-base-300 px-2 py-1.5 shrink-0">
        <button id="btnCollapseRightPanel" onClick={onCollapse} className="p-1 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" title="Hide config panel">
          {/* Heroicon: chevron-right */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Visualize as — grouped palette.
            Recommended + sensible widgets live in the main grid; non-sensible
            collapse under "More widgets". The grouping reactively updates as
            the user changes the Data tab (table / aggregation / group-by). */}
        {isDataWidget && (() => {
          const WIDGET_META: Record<WidgetType, { label: string; Icon: IconComponent } | undefined> = {
            tabulator: { label: "Table", Icon: _TableIcon },
            chart: { label: "Chart", Icon: _BarChart3Icon },
            pivot: { label: "Pivot", Icon: _PieChartIcon },
            number: { label: "Number", Icon: _HashIcon },
            map: { label: "Map", Icon: _MapIcon },
            sankey: { label: "Sankey", Icon: _WorkflowIcon },
            gauge: { label: "Gauge", Icon: _GaugeIcon },
            trend: { label: "Trend", Icon: _TrendingUpIcon },
            progress: { label: "Progress", Icon: _BarChartHorizontalIcon },
            detail: { label: "Detail", Icon: _FileTextIcon },
            text: undefined, divider: undefined, iframe: undefined, "filter-pane": undefined,
          };

          // Only the #1 pick (first in the recommended array) gets the star —
          // single-winner signal. Other recommended items still come first in
          // the grid (position = rank), but without per-item visual noise.
          const bestPick: WidgetType | undefined = sensibilityGroups.recommended[0];

          // Chart subtype to show in the "Visualize as" main grid.
          // Priority: 1) If the widget is already a chart with a user-picked chartType → show that.
          //           2) Otherwise fall back to the smart-defaults #1 ranked subtype.
          // The "More widgets" section always shows the generic "Chart" label.
          const _savedChartType = selectedWidget?.type === "chart"
            ? ((selectedWidget.displayConfig?.dslConfig as { type?: unknown } | undefined)?.type as string | undefined)
            : undefined;
          // Chart subtype ranking splits widget.columns (the authoritative
          // post-agg effective view written by Effect 2).  Internal isTemporalLike
          // checks stay inside rankChartSubtypes — a chart-subtype concern, not
          // a widget-type drift source.
          const { dims: _chartDims, measures: _chartMeasures } = splitDimsAndMeasures(columns);
          const _bestChartSubtype = _savedChartType
            ?? rankChartSubtypes(_chartDims, _chartMeasures, { cardinality, extractions: extractionsSet })[0];
          const _bestChartMeta = CHART_TYPES.find((ct) => ct.type === _bestChartSubtype);

          const renderButton = (type: WidgetType, isRecommended: boolean, inMainGrid: boolean) => {
            const meta = WIDGET_META[type];
            if (!meta) return null;
            let { label, Icon } = meta;
            // In the main grid, show the specific chart subtype label + icon
            if (type === "chart" && inMainGrid && _bestChartMeta) {
              label = `Chart (${_bestChartMeta.label})`;
              Icon = _bestChartMeta.icon;
            }
            const isSelected = selectedWidget.type === type;
            const isBest = type === bestPick;
            return (
              <button
                key={type}
                id={`btnVisualizeAs-${type}`}
                type="button"
                onClick={() => {
                  changeWidgetRenderMode(selectedWidget.id, type);
                  // ANY palette click is an explicit user choice — recommended,
                  // sensible, or from "More widgets". `userPicked: true` pins
                  // the widget type permanently against the store's one-shot
                  // auto-switch (see canvas-store's setWidgetQueryResult:
                  // skips widgets with userPicked=true). Seed target widget's
                  // display fields with the shared helper so the first-time
                  // click on Number / Gauge / Progress / Trend / Sankey lands
                  // on sensible preselected columns without an extra click.
                  const prevConfig = selectedWidget.displayConfig || {};
                  // Strip auto-picked values from prior widget-type eras so the
                  // new type's seeder re-picks using its own heuristic. The
                  // `_auto_<key>` sibling flag (written by the `seed()` helper
                  // in widget-defaults.ts) is the contract distinguishing
                  // "auto-picked, free to refresh" from "user-set via Display
                  // panel, sacred". Fixes the gauge↔progress `field` carryover
                  // and the trend↔sankey `valueField` carryover.
                  const cleaned: WidgetDisplayConfig = {};
                  for (const [k, v] of Object.entries(prevConfig)) {
                    if (k.startsWith("_auto_")) continue;            // drop the flags themselves
                    if (prevConfig[`_auto_${k}`]) continue;          // drop auto-picked values
                    cleaned[k] = v;
                  }
                  const patch = seedDisplayConfigForType(
                    type,
                    cleaned,
                    columns,
                    { cardinality, extractions: extractionsSet },
                    selectedWidget.shape,
                  );
                  updateWidgetDisplayConfig(selectedWidget.id, {
                    ...(patch ?? cleaned),
                    userPicked: true,
                  });
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                  isSelected
                    ? "bg-base-100 text-base-content shadow-sm"
                    : isRecommended
                      ? "text-base-content hover:bg-base-100/60"
                      : "text-base-content/60 hover:text-base-content"
                }`}
                title={isBest ? "Best fit for the current data" : undefined}
              >
                {isBest && (
                  /* Heroicon: sparkles */
                  <svg id="sparklesBadge" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="sparkles-icon w-2.5 h-2.5 absolute top-0.5 right-0.5 text-amber-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
                )}
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          };

          const mainGrid = [...sensibilityGroups.recommended, ...sensibilityGroups.sensible];
          const moreGrid = sensibilityGroups.nonsensible;
          const recSet = new Set(sensibilityGroups.recommended);

          return (
            <div id="visualizeAsSection">
              <label className="text-[10px] font-semibold text-base-content/60 uppercase tracking-wider mb-1.5 block">
                Visualize as
              </label>
              <div id="visualizeAsGrid" className="grid grid-cols-5 gap-0.5 p-0.5 bg-base-200/50 rounded-lg">
                {mainGrid.map((type) => renderButton(type, recSet.has(type), true))}
              </div>
              {moreGrid.length > 0 && (
                <div className="mt-1.5">
                  <button
                    id="btnMoreWidgets"
                    type="button"
                    onClick={() => setShowMoreWidgets((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-base-content/60 hover:text-base-content uppercase tracking-wider w-full"
                  >
                    {/* Heroicon: chevron-down */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={`w-3 h-3 transition-transform ${showMoreWidgets ? "" : "-rotate-90"}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    More widgets
                    <span className="font-normal normal-case lowercase ml-1">
                      ({moreGrid.length} less suited for this data)
                    </span>
                  </button>
                  {showMoreWidgets && (
                    <div id="moreWidgetsGrid" className="grid grid-cols-5 gap-0.5 p-0.5 mt-1 bg-base-200/30 rounded-lg">
                      {moreGrid.map((type) => renderButton(type, false, false))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Widget type label (for non-data widgets) */}
        {!isDataWidget && (
          <h3 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            {selectedWidget.type}
          </h3>
        )}

        {/* Tab switcher — only for data widgets */}
        {isDataWidget && (
          <div className="flex gap-0.5 p-0.5 bg-base-200/50 rounded-lg">
            <button
              id="btnDataTab"
              onClick={() => setActiveTab("data")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                activeTab === "data" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"
              }`}
            >
              {/* Heroicon: circle-stack */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
              Data
            </button>
            <button
              id="btnDisplayTab"
              onClick={() => setActiveTab("display")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                activeTab === "display" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"
              }`}
            >
              {/* Heroicon: swatch */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" /></svg>
              Display
            </button>
          </div>
        )}

        {/* Data tab */}
        {isDataWidget && activeTab === "data" && (
          <QueryBuilder
            widgetId={selectedWidget.id}
            dataSource={selectedWidget.dataSource}
            onChange={(ds: DataSource) => updateWidgetDataSource(selectedWidget.id, ds)}
            connectionId={connectionId}
          />
        )}

        {/* Display tab */}
        {isDataWidget && activeTab === "display" && (
          <div className="space-y-4">
            {/* Column-detection helper.  Hidden once columns are populated — with
                the auto-populate effect above, a Run in the Data tab fills this
                in automatically, so the button is a quiet fallback for the
                "typed SQL but haven't clicked Run yet" case and for retry on error. */}
            {columns.length === 0 && (
              <div className="p-3 rounded-md border border-dashed border-base-300 bg-base-200/30 text-xs space-y-2">
                <p className="text-base-content/60">
                  No columns yet. Pick a table in the Data tab, or click Run to load the columns.
                </p>
                <button
                  type="button"
                  id="btnDetectColumns"
                  onClick={detectColumnsFromQuery}
                  disabled={widgetQueryLoading || !connectionId || !selectedWidget.dataSource}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {widgetQueryLoading
  ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
  : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
}
                  {widgetQueryLoading ? "Detecting..." : "Detect columns from query"}
                </button>
                {(detectError || widgetQueryError) && (
                  <p className="text-error">{detectError || widgetQueryError}</p>
                )}
              </div>
            )}

            {/* Component-specific config */}
            {selectedWidget.type === "chart" && (
              <ChartConfig
                config={selectedWidget.displayConfig}
                columns={columns}
                onChange={handleDisplayChange}
                rankingHints={{ cardinality, extractions: extractionsSet }}
              />
            )}
            {selectedWidget.type === "tabulator" && (
              <TabulatorConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} rowCount={lastRowCount} />
            )}
            {selectedWidget.type === "pivot" && (
              <PivotConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "number" && (
              <NumberConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "map" && (
              <MapConfig config={selectedWidget.displayConfig} columns={columns} shape={selectedWidget.shape} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "sankey" && (
              <SankeyConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} cardinality={cardinality} />
            )}
            {selectedWidget.type === "gauge" && (
              <GaugeConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "trend" && (
              <TrendConfig config={selectedWidget.displayConfig} columns={columns} shape={selectedWidget.shape} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "progress" && (
              <ProgressConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
            )}
            {selectedWidget.type === "detail" && (
              <DetailConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
            )}

            {/* DSL Customizer — only the 3 widget types that have a DSL surface. */}
            {(selectedWidget.type === "chart" ||
              selectedWidget.type === "tabulator" ||
              selectedWidget.type === "pivot") && (
              <div className="pt-2 border-t border-base-300/50">
                <BidirectionalDslCustomizer
                  widgetId={selectedWidget.id}
                  widgetType={selectedWidget.type}
                  columns={columns}
                  sampleData={sampleData}
                />
              </div>
            )}
          </div>
        )}

        {/* Text widget — textarea; rendered as markdown in the widget */}
        {isText && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-base-content/60">Text</label>
            <textarea
              id="txtWidgetTextContent"
              value={(selectedWidget.displayConfig.textContent as string) || ""}
              onChange={(e) => handleDisplayChange({ ...selectedWidget.displayConfig, textContent: e.target.value })}
              placeholder={"# Heading\n**bold**, *italic*\n- bullet one\n- bullet two"}
              rows={10}
              className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content font-mono resize-y min-h-[120px]"
            />
            <p className="text-[11px] text-base-content/60">
              Supports simple markdown: <code># heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>- list</code>, <code>[link](url)</code>, tables.
            </p>
          </div>
        )}

        {/* Divider widget — purely visual, no config */}
        {isDivider && (
          <div className="text-xs text-base-content/60 p-3 rounded-md border border-dashed border-base-300 bg-base-200/30">
            A divider has no configuration — it's a visual separator. Drag the corners to resize, or delete it with the × button.
          </div>
        )}

        {/* iFrame widget — embed an external page. Sandboxed by default. */}
        {isIframe && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-base-content/60">URL</label>
            <input
              type="url"
              value={(selectedWidget.displayConfig.iframeUrl as string) || ""}
              onChange={(e) => handleDisplayChange({ ...selectedWidget.displayConfig, iframeUrl: e.target.value })}
              placeholder="https://example.com/embed"
              className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
            />
            <label className="text-xs font-medium text-base-content/60 mt-2 block">Title (a11y)</label>
            <input
              value={(selectedWidget.displayConfig.iframeTitle as string) || ""}
              onChange={(e) => handleDisplayChange({ ...selectedWidget.displayConfig, iframeTitle: e.target.value })}
              placeholder="Embedded content"
              className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
            />
            <label className="text-xs font-medium text-base-content/60 mt-2 block">
              Sandbox
              <span className="ml-1 text-[10px] font-normal text-base-content/60">(space-separated tokens)</span>
            </label>
            <input
              value={(selectedWidget.displayConfig.iframeSandbox as string) ?? "allow-scripts allow-same-origin allow-popups allow-forms"}
              onChange={(e) => handleDisplayChange({ ...selectedWidget.displayConfig, iframeSandbox: e.target.value })}
              placeholder="allow-scripts allow-same-origin"
              className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content font-mono"
            />
            <p className="text-[11px] text-base-content/60">
              Default sandbox blocks the embed from navigating the parent page. Clear to remove all restrictions, or use only the tokens you need (e.g. <code>allow-scripts</code>).
            </p>
          </div>
        )}

        {/* Filter Pane config — needs data source (for table) + display (for field) */}
        {isFilterPane && (
          <div className="space-y-4">
            <QueryBuilder
              widgetId={selectedWidget.id}
              dataSource={selectedWidget.dataSource}
              onChange={(ds: DataSource) => updateWidgetDataSource(selectedWidget.id, ds)}
              connectionId={connectionId}
            />
            <div className="pt-2 border-t border-base-300/50">
              {columns.length === 0 && (
                <div className="mb-3 p-3 rounded-md border border-dashed border-base-300 bg-base-200/30 text-xs space-y-2">
                  <p className="text-base-content/60">
                    No columns yet. Pick a table in the Data tab, or click Run to load the columns.
                  </p>
                  <button
                    type="button"
                    onClick={detectColumnsFromQuery}
                    disabled={widgetQueryLoading || !connectionId || !selectedWidget.dataSource}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {widgetQueryLoading
  ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
  : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
}
                    {widgetQueryLoading ? "Detecting..." : "Detect columns from query"}
                  </button>
                  {(detectError || widgetQueryError) && (
                    <p className="text-error">{detectError || widgetQueryError}</p>
                  )}
                </div>
              )}
              <FilterPaneConfig config={selectedWidget.displayConfig} columns={columns} onChange={handleDisplayChange} />
              <div className="pt-2">
                <BidirectionalDslCustomizer
                  widgetId={selectedWidget.id}
                  widgetType="filter-pane"
                  columns={columns}
                  sampleData={sampleData}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
import { IconSparkles as Sparkles } from "@/components/shared/Icons";
import { fetchSchema, getConnectionType } from "@/lib/explore-data/rb-api";
import { buildSql } from "@/lib/explore-data/sql-builder";
import {
  autoSummarize,
  isIdColumn,
  defaultDisplay,
  shapeFromResult,
  shouldShowLegend,
  enforceChartTypeLimits,
  clipTopN,
  sortBarsDesc,
  colorForDataset,
  TOP_N_DEFAULT,
  splitDimsAndMeasures,
  pickDefaultAxes,
  canReuseAxisPicks,
} from "@/lib/explore-data/smart-defaults";
import { inferColumnsFromRow } from "@/lib/explore-data/widget-defaults";
import { useDslConfig } from "@/lib/hooks/use-dsl-config";
import type { ChartDslOptions, ChartDataBlock } from "@/lib/explore-data/dsl-sync/chart-mapping";
import type { ColumnSchema } from "@/lib/explore-data/types";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: this widget renders FROM the DSL Map produced by
 * useDslConfig (the canonical configuration). Same Map flows to <rb-chart>
 * here AND to the published page after DSL→parse round-trip.
 * ============================================================================
 */

/** Read x-axis fields from the canonical Map: [labelField, seriesField]. */
function readXFields(map: ChartDslOptions): string[] {
  const data = (map.data as ChartDataBlock | undefined) ?? {};
  const out: string[] = [];
  if (typeof data.labelField === "string" && data.labelField) out.push(data.labelField);
  if (typeof data.seriesField === "string" && data.seriesField) out.push(data.seriesField);
  return out;
}

/** Read y-axis fields from the canonical Map: datasets[].field. */
function readYFields(map: ChartDslOptions): string[] {
  const data = (map.data as ChartDataBlock | undefined) ?? {};
  return (data.datasets ?? []).map((d) => d.field).filter((f): f is string => Boolean(f));
}

/** Read the chart title from `options.plugins.title.text`. */
function readTitle(map: ChartDslOptions): string {
  const opts = map.options as Record<string, unknown> | undefined;
  const plugins = opts?.plugins as Record<string, unknown> | undefined;
  const title = plugins?.title as Record<string, unknown> | undefined;
  return typeof title?.text === "string" ? title.text : "";
}

/** Read the legend setting: "show" | "hide" | "auto" (auto = key absent). */
function readLegend(map: ChartDslOptions): "auto" | "show" | "hide" {
  const opts = map.options as Record<string, unknown> | undefined;
  const plugins = opts?.plugins as Record<string, unknown> | undefined;
  const legend = plugins?.legend as Record<string, unknown> | undefined;
  if (legend === undefined) return "auto";
  if (typeof legend.display === "boolean") return legend.display ? "show" : "hide";
  return "auto";
}

const PALETTE_COLORS: Record<string, string[]> = {
  default: [],   // empty = fall through to colorForDataset (semantic colours)
  warm:    ["#d62728","#ff7f0e","#ffbb78","#8c564b","#e377c2","#f7b6d2","#bcbd22","#dbdb8d"],
  cool:    ["#1f77b4","#aec7e8","#2ca02c","#98df8a","#9467bd","#c5b0d5","#17becf","#9edae5"],
  pastel:  ["#a8dadc","#f4a261","#e9c46a","#2a9d8f","#e76f51","#457b9d","#1d3557","#264653"],
  mono:    ["#1a1a1a","#404040","#666666","#8c8c8c","#b3b3b3"],
};

function paletteColor(palette: string[], key: string, idx: number): string {
  if (palette.length === 0) return colorForDataset(key, idx);
  return palette[idx % palette.length];
}

interface ChartWidgetProps {
  widgetId: string;
}

// Build a ColumnSchema[] from result row keys. Prefers tableSchema's typeName
// info when the column exists there; otherwise falls back to the centralized
// inferColumnsFromRow (SINGLE TRUTH per smart-defaults/classification.ts).
// Used to feed the library's `splitDimsAndMeasures` + `pickDefaultAxes`.
function resultColumnsFrom(
  keys: string[],
  row0: Record<string, unknown> | undefined,
  tableSchema: import("@/lib/explore-data/types").TableSchema | null,
): ColumnSchema[] {
  const inferred = row0 ? inferColumnsFromRow(row0) : [];
  const inferredByName = new Map(inferred.map((c) => [c.columnName, c]));
  return keys.map((k) => {
    const fromTable = tableSchema?.columns.find((c) => c.columnName === k);
    if (fromTable) return fromTable;
    return inferredByName.get(k) ?? { columnName: k, typeName: "VARCHAR", isNullable: true };
  });
}

function buildChartJsData(
  rows: Record<string, unknown>[],
  xField: string,
  yFields: string[],
  chartType: string,
  paletteColors: string[] = [],
): {
  labels: string[];
  datasets: {
    label: string;
    data: (number | null)[] | { x: number; y: number }[];
    backgroundColor?: string | string[];
    borderColor?: string;
    tension?: number;
  }[];
} {
  // 4.1 — scatter: two measures, X and Y are BOTH numeric. No labels; data is (x,y) points.
  if (chartType === "scatter" && yFields.length >= 2) {
    const xKey = yFields[0];
    const yKey = yFields[1];
    const points = rows
      .map((r) => {
        const xv = r[xKey];
        const yv = r[yKey];
        const x = typeof xv === "number" ? xv : Number(xv);
        const y = typeof yv === "number" ? yv : Number(yv);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    return {
      labels: [],
      datasets: [{
        label: `${xKey} vs ${yKey}`,
        data: points,
        backgroundColor: paletteColor(paletteColors, yKey, 0),
        borderColor: paletteColor(paletteColors, yKey, 0),
      }],
    };
  }

  const labels = rows.map((r) => (r[xField] == null ? "" : String(r[xField])));
  const isPieLike = chartType === "pie" || chartType === "doughnut";
  const isLine = chartType === "line";
  // 4.3 — line smoothing on >24 points (monthly business data over 2+ years).
  const tension = isLine && labels.length > 24 ? 0.3 : undefined;

  const datasets = yFields.map((key, idx) => {
    const data = rows.map((r) => {
      const v = r[key];
      if (v == null) return null;
      if (typeof v === "number") return v;
      const n = Number(v);
      return isNaN(n) ? null : n;
    });

    // Pie/doughnut colors per slice: each slice is a category (label), not a series.
    // Cycle the categorical palette across labels. Semantic colors don't apply
    // to individual slices (the field doesn't tell us slice-level meaning).
    if (isPieLike) {
      const sliceColors = labels.map((_, i) => paletteColor(paletteColors, "", i));
      return { label: key, data, backgroundColor: sliceColors };
    }

    // Bar/line: one color per dataset (semantic rules apply to the Y-field name).
    const c = paletteColor(paletteColors, key, idx);
    return { label: key, data, backgroundColor: c, borderColor: c, tension };
  });
  return { labels, datasets };
}

/**
 * Multi-series chart data: pivot `rows` client-side so the second dimension's
 * distinct values become one dataset each, aligned to the x-axis labels.
 * Used when `defaultDisplay` returns `displayConfig.series === true` — e.g.
 * "orders per month per country" now renders as multi-line instead of being
 * nudged to a pivot.
 */
function buildChartJsDataWithSeries(
  rows: Record<string, unknown>[],
  xField: string,
  seriesField: string,
  yField: string,
  chartType: string,
  paletteColors: string[] = [],
): {
  labels: string[];
  datasets: {
    label: string;
    data: (number | null)[];
    backgroundColor: string;
    borderColor: string;
    tension?: number;
  }[];
} {
  const labelsSet = new Set<string>();
  // Count rows per series value so we can keep only the top N by row-count
  // when the series-split exceeds MAX_SERIES (see cap below).
  const seriesCount = new Map<string, number>();
  for (const r of rows) {
    labelsSet.add(r[xField] == null ? "" : String(r[xField]));
    const s = r[seriesField] == null ? "" : String(r[seriesField]);
    seriesCount.set(s, (seriesCount.get(s) ?? 0) + 1);
  }
  const labels = [...labelsSet];

  // MAX_SERIES cap: if the series-split column has too many distinct values,
  // keep only the top-N (by row count, approximates "by magnitude"). Dropping
  // is better than rendering 100+ unreadable overlapping lines.
  const MAX_SERIES = 100;
  const seriesValues = seriesCount.size > MAX_SERIES
    ? [...seriesCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SERIES).map(([k]) => k)
    : [...seriesCount.keys()];
  const allowedSeries = new Set(seriesValues);

  const lookup = new Map<string, number>();
  for (const r of rows) {
    const x = r[xField] == null ? "" : String(r[xField]);
    const s = r[seriesField] == null ? "" : String(r[seriesField]);
    if (!allowedSeries.has(s)) continue;
    const v = r[yField];
    const n = typeof v === "number" ? v : Number(v);
    lookup.set(`${s}\u0000${x}`, Number.isFinite(n) ? n : NaN);
  }

  const isLine = chartType === "line";
  const tension = isLine && labels.length > 24 ? 0.3 : undefined;

  const datasets = seriesValues.map((s, idx) => {
    const c = paletteColor(paletteColors, String(s), idx);
    const data = labels.map((x) => {
      const v = lookup.get(`${s}\u0000${x}`);
      return v == null || Number.isNaN(v) ? null : v;
    });
    return { label: String(s), data, backgroundColor: c, borderColor: c, tension };
  });

  return { labels, datasets };
}

export function ChartWidget({ widgetId }: ChartWidgetProps) {
  const { result, loading, error, tableSchema, connectionSchemas } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const connectionId = useCanvasStore((s) => s.connectionId);
  const updateWidgetDataSource = useCanvasStore((s) => s.updateWidgetDataSource);
  const updateWidgetDisplayConfig = useCanvasStore((s) => s.updateWidgetDisplayConfig);
  const changeWidgetRenderMode = useCanvasStore((s) => s.changeWidgetRenderMode);
  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-chart");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr] = useState<string | null>(null);

  // Top-N clip state — "+ N more hidden" note shown below the chart.
  const [hiddenCount, setHiddenCount] = useState(0);

  const { config: dslMap, updateConfig: updateDslMap } = useDslConfig(widgetId, "chart");

  const ds = widget?.dataSource;
  const vq = ds?.visualQuery;
  const isVisualMode = ds?.mode === "visual" || ds?.mode === undefined;
  const hasTablePick = Boolean(vq?.table);
  const hasAggregation =
    (vq?.summarize && vq.summarize.length > 0) || (vq?.groupBy && vq.groupBy.length > 0);

  const showAutoSummarizePrompt = isVisualMode && hasTablePick && !hasAggregation;

  const handleAutoSummarize = async () => {
    if (!widget || !connectionId || !vq?.table) return;
    setAutoBusy(true);
    setAutoErr(null);
    try {
      const schema = await fetchSchema(connectionId);
      const tbl = schema.tables.find((t) => t.tableName === vq.table);
      if (!tbl) {
        setAutoErr(`Table ${vq.table} not found in schema.`);
        return;
      }
      // autoSummarize is async — it probes date range + cardinality.
      const newVq = await autoSummarize(connectionId, tbl);
      const newSql = buildSql(newVq, { connectionType: getConnectionType(connectionId) });
      updateWidgetDataSource(widget.id, { mode: "visual", visualQuery: newVq, generatedSql: newSql });
    } catch (e) {
      setAutoErr(e instanceof Error ? e.message : "Auto-summarize failed");
    } finally {
      setAutoBusy(false);
    }
  };

  // Render effect: shape detection, chart-type pick, top-N clip, sort desc, pie limits.
  useEffect(() => {
    if (!ready || !ref.current) return;
    if (!result || result.data.length === 0) return;
    if (showAutoSummarizePrompt) return;

    let rows = result.data;
    const keys = Object.keys(rows[0]);

    // Hard cap — defense in depth. `useWidgetData` already limits SQL to 500
    // rows by default, but a user-edited SQL or an unbounded visualQuery could
    // push this higher. Rendering Chart.js with >10k points is sluggish and
    // provides no readable insight. Bail early with a visible message.
    const MAX_CHART_ROWS = 10000;
    if (rows.length > MAX_CHART_ROWS) {
      const el = ref.current as HTMLElement & { data?: unknown; options?: unknown };
      el.data = { labels: [], datasets: [] };
      el.options = {
        plugins: {
          title: {
            display: true,
            text: `Dataset too large for a chart (${rows.length} rows, limit ${MAX_CHART_ROWS}). Add a filter or an aggregation.`,
            font: { size: 12 },
          },
        },
      };
      return;
    }

    // ── Read all chart config from the canonical DSL Map at displayConfig.dslConfig.
    const chartTitle      = readTitle(dslMap);
    const chartShowLegend = readLegend(dslMap);
    const chartPalette    = (dslMap.palette as string | undefined) ?? "default";
    const paletteColors   = PALETTE_COLORS[chartPalette] ?? [];
    const configChartType = dslMap.type as string | undefined;
    const configXFields   = readXFields(dslMap);
    const configYFields   = readYFields(dslMap);

    const groupByCols = (vq?.groupBy ?? []).filter((c) => keys.includes(c));
    const groupByBuckets = vq?.groupByBuckets ?? {};
    const userSort = vq?.sort && vq.sort.length > 0;

    // Ask the library to classify result columns and pick default axes.
    // ID / FK columns (`ShipVia`, `*_id`, etc.) are excluded before splitting
    // so they never become X or Y candidates. pickDefaultAxes handles scatter
    // and bubble special-cases (2 measures as X/Y, optional 3rd for radius).
    const resultColumns = resultColumnsFrom(keys, rows[0], tableSchema)
      .filter((c) => !isIdColumn(c.columnName, tableSchema ?? undefined));
    const { dims, measures } = splitDimsAndMeasures(resultColumns);
    const axes = pickDefaultAxes(dims, measures, configChartType ?? "bar");

    // X: user pick wins IF still valid (canReuseAxisPicks guards against
    // stale picks that reference columns removed from the query). Otherwise
    // prefer the query's first groupBy column (reflects grouping intent),
    // else the library's auto-pick.
    let xField: string | undefined;
    if (canReuseAxisPicks(configXFields, resultColumns)) {
      xField = configXFields[0];
    } else if (groupByCols.length > 0) {
      xField = groupByCols[0];
    } else {
      xField = axes.xFields[0] ?? keys[0];
    }

    // Y: same stale-pick guard; else library's measures (excluding X if it
    // somehow landed there); else first non-X non-ID column as last resort.
    let yFields: string[];
    if (canReuseAxisPicks(configYFields, resultColumns)) {
      yFields = configYFields;
    } else {
      yFields = axes.yFields.filter((k) => k !== xField);
      if (yFields.length === 0) {
        const fallback = keys.find((k) => k !== xField && !isIdColumn(k, tableSchema ?? undefined));
        if (fallback) yFields = [fallback];
      }
    }

    // In visual mode, groupByCols comes from vq?.groupBy and lists the explicit
    // GROUP BY columns. In SQL/script mode there is no visual query, so groupByCols
    // is always [].  For shape classification we fall back to treating all
    // non-measure, non-ID result columns as effective dims — this lets
    // shapeFromResult's Step-3 name heuristics fire for computed SQL aliases like
    // `order_month` and correctly infer temporal → line vs categorical → bar.
    // yFields is already resolved above, so this is safe to compute here.
    const effectiveGroupByCols = groupByCols.length > 0
      ? groupByCols
      : keys.filter((k) => !yFields.includes(k) && !isIdColumn(k, tableSchema ?? undefined));

    // Shape-based display decision — still used for the chart subtype default
    // (bar / line / scatter) when the user hasn't explicitly picked one. The
    // widget-type auto-switch that used to live here has been removed: the
    // palette and `defaultDisplay` now share a single classifier
    // (smart-defaults/widget-picker.ts), so any widget offered in the palette's
    // recommended row will actually render without being silently flipped to a
    // different type. Respect the user's click — if they chose this widget
    // from the palette, they want to see it render.
    // Pass connectionSchemas (all tables for this connection) as the 8th arg
    // so SQL/script result columns are cross-referenced against source table
    // column metadata before falling back to name-pattern heuristics.
    const shape = shapeFromResult(
      keys, effectiveGroupByCols, groupByBuckets, yFields,
      tableSchema,
      undefined,          // cardinality — not probed at chart render time
      undefined,          // resultColumnSchemas — superseded by connectionSchemas
      connectionSchemas,  // Step 2 cross-reference: all tables in this connection
    );
    const decision = defaultDisplay(shape, { table: tableSchema ?? undefined, currentWidgetType: "chart" });

    // Chart type: explicit override > decision.
    const chartType0: string = configChartType ?? decision.chartType ?? "bar";
    let chartType = chartType0;

    // Enforce pie slice cap: >5 distinct X values → downgrade pie to bar.
    // Boolean dims must produce exactly 2 slices; else downgrade.
    // Skip enforcement when user explicitly set the type — their choice overrides the guardrail.
    const firstDimKind = shape.dims[0]?.kind;
    if (!configChartType) {
      chartType = enforceChartTypeLimits(chartType, rows.length, firstDimKind);
    }

    // Effective seriesField: user pick wins; else auto-promote the visual
    // query's 2nd groupBy column when shape allows (2+ dims, 1 measure).
    // Without this, an explicit Line/Area chart with `groupBy: [ts, run_id]` +
    // `AVG(equity)` would collapse to a single line because `seriesField` was
    // never populated in the DSL Map.
    let effectiveSeriesField: string | undefined = configXFields[1];
    if (
      !effectiveSeriesField &&
      groupByCols.length >= 2 &&
      yFields.length === 1
    ) {
      const candidate = groupByCols[1];
      if (candidate && candidate !== xField && keys.includes(candidate)) {
        effectiveSeriesField = candidate;
      }
    }

    // ── Persist auto-picks back to the canonical Map (Principle 4).
    //    The publisher reads displayConfig.dslConfig directly, so picks made
    //    only at render-time would never reach the exported chart-config.groovy.
    //    Compare snapshots first to avoid update loops.
    if (xField && yFields.length > 0) {
      const dataBlock: { labelField: string; seriesField?: string; datasets: { field: string; label: string }[] } = {
        labelField: xField,
        datasets: yFields.map((f) => ({ field: f, label: f })),
      };
      if (effectiveSeriesField && keys.includes(effectiveSeriesField)) {
        dataBlock.seriesField = effectiveSeriesField;
      }
      const desiredMap = { ...dslMap, type: chartType, data: dataBlock };
      // Snapshot diff: only write when something actually changed. Without this
      // every render re-writes the same Map, looping the effect and pegging CPU.
      if (JSON.stringify(desiredMap) !== JSON.stringify(dslMap)) {
        updateDslMap(desiredMap);
      }
    }

    // Top-N clip + sort desc for bar charts (unless user specified a sort, OR
    // the user has opted to "show all" via the footer override from 4.7).
    const showAll = (widget?.displayConfig.chartShowAll as boolean | undefined) === true;
    let clipped = 0;
    if (chartType === "bar" && !userSort && !showAll && yFields.length > 0) {
      const primaryY = yFields[0];
      if (rows.length > TOP_N_DEFAULT) {
        const { rows: kept, hiddenCount } = clipTopN(rows, primaryY, TOP_N_DEFAULT);
        rows = kept;
        clipped = hiddenCount;
      } else {
        rows = sortBarsDesc(rows, primaryY);
      }
    } else if (chartType === "bar" && showAll && !userSort && yFields.length > 0) {
      // "Show all" mode: still sort desc by value, just don't clip.
      rows = sortBarsDesc(rows, yFields[0]);
    }
    setHiddenCount(clipped);

    const el = ref.current as HTMLElement & {
      data?: unknown;
      type?: string;
      options?: unknown;
    };

    // Multi-series pivot: split datasets by the 2nd dimension when present.
    // `effectiveSeriesField` covers both the user's explicit pick AND the
    // auto-promotion of groupByCols[1] computed above, so this path fires on
    // the very first render — no round-trip through DSL persistence required.
    const wantsSeries = !!effectiveSeriesField
      && yFields.length >= 1
      && !!xField
      && keys.includes(effectiveSeriesField);

    if (wantsSeries) {
      el.data = buildChartJsDataWithSeries(rows, xField!, effectiveSeriesField!, yFields[0], chartType, paletteColors);
    } else {
      el.data = buildChartJsData(rows, xField!, yFields, chartType, paletteColors);
    }
    el.type = chartType;
    // Grouped bar: multi-measure or two-categorical bar charts should be
    // side-by-side, not stacked.
    const isGroupedBar =
      chartType === "bar" &&
      !configChartType &&
      (decision.displayConfig?.grouped === true || yFields.length >= 2);

    const legendDisplay =
      chartShowLegend === "show" ? true
      : chartShowLegend === "hide" ? false
      : shouldShowLegend(yFields.length);   // "auto"

    const isPieType = chartType === "doughnut" || chartType === "pie";

    el.options = {
      maintainAspectRatio: false,
      animation: false,                          // clutter cut: instant updates
      plugins: {
        title: {
          display: Boolean(chartTitle),
          text: chartTitle,
        },
        legend: {
          display: legendDisplay,
          ...(isPieType && legendDisplay ? { position: "right" } : {}),
        },
      },
      // Pie/doughnut charts have no cartesian axes — omitting scales prevents
      // Chart.js from rendering phantom axis numbers around the chart.
      ...(!isPieType && {
        scales: {
          x: {
            grid: { display: false },
            stacked: isGroupedBar ? false : undefined,
          },
          y: {
            grid: { color: "rgba(0,0,0,0.06)" },
            title: { display: false },
            stacked: isGroupedBar ? false : undefined,
          },
        },
      }),
    };
  }, [ready, result, widget?.displayConfig, vq?.groupBy, vq?.groupByBuckets, vq?.sort, showAutoSummarizePrompt]);

  // ─── Render branches ──────────────────────────────────────────────────────

  if (showAutoSummarizePrompt) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-base-content mb-1">
            {vq?.table ?? "This data"} has no aggregation yet
          </p>
          <p className="text-[11px] text-base-content/60 mb-3">
            A chart needs rows to be grouped and summarized. Pick defaults, or configure manually in the Data tab.
          </p>
          <button
            type="button"
            onClick={handleAutoSummarize}
            disabled={autoBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {autoBusy
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
            }
            {autoBusy ? "Analyzing…" : "Auto-summarize this data"}
          </button>
          {autoErr && <p className="mt-2 text-[11px] text-error">{autoErr}</p>}
          <button
            type="button"
            onClick={() => widget && changeWidgetRenderMode(widget.id, "number")}
            className="block mx-auto mt-2 text-[11px] text-base-content/60 hover:text-base-content"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline w-3 h-3 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" /></svg>
            Show as Number instead
          </button>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
    </div>
  );
  if (error) return <div id={`widgetError-${widgetId}`} className="text-xs text-error p-2 overflow-hidden">Query error: {error.split('\n')[0].slice(0, 200)}</div>;
  if (!result) return null;
  if (!ready) return (
    <div className="flex items-center justify-center h-full text-xs text-base-content/60">
      Loading components...
    </div>
  );

  // Main render: chart in the middle, optional top-N footer.
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        {/* @ts-expect-error - Web component custom element */}
        <rb-chart ref={ref} id={`widgetViz-${widgetId}`} style={{ position: "absolute", inset: 0, display: "block" }} />
      </div>
      {hiddenCount > 0 && widget && (
        <div className="shrink-0 px-2 py-0.5 text-[10px] text-base-content/60 bg-base-200/40 border-t border-base-300/50 flex items-center justify-between gap-2">
          <span className="truncate">
            showing top {TOP_N_DEFAULT} of {TOP_N_DEFAULT + hiddenCount} — + {hiddenCount} more hidden
          </span>
          <button
            type="button"
            onClick={() => updateWidgetDisplayConfig(widget.id, { ...(widget.displayConfig || {}), chartShowAll: true })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/80 font-medium shrink-0"
            title="Show all bars — may be cluttered"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            Show all
          </button>
        </div>
      )}
      {(widget?.displayConfig?.chartShowAll as boolean | undefined) === true && widget && (
        <div className="shrink-0 px-2 py-0.5 text-[10px] text-base-content/60 bg-base-200/40 border-t border-base-300/50 flex items-center justify-between gap-2">
          <span className="truncate">showing all bars (no top-N limit)</span>
          <button
            type="button"
            onClick={() => updateWidgetDisplayConfig(widget.id, { ...(widget.displayConfig || {}), chartShowAll: false })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/80 font-medium shrink-0"
            title="Return to top-N view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
            Show top {TOP_N_DEFAULT}
          </button>
        </div>
      )}
    </div>
  );
}

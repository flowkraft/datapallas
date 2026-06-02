"use client";

// lucide-react removed
import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";

// ── Heroicon wrapper components used in CHART_TYPES array ────────────────────
const _BarChart3 = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
);
const _TrendingUp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>
);
const _PieChart = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>
);
const _Circle = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><circle cx="12" cy="12" r="9" /></svg>
);
const _Filter = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>
);
const _AlignStartHorizontal = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75h18M3 9.75v4.5M3 9.75V5.25m0 4.5h4.5m13.5 0h-9" /></svg>
);
const _AreaChart = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 18 9 12l3 3 6-6 3 3" /></svg>
);
const _Combine = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625Z" /></svg>
);
const _Disc3 = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /></svg>
);
const _BoxSelect = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><rect x="3" y="6" width="18" height="12" rx="1" /><line x1="12" y1="6" x2="12" y2="18" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
);
const _BarChart2 = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.125C3 3.504 3.504 3 4.125 3h2.25c.621 0 1.125.504 1.125 1.125v17.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0 1 3 21.375V4.125ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 13.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125v-8.25Z" /></svg>
);
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { isSensibleChartSubtype, rankChartSubtypes, type ChartRankingHints } from "@/lib/explore-data/smart-defaults";
import type { ChartDslOptions, ChartDataBlock } from "@/lib/explore-data/dsl-sync/chart-mapping";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: every UI gesture in this Display tab panel mutates
 * the canonical DSL Map at displayConfig.dslConfig — never the old structured
 * fields (chartType, xFields, yFields, chartTitle, etc., now removed).
 * ============================================================================
 */

const PALETTES = [
  { id: "default", label: "Default", colors: ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f"] },
  { id: "warm",    label: "Warm",    colors: ["#d62728","#ff7f0e","#ffbb78","#8c564b","#e377c2"] },
  { id: "cool",    label: "Cool",    colors: ["#1f77b4","#aec7e8","#2ca02c","#9467bd","#17becf"] },
  { id: "pastel",  label: "Pastel",  colors: ["#a8dadc","#f4a261","#e9c46a","#2a9d8f","#e76f51"] },
  { id: "mono",    label: "Mono",    colors: ["#1a1a1a","#555","#888","#aaa","#ccc"] },
] as const;

export const CHART_TYPES = [
  { type: "bar",       icon: _BarChart3,            label: "Bar" },
  { type: "row",       icon: _AlignStartHorizontal, label: "Row" },
  { type: "line",      icon: _TrendingUp,           label: "Line" },
  { type: "area",      icon: _AreaChart,            label: "Area" },
  { type: "combo",     icon: _Combine,              label: "Combo" },
  { type: "scatter",   icon: _Circle,               label: "Scatter" },
  { type: "bubble",    icon: _Disc3,                label: "Bubble" },
  { type: "pie",       icon: _PieChart,             label: "Pie" },
  { type: "doughnut",  icon: _Circle,               label: "Donut" },
  { type: "boxplot",   icon: _BoxSelect,            label: "Box" },
  { type: "waterfall", icon: _BarChart2,            label: "Waterfall" },
  { type: "funnel",    icon: _Filter,               label: "Funnel" },
];

interface ChartConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
  rankingHints?: ChartRankingHints;
}

function readDslMap(config: WidgetDisplayConfig): ChartDslOptions {
  return (config.dslConfig as ChartDslOptions) ?? {};
}

function setDslMap(
  config: WidgetDisplayConfig,
  next: ChartDslOptions,
  onChange: (c: WidgetDisplayConfig) => void,
): void {
  onChange({ ...config, dslConfig: next });
}

/** Read x-axis fields from the canonical Map: [labelField, seriesField] (filter empties). */
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

/** Replace the data block's labelField + seriesField from the new xFields[]. */
function writeXFields(map: ChartDslOptions, xFields: string[]): ChartDslOptions {
  const data: ChartDataBlock = { ...((map.data as ChartDataBlock | undefined) ?? {}) };
  if (xFields[0]) data.labelField = xFields[0]; else delete data.labelField;
  if (xFields[1]) data.seriesField = xFields[1]; else delete data.seriesField;
  const next: ChartDslOptions = { ...map };
  if (data.labelField || data.seriesField || (data.datasets && data.datasets.length > 0)) next.data = data;
  else delete next.data;
  return next;
}

/** Replace the data block's datasets from the new yFields[]. */
function writeYFields(map: ChartDslOptions, yFields: string[]): ChartDslOptions {
  const data: ChartDataBlock = { ...((map.data as ChartDataBlock | undefined) ?? {}) };
  if (yFields.length > 0) data.datasets = yFields.map((f) => ({ field: f, label: f }));
  else delete data.datasets;
  const next: ChartDslOptions = { ...map };
  if (data.labelField || data.seriesField || (data.datasets && data.datasets.length > 0)) next.data = data;
  else delete next.data;
  return next;
}

/** Read the chart title (`options.plugins.title.text`). */
function readTitle(map: ChartDslOptions): string {
  const opts = map.options as Record<string, unknown> | undefined;
  const plugins = opts?.plugins as Record<string, unknown> | undefined;
  const title = plugins?.title as Record<string, unknown> | undefined;
  return typeof title?.text === "string" ? title.text : "";
}

/** Read legend setting: "show" | "hide" | "auto" (auto = key absent). */
function readLegend(map: ChartDslOptions): "auto" | "show" | "hide" {
  const opts = map.options as Record<string, unknown> | undefined;
  const plugins = opts?.plugins as Record<string, unknown> | undefined;
  const legend = plugins?.legend as Record<string, unknown> | undefined;
  if (legend === undefined) return "auto";
  if (typeof legend.display === "boolean") return legend.display ? "show" : "hide";
  return "auto";
}

/** Update options.plugins.* immutably. */
function setPluginOption(map: ChartDslOptions, key: "title" | "legend", value: unknown): ChartDslOptions {
  const opts = { ...((map.options as Record<string, unknown> | undefined) ?? {}) };
  const plugins = { ...((opts.plugins as Record<string, unknown> | undefined) ?? {}) };
  if (value === undefined) delete plugins[key];
  else plugins[key] = value;
  if (Object.keys(plugins).length > 0) opts.plugins = plugins;
  else delete opts.plugins;
  const next: ChartDslOptions = { ...map };
  if (Object.keys(opts).length > 0) next.options = opts;
  else delete next.options;
  return next;
}

export function ChartConfig({ config, columns, onChange, rankingHints }: ChartConfigProps) {
  const map = readDslMap(config);

  const chartType = (map.type as string | undefined) ?? "bar";
  const xFields = readXFields(map);
  const yFields = readYFields(map);
  const bubbleSizeField = (map.bubbleSizeField as string | undefined) ?? "";
  const chartTitle = readTitle(map);
  const legend = readLegend(map);
  const palette = (map.palette as string | undefined) ?? "default";

  const hasSeriesSplit = xFields.length >= 2;

  const replaceAt = (arr: string[], idx: number, value: string): string[] => {
    if (!value) return arr.filter((_, i) => i !== idx);
    const next = arr.slice();
    next[idx] = value;
    return next;
  };

  const setXFields = (next: string[]) => setDslMap(config, writeXFields(map, next), onChange);
  const setYFields = (next: string[]) => setDslMap(config, writeYFields(map, next), onChange);

  const addXSlot = (value: string) => setXFields([...xFields, value]);
  const addYSlot = (value: string) => setYFields([...yFields, value]);
  const removeXSlot = (idx: number) => setXFields(xFields.filter((_, i) => i !== idx));
  const removeYSlot = (idx: number) => setYFields(yFields.filter((_, i) => i !== idx));

  const setChartType = (type: string) => setDslMap(config, { ...map, type }, onChange);

  const setBubbleSizeField = (f: string) => {
    const next: ChartDslOptions = { ...map };
    if (f) next.bubbleSizeField = f;
    else delete next.bubbleSizeField;
    setDslMap(config, next, onChange);
  };

  const setChartTitle = (title: string) => {
    if (title) {
      setDslMap(config, setPluginOption(map, "title", { display: true, text: title }), onChange);
    } else {
      setDslMap(config, setPluginOption(map, "title", undefined), onChange);
    }
  };

  const setLegend = (v: "auto" | "show" | "hide") => {
    if (v === "auto") {
      setDslMap(config, setPluginOption(map, "legend", undefined), onChange);
    } else {
      setDslMap(config, setPluginOption(map, "legend", { display: v === "show" }), onChange);
    }
  };

  const setPalette = (id: string) => {
    const next: ChartDslOptions = { ...map };
    if (id && id !== "default") next.palette = id;
    else delete next.palette;
    setDslMap(config, next, onChange);
  };

  const dimensions = columns.filter((c) => getFieldKind(c) === "dimension");
  const measures = columns.filter((c) => getFieldKind(c) === "measure");

  const rankedOrder = rankChartSubtypes(dimensions, measures, rankingHints);
  const rankOf = (t: string) => {
    const i = rankedOrder.indexOf(t);
    return i === -1 ? 999 : i;
  };
  const subtypeOrdered = columns.length > 0
    ? [...CHART_TYPES]
        .map((ct) => ({ ...ct, ...isSensibleChartSubtype(ct.type, dimensions, measures) }))
        .sort((a, b) => {
          if (a.sensible !== b.sensible) return Number(b.sensible) - Number(a.sensible);
          return rankOf(a.type) - rankOf(b.type);
        })
    : CHART_TYPES.map((ct) => ({ ...ct, sensible: true, reason: undefined as string | undefined }));

  return (
    <div id="configPanel-chart" className="space-y-3">
      <div>
        <span className="text-xs text-base-content/60">Chart type</span>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {subtypeOrdered.map(({ type, icon: Icon, label, sensible, reason }) => {
            const isSelected = chartType === type;
            const baseClass = "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-md text-[10px] transition-colors";
            const stateClass = isSelected
              ? "bg-primary/10 text-primary border border-primary/30"
              : "text-base-content/60 hover:bg-base-200 border border-transparent";
            const dimClass = !sensible && !isSelected ? "opacity-40" : "";
            return (
              <button
                key={type}
                id={`btnChartType-${type}`}
                aria-pressed={isSelected}
                onClick={() => setChartType(type)}
                title={!sensible ? `${label} — ${reason}. Pick anyway if you know what you're doing.` : label}
                aria-label={!sensible ? `${label} (not ideal: ${reason})` : label}
                className={`${baseClass} ${stateClass} ${dimClass}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
        {columns.length === 0 && (
          <p className="text-[10px] text-base-content/60 mt-1">
            Pick a table or run a query so we can suggest which charts fit your data shape.
          </p>
        )}
      </div>

      {chartType === "bubble" && (
        <div>
          <span className="text-xs text-base-content/60">
            Size <span className="text-emerald-500">(measure)</span>
          </span>
          <select
            value={bubbleSizeField}
            onChange={(e) => setBubbleSizeField(e.target.value)}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          >
            <option value="">Constant size</option>
            {measures.map((c) => (
              <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
            ))}
          </select>
          <p className="text-[10px] text-base-content/60 mt-1">
            Optional. When set, each bubble's radius reflects this measure.
          </p>
        </div>
      )}

      {chartType === "boxplot" && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          Box Plot expects un-aggregated rows. In the Data tab, leave Summarize empty so the component can compute quartiles per category.
        </div>
      )}

      <div>
        <span className="text-xs text-base-content/60">
          X axis <span className="text-blue-500">(dimension)</span>
        </span>
        <div className="mt-1 space-y-1">
          {xFields.map((field, idx) => (
            <div key={`x-${idx}`} className="flex items-center gap-1">
              <select
                id={`selectChartXAxis-${idx}`}
                value={field}
                onChange={(e) => setXFields(replaceAt(xFields, idx, e.target.value))}
                className="flex-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              >
                {dimensions.length > 0 && (
                  <optgroup label="Dimensions">
                    {dimensions.map((c) => (
                      <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
                    ))}
                  </optgroup>
                )}
                {measures.length > 0 && (
                  <optgroup label="Measures">
                    {measures.map((c) => (
                      <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="text-[10px] text-base-content/60 w-20 shrink-0">
                {idx === 0 ? "X axis" : "series by"}
              </span>
              <button
                id={`btnRemoveChartXAxis-${idx}`}
                type="button"
                onClick={() => removeXSlot(idx)}
                className="p-1 rounded hover:bg-error/10 text-base-content/60 hover:text-error"
                aria-label="Remove"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {xFields.length < 2 && dimensions.length + measures.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const used = new Set(xFields);
                const first = [...dimensions, ...measures].find((c) => !used.has(c.columnName));
                if (first) addXSlot(first.columnName);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-dashed border-base-300 text-base-content/60 hover:bg-base-200 hover:text-base-content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              {xFields.length === 0 ? "Add X axis" : "Add series breakout"}
            </button>
          )}
        </div>
      </div>

      <div>
        <span className="text-xs text-base-content/60">
          Y axis <span className="text-emerald-500">(measure)</span>
        </span>
        <div className="mt-1 space-y-1">
          {yFields.map((field, idx) => (
            <div key={`y-${idx}`} className="flex items-center gap-1">
              <select
                id={`selectChartYAxis-${idx}`}
                value={field}
                onChange={(e) => setYFields(replaceAt(yFields, idx, e.target.value))}
                className="flex-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              >
                {measures.length > 0 && (
                  <optgroup label="Measures">
                    {measures.map((c) => (
                      <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
                    ))}
                  </optgroup>
                )}
                {dimensions.length > 0 && (
                  <optgroup label="Dimensions">
                    {dimensions.map((c) => (
                      <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="text-[10px] text-base-content/60 w-20 shrink-0">
                {idx === 0 ? "Y axis" : `+ metric`}
              </span>
              <button
                id={`btnRemoveChartYAxis-${idx}`}
                type="button"
                onClick={() => removeYSlot(idx)}
                className="p-1 rounded hover:bg-error/10 text-base-content/60 hover:text-error"
                aria-label="Remove"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {!hasSeriesSplit && measures.length + dimensions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const used = new Set(yFields);
                const first = [...measures, ...dimensions].find((c) => !used.has(c.columnName));
                if (first) addYSlot(first.columnName);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-dashed border-base-300 text-base-content/60 hover:bg-base-200 hover:text-base-content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              {yFields.length === 0 ? "Add Y axis" : "Add metric"}
            </button>
          )}
          {hasSeriesSplit && yFields.length > 1 && (
            <p className="text-[10px] text-amber-600">
              Series-split is active — only the first metric renders. Remove the series breakout to use multiple metrics.
            </p>
          )}
        </div>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Chart title</span>
        <input
          id="inputChartTitle"
          type="text"
          value={chartTitle}
          onChange={(e) => setChartTitle(e.target.value)}
          placeholder="Optional title…"
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content placeholder:text-base-content/60/40"
        />
      </div>

      <div>
        <span className="text-xs text-base-content/60">Legend</span>
        <div className="flex mt-1 rounded-md overflow-hidden border border-base-300 text-xs">
          {(["auto", "show", "hide"] as const).map((v) => (
            <button
              key={v}
              id={`btnChartLegend-${v}`}
              onClick={() => setLegend(v)}
              className={`flex-1 py-1.5 capitalize transition-colors ${
                legend === v
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-base-content/60 hover:bg-base-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Color palette</span>
        <div className="grid grid-cols-5 gap-1 mt-1">
          {PALETTES.map(({ id, label, colors }) => {
            const selected = palette === id;
            return (
              <button
                key={id}
                onClick={() => setPalette(id)}
                title={label}
                className={`flex flex-col items-center gap-0.5 p-1 rounded border transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-base-300 hover:border-muted-foreground/50"
                }`}
              >
                <div className="flex gap-0.5">
                  {colors.map((c) => (
                    <div key={c} style={{ backgroundColor: c }} className="w-2.5 h-2.5 rounded-sm" />
                  ))}
                </div>
                <span className="text-[9px] text-base-content/60">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

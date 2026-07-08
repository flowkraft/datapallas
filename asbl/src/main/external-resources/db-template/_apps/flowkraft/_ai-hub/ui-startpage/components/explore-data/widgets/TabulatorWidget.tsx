"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
// lucide-react removed
import { looksLikeBoolean, isTemporalExtraction } from "@/lib/explore-data/smart-defaults";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { pickColumnFormat, formatCellHtml, type FormatSpec } from "@/lib/explore-data/type-formatters";
import { pseudoColumnSchema } from "@/lib/explore-data/pseudo-column";
import { ColumnSettingsDialog } from "../ColumnSettingsDialog";
import { useDslConfig } from "@/lib/hooks/use-dsl-config";
import { mapToTabulatorRenderConfig } from "@/lib/explore-data/render/tabulator-render-config";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: this widget renders FROM the DSL Map produced by
 * useDslConfig (the canonical configuration). Same Map flows to <rb-tabulator>
 * here AND to the published page after DSL→parse round-trip. Drift impossible.
 * ============================================================================
 */

interface TabulatorWidgetProps {
  widgetId: string;
}

type TabCell = { getValue: () => unknown };

function formatterFor(col: ColumnSchema, spec: FormatSpec): (cell: TabCell) => string {
  return (cell) => formatCellHtml(cell.getValue(), col, spec);
}

function headerFormatterFor(title: string, field: string, onSettings: (f: string) => void): () => HTMLElement {
  return () => {
    const wrap = document.createElement("div");
    wrap.className = "rb-th-wrap";
    wrap.style.cssText = "display:flex;align-items:center;gap:4px;width:100%;";

    const label = document.createElement("span");
    label.textContent = title;
    label.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    wrap.appendChild(label);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Settings for ${field}`);
    btn.title = "Column settings";
    btn.style.cssText = "flex:0 0 auto;padding:2px;border:none;background:transparent;color:color-mix(in oklab, var(--color-base-content) 60%, transparent);cursor:pointer;border-radius:3px;line-height:0;opacity:0.5;";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    btn.onmouseenter = () => { btn.style.opacity = "1"; btn.style.background = "color-mix(in oklab, var(--color-base-content) 8%, transparent)"; };
    btn.onmouseleave = () => { btn.style.opacity = "0.5"; btn.style.background = "transparent"; };
    btn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); onSettings(field); });
    wrap.appendChild(btn);

    return wrap;
  };
}

export function TabulatorWidget({ widgetId }: TabulatorWidgetProps) {
  const { result, loading, error } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetDisplayConfig = useCanvasStore((s) => s.updateWidgetDisplayConfig);
  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-tabulator");
  const [activeField, setActiveField] = useState<string | null>(null);

  // ── Single source of truth: the canonical DSL Map. If displayConfig has
  //    no dslConfig yet (fresh widget), the hook returns an empty Map; the
  //    render-config helper applies sensible Tabulator defaults (autoColumns +
  //    fitColumns layout) so the widget renders all data columns by default.
  const { config: dslMap } = useDslConfig(widgetId, "tabulator");
  const groupByBuckets = widget?.dataSource?.visualQuery?.groupByBuckets ?? {};
  const groupByCols = new Set(widget?.dataSource?.visualQuery?.groupBy ?? []);

  // ── Per-column metadata (canvas-only: format detection, gear button)
  //    layered ON TOP of the canonical Map. The Map controls visibility +
  //    titles via autoColumnsDefinitions; canvas adds formatters and the
  //    settings-dialog gear button.
  const columnMeta = useMemo(() => {
    if (!result || result.data.length === 0) return [] as { field: string; col: ColumnSchema; effective: FormatSpec; sample: unknown }[];
    const keys = Object.keys(result.data[0]);
    return keys.map((field) => {
      let sample: unknown = null;
      for (let i = 0; i < Math.min(5, result.data.length); i++) {
        if (result.data[i][field] !== null && result.data[i][field] !== undefined) {
          sample = result.data[i][field];
          break;
        }
      }
      const col = pseudoColumnSchema(field, sample);
      let base = pickColumnFormat(col);
      if (base.kind === "text" && looksLikeBoolean(result.data, field, 50)) {
        base = { kind: "boolean" };
      }
      const bucket = groupByBuckets[field];
      if (bucket && groupByCols.has(field)) {
        if (isTemporalExtraction(bucket) || base.kind === "date") {
          base = { ...base, kind: "date", dateUnit: bucket };
        }
      }
      return { field, col, effective: base, sample };
    });
  }, [result, JSON.stringify(groupByBuckets)]);

  // ── Build the <rb-tabulator> config from the canonical Map.
  const renderConfig = useMemo(
    () => mapToTabulatorRenderConfig(dslMap, result?.data ?? []),
    [dslMap, result?.data],
  );

  useEffect(() => {
    if (!ready || !ref.current) return;
    if (!result || result.data.length === 0) return;

    // Visibility per field comes from the Map's autoColumnsDefinitions (which
    // mapToTabulatorRenderConfig has already placed in renderConfig.options).
    // Canvas-only: derive title (Map override or field name), formatter,
    // gear-button header, alignment.
    const acDefs = (dslMap.autoColumnsDefinitions as Array<Record<string, unknown>> | undefined) ?? [];
    const acDefByField = new Map<string, Record<string, unknown>>();
    for (const def of acDefs) {
      if (typeof def?.field === "string") acDefByField.set(def.field, def);
    }

    const visible = columnMeta.filter(({ field }) => {
      const def = acDefByField.get(field);
      return def?.visible !== false;
    });

    const columns = visible.map(({ field, col, effective }) => {
      const def = acDefByField.get(field);
      const rightAlign = effective.kind === "currency" || effective.kind === "number" || effective.kind === "percentage" || effective.kind === "coordinate";
      const title = (typeof def?.title === "string" ? def.title : field);
      return {
        title,
        field,
        formatter: formatterFor(col, effective),
        titleFormatter: headerFormatterFor(title, field, setActiveField),
        hozAlign: rightAlign ? "right" : undefined,
        headerHozAlign: rightAlign ? "right" : undefined,
      };
    });

    const el = ref.current as HTMLElement & {
      data?: unknown;
      columns?: unknown;
      options?: unknown;
      theme?: string;
    };
    el.columns = columns;
    el.data = result.data;
    el.options = renderConfig.options;
    el.theme = (dslMap.theme as string | undefined) ?? "";
  }, [ready, columnMeta, dslMap, renderConfig, result]);

  const activeMeta = columnMeta.find((m) => m.field === activeField) ?? null;

  if (loading) return <div className="flex items-center justify-center h-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>;
  if (error) return <div id={`widgetError-${widgetId}`} className="text-xs text-error p-2 overflow-hidden">Query error: {error.split('\n')[0].slice(0, 200)}</div>;
  if (!result || result.data.length === 0) return null;
  if (!ready) return <div className="flex items-center justify-center h-full text-xs text-base-content/60">Loading components...</div>;

  const vq = widget?.dataSource?.visualQuery;
  const limit = vq?.limit ?? 500;
  const atLimit = result.rowCount >= limit;
  const tabulatorTheme = (dslMap.theme as string | undefined) ?? "";
  const tabulatorLayout = (dslMap.layout as string | undefined) ?? "fitDataStretch";
  const tabulatorPagination = dslMap.pagination !== false;
  const tabulatorPageSize = (dslMap.paginationSize as number | undefined) ?? 50;

  return (
    <div className="h-full flex flex-col">
      {/* @ts-expect-error - Web component custom element */}
      <rb-tabulator key={`${tabulatorTheme}|${tabulatorLayout}|${tabulatorPagination}|${tabulatorPageSize}`} ref={ref} id={`widgetViz-${widgetId}`} theme={tabulatorTheme} style={{ display: "block", width: "100%", flex: 1 }} />
      {atLimit && (
        <div className="shrink-0 px-2 py-0.5 text-[10px] text-base-content/60 bg-base-200/40 border-t border-base-300/50 text-right">
          showing first {limit} rows — add a filter or raise the limit to see more
        </div>
      )}
      <ColumnSettingsDialog
        open={activeField !== null && activeMeta !== null}
        onClose={() => setActiveField(null)}
        column={activeMeta?.col ?? null}
        settings={undefined}
        sampleValue={activeMeta?.sample}
        onChange={() => {
          // Column-settings persistence will be wired into setPath in a follow-up.
          // For now the dialog edits are not persisted; visibility/title edits
          // happen through the Display tab UI panel.
        }}
      />
    </div>
  );
}

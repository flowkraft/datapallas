"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
// lucide-react removed
import { isTemporalExtraction, isIdColumn } from "@/lib/explore-data/smart-defaults";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { pickColumnFormat, type FormatSpec } from "@/lib/explore-data/type-formatters";
import { pseudoColumnSchema } from "@/lib/explore-data/pseudo-column";
import type { ColumnSettingsMap } from "@/lib/explore-data/column-settings";
import { mergeColumnFormat } from "@/lib/explore-data/column-settings";
import { ColumnSettingsDialog } from "../ColumnSettingsDialog";

interface DetailWidgetProps {
  widgetId: string;
}

/**
 * DetailWidget — thin React wrapper around the <rb-detail> web component.
 * Single-row record viewer; shows ALL columns of the first row as a key/value list.
 *
 * Type-aware cell formatting: per-column `FormatSpec` is computed from
 * pseudo-columns (name + sample value) and merged with the user's per-column
 * `ColumnSettings` overrides, then passed via `options.columnFormats`.
 * <rb-detail> applies currency/percentage/date/url/email formatters accordingly.
 *
 * Per-column gear: each key label carries a data attribute that bubbles through
 * a delegated click handler to open the ColumnSettingsDialog.
 */
export function DetailWidget({ widgetId }: DetailWidgetProps) {
  const { result, loading, error } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetDisplayConfig = useCanvasStore((s) => s.updateWidgetDisplayConfig);
  const ref = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ready = useRbElementReady("rb-detail");
  const [activeField, setActiveField] = useState<string | null>(null);

  const columnSettings = (widget?.displayConfig.columnSettings as ColumnSettingsMap | undefined) ?? {};
  const groupByBuckets = widget?.dataSource?.visualQuery?.groupByBuckets ?? {};
  const groupByCols = new Set(widget?.dataSource?.visualQuery?.groupBy ?? []);

  const columnMeta = useMemo(() => {
    if (!result || result.data.length === 0) return [] as { field: string; col: ColumnSchema; effective: FormatSpec; sample: unknown }[];
    const row0 = result.data[0];
    return Object.keys(row0).map((field) => {
      let sample: unknown = null;
      for (let i = 0; i < Math.min(5, result.data.length); i++) {
        if (result.data[i][field] !== null && result.data[i][field] !== undefined) {
          sample = result.data[i][field];
          break;
        }
      }
      const col = pseudoColumnSchema(field, sample);
      let base = pickColumnFormat(col);
      // groupByBuckets always carries TimeBucket values (a subset of DateUnit).
      const bucket = groupByBuckets[field];
      if (bucket && groupByCols.has(field)) {
        if (isTemporalExtraction(bucket) || base.kind === "date") {
          base = { ...base, kind: "date", dateUnit: bucket };
        }
      }
      const effective = mergeColumnFormat(base, columnSettings[field]);
      return { field, col, effective, sample };
    });
  }, [result, columnSettings, JSON.stringify(groupByBuckets)]);

  // Build the {field: spec} map + title overrides + hidden set — passed to <rb-detail>.
  const columnFormats = useMemo<Record<string, FormatSpec>>(() => {
    const out: Record<string, FormatSpec> = {};
    for (const { field, effective } of columnMeta) out[field] = effective;
    return out;
  }, [columnMeta]);

  const columnTitles = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const field of Object.keys(columnSettings)) {
      const t = columnSettings[field]?.columnTitle;
      if (t) out[field] = t;
    }
    return out;
  }, [columnSettings]);

  useEffect(() => {
    if (!ready || !ref.current || !result) return;
    const el = ref.current as HTMLElement & { data?: unknown; options?: unknown };
    el.data = result.data;

    // Hidden-column set = Display-tab checkbox list (`hiddenColumns`, set by
    //                     DetailConfig)
    //                   + per-column gear-dialog `hidden: true` overrides
    //                   + ID columns auto-hidden by default
    // Users can un-hide an ID column via its column settings (`hidden: false`),
    // which removes it from the auto set.
    const configHidden = (widget?.displayConfig.hiddenColumns as string[] | undefined) ?? [];
    const perColHidden = Object.entries(columnSettings).filter(([, s]) => s?.hidden).map(([f]) => f);
    const allFields = result.data[0] ? Object.keys(result.data[0]) : [];
    const autoHiddenIds = allFields.filter(
      (name) => isIdColumn(name) && columnSettings[name]?.hidden !== false,
    );
    const hiddenColumns = [...new Set([...configHidden, ...perColHidden, ...autoHiddenIds])];

    el.options = {
      ...(widget?.displayConfig ?? {}),
      columnFormats,
      columnTitles,
      hiddenColumns,
      interactive: true, // enables the gear button in <rb-detail>
    };
  }, [ready, result, widget?.displayConfig, columnFormats, columnTitles, columnSettings]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const btn = t?.closest?.(".rb-col-settings") as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const field = btn.dataset.field;
      if (field) setActiveField(field);
    };
    wrap.addEventListener("click", handler);
    return () => wrap.removeEventListener("click", handler);
  }, []);

  const activeMeta = columnMeta.find((m) => m.field === activeField) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs text-error p-2 overflow-hidden">
        Query error: {error.split("\n")[0].slice(0, 200)}
      </div>
    );
  }
  if (!result || result.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-base-content/60">
        No record to show.
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-base-content/60">
        Loading detail component…
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="h-full">
      {/* @ts-expect-error — custom element */}
      <rb-detail ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
      <ColumnSettingsDialog
        open={activeField !== null && activeMeta !== null}
        onClose={() => setActiveField(null)}
        column={activeMeta?.col ?? null}
        settings={activeField ? columnSettings[activeField] : undefined}
        sampleValue={activeMeta?.sample}
        onChange={(next) => {
          if (!widget || !activeField) return;
          const prev = (widget.displayConfig.columnSettings as ColumnSettingsMap | undefined) ?? {};
          const updated: ColumnSettingsMap = { ...prev };
          if (next === undefined) delete updated[activeField];
          else updated[activeField] = next;
          updateWidgetDisplayConfig(widget.id, {
            ...widget.displayConfig,
            columnSettings: updated,
          });
        }}
      />
    </div>
  );
}

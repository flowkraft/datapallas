"use client";

import { useEffect, useRef, useState } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
import { IconSparkles as Sparkles } from "@/components/shared/Icons";
import { fetchSchema } from "@/lib/explore-data/rb-api";
import { autoPickMeasure } from "@/lib/explore-data/smart-defaults";
import { pickColumnFormat } from "@/lib/explore-data/type-formatters";
import { useEffectiveField } from "@/lib/hooks/use-effective-field";

interface NumberWidgetProps {
  widgetId: string;
}

/**
 * Number widget — renders one big summary value via the <rb-value> web component.
 * Auto-picks the first non-ID measure and infers currency format from column name.
 */
export function NumberWidget({ widgetId }: NumberWidgetProps) {
  const { result, loading, error } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const connectionId = useCanvasStore((s) => s.connectionId);
  const updateWidgetDataSource = useCanvasStore((s) => s.updateWidgetDataSource);
  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-value");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr] = useState<string | null>(null);

  const ds = widget?.dataSource;
  const vq = ds?.visualQuery;
  const isVisualMode = ds?.mode === "visual" || ds?.mode === undefined;
  const hasTablePick = Boolean(vq?.table);
  const hasAggregation =
    (vq?.summarize && vq.summarize.length > 0) || (vq?.groupBy && vq.groupBy.length > 0);
  const showAutoSummarizePrompt = isVisualMode && hasTablePick && !hasAggregation;

  const displayConfig = widget?.displayConfig || {};
  const configField = (displayConfig.numberField as string) || "";
  const configFormat = (displayConfig.numberFormat as string) || "";
  const configLabel = (displayConfig.numberLabel as string) || "";

  // SINGLE TRUTH for column inference + saved-field validation lives in
  // useEffectiveField. See lib/hooks/use-effective-field.ts.
  const { inferredColumns, keys, validateField } = useEffectiveField(result);
  const autoField = autoPickMeasure(inferredColumns)?.columnName;
  const effectiveField = validateField(configField) || autoField || keys[0] || "";
  // Infer format from column name (currency for revenue/freight/price/etc.).
  // pickColumnFormat returns a richer FormatSpec — we collapse to the two
  // values <rb-value> understands: "currency" | "number".
  const inferredSpec = effectiveField
    ? pickColumnFormat({ columnName: effectiveField, typeName: "DOUBLE", isNullable: true })
    : { kind: "number" as const };
  const effectiveFormat = configFormat || (inferredSpec.kind === "currency" ? "currency" : "number");
  const effectiveLabel = configLabel || effectiveField;

  const handleAutoSummarize = async () => {
    if (!widget || !connectionId || !vq?.table) return;
    setAutoBusy(true);
    setAutoErr(null);
    try {
      const schema = await fetchSchema(connectionId);
      const tbl = schema.tables.find((t) => t.tableName === vq.table);
      if (!tbl) {
        setAutoErr(`Table ${vq.table} not found.`);
        return;
      }
      // A Number widget shows one aggregated value — COUNT(*) with no grouping.
      updateWidgetDataSource(widget.id, {
        mode: "visual",
        visualQuery: {
          kind: "table",
          table: tbl.tableName,
          filters: [],
          summarize: [{ aggregation: "count", field: "*" }],
          groupBy: [],
          sort: [],
          limit: 500,
        },
      });
    } catch (e) {
      setAutoErr(e instanceof Error ? e.message : "Auto-summarize failed");
    } finally {
      setAutoBusy(false);
    }
  };

  useEffect(() => {
    if (!ready || !ref.current) return;
    if (!result || result.data.length === 0) return;
    if (!effectiveField) return;

    const el = ref.current as HTMLElement & {
      data?: unknown;
      field?: string;
      format?: string;
    };

    el.field = effectiveField;
    el.format = effectiveFormat;
    el.data = result.data;
  }, [ready, result, effectiveField, effectiveFormat]);

  if (showAutoSummarizePrompt) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-base-content mb-1">
            {vq?.table ?? "This data"} — pick a metric
          </p>
          <p className="text-[11px] text-base-content/60 mb-3">
            A Number widget shows one summary value. Start with the row count, or configure manually.
          </p>
          <button
            type="button"
            id="btnAutoSummarize"
            onClick={handleAutoSummarize}
            disabled={autoBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {autoBusy
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
            }
            {autoBusy ? "Analyzing…" : "Auto-summarize"}
          </button>
          {autoErr && <p className="mt-2 text-[11px] text-error">{autoErr}</p>}
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>;
  if (error) return <div id={`widgetError-${widgetId}`} className="text-xs text-error p-2 overflow-hidden">Query error: {error.split('\n')[0].slice(0, 200)}</div>;
  if (!result || result.data.length === 0) return null;
  if (!ready) return <div className="flex items-center justify-center h-full text-xs text-base-content/60">Loading components...</div>;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-3xl font-bold text-base-content tabular-nums">
        {/* @ts-expect-error - Web component custom element */}
        <rb-value ref={ref} id={`widgetViz-${widgetId}`} />
      </div>
      <div className="text-xs text-base-content/60 mt-1">{effectiveLabel}</div>
    </div>
  );
}

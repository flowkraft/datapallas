"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
// lucide-react removed
import { pickProgressField, pickProgressGoal } from "@/lib/explore-data/smart-defaults";
import { pickColumnFormat } from "@/lib/explore-data/type-formatters";
import { useEffectiveField } from "@/lib/hooks/use-effective-field";

interface ProgressWidgetProps {
  widgetId: string;
}

/**
 * ProgressWidget — thin React wrapper around <rb-progress>.
 * Auto-picks the first non-ID measure as the value field; derives a "nice"
 * goal from the value itself (value × 1.25 rounded up to a nice number) when
 * no goal is configured.
 */
export function ProgressWidget({ widgetId }: ProgressWidgetProps) {
  const { result, loading, error, tableSchema } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-progress");

  const displayConfig = widget?.displayConfig ?? {};
  const configField = (displayConfig.field as string) || "";
  const configGoal = displayConfig.goal as number | undefined;
  const configFormat = (displayConfig.format as string) || "";

  // SINGLE TRUTH for column inference + saved-field validation lives in
  // useEffectiveField. See lib/hooks/use-effective-field.ts.
  const { inferredColumns, keys, validateField } = useEffectiveField(result);

  const auto = useMemo(
    () => pickProgressField(inferredColumns, tableSchema),
    [inferredColumns, tableSchema],
  );

  const effectiveField = validateField(configField) || auto.field || keys[0] || "";

  // Derive goal from the first row's value if not configured.
  const effectiveGoal = useMemo(() => {
    if (typeof configGoal === "number" && configGoal > 0) return configGoal;
    const row0 = result?.data?.[0];
    if (!row0 || !effectiveField) return 100;
    const value = Number(row0[effectiveField]);
    return pickProgressGoal(value);
  }, [configGoal, result, effectiveField]);

  const effectiveFormat = useMemo<"number" | "currency" | "percent">(() => {
    if (configFormat === "number" || configFormat === "currency" || configFormat === "percent") return configFormat;
    if (!effectiveField) return "number";
    const spec = pickColumnFormat({ columnName: effectiveField, typeName: "DOUBLE", isNullable: true });
    if (spec.kind === "currency") return "currency";
    if (spec.kind === "percentage") return "percent";
    return "number";
  }, [configFormat, effectiveField]);

  const options = useMemo(
    () => ({
      ...displayConfig,
      field: effectiveField,
      goal: effectiveGoal,
      format: effectiveFormat,
    }),
    [displayConfig, effectiveField, effectiveGoal, effectiveFormat],
  );

  useEffect(() => {
    if (!ready || !ref.current || !result) return;
    const el = ref.current as HTMLElement & { data?: unknown; options?: unknown };
    el.data = result.data;
    el.options = options;
  }, [ready, result, options]);

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
        No progress value.
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-base-content/60">
        Loading progress component…
      </div>
    );
  }

  return (
    // @ts-expect-error — custom element
    <rb-progress ref={ref} style={{ display: "block", width: "100%", height: "100%", minHeight: "60px" }} />
  );
}

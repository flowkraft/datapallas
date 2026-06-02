"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWidgetData } from "./useWidgetData";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useRbElementReady } from "./useRbElementReady";
// lucide-react removed
import { pickSankeyFields } from "@/lib/explore-data/smart-defaults";
import { useEffectiveField } from "@/lib/hooks/use-effective-field";

interface SankeyWidgetProps {
  widgetId: string;
}

/**
 * SankeyWidget — thin React wrapper around the <rb-sankey> web component.
 * Auto-picks source/target/value fields (NumberWidget pattern):
 *   effective = configPick || autoPick || fallback
 * Auto-picks are computed, never written back to the store.
 */
export function SankeyWidget({ widgetId }: SankeyWidgetProps) {
  const { result, loading, error, tableSchema } = useWidgetData(widgetId);
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-sankey");

  const displayConfig = widget?.displayConfig ?? {};
  const configSource = (displayConfig.sourceField as string) || "";
  const configTarget = (displayConfig.targetField as string) || "";
  const configValue = (displayConfig.valueField as string) || "";

  const PALETTE_COLORS: Record<string, string[]> = {
    default: ["#509ee3","#88bf4d","#a989c5","#ef8c8c","#f9d45c","#f2a86f","#98d9d9","#7172ad"],
    warm:    ["#d62728","#ff7f0e","#ffbb78","#8c564b","#e377c2","#f7b6d2","#bcbd22","#dbdb8d"],
    cool:    ["#1f77b4","#aec7e8","#2ca02c","#98df8a","#9467bd","#c5b0d5","#17becf","#9edae5"],
    pastel:  ["#a8dadc","#f4a261","#e9c46a","#2a9d8f","#e76f51","#457b9d","#1d3557","#264653"],
    mono:    ["#1a1a1a","#404040","#666666","#8c8c8c","#b3b3b3"],
  };
  const paletteColors = PALETTE_COLORS[(displayConfig.sankeyPalette as string) || "default"] ?? PALETTE_COLORS.default;

  // SINGLE TRUTH for column inference + saved-field validation lives in
  // useEffectiveField. See lib/hooks/use-effective-field.ts.
  const { inferredColumns, keys, validateField } = useEffectiveField(result);

  const auto = useMemo(
    () => pickSankeyFields(inferredColumns, { tableSchema }),
    [inferredColumns, tableSchema],
  );

  const effectiveSource = validateField(configSource) || auto.sourceField || keys[0] || "";
  const effectiveTarget = validateField(configTarget) || auto.targetField || keys[1] || "";
  const effectiveValue = validateField(configValue) || auto.valueField || "";

  // Stable options ref — avoid handing a fresh `{}` each render.
  const options = useMemo(
    () => ({
      ...displayConfig,
      sourceField: effectiveSource,
      targetField: effectiveTarget,
      valueField: effectiveValue,
      palette: paletteColors,
    }),
    [displayConfig, effectiveSource, effectiveTarget, effectiveValue, paletteColors],
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
        No flows to draw.
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-base-content/60">
        Loading sankey component…
      </div>
    );
  }

  return (
    // @ts-expect-error — custom element
    <rb-sankey ref={ref} style={{ display: "block", width: "100%", height: "100%", minHeight: "240px" }} />
  );
}

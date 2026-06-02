"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { pickSankeyFields, type CardinalityMap } from "@/lib/explore-data/smart-defaults";

const PALETTES = [
  { id: "default", label: "Default", colors: ["#509ee3","#88bf4d","#a989c5","#ef8c8c","#f9d45c"] },
  { id: "warm",    label: "Warm",    colors: ["#d62728","#ff7f0e","#ffbb78","#8c564b","#e377c2"] },
  { id: "cool",    label: "Cool",    colors: ["#1f77b4","#aec7e8","#2ca02c","#9467bd","#17becf"] },
  { id: "pastel",  label: "Pastel",  colors: ["#a8dadc","#f4a261","#e9c46a","#2a9d8f","#e76f51"] },
  { id: "mono",    label: "Mono",    colors: ["#1a1a1a","#555","#888","#aaa","#ccc"] },
] as const;

interface SankeyConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
  /** Optional distinct-value count hints from ConfigPanel's cardinality probe.
   *  Used by pickSankeyFields to drop high-cardinality target candidates
   *  (>100 unique values) that would melt the Sankey renderer. */
  cardinality?: CardinalityMap;
}

export function SankeyConfig({ config, columns, onChange, cardinality }: SankeyConfigProps) {
  // `effective = config || autoPick || fallback` — mirrors SankeyWidget's
  // render-side resolution. pickSankeyFields honors the 100-distinct-value
  // target cap, so the auto-picked target never blows up the renderer.
  const auto = pickSankeyFields(columns, { cardinality: cardinality ?? {} });
  const sourceField = (config.sourceField as string) || auto.sourceField || "";
  const targetField = (config.targetField as string) || auto.targetField || "";
  const valueField  = (config.valueField  as string) || auto.valueField  || "";
  const palette     = (config.sankeyPalette as string) || "default";

  const dimensions = columns.filter((c) => getFieldKind(c) === "dimension");
  const measures   = columns.filter((c) => getFieldKind(c) === "measure");

  return (
    <div id="configPanel-sankey" className="space-y-3">
      <div>
        <span className="text-xs text-base-content/60">Source <span className="text-blue-500">(dimension)</span></span>
        <select
          id="selectSankeySource"
          value={sourceField}
          onChange={(e) => onChange({ ...config, sourceField: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {dimensions.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Target <span className="text-blue-500">(dimension)</span></span>
        <select
          id="selectSankeyTarget"
          value={targetField}
          onChange={(e) => onChange({ ...config, targetField: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {dimensions.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Value <span className="text-emerald-500">(measure)</span></span>
        <select
          id="selectSankeyValue"
          value={valueField}
          onChange={(e) => onChange({ ...config, valueField: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {measures.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>

      {/* ── Color palette ── */}
      <div>
        <span className="text-xs text-base-content/60">Color palette</span>
        <div className="grid grid-cols-5 gap-1 mt-1">
          {PALETTES.map(({ id, label, colors }) => {
            const selected = palette === id;
            return (
              <button
                key={id}
                onClick={() => onChange({ ...config, sankeyPalette: id })}
                title={label}
                className={`flex flex-col items-center gap-0.5 p-1 rounded border transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-content/30"
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

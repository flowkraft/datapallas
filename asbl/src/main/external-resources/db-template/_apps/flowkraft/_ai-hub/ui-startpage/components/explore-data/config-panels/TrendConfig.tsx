"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import type { PickShape } from "@/lib/explore-data/smart-defaults/widget-picker";
import { pickTrendFields } from "@/lib/explore-data/smart-defaults";
import { measuresOf, temporalDimensionsOf } from "@/lib/explore-data/widget-defaults";

let _trendRenderN = 0;

const FORMATS = [
  { value: "number", label: "Number (1,234)" },
  { value: "currency", label: "Currency ($1,234)" },
  { value: "percent", label: "Percent (73%)" },
  { value: "raw", label: "Raw value" },
];

interface TrendConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  /** Pre-classified shape from the widget record.  TrendConfig's date
   *  dropdown reads `widget.shape.dims` where kind === "temporal" —
   *  `shapeFromResult` already applies the name-pattern fallback
   *  (`order_month` VARCHAR → temporal) via `isTemporalByName`, so
   *  computed SQL aliases appear here without TrendConfig re-running
   *  the classifier locally.  Nullable for the pre-query state. */
  shape: PickShape | null;
  onChange: (config: WidgetDisplayConfig) => void;
}

export function TrendConfig({ config, columns, shape, onChange }: TrendConfigProps) {
  // `effective = config || autoPick || fallback` — mirrors TrendWidget's
  // render-side resolution. Keeps Config <select> and Canvas in sync
  // without a reactive write.
  const { dateField: autoDate, valueField: autoValue } = pickTrendFields(columns);
  const dateField  = (config.dateField  as string) || autoDate  || "";
  const valueField = (config.valueField as string) || autoValue || "";
  const format     = (config.format     as string) || "number";
  const label      = (config.label      as string) || "";

  const measures = measuresOf(columns, shape);
  const dates    = temporalDimensionsOf(columns, shape);
  _trendRenderN++;
  console.log('[TrendConfig] #' + _trendRenderN +
    ' cols.len=' + columns.length +
    ' cols=' + columns.map(c => c.columnName+':'+c.typeName).join(',') +
    ' shape_dims=' + (shape?.dims.map(d => d.name+':'+d.kind).join(',') ?? 'null') +
    ' dates.len=' + dates.length +
    ' autoDate=' + (autoDate ?? 'none') +
    ' config.dateField=' + ((config.dateField as string) || 'none') +
    ' final=' + (dateField || 'EMPTY'));

  return (
    <div id="configPanel-trend" className="space-y-3">
      <div>
        <span className="text-xs text-base-content/60">Date <span className="text-blue-500">(temporal)</span></span>
        <select
          id="selectTrendDate"
          value={dateField}
          onChange={(e) => onChange({ ...config, dateField: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {dates.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Value <span className="text-emerald-500">(measure)</span></span>
        <select
          id="selectTrendValue"
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

      <div>
        <span className="text-xs text-base-content/60">Format</span>
        <select
          value={format}
          onChange={(e) => onChange({ ...config, format: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-xs text-base-content/60">Label</span>
        <input
          value={label}
          onChange={(e) => onChange({ ...config, label: e.target.value })}
          placeholder="Auto from field name"
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        />
      </div>
    </div>
  );
}

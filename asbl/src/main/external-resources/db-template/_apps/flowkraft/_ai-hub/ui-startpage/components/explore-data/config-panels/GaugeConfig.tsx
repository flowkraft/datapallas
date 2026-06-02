"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { pickGaugeField } from "@/lib/explore-data/smart-defaults";

// Fixed traffic-light colors — matches rb-gauge DEFAULT_BANDS.
const BAND_COLORS = ["#ef8c8c", "#f9d45c", "#88bf4d"] as const;
// Labels reflect the COLOR each band renders as. When `gaugeBandsReverse` is on,
// the gauge inverts colors (green-on-left, red-on-right for risk metrics), so the
// labels flip too — otherwise the panel shows "Red (low) = 36M" while the user
// sees a green band on the left, which is the cliff we close here.
const BAND_LABELS_DEFAULT  = ["Red (low)",   "Yellow (mid)", "Green (high)"] as const;
const BAND_LABELS_REVERSED = ["Green (low)", "Yellow (mid)", "Red (high)"]   as const;

const DEFAULT_BANDS = [
  { to: 33,  color: BAND_COLORS[0] },
  { to: 66,  color: BAND_COLORS[1] },
  { to: 100, color: BAND_COLORS[2] },
];

const FORMAT_OPTIONS = [
  { value: "number",   label: "Number (1,234.5)" },
  { value: "currency", label: "Currency ($1,234)" },
  { value: "percent",  label: "Percent (73%)" },
  { value: "raw",      label: "Raw (no formatting)" },
] as const;

interface GaugeConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

export function GaugeConfig({ config, columns, onChange }: GaugeConfigProps) {
  // `effective = config || autoPick || fallback` — see NumberConfig for the
  // rationale. Mirrors GaugeWidget.tsx's render-side field resolution.
  const configField = (config.field as string) || "";
  const autoField = pickGaugeField(columns).field ?? "";
  const field  = configField || autoField;
  const min    = (config.min    as number | undefined) ?? 0;
  const max    = (config.max    as number | undefined) ?? 100;
  const label  = (config.label  as string) || "";
  const format = (config.gaugeFormat as string) || "number";
  const bands  = (config.gaugeBands  as { to: number; color: string }[] | undefined) ?? DEFAULT_BANDS;
  const reverseColors = (config.gaugeBandsReverse as boolean | undefined) ?? false;
  const bandLabels = reverseColors ? BAND_LABELS_REVERSED : BAND_LABELS_DEFAULT;

  const measures = columns.filter((c) => getFieldKind(c) === "measure");

  const setBandTo = (idx: number, to: number) => {
    const next = bands.map((b, i) => i === idx ? { ...b, to } : b);
    onChange({ ...config, gaugeBands: next });
  };

  return (
    <div id="configPanel-gauge" className="space-y-3">
      {/* Value field */}
      <div>
        <span className="text-xs text-base-content/60">Value <span className="text-emerald-500">(measure)</span></span>
        <select
          id="selectGaugeField"
          value={field}
          onChange={(e) => onChange({ ...config, field: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">Auto-detect</option>
          {measures.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
        </select>
      </div>

      {/* Min / Max */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-xs text-base-content/60">Min</span>
          <input
            id="inputGaugeMin"
            type="number"
            value={min}
            onChange={(e) => onChange({ ...config, min: Number(e.target.value) })}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          />
        </div>
        <div>
          <span className="text-xs text-base-content/60">Max</span>
          <input
            id="inputGaugeMax"
            type="number"
            value={max}
            onChange={(e) => onChange({ ...config, max: Number(e.target.value) })}
            className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
          />
        </div>
      </div>

      {/* Label */}
      <div>
        <span className="text-xs text-base-content/60">Label</span>
        <input
          id="inputGaugeLabel"
          value={label}
          onChange={(e) => onChange({ ...config, label: e.target.value })}
          placeholder="Auto from field name"
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        />
      </div>

      {/* Format */}
      <div>
        <span className="text-xs text-base-content/60">Format</span>
        <select
          id="selectGaugeFormat"
          value={format}
          onChange={(e) => onChange({ ...config, gaugeFormat: e.target.value })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Color bands */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-base-content/60">Color bands (up to…)</span>
          <button
            onClick={() => onChange({ ...config, gaugeBands: DEFAULT_BANDS })}
            className="text-[10px] text-base-content/60 hover:text-base-content transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="space-y-1.5">
          {bands.map((band, idx) => {
            // When reverseColors is on, the gauge renders this slot's band with
            // the opposite-end color. Mirror that here so the swatch matches the
            // visual rendering on the canvas.
            const renderedColor = reverseColors
              ? bands[bands.length - 1 - idx]?.color ?? band.color
              : band.color;
            const label = bandLabels[idx] ?? `Band ${idx + 1}`;
            return (
              <div key={idx} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded shrink-0 border border-black/10"
                  style={{ backgroundColor: renderedColor }}
                  title={label}
                />
                <span className="text-xs text-base-content/60 w-20 shrink-0">{label}</span>
                <input
                  id={`inputGaugeBand-${idx}`}
                  type="number"
                  value={band.to}
                  onChange={(e) => setBandTo(idx, Number(e.target.value))}
                  className="flex-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1 text-base-content"
                />
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-base-content/60 mt-1">
          Each band covers from the previous threshold up to this value. Values are on the same scale as Min / Max.
        </p>
      </div>

      {/* Risk-metric mode — flips color order so high values render red.
          Storage key stays `gaugeBandsReverse` for backward compat. */}
      <label htmlFor="cbGaugeHigherIsWorse" className="flex items-center gap-2 text-xs text-base-content cursor-pointer">
        <input
          id="cbGaugeHigherIsWorse"
          type="checkbox"
          checked={reverseColors}
          onChange={(e) => onChange({ ...config, gaugeBandsReverse: e.target.checked })}
          className="rounded border-base-300"
        />
        <span>Higher = worse</span>
        <span className="text-[10px] text-base-content/60 ml-auto">
          {reverseColors ? "risk metric" : "performance metric"}
        </span>
      </label>
    </div>
  );
}

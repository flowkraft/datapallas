"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { autoPickMeasure } from "@/lib/explore-data/smart-defaults";
import { pickColumnFormat } from "@/lib/explore-data/type-formatters";
import { AutoBadge, isAutoField, clearAutoFlag } from "./AutoBadge";

const FORMATS = [
  { value: "number", label: "Number (1,234)" },
  { value: "currency", label: "Currency ($1,234)" },
  { value: "percent", label: "Percent (73.1%)" },
  { value: "raw", label: "Raw value" },
];

interface NumberConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

export function NumberConfig({ config, columns, onChange }: NumberConfigProps) {
  // `effective = config || autoPick || fallback` pattern so the <select>
  // reflects the smart-default pick when the user hasn't overridden it, without
  // needing a reactive effect to write the pick back into displayConfig. Mirrors
  // NumberWidget's render-side logic so Canvas and Config see the same field.
  const configField = (config.numberField as string) || "";
  const autoField = autoPickMeasure(columns)?.columnName ?? "";
  const field = configField || autoField;
  const inferredFormat = field
    ? (pickColumnFormat({ columnName: field, typeName: "DOUBLE", isNullable: true }).kind === "currency"
        ? "currency" : "number")
    : "number";
  const format = (config.numberFormat as string) || inferredFormat;
  const label = (config.numberLabel as string) || "";

  const measures = columns.filter((c) => getFieldKind(c) === "measure");
  const dimensions = columns.filter((c) => getFieldKind(c) === "dimension");
  // If the stored field isn't in the current option list (e.g. columns haven't
  // loaded yet), fall back to the first available column so the <select> always
  // has a matching <option>. Without this guard React sets value="Freight_sum"
  // before the option exists, the browser snaps the DOM to "", and React never
  // re-syncs because it sees the value prop as unchanged.
  const allOptionNames = [...measures, ...dimensions].map((c) => c.columnName);
  const effectiveField = allOptionNames.includes(field)
    ? field
    : (measures[0]?.columnName ?? dimensions[0]?.columnName ?? "");

  return (
    <div id="configPanel-number" className="space-y-3">
      {/* Field */}
      <div>
        <span className="text-xs text-base-content/60">
          Value field <span className="text-emerald-500">(measure)</span>
          {isAutoField(config, "numberField") && <AutoBadge reason="First non-ID numeric column." />}
        </span>
        <select
          id="selectNumberField"
          value={effectiveField}
          onChange={(e) => onChange(clearAutoFlag({ ...config, numberField: e.target.value }, "numberField"))}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          <option value="">First column</option>
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
      </div>

      {/* Format */}
      <div>
        <span className="text-xs text-base-content/60">
          Format
          {!config.numberFormat && <AutoBadge reason="Inferred from column name: currency for price/revenue/freight/etc., else plain number." />}
        </span>
        <select
          id="selectNumberFormat"
          value={format}
          onChange={(e) => onChange(clearAutoFlag({ ...config, numberFormat: e.target.value }, "numberFormat"))}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div>
        <span className="text-xs text-base-content/60">Label</span>
        <input
          id="inputNumberLabel"
          value={label}
          onChange={(e) => onChange({ ...config, numberLabel: e.target.value })}
          placeholder="Auto from field name"
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        />
      </div>
    </div>
  );
}

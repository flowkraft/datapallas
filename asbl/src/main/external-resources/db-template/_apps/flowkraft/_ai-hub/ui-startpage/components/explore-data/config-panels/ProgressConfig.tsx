"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import { pickProgressField } from "@/lib/explore-data/smart-defaults";

const FORMATS = [
  { value: "number", label: "Number (1,234)" },
  { value: "currency", label: "Currency ($1,234)" },
  { value: "percent", label: "Percent (73%)" },
];

interface ProgressConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

export function ProgressConfig({ config, columns, onChange }: ProgressConfigProps) {
  // `effective = config || autoPick || fallback` — mirrors ProgressWidget's
  // render-side field resolution so Config and Canvas show the same default.
  const configField = (config.field as string) || "";
  const autoField = pickProgressField(columns).field ?? "";
  const field  = configField || autoField;
  const goal   = (config.goal   as number | undefined) ?? 100;
  const format = (config.format as string) || "number";
  const label  = (config.label  as string) || "";

  const measures = columns.filter((c) => getFieldKind(c) === "measure");

  return (
    <div id="configPanel-progress" className="space-y-3">
      <div>
        <span className="text-xs text-base-content/60">Value <span className="text-emerald-500">(measure)</span></span>
        <select
          id="selectProgressField"
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

      <div>
        <span className="text-xs text-base-content/60">Goal</span>
        <input
          id="inputProgressGoal"
          type="number"
          value={goal}
          onChange={(e) => onChange({ ...config, goal: Number(e.target.value) })}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        />
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

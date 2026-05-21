"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";

interface DetailConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

export function DetailConfig({ config, columns, onChange }: DetailConfigProps) {
  const hidden = (config.hiddenColumns as string[] | undefined) ?? [];

  const toggle = (name: string) => {
    const next = hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name];
    onChange({ ...config, hiddenColumns: next });
  };

  return (
    <div id="configPanel-detail" className="space-y-3">
      <div>
        <p className="text-xs text-base-content/60 mb-2">
          Single-row record viewer. Shows all columns of the first row as a key/value list.
        </p>
        <span className="text-xs text-base-content/60">Visible columns</span>
        <div className="mt-1 max-h-64 overflow-y-auto border border-base-300 rounded-md bg-base-100 p-1 space-y-0.5">
          {columns.length === 0 && (
            <p className="text-xs text-base-content/60 p-2">No columns detected yet.</p>
          )}
          {columns.map((c) => (
            <label key={c.columnName} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-base-200 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={!hidden.includes(c.columnName)}
                onChange={() => toggle(c.columnName)}
              />
              <span className="text-base-content">{c.columnName}</span>
              <span className="text-base-content/60 ml-auto text-[10px]">{c.typeName}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

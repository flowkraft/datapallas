"use client";

import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { getFieldKind } from "@/lib/explore-data/field-utils";
import type { FilterPaneDslOptions } from "@/lib/explore-data/dsl-sync/filter-pane-mapping";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: every UI gesture in this Display tab panel mutates
 * the canonical DSL Map at displayConfig.dslConfig — never the old structured
 * fields (filterField, filterPaneLabel, etc., now removed).
 * ============================================================================
 */

const SORT_OPTIONS = [
  { value: "",            label: "Auto (smart default)" },
  { value: "asc",         label: "Alphabetical ↑" },
  { value: "desc",        label: "Alphabetical ↓" },
  { value: "count_desc",  label: "Count (most first)" },
  { value: "none",        label: "None" },
] as const;

interface FilterPaneConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
}

function readDslMap(config: WidgetDisplayConfig): FilterPaneDslOptions {
  return (config.dslConfig as FilterPaneDslOptions) ?? {};
}

function setDslMap(
  config: WidgetDisplayConfig,
  next: FilterPaneDslOptions,
  onChange: (c: WidgetDisplayConfig) => void,
): void {
  onChange({ ...config, dslConfig: next });
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-base-content/60 pt-2 pb-1 border-t border-base-300/50">
      {children}
    </div>
  );
}

/** parse "240px" → 240; anything else → undefined */
function parseHeightPx(h: unknown): number | undefined {
  if (typeof h !== "string") return undefined;
  const m = /^(\d+)px$/.exec(h);
  return m ? parseInt(m[1], 10) : undefined;
}

export function FilterPaneConfig({ config, columns, onChange }: FilterPaneConfigProps) {
  const map = readDslMap(config);

  const field = (map.field as string | undefined) ?? "";
  const label = (map.label as string | undefined) ?? "";
  const sort = (map.sort as string | undefined) ?? "";
  const multiSelect = (map.multiSelect as boolean | undefined) ?? true;
  // showSearch: boolean → "on"/"off", undefined → "auto"
  const showSearch = map.showSearch === true ? "on"
                   : map.showSearch === false ? "off"
                   : "auto";
  const showCount = (map.showCount as boolean | undefined) ?? false;
  const maxValues = (map.maxValues as number | undefined) ?? 1000;
  const heightPx = parseHeightPx(map.height);
  const heightMode = heightPx ? "fixed" : "auto";

  const dimensions = columns.filter((c) => getFieldKind(c) === "dimension");
  const inputCls = "w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content";

  const setMap = (patch: Partial<FilterPaneDslOptions>) => {
    const next: FilterPaneDslOptions = { ...map };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    setDslMap(config, next, onChange);
  };

  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs text-base-content/60">
          Field to explore <span className="text-blue-500">(dimension)</span>
        </span>
        <select
          value={field}
          onChange={(e) => setMap({ field: e.target.value || undefined })}
          className={inputCls}
        >
          <option value="">Pick a field...</option>
          {dimensions.map((c) => (
            <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
          ))}
          {columns.filter((c) => getFieldKind(c) === "measure").length > 0 && (
            <optgroup label="Measures (less common for filter panes)">
              {columns.filter((c) => getFieldKind(c) === "measure").map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <p className="text-[10px] text-base-content/60 leading-relaxed">
        Shows all distinct values for this field. Click a value to select it — all other widgets will highlight what&apos;s associated and dim what&apos;s excluded.
      </p>

      <GroupHeader>Display</GroupHeader>
      <div>
        <span className="text-xs text-base-content/60">Label</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setMap({ label: e.target.value || undefined })}
          placeholder="Auto from field name"
          className={inputCls}
        />
      </div>

      <GroupHeader>Behavior</GroupHeader>
      <label className="flex items-center gap-2 text-xs text-base-content cursor-pointer">
        <input
          type="checkbox"
          checked={multiSelect}
          onChange={(e) => setMap({ multiSelect: e.target.checked })}
          className="rounded border-base-300"
        />
        <span>Multi-select</span>
        <span className="text-[10px] text-base-content/60 ml-auto">
          {multiSelect ? "checkboxes" : "single pick"}
        </span>
      </label>
      <div>
        <span className="text-xs text-base-content/60">Sort by</span>
        <select
          value={sort}
          onChange={(e) => setMap({ sort: e.target.value || undefined })}
          className={inputCls}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <GroupHeader>Value list</GroupHeader>
      <div>
        <span className="text-xs text-base-content/60">Show search box</span>
        <select
          value={showSearch}
          onChange={(e) => {
            const v = e.target.value;
            setMap({ showSearch: v === "on" ? true : v === "off" ? false : undefined });
          }}
          className={inputCls}
        >
          <option value="auto">Auto</option>
          <option value="on">Always on</option>
          <option value="off">Always off</option>
        </select>
        <p className="text-[10px] text-base-content/60 mt-1">
          Auto shows the box only when there are many values.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-base-content cursor-pointer">
        <input
          type="checkbox"
          checked={showCount}
          onChange={(e) => setMap({ showCount: e.target.checked || undefined })}
          className="rounded border-base-300"
        />
        <span>Show value counts</span>
        <span className="text-[10px] text-base-content/60 ml-auto">e.g. USA (1,243)</span>
      </label>
      <div>
        <span className="text-xs text-base-content/60">Max values</span>
        <input
          type="number"
          min={1}
          value={maxValues}
          onChange={(e) => {
            const n = Number(e.target.value);
            setMap({ maxValues: Number.isFinite(n) && n > 0 ? n : 1000 });
          }}
          className={inputCls}
        />
        <p className="text-[10px] text-base-content/60 mt-1">
          Caps the value list for high-cardinality fields.
        </p>
      </div>

      <GroupHeader>Layout</GroupHeader>
      <div>
        <span className="text-xs text-base-content/60">Height</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => setMap({ height: undefined })}
            className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
              heightMode === "auto"
                ? "border-primary bg-primary/5 text-base-content"
                : "border-base-300 text-base-content/60 hover:border-muted-foreground/50"
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => setMap({ height: `${heightPx ?? 240}px` })}
            className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
              heightMode === "fixed"
                ? "border-primary bg-primary/5 text-base-content"
                : "border-base-300 text-base-content/60 hover:border-muted-foreground/50"
            }`}
          >
            Fixed
          </button>
          {heightMode === "fixed" && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={40}
                value={heightPx ?? 240}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setMap({ height: `${Number.isFinite(n) && n > 0 ? n : 240}px` });
                }}
                className="w-16 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1 text-base-content"
              />
              <span className="text-xs text-base-content/60">px</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

// lucide-react removed
import type { WidgetDisplayConfig } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";
import type { TabulatorDslOptions } from "@/lib/explore-data/dsl-sync/tabulator-mapping";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: every UI gesture in this Display tab panel mutates
 * the canonical DSL Map at displayConfig.dslConfig — never the old structured
 * fields (hiddenColumns, tabulatorLayout, etc., now removed).
 * ============================================================================
 */

const LAYOUTS = [
  { value: "fitDataStretch", label: "Fit data (stretch last col)" },
  { value: "fitColumns",     label: "Fit columns to width" },
  { value: "fitData",        label: "Fit to data" },
  { value: "fitDataFill",    label: "Fit data (fill gap)" },
] as const;

const THEMES = [
  { value: "",           label: "Default (light)" },
  { value: "midnight",   label: "Midnight (dark)" },
  { value: "simple",     label: "Simple" },
  { value: "modern",     label: "Modern" },
  { value: "bootstrap5", label: "Bootstrap 5" },
  { value: "bulma",      label: "Bulma" },
] as const;

interface TabulatorConfigProps {
  config: WidgetDisplayConfig;
  columns: ColumnSchema[];
  onChange: (config: WidgetDisplayConfig) => void;
  rowCount?: number;
}

/** Pull the canonical DSL Map out of displayConfig. Returns empty Map for
 *  fresh widgets — Display tab gestures populate it from there. */
function readDslMap(config: WidgetDisplayConfig): TabulatorDslOptions {
  return (config.dslConfig as TabulatorDslOptions) ?? {};
}

/** Replace the dslConfig Map and call parent onChange. */
function setDslMap(
  config: WidgetDisplayConfig,
  next: TabulatorDslOptions,
  onChange: (c: WidgetDisplayConfig) => void,
): void {
  onChange({ ...config, dslConfig: next });
}

/** Find the index of a field's autoColumnsDefinitions entry, or -1. */
function findAcDefIdx(map: TabulatorDslOptions, field: string): number {
  const defs = (map.autoColumnsDefinitions as Array<{ field?: string }> | undefined) ?? [];
  return defs.findIndex((d) => d?.field === field);
}

/** Set or remove a per-field property in autoColumnsDefinitions, returning the
 *  new Map immutably. If `value` is undefined and the entry would be empty
 *  (only `field`), the entry is removed entirely. */
function setAutoColDef(
  map: TabulatorDslOptions,
  field: string,
  prop: string,
  value: unknown,
): TabulatorDslOptions {
  const defs = ((map.autoColumnsDefinitions as Array<Record<string, unknown>> | undefined) ?? []).slice();
  const idx = defs.findIndex((d) => d?.field === field);
  if (idx >= 0) {
    const entry = { ...defs[idx] };
    if (value === undefined) {
      delete entry[prop];
    } else {
      entry[prop] = value;
    }
    // Drop the entry entirely if no overrides remain.
    const { field: _f, ...rest } = entry;
    if (Object.keys(rest).length === 0) {
      defs.splice(idx, 1);
    } else {
      defs[idx] = entry;
    }
  } else if (value !== undefined) {
    defs.push({ field, [prop]: value });
  }
  // Always keep autoColumns: true so the rendered table shows non-overridden
  // columns by default. The DSL is "the lightest possible Tabulator wrapper" —
  // see DSLPrinciplesReadme.java Principle 4.
  // Cast: every entry we add has `field: string` (so DslColumn-shaped); TS
  // can't see this through Record<string, unknown> in the helper signature.
  return { ...map, autoColumns: true, autoColumnsDefinitions: defs as TabulatorDslOptions["autoColumnsDefinitions"] };
}

export function TabulatorConfig({ config, columns, onChange, rowCount }: TabulatorConfigProps) {
  const map = readDslMap(config);

  const layout       = (map.layout as string)         || "fitDataStretch";
  const pagination   = map.pagination !== false;
  const pageSize     = (map.paginationSize as number) || 50;
  const theme        = (map.theme as string)          ?? "";
  const hidePagination = rowCount === 1;

  const isHidden = (col: string): boolean => {
    const idx = findAcDefIdx(map, col);
    if (idx < 0) return false;
    const defs = (map.autoColumnsDefinitions as Array<Record<string, unknown>> | undefined) ?? [];
    return defs[idx]?.visible === false;
  };

  const toggleColumn = (col: string) => {
    const next = isHidden(col)
      ? setAutoColDef(map, col, "visible", undefined)  // un-hide → remove the override
      : setAutoColDef(map, col, "visible", false);
    setDslMap(config, next, onChange);
  };

  const setMapKey = (key: keyof TabulatorDslOptions, value: unknown) => {
    setDslMap(config, { ...map, [key]: value }, onChange);
  };

  return (
    <div id="configPanel-tabulator" className="space-y-4">
      {/* ── Layout ── */}
      <div>
        <span className="text-xs text-base-content/60">Layout</span>
        <select
          value={layout}
          onChange={(e) => setMapKey("layout", e.target.value)}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          {LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* ── Pagination ── */}
      {!hidePagination && (
        <div>
          <span className="text-xs text-base-content/60">Pagination</span>
          <div className="flex mt-1 rounded-md overflow-hidden border border-base-300 text-xs">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                id={`btnTabulatorPagination-${v ? "on" : "off"}`}
                onClick={() => setMapKey("pagination", v)}
                className={`flex-1 py-1.5 transition-colors ${
                  pagination === v
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-base-content/60 hover:bg-base-200"
                }`}
              >
                {v ? "On" : "Off"}
              </button>
            ))}
          </div>
          {pagination && (
            <div className="mt-2">
              <span className="text-xs text-base-content/60">Rows per page</span>
              <input
                type="number"
                min={5}
                max={500}
                step={5}
                value={pageSize}
                onChange={(e) => setMapKey("paginationSize", Number(e.target.value) || 50)}
                className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Theme ── */}
      <div>
        <span className="text-xs text-base-content/60">Theme</span>
        <select
          value={theme}
          onChange={(e) => setMapKey("theme", e.target.value)}
          className="w-full mt-1 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* ── Column visibility ── */}
      {columns.length === 0 ? (
        <p className="text-xs text-base-content/60">Run a query to see columns</p>
      ) : (
        <div className="space-y-2">
          <span className="text-xs text-base-content/60">Column visibility</span>
          <div className="space-y-0.5">
            {columns.map((col) => {
              const hidden = isHidden(col.columnName);
              return (
                <button
                  key={col.columnName}
                  id={`btnToggleCol-${col.columnName}`}
                  data-hidden={hidden ? "true" : "false"}
                  onClick={() => toggleColumn(col.columnName)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${
                    hidden ? "text-base-content/60/50" : "text-base-content hover:bg-base-200"
                  }`}
                >
                  {hidden
                    ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                  }
                  <span className={hidden ? "line-through" : ""}>{col.columnName}</span>
                  <span className="ml-auto text-[10px] text-base-content/60">{col.typeName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

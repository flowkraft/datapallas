"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { executeQuery, exploreAssociations, fetchSchema } from "@/lib/explore-data/rb-api";
import { autoFilterPaneField, probeCardinality, classifyColumn } from "@/lib/explore-data/smart-defaults";
import { useRbElementReady } from "./useRbElementReady";
import { useDslConfig } from "@/lib/hooks/use-dsl-config";
import type { FilterPaneDslOptions } from "@/lib/explore-data/dsl-sync/filter-pane-mapping";
import { IconSparkles as Sparkles } from "@/components/shared/Icons";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: this widget renders FROM the DSL Map produced by
 * useDslConfig (the canonical configuration). Same Map flows to <rb-filter-pane>
 * here AND to the published page after DSL→parse round-trip.
 * ============================================================================
 */

interface FilterPaneWidgetProps {
  widgetId: string;
}

export function FilterPaneWidget({ widgetId }: FilterPaneWidgetProps) {
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const connectionId = useCanvasStore((s) => s.connectionId);
  const exploreSelections = useCanvasStore((s) => s.exploreSelections);
  const exploreFieldStates = useCanvasStore((s) => s.exploreFieldStates);
  const exploreVersion = useCanvasStore((s) => s.exploreVersion);
  const toggleExploreSelection = useCanvasStore((s) => s.toggleExploreSelection);
  const setExploreFieldStates = useCanvasStore((s) => s.setExploreFieldStates);
  const widgets = useCanvasStore((s) => s.widgets);

  const { config: dslMap, updateConfig } = useDslConfig(widgetId, "filterpane");

  const ref = useRef<HTMLElement>(null);
  const ready = useRbElementReady("rb-filter-pane");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoErr, setAutoErr] = useState<string | null>(null);

  const field = (dslMap.field as string | undefined) ?? "";
  const table = (widget?.dataSource?.visualQuery?.table as string) || "";

  const handleAutoPickField = async () => {
    if (!widget || !connectionId || !table) return;
    setAutoBusy(true);
    setAutoErr(null);
    try {
      const schema = await fetchSchema(connectionId);
      const tbl = schema.tables.find((t) => t.tableName === table);
      if (!tbl) {
        setAutoErr(`Table ${table} not found.`);
        return;
      }
      const stringCols = tbl.columns
        .filter((c) => classifyColumn(c, tbl) === "category-low")
        .map((c) => c.columnName);
      const cardinality = stringCols.length > 0 ? await probeCardinality(connectionId, tbl.tableName, stringCols) : {};
      const picked = autoFilterPaneField(tbl, cardinality);
      if (!picked) {
        setAutoErr("No suitable filter field found in this table.");
        return;
      }
      updateConfig({ ...dslMap, field: picked } as FilterPaneDslOptions);
    } catch (e) {
      setAutoErr(e instanceof Error ? e.message : "Auto-pick failed");
    } finally {
      setAutoBusy(false);
    }
  };

  useEffect(() => {
    if (!connectionId || !field || !table) { setRows([]); return; }
    setLoading(true);
    executeQuery(
      connectionId,
      `SELECT DISTINCT "${field}" FROM "${table}" WHERE "${field}" IS NOT NULL ORDER BY "${field}" LIMIT 1000`,
    )
      .then((res) => setRows(res.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [connectionId, field, table]);

  // Recompute associative-exploration field states. Reads filter-pane fields
  // from each widget's dslConfig.field (canonical Map), not legacy filterField.
  useEffect(() => {
    if (!connectionId || !table || exploreSelections.length === 0) return;

    const filterPaneFields = widgets
      .filter((w) => w.type === "filter-pane")
      .map((w) => (w.displayConfig?.dslConfig as FilterPaneDslOptions | undefined)?.field)
      .filter((f): f is string => typeof f === "string" && f.length > 0);

    if (filterPaneFields.length === 0) return;

    exploreAssociations(connectionId, table, exploreSelections, filterPaneFields)
      .then((res) => setExploreFieldStates(res.fieldStates))
      .catch((err) => console.warn("Explore failed:", err));
  }, [connectionId, table, exploreVersion]);

  useEffect(() => {
    if (!ready || !ref.current || !field) return;

    const fieldStates = exploreFieldStates[field];
    const selectedSet = exploreSelections.filter((s) => s.field === field).map((s) => s.value);

    // Sort pick: explicit dslMap.sort wins; else infer from value type.
    const configSort = dslMap.sort as string | undefined;
    let pickedSort: "asc" | "count_desc" | "desc" | "none" = "asc";
    if (configSort === "asc" || configSort === "desc" || configSort === "count_desc" || configSort === "none") {
      pickedSort = configSort;
    } else {
      const sample = rows.find((r) => r[field] !== null && r[field] !== undefined && r[field] !== "")?.[field];
      const looksNumeric =
        typeof sample === "number" ||
        (typeof sample === "string" && sample !== "" && !isNaN(Number(sample)));
      pickedSort = looksNumeric ? "count_desc" : "asc";
    }

    const el = ref.current as HTMLElement & {
      data?: unknown;
      field?: string;
      label?: string;
      sort?: string;
      maxValues?: number;
      showSearch?: boolean | "auto";
      showCount?: boolean;
      multiSelect?: boolean;
      height?: string;
      selectedValues?: string[];
      associatedValues?: string[] | null;
      excludedValues?: string[] | null;
    };

    const cfgLabel       = (dslMap.label as string | undefined) ?? "";
    const cfgMultiSelect = (dslMap.multiSelect as boolean | undefined) ?? true;
    const cfgShowSearchRaw = dslMap.showSearch;  // boolean | undefined
    const cfgShowCount   = (dslMap.showCount as boolean | undefined) ?? false;
    const cfgMaxValues   = (dslMap.maxValues as number | undefined) ?? 1000;
    const cfgHeight      = (dslMap.height as string | undefined) ?? "auto";

    const searchProp: boolean | "auto" =
      cfgShowSearchRaw === true ? true
      : cfgShowSearchRaw === false ? false
      : "auto";

    el.field = field;
    el.label = cfgLabel || field;
    el.sort = pickedSort;
    el.maxValues = cfgMaxValues;
    el.showSearch = searchProp;
    el.showCount = cfgShowCount;
    el.multiSelect = cfgMultiSelect;
    el.height = cfgHeight;
    el.data = rows;
    el.selectedValues = selectedSet;
    el.associatedValues = fieldStates ? fieldStates.associated : null;
    el.excludedValues = fieldStates ? fieldStates.excluded : null;
  }, [ready, rows, field, exploreSelections, exploreFieldStates, dslMap]);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const el = ref.current;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { field: string; value: string };
      if (detail?.field && detail?.value !== undefined) {
        toggleExploreSelection(detail.field, detail.value);
      }
    };

    el.addEventListener("filterPaneSelect", handler);
    return () => el.removeEventListener("filterPaneSelect", handler);
  }, [ready, toggleExploreSelection]);

  if (!field) {
    if (!table) {
      return (
        <div className="flex items-center justify-center h-full text-xs text-base-content/60 p-2 text-center">
          Pick a table in the Data tab, then choose a field to filter by.
        </div>
      );
    }
    return (
      <div className="h-full flex items-center justify-center p-3">
        <div className="text-center max-w-xs">
          <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs font-medium text-base-content mb-1">Pick a field to filter by</p>
          <p className="text-[11px] text-base-content/60 mb-2">
            We&apos;ll auto-pick a low-cardinality column from {table}.
          </p>
          <button
            type="button"
            onClick={handleAutoPickField}
            disabled={autoBusy}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary text-primary-content text-[11px] font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {autoBusy
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
            }
            {autoBusy ? "Analyzing…" : "Auto-pick field"}
          </button>
          {autoErr && <p className="mt-1.5 text-[10px] text-error">{autoErr}</p>}
        </div>
      </div>
    );
  }
  if (loading) return <div className="flex items-center justify-center h-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 animate-spin text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>;
  if (!ready) return <div className="flex items-center justify-center h-full text-xs text-base-content/60">Loading components...</div>;

  return (
    // @ts-expect-error - Web component custom element
    <rb-filter-pane ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />
  );
}

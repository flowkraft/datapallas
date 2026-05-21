"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// lucide-react removed
import type { VisualQuery, DataSource } from "@/lib/stores/canvas-store";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { SchemaInfo } from "@/lib/explore-data/types";
import { buildSql, extractParamIds } from "@/lib/explore-data/sql-builder";
import { fetchCubes, fetchCube, parseCubeDsl, generateCubeSql, getConnectionType, type CubeInfo } from "@/lib/explore-data/rb-api";
import { useRbElementReady } from "../widgets/useRbElementReady";
import { DataStep } from "./DataStep";
import { FilterStep } from "./FilterStep";
import { SummarizeStep } from "./SummarizeStep";
import { SortStep } from "./SortStep";

const DEFAULT_QUERY: VisualQuery = {
  table: "",
  filters: [],
  summarize: [],
  groupBy: [],
  sort: [],
  limit: 500,
};

interface VisualQueryBuilderProps {
  schema: SchemaInfo;
  dataSource: DataSource | null;
  onChange: (ds: DataSource) => void;
  onRun: (sql: string) => void;
  executing: boolean;
  connectionId: string | null;
}

export function VisualQueryBuilder({ schema, dataSource, onChange, onRun, executing, connectionId }: VisualQueryBuilderProps) {
  const [showSql, setShowSql] = useState(false);
  const [cubes, setCubes] = useState<CubeInfo[]>([]);
  const parametersConfig = useCanvasStore((s) => s.parametersConfig);
  const availableParams = extractParamIds(parametersConfig?.parameters);

  // Cube renderer in-panel state
  const cubeRef = useRef<HTMLElement>(null);
  const cubeReady = useRbElementReady("rb-cube-renderer");
  const [cubeConfig, setCubeConfig] = useState<unknown>(null);
  const [cubeLoading, setCubeLoading] = useState(false);
  const [cubeError, setCubeError] = useState<string | null>(null);

  // Fetch cubes once and filter by current connectionId.
  useEffect(() => {
    if (!connectionId) { setCubes([]); return; }
    let cancelled = false;
    fetchCubes()
      .then((all) => { if (!cancelled) setCubes(all.filter((c) => c.connectionId === connectionId)); })
      .catch(() => { if (!cancelled) setCubes([]); });
    return () => { cancelled = true; };
  }, [connectionId]);

  const query: VisualQuery = dataSource?.visualQuery || DEFAULT_QUERY;
  const isCube = query.kind === "cube";
  // 4.6b — preview SQL must match the connection's dialect so the user sees
  // the same SQL that will actually execute (e.g. TO_CHAR on Postgres, not SQLite strftime).
  const connectionType = getConnectionType(connectionId);
  const sql = isCube ? "" : buildSql(query, { connectionType });
  const tables = schema.tables || [];
  const selectedTable = tables.find((t) => t.tableName === query.table);
  const columns = selectedTable?.columns || [];

  // Load cube config (DSL → parsed object) whenever the picked cube changes
  useEffect(() => {
    if (!isCube || !query.cubeId) { setCubeConfig(null); return; }
    let cancelled = false;
    setCubeLoading(true);
    setCubeError(null);
    (async () => {
      try {
        const cube = await fetchCube(query.cubeId!);
        const parsed = await parseCubeDsl(cube.dslCode);
        if (!cancelled) setCubeConfig(parsed);
      } catch (e) {
        if (!cancelled) setCubeError(e instanceof Error ? e.message : "Failed to load cube");
      } finally {
        if (!cancelled) setCubeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isCube, query.cubeId]);

  // Push cubeConfig + connection info into the custom element via property assignment
  useEffect(() => {
    if (!cubeReady || !cubeRef.current || !cubeConfig) return;
    const el = cubeRef.current as HTMLElement & {
      cubeConfig?: unknown; connectionId?: string; apiBaseUrl?: string; apiKey?: string;
    };
    const rbConfig = (typeof window !== "undefined"
      ? (window as unknown as { rbConfig?: { apiBaseUrl: string; apiKey: string } }).rbConfig
      : undefined);
    el.cubeConfig = cubeConfig;
    el.connectionId = connectionId || "";
    el.apiBaseUrl = rbConfig?.apiBaseUrl || "";
    el.apiKey = rbConfig?.apiKey || "";
  }, [cubeReady, cubeConfig, connectionId]);

  // Listen for selectionChanged → call generate-sql → update generatedSql on the data source
  // so useWidgetData picks it up and re-runs the query automatically.
  useEffect(() => {
    const el = cubeRef.current;
    if (!el || !cubeReady || !query.cubeId) return;

    const handleSelectionChange = async (e: Event) => {
      const detail = (e as CustomEvent<{
        selectedDimensions: string[];
        selectedMeasures: string[];
        selectedSegments: string[];
      }>).detail;
      if (!detail.selectedDimensions.length && !detail.selectedMeasures.length) return;
      try {
        const generatedSql = await generateCubeSql(
          query.cubeId!,
          connectionId || "",
          detail.selectedDimensions,
          detail.selectedMeasures,
        );
        onChange({ mode: "visual", visualQuery: { ...query }, generatedSql });
      } catch {
        // Silent — user can try again by changing selection
      }
    };

    el.addEventListener("selectionChanged", handleSelectionChange);
    return () => el.removeEventListener("selectionChanged", handleSelectionChange);
  }, [cubeReady, cubeLoading, query, connectionId, onChange]);

  const updateQuery = useCallback(
    (patch: Partial<VisualQuery>) => {
      const updated = { ...query, ...patch };
      // 4.6b — dialect-aware SQL generation so the cached generatedSql matches
      // what useWidgetData will execute (and what the Finetune tab shows).
      const newSql = updated.kind === "cube" ? "" : buildSql(updated, { connectionType: getConnectionType(connectionId) });
      onChange({ mode: "visual", visualQuery: updated, generatedSql: newSql });
    },
    [query, onChange, connectionId]
  );

  const handlePickTable = (table: string) => {
    updateQuery({ kind: "table", cubeId: undefined, table, filters: [], summarize: [], groupBy: [], sort: [] });
  };

  const handlePickCube = (cubeId: string) => {
    updateQuery({ kind: "cube", cubeId, table: "", filters: [], summarize: [], groupBy: [], sort: [] });
  };

  return (
    <div className="space-y-3">
      {/* Table / Cube picker */}
      <DataStep
        tables={tables}
        cubes={cubes}
        value={isCube ? (query.cubeId || "") : query.table}
        valueKind={isCube ? "cube" : "table"}
        onPickTable={handlePickTable}
        onPickCube={handlePickCube}
      />

      {/* ── Cube renderer panel ─────────────────────────────────────────
          When a cube is picked, show rb-cube-renderer inline in the right
          panel so the user can select dimensions / measures. Selection
          changes automatically regenerate SQL and refresh the widget on
          the canvas. */}
      {isCube && query.cubeId && (
        <div className="space-y-2">
          {cubeLoading && (
            <div className="flex items-center gap-2 text-xs text-base-content/60 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg> Loading cube…
            </div>
          )}
          {cubeError && (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-md p-2 overflow-hidden">
              Query error: {cubeError.split('\n')[0].slice(0, 200)}
            </div>
          )}
          {!cubeLoading && !cubeError && !cubeReady && (
            <div className="text-xs text-base-content/60 py-2">Loading components…</div>
          )}
          {!cubeLoading && !cubeError && cubeReady && (
            <div className="border border-base-300 rounded-md overflow-hidden" style={{ height: 380 }}>
              {/* @ts-expect-error — Web component custom element */}
              <rb-cube-renderer
                ref={cubeRef}
                style={{ display: "block", width: "100%", height: "100%", overflow: "auto" }}
              />
            </div>
          )}
          <p className="text-[11px] text-base-content/60">
            Select dimensions &amp; measures above — the widget on the canvas refreshes automatically.
          </p>
        </div>
      )}

      {/* ── Table query builder ─────────────────────────────────────────
          Shown only when a plain table (not a cube) is selected. */}
      {!isCube && query.table && columns.length > 0 && (
        <>
          <FilterStep columns={columns} filters={query.filters} availableParams={availableParams} onChange={(filters) => updateQuery({ filters })} />
          <SummarizeStep
            columns={columns}
            summarize={query.summarize}
            groupBy={query.groupBy}
            groupByNumericBuckets={query.groupByNumericBuckets}
            groupByBuckets={query.groupByBuckets}
            connectionId={connectionId}
            tableName={query.table}
            onChange={(summarize, groupBy, groupByNumericBuckets, groupByBuckets) =>
              updateQuery({ summarize, groupBy, groupByNumericBuckets, groupByBuckets })
            }
          />
          <SortStep columns={columns} sort={query.sort} onChange={(sort) => updateQuery({ sort })} />

          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-base-content/60 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" /></svg>
            <span className="text-xs text-base-content/60">Limit</span>
            <input
              id="inputLimit"
              type="number" min={1} max={10000} value={query.limit}
              onChange={(e) => updateQuery({ limit: parseInt(e.target.value) || 500 })}
              className="w-20 text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1 text-base-content"
            />
          </div>

          <button
            onClick={() => setShowSql(!showSql)}
            className="flex items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
            {showSql ? "Hide SQL" : "View SQL"}
          </button>

          {showSql && (
            <pre className="text-[11px] bg-base-200/50 border border-base-300 rounded-md p-3 overflow-x-auto text-base-content font-mono whitespace-pre-wrap">
              {sql || "-- build your query above"}
            </pre>
          )}

          <button
            id="btnRunQuery"
            onClick={() => { if (sql) onRun(sql); }}
            disabled={!sql || executing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {executing
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
            }
            {executing ? "Running..." : "Run Query"}
          </button>
        </>
      )}
    </div>
  );
}

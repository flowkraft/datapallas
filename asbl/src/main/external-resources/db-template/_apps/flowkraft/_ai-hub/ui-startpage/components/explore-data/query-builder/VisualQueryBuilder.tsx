"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// lucide-react removed
import type { CubeParamBinding, CubeSelection, VisualQuery, DataSource } from "@/lib/stores/canvas-store";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { SchemaInfo } from "@/lib/explore-data/types";
import { buildSql, columnClassOf, columnKindsOf, extractParamIds, extractParamTypes, sortableColumns } from "@/lib/explore-data/sql-builder";
import { computedColumnSchemas } from "@/lib/explore-data/computed-columns";
import { findTable, refForQuery } from "@/lib/explore-data/table-ref";
import { fetchCubes, fetchCube, parseCubeDsl, generateCubeSql, fetchCubeFilterOptions, fetchBuiltinParamNames, getConnectionType, type CubeInfo } from "@/lib/explore-data/rb-api";
import { cubeBindableMembers, seedCubeColumnFormats, selectionOfEvent, selectionWithBindings } from "@/lib/explore-data/cube-selection";
import type { ColumnSettingsMap } from "@/lib/explore-data/column-settings";
import { useRbElementReady } from "../widgets/useRbElementReady";
import { DataStep } from "./DataStep";
import { ComputeStep } from "./ComputeStep";
import { FilterStep } from "./FilterStep";
import { CubeBindStep } from "./CubeBindStep";
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

/**
 * The widget's query as the store holds it NOW. SQL for a cube is generated asynchronously, and
 * while the server answers the author may tick the Show In Dashboard box or change a binding;
 * writing the answer back onto the query the handler closed over would undo that change.
 */
function liveVisualQuery(widgetId: string): VisualQuery | undefined {
  return useCanvasStore.getState().widgets.find((w) => w.id === widgetId)?.dataSource?.visualQuery;
}

/** A widget that is the cube itself needs room for the field tree and a result under it; grown
 *  once, on the first check, and the author's own size is kept from then on. */
const CUBE_WIDGET_MIN_ROWS = 8;

interface VisualQueryBuilderProps {
  widgetId: string;
  schema: SchemaInfo;
  dataSource: DataSource | null;
  onChange: (ds: DataSource) => void;
  onRun: (sql: string) => void;
  executing: boolean;
  connectionId: string | null;
}

export function VisualQueryBuilder({ widgetId, schema, dataSource, onChange, onRun, executing, connectionId }: VisualQueryBuilderProps) {
  const [showSql, setShowSql] = useState(false);
  const [cubes, setCubes] = useState<CubeInfo[]>([]);
  const parametersConfig = useCanvasStore((s) => s.parametersConfig);
  const availableParams = extractParamIds(parametersConfig?.parameters);
  // And the `dp_` names the server sets for whoever is looking (R9): the bind chip offers them
  // next to the dashboard's own. One fetch, shared with the preview's own values, and an empty
  // answer (a session that may not ask) simply leaves the chip as it was.
  const [builtinParams, setBuiltinParams] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchBuiltinParamNames()
      .then((names) => { if (!cancelled) setBuiltinParams(names); })
      .catch(() => { if (!cancelled) setBuiltinParams([]); });
    return () => { cancelled = true; };
  }, []);
  // Their declared types too: a filter bound to a Date parameter means the
  // whole day it names, so the preview SQL has to be written with them (F8).
  const paramTypes = useMemo(() => extractParamTypes(parametersConfig?.parameters), [parametersConfig]);

  // Cube renderer in-panel state
  const cubeRef = useRef<HTMLElement>(null);
  /** The saved cube's own name inside its file: which cube of it the renderer starts on. */
  const cubeFileName = useRef("");
  const cubeReady = useRbElementReady("rb-cube-renderer");
  const [cubeConfig, setCubeConfig] = useState<unknown>(null);
  const [cubeLoading, setCubeLoading] = useState(false);
  const [cubeError, setCubeError] = useState<string | null>(null);
  /** What the last generate-sql said when it refused, shown under the picker instead of nothing. */
  const [cubeSqlError, setCubeSqlError] = useState<string | null>(null);
  /** The cube whose saved selection has already been put back into the tree: once per load. */
  const restoredFor = useRef("");

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
  const tables = schema.tables || [];
  const selectedTable = findTable(schema, refForQuery(query));
  const columns = selectedTable?.columns || [];
  // A computed column is a column to every step after Compute: it is offered in
  // Filter, Summarize and Sort under its own name, and the generator knows how to
  // write SQL for that name (`computed-columns.ts`, `refFor`). Its operands are
  // the columns that hold a number - arithmetic on a date or a name is not what
  // this step is for.
  const numericColumns = columns.filter((c) => columnClassOf(c) === "number");
  const columnsWithComputed = [...columns, ...computedColumnSchemas(query.computed)];
  // The column types decide what a filter literal looks like: a number goes in
  // bare, a date as the vendor's date literal. Without them every value was a
  // string, which a numeric or date column rejects on the strict vendors.
  const sql = isCube ? "" : buildSql(query, { connectionType, columnKinds: columnKindsOf(columns), paramTypes });

  // Load cube config (DSL → parsed object) whenever the picked cube changes
  useEffect(() => {
    if (!isCube || !query.cubeId) { setCubeConfig(null); return; }
    let cancelled = false;
    setCubeLoading(true);
    setCubeError(null);
    (async () => {
      try {
        const cube = await fetchCube(query.cubeId!);
        // The whole file: the renderer's own picker lists its cubes, and the saved `cubeName`
        // only says which one starts selected.
        const parsed = await parseCubeDsl(cube.dslCode);
        cubeFileName.current = cube.cubeName || "";
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
      cubeName?: string;
      fetchFilterOptions?: (dimension: string, search: string) => Promise<unknown>;
    };
    const rbConfig = (typeof window !== "undefined"
      ? (window as unknown as { rbConfig?: { apiBaseUrl: string; apiKey: string } }).rbConfig
      : undefined);
    el.cubeConfig = cubeConfig;
    el.cubeName = query.cubeName || cubeFileName.current || "";
    el.connectionId = connectionId || "";
    el.apiBaseUrl = rbConfig?.apiBaseUrl || "";
    el.apiKey = rbConfig?.apiKey || "";
    // The one call the tree may make: without it a dimension has no filter icon at all, so the
    // author could not filter on the canvas. The cube id and the connection are this panel's, not
    // the component's — the same rule the published dashboard's runtime twin follows.
    const cubeId = query.cubeId || "";
    el.fetchFilterOptions = (dimension: string, search: string) =>
      fetchCubeFilterOptions(cubeId, dimension, connectionId || "", search,
        query.cubeName || cubeFileName.current || "");
  }, [cubeReady, cubeConfig, connectionId, query.cubeId, query.cubeName]);

  // Put the saved selection back into the tree, once per cube load: the ticks, the grains and the
  // filter chips a widget was saved with are what it reopens with. `applySelection` is the tree's
  // own one path — the same call a Show Me hint and a live widget's `initial` come through — so it
  // ends in `selectionChanged` and the SQL is regenerated from what is on screen.
  useEffect(() => {
    if (!cubeReady || !cubeRef.current || !cubeConfig || !query.cubeId) return;
    const key = query.cubeId;
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    const selection = query.cubeSelection;
    if (!selection) return;
    const el = cubeRef.current as HTMLElement & {
      initialFilters?: unknown[];
      applySelection?: (selection: unknown) => boolean;
    };
    el.initialFilters = selection.filters || [];
    el.applySelection?.(selection);
    // The saved selection is this widget's, and it is applied to the tree it was taken from - so
    // this effect watches the cube, not the selection, and a tick does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cubeReady, cubeConfig, query.cubeId]);

  // Listen for selectionChanged → call generate-sql → update generatedSql on the data source
  // so useWidgetData picks it up and re-runs the query automatically.
  useEffect(() => {
    const el = cubeRef.current;
    if (!el || !cubeReady || !query.cubeId) return;

    const handleSelectionChange = async (e: Event) => {
      // The whole question the tree is asking, read the one way both hosts of the component read
      // it (`cube-selection.ts`). An empty tree is not a question.
      const reported = selectionOfEvent(e);
      if (!reported) return;
      const selection = reported.selection;
      // The cube the renderer is showing travels with the selection, so a file of several
      // cubes generates SQL for the one on screen — and a saved canvas keeps it.
      const cubeName = reported.cubeName || cubeFileName.current || "";
      // What the cube says its measures are, as the widget's own column formats (W4.2): money is
      // money in the table under it without the author setting anything, and a column they have
      // settled themselves is never overwritten.
      const store = useCanvasStore.getState();
      const displayConfig = store.widgets.find((w) => w.id === widgetId)?.displayConfig ?? {};
      const seeded = seedCubeColumnFormats(cubeConfig, cubeName, selection.measures,
        displayConfig.columnSettings as ColumnSettingsMap | undefined);
      if (seeded) store.updateWidgetDisplayConfig(widgetId, { ...displayConfig, columnSettings: seeded });
      // The bindings are the author's, not the tree's: `selectionChanged` says nothing about
      // them, so they travel from the saved widget into the new question. The SQL is generated
      // with them as filters - which is what puts `${country}` into the frozen text - while the
      // widget keeps them apart, so reopening it puts only the author's own chips back.
      // Read from the widget as it is now, not from the render this listener was set up in: a
      // binding added since then is the author's and must not be written over with the old list.
      const bindingsNow = () => (liveVisualQuery(widgetId) ?? query).cubeSelection?.paramBindings;
      let bindings = bindingsNow();
      try {
        let generatedSql = await generateCubeSql(
          query.cubeId!,
          connectionId || "",
          selectionWithBindings(selection, bindings),
          cubeName,
        );
        // A binding changed while the SQL was being generated: the statement is asked for again with
        // the list as it is now, so the SQL and the bindings written down together agree.
        for (let again = 0; again < 2 && JSON.stringify(bindingsNow() ?? []) !== JSON.stringify(bindings ?? []); again++) {
          bindings = bindingsNow();
          generatedSql = await generateCubeSql(
            query.cubeId!,
            connectionId || "",
            selectionWithBindings(selection, bindings),
            cubeName,
          );
        }
        const asked: CubeSelection = bindings?.length
          ? { ...selection, paramBindings: bindings }
          : selection;
        setCubeSqlError(null);
        const live = liveVisualQuery(widgetId);
        // Another cube was picked while the SQL was being generated: it is not this tree's SQL.
        if (live && live.cubeId !== query.cubeId) return;
        onChange({
          mode: "visual",
          visualQuery: { ...(live ?? query), cubeName: cubeName || undefined, cubeSelection: asked },
          generatedSql,
        });
      } catch (err) {
        // What the server said, under the picker: a cube that cannot answer names the member and
        // what is wrong with it, and silence left the widget showing the previous SQL's rows with
        // nothing to explain why the new tick changed nothing.
        setCubeSqlError(err instanceof Error ? err.message : "Failed to generate SQL");
      }
    };

    el.addEventListener("selectionChanged", handleSelectionChange);
    return () => el.removeEventListener("selectionChanged", handleSelectionChange);
  }, [cubeReady, cubeLoading, query, connectionId, onChange, cubeConfig, widgetId]);

  const updateQuery = useCallback(
    (patch: Partial<VisualQuery>) => {
      const updated = { ...query, ...patch };
      // 4.6b — dialect-aware SQL generation so the cached generatedSql matches
      // what useWidgetData will execute (and what the Finetune tab shows).
      // A cube's SQL is the server's answer to the field tree, not this builder's, so it is kept
      // as the last selection generated it: changing something else about the widget — the Show In
      // Dashboard box — must not blank it, because unchecking later has to leave current SQL
      // behind. Picking another cube is another tree, and starts with none.
      const newSql = updated.kind === "cube"
        ? (updated.cubeId === query.cubeId ? (dataSource?.generatedSql ?? "") : "")
        : buildSql(updated, {
            connectionType: getConnectionType(connectionId),
            columnKinds: columnKindsOf(findTable(schema, refForQuery(updated))?.columns),
            paramTypes,
          });
      onChange({ mode: "visual", visualQuery: updated, generatedSql: newSql });
    },
    [query, dataSource, onChange, connectionId, schema, paramTypes]
  );

  /**
   * The one-time minimum height of a widget that is about to become the cube: the field tree and
   * about 200px of result under it. It happens on the first check only — `cubeGrown` says it has
   * — so an author who sized the widget afterwards keeps their size when they check it again.
   */
  const growForShownCube = useCallback(() => {
    const store = useCanvasStore.getState();
    const widget = store.widgets.find((w) => w.id === widgetId);
    if (!widget || widget.displayConfig.cubeGrown) return;
    store.updateWidgetDisplayConfig(widgetId, { ...widget.displayConfig, cubeGrown: true });
    if (widget.gridPosition.h >= CUBE_WIDGET_MIN_ROWS) return;
    store.updateWidgetPosition(widgetId, { ...widget.gridPosition, h: CUBE_WIDGET_MIN_ROWS });
  }, [widgetId]);

  const handlePickTable = (table: string) => {
    setCubeSqlError(null);
    updateQuery({ kind: "table", cubeId: undefined, table, computed: [], filters: [], summarize: [], groupBy: [], sort: [], cubeSelection: undefined, showInDashboard: undefined });
  };

  /**
   * A binding added, changed or removed. It is kept on the widget's selection and the SQL is
   * generated again through the same call the tree's own change goes through, so the frozen text
   * follows the chip without the author touching the tree.
   */
  const changeCubeBindings = async (edit: (current: CubeParamBinding[]) => CubeParamBinding[]) => {
    const paramBindings = edit((liveVisualQuery(widgetId) ?? query).cubeSelection?.paramBindings ?? []);
    // The latest widget, not the one this render closed over: a second change made while the
    // first one is still waiting for its SQL starts from the first one's binding, not from the
    // list as it was before it.
    const saved = (liveVisualQuery(widgetId) ?? query).cubeSelection;
    const selection: CubeSelection = saved
      ? { ...saved, paramBindings }
      : { dimensions: [], measures: [], segments: [], filters: [], granularities: {}, order: [],
          limit: null, paramBindings };
    const cubeName = query.cubeName || cubeFileName.current || "";
    const asked = selectionWithBindings({ ...selection, paramBindings: undefined }, paramBindings);
    // Nothing ticked yet is not a question: the binding is kept, and the SQL follows the first tick.
    if (!selection.dimensions.length && !selection.measures.length) {
      onChange({
        mode: "visual",
        visualQuery: { ...query, cubeName: cubeName || undefined, cubeSelection: selection },
        generatedSql: dataSource?.generatedSql ?? "",
      });
      return;
    }
    // The binding is kept at once and the SQL follows: the chip is written down before the
    // statement for it is back, so the next change to the chip reads this one.
    onChange({
      mode: "visual",
      visualQuery: { ...(liveVisualQuery(widgetId) ?? query), cubeName: cubeName || undefined, cubeSelection: selection },
      generatedSql: dataSource?.generatedSql ?? "",
    });
    try {
      const generatedSql = await generateCubeSql(query.cubeId!, connectionId || "", asked, cubeName);
      setCubeSqlError(null);
      const live = liveVisualQuery(widgetId);
      if (live && live.cubeId !== query.cubeId) return;
      // A later change to the chip owns the statement now; this one is for bindings that are gone.
      if (live && JSON.stringify(live.cubeSelection?.paramBindings ?? []) !== JSON.stringify(paramBindings)) return;
      onChange({
        mode: "visual",
        visualQuery: { ...(live ?? query), cubeName: cubeName || undefined, cubeSelection: selection },
        generatedSql,
      });
    } catch (err) {
      setCubeSqlError(err instanceof Error ? err.message : "Failed to generate SQL");
    }
  };

  const handlePickCube = (cubeId: string) => {
    setCubeSqlError(null);
    // Another cube is another field tree: the ticks of the one before it mean nothing in it, so
    // the saved selection goes with the cube it belonged to.
    updateQuery({ kind: "cube", cubeId, table: "", computed: [], filters: [], summarize: [], groupBy: [], sort: [], cubeSelection: undefined });
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

      {/* What the server said when it refused the last generate-sql — the sentence naming the
          member and what is wrong with it, straight from the /api/cubes/* error shape. */}
      {cubeSqlError && (
        <div id="cubeSqlError" className="text-xs text-error bg-error/10 border border-error/20 rounded-md p-2 overflow-hidden">
          {cubeSqlError.split('\n')[0].slice(0, 200)}
        </div>
      )}

      {/* ── Cube renderer panel ─────────────────────────────────────────
          When a cube is picked, show rb-cube-renderer inline in the right
          panel so the user can select dimensions / measures. Selection
          changes automatically regenerate SQL and refresh the widget on
          the canvas. */}
      {isCube && query.cubeId && (
        <div className="space-y-2">
          {/* Show In Dashboard: the one choice that decides which of the two modes this widget is
              published as. Unchecked (the default, and every canvas saved until now) the SQL is
              frozen into the dashboard; checked, the cube itself is published. Each cube widget
              has its own box, so any number of cubes can be shown. */}
          <label className="flex items-center gap-2 text-xs text-base-content cursor-pointer">
            <input
              id="chkCubeShowInDashboard"
              type="checkbox"
              checked={!!query.showInDashboard}
              onChange={(e) => { if (e.target.checked) growForShownCube(); updateQuery({ showInDashboard: e.target.checked }); }}
              className="checkbox checkbox-xs"
            />
            Show In Dashboard
          </label>
          <p className="text-[11px] text-base-content/60">
            Viewers pick fields and filter in the dashboard. It follows later edits of this cube.
          </p>
          {/* Which dashboard filter narrows this cube (R1, R8). The table query's bind chip puts
              a `${param}` into a filter's value box; a cube widget has no value box, so the
              author says which member the dashboard's own filter narrows. It is the same control
              either way it is published: unchecked, the frozen SQL carries the name; checked, the
              entry carries the binding and the live cube follows the dashboard. */}
          <CubeBindStep
            members={cubeBindableMembers(cubeConfig, query.cubeName || cubeFileName.current || "")}
            bindings={query.cubeSelection?.paramBindings ?? []}
            onChange={changeCubeBindings}
            availableParams={availableParams}
            builtinParams={builtinParams}
          />
          {query.showInDashboard ? (
            <p id="cubeOnCanvasNote" className="text-xs text-base-content/60 py-2">
              Pick fields in the cube on the canvas.
            </p>
          ) : (<>
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
          </>)}
        </div>
      )}

      {/* ── Table query builder ─────────────────────────────────────────
          Shown only when a plain table (not a cube) is selected. */}
      {!isCube && query.table && columns.length > 0 && (
        <>
          {/* Compute comes first: the columns it names are then pickable in every
              step below it. Nothing to compute without a numeric column. */}
          {numericColumns.length > 0 && (
            <ComputeStep
              columns={numericColumns}
              computed={query.computed ?? []}
              onChange={(computed) => updateQuery({ computed })}
            />
          )}
          <FilterStep columns={columnsWithComputed} filters={query.filters} match={query.filterMatch ?? "all"} onMatchChange={(filterMatch) => updateQuery({ filterMatch })} availableParams={availableParams} builtinParams={builtinParams} onChange={(filters) => updateQuery({ filters })} />
          <SummarizeStep
            columns={columns}
            aggregateColumns={columnsWithComputed}
            summarize={query.summarize}
            groupBy={query.groupBy}
            groupByNumericBuckets={query.groupByNumericBuckets}
            groupByBuckets={query.groupByBuckets}
            connectionId={connectionId}
            tableName={query.table}
            tableSchema={query.tableSchema}
            onChange={(summarize, groupBy, groupByNumericBuckets, groupByBuckets) =>
              updateQuery({ summarize, groupBy, groupByNumericBuckets, groupByBuckets })
            }
          />
          {/* Sorting a summarized query is sorting what it selects, so the step
              offers the grouped columns and the aggregates, not every column of
              the table (`sortableColumns`). */}
          <SortStep columns={sortableColumns(query, columnsWithComputed)} sort={query.sort} onChange={(sort) => updateQuery({ sort })} />

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
            id="btnToggleVisualSql"
            onClick={() => setShowSql(!showSql)}
            className="flex items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
            {showSql ? "Hide SQL" : "View SQL"}
          </button>

          {showSql && (
            <pre
              id="preVisualSql"
              className="text-[11px] bg-base-200/50 border border-base-300 rounded-md p-3 overflow-x-auto text-base-content font-mono whitespace-pre-wrap"
            >
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

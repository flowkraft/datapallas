"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { SchemaInfo, TableSchema } from "@/lib/explore-data/types";
import { executeQuery, executeScript, fetchSchema, getConnectionType, hasConnectionsCached, ensureConnectionsLoaded } from "@/lib/explore-data/rb-api";
import { columnKindsOf, extractParamTypes, sqlForDataSource } from "@/lib/explore-data/sql-builder";
import { asTableRef, findTable, tableKey, type TableRef } from "@/lib/explore-data/table-ref";
import { temporalColumnNamesOf } from "@/lib/explore-data/widget-defaults";
import { LAST_EXEC } from "@/lib/explore-data/widget-exec-cache";

// Per-table schema cache: keyed by `${connectionId}\u0000${tableKey(ref)}`, so a
// table outside the default schema has its own entry instead of sharing one with
// a same-named table in the default schema.
// Used by visual-query mode to get the selected table's full column list
// (including foreignKeys) for FK-column exclusion in ChartWidget / NumberWidget.
const SCHEMA_CACHE: Map<string, Promise<TableSchema | null>> = new Map();

// Full-connection schema cache: keyed by connectionId alone.
// One fetch covers ALL tables for a connection; reused by every widget on the
// same canvas so we never fire more than one /schema request per connection
// per app session.  Populated lazily on first widget mount for a connection.
// Used to supply shapeFromResult with connectionSchemas for the Step 2
// cross-reference that classifies SQL/script result columns against source
// table column metadata without parsing any SQL or Groovy.
const CONNECTION_SCHEMA_CACHE: Map<string, Promise<SchemaInfo>> = new Map();

function getConnectionSchema(connectionId: string): Promise<SchemaInfo> {
  if (!CONNECTION_SCHEMA_CACHE.has(connectionId)) {
    CONNECTION_SCHEMA_CACHE.set(connectionId, fetchSchema(connectionId).catch(() => ({ notes: null, tables: [] })));
  }
  return CONNECTION_SCHEMA_CACHE.get(connectionId)!;
}

function schemaCacheKey(connectionId: string, table: TableRef | string): string {
  return `${connectionId}\u0000${tableKey(table)}`;
}

async function getTableSchema(connectionId: string, table: TableRef | string): Promise<TableSchema | null> {
  const key = schemaCacheKey(connectionId, table);
  const cached = SCHEMA_CACHE.get(key);
  if (cached) return cached;
  const p = fetchSchema(connectionId)
    .then((s) => findTable(s, table) ?? null)
    .catch(() => null);
  SCHEMA_CACHE.set(key, p);
  return p;
}

/** useWidgetData — the single fetcher for a widget's query result.
 *
 * Executes the widget's query (visual SQL / raw SQL / Groovy script) and
 * writes the result into `canvas-store.queryResults[widgetId]`. All consumers
 * (this hook's own return value for widget render, plus ConfigPanel's column
 * inference + palette ranker, plus QueryBuilder's "X rows returned" status)
 * read from that single store entry. One backend call per Run — no matter how
 * many consumers are subscribed.
 *
 * Re-execution triggers:
 *   - visual mode: any change to connectionId/dataSource/filterVersion
 *   - sql / ai-sql: executeVersion increments (bumped by QueryBuilder.handleRun)
 *   - script: scriptExecuteVersion increments (bumped by handleRunScript)
 */
export function useWidgetData(widgetId: string) {
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const connectionId = useCanvasStore((s) => s.connectionId);
  const filterValues = useCanvasStore((s) => s.filterValues);
  // The declared type of each dashboard parameter, from the canonical Map the
  // parameter bar is built from: it travels with the values so the backend binds
  // a date as a date, exactly as the published dashboard does.
  const parametersConfig = useCanvasStore((s) => s.parametersConfig);
  const filterVersion = useCanvasStore((s) => s.filterVersion);
  // Store reader — this is what the widget renders from.  QueryBuilder and
  // ConfigPanel read the same entry so they all see one execution.
  const cached = useCanvasStore((s) => s.queryResults[widgetId]);
  const setWidgetQueryLoading = useCanvasStore((s) => s.setWidgetQueryLoading);
  const setWidgetQueryResult  = useCanvasStore((s) => s.setWidgetQueryResult);
  const setWidgetQueryError   = useCanvasStore((s) => s.setWidgetQueryError);
  const clearWidgetQueryLoading = useCanvasStore((s) => s.clearWidgetQueryLoading);

  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  // All tables for the active connection — fed to shapeFromResult as
  // connectionSchemas so SQL/script result columns can be cross-referenced
  // against source table column metadata (Step 2 of the 3-step lookup).
  const [connectionSchemas, setConnectionSchemas] = useState<TableSchema[]>([]);

  // Connection-list cache must be populated before we build SQL — otherwise
  // getConnectionType() returns null and dialectFor() falls back to the SQLite
  // default. SQLite-specific syntax (typeof(), strftime()) sent to a Postgres/
  // TimescaleDB engine errors out (`function typeof(timestamp with time zone)
  // does not exist`). Gate firing on this flag.
  const [connectionsReady, setConnectionsReady] = useState<boolean>(hasConnectionsCached);
  useEffect(() => {
    if (connectionsReady) return;
    let cancelled = false;
    ensureConnectionsLoaded().finally(() => {
      if (!cancelled) setConnectionsReady(hasConnectionsCached());
    });
    return () => { cancelled = true; };
  }, [connectionsReady]);

  const dataSource = widget?.dataSource;
  const tableName = dataSource?.visualQuery?.table || "";
  const tableSchemaName = dataSource?.visualQuery?.tableSchema;

  // Expose the TableSchema (with foreignKeys) for the widget's table.
  // Lets ChartWidget/NumberWidget call `isIdColumn(k, tableSchema)` so FK columns
  // like `Orders.ShipVia` are excluded from Y-axis measures at render time,
  // even though their names don't match the `/id|code|key$/i` pattern.
  useEffect(() => {
    if (!connectionId || !tableName) { setTableSchema(null); return; }
    let cancelled = false;
    getTableSchema(connectionId, asTableRef(tableName, tableSchemaName)).then((t) => {
      if (!cancelled) setTableSchema(t);
    });
    return () => { cancelled = true; };
  }, [connectionId, tableName, tableSchemaName]);

  // Populate connectionSchemas for SQL/script cross-reference in shapeFromResult.
  // Fires once per connectionId; the Promise is shared via CONNECTION_SCHEMA_CACHE
  // so all widgets on the same canvas reuse the same fetch.
  useEffect(() => {
    if (!connectionId) { setConnectionSchemas([]); return; }
    let cancelled = false;
    getConnectionSchema(connectionId).then((schema) => {
      if (!cancelled) setConnectionSchemas(schema.tables);
    });
    return () => { cancelled = true; };
  }, [connectionId]);

  // Fetch + store. Writes result/error/loading into canvas-store.queryResults
  // so every subscriber gets the same data from one call.  Uses the
  // module-level LAST_EXEC map instead of a useRef so remounts don't
  // double-fire (the auto-switch unmounts TabulatorWidget and mounts
  // MapWidget etc., and each mount used to restart the version counter).
  useEffect(() => {
    if (!connectionId || !dataSource) return;
    // Wait for the connection list before building SQL — see connectionsReady
    // declaration above for why.
    if (!connectionsReady) return;

    const mode = dataSource.mode;
    const prev = LAST_EXEC.get(widgetId);

    // Script mode — version-gated re-execution.
    if (mode === "script") {
      const currentVersion = dataSource.scriptExecuteVersion ?? 0;
      if (prev && prev.mode === "script" && prev.scriptVersion === currentVersion) {
        console.log('[useWidgetData] SKIP-script widgetId=' + widgetId + ' ver=' + currentVersion);
        return;
      }
      LAST_EXEC.set(widgetId, { mode: "script", scriptVersion: currentVersion });

      const script = dataSource.script;
      if (!script) { clearWidgetQueryLoading(widgetId); return; }

      let cancelled = false;
      let settled = false;
      setWidgetQueryLoading(widgetId);
      executeScript(connectionId, script, filterValues ?? {}, extractParamTypes(parametersConfig?.parameters))
        .then((res) => { settled = true; if (!cancelled) setWidgetQueryResult(widgetId, res); })
        .catch((e) => { settled = true; if (!cancelled) setWidgetQueryError(widgetId, e instanceof Error ? e.message : "Script failed"); });

      return () => {
        cancelled = true;
        if (!settled) clearWidgetQueryLoading(widgetId);
      };
    }

    // Build raw SQL. Filter values are sent to the backend separately as named
    // params — the backend converts ${param} → :param and uses JDBI bindMap for
    // injection-safe binding.  No client-side string substitution.
    // The column kinds come from the same table schema this hook already loads,
    // so the SQL that executes writes a number as a number and a date as the
    // vendor's date literal — the strict vendors reject the quoted form.
    const raw = sqlForDataSource(
      dataSource,
      getConnectionType(connectionId),
      temporalColumnNamesOf(widget?.shape),
      columnKindsOf(tableSchema?.columns),
      // The declared parameter types say which bound filter is bound to a Date,
      // and a Date parameter means the whole day it names (F8).
      extractParamTypes(parametersConfig?.parameters),
    );
    if (!raw) { clearWidgetQueryLoading(widgetId); return; }

    // SQL / AI-SQL — re-execute when Run is clicked OR when dashboard filter
    // values change AND the SQL contains a ${param} placeholder. Without the
    // filter-aware branch, View SQL widgets bound to dashboard params (e.g. Win
    // Rate, Sharpe Ratio with `WHERE strategy_run_id IN (${strategy_runs})`)
    // would not refresh until the user clicks Run Query, breaking the dashboard.
    if (mode === "sql" || mode === "ai-sql") {
      const currentVersion = dataSource.executeVersion ?? 0;
      const usesParams = raw.includes("${") || raw.includes("#{");
      const filterSnapshot = usesParams ? JSON.stringify(filterValues ?? {}) : "";
      if (prev && prev.mode === mode &&
          prev.executeVersion === currentVersion &&
          prev.filterSnapshot === filterSnapshot) {
        console.log('[useWidgetData] SKIP-sql widgetId=' + widgetId + ' ver=' + currentVersion);
        return;
      }
      LAST_EXEC.set(widgetId, { mode, executeVersion: currentVersion, filterSnapshot });
    }

    if (mode === "visual") {
      const filterSnapshot = JSON.stringify(filterValues ?? {});
      if (prev && prev.mode === "visual" && prev.sql === raw && prev.filterSnapshot === filterSnapshot) {
        console.log('[useWidgetData] SKIP-visual widgetId=' + widgetId);
        return;
      }
      LAST_EXEC.set(widgetId, { mode: "visual", sql: raw, filterSnapshot });
    }

    let cancelled = false;
    let settled = false;  // set true when result/error has been stored
    setWidgetQueryLoading(widgetId);
    executeQuery(connectionId, raw, filterValues ?? {}, extractParamTypes(parametersConfig?.parameters))
      .then((res) => {
        settled = true;
        if (!cancelled) setWidgetQueryResult(widgetId, res);
      })
      .catch((e) => {
        settled = true;
        console.log('[useWidgetData] ERROR widgetId=' + widgetId + ' ' + (e instanceof Error ? e.message : String(e)));
        if (!cancelled) setWidgetQueryError(widgetId, e instanceof Error ? e.message : "Query failed");
      });

    return () => {
      cancelled = true;
      // If the in-flight fetch was abandoned before it settled, clear loading
      // so the spinner doesn't stick. The next effect run (if it doesn't dedup)
      // will call setWidgetQueryLoading again — the brief gap is invisible
      // because React runs cleanup + next-effect inside the same commit phase.
      if (!settled) clearWidgetQueryLoading(widgetId);
    };
  }, [connectionId, dataSource, filterValues, filterVersion, parametersConfig, widgetId, connectionsReady, tableSchema, setWidgetQueryLoading, setWidgetQueryResult, setWidgetQueryError, clearWidgetQueryLoading]);

  return {
    result: cached?.result ?? null,
    loading: cached?.loading ?? false,
    error: cached?.error ?? null,
    tableSchema,
    connectionSchemas,
  };
}


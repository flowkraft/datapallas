// Client for the DataPallas Java backend.
//
// Calls go through this app's own server-side proxy (app/api/dp/[...path]/route.ts) rather than
// straight to port 9090. Two reasons: it is same-origin, so no CORS is involved and the browser sends
// the session cookie normally; and the backend credential stays on the server instead of being handed
// to every script on the page. Never point this at :9090 again.

import type { SchemaInfo, ConnectionInfo, QueryResult } from "./types";

const RB_BASE = "/api/dp";

// Module-level singleton: fires once per app load, shared by all callers.
// Multiple AiHelpDialog mounts all await the same promise instead of each
// firing a separate request that races on the backend static field.
let _copilotUrlPromise: Promise<string> | null = null;

export function fetchCopilotUrl(): Promise<string> {
  if (!_copilotUrlPromise) {
    _copilotUrlPromise = fetch(`${RB_BASE}/system/info/copilot-url`)
      .then((res) => {
        if (!res.ok) return "https://chatgpt.com/";
        return res.text().then((url) => url?.trim() || "https://chatgpt.com/");
      })
      .catch(() => "https://chatgpt.com/");
  }
  return _copilotUrlPromise;
}

// Module-level cache populated by the most recent successful fetchConnections() call.
// Used by `getConnectionType(id)` so callers (e.g. SQL builder dialect picker)
// don't need to re-fetch for every query. Gets replaced each fetch — no TTL needed
// since SchemaBrowser re-fetches on mount and connection-picker interactions.
let _lastConnections: ConnectionInfo[] = [];

export async function fetchConnections(): Promise<ConnectionInfo[]> {
  const res = await fetch(`${RB_BASE}/connections?type=database`);
  if (!res.ok) throw new Error("Failed to load connections");
  const list = await res.json();
  _lastConnections = Array.isArray(list) ? list : [];
  return _lastConnections;
}

/**
 * Look up the dbserver type ("sqlite", "postgres", "mysql", etc.) for a given
 * connectionId from the last-fetched connection list. Returns null when the
 * connection isn't in the cache yet (callers should fall back to a sensible default).
 */
export function getConnectionType(connectionId: string | null | undefined): string | null {
  if (!connectionId) return null;
  const match = _lastConnections.find((c) => c.connectionCode === connectionId);
  return match?.dbserver?.type ?? null;
}

/** True when the connection list has been fetched at least once and is non-empty.
 *  Used by widget data hooks to gate query firing — without this, a widget can
 *  build its SQL with the SQLite default dialect during the brief window
 *  between page mount and the connections fetch resolving, then send sqlite
 *  syntax (typeof, strftime) to whatever the actual engine is. */
export function hasConnectionsCached(): boolean {
  return _lastConnections.length > 0;
}

/** Idempotent: returns the in-flight or completed fetchConnections() promise.
 *  Multiple callers awaiting at startup share one network request. */
let _connectionsPromise: Promise<ConnectionInfo[]> | null = null;
export function ensureConnectionsLoaded(): Promise<ConnectionInfo[]> {
  if (_lastConnections.length > 0) return Promise.resolve(_lastConnections);
  if (_connectionsPromise) return _connectionsPromise;
  _connectionsPromise = fetchConnections()
    .catch(() => [] as ConnectionInfo[])
    .finally(() => { _connectionsPromise = null; });
  return _connectionsPromise;
}

export async function fetchSchema(connectionId: string): Promise<SchemaInfo> {
  const res = await fetch(`${RB_BASE}/queries/schema/${encodeURIComponent(connectionId)}`);
  if (!res.ok) throw new Error("Failed to load schema");
  return res.json();
}

export async function executeQuery(
  connectionId: string,
  sql: string,
  filterValues?: Record<string, string>,
): Promise<QueryResult> {
  console.log('[executeQuery] FETCH-START sql=' + sql.slice(0, 80));
  const body: Record<string, unknown> = { connectionId, sql };
  if (filterValues && Object.keys(filterValues).length > 0) body.params = filterValues;
  const res = await fetch(`${RB_BASE}/queries/run-sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log('[executeQuery] FETCH-DONE status=' + res.status);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Query failed");
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function executeScript(
  connectionId: string,
  script: string,
  filterValues?: Record<string, string>,
): Promise<QueryResult> {
  const body: Record<string, unknown> = { connectionId, script };
  if (filterValues && Object.keys(filterValues).length > 0) body.filterValues = filterValues;
  const res = await fetch(`${RB_BASE}/queries/run-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Script failed");
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// --- Cubes ---

export interface CubeInfo {
  id: string;
  name: string;
  description: string;
  connectionId: string;
  isSample: string; // backend returns "true" / "false" as strings
}

/**
 * List all cube definitions. Filtering by connectionId is done client-side
 * (the backend has no server-side filter).
 */
export async function fetchCubes(): Promise<CubeInfo[]> {
  const res = await fetch(`${RB_BASE}/cubes`);
  if (!res.ok) throw new Error("Failed to load cubes");
  return res.json();
}

/**
 * Load a single cube definition (metadata + Groovy DSL source).
 */
export async function fetchCube(cubeId: string): Promise<{ id: string; name: string; description: string; connectionId: string; dslCode: string; isSample: boolean }> {
  const res = await fetch(`${RB_BASE}/cubes/${encodeURIComponent(cubeId)}`);
  if (!res.ok) throw new Error("Failed to load cube");
  return res.json();
}

/**
 * Generate SQL from a cube's selected dimensions and measures.
 * Mirrors the POST call that <rb-cube-renderer> makes internally when
 * the user clicks "Generate SQL" in its own modal.
 */
export async function generateCubeSql(
  cubeId: string,
  connectionId: string,
  selectedDimensions: string[],
  selectedMeasures: string[],
): Promise<string> {
  const id = cubeId && cubeId !== "(default)" ? cubeId : "preview";
  const res = await fetch(`${RB_BASE}/cubes/${encodeURIComponent(id)}/generate-sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, selectedDimensions, selectedMeasures }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate SQL");
  }
  const data = await res.json();
  return data.sql || "";
}

/**
 * Parse a cube DSL code string into a structured CubeOptions object.
 * The result is the shape that <rb-cube-renderer cubeConfig={...} /> expects.
 */
export async function parseCubeDsl(dslCode: string): Promise<unknown> {
  const res = await fetch(`${RB_BASE}/cubes/parse-dsl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dslCode }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to parse cube DSL");
  }
  return res.json();
}

// --- Canvas CRUD ---

export async function listCanvases(): Promise<unknown[]> {
  const res = await fetch(`${RB_BASE}/explorations`);
  if (!res.ok) return [];
  return res.json();
}

export async function createCanvas(name: string): Promise<{ id: string }> {
  const res = await fetch(`${RB_BASE}/explorations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCanvas(canvasId: string): Promise<unknown> {
  const res = await fetch(`${RB_BASE}/explorations/${encodeURIComponent(canvasId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateCanvas(canvasId: string, body: unknown): Promise<void> {
  const res = await fetch(`${RB_BASE}/explorations/${encodeURIComponent(canvasId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function deleteCanvas(canvasId: string): Promise<void> {
  await fetch(`${RB_BASE}/explorations/${encodeURIComponent(canvasId)}`, { method: "DELETE" });
}

// --- Associative exploration ---

export interface ExploreSelection {
  field: string;
  value: string;
}

export interface ExploreFieldState {
  associated: string[];
  excluded: string[];
}

export interface ExploreResponse {
  fieldStates: Record<string, ExploreFieldState>;
  metadata: {
    executionTimeMs: number;
    engine: string;
    cached: boolean;
    hint?: string;
  };
}

/**
 * Compute associated/excluded values per field given active selections.
 * Works transparently across DuckDB, ClickHouse, and regular SQL databases.
 */
export async function exploreAssociations(
  connectionCode: string,
  tableName: string,
  selections: ExploreSelection[],
  fields: string[],
): Promise<ExploreResponse> {
  const res = await fetch(`${RB_BASE}/analytics/explore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionCode, tableName, selections, fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Explore failed");
  }
  return res.json();
}

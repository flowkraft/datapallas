// Client for the DataPallas Java backend.
//
// Calls go through this app's own server-side proxy (app/api/dp/[...path]/route.ts) rather than
// straight to port 9090. Two reasons: it is same-origin, so no CORS is involved and the browser sends
// the session cookie normally; and the backend credential stays on the server instead of being handed
// to every script on the page. Never point this at :9090 again.

import type { SchemaInfo, ConnectionInfo, QueryResult } from "./types";
import type { CubeSelection } from "@/lib/stores/canvas-store";

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

/** `${dp_user_id}` / `#{dp_attr_customer_id}` — the built-in variables a piece of SQL names. */
const DP_VARIABLE = /[$#]\{(dp_[a-z0-9_]*)\}/g;

/** The two that are not text: a widget compares them with a date and a timestamp column. */
const DP_VARIABLE_TYPES: Record<string, string> = { dp_today: "Date", dp_now: "DateTime" };

// One fetch per app load, shared: the values do not change while the page is open, and every
// widget on a canvas would otherwise ask for them at once.
let _userVariablesPromise: Promise<Record<string, string>> | null = null;

/**
 * This caller's own `dp_` variables, for the SQL the authoring screens run.
 *
 * A viewer never comes through here: their values are put into the request by the server, after
 * it has read what they sent, so they cannot name somebody else. The canvas is the one place that
 * assembles SQL in the browser and runs it through `run-sql`, which binds what the caller sends
 * and nothing else — so the author asks the server what it would say about them, and sends that.
 *
 * Empty when the answer is anything but 200 (a viewer's session, an older backend). A variable
 * with no value binds as an empty value and matches no row, which is the safe end of the mistake.
 */
export function fetchUserVariables(): Promise<Record<string, string>> {
  if (!_userVariablesPromise) {
    _userVariablesPromise = fetch(`${RB_BASE}/user-variables`, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : {}))
      .then((values) => (values && typeof values === "object" ? values as Record<string, string> : {}))
      .catch(() => ({} as Record<string, string>));
  }
  return _userVariablesPromise;
}

/** The `dp_` names this SQL asks for, each once. */
function dpVariablesNamedBy(sql: string): string[] {
  const named = new Set<string>();
  for (const found of sql.matchAll(DP_VARIABLE)) named.add(found[1]);
  return [...named];
}

export async function executeQuery(
  connectionId: string,
  sql: string,
  filterValues?: Record<string, string>,
  paramTypes?: Record<string, string>,
): Promise<QueryResult> {
  console.log('[executeQuery] FETCH-START sql=' + sql.slice(0, 80));

  // A cube's access_filter, and any widget SQL that names ${dp_…}, reaches this one place with
  // its placeholders still in it - that is what the generated text is meant to carry, so that the
  // published dashboard binds the person looking at it. Here there is no such person: the author
  // is running their own SQL, so the author's own values are the ones bound, and the canvas shows
  // them their own rows. Values the caller already sent win: a dashboard parameter the author is
  // trying out is theirs to set, and nothing named dp_ can be declared as one anyway.
  const params: Record<string, string> = { ...(filterValues ?? {}) };
  const types: Record<string, string> = { ...(paramTypes ?? {}) };
  const named = dpVariablesNamedBy(sql);
  if (named.length > 0) {
    const mine = await fetchUserVariables();
    for (const name of named) {
      if (params[name] === undefined && mine[name] !== undefined) params[name] = mine[name];
      if (types[name] === undefined && DP_VARIABLE_TYPES[name]) types[name] = DP_VARIABLE_TYPES[name];
    }
  }

  const body: Record<string, unknown> = { connectionId, sql };
  if (Object.keys(params).length > 0) body.params = params;
  // The declared type of each parameter travels with its value: the backend binds a
  // date as a date and a number as a number, which the strict vendors require and the
  // lenient ones answer differently from one another without.
  if (Object.keys(types).length > 0) body.paramTypes = types;
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
  paramTypes?: Record<string, string>,
): Promise<QueryResult> {
  const body: Record<string, unknown> = { connectionId, script };
  if (filterValues && Object.keys(filterValues).length > 0) body.filterValues = filterValues;
  if (paramTypes && Object.keys(paramTypes).length > 0) body.paramTypes = paramTypes;
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
export async function fetchCube(cubeId: string): Promise<{ id: string; name: string; description: string; connectionId: string; dslCode: string; isSample: boolean; cubeName?: string | null }> {
  const res = await fetch(`${RB_BASE}/cubes/${encodeURIComponent(cubeId)}`);
  if (!res.ok) throw new Error("Failed to load cube");
  return res.json();
}

/**
 * Generate SQL from a cube's selected dimensions, measures and segments.
 *
 * The segments are the cube's named WHERE clauses. They were left out of this
 * call, so a user who picked a segment in the renderer got the unsegmented SQL
 * back — every row, silently. The backend has always read them
 * (`CubeSqlGenerator.requestedList(request, "segments", "selectedSegments")`).
 */
export async function generateCubeSql(
  cubeId: string,
  connectionId: string,
  selection: CubeSelection,
  cubeName?: string | null,
): Promise<string> {
  const id = cubeId && cubeId !== "(default)" ? cubeId : "preview";
  const res = await fetch(`${RB_BASE}/cubes/${encodeURIComponent(id)}/generate-sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId,
      // The whole selection, in the structured form the backend reads (`CubeSqlGenerator
      // .buildQuery`). The segments go with it: a cube segment is a WHERE clause, and leaving it
      // out gave back the SQL for every row. So do the filters, the order and the limit, so the
      // frozen SQL asks the question the canvas shows.
      dimensions: selection.dimensions,
      measures: selection.measures,
      segments: selection.segments,
      granularities: selection.granularities,
      filters: selection.filters,
      order: selection.order,
      limit: selection.limit,
      // A file's named cube: which one the renderer is showing. Left out, the saved name stands.
      cubeName: cubeName || null,
    }),
  });
  if (!res.ok) throw new Error(await cubeErrorOf(res, "Failed to generate SQL"));
  const data = await res.json();
  return data.sql || "";
}

/**
 * The values one dimension of a cube may be filtered by, for the field tree's filter popover:
 * `{values: [[value, label], …], truncated}`.
 *
 * The component is handed this call rather than a cube id it could build a URL from, so the canvas
 * decides what it may ask, the same way a published dashboard's runtime twin does.
 */
export async function fetchCubeFilterOptions(
  cubeId: string,
  dimension: string,
  connectionId: string,
  search: string,
  cubeName?: string | null,
): Promise<unknown> {
  const res = await fetch(`${RB_BASE}/cubes/${encodeURIComponent(cubeId)}/filter-options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dimension, connectionId, search, cubeName: cubeName || null }),
  });
  if (!res.ok) throw new Error(await cubeErrorOf(res, "Failed to load filter values"));
  return res.json();
}

/**
 * What a refused `/api/cubes/*` call said. The controller answers a bad cube with
 * `{"error": "…"}` — a sentence naming the member and what is wrong with it — and that sentence is
 * the whole answer, so it is what the screen shows instead of "server error".
 */
async function cubeErrorOf(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    if (body && typeof body.error === "string" && body.error.trim()) return body.error;
    if (body && typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    // Not JSON: whatever the server wrote is still better than nothing.
  }
  return text || fallback;
}

/**
 * Parse a cube DSL code string into a structured CubeOptions object.
 * The result is the shape that <rb-cube-renderer cubeConfig={...} /> expects.
 * cubeName picks the cube the file holds under that name (a loaded cube's cubeName).
 */
export async function parseCubeDsl(dslCode: string, cubeName?: string | null): Promise<unknown> {
  const res = await fetch(`${RB_BASE}/cubes/parse-dsl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dslCode, cubeName }),
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

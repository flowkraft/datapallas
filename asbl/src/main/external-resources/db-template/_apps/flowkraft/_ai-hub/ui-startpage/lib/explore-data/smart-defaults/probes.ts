// ANSI SQL only — no vendor branch in this file; vendor forms live in
// `../sql-dialects.ts`.
//
// Database probes — cardinality, date range, numeric range, value fingerprint.
// All cached per (connectionId, schema-qualified table) with a 5-min TTL so repeat clicks
// during a canvas edit session don't re-run `COUNT(DISTINCT)` or `MIN/MAX`.

import { executeQuery, getConnectionType } from "../rb-api";
import { quoteIdent, quoteTableRef, dialectFor, datetimeExpr, limitClause, type SqlDialect } from "../sql-dialects";
import { asTableRef, tableKey, type TableRef } from "../table-ref";
import type { CardinalityMap } from "./classification";
import type { ColumnSchema, SemanticHint } from "../types";
import { normalizeType, NUMERIC_TYPES } from "./classification";

export type { CardinalityMap };

// THE RULE: every query below is ANSI SQL, the same text on all nine vendors.
// The four things ANSI cannot say — quoting a name (`quoteIdent`), quoting a
// table reference (`quoteTableRef`), capping rows (`limitClause`) and reading a
// datetime out of a column that may hold an epoch (`datetimeExpr`) — come from
// `sql-dialects.ts`, the vendor layer. There is no vendor check in this file.
//
// Each probe's SQL is a pure function of its inputs (`cardinalitySql`,
// `dateRangeSql`, `numericRangeSql`, `sampleRowsSql`), exported so the tests
// read exactly the text the probe sends, for every vendor, without a database.
//
// Quoting matters for the aliases too: Oracle and Db2 fold an unquoted alias to
// upper case, so `AS minv` came back as the column `MINV` and `row.minv` was
// undefined — the date and numeric probes simply returned null there, and every
// bucket and bin width fell back to a guess. The aliases are quoted now.
//
// The dialect is derived per call from getConnectionType(connectionId), so the
// same probe works regardless of which database the canvas is connected to.
//
// Every probe takes the table as a `TableRef | string`: a bare name means the
// connection's default schema, which is what a probe was always given, so a
// caller that passes a string keeps the SQL and the cache key it had.

const CARDINALITY_CACHE: Map<string, { at: number; data: CardinalityMap }> = new Map();
const CARDINALITY_TTL_MS = 5 * 60 * 1000;

function cacheKey(connectionId: string, table: TableRef | string): string {
  return `${connectionId}\u0000${tableKey(table)}`;
}

/**
 * The one-round-trip distinct-count query: one `COUNT(DISTINCT c) AS c` per
 * column. ANSI on every vendor, and the alias is the column's own name so the
 * result row is read by column name.
 */
export function cardinalitySql(
  table: TableRef | string,
  columnNames: string[],
  dialect: SqlDialect,
): string {
  const selects = columnNames
    .map((c) => `COUNT(DISTINCT ${quoteIdent(c, dialect)}) AS ${quoteIdent(c, dialect)}`)
    .join(", ");
  return `SELECT ${selects} FROM ${quoteTableRef(asTableRef(table), dialect)}`;
}

/**
 * Probe distinct-value counts for a batch of columns with a single SQL round-trip.
 *   SELECT COUNT(DISTINCT "A") AS "A", COUNT(DISTINCT "B") AS "B" FROM "table"
 *
 * Returns a `{col: number}` map. Columns that fail individually return 0.
 * Cached per `(connectionId, table reference)` with a 5-min TTL. Unknown columns
 * (not in cache) trigger a single batched query covering only the missing ones;
 * their results are merged back into the cache.
 */
export async function probeCardinality(
  connectionId: string,
  table: TableRef | string,
  columnNames: string[],
): Promise<CardinalityMap> {
  if (columnNames.length === 0) return {};

  const key = cacheKey(connectionId, table);
  const entry = CARDINALITY_CACHE.get(key);
  const now = Date.now();
  const cached = entry && now - entry.at < CARDINALITY_TTL_MS ? entry.data : {};
  const dialect = dialectFor(getConnectionType(connectionId));

  const missing = columnNames.filter((c) => !(c in cached));

  if (missing.length === 0) {
    const out: CardinalityMap = {};
    for (const c of columnNames) out[c] = cached[c];
    return out;
  }

  const sql = cardinalitySql(table, missing, dialect);

  let fetched: CardinalityMap = {};
  try {
    const res = await executeQuery(connectionId, sql);
    const row = res.data[0] || {};
    for (const c of missing) {
      const v = row[c];
      fetched[c] = typeof v === "number" ? v : Number(v) || 0;
    }
  } catch {
    fetched = Object.fromEntries(missing.map((c) => [c, 0]));
  }

  const merged = { ...cached, ...fetched };
  CARDINALITY_CACHE.set(key, { at: now, data: merged });

  const out: CardinalityMap = {};
  for (const c of columnNames) out[c] = merged[c] ?? 0;
  return out;
}


/**
 * Probe the MIN/MAX of a date column to pick a time bucket sized to the data range.
 * Returns null if the query fails or the column has no rows.
 */
export function dateRangeSql(
  table: TableRef | string,
  column: string,
  dialect: SqlDialect,
): string {
  // The value read is `datetimeExpr(column)`, not the raw column: a JDBC driver
  // commonly writes a LocalDateTime to SQLite as BIGINT epoch ms, and a raw
  // MIN/MAX then returns an integer that `guessTimeBucket(string)` mis-parses
  // via `new Date(...)`. The vendor layer decodes it where that happens and
  // hands back the column itself everywhere else.
  const value = datetimeExpr(column, dialect);
  return `SELECT MIN(${value}) AS ${quoteIdent("minv", dialect)}, MAX(${value}) AS ${quoteIdent("maxv", dialect)}`
    + ` FROM ${quoteTableRef(asTableRef(table), dialect)} WHERE ${quoteIdent(column, dialect)} IS NOT NULL`;
}

export async function probeDateRange(
  connectionId: string,
  table: TableRef | string,
  column: string,
): Promise<{ min: string; max: string } | null> {
  try {
    const dialect = dialectFor(getConnectionType(connectionId));
    const sql = dateRangeSql(table, column, dialect);
    const res = await executeQuery(connectionId, sql);
    const row = res.data[0];
    if (!row || row.minv == null || row.maxv == null) return null;
    return { min: String(row.minv), max: String(row.maxv) };
  } catch {
    return null;
  }
}

/**
 * Probe MIN/MAX of a numeric column — used by the numeric-binning path to
 * pick a nice bin width via `nicerBinWidth(min, max)`. Returns null if the
 * query fails or the column has no rows.
 */
export function numericRangeSql(
  table: TableRef | string,
  column: string,
  dialect: SqlDialect,
): string {
  const c = quoteIdent(column, dialect);
  return `SELECT MIN(${c}) AS ${quoteIdent("minv", dialect)}, MAX(${c}) AS ${quoteIdent("maxv", dialect)}`
    + ` FROM ${quoteTableRef(asTableRef(table), dialect)} WHERE ${c} IS NOT NULL`;
}

export async function probeNumericRange(
  connectionId: string,
  table: TableRef | string,
  column: string,
): Promise<{ min: number; max: number } | null> {
  try {
    const dialect = dialectFor(getConnectionType(connectionId));
    const sql = numericRangeSql(table, column, dialect);
    const res = await executeQuery(connectionId, sql);
    const row = res.data[0];
    if (!row || row.minv == null || row.maxv == null) return null;
    const min = Number(row.minv);
    const max = Number(row.maxv);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Semantic-type fingerprinting: sample each text column, run per-type value
// matchers against each sample, compute the hit-rate, and assign a semantic
// hint when the best-matching type clears its threshold.
// ────────────────────────────────────────────────────────────────────────────

/** Hit-rate threshold each type must clear to "claim" a column. Higher for
 *  tight patterns (URL, email), lower for codes-from-a-known-set (state,
 *  country) which can legitimately have rows that don't match. */
const FINGERPRINT_THRESHOLDS: Record<SemanticHint, number> = {
  url:        0.95,
  image_url:  0.95,
  avatar_url: 0.95,
  email:      0.95,
  json:       0.95,
  state:      0.70,
  country:    0.70,
  city:       0.70,
  zip_code:   0.80,
  latitude:   0.95,
  longitude:  0.95,
  currency:   0.90,
  percentage: 0.90,
};

const EMAIL_VALUE_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_VALUE_RX = /^https?:\/\/[^\s]+$/i;
const IMAGE_URL_VALUE_RX = /^https?:\/\/[^\s]+\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i;
const ZIP_US_VALUE_RX = /^\d{5}(-\d{4})?$/;
const ZIP_OTHER_VALUE_RX = /^[A-Z0-9]{3,10}$/;
const JSON_START_RX = /^\s*[\[{]/;

// US state 2-letter codes (50 + DC). Used for the `state` fingerprint threshold.
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// ISO 3166-1 alpha-2 country codes — subset that covers the common ones.
// Full list is too long to inline; the 45 here are enough to fingerprint
// typical business data without false-negatives on cross-region samples.
const COUNTRY_CODES = new Set([
  "US","GB","CA","AU","DE","FR","IT","ES","NL","BE","CH","AT","SE","NO","DK",
  "FI","IE","PT","PL","CZ","RU","CN","JP","KR","IN","BR","MX","AR","CL","ZA",
  "EG","NG","KE","SA","AE","IL","TR","GR","UA","HU","RO","BG","HR","SK","SI",
]);

interface PredicateSample {
  /** How many non-null samples were tested. */
  n: number;
  /** Hits per semantic type. */
  hits: Partial<Record<SemanticHint, number>>;
}

function testValue(v: string, sample: PredicateSample): void {
  sample.n++;
  if (EMAIL_VALUE_RX.test(v)) sample.hits.email = (sample.hits.email ?? 0) + 1;
  if (URL_VALUE_RX.test(v)) sample.hits.url = (sample.hits.url ?? 0) + 1;
  if (IMAGE_URL_VALUE_RX.test(v)) sample.hits.image_url = (sample.hits.image_url ?? 0) + 1;
  if (JSON_START_RX.test(v)) {
    try { JSON.parse(v); sample.hits.json = (sample.hits.json ?? 0) + 1; } catch { /* ignore */ }
  }
  const upper = v.trim().toUpperCase();
  if (US_STATE_CODES.has(upper)) sample.hits.state = (sample.hits.state ?? 0) + 1;
  if (COUNTRY_CODES.has(upper)) sample.hits.country = (sample.hits.country ?? 0) + 1;
  if (ZIP_US_VALUE_RX.test(v) || ZIP_OTHER_VALUE_RX.test(upper)) {
    sample.hits.zip_code = (sample.hits.zip_code ?? 0) + 1;
  }
}

function bestHint(sample: PredicateSample): SemanticHint | null {
  if (sample.n === 0) return null;
  // Priority order: image_url before url (image is a stricter url), then
  // email/json/state/country/zip. Threshold check stops at first match.
  const priority: SemanticHint[] = ["image_url", "url", "email", "json", "state", "country", "zip_code", "city"];
  let best: SemanticHint | null = null;
  let bestPct = 0;
  for (const k of priority) {
    const hits = sample.hits[k] ?? 0;
    const pct = hits / sample.n;
    if (pct >= FINGERPRINT_THRESHOLDS[k] && pct > bestPct) {
      best = k;
      bestPct = pct;
    }
  }
  return best;
}

// Module-level cache, keyed like the cardinality one: `${connectionId}\0${tableKey(table)}`.
// Mirrors the cardinality cache — 5-min TTL.
const FINGERPRINT_CACHE: Map<string, { at: number; hints: Record<string, SemanticHint> }> = new Map();
const FINGERPRINT_TTL_MS = 5 * 60 * 1000;

/**
 * The fingerprint sample: some columns, capped to a sample size. `LIMIT n` was
 * rejected outright by SQL Server, Oracle and Db2, so no column on those three
 * ever got a semantic hint; the cap is written by the vendor layer now.
 */
export function sampleRowsSql(
  table: TableRef | string,
  columnNames: string[],
  sampleSize: number,
  dialect: SqlDialect,
): string {
  const selects = columnNames.map((c) => quoteIdent(c, dialect)).join(", ");
  const sql = `SELECT ${selects} FROM ${quoteTableRef(asTableRef(table), dialect)}`;
  return limitClause(sql, sampleSize, dialect);
}

/**
 * Probe semantic types for all text-like columns in a table by sampling up
 * to 200 rows via a single SQL round-trip. Returns a `{col: SemanticHint}`
 * map (cols that don't hit any threshold are omitted). Cached per
 * `(connectionId, table reference)` with 5-min TTL.
 *
 * Numeric / temporal / boolean columns are skipped — their types are
 * already precise at the JDBC level.
 */
export async function probeSemanticType(
  connectionId: string,
  table: TableRef | string,
  cols: ColumnSchema[],
  sampleSize = 200,
): Promise<Record<string, SemanticHint>> {
  const key = cacheKey(connectionId, table);
  const entry = FINGERPRINT_CACHE.get(key);
  const now = Date.now();
  if (entry && now - entry.at < FINGERPRINT_TTL_MS) return entry.hints;

  // Only fingerprint text-like columns. Numeric/temporal/boolean don't need it.
  const textCols = cols.filter((c) => {
    const t = normalizeType(c.typeName);
    return !NUMERIC_TYPES.has(t) && t !== "DATE" && t !== "DATETIME" && t !== "TIMESTAMP"
      && t !== "TIME" && t !== "TIMESTAMPTZ" && t !== "BOOLEAN" && t !== "BIT" && t !== "BOOL";
  });
  if (textCols.length === 0) {
    FINGERPRINT_CACHE.set(key, { at: now, hints: {} });
    return {};
  }

  const dialect = dialectFor(getConnectionType(connectionId));
  const sql = sampleRowsSql(table, textCols.map((c) => c.columnName), sampleSize, dialect);

  console.log('[probeSemanticType] START table=' + tableKey(table) + ' textCols=' + textCols.length);
  let samples: Record<string, PredicateSample> = {};
  try {
    const res = await executeQuery(connectionId, sql);
    console.log('[probeSemanticType] DONE rows=' + res.data?.length);
    for (const c of textCols) samples[c.columnName] = { n: 0, hits: {} };
    for (const row of res.data) {
      for (const c of textCols) {
        const v = row[c.columnName];
        if (v == null) continue;
        const s = String(v);
        if (!s) continue;
        testValue(s, samples[c.columnName]);
      }
    }
  } catch {
    console.log('[probeSemanticType] ERROR');
    FINGERPRINT_CACHE.set(key, { at: now, hints: {} });
    return {};
  }

  const hints: Record<string, SemanticHint> = {};
  for (const [col, sample] of Object.entries(samples)) {
    const hint = bestHint(sample);
    if (hint) hints[col] = hint;
  }

  FINGERPRINT_CACHE.set(key, { at: now, hints });
  return hints;
}


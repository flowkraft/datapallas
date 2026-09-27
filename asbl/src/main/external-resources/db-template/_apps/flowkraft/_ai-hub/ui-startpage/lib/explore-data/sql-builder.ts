// Builds ANSI SQL from visual query steps.
//
// THE RULE: everything written here is ANSI SQL, the same text on every one of
// the nine vendors. Where ANSI has no form for something — quoting a name,
// limiting rows, writing a literal, a case-insensitive contains, reading a date
// out of a column — this file calls the vendor layer (`sql-dialects.ts`), which
// is the only place a vendor-specific SQL form may live. There is no vendor
// check in this file, and there must never be one: if a vendor needs a
// different form, it gets a named function in the layer.
//
// What that buys: the SQL is correct regardless of how tables and columns were
// named at creation time (upper, lower, mixed, spaces) and regardless of the
// vendor, and one reader can see what the generator emits without holding nine
// dialects in their head.
//
// The table reference carries its schema only when that schema is not the
// connection's default one, so a table in `main`, `public` or `dbo` produces
// byte-for-byte the SQL it always did.
//
// Two expressions replace a grouped column: a time bucket (`groupByBuckets`),
// which has no ANSI form and therefore comes from the layer, and a numeric bin
// (`groupByNumericBuckets`), which is ANSI and lives here. Both are aliased to
// the original column name so downstream code sees the same identifier.

import type { DataSource, VisualQuery } from "@/lib/stores/canvas-store";
import {
  aliasSafeColumnRef,
  bucketExpr,
  containsFilter,
  dateExpr,
  dialectFor,
  limitClause,
  quoteIdent,
  quoteTableRef,
  sqlLiteral,
  type SqlDialect,
  type SqlLiteralKind,
  type TableRef,
} from "./sql-dialects";
import { asTableRef } from "./table-ref";
import { nicerBinWidth } from "./smart-defaults";
import type { ColumnSchema } from "./types";

/** Returns true if the value is a canvas parameter reference: `${paramName}`. */
export function isParamRef(value: string): boolean {
  return /^\$\{\w+\}$/.test((value ?? "").trim());
}

/**
 * Extracts parameter IDs from the canonical `parametersConfig.parameters`
 * Map. Used to populate the "bind to parameter" toggle in VisualQueryBuilder's
 * FilterStep — direct read, no parse round-trip needed.
 */
export function extractParamIds(parameters: { id?: string }[] | null | undefined): string[] {
  if (!parameters) return [];
  return parameters.map((p) => p.id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

// ── What a column holds ────────────────────────────────────────────────────
// One classification of a database type name, used twice: the SQL builder picks
// the literal form from it, and the filter step picks the operator list and the
// input control from it. It was two lists that agreed by accident; a type in one
// and not the other meant the UI offered a date picker whose value then went
// into the SQL as a string.

/** Column type names that hold a number. */
const NUMBER_TYPE_NAMES = new Set([
  "INT", "INTEGER", "INT2", "INT4", "INT8", "SMALLINT", "BIGINT", "TINYINT",
  "DECIMAL", "NUMERIC", "NUMBER", "FLOAT", "FLOAT4", "FLOAT8", "REAL", "DOUBLE",
  "DOUBLE PRECISION", "MONEY", "SMALLMONEY", "SERIAL", "BIGSERIAL",
  "HUGEINT", "UINTEGER", "UBIGINT", "USMALLINT", "UTINYINT",
]);

/** Column type names that hold a date with no time part. */
const DATE_TYPE_NAMES = new Set(["DATE"]);

/** Column type names that hold a date and a time. */
const TIMESTAMP_TYPE_NAMES = new Set([
  "DATETIME", "DATETIME2", "SMALLDATETIME", "TIMESTAMP", "TIMESTAMPTZ",
  "TIMESTAMP_TZ", "TIMESTAMP WITH TIME ZONE", "TIMESTAMP WITHOUT TIME ZONE",
]);

/** Column type names that hold a time of day or a span, but no date. */
const TIME_TYPE_NAMES = new Set([
  "TIME", "TIMETZ", "TIME WITH TIME ZONE", "TIME WITHOUT TIME ZONE", "INTERVAL",
]);

/** Column type names that hold a boolean. */
const BOOLEAN_TYPE_NAMES = new Set(["BOOLEAN", "BOOL", "BIT"]);

/** What a column holds, as far as SQL and the filter UI are concerned. */
export type ColumnClass = "number" | "date" | "timestamp" | "time" | "boolean" | "string";

/**
 * Classify a column by the type the database reported — never by the text the
 * user typed. Anything unrecognised is a string, which is what every column was
 * before this existed, so an unknown type keeps exactly the SQL it had.
 */
export function columnClassOf(column: ColumnSchema | null | undefined): ColumnClass {
  const type = (column?.typeName || "").toUpperCase().split("(")[0].trim();
  if (NUMBER_TYPE_NAMES.has(type)) return "number";
  if (DATE_TYPE_NAMES.has(type)) return "date";
  if (TIMESTAMP_TYPE_NAMES.has(type)) return "timestamp";
  if (TIME_TYPE_NAMES.has(type)) return "time";
  if (BOOLEAN_TYPE_NAMES.has(type)) return "boolean";
  return "string";
}

/**
 * The literal kind a filter value on this column must be written as.
 * `sqlLiteral` then writes the value in the form that kind takes on the
 * connection's vendor.
 *
 * A TIME or INTERVAL column takes a string literal: there is no portable ANSI
 * time literal, and `DATE '09:30:00'` is simply wrong.
 */
export function sqlLiteralKindOf(column: ColumnSchema | null | undefined): SqlLiteralKind {
  const kind = columnClassOf(column);
  return kind === "time" ? "string" : kind;
}

/** The kinds of a table's columns, in the form `BuildSqlOptions` takes. */
export function columnKindsOf(
  columns: ColumnSchema[] | null | undefined,
): ReadonlyMap<string, SqlLiteralKind> {
  const out = new Map<string, SqlLiteralKind>();
  for (const c of columns ?? []) {
    if (c?.columnName) out.set(c.columnName, sqlLiteralKindOf(c));
  }
  return out;
}

/**
 * The next calendar day, for the half-open end of a date range. Returns null
 * for anything that is not a plain `yyyy-mm-dd`, which keeps a value the user
 * has half-typed out of the SQL.
 */
export function nextDay(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A decimal literal for a generated expression — a bin width, not a user value.
 *
 * Bin widths are computed (`nicerBinWidth`), so they arrive as binary floats:
 * `0.1 + 0.2` prints as `0.30000000000000004`, and a small width prints as
 * `1e-7`, which no database reads as a number. Twelve significant digits is
 * more than any width needs and removes the noise; the exponent form is then
 * expanded by hand, because `toFixed` is the only way to be sure there is none.
 */
export function decimalLiteral(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const rounded = Number(value.toPrecision(12));
  if (Number.isInteger(rounded)) return String(rounded);
  const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
  const digits = Math.min(20, Math.max(1, 11 - magnitude));
  const text = rounded.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
  return text === "" || text === "-" ? "0" : text;
}

/**
 * Numeric binning: `FLOOR(CAST(c AS DECIMAL(31,4)) / w) * w`, aliased back to
 * the column name by the caller.
 *
 * ANSI, and one form for every vendor. The CAST is what makes it so: without
 * it, an integer column divided by an integer width is integer division on
 * Postgres, SQL Server and Db2 and floating division elsewhere, so the same
 * bin expression put rows in different bins per vendor. 31 is Db2's maximum
 * precision, so `DECIMAL(31,4)` is accepted everywhere. Negative values bin
 * correctly because FLOOR rounds towards minus infinity.
 */
export function numericBinExpr(
  column: string,
  width: number,
  dialect: SqlDialect,
  table?: TableRef | string,
): string {
  const c = aliasSafeColumnRef(column, table, dialect);
  const w = decimalLiteral(Number.isFinite(width) && width > 0 ? width : 1);
  return `FLOOR(CAST(${c} AS DECIMAL(31,4)) / ${w}) * ${w}`;
}

/**
 * Scan the visual query's filter list for bounds on `col`. Returns the
 * tightest `[min, max]` span expressed by any `>`/`>=`/`<`/`<=`/`between`
 * filter on the same column, or `null` if none apply. The SQL builder uses
 * this to recompute a tighter bin width when the user narrows the column
 * via a filter — bins follow the visible range, not the full table span.
 */
function filterBoundsForColumn(
  filters: VisualQuery["filters"],
  col: string,
): { min: number; max: number } | null {
  let min: number | undefined;
  let max: number | undefined;
  for (const f of filters) {
    if (f.column !== col) continue;
    const v = Number(f.value);
    const v2 = f.valueTo != null ? Number(f.valueTo) : NaN;
    const op = (f.operator || "").toLowerCase();
    // `>` / `>=` → raise min; `<` / `<=` → lower max; `between` → both.
    if ((op === ">" || op === ">=" || op === "gt" || op === "gte") && Number.isFinite(v)) {
      min = min == null ? v : Math.max(min, v);
    } else if ((op === "<" || op === "<=" || op === "lt" || op === "lte") && Number.isFinite(v)) {
      max = max == null ? v : Math.min(max, v);
    } else if ((op === "between" || op === "btw") && Number.isFinite(v) && Number.isFinite(v2)) {
      min = min == null ? v : Math.max(min, v);
      max = max == null ? v2 : Math.min(max, v2);
    } else if (op === "=" || op === "eq") {
      // Equality filter collapses the range — not useful for binning.
      if (Number.isFinite(v)) { min = v; max = v; }
    }
  }
  if (min == null || max == null || !(max > min)) return null;
  return { min, max };
}

export interface BuildSqlOptions {
  /** Optional connection type (from `dbserver.type`) to drive dialect choice.
   *  If omitted, defaults to SQLite — matches the bundled Northwind sample. */
  connectionType?: string | null;
  /** Names of columns whose values represent dates / timestamps.
   *  A comparison against one is made through `dateExpr`, so it is correct
   *  even where the column is stored as BIGINT epoch ms (sqlite-jdbc's default
   *  for LocalDateTime). Omit to disable per-column wrapping (safe no-op
   *  default that preserves pre-fix behavior for callers not yet passing this
   *  option). `columnKinds` implies this for a date or timestamp column. */
  temporalColumns?: ReadonlySet<string>;
  /** What a literal compared against each column looks like — `columnKindsOf`
   *  of the table's columns. A column that is not in the map is compared
   *  against a string literal, which is what every filter did before this
   *  option existed. */
  columnKinds?: ReadonlyMap<string, SqlLiteralKind>;
}

export function buildSql(query: VisualQuery, options: BuildSqlOptions = {}): string {
  // Cube-bound widgets do not generate SQL here — the cube renderer
  // (rb-cube-renderer) drives its own SQL via /api/cubes/{id}/generate-sql.
  if (query.kind === "cube") return "";
  if (!query.table) return "";

  const dialect: SqlDialect = dialectFor(options.connectionType);
  const hasAgg = query.summarize.length > 0;
  const timeBuckets = query.groupByBuckets ?? {};
  const numericBuckets = query.groupByNumericBuckets ?? {};
  const temporalColumns = options.temporalColumns;
  const columnKinds = options.columnKinds;
  const selectParts: string[] = [];

  const quote = (name: string) => quoteIdent(name, dialect);
  const tableRef: TableRef = asTableRef(query.table, query.tableSchema);

  /** The kind of literal a value compared against this column must take. A
   *  numeric column is only compared against a number when the value really is
   *  one: half-typed input must not throw, it must simply produce the string
   *  comparison it produced before. */
  const kindFor = (column: string, value: string): SqlLiteralKind => {
    const kind = columnKinds?.get(column);
    if (kind === "number") {
      const text = String(value ?? "").trim();
      return text !== "" && Number.isFinite(Number(text)) ? "number" : "string";
    }
    if (kind) return kind;
    return "string";
  };

  const lit = (column: string, value: string): string =>
    sqlLiteral(value, kindFor(column, value), dialect);

  /** True when a comparison on this column is a comparison of dates. */
  const isTemporal = (column: string): boolean => {
    if (temporalColumns?.has(column)) return true;
    const kind = columnKinds?.get(column);
    return kind === "date" || kind === "timestamp";
  };

  // Filter LHS for a temporal column: read through `dateExpr`, so the
  // comparison against a date literal (e.g. a user-picked '2024-01-01') is
  // correct even where the column is stored as BIGINT epoch ms — the typical
  // SQLite-JDBC mapping for java.time.LocalDateTime. Non-temporal columns are
  // never wrapped: decoding an integer id as an epoch would be nonsense.
  const filterLhs = (column: string): string =>
    isTemporal(column) ? dateExpr(column, dialect) : quote(column);

  const bucketedSelectExpr = (col: string): string | null => {
    const t = timeBuckets[col];
    if (t) return bucketExpr(col, t, dialect, tableRef);
    const n = numericBuckets[col];
    if (n) {
      // Filter-aware refinement: when the user's pick captured an intent
      // (numBins) AND there's a narrowing filter on the column, recompute
      // the bin width over the tighter range. Without a filter or intent
      // we fall back to the stored width.
      let width = n.width;
      if (typeof n.numBins === "number" && n.numBins > 0) {
        const bounds = filterBoundsForColumn(query.filters, col);
        if (bounds) {
          const refined = nicerBinWidth(bounds.min, bounds.max, n.numBins);
          if (Number.isFinite(refined) && refined > 0) width = refined;
        }
      }
      return numericBinExpr(col, width, dialect, tableRef);
    }
    return null;
  };

  const bucketSelect = (col: string): string => {
    const expr = bucketedSelectExpr(col);
    if (!expr) return quote(col);
    return `${expr} AS ${quote(col)}`;
  };

  const bucketGroupBy = (col: string): string => {
    const expr = bucketedSelectExpr(col);
    return expr ?? quote(col);
  };

  if (hasAgg) {
    for (const col of query.groupBy) {
      selectParts.push(bucketSelect(col));
    }
    for (const agg of query.summarize) {
      const fn = agg.aggregation.toUpperCase();
      const isCountStar = fn === "COUNT" && agg.field === "*";
      const aliasField = isCountStar ? "count" : agg.field + "_" + agg.aggregation.toLowerCase();
      selectParts.push(`${aggregateExpr(fn, agg.field, isCountStar, dialect)} AS ${quote(aliasField)}`);
    }
  }

  const select = selectParts.length > 0 ? selectParts.join(", ") : "*";
  let sql = `SELECT ${select}\nFROM ${quoteTableRef(tableRef, dialect)}`;

  // WHERE
  if (query.filters.length > 0) {
    const conditions = query.filters.map((f) => {
      // Comparison operators use the type-aware LHS (read as a date for a
      // temporal column); IS NULL / IS NOT NULL use the raw column ref because
      // NULL semantics are independent of value encoding.
      const cmp = filterLhs(f.column);
      const raw = quote(f.column);
      const param = isParamRef(f.value);
      switch (f.operator) {
        case "equals":          return param ? `${cmp} = ${f.value}`   : `${cmp} = ${lit(f.column, f.value)}`;
        case "not_equals":      return param ? `${cmp} != ${f.value}`  : `${cmp} != ${lit(f.column, f.value)}`;
        case "greater_than":    return param ? `${cmp} > ${f.value}`   : `${cmp} > ${lit(f.column, f.value)}`;
        case "greater_or_equal":return param ? `${cmp} >= ${f.value}`  : `${cmp} >= ${lit(f.column, f.value)}`;
        case "less_than":       return param ? `${cmp} < ${f.value}`   : `${cmp} < ${lit(f.column, f.value)}`;
        case "less_or_equal":   return param ? `${cmp} <= ${f.value}`  : `${cmp} <= ${lit(f.column, f.value)}`;
        // LIKE patterns are always string comparisons: the pattern is text
        // even when the column is not, so the value goes in as a string.
        case "contains":        return containsFilter(cmp, f.value ?? "", dialect);
        case "starts_with":     return `${cmp} LIKE ${sqlLiteral(`${f.value ?? ""}%`, "string", dialect)}`;
        case "ends_with":       return `${cmp} LIKE ${sqlLiteral(`%${f.value ?? ""}`, "string", dialect)}`;
        case "between":         return betweenCondition(cmp, f, dialect, isTemporal(f.column), lit);
        case "in":
        case "not_in": {
          const op = f.operator === "in" ? "IN" : "NOT IN";
          const rawList = String(f.value ?? "").trim();
          if (!rawList) return "1=1"; // empty list — harmless no-op, avoids broken WHERE
          if (isParamRef(rawList)) {
            // Param-bound IN: emit bare ${name} inside parens. Backend
            // convertToJdbiParameters detects this and rewrites to <name>;
            // QueriesService splits the CSV value into a List for bindList.
            return `${cmp} ${op} (${rawList})`;
          }
          const values = rawList.split(",").map((v) => v.trim()).filter(Boolean);
          if (values.length === 0) return "1=1";
          const escaped = values.map((v) => lit(f.column, v)).join(", ");
          return `${cmp} ${op} (${escaped})`;
        }
        case "is_null":         return `${raw} IS NULL`;
        case "is_not_null":     return `${raw} IS NOT NULL`;
        default:                return param ? `${cmp} = ${f.value}`   : `${cmp} = ${lit(f.column, f.value)}`;
      }
    });
    sql += `\nWHERE ${conditions.join("\n  AND ")}`;
  }

  // GROUP BY (using the bucket / bin expressions when applicable)
  if (hasAgg && query.groupBy.length > 0) {
    sql += `\nGROUP BY ${query.groupBy.map(bucketGroupBy).join(", ")}`;
  }

  // ORDER BY
  if (query.sort.length > 0) {
    const parts = query.sort.map((s) => `${quote(s.column)} ${s.direction}`);
    sql += `\nORDER BY ${parts.join(", ")}`;
  }

  // Row limit — the clause has no one ANSI spelling, so the layer writes it.
  if (query.limit > 0) {
    sql = limitClause(sql, query.limit, dialect);
  }

  // [SQL-TRACE] diagnostic — leave commented; uncomment to debug what
  // SQL the visual-query builder emits (table / groupBy / summarize / hasAgg).
  // console.log(
  //   '[SQL-TRACE buildSql] table=' + (query.table ?? '?') +
  //   ' groupBy=' + JSON.stringify(query.groupBy ?? []) +
  //   ' summarize=' + JSON.stringify((query.summarize ?? []).map(a => a.aggregation + '(' + a.field + ')')) +
  //   ' kind=' + (query.kind ?? '?') +
  //   ' hasAgg=' + hasAgg +
  //   ' SQL=<<<' + sql.replace(/\n/g, ' ') + '>>>',
  // );
  return sql;
}

/**
 * One aggregate, in the ANSI form that gives the same answer on every vendor.
 *
 * SUM and AVG are cast to `DECIMAL(31,4)`: `AVG` of an integer column is
 * integer division on SQL Server and Db2 (10 instead of 10.7254), and a
 * `ROUND(…, 4)` of a Postgres `double precision` is rejected outright, so the
 * cast is both the fix and the rounding. The inner cast on AVG is what makes
 * the average itself exact rather than rounding a truncated result. 31 is Db2's
 * maximum precision, so the form is portable.
 *
 * MIN, MAX and COUNT are never wrapped: a cast would break MIN/MAX of a date
 * or of text, and a COUNT is already an exact integer. That is why `ROUND(…, 4)`
 * around everything had to go: it rounded a date.
 */
function aggregateExpr(fn: string, field: string, isCountStar: boolean, dialect: SqlDialect): string {
  if (isCountStar) return "COUNT(*)";
  const c = quoteIdent(field, dialect);
  switch (fn) {
    case "COUNT DISTINCT":
    case "COUNT_DISTINCT":
      return `COUNT(DISTINCT ${c})`;
    case "SUM":
      return `CAST(SUM(${c}) AS DECIMAL(31,4))`;
    case "AVG":
      return `CAST(AVG(CAST(${c} AS DECIMAL(31,4))) AS DECIMAL(31,4))`;
    default:
      return `${fn}(${c})`;
  }
}

/**
 * A range filter.
 *
 * For a date range this is the half-open ANSI range `>= from AND < to+1 day`,
 * not `BETWEEN from AND to`: a timestamp column holds a time part, so
 * `BETWEEN '2026-01-01' AND '2026-01-31'` silently drops every row on the last
 * day except the one at midnight. For anything else `BETWEEN` is exactly
 * right, and both bounds go through the column's own literal kind.
 */
function betweenCondition(
  cmp: string,
  filter: { column: string; value: string; valueTo?: string },
  dialect: SqlDialect,
  temporal: boolean,
  lit: (column: string, value: string) => string,
): string {
  const from = filter.value;
  const to = filter.valueTo || "";
  if (temporal) {
    const end = nextDay(to);
    if (end) {
      const kind: SqlLiteralKind = "date";
      return `${cmp} >= ${sqlLiteral(from, kind, dialect)} AND ${cmp} < ${sqlLiteral(end, kind, dialect)}`;
    }
  }
  return `${cmp} BETWEEN ${lit(filter.column, from)} AND ${lit(filter.column, to)}`;
}

/**
 * The distinct values of one column, for the filter pane's value list.
 *
 * A pure function of the table, the field, the row cap and the vendor, so the
 * pane runs exactly the SQL the tests read: ANSI everywhere, with the row cap
 * written by `limitClause` (a `LIMIT` here was rejected by SQL Server, Oracle
 * and Db2 — the pane's list came back empty on all three).
 */
export function buildDistinctValuesSql(
  table: TableRef | string,
  field: string,
  rowLimit: number,
  dialect: SqlDialect,
): string {
  const col = quoteIdent(field, dialect);
  const sql = `SELECT DISTINCT ${col} FROM ${quoteTableRef(asTableRef(table), dialect)}`
    + `\nWHERE ${col} IS NOT NULL\nORDER BY ${col}`;
  return limitClause(sql, rowLimit, dialect);
}

/** Resolve the dataSource's raw SQL text — visual-mode buildSql result falling
 *  through to generatedSql for cube queries, direct sql for sql/ai-sql mode,
 *  and generatedSql as last resort. `${paramName}` placeholders are preserved
 *  verbatim; the backend resolves them via JDBI named-parameter binding
 *  (QueriesService → DatabaseHelper.convertToJdbiParameters).
 *
 *  Shared by useWidgetData (widget render / store write) and ConfigPanel's
 *  manual "Detect columns from query" path — one source of truth for
 *  dataSource → raw SQL. */
export function sqlForDataSource(
  ds: DataSource,
  connectionType: string | null,
  temporalColumns?: ReadonlySet<string>,
  columnKinds?: ReadonlyMap<string, SqlLiteralKind>,
): string | null {
  if (ds.mode === "visual" && ds.visualQuery) {
    const built = buildSql(ds.visualQuery, { connectionType, temporalColumns, columnKinds });
    if (built) return built;
    // buildSql returns "" for cube queries — fall through.
  }
  if ((ds.mode === "sql" || ds.mode === "ai-sql") && ds.sql) {
    return ds.sql;
  }
  return ds.generatedSql || null;
}

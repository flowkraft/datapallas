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
// A relative date filter ("this month", "in the last 30 days") is two computed
// days, not a `CURRENT_DATE` expression: the arithmetic is done in TypeScript
// (`relative-dates.ts`) from today's date, and what this file writes is the same
// half-open range a `between` on a date column writes. `CURRENT_DATE` with an
// interval has no one form on nine vendors, and a computed range is a range a
// test can pin.
//
// A computed column is one arithmetic step over two operands (`computed`), and
// it is a name the rest of the query uses exactly like a column: one resolver
// (`refFor`) turns a name into SQL everywhere a column becomes SQL, so a filter,
// an aggregate, a sort key or a GROUP BY on a computed name writes the
// arithmetic. The operands are a column or a number and nothing else, so no text
// the user typed can reach the SQL as SQL (`computed-columns.ts`).
//
// Two expressions replace a grouped column: a time bucket (`groupByBuckets`),
// which has no ANSI form and therefore comes from the layer, and a numeric bin
// (`groupByNumericBuckets`), which is ANSI and lives here. Both are aliased to
// the original column name so downstream code sees the same identifier.

import type { DataSource, VisualQuery } from "@/lib/stores/canvas-store";
import {
  aliasSafeColumnRef,
  bucketExpr,
  dateExpr,
  decimalDivision,
  dialectFor,
  likeFilter,
  limitClause,
  quoteIdent,
  quoteTableRef,
  sqlLiteral,
  type SqlDialect,
  type SqlLiteralKind,
  type TableRef,
} from "./sql-dialects";
import { matchesAnyFilter, valueBoxIsEmpty } from "./filter-operators";
import { isDayParam, nextDayRef } from "./date-parameters";
import { isRelativeDateOp, relativeDayRange, todayIso } from "./relative-dates";
import { asTableRef } from "./table-ref";
import { nicerBinWidth } from "./smart-defaults";
import { computedColumnsOf, isNumberOperand, type ComputedColumn } from "./computed-columns";
import { isCompleteCondition, type AggregateCondition } from "./aggregations";
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

/** What binding a name writes into a filter's value: the reference itself. */
export function paramRefOf(name: string): string {
  return "${" + name + "}";
}

/** One name the bind chip offers. */
export interface BindableParam {
  /** The name, as it is written into the value: `country`, `dp_user_email`. */
  id: string;
  /** True for a `dp_` variable: the server sets it, the person looking is not asked. */
  fromServer: boolean;
}

/**
 * The names a filter can be bound to: the dashboard's own parameters first, and after them the
 * builtin `dp_` variables the server said it sets for this caller (R9).
 *
 * The builtins are never a list written here. They are the names
 * `/api/user-variables` answered with (`fetchBuiltinParamNames`), which is the same
 * `UserVariables` the server binds them from - one place, so a variable added there is offered
 * here without anybody remembering to add it twice. A name the dashboard declares wins: nothing
 * may be offered twice, and a dashboard may not declare a `dp_` name anyway (the server refuses
 * it on save).
 */
export function bindableParams(
  declared: string[] | null | undefined,
  fromServer: string[] | null | undefined,
): BindableParam[] {
  const offered: BindableParam[] = [];
  const seen = new Set<string>();
  for (const id of declared ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    offered.push({ id, fromServer: false });
  }
  for (const id of fromServer ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    offered.push({ id, fromServer: true });
  }
  return offered;
}

/**
 * The declared type of each parameter, from the same canonical
 * `parametersConfig.parameters` Map the ids come from. It travels with the values
 * to the backend, which binds each one as that type instead of as the text an HTML
 * control wrote - a date as a date, a number as a number.
 */
export function extractParamTypes(
  parameters: { id?: string; type?: string }[] | null | undefined,
): Record<string, string> {
  const types: Record<string, string> = {};
  if (!parameters) return types;
  for (const p of parameters) {
    if (typeof p.id === "string" && p.id.length > 0 && typeof p.type === "string" && p.type.length > 0) {
      types[p.id] = p.type;
    }
  }
  return types;
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
  /** The declared type of each dashboard parameter (`extractParamTypes` of
   *  `parametersConfig.parameters`). It decides one thing here: whether a
   *  filter bound to a parameter is bound to a *Date*, and therefore means a
   *  whole day (`date-parameters.ts`). Omit it and a bound filter keeps the
   *  form it had, which is the instant the parameter names. */
  paramTypes?: Record<string, string>;
  /** The day a relative date filter counts back from, as `yyyy-mm-dd`. The
   *  browser's own date when omitted; the tests and the committed case SQL pin
   *  it, so their ranges stay true tomorrow. */
  today?: string;
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
  const today = options.today ?? todayIso();
  const paramTypes = options.paramTypes;
  const selectParts: string[] = [];

  const quote = (name: string) => quoteIdent(name, dialect);
  const tableRef: TableRef = asTableRef(query.table, query.tableSchema);

  // The computed columns this query really has - the finished ones. An
  // unfinished one (no name yet, an empty operand box) is left out entirely,
  // the way a filter with an empty value box is.
  const computedColumns = computedColumnsOf(query.computed);
  const computed = new Map(computedColumns.map((one) => [one.name, one]));

  /** How a column name becomes SQL. The name of a computed column stands for its
   *  arithmetic, so Filter, Summarize, Sort and GROUP BY write the expression;
   *  every other name is the quoted column it has always been. */
  const refFor = (column: string): string => {
    const one = computed.get(column);
    return one ? computedExpr(one, dialect) : quote(column);
  };

  /** The kind of literal a value compared against this column must take. A
   *  numeric column is only compared against a number when the value really is
   *  one: half-typed input must not throw, it must simply produce the string
   *  comparison it produced before. */
  const kindFor = (column: string, value: string): SqlLiteralKind => {
    // A computed column is arithmetic over numbers, so it is compared against a
    // number - nothing reported it, because no database has it as a column.
    const kind = computed.has(column) ? "number" : columnKinds?.get(column);
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
    if (computed.has(column)) return false;
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
    isTemporal(column) ? dateExpr(column, dialect) : refFor(column);

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
    // A computed column is an expression too, and it is aliased back to its own
    // name for the same reason a bucket is: everything downstream reads the name.
    const expr = bucketedSelectExpr(col) ?? (computed.has(col) ? refFor(col) : null);
    if (!expr) return quote(col);
    return `${expr} AS ${quote(col)}`;
  };

  const bucketGroupBy = (col: string): string => {
    const expr = bucketedSelectExpr(col);
    return expr ?? refFor(col);
  };

  // Grouping with nothing to summarize is a question in its own right: "which
  // combinations are there?" - the distinct stages, the countries a customer
  // list holds. The grouped columns are the whole answer, and the rows are made
  // distinct by SELECT DISTINCT rather than by a GROUP BY with no aggregate:
  // the two answer the same rows, and DISTINCT is what the question says.
  const distinctOnly = !hasAgg && query.groupBy.length > 0;

  /** The name one aggregate is written under in this query. */
  const aliasOf = (agg: SummarizeEntry): string =>
    aggregateAlias(agg, runsAsRunningTotal(query, agg));

  if (hasAgg || distinctOnly) {
    for (const col of query.groupBy) {
      selectParts.push(bucketSelect(col));
    }
  }
  /** The order a running total accumulates in, as the window's ORDER BY reads
   *  it: the grouped time bucket, NULLs last - written as `MIN(<column>)` and
   *  not as the bucket expression itself.
   *
   *  A window's ORDER BY is read under the same rule as the query's own: MySQL
   *  refuses an expression that WRAPS the grouped expression rather than being
   *  it, and the NULLs-last CASE is exactly such a wrapper ("Expression #1 of
   *  PARTITION BY or ORDER BY clause of window '<unnamed window>' is not in
   *  GROUP BY clause", measured at G2a). An AGGREGATE is allowed there on all
   *  nine, and the earliest date in a bucket orders the buckets the same way
   *  the bucket does: a running total only exists over a day, week, month or
   *  year bucket (`runsAsRunningTotal`), and truncating a date never reorders
   *  two dates. A bucket of NULL dates has MIN NULL, so it still lands last -
   *  a series with no date belongs at the end of it (T6). */
  const runningOrder = (): string => {
    const earliest = `MIN(${refFor(query.groupBy[0])})`;
    return `CASE WHEN ${earliest} IS NULL THEN 1 ELSE 0 END, ${earliest}`;
  };

  /** What the SELECT writes for one aggregate: the number itself, the share it
   *  holds of the whole result, or the total accumulated up to this bucket. */
  const aggregateSelect = (agg: SummarizeEntry): string => {
    const expr = aggregateExprOf(agg, dialect, refFor);
    if (runsAsRunningTotal(query, agg)) return runningTotalExpr(expr, runningOrder());
    return agg.share ? percentOfTotalExpr(expr) : expr;
  };

  if (hasAgg) {
    for (const agg of query.summarize) {
      selectParts.push(`${aggregateSelect(agg)} AS ${quote(aliasOf(agg))}`);
    }
  }

  // Without Summarize the query answers with rows, so a computed column is one
  // more select item beside the table's own columns. `t.*` and not `*`: Oracle
  // rejects an unqualified `*` standing next to another select item.
  if (!hasAgg && !distinctOnly && computedColumns.length > 0) {
    selectParts.push(`${quoteTableRef(tableRef, dialect)}.*`);
    for (const one of computedColumns) {
      selectParts.push(`${computedExpr(one, dialect)} AS ${quote(one.name)}`);
    }
  }

  /** The aggregate a sort key names, by the alias it is written under in the
   *  SELECT, or null when the sort key is not an aggregate. */
  const aggregateSortedOn = (column: string): SummarizeEntry | null =>
    (hasAgg ? query.summarize.find((agg) => aliasOf(agg) === column) : undefined) ?? null;

  /** The expression a sort key stands for: the aggregate, the column's bucket or
   *  bin expression, or the column itself - what the SELECT writes, never the
   *  alias, so the expression can also go inside the null-ordering CASE. */
  const sortExpr = (column: string): string => {
    const agg = aggregateSortedOn(column);
    // A share sorts by the aggregate underneath it: the total is one number for
    // the whole result, so the two orders are the same one, and no window
    // function has to go into the ORDER BY (nor into the HAVING, where no
    // vendor allows one). A running total sorts by the same aggregate for the
    // second reason alone - a cumulative series is read in the order it
    // accumulates in, which is its time bucket, and that is the sort key a
    // cumulative line carries.
    return agg ? aggregateExprOf(agg, dialect, refFor) : bucketGroupBy(column);
  };

  /** True when the sort key is a COUNT, which is never NULL. */
  const sortsOnACount = (column: string): boolean => {
    const agg = aggregateSortedOn(column);
    return agg !== null && agg.aggregation.toUpperCase().startsWith("COUNT");
  };

  /** True when this sort key is one an aggregated query may carry at all.
   *
   *  A grouped query can only sort by what it selects: one of the grouped
   *  columns (by its own name, whatever expression stands behind it) or one of
   *  the aggregates (by its alias). A key naming any other column is SQL the
   *  strict databases refuse outright - MySQL and MariaDB under
   *  `ONLY_FULL_GROUP_BY`, and PostgreSQL, Oracle and Db2 always - so the whole
   *  query answered with an error instead of rows. Dropping just that key lets
   *  the rest of it run. The Sort step no longer offers such a column
   *  (`sortableColumns`), so what this catches is a canvas saved before it
   *  stopped offering them, or one whose Summarize step was added afterwards.
   */
  const sortKeyIsWritable = (column: string): boolean =>
    (!hasAgg && !distinctOnly) || aggregateSortedOn(column) !== null
    || query.groupBy.includes(column);

  const select = selectParts.length > 0 ? selectParts.join(", ") : "*";
  // DISTINCT stands right after SELECT, which is also where SQL Server's TOP
  // goes - `limitClause` writes it after the DISTINCT, never before it.
  let sql = `SELECT ${distinctOnly ? "DISTINCT " : ""}${select}`
    + `\nFROM ${quoteTableRef(tableRef, dialect)}`;

  // WHERE
  //
  // The conditions are joined with AND, or with OR inside one pair of brackets
  // when the query matches any filter rather than all of them (F3). The
  // brackets are what make the set one condition: without them a later clause
  // would bind tighter than the OR.
  const matchAny = matchesAnyFilter(query.filterMatch);
  // A filter that is not applied - a half-typed value box, an empty IN list -
  // is left out of the WHERE. `1=1` is the harmless filler for a set joined
  // with AND and the exact opposite for one joined with OR, where it would
  // answer every row of the table, so matching any leaves the filter out
  // instead.
  const notApplied: string | null = matchAny ? null : "1=1";
  if (query.filters.length > 0) {
    const conditions = query.filters.map((f): string | null => {
      // An empty value box means the filter is not applied (the owner,
      // 2026-09-27; the rule itself is `valueBoxIsEmpty`, next to the operator
      // lists). The filter is left out of the WHERE, so the query answers with
      // every row while the user is still typing. `in` / `not in` keep the
      // `1=1` they have always written: the same outcome, and their SQL text
      // does not change.
      if (valueBoxIsEmpty(f)) {
        return f.operator === "in" || f.operator === "not_in" ? notApplied : null;
      }
      // Comparison operators use the type-aware LHS (read as a date for a
      // temporal column); IS NULL / IS NOT NULL use the raw column ref because
      // NULL semantics are independent of value encoding.
      const cmp = filterLhs(f.column);
      const raw = quote(f.column);
      const param = isParamRef(f.value);
      // A date filter on a temporal column means the whole day, not the instant
      // at midnight: `created_at = '2026-01-31'` used to answer nothing at all
      // for a row stamped 2026-01-31 14:05, and `<= '2026-01-31'` left that row
      // out as well. The six comparisons become half-open ranges over the day
      // (`wholeDayCondition`, below). A value that is not a plain `yyyy-mm-dd`
      // keeps the form it had. A value bound to a dashboard parameter is not a
      // date when the SQL is built, so `nextDay` refuses it; a parameter the
      // dashboard declared as a *Date* is nevertheless a whole day, and
      // `dayParamCondition` writes that day's range through a derived
      // parameter. A parameter of any other declared type, and `equals` /
      // `not equals` on a Date one, go on meaning the instant the parameter
      // names, i.e. midnight on a timestamp column.
      // A relative date filter names a span of whole days that today's date
      // decides - "this month", "in the last 3 months" - so it is asked as that
      // span and nothing else: a null here (a "last N" whose value box holds no
      // usable count) leaves the filter out, the way a half-typed value does,
      // instead of falling through to the comparisons below and asking whether
      // the column equals the count.
      if (isRelativeDateOp(f.operator)) {
        return relativeDateCondition(cmp, f.operator, f.value, today, dialect);
      }
      if (isTemporal(f.column)) {
        // A dashboard's Date parameter names a whole day as well, and the day
        // after it is a date: not an expression this file may write (nine
        // vendors, nine texts for `+ 1 day`) and not a value the browser has
        // (the filter bar fills the parameter in later, long after this SQL
        // was built). So the bound is a second parameter, `${to__next_day}`,
        // whose value the backend derives where it binds the first one - one
        // conversion for the canvas and the published dashboard alike
        // (`date-parameters.ts` names it).
        const bound = dayParamCondition(cmp, f.operator, f.value, paramTypes);
        if (bound) return bound;
        const wholeDay = wholeDayCondition(cmp, f.operator, f.value, dialect);
        if (wholeDay) return wholeDay;
      }
      switch (f.operator) {
        case "equals":          return param ? `${cmp} = ${f.value}`   : `${cmp} = ${lit(f.column, f.value)}`;
        // `<>` is the ANSI not-equal. `!=` is accepted by every vendor this
        // product supports, but it is not standard SQL, and the UI's label
        // (which still reads `!=`) is not the SQL.
        case "not_equals":      return param ? `${cmp} <> ${f.value}`  : `${cmp} <> ${lit(f.column, f.value)}`;
        case "greater_than":    return param ? `${cmp} > ${f.value}`   : `${cmp} > ${lit(f.column, f.value)}`;
        case "greater_or_equal":return param ? `${cmp} >= ${f.value}`  : `${cmp} >= ${lit(f.column, f.value)}`;
        case "less_than":       return param ? `${cmp} < ${f.value}`   : `${cmp} < ${lit(f.column, f.value)}`;
        case "less_or_equal":   return param ? `${cmp} <= ${f.value}`  : `${cmp} <= ${lit(f.column, f.value)}`;
        // LIKE patterns are always string comparisons: the pattern is text
        // even when the column is not, so the value goes in as a string.
        case "contains":        return likeFilter(cmp, f.value ?? "", "contains", dialect);
        // All three go through the same vendor-layer predicate: the wildcards in
        // the value are escaped and both sides are folded to lower case, so the
        // three filters differ only in where the `%` sits.
        case "starts_with":     return likeFilter(cmp, f.value ?? "", "starts", dialect);
        case "ends_with":       return likeFilter(cmp, f.value ?? "", "ends", dialect);
        case "between":         return betweenCondition(cmp, f, dialect, isTemporal(f.column), lit, paramTypes);
        case "in":
        case "not_in": {
          const op = f.operator === "in" ? "IN" : "NOT IN";
          const rawList = String(f.value ?? "").trim();
          if (!rawList) return notApplied; // empty list — the filter is simply not applied
          if (isParamRef(rawList)) {
            // Param-bound IN: emit bare ${name} inside parens. Backend
            // convertToJdbiParameters detects this and rewrites to <name>;
            // QueriesService splits the CSV value into a List for bindList.
            return `${cmp} ${op} (${rawList})`;
          }
          const values = rawList.split(",").map((v) => v.trim()).filter(Boolean);
          if (values.length === 0) return notApplied;
          const escaped = values.map((v) => lit(f.column, v)).join(", ");
          return `${cmp} ${op} (${escaped})`;
        }
        case "is_null":         return `${raw} IS NULL`;
        case "is_not_null":     return `${raw} IS NOT NULL`;
        default:                return param ? `${cmp} = ${f.value}`   : `${cmp} = ${lit(f.column, f.value)}`;
      }
    }).filter((condition): condition is string => condition !== null);
    // Every filter left out (all of them half-typed) means no WHERE at all.
    if (conditions.length > 0) {
      sql += matchAny && conditions.length > 1
        ? `\nWHERE (${conditions.join("\n  OR ")})`
        : `\nWHERE ${conditions.join("\n  AND ")}`;
    }
  }

  // GROUP BY (using the bucket / bin expressions when applicable)
  if (hasAgg && query.groupBy.length > 0) {
    sql += `\nGROUP BY ${query.groupBy.map(bucketGroupBy).join(", ")}`;
  }

  // HAVING - a condition on an aggregate.
  //
  // A WHERE reads one row, so it cannot say "the stages of more than 150 deals":
  // the count exists only once the rows are grouped, and the clause that keeps a
  // group by what it aggregates is HAVING. It holds the aggregate EXPRESSION and
  // never its output alias - PostgreSQL, SQL Server, Oracle and Db2 reject an
  // alias there - which is the same expression the SELECT writes, so the two
  // always agree, computed columns included.
  //
  // The value is a number and the comparison is one of five (`aggregations.ts`),
  // so a condition is a decimal literal beside an operator: nothing the user
  // typed reaches the SQL as SQL. An unfinished one is left out, the way an
  // empty filter value box is, and a query with none writes no HAVING at all.
  if (hasAgg) {
    const kept = query.summarize
      .filter((agg) => isCompleteCondition(agg.having))
      .map((agg) => `${aggregateExprOf(agg, dialect, refFor)} ${agg.having!.operator}`
        + ` ${decimalLiteral(Number(agg.having!.value))}`);
    if (kept.length > 0) {
      sql += `\nHAVING ${kept.join("\n  AND ")}`;
    }
  }

  // ORDER BY - NULLs last, ascending and descending alike.
  //
  // Where a NULL sorts is left to the vendor by the standard, and the nine
  // disagree: MySQL, MariaDB, SQL Server and SQLite put NULLs first ascending,
  // PostgreSQL, Oracle, Db2, DuckDB and ClickHouse put them last, and each
  // flips the other way descending. So the same "top 3 closing deals" showed
  // three rows with no close date on half the connections. ANSI's `NULLS LAST`
  // is not an option: MySQL, MariaDB, SQL Server and SQLite reject it. The
  // portable form is one extra sort key, standard SQL on all nine: 1 for a
  // NULL, 0 for a value, so the values come first whichever way the real key
  // runs.
  //
  // The CASE holds the EXPRESSION the SELECT uses for that column - the column,
  // its bucket or bin expression, or the aggregate - and never the output alias:
  // PostgreSQL accepts a bare alias as a sort key but rejects one inside an
  // ORDER BY expression, so `CASE WHEN "amount_max" IS NULL …` would not run.
  // A COUNT gets no CASE: it is never NULL.
  const sortKeys = query.sort.filter((s) => sortKeyIsWritable(s.column));

  // A distinct query that sorts sorts OUTSIDE itself, as a derived table.
  //
  // The CASE above is an expression the SELECT list does not hold, and for a
  // SELECT DISTINCT that is an error and not a preference: PostgreSQL, Oracle,
  // Db2 and SQL Server all refuse an ORDER BY expression a distinct query does
  // not select ("ORDER BY expressions must appear in select list"). Making the
  // distinct rows a derived table and sorting the result is standard SQL on all
  // nine, so the one text stays one text and NULLs stay where every other query
  // in the product puts them - last. Outside, a grouped column is its own name:
  // the bucket expression already ran inside. The alias carries no `AS`: Oracle
  // rejects `AS` before a table alias.
  //
  // A GROUPED query that sorts on a bucket sorts outside itself for the same
  // kind of reason, found the same way - by asking all nine (G2a, 2026-09-27).
  // The SELECT writes the bucket expression under the COLUMN'S OWN name, so the
  // ORDER BY has no spelling that works everywhere: the expression is refused
  // by MySQL, which reads an expression wrapping the grouped one as a
  // nonaggregated column ("Expression #1 of ORDER BY clause ... is not in GROUP
  // BY clause", `ONLY_FULL_GROUP_BY`) and by Oracle and Db2, which resolve the
  // column name inside it to the STRING the SELECT aliased (ORA-01722 invalid
  // number, SQLCODE -180); and the output alias is refused inside an ORDER BY
  // expression by PostgreSQL, DuckDB and SQL Server. Outside, there is no
  // expression and no alias - only a column of the derived table, which every
  // one of the nine sorts, NULLs-last CASE and row limit included.
  const sortsOnABucket = (column: string): boolean =>
    (hasAgg || distinctOnly) && aggregateSortedOn(column) === null
    && (bucketedSelectExpr(column) !== null || computed.has(column));
  const sortsOutside = sortKeys.length > 0
    && (distinctOnly || sortKeys.some((s) => sortsOnABucket(s.column)));
  if (sortsOutside) {
    const inner = sql.split("\n").map((line) => `  ${line}`).join("\n");
    sql = `SELECT *\nFROM (\n${inner}\n) ${distinctOnly ? "distinct_rows" : "grouped_rows"}`;
  }

  if (sortKeys.length > 0) {
    const parts = sortKeys.map((s) => {
      const expr = sortsOutside ? quote(s.column) : sortExpr(s.column);
      const nullsLast = sortsOnACount(s.column) ? "" : `CASE WHEN ${expr} IS NULL THEN 1 ELSE 0 END, `;
      return `${nullsLast}${expr} ${s.direction}`;
    });
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

/** One entry of the Summarize step: what to compute, over which column. */
type SummarizeEntry = {
  aggregation: string; field: string; having?: AggregateCondition; share?: boolean;
  runningTotal?: boolean;
};

/**
 * One aggregate read as the share it holds of the whole result (F9).
 *
 * `100.0 * SUM(x) / NULLIF(SUM(SUM(x)) OVER (), 0)`: the inner aggregate is the
 * group's own number, and `SUM(<aggregate>) OVER ()` is the total of that same
 * number over every group the query answers - a window, because no single
 * grouped row holds the total. The shares of a result therefore add up to 100.
 *
 * ANSI on all nine, and the same text on all nine: `OVER ()` is standard SQL
 * (MySQL 8.0, MariaDB 10.2 and SQLite 3.25 and later, which is what AI Hub
 * supports). `100.0` carries its decimal point so the division is fractional
 * even where both sides would otherwise be integers, and `NULLIF` answers NULL
 * instead of an error when the total is zero - an empty result, or a SUM of
 * nothing but zeroes.
 *
 * The numerator is cast to `DECIMAL(20,4)` before the factor is applied. A SUM
 * already carries a `DECIMAL(31,4)` cast - 31 is Db2's maximum precision - and
 * multiplying THAT by `100.0` asks for more digits than a decimal may hold, for
 * which Db2 pays in scale: it answered 43.0 for a share every other database
 * answered as 43.0172783 (G2a, 2026-09-27). Narrowing the numerator leaves
 * eleven digits of headroom for the factor, and eleven is more than `100.0`
 * needs. Narrowing the numerator ALONE is enough - the total under the NULLIF
 * keeps its own precision - and the narrowed cast is one text on all nine,
 * SQLite included, where it answered the same 43.0172783 as everywhere else
 * (measured on all nine, G2a). It is the same DECIMAL the aggregates
 * themselves are cast to, so no vendor form is added anywhere.
 */
export function percentOfTotalExpr(aggregate: string): string {
  return `(100.0 * CAST(${aggregate} AS DECIMAL(20,4))`
    + ` / NULLIF(SUM(${aggregate}) OVER (), 0))`;
}

/**
 * One aggregate accumulated from the first bucket up to this one (F10).
 *
 * `SUM(<aggregate>) OVER (ORDER BY <bucket> ROWS UNBOUNDED PRECEDING)`: the
 * frame starts at the first row the query answers and ends at this one, so a
 * monthly SUM becomes the money of the year so far and a monthly COUNT becomes
 * the deals so far. It is a SUM whatever the aggregate underneath is, because
 * accumulating means adding the buckets up.
 *
 * The window's own ORDER BY is what "so far" means, so it is the order time
 * runs, with the NULLs-last CASE every sort in this file carries: a row with no
 * date belongs at the end of a series, not at the start of it (T6). It is
 * written as `MIN(<column>)` and not as the bucket expression, because a
 * window's ORDER BY is read under the same rule as the query's own and MySQL
 * refuses an expression that wraps the grouped one there; the earliest date in
 * a bucket orders the buckets the same way the bucket does (`runningOrder`).
 * `ROWS UNBOUNDED PRECEDING` is written out rather than left to the default
 * frame (`RANGE`), which would add every row sharing the bucket's value in one
 * step - the same rows here, but only because the buckets are already distinct.
 *
 * ANSI on all nine, and the same text on all nine, under the same minimum
 * versions as the share: MySQL 8.0, MariaDB 10.2 and SQLite 3.25.
 */
export function runningTotalExpr(aggregate: string, bucketOrder: string): string {
  return `SUM(${aggregate}) OVER (ORDER BY ${bucketOrder} ROWS UNBOUNDED PRECEDING)`;
}

/**
 * Whether one Summarize entry is written as a running total, for one query.
 *
 * Accumulating asks for an order to accumulate in, and the order a cumulative
 * line is read in is time: the option only stands when the query groups by ONE
 * time-bucketed column - a day, week, month or year. Grouped by two columns, or
 * by a plain text column, there is no one series to add up, and a window
 * ordered by an arbitrary column would answer a different number every time the
 * database chose a different row order. Only a SUM or a COUNT accumulates: the
 * running total of an average or of a MIN is not a number anyone asked for.
 *
 * One rule, read in both places that care - the SELECT, which writes the
 * expression and its `_running` alias, and the Sort step, which offers that
 * alias - so a canvas that carries the flag without a time bucket (built before
 * the step stopped offering it, or regrouped afterwards) simply answers the
 * plain aggregate, under the plain name.
 */
export function runsAsRunningTotal(query: VisualQuery, agg: SummarizeEntry): boolean {
  if (agg.runningTotal !== true) return false;
  const fn = agg.aggregation.toUpperCase();
  if (fn !== "SUM" && !fn.startsWith("COUNT")) return false;
  if (query.groupBy.length !== 1) return false;
  return Boolean((query.groupByBuckets ?? {})[query.groupBy[0]]);
}

/**
 * The alias an aggregate is written under in the SELECT - `count` for a
 * COUNT(*), `<field>_<fn>` for every other one - which is also the name a sort
 * key uses to ask for it.
 */
function aggregateAlias(agg: SummarizeEntry, running = false): string {
  const fn = agg.aggregation.toUpperCase();
  const plain = fn === "COUNT" && agg.field === "*"
    ? "count" : `${agg.field}_${agg.aggregation.toLowerCase()}`;
  // A share and a running total are each a different number under a different
  // name, so the chart legend, the column header and a sort key all say which
  // of them they mean. A running total is the money so far and not a share of
  // anything, so it never carries both endings.
  if (running) return `${plain}_running`;
  return agg.share ? `${plain}_pct` : plain;
}

/**
 * What the Sort step may offer, for one query.
 *
 * Without Summarize, every column of the table, as it always was. With
 * Summarize, only what the SELECT writes: the grouped columns, then the
 * aggregates under the aliases they are written with (`count`, `amount_sum`,
 * ...), which are the names a sort key uses to ask for them. Sorting a grouped
 * query by any other column is SQL no strict database runs, so offering it only
 * let the user build a query that could not answer (`sortKeyIsWritable`, which
 * drops such a key from SQL built out of an older canvas).
 *
 * An aggregate is described as numeric because that is what it is; a COUNT is
 * never NULL, which the null-ordering CASE also knows.
 */
export function sortableColumns(query: VisualQuery, columns: ColumnSchema[]): ColumnSchema[] {
  // A query that only groups (SELECT DISTINCT) can sort by the grouped columns
  // and by nothing else: a sort key the SELECT does not write is an error on
  // PostgreSQL, Oracle and Db2, which is the same rule an aggregated query
  // follows - there are simply no aggregates to add to the list.
  if (query.summarize.length === 0 && query.groupBy.length === 0) return columns;
  const byName = new Map(columns.map((c) => [c.columnName, c]));
  const grouped = query.groupBy.map(
    (col) => byName.get(col) ?? { columnName: col, typeName: "text", isNullable: true },
  );
  const aggregates = query.summarize.map((agg) => ({
    columnName: aggregateAlias(agg, runsAsRunningTotal(query, agg)),
    typeName: "numeric",
    isNullable: agg.aggregation.toUpperCase().startsWith("COUNT") ? false : true,
  }));
  return [...grouped, ...aggregates];
}

/** The SQL expression of one aggregate, from the entry the user built.
 *
 *  The field becomes SQL through the caller's resolver, so an aggregate over a
 *  computed column sums the arithmetic - `refFor` is the one place that knows
 *  the difference between a column name and a computed one. */
function aggregateExprOf(
  agg: SummarizeEntry,
  dialect: SqlDialect,
  refFor: (column: string) => string,
): string {
  const fn = agg.aggregation.toUpperCase();
  const isCountStar = fn === "COUNT" && agg.field === "*";
  return aggregateExpr(fn, isCountStar ? "*" : refFor(agg.field), isCountStar);
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
function aggregateExpr(fn: string, ref: string, isCountStar: boolean): string {
  if (isCountStar) return "COUNT(*)";
  const c = ref;
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
 * One computed column, in the ANSI form that gives the same answer on every
 * vendor.
 *
 *   a + b, a - b, a * b   ->  (a + b)
 *   a / b                 ->  (CAST(a AS DECIMAL(31,4)) / NULLIF(b, 0))
 *
 * The parentheses are what make the expression safe to drop into a WHERE, a
 * SUM or an ORDER BY without knowing what surrounds it. Division carries two
 * more things: the DECIMAL cast, because `/` on two integer columns is integer
 * division on PostgreSQL, SQL Server, SQLite and Db2 and floating division on
 * the rest - the same split `numericBinExpr` casts away, and `DECIMAL(31,4)` is
 * the vendor layer's existing precision, 31 being Db2's maximum; and `NULLIF`,
 * because dividing by zero is an error that fails the whole query on PostgreSQL,
 * Oracle, SQL Server and Db2, while NULL is the answer the other vendors give
 * and the one a report can show.
 *
 * An operand is a number or a column name and nothing else: a number is written
 * as a decimal literal, anything else is quoted as an identifier. So there is no
 * expression to parse and nothing the user types can arrive as SQL.
 */
function computedExpr(one: ComputedColumn, dialect: SqlDialect): string {
  const operand = (text: string): string =>
    isNumberOperand(text) ? decimalLiteral(Number(text)) : quoteIdent(text, dialect);
  const l = operand(one.left);
  const r = operand(one.right);
  if (one.operator === "/") return decimalDivision(l, r, dialect);
  return `(${l} ${one.operator} ${r})`;
}

/**
 * The six comparisons on a temporal column, read as the whole day the user
 * picked: `d` is the day, `d1` the day after (`nextDay`).
 *
 *   =            c >= d AND c < d1
 *   <>           (c < d OR c >= d1)
 *   after        c >= d1
 *   on or after  c >= d
 *   before       c < d
 *   on or before c < d1
 *
 * ANSI, and one text on every vendor: only the literals come from the layer.
 * This is the same half-open range `between` already writes, for the same
 * reason - a timestamp column holds a time of day, so an equality against a
 * date is an equality against midnight and a row stamped 14:05 answers no
 * question the user asked.
 *
 * Returns null - and the caller keeps the plain comparison - for an operator
 * that is not one of the six, and for a value that is not a plain `yyyy-mm-dd`
 * (a half-typed date, or a date with a time of day the user typed on purpose).
 */
function wholeDayCondition(
  cmp: string,
  operator: string,
  value: string,
  dialect: SqlDialect,
): string | null {
  const day = String(value ?? "").trim();
  const after = nextDay(day);
  if (!after) return null;
  const d = sqlLiteral(day, "date", dialect);
  const d1 = sqlLiteral(after, "date", dialect);
  switch (operator) {
    case "equals":           return `${cmp} >= ${d} AND ${cmp} < ${d1}`;
    case "not_equals":       return `(${cmp} < ${d} OR ${cmp} >= ${d1})`;
    case "greater_than":     return `${cmp} >= ${d1}`;
    case "greater_or_equal": return `${cmp} >= ${d}`;
    case "less_than":        return `${cmp} < ${d}`;
    case "less_or_equal":    return `${cmp} < ${d1}`;
    default:                 return null;
  }
}

/**
 * A relative date filter, as the half-open range of whole days it names.
 *
 * `relativeDayRange` does the calendar arithmetic (and decides what "the last 3
 * months" means); this writes the two days it answers with the vendor's own date
 * literals, in the one form every vendor reads:
 *
 *   c >= DATE 'from' AND c < DATE 'to'
 *
 * the same text `between` and the whole-day rule already write, for the same
 * reason - a timestamp column holds a time of day, so the last day of a span has
 * to be included by its whole day and not by its midnight.
 *
 * Returns null for an operator that is not a relative one, and for a "last N"
 * operator whose value box holds no positive whole number.
 */
function relativeDateCondition(
  cmp: string,
  operator: string,
  value: string,
  today: string,
  dialect: SqlDialect,
): string | null {
  const span = relativeDayRange(operator, value, today);
  if (!span) return null;
  const from = sqlLiteral(span.from, "date", dialect);
  const to = sqlLiteral(span.to, "date", dialect);
  return `${cmp} >= ${from} AND ${cmp} < ${to}`;
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
  paramTypes?: Record<string, string>,
): string {
  const from = filter.value;
  const to = filter.valueTo || "";
  if (temporal) {
    // Either bound may be a day the user typed or a Date parameter the
    // dashboard fills in; the range is the same half-open one either way. A
    // typed day is written as a literal here, a parameter is left verbatim,
    // and the end of the range is the day after `to` - a literal this file
    // computes when `to` is typed, the derived parameter when `to` is bound.
    const lower = isDayParam(from, paramTypes) ? from : dayLiteral(from, dialect);
    const upper = isDayParam(to, paramTypes) ? nextDayRef(to) : dayLiteral(nextDay(to), dialect);
    if (lower && upper) return `${cmp} >= ${lower} AND ${cmp} < ${upper}`;
  }
  // Anything else is a plain `BETWEEN`, which is exactly right for a number or
  // a text range - and the honest form for a bound parameter whose declared
  // type is not a date, since nothing here knows which day it names.
  const bound = (value: string) => (isParamRef(value) ? value : lit(filter.column, value));
  return `${cmp} BETWEEN ${bound(from)} AND ${bound(to)}`;
}

/** A day as the vendor's own date literal, or null when the text is not a day. */
function dayLiteral(day: string | null, dialect: SqlDialect): string | null {
  const text = String(day ?? "").trim();
  // A text `nextDay` can add a day to is a plain `yyyy-mm-dd` and nothing else.
  if (!text || !nextDay(text)) return null;
  return sqlLiteral(text, "date", dialect);
}

/**
 * A comparison against a Date parameter, as the range of whole days it names -
 * or null when the filter is not one of those.
 *
 * `on or before ${to}` is every row up to the end of that day, so it is
 * `< ${to__next_day}`; `after ${from}` is every row from the day after, so it
 * is `>= ${from__next_day}`. `on or after` and `before` need no day after and
 * already write the right boundary, and the two `equals` forms would need both
 * bounds of the day; they keep the plain comparison they have always written
 * (a recorded limit).
 */
function dayParamCondition(
  cmp: string,
  operator: string,
  value: string,
  paramTypes?: Record<string, string>,
): string | null {
  if (!isDayParam(value, paramTypes)) return null;
  switch (operator) {
    case "greater_than":  return `${cmp} >= ${nextDayRef(value)}`;
    case "less_or_equal": return `${cmp} < ${nextDayRef(value)}`;
    default:              return null;
  }
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
  paramTypes?: Record<string, string>,
): string | null {
  if (ds.mode === "visual" && ds.visualQuery) {
    const built = buildSql(ds.visualQuery, { connectionType, temporalColumns, columnKinds, paramTypes });
    if (built) return built;
    // buildSql returns "" for cube queries — fall through.
  }
  if ((ds.mode === "sql" || ds.mode === "ai-sql") && ds.sql) {
    return ds.sql;
  }
  return ds.generatedSql || null;
}

// THE VENDOR LAYER — the ONLY place in the AI Hub generator where a
// vendor-specific SQL form may live.
//
// The AI Hub generator writes standard ANSI SQL (`sql-builder.ts`,
// `smart-defaults/probes.ts`, the filter-pane query). A form is added to this
// file only because ANSI has no form for it, or because a database we support
// rejects the ANSI form. Every function below says in one line why ANSI cannot
// do it, and every one has a per-vendor test table in
// `frend/reporting/e2e/explore-data/sql-generation.tests.ts` — the table fails
// if a vendor key is missing from it.
//
//   quoteIdent      the quote character differs (`` ` ``, `[..]`, `"`)
//   quoteTableRef   same, per part of a `schema.table` reference
//   limitClause     ANSI `FETCH FIRST n ROWS ONLY` is not accepted everywhere
//   sqlLiteral      `DATE '…'` is not accepted by SQLite/SQL Server; booleans
//                   are `TRUE`/`FALSE` on some vendors and `1`/`0` on others
//   containsFilter  MySQL and MariaDB reject `ESCAPE '\'`; ClickHouse has no
//                   `ESCAPE` clause at all (both verified)
//   bucketExpr      ANSI has no date formatting or date truncation
//   datetimeExpr    SQLite has no temporal type; its driver stores epoch ms
//   dateExpr        same, and the decoded value needs truncating to compare
//   aliasSafeColumnRef
//                   ClickHouse resolves an unqualified name in SELECT and
//                   GROUP BY to a SELECT alias of the same name instead of
//                   to the column (verified)
//
// Coverage: SQLite, DuckDB, PostgreSQL, MySQL, MariaDB, ClickHouse, SQL Server,
// Oracle, DB2. The `dbserver.type` string returned by /api/connections/database
// is the key — matched case-insensitively.
//
// Two bucket families are handled by the same `bucketExpr()` entry point:
//   - Truncation (day/week/month/quarter/year) — produces sortable string
//     labels like "2024-03".
//   - Extraction (day-of-week/hour-of-day/month-of-year/quarter-of-year) —
//     produces discrete integers, used for "by hour" / "by weekday" charts.
//
// Numeric binning is NOT here: `FLOOR(CAST(c AS DECIMAL(31,4)) / w) * w` is
// ANSI and identical on all nine vendors, so it belongs with the generator
// (`numericBinExpr` in `sql-builder.ts`). Only what ANSI cannot say lives in
// this file.

import type { TimeBucket } from "@/lib/stores/canvas-store";

/** Normalize the dbserver.type strings we care about to a small enum. */
export type SqlDialect =
  | "sqlite"
  | "duckdb"
  | "postgres"
  | "mysql"
  | "mariadb"
  | "clickhouse"
  | "sqlserver"
  | "oracle"
  | "db2";

/** Default fallback for unknown / missing dialect — SQLite (our bundled
 *  default; new users land on the sample SQLite database). The default
 *  should rarely be hit at runtime because useWidgetData waits for the
 *  connection list to load before firing widget queries — see
 *  `useWidgetData.ts`. */
const DEFAULT_DIALECT: SqlDialect = "sqlite";

export function dialectFor(connectionType?: string | null): SqlDialect {
  if (!connectionType) return DEFAULT_DIALECT;
  const t = connectionType.toLowerCase();
  if (t.includes("sqlite")) return "sqlite";
  if (t.includes("duckdb")) return "duckdb";
  if (t.includes("postgres") || t.includes("supabase") || t.includes("timescale")) return "postgres";
  if (t.includes("mariadb")) return "mariadb";
  if (t.includes("mysql")) return "mysql";
  if (t.includes("clickhouse")) return "clickhouse";
  if (t.includes("sqlserver") || t.includes("mssql") || t.includes("sql server")) return "sqlserver";
  if (t.includes("oracle")) return "oracle";
  if (t.includes("db2")) return "db2";
  return DEFAULT_DIALECT;
}

/**
 * Produce a vendor-appropriate SQL expression for a time bucket (truncation
 * or extraction). The expression is meant to be dropped into a SELECT list.
 * Caller adds `AS <alias>` separately.
 *
 * Why not ANSI: ANSI SQL has no date-formatting and no date-truncation
 * function, so every vendor spells these differently.
 */
export function bucketExpr(
  column: string,
  bucket: TimeBucket,
  dialect: SqlDialect = DEFAULT_DIALECT,
  table?: TableRef | string,
): string {
  const c = aliasSafeColumnRef(column, table, dialect);
  switch (dialect) {
    case "sqlite":
      return sqliteBucket(c, bucket);
    case "duckdb":
      return duckdbBucket(c, bucket);
    case "postgres":
      return postgresBucket(c, bucket);
    case "mysql":
    case "mariadb":
      return mysqlBucket(c, bucket);
    case "clickhouse":
      return clickhouseBucket(c, bucket);
    case "sqlserver":
      return sqlserverBucket(c, bucket);
    case "oracle":
    case "db2":
      return oracleBucket(c, bucket);
    default:
      return sqliteBucket(c, bucket);
  }
}

/**
 * SQLite has no native DATETIME type. JDBC drivers (xerial sqlite-jdbc and
 * the Hibernate sqlite community dialect) write java.time.LocalDateTime as
 * BIGINT epoch milliseconds — so a column may legitimately hold either:
 *   - integer epoch-ms (e.g. 1710457200000)
 *   - integer epoch-seconds (rare in JDBC writes, common in Unix exports)
 *   - ISO 8601 TEXT ('2024-03-15' or '2024-03-15 00:00:00')
 *   - REAL Julian day numbers
 *
 * strftime() returns NULL for integer inputs without the 'unixepoch' modifier.
 * If the bucket SQL emits raw strftime over an epoch-ms column, every row
 * buckets to NULL, GROUP BY collapses to a single group, and downstream
 * smart-defaults thinks the result is scalar.
 *
 * This normalizer routes per-row by typeof() + magnitude so the bucket SQL
 * works regardless of how the source app stored the date. Only SQLite calls it:
 * DuckDB has real DATE/TIMESTAMP types and its own branch below.
 *
 * Magnitude threshold 1e11 separates ms from seconds. 1e11 ms is 1973-03-03,
 * so every epoch-ms date a business database holds is above it, while 1e11
 * epoch-seconds would be the year 5138 — no real seconds value reaches it. The
 * older 1e12 threshold (2001-09-09) read every epoch-ms date before then as
 * seconds, which put a 1996 timestamp in 1970.
 *
 * Not exported: this is the inside of the SQLite branch. Callers that need to
 * read a temporal column ask for `datetimeExpr` or `dateExpr`, which decide
 * per vendor whether any decoding is needed at all.
 */
function sqliteDateNormalize(c: string): string {
  return `(CASE
    WHEN typeof(${c}) IN ('integer','real') AND ${c} > 100000000000
      THEN datetime(${c}/1000, 'unixepoch')
    WHEN typeof(${c}) IN ('integer','real')
      THEN datetime(${c}, 'unixepoch')
    ELSE ${c}
  END)`;
}

/**
 * Read a temporal column as a datetime value — for MIN/MAX and for anything
 * that hands the value back to the UI as an ISO string.
 *
 * Why not ANSI: a TIMESTAMP column is simply itself on eight of the nine
 * vendors, but SQLite has no temporal type at all and its JDBC driver writes a
 * LocalDateTime as BIGINT epoch milliseconds, so the column has to be decoded
 * before it can be read as a datetime. Callers must not branch on the dialect
 * to decide that — they call this and get the right expression either way.
 */
export function datetimeExpr(column: string, dialect: SqlDialect = DEFAULT_DIALECT): string {
  const c = quoteIdent(column, dialect);
  return dialect === "sqlite" ? sqliteDateNormalize(c) : c;
}

/**
 * Read a temporal column as a date, for comparing against a date literal.
 *
 * Why not ANSI: same reason as `datetimeExpr`, plus SQLite needs the decoded
 * value truncated with `date(…)` so it compares equal to a '2026-01-31'
 * literal. On the other eight the native type compares against a date literal
 * on its own, and the ANSI half-open range (`>= d AND < d+1`) covers the time
 * part, so the raw column is right there.
 */
export function dateExpr(column: string, dialect: SqlDialect = DEFAULT_DIALECT): string {
  const c = quoteIdent(column, dialect);
  return dialect === "sqlite" ? `date(${sqliteDateNormalize(c)})` : c;
}

function sqliteBucket(c: string, b: TimeBucket): string {
  const n = sqliteDateNormalize(c);
  switch (b) {
    case "day":     return `strftime('%Y-%m-%d', ${n})`;
    // %G-W%V is the ISO year and ISO week; '%Y-W%W' calls 2025-01-01 "2025-W00"
    // and 2024-12-30 "2024-W53" instead of 2025-W01. %G/%V need SQLite 3.46+
    // (sqlite-jdbc ships 3.49.1.0).
    case "week":    return `strftime('%G-W%V', ${n})`;
    case "month":   return `strftime('%Y-%m', ${n})`;
    case "quarter": return `strftime('%Y', ${n}) || '-Q' || ((CAST(strftime('%m', ${n}) AS INTEGER) - 1) / 3 + 1)`;
    case "year":    return `strftime('%Y', ${n})`;
    case "day-of-week":     return `CAST(strftime('%w', ${n}) AS INTEGER)`;
    case "hour-of-day":     return `CAST(strftime('%H', ${n}) AS INTEGER)`;
    case "month-of-year":   return `CAST(strftime('%m', ${n}) AS INTEGER)`;
    case "quarter-of-year": return `((CAST(strftime('%m', ${n}) AS INTEGER) - 1) / 3 + 1)`;
  }
}

function duckdbBucket(c: string, b: TimeBucket): string {
  // DuckDB has real DATE/TIMESTAMP types, so none of SQLite's typeof/datetime/
  // unixepoch normalization applies; its strftime takes (value, format), the
  // reverse of SQLite's, and it has quarter()/hour()/month()/dayofweek().
  switch (b) {
    case "day":     return `strftime(${c}, '%Y-%m-%d')`;
    case "week":    return `strftime(${c}, '%G-W%V')`;
    case "month":   return `strftime(${c}, '%Y-%m')`;
    case "quarter": return `strftime(${c}, '%Y') || '-Q' || CAST(quarter(${c}) AS VARCHAR)`;
    case "year":    return `strftime(${c}, '%Y')`;
    // DuckDB dayofweek is 0..6 with Sunday=0, already the convention the other
    // branches map to.
    case "day-of-week":     return `CAST(dayofweek(${c}) AS INTEGER)`;
    case "hour-of-day":     return `CAST(hour(${c}) AS INTEGER)`;
    case "month-of-year":   return `CAST(month(${c}) AS INTEGER)`;
    case "quarter-of-year": return `CAST(quarter(${c}) AS INTEGER)`;
  }
}

function postgresBucket(c: string, b: TimeBucket): string {
  switch (b) {
    case "day":     return `TO_CHAR(${c}, 'YYYY-MM-DD')`;
    case "week":    return `TO_CHAR(${c}, 'IYYY-"W"IW')`;
    case "month":   return `TO_CHAR(${c}, 'YYYY-MM')`;
    case "quarter": return `TO_CHAR(${c}, 'YYYY') || '-Q' || TO_CHAR(${c}, 'Q')`;
    case "year":    return `TO_CHAR(${c}, 'YYYY')`;
    case "day-of-week":     return `EXTRACT(DOW FROM ${c})::INTEGER`;
    // EXTRACT(HOUR FROM …) is rejected on a DATE column ("unit \"hour\" not
    // supported for type date"); the CAST to TIMESTAMP is accepted on DATE and
    // on TIMESTAMP alike (verified).
    case "hour-of-day":     return `EXTRACT(HOUR FROM CAST(${c} AS TIMESTAMP))::INTEGER`;
    case "month-of-year":   return `EXTRACT(MONTH FROM ${c})::INTEGER`;
    case "quarter-of-year": return `EXTRACT(QUARTER FROM ${c})::INTEGER`;
  }
}

function mysqlBucket(c: string, b: TimeBucket): string {
  switch (b) {
    case "day":     return `DATE_FORMAT(${c}, '%Y-%m-%d')`;
    // %x is the ISO year that goes with %v, the ISO week. '%Y-W%v' pairs the
    // calendar year with the ISO week, so 2024-12-30 came out 2024-W01.
    case "week":    return `DATE_FORMAT(${c}, '%x-W%v')`;
    case "month":   return `DATE_FORMAT(${c}, '%Y-%m')`;
    case "quarter": return `CONCAT(YEAR(${c}), '-Q', QUARTER(${c}))`;
    case "year":    return `DATE_FORMAT(${c}, '%Y')`;
    // MySQL DAYOFWEEK is 1..7 with Sunday=1; subtract 1 to align with 0..6.
    case "day-of-week":     return `DAYOFWEEK(${c}) - 1`;
    case "hour-of-day":     return `HOUR(${c})`;
    case "month-of-year":   return `MONTH(${c})`;
    case "quarter-of-year": return `QUARTER(${c})`;
  }
}

function clickhouseBucket(c: string, b: TimeBucket): string {
  switch (b) {
    case "day":     return `formatDateTime(${c}, '%F')`;
    case "week":    return `formatDateTime(toMonday(${c}), '%G-W%V')`;
    case "month":   return `formatDateTime(${c}, '%Y-%m')`;
    case "quarter": return `concat(toString(toYear(${c})), '-Q', toString(toQuarter(${c})))`;
    case "year":    return `toString(toYear(${c}))`;
    // ClickHouse toDayOfWeek is Mon=1..Sun=7; map to 0..6 Sun-first to match others.
    case "day-of-week":     return `(toDayOfWeek(${c}) % 7)`;
    // toHour rejects a Date/Date32 column ("Illegal type Date32 of argument of
    // function toHour"); toDateTime widens it first (verified).
    case "hour-of-day":     return `toHour(toDateTime(${c}))`;
    case "month-of-year":   return `toMonth(${c})`;
    case "quarter-of-year": return `toQuarter(${c})`;
  }
}

function sqlserverBucket(c: string, b: TimeBucket): string {
  // FORMAT() requires SQL Server 2012+. Acceptable for modern deployments.
  switch (b) {
    case "day":     return `FORMAT(${c}, 'yyyy-MM-dd')`;
    // SQL Server has ISO_WEEK but no ISO year datepart. DATEADD(DAY, 26 -
    // ISO_WEEK, d) always lands inside the ISO year's own calendar year, so
    // YEAR() of it is the ISO year. Pairing DATEPART(YEAR, d) with ISO_WEEK
    // called 2024-12-30 "2024-W01".
    case "week":    return `CONCAT(DATEPART(YEAR, DATEADD(DAY, 26 - DATEPART(ISO_WEEK, ${c}), ${c})), '-W', RIGHT('0' + CAST(DATEPART(ISO_WEEK, ${c}) AS VARCHAR), 2))`;
    case "month":   return `FORMAT(${c}, 'yyyy-MM')`;
    case "quarter": return `CONCAT(DATEPART(YEAR, ${c}), '-Q', DATEPART(QUARTER, ${c}))`;
    case "year":    return `FORMAT(${c}, 'yyyy')`;
    // SQL Server WEEKDAY is 1..7 but start depends on DATEFIRST; subtract 1
    // to get 0..6 with the current DATEFIRST as day-0.
    case "day-of-week":     return `DATEPART(WEEKDAY, ${c}) - 1`;
    // DATEPART(HOUR, …) is rejected on a DATE column ("The datepart hour is not
    // supported by date function datepart for data type date"); the CAST to
    // DATETIME2 is accepted on DATE and on DATETIME2 alike (verified).
    case "hour-of-day":     return `DATEPART(HOUR, CAST(${c} AS DATETIME2))`;
    case "month-of-year":   return `DATEPART(MONTH, ${c})`;
    case "quarter-of-year": return `DATEPART(QUARTER, ${c})`;
  }
}

function oracleBucket(c: string, b: TimeBucket): string {
  // Oracle/DB2 share TO_CHAR syntax.
  switch (b) {
    case "day":     return `TO_CHAR(${c}, 'YYYY-MM-DD')`;
    case "week":    return `TO_CHAR(${c}, 'IYYY') || '-W' || TO_CHAR(${c}, 'IW')`;
    case "month":   return `TO_CHAR(${c}, 'YYYY-MM')`;
    case "quarter": return `TO_CHAR(${c}, 'YYYY') || '-Q' || TO_CHAR(${c}, 'Q')`;
    case "year":    return `TO_CHAR(${c}, 'YYYY')`;
    // Oracle TO_CHAR 'D' is 1..7 with locale-dependent start; subtract 1.
    case "day-of-week":     return `TO_NUMBER(TO_CHAR(${c}, 'D')) - 1`;
    // EXTRACT(HOUR FROM …) rejects an Oracle/DB2 DATE column ("invalid
    // extract field for extract source"); TO_CHAR 'HH24' works on DATE and on
    // TIMESTAMP alike.
    case "hour-of-day":     return `TO_NUMBER(TO_CHAR(${c}, 'HH24'))`;
    case "month-of-year":   return `EXTRACT(MONTH FROM ${c})`;
    case "quarter-of-year": return `TO_NUMBER(TO_CHAR(${c}, 'Q'))`;
  }
}

/**
 * Quote an identifier using the dialect's convention. Quotes ONE name — never
 * a `schema.table` reference; use `quoteTableRef` for that.
 *
 * Why not ANSI: ANSI says `"name"`, but MySQL/MariaDB use backticks and SQL
 * Server uses brackets, and neither accepts the ANSI form by default.
 */
export function quoteIdent(name: string, dialect: SqlDialect = DEFAULT_DIALECT): string {
  switch (dialect) {
    case "mysql":
    case "mariadb":
      return `\`${name.replace(/`/g, "``")}\``;
    case "sqlserver":
      return `[${name.replace(/\]/g, "]]")}]`;
    default:
      return `"${name.replace(/"/g, '""')}"`;
  }
}

/**
 * A column reference for an expression that the SELECT list aliases with the
 * column's own name — a time bucket or a numeric bin (`… AS "opened_date"`).
 *
 * Why not ANSI: ANSI resolves an unqualified name in the SELECT list and in
 * GROUP BY to a column of the table; a SELECT alias is only visible later, in
 * ORDER BY. ClickHouse resolves it to the SELECT alias of the same name
 * instead, so `toMonday("opened_date") AS "opened_date"` reads its own String
 * result and fails with `Illegal type String of argument of function toMonday`
 * (verified on 24.3). Qualifying the reference with its table bypasses alias
 * resolution there. Every other vendor gets the plain column reference: the
 * settings that would change ClickHouse's resolution instead
 * (`prefer_column_name_to_alias`, `allow_experimental_analyzer`) break
 * `ORDER BY <alias>` or change nothing (both verified).
 */
export function aliasSafeColumnRef(
  column: string,
  table: TableRef | string | undefined,
  dialect: SqlDialect = DEFAULT_DIALECT,
): string {
  const c = quoteIdent(column, dialect);
  if (dialect !== "clickhouse" || !table) return c;
  const name = typeof table === "string" ? table : table.name;
  if (!name) return c;
  return `${quoteIdent(name, dialect)}.${c}`;
}

/** A table reference: a name, and the schema it lives in when that schema is
 *  not the connection's default one. */
export interface TableRef {
  schema?: string;
  name: string;
}

/**
 * Quote a table reference, qualifying it with its schema when it has one.
 *
 * Why not ANSI: the same reason as `quoteIdent` — each part of the reference is
 * quoted the vendor's way: `"cube_demo"."crm_deals"`, `` `cube_demo`.`crm_deals` ``,
 * `[cube_demo].[crm_deals]`.
 *
 * A ref with no schema is exactly `quoteIdent(name, d)`, so a table in the
 * default schema keeps byte-for-byte the SQL AI Hub writes today. The name is
 * never split on `.`, so a table really called `Order.Details` keeps its dot
 * and is quoted as the one name it is.
 */
export function quoteTableRef(ref: TableRef | string, dialect: SqlDialect = DEFAULT_DIALECT): string {
  const r: TableRef = typeof ref === "string" ? { name: ref } : ref;
  const name = quoteIdent(r.name, dialect);
  return r.schema ? `${quoteIdent(r.schema, dialect)}.${name}` : name;
}

/**
 * Apply a row limit to a finished SELECT.
 *
 * Why not ANSI: the ANSI form is `FETCH FIRST n ROWS ONLY`, but SQL Server
 * takes `TOP n` after SELECT and SQLite, DuckDB, MySQL, MariaDB and ClickHouse
 * take `LIMIT n`. A limit of 0 or less leaves the SQL untouched.
 */
export function limitClause(sql: string, rows: number, dialect: SqlDialect = DEFAULT_DIALECT): string {
  const n = Math.trunc(rows);
  if (!Number.isFinite(n) || n <= 0) return sql;
  switch (dialect) {
    case "postgres":
    case "oracle":
    case "db2":
      return `${sql}\nFETCH FIRST ${n} ROWS ONLY`;
    case "sqlserver": {
      // TOP goes after SELECT, and after DISTINCT when the query has one.
      const head = /^\s*SELECT\s+(?:DISTINCT\s+)?/i.exec(sql);
      if (!head) return sql;
      return `${sql.slice(0, head[0].length)}TOP ${n} ${sql.slice(head[0].length)}`;
    }
    case "sqlite":
    case "duckdb":
    case "mysql":
    case "mariadb":
    case "clickhouse":
    default:
      return `${sql}\nLIMIT ${n}`;
  }
}

/** What kind of value a literal holds. Picked by the caller, which knows the
 *  column's type; it is never guessed from the text. */
export type SqlLiteralKind = "string" | "number" | "date" | "timestamp" | "boolean";

/** The vendors whose string literals treat `\` as an escape character, so a
 *  backslash in a value has to be doubled as well as the quote. */
const BACKSLASH_IN_LITERALS: ReadonlySet<SqlDialect> = new Set<SqlDialect>(["mysql", "mariadb", "clickhouse"]);

/**
 * Render one value as a SQL literal. The generated SQL text is self-contained
 * (it is previewed, handed to SQL mode and frozen into published dashboards),
 * so filter values are literals, not bind parameters — which means this is the
 * one place their escaping is decided.
 *
 * Why not ANSI: ANSI says `'it''s'`, `DATE '2026-01-31'` and `TRUE`, but MySQL,
 * MariaDB and ClickHouse also read `\` inside a literal, SQLite and SQL Server
 * reject the `DATE '…'` prefix, ClickHouse spells it `toDate('…')`, and
 * SQLite, SQL Server, Oracle and DB2 want `1`/`0` for a boolean.
 *
 * Throws on a `number` whose value is not finite — the caller picks the kind,
 * so a non-numeric value there is a bug at the call site, not user input to
 * silently paper over.
 */
export function sqlLiteral(value: unknown, kind: SqlLiteralKind, dialect: SqlDialect = DEFAULT_DIALECT): string {
  switch (kind) {
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
      if (!Number.isFinite(n)) {
        throw new RangeError(`sqlLiteral: ${JSON.stringify(value)} is not a number`);
      }
      return String(n);
    }
    case "boolean": {
      const t = isTruthy(value);
      return BACKSLASH_IN_LITERALS.has(dialect) || dialect === "postgres" || dialect === "duckdb"
        ? (t ? "TRUE" : "FALSE")
        : (t ? "1" : "0");
    }
    case "date":
    case "timestamp": {
      const text = stringLiteral(String(value ?? "").trim(), dialect);
      switch (dialect) {
        case "sqlite":
        case "sqlserver":
          return text;
        case "clickhouse":
          return kind === "date" ? `toDate(${text})` : `toDateTime(${text})`;
        default:
          return kind === "date" ? `DATE ${text}` : `TIMESTAMP ${text}`;
      }
    }
    default:
      return stringLiteral(String(value ?? ""), dialect);
  }
}

function stringLiteral(value: string, dialect: SqlDialect): string {
  let body = value.replace(/'/g, "''");
  if (BACKSLASH_IN_LITERALS.has(dialect)) body = body.replace(/\\/g, "\\\\");
  return `'${body}'`;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const t = String(value ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "t" || t === "yes" || t === "y";
}

/**
 * A case-insensitive "contains" predicate over `columnExpr` (already quoted by
 * the caller), matching `value` anywhere in the column.
 *
 * Why not ANSI: ANSI `LIKE … ESCAPE '\'` is rejected by MySQL 8.0.28 and
 * MariaDB 10.11, where `\` escapes inside the string literal too, so `'\'`
 * never closes; `ESCAPE '!'` works on both. ClickHouse 24.3 has no `ESCAPE`
 * clause at all and uses `\` as its own LIKE escape. Both verified.
 */
export function containsFilter(columnExpr: string, value: string, dialect: SqlDialect = DEFAULT_DIALECT): string {
  const escapeChar = dialect === "clickhouse" ? "\\" : "!";
  const pattern = `%${escapeLikeWildcards(value ?? "", escapeChar)}%`;
  const literal = sqlLiteral(pattern, "string", dialect);
  const escapeClause = dialect === "clickhouse" ? "" : ` ESCAPE '${escapeChar}'`;
  return `LOWER(${columnExpr}) LIKE LOWER(${literal})${escapeClause}`;
}

/** Escape the LIKE wildcards `%` and `_`, and the escape character itself, so
 *  a value that holds one matches literally instead of matching everything. */
function escapeLikeWildcards(value: string, escapeChar: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === escapeChar || ch === "%" || ch === "_") out += escapeChar;
    out += ch;
  }
  return out;
}

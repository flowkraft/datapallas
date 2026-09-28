// The AI Hub cases, and the one place their SQL is built.
//
// ANSI SQL only - no vendor branch in this file; vendor forms live in
// `@/lib/explore-data/sql-dialects.ts`. Nothing here writes SQL either: it
// hands each case to the generator the product calls (`buildSql`, the probe
// query functions, `buildDistinctValuesSql`) and returns what comes back. Both
// the writer of `ai-hub-sql.generated.json` and Jasmine block 10, which fails
// when that file is stale, call this - so a case is built exactly once, one way.

import * as fs from "fs";
import * as path from "path";

import { buildDistinctValuesSql, buildSql } from "@/lib/explore-data/sql-builder";
import {
  cardinalitySql,
  dateRangeSql,
  numericRangeSql,
  sampleRowsSql,
} from "@/lib/explore-data/smart-defaults/probes";
import type { SqlDialect, SqlLiteralKind, TableRef } from "@/lib/explore-data/sql-dialects";
import type { VisualQuery } from "@/lib/stores/canvas-store";

/** The nine vendor keys the product's SQL is written for. */
export const VENDOR_KEYS: SqlDialect[] = [
  "sqlite",
  "duckdb",
  "postgres",
  "mysql",
  "mariadb",
  "clickhouse",
  "sqlserver",
  "oracle",
  "db2",
];

export interface AiHubProbe {
  kind: "dateRange" | "numericRange" | "cardinality" | "sampleRows";
  table: TableRef | string;
  column?: string;
  columns?: string[];
  sampleSize?: number;
}

export interface AiHubFilterPane {
  table: TableRef | string;
  field: string;
  rowLimit: number;
}

export interface AiHubCase {
  id: string;
  group: "A" | "B" | "C" | "D";
  proves: string;
  /** Only these vendors, when a case cannot run everywhere its group does. */
  vendors?: string[];
  /** Group D only: the user's own SQL, sent to the database byte for byte -
   *  one ANSI text for every vendor, or one text per vendor for an idiom that
   *  belongs to a single database. Nothing here rewrites it; this is what SQL
   *  and AI-SQL mode do, and the vendor forms in it are the user's, not the
   *  generator's (THE RULE is about what the generator writes). */
  sql?: string | Record<string, string>;
  /** The vendors that refuse this case, each with the database's own words: a
   *  refusal recorded here is not fixed, and the case is not asked on that
   *  vendor. Group D, mostly, where the user's SQL is theirs and a construct
   *  their database has not got is their business; and, in group A, the rare
   *  binding a driver will not make at all - ClickHouse reads no timestamp
   *  against a date column (p1b). A vendor form the GENERATOR writes is never
   *  recorded here: that is THE RULE's business, and it is fixed. */
  excluded?: Record<string, string>;
  query?: VisualQuery;
  probe?: AiHubProbe;
  filterPane?: AiHubFilterPane;
  /** What a value compared against a column looks like - what the schema API
   *  tells the product, written out here because this file has no schema. */
  columnKinds?: Record<string, SqlLiteralKind>;
  temporalColumns?: string[];
  /** Group A only: the values a dashboard's filter bar sends, and the type each
   *  parameter was declared with. The Java runner binds them through the
   *  product's own `QueriesService.prepare`; the types decide the SQL as well,
   *  because a filter bound to a Date parameter means the whole day it names,
   *  and the day after it is a parameter of its own (F8). */
  params?: Record<string, string>;
  paramTypes?: Record<string, string>;
  /** The day a relative date filter counts back from, as `yyyy-mm-dd`. A case
   *  with one pins it - the demo seed's `today`, 2026-09-30 - so its committed
   *  SQL and the rows it asserts stay true tomorrow. */
  today?: string;
  rows?: unknown[][];
  rowCount?: number;
  ordered?: boolean;
  /**
   * The labels the result must come back with. One list when every vendor answers the same, or
   * a map vendor -> labels when they do not: Oracle and Db2 fold an unquoted alias to upper
   * case, and group D asks the user's own SQL, aliases included.
   */
  columns?: string[] | Record<string, string[]>;
}

/** The data lives with the other e2e test data, next to `cube-checks`. */
const DATA_DIR = path.join(__dirname, "..", "_resources", "ai-hub-sql");
export const CASES_FILE = path.join(DATA_DIR, "ai-hub-sql-cases.json");
export const GENERATED_FILE = path.join(DATA_DIR, "ai-hub-sql.generated.json");

export function readAiHubCases(): { cases: AiHubCase[] } {
  const parsed = JSON.parse(fs.readFileSync(CASES_FILE, "utf8")) as { cases: AiHubCase[] };
  if (!parsed.cases || parsed.cases.length === 0) {
    throw new Error(`${CASES_FILE} holds no cases`);
  }
  return parsed;
}

export function readGeneratedAiHubSql(): Record<string, Record<string, string>> {
  return JSON.parse(fs.readFileSync(GENERATED_FILE, "utf8")) as Record<string, Record<string, string>>;
}

/** One case's SQL for one vendor, from the product's own generator. */
export function buildAiHubCaseSql(one: AiHubCase, vendor: SqlDialect): string {
  if (one.sql) {
    // The user's own SQL. Nothing is built and nothing is rewritten: the case's
    // text is what the database is sent, which is the whole point of group D.
    if (typeof one.sql === "string") return one.sql;
    const own = one.sql[vendor];
    if (own) return own;
    return `-- this case is not asked on ${vendor}: it is one database's own idiom`;
  }
  if (one.query) {
    return buildSql(one.query, {
      connectionType: vendor,
      columnKinds: one.columnKinds ? new Map(Object.entries(one.columnKinds)) : undefined,
      temporalColumns: one.temporalColumns ? new Set(one.temporalColumns) : undefined,
      paramTypes: one.paramTypes,
      today: one.today,
    });
  }
  if (one.filterPane) {
    const pane = one.filterPane;
    return buildDistinctValuesSql(pane.table, pane.field, pane.rowLimit, vendor);
  }
  if (one.probe) {
    const probe = one.probe;
    switch (probe.kind) {
      case "dateRange":
        return dateRangeSql(probe.table, required(probe.column, one.id, "column"), vendor);
      case "numericRange":
        return numericRangeSql(probe.table, required(probe.column, one.id, "column"), vendor);
      case "cardinality":
        return cardinalitySql(probe.table, required(probe.columns, one.id, "columns"), vendor);
      case "sampleRows":
        return sampleRowsSql(
          probe.table,
          required(probe.columns, one.id, "columns"),
          required(probe.sampleSize, one.id, "sampleSize"),
          vendor,
        );
      default:
        throw new Error(`${one.id}: no probe of kind '${probe.kind}'`);
    }
  }
  throw new Error(`${one.id}: a case holds a query, a probe or a filterPane, and this one holds none`);
}

function required<T>(value: T | undefined, id: string, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${id}: this case needs '${what}'`);
  }
  return value;
}

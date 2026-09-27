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
  group: "A" | "B" | "C";
  proves: string;
  /** Only these vendors, when a case cannot run everywhere its group does. */
  vendors?: string[];
  query?: VisualQuery;
  probe?: AiHubProbe;
  filterPane?: AiHubFilterPane;
  /** What a value compared against a column looks like - what the schema API
   *  tells the product, written out here because this file has no schema. */
  columnKinds?: Record<string, SqlLiteralKind>;
  temporalColumns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  ordered?: boolean;
  columns?: string[];
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
  if (one.query) {
    return buildSql(one.query, {
      connectionType: vendor,
      columnKinds: one.columnKinds ? new Map(Object.entries(one.columnKinds)) : undefined,
      temporalColumns: one.temporalColumns ? new Set(one.temporalColumns) : undefined,
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

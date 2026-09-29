// The SQL AI Hub generates, read as text.
//
// THE RULE: the generator writes ANSI SQL - the same text on every vendor - and
// every vendor form lives in the vendor layer, `lib/explore-data/sql-dialects.ts`.
// These specs are in two groups, and the group a spec is in says which half of
// the rule it holds:
//
//   ANSI -         the block builds the SQL for ALL NINE vendor keys and expects
//                  the SAME standard-SQL text on every one, so a vendor branch
//                  that leaked into the generator fails here.
//   VENDOR LAYER - the block holds a table with the exact expected form for
//                  every vendor key, and fails when a key is missing from the
//                  table, so a new vendor cannot be added without saying what
//                  its form is.
//
// What the text cannot prove - that the SQL runs, and answers the truth - is
// proven by the AI Hub cases in GeneratedSqlAllVendorsTest, which run the
// committed SQL of `_resources/ai-hub-sql/ai-hub-sql.generated.json` on a throwaway database
// of each vendor. Block 10 below is the tie between the two: it fails when that
// file no longer matches what the generator writes today.

import {
  buildDistinctValuesSql,
  buildSql,
  decimalLiteral,
  extractParamIds,
  extractParamTypes,
  nextDay,
  numericBinExpr,
  percentOfTotalExpr,
  runningTotalExpr,
  runsAsRunningTotal,
  sortableColumns,
  sqlForDataSource,
} from "@/lib/explore-data/sql-builder";
import {
  cardinalitySql,
  dateRangeSql,
  numericRangeSql,
  sampleRowsSql,
} from "@/lib/explore-data/smart-defaults/probes";
import {
  ALL_OPERATOR_LISTS,
  BOOLEAN_OPS,
  FILTER_MATCHES,
  DATE_OPS,
  NO_VALUE_OPS,
  NUMBER_OPS,
  CUBE_QUERY_OPERATORS,
  cubeQueryOperator,
  PARAM_BINDABLE_OPS,
  STRING_OPS,
  matchesAnyFilter,
  type FilterMatch,
  type OperatorDef,
} from "@/lib/explore-data/filter-operators";
import {
  AGGREGATIONS,
  AGGREGATION_VALUES,
  HAVING_OPS,
  HAVING_OP_VALUES,
  RUNNING_TOTAL_AGGREGATIONS,
  RUNNING_TOTAL_LABEL,
  SHARE_LABEL,
  isCompleteCondition,
} from "@/lib/explore-data/aggregations";
import {
  ARITHMETIC_OPS,
  ARITHMETIC_OP_VALUES,
  computedColumnSchemas,
  computedColumnsOf,
  isCompleteComputedColumn,
  isNumberOperand,
} from "@/lib/explore-data/computed-columns";
import {
  isDayParam,
  nextDayRef,
  NEXT_DAY_SUFFIX,
  paramNameOf,
} from "@/lib/explore-data/date-parameters";
import {
  relativeDayRange,
  todayIso,
  RELATIVE_DATE_N_OPS,
  RELATIVE_DATE_OPS,
  RELATIVE_DATE_PERIOD_OPS,
} from "@/lib/explore-data/relative-dates";
import {
  aliasSafeColumnRef,
  bucketExpr,
  containsFilter,
  likeFilter,
  dateExpr,
  decimalDivision,
  limitClause,
  quoteIdent,
  quoteTableRef,
  sqlLiteral,
  type SqlDialect,
  type SqlLiteralKind,
} from "@/lib/explore-data/sql-dialects";
import type { VisualQuery } from "@/lib/stores/canvas-store";
import type { ColumnSchema } from "@/lib/explore-data/types";

import * as fs from "fs";
import * as path from "path";

import { buildAiPrompt, vendorNameFor } from "@/lib/explore-data/ai-prompt-builder";

import {
  buildAiHubCaseSql,
  readAiHubCases,
  readGeneratedAiHubSql,
  VENDOR_KEYS,
} from "./ai-hub-sql";

/** Every vendor key, in one place: a table that misses one fails below. */
const EVERY_VENDOR: SqlDialect[] = VENDOR_KEYS;

/** The ANSI blocks compare the SQL with the quoting taken off, because the
 *  quote character is the vendor layer's business (block 6), not the standard
 *  SQL's. */
function unquoted(sql: string): string {
  return sql.replace(/[`"\[\]]/g, "");
}

/** A table in a VENDOR LAYER block: every vendor key, and nothing else. */
function eachVendor<T>(table: Record<string, T>): [SqlDialect, T][] {
  const named = Object.keys(table).sort();
  const wanted = [...EVERY_VENDOR].sort();
  expect(named).withContext("this table must hold one form per vendor key, and no other key")
    .toEqual(wanted);
  return EVERY_VENDOR.map((vendor) => [vendor, table[vendor]]);
}

const COLUMN_KINDS = new Map<string, SqlLiteralKind>([
  ["amount", "number"],
  ["qty", "number"],
  ["created_at", "timestamp"],
  ["closed_on", "date"],
  ["is_won", "boolean"],
  ["title", "string"],
]);

function query(patch: Partial<VisualQuery>): VisualQuery {
  return {
    kind: "table",
    table: "crm_deals",
    filters: [],
    summarize: [],
    groupBy: [],
    sort: [],
    limit: 0,
    ...patch,
  } as VisualQuery;
}

function sqlOn(visualQuery: VisualQuery, vendor: SqlDialect): string {
  return buildSql(visualQuery, { connectionType: vendor, columnKinds: COLUMN_KINDS });
}

/** The reference to a column is the vendor layer's too: `quoteIdent` (block 6)
 *  and, on ClickHouse, `aliasSafeColumnRef` (block 11), which qualifies a
 *  bucketed or binned column with its table because ClickHouse would otherwise
 *  resolve the name to the SELECT alias of the same name. An ANSI block asserts
 *  the expression built AROUND the reference, so the qualifier is normalized
 *  away here exactly as the quotes are. */
function withoutOwnTableQualifier(sql: string, table: string): string {
  return sql.split(`${table}.`).join("");
}

/** The one ANSI text this query has, asserted to be the same on all nine. */
function oneAnsiTextFor(visualQuery: VisualQuery): string {
  const forms = EVERY_VENDOR.map(
    (vendor) => withoutOwnTableQualifier(unquoted(sqlOn(visualQuery, vendor)), visualQuery.table));
  expect(new Set(forms).size)
    .withContext(`the generator wrote more than one text:\n${forms.join("\n")}`)
    .toBe(1);
  return forms[0];
}

// ── 1 ────────────────────────────────────────────────────────────────────────

describe("ANSI — aggregates", () => {

  const aggregates = query({
    groupBy: ["title"],
    summarize: [
      { aggregation: "SUM", field: "amount" },
      { aggregation: "AVG", field: "qty" },
      { aggregation: "MIN", field: "closed_on" },
      { aggregation: "MAX", field: "closed_on" },
      { aggregation: "COUNT", field: "*" },
      { aggregation: "COUNT DISTINCT", field: "title" },
    ],
  } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(aggregates).length).toBeGreaterThan(0);
  });

  it("casts SUM to DECIMAL(31,4)", () => {
    expect(oneAnsiTextFor(aggregates)).toContain("CAST(SUM(amount) AS DECIMAL(31,4)) AS amount_sum");
  });

  it("casts AVG inside and outside, so an integer column averages exactly", () => {
    expect(oneAnsiTextFor(aggregates))
      .toContain("CAST(AVG(CAST(qty AS DECIMAL(31,4))) AS DECIMAL(31,4)) AS qty_avg");
  });

  it("leaves MIN, MAX, COUNT and COUNT DISTINCT unwrapped", () => {
    const ansi = oneAnsiTextFor(aggregates);
    expect(ansi).toContain("MIN(closed_on) AS closed_on_min");
    expect(ansi).toContain("MAX(closed_on) AS closed_on_max");
    expect(ansi).toContain("COUNT(*) AS count");
    expect(ansi).toContain("COUNT(DISTINCT title) AS title_count distinct");
  });

  it("rounds nothing: a ROUND around MIN of a date column rounded a date", () => {
    expect(oneAnsiTextFor(aggregates)).not.toContain("ROUND(");
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────

describe("ANSI — the date range", () => {

  const range = (column: string) => query({
    filters: [{ column, operator: "between", value: "2026-01-01", valueTo: "2026-01-31" }],
  } as Partial<VisualQuery>);

  it("is half-open on a date column: >= from, < the day after to", () => {
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn(range("closed_on"), vendor);
      expect(sql).withContext(vendor).toContain(">=");
      expect(sql).withContext(vendor).toContain("<");
      expect(sql).withContext(vendor).not.toContain("BETWEEN");
      expect(sql).withContext(vendor).toContain("2026-02-01");
    }
  });

  it("is half-open on a timestamp column too — BETWEEN dropped every row after midnight on the last day", () => {
    // No shipped sample holds a time of day, so the row that proves it is
    // invented here: 2026-01-31 14:05 is inside the range the user asked for,
    // and `BETWEEN '2026-01-01' AND '2026-01-31'` leaves it out.
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn(range("created_at"), vendor);
      expect(sql).withContext(vendor).not.toContain("BETWEEN");
      expect(sql).withContext(vendor).toContain("2026-02-01");
    }
    const ansi = unquoted(sqlOn(range("created_at"), "postgres"));
    expect(ansi).toContain("created_at >= DATE '2026-01-01' AND created_at < DATE '2026-02-01'");
  });

  it("keeps BETWEEN for a number range, where both bounds are wanted", () => {
    const numbers = query({
      filters: [{ column: "qty", operator: "between", value: "1", valueTo: "9" }],
    } as Partial<VisualQuery>);
    expect(oneAnsiTextFor(numbers)).toContain("qty BETWEEN 1 AND 9");
  });

  it("computes the day after, across a month, a leap day and a year", () => {
    expect(nextDay("2026-01-31")).toBe("2026-02-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("refuses anything that is not a plain yyyy-mm-dd, and falls back to BETWEEN", () => {
    expect(nextDay("2026-01")).toBeNull();
    expect(nextDay("")).toBeNull();
    const halfTyped = query({
      filters: [{ column: "closed_on", operator: "between", value: "2026-01-01", valueTo: "2026-01" }],
    } as Partial<VisualQuery>);
    expect(unquoted(sqlOn(halfTyped, "postgres"))).toContain("BETWEEN");
  });
});

// ── 3 ────────────────────────────────────────────────────────────────────────

describe("ANSI — number bins", () => {

  it("writes FLOOR(CAST(c AS DECIMAL(31,4)) / w) * w, the same on every vendor", () => {
    const forms = EVERY_VENDOR.map((vendor) => unquoted(numericBinExpr("amount", 100, vendor)));
    expect(new Set(forms).size).withContext(forms.join(" | ")).toBe(1);
    expect(forms[0]).toBe("FLOOR(CAST(amount AS DECIMAL(31,4)) / 100) * 100");
  });

  it("bins a negative value downwards: -5 with a width of 100 falls in -100", () => {
    // Again a row no shipped sample holds: FLOOR rounds towards minus infinity,
    // so -5 belongs to the bin labelled -100 and 2 belongs to 0 - a TRUNCATE or
    // an integer division would have put both in 0.
    expect(unquoted(numericBinExpr("amount", 100, "db2"))).toBe("FLOOR(CAST(amount AS DECIMAL(31,4)) / 100) * 100");
    expect(Math.floor(-5 / 100) * 100).toBe(-100);
    expect(Math.floor(2 / 100) * 100).toBe(0);
  });

  it("prints a width of 0.1 as 0.1, never 0.30000000000000004 or 1e-7", () => {
    expect(decimalLiteral(0.1)).toBe("0.1");
    expect(decimalLiteral(0.1 + 0.2)).toBe("0.3");
    expect(decimalLiteral(1e-7)).toBe("0.0000001");
    expect(decimalLiteral(250)).toBe("250");
    expect(unquoted(numericBinExpr("amount", 0.1 + 0.2, "postgres"))).toContain("/ 0.3) * 0.3");
    expect(unquoted(numericBinExpr("amount", 1e-7, "postgres"))).not.toContain("e-");
  });

  it("bins through the generator, not through the vendor layer", () => {
    const binned = query({
      summarize: [{ aggregation: "COUNT", field: "*" }],
      groupBy: ["amount"],
      groupByNumericBuckets: { amount: { width: 25000 } },
    } as Partial<VisualQuery>);
    const ansi = oneAnsiTextFor(binned);
    expect(ansi).toContain("FLOOR(CAST(amount AS DECIMAL(31,4)) / 25000) * 25000 AS amount");
    expect(ansi).toContain("GROUP BY FLOOR(CAST(amount AS DECIMAL(31,4)) / 25000) * 25000");
  });
});

// ── 4 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — contains, starts with and ends with", () => {

  it("escapes the LIKE wildcards with ESCAPE '!' — and with a backslash, no ESCAPE, on ClickHouse", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      duckdb:     "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      postgres:   "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      mysql:      "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      mariadb:    "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      sqlserver:  "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      oracle:     "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      db2:        "LOWER(c) LIKE LOWER('%50!%!_off!!x%') ESCAPE '!'",
      // ClickHouse 24.3 has no ESCAPE clause and reads \ as its LIKE escape,
      // and \ inside a literal too - so each one is doubled.
      clickhouse: "lowerUTF8(c) LIKE lowerUTF8('%50\\\\%\\\\_off!x%')",
    })) {
      expect(containsFilter("c", "50%_off!x", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("keeps a value holding a backslash and a quote inside one literal", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      duckdb:     "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      postgres:   "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      sqlserver:  "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      oracle:     "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      db2:        "LOWER(c) LIKE LOWER('%a\\b''c%') ESCAPE '!'",
      // These three read \ inside a literal, so the backslash is doubled there
      // as well as escaped as a LIKE character on ClickHouse.
      mysql:      "LOWER(c) LIKE LOWER('%a\\\\b''c%') ESCAPE '!'",
      mariadb:    "LOWER(c) LIKE LOWER('%a\\\\b''c%') ESCAPE '!'",
      clickhouse: "lowerUTF8(c) LIKE lowerUTF8('%a\\\\\\\\b''c%')",
    })) {
      expect(containsFilter("c", "a\\b'c", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("is how the generator writes a contains filter", () => {
    const contains = query({
      filters: [{ column: "title", operator: "contains", value: "app'" }],
    } as Partial<VisualQuery>);
    for (const vendor of EVERY_VENDOR) {
      expect(sqlOn(contains, vendor)).withContext(vendor)
        .toContain(containsFilter(quoteIdent("title", vendor), "app'", vendor));
    }
  });

  // `starts with` and `ends with` escape and fold exactly as `contains` does -
  // the same value, the same ESCAPE clause, the same folding call on both
  // sides - and
  // differ in one thing: where the `%` sits. `starts with` used to write
  // `c LIKE 'v%'` on its own, so a `%` the user typed was a wildcard and
  // whether the match ignored case was the column collation's business.

  it("puts the % at the end for starts with, and escapes the wildcards in the value", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      duckdb:     "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      postgres:   "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      mysql:      "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      mariadb:    "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      sqlserver:  "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      oracle:     "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      db2:        "LOWER(c) LIKE LOWER('50!%!_off!!x%') ESCAPE '!'",
      clickhouse: "lowerUTF8(c) LIKE lowerUTF8('50\\\\%\\\\_off!x%')",
    })) {
      expect(likeFilter("c", "50%_off!x", "starts", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("puts the % at the front for ends with, and escapes the wildcards in the value", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      duckdb:     "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      postgres:   "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      mysql:      "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      mariadb:    "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      sqlserver:  "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      oracle:     "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      db2:        "LOWER(c) LIKE LOWER('%50!%!_off!!x') ESCAPE '!'",
      clickhouse: "lowerUTF8(c) LIKE lowerUTF8('%50\\\\%\\\\_off!x')",
    })) {
      expect(likeFilter("c", "50%_off!x", "ends", vendor)).withContext(vendor).toBe(expected);
    }
  });

  // ClickHouse's `lower()` folds ASCII only: `MÜNCHEN` stayed `MÜNCHEN` on
  // both sides of the LIKE, so a filter typed in lower case found nothing.
  // `lowerUTF8()` folds it. The other seven non-SQLite vendors fold Unicode in
  // `LOWER` itself; SQLite folds ASCII only and has no Unicode lower without
  // ICU, a known limit of the SQLite connection (T12), not something the
  // generator can write around.

  it("folds a non-ASCII value with lowerUTF8 on ClickHouse, and with LOWER elsewhere", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      duckdb:     "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      postgres:   "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      mysql:      "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      mariadb:    "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      // SQL Server needs the N prefix for this value (T4).
      sqlserver:  "LOWER(c) LIKE LOWER(N'%münchen ŁÓDŹ%') ESCAPE '!'",
      oracle:     "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      db2:        "LOWER(c) LIKE LOWER('%münchen ŁÓDŹ%') ESCAPE '!'",
      clickhouse: "lowerUTF8(c) LIKE lowerUTF8('%münchen ŁÓDŹ%')",
    })) {
      expect(containsFilter("c", "münchen ŁÓDŹ", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("uses that same folding call for starts with and ends with on ClickHouse", () => {
    for (const kind of ["starts", "ends"] as const) {
      const written = likeFilter("c", "München", kind, "clickhouse");
      expect(written).withContext(kind).toContain("lowerUTF8(c) LIKE lowerUTF8(");
      // `lower(` is a prefix of `lowerUTF8(`, so the ASCII-only call is looked
      // for with its own parenthesis - upper case included, because that is
      // what every other vendor writes.
      expect(written.toLowerCase()).withContext(kind).not.toContain("lower(");
    }
  });

  it("is how the generator writes a starts with and an ends with filter", () => {
    for (const [operator, kind] of [["starts_with", "starts"], ["ends_with", "ends"]] as const) {
      const filtered = query({
        filters: [{ column: "title", operator, value: "50%_off" }],
      } as Partial<VisualQuery>);
      for (const vendor of EVERY_VENDOR) {
        expect(sqlOn(filtered, vendor)).withContext(`${operator} | ${vendor}`)
          .toContain(likeFilter(quoteIdent("title", vendor), "50%_off", kind, vendor));
        // The old form, which left the value's wildcards alone and the case to
        // the collation, must not come back.
        expect(sqlOn(filtered, vendor)).withContext(`${operator} | ${vendor}`)
          .not.toContain(`${quoteIdent("title", vendor)} LIKE`);
      }
    }
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — the row cap", () => {

  it("is LIMIT, TOP or FETCH FIRST, per vendor", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     'SELECT "a" FROM "t"\nLIMIT 25',
      duckdb:     'SELECT "a" FROM "t"\nLIMIT 25',
      mysql:      'SELECT "a" FROM "t"\nLIMIT 25',
      mariadb:    'SELECT "a" FROM "t"\nLIMIT 25',
      clickhouse: 'SELECT "a" FROM "t"\nLIMIT 25',
      postgres:   'SELECT "a" FROM "t"\nFETCH FIRST 25 ROWS ONLY',
      oracle:     'SELECT "a" FROM "t"\nFETCH FIRST 25 ROWS ONLY',
      db2:        'SELECT "a" FROM "t"\nFETCH FIRST 25 ROWS ONLY',
      sqlserver:  'SELECT TOP 25 "a" FROM "t"',
    })) {
      expect(limitClause('SELECT "a" FROM "t"', 25, vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("never writes LIMIT on SQL Server, Oracle or Db2 — the three that reject it", () => {
    const capped = query({ limit: 25 });
    for (const vendor of ["sqlserver", "oracle", "db2"] as SqlDialect[]) {
      expect(sqlOn(capped, vendor)).withContext(vendor).not.toContain("LIMIT");
      expect(buildDistinctValuesSql("t", "a", 1000, vendor)).withContext(vendor).not.toContain("LIMIT");
      expect(sampleRowsSql("t", ["a"], 200, vendor)).withContext(vendor).not.toContain("LIMIT");
    }
  });

  it("puts SQL Server's TOP after DISTINCT in the filter pane's query", () => {
    expect(buildDistinctValuesSql("crm_deals", "stage", 1000, "sqlserver"))
      .toContain("SELECT DISTINCT TOP 1000 [stage]");
    expect(buildDistinctValuesSql("crm_deals", "stage", 1000, "sqlite")).toContain("LIMIT 1000");
  });

  it("leaves a query with no cap alone", () => {
    for (const vendor of EVERY_VENDOR) {
      expect(limitClause('SELECT "a" FROM "t"', 0, vendor)).withContext(vendor).toBe('SELECT "a" FROM "t"');
    }
  });
});

// ── 6 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — quoting a name and a table reference", () => {

  it("quotes one name the vendor's way, and doubles an embedded quote", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     '"a""b"',
      duckdb:     '"a""b"',
      postgres:   '"a""b"',
      clickhouse: '"a""b"',
      oracle:     '"a""b"',
      db2:        '"a""b"',
      mysql:      "`a\"b`",
      mariadb:    "`a\"b`",
      sqlserver:  '[a"b]',
    })) {
      expect(quoteIdent('a"b', vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("qualifies a table with its schema, one pair of delimiters per part", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     '"cube_demo"."crm_deals"',
      duckdb:     '"cube_demo"."crm_deals"',
      postgres:   '"cube_demo"."crm_deals"',
      clickhouse: '"cube_demo"."crm_deals"',
      oracle:     '"cube_demo"."crm_deals"',
      db2:        '"cube_demo"."crm_deals"',
      mysql:      "`cube_demo`.`crm_deals`",
      mariadb:    "`cube_demo`.`crm_deals`",
      sqlserver:  "[cube_demo].[crm_deals]",
    })) {
      expect(quoteTableRef({ schema: "cube_demo", name: "crm_deals" }, vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("leaves a reference with no schema exactly as quoteIdent writes it", () => {
    for (const vendor of EVERY_VENDOR) {
      expect(quoteTableRef({ name: "crm_deals" }, vendor)).withContext(vendor).toBe(quoteIdent("crm_deals", vendor));
      expect(quoteTableRef("crm_deals", vendor)).withContext(vendor).toBe(quoteIdent("crm_deals", vendor));
    }
  });

  it("never splits a name on a dot: a table really called Order.Details is one name", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     '"Order.Details"',
      duckdb:     '"Order.Details"',
      postgres:   '"Order.Details"',
      clickhouse: '"Order.Details"',
      oracle:     '"Order.Details"',
      db2:        '"Order.Details"',
      mysql:      "`Order.Details`",
      mariadb:    "`Order.Details`",
      sqlserver:  "[Order.Details]",
    })) {
      expect(quoteTableRef({ name: "Order.Details" }, vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("is what the generator, the four probes and the filter pane all write the table with", () => {
    const qualified = { schema: "cube_demo", name: "crm_deals" };
    for (const vendor of EVERY_VENDOR) {
      const want = `FROM ${quoteTableRef(qualified, vendor)}`;
      expect(sqlOn(query({ table: "crm_deals", tableSchema: "cube_demo" } as Partial<VisualQuery>), vendor))
        .withContext(vendor).toContain(want);
      expect(cardinalitySql(qualified, ["stage"], vendor)).withContext(vendor).toContain(want);
      expect(dateRangeSql(qualified, "closed_on", vendor)).withContext(vendor).toContain(want);
      expect(numericRangeSql(qualified, "amount", vendor)).withContext(vendor).toContain(want);
      expect(sampleRowsSql(qualified, ["stage"], 200, vendor)).withContext(vendor).toContain(want);
      expect(buildDistinctValuesSql(qualified, "stage", 1000, vendor)).withContext(vendor).toContain(want);
    }
  });

  it("quotes the probes' own aliases, so Oracle and Db2 do not fold them to MINV and MAXV", () => {
    for (const vendor of EVERY_VENDOR) {
      const minv = `AS ${quoteIdent("minv", vendor)}`;
      const maxv = `AS ${quoteIdent("maxv", vendor)}`;
      expect(dateRangeSql("crm_deals", "closed_on", vendor)).withContext(vendor).toContain(minv);
      expect(dateRangeSql("crm_deals", "closed_on", vendor)).withContext(vendor).toContain(maxv);
      expect(numericRangeSql("crm_deals", "amount", vendor)).withContext(vendor).toContain(minv);
      expect(numericRangeSql("crm_deals", "amount", vendor)).withContext(vendor).toContain(maxv);
      expect(cardinalitySql("crm_deals", ["stage"], vendor)).withContext(vendor)
        .toContain(`AS ${quoteIdent("stage", vendor)}`);
    }
  });
});

// ── 7 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — a string literal", () => {

  it("doubles the quote, and the backslash on MySQL, MariaDB and ClickHouse", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "'x'' OR 1=1 --'",
      duckdb:     "'x'' OR 1=1 --'",
      postgres:   "'x'' OR 1=1 --'",
      sqlserver:  "'x'' OR 1=1 --'",
      oracle:     "'x'' OR 1=1 --'",
      db2:        "'x'' OR 1=1 --'",
      mysql:      "'x'' OR 1=1 --'",
      mariadb:    "'x'' OR 1=1 --'",
      clickhouse: "'x'' OR 1=1 --'",
    })) {
      expect(sqlLiteral("x' OR 1=1 --", "string", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("doubles a backslash on exactly the three vendors that read it inside a literal", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "'a\\b'",
      duckdb:     "'a\\b'",
      postgres:   "'a\\b'",
      sqlserver:  "'a\\b'",
      oracle:     "'a\\b'",
      db2:        "'a\\b'",
      mysql:      "'a\\\\b'",
      mariadb:    "'a\\\\b'",
      clickhouse: "'a\\\\b'",
    })) {
      expect(sqlLiteral("a\\b", "string", vendor)).withContext(vendor).toBe(expected);
    }
  });

  // SQL Server is the one vendor whose plain `'…'` is not Unicode: it converts
  // the literal to the database code page first, so a non-Latin value never
  // matches an NVARCHAR column. `N'…'` keeps it. The prefix is written only for
  // a value that needs it - an `N'…'` against a VARCHAR column converts the
  // column instead and loses the index seek.

  it("prefixes N on SQL Server, and only there, when the value leaves ASCII", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "'Łódź'",
      duckdb:     "'Łódź'",
      postgres:   "'Łódź'",
      oracle:     "'Łódź'",
      db2:        "'Łódź'",
      mysql:      "'Łódź'",
      mariadb:    "'Łódź'",
      clickhouse: "'Łódź'",
      sqlserver:  "N'Łódź'",
    })) {
      expect(sqlLiteral("Łódź", "string", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("leaves an ASCII value alone on all nine, SQL Server included", () => {
    for (const vendor of EVERY_VENDOR) {
      expect(sqlLiteral("Lodz", "string", vendor)).withContext(vendor).toBe("'Lodz'");
    }
  });

  it("carries the prefix into a filter value and into a LIKE pattern", () => {
    const filtered = query({
      filters: [{ column: "city", operator: "equals", value: "Łódź" }],
    } as Partial<VisualQuery>);
    expect(sqlOn(filtered, "sqlserver")).toContain("= N'Łódź'");
    expect(containsFilter("c", "Łódź", "sqlserver")).toBe("LOWER(c) LIKE LOWER(N'%Łódź%') ESCAPE '!'");
    // The other eight keep the plain literal, in the filter and in the pattern.
    for (const vendor of EVERY_VENDOR.filter((v) => v !== "sqlserver")) {
      expect(sqlOn(filtered, vendor)).withContext(vendor).not.toContain("N'Łódź'");
      expect(containsFilter("c", "Łódź", vendor)).withContext(vendor).not.toContain("N'");
    }
  });

  it("is what every filter value in the generated SQL goes through", () => {
    const filtered = query({
      filters: [{ column: "title", operator: "equals", value: "x' OR 1=1 --" }],
    } as Partial<VisualQuery>);
    for (const vendor of EVERY_VENDOR) {
      expect(sqlOn(filtered, vendor)).withContext(vendor).toContain("'x'' OR 1=1 --'");
    }
  });
});

// ── 8 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — a date, a timestamp and a boolean literal", () => {

  it("writes a date literal the vendor's way", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "'2026-01-31'",
      sqlserver:  "'2026-01-31'",
      clickhouse: "toDate('2026-01-31')",
      duckdb:     "DATE '2026-01-31'",
      postgres:   "DATE '2026-01-31'",
      mysql:      "DATE '2026-01-31'",
      mariadb:    "DATE '2026-01-31'",
      oracle:     "DATE '2026-01-31'",
      db2:        "DATE '2026-01-31'",
    })) {
      expect(sqlLiteral("2026-01-31", "date", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("writes a timestamp literal the vendor's way — the 14:05 row BETWEEN used to drop", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "'2026-01-31 14:05:00'",
      sqlserver:  "'2026-01-31 14:05:00'",
      clickhouse: "toDateTime('2026-01-31 14:05:00')",
      duckdb:     "TIMESTAMP '2026-01-31 14:05:00'",
      postgres:   "TIMESTAMP '2026-01-31 14:05:00'",
      mysql:      "TIMESTAMP '2026-01-31 14:05:00'",
      mariadb:    "TIMESTAMP '2026-01-31 14:05:00'",
      oracle:     "TIMESTAMP '2026-01-31 14:05:00'",
      db2:        "TIMESTAMP '2026-01-31 14:05:00'",
    })) {
      expect(sqlLiteral("2026-01-31 14:05:00", "timestamp", vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("writes TRUE and FALSE where they are understood, and 1 and 0 where they are not", () => {
    for (const [vendor, expected] of eachVendor({
      postgres:   "TRUE",
      duckdb:     "TRUE",
      mysql:      "TRUE",
      mariadb:    "TRUE",
      clickhouse: "TRUE",
      sqlite:     "1",
      sqlserver:  "1",
      oracle:     "1",
      db2:        "1",
    })) {
      expect(sqlLiteral("true", "boolean", vendor)).withContext(vendor).toBe(expected);
      expect(sqlLiteral("false", "boolean", vendor)).withContext(vendor)
        .toBe(expected === "TRUE" ? "FALSE" : "0");
    }
  });

  it("is what the generator compares a boolean column against", () => {
    const flag = query({
      filters: [{ column: "is_won", operator: "equals", value: "true" }],
    } as Partial<VisualQuery>);
    for (const vendor of EVERY_VENDOR) {
      expect(sqlOn(flag, vendor)).withContext(vendor)
        .toContain(`= ${sqlLiteral("true", "boolean", vendor)}`);
    }
  });

  it("compares a number column against a bare number, and half-typed input against a string", () => {
    const typed = query({ filters: [{ column: "qty", operator: "equals", value: "42" }] } as Partial<VisualQuery>);
    const halfTyped = query({ filters: [{ column: "qty", operator: "equals", value: "4x" }] } as Partial<VisualQuery>);
    expect(oneAnsiTextFor(typed)).toContain("qty = 42");
    expect(oneAnsiTextFor(halfTyped)).toContain("qty = '4x'");
  });
});

// ── 9 ────────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — date buckets and date parts", () => {

  it("decodes a SQLite epoch-ms column, and nothing else does", () => {
    const sqlite = bucketExpr("created_at", "month", "sqlite");
    expect(sqlite).toContain("typeof(");
    expect(sqlite).toContain("unixepoch");
    // 1e11 separates ms from seconds: 1e11 ms is 1973-03-03, so a 1996
    // timestamp (about 8.2e11 ms) is read as milliseconds. The old 1e12
    // threshold read it as seconds and put it in 1970.
    expect(sqlite).toContain("100000000000");
    expect(new Date(820454400000).getUTCFullYear()).toBe(1996);
    expect(820454400000 > 100000000000).toBe(true);
    for (const vendor of EVERY_VENDOR.filter((v) => v !== "sqlite")) {
      const other = bucketExpr("created_at", "month", vendor);
      expect(other).withContext(vendor).not.toContain("typeof(");
      expect(other).withContext(vendor).not.toContain("unixepoch");
      expect(other).withContext(vendor).not.toContain("datetime(");
    }
  });

  it("writes the ISO week, never the calendar year beside an ISO week number", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "strftime('%G-W%V', ",
      duckdb:     "strftime(\"created_at\", '%G-W%V')",
      postgres:   "TO_CHAR(\"created_at\", 'IYYY-\"W\"IW')",
      mysql:      "DATE_FORMAT(`created_at`, '%x-W%v')",
      mariadb:    "DATE_FORMAT(`created_at`, '%x-W%v')",
      clickhouse: "formatDateTime(toMonday(\"created_at\"), '%G-W%V')",
      sqlserver:  "DATEPART(ISO_WEEK, [created_at])",
      oracle:     "TO_CHAR(\"created_at\", 'IYYY') || '-W' || TO_CHAR(\"created_at\", 'IW')",
      db2:        "TO_CHAR(\"created_at\", 'IYYY') || '-W' || TO_CHAR(\"created_at\", 'IW')",
    })) {
      expect(bucketExpr("created_at", "week", vendor)).withContext(vendor).toContain(expected);
    }
    // SQL Server has no ISO-year datepart, so the year comes from a day inside
    // the ISO year itself; DATEPART(YEAR, d) beside ISO_WEEK called 2024-12-30
    // "2024-W01".
    expect(bucketExpr("created_at", "week", "sqlserver"))
      .toContain("DATEADD(DAY, 26 - DATEPART(ISO_WEEK, [created_at]), [created_at])");
  });

  it("writes the quarter with the vendor's own quarter function", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "(CAST(strftime('%m', ",
      duckdb:     "CAST(quarter(\"created_at\") AS VARCHAR)",
      postgres:   "TO_CHAR(\"created_at\", 'Q')",
      mysql:      "QUARTER(`created_at`)",
      mariadb:    "QUARTER(`created_at`)",
      clickhouse: "toQuarter(\"created_at\")",
      sqlserver:  "DATEPART(QUARTER, [created_at])",
      oracle:     "TO_CHAR(\"created_at\", 'Q')",
      db2:        "TO_CHAR(\"created_at\", 'Q')",
    })) {
      expect(bucketExpr("created_at", "quarter", vendor)).withContext(vendor).toContain(expected);
    }
  });

  it("reads the hour of a DATE column with the form its vendor accepts - four of them reject the plain one", () => {
    for (const [vendor, expected] of eachVendor({
      oracle:     "TO_NUMBER(TO_CHAR(\"created_at\", 'HH24'))",
      db2:        "TO_NUMBER(TO_CHAR(\"created_at\", 'HH24'))",
      sqlite:     "CAST(strftime('%H', ",
      duckdb:     "CAST(hour(\"created_at\") AS INTEGER)",
      postgres:   "EXTRACT(HOUR FROM CAST(\"created_at\" AS TIMESTAMP))::INTEGER",
      mysql:      "HOUR(`created_at`)",
      mariadb:    "HOUR(`created_at`)",
      clickhouse: "toHour(toDateTime(\"created_at\"))",
      sqlserver:  "DATEPART(HOUR, CAST([created_at] AS DATETIME2))",
    })) {
      expect(bucketExpr("created_at", "hour-of-day", vendor)).withContext(vendor).toContain(expected);
    }
    // Every one of the four was refused by the database itself on a DATE column,
    // in the vendor loop and then by hand: Oracle and Db2 "invalid extract field
    // for extract source", PostgreSQL 'unit "hour" not supported for type date',
    // SQL Server "The datepart hour is not supported by date function datepart
    // for data type date", ClickHouse "Illegal type Date32 of argument of
    // function toHour". The plain form must not come back on any of them.
    for (const vendor of ["oracle", "db2"] as SqlDialect[]) {
      expect(bucketExpr("created_at", "hour-of-day", vendor)).withContext(vendor).not.toContain("EXTRACT(HOUR");
    }
    expect(bucketExpr("created_at", "hour-of-day", "postgres")).not.toContain("EXTRACT(HOUR FROM \"created_at\")");
    expect(bucketExpr("created_at", "hour-of-day", "clickhouse")).not.toContain("toHour(\"created_at\")");
    expect(bucketExpr("created_at", "hour-of-day", "sqlserver")).not.toContain("DATEPART(HOUR, [created_at])");
  });

  it("writes the day of the week so that no session setting can move it", () => {
    // 0..6 with Sunday 0 on all nine, and two of them used to depend on the
    // session: SQL Server's `DATEPART(WEEKDAY, c)` counts from whatever `SET
    // DATEFIRST` says (the login's language sets it), and Oracle's `TO_CHAR(c,
    // 'D')` counts from whatever `NLS_TERRITORY` says - so the same Monday came
    // back as Monday for one login and as Sunday for another. `@@DATEFIRST` is
    // the setting itself, so adding it back cancels it; Oracle counts from the
    // Monday of the ISO week, which no territory moves; Db2 has `DAYOFWEEK`,
    // where 1 = Sunday by definition.
    for (const [vendor, expected] of eachVendor({
      sqlite:     "CAST(strftime('%w', ",
      duckdb:     "CAST(dayofweek(\"created_at\") AS INTEGER)",
      postgres:   "EXTRACT(DOW FROM \"created_at\")::INTEGER",
      mysql:      "DAYOFWEEK(`created_at`) - 1",
      mariadb:    "DAYOFWEEK(`created_at`) - 1",
      clickhouse: "(toDayOfWeek(\"created_at\") % 7)",
      sqlserver:  "(DATEPART(WEEKDAY, [created_at]) + @@DATEFIRST - 1) % 7",
      oracle:     "MOD(TRUNC(\"created_at\") - TRUNC(\"created_at\", 'IW') + 1, 7)",
      db2:        "DAYOFWEEK(\"created_at\") - 1",
    })) {
      expect(bucketExpr("created_at", "day-of-week", vendor)).withContext(vendor).toContain(expected);
    }
    // The two session-dependent forms must not come back.
    expect(bucketExpr("created_at", "day-of-week", "sqlserver"))
      .not.toContain("DATEPART(WEEKDAY, [created_at]) - 1");
    for (const vendor of ["oracle", "db2"] as SqlDialect[]) {
      expect(bucketExpr("created_at", "day-of-week", vendor)).withContext(vendor)
        .not.toContain("TO_CHAR(\"created_at\", 'D')");
    }
    // Oracle and Db2 no longer share this one form, although they share every
    // other bucket: Db2 has no `TRUNC(c, 'IW')`.
    expect(bucketExpr("created_at", "day-of-week", "oracle"))
      .not.toBe(bucketExpr("created_at", "day-of-week", "db2"));
  });

  it("writes the day bucket as a sortable yyyy-mm-dd label", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "strftime('%Y-%m-%d', ",
      duckdb:     "strftime(\"created_at\", '%Y-%m-%d')",
      postgres:   "TO_CHAR(\"created_at\", 'YYYY-MM-DD')",
      mysql:      "DATE_FORMAT(`created_at`, '%Y-%m-%d')",
      mariadb:    "DATE_FORMAT(`created_at`, '%Y-%m-%d')",
      clickhouse: "formatDateTime(\"created_at\", '%F')",
      sqlserver:  "CONVERT(VARCHAR(10), [created_at], 23)",
      oracle:     "TO_CHAR(\"created_at\", 'YYYY-MM-DD')",
      db2:        "TO_CHAR(\"created_at\", 'YYYY-MM-DD')",
    })) {
      expect(bucketExpr("created_at", "day", vendor)).withContext(vendor).toContain(expected);
    }
  });

  it("writes the month bucket as a sortable yyyy-mm label, and never through FORMAT", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "strftime('%Y-%m', ",
      duckdb:     "strftime(\"created_at\", '%Y-%m')",
      postgres:   "TO_CHAR(\"created_at\", 'YYYY-MM')",
      mysql:      "DATE_FORMAT(`created_at`, '%Y-%m')",
      mariadb:    "DATE_FORMAT(`created_at`, '%Y-%m')",
      clickhouse: "formatDateTime(\"created_at\", '%Y-%m')",
      sqlserver:  "LEFT(CONVERT(VARCHAR(10), [created_at], 23), 7)",
      oracle:     "TO_CHAR(\"created_at\", 'YYYY-MM')",
      db2:        "TO_CHAR(\"created_at\", 'YYYY-MM')",
    })) {
      expect(bucketExpr("created_at", "month", vendor)).withContext(vendor).toContain(expected);
    }
    // SQL Server's `FORMAT()` is a CLR call made once per row; the day, month
    // and year labels are the same three strings through `CONVERT` style 23,
    // which the query processor does itself. No bucket may call it again.
    for (const bucket of ["day", "week", "month", "quarter", "year",
                          "day-of-week", "hour-of-day", "month-of-year", "quarter-of-year"] as const) {
      expect(bucketExpr("created_at", bucket, "sqlserver")).withContext(bucket)
        .not.toContain("FORMAT(");
    }
  });

  it("writes the year bucket as the four-digit year", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "strftime('%Y', ",
      duckdb:     "strftime(\"created_at\", '%Y')",
      postgres:   "TO_CHAR(\"created_at\", 'YYYY')",
      mysql:      "DATE_FORMAT(`created_at`, '%Y')",
      mariadb:    "DATE_FORMAT(`created_at`, '%Y')",
      clickhouse: "toString(toYear(\"created_at\"))",
      sqlserver:  "LEFT(CONVERT(VARCHAR(10), [created_at], 23), 4)",
      oracle:     "TO_CHAR(\"created_at\", 'YYYY')",
      db2:        "TO_CHAR(\"created_at\", 'YYYY')",
    })) {
      expect(bucketExpr("created_at", "year", vendor)).withContext(vendor).toContain(expected);
    }
  });

  it("writes the month of the year as a number, 1..12", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "CAST(strftime('%m', ",
      duckdb:     "CAST(month(\"created_at\") AS INTEGER)",
      postgres:   "EXTRACT(MONTH FROM \"created_at\")::INTEGER",
      mysql:      "MONTH(`created_at`)",
      mariadb:    "MONTH(`created_at`)",
      clickhouse: "toMonth(\"created_at\")",
      sqlserver:  "DATEPART(MONTH, [created_at])",
      oracle:     "EXTRACT(MONTH FROM \"created_at\")",
      db2:        "EXTRACT(MONTH FROM \"created_at\")",
    })) {
      expect(bucketExpr("created_at", "month-of-year", vendor)).withContext(vendor).toContain(expected);
    }
    // The month of the year is a number to chart by, not the '2026-02' label the
    // month bucket writes.
    for (const vendor of EVERY_VENDOR) {
      expect(bucketExpr("created_at", "month-of-year", vendor)).withContext(vendor)
        .not.toBe(bucketExpr("created_at", "month", vendor));
    }
  });

  it("writes the quarter of the year as a number, 1..4", () => {
    for (const [vendor, expected] of eachVendor({
      sqlite:     "((CAST(strftime('%m', ",
      duckdb:     "CAST(quarter(\"created_at\") AS INTEGER)",
      postgres:   "EXTRACT(QUARTER FROM \"created_at\")::INTEGER",
      mysql:      "QUARTER(`created_at`)",
      mariadb:    "QUARTER(`created_at`)",
      clickhouse: "toQuarter(\"created_at\")",
      sqlserver:  "DATEPART(QUARTER, [created_at])",
      oracle:     "TO_NUMBER(TO_CHAR(\"created_at\", 'Q'))",
      db2:        "TO_NUMBER(TO_CHAR(\"created_at\", 'Q'))",
    })) {
      expect(bucketExpr("created_at", "quarter-of-year", vendor)).withContext(vendor).toContain(expected);
    }
    // And not the '2026-Q1' label the quarter bucket writes.
    for (const vendor of EVERY_VENDOR) {
      expect(bucketExpr("created_at", "quarter-of-year", vendor)).withContext(vendor)
        .not.toContain("-Q");
    }
  });
});

// ── 10 ───────────────────────────────────────────────────────────────────────

describe("the committed AI Hub SQL is current", () => {

  const { cases } = readAiHubCases();
  const generated = readGeneratedAiHubSql();
  const rewrite = "Rewrite it with: docker run --rm -v <repo>:/x -w /x/frend/reporting node:20-slim"
    + " npx ts-node -r tsconfig-paths/register --project e2e/tsconfig.e2e.json"
    + " e2e/explore-data/write-ai-hub-sql.ts";

  it("holds every case, and only the cases", () => {
    expect(Object.keys(generated).sort()).withContext(rewrite).toEqual(cases.map((one) => one.id).sort());
  });

  it("holds the SQL the generator writes today, for every case and every vendor", () => {
    for (const one of cases) {
      for (const vendor of EVERY_VENDOR) {
        expect(generated[one.id]?.[vendor]).withContext(`${one.id} | ${vendor}. ${rewrite}`)
          .toBe(buildAiHubCaseSql(one, vendor));
      }
    }
  });

  it("gives every case a group, a reason and one answer", () => {
    for (const one of cases) {
      expect(["A", "B", "C", "D"]).withContext(one.id).toContain(one.group);
      expect(one.proves.length).withContext(one.id).toBeGreaterThan(10);
      // Group D is the user's own SQL and holds `sql` instead of a query, a probe or a
      // filter pane: nothing is built for it, which is what it proves.
      const shapes = [one.query, one.probe, one.filterPane, one.sql].filter(Boolean).length;
      expect(shapes).withContext(`${one.id} holds one of query, probe, filterPane, sql`).toBe(1);
      expect(one.sql === undefined).withContext(`${one.id}: only group D carries its own SQL`)
        .toBe(one.group !== "D");
      const answers = [one.rows, one.rowCount].filter((a) => a !== undefined).length;
      expect(answers).withContext(`${one.id} holds rows or rowCount`).toBe(1);
    }
  });
});

// ── 11 ───────────────────────────────────────────────────────────────────────

describe("VENDOR LAYER — a column reference under its own alias", () => {

  // A time bucket and a numeric bin are put in the SELECT list aliased with the
  // column's own name (`… AS "opened_date"`), which is what ClickHouse resolves
  // the reference inside the expression back to - so there, and only there, the
  // reference is qualified with its table.

  const plainRef = {
    sqlite:     "\"opened_date\"",
    duckdb:     "\"opened_date\"",
    postgres:   "\"opened_date\"",
    mysql:      "`opened_date`",
    mariadb:    "`opened_date`",
    clickhouse: "\"opened_date\"",
    sqlserver:  "[opened_date]",
    oracle:     "\"opened_date\"",
    db2:        "\"opened_date\"",
  };

  it("qualifies the column with its table on ClickHouse, and on no other vendor", () => {
    for (const [vendor, expected] of eachVendor({
      ...plainRef,
      clickhouse: "\"support_tickets\".\"opened_date\"",
    })) {
      expect(aliasSafeColumnRef("opened_date", { name: "support_tickets" }, vendor))
        .withContext(vendor).toBe(expected);
    }
  });

  it("is the plain reference on every vendor when there is no table to qualify with", () => {
    for (const [vendor, expected] of eachVendor(plainRef)) {
      expect(aliasSafeColumnRef("opened_date", undefined, vendor)).withContext(vendor).toBe(expected);
    }
  });

  it("carries the qualifier into the bucket and the bin, and leaves the other vendors' alone", () => {
    expect(bucketExpr("opened_date", "month", "clickhouse", { name: "support_tickets" }))
      .toBe("formatDateTime(\"support_tickets\".\"opened_date\", '%Y-%m')");
    expect(bucketExpr("opened_date", "month", "postgres", { name: "support_tickets" }))
      .toBe("TO_CHAR(\"opened_date\", 'YYYY-MM')");
    expect(numericBinExpr("amount", 25000, "clickhouse", { name: "crm_deals" }))
      .toBe("FLOOR(CAST(\"crm_deals\".\"amount\" AS DECIMAL(31,4)) / 25000) * 25000");
    expect(numericBinExpr("amount", 25000, "postgres", { name: "crm_deals" }))
      .toBe("FLOOR(CAST(\"amount\" AS DECIMAL(31,4)) / 25000) * 25000");
  });

  it("puts it in the SELECT and the GROUP BY of a ClickHouse query, and in nobody else's", () => {
    const monthly = query({
      summarize: [{ aggregation: "COUNT", field: "*" }],
      groupBy: ["created_at"],
      groupByBuckets: { created_at: "month" },
    } as Partial<VisualQuery>);

    const clickhouse = sqlOn(monthly, "clickhouse");
    expect(clickhouse).toContain("formatDateTime(\"crm_deals\".\"created_at\", '%Y-%m') AS \"created_at\"");
    expect(clickhouse).toContain("GROUP BY formatDateTime(\"crm_deals\".\"created_at\", '%Y-%m')");

    // Without the qualifier ClickHouse reads the alias instead of the column and
    // refuses the query: "Illegal type String of argument of function toYear".
    expect(clickhouse).not.toContain("formatDateTime(\"created_at\"");

    const postgres = sqlOn(monthly, "postgres");
    expect(postgres).toContain("TO_CHAR(\"created_at\", 'YYYY-MM') AS \"created_at\"");
    expect(postgres).not.toContain("\"crm_deals\".\"created_at\"");
  });
});

// ── 12 ───────────────────────────────────────────────────────────────────────

describe("ANSI — every filter operator the Filter step offers", () => {

  // The Filter step's four operator dropdowns are `lib/explore-data/filter-operators.ts`,
  // and this block walks them: every operator the UI offers must have a case in
  // the generator. An operator added to a list without one used to fall through
  // to the generator's `default:` branch and silently become an equality test,
  // which no test could see - so here every operator is compared with what
  // `equals` writes for the same column and value, on all nine vendor keys.

  /** The column each dropdown belongs to, with a value a user could type. */
  const LISTS: { name: string; ops: readonly OperatorDef[]; column: string; value: string; valueTo: string }[] = [
    { name: "string",  ops: STRING_OPS,  column: "title",     value: "Acme",       valueTo: "Zeta" },
    { name: "number",  ops: NUMBER_OPS,  column: "amount",    value: "100",        valueTo: "200" },
    { name: "date",    ops: DATE_OPS,    column: "closed_on", value: "2026-02-19", valueTo: "2026-03-01" },
    { name: "boolean", ops: BOOLEAN_OPS, column: "is_won",    value: "true",       valueTo: "false" },
  ];

  /** The value an operator needs when the dropdown's own value is not one it
   *  can use: the relative "last N" date operators take a count of periods
   *  (F1, block 19), so walking them with a date would leave them out of the
   *  WHERE - which is exactly what an unusable count is supposed to do. */
  const VALUE_FOR_OP: Record<string, string> = {
    last_n_days: "30", last_n_weeks: "4", last_n_months: "3",
  };

  function filterQuery(filters: Record<string, string>[]): VisualQuery {
    return query({ filters } as Partial<VisualQuery>);
  }

  /** The WHERE clause of this query, or null when it wrote none. */
  function whereOn(filters: Record<string, string>[], vendor: SqlDialect): string | null {
    const parts = sqlOn(filterQuery(filters), vendor).split("\nWHERE ");
    return parts.length > 1 ? parts[1].split("\nGROUP BY ")[0].split("\nORDER BY ")[0] : null;
  }

  function oneFilterWhere(filter: Record<string, string>, vendor: SqlDialect): string | null {
    return whereOn([filter], vendor);
  }

  it("offers exactly the four dropdowns this block walks", () => {
    expect(ALL_OPERATOR_LISTS.length).withContext("a new operator list needs a case here").toBe(LISTS.length);
    for (const list of LISTS) {
      expect(ALL_OPERATOR_LISTS).withContext(list.name).toContain(list.ops);
    }
  });

  it("writes SQL for every operator, and never falls through to the equality default", () => {
    for (const list of LISTS) {
      for (const op of list.ops) {
        for (const vendor of EVERY_VENDOR) {
          const filter = { column: list.column, operator: op.value,
            value: VALUE_FOR_OP[op.value] ?? list.value, valueTo: list.valueTo };
          const written = oneFilterWhere(filter, vendor);
          expect(written).withContext(`${list.name} ${op.value} | ${vendor}`).not.toBeNull();
          if (op.value === "equals") continue;
          const asEquals = oneFilterWhere({ ...filter, operator: "equals" }, vendor);
          expect(written)
            .withContext(`${list.name} ${op.value} | ${vendor}: the generator has no case for it,`
              + " so it fell through to `default:` and became an equality test")
            .not.toBe(asEquals!);
        }
      }
    }
  });

  it("writes one text on every vendor for every operator of the string and number dropdowns", () => {
    // The date and boolean dropdowns are left out on purpose: a date literal
    // and a boolean literal ARE vendor forms (`sqlLiteral`, block 6), and the
    // specs below hold the generator to composing them, never to writing one.
    // The three LIKE filters are left out for the same reason: their ESCAPE
    // clause is the vendor layer's (`likeFilter`, block 4 - ClickHouse has no
    // ESCAPE clause at all and escapes with a backslash instead).
    const LIKE_OPS = ["contains", "starts_with", "ends_with"];
    for (const list of LISTS.filter((l) => l.name === "string" || l.name === "number")) {
      for (const op of list.ops.filter((one) => !LIKE_OPS.includes(one.value))) {
        const text = oneAnsiTextFor(filterQuery(
          [{ column: list.column, operator: op.value, value: list.value, valueTo: list.valueTo }]));
        expect(text).withContext(`${list.name} ${op.value}`).toContain("WHERE ");
      }
    }
  });

  it("joins two filters with AND", () => {
    expect(oneAnsiTextFor(filterQuery([
      { column: "amount", operator: "greater_than", value: "100" },
      { column: "title", operator: "equals", value: "Acme" },
    ]))).toContain("WHERE amount > 100\n  AND title = 'Acme'");
  });

  it("writes >, >=, < and <= on a number", () => {
    for (const [operator, expected] of [
      ["greater_than", "amount > 100"],
      ["greater_or_equal", "amount >= 100"],
      ["less_than", "amount < 100"],
      ["less_or_equal", "amount <= 100"],
    ]) {
      expect(oneAnsiTextFor(filterQuery([{ column: "amount", operator, value: "100" }])))
        .withContext(operator).toContain(`WHERE ${expected}`);
    }
  });

  it("writes <>, and never !=, for not equals", () => {
    for (const list of LISTS.filter((l) => l.ops.some((op) => op.value === "not_equals"))) {
      for (const vendor of EVERY_VENDOR) {
        const written = oneFilterWhere(
          { column: list.column, operator: "not_equals", value: list.value }, vendor)!;
        // Not on a date: there, not-equals is the whole day the user picked, so
        // it is written as a range and holds no comparison at all (block 13).
        if (list.name !== "date") expect(written).withContext(`${list.name} | ${vendor}`).toContain(" <> ");
        // `!=` is understood by all nine, but it is not standard SQL. The UI's
        // label for this operator still reads `!=`; the SQL must not.
        expect(written).withContext(`${list.name} | ${vendor}`).not.toContain("!=");
      }
    }
    expect(STRING_OPS.find((op) => op.value === "not_equals")?.label).toBe("!=");
  });

  it("compares a date column through dateExpr, against the vendor's own date literals", () => {
    // Each of the six is the whole day the user picked, not the instant at
    // midnight (block 13 holds the shape; here it is the composition: the LHS is
    // the layer's `dateExpr`, both bounds are the layer's date literals, and the
    // day after comes from `nextDay`).
    const c = (vendor: SqlDialect) => dateExpr("closed_on", vendor);
    const d = (vendor: SqlDialect) => sqlLiteral("2026-02-19", "date", vendor);
    const d1 = (vendor: SqlDialect) => sqlLiteral(nextDay("2026-02-19"), "date", vendor);
    for (const [operator, form] of [
      ["equals", (v: SqlDialect) => `${c(v)} >= ${d(v)} AND ${c(v)} < ${d1(v)}`],
      ["not_equals", (v: SqlDialect) => `(${c(v)} < ${d(v)} OR ${c(v)} >= ${d1(v)})`],
      ["greater_than", (v: SqlDialect) => `${c(v)} >= ${d1(v)}`],
      ["greater_or_equal", (v: SqlDialect) => `${c(v)} >= ${d(v)}`],
      ["less_than", (v: SqlDialect) => `${c(v)} < ${d(v)}`],
      ["less_or_equal", (v: SqlDialect) => `${c(v)} < ${d1(v)}`],
    ] as const) {
      for (const vendor of EVERY_VENDOR) {
        expect(oneFilterWhere({ column: "closed_on", operator, value: "2026-02-19" }, vendor))
          .withContext(`${operator} | ${vendor}`).toBe(form(vendor));
      }
    }
  });

  it("reads `between` on a date as >= the first day and < the day after the last", () => {
    for (const vendor of EVERY_VENDOR) {
      expect(oneFilterWhere(
        { column: "closed_on", operator: "between", value: "2026-02-19", valueTo: "2026-03-01" }, vendor))
        .withContext(vendor)
        .toBe(`${dateExpr("closed_on", vendor)} >= ${sqlLiteral("2026-02-19", "date", vendor)}`
          + ` AND ${dateExpr("closed_on", vendor)} < ${sqlLiteral(nextDay("2026-03-01"), "date", vendor)}`);
    }
  });

  it("writes IN and NOT IN with one list of literals", () => {
    expect(oneAnsiTextFor(filterQuery([{ column: "title", operator: "in", value: "Acme, Zeta" }])))
      .toContain("WHERE title IN ('Acme', 'Zeta')");
    expect(oneAnsiTextFor(filterQuery([{ column: "title", operator: "not_in", value: "Acme, Zeta" }])))
      .toContain("WHERE title NOT IN ('Acme', 'Zeta')");
    expect(oneAnsiTextFor(filterQuery([{ column: "amount", operator: "in", value: " 100 ,200, " }])))
      .toContain("WHERE amount IN (100, 200)");
  });

  it("asks IS NULL / IS NOT NULL of the raw column, never through dateExpr", () => {
    for (const vendor of EVERY_VENDOR) {
      for (const [operator, expected] of [["is_null", "IS NULL"], ["is_not_null", "IS NOT NULL"]]) {
        // A NULL is a NULL whatever the column holds, and on SQLite `dateExpr`
        // wraps the column in a CASE that answers a value for a NULL row.
        expect(oneFilterWhere({ column: "closed_on", operator }, vendor))
          .withContext(`${operator} | ${vendor}`)
          .toBe(`${quoteIdent("closed_on", vendor)} ${expected}`);
      }
    }
  });

  it("counts the column for COUNT of a column, and the rows for COUNT(*)", () => {
    expect(oneAnsiTextFor(query({
      summarize: [
        { aggregation: "COUNT", field: "closed_on" },
        { aggregation: "COUNT", field: "*" },
      ],
    } as Partial<VisualQuery>)))
      .toContain("SELECT COUNT(closed_on) AS closed_on_count, COUNT(*) AS count");
  });

  it("gives every operator that can be bound to a parameter its cube query name, in one place", () => {
    // A cube's native `condition 'OrderDate', 'between', fromDate, toDate` (R1) is added to the
    // query as a chip's filter is, and the two speak the same comparisons under two spellings.
    // The map is `CUBE_QUERY_OPERATORS` and nowhere else; the server's own list
    // (`CubeRules.QUERY_OPERATORS`) is compared with this file by a JUnit, so a name added on one
    // side and not the other is a red test rather than a condition nobody can write.
    for (const operator of Array.from(PARAM_BINDABLE_OPS)) {
      expect(cubeQueryOperator(operator))
        .withContext(`${operator} can bind a parameter but has no cube form`).toBeDefined();
    }
    expect(CUBE_QUERY_OPERATORS["not_equals"]).toBe("notEquals");
    expect(CUBE_QUERY_OPERATORS["greater_or_equal"]).toBe("gte");
    expect(CUBE_QUERY_OPERATORS["less_than"]).toBe("lt");
    // A cube says what a row has: `set` is IS NOT NULL, so the two null checks cross over.
    expect(CUBE_QUERY_OPERATORS["is_not_null"]).toBe("set");
    expect(CUBE_QUERY_OPERATORS["is_null"]).toBe("notSet");
    // The LIKE family and the relative dates have no cube form of their own: a cube writes
    // `contains`, and a relative period is computed into a `between` before it is asked.
    expect(cubeQueryOperator("starts_with")).toBeUndefined();
    expect(cubeQueryOperator("this_quarter")).toBeUndefined();
  });

  it("leaves a dashboard parameter verbatim, for every operator that can be bound to one", () => {
    for (const operator of Array.from(PARAM_BINDABLE_OPS)) {
      // `between` has two value boxes and binds a parameter to each (F8, block
      // 21); every other operator has one.
      const second = operator === "between" ? { valueTo: "${p_to}" } : {};
      const written = oneFilterWhere(
        { column: "amount", operator, value: "${p_value}", ...second }, "postgres")!;
      expect(written).withContext(operator).toContain("${p_value}");
      // The placeholder goes to the backend as it stands: quoted, or turned
      // into a date, it would never be bound.
      expect(written).withContext(operator).not.toContain("'${p_value}'");
      if (operator === "between") expect(written).withContext(operator).toContain("${p_to}");
    }
    expect(oneFilterWhere({ column: "amount", operator: "equals", value: "${p_value}" }, "postgres"))
      .toBe("\"amount\" = ${p_value}");
    expect(oneFilterWhere({ column: "title", operator: "in", value: "${p_list}" }, "postgres"))
      .toBe("\"title\" IN (${p_list})");
  });

  it("leaves a filter whose value box is empty out of the WHERE (every operator that takes a value)", () => {
    // The owner, 2026-09-27: an empty value box asks nothing, so the query
    // answers with every row while the user is still typing.
    for (const list of LISTS) {
      for (const op of list.ops.filter((one) => !NO_VALUE_OPS.includes(one.value))) {
        for (const empty of ["", "   "]) {
          const written = whereOn([{ column: list.column, operator: op.value, value: empty }], "postgres");
          if (op.value === "in" || op.value === "not_in") {
            // `in` / `not in` have always written this, and their committed SQL
            // must not change: the outcome is the same.
            expect(written).withContext(`${list.name} ${op.value}`).toBe("1=1");
          } else {
            expect(written).withContext(`${list.name} ${op.value} with an empty value box`).toBeNull();
          }
        }
      }
    }
    // `between` is half-typed until both bounds are there.
    expect(whereOn([{ column: "amount", operator: "between", value: "100", valueTo: "" }], "postgres")).toBeNull();
    expect(whereOn([{ column: "amount", operator: "between", value: "", valueTo: "200" }], "postgres")).toBeNull();
    // The one filter that is still asked stays, and is the whole WHERE.
    expect(whereOn([
      { column: "title", operator: "equals", value: "" },
      { column: "amount", operator: "greater_than", value: "100" },
    ], "postgres")).toBe("\"amount\" > 100");
  });

  it("asks the null checks whatever is in the value box, because they take none", () => {
    for (const operator of NO_VALUE_OPS) {
      expect(whereOn([{ column: "title", operator, value: "" }], "postgres"))
        .withContext(operator).not.toBeNull();
    }
  });
});

// ── 18 ───────────────────────────────────────────────────────────────────────
//
// Block 18 is P1's, written after 13-17 existed: the numbers are labels, not
// positions in the file.

describe("ANSI \u2014 a dashboard parameter travels with its declared type", () => {
  // The value of a dashboard parameter is text whatever it means: a date picker writes
  // `2026-01-31`, a number box writes `100.5`. Bound as text, `close_date <= :to` is an
  // error on PostgreSQL and a guess everywhere else - so the type the dashboard already
  // declares travels beside the value, and the backend binds it as that type.

  const CONFIG = {
    parameters: [
      { id: "to", type: "Date" },
      { id: "ts", type: "DateTime" },
      { id: "min", type: "Integer" },
      { id: "note", type: "String" },
    ],
  };

  it("reads the declared type of every parameter, from the same Map the ids come from", () => {
    expect(extractParamTypes(CONFIG.parameters))
      .toEqual({ to: "Date", ts: "DateTime", min: "Integer", note: "String" });
    // The two read one Map, so a parameter can never have an id here and a type nowhere.
    expect(Object.keys(extractParamTypes(CONFIG.parameters))).toEqual(extractParamIds(CONFIG.parameters));
  });

  it("leaves out what it has no type for, and answers an empty map for no parameters", () => {
    expect(extractParamTypes([{ id: "to" }, { id: "", type: "Date" }, { type: "Date" }])).toEqual({});
    expect(extractParamTypes([])).toEqual({});
    expect(extractParamTypes(null)).toEqual({});
    expect(extractParamTypes(undefined)).toEqual({});
  });

  it("writes the parameter into the SQL as the placeholder the backend binds, on every vendor", () => {
    // The generator does not substitute the value - it writes ${to} and the backend turns
    // that into a named bind. The declared type is what makes that bind a date.
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn({
        table: "crm_deals",
        tableSchema: "cube_demo",
        filters: [{ column: "close_date", operator: "less_or_equal", value: "${to}" }],
        summarize: [{ aggregation: "COUNT", field: "*" }],
        groupBy: [],
        sort: [],
        limit: 0,
      } as unknown as VisualQuery, vendor);
      expect(sql).withContext(vendor).toContain("${to}");
      expect(sql).withContext(vendor).not.toContain("'${to}'");
    }
  });
});

// ── 13 ───────────────────────────────────────────────────────────────────────

describe("ANSI — a date filter is a whole day", () => {

  // A timestamp column holds a time of day, so an equality against a date is an
  // equality against midnight: a row stamped 2026-01-31 14:05 answered `false`
  // to `created_at = '2026-01-31'`, and `on or before 2026-01-31` left it out
  // too. Every comparison the date dropdown offers is therefore written over the
  // whole day - the same half-open range `between` already writes (block 2).
  // The rows that prove it (2026-01-30 23:59:59, 2026-01-31 00:00, 14:05,
  // 23:59:59 and 2026-02-01 00:00) are named here and in the plan only: no
  // shipped sample holds a time of day, and the query that runs them on each
  // vendor is G2a's hand query on literals.

  const DAY = "2026-01-31";
  const NEXT = "2026-02-01";

  /** The WHERE clause this one filter produced, or null when it wrote none. */
  function whereOn(filter: Record<string, string>, vendor: SqlDialect): string | null {
    const parts = sqlOn(query({ filters: [filter] } as Partial<VisualQuery>), vendor).split("\nWHERE ");
    return parts.length > 1 ? parts[1] : null;
  }

  /** The one ANSI text of this filter, with the vendor forms normalized away:
   *  the date literal (`DATE '…'`, `toDate('…')`, a bare string - block 8) and
   *  the reader SQLite needs around a temporal column (`dateExpr` - block 9)
   *  belong to the layer, so they are folded to `<day>`, `<next>` and the plain
   *  column name before the nine texts are compared, exactly as the ANSI blocks
   *  take the quoting off. What is left is the shape of the comparison, which is
   *  standard SQL and must be identical on all nine. */
  function ansiWhere(filter: Record<string, string>): string {
    const forms = EVERY_VENDOR.map((vendor) => unquoted(whereOn(filter, vendor) ?? "")
      .split(unquoted(dateExpr(filter.column, vendor))).join(filter.column)
      .split(sqlLiteral(NEXT, "date", vendor)).join("<next>")
      .split(sqlLiteral(DAY, "date", vendor)).join("<day>"));
    expect(new Set(forms).size)
      .withContext(`the generator wrote more than one text:\n${forms.join("\n")}`)
      .toBe(1);
    return forms[0];
  }

  const SIX_FORMS = [
    ["equals", "created_at >= <day> AND created_at < <next>"],
    ["not_equals", "(created_at < <day> OR created_at >= <next>)"],
    ["greater_than", "created_at >= <next>"],
    ["greater_or_equal", "created_at >= <day>"],
    ["less_than", "created_at < <day>"],
    ["less_or_equal", "created_at < <next>"],
  ] as const;

  it("writes the six comparisons as half-open ranges over the day", () => {
    for (const [operator, expected] of SIX_FORMS) {
      expect(ansiWhere({ column: "created_at", operator, value: DAY }))
        .withContext(operator).toBe(expected);
    }
  });

  it("writes the same six forms on a DATE column, where they answer the same", () => {
    for (const [operator, expected] of SIX_FORMS) {
      expect(ansiWhere({ column: "closed_on", operator, value: DAY }))
        .withContext(operator).toBe(expected.split("created_at").join("closed_on"));
    }
  });

  it("never compares a temporal column with = or <= any more", () => {
    for (const [operator] of SIX_FORMS) {
      for (const vendor of EVERY_VENDOR) {
        const written = unquoted(whereOn({ column: "created_at", operator, value: DAY }, vendor) ?? "");
        expect(written).withContext(`${operator} | ${vendor}`).not.toContain("created_at =");
        expect(written).withContext(`${operator} | ${vendor}`).not.toContain("created_at <=");
        expect(written).withContext(`${operator} | ${vendor}`).not.toContain("created_at <>");
      }
    }
  });

  it("leaves a value that is not a plain yyyy-mm-dd exactly as it was", () => {
    // A half-typed date, and a date the user gave a time of day on purpose:
    // both keep the plain comparison, so nothing the user typed is thrown away.
    for (const value of ["2026-01", "2026-01-31 14:05", ""]) {
      const written = unquoted(whereOn({ column: "created_at", operator: "equals", value }, "postgres") ?? "");
      expect(written).withContext(value).not.toContain(">=");
      if (value !== "") expect(written).withContext(value).toContain("created_at = TIMESTAMP");
    }
  });

  it("leaves a value bound to a dashboard parameter alone", () => {
    // `${p_day}` is unknown when the SQL is built, so there is no day to take
    // the range over: the parameter keeps meaning the instant it names, i.e.
    // midnight on a timestamp column. Written down as a known limit (T12).
    for (const vendor of EVERY_VENDOR) {
      expect(unquoted(whereOn({ column: "created_at", operator: "equals", value: "${p_day}" }, vendor) ?? ""))
        .withContext(vendor).toContain("= ${p_day}");
    }
  });

  it("touches no filter on a column that is not temporal", () => {
    // Compared without folding any literal: a string column's value is a string
    // literal on all nine, so there is nothing vendor-specific to normalize -
    // and folding would hide the very thing this spec checks, that a date-looking
    // value on a text column stays one literal instead of becoming a range.
    const plainWhere = (filter: Record<string, string>): string => {
      const forms = EVERY_VENDOR.map((vendor) => unquoted(whereOn(filter, vendor) ?? ""));
      expect(new Set(forms).size)
        .withContext(`the generator wrote more than one text:\n${forms.join("\n")}`).toBe(1);
      return forms[0];
    };
    expect(plainWhere({ column: "amount", operator: "equals", value: "100" })).toBe("amount = 100");
    expect(plainWhere({ column: "title", operator: "equals", value: DAY })).toBe(`title = '${DAY}'`);
    expect(plainWhere({ column: "title", operator: "less_or_equal", value: DAY })).toBe(`title <= '${DAY}'`);
  });

  it("keeps the ranges of two date filters joined with AND", () => {
    const sql = unquoted(sqlOn(query({
      filters: [
        { column: "closed_on", operator: "greater_or_equal", value: "2026-01-01" },
        { column: "created_at", operator: "equals", value: DAY },
      ],
    } as Partial<VisualQuery>), "postgres"));
    expect(sql).toContain("WHERE closed_on >= DATE '2026-01-01'"
      + "\n  AND created_at >= DATE '2026-01-31' AND created_at < DATE '2026-02-01'");
  });
});

// ── 14 ───────────────────────────────────────────────────────────────────────

describe("ANSI — NULLs sort last", () => {

  // Where a NULL sorts is the vendor's choice in the standard, and the nine
  // disagree: MySQL, MariaDB, SQL Server and SQLite sort NULLs first ascending,
  // PostgreSQL, Oracle, Db2, DuckDB and ClickHouse sort them last, and each
  // flips descending - so "the three deals closing soonest" showed three rows
  // with no close date at all on half the connections. `NULLS LAST` would say
  // it in one word, and four of the nine reject it, so the order is written as
  // an extra sort key that is plain standard SQL: 1 for a NULL, 0 for a value.

  /** The ORDER BY clause of this query, or null when it wrote none. */
  function orderOn(visualQuery: VisualQuery, vendor: SqlDialect): string | null {
    const parts = sqlOn(visualQuery, vendor).split("\nORDER BY ");
    return parts.length > 1 ? parts[1].split("\nFETCH FIRST ")[0].split("\nLIMIT ")[0] : null;
  }

  const sorted = (sort: { column: string; direction: string }[], patch: Partial<VisualQuery> = {}) =>
    query({ sort, ...patch } as Partial<VisualQuery>);

  it("puts a null-ordering key in front of every sort key, both directions", () => {
    for (const direction of ["ASC", "DESC"]) {
      expect(oneAnsiTextFor(sorted([{ column: "closed_on", direction }])))
        .withContext(direction)
        .toContain(`ORDER BY CASE WHEN closed_on IS NULL THEN 1 ELSE 0 END, closed_on ${direction}`);
    }
  });

  it("gives the second sort key its own null-ordering key", () => {
    expect(oneAnsiTextFor(sorted([
      { column: "closed_on", direction: "ASC" },
      { column: "title", direction: "DESC" },
    ]))).toContain("ORDER BY CASE WHEN closed_on IS NULL THEN 1 ELSE 0 END, closed_on ASC"
      + ", CASE WHEN title IS NULL THEN 1 ELSE 0 END, title DESC");
  });

  it("never writes NULLS LAST or NULLS FIRST, which four of the nine reject", () => {
    for (const vendor of EVERY_VENDOR) {
      const clause = orderOn(sorted([{ column: "closed_on", direction: "ASC" }]), vendor)!;
      expect(clause.toUpperCase()).withContext(vendor).not.toContain("NULLS LAST");
      expect(clause.toUpperCase()).withContext(vendor).not.toContain("NULLS FIRST");
    }
  });

  it("writes no ORDER BY, and no CASE, when nothing is sorted", () => {
    for (const vendor of EVERY_VENDOR) {
      expect(orderOn(query({}), vendor)).withContext(vendor).toBeNull();
      expect(sqlOn(query({}), vendor)).withContext(vendor).not.toContain("CASE WHEN");
    }
  });

  it("sorts an aggregate by its expression, inside the CASE and outside it", () => {
    // PostgreSQL takes a bare output alias as a sort key but rejects one inside
    // an ORDER BY expression, so the CASE cannot say `"amount_max"`. Writing the
    // aggregate in both places is one form that runs on all nine.
    const topDeals = sorted([{ column: "amount_max", direction: "DESC" }], {
      groupBy: ["title"],
      summarize: [{ aggregation: "MAX", field: "amount" }],
    });
    for (const vendor of EVERY_VENDOR) {
      const clause = orderOn(topDeals, vendor)!;
      const agg = `MAX(${quoteIdent("amount", vendor)})`;
      expect(clause).withContext(vendor).toBe(`CASE WHEN ${agg} IS NULL THEN 1 ELSE 0 END, ${agg} DESC`);
      expect(clause).withContext(vendor).not.toContain(quoteIdent("amount_max", vendor));
    }
  });

  it("gives a COUNT no null-ordering key, because a COUNT is never NULL", () => {
    for (const [aggregation, field, alias] of [
      ["COUNT", "*", "count"],
      ["COUNT DISTINCT", "title", "title_count distinct"],
    ] as const) {
      const byCount = sorted([{ column: alias, direction: "DESC" }], {
        groupBy: ["title"],
        summarize: [{ aggregation, field }],
      });
      for (const vendor of EVERY_VENDOR) {
        const clause = orderOn(byCount, vendor)!;
        expect(clause).withContext(`${aggregation} | ${vendor}`).not.toContain("CASE WHEN");
        expect(clause).withContext(`${aggregation} | ${vendor}`).toContain(" DESC");
      }
    }
  });

  it("sorts a bucketed column outside the grouped query, where the bucket has a name", () => {
    // The bucket EXPRESSION inside an ORDER BY has no spelling all nine accept
    // (measured at G2a): MySQL reads an expression wrapping the grouped one as a
    // nonaggregated column, and Oracle and Db2 resolve the column name inside it
    // to the string the SELECT aliased - while the output ALIAS is refused inside
    // an ORDER BY expression by PostgreSQL, DuckDB and SQL Server. So the grouped
    // query becomes a derived table and the sort is written on the column it
    // selected, which every one of the nine sorts.
    const byMonth = sorted([{ column: "closed_on", direction: "ASC" }], {
      groupBy: ["closed_on"],
      groupByBuckets: { closed_on: "month" },
      summarize: [{ aggregation: "COUNT", field: "*" }],
    });
    for (const vendor of EVERY_VENDOR) {
      const closedOn = quoteIdent("closed_on", vendor);
      expect(orderOn(byMonth, vendor)).withContext(vendor)
        .toBe(`CASE WHEN ${closedOn} IS NULL THEN 1 ELSE 0 END, ${closedOn} ASC`);
      expect(sqlOn(byMonth, vendor)).withContext(vendor).toContain(") grouped_rows\nORDER BY ");
      // Inside, the bucket is still the layer's own expression, in the SELECT and
      // in the GROUP BY - and now in no third place.
      const bucket = bucketExpr("closed_on", "month", vendor, { name: "crm_deals" });
      const unindented = sqlOn(byMonth, vendor).split("\n").map((l) => l.replace(/^ {2}/, "")).join("\n");
      expect(unindented.split(bucket).length - 1).withContext(vendor).toBe(2);
    }
  });

  it("sorts a binned column outside the query the same way", () => {
    const byBin = sorted([{ column: "amount", direction: "ASC" }], {
      groupBy: ["amount"],
      groupByNumericBuckets: { amount: { width: 1000 } },
      summarize: [{ aggregation: "COUNT", field: "*" }],
    });
    const text = oneAnsiTextFor(byBin);
    expect(text).toContain("GROUP BY FLOOR(CAST(amount AS DECIMAL(31,4)) / 1000) * 1000\n) grouped_rows"
      + "\nORDER BY CASE WHEN amount IS NULL THEN 1 ELSE 0 END, amount ASC");
  });
});
// ── 15 ──────────────────────────────────────────────────────────────────

describe("ANSI — sorting an aggregated query", () => {

  // A summarized query selects the grouped columns and the aggregates, and
  // those are the only things it can sort by. Sorting it by any other column is
  // SQL the strict databases refuse - MySQL and MariaDB under
  // `ONLY_FULL_GROUP_BY`, PostgreSQL, Oracle and Db2 always - so a canvas built
  // that way answered with an error on most connections instead of rows. Two
  // halves, both here: the Sort step offers only what can be sorted
  // (`sortableColumns`), and the generator drops a key that names anything else,
  // so an older canvas holding one now runs.

  /** The ORDER BY clause, or null when the generator wrote none. */
  function orderOn(visualQuery: VisualQuery, vendor: SqlDialect): string | null {
    const parts = sqlOn(visualQuery, vendor).split("\nORDER BY ");
    return parts.length > 1 ? parts[1].split("\nFETCH FIRST ")[0].split("\nLIMIT ")[0] : null;
  }

  /** Count the rows of each `stage`: the shape of every spec below. */
  const countByStage = (patch: Partial<VisualQuery> = {}) => query({
    groupBy: ["stage"],
    summarize: [{ aggregation: "COUNT", field: "*" }],
    ...patch,
  } as Partial<VisualQuery>);

  const column = (columnName: string): ColumnSchema =>
    ({ columnName, typeName: "text", isNullable: true });

  const TABLE_COLUMNS: ColumnSchema[] = ["stage", "title", "amount", "closed_on"].map(column);

  const names = (columns: ColumnSchema[]): string[] => columns.map((c) => c.columnName);

  it("offers every column of the table to sort by when the query does not summarize", () => {
    expect(names(sortableColumns(query({}), TABLE_COLUMNS))).toEqual(names(TABLE_COLUMNS));
  });

  it("offers the grouped columns and the aggregate aliases once it summarizes", () => {
    const grouped = query({
      groupBy: ["stage", "closed_on"],
      summarize: [{ aggregation: "COUNT", field: "*" }, { aggregation: "SUM", field: "amount" }],
    } as Partial<VisualQuery>);
    // The aliases are the names the SELECT writes, so a sort key that picks one
    // is a key the generator can resolve back to its expression.
    expect(names(sortableColumns(grouped, TABLE_COLUMNS)))
      .toEqual(["stage", "closed_on", "count", "amount_sum"]);
    expect(names(sortableColumns(grouped, TABLE_COLUMNS))).not.toContain("title");
  });

  it("keeps the grouped column's own schema entry, so the step shows its real type", () => {
    const typed: ColumnSchema[] = [{ columnName: "stage", typeName: "varchar", isNullable: false }];
    expect(sortableColumns(countByStage(), typed)[0]).toBe(typed[0]);
  });

  it("sorts by a grouped column, by the column itself, on all nine", () => {
    expect(oneAnsiTextFor(countByStage({ sort: [{ column: "stage", direction: "ASC" }] })))
      .toContain("ORDER BY CASE WHEN stage IS NULL THEN 1 ELSE 0 END, stage ASC");
  });

  it("sorts by an aggregate, and by a grouped column after it, in the order given", () => {
    const written = oneAnsiTextFor(countByStage({
      summarize: [{ aggregation: "COUNT", field: "*" }, { aggregation: "SUM", field: "amount" }],
      sort: [{ column: "amount_sum", direction: "DESC" }, { column: "stage", direction: "ASC" }],
    }));
    expect(written).toContain("ORDER BY CASE WHEN CAST(SUM(amount) AS DECIMAL(31,4)) IS NULL THEN 1 ELSE 0 END"
      + ", CAST(SUM(amount) AS DECIMAL(31,4)) DESC"
      + ", CASE WHEN stage IS NULL THEN 1 ELSE 0 END, stage ASC");
  });

  it("drops a sort key that names a column neither grouped nor aggregated", () => {
    // `title` is in the table but not in this query's SELECT. The rest of the
    // query is written exactly as it would be with no sort key at all.
    const dropped = countByStage({ sort: [{ column: "title", direction: "ASC" }] });
    for (const vendor of EVERY_VENDOR) {
      expect(orderOn(dropped, vendor)).withContext(vendor).toBeNull();
      expect(sqlOn(dropped, vendor)).withContext(vendor).toBe(sqlOn(countByStage(), vendor));
    }
    expect(oneAnsiTextFor(dropped)).not.toContain("title");
  });

  it("drops only that key, and keeps the ones the query can sort by", () => {
    const mixed = countByStage({
      sort: [
        { column: "title", direction: "ASC" },
        { column: "count", direction: "DESC" },
        { column: "amount", direction: "ASC" },
      ],
    });
    for (const vendor of EVERY_VENDOR) {
      const clause = orderOn(mixed, vendor)!;
      expect(clause).withContext(vendor).toBe("COUNT(*) DESC");
    }
  });

  it("keeps a sort key on any column while the query does not summarize", () => {
    // Without Summarize every column is selected, so nothing has to be dropped -
    // this is the same SQL the generator has always written.
    const plain = query({ sort: [{ column: "title", direction: "ASC" }] } as Partial<VisualQuery>);
    expect(oneAnsiTextFor(plain))
      .toContain("ORDER BY CASE WHEN title IS NULL THEN 1 ELSE 0 END, title ASC");
  });

  it("keeps a sort key on a bucketed grouped column, and sorts it outside", () => {
    // The sort key names the column, the SELECT writes an expression aliased to
    // that same name: it is grouped, so it is kept - and it is sorted outside the
    // grouped query, on the name, because no spelling of the expression itself
    // works on all nine (block 14).
    const byMonth = countByStage({
      groupBy: ["closed_on"],
      groupByBuckets: { closed_on: "month" },
      sort: [{ column: "closed_on", direction: "DESC" }],
    });
    for (const vendor of EVERY_VENDOR) {
      const closedOn = quoteIdent("closed_on", vendor);
      expect(orderOn(byMonth, vendor)).withContext(vendor)
        .toBe(`CASE WHEN ${closedOn} IS NULL THEN 1 ELSE 0 END, ${closedOn} DESC`);
      expect(sqlOn(byMonth, vendor)).withContext(vendor).toContain(") grouped_rows\nORDER BY ");
    }
  });

  it("writes top N by an aggregate as one ANSI text, with the vendor's own row cap", () => {
    // The whole point of the block, and of the A27 case the databases run: the
    // three biggest stages by deal count. Everything but the row cap is the same
    // text on all nine; the cap is the layer's (`TOP 3` on SQL Server, `FETCH
    // FIRST` on Oracle and Db2, `LIMIT 3` elsewhere).
    const topThree = countByStage({ sort: [{ column: "count", direction: "DESC" }], limit: 3 });
    for (const vendor of EVERY_VENDOR) {
      const stage = quoteIdent("stage", vendor);
      const core = `SELECT ${stage}, COUNT(*) AS ${quoteIdent("count", vendor)}`
        + `\nFROM ${quoteTableRef({ name: "crm_deals" }, vendor)}`
        + `\nGROUP BY ${stage}\nORDER BY COUNT(*) DESC`;
      expect(sqlOn(topThree, vendor)).withContext(vendor).toBe(limitClause(core, 3, vendor));
    }
  });
});
// ─── Block 16: the user's own SQL is sent verbatim (T10) ────────────────────
//
// In SQL and AI-SQL mode the text is the user's - typed by a person, or written
// by the AI for the database it was told about. Nothing here rewrites it, and
// nothing may: a generator that "helped" would turn working vendor SQL into
// something the database has never heard of. The nine databases then run this
// same text in group D of the AI Hub cases.
describe("ANSI — the user's own SQL is sent verbatim", () => {

  const sent = (mode: "sql" | "ai-sql", sql: string, vendor: string): string | null =>
    sqlForDataSource({ mode, sql } as never, vendor);

  const TEXTS: [string, string][] = [
    ["a dashboard parameter", "SELECT *\nFROM t\nWHERE d <= ${to}"],
    ["a PostgreSQL cast", "SELECT deal_id::text FROM crm_deals WHERE amount::numeric > 1"],
    ["a colon inside a string literal", "SELECT * FROM t WHERE note = 'ratio 1:2'"],
    ["a question mark inside a string literal", "SELECT * FROM t WHERE note = 'why?'"],
    ["SQL Server brackets", "SELECT [order id] FROM [dbo].[Orders] WITH (NOLOCK)"],
    ["MySQL backticks", "SELECT `order id` FROM `cube_demo`.`crm_deals` LIMIT 2, 2"],
    ["an Oracle outer join and ROWNUM", "SELECT * FROM a, b WHERE a.id = b.id(+) AND ROWNUM <= 10"],
    ["a double-quoted name and a doubled quote inside a literal",
     "SELECT \"Order ID\" FROM \"Orders\" WHERE name = 'O''Brien'"],
    ["a comment and trailing whitespace", "-- the user's own note\nSELECT 1  \n"],
  ];

  for (const mode of ["sql", "ai-sql"] as const) {
    for (const [what, text] of TEXTS) {
      it(`ANSI — ${mode} mode sends ${what} byte for byte, on every vendor`, () => {
        for (const vendor of EVERY_VENDOR) {
          expect(sent(mode, text, vendor)).withContext(`${vendor} / ${mode}`).toBe(text);
        }
      });
    }
  }

  it("ANSI — the text is the same on all nine vendors, so no vendor branch can reach it", () => {
    const text = "SELECT * FROM cube_demo.crm_deals OFFSET 2 ROWS FETCH NEXT 2 ROWS ONLY";
    const answers = new Set(EVERY_VENDOR.map((vendor) => sent("sql", text, vendor)));
    expect(answers.size).toBe(1);
    expect([...answers][0]).toBe(text);
  });

  it("ANSI — an empty SQL text falls through to the generated SQL, and nothing else does", () => {
    // The only case where the mode's own text is not what is sent: there is none.
    expect(sqlForDataSource(
      { mode: "sql", sql: "", generatedSql: "SELECT 1" } as never, "duckdb")).toBe("SELECT 1");
    expect(sqlForDataSource(
      { mode: "ai-sql", sql: "SELECT 2", generatedSql: "SELECT 1" } as never, "duckdb")).toBe("SELECT 2");
  });
});

// ── 17 ───────────────────────────────────────────────────────────────────────
//
// AI Hub writes no vendor SQL - when the user asks for SQL or for a Groovy
// script, the AI writes it, and the only thing that tells the AI which database
// it is writing for is `[DATABASE_VENDOR]` in the prompt template. So every
// connection type the product can have must fill that placeholder with a value
// that NAMES the database. The four templates that carry it live on the server
// (`bkend/server/.../ai/prompts/*.java`); the last spec checks them where the
// checkout has them, and the rest stub the same line those templates hold.

describe("the AI prompt names the database the SQL must run on", () => {
  const VENDOR_LINE = "Database vendor: [DATABASE_VENDOR]";
  const TEMPLATE = [
    "<TASK>",
    "Write one query.",
    "</TASK>",
    VENDOR_LINE,
    "[INSERT USER'S NATURAL LANGUAGE QUESTION OR INSTRUCTION FOR THE SQL QUERY HERE]",
    "[INSERT THE RELEVANT DATABASE SCHEMA HERE]",
    "[INSERT THE RELEVANT CUBE DSL HERE]",
  ].join("\n");

  /** Every connection type the product can hand AI Hub, and the name the prompt
   *  must give its database. `postgresql` and `postgres` are both written by the
   *  connection form; `supabase` and `timescaledb` are PostgreSQL behind another
   *  name; `ibmdb2` is the product's code for Db2; `mssql` is SQL Server. */
  const NAMES: Record<string, string> = {
    postgresql: "PostgreSQL",
    postgres: "PostgreSQL",
    supabase: "PostgreSQL (Supabase)",
    timescaledb: "PostgreSQL (TimescaleDB)",
    mysql: "MySQL",
    mariadb: "MariaDB",
    sqlserver: "Microsoft SQL Server",
    mssql: "Microsoft SQL Server",
    oracle: "Oracle Database",
    ibmdb2: "IBM Db2 for Linux, UNIX and Windows",
    sqlite: "SQLite",
    duckdb: "DuckDB",
    clickhouse: "ClickHouse",
  };

  const SCHEMA = {
    tables: [{
      tableName: "crm_deals",
      columns: [{ columnName: "deal_id", typeName: "INTEGER", isNullable: false }],
    }],
  };

  /** The template and the cube come from the server; here they are stubbed, so
   *  the spec is about what the builder fills in and nothing else. */
  async function promptFor(type: string, mode: "sql" | "script", kind: "table" | "cube") {
    const globals = globalThis as { fetch?: unknown };
    const real = globals.fetch;
    globals.fetch = async (url: unknown) => ({
      ok: true,
      json: async () => String(url).includes("/cubes/")
        ? { id: "c1", name: "deals", description: "", connectionId: "c", dslCode: "cube { }", isSample: false }
        : { promptText: TEMPLATE },
    });
    try {
      return await buildAiPrompt({
        mode,
        kind,
        requirement: "how many deals are still open",
        connectionType: type,
        schema: SCHEMA as never,
        tableName: "crm_deals",
        cubeId: "c1",
      });
    } finally {
      globals.fetch = real;
    }
  }

  for (const [type, name] of Object.entries(NAMES)) {
    it(`says "${name}" for the connection type ${type}, in all four prompts`, async () => {
      for (const mode of ["sql", "script"] as const) {
        for (const kind of ["table", "cube"] as const) {
          const prompt = await promptFor(type, mode, kind);
          expect(prompt).withContext(`${type} ${mode}/${kind}`).toContain(`Database vendor: ${name}`);
          expect(prompt).withContext(`${type} ${mode}/${kind}`).not.toContain("[DATABASE_VENDOR]");
        }
      }
    });
  }

  it("names a different database for every vendor the generator knows", () => {
    const named = EVERY_VENDOR.map((vendor) => vendorNameFor(vendor));
    expect(new Set(named).size).withContext(named.join(", ")).toBe(EVERY_VENDOR.length);
    for (const name of named) expect(name).not.toBe("SQL");
  });

  it("does not claim a database it was not told about", () => {
    // `dialectFor` falls back to SQLite, which is right for writing SQL ourselves
    // and wrong here: telling an AI "SQLite" about a database that is not SQLite
    // would be worse than telling it nothing.
    expect(vendorNameFor("")).toBe("SQL");
    expect(vendorNameFor(undefined)).toBe("SQL");
    expect(vendorNameFor("   ")).toBe("SQL");
    expect(vendorNameFor("snowflake")).toBe("snowflake");
    expect(vendorNameFor("PostgreSQL 16")).toBe("PostgreSQL");
    expect(vendorNameFor("SQL Server 2019")).toBe("Microsoft SQL Server");
    expect(vendorNameFor("MariaDB 10.6")).toBe("MariaDB");
  });

  it("the server's four prompt templates each hold the placeholder the builder fills", () => {
    const prompts = path.join(__dirname, "..", "..", "..", "..", "bkend", "server", "src", "main",
      "java", "com", "flowkraft", "ai", "prompts");
    if (!fs.existsSync(prompts)) {
      pending("the server sources are not in this checkout");
      return;
    }
    for (const file of ["SqlFromNaturalLanguage.java", "SqlFromCubeDsl.java",
      "GroovyScriptInputSource.java", "GroovyScriptFromCubeDsl.java"]) {
      const text = fs.readFileSync(path.join(prompts, file), "utf8");
      expect(text.split("[DATABASE_VENDOR]").length - 1).withContext(file).toBe(1);
      expect(text).withContext(file).toContain(VENDOR_LINE);
    }
  });
});

// ── 19 ───────────────────────────────────────────────────────────────────────

describe("ANSI — a relative date filter is a computed range of whole days", () => {

  // Every KPI and trend on a dashboard says "this month" or "the last 30 days",
  // not "on or after 2026-09-01": a canvas saved with a typed date goes stale the
  // day after it is saved. The relative operators say the span instead, and the
  // two days that bound it are computed in TypeScript from today's date
  // (`relative-dates.ts`), so what the generator writes is the same half-open
  // range `between` and the whole-day rule write (blocks 2 and 13) and there is
  // no `CURRENT_DATE`, no `INTERVAL` and no vendor branch anywhere in it -
  // `CURRENT_DATE - INTERVAL '3' MONTH` is three different texts on nine
  // vendors, and a computed range is one a test can pin.
  //
  // Today is pinned here to 2026-09-30, the demo seed's own `today`, which is
  // also the day the group A case `a33-deals-closed-last-3-months` was computed
  // with. In the product it is the browser's own date, read when the SQL is
  // built (the spec at the end of this block).

  const TODAY = "2026-09-30";

  /** The WHERE clause this one filter produced, or null when it wrote none. */
  function whereOn(filter: Record<string, string>, vendor: SqlDialect, today = TODAY): string | null {
    const sql = buildSql(query({ filters: [filter] } as Partial<VisualQuery>),
      { connectionType: vendor, columnKinds: COLUMN_KINDS, today });
    const parts = sql.split("\nWHERE ");
    return parts.length > 1 ? parts[1] : null;
  }

  /** The one ANSI text of this filter, with the vendor forms folded away exactly
   *  as block 13 folds them: the two date literals become `<from>` and `<to>`
   *  and the reader SQLite needs around a temporal column becomes the plain
   *  column name. The days themselves are written out by hand in each spec, so
   *  the arithmetic is asserted and not merely re-run. */
  function ansiWhere(filter: Record<string, string>, from: string, to: string, today = TODAY): string {
    const forms = EVERY_VENDOR.map((vendor) => unquoted(whereOn(filter, vendor, today) ?? "")
      .split(unquoted(dateExpr(filter.column, vendor))).join(filter.column)
      .split(sqlLiteral(from, "date", vendor)).join("<from>")
      .split(sqlLiteral(to, "date", vendor)).join("<to>"));
    expect(new Set(forms).size)
      .withContext(`the generator wrote more than one text:\n${forms.join("\n")}`)
      .toBe(1);
    return forms[0];
  }

  const RANGE = "closed_on >= <from> AND closed_on < <to>";

  /** operator, value box, and the two days it means with today = 2026-09-30. */
  const SPANS: [string, string, string, string][] = [
    // The "last N" spans end today, today included: the last 7 days of
    // 2026-09-30 are the 24th through the 30th.
    ["last_n_days", "1", "2026-09-30", "2026-10-01"],
    ["last_n_days", "7", "2026-09-24", "2026-10-01"],
    ["last_n_days", "30", "2026-09-01", "2026-10-01"],
    ["last_n_weeks", "1", "2026-09-24", "2026-10-01"],
    ["last_n_weeks", "4", "2026-09-03", "2026-10-01"],
    // A month is the calendar's, not 30 days: one month back from the 30th is
    // the 30th, so the span starts on the 31st of the month before.
    ["last_n_months", "1", "2026-08-31", "2026-10-01"],
    ["last_n_months", "3", "2026-07-01", "2026-10-01"],
    ["last_n_months", "12", "2025-10-01", "2026-10-01"],
    // The fixed periods are read off the calendar, and take no value at all.
    ["this_month", "", "2026-09-01", "2026-10-01"],
    ["previous_month", "", "2026-08-01", "2026-09-01"],
    ["this_quarter", "", "2026-07-01", "2026-10-01"],
    ["this_year", "", "2026-01-01", "2027-01-01"],
    ["year_to_date", "", "2026-01-01", "2026-10-01"],
  ];

  it("writes every relative span as one half-open range, the same text on all nine", () => {
    for (const [operator, value, from, to] of SPANS) {
      expect(ansiWhere({ column: "closed_on", operator, value }, from, to))
        .withContext(`${operator} ${value} with today ${TODAY}`).toBe(RANGE);
    }
  });

  it("covers every operator the date dropdown offers as a relative one", () => {
    // A relative operator added to the dropdown without a span here would never
    // be checked, and one added without a rule in `relativeDayRange` would ask
    // nothing at all.
    const asserted = new Set(SPANS.map(([operator]) => operator));
    expect(Array.from(asserted).sort()).toEqual([...RELATIVE_DATE_OPS].sort());
    for (const operator of RELATIVE_DATE_OPS) {
      expect(DATE_OPS.map((one) => one.value)).withContext(operator).toContain(operator);
    }
    for (const list of [STRING_OPS, NUMBER_OPS, BOOLEAN_OPS]) {
      for (const operator of RELATIVE_DATE_OPS) {
        expect(list.map((one) => one.value)).withContext(operator).not.toContain(operator);
      }
    }
  });

  it("writes the same range on a timestamp column, where the whole days are what makes it right", () => {
    // A timestamp column holds a time of day: the last day of the span is
    // included by its whole day (`< 2026-10-01`), never by its midnight.
    expect(ansiWhere({ column: "created_at", operator: "this_month", value: "" }, "2026-09-01", "2026-10-01"))
      .toBe(RANGE.split("closed_on").join("created_at"));
  });

  it("clamps a day the month it lands in has not got", () => {
    // One month before 31 March is 28 February (2026 is not a leap year), so the
    // span starts on 1 March - the whole of March, which is what "the last
    // month" of 31 March means.
    expect(ansiWhere({ column: "closed_on", operator: "last_n_months", value: "1" },
      "2026-03-01", "2026-04-01", "2026-03-31")).toBe(RANGE);
  });

  it("crosses the turn of the year", () => {
    const december: [string, string, string][] = [
      ["this_month", "2026-12-01", "2027-01-01"],
      ["this_quarter", "2026-10-01", "2027-01-01"],
      ["year_to_date", "2026-01-01", "2026-12-16"],
    ];
    for (const [operator, from, to] of december) {
      expect(ansiWhere({ column: "closed_on", operator, value: "" }, from, to, "2026-12-15"))
        .withContext(operator).toBe(RANGE);
    }
    // January's previous month is December of the year before.
    expect(unquoted(whereOn({ column: "closed_on", operator: "previous_month", value: "" },
      "postgres", "2026-01-15") ?? ""))
      .toBe("closed_on >= DATE '2025-12-01' AND closed_on < DATE '2026-01-01'");
  });

  it("asks the fixed periods whatever is in the value box, because they take none", () => {
    for (const operator of RELATIVE_DATE_PERIOD_OPS) {
      for (const value of ["", "   ", "7", "nonsense"]) {
        expect(whereOn({ column: "closed_on", operator, value }, "postgres"))
          .withContext(`${operator} ${JSON.stringify(value)}`).not.toBeNull();
      }
      expect(NO_VALUE_OPS).withContext(operator).toContain(operator);
    }
  });

  it("asks nothing when a last N has no positive whole number in its value box", () => {
    // The same rule every half-typed filter follows: the filter is left out, so
    // the query answers with every row instead of asking something nobody meant.
    // It must not fall through to a comparison either: `closed_on = '0'` would
    // be an error on a date column, and `= '2026-09-30'` would quietly turn "the
    // last N days" into a day.
    for (const operator of RELATIVE_DATE_N_OPS) {
      for (const value of ["", "  ", "0", "-3", "3.5", "seven", "2026-09-30", "1e3"]) {
        for (const vendor of EVERY_VENDOR) {
          expect(whereOn({ column: "closed_on", operator, value }, vendor))
            .withContext(`${operator} ${JSON.stringify(value)} | ${vendor}`).toBeNull();
        }
      }
    }
    // The filter that is still asked stays, and is the whole WHERE.
    expect(unquoted(buildSql(query({
      filters: [
        { column: "closed_on", operator: "last_n_days", value: "" },
        { column: "amount", operator: "greater_than", value: "100" },
      ],
    } as Partial<VisualQuery>), { connectionType: "postgres", columnKinds: COLUMN_KINDS, today: TODAY })))
      .toContain("WHERE amount > 100");
  });

  it("never writes CURRENT_DATE, an interval or a vendor date function", () => {
    for (const [operator, value] of SPANS) {
      for (const vendor of EVERY_VENDOR) {
        const written = whereOn({ column: "closed_on", operator, value }, vendor) ?? "";
        for (const forbidden of ["CURRENT_DATE", "INTERVAL", "DATEADD", "GETDATE", "SYSDATE",
          "now(", "'now'", "CURRENT DATE"]) {
          expect(written).withContext(`${operator} | ${vendor}`).not.toContain(forbidden);
        }
      }
    }
  });

  it("reads today off the machine it runs on when no day is pinned", () => {
    // In the product nobody pins it: "today" is the browser's own date, in the
    // browser's own time zone, taken when the SQL is built. Two users a day
    // apart therefore each get their own today, which is what they mean by it.
    const now = new Date();
    const thisYear = String(now.getFullYear());
    const sql = buildSql(query({ filters: [{ column: "closed_on", operator: "this_year", value: "" }] } as Partial<VisualQuery>),
      { connectionType: "postgres", columnKinds: COLUMN_KINDS });
    expect(sql).toContain(`DATE '${thisYear}-01-01'`);
    expect(sql).toContain(`DATE '${Number(thisYear) + 1}-01-01'`);
    expect(todayIso(new Date(2026, 8, 30))).toBe("2026-09-30");
  });

  it("takes no relative span from a day that is not a plain yyyy-mm-dd", () => {
    // `today` comes from a clock, so this is a programming error rather than
    // something a user can type - and it asks nothing rather than guessing.
    for (const day of ["", "2026-09", "30/09/2026", "2026-02-30"]) {
      expect(relativeDayRange("this_month", "", day)).withContext(day).toBeNull();
    }
    expect(relativeDayRange("equals", "2026-09-30", TODAY)).toBeNull();
  });
});

// ── 20 ────────────────────────────────────────────────────────────────────

describe("ANSI — every aggregate the Summarize step offers", () => {

  // The list the dropdown shows lives in `lib/explore-data/aggregations.ts`, so
  // this block can walk it. An aggregate offered without a case in the generator
  // falls through to its `default:` branch and becomes `WORD(column)` - SQL no
  // database runs - which is how COUNT DISTINCT could be written by the
  // generator for a whole phase while no dropdown offered it.
  //
  // The expected text of each is written out here, so a new entry in the
  // dropdown fails this block until this table says what SQL it writes.
  const EXPECTED: Record<string, string> = {
    "COUNT":          "COUNT(*) AS count",
    "COUNT DISTINCT": "COUNT(DISTINCT amount) AS amount_count distinct",
    "SUM":            "CAST(SUM(amount) AS DECIMAL(31,4)) AS amount_sum",
    "AVG":            "CAST(AVG(CAST(amount AS DECIMAL(31,4))) AS DECIMAL(31,4)) AS amount_avg",
    "MIN":            "MIN(amount) AS amount_min",
    "MAX":            "MAX(amount) AS amount_max",
  };

  const counted = (aggregation: string) => query({
    groupBy: ["title"],
    summarize: [{ aggregation, field: aggregation === "COUNT" ? "*" : "amount" }],
  } as Partial<VisualQuery>);

  it("writes the SQL this block states, as one text on all nine", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...AGGREGATION_VALUES].sort());
    for (const aggregation of AGGREGATION_VALUES) {
      expect(oneAnsiTextFor(counted(aggregation))).withContext(aggregation)
        .toContain(EXPECTED[aggregation]);
    }
  });

  it("offers COUNT DISTINCT, and reads it as words rather than as SQL", () => {
    // "how many customers ordered" is the everyday question after COUNT and SUM,
    // and the user who needs it is the one who does not write SQL.
    const distinct = AGGREGATIONS.find((a) => a.value === "COUNT DISTINCT");
    expect(distinct).withContext("the Summarize dropdown must offer COUNT DISTINCT").toBeDefined();
    expect(distinct!.label).toBe("Count distinct");
  });

  it("counts the values of the column, not the rows", () => {
    const ansi = oneAnsiTextFor(counted("COUNT DISTINCT"));
    expect(ansi).toContain("COUNT(DISTINCT amount)");
    expect(ansi).not.toContain("COUNT(amount)");
    expect(ansi).not.toContain("COUNT(*)");
  });

  it("names no vendor's own distinct count", () => {
    // ClickHouse's uniqExact, and every other vendor idiom for this, is a
    // user's own SQL (group D of the AI Hub cases) - never the generator's.
    const ansi = oneAnsiTextFor(counted("COUNT DISTINCT"));
    for (const idiom of ["uniqExact", "uniq(", "approx_count_distinct", "APPROX_COUNT_DISTINCT"]) {
      expect(ansi).withContext(idiom).not.toContain(idiom);
    }
  });

  it("writes the aggregate and its alias through the vendor layer's quoting", () => {
    for (const vendor of EVERY_VENDOR) {
      const column = quoteIdent("amount", vendor);
      const alias = quoteIdent("amount_count distinct", vendor);
      expect(sqlOn(counted("COUNT DISTINCT"), vendor)).withContext(vendor)
        .toContain(`COUNT(DISTINCT ${column}) AS ${alias}`);
    }
  });

  it("keeps the alias short enough for Oracle, whose names are 128 bytes from 12.2", () => {
    // `<column>_count distinct` is the longest alias the generator writes, and
    // Oracle before 12.2 allowed 30 bytes - which is why 12.2 is the minimum
    // version the docs state (T12). This checks the part that is ours: the
    // alias adds a fixed 15 characters to the column name.
    const alias = "amount_count distinct";
    expect(alias.length - "amount".length).toBe(15);
    expect(alias.length).toBeLessThanOrEqual(128);
  });

  it("offers the count as a sort key, and knows a count is never NULL", () => {
    const byDistinct = counted("COUNT DISTINCT");
    const sortable = sortableColumns(byDistinct, [
      { columnName: "title", typeName: "text", isNullable: true },
      { columnName: "amount", typeName: "numeric", isNullable: true },
    ]);
    const alias = sortable.find((c) => c.columnName === "amount_count distinct");
    expect(alias).withContext("the Sort step must be able to ask for it").toBeDefined();
    expect(alias!.isNullable).toBe(false);
  });
});

// ── 21 ───────────────────────────────────────────────────────────────────────

describe("ANSI — a dashboard date range of whole days", () => {

  // What the dashboard declared. `from` and `to` are the filter bar's date
  // range, `when` an instant, `n` a number, and `undeclared` a parameter of a
  // dashboard published before types were declared at all.
  const TYPES: Record<string, string> = { from: "Date", to: "Date", when: "DateTime", n: "Integer" };

  function whereWith(
    filters: Record<string, string>[],
    vendor: SqlDialect,
    paramTypes: Record<string, string> = TYPES,
  ): string | null {
    const sql = buildSql(query({ filters } as Partial<VisualQuery>),
      { connectionType: vendor, columnKinds: COLUMN_KINDS, paramTypes });
    const parts = sql.split("\nWHERE ");
    return parts.length > 1 ? parts[1].split("\nGROUP BY ")[0].split("\nORDER BY ")[0] : null;
  }

  /** The days a typed bound in this block names, folded to `<2026-01-01>` below. */
  const DAYS = ["2026-01-01", "2026-01-31", "2026-02-01"];

  /** The one ANSI text this filter has, asserted to be the same on all nine.
   *  The vendor forms are folded away first, exactly as block 13 folds them: the
   *  reader a temporal column needs on SQLite (`dateExpr`) and the date literal
   *  (`DATE '…'`, `toDate('…')`, a bare string) are the layer's business, and
   *  what is left is the shape of the comparison - standard SQL, and the same on
   *  all nine. A `${param}` is left as it stands, because that is the point. */
  function oneAnsiWhere(
    filter: Record<string, string>,
    paramTypes: Record<string, string> = TYPES,
  ): string {
    const forms = EVERY_VENDOR.map((vendor) => {
      let text = unquoted(whereWith([filter], vendor, paramTypes) ?? "")
        .split(unquoted(dateExpr(filter.column, vendor))).join(filter.column);
      for (const day of DAYS) text = text.split(sqlLiteral(day, "date", vendor)).join(`<${day}>`);
      return text;
    });
    expect(new Set(forms).size)
      .withContext(`the generator wrote more than one text:\n${forms.join("\n")}`)
      .toBe(1);
    return forms[0];
  }

  it("is a range the Filter step can bind: `between` takes a parameter in each box", () => {
    // Before F8 `between` was left out of the bindable operators, so a dashboard
    // whose filter bar had a date range could not use it at all.
    expect(PARAM_BINDABLE_OPS.has("between")).toBe(true);
  });

  it("writes the half-open range of whole days, on a date column and a timestamp one alike", () => {
    // The end of the range is the day AFTER `to`: a timestamp column holds a
    // time of day, so `<= ${to}` left out every row of the last day but midnight.
    expect(oneAnsiWhere({ column: "closed_on", operator: "between", value: "${from}", valueTo: "${to}" }))
      .toBe("closed_on >= ${from} AND closed_on < ${to__next_day}");
    expect(oneAnsiWhere({ column: "created_at", operator: "between", value: "${from}", valueTo: "${to}" }))
      .toBe("created_at >= ${from} AND created_at < ${to__next_day}");
  });

  it("reads `on or before` and `after` a Date parameter as whole days too", () => {
    expect(oneAnsiWhere({ column: "created_at", operator: "less_or_equal", value: "${to}" }))
      .toBe("created_at < ${to__next_day}");
    expect(oneAnsiWhere({ column: "created_at", operator: "greater_than", value: "${from}" }))
      .toBe("created_at >= ${from__next_day}");
  });

  it("derives no day where the plain comparison is already the right boundary", () => {
    // Midnight on the day itself is exactly where `on or after` starts and where
    // `before` stops, so these two need nothing derived.
    expect(oneAnsiWhere({ column: "created_at", operator: "greater_or_equal", value: "${from}" }))
      .toBe("created_at >= ${from}");
    expect(oneAnsiWhere({ column: "created_at", operator: "less_than", value: "${to}" }))
      .toBe("created_at < ${to}");
  });

  it("leaves a DateTime parameter meaning the instant it names", () => {
    // "on or before 14:05" is an instant, and the day after an instant is not
    // what the user asked for.
    const written = oneAnsiWhere({ column: "created_at", operator: "less_or_equal", value: "${when}" });
    expect(written).toBe("created_at <= ${when}");
    expect(written).not.toContain(NEXT_DAY_SUFFIX);
  });

  it("leaves a parameter with no declared type exactly as it was", () => {
    // Every dashboard published before types were declared: its SQL must not
    // change under it.
    for (const types of [{}, { to: "" }, { to: "String" }]) {
      const written = oneAnsiWhere({ column: "created_at", operator: "less_or_equal", value: "${to}" }, types);
      expect(written).withContext(JSON.stringify(types)).toBe("created_at <= ${to}");
    }
  });

  it("derives nothing on a column that is not a date", () => {
    // A number range is a range of numbers: `BETWEEN` is exactly right, and both
    // bound parameters go in verbatim.
    const written = oneAnsiWhere({ column: "amount", operator: "between", value: "${from}", valueTo: "${to}" });
    expect(written).toBe("amount BETWEEN ${from} AND ${to}");
    expect(written).not.toContain(NEXT_DAY_SUFFIX);
  });

  it("writes the range with one bound typed and the other bound to a parameter", () => {
    expect(oneAnsiWhere({ column: "closed_on", operator: "between", value: "2026-01-01", valueTo: "${to}" }))
      .toBe("closed_on >= <2026-01-01> AND closed_on < ${to__next_day}");
    // A typed upper bound is the day after, computed here as it always was.
    expect(oneAnsiWhere({ column: "closed_on", operator: "between", value: "${from}", valueTo: "2026-01-31" }))
      .toBe("closed_on >= ${from} AND closed_on < <2026-02-01>");
  });

  it("names the day after as a parameter the backend can bind", () => {
    // A JDBI bind name is `\w+`, which is what `isParamRef` accepts, and the
    // backend derives the value by the same suffix (DateParameters).
    expect(nextDayRef("${to}")).toBe("${to__next_day}");
    expect(NEXT_DAY_SUFFIX).toBe("__next_day");
    expect(paramNameOf(nextDayRef("${to}"))).toBe("to__next_day");
    expect(isDayParam("${to}", TYPES)).toBe(true);
    expect(isDayParam("${when}", TYPES)).toBe(false);
    expect(isDayParam("2026-01-31", TYPES)).toBe(false);
  });

  it("writes no date arithmetic: the day after is derived, never computed in SQL", () => {
    // `to + INTERVAL '1' DAY` is a different text on nearly every vendor, which
    // is the whole reason the day travels as a parameter.
    for (const vendor of EVERY_VENDOR) {
      const written = whereWith(
        [{ column: "created_at", operator: "between", value: "${from}", valueTo: "${to}" }], vendor)!;
      for (const idiom of ["INTERVAL", "DATEADD", "DATE_ADD", "dateadd", "date_add", "ADD_DAYS", "addDays", "+ 1"]) {
        expect(written).withContext(`${vendor} ${idiom}`).not.toContain(idiom);
      }
    }
  });

  it("still leaves a half-typed range out of the WHERE", () => {
    // A bound box is not an empty box, and an empty one is still no filter.
    expect(whereWith([{ column: "closed_on", operator: "between", value: "${from}", valueTo: "" }], "postgres"))
      .toBeNull();
    expect(whereWith([{ column: "closed_on", operator: "between", value: "", valueTo: "${to}" }], "postgres"))
      .toBeNull();
  });

  it("writes the same SQL as before for a range of typed days (nothing else moved)", () => {
    expect(oneAnsiWhere({ column: "closed_on", operator: "between", value: "2026-01-01", valueTo: "2026-01-31" }))
      .toBe("closed_on >= <2026-01-01> AND closed_on < <2026-02-01>");
    expect(oneAnsiWhere({ column: "amount", operator: "between", value: "100", valueTo: "200" }))
      .toBe("amount BETWEEN 100 AND 200");
  });
});

// ── 22 ───────────────────────────────────────────────────────────────────────

describe("ANSI — a computed column", () => {

  /** `revenue = amount x qty`, the canvas's first use case ("top 10 products by
   *  revenue" on a table that has a price and a quantity but no revenue). */
  const revenue = { name: "revenue", left: "amount", operator: "*", right: "qty" };

  const withRevenue = (patch: Partial<VisualQuery> = {}) =>
    query({ computed: [revenue], ...patch } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(withRevenue()).length).toBeGreaterThan(0);
  });

  it("selects the arithmetic beside the table's own columns, under its name", () => {
    expect(oneAnsiTextFor(withRevenue())).toContain("(amount * qty) AS revenue");
  });

  it("qualifies the star, because Oracle rejects a bare * beside another select item", () => {
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn(withRevenue(), vendor);
      expect(sql).withContext(vendor).toContain(`SELECT ${quoteIdent("crm_deals", vendor)}.*,`);
      expect(sql).withContext(vendor).not.toContain("SELECT *");
    }
  });

  it("selects no star at all once the query is summarized", () => {
    // A grouped query answers with the groups and the aggregates, and `*` in it
    // is SQL no strict vendor runs.
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn(withRevenue({
        summarize: [{ aggregation: "SUM", field: "revenue" }], groupBy: ["title"],
      } as Partial<VisualQuery>), vendor);
      expect(sql).withContext(vendor).not.toContain(".*");
    }
  });

  it("writes SQL for every operator the Compute step offers", () => {
    // The dropdown and the generator are one list (`computed-columns.ts`): an
    // operator offered without a form here would reach a database as a label.
    // Division is the one that is not the same text everywhere, and the block
    // below holds its nine forms.
    for (const op of ARITHMETIC_OPS) {
      if (op.value !== "/") {
        expect(oneAnsiTextFor(withRevenue({
          computed: [{ ...revenue, operator: op.value }],
        } as Partial<VisualQuery>))).withContext(op.value).toContain(`(amount ${op.value} qty) AS revenue`);
      }
      // The sign the user reads is not the SQL: two of the four are not ASCII.
      for (const vendor of EVERY_VENDOR) {
        const sql = sqlOn(withRevenue({
          computed: [{ ...revenue, operator: op.value }],
        } as Partial<VisualQuery>), vendor);
        for (const label of ARITHMETIC_OPS.map((o) => o.label).filter((l) => !ARITHMETIC_OP_VALUES.includes(l))) {
          expect(sql).withContext(`${op.value} ${label} ${vendor}`).not.toContain(label);
        }
      }
    }
  });

  it("writes a number operand as a number and a column operand as a column", () => {
    expect(oneAnsiTextFor(withRevenue({
      computed: [{ name: "doubled", left: "amount", operator: "*", right: "2" }],
    } as Partial<VisualQuery>))).toContain("(amount * 2) AS doubled");
    expect(oneAnsiTextFor(withRevenue({
      computed: [{ name: "vat", left: "0.2", operator: "*", right: "amount" }],
    } as Partial<VisualQuery>))).toContain("(0.2 * amount) AS vat");
  });

  it("writes an operand that is not a number as one identifier, so nothing is injected", () => {
    // There is no expression to parse (`computed-columns.ts`): anything that is
    // not a plain number is a column name, and a name is quoted by the layer -
    // text that looks like SQL arrives as the name of a column that does not exist.
    for (const vendor of EVERY_VENDOR) {
      const sql = sqlOn(withRevenue({
        computed: [{ name: "x", left: 'amount) OR 1=1 --', operator: "*", right: "qty" }],
      } as Partial<VisualQuery>), vendor);
      expect(sql).withContext(vendor).toContain(quoteIdent('amount) OR 1=1 --', vendor));
      expect(sql).withContext(vendor).not.toContain("OR 1=1 --)");
    }
  });

  it("is filtered by its name, as the expression, against a number", () => {
    const ansi = oneAnsiTextFor(withRevenue({
      filters: [{ column: "revenue", operator: "greater_than", value: "100" }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("WHERE (amount * qty) > 100");
    // A computed column holds a number, and no database reported its type.
    expect(ansi).not.toContain("'100'");
  });

  it("is read as a number and never as a date", () => {
    // `dateExpr` on an arithmetic expression is nonsense; a name that happens to
    // be in the temporal set must not make it one.
    const sql = buildSql(
      withRevenue({ filters: [{ column: "revenue", operator: "greater_than", value: "100" }] } as Partial<VisualQuery>),
      { connectionType: "sqlite", columnKinds: COLUMN_KINDS, temporalColumns: new Set(["revenue"]) });
    expect(unquoted(sql)).toContain("WHERE (amount * qty) > 100");
  });

  it("is summed like a column, in the same DECIMAL cast", () => {
    expect(oneAnsiTextFor(withRevenue({
      summarize: [{ aggregation: "SUM", field: "revenue" }], groupBy: ["title"],
    } as Partial<VisualQuery>)))
      .toContain("CAST(SUM((amount * qty)) AS DECIMAL(31,4)) AS revenue_sum");
  });

  it("is sorted by the expression, with NULLs last, and never by the alias", () => {
    // PostgreSQL accepts a bare alias as a sort key but rejects one inside an
    // ORDER BY expression, so the null-ordering CASE holds the arithmetic.
    const ansi = oneAnsiTextFor(withRevenue({
      sort: [{ column: "revenue", direction: "DESC" }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("ORDER BY CASE WHEN (amount * qty) IS NULL THEN 1 ELSE 0 END, (amount * qty) DESC");
  });

  it("answers the use case it exists for: the top 10 by a computed revenue", () => {
    const top10 = withRevenue({
      summarize: [{ aggregation: "SUM", field: "revenue" }],
      groupBy: ["title"],
      sort: [{ column: "revenue_sum", direction: "DESC" }],
    } as Partial<VisualQuery>);
    const ansi = oneAnsiTextFor(top10);
    expect(ansi).toContain("CAST(SUM((amount * qty)) AS DECIMAL(31,4)) AS revenue_sum");
    expect(ansi).toContain("GROUP BY title");
    expect(ansi).toContain("ORDER BY CASE WHEN CAST(SUM((amount * qty)) AS DECIMAL(31,4)) IS NULL"
      + " THEN 1 ELSE 0 END, CAST(SUM((amount * qty)) AS DECIMAL(31,4)) DESC");
    // The Sort step offers it under that alias, which is how the key found it.
    expect(sortableColumns(top10, [...computedColumnSchemas(top10.computed)]).map((c) => c.columnName))
      .toEqual(["title", "revenue_sum"]);
  });

  it("groups by it, as the expression, aliased back to its name", () => {
    // Not offered by the Group by step, but a canvas may carry it: the SELECT and
    // the GROUP BY must then agree, the way they do for a bucket.
    const ansi = oneAnsiTextFor(withRevenue({
      summarize: [{ aggregation: "COUNT", field: "*" }], groupBy: ["revenue"],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("SELECT (amount * qty) AS revenue, COUNT(*) AS count");
    expect(ansi).toContain("GROUP BY (amount * qty)");
  });

  it("leaves an unfinished one out of the SQL entirely", () => {
    // The same rule as an empty filter value box: nothing half-built reaches SQL.
    const plain = oneAnsiTextFor(query({}));
    for (const half of [
      { name: "", left: "amount", operator: "*", right: "qty" },
      { name: "revenue", left: "", operator: "*", right: "qty" },
      { name: "revenue", left: "amount", operator: "*", right: "" },
      { name: "revenue", left: "amount", operator: "^", right: "qty" },
    ]) {
      expect(isCompleteComputedColumn(half)).withContext(JSON.stringify(half)).toBe(false);
      expect(oneAnsiTextFor(query({ computed: [half] } as Partial<VisualQuery>)))
        .withContext(JSON.stringify(half)).toBe(plain);
    }
  });

  it("takes one column per name, so the SELECT is never ambiguous", () => {
    const twice = withRevenue({
      computed: [revenue, { ...revenue, right: "amount" }],
    } as Partial<VisualQuery>);
    expect(computedColumnsOf(twice.computed)).toEqual([revenue]);
    expect(oneAnsiTextFor(twice)).toContain("(amount * qty) AS revenue");
    expect(oneAnsiTextFor(twice)).not.toContain("(amount * amount)");
  });

  it("knows a number operand from a column name", () => {
    for (const number of ["2", "0", "-1", "0.25", " 3 ", "+4", ".5"]) {
      expect(isNumberOperand(number)).withContext(number).toBe(true);
    }
    for (const name of ["", "amount", "qty2", "1e400", "0x10", "1,5", "NaN", "amount + 1"]) {
      expect(isNumberOperand(name)).withContext(name).toBe(false);
    }
  });

  it("describes itself as a number, so every step reads it as one", () => {
    expect(computedColumnSchemas([revenue]))
      .toEqual([{ columnName: "revenue", typeName: "DECIMAL", isNullable: true }]);
  });

  it("changes nothing for a query that has none (every canvas saved until now)", () => {
    const before = oneAnsiTextFor(query({
      filters: [{ column: "amount", operator: "greater_than", value: "100" }],
      summarize: [{ aggregation: "SUM", field: "amount" }],
      groupBy: ["title"],
      sort: [{ column: "amount_sum", direction: "DESC" }],
    } as Partial<VisualQuery>));
    for (const none of [undefined, [] as never[]]) {
      expect(oneAnsiTextFor(query({
        computed: none,
        filters: [{ column: "amount", operator: "greater_than", value: "100" }],
        summarize: [{ aggregation: "SUM", field: "amount" }],
        groupBy: ["title"],
        sort: [{ column: "amount_sum", direction: "DESC" }],
      } as Partial<VisualQuery>))).toBe(before);
    }
  });
});

// ── 23 ───────────────────────────────────────────────────────────────

describe("VENDOR LAYER — a computed division", () => {

  /** `unit = amount ÷ qty`: two integer columns, which is where `/` parts ways
   *  with the other three operators. */
  const unit = { name: "unit", left: "amount", operator: "/", right: "qty" };

  const divided = query({ computed: [unit] } as Partial<VisualQuery>);

  /** The decimal type the left side is cast to, per vendor. SQLite has none -
   *  `CAST(x AS DECIMAL(31,4))` there only gives the value NUMERIC affinity,
   *  which leaves an integer an integer and the division integer division - so
   *  it casts to REAL, its own floating type. */
  const DECIMAL_TYPE = {
    sqlite: "REAL",
    duckdb: "DECIMAL(31,4)",
    postgres: "DECIMAL(31,4)",
    mysql: "DECIMAL(31,4)",
    mariadb: "DECIMAL(31,4)",
    clickhouse: "DECIMAL(31,4)",
    sqlserver: "DECIMAL(31,4)",
    oracle: "DECIMAL(31,4)",
    db2: "DECIMAL(31,4)",
  };

  it("casts the left side to the decimal type the vendor has", () => {
    for (const [vendor, type] of eachVendor(DECIMAL_TYPE)) {
      expect(unquoted(sqlOn(divided, vendor))).withContext(vendor)
        .toContain(`(CAST(amount AS ${type}) / NULLIF(qty, 0)) AS unit`);
    }
  });

  it("is the vendor layer's own function, so no form lives in the generator", () => {
    for (const [vendor, type] of eachVendor(DECIMAL_TYPE)) {
      expect(decimalDivision("a", "b", vendor)).withContext(vendor)
        .toBe(`(CAST(a AS ${type}) / NULLIF(b, 0))`);
    }
  });

  it("never writes the bare division, which four vendors read as integer division", () => {
    // PostgreSQL, SQL Server, SQLite and Db2 answer 1 for 3 / 2; the cast is what
    // makes the column the fraction the user asked for on all nine.
    for (const vendor of EVERY_VENDOR) {
      expect(unquoted(sqlOn(divided, vendor))).withContext(vendor).not.toContain("(amount / qty)");
    }
  });

  it("answers NULL for a zero divisor instead of failing the query", () => {
    // Dividing by zero is an error on five of the nine and NULL on the others;
    // NULLIF makes every vendor answer NULL, and a NULL row is one the grid shows.
    for (const vendor of EVERY_VENDOR) {
      expect(unquoted(sqlOn(divided, vendor))).withContext(vendor).toContain("NULLIF(qty, 0)");
    }
    expect(unquoted(sqlOn(query({
      computed: [{ name: "half", left: "amount", operator: "/", right: "2" }],
    } as Partial<VisualQuery>), "postgres"))).toContain("NULLIF(2, 0)");
  });

  it("writes the same form wherever the name is read: a filter, an aggregate, a sort key", () => {
    for (const [vendor, type] of eachVendor(DECIMAL_TYPE)) {
      const expr = `(CAST(amount AS ${type}) / NULLIF(qty, 0))`;
      const filtered = unquoted(sqlOn(query({
        computed: [unit], filters: [{ column: "unit", operator: "greater_than", value: "10" }],
      } as Partial<VisualQuery>), vendor));
      expect(filtered).withContext(vendor).toContain(`WHERE ${expr} > 10`);
      const summarized = unquoted(sqlOn(query({
        computed: [unit],
        summarize: [{ aggregation: "AVG", field: "unit" }],
        groupBy: ["title"],
        sort: [{ column: "unit_avg", direction: "DESC" }],
      } as Partial<VisualQuery>), vendor));
      // AVG casts what it averages, the way it does for a column (block 1).
      const avg = `CAST(AVG(CAST(${expr} AS DECIMAL(31,4))) AS DECIMAL(31,4))`;
      expect(summarized).withContext(vendor).toContain(`${avg} AS unit_avg`);
      expect(summarized).withContext(vendor).toContain(`END, ${avg} DESC`);
    }
  });
});

// ── 24 ───────────────────────────────────────────────────────────────

describe("ANSI — a condition on an aggregate (HAVING)", () => {

  /** "The stages of more than 150 deals": a condition no WHERE can express,
   *  because the count exists only once the rows are grouped. */
  const countOver = (value: string, operator = ">") => query({
    groupBy: ["stage"],
    summarize: [{ aggregation: "COUNT", field: "*", having: { operator, value } }],
  } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(countOver("150")).length).toBeGreaterThan(0);
  });

  it("keeps the groups whose aggregate passes the condition", () => {
    expect(oneAnsiTextFor(countOver("150"))).toContain("HAVING COUNT(*) > 150");
  });

  it("writes the aggregate expression and never its alias", () => {
    // PostgreSQL, SQL Server, Oracle and Db2 reject an output alias in a HAVING;
    // the expression is the one the SELECT writes, so the two always agree.
    const ansi = oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [{ aggregation: "SUM", field: "amount", having: { operator: ">", value: "1000" } }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("HAVING CAST(SUM(amount) AS DECIMAL(31,4)) > 1000");
    expect(ansi).not.toContain("HAVING amount_sum");
  });

  it("writes SQL for every comparison the step offers", () => {
    // The dropdown and the generator are one list (`aggregations.ts`): a
    // comparison offered without a form here would reach a database as a label.
    for (const op of HAVING_OPS) {
      const ansi = oneAnsiTextFor(countOver("150", op.value));
      expect(ansi).withContext(op.value).toContain(`HAVING COUNT(*) ${op.value} 150`);
      // The sign the user reads is not the SQL: two of the five are not ASCII.
      for (const label of HAVING_OPS.map((o) => o.label).filter((l) => !HAVING_OP_VALUES.includes(l))) {
        expect(ansi).withContext(`${op.value} ${label}`).not.toContain(label);
      }
    }
  });

  it("stands between the GROUP BY and the ORDER BY", () => {
    const ansi = oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [{ aggregation: "COUNT", field: "*", having: { operator: ">", value: "150" } }],
      sort: [{ column: "count", direction: "DESC" }],
    } as Partial<VisualQuery>));
    expect(ansi.indexOf("GROUP BY")).toBeLessThan(ansi.indexOf("HAVING"));
    expect(ansi.indexOf("HAVING")).toBeLessThan(ansi.indexOf("ORDER BY"));
  });

  it("joins several conditions with AND", () => {
    const ansi = oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [
        { aggregation: "COUNT", field: "*", having: { operator: ">", value: "150" } },
        { aggregation: "SUM", field: "amount", having: { operator: "<=", value: "9000000" } },
      ],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("HAVING COUNT(*) > 150");
    expect(ansi).toContain("AND CAST(SUM(amount) AS DECIMAL(31,4)) <= 9000000");
  });

  it("holds a computed column's aggregate the same way", () => {
    // The condition reads the aggregate through the same resolver the SELECT
    // does (F6), so a computed name is its arithmetic here too.
    expect(oneAnsiTextFor(query({
      computed: [{ name: "revenue", left: "amount", operator: "*", right: "qty" }],
      groupBy: ["title"],
      summarize: [{ aggregation: "SUM", field: "revenue", having: { operator: ">=", value: "100" } }],
    } as Partial<VisualQuery>)))
      .toContain("HAVING CAST(SUM((amount * qty)) AS DECIMAL(31,4)) >= 100");
  });

  it("holds over the whole table when nothing is grouped", () => {
    // HAVING without GROUP BY is one group, the whole result: the query answers
    // its single row or no row at all.
    const ansi = oneAnsiTextFor(query({
      summarize: [{ aggregation: "COUNT", field: "*", having: { operator: ">", value: "0" } }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("HAVING COUNT(*) > 0");
    expect(ansi).not.toContain("GROUP BY");
  });

  it("puts a number in the SQL, so nothing typed can reach it as SQL", () => {
    // The value is read as a number or the condition is not written at all:
    // there is no string literal, and nothing to escape.
    for (const notANumber of ["150 OR 1=1 --", "'150'", "", "  ", "abc"]) {
      const ansi = oneAnsiTextFor(countOver(notANumber));
      expect(ansi).withContext(notANumber).not.toContain("HAVING");
      expect(ansi).withContext(notANumber).not.toContain("1=1");
    }
  });

  it("leaves an unfinished condition out of the SQL entirely", () => {
    const plain = oneAnsiTextFor(query({
      groupBy: ["stage"], summarize: [{ aggregation: "COUNT", field: "*" }],
    } as Partial<VisualQuery>));
    for (const half of [
      { operator: "", value: "150" },
      { operator: ">", value: "" },
      { operator: "LIKE", value: "150" },
      { operator: ">", value: "many" },
    ]) {
      expect(isCompleteCondition(half)).withContext(JSON.stringify(half)).toBe(false);
      expect(oneAnsiTextFor(countOver(half.value, half.operator)))
        .withContext(JSON.stringify(half)).toBe(plain);
    }
    expect(isCompleteCondition(undefined)).toBe(false);
    expect(isCompleteCondition({ operator: ">", value: "150" })).toBe(true);
    expect(isCompleteCondition({ operator: ">", value: " 0 " })).toBe(true);
  });

  it("changes nothing for a query that has none (every canvas saved until now)", () => {
    const before = oneAnsiTextFor(query({
      filters: [{ column: "amount", operator: "greater_than", value: "100" }],
      summarize: [{ aggregation: "SUM", field: "amount" }],
      groupBy: ["title"],
      sort: [{ column: "amount_sum", direction: "DESC" }],
    } as Partial<VisualQuery>));
    expect(before).not.toContain("HAVING");
    expect(oneAnsiTextFor(query({
      filters: [{ column: "amount", operator: "greater_than", value: "100" }],
      summarize: [{ aggregation: "SUM", field: "amount", having: undefined }],
      groupBy: ["title"],
      sort: [{ column: "amount_sum", direction: "DESC" }],
    } as Partial<VisualQuery>))).toBe(before);
  });

  it("is ignored by a query that summarizes nothing", () => {
    // A condition on an aggregate a query no longer has is not a WHERE: the
    // rows it would keep do not exist.
    expect(oneAnsiTextFor(query({
      summarize: [], groupBy: ["stage"],
    } as Partial<VisualQuery>))).not.toContain("HAVING");
  });
});

// ── 25 ───────────────────────────────────────────────────────────────

describe("ANSI — matching all the filters or any one of them", () => {

  /** "Closed Won, or anything above 50000" - one question the AND join cannot
   *  ask, because almost no row is both. */
  const two = (filterMatch?: FilterMatch) => query({
    filters: [
      { column: "title", operator: "equals", value: "Acme" },
      { column: "amount", operator: "greater_than", value: "50000" },
    ],
    ...(filterMatch === undefined ? {} : { filterMatch }),
  } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(two("any")).length).toBeGreaterThan(0);
  });

  it("joins the conditions with OR inside one pair of brackets", () => {
    expect(oneAnsiTextFor(two("any"))).toContain("WHERE (title = 'Acme'\n  OR amount > 50000)");
  });

  it("still joins them with AND, and writes no brackets, when matching all", () => {
    const all = oneAnsiTextFor(two("all"));
    expect(all).toContain("WHERE title = 'Acme'\n  AND amount > 50000");
    expect(all).not.toContain("OR ");
  });

  it("means `all` when the query says nothing (every canvas saved until now)", () => {
    expect(oneAnsiTextFor(two(undefined))).toBe(oneAnsiTextFor(two("all")));
    expect(matchesAnyFilter(undefined)).toBe(false);
    expect(matchesAnyFilter(null)).toBe(false);
  });

  it("offers exactly the two ways the generator knows", () => {
    // The dropdown and the generator are one list: a third entry offered here
    // would silently generate the SQL of `all`.
    expect(FILTER_MATCHES.map((m) => m.value)).toEqual(["all", "any"]);
    for (const match of FILTER_MATCHES) {
      expect(matchesAnyFilter(match.value)).withContext(match.value).toBe(match.value === "any");
      expect(oneAnsiTextFor(two(match.value)))
        .withContext(match.value).toContain(match.value === "any" ? "OR " : "AND ");
    }
  });

  it("writes no brackets and no OR for a single condition", () => {
    const one = oneAnsiTextFor(query({
      filters: [{ column: "amount", operator: "greater_than", value: "50000" }],
      filterMatch: "any",
    } as Partial<VisualQuery>));
    expect(one).toContain("WHERE amount > 50000");
    expect(one).not.toContain("WHERE (");
    expect(one).not.toContain("OR ");
  });

  it("keeps the whole set inside the brackets, however many conditions there are", () => {
    const three = oneAnsiTextFor(query({
      filters: [
        { column: "title", operator: "equals", value: "Acme" },
        { column: "amount", operator: "greater_than", value: "50000" },
        { column: "closed_on", operator: "is_null", value: "" },
      ],
      filterMatch: "any",
    } as Partial<VisualQuery>));
    const where = three.split("\nWHERE ")[1];
    expect(where.startsWith("(")).toBe(true);
    expect(where.trimEnd().endsWith(")")).toBe(true);
    expect(where.split("\n  OR ").length).toBe(3);
  });

  it("stands where a WHERE always stands, before the GROUP BY", () => {
    const ansi = oneAnsiTextFor(query({
      filters: [
        { column: "title", operator: "equals", value: "Acme" },
        { column: "amount", operator: "greater_than", value: "50000" },
      ],
      filterMatch: "any",
      groupBy: ["stage"],
      summarize: [{ aggregation: "COUNT", field: "*" }],
    } as Partial<VisualQuery>));
    expect(ansi.indexOf("WHERE (")).toBeLessThan(ansi.indexOf("GROUP BY"));
  });

  it("drops a filter that is not applied instead of writing the `1=1` of an AND", () => {
    // `1=1` is the harmless filler of a set joined with AND and the exact
    // opposite in one joined with OR: `1=1 OR amount > 50000` answers the whole
    // table, so an empty IN list would quietly undo every other condition.
    const withEmptyList = (filterMatch: string) => query({
      filters: [
        { column: "title", operator: "in", value: "" },
        { column: "amount", operator: "greater_than", value: "50000" },
      ],
      filterMatch,
    } as Partial<VisualQuery>);
    const any = oneAnsiTextFor(withEmptyList("any"));
    expect(any).toContain("WHERE amount > 50000");
    expect(any).not.toContain("1=1");
    expect(any).not.toContain("OR ");
    // Matching all keeps the filler it always wrote.
    expect(oneAnsiTextFor(withEmptyList("all"))).toContain("WHERE 1=1\n  AND amount > 50000");
  });

  it("writes no WHERE at all when not one of the conditions is applied", () => {
    const ansi = oneAnsiTextFor(query({
      filters: [
        { column: "title", operator: "in", value: "" },
        { column: "amount", operator: "greater_than", value: "" },
      ],
      filterMatch: "any",
    } as Partial<VisualQuery>));
    expect(ansi).not.toContain("WHERE");
    expect(ansi).not.toContain("1=1");
  });

  it("leaves a half-typed value box out of the set, as it always did", () => {
    expect(oneAnsiTextFor(query({
      filters: [
        { column: "title", operator: "equals", value: "Acme" },
        { column: "amount", operator: "greater_than", value: "" },
      ],
      filterMatch: "any",
    } as Partial<VisualQuery>))).toContain("WHERE title = 'Acme'");
  });
});

// ── 26 ───────────────────────────────────────────────────────────────

describe("ANSI — grouping with nothing to summarize (SELECT DISTINCT)", () => {

  /** "Which stages are there?" - a question with no aggregate in it at all. */
  const distinct = (patch: Partial<VisualQuery> = {}) => query({
    groupBy: ["stage"], ...patch,
  } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(distinct()).length).toBeGreaterThan(0);
  });

  it("answers the distinct combinations of the grouped columns", () => {
    // Before this, the grouping was silently dropped and the query answered
    // every row of the table.
    const ansi = oneAnsiTextFor(distinct());
    expect(ansi).toContain("SELECT DISTINCT stage\nFROM crm_deals");
    expect(ansi).not.toContain("SELECT *");
  });

  it("writes no GROUP BY, because there is nothing to group for", () => {
    // DISTINCT and a GROUP BY with no aggregate answer the same rows; DISTINCT
    // is what the question says, and it is the one both a sort key and a row
    // cap read the same way on all nine.
    expect(oneAnsiTextFor(distinct())).not.toContain("GROUP BY");
  });

  it("lists every grouped column, in the order they were grouped", () => {
    expect(oneAnsiTextFor(distinct({ groupBy: ["stage", "title"] })))
      .toContain("SELECT DISTINCT stage, title\nFROM crm_deals");
  });

  it("keeps the bin expression of a grouped number the same way", () => {
    const ansi = oneAnsiTextFor(distinct({
      groupBy: ["amount"], groupByNumericBuckets: { amount: { width: 25000 } },
    } as Partial<VisualQuery>));
    expect(ansi).toContain("SELECT DISTINCT ");
    expect(ansi).toContain(" AS amount\nFROM crm_deals");
  });

  it("writes a grouped computed column as its arithmetic, and no `table.*`", () => {
    // Without a Summarize a computed column is one more select item beside the
    // table's own columns (F6) - but a query that asks for combinations asks
    // for those columns and nothing else, or every row would be distinct.
    const ansi = oneAnsiTextFor(distinct({
      computed: [{ name: "revenue", left: "amount", operator: "*", right: "qty" }],
      groupBy: ["revenue"],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("SELECT DISTINCT (amount * qty) AS revenue");
    expect(ansi).not.toContain(".*");
  });

  it("filters the rows before they are made distinct, as a WHERE always does", () => {
    const ansi = oneAnsiTextFor(distinct({
      filters: [{ column: "amount", operator: "greater_than", value: "50000" }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("SELECT DISTINCT stage");
    expect(ansi).toContain("WHERE amount > 50000");
  });

  it("sorts by a grouped column, and drops a sort key it does not select", () => {
    // PostgreSQL, Oracle and Db2 refuse an ORDER BY over a column a DISTINCT
    // query does not select: the row it would sort by does not exist any more.
    expect(oneAnsiTextFor(distinct({ sort: [{ column: "stage", direction: "ASC" }] })))
      .toContain("ORDER BY");
    expect(oneAnsiTextFor(distinct({ sort: [{ column: "deal_name", direction: "ASC" }] })))
      .not.toContain("ORDER BY");
  });

  it("sorts outside itself, as a derived table, so the NULLs stay last", () => {
    // The NULLs-last CASE is an expression the distinct SELECT does not hold,
    // and PostgreSQL, Oracle, Db2 and SQL Server refuse such an ORDER BY for a
    // SELECT DISTINCT outright - the query would not run at all on four of the
    // nine. Sorting the distinct rows as a derived table is standard SQL on all
    // nine and keeps the NULLs where the rest of the product puts them.
    const ansi = oneAnsiTextFor(distinct({ sort: [{ column: "stage", direction: "ASC" }] }));
    expect(ansi).toContain("SELECT *\nFROM (\n  SELECT DISTINCT stage\n  FROM crm_deals\n) distinct_rows");
    expect(ansi).toContain("ORDER BY CASE WHEN stage IS NULL THEN 1 ELSE 0 END, stage ASC");
    // Oracle rejects `AS` before a table alias, so the alias carries none.
    expect(ansi).not.toContain(") AS distinct_rows");
  });

  it("sorts a bucketed column by its name outside, because the bucket ran inside", () => {
    const ansi = unquoted(sqlOn(query({
      groupBy: ["amount"],
      groupByNumericBuckets: { amount: { width: 25000 } },
      sort: [{ column: "amount", direction: "DESC" }],
    } as Partial<VisualQuery>), "postgres"));
    expect(ansi).toContain("ORDER BY CASE WHEN amount IS NULL THEN 1 ELSE 0 END, amount DESC");
    // The bin expression is written once, inside the derived table.
    expect(ansi.split("FLOOR").length - 1).toBe(1);
  });

  it("does not wrap a distinct query that sorts by nothing", () => {
    const ansi = oneAnsiTextFor(distinct());
    expect(ansi).not.toContain("distinct_rows");
    expect(ansi.startsWith("SELECT DISTINCT ")).toBe(true);
  });

  it("offers the Sort step exactly the columns it can sort by", () => {
    // The step and the generator read the same rule, so a key the generator
    // would drop is never offered in the first place.
    const columns = [
      { columnName: "stage", typeName: "text", isNullable: true },
      { columnName: "deal_name", typeName: "text", isNullable: true },
    ];
    expect(sortableColumns(distinct(), columns).map((c) => c.columnName)).toEqual(["stage"]);
    // Nothing grouped and nothing summarized: every column, as before.
    expect(sortableColumns(query({}), columns).map((c) => c.columnName))
      .toEqual(["stage", "deal_name"]);
  });

  it("changes nothing for a query that groups and summarizes", () => {
    const grouped = oneAnsiTextFor(query({
      groupBy: ["stage"], summarize: [{ aggregation: "COUNT", field: "*" }],
    } as Partial<VisualQuery>));
    expect(grouped).toContain("GROUP BY stage");
    expect(grouped).not.toContain("DISTINCT");
  });

  it("changes nothing for a query that groups by nothing", () => {
    const plain = oneAnsiTextFor(query({}));
    expect(plain).toContain("SELECT *");
    expect(plain).not.toContain("DISTINCT");
  });
});

// ── 27 ───────────────────────────────────────────────────────────────

describe("VENDOR LAYER — a distinct query, capped and bucketed", () => {

  const capped = (vendor: SqlDialect): string => sqlOn(query({
    groupBy: ["stage"], limit: 100,
  } as Partial<VisualQuery>), vendor);

  it("writes the cap the vendor takes, and SQL Server's TOP after the DISTINCT", () => {
    // `SELECT TOP 100 DISTINCT` is a syntax error; `SELECT DISTINCT TOP 100` is
    // the form, and it caps the distinct rows and not the rows they came from.
    const CAP: Record<string, string> = {
      sqlite:     "\nLIMIT 100",
      duckdb:     "\nLIMIT 100",
      mysql:      "\nLIMIT 100",
      mariadb:    "\nLIMIT 100",
      clickhouse: "\nLIMIT 100",
      postgres:   "\nFETCH FIRST 100 ROWS ONLY",
      oracle:     "\nFETCH FIRST 100 ROWS ONLY",
      db2:        "\nFETCH FIRST 100 ROWS ONLY",
      sqlserver:  "SELECT DISTINCT TOP 100 ",
    };
    for (const [vendor, expected] of eachVendor(CAP)) {
      expect(capped(vendor)).withContext(vendor).toContain(expected);
      expect(capped(vendor)).withContext(vendor).not.toContain("TOP 100 DISTINCT");
    }
  });

  it("caps a sorted distinct query on the derived table, where the rows come out", () => {
    // Sorted, the distinct rows are a derived table, so the cap belongs to the
    // outer query - including SQL Server's TOP, which stands on the SELECT that
    // hands the rows back.
    const CAP_SORTED: Record<string, string> = {
      sqlite:     "\nLIMIT 100",
      duckdb:     "\nLIMIT 100",
      mysql:      "\nLIMIT 100",
      mariadb:    "\nLIMIT 100",
      clickhouse: "\nLIMIT 100",
      postgres:   "\nFETCH FIRST 100 ROWS ONLY",
      oracle:     "\nFETCH FIRST 100 ROWS ONLY",
      db2:        "\nFETCH FIRST 100 ROWS ONLY",
      sqlserver:  "SELECT TOP 100 *\nFROM (",
    };
    for (const [vendor, expected] of eachVendor(CAP_SORTED)) {
      const sql = sqlOn(query({
        groupBy: ["stage"], sort: [{ column: "stage", direction: "ASC" }], limit: 100,
      } as Partial<VisualQuery>), vendor);
      expect(sql).withContext(vendor).toContain(expected);
      expect(sql).withContext(vendor).not.toContain("DISTINCT TOP");
    }
  });

  it("puts a grouped date's bucket expression inside the DISTINCT, on every vendor", () => {
    // A month bucket is the vendor layer's own text (`bucketExpr`), so this
    // block asserts its place and not one ANSI form: inside the DISTINCT, under
    // the column's name, so the query answers the distinct months and not one
    // row per day.
    for (const vendor of EVERY_VENDOR) {
      const sql = unquoted(sqlOn(query({
        groupBy: ["closed_on"], groupByBuckets: { closed_on: "month" },
      } as Partial<VisualQuery>), vendor));
      expect(sql.startsWith("SELECT DISTINCT ")).withContext(vendor).toBe(true);
      expect(sql).withContext(vendor).toContain(" AS closed_on\nFROM ");
      expect(sql).withContext(vendor).not.toContain("GROUP BY");
    }
  });
});

// ── 28 ───────────────────────────────────────────────────────────────

describe("ANSI — an aggregate read as a % of the whole result", () => {

  /** "What share of the money does each stage hold?" - the everyday question
   *  behind every category breakdown and every pie chart. */
  const share = (patch: Partial<VisualQuery> = {}) => query({
    groupBy: ["stage"],
    summarize: [{ aggregation: "SUM", field: "amount", share: true }],
    ...patch,
  } as Partial<VisualQuery>);

  it("writes one text on every vendor", () => {
    expect(oneAnsiTextFor(share()).length).toBeGreaterThan(0);
  });

  it("divides the group's own aggregate by the total over every group", () => {
    // The total is a number no single grouped row holds, so it is a window
    // over the grouped rows - `SUM(<aggregate>) OVER ()`.
    expect(oneAnsiTextFor(share())).toContain(
      "(100.0 * CAST(CAST(SUM(amount) AS DECIMAL(31,4)) AS DECIMAL(20,4))"
      + " / NULLIF(SUM(CAST(SUM(amount) AS DECIMAL(31,4))) OVER (), 0)) AS amount_sum_pct");
  });

  it("names the share column apart from the number it is a share of", () => {
    const both = oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [
        { aggregation: "SUM", field: "amount" },
        { aggregation: "SUM", field: "amount", share: true },
      ],
    } as Partial<VisualQuery>));
    expect(both).toContain("AS amount_sum,");
    expect(both).toContain("AS amount_sum_pct");
  });

  it("reads a COUNT as a share the same way", () => {
    expect(oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [{ aggregation: "COUNT", field: "*", share: true }],
    } as Partial<VisualQuery>)))
      .toContain("(100.0 * CAST(COUNT(*) AS DECIMAL(20,4))"
        + " / NULLIF(SUM(COUNT(*)) OVER (), 0)) AS count_pct");
  });

  it("carries the decimal point, so the division is never an integer one", () => {
    // `100 * COUNT(*) / total` is integer division on PostgreSQL, SQL Server,
    // SQLite and Db2, where every share below 1% would answer 0.
    const ansi = oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [{ aggregation: "COUNT", field: "*", share: true }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("100.0 * ");
    expect(percentOfTotalExpr("COUNT(*)"))
      .toBe("(100.0 * CAST(COUNT(*) AS DECIMAL(20,4)) / NULLIF(SUM(COUNT(*)) OVER (), 0))");
  });

  it("narrows the numerator, so the factor fits inside a decimal on Db2 as well", () => {
    // A SUM is already cast to DECIMAL(31,4) - 31 is Db2's maximum precision -
    // and `100.0 *` that asks for more digits than a decimal holds: Db2 pays in
    // scale and answered 43.0 where every other database answered 43.0172783
    // (measured on all nine at G2a). Narrowing the numerator to DECIMAL(20,4)
    // leaves eleven digits for the factor, and the narrowed form answered
    // 43.0172783 on all nine, SQLite included - so it is one ANSI text and not
    // the vendor layer's business.
    expect(percentOfTotalExpr("CAST(SUM(amount) AS DECIMAL(31,4))")).toBe(
      "(100.0 * CAST(CAST(SUM(amount) AS DECIMAL(31,4)) AS DECIMAL(20,4))"
      + " / NULLIF(SUM(CAST(SUM(amount) AS DECIMAL(31,4))) OVER (), 0))");
    // The total under the NULLIF keeps its own precision: narrowing the
    // numerator alone is what the databases were asked, and what they answered.
    expect(percentOfTotalExpr("CAST(SUM(amount) AS DECIMAL(31,4))"))
      .toContain("NULLIF(SUM(CAST(SUM(amount) AS DECIMAL(31,4))) OVER (), 0)");
  });

  it("answers NULL instead of an error when the whole result totals zero", () => {
    expect(percentOfTotalExpr("SUM(x)")).toContain("NULLIF(SUM(SUM(x)) OVER (), 0)");
  });

  it("takes the arithmetic of a computed column into the share", () => {
    expect(oneAnsiTextFor(query({
      computed: [{ name: "revenue", left: "amount", operator: "*", right: "qty" }],
      groupBy: ["title"],
      summarize: [{ aggregation: "SUM", field: "revenue", share: true }],
    } as Partial<VisualQuery>)))
      .toContain("(100.0 * CAST(CAST(SUM((amount * qty)) AS DECIMAL(31,4)) AS DECIMAL(20,4))");
  });

  it("sorts by the aggregate underneath the share, never by the window", () => {
    // No vendor allows a window function in a HAVING, and the total is one
    // number for the whole result - so the plain aggregate sorts the rows in
    // exactly the order the shares do.
    const ansi = oneAnsiTextFor(share({ sort: [{ column: "amount_sum_pct", direction: "DESC" }] }));
    expect(ansi).toContain("ORDER BY");
    expect(ansi.split("ORDER BY")[1]).not.toContain("OVER ()");
    expect(ansi.split("ORDER BY")[1]).toContain("CAST(SUM(amount) AS DECIMAL(31,4)) DESC");
  });

  it("offers the Sort step the share under the name the SELECT writes", () => {
    const columns = [{ columnName: "stage", typeName: "text", isNullable: true }];
    expect(sortableColumns(share(), columns).map((c) => c.columnName))
      .toEqual(["stage", "amount_sum_pct"]);
  });

  it("keeps a condition on the aggregate itself, outside the share", () => {
    // A HAVING holds the aggregate and not the window: `HAVING SUM(...) > n`
    // runs everywhere, `HAVING 100.0 * SUM(...) OVER () > n` runs nowhere.
    const ansi = oneAnsiTextFor(share({
      summarize: [{
        aggregation: "SUM", field: "amount", share: true,
        having: { operator: ">", value: "1000000" },
      }],
    } as Partial<VisualQuery>));
    expect(ansi).toContain("HAVING CAST(SUM(amount) AS DECIMAL(31,4)) > 1000000");
    expect(ansi.split("HAVING")[1]).not.toContain("OVER ()");
  });

  it("offers the option under the one label the step shows", () => {
    expect(SHARE_LABEL).toBe("% of total");
  });

  it("changes nothing for an aggregate that is not read as a share", () => {
    const plain = oneAnsiTextFor(query({
      groupBy: ["stage"], summarize: [{ aggregation: "SUM", field: "amount" }],
    } as Partial<VisualQuery>));
    expect(plain).not.toContain("OVER ()");
    expect(plain).toContain("AS amount_sum");
    // Every canvas saved before this existed carries no `share` at all.
    expect(oneAnsiTextFor(query({
      groupBy: ["stage"],
      summarize: [{ aggregation: "SUM", field: "amount", share: undefined }],
    } as Partial<VisualQuery>))).toBe(plain);
  });
});

// ── 29 ─────────────────────────────────────────────────────────

describe("ANSI — an aggregate accumulated up to this bucket (running total)", () => {

  /** "How much have we closed this year so far?" - the cumulative line, and the
   *  question a month-by-month bar chart cannot answer. */
  const monthly = (patch: Partial<VisualQuery> = {}) => query({
    groupBy: ["closed_on"],
    groupByBuckets: { closed_on: "month" },
    summarize: [{ aggregation: "SUM", field: "amount", runningTotal: true }],
    ...patch,
  } as Partial<VisualQuery>);

  it("accumulates with a window whose frame starts at the first row", () => {
    // The frame is written out: the default frame of an ordered window is
    // RANGE, which adds every row sharing the bucket's value in one step - the
    // same rows here, but only because the buckets are already distinct.
    expect(runningTotalExpr("SUM(amount)", "closed_month"))
      .toBe("SUM(SUM(amount)) OVER (ORDER BY closed_month ROWS UNBOUNDED PRECEDING)");
  });

  it("adds the buckets up whatever the aggregate underneath is", () => {
    // Accumulating means adding, so the outer function is a SUM even over a
    // COUNT: the deals so far, not the count of counts.
    expect(runningTotalExpr("COUNT(*)", "m"))
      .toBe("SUM(COUNT(*)) OVER (ORDER BY m ROWS UNBOUNDED PRECEDING)");
  });

  it("names the accumulated column apart from the number it accumulates", () => {
    const sql = unquoted(sqlOn(monthly(), "sqlite"));
    expect(sql).toContain("ROWS UNBOUNDED PRECEDING) AS amount_sum_running");
    expect(sql).not.toContain("AS amount_sum\n");
  });

  it("orders the window by the bucket, with the NULLs of the series last", () => {
    // A row with no date belongs at the end of a series, not at the start of
    // it (T6), and the window's own ORDER BY is what "so far" means.
    for (const vendor of EVERY_VENDOR) {
      const sql = unquoted(sqlOn(monthly(), vendor));
      expect(sql).withContext(vendor).toContain("OVER (ORDER BY CASE WHEN ");
      expect(sql).withContext(vendor).toContain(" IS NULL THEN 1 ELSE 0 END, ");
      expect(sql).withContext(vendor).toContain(" ROWS UNBOUNDED PRECEDING)");
    }
  });

  it("offers the Sort step the running total under the name the SELECT writes", () => {
    const columns = [{ columnName: "closed_on", typeName: "date", isNullable: true }];
    expect(sortableColumns(monthly(), columns).map((c) => c.columnName))
      .toEqual(["closed_on", "amount_sum_running"]);
  });

  it("keeps the window out of the ORDER BY and out of the HAVING", () => {
    // No vendor allows a window function in a HAVING, and a cumulative series
    // is read in the order it accumulates in - its time bucket.
    const sql = unquoted(sqlOn(monthly({
      summarize: [{
        aggregation: "SUM", field: "amount", runningTotal: true,
        having: { operator: ">", value: "1000" },
      }],
      sort: [{ column: "amount_sum_running", direction: "ASC" }],
    } as Partial<VisualQuery>), "sqlite"));
    expect(sql).toContain("HAVING CAST(SUM(amount) AS DECIMAL(31,4)) > 1000");
    expect(sql.split("HAVING")[1]).not.toContain("OVER (");
    expect(sql.split("ORDER BY").pop()).not.toContain("OVER (");
  });

  it("accumulates a COUNT of rows the same way", () => {
    const sql = unquoted(sqlOn(monthly({
      summarize: [{ aggregation: "COUNT", field: "*", runningTotal: true }],
    } as Partial<VisualQuery>), "sqlite"));
    expect(sql).toContain("SUM(COUNT(*)) OVER (ORDER BY CASE WHEN ");
    expect(sql).toContain("ROWS UNBOUNDED PRECEDING) AS count_running");
  });

  it("is a way of reading a SUM or a COUNT, and of nothing else", () => {
    // The running total of an average or of a MIN is not a number anyone asked
    // for, so the flag on one is the plain aggregate - one rule, `runsAsRunningTotal`,
    // which the Summarize step reads to decide what to offer at all.
    expect(RUNNING_TOTAL_AGGREGATIONS).toEqual(["SUM", "COUNT", "COUNT DISTINCT"]);
    for (const aggregation of ["AVG", "MIN", "MAX"]) {
      const vq = monthly({ summarize: [{ aggregation, field: "amount", runningTotal: true }] } as Partial<VisualQuery>);
      expect(runsAsRunningTotal(vq, vq.summarize[0])).withContext(aggregation).toBe(false);
      expect(unquoted(sqlOn(vq, "sqlite"))).withContext(aggregation).not.toContain("OVER (");
    }
  });

  it("needs one series to accumulate in: one column, bucketed by time", () => {
    // Grouped by two columns there is no one series, and grouped by a plain
    // text column a window ordered by it would answer a different number
    // whenever the database chose another row order.
    const twoColumns = monthly({ groupBy: ["closed_on", "stage"] } as Partial<VisualQuery>);
    expect(runsAsRunningTotal(twoColumns, twoColumns.summarize[0])).toBe(false);
    expect(unquoted(sqlOn(twoColumns, "sqlite"))).not.toContain("OVER (");

    const noBucket = monthly({ groupBy: ["stage"], groupByBuckets: {} } as Partial<VisualQuery>);
    expect(runsAsRunningTotal(noBucket, noBucket.summarize[0])).toBe(false);
    expect(unquoted(sqlOn(noBucket, "sqlite"))).not.toContain("OVER (");
    // And the column keeps the plain name, so the grid header and a sort key
    // saved with it still agree.
    expect(unquoted(sqlOn(noBucket, "sqlite"))).toContain("AS amount_sum");
  });

  it("offers the option under the one label the step shows", () => {
    expect(RUNNING_TOTAL_LABEL).toBe("running total");
  });

  it("changes nothing for an aggregate that is not accumulated", () => {
    const plain = unquoted(sqlOn(monthly({
      summarize: [{ aggregation: "SUM", field: "amount" }],
    } as Partial<VisualQuery>), "sqlite"));
    expect(plain).not.toContain("OVER (");
    expect(plain).toContain("AS amount_sum");
    // Every canvas saved before this existed carries no `runningTotal` at all.
    expect(unquoted(sqlOn(monthly({
      summarize: [{ aggregation: "SUM", field: "amount", runningTotal: undefined }],
    } as Partial<VisualQuery>), "sqlite"))).toBe(plain);
  });
});

// ── 30 ─────────────────────────────────────────────────────────

describe("VENDOR LAYER — a running total over a month bucket", () => {

  /** The vendor's own month expression, read back out of the SELECT it stands
   *  in: it is nested CASEs and vendor date functions, and on some vendors it
   *  runs over several lines, so it is taken by its boundaries and never split
   *  on a newline. */
  const bucketOf = (sql: string): string =>
    sql.split(" AS closed_on,")[0].split("SELECT ").pop()!;

  const monthlyCount = (vendor: SqlDialect): string => unquoted(sqlOn(query({
    groupBy: ["closed_on"],
    groupByBuckets: { closed_on: "month" },
    summarize: [{ aggregation: "COUNT", field: "*", runningTotal: true }],
    sort: [{ column: "closed_on", direction: "ASC" }],
  } as Partial<VisualQuery>), vendor));

  it("orders the window by the earliest date of the bucket, on every vendor", () => {
    // A window's ORDER BY is read under the same rule as the query's own, so the
    // bucket expression is refused there too - MySQL reads it as a nonaggregated
    // column (measured at G2a). `MIN(<column>)` is an aggregate, which every
    // grouped query may order a window by, and it orders the buckets the same way
    // the bucket does: truncating a date never reorders two dates, and a running
    // total exists over a day, week, month or year bucket only. A bucket of NULL
    // dates has MIN NULL, so it still lands last.
    for (const vendor of EVERY_VENDOR) {
      const earliest = "MIN(closed_on)";
      expect(monthlyCount(vendor)).withContext(vendor).toContain(
        `SUM(COUNT(*)) OVER (ORDER BY CASE WHEN ${earliest} IS NULL THEN 1 ELSE 0 END,`
        + ` ${earliest} ROWS UNBOUNDED PRECEDING) AS count_running`);
    }
  });

  it("writes that vendor's own bucket in the SELECT and the GROUP BY, on every vendor", () => {
    for (const vendor of EVERY_VENDOR) {
      const sql = monthlyCount(vendor);
      const bucket = bucketOf(sql);
      expect(sql).withContext(vendor).toContain(`\n  GROUP BY ${bucket}`);
      // Two places, one expression: the SELECT and the GROUP BY. The window
      // accumulates on MIN(<column>) and the query's own ORDER BY is outside the
      // grouped query, on the name the SELECT gave the bucket - so neither
      // repeats the expression.
      expect(sql.split(bucket).length - 1).withContext(vendor).toBe(2);
      expect(sql).withContext(vendor).toContain(") grouped_rows\nORDER BY ");
    }
  });
});

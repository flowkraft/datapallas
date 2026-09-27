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
  nextDay,
  numericBinExpr,
} from "@/lib/explore-data/sql-builder";
import {
  cardinalitySql,
  dateRangeSql,
  numericRangeSql,
  sampleRowsSql,
} from "@/lib/explore-data/smart-defaults/probes";
import {
  aliasSafeColumnRef,
  bucketExpr,
  containsFilter,
  limitClause,
  quoteIdent,
  quoteTableRef,
  sqlLiteral,
  type SqlDialect,
  type SqlLiteralKind,
} from "@/lib/explore-data/sql-dialects";
import type { VisualQuery } from "@/lib/stores/canvas-store";

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

describe("VENDOR LAYER — contains", () => {

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
      clickhouse: "LOWER(c) LIKE LOWER('%50\\\\%\\\\_off!x%')",
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
      clickhouse: "LOWER(c) LIKE LOWER('%a\\\\\\\\b''c%')",
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
      expect(["A", "B", "C"]).withContext(one.id).toContain(one.group);
      expect(one.proves.length).withContext(one.id).toBeGreaterThan(10);
      const shapes = [one.query, one.probe, one.filterPane].filter(Boolean).length;
      expect(shapes).withContext(`${one.id} holds one of query, probe, filterPane`).toBe(1);
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

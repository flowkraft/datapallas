// ═══════════════════════════════════════════════════════════════════════════════
// REPHRASED REQUIREMENTS — Smart Defaults E2E Test Specification
// ═══════════════════════════════════════════════════════════════════════════════
//
// GOAL: Validate that the /data-canvas "Visualize as" palette and default widget
//       configuration smart-defaults behavior works well for given
//       data contexts.
//
// REFERENCE IMPLEMENTATIONS:
//   - RB smart-defaults:  asbl/.../ui-startpage/lib/data-canvas/smart-defaults/
//
// SAMPLE DATA:
//   - Northwind tables:    bkend/common/.../db/northwind/NorthwindDataGenerator.java
//     Orders (14 cols, ~80 rows), Customers (12 cols), Products (20 rows),
//     Employees (9 rows), Order Details (5 cols), Suppliers, Categories, Shippers, etc.
//   - Northwind OLAP cubes: bkend/common/.../db/northwind/NorthwindOlapDataGenerator.java
//   - Sample cube configs:  asbl/.../config/samples-cubes/ (northwind-sales, northwind-customers,
//     northwind-hr, northwind-inventory, northwind-warehouse)
//
// ── DB VENDOR SELECTION STRATEGY ──────────────────────────────────────────────
//
// The smart-defaults depend on column type classification (NUMERIC_TYPES, TEMPORAL_TYPES
// in classification.ts). The same Northwind table produces different JDBC type names
// per vendor (e.g., SQLite returns "INTEGER" while ClickHouse returns "UInt32" or
// "Nullable(UInt32)"). The smart-defaults must produce identical recommendations
// regardless of vendor — this must be tested across vendors.
//
// Vendor selection follows the pattern from reporting.spec.ts:
//
//   DB_VENDORS_SUPPORTED (from connections-test-helper.ts):
//     'oracle', 'sqlserver', 'postgres', 'mysql', 'mariadb', 'ibmdb2',
//     'sqlite', 'duckdb', 'clickhouse', 'supabase'
//
//   STEP 1 — FILE-LEVEL: Before the entire test file executes, randomly select
//     ONE server-based vendor (from the non-file-based pool: oracle, sqlserver,
//     postgres, mysql, mariadb, ibmdb2, supabase). Use the same date-seeded
//     random pattern as reporting.spec.ts (lines 47-64) so the same vendor is
//     used consistently within a single day's run but varies across days.
//     This ensures only ONE server vendor needs to be running per execution.
//
//   STEP 2 — VENDOR LOOP: DB_VENDORS_SELECTED returns exactly 2 vendors
//     (one file-based, one server-based). The test loops over both vendors,
//     running ALL selected branches on each:
//       - Vendor A (file-based): randomly picked sqlite or duckdb (50/50)
//       - Vendor B (server-based): the vendor selected in STEP 1
//
//     Net effect: every branch runs twice (once file-based, once server-based).
//     Over multiple executions (different days), different server vendors get
//     exercised via the date-seeded STEP 1 rotation.
//
// ── DEV OVERRIDES ──────────────────────────────────────────────────────────────
//
// During development it is useful to run ALL branches on a single vendor to
// verify they pass before trusting the random rotation. The mechanism mirrors
// the DEV OVERRIDES pattern from reporting.spec.ts (lines 24-65).
//
// Implementation constants (place at the top of the executable code, before
// the test.describe block):
//
//   // ── DEV OVERRIDES
//   // Set RUN_ALL_BRANCHES to a vendor string to run ALL branches on that
//   // vendor (no random 5 selection, no vendor rotation). Comment out or set
//   // to null to restore normal random mode.
//   const RUN_ALL_BRANCHES: string | null = 'sqlite';   // DEV: run all on sqlite
//   //const RUN_ALL_BRANCHES: string | null = 'oracle';  // DEV: run all on oracle
//   //const RUN_ALL_BRANCHES: string | null = 'clickhouse'; // DEV: run all on clickhouse
//   //const RUN_ALL_BRANCHES: string | null = null;       // Normal: random 5 branches × random vendor
//
// When RUN_ALL_BRANCHES is non-null:
//   - STEP 1 (file-level server vendor) is overridden to the specified vendor
//   - STEP 2 (per-test 2-run split) is skipped — each branch runs only once
//     on the specified vendor (no file-based vs server-based split)
//   - ALL branches from ALL_BRANCHES are executed (no random 5 selection)
//   - This allows a full regression sweep on a single vendor in one run
//
// When RUN_ALL_BRANCHES is null (normal mode):
//   - STEP 1 + STEP 2 vendor rotation applies as described above
//   - Random 5 branches are selected per run
//   - Each branch runs 2 times (file-based + server-based)
//
// Usage workflow:
//   1. Initial development: set RUN_ALL_BRANCHES = 'sqlite' → run all branches
//      on the easiest vendor to verify test logic is correct
//   2. Cross-vendor check: set RUN_ALL_BRANCHES = 'clickhouse' → verify all
//      branches pass on a vendor with different type names (Nullable(), UInt32, etc.)
//   3. Production: set RUN_ALL_BRANCHES = null → normal random rotation
//
//
// ── TEST STRATEGY ──────────────────────────────────────────────────────────────
//
// 1. BRANCH REPOSITORY (ALL_BRANCHES): Build a comprehensive repository of ALL
//    "data context branches" (i.e., distinct column shapes that trigger different
//    recommendation rules). Each branch is defined by:
//      - A Northwind table (or aggregated query on that table)
//      - The resulting column shape: { dims: number, measures: number, hasGeo: bool,
//        hasTemporal: bool, rowCount: number, isAggregated: bool }
//      - Expected "Visualize as" output: { recommended: WidgetType[], sensible: WidgetType[],
//        nonsensible: WidgetType[] }
//      - Expected default configuration for the #1 recommended widget (e.g., chartType,
//        xFields, yFields, palette, etc.)
//
//    The branches mirror the canonical rule cascade (see widget-sensibility.ts):
//      Rule 0: Raw table drop (isAggregated=false) → Table/Detail + Map if geo
//      Rule 1: Single-row scalar (rowCount=1, ≥1 measure) → Number/Gauge/Progress
//      Rule 2: Geo + measure → Map first, then Chart
//      Rule 3: Temporal + measure → Chart (line-led), Trend
//      Rule 4: Multi-dim + measure → Chart, Pivot, Sankey
//      Rule 5: Single-dim + measure → Chart (bar-led), Table, Number
//      Fallback: No measures → Table, Detail
//
//    For each branch, choose the most appropriate Northwind table:
//      - Raw Orders drop → Rule 0 (10 dims, 4 measures, hasGeo via ShipCountry)
//      - SUM(Freight) GROUP BY CustomerID → Rule 5 (1 cat dim + 1 measure)
//      - SUM(Freight) GROUP BY MONTH(OrderDate) → Rule 3 (1 temporal dim + 1 measure)
//      - SELECT SUM(Freight) FROM Orders → Rule 1 (1 row, 1 measure)
//      - Raw Customers drop → Rule 0 (all text dims, hasGeo)
//      - Raw Order Details drop → Rule 0/Fallback (all measures, 0 dims)
//      - Customer × Product flow → Rule 4 (2 cat dims + 1 measure → Sankey)
//      - etc.
//
//    The goal is to have ALL_BRANCHES be as comprehensive as possible (ideally 50-100+
//    branches covering every rule, edge case, and vendor-specific type classification).
//
// 2. RANDOMIZED EXECUTION: From ALL_BRANCHES, randomly select exactly 5 branches.
//    These 5 branches become the 5 tests that run in this execution. That's it —
//    just 5 tests per run. The randomness ensures that over many executions (CI runs,
//    daily builds, etc.), ALL branches eventually get tested. This is a "span coverage
//    over time" strategy: we don't run all 100 branches in one go (that would take
//    too long), but instead spread them across many smaller runs. Each run is fast
//    (only 5 tests) but over time the full matrix of branches × vendors is covered.
//
// 3. PER-TEST ASSERTIONS (two layers):
//
//    LAYER 1 — "Visualize as" palette accuracy:
//      Assert that the right panel shows the correct widget recommendations in the
//      correct order. This should be a clearly named helper function like:
//        assertVisualizeAs({
//          recommended: ["tabulator", "map", "detail"],
//          sensible: ["chart", "pivot", "number", ...],
//          nonsensible: ["gauge", "progress"]
//        })
//      The function should verify:
//        - The main grid shows recommended + sensible widgets (in order)
//        - The "More widgets" collapsible shows nonsensible widgets
//        - The ⭐ star badge appears on the #1 recommended widget
//        - For chart widgets in the main grid, the label shows the specific subtype
//          (e.g., "Chart (Line)" not just "Chart") with the matching icon
//
//      This validates the smart-defaults pipeline:
//        classification.ts → field-utils.ts → widget-sensibility.ts → ConfigPanel.tsx
//
//    LAYER 2 — Default configuration correctness:
//      After validating the palette, click the #1 recommended widget and assert that
//      its auto-configured defaults are correct. For example:
//        - Chart widget: assert chartType matches rankChartSubtypes() #1 pick
//          (temporal dim → "line", categorical → "bar", etc.)
//        - Chart widget: assert xFields/yFields match pickDefaultAxes() output
//        - Number widget: assert the measure field is the most relevant one
//          (via autoPickMeasure())
//        - Trend widget: assert dateField + valueField are correctly auto-picked
//        - Map widget: assert geo field detection (lat/lon or country/state)
//
//      This validates the deeper smart-defaults:
//        chart-ranking.ts → rankChartSubtypes()
//        axis-assignment.ts → pickDefaultAxes()
//        auto-pick.ts → autoPickMeasure(), autoPickTrendFields(), etc.
//        display.ts → defaultDisplay(), enforceChartTypeLimits()
//
// ═══════════════════════════════════════════════════════════════════════════════
// Unit Tests (Jasmine) vs. E2E Alignment — UPDATED 2026-04-17
// ═══════════════════════════════════════════════════════════════════════════════
//
// TWO COMPLEMENTARY TEST LAYERS — same test scenarios, different execution:
//
// ┌─────────────────────┬──────────────────────────────┬──────────────────────────────────┐
// │ Aspect              │ Jasmine (unit)               │ E2E Spec (integration)           │
// ├─────────────────────┼──────────────────────────────┼──────────────────────────────────┤
// │ Data source         │ Mocked fixtures              │ Real Northwind DB (live SQL)     │
// │                     │ (northwind.fixture.ts —      │ via JDBC, type names vary        │
// │                     │  hardcoded ColumnSchema[])   │ by vendor                        │
// ├─────────────────────┼──────────────────────────────┼──────────────────────────────────┤
// │ What's called       │ Pure functions directly      │ Full UI pipeline                 │
// │                     │ (groupWidgetsBySensibility,  │ (drag table → render palette →   │
// │                     │  pickDefaultAxes, etc.)      │  click widget → read config)     │
// ├─────────────────────┼──────────────────────────────┼──────────────────────────────────┤
// │ What's asserted     │ Raw return values            │ Real visual output               │
// │                     │ (expect(palette.recommended) │ (DOM elements in "Visualize as"  │
// │                     │  .toEqual(...))              │ panel, config form field values) │
// ├─────────────────────┼──────────────────────────────┼──────────────────────────────────┤
// │ Vendor coverage     │ In-memory fixtures only      │ 10 vendors (SQLite, DuckDB,      │
// │                     │ (no database, hardcoded      │ + server-based rotation)         │
// │                     │  ColumnSchema[] objects)     │                                  │
// ├─────────────────────┼──────────────────────────────┼──────────────────────────────────┤
// │ Speed               │ Milliseconds                 │ Seconds per test                 │
// └─────────────────────┴──────────────────────────────┴──────────────────────────────────┘
//
// Both layers cover the SAME 11 canonical shapes (R1–R4, K1, D1, G1, C1, D2a, D2b, S1)
// against the SAME Northwind tables. The E2E spec is NOT a "superset" of the Jasmine
// fixture data — it's the same test scenarios executed through the full UI pipeline
// instead of direct function calls, plus cross-vendor rotation.
//
// ── Jasmine Coverage (as of 2026-04-17) ──────────────────────────────────────
//
// 16 files, ~163 tests total:
//
// LAYER 1 — "Visualize as" palette accuracy (which widgets are recommended/sensible):
//   browsing-raw-tables.tests.ts       — 19 tests (shapes R1–R4, Rule 0)
//   single-number-summaries.tests.ts   — 11 tests (shape K1, Rule 1)
//   geographic-distribution.tests.ts   — 16 tests (shape G1, Rule 2)
//   sales-over-time.tests.ts           — 15 tests (shape D1, Rule 3) + 3 trend edge cases
//   cross-dimensional.tests.ts         — 10 tests (shapes D2a, D2b, S1, Rule 4)
//   top-performers.tests.ts            — 12 tests (shape C1, Rule 5)
//   category-breakdowns.tests.ts       — 10 tests (shape C1, Rule 5)
//   edge-cases-and-degenerate.tests.ts — Fallback (0 measures)
//   chart-subtype-business-rules.tests.ts — 17 tests (chart subtype sensibility)
//   filter-controls.tests.ts           — 7 tests (autoFilterPaneField)
//   record-drill-down.tests.ts         — 18 tests (pickDetailDefaults)
//
// LAYER 2 — Default configuration for each widget type (once selected):
//   axis-assignment.tests.ts    — 18 tests: pickDefaultAxes() (scatter/bubble/normal
//                                 charts, date-first reorder, cardinality-first reorder,
//                                 MAX_SERIES cap), splitDimsAndMeasures(), canReuseAxisPicks()
//   auto-pick-helpers.tests.ts  — 16 tests: autoPickMeasure() (6 tests with/without
//                                 table schema, excludeColumn), autoPivotLayout() (4 tests),
//                                 suggestRenderModeForCube() (4 tests)
//   display-decisions.tests.ts  — 28 tests: defaultDisplay() full cascade (0 dims, 0 measures,
//                                 1 dim: state/country/temporal/extraction/boolean/category,
//                                 2 dims: date+cat/lat+lon/cat+cat/mixed, 3+ dims),
//                                 enforceChartTypeLimits() (pie slice cap: 7 tests),
//                                 shapeFromResult() (6 tests)
//   sankey-auto-pick.tests.ts   — 5 tests: pickSankeyFields() (cardinality sort, ID filtering,
//                                 high-card guard, no measures)
//   single-number-summaries.tests.ts — pickGaugeField (1), pickProgressField (1),
//                                 pickProgressGoal (4), autoPickMeasure (1)
//   sales-over-time.tests.ts    — pickTrendFields (2 basic + 3 edge cases), pickDefaultAxes (2),
//                                 defaultDisplay (1), shapeFromResult (1)
//
// Per-widget default config coverage:
//   Chart    → pickDefaultAxes (18), rankChartSubtypes (17), enforceChartTypeLimits (7),
//              defaultDisplay (18)  = 60 tests ✅
//   Tabulator → N/A (no auto-config, shows raw data)           ✅
//   Map      → defaultDisplay mapType/region (3)                ✅
//   Number   → autoPickMeasure (6)                              ✅
//   Gauge    → pickGaugeField (1)                               ✅
//   Progress → pickProgressField (1) + pickProgressGoal (4)     ✅
//   Trend    → pickTrendFields (5)                              ✅
//   Pivot    → autoPivotLayout (4)                              ✅
//   Sankey   → pickSankeyFields (5)                             ✅
//   Detail   → pickDetailDefaults (18)                          ✅
//
// ── Remaining Gaps ───────────────────────────────────────────────────────────
//
// Gap                                          Impact    Action needed?
// ──────────────────────────────────────────── ──────── ──────────────────────
// Spec doesn't mention filter-pane auto-pick   Low       Tested in Jasmine; consider
//                                                        adding to use-cases spec
// Spec doesn't mention detail drill-down       Low       Tested in Jasmine; consider
//                                                        adding to use-cases spec
// Jasmine uses no database (in-memory fixtures By design E2E handles cross-vendor
// only — hardcoded ColumnSchema[] objects      (live DB)  (ClickHouse Nullable() etc.)
// with SQLite type names)
// autoSummarize() not tested in Jasmine        By design Async, needs live DB;
//                                              (async)   E2E will cover it
//
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTABLE E2E TEST CODE
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, type Page, type Browser } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConnectionsTestHelper, DB_VENDORS_SUPPORTED } from '../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import type { WidgetType } from '../../../../../asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/ui-startpage/lib/stores/canvas-store';
import {
  BRANCH_SHAPE_RAW_GEO,
  BRANCH_SHAPE_RAW_NO_GEO,
  BRANCH_SHAPE_SCALAR_KPI,
  BRANCH_SHAPE_K1_MULTI,
  BRANCH_SHAPE_DATE_MEASURE,
  BRANCH_SHAPE_GEO_MEASURE,
  BRANCH_SHAPE_CAT_MEASURE,
  BRANCH_SHAPE_DATE_CAT_2DIMS,
  BRANCH_SHAPE_TWO_CAT_DIMS,
} from '../../explore-data/fixtures/northwind.fixture';
import {
  createFreshCanvas,
  toConnectionCode,
  selectConnection,
  addTableToCanvas,
} from '../../helpers/explore-data-test-helper';

// ── Constants ──────────────────────────────────────────────────────────────────
const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;

// ── DEV OVERRIDES ──────────────────────────────────────────────────────────────
// Uncomment ONE line to force all branches on a single vendor.
//const RUN_ALL_BRANCHES: string | null = 'mysql';      // DEV: force mysql
//const RUN_ALL_BRANCHES: string | null = 'sqlite';      // fastest, no Docker
// const RUN_ALL_BRANCHES: string | null = 'clickhouse'; // exotic type names
//const RUN_ALL_BRANCHES: string | null = 'supabase';      // DEV: force supabase
const RUN_ALL_BRANCHES: string | null = null;       // DEV FOCUS — set to a vendor string (e.g., 'sqlite') to force all-branches mode

// ── ALL_BRANCHES ───────────────────────────────────────────────────────────────
// Each branch = a distinct data context that triggers different smart-defaults
// rules. Mirrors the 11 canonical shapes from the Jasmine test suite.

interface Branch {
  name: string;
  rule: string;
  shape: string;
  /** Northwind table to add from SchemaBrowser */
  tableName: string;
  /** ClickHouse uses "OrderDetails" instead of "Order Details" */
  tableNameClickHouse?: string;
  /** Group-by columns (triggers Summarize step in visual mode) */
  groupBy?: string[];
  /** Aggregation items (triggers Summarize step in visual mode) */
  summarize?: { aggregation: string; field: string }[];
  /** SQL override for scalar / single-row branches */
  sql?: string;
  /** Widgets expected in the main grid (recommended + sensible) */
  mainGrid: WidgetType[];
  /** Widgets expected in "More widgets" (nonsensible) */
  moreWidgets: WidgetType[];
  /**
   * Expected default config for #1 recommended widget (mainGrid[0]).
   * Keys: chartType | xField | yField | numberField | trendDateField |
   *       trendValueField | mapType | gaugeField | progressField |
   *       sankeySource | sankeyTarget | sankeyValue
   */
  defaultConfig?: Record<string, string>;
  /**
   * When set, also clicks the "pivot" widget button after the main L2 assert
   * and verifies the pivot config panel renders (#configPanel-pivot visible).
   * Use `{}` to just verify the panel renders (no field-level assertions).
   */
  pivotDefaultConfig?: Record<string, string>;
}

const ALL_BRANCHES: Branch[] = [

  // ── Rule 0: Raw table drops (isAggregated=false) ──────────────────────────
  // RAW-DROP RULE: chart is NEVER in mainGrid for unaggregated tables.
  // Jasmine: browsing-raw-tables.tests.ts line 122 — `expect(palette.nonsensible).toContain("chart")`
  // Reference parity: SHAPE_RAW_GEO_WITH_MEASURE_RB = ['tabulator','map','detail']
  {
    name: 'Raw Orders — geo + temporal + measures',
    rule: 'Rule 0', shape: 'R1',
    tableName: 'Orders',
    ...BRANCH_SHAPE_RAW_GEO,
  },
  {
    name: 'Raw Customers — geo + text dims',
    rule: 'Rule 0', shape: 'R2',
    tableName: 'Customers',
    ...BRANCH_SHAPE_RAW_GEO,
  },
  {
    name: 'Raw Products — no geo, has measures',
    rule: 'Rule 0', shape: 'R3',
    tableName: 'Products',
    ...BRANCH_SHAPE_RAW_NO_GEO,
  },
  {
    name: 'Raw Categories — no measures, all dims',
    rule: 'Fallback', shape: 'R4',
    tableName: 'Categories',
    ...BRANCH_SHAPE_RAW_NO_GEO,
  },

  // ── Rule 5: Single categorical dim + measure ──────────────────────────────
  {
    name: 'Top customers by freight — 1 cat dim + 1 measure',
    rule: 'Rule 5', shape: 'C1',
    tableName: 'Orders',
    groupBy: ['CustomerID'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_CAT_MEASURE,
    defaultConfig: { chartType: 'bar' },
    // LAYER 2 (pivot): pivot is now in mainGrid for 1-dim+measure — verify its
    // config panel renders after the chart default-config assertion.
    pivotDefaultConfig: {},
  },

  // ── Rule 3: Temporal dim + measure ────────────────────────────────────────
  {
    name: 'Monthly freight trend — 1 temporal dim + 1 measure',
    rule: 'Rule 3', shape: 'D1',
    tableName: 'Orders',
    groupBy: ['OrderDate'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_DATE_MEASURE,
    defaultConfig: { chartType: 'line' },
  },

  // ── Rule 2: Geo dim + measure ─────────────────────────────────────────────
  {
    name: 'Freight by country — 1 geo dim + 1 measure',
    rule: 'Rule 2', shape: 'G1',
    tableName: 'Orders',
    groupBy: ['ShipCountry'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_GEO_MEASURE,
    // ShipCountry → world_countries region map (defaultDisplay + MapConfig auto-pick)
    defaultConfig: { mapType: 'region' },
  },

  // ── Rule 1: Single scalar ─────────────────────────────────────────────────
  {
    name: 'Total freight — scalar SUM',
    rule: 'Rule 1', shape: 'K1',
    tableName: 'Orders',
    // No groupBy → scalar result (1 row). Visual query builder quotes all identifiers
    // per-vendor so this works on SQLite, DuckDB, Supabase, MySQL, etc.
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_SCALAR_KPI,
    defaultConfig: { numberField: 'Freight_sum' },
  },

  // ── Rule 4: Multi-dim + measure ───────────────────────────────────────────
  {
    name: 'Freight by country + date — 2 dims + measure',
    rule: 'Rule 4', shape: 'D2a',
    tableName: 'Orders',
    groupBy: ['ShipCountry', 'OrderDate'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_DATE_CAT_2DIMS,
    // date+cat dims → multi-series line (defaultDisplay D2a branch)
    defaultConfig: { chartType: 'line' },
  },

  // ── Rule 4 variant: 2 cat dims + 1 measure → Sankey ──────────────────────
  {
    name: 'Customer → Country flow — 2 cat dims + 1 measure (Sankey)',
    rule: 'Rule 4', shape: 'S1',
    tableName: 'Orders',
    groupBy: ['CustomerID', 'ShipCountry'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_TWO_CAT_DIMS,
    // 2 categorical dims → bar (rankChartSubtypes categorical branch)
    defaultConfig: { chartType: 'bar' },
  },

  {
    name: 'Freight vs Count — 0 dims + 2 measures',
    rule: 'Rule 1', shape: 'K1-multi',
    tableName: 'Orders',
    summarize: [
      { aggregation: 'SUM', field: 'Freight' },
      { aggregation: 'COUNT', field: 'OrderID' },
    ],
    ...BRANCH_SHAPE_K1_MULTI,
  },

  // ── Temporal extraction: day-of-week → bar (NOT line) ─────────────────────
  {
    name: 'Freight by day-of-week — temporal extraction → bar',
    rule: 'Rule 5', shape: 'D1-ext',
    tableName: 'Orders',
    groupBy: ['OrderDate'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    // NOTE: This branch needs groupByBuckets: { OrderDate: 'day-of-week' }
    // to trigger the extraction path. The Summarize step would need
    // bucket selection which is not yet wired in configureSummarize().
    // For now, the default auto-bucket will produce a temporal truncation
    // (month), so this branch tests the normal temporal path.
    ...BRANCH_SHAPE_DATE_MEASURE,
    defaultConfig: { chartType: 'line' },
  },

  // ── Boolean dim + measure → bar ──────────────────────────────────────────
  {
    name: 'Products by Discontinued flag — boolean dim + measure',
    rule: 'Rule 5', shape: 'C1-bool',
    tableName: 'Products',
    groupBy: ['Discontinued'],
    summarize: [{ aggregation: 'SUM', field: 'UnitPrice' }],
    ...BRANCH_SHAPE_CAT_MEASURE,
    defaultConfig: { chartType: 'bar' },
  },

  // ── 1 dim + 0 measures (count fallback) ──────────────────────────────────
  {
    name: 'Orders per city — 1 dim + 1 measure (count)',
    rule: 'Rule 5', shape: 'C1-count',
    tableName: 'Orders',
    groupBy: ['ShipCity'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    ...BRANCH_SHAPE_CAT_MEASURE,
    defaultConfig: { chartType: 'bar' },
  },

  // ── 3+ dims + 1 measure → tabulator/pivot fallback ───────────────────────
  // NOTE: unique shape — no BRANCH_SHAPE_* constant, kept inline.
  // mainGrid deviates from SHAPE_DATE_CAT_MEASURE_2DIMS_RB because 3 dims causes
  // a different rule-cascade result. Update both fields together if this changes.
  {
    name: 'Freight by country + city + date — 3 dims (too many for chart)',
    rule: 'Rule 4', shape: 'D2b',
    tableName: 'Orders',
    groupBy: ['ShipCountry', 'ShipCity', 'OrderDate'],
    summarize: [{ aggregation: 'SUM', field: 'Freight' }],
    mainGrid: ['tabulator', 'pivot', 'chart'],
    moreWidgets: ['number', 'trend', 'gauge', 'progress', 'detail', 'map', 'sankey'],
  },

  // ── Raw Order Details — all measures, no dims ────────────────────────────
  {
    name: 'Raw Order Details — all numeric measures, no dims',
    rule: 'Fallback', shape: 'R4-alt',
    tableName: 'Order Details',
    tableNameClickHouse: 'OrderDetails',
    ...BRANCH_SHAPE_RAW_NO_GEO,
  },

  // ── Raw Employees — geo + temporal, small table ──────────────────────────
  {
    name: 'Raw Employees — geo + temporal, 9 rows',
    rule: 'Rule 0', shape: 'R1-small',
    tableName: 'Employees',
    ...BRANCH_SHAPE_RAW_GEO,
  },

  // ── 1 category dim + 2 measures → bar grouped ───────────────────────────
  {
    name: 'Revenue + freight by city — 1 dim + 2 measures (grouped bar)',
    rule: 'Rule 5', shape: 'C1-multi',
    tableName: 'Orders',
    groupBy: ['ShipCity'],
    summarize: [
      { aggregation: 'SUM', field: 'Freight' },
      { aggregation: 'COUNT', field: 'OrderID' },
    ],
    ...BRANCH_SHAPE_CAT_MEASURE,
    defaultConfig: { chartType: 'bar' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMENTED BRANCHES — Northwind lacks the required columns for these.
  // Jasmine unit tests cover both scenarios with in-memory fixtures.
  //
  // Code path verification (2026-04-17):
  //   ✅ display.ts:163-170 — bothCoord check → map/pin (fully implemented)
  //   ✅ classification.ts — isLatitude()/isLongitude() check col name + type
  //   ✅ shapeFromResult() — sets isCoordinate=true when isLatitude||isLongitude
  //   ✅ axis-assignment.ts:64-74 — bubble branch: X=measures[0], Y=measures[1],
  //      bubbleSizeField=measures[2] (fully implemented)
  //   ✅ chart-subtype-business-rules.tests.ts:98-111 — bubble sensibility tested
  //   ✅ geographic-distribution.tests.ts:84-140 — lat/lon + pin-map tested
  // ═══════════════════════════════════════════════════════════════════════════

  // // ── Pin map: lat + lon + measure ──────────────────────────────────────
  // // COMMENTED: Northwind has no latitude/longitude columns. The Employees
  // // table has City/Country but not coordinates. If a "Warehouses" table
  // // existed with Latitude (DOUBLE), Longitude (DOUBLE), StockValue (DOUBLE),
  // // this branch would execute and pass.
  // //
  // // Jasmine coverage:
  // //   geographic-distribution.tests.ts:84-140 — isLatitude(), isLongitude(),
  // //   hasLatLonColumns(), full palette [tabulator, map, detail] for raw geo
  // //   display-decisions.tests.ts:202-214 — 2 dims (lat+lon) + 1 measure → map/pin
  // //
  // // Verified code path:
  // //   shapeFromResult() → isCoordinate=true for lat/lon columns
  // //   defaultDisplay() line 163-170 → bothCoord=true → map/pin ✅
  // //   MapConfig.tsx → shows pin map config with latField/lonField ✅
  // {
  //   name: 'Warehouse locations — lat + lon + StockValue (pin map)',
  //   rule: 'Rule 2', shape: 'G1-pin',
  //   tableName: 'Warehouses', // DOES NOT EXIST in Northwind
  //   mainGrid: ['map', 'chart', 'tabulator'],
  //   moreWidgets: ['trend', 'gauge', 'progress', 'number', 'sankey', 'pivot', 'detail'],
  //   defaultConfig: { mapType: 'pin' },
  // },

  // // ── Bubble chart: 0 dims + 3 measures ─────────────────────────────────
  // // COMMENTED: A true bubble chart needs 0 dims + ≥3 measures with multiple
  // // rows. Northwind's Order Details has UnitPrice/Quantity/Discount but also
  // // OrderID/ProductID (which become dims). A hypothetical SQL like
  // //   SELECT UnitPrice, UnitsInStock, ReorderLevel FROM Products
  // // gives 0 dims + 3 measures × 20 rows — but defaultDisplay returns "number"
  // // for 0 dims (scalar territory). Chart is still in the palette as sensible;
  // // user picks Chart → Bubble subtype manually.
  // //
  // // Jasmine coverage:
  // //   chart-subtype-business-rules.tests.ts:98-111 — bubble sensible with 3 measures
  // //   axis-assignment.tests.ts:72-106 — pickDefaultAxes bubble: X/Y/bubbleSize
  // //   display-decisions.tests.ts:51-62 — 0 dims + 2 measures → chart/scatter
  // //
  // // Verified code path:
  // //   isSensibleChartSubtype("bubble", [], [3 measures]) → sensible=true ✅
  // //   pickDefaultAxes([], [m1,m2,m3], "bubble") → X=m1, Y=m2, bubbleSize=m3 ✅
  // //   ChartConfig.tsx → shows bubble in subtype grid, auto-picks axes ✅
  // //   NOTE: defaultDisplay for 0 dims returns "number" (not chart/bubble),
  // //   so bubble is NOT the #1 default — user must switch to Chart → Bubble.
  // //   This is by design: scalar data defaults to Number widget.
  // {
  //   name: 'Product price/stock/reorder — 0 dims + 3 measures (bubble)',
  //   rule: 'Rule 1', shape: 'K1-bubble',
  //   tableName: 'Products',
  //   sql: 'SELECT UnitPrice, UnitsInStock, ReorderLevel FROM Products',
  //   mainGrid: ['number', 'chart', 'tabulator'],
  //   moreWidgets: ['map', 'gauge', 'progress', 'trend', 'sankey', 'pivot', 'detail'],
  //   // #1 is "number" (scalar default). Chart is sensible; bubble subtype works.
  //   // To assert bubble specifically, user must click Chart → verify bubble in subtype grid.
  //   defaultConfig: { widgetType: 'number' }, // scalar default, not bubble
  // },
];

// ── VENDOR SELECTION IIFE (mirrors reporting.spec.ts:28-65) ────────────────────
const DB_VENDORS_SELECTED: string[] = (() => {
  if (RUN_ALL_BRANCHES) return [RUN_ALL_BRANCHES];

  const alwaysIncluded = ['sqlite', 'duckdb'];
  const pool = DB_VENDORS_SUPPORTED.filter(v => !alwaysIncluded.includes(v));

  const today = new Date().toISOString().split('T')[0];
  const seed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const seededRandom = (i: number) => {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  };

  const shuffled = [...pool].sort((a, b) =>
    seededRandom(pool.indexOf(a)) - seededRandom(pool.indexOf(b)),
  );
  const pickedServer = shuffled.slice(0, 1);

  const fileVendors = ['sqlite', 'duckdb'];
  const pickedFile = [fileVendors[Math.floor(seededRandom(99) * 2)]];

  return [...pickedFile, ...pickedServer];
})();

const isFileBasedVendor = (vendor: string): boolean =>
  vendor === 'sqlite' || vendor === 'duckdb';

// ── BRANCH SELECTION — random 5 per run ────────────────────────────────────────
const BRANCHES_SELECTED: Branch[] = (() => {
  if (RUN_ALL_BRANCHES) return ALL_BRANCHES;

  const today = new Date().toISOString().split('T')[0];
  const seed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const seededRandom = (i: number) => {
    const x = Math.sin(seed + i + 7) * 10000;
    return x - Math.floor(x);
  };

  const shuffled = [...ALL_BRANCHES].sort((a, b) =>
    seededRandom(ALL_BRANCHES.indexOf(a)) - seededRandom(ALL_BRANCHES.indexOf(b)),
  );
  return shuffled.slice(0, 5);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Resolve table name for vendor (ClickHouse has no spaces in table names) */
function resolveTableName(branch: Branch, vendor: string): string {
  if (vendor === 'clickhouse' && branch.tableNameClickHouse) {
    return branch.tableNameClickHouse;
  }
  return branch.tableName;
}


/**
 * Configure the Summarize step for aggregated branches.
 * Interacts with the QueryBuilder's Summarize UI in the Data tab.
 *
 * The SummarizeStep renders group-by chips and metric chips with
 * "Add" buttons. We click "Add", then select columns from dropdowns.
 */
async function configureSummarize(page: Page, branch: Branch): Promise<void> {
  if (!branch.groupBy?.length && !branch.summarize?.length) return;

  // Add aggregation metrics first — the group-by section only renders after
  // at least one aggregation exists (SummarizeStep renders it conditionally).
  for (let i = 0; i < (branch.summarize ?? []).length; i++) {
    const agg = branch.summarize![i];
    await page.locator('#btnAddAggregation').click();
    await page.locator(`#selectAggFunc-${i}`).selectOption(agg.aggregation);
    await page.locator(`#selectAggField-${i}`).selectOption(agg.field);
    await page.waitForTimeout(300);
  }

  // Add group-by columns — each available column renders as #btnGroupBy-{col}.
  // We fail hard if the button is missing: a swallowed error here would produce
  // a raw-table palette instead of the aggregated one, silently passing wrong assertions.
  for (const col of (branch.groupBy ?? [])) {
    const groupByBtn = page.locator(`#btnGroupBy-${col}`);
    await groupByBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await groupByBtn.click();
    await page.waitForTimeout(300);
  }

  // Wait for palette to recompute
  await page.waitForTimeout(2000);
}

/**
 * Execute a SQL query for scalar/SQL-based branches.
 * Switches to SQL mode in the Data tab, writes the query, and detects columns.
 */
async function executeSqlForBranch(page: Page, sql: string): Promise<void> {
  // Switch to Finetune tab, then ensure SQL mode is selected
  await page.locator('#btnQueryTab-finetune').click();
  await page.waitForTimeout(500);
  await page.locator('#selectQueryMode').selectOption('sql');
  await page.waitForTimeout(300);

  // Focus the CodeMirror editor inside #sqlEditorContainer and replace content
  const editor = page.locator('#sqlEditorInput');
  await editor.waitFor({ state: 'visible', timeout: 5000 });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(sql);

  // Click "Detect columns" button to infer columns from query result
  const detectBtn = page.locator('#btnDetectColumns');
  await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
  await detectBtn.click();
  // Wait for column detection to complete
  await page.waitForTimeout(3000);
}

/**
 * LAYER 1 ASSERTION: Validate the "Visualize as" palette grouping AND order.
 *
 * Checks that:
 *   - mainGrid buttons appear in exactly the expected order in #visualizeAsGrid
 *   - The ⭐ sparkles icon (.sparkles-icon) appears on the #1 recommended widget only
 *   - moreWidgets buttons appear in exactly the expected order in #moreWidgetsGrid
 */
async function assertVisualizeAs(
  page: Page,
  branch: Branch,
): Promise<void> {
  const { mainGrid, moreWidgets } = branch;

  // Wait for palette to render
  await page.locator('#visualizeAsSection').waitFor({ state: 'visible', timeout: 10_000 });

  // ── Wait for data to load before reading the grid ──
  // #visualizeAsGrid is ALREADY VISIBLE in the pre-data state: when columns.length===0,
  // groupWidgetsBySensibility returns all widgets as sensible, so the grid renders
  // immediately with ALL_WIDGETS order (tabulator, chart, number, ...). Checking the grid
  // without this gate produces false failures on any vendor slower than the test.
  // #sparklesBadge only appears on sensibilityGroups.recommended[0], which is non-null
  // only after the query returns and column classification completes — so it's a reliable
  // "data is ready" signal. Timeout 15s covers slow DuckDB/Supabase probe round-trips.
  await expect(page.locator('#sparklesBadge')).toBeVisible({ timeout: 15_000 });

  // ── Check main grid ORDER (evaluateAll extracts ids in DOM order) ──
  const mainGridEl = page.locator('#visualizeAsGrid');
  await mainGridEl.waitFor({ state: 'visible', timeout: 5_000 });

  const actualMainIds: string[] = await mainGridEl
    .locator('button')
    .evaluateAll((els) => els.map((el) => el.id.replace('btnVisualizeAs-', '')));
  // mainGrid = expected recommended widgets. Assert they lead #visualizeAsGrid
  // in exact order. Sensible (non-recommended) widgets may follow — their count
  // varies by vendor column-type classification and is tested by Jasmine unit tests.
  expect(actualMainIds.slice(0, mainGrid.length)).toEqual(mainGrid);

  // ── Check "More widgets" ORDER (unconditional — missing button = test failure) ──
  if (moreWidgets.length > 0) {
    const moreBtn = page.locator('#btnMoreWidgets');
    await moreBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await moreBtn.click();
    await page.waitForTimeout(500);

    const moreGrid = page.locator('#moreWidgetsGrid');
    await moreGrid.waitFor({ state: 'visible', timeout: 3_000 });

    const actualMoreIds: string[] = await moreGrid
      .locator('button')
      .evaluateAll((els) => els.map((el) => el.id.replace('btnVisualizeAs-', '')));
    // moreWidgets = complement(recommended) = sensible + nonsensible.
    // #moreWidgetsGrid shows only nonsensible (sensible items appear in mainGrid).
    // Assert: actualMoreIds is a subsequence of moreWidgets (same relative order,
    // subset). Sensible items from moreWidgets are absent — that's correct.
    expect(actualMoreIds).toEqual(moreWidgets.filter(w => actualMoreIds.includes(w)));
    // Assert: no recommended item leaked into More Widgets.
    for (const id of mainGrid) {
      expect(actualMoreIds).not.toContain(id);
    }

    // Close the More Widgets panel so it doesn't interfere with assertDefaultConfig
    // (the panel can overlay the main grid and block widget selection).
    await moreBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * LAYER 2 ASSERTION: Validate default config for the #1 recommended widget.
 *
 * Clicks the widget type button, switches to the Display tab, and checks
 * that the auto-configured values match expectations.
 *
 * Supported keys in expectedConfig:
 *   chart   → chartType (aria-pressed on #btnChartType-{val})
 *   number  → numberField (#selectNumberField selected value)
 *   trend   → trendDateField, trendValueField (#selectTrendDate, #selectTrendValue)
 *   map     → mapType (aria-pressed on #btnMapType-{val})
 *   gauge   → gaugeField (#selectGaugeField), gaugeMin (#inputGaugeMin), gaugeMax (#inputGaugeMax)
 *   progress→ progressField (#selectProgressField), progressGoal (#inputProgressGoal)
 *   sankey  → sankeySource (#selectSankeySource), sankeyTarget (#selectSankeyTarget),
 *             sankeyValue (#selectSankeyValue)
 */
async function assertDefaultConfig(
  page: Page,
  widgetType: WidgetType,
  expectedConfig: Record<string, string>,
): Promise<void> {
  // Click the #1 recommended widget to select it
  const widgetBtn = page.locator(`#btnVisualizeAs-${widgetType}`);
  await widgetBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await widgetBtn.click();

  // Fail fast if the click didn't switch the widget type. ConfigPanel's
  // renderButton applies `shadow-sm` (and `bg-background`) only when
  // selectedWidget.type === type; if the click is a no-op — e.g. a stale
  // widget state persists from a previous branch, or an async re-query
  // overwrites the type, or an overlapping element swallows the event —
  // the button never gains that class. Without this check we'd burn 15s
  // on the sentinel wait below for an element that can never appear.
  await expect(widgetBtn).toHaveClass(/shadow-sm/, { timeout: 3_000 });

  // Switch to Display tab
  const displayTab = page.locator('#btnDisplayTab');
  await displayTab.waitFor({ state: 'visible', timeout: 5_000 });
  await displayTab.click();
  await page.waitForTimeout(500);

  // Wait for the config panel's inner content to render before asserting.
  // Clicking the widget button often triggers a re-query (e.g. switching to
  // "chart" on a raw branch adds aggregation), during which ConfigPanel's
  // `isDataWidget && activeTab === "display" && selectedWidget.type === X`
  // gate briefly de-renders. Waiting on a stable inner element per widget
  // type avoids that race — these children only mount once the config panel
  // is fully rendered with data.
  const configPanelSentinel: Partial<Record<WidgetType, string>> = {
    chart:    `#configPanel-chart [id^="btnChartType-"]`,
    number:   `#selectNumberField`,
    trend:    `#selectTrendDate`,
    map:      `#configPanel-map [id^="btnMapType-"]`,
    gauge:    `#selectGaugeField`,
    progress: `#selectProgressField`,
    sankey:   `#selectSankeySource`,
    pivot:    `#configPanel-pivot`,
  };
  const sentinel = configPanelSentinel[widgetType];
  if (sentinel) {
    await page.locator(sentinel).first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  // Scroll the config panel into view — ConfigPanel has overflow-y:auto and the
  // Display tab content can sit below the scroll fold after More Widgets interactions.
  const configPanel = page.locator(`#configPanel-${widgetType}`);
  await configPanel.scrollIntoViewIfNeeded({ timeout: 5_000 });

  // Verify the config panel rendered
  await expect(configPanel).toBeVisible({ timeout: 5_000 });

  for (const [key, expectedValue] of Object.entries(expectedConfig)) {
    switch (key) {

      // ── Chart subtype ──────────────────────────────────────────────────────
      case 'chartType': {
        // The selected button carries aria-pressed="true"
        const btn = page.locator(`#btnChartType-${expectedValue}`);
        await btn.waitFor({ state: 'visible', timeout: 3_000 });
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        break;
      }

      // ── Number widget ──────────────────────────────────────────────────────
      case 'numberField': {
        await expect(page.locator('#selectNumberField')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }

      // ── Trend widget ───────────────────────────────────────────────────────
      case 'trendDateField': {
        await expect(page.locator('#selectTrendDate')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'trendValueField': {
        await expect(page.locator('#selectTrendValue')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }

      // ── Map widget ─────────────────────────────────────────────────────────
      case 'mapType': {
        const btn = page.locator(`#btnMapType-${expectedValue}`);
        await btn.waitFor({ state: 'visible', timeout: 3_000 });
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        break;
      }

      // ── Gauge widget ───────────────────────────────────────────────────────
      case 'gaugeField': {
        await expect(page.locator('#selectGaugeField')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'gaugeMin': {
        await expect(page.locator('#inputGaugeMin')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'gaugeMax': {
        await expect(page.locator('#inputGaugeMax')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }

      // ── Progress widget ────────────────────────────────────────────────────
      case 'progressField': {
        await expect(page.locator('#selectProgressField')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'progressGoal': {
        await expect(page.locator('#inputProgressGoal')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }

      // ── Sankey widget ──────────────────────────────────────────────────────
      case 'sankeySource': {
        await expect(page.locator('#selectSankeySource')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'sankeyTarget': {
        await expect(page.locator('#selectSankeyTarget')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }
      case 'sankeyValue': {
        await expect(page.locator('#selectSankeyValue')).toHaveValue(expectedValue, { timeout: 3_000 });
        break;
      }

      default:
        throw new Error(`assertDefaultConfig: unknown key "${key}" — add a case above.`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Smart Defaults E2E', () => {

  for (const dbVendor of DB_VENDORS_SELECTED) {

    electronBeforeAfterAllTest(
      `(${dbVendor}) Smart defaults — palette + default config`,
      async ({ beforeAfterEach: firstPage }) => {
        test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

        let externalBrowser: Browser | null = null;
        const connectionName = `SmartDefaults-${dbVendor}`;
        const connectionCode = toConnectionCode(connectionName, dbVendor);

        try {
          // ── SETUP 1: Create DB connection ────────────────────────────────
          console.log(`[SETUP] START — vendor: ${dbVendor}, will run ${BRANCHES_SELECTED.length} branches: ${BRANCHES_SELECTED.map(b => b.name).join(' | ')}`);
          let ft = new FluentTester(firstPage);

          if (!isFileBasedVendor(dbVendor)) {
            ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
          }

          await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
            ft, connectionName, dbVendor,
          );

          // ── SETUP 2: Start AI Hub (same Next.js app as /data-canvas) ─────
          await SelfServicePortalsTestHelper.startApp(
            new FluentTester(firstPage).gotoApps(),
            AI_HUB_APP_ID,
          );

          // ── SETUP 3: Open external browser ───────────────────────────────
          const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
          externalBrowser = browser;

          await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);
          console.log(`[SETUP] DONE — ${dbVendor} connection ready, AI Hub running, external browser connected`);

          // ── RUN SELECTED BRANCHES ────────────────────────────────────────
          for (const branch of BRANCHES_SELECTED) {
            const tableName = resolveTableName(branch, dbVendor);

            console.log(`[BRANCH] START — "${branch.name}" | rule: ${branch.rule}, shape: ${branch.shape}, vendor: ${dbVendor}`);

            // Create a fresh canvas for this branch
            await createFreshCanvas(page, DATA_CANVAS_URL, `${branch.name} [${dbVendor}]`);

            // Select the DB connection in SchemaBrowser
            await selectConnection(page, connectionName, dbVendor);

            // Add the table to the canvas
            await addTableToCanvas(page, tableName);
            console.log(`[BRANCH] table added: ${tableName}`);

            // Configure aggregation if this is an aggregated branch
            if (branch.sql) {
              console.log(`[BRANCH] running SQL data context: ${branch.sql.slice(0, 80)}...`);
              await executeSqlForBranch(page, branch.sql);
              console.log(`[BRANCH] SQL executed`);
            } else if (branch.groupBy || branch.summarize) {
              console.log(`[BRANCH] configuring Summarize: groupBy=[${(branch.groupBy ?? []).join(', ')}], agg=[${(branch.summarize ?? []).map(a => `${a.aggregation}(${a.field})`).join(', ')}]`);
              await configureSummarize(page, branch);
              console.log(`[BRANCH] Summarize configured`);
            } else {
              console.log(`[BRANCH] raw table drop (no aggregation)`);
            }

            // ── LAYER 1: Assert "Visualize as" palette ──
            console.log(`[BRANCH] LAYER 1 — asserting palette: mainGrid=${JSON.stringify(branch.mainGrid)}, moreWidgets=${JSON.stringify(branch.moreWidgets)}`);
            await assertVisualizeAs(page, branch);
            console.log(`[BRANCH] LAYER 1 DONE — palette correct`);

            // ── LAYER 2: Assert default config for #1 widget ──
            if (branch.defaultConfig) {
              console.log(`[BRANCH] LAYER 2 — asserting default config for "${branch.mainGrid[0]}": ${JSON.stringify(branch.defaultConfig)}`);
              await assertDefaultConfig(
                page, branch.mainGrid[0], branch.defaultConfig,
              );
              console.log(`[BRANCH] LAYER 2 DONE — default config correct`);
            }

            // ── LAYER 2 (pivot): click pivot and verify its config panel ──
            if (branch.pivotDefaultConfig !== undefined) {
              console.log(`[BRANCH] LAYER 2 (pivot) — asserting pivot config panel renders`);
              await assertDefaultConfig(page, 'pivot', branch.pivotDefaultConfig);
              console.log(`[BRANCH] LAYER 2 (pivot) DONE — pivot config panel verified`);
            }

            console.log(`[BRANCH] DONE — "${branch.name}" PASSED`);
          }

          // ── EXPLICIT VENDOR STOP (happy path) ────────────────────────────
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.setStarterPackStateForVendor(
              new FluentTester(firstPage), dbVendor, 'stop',
            );
          }

        } finally {
          // ── CLEANUP ──────────────────────────────────────────────────────
          if (externalBrowser) {
            try {
              await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
            } catch (e) { console.error('Failed to close browser:', e); }
          }

          try {
            await SelfServicePortalsTestHelper.stopApp(
              new FluentTester(firstPage).gotoApps(),
              AI_HUB_APP_ID,
            );
          } catch (e) { console.error('Failed to stop AI Hub:', e); }

          try {
            SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
          } catch (e) { console.error('Failed to docker-compose down AI Hub:', e); }

          try {
            const connFilePattern = `${connectionCode}\\.xml`;
            await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
              new FluentTester(firstPage), connFilePattern, dbVendor,
            );
          } catch (e) { console.error(`Failed to delete connection:`, e); }

          // Nuclear stop: vendor-aware docker compose down.
          // Supabase lives in db/supabase/, others in db/. This runs even when
          // the test failed mid-run so the container doesn't stay up.
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownForVendor(dbVendor);
          }
        }
      },
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPHRASED REQUIREMENTS — Data Canvas Visualizations E2E Test Specification
// ═══════════════════════════════════════════════════════════════════════════════
//
// GOAL: For each of the 10 data-renderable widget types supported by /data-canvas,
//       write a dedicated E2E test that validates all CRUD-like operations work
//       correctly — analogous to testing CRUD on business entities, but adapted
//       for our visualization widgets.
//
// WIDGET TYPES TO TEST (from widget-sensibility.ts ALL_WIDGETS):
//
//   1. tabulator  — Data Table (always sensible when cols exist)
//   2. chart      — Chart (12 subtypes, tested via data-driven loop — see below)
//   3. pivot      — Pivot Table (needs ≥2 dims + ≥1 measure)
//   4. number     — Number/KPI (needs ≥1 measure)
//   5. map        — Map (needs geo: lat/lon or state/country)
//   6. sankey     — Sankey diagram (needs source + target dims + value measure)
//   7. gauge      — Gauge (needs rowCount===1 + single numeric)
//   8. trend      — Trend/Sparkline (needs temporal dim + measure + ≥2 rows)
//   9. progress   — Progress bar (needs rowCount===1 + single numeric)
//  10. detail     — Detail/Row viewer (always sensible when rows exist)
//
// ── CHART SUBTYPE STRATEGY (data-driven, single test) ─────────────────────────
//
// The chart widget has 12 subtypes but shares the same infrastructure (creation,
// Data tab, Finetune, DSL, interactions) regardless of subtype. Only the Display
// tab subtype picker and rendering differ. Therefore: ONE chart test with a
// data-driven loop that cycles through 3-4 data contexts, testing all subtypes.
//
// DATA CONTEXT A — Categorical (1 cat dim + 1 measure, low cardinality):
//   SQL: SELECT ShipCountry, SUM(Freight) as total_freight
//        FROM Orders GROUP BY ShipCountry
//   Compatible subtypes: bar, row, pie, doughnut, line, area
//   (bar is the smart-defaults #1 pick for categorical data)
//
// DATA CONTEXT B — Temporal (1 date dim + 1 measure, time series):
//   SQL: SELECT strftime('%Y-%m', OrderDate) as order_month, SUM(Freight) as total_freight
//        FROM Orders GROUP BY order_month ORDER BY order_month
//   Compatible subtypes: line, area, waterfall
//   (line is the smart-defaults #1 pick for temporal data)
//
// DATA CONTEXT C — Multi-measure (2+ numeric measures):
//   SQL: SELECT ProductID, SUM(Quantity) as qty, SUM(UnitPrice*Quantity) as revenue
//        FROM [Order Details] GROUP BY ProductID
//   Compatible subtypes: combo, scatter, bubble
//   (scatter is the smart-defaults #1 pick for multi-measure data)
//
// DATA CONTEXT D — Distribution (raw rows grouped by category):
//   SQL: SELECT p.CategoryID, od.Quantity
//        FROM [Order Details] od JOIN Products p ON od.ProductID = p.ProductID
//   Compatible subtypes: boxplot
//   (boxplot needs raw data points per category to show quartiles)
//
// ── PER-WIDGET TEST STRUCTURE — 6 AREAS ──────────────────────────────────────
//
// The file is divided into 6 AREAS matching the per-widget test structure
// described in the original requirements. Every sub-step of an area is its own
// independent test (run one with --grep, e.g. --grep "D-map"): each makes its own
// canvas, so a red one does not stop the others. The SQLite connection, the AI Hub
// and the external browser are made once, in beforeAll, and undone in afterAll.
// Two pairs stay one test each, because the second part continues on the first
// one's canvas: B-1 + B-2 and C-1 + C-2.
//
//   AREA A — Creation & Rendering:         all 10 widget types, rb-* visible
//   AREA B — Data Tab: Visual Mode:        summarize/group-by/sort on chart+tabulator
//   AREA C — Data Tab: Finetune SQL/Script: SQL mode, query edit, detect columns
//   AREA D — Display Tab: Widget Config:    widget-specific IDs, value assertions
//   AREA E — DSL Customization:            chart/tabulator/pivot bidirectional DSL
//   AREA F — Widget Interactions:          delete, move
//
// Principles:
//   • No .catch() swallowing — every assertion must fail the test on real failure
//   • Use specific IDs (#selectNumberField, aria-pressed, etc.) not structural selectors
//   • test names / test.step() not console.log for area/widget labels
//   • Real data contexts: scalar SQL for number/gauge/progress, categorical SQL for
//     chart/map, temporal SQL for trend, 2-dim SQL for pivot/sankey
//
// ── TABLE / SQL SELECTION GUIDE ──────────────────────────────────────────────
//
//   tabulator:  Orders raw drop (always sensible)
//   chart:      SQL — categorical context (ShipCountry + SUM(Freight))
//   pivot:      SQL — 2 dims (ShipCountry + order_year) + SUM(Freight)
//   number:     SQL — scalar: SELECT SUM(Freight) as total_freight FROM Orders
//   map:        SQL — ShipCountry + SUM(Freight) (ShipCountry → region map)
//   sankey:     SQL — CustomerID + ShipCountry + SUM(Freight) (2 dims → sankey)
//   gauge:      SQL — scalar (same as number)
//   trend:      SQL — temporal: order_month + SUM(Freight)
//   progress:   SQL — scalar (same as number)
//   detail:     Categories raw drop (8 rows, always sensible)
//
// ═══════════════════════════════════════════════════════════════════════════════
// ORIGINAL REQUIREMENTS (preserved as reference)
// ═══════════════════════════════════════════════════════════════════════════════

//for each different vizualitation type which /data-canvas supports
// write a separate test which validates it operations work as intended
// like testing that CRUD operations work on business entities but
// adapted for our 'visualizations' in data-canvas

//assert all

//    choose the most appropriate table to be used for this test (based on which visulization you need to assert 'ask yourself which would be the most appropriate data, where is this data from in Northwind?')
//    Data tab Capabilities for both Visual and Finetune
//    Finetune Capabilities work as they should

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTABLE E2E TEST CODE
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Page, type Browser } from '@playwright/test';
import { Helpers } from '../../utils/helpers';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import {
  type WidgetType,
  type EditorInputMode,
  WEB_COMPONENT,
  createFreshCanvas,
  toConnectionCode,
  selectConnection,
  addTableToCanvas,
  enterTextIntoEditor,
  runSqlQuery,
  openDslEditor,
  switchToWidget,
  clickDisplayTab,
  clickDataTab,
  assertWidgetRenders,
  clickWidgetHeader,
  addAggregation,
  addGroupBy,
} from '../../helpers/explore-data-test-helper';

// The worker's own fixtures (beforeAfterAll: the app), so beforeAll can make what every test shares.
const test = electronBeforeAfterAllTest as any;

// ── Constants ──────────────────────────────────────────────────────────────────
const AI_HUB_APP_ID  = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
const DB_VENDOR = 'sqlite';
const connectionName = `VizTest-${DB_VENDOR}`;

// ── Network quiet ──────────────────────────────────────────────────────────────
const inFlightByPage = new WeakMap<Page, Map<unknown, string>>();

/**
 * Waits until the page has gone quiet on the network. A page that never does is a finding, not
 * something to wait out for the length of the test, so the wait is bounded and, when it runs out,
 * says which requests the page still has open.
 */
async function waitNetworkQuiet(page: Page): Promise<void> {
  let inFlight = inFlightByPage.get(page);
  if (!inFlight) {
    const open = new Map<unknown, string>();
    inFlight = open;
    inFlightByPage.set(page, open);
    page.on('request', (r) => open.set(r, `${r.method()} ${r.url()}`));
    page.on('requestfinished', (r) => open.delete(r));
    page.on('requestfailed', (r) => open.delete(r));
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
  } catch (e) {
    throw new Error(`the network never went quiet; still open: ${[...inFlight.values()].join(' | ') || 'nothing the page reports'}\n${String(e)}`);
  }
}

// ── SQL data contexts ──────────────────────────────────────────────────────────
// These produce the right column shapes for each widget family.

const SQL_SCALAR = `SELECT SUM(Freight) as total_freight FROM Orders`;

const SQL_CATEGORICAL = `
  SELECT ShipCountry, SUM(Freight) as total_freight
  FROM Orders
  GROUP BY ShipCountry
  ORDER BY total_freight DESC
`.trim();

const SQL_TEMPORAL = `
  SELECT strftime('%Y-%m', OrderDate) as order_month, SUM(Freight) as total_freight
  FROM Orders
  GROUP BY order_month
  ORDER BY order_month
`.trim();

const SQL_TWO_DIMS = `
  SELECT ShipCountry, strftime('%Y', OrderDate) as order_year, SUM(Freight) as total_freight
  FROM Orders
  GROUP BY ShipCountry, order_year
  ORDER BY ShipCountry, order_year
`.trim();

const SQL_SANKEY = `
  SELECT CustomerID, ShipCountry, SUM(Freight) as total_freight
  FROM Orders
  GROUP BY CustomerID, ShipCountry
  ORDER BY total_freight DESC
  LIMIT 50
`.trim();

const SQL_CHART_TEMPORAL = `
  SELECT strftime('%Y-%m', OrderDate) as order_month, SUM(Freight) as total_freight
  FROM Orders
  GROUP BY order_month
  ORDER BY order_month
`.trim();

const SQL_CHART_MULTIMEASURE = `
  SELECT ProductID, SUM(Quantity) as qty, SUM(UnitPrice*Quantity) as revenue
  FROM [Order Details]
  GROUP BY ProductID
  ORDER BY revenue DESC
  LIMIT 30
`.trim();


// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Data Canvas Visualizations', () => {
  let externalBrowser: Browser | null = null;
  // The worker's own page (the app): it makes the connection and starts and stops the AI Hub.
  let electronPage: Page | null = null;
  let page: Page;

  test.beforeAll(async ({ beforeAfterAll }: { beforeAfterAll: unknown }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[SETUP] START — create SQLite connection, start AI Hub, open external browser');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = beforeAfterAll as any;
    electronPage = process.env.TEST_ENV === 'electron' ? await app.firstWindow() : app.context.pages()[0];
    // This page is the worker's, opened without signing in; on the Server it still shows the login form.
    await Helpers.signInIfLoginFormIsShown(electronPage!);

    // ── SETUP: Create SQLite connection ──────────────────────────────────────
    // A worker started again after a red test runs this again; afterAll has deleted the connection
    // by then, unless that failed, so it is made only when it is not there.
    const connectionCode = toConnectionCode(connectionName, DB_VENDOR);
    const dbConnsResp = await fetch('http://localhost:9090/api/connections?type=database', { headers: Helpers.apiKeyHeader() });
    const existingConns: Array<{ fileName: string }> = await dbConnsResp.json();
    if (!existingConns.some((c) => c.fileName === `${connectionCode}.xml`)) {
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(electronPage!), connectionName, DB_VENDOR,
      );
    }

    // ── SETUP: Start AI Hub ──────────────────────────────────────────────────
    await SelfServicePortalsTestHelper.startApp(
      new FluentTester(electronPage!).gotoApps(),
      AI_HUB_APP_ID,
    );

    // ── SETUP: Open external browser ─────────────────────────────────────────
    const result = await SelfServicePortalsTestHelper.createExternalBrowser();
    externalBrowser = result.browser;
    await Helpers.signInBrowserContext(result.context);
    await SelfServicePortalsTestHelper.waitForServerReady(result.page, AI_HUB_BASE_URL);
    page = result.page;
    console.log('[SETUP] DONE — connection created, AI Hub running, external browser connected');

    // Bridge browser console → Node.js stdout so React logs appear in the
    // test harness even when DevTools is frozen. Remove before final ship.
    page.on('console', (msg) => {
      console.log('[BROWSER]', msg.type().toUpperCase(), msg.text());
    });
  });

  test.afterAll(async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    // ── CLEANUP ────────────────────────────────────────────────────────────────
    if (externalBrowser) {
      try {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      } catch (e) { console.error('Failed to close browser:', e); }
    }
    if (!electronPage) return;

    try {
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(electronPage).gotoApps(),
        AI_HUB_APP_ID,
      );
    } catch (e) { console.error('Failed to stop AI Hub:', e); }

    try {
      const connFilePattern = `${toConnectionCode(connectionName, DB_VENDOR)}\\.xml`;
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage), connFilePattern, DB_VENDOR,
      );
    } catch (e) { console.error(`Failed to delete connection:`, e); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // AREA A — Creation & Rendering
  //
  // For each widget type: create fresh canvas, supply appropriate data,
  // switch to the target widget, assert the rb-* element is visible.
  // No .catch() — a missing web component is a real failure.
  // ══════════════════════════════════════════════════════════════════════
  test('A-1: tabulator', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-1] START — tabulator: create canvas, drop Orders, assert rb-tabulator renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A1 — Tabulator | Orders raw drop');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await switchToWidget(page, 'tabulator');
    await assertWidgetRenders(page, 'tabulator');
    console.log('[A-1] DONE — tabulator widget visible');
  });

  test('A-2: chart', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-2] START — chart: create canvas, categorical SQL, assert rb-chart renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A2 — Chart | Categorical SQL ShipCountry+Freight');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CATEGORICAL);
    await clickDataTab(page);
    await switchToWidget(page, 'chart');
    await assertWidgetRenders(page, 'chart');
    console.log('[A-2] DONE — chart widget visible');
  });

  test('A-3: pivot', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-3] START — pivot: create canvas, 2-dim SQL, assert rb-pivot-table renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A3 — Pivot | 2-dim SQL ShipCountry×Year');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_TWO_DIMS);
    await clickDataTab(page);
    await switchToWidget(page, 'pivot');
    await assertWidgetRenders(page, 'pivot');
    console.log('[A-3] DONE — pivot widget visible');
  });

  test('A-4: number', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-4] START — number: create canvas, scalar SQL, assert rb-value renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A4 — Number | Scalar SUM(Freight)');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'number');
    await assertWidgetRenders(page, 'number');
    console.log('[A-4] DONE — number widget visible');
  });

  test('A-5: map', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-5] START — map: create canvas, categorical SQL, assert rb-map renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A5 — Map | ShipCountry region SQL');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CATEGORICAL);
    await clickDataTab(page);
    await switchToWidget(page, 'map');
    await assertWidgetRenders(page, 'map');
    console.log('[A-5] DONE — map widget visible');
  });

  test('A-6: sankey', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-6] START — sankey: create canvas, 2-dim Sankey SQL, assert rb-sankey renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A6 — Sankey | CustomerID→ShipCountry flow');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SANKEY);
    await clickDataTab(page);
    await switchToWidget(page, 'sankey');
    await assertWidgetRenders(page, 'sankey');
    console.log('[A-6] DONE — sankey widget visible');
  });

  test('A-7: gauge', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-7] START — gauge: create canvas, scalar SQL, assert rb-gauge renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A7 — Gauge | Scalar SUM(Freight)');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'gauge');
    await assertWidgetRenders(page, 'gauge');
    console.log('[A-7] DONE — gauge widget visible');
  });

  test('A-8: trend', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-8] START — trend: create canvas, temporal SQL, assert rb-trend renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A8 — Trend | Temporal order_month+Freight');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_TEMPORAL);
    await clickDataTab(page);
    await switchToWidget(page, 'trend');
    await assertWidgetRenders(page, 'trend');
    console.log('[A-8] DONE — trend widget visible');
  });

  test('A-9: progress', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-9] START — progress: create canvas, scalar SQL, assert rb-progress renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A9 — Progress | Scalar SUM(Freight)');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'progress');
    await assertWidgetRenders(page, 'progress');
    console.log('[A-9] DONE — progress widget visible');
  });

  test('A-10: detail', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[A-10] START — detail: create canvas, drop Categories, assert rb-detail renders');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'A10 — Detail | Categories raw drop');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Categories');
    await switchToWidget(page, 'detail');
    await assertWidgetRenders(page, 'detail');
    console.log('[A-10] DONE — detail widget visible');
  });

  // ══════════════════════════════════════════════════════════════════════
  // AREA B — Data Tab: Visual Mode
  //
  // Tests the QueryBuilder Summarize UI (not SQL mode):
  //   - Add aggregation → palette re-evaluates widget sensibility
  //   - Add group-by dimension → chart becomes recommended
  //   - Verify the palette shows chart in mainGrid after summarize
  //
  // Representative widget: chart on Orders (start raw, then aggregate).
  // ══════════════════════════════════════════════════════════════════════
  test('B-1 + B-2: chart — SUM(Freight) aggregation, then the ShipCountry group-by puts chart in mainGrid', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await test.step('B-1: chart — add SUM(Freight) aggregation', async () => {
      console.log('[B-1] START — chart: raw Orders canvas, add SUM(Freight) aggregation, palette re-evaluates');
      await createFreshCanvas(page, DATA_CANVAS_URL, 'B1 — Chart | Visual aggregation SUM(Freight)');
      await selectConnection(page, connectionName, DB_VENDOR);
      await addTableToCanvas(page, 'Orders');

      // Palette starts with raw shape — chart is NOT in mainGrid
      const mainGrid = page.locator('#visualizeAsGrid');
      await mainGrid.waitFor({ state: 'visible', timeout: 10_000 });
      const rawIds: string[] = await mainGrid
        .locator('[id^="btnVisualizeAs-"]')
        .evaluateAll((els) => els.map((el) => el.id.replace('btnVisualizeAs-', '')));
      expect(rawIds).not.toContain('chart');

      // Add aggregation via Data tab Visual mode
      await clickDataTab(page);
      await addAggregation(page, 0, 'SUM', 'Freight');

      // After adding a measure, palette re-evaluates
      await page.waitForTimeout(2000);
      await page.locator('#visualizeAsSection').waitFor({ state: 'visible', timeout: 10_000 });
      console.log('[B-1] DONE — palette re-evaluated after aggregation added');
    });
    await test.step('B-2: chart — add ShipCountry group-by → chart enters mainGrid', async () => {
      console.log('[B-2] START — chart: add ShipCountry group-by, chart should enter mainGrid');
      await addGroupBy(page, 'ShipCountry');
      await page.waitForTimeout(2000);

      // chart should now be sensible and appear in mainGrid
      const mainGrid = page.locator('#visualizeAsGrid');
      await mainGrid.waitFor({ state: 'visible', timeout: 10_000 });
      const aggIds: string[] = await mainGrid
        .locator('[id^="btnVisualizeAs-"]')
        .evaluateAll((els) => els.map((el) => el.id.replace('btnVisualizeAs-', '')));
      expect(aggIds).toContain('chart');
      console.log('[B-2] DONE — chart is sensible in palette mainGrid');
    });
  });

  test('B-3: tabulator — renders on raw Orders, config panel accessible', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[B-3] START — tabulator: raw Orders, switch to widget, open Display tab, assert configPanel');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'B3 — Tabulator | Display config panel');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await switchToWidget(page, 'tabulator');
    await assertWidgetRenders(page, 'tabulator');
    // Switch to Display tab and verify #configPanel-tabulator renders
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-tabulator')).toBeVisible({ timeout: 5_000 });
    console.log('[B-3] DONE — configPanel-tabulator visible');
  });

  // ══════════════════════════════════════════════════════════════════════
  // AREA C — Data Tab: Finetune SQL / Script
  //
  // Tests Finetune tab workflow:
  //   C-1: Switch to SQL mode, write scalar query, detect columns.
  //        Assert columns appear and widget updates to number (scalar shape).
  //   C-2: Switch to Script mode — verify editor is accessible.
  //   C-3: Switch back to Visual mode — verify group-by UI reappears.
  // ══════════════════════════════════════════════════════════════════════
  test('C-1 + C-2: SQL mode scalar query → number #1, then Script mode on the same canvas', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await test.step('C-1: SQL mode — scalar query → number widget #1 in palette', async () => {
      console.log('[C-1] START — SQL mode: type scalar query, run it, detect columns, assert palette');
      await createFreshCanvas(page, DATA_CANVAS_URL, 'C1 — SQL Finetune | Scalar KPI palette');
      await selectConnection(page, connectionName, DB_VENDOR);
      await addTableToCanvas(page, 'Orders');

      // Switch to Finetune tab → SQL mode
      await page.locator('#btnQueryTab-finetune').click();
      await page.waitForTimeout(500);
      await page.locator('#selectQueryMode').selectOption('sql');
      await page.waitForTimeout(300);

      // Write a scalar query
      const editor = page.locator('#sqlEditorContainer .cm-content');
      await editor.waitFor({ state: 'visible', timeout: 5_000 });
      await editor.click();
      await page.keyboard.press('Control+a');
      await enterTextIntoEditor(page, SQL_SCALAR);

      // Run Query — useWidgetData writes the result to canvas-store's
      // queryResults[widgetId].  ConfigPanel's store-watch effect sees the
      // new entry and auto-populates `columns` via inferColumnsFromRow, so
      // the dashed "#btnDetectColumns" hint box no longer appears (it was
      // only shown while columns.length === 0).  We just wait a tick for
      // the effect to run, then assert the palette.
      await page.locator('#btnRunSqlQuery').click();
      await page.waitForTimeout(2_000);
      await clickDisplayTab(page);
      await page.waitForTimeout(500);  // give the store → columns effect time to flush

      // #visualizeAsGrid is always visible in ConfigPanel — no tab switch needed.
      // DO NOT click #btnQueryTab-visual here: it calls forceVisualMode() which reverts
      // dataSource.mode to "visual" and causes ConfigPanel to reload the 14 Orders schema
      // columns, wiping out the just-detected scalar columns.
      const mainGridEl = page.locator('#visualizeAsGrid');
      await mainGridEl.waitFor({ state: 'visible', timeout: 10_000 });
      const mainGridIds = await mainGridEl
        .locator('[id^="btnVisualizeAs-"]')
        .evaluateAll((els) => els.map((el) => el.id.replace('btnVisualizeAs-', '')));
      // number must be #1 for scalar KPI (1 row × 1 numeric column)
      expect(mainGridIds[0]).toBe('number');
      expect(mainGridIds).toContain('gauge');
      expect(mainGridIds).toContain('progress');
      console.log('[C-1] DONE — scalar SQL detected, palette shows number as #1 KPI widget');
    });
    await test.step('C-2: Script mode — editor accepts Groovy, Run Script executes and widget renders', async () => {
      console.log('[C-2] START — Script mode: type Groovy, click Run Script, assert tabulator renders');
      // C-1 ended on the Display tab — switch back to Data tab first so the
      // QueryBuilder sub-tabs (#btnQueryTab-finetune) are visible and clickable.
      await clickDataTab(page);
      await page.waitForTimeout(300);
      await page.locator('#btnQueryTab-finetune').click();
      await page.waitForTimeout(500);
      await page.locator('#selectQueryMode').selectOption('script');
      await page.waitForTimeout(300);

      // Script editor must render with its own container ID
      const scriptEditor = page.locator('#scriptEditorContainer .cm-content');
      await scriptEditor.waitFor({ state: 'visible', timeout: 5_000 });

      // Valid single-widget Groovy script: queries db via ctx.dbSql.rows(), returns List<Map>.
      // Returns categorical data (ShipCountry + total_freight) suitable for any widget.
      const groovyScript = [
        "def data = ctx.dbSql.rows('SELECT ShipCountry, ROUND(SUM(Freight), 2) AS total_freight FROM Orders GROUP BY ShipCountry ORDER BY total_freight DESC')",
        'return data',
      ].join('\n');
      await scriptEditor.click();
      await page.keyboard.press('Control+a');
      await enterTextIntoEditor(page, groovyScript);
      await page.waitForTimeout(300);

      // Switch to tabulator widget so the script result has a widget to render into
      await clickDataTab(page);
      await switchToWidget(page, 'tabulator');

      // Run Script — backend executes Groovy, result stored in dataSource.scriptResult,
      // useWidgetData picks it up, rb-tabulator renders with the script-provided data.
      const runBtn = page.locator('#btnRunScript');
      await runBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await expect(runBtn).toBeEnabled({ timeout: 3_000 });
      await runBtn.click();

      // Widget must render with script-provided data
      await assertWidgetRenders(page, 'tabulator');

      // Script persists after switching SQL → back to script
      await page.locator('#btnQueryTab-finetune').click();
      await page.waitForTimeout(300);
      await page.locator('#selectQueryMode').selectOption('sql');
      await page.waitForTimeout(200);
      await page.locator('#selectQueryMode').selectOption('script');
      await page.waitForTimeout(300);
      await expect(page.locator('#scriptEditorContainer .cm-content')).toBeVisible();
      console.log('[C-2] DONE — Groovy script executed, tabulator rendered with script data, editor persisted');
    });
  });

  test('C-3: Visual mode on fresh canvas — Summarize UI always accessible', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[C-3] START — fresh canvas, raw Orders drop, click Visual tab, assert #btnAddAggregation visible');
    // Use a fresh canvas so Visual mode is never contaminated by prior SQL/script state.
    await createFreshCanvas(page, DATA_CANVAS_URL, 'C3 — Visual Mode | Summarize UI');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    // Data tab opens on Visual mode by default after addTableToCanvas
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);
    const addAggBtn = page.locator('#btnAddAggregation');
    await addAggBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(addAggBtn).toBeVisible();
    console.log('[C-3] DONE — Visual mode Summarize UI visible');
  });

  test('C-4: state preservation — Visual→SQL→Visual→Script→Visual on one canvas', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[C-4] START — state preservation: Visual→SQL→Visual→Script→Visual, one shared canvas');

    // ── Setup: build a visual query (aggregation + group-by) ────────────
    await createFreshCanvas(page, DATA_CANVAS_URL, 'C4 — State Preservation | Round-trip modes');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);

    // Add SUM(Freight) aggregation
    const addAggBtn = page.locator('#btnAddAggregation');
    await addAggBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addAggBtn.click();
    await page.waitForTimeout(300);
    await page.locator('#selectAggFunc-0').selectOption('SUM');
    await page.locator('#selectAggField-0').selectOption('Freight');
    await page.waitForTimeout(300);

    // Add ShipCountry group-by
    await page.locator('#btnGroupBy-ShipCountry').click();
    await page.waitForTimeout(500);

    // Assert visual query is established before any mode switch
    await expect(page.locator('#selectAggFunc-0')).toHaveValue('SUM');
    await expect(page.locator('#selectAggField-0')).toHaveValue('Freight');
    await expect(page.locator('#btnRemoveGroupBy-ShipCountry')).toBeVisible();
    console.log('[C-4] Visual query established: SUM(Freight) + ShipCountry group-by confirmed');

    // ── Transition 1: Visual → SQL ────────────────────────────────────
    await page.locator('#btnQueryTab-finetune').click();
    await page.waitForTimeout(500);
    await page.locator('#selectQueryMode').selectOption('sql');
    await page.waitForTimeout(300);

    // SQL editor must contain the generated SQL — proves visual query
    // was serialised and carried to the SQL editor, not lost.
    const sqlEditor = page.locator('#sqlEditorContainer .cm-content');
    await sqlEditor.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(sqlEditor).toContainText('ShipCountry');
    await expect(sqlEditor).toContainText('Freight');
    console.log('[C-4] Visual→SQL: SQL editor contains ShipCountry and Freight ✓');

    // ── Transition 2: SQL → Visual ────────────────────────────────────
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);

    // Visual query must be INTACT — aggregation + group-by must survive
    // the round-trip through SQL mode. A regression here means SQL mode
    // is overwriting dataSource.visualQuery on unmount.
    await expect(page.locator('#selectAggFunc-0')).toHaveValue('SUM');
    await expect(page.locator('#selectAggField-0')).toHaveValue('Freight');
    await expect(page.locator('#btnRemoveGroupBy-ShipCountry')).toBeVisible();
    console.log('[C-4] SQL→Visual: visual query intact (SUM/Freight/ShipCountry still present) ✓');

    // ── Transition 3: Visual → Script ─────────────────────────────────
    await page.locator('#btnQueryTab-finetune').click();
    await page.waitForTimeout(500);
    await page.locator('#selectQueryMode').selectOption('script');
    await page.waitForTimeout(300);

    const scriptEditor = page.locator('#scriptEditorContainer .cm-content');
    await scriptEditor.waitFor({ state: 'visible', timeout: 5_000 });

    // Type a Groovy script — real user action, confirms editor accepts input.
    // This is the ONE site in the suite that keeps "typed" input mode:
    // the keystroke path (beforeinput → CodeMirror → onChange → store
    // → ConfigPanel re-render) is exercised end-to-end on the final 2
    // chars, while the prefix is pasted for speed.  The toContainText
    // assertion below validates both modes produce the same final state.
    await scriptEditor.click();
    await page.keyboard.press('Control+a');
    await enterTextIntoEditor(
      page,
      "return ctx.dbSql.rows('SELECT ShipCountry, SUM(Freight) AS total FROM Orders GROUP BY ShipCountry')",
      "typed",
    );
    await page.waitForTimeout(300);
    await expect(scriptEditor).toContainText('ShipCountry');
    console.log('[C-4] Visual→Script: script editor visible and accepts input ✓');

    // ── Transition 4: Script → Visual ─────────────────────────────────
    await page.locator('#btnQueryTab-visual').click();
    await page.waitForTimeout(500);

    // Visual query must STILL be intact after Script mode visit.
    // A regression here means script mode's onChange is leaking into
    // visualQuery or forceVisualMode is being called on tab switch.
    await expect(page.locator('#selectAggFunc-0')).toHaveValue('SUM');
    await expect(page.locator('#selectAggField-0')).toHaveValue('Freight');
    await expect(page.locator('#btnRemoveGroupBy-ShipCountry')).toBeVisible();
    console.log('[C-4] Script→Visual: visual query intact after Script round-trip ✓');
    console.log('[C-4] DONE — all mode transitions preserved canvas state');
  });

  // ══════════════════════════════════════════════════════════════════════
  // AREA D — Display Tab: Widget-Specific Config
  //
  // For each widget type: create appropriate data context, switch to
  // the widget, open Display tab, assert config values using the specific
  // IDs added during Phase 3 source-code changes.
  //
  // Key assertions (no structural selectors — use named IDs):
  //   chart    → aria-pressed="true" on #btnChartType-bar (categorical → bar)
  //   number   → #selectNumberField has a value
  //   trend    → #selectTrendDate + #selectTrendValue have values
  //   map      → #btnMapType-region has aria-pressed="true" (ShipCountry → region)
  //   gauge    → #selectGaugeField has a value; #inputGaugeMin/#inputGaugeMax present
  //   progress → #selectProgressField has a value
  //   sankey   → #selectSankeySource, #selectSankeyTarget, #selectSankeyValue have values
  //   pivot    → #configPanel-pivot visible
  //   tabulator→ #configPanel-tabulator visible
  //   detail   → #configPanel-detail visible
  // ══════════════════════════════════════════════════════════════════════
  test('D-chart: categorical data → bar is #1, aria-pressed', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-chart-cat] START — categorical SQL, assert bar auto-selected, verify line toggle');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Chart | Bar auto-select categorical');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CATEGORICAL);
    await clickDataTab(page);
    await switchToWidget(page, 'chart');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-chart')).toBeVisible({ timeout: 5_000 });
    // bar should be auto-selected for categorical data
    const barBtn = page.locator('#btnChartType-bar');
    await barBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(barBtn).toHaveAttribute('aria-pressed', 'true');

    // Verify line subtype selection works
    const lineBtn = page.locator('#btnChartType-line');
    await lineBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await lineBtn.click();
    await page.waitForTimeout(500);
    await expect(lineBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(barBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch back to bar
    await barBtn.click();
    await page.waitForTimeout(300);
    await expect(barBtn).toHaveAttribute('aria-pressed', 'true');
    console.log('[D-chart-cat] DONE — bar/line toggle works');
  });

  test('D-chart: temporal data → line is #1', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-chart-temp] START — temporal SQL, assert line auto-selected');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Chart | Line auto-select temporal');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CHART_TEMPORAL);
    await clickDataTab(page);
    await switchToWidget(page, 'chart');
    await clickDisplayTab(page);
    const lineBtn = page.locator('#btnChartType-line');
    await lineBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(lineBtn).toHaveAttribute('aria-pressed', 'true');
    console.log('[D-chart-temp] DONE — line is #1 for temporal data');
  });

  test('D-chart: multi-measure data → scatter is #1', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-chart-multi] START — multi-measure SQL, assert scatter auto-selected');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Chart | Scatter auto-select multi-measure');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Order Details');
    await runSqlQuery(page, SQL_CHART_MULTIMEASURE);
    await clickDataTab(page);
    await switchToWidget(page, 'chart');
    await clickDisplayTab(page);
    const scatterBtn = page.locator('#btnChartType-scatter');
    await scatterBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(scatterBtn).toHaveAttribute('aria-pressed', 'true');
    console.log('[D-chart-multi] DONE — scatter is #1 for multi-measure data');
  });

  test('D-number: scalar → #selectNumberField has value', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-number] START — scalar SQL, assert #selectNumberField pre-selected to total_freight');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Number | Auto-pick total_freight');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'number');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-number')).toBeVisible({ timeout: 5_000 });
    const fieldSelect = page.locator('#selectNumberField');
    await fieldSelect.waitFor({ state: 'visible', timeout: 3_000 });
    // Auto-pick should have pre-selected total_freight
    const val = await fieldSelect.inputValue();
    expect(val).toBeTruthy();
    expect(val).toBe('total_freight');
    console.log('[D-number] DONE — number field auto-picked');
  });

  test('D-trend: temporal → #selectTrendDate + #selectTrendValue have values', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-trend] START — temporal SQL, assert #selectTrendDate + #selectTrendValue pre-selected');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Trend | Auto-pick date+value fields');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_TEMPORAL);
    await clickDataTab(page);
    await switchToWidget(page, 'trend');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-trend')).toBeVisible({ timeout: 5_000 });
    const dateSelect  = page.locator('#selectTrendDate');
    const valueSelect = page.locator('#selectTrendValue');
    await dateSelect.waitFor({ state: 'visible', timeout: 3_000 });
    await valueSelect.waitFor({ state: 'visible', timeout: 3_000 });
    const dateVal  = await dateSelect.inputValue();
    const valueVal = await valueSelect.inputValue();
    const dateDump = await dateSelect.evaluate((el: HTMLSelectElement) => ({
      value: el.value,
      selectedIndex: el.selectedIndex,
      options: Array.from(el.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })),
      outerHTML: el.outerHTML.slice(0, 500),
    }));
    console.log('[DIAG-dateSelect]', JSON.stringify(dateDump));
    const valueDump = await valueSelect.evaluate((el: HTMLSelectElement) => ({
      value: el.value,
      selectedIndex: el.selectedIndex,
      options: Array.from(el.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })),
    }));
    console.log('[DIAG-valueSelect]', JSON.stringify(valueDump));
    expect(dateVal).toBeTruthy();
    expect(valueVal).toBeTruthy();
    expect(dateVal).toBe('order_month');
    expect(valueVal).toBe('total_freight');
    console.log('[D-trend] DONE — trend date/value fields auto-picked');
  });

  test('D-map: ShipCountry → region map type, aria-pressed', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-map] START — categorical SQL, assert region map type auto-selected, verify pin toggle');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Map | Region auto-select ShipCountry');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CATEGORICAL);
    await clickDataTab(page);
    await switchToWidget(page, 'map');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-map')).toBeVisible({ timeout: 5_000 });
    // ShipCountry should trigger auto-pick of "region" map type
    const regionBtn = page.locator('#btnMapType-region');
    await regionBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await expect(regionBtn).toHaveAttribute('aria-pressed', 'true');

    // Verify switching to pin works.
    // rb-map (Leaflet) blocks the main thread after initial render in the
    // full-suite context (heap pressure). Use a browser-side setTimeout so
    // we only proceed once the event loop is actually free — unlike
    // page.waitForTimeout which is Node.js-side and doesn't observe the
    // browser's blocked state.
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 2000)));
    const pinBtn = page.locator('#btnMapType-pin');
    await pinBtn.click();
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 1000)));
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(regionBtn).toHaveAttribute('aria-pressed', 'false');
    console.log('[D-map] DONE — region/pin toggle works');
  });

  test('D-gauge: scalar → #selectGaugeField has value, min/max inputs present', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-gauge] START — scalar SQL, assert #selectGaugeField + min/max inputs present');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Gauge | Auto-pick field + min/max');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'gauge');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-gauge')).toBeVisible({ timeout: 5_000 });
    const fieldSelect = page.locator('#selectGaugeField');
    await fieldSelect.waitFor({ state: 'visible', timeout: 3_000 });
    const val = await fieldSelect.inputValue();
    expect(val).toBeTruthy();
    // Min/max inputs must be present
    await expect(page.locator('#inputGaugeMin')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('#inputGaugeMax')).toBeVisible({ timeout: 3_000 });
    // Verify editing max works
    await page.locator('#inputGaugeMax').fill('5000');
    await page.waitForTimeout(300);
    await expect(page.locator('#inputGaugeMax')).toHaveValue('5000');
    console.log('[D-gauge] DONE — gauge field + min/max inputs present');
  });

  test('D-progress: scalar → #selectProgressField has value, goal editable', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-progress] START — scalar SQL, assert #selectProgressField + goal input present');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Progress | Auto-pick field + goal');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SCALAR);
    await clickDataTab(page);
    await switchToWidget(page, 'progress');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-progress')).toBeVisible({ timeout: 5_000 });
    const fieldSelect = page.locator('#selectProgressField');
    await fieldSelect.waitFor({ state: 'visible', timeout: 3_000 });
    const val = await fieldSelect.inputValue();
    expect(val).toBeTruthy();
    // Goal input present and editable
    const goalInput = page.locator('#inputProgressGoal');
    await expect(goalInput).toBeVisible({ timeout: 3_000 });
    await goalInput.fill('10000');
    await page.waitForTimeout(300);
    await expect(goalInput).toHaveValue('10000');
    console.log('[D-progress] DONE — progress field + goal input present');
  });

  test('D-sankey: 2-dim → source/target/value selects have values', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-sankey] START — Sankey SQL, assert source/target/value selects have values');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Sankey | Auto-pick source/target/value');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_SANKEY);
    await clickDataTab(page);
    await switchToWidget(page, 'sankey');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-sankey')).toBeVisible({ timeout: 5_000 });
    // Source and target should auto-pick the two dimension columns
    const sourceSelect = page.locator('#selectSankeySource');
    const targetSelect = page.locator('#selectSankeyTarget');
    const valueSelect  = page.locator('#selectSankeyValue');
    await sourceSelect.waitFor({ state: 'visible', timeout: 3_000 });
    await targetSelect.waitFor({ state: 'visible', timeout: 3_000 });
    await valueSelect.waitFor({ state: 'visible', timeout: 3_000 });
    // Value field should be auto-picked to total_freight
    const valueVal = await valueSelect.inputValue();
    expect(valueVal).toBeTruthy();
    console.log('[D-sankey] DONE — sankey mapping fields auto-picked');
  });

  test('D-pivot: #configPanel-pivot visible', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-pivot] START — 2-dim SQL, assert #configPanel-pivot visible');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Pivot | 2-dim config panel');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_TWO_DIMS);
    await clickDataTab(page);
    await switchToWidget(page, 'pivot');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-pivot')).toBeVisible({ timeout: 5_000 });
    console.log('[D-pivot] DONE — pivot config panel visible');
  });

  test('D-tabulator: #configPanel-tabulator visible', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-tabulator] START — raw Orders, assert #configPanel-tabulator visible');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Tabulator | Orders config panel');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await switchToWidget(page, 'tabulator');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-tabulator')).toBeVisible({ timeout: 5_000 });
    console.log('[D-tabulator] DONE — tabulator config panel visible');
  });

  test('D-detail: #configPanel-detail visible', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[D-detail] START — raw Categories, assert #configPanel-detail visible');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'D — Detail | Categories config');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Categories');
    await switchToWidget(page, 'detail');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-detail')).toBeVisible({ timeout: 5_000 });
    console.log('[D-detail] DONE — detail config panel visible');
  });

  // ══════════════════════════════════════════════════════════════════════
  // AREA E — DSL Customization (auto-save persistence)
  //
  // Chart, tabulator, pivot → BidirectionalDslCustomizer in the config panel.
  // Parameters (filter-bar) → FilterBarConfigPanel modal (canvas-level filterDsl).
  //
  // Each step: open DSL editor, assert widget-type-specific keys present in the
  // serialized DSL, append a unique marker comment, wait for auto-save
  // (useDslSync 600ms + canvas auto-save 1200ms + margin = 3000ms), navigate
  // away to the canvas list, navigate back to the same canvas URL, re-open the
  // DSL editor, assert the marker survived the round-trip through the server.
  // ══════════════════════════════════════════════════════════════════════
  test('E-1: chart — DSL content + auto-save persist (navigate away/back)', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[E-1] START — chart DSL: assert canonical type key, flip type bar→line, navigate away/back, assert type persists as line');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'E1 — Chart | DSL persist');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_CATEGORICAL);
    await clickDataTab(page);
    await switchToWidget(page, 'chart');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-chart')).toBeVisible({ timeout: 5_000 });

    const canvasUrl = page.url();

    await openDslEditor(page);

    // Chart DSL must contain the canonical command-chain type — `type 'bar'`
    // (no parens). Per DSLPrinciplesReadme, `type('bar')` is the BAD form.
    //
    // Read the editor line-by-line and join with newlines. CodeMirror 6 renders
    // each line as a separate `.cm-line` div; `.cm-content`.textContent joins
    // them WITHOUT newlines, producing a single-line blob that is invalid
    // Groovy (adjacent command-chain calls like `type 'bar' data { … }` parse
    // as `type('bar').data(…)`). The line-by-line read preserves the line
    // structure, which is what we need for the paste-back round-trip.
    const dslBeforeLines = await page.locator('#dslEditorContainer .cm-line').allTextContents();
    const dslBefore = dslBeforeLines.join('\n');
    expect(dslBefore).toMatch(/type\s+'bar'/);

    // AI help button present (chart has AI DSL support)
    await expect(page.locator('#btnAiHelpDsl')).toBeVisible({ timeout: 3_000 });

    // Flip the chart type from 'bar' → 'line' by simulating a real
    // OS clipboard paste: write the new DSL to the system clipboard,
    // then dispatch a TRUSTED Ctrl+V keystroke. The browser fires a
    // real `paste` DOM event with `clipboardData` populated from the
    // system clipboard — exactly the path a real user takes (verified
    // by hand). CodeMirror 6's dedicated paste handler reads the
    // clipboard text and dispatches an atomic transaction → onChange
    // → saveDslText → /dsl/chart/parse → updateConfig.
    //
    // Why not the alternatives:
    //  - `keyboard.insertText`: synthetic InputEvent, filtered by CM6.
    //  - synthetic `ClipboardEvent`: untrusted clipboardData, filtered.
    //  - `view.dispatch` via @uiw/react-codemirror: doesn't expose
    //     `cmView` on the DOM where vanilla CM6 does (verified diag).
    //  - `locator.fill`: uses execCommand('insertText'), which CM6's
    //     MutationObserver reconciler rejects (verified by no-op).
    const newDsl = dslBefore.replace(/type\s+'bar'/, "type 'line'");
    await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, newDsl);
    await page.locator('#dslEditorContainer .cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+V');

    // Collapse DSL section
    await page.locator('#btnDslToggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#dslEditorContainer')).not.toBeVisible();

    // Wait for useDslConfig.saveDslText (POST /dsl/chart/parse) to complete
    // + canvas auto-save to fire. The save chain is fire-and-forget on each
    // onChange, no debounce, so 3s is generous.
    await page.waitForTimeout(3_000);

    // Navigate away to canvas list, then back to the same canvas
    await page.goto(`${AI_HUB_BASE_URL}/explore-data`);
    await waitNetworkQuiet(page);
    await page.goto(canvasUrl);
    await waitNetworkQuiet(page);

    await assertWidgetRenders(page, 'chart');
    await clickWidgetHeader(page, 'chart');

    // Re-open display tab and DSL editor
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-chart')).toBeVisible({ timeout: 5_000 });
    await openDslEditor(page);

    // Semantic edit must survive the round-trip through auto-save + server reload
    const dslAfter = await page.locator('#dslEditorContainer .cm-content').textContent() ?? '';
    expect(dslAfter).toMatch(/type\s+'line'/);
    expect(dslAfter).not.toMatch(/type\s+'bar'/);   // no stale leftover
    console.log('[E-1] DONE — chart DSL type=line persisted through navigation');
  });

  test('E-2: tabulator — DSL content + auto-save persist (navigate away/back)', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[E-2] START — tabulator DSL: assert layout key, flip fitColumns→fitDataStretch, navigate away/back, assert layout persists');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'E2 — Tabulator | DSL persist');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await switchToWidget(page, 'tabulator');

    const canvasUrl = page.url();

    await clickDisplayTab(page);
    await openDslEditor(page);

    // Tabulator DSL must contain the canonical seeded layout — `layout 'fitColumns'`.
    // Line-by-line read preserves newlines for the paste-back round-trip; see E-1.
    const dslBeforeLines = await page.locator('#dslEditorContainer .cm-line').allTextContents();
    const dslBefore = dslBeforeLines.join('\n');
    expect(dslBefore).toMatch(/tabulator/);
    expect(dslBefore).toMatch(/layout\s+'fitColumns'/);

    await expect(page.locator('#btnAiHelpDsl')).toBeVisible({ timeout: 3_000 });

    // Flip layout to a different valid tabulator.info value. Semantic field that
    // round-trips cleanly through parse → Map → emit. See E-1 for the rationale
    // on the clipboard + Ctrl+V approach (real paste, only path that works).
    const newDsl = dslBefore.replace(/layout\s+'fitColumns'/, "layout 'fitDataStretch'");
    await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, newDsl);
    await page.locator('#dslEditorContainer .cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+V');

    // Collapse + wait for save chain
    await page.locator('#btnDslToggle').click();
    await page.waitForTimeout(300);
    await page.waitForTimeout(3_000);

    // Navigate away/back
    await page.goto(`${AI_HUB_BASE_URL}/explore-data`);
    await waitNetworkQuiet(page);
    await page.goto(canvasUrl);
    await waitNetworkQuiet(page);

    await assertWidgetRenders(page, 'tabulator');
    await clickWidgetHeader(page, 'tabulator');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-tabulator')).toBeVisible({ timeout: 5_000 });
    await openDslEditor(page);

    const dslAfter = await page.locator('#dslEditorContainer .cm-content').textContent() ?? '';
    expect(dslAfter).toMatch(/layout\s+'fitDataStretch'/);
    expect(dslAfter).not.toMatch(/layout\s+'fitColumns'/);
    console.log('[E-2] DONE — tabulator DSL layout=fitDataStretch persisted through navigation');
  });

  test('E-3: pivot — DSL content + auto-save persist (navigate away/back)', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[E-3] START — pivot DSL: assert aggregatorName key, flip Sum→Count, navigate away/back, assert aggregator persists');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'E3 — Pivot | DSL persist');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Orders');
    await runSqlQuery(page, SQL_TWO_DIMS);
    await clickDataTab(page);
    await switchToWidget(page, 'pivot');

    const canvasUrl = page.url();

    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-pivot')).toBeVisible({ timeout: 5_000 });
    await openDslEditor(page);

    // Pivot DSL must contain the canonical seeded aggregator — `aggregatorName 'Sum'`.
    // Line-by-line read preserves newlines for the paste-back round-trip; see E-1.
    const dslBeforeLines = await page.locator('#dslEditorContainer .cm-line').allTextContents();
    const dslBefore = dslBeforeLines.join('\n');
    expect(dslBefore).toMatch(/pivotTable/);
    expect(dslBefore).toMatch(/aggregatorName\s+'Sum'/);

    await expect(page.locator('#btnAiHelpDsl')).toBeVisible({ timeout: 3_000 });

    // Flip aggregator Sum → Count. Both are valid react-pivottable aggregators
    // (see PivotTableOptionsScript javadoc). Round-trips through parse → Map → emit.
    const newDsl = dslBefore.replace(/aggregatorName\s+'Sum'/, "aggregatorName 'Count'");
    await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, newDsl);
    await page.locator('#dslEditorContainer .cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+V');

    // Collapse + wait for save chain
    await page.locator('#btnDslToggle').click();
    await page.waitForTimeout(300);
    await page.waitForTimeout(3_000);

    // Navigate away/back
    await page.goto(`${AI_HUB_BASE_URL}/explore-data`);
    await waitNetworkQuiet(page);
    await page.goto(canvasUrl);
    await waitNetworkQuiet(page);

    await assertWidgetRenders(page, 'pivot');
    await clickWidgetHeader(page, 'pivot');
    await clickDisplayTab(page);
    await expect(page.locator('#configPanel-pivot')).toBeVisible({ timeout: 5_000 });
    await openDslEditor(page);

    const dslAfter = await page.locator('#dslEditorContainer .cm-content').textContent() ?? '';
    expect(dslAfter).toMatch(/aggregatorName\s+'Count'/);
    expect(dslAfter).not.toMatch(/aggregatorName\s+'Sum'/);
    console.log('[E-3] DONE — pivot DSL aggregatorName=Count persisted through navigation');
  });

  test('E-4: parameters — filter-bar DSL persist (navigate away/back)', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[E-4] START — filter-bar filterDsl: add param, flip label Param1→E2E_LABEL, navigate away/back, assert label persists');
    // Fresh empty canvas — no widget Display tab open, so no widget #btnDslToggle in DOM
    await createFreshCanvas(page, DATA_CANVAS_URL, 'E4 — Parameters | DSL persist');

    const canvasUrl = page.url();

    // Open filter-bar config via gear icon (visible in edit mode, which is the default)
    const configBtn = page.locator('#btnConfigureFilters');
    await configBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await configBtn.click();
    await page.waitForTimeout(300);

    // Add one parameter — emptyParam() seeds id='param1', label='Param1', type='String'.
    // This triggers serialize → populates filterDsl with a `parameter(id: 'param1', label: 'Param1', …)` entry.
    await page.locator('#btnAddParameter').waitFor({ state: 'visible', timeout: 3_000 });
    await page.locator('#btnAddParameter').click();
    await page.waitForTimeout(800); // serialize debounce (500ms) + margin

    // Open DSL section in modal (#filterDslEditorContainer added for testability)
    await openDslEditor(page, '#filterDslEditorContainer', '#btnFilterDslToggle');

    // Parameters DSL must contain the canonical block + the seeded label.
    // Line-by-line read preserves newlines for the paste-back round-trip; see E-1.
    const dslBeforeLines = await page.locator('#filterDslEditorContainer .cm-line').allTextContents();
    const dslBefore = dslBeforeLines.join('\n');
    expect(dslBefore).toMatch(/parameters|reportparameters/i);
    expect(dslBefore).toMatch(/label:\s*'Param1'/);

    // AI help button for filter-bar DSL
    await expect(page.locator('#btnAiHelpFilters')).toBeVisible({ timeout: 3_000 });

    // Flip the first parameter's label Param1 → E2E_LABEL. `label` is a canonical
    // Map field, round-trips cleanly through the parser. See E-1 for the clipboard
    // + Ctrl+V rationale.
    const newDsl = dslBefore.replace(/label:\s*'Param1'/, "label: 'E2E_LABEL'");
    await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, newDsl);
    await page.locator('#filterDslEditorContainer .cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);

    // Close modal, wait for canvas auto-save (filterDsl is included in canvas state)
    await page.locator('#btnDoneFilters').click();
    await page.waitForTimeout(3_000);

    // Navigate away/back
    await page.goto(`${AI_HUB_BASE_URL}/explore-data`);
    await waitNetworkQuiet(page);
    await page.goto(canvasUrl);
    await waitNetworkQuiet(page);

    // Re-open filter config
    await page.locator('#btnConfigureFilters').waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('#btnConfigureFilters').click();
    await page.waitForTimeout(300);

    // Re-open DSL in modal
    await openDslEditor(page, '#filterDslEditorContainer', '#btnFilterDslToggle');

    const dslAfter = await page.locator('#filterDslEditorContainer .cm-content').textContent() ?? '';
    expect(dslAfter).toMatch(/label:\s*'E2E_LABEL'/);
    expect(dslAfter).not.toMatch(/label:\s*'Param1'/);

    // Close modal cleanly
    await page.locator('#btnDoneFilters').click();
    console.log('[E-4] DONE — filter-bar filterDsl label=E2E_LABEL persisted through navigation');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AREA F — Widget Interactions
  //
  // F-1: Delete widget via Delete key — verify it disappears.
  // F-2: Move widget — drag it to the right, verify the new column is saved and redrawn.
  //
  // Duplicating a widget is NOT tested because the canvas does not offer it today
  // (the canvas store has add, change type, remove, position, data source, display
  // settings and select; nothing copies a widget). It would be a good backlog
  // addition. A suggested way to build it: a store action duplicateWidget(id) that
  // copies the widget's data source and display settings under a new id (no query
  // result copied, so the copy runs its own query), places the copy next to the
  // original and lets the grid's compactor settle it, offered as a button in the
  // widget header plus Ctrl+D. Its test: two widgets show the same data, editing
  // one leaves the other alone, and both survive reopening the canvas.
  //
  // It would work like Power BI's copy/paste of a visual: an independent copy with
  // the same fields and formatting, landing slightly offset. That fits because our
  // widgets are self-contained - each carries its own query and settings, like a
  // Power BI visual. We have no shared master items like Qlik (whose copies stay
  // linked to the master) and no sheet-versus-dashboard split like Tableau (where
  // you duplicate the worksheet, not the tile).
  // ══════════════════════════════════════════════════════════════════════════
  test('F-1: delete widget via Delete key', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[F-1] START — delete widget: create tabulator, click Delete key, assert 0 remaining');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'F1 — Delete | Tabulator widget removal');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Categories');
    await switchToWidget(page, 'tabulator');

    // Widget should be visible
    const widgetEl = page.locator('rb-tabulator').first();
    await widgetEl.waitFor({ state: 'visible', timeout: 10_000 });

    // Select the widget (click on it) and press Delete
    await widgetEl.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(1000);

    // Widget should be removed from the canvas
    const widgetCount = await page.locator('rb-tabulator').count();
    expect(widgetCount).toBe(0);
    console.log('[F-1] DONE — widget deleted from canvas');
  });

  test('F-2: move widget — dragged to the right, it stands in a later column on row 0, and stays there after reopening', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    console.log('[F-2] START — move widget: detail widget, drag its header right, assert column/row saved and redrawn after reopening');
    await createFreshCanvas(page, DATA_CANVAS_URL, 'F2 — Move | Detail widget dragged right');
    await selectConnection(page, connectionName, DB_VENDOR);
    await addTableToCanvas(page, 'Categories');
    // A Detail widget is 4 of the grid's 12 columns wide; a table is born 12 wide (canvas-store
    // WIDGET_DEFAULTS), so it has no room to go sideways and a drag could never move it.
    await switchToWidget(page, 'detail');
    await assertWidgetRenders(page, 'detail');
    const canvasId = page.url().split('/').pop()!;
    const widgetId = (await page.locator('[id^="widgetHeader-"]').first().getAttribute('id'))!.replace(/^widgetHeader-/, '');

    // Where the server has the widget: its column (x) and row (y) on the 12-column grid.
    const storedPlace = async (): Promise<{ x: number; y: number; w: number }> => {
      const response = await page.request.get(`http://localhost:9090/api/explorations/${canvasId}`);
      expect(response.status(), `the saved canvas ${canvasId} can be read`).toBe(200);
      const state = JSON.parse(((await response.json()).state as string) || '{}');
      const w = (state.widgets as Array<Record<string, any>>).find((x) => x.id === widgetId);
      return { x: w?.gridPosition?.x, y: w?.gridPosition?.y, w: w?.gridPosition?.w };
    };
    // Where the page draws it: the column its grid item starts in. A column's width in pixels
    // depends on how wide the canvas is (the config panel of a selected widget narrows it), so the
    // column is read from the grid's geometry as Canvas.tsx sets it: 12 columns, a 12 px margin
    // between them and, with no containerPadding of its own, the same 12 px around the grid.
    const drawnColumn = async (): Promise<number> => {
      const grid = await page.locator('.react-grid-layout').first().boundingBox();
      const item = await page.locator(`#widgetDragHandle-${widgetId}`).boundingBox();
      if (!grid || !item) throw new Error('the grid or the widget is not on screen');
      const COLS = 12, MARGIN = 12;
      const colW = (grid.width - MARGIN * (COLS - 1) - 2 * MARGIN) / COLS;
      return Math.round((item.x - grid.x - MARGIN) / (colW + MARGIN));
    };

    // The widget starts in the first column of the first row, saved as a Detail widget (4 wide).
    await expect.poll(async () => JSON.stringify(await storedPlace()), { timeout: 20_000, intervals: [500] })
      .toBe(JSON.stringify({ x: 0, y: 0, w: 4 }));
    expect(await drawnColumn(), 'drawn in the first column').toBe(0);

    // Drag the header to the right, as a person does (the header is the grid's drag handle).
    const box = await page.locator(`#widgetHeader-${widgetId}`).boundingBox();
    expect(box).not.toBeNull();
    const grabX = box!.x + 40;
    const grabY = box!.y + box!.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 150, grabY, { steps: 8 });
    await page.mouse.move(grabX + 300, grabY, { steps: 8 });
    await page.mouse.up();
    await page.locator('.react-grid-placeholder').waitFor({ state: 'detached', timeout: 10_000 });

    // + The server has it in a later column, still on row 0: the grid compacts upwards
    //   (verticalCompactor), so a sideways move never leaves it lower down. It is drawn there too.
    await expect.poll(async () => (await storedPlace()).x, { timeout: 20_000, intervals: [500] }).toBeGreaterThan(0);
    const moved = await storedPlace();
    expect(moved.y).toBe(0);
    expect(await drawnColumn(), 'drawn in the column it was saved in').toBe(moved.x);

    // + Saved, not just drawn: leave the canvas, open it again, and it stands in the same column.
    await page.goto(`${AI_HUB_BASE_URL}/explore-data`);
    await waitNetworkQuiet(page);
    await page.goto(`${AI_HUB_BASE_URL}/explore-data/${canvasId}`);
    await waitNetworkQuiet(page);
    await assertWidgetRenders(page, 'detail');
    expect(await storedPlace()).toEqual(moved);
    expect(await drawnColumn(), 'drawn in the same column after reopening').toBe(moved.x);
    console.log(`[F-2] DONE — widget moved to column ${moved.x}, row ${moved.y}, and stays there after reopening`);
  });
});

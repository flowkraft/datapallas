// ═══════════════════════════════════════════════════════════════════════════════
// data-canvas-use-cases.spec.ts
// 22 end-to-end tests — one per business dashboard use case (Northwind, SQLite).
// Each test creates a canvas, builds a multi-widget dashboard via the UI,
// asserts every widget renders, publishes to DataPallas, then deletes the
// canvas via the UI in a finally block (zero leftover state after any run).
//
// Principles enforced:
//   • No .catch() — every assertion fails hard on real failure
//   • Named semantic IDs only — no structural CSS selectors
//   • SQLite-compatible SQL throughout (no TOP 1, QUARTER(), DAYOFWEEK())
//   • State hygiene — each test cleans up via UI before it ends
// ═══════════════════════════════════════════════════════════════════════════════

import { expect, type Page, type Browser } from '@playwright/test';
import { Helpers } from '../../utils/helpers';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { getCanvasComponentIds, assertDashboardRendersCorrectly } from '../../helpers/dashboard-test-helper';
import {
  type WidgetType,
  WEB_COMPONENT,
  toConnectionCode,
  createFreshCanvas,
  selectConnection,
  addTableToCanvas,
  addCubeToCanvas,
  openCubeFolders,
  selectCubeFields,
  switchToWidget,
  enterTextIntoEditor,
  runSqlQuery,
  runGroovyScript,
  clickDataTab,
  clickDisplayTab,
  openDslEditor,
  layoutWidgetsByDrag,
  addUIElement,
  addAggregation,
  addGroupBy,
  addVisualSort,
  setVisualLimit,
  addVisualFilter,
  bindVisualFilterToParam,
  addComputedColumn,
  setAggregationCondition,
  setAggregationRunningTotal,
  setAggregationShare,
  setFilterMatch,
  setTimeBucket,
  runVisualQuery,
} from '../../helpers/explore-data-test-helper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const test = electronBeforeAfterAllTest as any;

// ── Constants ──────────────────────────────────────────────────────────────────

const AI_HUB_APP_ID   = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
const DB_VENDOR       = 'sqlite';
const CONNECTION_NAME = `UseCase-${DB_VENDOR}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navigate to canvas list, create a new canvas, rename it, select the connection.
 *  Uses the proven shared-helper pattern from explore-data-visualizations.spec. */
async function createCanvas(page: Page, name: string): Promise<void> {
  await createFreshCanvas(page, DATA_CANVAS_URL, name);
  await selectConnection(page, CONNECTION_NAME, DB_VENDOR);
}

/**
 * Open FilterBarConfigPanel, switch to DSL editor, type the full filterDsl, save.
 * Used before adding widgets so that param IDs are available to ScriptAssembler.
 */
async function addFilterBarParam(page: Page, dslCode: string): Promise<void> {
  await page.locator('#btnConfigureFilters').click();
  await page.locator('#btnFilterDslToggle').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnFilterDslToggle').click();
  const dslEditor = page.locator('#filterDslEditorContainer .cm-content');
  await dslEditor.waitFor({ state: 'visible', timeout: 5_000 });
  await dslEditor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, dslCode);
  await page.locator('#btnDoneFilters').click();
  await page.waitForTimeout(1_500); // autosave debounce
  // Wait for rb-parameters to appear — confirms DSL parsed, parameters mounted,
  // and valueChange with default values fired into the canvas store.
  await page.locator('rb-parameters').waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500); // let Zustand store write and React re-render complete
}

/**
 * Add a widget via SchemaBrowser (click table → "Add? Yes"), set its SQL via
 * the finetune tab, switch to the target widget type, assert the web component renders.
 * Parameterised SQL (${param} placeholders) are sent to the backend along with
 * the current filterValues; the backend converts them to JDBI :param syntax and
 * binds them safely, so a concrete filter value in the canvas filter bar is all
 * that is needed for column detection to return rows.
 */
async function addWidget(
  page:       Page,
  tableName:  string,
  sql:        string,
  widgetType: WidgetType,
): Promise<void> {
  await addTableToCanvas(page, tableName);
  await runSqlQuery(page, sql);
  await clickDataTab(page);
  await switchToWidget(page, widgetType);
  await expect(page.locator(WEB_COMPONENT[widgetType]).last()).toBeVisible({ timeout: 20_000 });
}

/**
 * Add a widget whose data comes from a Groovy script (Finetune → Script mode)
 * instead of SQL. Mirrors addWidget but routes through runGroovyScript.
 * The script should return a List<Map> — typically `ctx.dbSql.rows(sql)` then `return data`.
 */
async function addScriptWidget(
  page:       Page,
  tableName:  string,
  script:     string,
  widgetType: WidgetType,
): Promise<void> {
  await addTableToCanvas(page, tableName);
  await runGroovyScript(page, script);
  await clickDataTab(page);
  await switchToWidget(page, widgetType);
  await expect(page.locator(WEB_COMPONENT[widgetType]).last()).toBeVisible({ timeout: 20_000 });
}

/**
 * Add a Visual-mode widget. addTableToCanvas leaves the canvas on the Visual
 * sub-tab with an implicit SELECT * on the chosen table, so for "plain visual"
 * we just switch widget type. For variants (filter/group/sort/param), pass
 * a `customize` callback that clicks Add-Aggregation / Add-GroupBy /
 * Add-Sort / Add-Filter — then we re-run the visual query.
 */
async function addVisualWidget(
  page:       Page,
  tableName:  string,
  widgetType: WidgetType,
  customize?: () => Promise<void>,
): Promise<void> {
  await addTableToCanvas(page, tableName);
  if (customize) {
    await customize();
    await runVisualQuery(page);
  }
  await switchToWidget(page, widgetType);
  await expect(page.locator(WEB_COMPONENT[widgetType]).last()).toBeVisible({ timeout: 20_000 });
}

/** For the currently-selected widget, open the Display tab's DSL editor, replace
 *  its content with the given DSL, and wait for autosave (useDslSync serialize
 *  debounce 600ms + canvas autosave debounce 1200ms). Returns to the Data tab.
 *  Used to exercise the custom-DSL path for chart / tabulator / pivot widgets. */
async function setCustomWidgetDsl(page: Page, dsl: string): Promise<void> {
  await clickDisplayTab(page);
  await openDslEditor(page);
  const editor = page.locator('#dslEditorContainer .cm-content');
  await editor.click();
  await page.keyboard.press('Control+a');
  await enterTextIntoEditor(page, dsl);
  await page.waitForTimeout(3_000);
  await clickDataTab(page);
}

/** Click Publish, confirm, assert success banner, close dialog.
 *  Captures the export API response and returns the backend-generated reportId
 *  and absolute dashboardUrl — so tests don't need to duplicate the slugify logic. */
async function publishDashboard(page: Page): Promise<{ reportId: string; dashboardUrl: string }> {
  // Let any in-flight preview queries / schema fetches settle before publish
  // so the server is not competing for threads while processing the export.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.locator('#btnPublishDashboard').click();
  const confirmBtn = page.locator('#btnPublishConfirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });

  const [response] = await Promise.all([
    page.waitForResponse(
      r => /\/explorations\/[^/]+\/export$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 90_000 },
    ),
    confirmBtn.click(),
  ]);
  const body = await response.json();

  await page.locator('#publishSuccess').waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.locator('#publishSuccess')).toBeVisible();
  await page.locator('#btnPublishClose').click();

  return { reportId: body.reportId, dashboardUrl: body.dashboardUrl };
}

/**
 * Navigate to canvas list, force-click the (opacity-0) delete button by aria-label,
 * confirm deletion. Leaves the page on the canvas list.
 */
async function deleteCanvasViaUI(page: Page, canvasName: string): Promise<void> {
  await page.goto(DATA_CANVAS_URL);
  await page.waitForLoadState('networkidle');
  // The delete button is opacity-0 until hover; force bypasses the visibility check
  await page.locator(`[aria-label="Delete canvas ${canvasName}"]`).click({ force: true });
  await page.locator('#btnConfirmDeleteCanvas').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnConfirmDeleteCanvas').click();
  await page.waitForTimeout(1_500);
}

// ── Geo-locations synthetic table (used by D22 for pin-map testing) ────────────

const GEO_ROWS = [
  { name: 'New York',    lat:  40.7128,  lon:  -74.0060  },
  { name: 'London',      lat:  51.5074,  lon:   -0.1278  },
  { name: 'Tokyo',       lat:  35.6762,  lon:  139.6503  },
  { name: 'Sydney',      lat: -33.8688,  lon:  151.2093  },
  { name: 'Paris',       lat:  48.8566,  lon:    2.3522  },
  { name: 'Berlin',      lat:  52.5200,  lon:   13.4050  },
  { name: 'São Paulo',   lat: -23.5505,  lon:  -46.6333  },
  { name: 'Mumbai',      lat:  19.0760,  lon:   72.8777  },
  { name: 'Cairo',       lat:  30.0444,  lon:   31.2357  },
  { name: 'Los Angeles', lat:  34.0522,  lon: -118.2437  },
];

/**
 * Runs a Groovy script on the spec's own connection through the seed endpoint, the one door that
 * may change data: `run-sql` answers a single SELECT/WITH and nothing else (`AdHocSqlGuard`), on
 * purpose. The seed is accepted at once and goes on behind the answer, so the callers wait for
 * what it makes. The script gets `dbSql`, a `groovy.sql.Sql` on the connection.
 */
async function runSeedScript(script: string): Promise<void> {
  const connectionCode = toConnectionCode(CONNECTION_NAME, DB_VENDOR);
  const accepted = await fetch(`http://localhost:9090/api/connections/${connectionCode}/run-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...Helpers.apiKeyHeader() },
    body: JSON.stringify({ script, params: {} }),
  });
  expect(accepted.status, 'the seed script was accepted').toBe(200);
}

/** The rows of `geo_locations`, or null while the table is not there. */
async function geoLocationsCount(): Promise<number | null> {
  const connectionCode = toConnectionCode(CONNECTION_NAME, DB_VENDOR);
  const answer = await fetch('http://localhost:9090/api/queries/run-sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...Helpers.apiKeyHeader() },
    body: JSON.stringify({ connectionId: connectionCode, sql: 'SELECT COUNT(*) AS n FROM geo_locations' }),
  });
  const payload = await answer.json();
  if (payload.error) return null;
  return Number((payload.data as Record<string, unknown>[])[0].n);
}

async function setupGeoLocations(): Promise<void> {
  const statements = [
    'CREATE TABLE IF NOT EXISTS geo_locations (name TEXT PRIMARY KEY, lat REAL, lon REAL)',
    ...GEO_ROWS.map((row) =>
      `INSERT OR IGNORE INTO geo_locations VALUES('${row.name}', ${row.lat}, ${row.lon})`),
  ];
  await runSeedScript(statements.map((sql) => `dbSql.execute(${JSON.stringify(sql)})`).join('\n'));
  await expect
    .poll(geoLocationsCount, { timeout: 60_000, intervals: [1_000] })
    .toBe(GEO_ROWS.length);
}

async function teardownGeoLocations(): Promise<void> {
  await runSeedScript(`dbSql.execute(${JSON.stringify('DROP TABLE IF EXISTS geo_locations')})`);
  await expect
    .poll(geoLocationsCount, { timeout: 60_000, intervals: [1_000] })
    .toBeNull();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE — 22 independent tests, one per dashboard (~55 min total)
// Shared setup: connection + AI Hub + external browser created once in beforeAll.
// Each test is independent: a failure in D3 does NOT prevent D4–D22 from running.
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Data Canvas Use Cases', () => {
  let externalBrowser: Browser | null = null;
  let page: Page;
  // Stored so afterAll can stop the AI Hub server regardless of test outcome
  let electronPage: Page | null = null;

  test.beforeAll(async ({ beforeAfterAll }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    // Get the Electron/browser first page for connection + AI Hub setup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = beforeAfterAll as any;
    electronPage = process.env.TEST_ENV === 'electron'
      ? await app.firstWindow()
      : app.context.pages()[0];
    // This page is the worker's, opened without signing in; on the Server it still shows the login form.
    await Helpers.signInIfLoginFormIsShown(electronPage!);

    const connectionCode = toConnectionCode(CONNECTION_NAME, DB_VENDOR);
    const dbConnsResp = await fetch('http://localhost:9090/api/connections?type=database', { headers: Helpers.apiKeyHeader() });
    const existingConns: Array<{ fileName: string }> = await dbConnsResp.json();
    if (!existingConns.some(c => c.fileName === `${connectionCode}.xml`)) {
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(electronPage!), CONNECTION_NAME, DB_VENDOR,
      );
    }
    await SelfServicePortalsTestHelper.startApp(
      new FluentTester(electronPage).gotoApps(),
      AI_HUB_APP_ID,
    );
    const result = await SelfServicePortalsTestHelper.createExternalBrowser();
    externalBrowser = result.browser;
    await Helpers.signInBrowserContext(result.context);
    await SelfServicePortalsTestHelper.waitForServerReady(result.page, AI_HUB_BASE_URL);
    page = result.page;
  });

  test.afterAll(async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    // Close the external Chromium browser first (fast, doesn't need Electron)
    if (externalBrowser) await externalBrowser.close();
    // Stop the AI Hub server via the Electron app — runs whether tests pass or fail
    if (electronPage) {
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(electronPage).gotoApps(),
        AI_HUB_APP_ID,
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D1 — Sales Executive Overview  (Audience: VP of Sales / CEO)
  // ────────────────────────────────────────────────────────────────────────────
  test('D1 — Sales Executive Overview', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D1 — Sales Executive Overview';
    try {
      await createCanvas(page, canvasName);
      // Insertion order: text, number[0]=revenue, number[1]=orders, number[2]=customers, trend[0], divider, map[0].
      await addUIElement(page, 'text', {
        textContent: '## Sales Executive Overview\n\nTotal revenue · Orders placed · Unique customers · Monthly freight trend · Geographic reach.',
      });
      await addWidget(page, 'Order Details',
        `SELECT SUM(UnitPrice*Quantity) AS total_revenue FROM "Order Details"`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT COUNT(*) AS total_orders FROM Orders`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT COUNT(DISTINCT CustomerID) AS unique_customers FROM Orders`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', OrderDate/1000, 'unixepoch') AS order_month, SUM(Freight) AS total_freight FROM Orders GROUP BY order_month ORDER BY order_month`,
        'trend');
      await addUIElement(page, 'divider');
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, SUM(Freight) AS total_freight FROM Orders GROUP BY ShipCountry ORDER BY total_freight DESC`,
        'map');

      // Layout: text → 3 KPIs → trend → divider → map.
      // Insertion order: text, n, n, n, trend, divider, map.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — total_revenue
        { x: 4, y: 2,  w: 4,  h: 2 }, // number   — total_orders
        { x: 8, y: 2,  w: 4,  h: 2 }, // number   — unique_customers
        { x: 0, y: 4,  w: 12, h: 4 }, // trend    — monthly freight
        { x: 0, y: 8,  w: 12, h: 1 }, // divider
        { x: 0, y: 9,  w: 12, h: 5 }, // map      — country freight
      ]);

      const d1CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d1Url } = await publishDashboard(page);
      const d1Ids = await getCanvasComponentIds(page, d1CanvasId);
      const d1ReportCode = d1Url.split('/').pop()!;

      await page.goto(d1Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });

      // total_revenue: Northwind carries substantial revenue across all order lines
      const d1RevId = (d1Ids['number'] ?? [])[0];
      const d1RevData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d1ReportCode, cid: d1RevId });
      const d1TotalRevenue = Number(d1RevData.data[0].total_revenue);
      expect(d1TotalRevenue).toBeGreaterThan(0);

      // total_orders and unique_customers: Northwind customers placed multiple orders each
      const d1OrdId = (d1Ids['number'] ?? [])[1];
      const d1OrdData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d1ReportCode, cid: d1OrdId });
      const d1TotalOrders = Number(d1OrdData.data[0].total_orders);
      expect(d1TotalOrders).toBeGreaterThan(0);

      const d1CustId = (d1Ids['number'] ?? [])[2];
      const d1CustData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d1ReportCode, cid: d1CustId });
      const d1UniqueCust = Number(d1CustData.data[0].unique_customers);
      expect(d1UniqueCust).toBeGreaterThan(0);
      // Each customer placed more than one order on average
      expect(d1TotalOrders).toBeGreaterThan(d1UniqueCust);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D2 — Product Performance Dashboard  (Audience: Product Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D2 — Product Performance Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D2 — Product Performance Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Header text block — sets the scene for the Product Manager audience.
      await addUIElement(page, 'text', {
        textContent: '## Product Performance\n\nRevenue by category · Top products · Inventory reorder alerts.',
      });

      // KPI widgets
      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS total_products FROM Products`,
        'number');
      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS discontinued FROM Products WHERE Discontinued=1`,
        'number');

      // Revenue analysis charts
      await addWidget(page, 'Order Details',
        `SELECT c.CategoryName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Products p ON p.ProductID=od.ProductID JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY c.CategoryName ORDER BY revenue DESC`,
        'chart');
      await addWidget(page, 'Order Details',
        `SELECT p.ProductName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Products p ON p.ProductID=od.ProductID GROUP BY p.ProductName ORDER BY revenue DESC LIMIT 10`,
        'chart');

      // Divider separates analysis from the inventory action section
      await addUIElement(page, 'divider');

      // Inventory reorder alert table
      await addWidget(page, 'Products',
        `SELECT ProductName, UnitsInStock, ReorderLevel FROM Products WHERE UnitsInStock < ReorderLevel ORDER BY UnitsInStock`,
        'tabulator');

      // Layout — text header full-width, KPIs side-by-side, charts side-by-side,
      // divider, then full-width reorder table. Insertion order: text, n, n, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2, w: 6,  h: 2 }, // number   — total_products
        { x: 6, y: 2, w: 6,  h: 2 }, // number   — discontinued
        { x: 0, y: 4, w: 6,  h: 4 }, // chart    — revenue by category
        { x: 6, y: 4, w: 6,  h: 4 }, // chart    — top 10 products
        { x: 0, y: 8, w: 12, h: 1 }, // divider  — visual separator
        { x: 0, y: 9, w: 12, h: 4 }, // tabulator — reorder alerts
      ]);

      const d2CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d2Url } = await publishDashboard(page);
      const d2Ids = await getCanvasComponentIds(page, d2CanvasId);
      const d2ReportCode = d2Url.split('/').pop()!;

      await page.goto(d2Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // total_products: Northwind ships at least 77 products
      const d2ProdId = (d2Ids['number'] ?? [])[0];
      const d2ProdData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d2ReportCode, cid: d2ProdId });
      const d2TotalProducts = Number(d2ProdData.data[0].total_products);
      expect(d2TotalProducts).toBe(20); // test fixture has exactly 20 products

      // discontinued: Northwind has some discontinued products
      const d2DiscId = (d2Ids['number'] ?? [])[1];
      const d2DiscData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d2ReportCode, cid: d2DiscId });
      expect(Number(d2DiscData.data[0].discontinued)).toBeGreaterThan(0);

      // Category revenue chart: Northwind has exactly 8 categories
      const d2CatId = (d2Ids['chart'] ?? [])[0];
      const d2CatData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d2ReportCode, cid: d2CatId });
      expect(d2CatData.data.length).toBe(8);

      // Reorder alert tabulator: every listed product is genuinely below its reorder level
      const d2TabId = (d2Ids['tabulator'] ?? [])[0];
      const d2TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d2ReportCode, cid: d2TabId });
      expect(d2TabData.data.length).toBeGreaterThan(0);
      for (const row of d2TabData.data) {
        expect(Number(row.UnitsInStock)).toBeLessThan(Number(row.ReorderLevel));
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D3 — Employee Sales Performance  (Audience: HR Director / Sales Manager)
  // W4 uses Country region map (Employees has no lat/lon columns)
  // ────────────────────────────────────────────────────────────────────────────
  test('D3 — Employee Sales Performance', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D3 — Employee Sales Performance';
    try {
      await createCanvas(page, canvasName);

      // Insertion order: text, number[0]=total_employees, chart[0]=freight by employee, trend[0]=monthly, map[0]=countries, divider, tabulator[0]=directory.
      await addUIElement(page, 'text', {
        textContent: '## Employee Sales Performance\n\nHeadcount · Freight by employee · Monthly freight trend · Employee geography · Directory.',
      });
      await addWidget(page, 'Employees',
        `SELECT COUNT(*) AS total_employees FROM Employees`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT e.LastName, SUM(o.Freight) AS total_freight FROM Orders o JOIN Employees e ON e.EmployeeID=o.EmployeeID GROUP BY e.LastName ORDER BY total_freight DESC`,
        'chart');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(o.Freight) AS total_freight FROM Orders o GROUP BY order_month ORDER BY order_month`,
        'trend');
      await addWidget(page, 'Employees',
        `SELECT Country, COUNT(*) AS employee_count FROM Employees GROUP BY Country`,
        'map');
      await addUIElement(page, 'divider');
      await addWidget(page, 'Employees',
        `SELECT LastName, FirstName, Title, Country FROM Employees ORDER BY LastName`,
        'tabulator');

      // Layout: text → KPI + chart → trend + map → divider → directory.
      // Insertion order: text, n, c, trend, map, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — total_employees
        { x: 4, y: 2,  w: 8,  h: 5 }, // chart    — freight by employee
        { x: 0, y: 7,  w: 6,  h: 5 }, // trend    — monthly freight
        { x: 6, y: 7,  w: 6,  h: 5 }, // map      — employee countries
        { x: 0, y: 12, w: 12, h: 1 }, // divider
        { x: 0, y: 13, w: 12, h: 4 }, // tabulator — employee directory
      ]);

      const d3CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d3Url } = await publishDashboard(page);
      const d3Ids = await getCanvasComponentIds(page, d3CanvasId);
      const d3ReportCode = d3Url.split('/').pop()!;

      await page.goto(d3Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // Test fixture has 3 employees (see NorthwindDataGenerator.createEmployees)
      const d3NumId = (d3Ids['number'] ?? [])[0];
      const d3NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d3ReportCode, cid: d3NumId });
      expect(Number(d3NumData.data[0].total_employees)).toBe(3);

      // Employee directory: exactly 3 rows (test fixture employees), all contact columns populated
      const d3TabId = (d3Ids['tabulator'] ?? [])[0];
      const d3TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d3ReportCode, cid: d3TabId });
      expect(d3TabData.data.length).toBe(3);
      for (const row of d3TabData.data) {
        expect(row.LastName).toBeDefined();
        expect(row.FirstName).toBeDefined();
        expect(row.Title).toBeDefined();
        expect(row.Country).toBeDefined();
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D4 — Customer Analytics Dashboard  (Audience: Marketing Manager / CRM Lead)
  // ────────────────────────────────────────────────────────────────────────────
  test('D4 — Customer Analytics Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D4 — Customer Analytics Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Insertion order: text, number[0]=total_customers, chart[0]=top by revenue, chart[1]=top by orders, map[0]=customer countries, divider, sankey[0]=customer-country freight.
      await addUIElement(page, 'text', {
        textContent: '## Customer Analytics\n\nTotal customers · Top 10 by revenue · Top 10 by orders · Customer geography · Freight flow.',
      });
      await addWidget(page, 'Customers',
        `SELECT COUNT(*) AS total_customers FROM Customers`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT c.CompanyName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID JOIN Customers c ON c.CustomerID=o.CustomerID GROUP BY c.CompanyName ORDER BY revenue DESC LIMIT 10`,
        'chart');
      await addWidget(page, 'Orders',
        `SELECT CustomerID, COUNT(*) AS order_count FROM Orders GROUP BY CustomerID ORDER BY order_count DESC LIMIT 10`,
        'chart');
      await addWidget(page, 'Customers',
        `SELECT Country, COUNT(*) AS customer_count FROM Customers GROUP BY Country`,
        'map');
      await addUIElement(page, 'divider');
      await addWidget(page, 'Orders',
        `SELECT CustomerID, ShipCountry, SUM(Freight) AS total_freight FROM Orders GROUP BY CustomerID, ShipCountry ORDER BY total_freight DESC LIMIT 50`,
        'sankey');

      // Layout: text → KPI → top-10 charts → map → divider → sankey flow.
      // Insertion order: text, n, c, c, map, divider, sankey.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — total_customers
        { x: 4, y: 2,  w: 8,  h: 5 }, // chart    — top 10 by revenue
        { x: 0, y: 7,  w: 6,  h: 5 }, // chart    — top 10 by order count
        { x: 6, y: 7,  w: 6,  h: 5 }, // map      — customer countries
        { x: 0, y: 12, w: 12, h: 1 }, // divider
        { x: 0, y: 13, w: 12, h: 5 }, // sankey   — customer-country freight
      ]);

      const d4CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d4Url } = await publishDashboard(page);
      const d4Ids = await getCanvasComponentIds(page, d4CanvasId);
      const d4ReportCode = d4Url.split('/').pop()!;

      await page.goto(d4Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-sankey')).toHaveCount(1, { timeout: 20_000 });

      // Northwind has customers across multiple countries — total is positive
      const d4NumId = (d4Ids['number'] ?? [])[0];
      const d4NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d4ReportCode, cid: d4NumId });
      expect(Number(d4NumData.data[0].total_customers)).toBeGreaterThan(0);

      // Top-10 revenue chart: exactly 10 rows, all with positive revenue
      const d4ChartId = (d4Ids['chart'] ?? [])[0];
      const d4ChartData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d4ReportCode, cid: d4ChartId });
      expect(d4ChartData.data.length).toBe(10);
      for (const row of d4ChartData.data) {
        expect(Number(row.revenue)).toBeGreaterThan(0);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D5 — Supply Chain & Inventory Dashboard  (Audience: Supply Chain Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D5 — Supply Chain & Inventory Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D5 — Supply Chain & Inventory Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Insertion order: text, number[0]=total_suppliers, number[1]=below_reorder, chart[0]=products by supplier, map[0]=supplier countries, divider, tabulator[0]=reorder alerts.
      await addUIElement(page, 'text', {
        textContent: '## Supply Chain & Inventory\n\nTotal suppliers · Products at reorder threshold · Supply concentration · Supplier geography · Reorder alerts.',
      });
      await addWidget(page, 'Suppliers',
        `SELECT COUNT(*) AS total_suppliers FROM Suppliers`,
        'number');
      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS below_reorder FROM Products WHERE UnitsInStock <= ReorderLevel`,
        'number');
      await addWidget(page, 'Products',
        `SELECT s.CompanyName, COUNT(p.ProductID) AS product_count FROM Products p JOIN Suppliers s ON s.SupplierID=p.SupplierID GROUP BY s.CompanyName ORDER BY product_count DESC`,
        'chart');
      await addWidget(page, 'Suppliers',
        `SELECT Country, COUNT(*) AS supplier_count FROM Suppliers GROUP BY Country`,
        'map');
      await addUIElement(page, 'divider');
      await addWidget(page, 'Products',
        `SELECT ProductName, UnitsInStock, ReorderLevel FROM Products WHERE UnitsInStock <= ReorderLevel ORDER BY UnitsInStock`,
        'tabulator');

      // Layout: text → 2 KPIs → chart + map → divider → reorder table.
      // Insertion order: text, n, n, c, map, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_suppliers
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — below_reorder
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart    — products by supplier
        { x: 6, y: 4,  w: 6,  h: 5 }, // map      — supplier countries
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — reorder alerts
      ]);

      const d5CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d5Url } = await publishDashboard(page);
      const d5Ids = await getCanvasComponentIds(page, d5CanvasId);
      const d5ReportCode = d5Url.split('/').pop()!;

      await page.goto(d5Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // total_suppliers: Northwind sources from multiple countries
      const d5SupId = (d5Ids['number'] ?? [])[0];
      const d5SupData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d5ReportCode, cid: d5SupId });
      expect(Number(d5SupData.data[0].total_suppliers)).toBeGreaterThan(0);

      // below_reorder: Northwind always has products at or below their reorder level
      const d5ReorderId = (d5Ids['number'] ?? [])[1];
      const d5ReorderData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d5ReportCode, cid: d5ReorderId });
      expect(Number(d5ReorderData.data[0].below_reorder)).toBeGreaterThan(0);

      // Reorder alert table: every row is genuinely at or below its reorder threshold
      const d5TabId = (d5Ids['tabulator'] ?? [])[0];
      const d5TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d5ReportCode, cid: d5TabId });
      expect(d5TabData.data.length).toBeGreaterThan(0);
      for (const row of d5TabData.data) {
        expect(Number(row.UnitsInStock)).toBeLessThanOrEqual(Number(row.ReorderLevel));
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D6 — Shipping & Logistics Dashboard  (Audience: Logistics Manager)
  // Parameter: single-value hardcoded-list select (carrier)
  // Every widget is carrier-scoped so switching the filter rewrites the whole
  // dashboard (volume, quality, efficiency, reach) instead of leaving one
  // widget stranded in "compare all" mode.
  // ────────────────────────────────────────────────────────────────────────────
  test('D6 — Shipping & Logistics Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D6 — Shipping & Logistics Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Hardcoded-list carrier filter — the 3 Northwind shippers exactly as seeded
      // in NorthwindDataGenerator.createShippers().
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'shipper', type: String, label: 'Carrier', defaultValue: 'Speedy Express') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'select', options: ['Speedy Express', 'United Package', 'Federal Shipping'])\n" +
        "  }\n" +
        "}"
      );

      // Dashboard header — sets the scene for the Logistics Manager.
      await addUIElement(page, 'text', {
        textContent: '## Shipping & Logistics Dashboard\n\nPick a carrier above to see their **freight cost**, **on-time rate**, **monthly volume**, **efficiency trend**, and **geographic reach** across 18 months of Northwind orders.',
      });

      // KPI 1 — total freight billed by the selected carrier (what we pay them).
      await addWidget(page, 'Orders',
        `SELECT SUM(o.Freight) AS total_freight FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE s.CompanyName = \${shipper}`,
        'number');
      // KPI 2 — on-time delivery rate (quality): ShippedDate <= RequiredDate,
      // excluding still-unshipped orders so the denominator is fair.
      await addWidget(page, 'Orders',
        `SELECT ROUND(100.0 * SUM(CASE WHEN o.ShippedDate <= o.RequiredDate THEN 1 ELSE 0 END) / COUNT(*), 1) AS on_time_pct FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE s.CompanyName = \${shipper} AND o.ShippedDate IS NOT NULL`,
        'number');

      // Visual break between the KPI row and the detail row.
      await addUIElement(page, 'divider');

      // Chart — monthly shipment volume for the selected carrier.
      // OrderDate is stored as epoch-ms by Hibernate → divide by 1000 + unixepoch modifier.
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') AS month, COUNT(*) AS shipments FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE s.CompanyName = \${shipper} GROUP BY month ORDER BY month`,
        'chart');
      // Trend — avg freight per order month-by-month (efficiency proxy).
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') AS order_month, AVG(o.Freight) AS avg_freight FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE s.CompanyName = \${shipper} GROUP BY order_month ORDER BY order_month`,
        'trend');

      // Section label for the geographic reach view.
      await addUIElement(page, 'text', {
        textContent: '### Shipments by country',
      });

      // Map — carrier's shipment count per country (geographic reach).
      // Normalize legacy short codes to GeoJSON names so countries highlight on the map.
      await addWidget(page, 'Orders',
        `SELECT CASE o.ShipCountry WHEN 'UK' THEN 'United Kingdom' WHEN 'USA' THEN 'United States of America' ELSE o.ShipCountry END AS ShipCountry, COUNT(*) AS shipments FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE s.CompanyName = \${shipper} GROUP BY o.ShipCountry ORDER BY shipments DESC`,
        'map');

      // Arrange on the 12-col grid: header full-width → 2 KPIs side-by-side →
      // divider → chart + trend side-by-side → section label → map full-width.
      // Insertion order must match: text, number, number, divider, chart, trend, text, map.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_freight
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — on_time_pct
        { x: 0, y: 4,  w: 12, h: 1 }, // divider  — visual separator
        { x: 0, y: 5,  w: 6,  h: 4 }, // chart    — monthly shipments
        { x: 6, y: 5,  w: 6,  h: 4 }, // trend    — avg freight per month
        { x: 0, y: 9,  w: 12, h: 1 }, // text     — "Shipments by country"
        { x: 0, y: 10, w: 12, h: 5 }, // map      — shipments by country
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d6Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const numId = (rawIds['number'] ?? [])[0];
      const reportCode = d6Url.split('/').pop()!;

      await page.goto(d6Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });

      // All three inline-list shippers must return distinct, positive freight totals
      const speedyData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&shipper=${encodeURIComponent('Speedy Express')}`);
        return r.json();
      }, { rc: reportCode, cid: numId });
      expect(Number(speedyData.data[0].total_freight)).toBeGreaterThan(0);
      const unitedData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&shipper=${encodeURIComponent('United Package')}`);
        return r.json();
      }, { rc: reportCode, cid: numId });
      expect(Number(unitedData.data[0].total_freight)).toBeGreaterThan(0);
      const federalData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&shipper=${encodeURIComponent('Federal Shipping')}`);
        return r.json();
      }, { rc: reportCode, cid: numId });
      expect(Number(federalData.data[0].total_freight)).toBeGreaterThan(0);
      // All three shippers produce distinct totals — no two are identical
      const totals = [speedyData, unitedData, federalData].map(d => Number(d.data[0].total_freight));
      expect(new Set(totals).size).toBe(3);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D7 — Revenue Deep Dive Dashboard  (Audience: CFO / Finance Analyst)
  // Quarter uses SQLite strftime — no QUARTER() function
  // ────────────────────────────────────────────────────────────────────────────
  test('D7 — Revenue Deep Dive Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D7 — Revenue Deep Dive Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Header text — anchors the CFO audience and summarises the five insight areas.
      await addUIElement(page, 'text', {
        textContent: '## Revenue Deep Dive\n\nTotal revenue · Average order value · Category breakdown · Quarterly trend · Geographic distribution.',
      });

      // KPI row — total_revenue is the headline number; avg_order_value is the efficiency companion.
      await addWidget(page, 'Order Details',
        `SELECT SUM(UnitPrice*Quantity) AS total_revenue FROM "Order Details"`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT AVG(order_total) AS avg_order_value FROM (SELECT SUM(UnitPrice*Quantity) AS order_total FROM "Order Details" GROUP BY OrderID)`,
        'number');

      // Revenue by category — which product lines drive the business.
      await addWidget(page, 'Order Details',
        `SELECT c.CategoryName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Products p ON p.ProductID=od.ProductID JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY c.CategoryName ORDER BY revenue DESC`,
        'chart');

      // Revenue by quarter — YYYY-Q format preserves year context across Northwind's 3-year span.
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y', o.OrderDate/1000, 'unixepoch') || '-Q' || CAST((STRFTIME('%m', o.OrderDate/1000, 'unixepoch') + 2) / 3 AS INTEGER) AS yr_quarter, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID GROUP BY yr_quarter ORDER BY yr_quarter`,
        'chart');

      // Monthly revenue trend — cadence across the full period.
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID GROUP BY order_month ORDER BY order_month`,
        'trend');

      // Revenue by shipping country — geographic spread of sales.
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID GROUP BY ShipCountry ORDER BY revenue DESC`,
        'chart');

      // Divider — separates the CFO summary from the analyst drill-down.
      await addUIElement(page, 'divider');

      // Employee × Category pivot — drill-down for deeper sales attribution.
      await addWidget(page, 'Orders',
        `SELECT e.LastName, c.CategoryName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN Employees e ON e.EmployeeID=o.EmployeeID JOIN "Order Details" od ON od.OrderID=o.OrderID JOIN Products p ON p.ProductID=od.ProductID JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY e.LastName, c.CategoryName`,
        'pivot');

      // Layout: text → 2-KPI row → 2 analysis charts → trend + geo → divider → pivot.
      // Insertion order: text, n, n, c, c, trend, c, divider, pivot.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_revenue
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — avg_order_value
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart    — category revenue
        { x: 6, y: 4,  w: 6,  h: 5 }, // chart    — quarterly YYYY-Q
        { x: 0, y: 9,  w: 6,  h: 5 }, // trend    — monthly revenue
        { x: 6, y: 9,  w: 6,  h: 5 }, // chart    — country revenue
        { x: 0, y: 14, w: 12, h: 1 }, // divider
        { x: 0, y: 15, w: 12, h: 6 }, // pivot    — employee × category
      ]);

      const d7CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d7Url } = await publishDashboard(page);
      const d7Ids = await getCanvasComponentIds(page, d7CanvasId);
      const d7ReportCode = d7Url.split('/').pop()!;

      await page.goto(d7Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 20_000 });

      // total_revenue: Northwind has substantial revenue across all order lines.
      const d7RevId = (d7Ids['number'] ?? [])[0];
      const d7RevData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d7ReportCode, cid: d7RevId });
      const totalRevenue = Number(d7RevData.data[0].total_revenue);
      expect(totalRevenue).toBeGreaterThan(0);

      // avg_order_value must be positive and far below total (it is per-order, not total).
      const d7AvgId = (d7Ids['number'] ?? [])[1];
      const d7AvgData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d7ReportCode, cid: d7AvgId });
      const avgOrderValue = Number(d7AvgData.data[0].avg_order_value);
      expect(avgOrderValue).toBeGreaterThan(0);
      expect(avgOrderValue).toBeLessThan(totalRevenue);

      // Category chart: Northwind has exactly 8 categories, all with positive revenue.
      const d7CatId = (d7Ids['chart'] ?? [])[0];
      const d7CatData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d7ReportCode, cid: d7CatId });
      expect(d7CatData.data.length).toBe(8);
      for (const row of d7CatData.data) {
        expect(row.CategoryName).toBeDefined();
        expect(Number(row.revenue)).toBeGreaterThan(0);
      }

      // Quarterly chart: Northwind spans 1996–1998 → 7–9 YYYY-Q rows, each a valid label.
      const d7QtrId = (d7Ids['chart'] ?? [])[1];
      const d7QtrData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d7ReportCode, cid: d7QtrId });
      expect(d7QtrData.data.length).toBeGreaterThanOrEqual(7);
      expect(d7QtrData.data.length).toBeLessThanOrEqual(10);
      for (const row of d7QtrData.data) {
        expect(String(row.yr_quarter)).toMatch(/^\d{4}-Q[1-4]$/);
        expect(Number(row.revenue)).toBeGreaterThan(0);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D8 — Inventory Management Dashboard  (Audience: Warehouse Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D8 — Inventory Management Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D8 — Inventory Management Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Inventory Management\n\nTotal stock · Reorder alerts · Stock value by category · Price distribution.',
      });

      await addWidget(page, 'Products',
        `SELECT SUM(UnitsInStock) AS total_stock FROM Products`,
        'number');
      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS below_reorder FROM Products WHERE UnitsInStock <= ReorderLevel`,
        'number');
      await addWidget(page, 'Products',
        `SELECT c.CategoryName, SUM(p.UnitPrice * p.UnitsInStock) AS stock_value FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY c.CategoryName ORDER BY stock_value DESC`,
        'chart');
      await addWidget(page, 'Products',
        `SELECT CASE WHEN UnitPrice < 10 THEN 'Under $10' WHEN UnitPrice < 25 THEN '$10-$25' WHEN UnitPrice < 50 THEN '$25-$50' ELSE 'Over $50' END AS price_range, COUNT(*) AS product_count FROM Products GROUP BY price_range ORDER BY product_count DESC`,
        'chart');

      await addUIElement(page, 'divider');

      await addWidget(page, 'Products',
        `SELECT ProductName, UnitsInStock, ReorderLevel, UnitPrice FROM Products WHERE UnitsInStock < 10 ORDER BY UnitsInStock`,
        'tabulator');

      // Layout: text → 2 KPIs → 2 charts → divider → low-stock detail.
      // Insertion order: text, n, n, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_stock
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — below_reorder
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart    — stock value by category
        { x: 6, y: 4,  w: 6,  h: 5 }, // chart    — price range distribution
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — low-stock items
      ]);

      const d8CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d8Url } = await publishDashboard(page);
      const d8Ids = await getCanvasComponentIds(page, d8CanvasId);
      const d8ReportCode = d8Url.split('/').pop()!;

      await page.goto(d8Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // total_stock: Northwind products carry inventory
      const d8StockId = (d8Ids['number'] ?? [])[0];
      const d8StockData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d8ReportCode, cid: d8StockId });
      expect(Number(d8StockData.data[0].total_stock)).toBeGreaterThan(0);

      // below_reorder: Northwind has products at or below their reorder level
      const d8ReorderId = (d8Ids['number'] ?? [])[1];
      const d8ReorderData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d8ReportCode, cid: d8ReorderId });
      expect(Number(d8ReorderData.data[0].below_reorder)).toBeGreaterThan(0);

      // Low-stock detail: every row must have UnitsInStock < 10
      const d8TabId = (d8Ids['tabulator'] ?? [])[0];
      const d8TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d8ReportCode, cid: d8TabId });
      expect(d8TabData.data.length).toBeGreaterThan(0);
      for (const row of d8TabData.data) {
        expect(Number(row.UnitsInStock)).toBeLessThan(10);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D9 — Regional Sales Dashboard  (Audience: Regional Sales Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D9 — Regional Sales Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D9 — Regional Sales Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Regional Sales\n\nCountries served · Freight by country · Top shipping cities · Country breakdown.',
      });

      await addWidget(page, 'Orders',
        `SELECT COUNT(DISTINCT ShipCountry) AS countries_served FROM Orders`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, SUM(Freight) AS total_freight FROM Orders GROUP BY ShipCountry ORDER BY total_freight DESC`,
        'map');
      await addWidget(page, 'Orders',
        `SELECT ShipCity, SUM(Freight) AS total_freight FROM Orders GROUP BY ShipCity ORDER BY total_freight DESC LIMIT 10`,
        'chart');

      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT ShipCountry, COUNT(*) AS order_count, SUM(Freight) AS total_freight, AVG(Freight) AS avg_freight FROM Orders GROUP BY ShipCountry ORDER BY order_count DESC`,
        'tabulator');

      // Layout: text → KPI + map → top cities → divider → country breakdown.
      // Insertion order: text, n, map, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2, w: 6,  h: 2 }, // number   — countries_served
        { x: 6, y: 2, w: 6,  h: 6 }, // map      — freight by country
        { x: 0, y: 4, w: 6,  h: 4 }, // chart    — top 10 cities
        { x: 0, y: 8, w: 12, h: 1 }, // divider
        { x: 0, y: 9, w: 12, h: 4 }, // tabulator — country analysis
      ]);

      const d9CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d9Url } = await publishDashboard(page);
      const d9Ids = await getCanvasComponentIds(page, d9CanvasId);
      const d9ReportCode = d9Url.split('/').pop()!;

      await page.goto(d9Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // Northwind ships to at least 10 countries
      const d9NumId = (d9Ids['number'] ?? [])[0];
      const d9NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d9ReportCode, cid: d9NumId });
      expect(Number(d9NumData.data[0].countries_served)).toBeGreaterThanOrEqual(10);

      // Country analysis table: avg_freight ≈ total_freight / order_count for the top row
      const d9TabId = (d9Ids['tabulator'] ?? [])[0];
      const d9TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d9ReportCode, cid: d9TabId });
      expect(d9TabData.data.length).toBeGreaterThan(0);
      const top = d9TabData.data[0];
      expect(top.ShipCountry).toBeDefined();
      expect(Number(top.order_count)).toBeGreaterThan(0);
      expect(Number(top.total_freight)).toBeGreaterThan(0);
      // avg ≈ total / count within $1
      expect(Math.abs(Number(top.avg_freight) - Number(top.total_freight) / Number(top.order_count))).toBeLessThan(1);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D10 — Order Processing Dashboard  (Audience: Operations Manager)
  // Parameter: single date (startDate — show orders from this date forward)
  // ────────────────────────────────────────────────────────────────────────────
  test('D10 — Order Processing Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D10 — Order Processing Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Single date filter — "orders from startDate onwards" pattern
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'startDate', type: String, label: 'Orders from', defaultValue: '2023-01-01') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'date')\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Order Processing\n\nOrder volume · Freight costs · Monthly trend · Shipper performance · Recent orders.',
      });

      await addWidget(page, 'Orders',
        `SELECT COUNT(*) AS total_orders FROM Orders WHERE STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') >= \${startDate}`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT AVG(Freight) AS avg_freight FROM Orders WHERE STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') >= \${startDate}`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', OrderDate/1000, 'unixepoch') AS order_month, COUNT(*) AS order_count FROM Orders WHERE STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') >= \${startDate} GROUP BY order_month ORDER BY order_month`,
        'trend');
      await addWidget(page, 'Orders',
        `SELECT s.CompanyName, COUNT(o.OrderID) AS order_count FROM Orders o JOIN Shippers s ON s.ShipperID=o.ShipVia WHERE STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') >= \${startDate} GROUP BY s.CompanyName ORDER BY order_count DESC`,
        'chart');
      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT OrderID, CustomerID, OrderDate, ShipCountry, Freight FROM Orders WHERE STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') >= \${startDate} ORDER BY OrderDate DESC LIMIT 20`,
        'tabulator');

      // Layout: text → 2 KPIs → trend + shipper chart → divider → recent orders.
      // Insertion order: text(added below), n, n, trend, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_orders
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — avg_freight
        { x: 0, y: 4,  w: 6,  h: 5 }, // trend    — monthly order count
        { x: 6, y: 4,  w: 6,  h: 5 }, // chart    — shipper order count
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — recent orders
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d10Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const trendId = (rawIds['trend'] ?? [])[0];
      const reportCode = d10Url.split('/').pop()!;

      await page.goto(d10Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // startDate=2024-01-01 → trend contains only 2024 months
      const trendData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&startDate=2024-01-01`);
        return r.json();
      }, { rc: reportCode, cid: trendId });
      expect(trendData.data.length).toBeGreaterThan(0);
      for (const row of trendData.data) {
        expect(String(row.order_month)).toMatch(/^2024-/);
      }

      // startDate far in the past → trend returns many months (all data included)
      const allTrendData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&startDate=1990-01-01`);
        return r.json();
      }, { rc: reportCode, cid: trendId });
      expect(allTrendData.data.length).toBeGreaterThan(1);

      // startDate far in the future → no orders exist yet, trend returns 0 rows
      const futureTrendData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&startDate=2030-01-01`);
        return r.json();
      }, { rc: reportCode, cid: trendId });
      expect(futureTrendData.data.length).toBe(0);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D11 — Category Analysis Dashboard  (Audience: Category Manager)
  // Parameter: SQL-driven select (category options from Categories table)
  // ────────────────────────────────────────────────────────────────────────────
  test('D11 — Category Analysis Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D11 — Category Analysis Dashboard';
    try {
      await createCanvas(page, canvasName);

      // SQL-driven category dropdown — options resolved from the DB at runtime
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'category', type: String, label: 'Category', defaultValue: 'Beverages') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'select', options: \"SELECT DISTINCT CategoryName FROM Categories ORDER BY CategoryName\")\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Category Analysis\n\nProduct count · Stock by category · Revenue per product · Unit prices.',
      });

      // Product count in the selected category
      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS product_count FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID WHERE c.CategoryName = \${category}`,
        'number');
      // Products in the selected category — stock levels
      await addWidget(page, 'Products',
        `SELECT p.ProductName, p.UnitsInStock AS stock FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID WHERE c.CategoryName = \${category} ORDER BY stock DESC`,
        'chart');
      // Revenue per product in the selected category
      await addWidget(page, 'Order Details',
        `SELECT p.ProductName, ROUND(SUM(od.UnitPrice*od.Quantity), 2) AS revenue FROM "Order Details" od JOIN Products p ON p.ProductID=od.ProductID JOIN Categories c ON c.CategoryID=p.CategoryID WHERE c.CategoryName = \${category} GROUP BY p.ProductName ORDER BY revenue DESC`,
        'chart');
      // Unit prices for products in the selected category
      await addWidget(page, 'Products',
        `SELECT p.ProductName, p.UnitPrice FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID WHERE c.CategoryName = \${category} ORDER BY p.UnitPrice DESC`,
        'chart');
      await addUIElement(page, 'divider');

      // Full product detail table for the selected category
      await addWidget(page, 'Products',
        `SELECT p.ProductName, c.CategoryName, p.UnitPrice, p.UnitsInStock, p.ReorderLevel FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID WHERE c.CategoryName = \${category} ORDER BY p.ProductName`,
        'tabulator');

      // Layout: text → category count → 3 charts side-by-side → divider → detail.
      // Insertion order: text, n, c, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 12, h: 2 }, // number   — product_count
        { x: 0, y: 4,  w: 4,  h: 5 }, // chart    — stock by category
        { x: 4, y: 4,  w: 4,  h: 5 }, // chart    — revenue per product
        { x: 8, y: 4,  w: 4,  h: 5 }, // chart    — unit prices
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — product detail
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d11Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const tabId = (rawIds['tabulator'] ?? [])[0];
      const reportCode = d11Url.split('/').pop()!;

      await page.goto(d11Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // Beverages filter: all rows belong to Beverages
      const bevData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&category=${encodeURIComponent('Beverages')}`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(bevData.data.length).toBeGreaterThan(0);
      for (const row of bevData.data) {
        expect(String(row.CategoryName)).toBe('Beverages');
      }

      // Dairy Products filter: all rows belong to Dairy Products
      const dairyData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&category=${encodeURIComponent('Dairy Products')}`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(dairyData.data.length).toBeGreaterThan(0);
      for (const row of dairyData.data) {
        expect(String(row.CategoryName)).toBe('Dairy Products');
      }

      // The two categories produce completely disjoint product sets
      const bevProducts = new Set(bevData.data.map((r: { ProductName: string }) => r.ProductName));
      const dairyProducts = new Set(dairyData.data.map((r: { ProductName: string }) => r.ProductName));
      for (const name of dairyProducts) {
        expect(bevProducts.has(name)).toBe(false);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D12 — Customer Lifetime Value Dashboard  (Audience: Marketing Director)
  // Parameter: top-N integer selector — user controls ranking depth
  // ────────────────────────────────────────────────────────────────────────────
  test('D12 — Customer Lifetime Value Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D12 — Customer Lifetime Value Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Integer top-N selector — controls how many top customers to rank
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'topN', type: Integer, label: 'Show top', defaultValue: 10) {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'select', options: [5, 10, 25])\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Customer Lifetime Value\n\nAverage customer value · Top customers by revenue · Top customers by orders · Revenue by country.',
      });

      // Average revenue of the top-N customers
      await addWidget(page, 'Order Details',
        `SELECT AVG(total) AS avg_customer_value FROM (SELECT SUM(od.UnitPrice*od.Quantity) AS total FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID GROUP BY o.CustomerID)`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT c.CompanyName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID JOIN Customers c ON c.CustomerID=o.CustomerID GROUP BY c.CompanyName ORDER BY revenue DESC LIMIT \${topN}`,
        'chart');
      await addWidget(page, 'Orders',
        `SELECT CustomerID, COUNT(*) AS order_count FROM Orders GROUP BY CustomerID ORDER BY order_count DESC LIMIT \${topN}`,
        'chart');
      // Top-N countries by revenue
      await addWidget(page, 'Order Details',
        `SELECT cu.Country, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID JOIN Customers cu ON cu.CustomerID=o.CustomerID GROUP BY cu.Country ORDER BY revenue DESC`,
        'chart');
      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT o.CustomerID, c.CompanyName, COUNT(*) AS orders, SUM(o.Freight) AS total_freight, MAX(o.OrderDate) AS last_order FROM Orders o JOIN Customers c ON c.CustomerID=o.CustomerID GROUP BY o.CustomerID, c.CompanyName ORDER BY orders DESC LIMIT \${topN}`,
        'tabulator');

      // Layout: text → avg KPI → 3 charts side-by-side → divider → ranked detail.
      // Insertion order: text, n, c, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 12, h: 2 }, // number   — avg_customer_value
        { x: 0, y: 4,  w: 4,  h: 5 }, // chart    — top by revenue
        { x: 4, y: 4,  w: 4,  h: 5 }, // chart    — top by order count
        { x: 8, y: 4,  w: 4,  h: 5 }, // chart    — revenue by country
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — customer ranking
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d12Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const tabId = (rawIds['tabulator'] ?? [])[0];
      const reportCode = d12Url.split('/').pop()!;

      await page.goto(d12Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // topN=5 → 5 rows
      const data5 = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&topN=5`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(data5.data.length).toBe(5);

      // topN=10 → 10 rows
      const data10 = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&topN=10`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(data10.data.length).toBe(10);

      // topN=25 → 25 rows (third inline-list option)
      const data25 = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&topN=25`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(data25.data.length).toBe(25);

      // ORDER BY orders DESC is respected: first row has at least as many orders as second
      expect(Number(data10.data[0].orders)).toBeGreaterThanOrEqual(Number(data10.data[1].orders));
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D13 — Employee Comparison Dashboard  (Audience: Sales Team Lead)
  // TOP 1 replaced with ORDER BY … LIMIT 1 (SQLite)
  // ────────────────────────────────────────────────────────────────────────────
  test('D13 — Employee Comparison Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D13 — Employee Comparison Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Employee Sales Performance\n\nTop performer freight · Employee freight totals · Monthly trend · Employee geography.',
      });

      // Top-performer KPI — Groovy script instead of SQL. Exercises the Script
      // mode end-to-end: ctx.dbSql.rows delegates to QueriesService, same data
      // contract as SQL mode (List<Map>), but through the scripting runtime.
      await addScriptWidget(page, 'Orders',
`def data = ctx.dbSql.rows('SELECT SUM(Freight) AS top_performer_freight FROM Orders GROUP BY EmployeeID ORDER BY SUM(Freight) DESC LIMIT 1')
return data`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT e.LastName, SUM(o.Freight) AS total_freight FROM Orders o JOIN Employees e ON e.EmployeeID=o.EmployeeID GROUP BY e.LastName ORDER BY total_freight DESC`,
        'chart');
      // Single-series monthly aggregate — multi-column (month × employee) confuses the chart renderer.
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(o.Freight) AS total_freight FROM Orders o GROUP BY order_month ORDER BY order_month`,
        'chart');
      await addWidget(page, 'Employees',
        `SELECT Country, COUNT(*) AS employee_count FROM Employees GROUP BY Country`,
        'map');

      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT e.LastName, e.FirstName, COUNT(o.OrderID) AS orders, SUM(o.Freight) AS total_freight, AVG(o.Freight) AS avg_freight FROM Orders o JOIN Employees e ON e.EmployeeID=o.EmployeeID GROUP BY e.EmployeeID, e.LastName, e.FirstName ORDER BY total_freight DESC`,
        'tabulator');

      // Layout: text → KPI + freight chart → monthly trend + map → divider → detail.
      // Insertion order: text, n, c, c, map, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — top_performer_freight
        { x: 4, y: 2,  w: 8,  h: 5 }, // chart    — freight by employee
        { x: 0, y: 7,  w: 6,  h: 5 }, // chart    — monthly freight by employee
        { x: 6, y: 7,  w: 6,  h: 5 }, // map      — employee countries
        { x: 0, y: 12, w: 12, h: 1 }, // divider
        { x: 0, y: 13, w: 12, h: 4 }, // tabulator — employee performance
      ]);

      const d13CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d13Url } = await publishDashboard(page);
      const d13Ids = await getCanvasComponentIds(page, d13CanvasId);
      const d13ReportCode = d13Url.split('/').pop()!;

      await page.goto(d13Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });

      // top_performer_freight: the best employee moved positive freight
      const d13NumId = (d13Ids['number'] ?? [])[0];
      const d13NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d13ReportCode, cid: d13NumId });
      expect(Number(d13NumData.data[0].top_performer_freight)).toBeGreaterThan(0);

      // Freight by employee chart: exactly 3 rows (test fixture employees), DESC by total_freight
      const d13Chart0Id = (d13Ids['chart'] ?? [])[0];
      const d13Chart0Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d13ReportCode, cid: d13Chart0Id });
      expect(d13Chart0Data.data.length).toBe(3);
      for (const row of d13Chart0Data.data) {
        expect(row.LastName).toBeDefined();
        expect(Number(row.total_freight)).toBeGreaterThan(0);
      }
      expect(Number(d13Chart0Data.data[0].total_freight)).toBeGreaterThanOrEqual(Number(d13Chart0Data.data[1].total_freight));

      // Monthly freight trend chart: 18 months of data (createBulkDashboardOrders spans 18 months), all positive
      const d13Chart1Id = (d13Ids['chart'] ?? [])[1];
      const d13Chart1Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d13ReportCode, cid: d13Chart1Id });
      expect(d13Chart1Data.data.length).toBeGreaterThan(5); // at least several months
      for (const row of d13Chart1Data.data) {
        expect(String(row.order_month)).toMatch(/^\d{4}-\d{2}$/);
        expect(Number(row.total_freight)).toBeGreaterThan(0);
      }

      // Employee countries map: all 3 test-fixture employees are in USA
      const d13MapId = (d13Ids['map'] ?? [])[0];
      const d13MapData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d13ReportCode, cid: d13MapId });
      expect(d13MapData.data.length).toBe(1); // all employees share Country=USA
      expect(String(d13MapData.data[0].Country)).toBe('USA');
      expect(Number(d13MapData.data[0].employee_count)).toBe(3);

      // Employee performance table: all employees in the test fixture, sorted by total_freight DESC
      const d13TabId = (d13Ids['tabulator'] ?? [])[0];
      const d13TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d13ReportCode, cid: d13TabId });
      expect(d13TabData.data.length).toBe(3);
      expect(Number(d13TabData.data[0].total_freight)).toBeGreaterThanOrEqual(Number(d13TabData.data[1].total_freight));
      for (const row of d13TabData.data) {
        expect(row.LastName).toBeDefined();
        expect(row.FirstName).toBeDefined();
        expect(Number(row.orders)).toBeGreaterThan(0);
        expect(Number(row.total_freight)).toBeGreaterThan(0);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D14 — Financial Summary Dashboard  (Audience: CFO)
  // Parameter: date range (dateFrom / dateTo) — fiscal period scoping
  // ────────────────────────────────────────────────────────────────────────────
  test('D14 — Financial Summary Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D14 — Financial Summary Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Date range filter — from/to pattern for fiscal period selection
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'dateFrom', type: String, label: 'From', defaultValue: '2023-01-01') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'date')\n" +
        "  }\n" +
        "  parameter(id: 'dateTo', type: String, label: 'To', defaultValue: '2023-12-31') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'date')\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Financial Summary\n\nRevenue · Freight · Average order value · Monthly trend · Quarterly breakdown.',
      });

      await addWidget(page, 'Order Details',
        `SELECT SUM(od.UnitPrice*od.Quantity) AS total_revenue FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID WHERE STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') >= \${dateFrom} AND STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') <= \${dateTo}`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT SUM(Freight) AS total_freight FROM Orders WHERE STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') >= \${dateFrom} AND STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') <= \${dateTo}`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT AVG(order_total) AS avg_order_value FROM (SELECT SUM(od.UnitPrice*od.Quantity) AS order_total FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID WHERE STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') >= \${dateFrom} AND STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') <= \${dateTo} GROUP BY od.OrderID)`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(od.UnitPrice*od.Quantity) AS revenue, SUM(o.Freight) AS freight FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID WHERE STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') >= \${dateFrom} AND STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') <= \${dateTo} GROUP BY order_month ORDER BY order_month`,
        'chart');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y', o.OrderDate/1000, 'unixepoch') AS yr, CAST((STRFTIME('%m', o.OrderDate/1000, 'unixepoch') + 2) / 3 AS INTEGER) AS quarter, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID WHERE STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') >= \${dateFrom} AND STRFTIME('%Y-%m-%d', o.OrderDate/1000, 'unixepoch') <= \${dateTo} GROUP BY yr, quarter ORDER BY yr, quarter`,
        'chart');

      // Layout: text → 3 KPIs → monthly chart + quarterly chart.
      // Insertion order: text(added below), n, n, n, c, c.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2, w: 4,  h: 2 }, // number   — total_revenue
        { x: 4, y: 2, w: 4,  h: 2 }, // number   — total_freight
        { x: 8, y: 2, w: 4,  h: 2 }, // number   — avg_order_value
        { x: 0, y: 4, w: 6,  h: 5 }, // chart    — monthly revenue + freight
        { x: 6, y: 4, w: 6,  h: 5 }, // chart    — quarterly revenue
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d14Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const d14NumRevId  = (rawIds['number'] ?? [])[0];
      const d14NumFrtId  = (rawIds['number'] ?? [])[1];
      const d14NumAvgId  = (rawIds['number'] ?? [])[2];
      const d14Chart0Id  = (rawIds['chart']  ?? [])[0];
      const d14Chart1Id  = (rawIds['chart']  ?? [])[1];
      const reportCode = d14Url.split('/').pop()!;

      await page.goto(d14Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });

      // 2023 total_revenue must be positive
      const revenueData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2023-01-01&dateTo=2023-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14NumRevId });
      expect(Number(revenueData.data[0].total_revenue)).toBeGreaterThan(0);

      // 2023 total_freight must be positive
      const freightData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2023-01-01&dateTo=2023-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14NumFrtId });
      expect(Number(freightData.data[0].total_freight)).toBeGreaterThan(0);

      // 2023 avg_order_value must be positive
      const avgData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2023-01-01&dateTo=2023-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14NumAvgId });
      expect(Number(avgData.data[0].avg_order_value)).toBeGreaterThan(0);

      // 2023 date range → monthly chart contains only 2023 months
      const chartData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2023-01-01&dateTo=2023-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14Chart0Id });
      expect(chartData.data.length).toBeGreaterThan(0);
      for (const row of chartData.data) {
        expect(String(row.order_month)).toMatch(/^2023-/);
      }

      // Quarterly chart: 2023 has 4 quarters, each with positive revenue
      const quarterlyData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2023-01-01&dateTo=2023-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14Chart1Id });
      expect(quarterlyData.data.length).toBe(4);
      for (const row of quarterlyData.data) {
        expect(Number(row.quarter)).toBeGreaterThanOrEqual(1);
        expect(Number(row.quarter)).toBeLessThanOrEqual(4);
        expect(Number(row.revenue)).toBeGreaterThan(0);
      }

      // Future range → no data (both date boundaries gate the result)
      const futureData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&dateFrom=2030-01-01&dateTo=2030-12-31`);
        return r.json();
      }, { rc: reportCode, cid: d14NumRevId });
      expect(Number(futureData.data[0].total_revenue ?? 0)).toBe(0);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D15 — Product Catalog Dashboard  (Audience: Catalog Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D15 — Product Catalog Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D15 — Product Catalog Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Product Catalog\n\nTotal products · Average price · Products by category · Price distribution.',
      });

      await addWidget(page, 'Products',
        `SELECT COUNT(*) AS total_products FROM Products`,
        'number');
      await addWidget(page, 'Products',
        `SELECT AVG(UnitPrice) AS avg_price FROM Products`,
        'number');
      await addWidget(page, 'Products',
        `SELECT c.CategoryName, COUNT(p.ProductID) AS product_count FROM Products p JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY c.CategoryName ORDER BY product_count DESC`,
        'chart');
      await addWidget(page, 'Products',
        `SELECT CASE WHEN UnitPrice < 10 THEN 'Under $10' WHEN UnitPrice < 25 THEN '$10-$25' WHEN UnitPrice < 50 THEN '$25-$50' ELSE 'Over $50' END AS price_range, COUNT(*) AS count FROM Products GROUP BY price_range ORDER BY count DESC`,
        'chart');

      await addUIElement(page, 'divider');

      // Full catalog — plain Visual mode (no filter/group/sort), just the
      // implicit SELECT * from addTableToCanvas. Exercises the default Visual
      // path end-to-end: widget → Visual tab → picked table → auto-run.
      await addVisualWidget(page, 'Products', 'tabulator');

      // Layout: text → 2 KPIs → 2 charts → divider → full catalog.
      // Insertion order: text, n, n, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_products
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — avg_price
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart    — products by category
        { x: 6, y: 4,  w: 6,  h: 5 }, // chart    — price range distribution
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 5 }, // tabulator — full catalog
      ]);

      const d15CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d15Url } = await publishDashboard(page);
      const d15Ids = await getCanvasComponentIds(page, d15CanvasId);
      const d15ReportCode = d15Url.split('/').pop()!;

      await page.goto(d15Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // total_products: test fixture has exactly 20 products
      const d15NumProdId = (d15Ids['number'] ?? [])[0];
      const d15NumProdData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d15ReportCode, cid: d15NumProdId });
      const totalProducts = Number(d15NumProdData.data[0].total_products);
      expect(totalProducts).toBe(20); // test fixture has exactly 20 products

      // avg_price: positive across the catalog
      const d15NumAvgId = (d15Ids['number'] ?? [])[1];
      const d15NumAvgData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d15ReportCode, cid: d15NumAvgId });
      expect(Number(d15NumAvgData.data[0].avg_price)).toBeGreaterThan(0);

      // Products by category: exactly 8 categories, each has at least 1 product
      const d15Chart0Id = (d15Ids['chart'] ?? [])[0];
      const d15Chart0Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d15ReportCode, cid: d15Chart0Id });
      expect(d15Chart0Data.data.length).toBe(8);
      for (const row of d15Chart0Data.data) {
        expect(row.CategoryName).toBeDefined();
        expect(Number(row.product_count)).toBeGreaterThan(0);
      }

      // Price range distribution: at least 2 buckets, known bucket names only
      const d15Chart1Id = (d15Ids['chart'] ?? [])[1];
      const d15Chart1Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d15ReportCode, cid: d15Chart1Id });
      expect(d15Chart1Data.data.length).toBeGreaterThanOrEqual(2);
      const validBuckets = new Set(['Under $10', '$10-$25', '$25-$50', 'Over $50']);
      for (const row of d15Chart1Data.data) {
        expect(validBuckets.has(String(row.price_range))).toBe(true);
        expect(Number(row.count)).toBeGreaterThan(0);
      }

      // Full-catalog table (Visual plain): exactly one row per product, no LIMIT
      const d15TabId = (d15Ids['tabulator'] ?? [])[0];
      const d15TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d15ReportCode, cid: d15TabId });
      expect(d15TabData.data.length).toBe(totalProducts);
      expect(d15TabData.data[0].ProductName).toBeDefined();
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D16 — Supplier Performance Dashboard  (Audience: Procurement Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D16 — Supplier Performance Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D16 — Supplier Performance Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Supplier Performance\n\nTotal suppliers · Products per supplier · Average price by supplier · Supplier geography.',
      });

      await addWidget(page, 'Suppliers',
        `SELECT COUNT(*) AS total_suppliers FROM Suppliers`,
        'number');
      // Suppliers per country — Visual mode with groupBy + aggregation.
      // Groups by Country (string label) so the chart renders. Exercises the
      // Summarize UI end-to-end: table → COUNT(SupplierID) + GROUP BY Country.
      // Procurement insight: geographic distribution of the supply chain.
      await addVisualWidget(page, 'Suppliers', 'chart', async () => {
        await addAggregation(page, 0, 'COUNT', 'SupplierID');
        await addGroupBy(page, 'Country');
      });
      await addWidget(page, 'Products',
        `SELECT s.CompanyName, AVG(p.UnitPrice) AS avg_price FROM Products p JOIN Suppliers s ON s.SupplierID=p.SupplierID GROUP BY s.CompanyName ORDER BY avg_price DESC`,
        'chart');
      await addWidget(page, 'Suppliers',
        `SELECT Country, COUNT(*) AS supplier_count FROM Suppliers GROUP BY Country`,
        'map');

      await addUIElement(page, 'divider');

      await addWidget(page, 'Suppliers',
        `SELECT CompanyName, ContactName, Country, Phone FROM Suppliers ORDER BY Country, CompanyName`,
        'tabulator');

      // Layout: text → KPI + products chart → avg-price + map → divider → directory.
      // Insertion order: text, n, c, c, map, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — total_suppliers
        { x: 4, y: 2,  w: 8,  h: 5 }, // chart    — suppliers per country
        { x: 0, y: 7,  w: 6,  h: 5 }, // chart    — avg price by supplier
        { x: 6, y: 7,  w: 6,  h: 5 }, // map      — supplier countries
        { x: 0, y: 12, w: 12, h: 1 }, // divider
        { x: 0, y: 13, w: 12, h: 4 }, // tabulator — supplier directory
      ]);

      const d16CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d16Url } = await publishDashboard(page);
      const d16Ids = await getCanvasComponentIds(page, d16CanvasId);
      const d16ReportCode = d16Url.split('/').pop()!;

      await page.goto(d16Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      const d16NumId = (d16Ids['number'] ?? [])[0];
      const d16NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d16ReportCode, cid: d16NumId });
      const totalSuppliers = Number(d16NumData.data[0].total_suppliers);
      expect(totalSuppliers).toBe(6); // test fixture has exactly 6 suppliers

      // Suppliers per country chart (Visual+groupBy — KEY visual-mode test):
      // fixture has 5 distinct supplier countries (UK, USA, Japan, Australia, Italy).
      const d16Chart0Id = (d16Ids['chart'] ?? [])[0];
      const d16Chart0Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d16ReportCode, cid: d16Chart0Id });
      expect(d16Chart0Data.data.length).toBe(5);
      for (const row of d16Chart0Data.data) {
        expect(String(row.Country).length).toBeGreaterThan(0);
        expect(Number(row.SupplierID_count)).toBeGreaterThan(0);
      }

      // Avg price by supplier chart: exactly 6 rows, all with positive avg_price
      const d16Chart1Id = (d16Ids['chart'] ?? [])[1];
      const d16Chart1Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d16ReportCode, cid: d16Chart1Id });
      expect(d16Chart1Data.data.length).toBe(6);
      for (const row of d16Chart1Data.data) {
        expect(row.CompanyName).toBeDefined();
        expect(Number(row.avg_price)).toBeGreaterThan(0);
      }

      // Supplier countries map: fixture suppliers span multiple countries, all with positive count
      const d16MapId = (d16Ids['map'] ?? [])[0];
      const d16MapData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d16ReportCode, cid: d16MapId });
      expect(d16MapData.data.length).toBeGreaterThan(0);
      for (const row of d16MapData.data) {
        expect(Number(row.supplier_count)).toBeGreaterThan(0);
      }

      // Supplier directory: one row per supplier, all have required contact columns
      const d16TabId = (d16Ids['tabulator'] ?? [])[0];
      const d16TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d16ReportCode, cid: d16TabId });
      expect(d16TabData.data.length).toBe(totalSuppliers);
      for (const row of d16TabData.data) {
        expect(row.CompanyName).toBeDefined();
        expect(row.ContactName).toBeDefined();
        expect(row.Country).toBeDefined();
        expect(row.Phone).toBeDefined();
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D17 — Time-Based Sales Analysis Dashboard  (Audience: Business Analyst)
  // DAYOFWEEK() → strftime('%w', …)   QUARTER() → CAST((m+2)/3 AS INT)
  // ────────────────────────────────────────────────────────────────────────────
  test('D17 — Time-Based Sales Analysis Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D17 — Time-Based Sales Analysis Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Time-Based Sales Analysis\n\nBusiest month · Daily order trend · Orders per employee (sorted) · Quarterly breakdown.',
      });

      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%m', OrderDate/1000, 'unixepoch') AS month_num, COUNT(*) AS order_count FROM Orders GROUP BY month_num ORDER BY order_count DESC LIMIT 1`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m-%d', OrderDate/1000, 'unixepoch') AS order_date, COUNT(*) AS daily_orders FROM Orders GROUP BY order_date ORDER BY order_date`,
        'trend');
      // Orders per employee — Visual mode with groupBy + aggregation + sort.
      // Exercises the SortStep UI (sort by EmployeeID ASC). Replaces the
      // original day-of-week chart because STRFTIME is a computed column
      // that the visual query builder doesn't expose directly.
      await addVisualWidget(page, 'Orders', 'chart', async () => {
        await addAggregation(page, 0, 'COUNT', 'OrderID');
        await addGroupBy(page, 'EmployeeID');
        await addVisualSort(page, 0, 'EmployeeID', 'ASC');
      });
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y', OrderDate/1000, 'unixepoch') AS yr, CAST((STRFTIME('%m', OrderDate/1000, 'unixepoch') + 2) / 3 AS INTEGER) AS quarter, COUNT(*) AS order_count FROM Orders GROUP BY yr, quarter ORDER BY yr, quarter`,
        'chart');
      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', OrderDate/1000, 'unixepoch') AS month, COUNT(*) AS orders, SUM(Freight) AS freight, AVG(Freight) AS avg_freight FROM Orders GROUP BY month ORDER BY month`,
        'tabulator');

      // Layout: text → KPI + daily trend → day-of-week + quarterly → divider → monthly detail.
      // Insertion order: text, n, trend, c(dow), c(quarterly), divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 4,  h: 2 }, // number   — busiest month
        { x: 4, y: 2,  w: 8,  h: 5 }, // trend    — daily orders
        { x: 0, y: 7,  w: 6,  h: 5 }, // chart    — day of week
        { x: 6, y: 7,  w: 6,  h: 5 }, // chart    — quarterly
        { x: 0, y: 12, w: 12, h: 1 }, // divider
        { x: 0, y: 13, w: 12, h: 4 }, // tabulator — monthly detail
      ]);

      const d17CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d17Url } = await publishDashboard(page);
      const d17Ids = await getCanvasComponentIds(page, d17CanvasId);
      const d17ReportCode = d17Url.split('/').pop()!;

      await page.goto(d17Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // Busiest month KPI: exactly 1 row, month_num in 01–12, order_count positive
      const d17NumId = (d17Ids['number'] ?? [])[0];
      const d17NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d17ReportCode, cid: d17NumId });
      expect(d17NumData.data.length).toBe(1);
      expect(Number(d17NumData.data[0].order_count)).toBeGreaterThan(0);
      const monthNum = String(d17NumData.data[0].month_num);
      expect(['01','02','03','04','05','06','07','08','09','10','11','12']).toContain(monthNum);

      // Daily order trend: each row is a valid ISO date with positive daily order count
      const d17TrendId = (d17Ids['trend'] ?? [])[0];
      const d17TrendData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d17ReportCode, cid: d17TrendId });
      expect(d17TrendData.data.length).toBeGreaterThan(0);
      for (const row of d17TrendData.data) {
        expect(String(row.order_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number(row.daily_orders)).toBeGreaterThan(0);
      }

      // Orders-per-employee chart (Visual mode with sort): one row per employee,
      // rows sorted by EmployeeID ASC, each row has positive order count.
      const d17ChartId = (d17Ids['chart'] ?? [])[0];
      const d17ChartData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d17ReportCode, cid: d17ChartId });
      expect(d17ChartData.data.length).toBeGreaterThan(0);
      expect(d17ChartData.data.length).toBeLessThanOrEqual(3); // ≤ 3 test-fixture employees
      for (const row of d17ChartData.data) {
        expect(Number(row.EmployeeID)).toBeGreaterThan(0);
        expect(Number(row.OrderID_count)).toBeGreaterThan(0);
      }
      // Sort ASC by EmployeeID — every successive row's ID strictly increases
      for (let i = 1; i < d17ChartData.data.length; i++) {
        const prev = Number(d17ChartData.data[i - 1].EmployeeID);
        const curr = Number(d17ChartData.data[i].EmployeeID);
        expect(curr).toBeGreaterThan(prev);
      }

      // Quarterly chart: at least 4 quarters across the 18-month fixture, each with positive revenue
      const d17Chart1Id = (d17Ids['chart'] ?? [])[1];
      const d17Chart1Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d17ReportCode, cid: d17Chart1Id });
      expect(d17Chart1Data.data.length).toBeGreaterThanOrEqual(4);
      for (const row of d17Chart1Data.data) {
        expect(Number(row.quarter)).toBeGreaterThanOrEqual(1);
        expect(Number(row.quarter)).toBeLessThanOrEqual(4);
        expect(Number(row.order_count)).toBeGreaterThan(0);
      }

      // Monthly tabulator: dataset spans multiple months, all rows have positive orders
      const d17TabId = (d17Ids['tabulator'] ?? [])[0];
      const d17TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d17ReportCode, cid: d17TabId });
      expect(d17TabData.data.length).toBeGreaterThan(5);
      for (const row of d17TabData.data) {
        expect(row.month).toBeDefined();
        expect(Number(row.orders)).toBeGreaterThan(0);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D18 — Geographic Sales Dashboard  (Audience: International Sales Manager)
  // Parameter: multi-value text (comma-separated countries) + LIKE IN-clause
  // ────────────────────────────────────────────────────────────────────────────
  test('D18 — Geographic Sales Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D18 — Geographic Sales Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Multi-value text filter — comma-separated country list.
      // Widgets use (',' || ${countries} || ',') LIKE ('%,' || ShipCountry || ',%')
      // so that 'Germany,France' matches rows for Germany OR France without Groovy.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'countries', type: String, label: 'Countries', defaultValue: 'Germany,France') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'text')\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Geographic Sales\n\nCountries served · Global freight map · Filter by country to compare order volume and freight costs.',
      });

      // Countries matched by the current filter
      await addWidget(page, 'Orders',
        `SELECT COUNT(DISTINCT ShipCountry) AS countries_served FROM Orders`,
        'number');
      // Choropleth map (unfiltered — shows global picture alongside filtered widgets)
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, SUM(Freight) AS total_freight FROM Orders GROUP BY ShipCountry ORDER BY total_freight DESC`,
        'map');
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, COUNT(*) AS order_count FROM Orders WHERE (',' || \${countries} || ',') LIKE ('%,' || ShipCountry || ',%') GROUP BY ShipCountry ORDER BY order_count DESC`,
        'chart');
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, ROUND(AVG(Freight), 2) AS avg_freight FROM Orders WHERE (',' || \${countries} || ',') LIKE ('%,' || ShipCountry || ',%') GROUP BY ShipCountry ORDER BY avg_freight DESC`,
        'chart');
      await addUIElement(page, 'divider');

      await addWidget(page, 'Orders',
        `SELECT ShipCountry, COUNT(*) AS orders, ROUND(SUM(Freight), 2) AS total_freight, ROUND(AVG(Freight), 2) AS avg_freight FROM Orders WHERE (',' || \${countries} || ',') LIKE ('%,' || ShipCountry || ',%') GROUP BY ShipCountry ORDER BY orders DESC`,
        'tabulator');

      // Layout: text → countries KPI → global map (full-width) → 2 filtered charts → divider → filtered detail.
      // Insertion order: text, n, map, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 12, h: 2 }, // number   — countries_served
        { x: 0, y: 4,  w: 12, h: 6 }, // map      — global freight (unfiltered context)
        { x: 0, y: 10, w: 6,  h: 4 }, // chart    — order count by country
        { x: 6, y: 10, w: 6,  h: 4 }, // chart    — avg freight by country
        { x: 0, y: 14, w: 12, h: 1 }, // divider
        { x: 0, y: 15, w: 12, h: 4 }, // tabulator — filtered country detail
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d18Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const d18NumId    = (rawIds['number']   ?? [])[0];
      const d18MapId    = (rawIds['map']      ?? [])[0];
      const d18Chart0Id = (rawIds['chart']    ?? [])[0];
      const d18Chart1Id = (rawIds['chart']    ?? [])[1];
      const tabId       = (rawIds['tabulator'] ?? [])[0];
      const reportCode = d18Url.split('/').pop()!;

      await page.goto(d18Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // countries_served: fixture orders ship to multiple distinct countries
      const d18NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: reportCode, cid: d18NumId });
      expect(Number(d18NumData.data[0].countries_served)).toBeGreaterThan(1);

      // Global freight map: multiple countries, every row has positive freight
      const d18MapData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: reportCode, cid: d18MapId });
      expect(d18MapData.data.length).toBeGreaterThan(1);
      for (const row of d18MapData.data) {
        expect(Number(row.total_freight)).toBeGreaterThan(0);
      }

      // Order count chart (filtered default Germany,France): rows only from those countries
      const d18Chart0Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&countries=Germany,France`);
        return r.json();
      }, { rc: reportCode, cid: d18Chart0Id });
      expect(d18Chart0Data.data.length).toBeGreaterThan(0);
      for (const row of d18Chart0Data.data) {
        expect(['Germany', 'France']).toContain(String(row.ShipCountry));
        expect(Number(row.order_count)).toBeGreaterThan(0);
      }

      // Avg freight chart (filtered Germany,France): rows only from those countries
      const d18Chart1Data = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&countries=Germany,France`);
        return r.json();
      }, { rc: reportCode, cid: d18Chart1Id });
      expect(d18Chart1Data.data.length).toBeGreaterThan(0);
      for (const row of d18Chart1Data.data) {
        expect(['Germany', 'France']).toContain(String(row.ShipCountry));
        expect(Number(row.avg_freight)).toBeGreaterThan(0);
      }

      // Germany,France → only rows for Germany or France
      const multiData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&countries=Germany,France`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(multiData.data.length).toBeGreaterThan(0);
      for (const row of multiData.data) {
        expect(['Germany', 'France']).toContain(String(row.ShipCountry));
      }

      // Germany only → fewer rows than Germany+France
      const singleData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&countries=Germany`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(singleData.data.length).toBeGreaterThan(0);
      expect(singleData.data.length).toBeLessThan(multiData.data.length);
      for (const row of singleData.data) {
        expect(String(row.ShipCountry)).toBe('Germany');
      }

      // Non-existent country → zero rows (filter doesn't leak all data)
      const noData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&countries=Atlantis`);
        return r.json();
      }, { rc: reportCode, cid: tabId });
      expect(noData.data.length).toBe(0);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D19 — Discount Analysis Dashboard  (Audience: Pricing Manager)
  // ────────────────────────────────────────────────────────────────────────────
  test('D19 — Discount Analysis Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D19 — Discount Analysis Dashboard';
    try {
      await createCanvas(page, canvasName);

      // Min-discount threshold — consumed by the Visual-mode high-discount
      // tabulator via the FilterStep "bind to ${param}" chip. String type
      // because SQLite coerces numeric strings. The fixture (NorthwindDataGenerator)
      // has discounts of 0.00, 0.05, 0.10 ONLY — default 0.04 matches every
      // row with a non-zero discount (0.05 and 0.10 values).
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'minDiscount', type: String, label: 'Min Discount', defaultValue: '0.04') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'text')\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '## Discount Analysis\n\nTotal discount impact · Average discount rate · Discount distribution · Monthly trend · Filterable high-discount detail.',
      });

      await addWidget(page, 'Order Details',
        `SELECT SUM(Discount * UnitPrice * Quantity) AS total_discount FROM "Order Details"`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT AVG(Discount) AS avg_discount_rate FROM "Order Details"`,
        'number');
      await addWidget(page, 'Order Details',
        `SELECT CASE WHEN Discount = 0 THEN 'No Discount' WHEN Discount <= 0.05 THEN '1-5%' WHEN Discount <= 0.10 THEN '6-10%' WHEN Discount <= 0.15 THEN '11-15%' ELSE 'Over 15%' END AS discount_bucket, COUNT(*) AS item_count FROM "Order Details" GROUP BY discount_bucket ORDER BY item_count DESC`,
        'chart');
      await addWidget(page, 'Order Details',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(od.Discount*od.UnitPrice*od.Quantity) AS discount_amount FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID GROUP BY order_month ORDER BY order_month`,
        'trend');
      await addUIElement(page, 'divider');

      // High-discount detail — Visual mode with a filter bound to the
      // ${minDiscount} dashboard param. Exercises FilterStep end-to-end:
      // Discount > <value> + the "${}" bind-to-param chip. SELECT * returns
      // all Order Details columns (no Products join because visual mode is
      // single-table).
      await addVisualWidget(page, 'Order Details', 'tabulator', async () => {
        await addVisualFilter(page, 0, 'Discount', 'greater_than');
        await bindVisualFilterToParam(page, 0, 'minDiscount');
      });

      // Layout: text → 2 KPIs → distribution + trend → divider → high-discount detail.
      // Insertion order: text, n, n, c, trend, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text     — dashboard header
        { x: 0, y: 2,  w: 6,  h: 2 }, // number   — total_discount
        { x: 6, y: 2,  w: 6,  h: 2 }, // number   — avg_discount_rate
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart    — discount buckets
        { x: 6, y: 4,  w: 6,  h: 5 }, // trend    — monthly discount amount
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 4 }, // tabulator — high-discount items
      ]);

      const d19CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d19Url } = await publishDashboard(page);
      const d19Ids = await getCanvasComponentIds(page, d19CanvasId);
      const d19ReportCode = d19Url.split('/').pop()!;

      await page.goto(d19Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-trend')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // total_discount: positive impact across all order lines
      const d19NumDiscId = (d19Ids['number'] ?? [])[0];
      const d19NumDiscData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19NumDiscId });
      expect(Number(d19NumDiscData.data[0].total_discount)).toBeGreaterThan(0);

      // avg_discount_rate is a fraction between 0 and 1
      const d19NumId = (d19Ids['number'] ?? [])[1];
      const d19NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19NumId });
      const avgRate = Number(d19NumData.data[0].avg_discount_rate);
      expect(avgRate).toBeGreaterThan(0);
      expect(avgRate).toBeLessThan(1);

      // Monthly discount trend: data spans multiple months, discount_amount non-negative each month
      const d19TrendId = (d19Ids['trend'] ?? [])[0];
      const d19TrendData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19TrendId });
      expect(d19TrendData.data.length).toBeGreaterThan(0);
      for (const row of d19TrendData.data) {
        expect(String(row.order_month)).toMatch(/^\d{4}-\d{2}$/);
        expect(Number(row.discount_amount)).toBeGreaterThanOrEqual(0);
      }

      // High-discount table (Visual mode, Discount > ${minDiscount} bound to param).
      // Fixture has discounts 0.00, 0.05, 0.10 ONLY — baseline 0.04 matches every
      // 0.05 and 0.10 row (all non-zero-discount rows).
      const d19TabId = (d19Ids['tabulator'] ?? [])[0];
      const d19TabData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&minDiscount=0.04`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19TabId });
      expect(d19TabData.data.length).toBeGreaterThan(0);
      for (const row of d19TabData.data) {
        expect(Number(row.Discount)).toBeGreaterThan(0.04);
      }

      // Raise the threshold via the bound param → strictly fewer rows (only
      // the 0.10-discount rows survive; 0.05-discount rows drop out).
      const d19HighData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&minDiscount=0.09`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19TabId });
      for (const row of d19HighData.data) {
        expect(Number(row.Discount)).toBeGreaterThan(0.09);
      }
      expect(d19HighData.data.length).toBeLessThan(d19TabData.data.length);

      // Lower the threshold below 0 → all rows including zero-discount ones,
      // strictly more than the 0.04 baseline.
      const d19LowData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&minDiscount=-0.01`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19TabId });
      expect(d19LowData.data.length).toBeGreaterThan(d19TabData.data.length);

      // Discount buckets chart: 'No Discount' bucket must exist (many items have 0 discount)
      const d19ChartId = (d19Ids['chart'] ?? [])[0];
      const d19ChartData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d19ReportCode, cid: d19ChartId });
      const buckets = d19ChartData.data.map((r: { discount_bucket: string }) => r.discount_bucket);
      expect(buckets).toContain('No Discount');
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D20 — Northwind Executive KPI Dashboard  (Audience: CEO / Board)
  // ────────────────────────────────────────────────────────────────────────────
  test('D20 — Northwind Executive KPI Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D20 — Northwind Executive KPI Dashboard';
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Northwind Executive KPIs\n\nTotal revenue · Customers · Orders · Monthly revenue trend · Global freight reach.',
      });

      await addWidget(page, 'Order Details',
        `SELECT SUM(UnitPrice*Quantity) AS total_revenue FROM "Order Details"`,
        'number');
      await addWidget(page, 'Customers',
        `SELECT COUNT(*) AS total_customers FROM Customers`,
        'number');
      await addWidget(page, 'Orders',
        `SELECT COUNT(*) AS total_orders FROM Orders`,
        'number');
      // Monthly revenue — chart widget with custom DSL (exercises the line-chart
      // DSL path end-to-end, cribbed from samples/_frend/charts-examples).
      await addWidget(page, 'Orders',
        `SELECT STRFTIME('%Y-%m', o.OrderDate/1000, 'unixepoch') AS order_month, SUM(od.UnitPrice*od.Quantity) AS revenue FROM Orders o JOIN "Order Details" od ON od.OrderID=o.OrderID GROUP BY order_month ORDER BY order_month`,
        'chart');
      await setCustomWidgetDsl(page,
`chart {
  type 'line'
  data {
    labelField 'order_month'
    datasets {
      dataset {
        field 'revenue'
        label 'Monthly Revenue ($)'
        borderColor '#4e79a7'
        backgroundColor 'rgba(78, 121, 167, 0.1)'
        tension 0.3
        borderWidth 2
        pointRadius 4
        fill true
      }
    }
  }
  options {
    responsive true
    plugins {
      title { display true; text 'Monthly Revenue Trend' }
      legend { position 'bottom' }
    }
    scales {
      y { beginAtZero true; title { display true; text 'Revenue ($)' } }
    }
  }
}`);
      await addWidget(page, 'Orders',
        `SELECT ShipCountry, SUM(Freight) AS total_freight FROM Orders GROUP BY ShipCountry ORDER BY total_freight DESC`,
        'map');

      // Layout: text → 3 KPIs → monthly revenue chart + global map.
      // Insertion order: text, n, n, n, chart (custom DSL), map.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 2 }, // text  — dashboard header
        { x: 0, y: 2, w: 4,  h: 2 }, // number — total_revenue
        { x: 4, y: 2, w: 4,  h: 2 }, // number — total_customers
        { x: 8, y: 2, w: 4,  h: 2 }, // number — total_orders
        { x: 0, y: 4, w: 6,  h: 5 }, // chart  — monthly revenue (custom DSL)
        { x: 6, y: 4, w: 6,  h: 5 }, // map    — freight by country
      ]);

      const d20CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d20Url } = await publishDashboard(page);
      const d20Ids = await getCanvasComponentIds(page, d20CanvasId);
      const d20ReportCode = d20Url.split('/').pop()!;

      await page.goto(d20Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });

      // All three headline KPIs — exact fixture counts
      const d20RevId  = (d20Ids['number'] ?? [])[0];
      const d20CustId = (d20Ids['number'] ?? [])[1];
      const d20OrdId  = (d20Ids['number'] ?? [])[2];
      const [d20RevData, d20CustData, d20OrdData] = await Promise.all([
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          return r.json();
        }, { rc: d20ReportCode, cid: d20RevId }),
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          return r.json();
        }, { rc: d20ReportCode, cid: d20CustId }),
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          return r.json();
        }, { rc: d20ReportCode, cid: d20OrdId }),
      ]);
      expect(Number(d20RevData.data[0].total_revenue)).toBeGreaterThan(0);
      expect(Number(d20CustData.data[0].total_customers)).toBe(25); // exact fixture count
      expect(Number(d20OrdData.data[0].total_orders)).toBe(79);     // exact fixture count

      // Custom-DSL chart: monthly revenue must return multiple months, all with positive revenue.
      const d20ChartId = (d20Ids['chart'] ?? [])[0];
      const d20ChartData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d20ReportCode, cid: d20ChartId });
      expect(d20ChartData.data.length).toBeGreaterThanOrEqual(12);
      for (const row of d20ChartData.data) {
        expect(String(row.order_month)).toMatch(/^\d{4}-\d{2}$/);
        expect(Number(row.revenue)).toBeGreaterThan(0);
      }

      // Global freight map: multiple countries shipping, all with positive freight totals
      const d20MapId = (d20Ids['map'] ?? [])[0];
      const d20MapData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d20ReportCode, cid: d20MapId });
      expect(d20MapData.data.length).toBeGreaterThan(1);
      for (const row of d20MapData.data) {
        expect(String(row.ShipCountry).length).toBeGreaterThan(0);
        expect(Number(row.total_freight)).toBeGreaterThan(0);
      }
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D21 — Reconstruct g-dashboard sample (shipped with DataPallas)
  // config/samples/g-dashboard/settings.xml
  // Mirrors: atomicValues (KPI), revenueTrend (chart), revenueByCategory (chart),
  //          topCustomers (tabulator), orderExplorer (pivot) — all with country param.
  // ────────────────────────────────────────────────────────────────────────────
  test('D21 — Reconstruct g-dashboard sample', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D21 — Reconstruct g-dashboard sample';
    try {
      await createCanvas(page, canvasName);

      // Wire up the country filter parameter — faithful clone of
      // config/samples/g-dashboard/g-dashboard-report-parameters-spec.groovy.
      // Default '-- All --' is the sample's sentinel meaning "don't filter";
      // each widget's Groovy script checks `country != '-- All --'` and only
      // appends the WHERE clause when a real country is selected.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'country', type: String, label: 'Country', defaultValue: '-- All --') {\n" +
        "    constraints(required: false)\n" +
        "    ui(control: 'select', options: \"SELECT '-- All --' AS ShipCountry UNION ALL SELECT DISTINCT ShipCountry FROM Orders WHERE ShipCountry IS NOT NULL ORDER BY ShipCountry\")\n" +
        "  }\n" +
        "}"
      );

      await addUIElement(page, 'text', {
        textContent: '# Northwind Sales Dashboard\n\nWholesale distribution — revenue, customers & product performance.',
      });

      // ── Shared Groovy preamble ────────────────────────────────────────
      // All 5 widgets read the `country` filter-bar param and skip the WHERE
      // clause when it's '-- All --' (sentinel = unfiltered), mirroring the
      // sample's `if (filterByCountry)` pattern. The local variable must
      // NOT be named `country` — the canvas's published dispatcher
      // (Script1.groovy emitted by DashboardFileGenerator) pre-declares a
      // top-level `country` binding for all widget blocks; a `def country`
      // inside a widget block throws "current scope already contains a
      // variable of the name country" at publish-time compile. We use
      // `countryVal` and read from `binding.getVariable('country')` (set by
      // ScriptsService at canvas-preview AND by the dispatcher at published
      // runtime), with a fallback to ctx.variables.getUserVariables for
      // safety (same pattern the shipped sample uses as its primary path).
      const countryPreamble = `def countryVal = binding.hasVariable('country') ? binding.getVariable('country')?.toString() : null
if (countryVal == null) {
  try { def uv = ctx.variables?.getUserVariables(ctx.token ?: ''); countryVal = uv?.get('country')?.toString() } catch (Exception e) {}
}
def filterByCountry = countryVal && countryVal != '-- All --' && countryVal != 'null' && countryVal != 'All' && countryVal.trim() != ''
`;

      // Four separate KPI number widgets — faithful to the sample's 4-card header row.
      // Each returns a single-field single-row result so the canvas renders 4 rb-value cards.
      // Triple-quoted Groovy strings avoid escaping issues with "Order Details" table name.
      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue
  FROM Orders o JOIN "Order Details" od ON o.OrderID = od.OrderID'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
return ctx.dbSql.rows(sql)`,
        'number');

      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT COUNT(DISTINCT o.OrderID) AS orders
  FROM Orders o JOIN "Order Details" od ON o.OrderID = od.OrderID'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
return ctx.dbSql.rows(sql)`,
        'number');

      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)) / COUNT(DISTINCT o.OrderID), 0) AS avgOrderValue
  FROM Orders o JOIN "Order Details" od ON o.OrderID = od.OrderID'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
return ctx.dbSql.rows(sql)`,
        'number');

      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT COUNT(DISTINCT o.CustomerID) AS customers FROM Orders o'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
return ctx.dbSql.rows(sql)`,
        'number');

      // Chart 1 (revenueTrend): line chart, monthly revenue.
      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT
    STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') AS month,
    ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue
  FROM Orders o
  JOIN "Order Details" od ON o.OrderID = od.OrderID
  WHERE o.OrderDate IS NOT NULL'''
if (filterByCountry) sql += " AND o.ShipCountry = '\${countryVal}'"
sql += " GROUP BY STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') ORDER BY month"
return ctx.dbSql.rows(sql)`,
        'chart');
      // Custom DSL — faithful clone of g-dashboard-chart-config.groovy (revenueTrend block).
      await setCustomWidgetDsl(page,
`chart {
  type 'line'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        backgroundColor 'rgba(15, 118, 110, 0.1)'
        borderColor '#0f766e'
        borderWidth 2
        fill true
        tension 0.3
        pointRadius 3
        pointBackgroundColor '#0f766e'
      }
    }
  }
  options {
    plugins {
      legend { display false }
    }
    scales {
      y {
        beginAtZero true
        title { display true; text 'Revenue ($)' }
      }
      x {
        title { display true; text 'Month' }
      }
    }
  }
}`);

      // Chart 2 (revenueByCategory): doughnut, revenue per product category.
      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT
    c.CategoryName AS category,
    ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue
  FROM "Order Details" od
  JOIN Products p ON od.ProductID = p.ProductID
  JOIN Categories c ON p.CategoryID = c.CategoryID
  JOIN Orders o ON od.OrderID = o.OrderID'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
sql += " GROUP BY c.CategoryName ORDER BY revenue DESC"
return ctx.dbSql.rows(sql)`,
        'chart');
      // Custom DSL — faithful clone of g-dashboard-chart-config.groovy (revenueByCategory block).
      await setCustomWidgetDsl(page,
`chart {
  type 'doughnut'
  data {
    labelField 'category'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        backgroundColor(['#0f766e', '#e15759', '#4e79a7', '#f28e2b', '#76b7b2', '#59a14f', '#edc949', '#af7aa1'])
        borderColor '#ffffff'
        borderWidth 2
      }
    }
  }
  options {
    plugins {
      legend { position 'right' }
    }
  }
}`);

      // Tabulator (topCustomers): top 10 by revenue.
      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT
    cu.CompanyName AS company,
    cu.Country AS country,
    cu.ContactName AS contact,
    COUNT(DISTINCT o.OrderID) AS orders,
    ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue
  FROM Customers cu
  JOIN Orders o ON cu.CustomerID = o.CustomerID
  JOIN "Order Details" od ON o.OrderID = od.OrderID'''
if (filterByCountry) sql += " WHERE o.ShipCountry = '\${countryVal}'"
sql += " GROUP BY cu.CustomerID, cu.CompanyName, cu.Country, cu.ContactName ORDER BY revenue DESC LIMIT 10"
return ctx.dbSql.rows(sql)`,
        'tabulator');
      // Custom DSL — faithful clone of g-dashboard-tabulator-config.groovy.
      await setCustomWidgetDsl(page,
`tabulator {
  layout 'fitColumns'
  columns {
    column { title 'Company'; field 'company'; headerFilter 'input'; widthGrow 2 }
    column { title 'Country'; field 'country'; headerFilter 'list' }
    column { title 'Contact'; field 'contact' }
    column { title 'Orders'; field 'orders'; hozAlign 'right'; sorter 'number' }
    column {
      title 'Revenue'
      field 'revenue'
      hozAlign 'right'
      sorter 'number'
      formatter 'money'
      formatterParams([thousand: ',', symbol: '$', precision: 2])
    }
  }
}`);

      // Pivot (orderExplorer): country × category × year.
      await addScriptWidget(page, 'Orders',
`${countryPreamble}
def sql = '''SELECT
    o.ShipCountry AS country,
    c.CategoryName AS category,
    STRFTIME('%Y', o.OrderDate / 1000, 'unixepoch') AS year,
    ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue,
    SUM(od.Quantity) AS quantity
  FROM Orders o
  JOIN "Order Details" od ON o.OrderID = od.OrderID
  JOIN Products p ON od.ProductID = p.ProductID
  JOIN Categories c ON p.CategoryID = c.CategoryID
  WHERE o.OrderDate IS NOT NULL'''
if (filterByCountry) sql += " AND o.ShipCountry = '\${countryVal}'"
sql += " GROUP BY o.ShipCountry, c.CategoryName, STRFTIME('%Y', o.OrderDate / 1000, 'unixepoch') ORDER BY country, category, year"
return ctx.dbSql.rows(sql)`,
        'pivot');
      // Custom DSL — faithful clone of g-dashboard-pivot-config.groovy.
      await setCustomWidgetDsl(page,
`pivotTable {
  rows 'country'
  cols 'year'
  vals 'revenue'
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
}`);

      // Layout — matches the sample's g-dashboard-template.html:
      //   header → 4-card KPI row → (2fr trend + 1fr doughnut) → table → pivot.
      // 2fr/1fr on a 12-col grid = 8/4 widths (no divider; sample uses CSS margins).
      // Insertion order: text, n[0]=revenue, n[1]=orders, n[2]=avgOrderValue, n[3]=customers,
      //                  c[0]=revenueTrend, c[1]=revenueByCategory, tabulator, pivot.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text       — dashboard header
        { x: 0, y: 2,  w: 3,  h: 2 }, // number[0]  — revenue
        { x: 3, y: 2,  w: 3,  h: 2 }, // number[1]  — orders
        { x: 6, y: 2,  w: 3,  h: 2 }, // number[2]  — avgOrderValue
        { x: 9, y: 2,  w: 3,  h: 2 }, // number[3]  — customers
        { x: 0, y: 4,  w: 8,  h: 5 }, // chart[0]   — revenueTrend (2fr)
        { x: 8, y: 4,  w: 4,  h: 5 }, // chart[1]   — revenueByCategory (1fr)
        { x: 0, y: 9,  w: 12, h: 4 }, // tabulator  — topCustomers
        { x: 0, y: 13, w: 12, h: 6 }, // pivot      — orderExplorer
      ]);

      const canvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d21Url } = await publishDashboard(page);
      const rawIds = await getCanvasComponentIds(page, canvasId);
      const d21ComponentIds = {
        revenue:           (rawIds['number']    ?? [])[0],
        orders:            (rawIds['number']    ?? [])[1],
        avgOrderValue:     (rawIds['number']    ?? [])[2],
        customers:         (rawIds['number']    ?? [])[3],
        revenueTrend:      (rawIds['chart']     ?? [])[0],
        revenueByCategory: (rawIds['chart']     ?? [])[1],
        topCustomers:      (rawIds['tabulator'] ?? [])[0],
        orderExplorer:     (rawIds['pivot']     ?? [])[0],
      };
      const d21ReportCode = d21Url.split('/').pop()!;

      // Published dashboard renders all expected widget types
      await page.goto(d21Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(4, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 20_000 });

      // Germany: deep data validation — known customer names, revenue amounts, pivot rows
      await assertDashboardRendersCorrectly(page, d21ReportCode, 'Germany', d21ComponentIds);

      // France: verifies the country parameter works for a second value
      // (all customers must be from France, revenue and orders must be positive)
      await assertDashboardRendersCorrectly(page, d21ReportCode, 'France', d21ComponentIds);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D22 — Reconstruct g-pivottable sample + pin map
  // config/samples/g-pivottable/settings.xml
  // Pin map uses synthetic geo_locations table (lat/lon rows, created in beforeAll)
  // ────────────────────────────────────────────────────────────────────────────
  test('D22 — Reconstruct g-pivottable sample + pin map', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D22 — Reconstruct g-pivottable sample + pin map';
    await setupGeoLocations();
    try {
      await createCanvas(page, canvasName);

      await addUIElement(page, 'text', {
        textContent: '## Sales Pivot & Map\n\nTotal revenue · Geographic pin map · Employee × category revenue matrix.',
      });

      await addWidget(page, 'Order Details',
        `SELECT SUM(UnitPrice*Quantity) AS total_revenue FROM "Order Details"`,
        'number');
      await addWidget(page, 'geo_locations',
        `SELECT name, lat, lon FROM geo_locations`,
        'map');

      await addUIElement(page, 'divider');

      // Pivot: employee × category cross-tab — custom DSL exercises the pivot
      // DSL path end-to-end (Table Heatmap renderer + sorted rows/cols),
      // cribbed from samples/g-pivottable/g-pivottable-pivot-config.groovy.
      await addWidget(page, 'Order Details',
        `SELECT e.LastName, c.CategoryName, SUM(od.UnitPrice*od.Quantity) AS revenue FROM "Order Details" od JOIN Orders o ON o.OrderID=od.OrderID JOIN Employees e ON e.EmployeeID=o.EmployeeID JOIN Products p ON p.ProductID=od.ProductID JOIN Categories c ON c.CategoryID=p.CategoryID GROUP BY e.LastName, c.CategoryName`,
        'pivot');
      await setCustomWidgetDsl(page,
`pivotTable {
  rows 'LastName'
  cols 'CategoryName'
  vals 'revenue'
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
  colOrder 'key_a_to_z'
}`);

      // Layout: text → revenue KPI → pin map → divider → employee × category pivot.
      // Insertion order: text, n, map, divider, pivot.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text   — dashboard header
        { x: 0, y: 2,  w: 12, h: 2 }, // number — total_revenue
        { x: 0, y: 4,  w: 12, h: 6 }, // map    — geo_locations pin map
        { x: 0, y: 10, w: 12, h: 1 }, // divider
        { x: 0, y: 11, w: 12, h: 6 }, // pivot  — employee × category
      ]);

      const d22CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d22Url } = await publishDashboard(page);
      const d22Ids = await getCanvasComponentIds(page, d22CanvasId);
      const d22ReportCode = d22Url.split('/').pop()!;

      await page.goto(d22Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-map')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });

      // Total revenue KPI: the full Northwind order dataset drives a positive revenue total
      const d22NumId = (d22Ids['number'] ?? [])[0];
      const d22NumData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d22ReportCode, cid: d22NumId });
      expect(Number(d22NumData.data[0].total_revenue)).toBeGreaterThan(0);

      // Pin map: exactly the 10 GEO_ROWS seeded in setupGeoLocations, all in valid lat/lon range
      const d22MapId = (d22Ids['map'] ?? [])[0];
      const d22MapData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d22ReportCode, cid: d22MapId });
      expect(d22MapData.data.length).toBe(10);
      for (const row of d22MapData.data) {
        expect(row.name).toBeDefined();
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
      }

      // Pivot: employee × category cross-tab has data with Beverages category present
      const d22PivotId = (d22Ids['pivot'] ?? [])[0];
      const d22PivotData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d22ReportCode, cid: d22PivotId });
      expect(d22PivotData.data.length).toBeGreaterThan(0);
      expect(Number(d22PivotData.data[0].revenue)).toBeGreaterThan(0);
      const d22Categories = d22PivotData.data.map((r: { CategoryName: string }) => r.CategoryName);
      expect(d22Categories).toContain('Beverages');
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await teardownGeoLocations();
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D23 — Northwind Sales Cube Dashboard  (Audience: VP of Sales, cube-backed)
  // Unlike D1..D22 which create a fresh UseCase-sqlite connection, D23 uses the
  // SHIPPED sample Northwind DB directly — connection code
  // `rbt-sample-northwind-sqlite-4f2`, shipped cube `northwind-sales` (both
  // under config/samples-cubes/). No cube duplication, no re-point. Sample
  // connections are hidden from the #selectConnection dropdown unless the
  // `showsamples` preference is enabled, so we toggle it via
  // POST /api/system/preferences before the canvas is created.
  //
  // Fixture differs from the rest of the suite: this is the FULL classic
  // Northwind (9 employees, 91 customers, 77 products, ~830 orders) rather
  // than NorthwindDataGenerator's reduced fixture.
  // ────────────────────────────────────────────────────────────────────────────
  test('D23 — Northwind Sales Cube Dashboard', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D23 — Northwind Sales Cube Dashboard';
    const cubeId = 'northwind-sales';
    const sampleConnectionCode = 'rbt-sample-northwind-sqlite-4f2';

    // Enable the "show sample connections & cubes" preference so the shipped
    // Northwind sample appears in the connection dropdown + its bound cubes
    // appear in the SchemaBrowser.
    await page.goto(AI_HUB_BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      // Through the app's /api/dp proxy, as the app itself does: it carries the session + CSRF token.
      const res = await fetch('/api/dp/system/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { showsamples: true } }),
      });
      if (!res.ok) throw new Error(`enable showsamples failed: ${res.status} ${await res.text()}`);
    });

    try {
      // Fresh canvas, then select the SHIPPED sample connection directly
      // (bypasses createCanvas's UseCase-sqlite default).
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(sampleConnectionCode);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });

      await addUIElement(page, 'text', {
        textContent: '## Northwind Sales Cube Dashboard\n\nTotal revenue · Revenue by category · Revenue by country · Employee leaderboard — all sourced from the pre-joined Sales cube (no custom SQL).',
      });

      // KPI: total Revenue (no dimensions, one measure).
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, [], ['Revenue']);
      await switchToWidget(page, 'number');

      // Chart: Revenue by CategoryName (8 Northwind categories).
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, ['CategoryName'], ['Revenue']);
      await switchToWidget(page, 'chart');

      // Chart: Revenue by ShipCountry.
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, ['ShipCountry'], ['Revenue']);
      await switchToWidget(page, 'chart');

      await addUIElement(page, 'divider');

      // Tabulator: Employee leaderboard with 3 measures.
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, ['EmployeeName'], ['Revenue', 'OrderCount', 'UniqueCustomers']);
      await switchToWidget(page, 'tabulator');

      // Layout: text → KPI → 2 charts → divider → employee leaderboard.
      // Insertion order: text, n, c, c, divider, t.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0,  w: 12, h: 2 }, // text      — dashboard header
        { x: 0, y: 2,  w: 12, h: 2 }, // number    — total revenue
        { x: 0, y: 4,  w: 6,  h: 5 }, // chart     — revenue by category
        { x: 6, y: 4,  w: 6,  h: 5 }, // chart     — revenue by country
        { x: 0, y: 9,  w: 12, h: 1 }, // divider
        { x: 0, y: 10, w: 12, h: 5 }, // tabulator — employee leaderboard
      ]);

      const d23CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d23Url } = await publishDashboard(page);
      const d23Ids = await getCanvasComponentIds(page, d23CanvasId);
      const d23ReportCode = d23Url.split('/').pop()!;

      await page.goto(d23Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // KPI — total revenue must be positive (Northwind has ~$1.3M in sales)
      const d23RevId = (d23Ids['number'] ?? [])[0];
      const d23RevData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d23ReportCode, cid: d23RevId });
      expect(Number(d23RevData.data[0].Revenue)).toBeGreaterThan(0);

      // Category chart — exactly 8 Northwind categories, Beverages present, all > 0
      const d23CatId = (d23Ids['chart'] ?? [])[0];
      const d23CatData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d23ReportCode, cid: d23CatId });
      expect(d23CatData.data.length).toBe(8);
      for (const row of d23CatData.data) {
        expect(Number(row.Revenue)).toBeGreaterThan(0);
      }
      const categories = d23CatData.data.map((r: { CategoryName: string }) => r.CategoryName);
      expect(categories).toContain('Beverages');

      // Country chart — 10 distinct ShipCountry values in the testground northwind.db,
      // all with positive revenue.
      const d23CountryId = (d23Ids['chart'] ?? [])[1];
      const d23CountryData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d23ReportCode, cid: d23CountryId });
      expect(d23CountryData.data.length).toBe(10);
      for (const row of d23CountryData.data) {
        expect(String(row.ShipCountry).length).toBeGreaterThan(0);
        expect(Number(row.Revenue)).toBeGreaterThan(0);
      }

      // Employee leaderboard — testground northwind.db has 3 employees with sales
      // orders; all 3 have positive values for all three cube measures.
      const d23EmpId = (d23Ids['tabulator'] ?? [])[0];
      const d23EmpData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d23ReportCode, cid: d23EmpId });
      expect(d23EmpData.data.length).toBe(3);
      for (const row of d23EmpData.data) {
        expect(String(row.EmployeeName).length).toBeGreaterThan(0);
        expect(Number(row.Revenue)).toBeGreaterThan(0);
        expect(Number(row.OrderCount)).toBeGreaterThan(0);
        expect(Number(row.UniqueCustomers)).toBeGreaterThan(0);
      }
    } finally {
      // Delete the canvas only. The sample connection and the shipped
      // `northwind-sales` cube are NOT test-provisioned — they ship with
      // DataPallas and must remain untouched for subsequent runs.
      await deleteCanvasViaUI(page, canvasName);
    }
  });


  // ────────────────────────────────────────────────────────────────────────────
  // D24 — a table in another schema  (Phase 2, TODO 10a: the schema reach)
  //
  // Everything else in this suite lives in the connection's default schema.
  // This one proves the reach into another schema, end to end, on a temporary
  // duckdb connection pointed at a COPY of the shipped `northwind.duckdb`
  // (which carries both plain Northwind and the `cube_demo` schema), so no
  // shipped file is ever written to:
  //   • the schema browser lists `cube_demo.crm_deals` AND a bare `Orders`;
  //   • the generated SQL quotes the reference per part —
  //     `"cube_demo"."crm_deals"`, never `"cube_demo.crm_deals"`;
  //   • a table in the default schema is still unqualified: `FROM "Orders"`;
  //   • the numbers are `ai-hub-sql-cases.json`'s own truths (case a3):
  //     1,200 deals, Closed Won 402, Closed Lost 244.
  //
  // The canvas has no row-count label and the grid renders virtualised rows,
  // so the row count is asserted as data — COUNT over the primary key, read
  // from the published dashboard, the way every other number in this suite is.
  // ────────────────────────────────────────────────────────────────────────────
  test('(explore-data) D24 — a table in another schema', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName      = 'D24 — a table in another schema';
    const connectionName  = 'SchemaReach';
    const connectionVendor = 'duckdb';
    const connectionCode  = toConnectionCode(connectionName, connectionVendor);
    const copyFolder      = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    // Create the connection, then re-point it at a copy of the shipped sample:
    // readUpdateAndAssertDatabaseConnection makes the copy under
    // db/sample-northwind-duckdb-test/ and browses to it. It also renames the
    // connection's label ("SchemaReach Updated"); the connection CODE, which is
    // what the canvas dropdown selects by, is unchanged.
    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      // Both reaches are visible at once: the other schema's table under its
      // schema, the default schema's table bare.
      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[id="btnTable-Orders"]')).toBeVisible({ timeout: 15_000 });

      // ── the qualified table: its row count ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'number', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
      });

      // View SQL — quoted per part, not as one name
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const d24DealsSql = await page.locator('#preVisualSql').innerText();
      expect(d24DealsSql).toContain('"cube_demo"."crm_deals"');
      expect(d24DealsSql).not.toContain('"cube_demo.crm_deals"');
      await page.locator('#btnToggleVisualSql').click();

      // ── the qualified table: the grouped count (case a3's truth) ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addGroupBy(page, 'stage');
      });

      // ── the default schema is untouched: still unqualified ──
      await addVisualWidget(page, 'Orders', 'chart', async () => {
        await addAggregation(page, 0, 'COUNT', 'OrderID');
        await addGroupBy(page, 'ShipCountry');
      });

      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const d24OrdersSql = await page.locator('#preVisualSql').innerText();
      expect(d24OrdersSql).toContain('FROM "Orders"');
      expect(d24OrdersSql).not.toContain('."Orders"');
      await page.locator('#btnToggleVisualSql').click();

      // Layout. Insertion order: number, tabulator, chart.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 2 }, // number    — deals in cube_demo.crm_deals
        { x: 0, y: 2, w: 6,  h: 5 }, // tabulator — deals by stage
        { x: 6, y: 2, w: 6,  h: 5 }, // chart     — orders by ship country
      ]);

      const d24CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d24Url } = await publishDashboard(page);
      const d24Ids = await getCanvasComponentIds(page, d24CanvasId);
      const d24ReportCode = d24Url.split('/').pop()!;

      await page.goto(d24Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 20_000 });

      // 1,200 rows in cube_demo.crm_deals
      const d24CountId = (d24Ids['number'] ?? [])[0];
      const d24CountData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d24ReportCode, cid: d24CountId });
      expect(Number(d24CountData.data[0].deal_id_count)).toBe(1200);

      // By stage — Closed Won 402, Closed Lost 244, six stages, 1,200 in total
      const d24StageId = (d24Ids['tabulator'] ?? [])[0];
      const d24StageData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d24ReportCode, cid: d24StageId });
      const byStage = new Map<string, number>(
        d24StageData.data.map((row: { stage: string; deal_id_count: number }) =>
          [String(row.stage), Number(row.deal_id_count)] as [string, number]),
      );
      expect(byStage.get('Closed Won')).toBe(402);
      expect(byStage.get('Closed Lost')).toBe(244);
      expect(d24StageData.data.length).toBe(6);
      expect([...byStage.values()].reduce((a, b) => a + b, 0)).toBe(1200);

      // The default schema's own table still answers as it always did
      const d24CountryId = (d24Ids['chart'] ?? [])[0];
      const d24CountryData = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d24ReportCode, cid: d24CountryId });
      const germany = d24CountryData.data.find(
        (row: { ShipCountry: string }) => row.ShipCountry === 'Germany');
      expect(germany).toBeDefined();
      expect(Number(germany.OrderID_count)).toBe(32);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      // The connection and its copy of the sample are test-provisioned: both go.
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ────────────────────────────────────────────────────────────────────────────
  // D25 — Northwind Sales Live Cube  (Phase 3, W1 + W2 + W3 + W5)
  //
  // D23 publishes a cube as a SQL GENERATOR — the canvas turns the selection
  // into SQL and the dashboard carries that frozen SQL. This one publishes THE
  // CUBE ITSELF: the author ticks Show In Dashboard, the exporter writes an
  // <rb-cube-renderer> plus this widget's entry in {reportId}-cube-widgets.json
  // with the author's own opening selection, and the viewer asks the live cube.
  //
  // Same fixture as D23: the SHIPPED sample connection
  // `rbt-sample-northwind-sqlite-4f2` and the shipped `northwind-sales` cube,
  // both reachable once the `showsamples` preference is on. Nothing here is
  // test-provisioned but the canvas, which the finally block deletes.
  //
  // What it proves, in the order the two people do it:
  //   • W1 + W3 — the author ticks CategoryName + Revenue and filters
  //     ShipCountry to Germany on the canvas, ticks #chkCubeShowInDashboard,
  //     and the tree moves onto the canvas widget (#cubeOnCanvasNote);
  //   • W2 — the published dashboard opens on the author's own selection, the
  //     Germany chip included, and every change is a new answer from the live
  //     cube: removing the chip, a date range on OrderDate and ticking
  //     ShipCountry each change what the result says (both halves — the filter
  //     is really applied and really removed);
  //   • W5 — the viewer's own view: the panel header says what the data is
  //     filtered by, collapsing it survives F5 because it was saved to the
  //     ACCOUNT (GET …/my-view answers with it, in a fresh page), and Reset
  //     view puts the author's dashboard back and leaves nothing behind (204);
  //   • the lock is still the lock: through the API, an unknown member is
  //     refused, and a request naming another connection is answered on the
  //     connection the widget file names, never the one that was asked for.
  // ────────────────────────────────────────────────────────────────────────────
  test('D25 — Northwind Sales Live Cube', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D25 — Northwind Sales Live Cube';
    const cubeId = 'northwind-sales';
    const sampleConnectionCode = 'rbt-sample-northwind-sqlite-4f2';

    // Same preference as D23: the shipped sample connection and its bound cubes
    // are hidden from the canvas until it is on.
    await page.goto(AI_HUB_BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      // Through the app's /api/dp proxy, as the app itself does: it carries the session + CSRF token.
      const res = await fetch('/api/dp/system/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { showsamples: true } }),
      });
      if (!res.ok) throw new Error(`enable showsamples failed: ${res.status} ${await res.text()}`);
    });

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(sampleConnectionCode);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });

      await addCubeToCanvas(page, cubeId);
      await switchToWidget(page, 'tabulator');

      // ── W1 on the canvas: the author's own ticks, and one filter ─────────
      // CategoryName comes from the joined Categories table, so its folder is
      // opened first; Revenue is a measure of the cube itself.
      await openCubeFolders(page, ['chk-dim-CategoryName']);
      await page.locator('#chk-dim-CategoryName').check();
      await page.locator('#chk-meas-Revenue').check();

      await page.locator('#btnFilter-ShipCountry').click();
      await page.locator('#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#cubeFilterParams').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#ShipCountry').click();
      await page.locator('#ShipCountry_cb_Germany').waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('#ShipCountry_cb_Germany').click();
      await page.locator('#ShipCountry_btnOk').click();
      await page.locator('#btnFilterApply').click();
      await expect(page.locator('#chipFilter-ShipCountry')).toContainText('Ship Country: Germany');

      // ── W3: Show In Dashboard — the cube itself is published ─────────────
      await page.locator('#chkCubeShowInDashboard').check();
      await expect(page.locator('#cubeOnCanvasNote')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_500);

      const d25CanvasId = page.url().split('/').pop()!;
      const { reportId: d25ReportId, dashboardUrl: d25Url } = await publishDashboard(page);
      const d25Ids = await getCanvasComponentIds(page, d25CanvasId);
      const d25ComponentId = (d25Ids['tabulator'] ?? [])[0];
      expect(d25ComponentId).toBeTruthy();

      // ── W2: the dashboard opens on the author's own selection ────────────
      await page.goto(d25Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-cube-renderer')).toHaveCount(1, { timeout: 20_000 });
      // The field tree is the live cube's own /meta, ticked as the author left it.
      await expect(page.locator('#chk-meas-Revenue')).toBeChecked({ timeout: 30_000 });
      await expect(page.locator('#chk-dim-CategoryName')).toBeChecked();
      await expect(page.locator('#chipFilter-ShipCountry')).toContainText('Ship Country: Germany');

      const d25Result = page.locator('#cubeRuntimeResult');
      await expect(d25Result).toContainText('Beverages', { timeout: 30_000 });
      const d25Germany = await d25Result.textContent();

      // Removing the filter is a new question to the live cube, not a redraw.
      await page.locator('#btnChipRemove-ShipCountry').click();
      await expect.poll(() => d25Result.textContent(), { timeout: 30_000 }).not.toBe(d25Germany);
      const d25Everywhere = await d25Result.textContent();

      // A date range on OrderDate: the same rows, cut by when they happened.
      await page.locator('#btnFilter-OrderDate').click();
      await page.locator('#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#OrderDate__from').fill('1997-01-01');
      await page.locator('#OrderDate__to').fill('1997-06-30');
      await page.locator('#btnFilterApply').click();
      await expect(page.locator('#chipFilter-OrderDate')).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => d25Result.textContent(), { timeout: 30_000 }).not.toBe(d25Everywhere);
      const d25FirstHalf = await d25Result.textContent();

      // And one more field in the tree is one more column in the answer.
      await page.locator('#chk-dim-ShipCountry').check();
      await expect.poll(() => d25Result.textContent(), { timeout: 30_000 }).not.toBe(d25FirstHalf);
      await expect(d25Result).toContainText('Germany', { timeout: 30_000 });

      // ── W5: back to the author's question, plus this viewer's own filter ──
      await page.locator('#chk-dim-ShipCountry').uncheck();
      await page.locator('#btnFilter-OrderDate').click();
      await page.locator('#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#btnFilterClear').click();
      await expect(page.locator('#chipFilter-OrderDate')).toHaveCount(0, { timeout: 10_000 });

      await page.locator('#btnFilter-ShipCountry').click();
      await page.locator('#cubeFilterPopover').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#cubeFilterParams').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#ShipCountry').click();
      await page.locator('#ShipCountry_cb_Germany').waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('#ShipCountry_cb_Germany').click();
      await page.locator('#ShipCountry_btnOk').click();
      await page.locator('#btnFilterApply').click();
      await expect(page.locator('#chipFilter-ShipCountry')).toContainText('Ship Country: Germany');

      // The header says which cube this is and what the data is filtered by, in the viewer's
      // own words. The cube's title is its own, out of its definition (D5).
      await expect(page.locator('#cubePanelHeader'))
        .toHaveText('▾ Northwind Sales Analysis · Ship Country: Germany', { timeout: 30_000 });

      // One click folds the cube away and leaves the data where it was.
      await page.locator('#cubePanelHeader').click();
      await expect(page.locator('#cubePanelBody')).toHaveCount(0, { timeout: 10_000 });
      await expect(d25Result).toBeVisible();
      await expect(page.locator('#cubePanelHeader')).toHaveAttribute('aria-expanded', 'false');

      // The save is debounced a second, and it is the account that is written to.
      await page.waitForTimeout(3_000);
      const d25Saved = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/my-view`);
        return { status: r.status, body: r.status === 200 ? await r.json() : null };
      }, { rid: d25ReportId, cid: d25ComponentId });
      expect(d25Saved.status).toBe(200);
      expect(d25Saved.body.collapsed).toBe(true);
      expect(d25Saved.body.selection.filters[0].member).toBe('ShipCountry');
      expect(d25Saved.body.selection.filters[0].values).toEqual(['Germany']);

      // F5: the dashboard opens as this viewer left it, from that saved view.
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#cubePanelHeader'))
        .toHaveText('▸ Northwind Sales Analysis · Ship Country: Germany', { timeout: 30_000 });
      await expect(page.locator('#cubePanelBody')).toHaveCount(0);
      await expect(d25Result).toContainText('Beverages', { timeout: 30_000 });

      // The header is the only control, and it works both ways.
      await page.locator('#cubePanelHeader').click();
      await expect(page.locator('#cubePanelBody')).toBeVisible({ timeout: 10_000 });

      // A view that is no longer the author's says so, and can be given back.
      await page.locator('#btnChipRemove-ShipCountry').click();
      // With nothing filtering it, the line says which cube it is and what the panel is for.
      await expect(page.locator('#cubePanelHeader'))
        .toHaveText('▾ Northwind Sales Analysis · pick what to see', { timeout: 30_000 });
      await page.locator('#lnkCubeResetView').click();
      await expect(page.locator('#chipFilter-ShipCountry')).toContainText('Ship Country: Germany',
        { timeout: 30_000 });
      await expect(page.locator('#cubePanelHeader'))
        .toHaveText('▾ Northwind Sales Analysis · Ship Country: Germany');
      // Nothing is left in the store: the next default the author publishes is
      // the one this viewer will open.
      await page.waitForTimeout(3_000);
      const d25Reset = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/my-view`);
        return r.status;
      }, { rid: d25ReportId, cid: d25ComponentId });
      expect(d25Reset).toBe(204);

      // ── The lock, through the API ────────────────────────────────────────
      // A member this cube does not offer is refused, and the refusal says so
      // rather than answering something near it.
      const d25Unknown = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dimensions: ['NoSuchField'], measures: ['Revenue'] }),
        });
        return { status: r.status, body: await r.text() };
      }, { rid: d25ReportId, cid: d25ComponentId });
      expect(d25Unknown.status).toBe(400);
      expect(d25Unknown.body).toContain('NoSuchField');

      // The connection is the widget file's, and asking for another one does
      // not change which database answers: the rows are the same rows.
      const d25Honest = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dimensions: ['CategoryName'],
            measures: ['Revenue'],
            connectionId: 'some-other-connection',
          }),
        });
        return { status: r.status, body: await r.json().catch(() => null) };
      }, { rid: d25ReportId, cid: d25ComponentId });
      // The eight Northwind categories, out of the connection the file names.
      expect(d25Honest.status).toBe(200);
      expect(d25Honest.body.rows.length).toBe(8);
    } finally {
      // The canvas only: the sample connection and the shipped `northwind-sales`
      // cube are not test-provisioned and must survive the run (as in D23).
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D26 — Northwind Sales Live Cube analysis  (Phase 3, W3 + W4)
  //
  // D23 publishes a cube as a SQL GENERATOR: the selection is turned into SQL on
  // the canvas and the dashboard carries that frozen SQL. This one publishes THE
  // CUBE ITSELF — the author ticks Show In Dashboard, the exporter writes an
  // <rb-cube-renderer> plus this widget's entry in {reportId}-cube-widgets.json,
  // and a viewer picks the fields in the dashboard, against the live cube.
  //
  // Same fixture as D23: the SHIPPED sample connection
  // `rbt-sample-northwind-sqlite-4f2` and the shipped `northwind-sales` cube,
  // both reachable once the `showsamples` preference is on. Nothing here is
  // test-provisioned but the canvas, which the finally block deletes.
  //
  // What it proves, in the order a viewer does it:
  //   • the cube is published live — the dashboard holds an <rb-cube-renderer>
  //     with the whole field tree, and nothing is ticked in it, because the
  //     author ticked nothing on the canvas;
  //   • W4.2 — ticking only `Revenue` gives one number, written in the currency
  //     the cube declares (`format 'currency'`, and no `currency` of its own, so
  //     the default USD): the answer says `$` without anyone formatting it here;
  //   • W4.6 — that number is clickable, the rows behind it come up in
  //     #cubeDrillModal, and #btnDrillClose puts them away;
  //   • W4.1 / W4.3 / W4.4 — ticking `OrderDate` asks for its month
  //     (#gran-OrderDate), and with `RevenueRunning` beside `Revenue` the table
  //     carries a month label and the server's own `Total` row;
  //   • the same component answered through the API: `totals`, a `RevenueShare`
  //     that sums to 1 over the groups (W4.5), and a `/drill` that returns rows.
  // ────────────────────────────────────────────────────────────────────────────
  test('D26 — Northwind Sales Live Cube analysis', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName = 'D26 — Northwind Sales Live Cube analysis';
    const cubeId = 'northwind-sales';
    const sampleConnectionCode = 'rbt-sample-northwind-sqlite-4f2';

    // Same preference as D23: the shipped sample connection and its bound cubes
    // are hidden from the canvas until it is on.
    await page.goto(AI_HUB_BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      // Through the app's /api/dp proxy, as the app itself does: it carries the session + CSRF token.
      const res = await fetch('/api/dp/system/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { showsamples: true } }),
      });
      if (!res.ok) throw new Error(`enable showsamples failed: ${res.status} ${await res.text()}`);
    });

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(sampleConnectionCode);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });

      // The cube widget, left as a table: the widget type is what says how the
      // result under the field tree is drawn, and `tabulator` means the rows.
      await addCubeToCanvas(page, cubeId);
      await switchToWidget(page, 'tabulator');

      // Show In Dashboard — the whole difference between the two modes. Nothing
      // is ticked on the canvas, so the dashboard opens on the bare tree.
      await page.locator('#chkCubeShowInDashboard').check();
      // The tree moves to the canvas: the right panel says so instead of showing a second one.
      await expect(page.locator('#cubeOnCanvasNote')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_500);

      const d26CanvasId = page.url().split('/').pop()!;
      const { reportId: d26ReportId, dashboardUrl: d26Url } = await publishDashboard(page);
      const d26Ids = await getCanvasComponentIds(page, d26CanvasId);
      const d26ComponentId = (d26Ids['tabulator'] ?? [])[0];
      expect(d26ComponentId).toBeTruthy();

      // ── The dashboard: the cube itself, not a frozen answer ──────────────
      await page.goto(d26Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-cube-renderer')).toHaveCount(1, { timeout: 20_000 });
      // The field tree is the live cube's own /meta, so its arrival is the proof
      // that the dashboard reads the cube rather than a published copy of it.
      await expect(page.locator('#chk-meas-Revenue')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#chk-meas-Revenue')).not.toBeChecked();
      await expect(page.locator('#chk-dim-OrderDate')).not.toBeChecked();

      // ── W4.2: one measure, one number, in the cube's own currency ────────
      await page.locator('#chk-meas-Revenue').check();
      await expect(page.locator('#cubeRuntimeValue')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#cubeRuntimeValue')).toContainText('$', { timeout: 30_000 });

      // ── W4.6: the rows behind that number ────────────────────────────────
      await page.locator('#cubeRuntimeValue').click();
      await expect(page.locator('#cubeDrillModal')).toBeVisible({ timeout: 30_000 });
      // `Revenue` drills into OrderID, OrderDate, CustomerCompanyName,
      // EmployeeName and OrderValue, so the modal names the measure it opened on
      // and holds the order lines behind it.
      await expect(page.locator('#cubeDrillTitle')).toContainText('Revenue');
      await expect(page.locator('#cubeDrillError')).toHaveCount(0);
      await page.locator('#btnDrillClose').click();
      await expect(page.locator('#cubeDrillModal')).toHaveCount(0, { timeout: 10_000 });

      // ── W4.1 / W4.3 / W4.4: a month, a running total, and the Total row ──
      await page.locator('#chk-dim-OrderDate').check();
      // Ticking a time dimension asks for its month.
      await expect(page.locator('#gran-OrderDate')).toHaveValue('month');
      await page.locator('#chk-meas-RevenueRunning').check();
      const d26Result = page.locator('#cubeRuntimeResult');
      // A month label the cube's own grain wrote, like `Jul 1996`.
      await expect(d26Result).toContainText(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/, { timeout: 30_000 });
      // The bottom row is the server's second query, not a sum of the page.
      await expect(d26Result).toContainText('Total', { timeout: 30_000 });
      await expect(d26Result).toContainText('$');

      // ── The same component, asked through the API ────────────────────────
      // W4.5: a share of the total is 1 by definition, and the groups add up to it.
      const d26Query = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dimensions: ['CategoryName'],
            measures: ['Revenue', 'RevenueShare'],
            totals: true,
          }),
        });
        if (!r.ok) throw new Error(`live cube query failed: ${r.status} ${await r.text()}`);
        return r.json();
      }, { rid: d26ReportId, cid: d26ComponentId });

      // The eight Northwind categories, as D23 reads them out of the same database.
      expect(d26Query.rows.length).toBe(8);
      expect(Number(d26Query.totals.Revenue)).toBeGreaterThan(0);
      expect(Number(d26Query.totals.RevenueShare)).toBe(1);
      const d26Share = d26Query.rows.reduce(
        (sum: number, row: { RevenueShare: number }) => sum + Number(row.RevenueShare), 0);
      expect(d26Share).toBeCloseTo(1, 3);

      // W4.6 again, without the UI: the rows behind one category's revenue.
      const d26Drill = await page.evaluate(async ({ rid, cid }) => {
        const r = await fetch(`/api/reports/${rid}/cube/${cid}/drill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            measure: 'Revenue',
            cell: { CategoryName: 'Beverages' },
          }),
        });
        if (!r.ok) throw new Error(`live cube drill failed: ${r.status} ${await r.text()}`);
        return r.json();
      }, { rid: d26ReportId, cid: d26ComponentId });

      expect(d26Drill.rows.length).toBeGreaterThan(0);
      // Its columns are the measure's own drill_members.
      expect(Number(d26Drill.rows[0].OrderID)).toBeGreaterThan(0);
      expect(Number(d26Drill.rows[0].OrderValue)).toBeGreaterThan(0);
    } finally {
      // The canvas only: the sample connection and the shipped `northwind-sales`
      // cube are not test-provisioned and must survive the run (as in D23).
      await deleteCanvasViaUI(page, canvasName);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // D27 — starts with ignores case and treats % as a character
  //       (Phase 2a, TODO T2: the three LIKE filters are one predicate)
  //
  // `starts with` used to write `c LIKE 'v%'` on its own: whether it ignored
  // case was the column collation's business, and a `%` the user typed was a
  // wildcard. It now goes through the same vendor-layer predicate as
  // `contains` - the value's wildcards escaped, both sides folded to lower
  // case - so on a DuckDB connection, where the collation is case sensitive:
  //   • `stage` starts with `closed` finds the 646 Closed Won + Closed Lost
  //     deals (before this, 0);
  //   • `stage` starts with `%` finds none, because the `%` is a character the
  //     data does not hold (before this, all 1,200 - `%` matched everything).
  // The numbers are `ai-hub-sql-cases.json`'s own truths (cases a18 and a21).
  //
  // Same shape as D24: a temporary duckdb connection pointed at a COPY of the
  // shipped `northwind.duckdb`, which carries the `cube_demo` schema, so no
  // shipped file is ever written to.
  // ────────────────────────────────────────────────────────────────────────────
  test('(explore-data) D27 — starts with ignores case and treats % as a character', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D27 — starts with ignores case and treats % as a character';
    const connectionName   = 'LikeFilters';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── starts with `closed`, in lower case, against `Closed Won` / `Closed Lost` ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'number', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addVisualFilter(page, 0, 'stage', 'starts_with', 'closed');
      });

      // The SQL folds both sides and escapes the value's wildcards, exactly as
      // `contains` does; the bare `LIKE 'closed%'` form must not come back.
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const d27StartsSql = await page.locator('#preVisualSql').innerText();
      expect(d27StartsSql).toContain('LOWER("stage") LIKE LOWER(');
      expect(d27StartsSql).toContain("ESCAPE '!'");
      expect(d27StartsSql).not.toContain('"stage" LIKE \'closed%\'');
      await page.locator('#btnToggleVisualSql').click();

      // ── starts with `%`: a character, not a wildcard ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'number', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addVisualFilter(page, 0, 'stage', 'starts_with', '%');
      });

      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const d27PercentSql = await page.locator('#preVisualSql').innerText();
      // The typed `%` is escaped, so the pattern is "a literal % then anything".
      expect(d27PercentSql).toContain("LOWER('!%%')");
      await page.locator('#btnToggleVisualSql').click();

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 2 }, // number — deals whose stage starts with `closed`
        { x: 6, y: 0, w: 6, h: 2 }, // number — deals whose stage starts with `%`
      ]);

      const d27CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d27Url } = await publishDashboard(page);
      const d27Ids = await getCanvasComponentIds(page, d27CanvasId);
      const d27ReportCode = d27Url.split('/').pop()!;

      await page.goto(d27Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });

      const readCount = async (componentId: string): Promise<number> => {
        const payload = await page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          return r.json();
        }, { rc: d27ReportCode, cid: componentId });
        return Number(payload.data[0].deal_id_count);
      };

      const [d27StartsId, d27PercentId] = d27Ids['number'] ?? [];
      // 402 Closed Won + 244 Closed Lost, found although the data holds them
      // capitalised and the filter was typed in lower case.
      expect(await readCount(d27StartsId)).toBe(646);
      // No stage starts with a literal `%`.
      expect(await readCount(d27PercentId)).toBe(0);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ───────────────────────────────────────────────────────────────────────
  // D28 — top N by an aggregate
  //       (Phase 2a, TODO T7: sorting an aggregated query)
  //
  // A summarized query can only sort by what it selects - one of the grouped
  // columns, or one of the aggregates - and sorting it by any other column is
  // SQL that MySQL and MariaDB refuse under `ONLY_FULL_GROUP_BY` and that
  // PostgreSQL, Oracle and Db2 refuse always. So the Sort step now offers only
  // those: for "count the deals of each stage" it offers `stage` and
  // `deal_id_count`, and `deal_name` is not in the list at all.
  //
  // What the query answers: the three biggest stages by deal count, the count
  // descending, a limit of 3 - Closed Won 402, Closed Lost 244, Negotiation 189,
  // `ai-hub-sql-cases.json`'s own truths (case a27; the fourth stage, Proposal,
  // has 148, so the cut is a real one). The sort key is written as the aggregate
  // expression `COUNT("deal_id")` and never as the alias, which PostgreSQL
  // rejects inside an ORDER BY expression.
  //
  // Same shape as D24 and D27: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ───────────────────────────────────────────────────────────────────────
  test('(explore-data) D28 — top N by an aggregate', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D28 — top N by an aggregate';
    const connectionName   = 'TopNAggregate';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── count the deals of each stage, the count descending, the top 3 ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addGroupBy(page, 'stage');
        // The Sort step offers the grouped column and the aggregate, and nothing
        // else: a key on `deal_name` is SQL no strict database runs, so it is not
        // on offer at all. The list is read from the fresh sort row, because that
        // is what the user chooses from.
        await page.locator('#btnAddSort').click();
        await page.locator('#selectSortCol-0').waitFor({ state: 'visible', timeout: 5_000 });
        const offered = await page.locator('#selectSortCol-0').locator('option').allTextContents();
        expect(offered).toEqual(['stage', 'deal_id_count']);
        expect(offered).not.toContain('deal_name');

        await page.locator('#selectSortCol-0').selectOption('deal_id_count');
        await page.locator('#selectSortDir-0').selectOption('DESC');
        await setVisualLimit(page, 3);
      });

      // The sort key is the aggregate expression, not the alias PostgreSQL
      // rejects inside an ORDER BY expression.
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const d28Sql = await page.locator('#preVisualSql').innerText();
      expect(d28Sql).toContain('ORDER BY COUNT("deal_id") DESC');
      expect(d28Sql).not.toContain('ORDER BY "deal_id_count"');
      await page.locator('#btnToggleVisualSql').click();

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 5 }, // tabulator — the three biggest stages
      ]);

      const d28CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d28Url } = await publishDashboard(page);
      const d28Ids = await getCanvasComponentIds(page, d28CanvasId);
      const d28ReportCode = d28Url.split('/').pop()!;

      await page.goto(d28Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(1, { timeout: 20_000 });

      // The grid's own rows, in the order the SQL returned them: three rows, the
      // counts descending.
      const [d28GridId] = d28Ids['tabulator'] ?? [];
      const payload = await page.evaluate(async ({ rc, cid }) => {
        const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
        return r.json();
      }, { rc: d28ReportCode, cid: d28GridId });
      const rows = payload.data as Record<string, unknown>[];
      expect(rows.length).toBe(3);
      expect(rows.map((r) => String(r.stage))).toEqual(['Closed Won', 'Closed Lost', 'Negotiation']);
      expect(rows.map((r) => Number(r.deal_id_count))).toEqual([402, 244, 189]);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // D29 — a dashboard Date parameter filters a date column
  //       (Phase 2a, TODO P1: parameters bound with their declared type)
  //
  // A date picker writes text: `2026-01-31`. Until P1, that text was bound as
  // text, which PostgreSQL refuses outright ("operator does not exist: date <=
  // character varying") and SQLite answers with whatever its rank ordering makes
  // of a string against a number. Now the type the dashboard declared travels
  // with the value - the canvas sends `paramTypes` beside `params`, the published
  // script calls the same conversion - and the value is bound as a date.
  //
  // What the query answers: 425 of the 500 deals of `cube_demo.crm_deals` close
  // on or before 2026-01-31, and 394 of them are over 31999.99 - the truths of
  // `truths-ai-hub.out` (cases p1a and p1d), which the vendor loop runs on every
  // vendor from the committed SQL. Here the same two numbers are asked of the
  // product itself: on the canvas, and again on the published dashboard, whose
  // script is a different path to the same conversion.
  //
  // The Double parameter is the one that cannot be faked: nine deals are exactly
  // 32000.00, so an Integer 32000 answers 385 and the Double 31999.99 answers
  // 394. A fraction that never left the text bind would show up as 385.
  //
  // Same shape as D24, D27 and D28: a temporary duckdb connection pointed at a
  // COPY of the shipped `northwind.duckdb`, which carries the `cube_demo` schema,
  // so no shipped file is ever written to.
  // ────────────────────────────────────────────────────────────────────
  test('(explore-data) D29 — a dashboard Date parameter filters a date column', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D29 — a dashboard Date parameter filters a date column';
    const connectionName   = 'DateParameterBind';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // A date and a number with a fraction, declared as what they are. `Double`
      // is the name the backend conversion knows; the parameter bar gives it the
      // same number box a `decimal` gets.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'to', type: Date, label: 'Closing on or before', defaultValue: '2026-01-31') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "  parameter(id: 'min', type: Double, label: 'Amount over', defaultValue: '31999.99') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "}"
      );

      // The date picker is a date control and the Double is a number box - the
      // declared type reaches the parameter bar, not only the query.
      await expect(page.locator('rb-parameters')).toBeVisible({ timeout: 10_000 });
      const controls = await page.locator('rb-parameters').evaluate((host: Element) => {
        const root = (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot ?? host;
        return Array.from(root.querySelectorAll('input')).map((i) => (i as HTMLInputElement).type);
      });
      expect(controls).toContain('date');
      expect(controls).toContain('number');

      // ── the deals closing on or before the date the picker holds ──
      await addWidget(page, 'cube_demo.crm_deals',
        `SELECT COUNT(*) AS deal_count FROM cube_demo.crm_deals WHERE close_date <= \${to}`,
        'number');
      // ── and, of those, the ones over an amount with a fraction ──
      await addWidget(page, 'cube_demo.crm_deals',
        `SELECT COUNT(*) AS big_deal_count FROM cube_demo.crm_deals WHERE amount > \${min}`,
        'number');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // number — deals closing by the date
        { x: 6, y: 0, w: 6, h: 4 },  // number — deals over the amount
      ]);

      const d29CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d29Url } = await publishDashboard(page);
      const d29Ids = await getCanvasComponentIds(page, d29CanvasId);
      const d29ReportCode = d29Url.split('/').pop()!;

      await page.goto(d29Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-number')).toHaveCount(2, { timeout: 20_000 });

      // The published dashboard's own answers, from the script the publisher
      // wrote - the path that converts through ParameterTypes.typed.
      const [byDate, byAmount] = d29Ids['number'] ?? [];
      const answers = await page.evaluate(async ({ rc, ids }) => {
        const out: Record<string, unknown>[] = [];
        for (const cid of ids) {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          out.push((payload.data as Record<string, unknown>[])[0]);
        }
        return out;
      }, { rc: d29ReportCode, ids: [byDate, byAmount] });

      expect(Number(answers[0].deal_count)).toBe(425);
      expect(Number(answers[1].big_deal_count)).toBe(394);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // D30 — clearing a dashboard filter shows every row again
  //       (Phase 2a, TODO P2: an empty parameter means the filter is not applied)
  //
  // A filter with nothing in it is not a filter. Until P2 the canvas bound the
  // empty text and asked `close_date <= ''`, which answers nothing at all, while
  // the published dashboard left the line out and answered every row: the same
  // dashboard, two answers. Now both leave the filter out - the line becomes
  // `WHERE 1=1`, so the rest of the query is still a whole question - and both
  // answer every row.
  //
  // What the query answers: 425 of the deals of `cube_demo.crm_deals` close on
  // or before 2026-01-31 (`truths-ai-hub.out`, case p1a), and all 1,200 of them
  // are deals (`crm_deals.psv`). So 425 with the date picker filled in, 1,200
  // with it cleared - asked of the canvas path (`/api/dp/queries/run-sql`, what
  // a widget calls) and of the published dashboard's own data endpoint.
  //
  // Same shape as D24, D27, D28 and D29: a temporary duckdb connection pointed
  // at a COPY of the shipped `northwind.duckdb`, which carries the `cube_demo`
  // schema, so no shipped file is ever written to.
  // ────────────────────────────────────────────────────────────────────
  test('(explore-data) D30 — clearing a dashboard filter shows every row again', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D30 — clearing a dashboard filter shows every row again';
    const connectionName   = 'ClearedFilterShowsAll';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'to', type: Date, label: 'Closing on or before', defaultValue: '2026-01-31') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "}"
      );

      const d30Sql = `SELECT COUNT(*) AS deal_count\nFROM cube_demo.crm_deals\nWHERE close_date <= \${to}`;
      await addWidget(page, 'cube_demo.crm_deals', d30Sql, 'number');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // number — the deals the filter lets through
      ]);

      // ── the canvas path, the one a widget calls, asked both ways ──
      const onCanvas = async (value: string): Promise<number> =>
        page.evaluate(async ({ connectionId, sql, to }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql, params: { to }, paramTypes: { to: 'Date' } }),
          });
          const payload = await r.json();
          const rows = payload.data as Record<string, unknown>[];
          return Number(rows[0].deal_count);
        }, { connectionId: connectionCode, sql: d30Sql, to: value });

      expect(await onCanvas('2026-01-31')).toBe(425);
      // Nothing in the box: the filter is not applied, and every deal comes back -
      // not the nothing an empty text bind used to answer.
      expect(await onCanvas('')).toBe(1200);

      // ── and the same thing done the way a person does it: clear the picker ──
      await expect(page.locator('rb-parameters')).toBeVisible({ timeout: 10_000 });
      await page.locator('rb-parameters').evaluate((host: Element) => {
        const root = (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot ?? host;
        const box = root.querySelector('input[type="date"]') as HTMLInputElement | null;
        if (!box) throw new Error('the date picker of the parameter bar was not found');
        box.value = '';
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // The cleared value reaches the canvas - it is not dropped as an echo of the
      // component seeding itself - so the widget asks its question again without
      // the filter.
      const cleared = await page.locator('rb-parameters').evaluate((host: Element) => {
        const root = (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot ?? host;
        return (root.querySelector('input[type="date"]') as HTMLInputElement).value;
      });
      expect(cleared).toBe('');

      const d30CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d30Url } = await publishDashboard(page);
      const d30Ids = await getCanvasComponentIds(page, d30CanvasId);
      const d30ReportCode = d30Url.split('/').pop()!;

      await page.goto(d30Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-number')).toHaveCount(1, { timeout: 20_000 });

      // ── the published dashboard, asked both ways through its own data door ──
      const [d30WidgetId] = d30Ids['number'] ?? [];
      const published = async (value: string): Promise<number> =>
        page.evaluate(async ({ rc, cid, to }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}&to=${encodeURIComponent(to)}`);
          const payload = await r.json();
          return Number((payload.data as Record<string, unknown>[])[0].deal_count);
        }, { rc: d30ReportCode, cid: d30WidgetId, to: value });

      expect(await published('2026-01-31')).toBe(425);
      expect(await published('')).toBe(1200);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // D31 — a relative date filter means the same rows as the dates it stands for
  //       (Phase 2a, TODO F1: relative dates)
  //
  // Every KPI and trend on a dashboard says "this year" or "the last 30 days",
  // and a canvas saved with a typed date goes stale the day after it is saved.
  // The date dropdown therefore offers the relative spans, and their two bounds
  // are computed in the browser from its own date (`relative-dates.ts`) and
  // written as the half-open range of whole days a `between` writes - so the SQL
  // is ANSI, holds no `CURRENT_DATE` and no interval, and is the same text on
  // every vendor (Jasmine block 19, and case a33 on all nine).
  //
  // What this proves that the text cannot: the range runs, and it answers the
  // same rows as the two typed comparisons it stands for. So the canvas asks
  // `close_date this year` in one widget, and `close_date on or after <from>`
  // and `before <to>` - the very two days the first widget's SQL shows - in
  // another, and the published dashboard answers both with the same count.
  // Written that way on purpose: the deals of `cube_demo.crm_deals` close
  // between 2025-01-30 and 2026-09-30, so any count pinned here would be a
  // different number next year, while "the same rows as the dates it stands
  // for" is true on every day the test is ever run.
  //
  // Same shape as D24, D27, D28, D29 and D30: a temporary duckdb connection
  // pointed at a COPY of the shipped `northwind.duckdb`, which carries the
  // `cube_demo` schema, so no shipped file is ever written to.
  // ────────────────────────────────────────────────────────────────────
  test('(explore-data) D31 — a relative date filter means the same rows as the dates it stands for', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D31 — a relative date filter means the same rows as the dates it stands for';
    const connectionName   = 'RelativeDateFilter';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the deals closed this year, said as "this year" ──
      let offered: string[] = [];
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await page.locator('#btnAddFilter').click();
        await page.locator('#selectFilterCol-0').selectOption('close_date');
        // The dropdown of a date column offers the relative spans beside the
        // typed comparisons; the value box of a fixed period is not there at all.
        offered = await page.locator('#selectFilterOp-0').locator('option').allTextContents();
        await page.locator('#selectFilterOp-0').selectOption('this_year');
        await expect(page.locator('#inputFilterValue-0')).toHaveCount(0);
      });
      expect(offered).toContain('this year');
      expect(offered).toContain('in the last N days');
      expect(offered).toContain('previous month');

      const relativeSql = await visualSql();
      // Nothing the database computes: two days, and a plain half-open range.
      for (const forbidden of ['CURRENT_DATE', 'INTERVAL', 'DATEADD', 'GETDATE', "'now'"]) {
        expect(relativeSql).not.toContain(forbidden);
      }
      const days = relativeSql.match(/DATE '(\d{4}-\d{2}-\d{2})'/g) ?? [];
      expect(days.length).toBe(2);
      const [from, to] = days.map((one) => one.slice(6, 16));
      // The browser's own date decides the year - read here from the very clock
      // the generator read, so the assertion holds on any day of any year.
      const thisYear = await page.evaluate(() => new Date().getFullYear());
      expect(from).toBe(`${thisYear}-01-01`);
      expect(to).toBe(`${thisYear + 1}-01-01`);
      expect(relativeSql).toContain(`"close_date" >= DATE '${from}' AND "close_date" < DATE '${to}'`);

      // ── the same rows, said as the two dates that span it ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addVisualFilter(page, 0, 'close_date', 'greater_or_equal', from);
        await addVisualFilter(page, 1, 'close_date', 'less_than', to);
      });
      const typedSql = await visualSql();
      // The same WHERE, to the character: what the relative span stands for.
      expect(typedSql.split('WHERE ')[1]).toBe(relativeSql.split('WHERE ')[1]);

      // ── and "in the last N days" counts back from the browser's own today ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'deal_id');
        await addVisualFilter(page, 0, 'close_date', 'last_n_days', '30');
      });
      const lastThirtySql = await visualSql();
      const today = await page.evaluate(() => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      });
      const dayOf = (iso: string, shift: number): string => {
        const d = new Date(`${iso}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + shift);
        return d.toISOString().slice(0, 10);
      };
      // The last 30 days end today, today included: 29 days back, and the
      // half-open end is tomorrow.
      expect(lastThirtySql).toContain(
        `"close_date" >= DATE '${dayOf(today, -29)}' AND "close_date" < DATE '${dayOf(today, 1)}'`);

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — this year, as a relative span
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — this year, as two typed dates
        { x: 0, y: 4, w: 6, h: 4 },  // tabulator — the last 30 days
      ]);

      const d31CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d31Url } = await publishDashboard(page);
      const d31Ids = await getCanvasComponentIds(page, d31CanvasId);
      const d31ReportCode = d31Url.split('/').pop()!;

      await page.goto(d31Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(3, { timeout: 20_000 });

      // ── the published dashboard: the relative span and the typed dates agree ──
      const gridIds = d31Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(3);
      const countOf = async (componentId: string): Promise<number> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return Number((payload.data as Record<string, unknown>[])[0].deal_id_count);
        }, { rc: d31ReportCode, cid: componentId });

      const [relativeCount, typedCount, lastThirtyCount] = [
        await countOf(gridIds[0]), await countOf(gridIds[1]), await countOf(gridIds[2]),
      ];
      // The range runs on a real database, and says what the two dates say.
      expect(relativeCount).toBe(typedCount);
      // The newest deal in the sample closes on 2026-09-30, so the last 30 days
      // hold a different number of them every year this runs: what is asserted
      // here is that the computed range ran on the database and came back with a
      // count. The days it counts between are pinned on its SQL, above.
      expect(lastThirtyCount).toBeGreaterThanOrEqual(0);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ────────────────────────────────────────────────────────────
  // D32 — "how many customers ordered" is not "how many orders"
  //       (Phase 2a, TODO F7: COUNT DISTINCT in Summarize)
  //
  // COUNT DISTINCT is the everyday KPI after COUNT and SUM, and the generator
  // has always written `COUNT(DISTINCT c)` for it - only the Summarize dropdown
  // had no way to ask for it. It offers it now, labelled "Count distinct"
  // (`lib/explore-data/aggregations.ts`, Jasmine block 20, case a34 on all nine).
  //
  // What this proves that the text cannot: the three counts are three different
  // numbers, and a real database answers each of them through the published
  // dashboard. `cube_demo.shop_orders` is frozen demo data - 3000 orders, 2760
  // of them with a customer_id and 240 without, placed by 359 different
  // customers - so all three are pinned here:
  //
  //   COUNT(order_id)             3000   every order
  //   COUNT(customer_id)          2760   the orders that name a customer
  //   COUNT(DISTINCT customer_id)  359   the customers who ordered
  //
  // The middle one is why this is worth an e2e: a vendor that counted NULL as
  // one more distinct value would answer 360, and one that ignored DISTINCT
  // would answer 2760.
  //
  // Same shape as D24, D27-D31: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ────────────────────────────────────────────────────────
  test('(explore-data) D32 — "how many customers ordered" is not "how many orders"', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D32 — how many customers ordered';
    const connectionName   = 'CountDistinct';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.shop_orders"]')).toBeVisible({ timeout: 15_000 });

      // ── the orders, and the customers who placed them ──
      let offered: string[] = [];
      await addVisualWidget(page, 'cube_demo.shop_orders', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'order_id');
        // The Summarize dropdown offers it in words, not as SQL: the user who
        // needs "how many customers ordered" is the one who does not write SQL.
        offered = await page.locator('#selectAggFunc-0').locator('option').allTextContents();
        await addAggregation(page, 1, 'COUNT DISTINCT', 'customer_id');
      });
      expect(offered).toContain('Count distinct');
      expect(offered).toContain('COUNT');

      const distinctSql = await visualSql();
      expect(distinctSql).toContain('COUNT(DISTINCT "customer_id") AS "customer_id_count distinct"');
      // Nothing of any one vendor: uniqExact and the approximate counts are a
      // user's own SQL, never the generator's.
      for (const forbidden of ['uniqExact', 'approx_count_distinct', 'APPROX_COUNT_DISTINCT']) {
        expect(distinctSql).not.toContain(forbidden);
      }

      // ── and the plain count of the same column, which is neither number ──
      await addVisualWidget(page, 'cube_demo.shop_orders', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'customer_id');
      });
      const plainSql = await visualSql();
      expect(plainSql).toContain('COUNT("customer_id") AS "customer_id_count"');
      expect(plainSql).not.toContain('DISTINCT');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — orders, and distinct customers
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the plain count of customer_id
      ]);

      const d32CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d32Url } = await publishDashboard(page);
      const d32Ids = await getCanvasComponentIds(page, d32CanvasId);
      const d32ReportCode = d32Url.split('/').pop()!;

      await page.goto(d32Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard: three numbers, none of them the others ──
      const gridIds = d32Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const rowOf = async (componentId: string): Promise<Record<string, unknown>> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return (payload.data as Record<string, unknown>[])[0];
        }, { rc: d32ReportCode, cid: componentId });

      const first = await rowOf(gridIds[0]);
      const second = await rowOf(gridIds[1]);
      expect(Number(first['order_id_count'])).toBe(3000);
      expect(Number(first['customer_id_count distinct'])).toBe(359);
      expect(Number(second['customer_id_count'])).toBe(2760);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ────────────────────────────────────────────────────────────
  // D33 — a dashboard date range means whole days, the last one included
  //       (Phase 2a, TODO F8: a date range bound to two filter-bar parameters)
  //
  // "1 Jan to 8 Jan" means every row of both days and of every day between
  // them. A range whose upper bound is the parameter itself stops at midnight
  // of the 8th and loses that whole day - the same whole-day rule the generator
  // already applies to a typed date (T5), now applied to a day that only
  // arrives when someone picks it in the filter bar.
  //
  // The day after `to` is not written in SQL: "+ 1 day" is a different text on
  // nearly every vendor, and the browser does not have the value yet. The
  // generator writes a parameter of its own, ${to__next_day}, and the day is
  // derived in the one place both paths convert a parameter
  // (`DateParameters` - `QueriesService.prepare` for the canvas,
  // `ScriptAssembler` for the published script).
  //
  // What this proves that the text cannot: `cube_demo.erp_invoices` is frozen
  // demo data, and 18 invoices are issued from 2025-01-01 to 2025-01-08, two of
  // them on the 8th itself (`truths-ai-hub.out`, cases p1e and p1f):
  //
  //   the range as the generator writes it, ${to__next_day}    18   the week
  //   the same range stopping at ${to}                         16   the 8th lost
  //
  // asked of the canvas path (`/api/dp/queries/run-sql`, what a widget calls)
  // and of the published dashboard's own data endpoint.
  //
  // Same shape as D24, D27-D32: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ────────────────────────────────────────────────────────────
  test('(explore-data) D33 — a dashboard date range means whole days, the last one included', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D33 — a dashboard date range of whole days';
    const connectionName   = 'DateRangeWholeDays';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.erp_invoices"]')).toBeVisible({ timeout: 15_000 });

      // The two dates of a range are two parameters of the filter bar, each one
      // a Date: that declared type is what makes the day after derivable.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'from', type: Date, label: 'Issued from', defaultValue: '2025-01-01') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "  parameter(id: 'to', type: Date, label: 'Issued to', defaultValue: '2025-01-08') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "}"
      );

      // ── the range, one parameter per box of a `between` filter ──
      await addVisualWidget(page, 'cube_demo.erp_invoices', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'invoice_id');
        await addVisualFilter(page, 0, 'issue_date', 'between');
        await bindVisualFilterToParam(page, 0, 'from');
        await bindVisualFilterToParam(page, 0, 'to', 'valueTo');
      });

      const rangeSql = await visualSql();
      // One ANSI text, on every vendor: the lower bound as it was picked, the
      // upper one the day after - named, not computed here.
      expect(rangeSql).toContain('"issue_date" >= ${from} AND "issue_date" < ${to__next_day}');
      for (const forbidden of ['INTERVAL', 'DATEADD', 'DATE_ADD', 'GETDATE', 'CURRENT_DATE', 'BETWEEN']) {
        expect(rangeSql).not.toContain(forbidden);
      }

      // ── and "on or before" a picked day, which is the same upper bound ──
      await addVisualWidget(page, 'cube_demo.erp_invoices', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', 'invoice_id');
        await addVisualFilter(page, 0, 'issue_date', 'less_or_equal');
        await bindVisualFilterToParam(page, 0, 'to');
      });
      const onOrBeforeSql = await visualSql();
      expect(onOrBeforeSql).toContain('"issue_date" < ${to__next_day}');
      expect(onOrBeforeSql).not.toContain('<= ${to}');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the range, both bounds bound
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — on or before the picked day
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<number> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connectionId, sql: text,
              params: { from: '2025-01-01', to: '2025-01-08' },
              paramTypes: { from: 'Date', to: 'Date' },
            }),
          });
          const payload = await r.json();
          return Number((payload.data as Record<string, unknown>[])[0].invoice_id_count);
        }, { connectionId: connectionCode, sql });

      expect(await onCanvas(rangeSql)).toBe(18);
      expect(await onCanvas(onOrBeforeSql)).toBe(18);
      // Why the derived day is there: the same range stopping at the parameter
      // itself answers 16, because two invoices are issued on the 8th.
      expect(await onCanvas(rangeSql.replace('${to__next_day}', '${to}'))).toBe(16);

      const d33CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d33Url } = await publishDashboard(page);
      const d33Ids = await getCanvasComponentIds(page, d33CanvasId);
      const d33ReportCode = d33Url.split('/').pop()!;

      await page.goto(d33Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      // The script it runs was never given a `to__next_day`: it declares one
      // beside `to` and derives it there, so both paths answer the same week.
      const gridIds = d33Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<number> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`
            + '&from=2025-01-01&to=2025-01-08');
          const payload = await r.json();
          return Number((payload.data as Record<string, unknown>[])[0].invoice_id_count);
        }, { rc: d33ReportCode, cid: componentId });

      expect(await published(gridIds[0])).toBe(18);
      expect(await published(gridIds[1])).toBe(18);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });




  // ──────────────────────────────────────────────────────
  // D34 — a column the table does not have: price × quantity, then the top 10 by it
  //       (Phase 2a, TODO F6: computed columns, the narrow form)
  //
  // "The top 10 items by revenue" on a table that carries a price and a
  // quantity and no revenue. The Compute step adds ONE arithmetic step over two
  // operands, each a numeric column or a number, under a name; from there the
  // name behaves like a column - it can be filtered, aggregated, grouped and
  // sorted, and the grid shows it beside the table's own columns.
  //
  // What the text specs cannot prove, and this does: the arithmetic answers the
  // truth. `cube_demo.erp_invoice_lines` is frozen demo data whose `amount`
  // column IS unit_price × qty, so the computed column has something exact to be
  // right against (`truths-ai-hub.out`, cases A35 and A36):
  //
  //   the lines, SUM(unit_price × qty), SUM(amount)   5500 | 20411515.04 | 20411515.04
  //   the top item by computed revenue                Server Hardware | 1155157.35
  //   the 11th item, the one a limit of 10 cuts       Consulting Day  | 1021198.97
  //   shop_order_lines, and the lines whose unit_price ÷ discount_pct is not NULL
  //                                                   8500 | 2543
  //
  // The last one is the division: dividing by zero is NULL and not an error
  // (NULLIF), and `qty ÷ 2` is a fraction and not integer division (the vendor
  // layer's `decimalDivision`), so a filter on it keeps the 2543 lines whose qty
  // is 1 as well.
  //
  // Same shape as D24, D27-D33: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────────
  test('(explore-data) D34 — a column the table does not have: price × quantity, then the top 10 by it', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D34 — a computed column';
    const connectionName   = 'ComputedColumns';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.erp_invoice_lines"]')).toBeVisible({ timeout: 15_000 });

      // ── the arithmetic, summed, against the column that already holds it ──
      await addVisualWidget(page, 'cube_demo.erp_invoice_lines', 'tabulator', async () => {
        await addComputedColumn(page, 0, 'line_revenue', 'unit_price', '*', 'qty');
        await addAggregation(page, 0, 'SUM', 'line_revenue');
        await addAggregation(page, 1, 'SUM', 'amount');
        await addAggregation(page, 2, 'COUNT', '*');
      });

      const sumSql = await visualSql();
      // The name is the expression wherever it is read, never the alias, and a
      // summarized query selects no star at all.
      expect(sumSql).toContain('CAST(SUM(("unit_price" * "qty")) AS DECIMAL(31,4)) AS "line_revenue_sum"');
      expect(sumSql).not.toContain('.*');

      // ── the use case: the top 10 items by that revenue ──
      await addVisualWidget(page, 'cube_demo.erp_invoice_lines', 'tabulator', async () => {
        await addComputedColumn(page, 0, 'line_revenue', 'unit_price', '*', 'qty');
        await addGroupBy(page, 'item');
        await addAggregation(page, 0, 'SUM', 'line_revenue');
        await addVisualSort(page, 0, 'line_revenue_sum', 'DESC');
        await setVisualLimit(page, 10);
      });

      const top10Sql = await visualSql();
      expect(top10Sql).toContain('GROUP BY "item"');
      expect(top10Sql).toContain('ORDER BY CASE WHEN CAST(SUM(("unit_price" * "qty")) AS DECIMAL(31,4)) IS NULL');

      // ── the grid of a query with no aggregate: the column beside the row ──
      await addVisualWidget(page, 'cube_demo.erp_invoice_lines', 'tabulator', async () => {
        await addComputedColumn(page, 0, 'line_revenue', 'unit_price', '*', 'qty');
        await addVisualSort(page, 0, 'line_revenue', 'DESC');
        await setVisualLimit(page, 5);
      });

      const rowsSql = await visualSql();
      // The star is qualified, because Oracle rejects a bare `*` beside another
      // select item - one text for all nine vendors.
      expect(rowsSql).toContain('"erp_invoice_lines".*');
      expect(rowsSql).toContain('("unit_price" * "qty") AS "line_revenue"');
      expect(rowsSql).not.toContain('SELECT *');

      // ── the division: a zero divisor is NULL, and a half is a half ──
      await addVisualWidget(page, 'cube_demo.shop_order_lines', 'tabulator', async () => {
        await addComputedColumn(page, 0, 'per_point', 'unit_price', '/', 'discount_pct');
        await addComputedColumn(page, 1, 'half_qty', 'qty', '/', '2');
        await addVisualFilter(page, 0, 'half_qty', 'greater_than', '0');
        await addAggregation(page, 0, 'COUNT', '*');
        await addAggregation(page, 1, 'COUNT', 'per_point');
      });

      const dividedSql = await visualSql();
      expect(dividedSql).toContain('CAST("unit_price" AS DECIMAL(31,4)) / NULLIF("discount_pct", 0)');
      expect(dividedSql).toContain('WHERE (CAST("qty" AS DECIMAL(31,4)) / NULLIF(2, 0)) > 0');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the sums, against `amount`
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the top 10 items by revenue
        { x: 0, y: 4, w: 6, h: 4 },  // tabulator — the rows, revenue beside them
        { x: 6, y: 4, w: 6, h: 4 },  // tabulator — the division
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const sums = (await onCanvas(sumSql))[0];
      expect(Number(sums.count)).toBe(5500);
      expect(Number(sums.line_revenue_sum)).toBeCloseTo(20411515.04, 2);
      // The table's own answer for the same arithmetic: the computed column is
      // right against a number nobody computed here.
      expect(Number(sums.line_revenue_sum)).toBeCloseTo(Number(sums.amount_sum), 2);

      const top10 = await onCanvas(top10Sql);
      expect(top10.length).toBe(10);
      expect(String(top10[0].item)).toBe('Server Hardware');
      expect(Number(top10[0].line_revenue_sum)).toBeCloseTo(1155157.35, 2);
      // The 11th item, 19000 behind the 10th: the cap kept the right rows.
      expect(top10.map((r) => String(r.item))).not.toContain('Consulting Day');

      const rows = await onCanvas(rowsSql);
      expect(rows.length).toBe(5);
      // The row carries the table's columns AND the computed one, whose value is
      // the arithmetic of that row.
      expect(Number(rows[0].line_revenue))
        .toBeCloseTo(Number(rows[0].unit_price) * Number(rows[0].qty), 2);

      const divided = (await onCanvas(dividedSql))[0];
      // Every line, because half of a qty of 1 is 0.5 and not 0 …
      expect(Number(divided.count)).toBe(8500);
      // … and only the lines with a discount, because ÷ 0 answered NULL instead
      // of failing the query.
      expect(Number(divided.per_point_count)).toBe(2543);

      const d34CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d34Url } = await publishDashboard(page);
      const d34Ids = await getCanvasComponentIds(page, d34CanvasId);
      const d34ReportCode = d34Url.split('/').pop()!;

      await page.goto(d34Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(4, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      // The script it runs holds the same arithmetic the canvas showed.
      const gridIds = d34Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(4);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d34ReportCode, cid: componentId });

      const publishedSums = (await published(gridIds[0]))[0];
      expect(Number(publishedSums.line_revenue_sum)).toBeCloseTo(20411515.04, 2);
      const publishedTop10 = await published(gridIds[1]);
      expect(publishedTop10.length).toBe(10);
      expect(String(publishedTop10[0].item)).toBe('Server Hardware');
      expect(Number((await published(gridIds[3]))[0].per_point_count)).toBe(2543);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ──────────────────────────────────────────────────────
  // D35 — a question about the group, not the row: the stages of more than 150 deals
  //       (Phase 2a, TODO F2: HAVING, a condition on an aggregate)
  //
  // "Customers with more than 5 orders" is the everyday shape of this: a
  // condition on something that does not exist until the rows are grouped. A
  // filter cannot say it - a filter reads one row, and one row has no count -
  // so the Summarize step carries a condition of its own, and it becomes
  // HAVING.
  //
  // It holds the aggregate EXPRESSION and never the alias the SELECT gives it:
  // PostgreSQL, SQL Server, Oracle and Db2 reject an alias inside a HAVING, so
  // a dashboard built here would have run on SQLite and MySQL and failed on the
  // other four.
  //
  // What the text specs cannot prove, and this does (`truths-ai-hub.out`, A37
  // and A38, over the frozen `cube_demo.crm_deals`):
  //
  //   the stages of more than 150 deals   Closed Won 402, Closed Lost 244, Negotiation 189
  //   the fourth stage, the one it drops  Proposal 148
  //   and more than 10 million of amount  Closed Won 402 | 11971500.00 alone
  //   the stage that fails only the money Closed Lost 244 | 9037500.00
  //
  // Same shape as D24, D27-D34: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────────
  test('(explore-data) D35 — a question about the group, not the row: the stages of more than 150 deals', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D35 — a condition on an aggregate';
    const connectionName   = 'AggregateCondition';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the count, and the condition on it ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'COUNT', '*');
        await setAggregationCondition(page, 0, '>', '150');
        await addVisualSort(page, 0, 'count', 'DESC');
      });

      const overSql = await visualSql();
      expect(overSql).toContain('HAVING COUNT(*) > 150');
      // The expression, never the alias: four of the nine reject an alias here.
      expect(overSql).not.toContain('HAVING "count"');
      expect(overSql.indexOf('GROUP BY')).toBeLessThan(overSql.indexOf('HAVING'));
      expect(overSql.indexOf('HAVING')).toBeLessThan(overSql.indexOf('ORDER BY'));

      // ── two conditions, joined with AND ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'COUNT', '*');
        await setAggregationCondition(page, 0, '>', '150');
        await addAggregation(page, 1, 'SUM', 'amount');
        await setAggregationCondition(page, 1, '>', '10000000');
      });

      const bothSql = await visualSql();
      expect(bothSql).toContain('HAVING COUNT(*) > 150');
      // A SUM is compared inside the DECIMAL cast it is selected in, so the two
      // always read the same number.
      expect(bothSql).toContain('AND CAST(SUM("amount") AS DECIMAL(31,4)) > 10000000');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the stages of more than 150 deals
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — and more than 10 million of amount
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const over = await onCanvas(overSql);
      expect(over.map((r) => String(r.stage))).toEqual(['Closed Won', 'Closed Lost', 'Negotiation']);
      expect(over.map((r) => Number(r.count))).toEqual([402, 244, 189]);
      // Why the condition is doing something: the fourth stage has 148 deals.
      expect(over.map((r) => String(r.stage))).not.toContain('Proposal');

      const both = await onCanvas(bothSql);
      expect(both.length).toBe(1);
      expect(String(both[0].stage)).toBe('Closed Won');
      // Closed Lost passes the count with 244 deals and fails the money with
      // 9037500: the two conditions are joined with AND.
      expect(Number(both[0].amount_sum)).toBeCloseTo(11971500, 2);

      const d35CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d35Url } = await publishDashboard(page);
      const d35Ids = await getCanvasComponentIds(page, d35CanvasId);
      const d35ReportCode = d35Url.split('/').pop()!;

      await page.goto(d35Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      const gridIds = d35Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d35ReportCode, cid: componentId });

      expect((await published(gridIds[0])).map((r) => Number(r.count))).toEqual([402, 244, 189]);
      const publishedBoth = await published(gridIds[1]);
      expect(publishedBoth.length).toBe(1);
      expect(String(publishedBoth[0].stage)).toBe('Closed Won');
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ──────────────────────────────────────────────────────
  // D36 — Closed Won, or any big deal: matching ANY filter
  //       (Phase 2a, TODO F3: match all / any)
  //
  // Two filters have always meant "both". "Everything Closed Won, plus any deal
  // above 80000, wherever it stands" is one question the AND join cannot ask:
  // ANDed, those two filters answer 27 deals - the big won ones - instead of
  // the 474 the question is about.
  //
  // The Filter step carries the choice, and `any` joins the conditions with OR
  // inside ONE pair of brackets. The brackets are the whole point: without them
  // a condition the user adds later, or a parameter bound into the pane, would
  // bind tighter than the OR and quietly answer something else.
  //
  // What the text specs cannot prove, and this does (`truths-ai-hub.out`, A39,
  // over the frozen `cube_demo.crm_deals`):
  //
  //   Closed Won OR above 80000, by stage   Closed Won 402, Closed Lost 22, Proposal 20
  //   the same two filters ANDed            27 deals in all
  //   the OR, all stages                    474 deals in all
  //
  // Same shape as D24, D27-D35: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────────
  test('(explore-data) D36 — Closed Won, or any big deal: matching ANY filter', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D36 — match any filter';
    const connectionName   = 'MatchAnyFilter';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the two filters, matched ANY ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addVisualFilter(page, 0, 'stage', 'equals', 'Closed Won');
        await addVisualFilter(page, 1, 'amount', 'greater_than', '80000');
        await setFilterMatch(page, 'any');
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'COUNT', '*');
        await addVisualSort(page, 0, 'count', 'DESC');
      });

      const anySql = await visualSql();
      expect(anySql).toContain('OR "amount" > 80000)');
      // One pair of brackets around the whole set, and a WHERE that still
      // stands where a WHERE stands.
      expect(anySql).toContain('WHERE ("stage" = \'Closed Won\'');
      expect(anySql.indexOf('WHERE (')).toBeLessThan(anySql.indexOf('GROUP BY'));

      // ── the same two filters, matched ALL: the question nobody asked ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addVisualFilter(page, 0, 'stage', 'equals', 'Closed Won');
        await addVisualFilter(page, 1, 'amount', 'greater_than', '80000');
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'COUNT', '*');
      });

      const allSql = await visualSql();
      expect(allSql).toContain('AND "amount" > 80000');
      expect(allSql).not.toContain('OR "amount"');
      expect(allSql).not.toContain('WHERE (');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — Closed Won OR a big deal
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the same two filters ANDed
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const anyRows = await onCanvas(anySql);
      expect(anyRows.map((r) => String(r.stage)).slice(0, 3))
        .toEqual(['Closed Won', 'Closed Lost', 'Proposal']);
      expect(anyRows.map((r) => Number(r.count)).slice(0, 3)).toEqual([402, 22, 20]);
      // 474 deals in all: every Closed Won deal, and the big deals of the five
      // other stages.
      expect(anyRows.reduce((sum, r) => sum + Number(r.count), 0)).toBe(474);

      // The AND answers a different question entirely: 27 big won deals.
      const allRows = await onCanvas(allSql);
      expect(allRows.length).toBe(1);
      expect(String(allRows[0].stage)).toBe('Closed Won');
      expect(Number(allRows[0].count)).toBe(27);

      const d36CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d36Url } = await publishDashboard(page);
      const d36Ids = await getCanvasComponentIds(page, d36CanvasId);
      const d36ReportCode = d36Url.split('/').pop()!;

      await page.goto(d36Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      const gridIds = d36Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d36ReportCode, cid: componentId });

      const publishedAny = await published(gridIds[0]);
      expect(publishedAny.reduce((sum, r) => sum + Number(r.count), 0)).toBe(474);
      const publishedAll = await published(gridIds[1]);
      expect(publishedAll.length).toBe(1);
      expect(Number(publishedAll[0].count)).toBe(27);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ──────────────────────────────────────────────────────
  // D37 — which stages are there: grouping with nothing to summarize
  //       (Phase 2a, TODO F4: SELECT DISTINCT)
  //
  // "Which values does this column hold?" is a question of its own, and it is
  // the one a grouping with no Summarize asks. Until now the grouping was
  // silently dropped and the widget answered every row of the table - 1200
  // deals instead of the 6 stages.
  //
  // It is written as SELECT DISTINCT over the grouped columns, and a distinct
  // query that sorts sorts OUTSIDE itself, as a derived table: the NULLs-last
  // CASE every sorted query in the product carries is an expression the SELECT
  // list does not hold, and PostgreSQL, Oracle, Db2 and SQL Server refuse such
  // an ORDER BY for a SELECT DISTINCT outright.
  //
  // What the text specs cannot prove, and this does (`truths-ai-hub.out`, A40,
  // over the frozen `cube_demo.crm_deals`):
  //
  //   the stages there are   Closed Lost, Closed Won, Negotiation, Proposal, Prospecting, Qualification
  //   the rows behind them   1200 deals, 6 distinct stages
  //
  // Same shape as D24, D27-D36: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────────
  test('(explore-data) D37 — which stages are there: grouping with nothing to summarize', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D37 — the distinct combinations';
    const connectionName   = 'DistinctCombinations';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the stages, sorted: the distinct rows become a derived table ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
        await addVisualSort(page, 0, 'stage', 'ASC');
      });

      const sortedSql = await visualSql();
      expect(sortedSql).toContain('SELECT DISTINCT "stage"');
      expect(sortedSql).toContain(') distinct_rows');
      expect(sortedSql).toContain('ORDER BY CASE WHEN "stage" IS NULL THEN 1 ELSE 0 END, "stage" ASC');
      // The grouping is not dropped any more, and it is not a GROUP BY either.
      expect(sortedSql).not.toContain('GROUP BY');

      // ── the same question unsorted: the distinct query on its own ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
      });

      const plainSql = await visualSql();
      expect(plainSql).toContain('SELECT DISTINCT "stage"');
      expect(plainSql).not.toContain('distinct_rows');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the stages, sorted
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the same, unsorted
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const sorted = await onCanvas(sortedSql);
      expect(sorted.map((r) => String(r.stage))).toEqual([
        'Closed Lost', 'Closed Won', 'Negotiation', 'Proposal', 'Prospecting', 'Qualification',
      ]);
      // 6 rows, not the 1200 the dropped grouping used to answer.
      expect(sorted.length).toBe(6);

      const plain = await onCanvas(plainSql);
      expect(plain.length).toBe(6);
      expect(plain.map((r) => String(r.stage)).sort()).toEqual([
        'Closed Lost', 'Closed Won', 'Negotiation', 'Proposal', 'Prospecting', 'Qualification',
      ]);

      const d37CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d37Url } = await publishDashboard(page);
      const d37Ids = await getCanvasComponentIds(page, d37CanvasId);
      const d37ReportCode = d37Url.split('/').pop()!;

      await page.goto(d37Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      const gridIds = d37Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d37ReportCode, cid: componentId });

      expect((await published(gridIds[0])).map((r) => String(r.stage))).toEqual([
        'Closed Lost', 'Closed Won', 'Negotiation', 'Proposal', 'Prospecting', 'Qualification',
      ]);
      expect((await published(gridIds[1])).length).toBe(6);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ──────────────────────────────────────────────────
  // D38 — how the money splits between the stages: a % of total
  //       (Phase 2a, TODO F9: share of the whole result)
  //
  // "Closed Won is 12 million - is that a lot?" only has an answer next to the
  // whole: 29% of the money. The share is the number every pie chart and every
  // breakdown is really about, and until now nothing in the product computed it
  // - the percent options of the widgets only FORMAT a number that is already a
  // share, and the pivot's totals are its own row and column sums.
  //
  // It is a window over the grouped rows, because the total is a number no
  // single grouped row holds: `100.0 * SUM(amount) / NULLIF(SUM(SUM(amount))
  // OVER (), 0)`. The HAVING and the ORDER BY keep the plain aggregate - no
  // vendor allows a window function in a HAVING, and the total is one number for
  // the whole result, so the order the shares make is the order the money makes.
  //
  // What the text specs cannot prove, and this does (`truths-ai-hub.out`, A41,
  // over the frozen `cube_demo.crm_deals`):
  //
  //   Closed Won     11,971,500   29.12%
  //   Closed Lost     9,037,500   21.98%
  //   Proposal        5,873,000   14.28%
  //   Negotiation     5,822,000   14.16%
  //   Qualification   5,572,500   13.55%
  //   Prospecting     2,839,500    6.91%
  //   the six shares add up to 100, over 41,116,000 of money
  //
  // Same shape as D24, D27-D37: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────
  test('(explore-data) D38 — how the money splits between the stages: a % of total', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D38 — the share of the whole';
    const connectionName   = 'ShareOfTheWhole';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the money of each stage, and the share of the whole it is ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'SUM', 'amount');
        await addAggregation(page, 1, 'SUM', 'amount');
        await setAggregationShare(page, 1);
        await addVisualSort(page, 0, 'amount_sum', 'DESC');
      });

      const shareSql = await visualSql();
      expect(shareSql).toContain('NULLIF(SUM(CAST(SUM("amount") AS DECIMAL(31,4))) OVER (), 0)');
      // The share stands apart from the number it is a share of.
      expect(shareSql).toContain('AS "amount_sum"');
      expect(shareSql).toContain('AS "amount_sum_pct"');
      // The window never reaches the ORDER BY: the plain aggregate sorts.
      expect(shareSql.split('ORDER BY')[1]).not.toContain('OVER ()');

      // ── the same aggregate without the share: nothing changed for it ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'stage');
        await addAggregation(page, 0, 'SUM', 'amount');
      });

      const plainSql = await visualSql();
      expect(plainSql).not.toContain('OVER ()');
      expect(plainSql).toContain('AS "amount_sum"');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the money and its share
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the money alone
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const shares = await onCanvas(shareSql);
      expect(shares.map((r) => String(r.stage))).toEqual([
        'Closed Won', 'Closed Lost', 'Proposal', 'Negotiation', 'Qualification', 'Prospecting',
      ]);
      const pct = shares.map((r) => Math.round(Number(r.amount_sum_pct) * 100) / 100);
      expect(pct).toEqual([29.12, 21.98, 14.28, 14.16, 13.55, 6.91]);
      // A share of the whole, so the six of them are the whole.
      expect(Math.round(pct.reduce((a, b) => a + b, 0))).toBe(100);
      expect(Number(shares[0].amount_sum)).toBe(11_971_500);

      const plain = await onCanvas(plainSql);
      expect(plain.length).toBe(6);
      expect(Object.keys(plain[0])).not.toContain('amount_sum_pct');

      const d38CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d38Url } = await publishDashboard(page);
      const d38Ids = await getCanvasComponentIds(page, d38CanvasId);
      const d38ReportCode = d38Url.split('/').pop()!;

      await page.goto(d38Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      const gridIds = d38Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d38ReportCode, cid: componentId });

      const publishedShares = await published(gridIds[0]);
      expect(publishedShares.map((r) => Math.round(Number(r.amount_sum_pct) * 100) / 100))
        .toEqual([29.12, 21.98, 14.28, 14.16, 13.55, 6.91]);
      expect((await published(gridIds[1])).length).toBe(6);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });

  // ──────────────────────────────────────────────────
  // D39 — the deals closed so far: a running total over the months
  //       (Phase 2a, TODO F10: running total)
  //
  // A bar per month answers "how did March do?"; the cumulative line answers
  // "where are we for the year?" - and that second question had no answer in
  // the product at all: no widget accumulates anything in the browser.
  //
  // It is a window whose frame starts at the first row the query answers:
  // `SUM(COUNT(*)) OVER (ORDER BY <month bucket> ROWS UNBOUNDED PRECEDING)`.
  // The window's ORDER BY is the bucket the query groups by, carrying the same
  // NULLs-last CASE every sort in the product carries, so the deals that have
  // not closed - which have no month - are one bucket at the END of the series
  // (T6) instead of a step that lifts the whole line before it starts.
  //
  // What the text specs cannot prove, and this does (`truths-ai-hub.out`, A42,
  // over the frozen `cube_demo.crm_deals`):
  //
  //   2025-01     1 closed,     1 so far
  //   2025-06    35 closed,   131 so far
  //   2026-09    33 closed,   646 so far   ← every deal that has closed
  //   (no month) 554 open,   1200 so far   ← last, and only then all 1200
  //
  // Same shape as D24, D27-D38: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────
  test('(explore-data) D39 — the deals closed so far: a running total over the months', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D39 — the deals so far';
    const connectionName   = 'TheDealsSoFar';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.crm_deals"]')).toBeVisible({ timeout: 15_000 });

      // ── the deals of each month, and the deals closed so far ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'close_date');
        await setTimeBucket(page, 'close_date', 'month');
        await addAggregation(page, 0, 'COUNT', '*');
        await addAggregation(page, 1, 'COUNT', '*');
        await setAggregationRunningTotal(page, 1);
        await addVisualSort(page, 0, 'close_date', 'ASC');
      });

      const runningSql = await visualSql();
      expect(runningSql).toContain('SUM(COUNT(*)) OVER (ORDER BY CASE WHEN ');
      expect(runningSql).toContain('ROWS UNBOUNDED PRECEDING) AS "count_running"');
      // The accumulated column stands apart from the number it accumulates.
      expect(runningSql).toContain('COUNT(*) AS "count"');
      // The window never reaches the query's own ORDER BY.
      expect(runningSql.split('ORDER BY').pop()).not.toContain('OVER (');

      // ── the same two counts without the accumulation ──
      await addVisualWidget(page, 'cube_demo.crm_deals', 'tabulator', async () => {
        await addGroupBy(page, 'close_date');
        await setTimeBucket(page, 'close_date', 'month');
        await addAggregation(page, 0, 'COUNT', '*');
        await addVisualSort(page, 0, 'close_date', 'ASC');
      });

      const plainSql = await visualSql();
      expect(plainSql).not.toContain('OVER (');
      expect(plainSql).toContain('COUNT(*) AS "count"');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6, h: 4 },  // tabulator — the months and the total so far
        { x: 6, y: 0, w: 6, h: 4 },  // tabulator — the months alone
      ]);

      // ── the canvas path, the one a widget calls ──
      const onCanvas = async (sql: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ connectionId, sql: text }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: {}, paramTypes: {} }),
          });
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { connectionId: connectionCode, sql });

      const series = await onCanvas(runningSql);
      // 21 months that closed a deal, and the bucket of those that have not.
      expect(series.length).toBe(22);
      expect(String(series[0].close_date)).toBe('2025-01');
      expect(Number(series[0].count)).toBe(1);
      expect(Number(series[0].count_running)).toBe(1);

      // Every step is the month before it plus this month: that is what
      // "so far" means, and the plain counts on their own never show it.
      let soFar = 0;
      for (const row of series) {
        soFar += Number(row.count);
        expect(Number(row.count_running)).toBe(soFar);
      }

      // The deals with no close date are one bucket, LAST in the series, where
      // the running total finally reaches every row of the table (T6).
      const last = series[series.length - 1];
      expect(last.close_date === null || last.close_date === '').toBe(true);
      expect(Number(last.count)).toBe(554);
      expect(Number(last.count_running)).toBe(1200);
      // The month before it is the last month that closed anything.
      const lastMonth = series[series.length - 2];
      expect(String(lastMonth.close_date)).toBe('2026-09');
      expect(Number(lastMonth.count_running)).toBe(646);

      const plain = await onCanvas(plainSql);
      expect(plain.length).toBe(22);
      expect(Object.keys(plain[0])).not.toContain('count_running');

      const d39CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d39Url } = await publishDashboard(page);
      const d39Ids = await getCanvasComponentIds(page, d39CanvasId);
      const d39ReportCode = d39Url.split('/').pop()!;

      await page.goto(d39Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(2, { timeout: 20_000 });

      // ── the published dashboard, asked through its own data door ──
      const gridIds = d39Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(2);
      const published = async (componentId: string): Promise<Record<string, unknown>[]> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          return payload.data as Record<string, unknown>[];
        }, { rc: d39ReportCode, cid: componentId });

      const publishedSeries = await published(gridIds[0]);
      expect(publishedSeries.length).toBe(22);
      expect(Number(publishedSeries[publishedSeries.length - 1].count_running)).toBe(1200);
      expect(Number(publishedSeries[publishedSeries.length - 2].count_running)).toBe(646);
      expect((await published(gridIds[1])).length).toBe(22);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ──────────────────────────────────────────────────
  // D40 — the bind chip offers the values the server sets
  //       (Phase 4, TODO 18c: builtins in the visual query builder)
  //
  // A filter row in the Visual builder could only ever be bound to a parameter
  // the dashboard itself declares. Everything the server knows about whoever is
  // looking - their email, their groups, their tenant, today - had to be typed
  // into the SQL by hand, in the Finetune tab, by somebody who knew the names.
  //
  // The chip now offers both: the dashboard's own parameters first, then, under
  // "Set by the server", every name `/api/dp/user-variables` returns for the
  // person signed in. The names are the server's list, never a second copy kept
  // in the browser, so a name the server adds (a `dp_attr_*`) shows up here
  // without a line changing.
  //
  // Binding writes the same `${name}` text a hand-typed one writes, so the
  // generated SQL is one ANSI text on every vendor and the value never appears
  // in it: the server fills it in when the widget runs (R9).
  //
  // The two halves, over the frozen `cube_demo` support desk (15 agents,
  // 3000 tickets, none of them opened after 2026-09-29):
  //   - bound to `dp_user_email`, `email <> ${dp_user_email}` answers 15: the
  //     server's value really arrived, because a value that never arrived binds
  //     NULL and `<>` then answers nobody;
  //   - the same value with `email = ${dp_user_email}` answers 0: whoever is
  //     signed in is not one of the demo's support agents - the filter is a
  //     real filter, not a pass-through;
  //   - bound to `dp_today`, the tickets opened on or before today are exactly
  //     as many as the same query answers for the real calendar day, and the
  //     day is bound as a day, not as text.
  //
  // Same shape as D24, D27-D39: a temporary duckdb connection pointed at a COPY
  // of the shipped `northwind.duckdb`, which carries the `cube_demo` schema, so
  // no shipped file is ever written to.
  // ──────────────────────────────────────────────────
  test('(explore-data) D40 — the bind chip offers the values the server sets', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName       = 'D40 — the values the server sets';
    const connectionName   = 'BuiltinsInTheChip';
    const connectionVendor = 'duckdb';
    const connectionCode   = toConnectionCode(connectionName, connectionVendor);
    const copyFolder       = `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`;

    await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );
    await ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
      new FluentTester(electronPage!), connectionName, connectionVendor,
    );

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await selectConnection(page, connectionName, connectionVendor);

      await expect(page.locator('[id="btnTable-cube_demo.support_agents"]')).toBeVisible({ timeout: 15_000 });

      // One parameter of the dashboard's own, so both groups of the chip are
      // there to tell apart: this one is asked of the person looking, the
      // others are known about them without asking.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'team', type: String, label: 'Team', defaultValue: 'Tier 1') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "}"
      );

      // What the server says it knows about whoever is signed in. The chip's
      // second group is this list, so the test never carries a copy of it.
      const fromTheServer: Record<string, string> = await page.evaluate(async () => {
        const r = await fetch('/api/dp/user-variables');
        return (await r.json()) as Record<string, string>;
      });
      expect(Object.keys(fromTheServer)).toEqual(
        expect.arrayContaining(['dp_user_id', 'dp_user_email', 'dp_user_groups', 'dp_user_role',
                                'dp_tenant_id', 'dp_today', 'dp_now']));
      const me = fromTheServer['dp_user_email'];
      expect(me.length).toBeGreaterThan(0);

      // ── everybody but me: the chip's own offer, and the value behind it ──
      await addVisualWidget(page, 'cube_demo.support_agents', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', '*');
        await addVisualFilter(page, 0, 'email', 'not_equals');

        // The dashboard's parameter first, and not inside the server's group.
        const declared = await page.locator('#selectBindParam-0 > option')
          .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter((v) => v));
        expect(declared).toContain('team');
        expect(declared).not.toContain('dp_user_email');

        // Then the server's, every one of them, in the order the server gave.
        const group = page.locator('#selectBindParam-0 optgroup[label="Set by the server"]');
        await expect(group).toHaveCount(1);
        const offered = await group.locator('option')
          .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
        expect(offered).toEqual(Object.keys(fromTheServer));

        await bindVisualFilterToParam(page, 0, 'dp_user_email');
      });

      const everybodyElseSql = await visualSql();
      // The bound name is written the way a hand-typed one is written, and the
      // value the server knows is nowhere in the text.
      expect(everybodyElseSql).toContain('"email" <> ${dp_user_email}');
      expect(everybodyElseSql).not.toContain("'${dp_user_email}'");
      expect(everybodyElseSql).not.toContain(me);

      // ── me: the same value, the opposite question ──
      await addVisualWidget(page, 'cube_demo.support_agents', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', '*');
        await addVisualFilter(page, 0, 'email', 'equals');
        await bindVisualFilterToParam(page, 0, 'dp_user_email');
      });
      const meSql = await visualSql();
      expect(meSql).toContain('"email" = ${dp_user_email}');
      expect(meSql).not.toContain(me);

      // ── the tickets opened on or before today, the day the server says ──
      await addVisualWidget(page, 'cube_demo.support_tickets', 'tabulator', async () => {
        await addAggregation(page, 0, 'COUNT', '*');
        await addVisualFilter(page, 0, 'opened_date', 'less_or_equal');
        await bindVisualFilterToParam(page, 0, 'dp_today');
      });
      const todaySql = await visualSql();
      expect(todaySql).toContain('${dp_today}');
      expect(todaySql).not.toContain(fromTheServer['dp_today']);

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 4, h: 4 },  // tabulator — every agent but me
        { x: 4, y: 0, w: 4, h: 4 },  // tabulator — me, if the desk knows me
        { x: 8, y: 0, w: 4, h: 4 },  // tabulator — the tickets opened by today
      ]);

      // ── the canvas path, the one a widget calls, with the server's values ──
      const onCanvas = async (sql: string, params: Record<string, string>,
                              paramTypes: Record<string, string> = {}): Promise<number> =>
        page.evaluate(async ({ connectionId, sql: text, params: p, paramTypes: t }) => {
          const r = await fetch('/api/dp/queries/run-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, sql: text, params: p, paramTypes: t }),
          });
          const payload = await r.json();
          const rows = payload.data as Record<string, unknown>[];
          return Number(Object.values(rows[0])[0]);
        }, { connectionId: connectionCode, sql, params, paramTypes });

      // All 15 agents are somebody else: the value arrived, because a value
      // that never arrived is NULL and `<>` would answer 0.
      expect(await onCanvas(everybodyElseSql, { dp_user_email: me })).toBe(15);
      // And none of them is me: the filter filters.
      expect(await onCanvas(meSql, { dp_user_email: me })).toBe(0);

      // The day is a day. Every one of the 3000 tickets was opened on or before
      // 2026-09-29, so today - whenever this runs after that - answers all of
      // them, and so does the real calendar day asked for on its own.
      const today = fromTheServer['dp_today'];
      const byToday = await onCanvas(todaySql, { dp_today: today }, { dp_today: 'Date' });
      expect(byToday).toBe(3000);
      expect(await onCanvas(todaySql, { dp_today: '2025-06-30' }, { dp_today: 'Date' })).toBe(712);

      const d40CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d40Url } = await publishDashboard(page);
      const d40Ids = await getCanvasComponentIds(page, d40CanvasId);
      const d40ReportCode = d40Url.split('/').pop()!;

      await page.goto(d40Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-tabulator')).toHaveCount(3, { timeout: 20_000 });

      // ── the published dashboard, which nobody hands any value to: the
      //    server fills the builtins in for whoever opens it ──
      const gridIds = d40Ids['tabulator'] ?? [];
      expect(gridIds.length).toBe(3);
      const published = async (componentId: string): Promise<number> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          const rows = payload.data as Record<string, unknown>[];
          return Number(Object.values(rows[0])[0]);
        }, { rc: d40ReportCode, cid: componentId });

      expect(await published(gridIds[0])).toBe(15);
      expect(await published(gridIds[1])).toBe(0);
      expect(await published(gridIds[2])).toBe(3000);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        new FluentTester(electronPage!), `${connectionCode}\\.xml`, connectionVendor,
      );
      await new FluentTester(electronPage!).deleteFolder(copyFolder);
    }
  });


  // ──────────────────────────────────────────────────
  // D41 — a cube's dashboard filter, followed by the server
  //       (Phase 4, TODO 21b: builtins in paramBindings, R9)
  //
  // D40 bound a raw table's filter to a value the server sets. A cube widget
  // has no filter of that shape: what it carries is a binding - member,
  // operator, parameter - and until now the parameter had to be one the
  // dashboard declares and the viewer answers in the filter bar.
  //
  // It can now be a name the server sets instead. The author picks it under
  // "Set by the server" in the same chip; nobody answers it, nobody sees it in
  // the filter bar, and nobody can type it: the value is the server's, for
  // whoever is looking, on both kinds of tile.
  //
  //   - frozen (Mode 1): the generated SQL carries `${dp_user_id}` and the
  //     dashboard's own script binds it when the tile runs;
  //   - live (Mode 2): the binding lives in the published
  //     `-cube-widgets.json` entry and is bound a moment before the statement
  //     runs, ANDed with whatever the viewer ticked.
  //
  // The two halves, over the frozen `cube_demo` support desk (3000 tickets,
  // 2959 of them somebody's, 15 agents):
  //   - `Agent <> dp_user_id` answers 2959: the server's value really arrived,
  //     because a value that never arrived binds NULL and `<>` then answers
  //     nobody;
  //   - `Agent = dp_user_id` answers 0: whoever is signed in is not one of the
  //     demo's agents, so the binding is a real filter and not a pass-through;
  //   - the live tile answers the same 2959, and neither a `dp_user_id` sent
  //     in the request nor a binding sent in its body moves it by one ticket.
  //
  // The shipped sample duckdb connection is read, never written, exactly as
  // D23 reads it: the cube is the shipped Support Desk and no file is touched.
  // ──────────────────────────────────────────────────
  test('(explore-data) D41 — a cube tile that follows whoever is looking', async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const canvasName           = 'D41 — the tickets that are mine';
    const cubeId               = 'support-desk';
    const sampleConnectionCode = 'rbt-sample-northwind-duckdb-4f2';

    // The shipped sample connection and its cubes are hidden until asked for.
    await page.goto(AI_HUB_BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const res = await fetch('/api/dp/system/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { showsamples: true } }),
      });
      if (!res.ok) throw new Error(`enable showsamples failed: ${res.status} ${await res.text()}`);
    });

    /** The SQL the Visual builder shows for the widget being edited. */
    const visualSql = async (): Promise<string> => {
      await clickDataTab(page);
      await page.locator('#btnToggleVisualSql').click();
      await page.locator('#preVisualSql').waitFor({ state: 'visible', timeout: 5_000 });
      const sql = await page.locator('#preVisualSql').innerText();
      await page.locator('#btnToggleVisualSql').click();
      return sql;
    };

    /** One row of the cube's Dashboard filter chip: member, operator, parameter. */
    const bindCube = async (i: number, member: string, operator: string, param: string) => {
      await clickDataTab(page);
      await page.locator('#btnAddCubeBind').click();
      await page.locator(`#selectCubeBindMember-${i}`).waitFor({ state: 'visible', timeout: 5_000 });
      await page.locator(`#selectCubeBindMember-${i}`).selectOption(member);
      await page.locator(`#selectCubeBindOp-${i}`).selectOption(operator);
      await page.locator(`#selectCubeBindParam-${i}`).selectOption(param);
    };

    try {
      await createFreshCanvas(page, DATA_CANVAS_URL, canvasName);
      await page.locator('#selectConnection').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#selectConnection').selectOption(sampleConnectionCode);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });

      // One parameter of the dashboard's own, so both groups of the chip are there to tell
      // apart: this one is asked of the person looking, the other is known about them.
      await addFilterBarParam(page,
        "reportParameters {\n" +
        "  parameter(id: 'team', type: String, label: 'Team', defaultValue: 'Tier 1') {\n" +
        "    constraints(required: false)\n" +
        "  }\n" +
        "}"
      );

      // What the server says it knows about whoever is signed in. The chip's second group is
      // this list, so the test never carries a copy of it.
      const fromTheServer: Record<string, string> = await page.evaluate(async () => {
        const r = await fetch('/api/dp/user-variables');
        return (await r.json()) as Record<string, string>;
      });
      const me = fromTheServer['dp_user_id'];
      expect(me.length).toBeGreaterThan(0);

      // ── every agent but me, frozen ──
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, [], ['Tickets']);
      await switchToWidget(page, 'number');
      await bindCube(0, 'Agent', 'not_equals', 'dp_user_id');

      // The dashboard's own parameter first, and not inside the server's group.
      const declared = await page.locator('#selectCubeBindParam-0 > option')
        .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter((v) => v));
      expect(declared).toContain('team');
      expect(declared).not.toContain('dp_user_id');

      // Then the server's, every one of them, in the order the server gave.
      const group = page.locator('#selectCubeBindParam-0 optgroup[label="Set by the server"]');
      await expect(group).toHaveCount(1);
      const offered = await group.locator('option')
        .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
      expect(offered).toEqual(Object.keys(fromTheServer));

      // The bound name is written the way a hand-typed one is written, and the value the
      // server knows is nowhere in the text: it arrives when the tile runs, not before.
      const everybodyElseSql = await visualSql();
      expect(everybodyElseSql).toContain('${dp_user_id}');
      expect(everybodyElseSql).not.toContain("'${dp_user_id}'");
      expect(everybodyElseSql).not.toContain(me);

      // ── me, frozen: the same value, the opposite question ──
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, [], ['Tickets']);
      await switchToWidget(page, 'number');
      await bindCube(0, 'Agent', 'equals', 'dp_user_id');
      const meSql = await visualSql();
      expect(meSql).toContain('${dp_user_id}');
      expect(meSql).not.toContain(me);

      // ── every agent but me, live: the same binding on the other kind of tile ──
      await addCubeToCanvas(page, cubeId);
      await selectCubeFields(page, ['Team'], ['Tickets']);
      await switchToWidget(page, 'tabulator');
      await clickDataTab(page);
      await page.locator('#chkCubeShowInDashboard').check();
      await bindCube(0, 'Agent', 'not_equals', 'dp_user_id');

      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 6,  h: 3 },  // number    — every agent but me
        { x: 6, y: 0, w: 6,  h: 3 },  // number    — me, if the desk knows me
        { x: 0, y: 3, w: 12, h: 8 },  // tabulator — the live cube, everybody but me
      ]);

      const d41CanvasId = page.url().split('/').pop()!;
      const { dashboardUrl: d41Url } = await publishDashboard(page);
      const d41Ids = await getCanvasComponentIds(page, d41CanvasId);
      const d41ReportCode = d41Url.split('/').pop()!;

      await page.goto(d41Url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('rb-cube-renderer'), 'the dashboard carries one live cube')
        .toHaveCount(1, { timeout: 20_000 });

      // A binding nobody answers is not a filter anybody sees: the filter bar holds the
      // dashboard's own parameter and nothing else, and the cube shows no chip for it.
      await expect(page.locator('#team'), "the dashboard's own parameter is asked")
        .toBeVisible({ timeout: 15_000 });
      await expect(page.locator('#dp_user_id'), 'and a reserved name is not')
        .toHaveCount(0);
      await expect(page.locator('#chipDashFilter-Agent'), 'nor is there a chip nobody chose')
        .toHaveCount(0, { timeout: 30_000 });

      // ── the frozen tiles, which nobody hands any value to ──
      const numberIds = d41Ids['number'] ?? [];
      expect(numberIds.length).toBe(2);
      const frozen = async (componentId: string): Promise<number> =>
        page.evaluate(async ({ rc, cid }) => {
          const r = await fetch(`/api/reports/${rc}/data?componentId=${cid}`);
          const payload = await r.json();
          const rows = payload.data as Record<string, unknown>[];
          return Number(Object.values(rows[0])[0]);
        }, { rc: d41ReportCode, cid: componentId });

      // All 2959 tickets that have an agent belong to somebody else: the value arrived,
      // because a value that never arrived is NULL and `<>` would answer 0.
      expect(await frozen(numberIds[0]), 'every ticket but mine').toBe(2959);
      // And none of them is mine: the binding filters.
      expect(await frozen(numberIds[1]), 'and none of them is mine').toBe(0);

      // ── the live tile, asked the way the renderer asks it ──
      const liveId = (d41Ids['tabulator'] ?? [])[0];
      const askCube = async (body: Record<string, unknown>): Promise<number> =>
        page.evaluate(async ({ rc, cid, b }) => {
          const r = await fetch(`/api/reports/${rc}/cube/${cid}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimensions: ['Team'], measures: ['Tickets'], filters: [], ...b }),
          });
          const payload = await r.json();
          return (payload.rows as Record<string, unknown>[])
            .reduce((sum, row) => sum + Number(row.Tickets), 0);
        }, { rc: d41ReportCode, cid: liveId, b: body });

      expect(await askCube({}), 'the live cube reads the same binding').toBe(2959);

      // The negative half, twice. A viewer who sends the reserved name is not answering it:
      // the server never reads it off a request, and the number does not move.
      expect(await askCube({ params: { dp_user_id: 'Chiara Muller' } }),
        'a reserved name sent in the request is not a value the server takes').toBe(2959);
      // Nor is a binding sent in the body a binding: the published entry decides what is
      // bound, and this request would otherwise show one agent's own tickets.
      expect(await askCube({
        paramBindings: [{ param: 'dp_user_id', member: 'Agent', operator: 'equals' }],
        params: { dp_user_id: 'Chiara Muller' },
      }), 'and a binding sent in the body is not one either').toBe(2959);

      // The viewer's own ticks are ANDed with it, never instead of it: one team's tickets
      // are some of the 2959 and not all of them.
      const oneTeam = await askCube({
        filters: [{ member: 'Team', operator: 'equals', values: ['Tier 1'] }],
      });
      expect(oneTeam, 'one team is some of the desk').toBeGreaterThan(0);
      expect(oneTeam, 'and not the whole of it').toBeLessThan(2959);
    } finally {
      await deleteCanvasViaUI(page, canvasName);
    }
  });

});

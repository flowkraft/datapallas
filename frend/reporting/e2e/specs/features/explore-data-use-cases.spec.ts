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
  addVisualFilter,
  bindVisualFilterToParam,
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
  await page.locator('#btnDslToggle').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#btnDslToggle').click();
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

async function setupGeoLocations(page: Page): Promise<void> {
  const canvasName = 'GeoLocationsSetup';
  await createCanvas(page, canvasName);
  await addTableToCanvas(page, 'Orders');
  await runSqlQuery(page, `CREATE TABLE IF NOT EXISTS geo_locations (name TEXT PRIMARY KEY, lat REAL, lon REAL)`);
  for (const row of GEO_ROWS) {
    await runSqlQuery(page, `INSERT OR IGNORE INTO geo_locations VALUES('${row.name}', ${row.lat}, ${row.lon})`);
  }
  await deleteCanvasViaUI(page, canvasName);
}

async function teardownGeoLocations(page: Page): Promise<void> {
  const canvasName = 'GeoLocationsTeardown';
  await createCanvas(page, canvasName);
  await addTableToCanvas(page, 'Orders');
  await runSqlQuery(page, `DROP TABLE IF EXISTS geo_locations`);
  await deleteCanvasViaUI(page, canvasName);
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

    const connectionCode = toConnectionCode(CONNECTION_NAME, DB_VENDOR);
    const dbConnsResp = await fetch('http://localhost:9090/api/connections?type=database');
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
    await setupGeoLocations(page);
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
      await teardownGeoLocations(page);
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
      const res = await fetch('http://localhost:9090/api/system/preferences', {
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

});

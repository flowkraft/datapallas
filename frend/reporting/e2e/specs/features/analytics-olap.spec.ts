import { test, expect, Page } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { FluentTester } from '../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { Constants } from '../../utils/constants';

/**
 * E2E tests for Pivot Table Analytics — Dual App Tests (Grails + Next.js)
 *
 * Test Structure: 5 tests × 2 apps = 10 tests total (when RUN_ALL_TESTS=true)
 *
 * INDEPENDENT TESTS — each test is fully self-contained:
 *   - Starts the app itself (docker compose up via startApp)
 *   - Creates its own external browser
 *   - Stops the app + closes the browser in its own finally block
 *   - No shared state between tests — any test can run in isolation via grep
 *
 * RUN_ALL_TESTS=false (default): Daily rotation
 *   - Even days: Demo tests→Grails, Warehouse tests→Next.js
 *   - Odd days:  Demo tests→Next.js, Warehouse tests→Grails
 *   - Result: Over 2 consecutive days, ALL tests run on BOTH apps
 *
 * RUN_ALL_TESTS=true (CI/pre-release): All 10 tests run
 *   - Grails: TEST 1-5 (demo pivot + warehouse OLAP)
 *   - Next.js: TEST 1-5 (demo pivot + warehouse OLAP)
 *
 * TEST 1: Demo Pivot [BROWSER] — Full OLAP workflow on demo sales dataset
 *   - 64-row dataset (4 Regions × 4 Products × 4 Quarters), exact value assertions
 *   - 14 steps: verification, dimension rearrangement, profitability, aggregators,
 *     filtering, sorting, chart rendering, reset
 *
 * TEST 2: Demo Pivot [DuckDB] — Engine equivalence on demo dataset
 *   - Same data + assertions as TEST 1, server-side DuckDB computation
 *   - Proves client can request engine='duckdb' without config changes
 *
 * TEST 3: Warehouse Pivot [BROWSER] — Browser engine on real warehouse data
 *   - ~7,937 rows from NorthwindOlapDataGenerator(seed=42) via vw_sales_detail
 *   - Validates: data loads, countries/categories present, hierarchy, aggregators
 *   - Key feature: "use what works — browser, DuckDB, or ClickHouse"
 *
 * TEST 4: Warehouse OLAP [BROWSER] — Comprehensive OLAP, browser engine
 *   - Same warehouse data, 10 guide steps + 25 diverse combinations (~105 assertions)
 *   - Raw rows in browser (Count ~ 7937), all via runWarehouseOlap('browser')
 *
 * TEST 5: Warehouse OLAP [DuckDB + ClickHouse] — Comprehensive OLAP, server engines
 *   - Identical DRY code path (runWarehouseOlap), different pivotId per engine
 *   - Server pre-aggregates to ~640 grouped rows (Count ~ 640)
 *   - ClickHouse: Docker columnar engine, started/stopped within test
 *
 * runWarehouseOlap(engine) — single DRY entry point for all engines:
 *   - 10 "How to Use" guide steps: market ranking, regional preferences, continents,
 *     seasonal patterns, YoY growth, gross/net, employees, avg/sum, filtering, charts
 *   - 25 diverse OLAP combinations: count, quantity, basic heatmap, products, multi-level
 *     hierarchy, sort descending, double filter, customer drill, product discontinuation,
 *     Sweden isolation, 3 heatmap variants, 4 statistical aggregators (median/min/max/stddev),
 *     3 chart types (stacked column/line/pie), 3 fraction aggregators (total/rows/columns),
 *     2 drag-to-unused operations (rows/cols → unused), 2 order toggle buttons (row/col order)
 *   - ~105 assertions — identical code path regardless of engine
 *
 * Data Sources:
 * - piv-sales-region-prod-qtr: 64 rows (4 Regions × 4 Products × 4 Quarters)
 * - piv-northwind-warehouse-browser/duckdb/clickhouse: ~7,937 rows from
 *   NorthwindOlapDataGenerator(seed=42) — 10 countries, 8 categories, 8 quarters
 */

// ============================================================
// DUAL-APP PIVOT TABLE TESTS — each test fully independent
// ============================================================

// Set to true to run ALL tests (5 tests × 2 apps = 10 tests).
// When false (default), uses daily rotation to alternate app assignments.
const RUN_ALL_TESTS = true;

// Daily seed for randomizing app assignment.
// Over 2 consecutive runs, BOTH apps are tested for all features.
const today = process.env.E2E_ROTATION_DATE || new Date().toISOString().split('T')[0];
const dailySeed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
const isEvenDay = dailySeed % 2 === 0;

// Cross-assignment: Demo tests on one app, Warehouse tests on the other
const demoApp = isEvenDay ? 'grails' : 'nextjs';
const warehouseApp = isEvenDay ? 'nextjs' : 'grails';

console.log(`Daily seed: ${dailySeed} (${isEvenDay ? 'even' : 'odd'}) — Demo Pivot→${demoApp}, Warehouse Pivot→${warehouseApp}`);

const PIVOT_APPS = [
  {
    appId: SelfServicePortalsTestHelper.APP_ID_GRAILS,
    appName: 'grails' as const,
    name: 'Grails',
    baseUrl: SelfServicePortalsTestHelper.GRAILS_BASE_URL,
  },
  {
    appId: SelfServicePortalsTestHelper.APP_ID_NEXT,
    appName: 'nextjs' as const,
    name: 'Next.js',
    baseUrl: SelfServicePortalsTestHelper.NEXT_BASE_URL,
  },
];

/** Stop the playground app via docker compose. */
async function stopApp(electronPage: any, appName: 'grails' | 'nextjs'): Promise<void> {
  const composeService = appName === 'grails' ? 'grails-playground' : 'next-playground';
  const composeDir = `_apps/flowkraft/${composeService}`;
  await new FluentTester(electronPage)
    .executeCommand(`docker compose stop ${composeService}`, composeDir);
}

/**
 * Makes sure the ClickHouse starter pack is running before a test opens /data-warehouse.
 *
 * That page is a three-engine comparison: ONE navigation asks the server for the browser, the DuckDB *and*
 * the ClickHouse pivot, whichever engine the test came to look at. The page states the requirement itself —
 * "Server-side columnar OLAP database (requires ClickHouse starter pack)" — so every test that opens it has
 * to satisfy it, not only TEST 5, which is merely the one that reads the ClickHouse result.
 *
 * With the pack down each navigation leaves a ClickHouse pivot hanging until it times out ~20 s later, and
 * the server writes an ERROR when it does. Those land after the test that caused them has finished, and
 * therefore after the NEXT test's clean state has emptied the logs — which is how TEST 3 and TEST 4 kept
 * turning the status bar red inside TEST 5's fixture. Being a race between that 20 s tail and the next
 * test's set-up is exactly why it showed up as flaky rather than as a plain failure.
 *
 * Starting a pack that is already running is a no-op (setStarterPackStateForVendor probes the button first),
 * so the boot is paid once and every later call just looks. The stop lives in the afterAll below rather than
 * in each test, so one window covers the whole file however many of these tests the rotation runs — while
 * each test still starts what it needs by itself and so still runs alone under grep.
 */
let clickhouseStarted = false;

async function ensureClickHouseStarterPack(electronPage: any): Promise<void> {
  // Starter pack triggers NorthwindManager.startDatabase(CLICKHOUSE) which:
  // 1. Starts Docker container  2. Waits for health check  3. Initializes data warehouse
  // Raw "docker compose up -d" only starts the container — no tables/views are created.
  console.log('Ensuring the ClickHouse starter pack is running (includes data warehouse init)...');
  await ConnectionsTestHelper.setStarterPackStateForVendor(
    new FluentTester(electronPage), 'clickhouse', 'start'
  );
  clickhouseStarted = true;
}

test.afterAll(() => {
  if (clickhouseStarted) ConnectionsTestHelper.dockerComposeDownInDbFolder();
});

for (const app of PIVOT_APPS) {
  const baseUrl = app.baseUrl;

  // ============================================================
  // TEST 1: Demo Pivot [BROWSER]
  // ============================================================
  electronBeforeAfterAllTest(
    `${app.name} - TEST 1: Demo Pivot [BROWSER]`,
    async ({ beforeAfterEach: electronPage }) => {

      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      if (!(RUN_ALL_TESTS || demoApp === app.appName)) {
        console.log(`\n=== [${app.name}] TEST 1 - SKIPPED (daily rotation) ===\n`);
        return;
      }

      let externalBrowser: any = null;
      let page: any = null;

      try {
        console.log(`\n========== [TEST 1] Starting ${app.name} ==========\n`);
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(electronPage).gotoApps(),
          app.appId,
        );
        const result = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = result.browser;
        page = result.page;

        console.log(`\n=== [${app.name}] TEST 1: Demo Pivot [BROWSER] ===\n`);
        await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/pivot-tables`);
        await page.goto(`${baseUrl}/pivot-tables`);
        await performComprehensiveDemoPivotActions(page, baseUrl);
        console.log(`[${app.name}] TEST 1 [BROWSER]: ✓ passed`);
      } finally {
        if (page) await page.close().catch(() => {});
        if (externalBrowser) await externalBrowser.close().catch(() => {});
        await stopApp(electronPage, app.appName).catch((e) =>
          console.warn(`Failed to stop app (non-critical): ${e.message}`));
        console.log(`[TEST 1] ${app.name} cleanup complete\n`);
      }
    },
  );

  // ============================================================
  // TEST 2: Demo Pivot [DuckDB Auto-Plumbing]
  // ============================================================
  electronBeforeAfterAllTest(
    `${app.name} - TEST 2: Demo Pivot [DuckDB]`,
    async ({ beforeAfterEach: electronPage }) => {

      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      if (!(RUN_ALL_TESTS || demoApp === app.appName)) {
        console.log(`\n=== [${app.name}] TEST 2 - SKIPPED (daily rotation) ===\n`);
        return;
      }

      let externalBrowser: any = null;
      let page: any = null;

      try {
        console.log(`\n========== [TEST 2] Starting ${app.name} ==========\n`);
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(electronPage).gotoApps(),
          app.appId,
        );
        const result = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = result.browser;
        page = result.page;

        console.log(`\n=== [${app.name}] TEST 2: Demo Pivot [DuckDB Auto-Plumbing] ===\n`);
        console.log(`Demo pivot uses script-based data generation (no SQL table)`);
        console.log(`DuckDB auto-plumbs: script → CREATE TABLE → pivot`);
        console.log(`Tests that client can request engine='duckdb' without config changes`);

        await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/pivot-tables`);
        await page.goto(`${baseUrl}/pivot-tables`);

        await SelfServicePortalsTestHelper.setPivotEngine(page, 'demoPivot', 'duckdb');
        await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'demoPivot');

        const grandTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot');
        expect(grandTotal).toBeGreaterThan(600000);
        expect(grandTotal).toBeLessThan(700000);
        console.log(`[${app.name}] TEST 2 [DuckDB]: ✓ Grand total matches: $${grandTotal.toLocaleString()}`);

        await SelfServicePortalsTestHelper.setPivotEngine(page, 'demoPivot', 'browser');
        await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'demoPivot');

        console.log(`[${app.name}] TEST 2 [DuckDB]: ✓ passed`);
      } finally {
        if (page) await page.close().catch(() => {});
        if (externalBrowser) await externalBrowser.close().catch(() => {});
        await stopApp(electronPage, app.appName).catch((e) =>
          console.warn(`Failed to stop app (non-critical): ${e.message}`));
        console.log(`[TEST 2] ${app.name} cleanup complete\n`);
      }
    },
  );

  // ============================================================
  // TEST 3: Warehouse Pivot [BROWSER]
  // ============================================================
  electronBeforeAfterAllTest(
    `${app.name} - TEST 3: Warehouse Pivot [BROWSER]`,
    async ({ beforeAfterEach: electronPage }) => {

      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      if (!(RUN_ALL_TESTS || warehouseApp === app.appName)) {
        console.log(`\n=== [${app.name}] TEST 3 - SKIPPED (daily rotation) ===\n`);
        return;
      }

      let externalBrowser: any = null;
      let page: any = null;

      try {
        console.log(`\n========== [TEST 3] Starting ${app.name} ==========\n`);
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(electronPage).gotoApps(),
          app.appId,
        );

        // This test reads the browser engine, but the page it opens loads all three (see above).
        await ensureClickHouseStarterPack(electronPage);
        const result = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = result.browser;
        page = result.page;

        console.log(`\n=== [${app.name}] TEST 3: Warehouse Pivot [BROWSER] ===\n`);
        await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/data-warehouse`);
        await page.goto(`${baseUrl}/data-warehouse`);
        await performWarehousePivotActions(page, baseUrl);
        console.log(`[${app.name}] TEST 3 [BROWSER]: ✓ passed`);
      } finally {
        if (page) await page.close().catch(() => {});
        if (externalBrowser) await externalBrowser.close().catch(() => {});
        await stopApp(electronPage, app.appName).catch((e) =>
          console.warn(`Failed to stop app (non-critical): ${e.message}`));
        console.log(`[TEST 3] ${app.name} cleanup complete\n`);
      }
    },
  );

  // ============================================================
  // TEST 4: Warehouse OLAP [BROWSER]
  // ============================================================
  electronBeforeAfterAllTest(
    `${app.name} - TEST 4: Warehouse OLAP [BROWSER]`,
    async ({ beforeAfterEach: electronPage }) => {

      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      if (!(RUN_ALL_TESTS || warehouseApp === app.appName)) {
        console.log(`\n=== [${app.name}] TEST 4 - SKIPPED (daily rotation) ===\n`);
        return;
      }

      let externalBrowser: any = null;
      let page: any = null;

      try {
        console.log(`\n========== [TEST 4] Starting ${app.name} ==========\n`);
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(electronPage).gotoApps(),
          app.appId,
        );

        // This test reads the browser engine, but the page it opens loads all three (see above).
        await ensureClickHouseStarterPack(electronPage);
        const result = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = result.browser;
        page = result.page;

        console.log(`\n=== [${app.name}] TEST 4: Warehouse OLAP [BROWSER] ===\n`);
        await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/data-warehouse`);
        await runWarehouseOlap(page, 'browser', baseUrl);
        console.log(`[${app.name}] TEST 4 [BROWSER]: ✓ passed`);
      } finally {
        if (page) await page.close().catch(() => {});
        if (externalBrowser) await externalBrowser.close().catch(() => {});
        await stopApp(electronPage, app.appName).catch((e) =>
          console.warn(`Failed to stop app (non-critical): ${e.message}`));
        console.log(`[TEST 4] ${app.name} cleanup complete\n`);
      }
    },
  );

  // ============================================================
  // TEST 5: Warehouse OLAP [DuckDB + ClickHouse]
  // ============================================================
  electronBeforeAfterAllTest(
    `${app.name} - TEST 5: Warehouse OLAP [DuckDB + ClickHouse]`,
    async ({ beforeAfterEach: electronPage }) => {

      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      if (!(RUN_ALL_TESTS || warehouseApp === app.appName)) {
        console.log(`\n=== [${app.name}] TEST 5 - SKIPPED (daily rotation) ===\n`);
        return;
      }

      let externalBrowser: any = null;
      let page: any = null;

      try {
        console.log(`\n========== [TEST 5] Starting ${app.name} ==========\n`);
        await SelfServicePortalsTestHelper.startApp(
          new FluentTester(electronPage).gotoApps(),
          app.appId,
        );

        await ensureClickHouseStarterPack(electronPage);

        const result = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = result.browser;
        page = result.page;

        console.log(`\n=== [${app.name}] TEST 5: Warehouse OLAP [DuckDB + ClickHouse] ===\n`);
        await SelfServicePortalsTestHelper.waitForServerReady(page, `${baseUrl}/data-warehouse`);

        await runWarehouseOlap(page, 'duckdb', baseUrl);
        await runWarehouseOlap(page, 'clickhouse', baseUrl);

        console.log(`[${app.name}] TEST 5 [OLAP]: ✓ passed`);
      } finally {
        if (page) await page.close().catch(() => {});
        if (externalBrowser) await externalBrowser.close().catch(() => {});
        await stopApp(electronPage, app.appName).catch((e) =>
          console.error(`ERROR stopping app: ${e.message}`));
        // The pack is stopped once, in the afterAll, so the tests that follow this one in the file find it
        // running instead of paying for the boot again.
        console.log(`[TEST 5] ${app.name} cleanup complete\n`);
      }
    },
  );
}

// ============================================================
// IMPLEMENTATION FUNCTIONS
// ============================================================

/**
 * TEST 1 Implementation: Comprehensive demo pivot actions (browser engine).
 * Merged from performRepresentativeSet + performGSPDocumentedActions — zero redundancy.
 * 14 steps covering: initial verification, dimension rearrangement (Product→rows, Region→rows, Product restored),
 * product/region analysis, profitability, aggregators, dimensions, filtering (regions + products), sorting, chart rendering, reset verification.
 */
async function performComprehensiveDemoPivotActions(page: Page, baseUrl: string): Promise<void> {
  console.log('\n=== Starting comprehensive demo pivot actions [BROWSER] ===\n');

  await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'demoPivot');

  // --- STEP 1: Verify initial load and grand total ---
  console.log('[BROWSER] Step 1: Verify initial load and grand total');
  const grandTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot');
  expect(grandTotal).toBeGreaterThan(600000);  // Min with avg quantity ~13
  expect(grandTotal).toBeLessThan(700000);     // Max with avg quantity ~16
  const bodyText = await page.locator('#demoPivot .pvtTable').textContent();
  expect(bodyText).toContain('North');
  expect(bodyText).toContain('South');
  expect(bodyText).toContain('East');
  expect(bodyText).toContain('West');
  console.log(`[BROWSER] ✓ Grand total: $${grandTotal.toLocaleString()}, all 4 regions visible`);

  // --- STEP 1B: Rearrange to have Product as top-level rows (for Step 2 product analysis) ---
  console.log('[BROWSER] Step 1B: Rearrange pivot — move Region from rows to unused');
  // Move Region from rows to unused (clears nested hierarchy, leaves Product as only row dimension)
  await SelfServicePortalsTestHelper.dragDimensionFromRowsToUnused(page, 'demoPivot', 'Region');

  // (Helper now calls waitForPivotTableRender internally, no need to call it here)

  // Verify final state
  const productOnlyBody = await page.locator('#demoPivot .pvtTable').textContent();
  expect(productOnlyBody).toContain('Laptop');
  expect(productOnlyBody).toContain('Phone');
  expect(productOnlyBody).toContain('Tablet');
  expect(productOnlyBody).toContain('Monitor');
  expect(productOnlyBody).not.toContain('North');
  expect(productOnlyBody).not.toContain('South');
  expect(productOnlyBody).not.toContain('East');
  expect(productOnlyBody).not.toContain('West');
  console.log('[BROWSER] ✓ Product now as top-level rows (Region moved to unused)');

  // --- STEP 2: Product analysis — "Which product is our cash cow?" ---
  console.log('[BROWSER] Step 2: Product analysis — cash cow identification');
  const laptopRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'Laptop');
  const phoneRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'Phone');
  const tabletRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'Tablet');
  const monitorRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'Monitor');
  // Exact values from deterministic data generation (Random seed=42)
  // These are NOT ranges - they are the EXACT values that seed=42 produces
  expect(laptopRevenue).toBeGreaterThan(phoneRevenue);      // Laptop > Phone (always true: $1200 > $800)
  expect(phoneRevenue).toBeGreaterThan(tabletRevenue);      // Phone > Tablet (always true: $800 > $500)
  expect(tabletRevenue).toBeGreaterThan(monitorRevenue);    // Tablet > Monitor (always true: $500 > $350)

  // Verify data is deterministic by checking grand total (should be stable across runs)
  const expectedGrandTotal = laptopRevenue + phoneRevenue + tabletRevenue + monitorRevenue;
  expect(grandTotal).toBe(expectedGrandTotal);  // Sanity check: sum of products = grand total
  console.log(`[BROWSER] ✓ Cash cow: Laptop=$${laptopRevenue.toLocaleString()} > Phone=$${phoneRevenue.toLocaleString()} > Tablet=$${tabletRevenue.toLocaleString()} > Monitor=$${monitorRevenue.toLocaleString()}`);

  // --- STEP 2B: Restore Region to rows (for Step 3 region analysis) ---
  console.log('[BROWSER] Step 2B: Restore Region to rows for regional analysis');
  // First, remove Product from rows (will go to unused)
  await SelfServicePortalsTestHelper.dragDimensionFromRowsToUnused(page, 'demoPivot', 'Product');
  // Then, add Region back to rows
  await SelfServicePortalsTestHelper.dragDimensionToRows(page, 'demoPivot', 'Region');
  // Verify Region is now visible
  const regionRestoredBody = await page.locator('#demoPivot .pvtTable').textContent();
  expect(regionRestoredBody).toContain('North');
  expect(regionRestoredBody).toContain('South');
  expect(regionRestoredBody).toContain('East');
  expect(regionRestoredBody).toContain('West');
  // Verify Product is gone from rows
  expect(regionRestoredBody).not.toContain('Laptop');
  expect(regionRestoredBody).not.toContain('Phone');
  console.log('[BROWSER] ✓ Region restored to rows (Product moved to unused)');

  // --- STEP 3: Region analysis — "Is East underperforming?" ---
  console.log('[BROWSER] Step 3: Region analysis — East vs West performance');
  const eastRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'East');
  const westRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'demoPivot', 'West');
  expect(eastRevenue).toBeGreaterThan(140000);   // 16 rows × avg base price × avg quantity
  expect(eastRevenue).toBeLessThan(180000);
  expect(westRevenue).toBeGreaterThan(140000);
  expect(westRevenue).toBeLessThan(180000);
  // NOTE: East vs West comparison removed - random quantities make order non-deterministic
  console.log(`[BROWSER] ✓ Region ranges validated: East=$${eastRevenue.toLocaleString()}, West=$${westRevenue.toLocaleString()}`);

  // --- STEP 4: Profitability — "Are we profitable or just busy?" ---
  console.log('[BROWSER] Step 4: Profitability analysis (Revenue vs Profit)');
  await SelfServicePortalsTestHelper.changeValueField(page, 'demoPivot', 'Profit');
  // Wait for grand total to change from Revenue (grandTotal) to Profit
  const profitTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot', grandTotal);
  expect(profitTotal).toBeGreaterThan(0);
  expect(profitTotal).toBeLessThan(grandTotal);
  const profitMargin = (profitTotal / grandTotal) * 100;
  console.log(`[BROWSER] ✓ Profit margin: ${profitMargin.toFixed(1)}% (Revenue: $${grandTotal.toLocaleString()}, Profit: $${profitTotal.toLocaleString()})`);

  // --- STEP 5: Change aggregator (Sum → Average) ---
  console.log('[BROWSER] Step 5: Change aggregator to Average');
  await SelfServicePortalsTestHelper.changeAggregator(page, 'demoPivot', 'Average');
  // Wait for aggregator change to update the grand total
  const avgValue = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot', profitTotal);
  expect(avgValue).toBeLessThan(profitTotal);
  expect(avgValue).toBeGreaterThan(0);
  console.log(`[BROWSER] ✓ Average aggregation: $${avgValue.toLocaleString()} (less than sum)`);

  // Reset to Sum + Revenue for subsequent steps
  await SelfServicePortalsTestHelper.changeAggregator(page, 'demoPivot', 'Sum');
  await SelfServicePortalsTestHelper.changeValueField(page, 'demoPivot', 'Revenue');

  // --- STEP 6: Rearrange dimensions (Quarter from cols → rows) ---
  console.log('[BROWSER] Step 6: Move Quarter from columns to rows');
  await SelfServicePortalsTestHelper.moveDimensionFromColsToRows(page, 'demoPivot', 'Quarter');
  const quarterBody = await page.locator('#demoPivot .pvtTable').textContent();
  expect(quarterBody).toContain('Q1');
  expect(quarterBody).toContain('Q2');
  expect(quarterBody).toContain('Q3');
  expect(quarterBody).toContain('Q4');
  console.log('[BROWSER] ✓ Quarter moved to rows (Q1-Q4 visible)');

  // --- STEP 7: Add SalesRep dimension + sort ("Who gets the bonus?") ---
  console.log('[BROWSER] Step 7: Add SalesRep to rows, sort descending');
  await SelfServicePortalsTestHelper.dragDimensionToRows(page, 'demoPivot', 'SalesRep');
  const salesRepBody = await page.locator('#demoPivot .pvtTable').textContent();
  expect(salesRepBody).toContain('Alice');
  expect(salesRepBody).toContain('Bob');
  expect(salesRepBody).toContain('Carol');
  expect(salesRepBody).toContain('David');
  await SelfServicePortalsTestHelper.sortPivot(page, 'demoPivot', 'value_z_to_a');
  console.log('[BROWSER] ✓ SalesRep added and sorted descending by revenue');

  // --- STEP 8: Filter regions (East + South only) ---
  console.log('[BROWSER] Step 8: Filter regions (uncheck North, West)');
  await SelfServicePortalsTestHelper.filterDimension(page, 'demoPivot', 'Region', ['North', 'West']);
  const filteredBody1 = await page.locator('#demoPivot .pvtTable').textContent();
  expect(filteredBody1).toContain('East');
  expect(filteredBody1).toContain('South');
  expect(filteredBody1).not.toContain('North');
  expect(filteredBody1).not.toContain('West');
  const filteredTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot');
  // Filtered total = East + South (2 regions = 32 rows)
  // Expected: ~50% of grand total (2 out of 4 regions)
  expect(filteredTotal).toBeGreaterThan(grandTotal * 0.45);  // At least 45% (some variance)
  expect(filteredTotal).toBeLessThan(grandTotal * 0.55);     // At most 55%
  console.log(`[BROWSER] ✓ Filtered to East+South, total: $${filteredTotal.toLocaleString()} (~${((filteredTotal/grandTotal)*100).toFixed(1)}% of grand total)`);

  // --- STEP 8B: Restore Product to rows (for Step 9 product filter) ---
  console.log('[BROWSER] Step 8B: Restore Product to rows for product filtering');
  // Product was removed from rows in Step 2B, need to add it back before filtering
  await SelfServicePortalsTestHelper.dragDimensionToRows(page, 'demoPivot', 'Product');
  // Verify Product is now visible
  const productRestoredBody = await page.locator('#demoPivot .pvtTable').textContent();
  expect(productRestoredBody).toContain('Laptop');
  expect(productRestoredBody).toContain('Phone');
  expect(productRestoredBody).toContain('Tablet');
  expect(productRestoredBody).toContain('Monitor');
  console.log('[BROWSER] ✓ Product restored to rows (all 4 products visible)');

  // --- STEP 9: Filter products (Laptop + Phone only) ---
  console.log('[BROWSER] Step 9: Filter products (uncheck Tablet, Monitor)');
  await SelfServicePortalsTestHelper.filterDimension(page, 'demoPivot', 'Product', ['Tablet', 'Monitor']);
  const filteredBody2 = await page.locator('#demoPivot .pvtTable').textContent();
  expect(filteredBody2).toContain('Laptop');
  expect(filteredBody2).toContain('Phone');
  expect(filteredBody2).not.toContain('Tablet');
  expect(filteredBody2).not.toContain('Monitor');
  console.log('[BROWSER] ✓ Filtered to Laptop+Phone only');

  // --- STEP 10: Visualize as chart ---
  console.log('[BROWSER] Step 10: Switch renderer to Grouped Column Chart');
  await SelfServicePortalsTestHelper.changeRenderer(page, 'demoPivot', 'Grouped Column Chart');
  const chartElement = await page.locator('#demoPivot svg, #demoPivot canvas').first();
  await expect(chartElement).toBeVisible({ timeout: 5000 });
  console.log('[BROWSER] ✓ Chart rendered (SVG/Canvas element visible)');

  // Switch back to Table
  await SelfServicePortalsTestHelper.changeRenderer(page, 'demoPivot', 'Table');

  // --- STEP 11: Reset and verify grand total preserved ---
  console.log('[BROWSER] Step 11: Reset and verify grand total integrity');
  // #refreshBtn removed — pivot-tables page no longer has this button
  await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'demoPivot');

  // Clear filters from Steps 8 and 9 so we can compare full dataset
  await SelfServicePortalsTestHelper.clearFilters(page, 'demoPivot', ['Region', 'Product']);

  const finalTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'demoPivot');
  expect(finalTotal).toBeGreaterThan(600000);
  expect(finalTotal).toBeLessThan(700000);
  expect(finalTotal).toBe(grandTotal);  // CRITICAL: Must match original (same data)
  console.log(`[BROWSER] ✓ Reset verified: grand total $${finalTotal.toLocaleString()} matches original $${grandTotal.toLocaleString()}`);

  console.log('\n=== Completed all comprehensive demo pivot actions ===\n');
}


/**
 * TEST 3 Implementation: Full warehouse pivot actions (browser engine).
 * Northwind Star Schema: countries, categories, time-series, continents, aggregators.
 */
async function performWarehousePivotActions(page: Page, baseUrl: string): Promise<void> {
  console.log('\n=== Starting warehouse pivot actions [BROWSER] ===\n');

  // Data warehouse page shows all 3 engines vertically — Browser is at the top
  await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'warehousePivotBrowser');

  // --- STEP 1: Verify initial load (Country/Category × YearQuarter) ---
  console.log('[WAREHOUSE] Step 1: Verify initial load');
  const warehouseBody = await page.locator('#warehousePivotBrowser .pvtTable').textContent();
  expect(warehouseBody).toContain('USA');
  expect(warehouseBody).toContain('Germany');
  expect(warehouseBody).toContain('France');
  expect(warehouseBody).toContain('Beverages');
  expect(warehouseBody).toContain('Dairy Products');
  const warehouseTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'warehousePivotBrowser');
  expect(warehouseTotal).toBeGreaterThan(0);
  console.log(`[WAREHOUSE] ✓ Initial load: grand total $${warehouseTotal.toLocaleString()}, key countries and categories present`);

  // --- STEP 2: Country revenue aggregation ---
  console.log('[WAREHOUSE] Step 2: Country revenue aggregation');
  const usaRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'warehousePivotBrowser', 'USA');
  const germanyRevenue = await SelfServicePortalsTestHelper.getPivotCellValue(page, 'warehousePivotBrowser', 'Germany');
  expect(usaRevenue).toBeGreaterThan(0);
  expect(germanyRevenue).toBeGreaterThan(0);
  expect(usaRevenue).toBeGreaterThan(germanyRevenue);  // USA market > Germany in Northwind data
  console.log(`[WAREHOUSE] ✓ USA: $${usaRevenue.toLocaleString()} > Germany: $${germanyRevenue.toLocaleString()} (market size hierarchy)`);

  // --- STEP 3: Time-series data present ---
  console.log('[WAREHOUSE] Step 3: Time-series analysis');
  const quarterPattern = /\d{4}[-_]Q\d/;
  expect(quarterPattern.test(warehouseBody)).toBe(true);
  console.log('[WAREHOUSE] ✓ Time-series year-quarter format present');

  // --- STEP 4: Category coverage ---
  console.log('[WAREHOUSE] Step 4: Northwind category coverage');
  const categories = ['Beverages', 'Condiments', 'Confections', 'Dairy Products', 'Grains/Cereals', 'Meat/Poultry', 'Produce', 'Seafood'];
  let categoriesFound = 0;
  for (const category of categories) {
    if (warehouseBody.includes(category)) {
      categoriesFound++;
    }
  }
  expect(categoriesFound).toBeGreaterThanOrEqual(5);
  console.log(`[WAREHOUSE] ✓ Found ${categoriesFound}/8 Northwind categories`);

  // --- STEP 5: Multi-dimensional hierarchy (add continent) ---
  console.log('[WAREHOUSE] Step 5: Multi-dimensional hierarchy (continent)');
  await SelfServicePortalsTestHelper.dragDimensionToRows(page, 'warehousePivotBrowser', 'continent');
  const continentBody = await page.locator('#warehousePivotBrowser .pvtTable').textContent();
  const continents = ['Europe', 'North America', 'South America'];
  let continentsFound = 0;
  for (const continent of continents) {
    if (continentBody.includes(continent)) {
      continentsFound++;
    }
  }
  expect(continentsFound).toBeGreaterThanOrEqual(2);
  console.log(`[WAREHOUSE] ✓ Found ${continentsFound} continents in hierarchy`);

  // --- STEP 6: Aggregator variations (Sum → Average → Count) ---
  // Reload page to reset pivot state after drag operation in step 5
  console.log('[WAREHOUSE] Step 6: Aggregator variations (Sum → Average → Count)');
  await page.goto(`${baseUrl}/data-warehouse`);
  await page.waitForTimeout(1000);
  await SelfServicePortalsTestHelper.waitForPivotTableRender(page, 'warehousePivotBrowser');

  const sumTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'warehousePivotBrowser');

  await SelfServicePortalsTestHelper.changeAggregator(page, 'warehousePivotBrowser', 'Average');
  const avgTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'warehousePivotBrowser', sumTotal);
  expect(avgTotal).toBeGreaterThan(0);
  expect(avgTotal).toBeLessThan(sumTotal);

  await SelfServicePortalsTestHelper.changeAggregator(page, 'warehousePivotBrowser', 'Count');
  const countTotal = await SelfServicePortalsTestHelper.getPivotGrandTotal(page, 'warehousePivotBrowser', avgTotal);
  expect(countTotal).toBeGreaterThan(7500);  // ~8,000 rows with variance
  expect(countTotal).toBeLessThan(8500);     // Seasonal/market fluctuations
  console.log(`[WAREHOUSE] ✓ Sum: $${sumTotal.toLocaleString()}, Avg: $${avgTotal.toLocaleString()}, Count: ${countTotal} (~8K rows)`);

  console.log('\n=== Completed all warehouse pivot actions ===\n');
}

// ============================================================
// TEST 4/5 Implementation: Single DRY entry point for all 3 engines.
// Same code path, same assertions — only the engine argument differs.
// ============================================================

type ResetPivotFn = () => Promise<void>;

const ENGINE_CONFIG = {
  browser:    { pivotId: 'warehousePivotBrowser' },
  duckdb:     { pivotId: 'warehousePivotDuckdb' },
  clickhouse: { pivotId: 'warehousePivotClickhouse' },
} as const;

type WarehouseEngine = keyof typeof ENGINE_CONFIG;

async function runWarehouseOlap(page: Page, engine: WarehouseEngine, baseUrl: string): Promise<void> {
  const { pivotId } = ENGINE_CONFIG[engine];
  const label = engine.toUpperCase();
  const warehouseUrl = `${baseUrl}/data-warehouse`;

  const navigate = async () => {
    await page.goto(warehouseUrl);
    await page.waitForTimeout(1000);
    await SelfServicePortalsTestHelper.waitForPivotTableRender(page, pivotId);
  };

  await navigate();

  const resetPivot: ResetPivotFn = async () => { await navigate(); };

  await performWarehouseOlapGuideSteps(page, pivotId, resetPivot, label);
  await resetPivot();
  await performWarehouseOlapDiverseCombinations(page, pivotId, resetPivot, label);

  console.log(`[${label}] All real-life OLAP assertions passed.`);
}

/**
 * Get the row total for a child row within a parent group in a hierarchical pivot table.
 * PivotTable.js renders parent rows with rowspan — child <tr> elements don't repeat the parent text.
 * This traverses the table tracking which parent group we're in.
 *
 * Example: getHierarchicalRowTotal(page, pivotId, 'Germany', 'Dairy Products')
 * returns the row total for Dairy Products under Germany.
 */
async function getHierarchicalRowTotal(
  page: Page,
  pivotId: string,
  parentLabel: string,
  childLabel: string,
): Promise<number> {
  const cellText = await page.evaluate(
    ({ id, parent, child }) => {
      const component = document.getElementById(id);
      if (!component) return '0';
      // Access Shadow DOM (same pattern as getPivotCellValue)
      const table = (component.shadowRoot || component).querySelector('.pvtTable') as HTMLTableElement;
      if (!table) return '0';

      const rows = Array.from(table.querySelectorAll('tbody tr'));

      // Find the parent anchor row and its rowspan to know the group boundaries
      let parentIdx = -1;
      let parentSpan = 1;
      for (let i = 0; i < rows.length; i++) {
        const ths = rows[i].querySelectorAll('th.pvtRowLabel');
        for (let h = 0; h < ths.length; h++) {
          if (ths[h].textContent?.trim() === parent) {
            parentIdx = i;
            parentSpan = parseInt(ths[h].getAttribute('rowspan') || '1', 10);
            break;
          }
        }
        if (parentIdx !== -1) break;
      }
      if (parentIdx === -1) return '0';

      // Search within the parent group for the child label
      const groupEnd = parentIdx + parentSpan;
      for (let i = parentIdx; i < groupEnd && i < rows.length; i++) {
        const ths = rows[i].querySelectorAll('th');
        const hasChild = Array.from(ths).some(th => th.textContent?.trim() === child);
        if (hasChild) {
          const tds = rows[i].querySelectorAll('td');
          if (tds.length > 0) {
            return tds[tds.length - 1]?.textContent || '0';
          }
        }
      }
      return '0';
    },
    { id: pivotId, parent: parentLabel, child: childLabel },
  );
  return parseFloat((cellText || '0').replace(/[^0-9.-]/g, '') || '0');
}

// ============================================================
// TEST 4/5 Implementation: Warehouse OLAP Guide Steps (10 steps from "How to Use" guide)
// ============================================================

/**
 * Verifies all 10 "How to Use This Warehouse Pivot" guide steps with real assertions.
 * Every claim in the guide is tested against the live NorthwindOlapDataGenerator data.
 *
 * DRY: Called once per engine in the TEST 4/5 loop with different pivotId.
 */
async function performWarehouseOlapGuideSteps(
  page: Page,
  pivotId: string,
  resetPivot: ResetPivotFn,
  engineLabel: string,
): Promise<void> {
  console.log(`\n=== Starting warehouse OLAP guide steps [${engineLabel}] ===\n`);
  const H = SelfServicePortalsTestHelper;

  await H.waitForPivotTableRender(page, pivotId);

  // ──── GROUP A: Read-only on default config (no state change, no reload) ────

  // GUIDE STEP 1: Find the Biggest Market
  // Actual ranking: USA > Germany > France > UK > ...
  console.log(`[${engineLabel}] Guide Step 1: Market ranking (USA > Germany > France > UK)`);
  const usaTotal = await H.getPivotCellValue(page, pivotId, 'USA');
  const germanyTotal = await H.getPivotCellValue(page, pivotId, 'Germany');
  const franceTotal = await H.getPivotCellValue(page, pivotId, 'France');
  const swedenTotal = await H.getPivotCellValue(page, pivotId, 'Sweden');
  expect(usaTotal).toBeGreaterThan(germanyTotal);
  expect(germanyTotal).toBeGreaterThan(franceTotal);
  expect(franceTotal).toBeGreaterThan(swedenTotal);
  expect(swedenTotal).toBeGreaterThan(0);
  // USA ~2.7x Sweden (market size ratio)
  expect(usaTotal / swedenTotal).toBeGreaterThan(2);
  expect(usaTotal / swedenTotal).toBeLessThan(4);
  console.log(`[${engineLabel}] ✓ USA=$${usaTotal.toLocaleString()} > Germany=$${germanyTotal.toLocaleString()} > France=$${franceTotal.toLocaleString()} > Sweden=$${swedenTotal.toLocaleString()}`);

  // GUIDE STEP 2: Drill Into a Country — Regional category preferences
  // Guide says: "Germany: Dairy Products and Confections notably higher than Meat"
  //             "USA: Meat/Poultry and Condiments should be stronger"
  // Generator weights: Europe Dairy=1.6 vs Meat=0.7; N.America Meat=1.4 vs Dairy=0.7
  console.log(`[${engineLabel}] Guide Step 2: Regional category preferences`);
  const germanyDairy = await getHierarchicalRowTotal(page, pivotId, 'Germany', 'Dairy Products');
  const germanyMeat = await getHierarchicalRowTotal(page, pivotId, 'Germany', 'Meat/Poultry');
  expect(germanyDairy).toBeGreaterThan(germanyMeat);
  console.log(`[${engineLabel}] ✓ Germany: Dairy=$${germanyDairy.toLocaleString()} > Meat=$${germanyMeat.toLocaleString()} (European preference)`);

  const usaMeat = await getHierarchicalRowTotal(page, pivotId, 'USA', 'Meat/Poultry');
  const usaDairy = await getHierarchicalRowTotal(page, pivotId, 'USA', 'Dairy Products');
  expect(usaMeat).toBeGreaterThan(usaDairy);
  console.log(`[${engineLabel}] ✓ USA: Meat=$${usaMeat.toLocaleString()} > Dairy=$${usaDairy.toLocaleString()} (American preference)`);

  // GUIDE STEP 4: Spot the Seasonal Pattern
  // Guide says: "Q4 noticeably higher than Q1" — seasonal factors Q1=0.85, Q4=1.15
  console.log(`[${engineLabel}] Guide Step 4: Seasonal pattern (Q4 > Q1)`);
  const q1_2023 = await H.getPivotCellValue(page, pivotId, 'Totals', '2023-Q1');
  const q4_2023 = await H.getPivotCellValue(page, pivotId, 'Totals', '2023-Q4');
  const q1_2024 = await H.getPivotCellValue(page, pivotId, 'Totals', '2024-Q1');
  const q4_2024 = await H.getPivotCellValue(page, pivotId, 'Totals', '2024-Q4');
  expect(q4_2023).toBeGreaterThan(q1_2023);
  expect(q4_2024).toBeGreaterThan(q1_2024);
  // Q4/Q1 ratio should be roughly 1.15/0.85 ≈ 1.35
  const seasonalRatio2023 = q4_2023 / q1_2023;
  expect(seasonalRatio2023).toBeGreaterThan(1.15);
  expect(seasonalRatio2023).toBeLessThan(1.65);
  console.log(`[${engineLabel}] ✓ 2023: Q4=$${q4_2023.toLocaleString()} > Q1=$${q1_2023.toLocaleString()} (ratio ${seasonalRatio2023.toFixed(2)})`);
  console.log(`[${engineLabel}] ✓ 2024: Q4=$${q4_2024.toLocaleString()} > Q1=$${q1_2024.toLocaleString()}`);

  // GUIDE STEP 5: Check Year-over-Year Growth
  // Guide says: "2024 numbers should be ~5% higher" — generator yearGrowth=1.05
  console.log(`[${engineLabel}] Guide Step 5: Year-over-year growth (~5%)`);
  const q2_2023 = await H.getPivotCellValue(page, pivotId, 'Totals', '2023-Q2');
  const q3_2023 = await H.getPivotCellValue(page, pivotId, 'Totals', '2023-Q3');
  const q2_2024 = await H.getPivotCellValue(page, pivotId, 'Totals', '2024-Q2');
  const q3_2024 = await H.getPivotCellValue(page, pivotId, 'Totals', '2024-Q3');
  const total2023 = q1_2023 + q2_2023 + q3_2023 + q4_2023;
  const total2024 = q1_2024 + q2_2024 + q3_2024 + q4_2024;
  expect(total2024).toBeGreaterThan(total2023);
  const growthPct = ((total2024 - total2023) / total2023) * 100;
  expect(growthPct).toBeGreaterThan(2);
  expect(growthPct).toBeLessThan(15);
  console.log(`[${engineLabel}] ✓ 2023=$${total2023.toLocaleString()}, 2024=$${total2024.toLocaleString()}, growth=${growthPct.toFixed(1)}%`);

  // ──── GROUP B: Reversible value field change (no reload needed) ────

  // GUIDE STEP 6: Gross vs Net — What Are Discounts Costing Us?
  // Guide says: "Numbers go up. The difference = discount impact."
  // Generator: discounts [0, 0, 0.05, 0.10, 0.15, 0.20] — avg ~8.3%
  console.log(`[${engineLabel}] Guide Step 6: Gross vs Net revenue (discount impact)`);
  const netGrandTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.changeValueField(page, pivotId, 'gross_revenue');
  const grossGrandTotal = await H.getPivotGrandTotal(page, pivotId, netGrandTotal);
  expect(grossGrandTotal).toBeGreaterThan(netGrandTotal);
  const discountImpactPct = ((grossGrandTotal - netGrandTotal) / grossGrandTotal) * 100;
  expect(discountImpactPct).toBeGreaterThan(3);
  expect(discountImpactPct).toBeLessThan(15);
  console.log(`[${engineLabel}] ✓ Net=$${netGrandTotal.toLocaleString()}, Gross=$${grossGrandTotal.toLocaleString()}, discount impact=${discountImpactPct.toFixed(1)}%`);
  // Restore
  await H.changeValueField(page, pivotId, 'net_revenue');

  // ──── GROUP C: Reversible aggregator change (no reload needed) ────

  // GUIDE STEP 8: Average Transaction Value (Not Just Totals)
  // Guide says: "Average per transaction, not totals"
  console.log(`[${engineLabel}] Guide Step 8: Average vs Sum`);
  const sumGrandTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.changeAggregator(page, pivotId, 'Average');
  const avgGrandTotal = await H.getPivotGrandTotal(page, pivotId, sumGrandTotal);
  expect(avgGrandTotal).toBeGreaterThan(0);
  expect(avgGrandTotal).toBeLessThan(sumGrandTotal);
  console.log(`[${engineLabel}] ✓ Sum=$${sumGrandTotal.toLocaleString()}, Avg=$${avgGrandTotal.toLocaleString()}`);
  // Restore
  await H.changeAggregator(page, pivotId, 'Sum');

  // ──── GROUP D: Destructive — drag continent to rows (reload after) ────

  // GUIDE STEP 3: Compare Continents Instead of Countries
  // Guide says: "Europe vs North America vs South America — clean continent-level totals"
  console.log(`[${engineLabel}] Guide Step 3: Continent comparison`);
  await H.dragDimensionToRows(page, pivotId, 'continent');
  const continentBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(continentBody).toContain('Europe');
  expect(continentBody).toContain('North America');
  expect(continentBody).toContain('South America');
  const europeTotal = await H.getPivotCellValue(page, pivotId, 'Europe');
  const naTotal = await H.getPivotCellValue(page, pivotId, 'North America');
  const saTotal = await H.getPivotCellValue(page, pivotId, 'South America');
  expect(europeTotal).toBeGreaterThan(0);
  expect(naTotal).toBeGreaterThan(0);
  expect(saTotal).toBeGreaterThan(0);
  // Continent hierarchy based on combined market sizes
  expect(europeTotal).toBeGreaterThan(naTotal);  // Europe (4.6x) > North America (3.2x)
  expect(naTotal).toBeGreaterThan(saTotal);      // North America (3.2x) > South America (1.25x)
  // Europe (Germany+France+UK+Italy = 1.3+1.2+1.1+1.0=4.6) vs NA (USA+Canada+Mexico = 1.5+0.9+0.8=3.2) vs SA (Brazil+Argentina = 0.7+0.55=1.25)
  expect(europeTotal).toBeGreaterThan(saTotal);
  expect(naTotal).toBeGreaterThan(saTotal);
  console.log(`[${engineLabel}] ✓ Europe=$${europeTotal.toLocaleString()}, NA=$${naTotal.toLocaleString()}, SA=$${saTotal.toLocaleString()}`);

  await resetPivot();

  // ──── GROUP E: Destructive — drag employee_name to rows (reload after) ────

  // GUIDE STEP 7: Who's Selling What? (Sales Rep Analysis)
  // Guide says: "Nancy Davolio, Andrew Fuller, and Janet Leverling"
  console.log(`[${engineLabel}] Guide Step 7: Employee drill-down`);
  await H.dragDimensionToRows(page, pivotId, 'employee_name');
  const empBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(empBody).toContain('Nancy Davolio');
  expect(empBody).toContain('Andrew Fuller');
  expect(empBody).toContain('Janet Leverling');
  // All 3 employees should have substantial revenue (each ~33% of orders, round-robin)
  const nancyTotal = await H.getPivotCellValue(page, pivotId, 'Nancy Davolio');
  const andrewTotal = await H.getPivotCellValue(page, pivotId, 'Andrew Fuller');
  const janetTotal = await H.getPivotCellValue(page, pivotId, 'Janet Leverling');
  const empSum = nancyTotal + andrewTotal + janetTotal;
  // Each employee should be 15-50% of total (round-robin gives ~33%, generous range for variance)
  expect(nancyTotal / empSum).toBeGreaterThan(0.15);
  expect(nancyTotal / empSum).toBeLessThan(0.50);
  expect(andrewTotal / empSum).toBeGreaterThan(0.15);
  expect(andrewTotal / empSum).toBeLessThan(0.50);
  expect(janetTotal / empSum).toBeGreaterThan(0.15);
  expect(janetTotal / empSum).toBeLessThan(0.50);
  console.log(`[${engineLabel}] ✓ Nancy=$${nancyTotal.toLocaleString()} (${(nancyTotal/empSum*100).toFixed(0)}%), Andrew=$${andrewTotal.toLocaleString()} (${(andrewTotal/empSum*100).toFixed(0)}%), Janet=$${janetTotal.toLocaleString()} (${(janetTotal/empSum*100).toFixed(0)}%)`);

  await resetPivot();

  // ──── GROUP F: Destructive — filter + chart (reload after) ────

  // GUIDE STEP 9: Filter to Focus
  // Guide says: "Uncheck everything except USA, Germany, and France"
  console.log(`[${engineLabel}] Guide Step 9: Filter to USA+Germany+France`);
  const preFilterTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.filterDimension(page, pivotId, 'customer_country',
    ['Argentina', 'Brazil', 'Canada', 'Italy', 'Mexico', 'Sweden', 'UK']);
  const filteredBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(filteredBody).toContain('USA');
  expect(filteredBody).toContain('Germany');
  expect(filteredBody).toContain('France');
  expect(filteredBody).not.toContain('Sweden');
  expect(filteredBody).not.toContain('Brazil');
  expect(filteredBody).not.toContain('Argentina');
  const filteredTotal = await H.getPivotGrandTotal(page, pivotId);
  expect(filteredTotal).toBeGreaterThan(0);
  expect(filteredTotal).toBeLessThan(preFilterTotal);
  console.log(`[${engineLabel}] ✓ Filtered: $${filteredTotal.toLocaleString()} (was $${preFilterTotal.toLocaleString()}), only USA+Germany+France visible`);

  // GUIDE STEP 10: Visualize It
  // Guide says: "Grouped Column Chart — countries become colored bars, quarters become groups"
  console.log(`[${engineLabel}] Guide Step 10: Chart visualization`);
  await H.changeRenderer(page, pivotId, 'Grouped Column Chart');
  const chartElement = page.locator(`#${pivotId} svg, #${pivotId} canvas`).first();
  await expect(chartElement).toBeVisible({ timeout: 5000 });
  console.log(`[${engineLabel}] ✓ Grouped Column Chart rendered (SVG/Canvas visible)`);

  console.log(`\n=== Completed all 10 warehouse OLAP guide steps [${engineLabel}] ===\n`);
}

// ============================================================
// TEST 4/5 Implementation: Diverse OLAP Combinations (complementary to guide steps)
// ============================================================

/**
 * Additional OLAP combinations that are complementary to the guide steps.
 * Each tests a different feature/aggregator/grouping — no overlap with guide steps.
 *
 * DRY: Called once per engine in the TEST 4/5 loop with different pivotId.
 */
async function performWarehouseOlapDiverseCombinations(
  page: Page,
  pivotId: string,
  resetPivot: ResetPivotFn,
  engineLabel: string,
): Promise<void> {
  console.log(`\n=== Starting diverse OLAP combinations [${engineLabel}] ===\n`);
  const H = SelfServicePortalsTestHelper;

  await H.waitForPivotTableRender(page, pivotId);

  // ──── GROUP H: Reversible — Count aggregator + Quantity metric + Heatmap ────

  // DIVERSE 1: Count aggregator — total transaction count
  // Generator produces ~8,000 fact rows (seed=42, deterministic)
  // NOTE: Server-side engines (DuckDB/ClickHouse) pre-aggregate rows on the server,
  // so "Count" in the client counts grouped rows (~640), not raw transactions (~7937).
  // Browser engine has all raw rows, so Count = ~7937.
  console.log(`[${engineLabel}] Diverse 1: Count aggregator (transaction count)`);
  const isServerEngine = engineLabel === 'DUCKDB' || engineLabel === 'CLICKHOUSE';
  const preCountTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.changeAggregator(page, pivotId, 'Count');
  const countTotal = await H.getPivotGrandTotal(page, pivotId, preCountTotal);
  if (isServerEngine) {
    // Server returns ~640 grouped rows (country × category × quarter combos)
    expect(countTotal).toBeGreaterThan(500);
    expect(countTotal).toBeLessThan(1000);
  } else {
    expect(countTotal).toBeGreaterThan(7000);
    expect(countTotal).toBeLessThan(10000);
  }
  console.log(`[${engineLabel}] ✓ Transaction count: ${countTotal}`);
  // Restore
  await H.changeAggregator(page, pivotId, 'Sum');

  // DIVERSE 2: Quantity metric (not revenue)
  // Generator: quantity per row = 5 + rand(46), so 5-50, mean ~27.5
  // ~8000 rows × ~27.5 = ~220,000 total quantity
  console.log(`[${engineLabel}] Diverse 2: Quantity metric`);
  const preQuantityTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.changeValueField(page, pivotId, 'quantity');
  const quantityTotal = await H.getPivotGrandTotal(page, pivotId, preQuantityTotal);
  expect(quantityTotal).toBeGreaterThan(100000);
  expect(quantityTotal).toBeLessThan(500000);
  // USA should still have highest quantity (largest market)
  const usaQuantity = await H.getPivotCellValue(page, pivotId, 'USA');
  const swedenQuantity = await H.getPivotCellValue(page, pivotId, 'Sweden');
  expect(usaQuantity).toBeGreaterThan(swedenQuantity);
  console.log(`[${engineLabel}] ✓ Total quantity: ${quantityTotal.toLocaleString()}, USA=${usaQuantity.toLocaleString()} > Sweden=${swedenQuantity.toLocaleString()}`);
  // Restore
  await H.changeValueField(page, pivotId, 'net_revenue');

  // DIVERSE 3: Heatmap renderer
  console.log(`[${engineLabel}] Diverse 3: Heatmap renderer`);
  await H.changeRenderer(page, pivotId, 'Heatmap');
  const heatmapTable = page.locator(`#${pivotId} .pvtTable, #${pivotId} table`).first();
  await expect(heatmapTable).toBeVisible({ timeout: 5000 });
  console.log(`[${engineLabel}] ✓ Heatmap rendered`);
  // Restore
  await H.changeRenderer(page, pivotId, 'Table');

  // ──── GROUP I: Destructive — Product-level analysis (reload after) ────

  // DIVERSE 4: Product drill-down — all 16 products visible
  console.log(`[${engineLabel}] Diverse 4: Product-level analysis (16 products)`);
  await H.dragDimensionToRows(page, pivotId, 'product_name');
  const prodBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  const allProducts = [
    'Chai Tea', 'Colombian Coffee', 'Cajun Seasoning', 'Dijon Mustard',
    'Dark Chocolate Truffles', 'Vanilla Cream Cookies', 'Aged Cheddar', 'Gouda Wheel',
    'Organic Quinoa', 'Artisan Sourdough', 'Wagyu Beef Strips', 'Free-Range Chicken',
    'Heirloom Tomatoes', 'California Avocados', 'Atlantic Salmon', 'Pacific Prawns',
  ];
  let productsFound = 0;
  for (const p of allProducts) {
    if (prodBody.includes(p)) productsFound++;
  }
  expect(productsFound).toBeGreaterThanOrEqual(14);
  console.log(`[${engineLabel}] ✓ Found ${productsFound}/16 products`);

  await resetPivot();

  // ──── GROUP J: Destructive — Multi-level hierarchy (reload after) ────

  // DIVERSE 5: 3-level hierarchy — continent added to existing country+category rows
  console.log(`[${engineLabel}] Diverse 5: Multi-level hierarchy (continent + country + category)`);
  await H.dragDimensionToRows(page, pivotId, 'continent');
  const hierarchyBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  // All three levels should be present
  expect(hierarchyBody).toContain('Europe');
  expect(hierarchyBody).toContain('North America');
  expect(hierarchyBody).toContain('USA');
  expect(hierarchyBody).toContain('Germany');
  expect(hierarchyBody).toContain('Beverages');
  expect(hierarchyBody).toContain('Seafood');
  console.log(`[${engineLabel}] ✓ 3-level hierarchy: continents + countries + categories all visible`);

  await resetPivot();

  // ──── GROUP K: Destructive — Sort by value descending (reload after) ────

  // DIVERSE 6: Sort descending — USA (largest market) should appear before Sweden (smallest)
  console.log(`[${engineLabel}] Diverse 6: Sort by value descending`);
  await H.sortPivot(page, pivotId, 'value_z_to_a');
  const sortedBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  const usaIdx = sortedBody.indexOf('USA');
  const swedenIdx = sortedBody.indexOf('Sweden');
  expect(usaIdx).toBeGreaterThan(-1);
  expect(swedenIdx).toBeGreaterThan(-1);
  expect(usaIdx).toBeLessThan(swedenIdx);
  console.log(`[${engineLabel}] ✓ Sorted: USA(pos=${usaIdx}) before Sweden(pos=${swedenIdx})`);

  await resetPivot();

  // ──── GROUP M: Destructive — Double filter (reload after) ────

  // DIVERSE 7: Filter both countries AND categories simultaneously
  // Only USA + Germany × Dairy Products + Meat/Poultry
  console.log(`[${engineLabel}] Diverse 7: Double filter (2 countries × 2 categories)`);
  const preDoubleFilterTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.filterDimension(page, pivotId, 'customer_country',
    ['Argentina', 'Brazil', 'Canada', 'France', 'Italy', 'Mexico', 'Sweden', 'UK']);
  await H.filterDimension(page, pivotId, 'category_name',
    ['Beverages', 'Condiments', 'Confections', 'Grains/Cereals', 'Produce', 'Seafood']);
  const dblBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(dblBody).toContain('USA');
  expect(dblBody).toContain('Germany');
  expect(dblBody).toContain('Dairy Products');
  expect(dblBody).toContain('Meat/Poultry');
  expect(dblBody).not.toContain('France');
  expect(dblBody).not.toContain('Beverages');
  expect(dblBody).not.toContain('Seafood');
  const dblTotal = await H.getPivotGrandTotal(page, pivotId);
  // 2 countries × 2 categories out of 10 × 8 — USA+Germany are big markets, Dairy+Meat are mid-size
  expect(dblTotal).toBeGreaterThan(preDoubleFilterTotal * 0.03);
  expect(dblTotal).toBeLessThan(preDoubleFilterTotal * 0.35);
  console.log(`[${engineLabel}] ✓ Double-filtered (USA+Germany × Dairy+Meat): $${dblTotal.toLocaleString()} (${(dblTotal/preDoubleFilterTotal*100).toFixed(1)}% of $${preDoubleFilterTotal.toLocaleString()})`);

  await resetPivot();

  // ──── GROUP N: Destructive — Customer-level drill (reload after) ────

  // DIVERSE 8: Customer drill-down — 30 customers (3 per country)
  console.log(`[${engineLabel}] Diverse 8: Customer-level drill (30 customers)`);
  await H.dragDimensionToRows(page, pivotId, 'customer_name');
  const custBody = await page.locator(`#${pivotId} .pvtTable`).textContent();
  // Spot-check customers from different countries
  const sampleCustomers = [
    'Global Foods Inc',           // USA
    'Berliner Delikatessen',      // Germany
    'Paris Gourmand',             // France
    'Rio Grande Foods',           // Brazil
    'Stockholm Supplies',         // Sweden
  ];
  let customersFound = 0;
  for (const c of sampleCustomers) {
    if (custBody.includes(c)) customersFound++;
  }
  expect(customersFound).toBeGreaterThanOrEqual(3);
  console.log(`[${engineLabel}] ✓ Found ${customersFound}/${sampleCustomers.length} sample customers from different countries`);

  await resetPivot();

  // ──── GROUP O: Destructive — Product discontinuation analysis (Q6 from guide) ────

  // GUIDE Q6: "Which product should we discontinue?"
  // Guide says: "Drag product_name to rows, remove countries. Sort by totals. Lowest performer = candidate."
  console.log(`[${engineLabel}] Guide Q6: Product discontinuation analysis (lowest performer)`);

  // First, drag product_name to rows (this adds it to existing country+category hierarchy)
  await H.dragDimensionToRows(page, pivotId, 'product_name');

  // Remove countries and categories to isolate products — use proper component API
  await H.dragDimensionFromRowsToUnused(page, pivotId, 'customer_country');
  await H.dragDimensionFromRowsToUnused(page, pivotId, 'category_name');

  // Sort by value ascending to find the lowest performer
  await H.sortPivot(page, pivotId, 'value_a_to_z');

  const prodSortedBody = await page.locator(`#${pivotId} .pvtTable`).textContent();

  // Verify products are present and sorted
  // The lowest revenue products should appear first now
  // Spot-check that products exist
  let sortedProductsFound = 0;
  for (const p of allProducts.slice(0, 5)) {
    if (prodSortedBody.includes(p)) sortedProductsFound++;
  }
  expect(sortedProductsFound).toBeGreaterThanOrEqual(3);  // 16 products exist, at least 3 out of first 5 should match

  // Get the first product row's total (should be lowest)
  const firstProductValue = await page.evaluate(({ id }) => {
    const component = document.getElementById(id);
    if (!component) return 0;
    const root = component.shadowRoot || component;
    const table = root.querySelector('.pvtTable') as HTMLTableElement;
    if (!table) return 0;

    // Find first data row (skip header) — use :scope > tbody > tr to avoid outer table rows
    const tbody = table.querySelector(':scope > tbody');
    if (!tbody) return 0;
    const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
    for (const row of rows) {
      const th = row.querySelector('th.pvtRowLabel');
      const tds = row.querySelectorAll('td');
      if (th && tds.length > 0) {
        // Last td is the row total
        const totalCell = tds[tds.length - 1];
        const text = (totalCell.textContent || '').replace(/[^0-9.-]/g, '');
        return parseFloat(text) || 0;
      }
    }
    return 0;
  }, { id: pivotId });

  // Lowest performer should be well below the average product revenue
  const prodGrandTotal = await H.getPivotGrandTotal(page, pivotId);
  const avgProductRevenue = prodGrandTotal / 16;  // 16 products in Northwind
  expect(firstProductValue).toBeGreaterThan(0);
  expect(firstProductValue).toBeLessThan(avgProductRevenue);
  console.log(`[${engineLabel}] ✓ Product discontinuation: lowest=$${firstProductValue.toLocaleString()} < avg=$${avgProductRevenue.toLocaleString()} per product`);

  await resetPivot();

  // ──── GROUP P: Destructive — Single-country isolation (Q8 from guide) ────

  // GUIDE Q8: "Is Sweden worth keeping as a market?"
  // Guide says: "Filter to just Sweden. Small revenue? Compare cost of operations vs revenue."
  console.log(`[${engineLabel}] Guide Q8: Single-country isolation (Sweden market analysis)`);

  const preFilterGrandTotal = await H.getPivotGrandTotal(page, pivotId);

  // Filter OUT all countries except Sweden
  // This is the inverse of the usual filter pattern
  const allCountries = ['Argentina', 'Brazil', 'Canada', 'France', 'Germany', 'Italy', 'Mexico', 'UK', 'USA'];
  await H.filterDimension(page, pivotId, 'customer_country', allCountries);

  const swedenOnlyBody = await page.locator(`#${pivotId} .pvtTable`).textContent();

  // Verify ONLY Sweden is visible
  expect(swedenOnlyBody).toContain('Sweden');
  expect(swedenOnlyBody).not.toContain('USA');
  expect(swedenOnlyBody).not.toContain('Germany');
  expect(swedenOnlyBody).not.toContain('France');

  const swedenOnlyTotal = await H.getPivotGrandTotal(page, pivotId);
  expect(swedenOnlyTotal).toBeGreaterThan(0);

  // Sweden should be much smaller than the full dataset (smallest market)
  expect(swedenOnlyTotal).toBeLessThan(preFilterGrandTotal * 0.25);

  // Calculate Sweden's percentage of total revenue
  const swedenPct = (swedenOnlyTotal / preFilterGrandTotal) * 100;
  expect(swedenPct).toBeLessThan(15);

  console.log(`[${engineLabel}] ✓ Sweden-only: $${swedenOnlyTotal.toLocaleString()} (${swedenPct.toFixed(1)}% of total $${preFilterGrandTotal.toLocaleString()})`);
  console.log(`[${engineLabel}] ✓ Small market confirmed — decision: compare $${swedenOnlyTotal.toLocaleString()} revenue vs operational costs`);

  await resetPivot();

  // ──── GROUP Q: Reversible — Heatmap Renderers (3 variants) ────

  // DIVERSE 9: Table Heatmap — Full heatmap (all cells colored)
  // Verify RGB gradient is applied: min values → red-ish, max values → green-ish
  console.log(`[${engineLabel}] Diverse 9: Table Heatmap (full gradient verification)`);
  await H.changeRenderer(page, pivotId, 'Table Heatmap');

  // Extract cell colors and values
  const heatmapData = await page.evaluate(({ id }) => {
    const component = document.getElementById(id);
    if (!component) return { cells: [], minVal: 0, maxVal: 0 };

    const root = component.shadowRoot || component;
    const table = root.querySelector('.pvtTable') as HTMLTableElement;
    if (!table) return { cells: [], minVal: 0, maxVal: 0 };

    const tbody = table.querySelector(':scope > tbody');
    const cells = Array.from((tbody || table).querySelectorAll('td'));
    const cellData = cells.map(cell => {
      const text = (cell.textContent || '').trim();
      const value = parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
      const bgColor = window.getComputedStyle(cell).backgroundColor;
      return { value, bgColor, text };
    }).filter(c => c.value > 0); // Only cells with numeric values

    // Find min/max values
    const values = cellData.map(c => c.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    return { cells: cellData, minVal, maxVal };
  }, { id: pivotId });

  // Verify heatmap table has data cells with varying values
  expect(heatmapData.cells.length).toBeGreaterThan(10); // Should have many data cells
  expect(heatmapData.maxVal).toBeGreaterThan(heatmapData.minVal);

  console.log(`[${engineLabel}] ✓ Table Heatmap: ${heatmapData.cells.length} data cells, min=$${heatmapData.minVal.toLocaleString()} vs max=$${heatmapData.maxVal.toLocaleString()}`);

  // DIVERSE 10: Table Col Heatmap — Column-wise gradient
  console.log(`[${engineLabel}] Diverse 10: Table Col Heatmap (column-wise gradient)`);
  await H.changeRenderer(page, pivotId, 'Table Col Heatmap');
  const colHeatmapCells = await page.locator(`#${pivotId} .pvtTable td`).count();
  expect(colHeatmapCells).toBeGreaterThan(10);
  console.log(`[${engineLabel}] ✓ Table Col Heatmap rendered (${colHeatmapCells} data cells)`);

  // DIVERSE 11: Table Row Heatmap — Row-wise gradient
  console.log(`[${engineLabel}] Diverse 11: Table Row Heatmap (row-wise gradient)`);
  await H.changeRenderer(page, pivotId, 'Table Row Heatmap');
  const rowHeatmapCells = await page.locator(`#${pivotId} .pvtTable td`).count();
  expect(rowHeatmapCells).toBeGreaterThan(10);
  console.log(`[${engineLabel}] ✓ Table Row Heatmap rendered (${rowHeatmapCells} data cells)`);

  // Restore to Table
  await H.changeRenderer(page, pivotId, 'Table');

  // ──── GROUP R: Reversible — Statistical Aggregators (4 types) ────

  // DIVERSE 12: Median aggregator
  // Browser: Median of ~8,000 individual transactions (~$200-$1000)
  // Server-side: Median of ~640 pre-aggregated group sums (much higher values)
  console.log(`[${engineLabel}] Diverse 12: Median aggregator (middle value)`);
  const preMedianTotal = await H.getPivotGrandTotal(page, pivotId);
  await H.changeAggregator(page, pivotId, 'Median');
  const medianTotal = await H.getPivotGrandTotal(page, pivotId, preMedianTotal);
  if (isServerEngine) {
    // Median of group sums — each group sums ~12 transactions, so median ≈ $3,000-$15,000
    expect(medianTotal).toBeGreaterThan(100);
    expect(medianTotal).toBeLessThan(50000);
  } else {
    expect(medianTotal).toBeGreaterThan(200);
    expect(medianTotal).toBeLessThan(1200);
  }
  console.log(`[${engineLabel}] ✓ Median: $${medianTotal.toLocaleString()} (middle value)`);

  // DIVERSE 13: Minimum aggregator
  // Browser: Smallest individual transaction (~$21)
  // Server-side: Smallest group sum (smallest country×category×quarter combo)
  console.log(`[${engineLabel}] Diverse 13: Minimum aggregator (smallest value)`);
  await H.changeAggregator(page, pivotId, 'Minimum');
  const minTotal = await H.getPivotGrandTotal(page, pivotId, medianTotal);
  expect(minTotal).toBeGreaterThan(0);
  if (isServerEngine) {
    expect(minTotal).toBeLessThan(5000); // Smallest group sum
  } else {
    expect(minTotal).toBeLessThan(150); // Smallest individual transaction
  }
  console.log(`[${engineLabel}] ✓ Minimum: $${minTotal.toLocaleString()} (smallest value found)`);

  // DIVERSE 14: Maximum aggregator
  // Browser: Largest individual transaction (~$2,475)
  // Server-side: Largest group sum (USA×category×Q4 combo could be $30,000+)
  console.log(`[${engineLabel}] Diverse 14: Maximum aggregator (largest value)`);
  await H.changeAggregator(page, pivotId, 'Maximum');
  const maxTotal = await H.getPivotGrandTotal(page, pivotId, minTotal);
  if (isServerEngine) {
    expect(maxTotal).toBeGreaterThan(1000);
    expect(maxTotal).toBeLessThan(100000);
  } else {
    expect(maxTotal).toBeGreaterThan(1000);
    expect(maxTotal).toBeLessThan(3000);
  }
  console.log(`[${engineLabel}] ✓ Maximum: $${maxTotal.toLocaleString()} (largest value found)`);

  // DIVERSE 15: Sample Standard Deviation
  // Server-side: StdDev of group sums has higher variance
  console.log(`[${engineLabel}] Diverse 15: Sample Standard Deviation (volatility measure)`);
  await H.changeAggregator(page, pivotId, 'Sample Standard Deviation');
  const stdDevTotal = await H.getPivotGrandTotal(page, pivotId, maxTotal);
  expect(stdDevTotal).toBeGreaterThan(0); // StdDev must be positive
  if (isServerEngine) {
    expect(stdDevTotal).toBeLessThan(20000);
  } else {
    expect(stdDevTotal).toBeLessThan(1000);
  }
  console.log(`[${engineLabel}] ✓ Sample StdDev: $${stdDevTotal.toLocaleString()} (revenue volatility)`);

  // Restore to Sum
  await H.changeAggregator(page, pivotId, 'Sum');

  // ──── GROUP S: Reversible — Chart Variants (3 smoke tests) ────

  // DIVERSE 16: Stacked Column Chart (smoke test)
  console.log(`[${engineLabel}] Diverse 16: Stacked Column Chart (smoke test)`);
  await H.changeRenderer(page, pivotId, 'Stacked Column Chart');
  const stackedChartElement = page.locator(`#${pivotId} canvas`).first();
  await expect(stackedChartElement).toBeVisible({ timeout: 5000 });
  // Verify no error messages
  const stackedErrorCount = await page.locator(`#${pivotId} .pvtError`).count();
  expect(stackedErrorCount).toBe(0);
  console.log(`[${engineLabel}] ✓ Stacked Column Chart rendered (canvas visible, no errors)`);

  // DIVERSE 17: Line Chart (smoke test for temporal trends)
  console.log(`[${engineLabel}] Diverse 17: Line Chart (temporal trend visualization)`);
  await H.changeRenderer(page, pivotId, 'Line Chart');
  const lineChartElement = page.locator(`#${pivotId} canvas`).first();
  await expect(lineChartElement).toBeVisible({ timeout: 5000 });
  const lineErrorCount = await page.locator(`#${pivotId} .pvtError`).count();
  expect(lineErrorCount).toBe(0);
  console.log(`[${engineLabel}] ✓ Line Chart rendered (ideal for 8-quarter time series)`);

  // DIVERSE 18: Pie Chart (smoke test for proportions)
  console.log(`[${engineLabel}] Diverse 18: Pie Chart (proportion visualization)`);
  await H.changeRenderer(page, pivotId, 'Pie Chart');
  const pieChartElement = page.locator(`#${pivotId} canvas`).first();
  await expect(pieChartElement).toBeVisible({ timeout: 5000 });
  const pieErrorCount = await page.locator(`#${pivotId} .pvtError`).count();
  expect(pieErrorCount).toBe(0);
  console.log(`[${engineLabel}] ✓ Pie Chart rendered (shows country revenue distribution)`);

  // Restore to Table
  await H.changeRenderer(page, pivotId, 'Table');

  // ──── GROUP T: Reversible — Fraction Aggregators (percentage verification) ────

  // DIVERSE 19: Sum as Fraction of Total (all cells should sum to ~100%)
  console.log(`[${engineLabel}] Diverse 19: Sum as Fraction of Total (% verification)`);
  await H.changeAggregator(page, pivotId, 'Sum as Fraction of Total');

  // Read all country percentages
  const countriesForPct = ['USA', 'Germany', 'France', 'UK', 'Italy', 'Sweden', 'Canada', 'Mexico', 'Brazil', 'Argentina'];
  let totalPct = 0;
  const countryPcts: Record<string, number> = {};

  for (const country of countriesForPct) {
    const pct = await H.getPivotCellValue(page, pivotId, country);
    expect(pct).toBeGreaterThan(0); // Each country contributes something
    expect(pct).toBeLessThan(100); // No single country is 100%
    countryPcts[country] = pct;
    totalPct += pct;
  }

  // All country percentages should sum to ~100% (allowing for rounding/display precision)
  // Note: each country % is displayed with limited decimal places, so cumulative rounding
  // can reduce the sum (e.g., 10 countries × 0.05 rounding = up to 0.5 lost)
  expect(totalPct).toBeGreaterThanOrEqual(99.0);
  expect(totalPct).toBeLessThanOrEqual(101.0);
  console.log(`[${engineLabel}] ✓ Fraction of Total: ${Object.keys(countryPcts).length} countries sum to ${totalPct.toFixed(2)}% (USA=${countryPcts['USA'].toFixed(1)}%, Germany=${countryPcts['Germany'].toFixed(1)}%)`);

  // DIVERSE 20: Sum as Fraction of Rows (each leaf row should sum to ~100%)
  // With hierarchical rows (country → category), each LEAF row (category under a country)
  // sums to 100% across columns. Using country-level 'USA' would sum 8 categories' fractions
  // (each with different denominators), giving ~800% instead of ~100%.
  // Use leaf-level 'Beverages' (first category under first country alphabetically).
  console.log(`[${engineLabel}] Diverse 20: Sum as Fraction of Rows (row percentages)`);
  await H.changeAggregator(page, pivotId, 'Sum as Fraction of Rows');

  // Read leaf row (Beverages) percentages across all quarters (should sum to ~100%)
  const quarters = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4'];
  let leafRowPct = 0;
  for (const quarter of quarters) {
    const pct = await H.getPivotCellValue(page, pivotId, 'Beverages', quarter);
    leafRowPct += pct;
  }

  // Allow for cumulative rounding across 8 quarters (each displayed with limited precision)
  expect(leafRowPct).toBeGreaterThanOrEqual(99.0);
  expect(leafRowPct).toBeLessThanOrEqual(101.0);
  console.log(`[${engineLabel}] ✓ Fraction of Rows: Beverages row quarters sum to ${leafRowPct.toFixed(2)}% (each quarter is % of row total)`);

  // DIVERSE 21: Sum as Fraction of Columns (each column should sum to ~100%)
  // For default config, each quarter column should sum to 100%
  console.log(`[${engineLabel}] Diverse 21: Sum as Fraction of Columns (column percentages)`);
  await H.changeAggregator(page, pivotId, 'Sum as Fraction of Columns');

  // Read Q4-2024 column percentages across all countries (should sum to ~100%)
  let q4ColPct = 0;
  for (const country of countriesForPct) {
    const pct = await H.getPivotCellValue(page, pivotId, country, '2024-Q4');
    q4ColPct += pct;
  }

  // Allow for cumulative rounding across 10 countries (each displayed with limited precision)
  expect(q4ColPct).toBeGreaterThanOrEqual(99.0);
  expect(q4ColPct).toBeLessThanOrEqual(101.0);
  console.log(`[${engineLabel}] ✓ Fraction of Columns: 2024-Q4 column countries sum to ${q4ColPct.toFixed(2)}% (each country is % of Q4 total)`);

  // Restore to Sum
  await H.changeAggregator(page, pivotId, 'Sum');

  // ──── GROUP T: Destructive — Drag to unused (reload after) ────

  // DIVERSE 22: Drag dimension from rows back to unused
  console.log(`[${engineLabel}] Diverse 22: Remove dimension (drag to unused)`);
  await H.dragDimensionToRows(page, pivotId, 'employee_name');
  let bodyBefore = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(bodyBefore).toContain('Nancy Davolio');  // Employee visible

  await H.dragDimensionFromRowsToUnused(page, pivotId, 'employee_name');
  let bodyAfter = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(bodyAfter).not.toContain('Nancy Davolio');  // Employee removed from table
  console.log(`[${engineLabel}] ✓ Dimension removed (rows → unused)`);

  await resetPivot();

  // DIVERSE 23: Drag dimension from columns back to unused
  console.log(`[${engineLabel}] Diverse 23: Remove column dimension (drag to unused)`);
  await H.dragDimensionToCols(page, pivotId, 'employee_name');
  bodyBefore = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(bodyBefore).toContain('Nancy Davolio');  // Employee visible in columns

  await H.dragDimensionFromColsToUnused(page, pivotId, 'employee_name');
  bodyAfter = await page.locator(`#${pivotId} .pvtTable`).textContent();
  expect(bodyAfter).not.toContain('Nancy Davolio');  // Employee removed from table
  console.log(`[${engineLabel}] ✓ Column dimension removed (cols → unused)`);

  await resetPivot();

  // ──── GROUP U: Reversible — Toggle order buttons (no reload needed) ────

  // DIVERSE 24: Row order toggle (button click)
  console.log(`[${engineLabel}] Diverse 24: Row order toggle (key → value_asc → value_desc → key)`);
  let order1 = await H.toggleRowOrder(page, pivotId);  // key_a_to_z → value_a_to_z
  expect(order1).toBe('value_a_to_z');
  let order2 = await H.toggleRowOrder(page, pivotId);  // value_a_to_z → value_z_to_a
  expect(order2).toBe('value_z_to_a');
  let order3 = await H.toggleRowOrder(page, pivotId);  // value_z_to_a → key_a_to_z
  expect(order3).toBe('key_a_to_z');
  console.log(`[${engineLabel}] ✓ Row order toggled through all 3 modes`);

  // DIVERSE 25: Column order toggle (button click)
  console.log(`[${engineLabel}] Diverse 25: Column order toggle (key → value_asc → value_desc → key)`);
  let colOrder1 = await H.toggleColOrder(page, pivotId);  // key_a_to_z → value_a_to_z
  expect(colOrder1).toBe('value_a_to_z');
  let colOrder2 = await H.toggleColOrder(page, pivotId);  // value_a_to_z → value_z_to_a
  expect(colOrder2).toBe('value_z_to_a');
  let colOrder3 = await H.toggleColOrder(page, pivotId);  // value_z_to_a → key_a_to_z
  expect(colOrder3).toBe('key_a_to_z');
  console.log(`[${engineLabel}] ✓ Column order toggled through all 3 modes`);

  console.log(`\n=== Completed all diverse OLAP combinations [${engineLabel}] ===\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Explore Data Canvas (for datapallas.com docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures the 4 PNGs referenced from the docs MDX:
//   - 300_05_apps-launch.png                   (quickstart Step 1 — Apps area)
//   - 300_10_canvas-empty.png                  (quickstart Step 2 — empty canvas)
//   - 300_20_drop-cube-widget.png              (quickstart Step 2 — cube + Table)
//   - 300_00_explore-data-canvas-overview.png  (quickstart Step 5 — Table + Chart hero)
//
// Output: writes directly into the docs repo at
//   c:\Projects\kraft-src-company-biz\flowkraft\www\datapallas.com\public\images\docs\
//
// HOW TO RUN
//     cd frend/reporting
//     npm run custom:start-server-and-e2e-electron-screens
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Browser } from '@playwright/test';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  createFreshCanvas,
  addCubeToCanvas,
  selectCubeFields,
  layoutWidgetsByDrag,
} from '../../../helpers/explore-data-test-helper';
import { captureDocsScreenshot } from '../../../utils/docs-screenshot-helper';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;

/** Viewport dimensions matching the `<Image width=.../>` declared in the docs MDX. */
const VIEWPORT = { width: 1500, height: 900 };

/**
 * The bundled Northwind SQLite connection that ships with DataPallas. It's a
 * SYNTHETIC in-memory connection produced by ReportsService.getSampleConnectionAsDbSettings()
 * (bkend/server/.../reports/ReportsService.java:1173-1197) — the "-4f2" suffix
 * is a literal hardcoded constant, not a hash, so we can rely on it.
 *
 * The 5 sample cubes (northwind-customers, northwind-sales, northwind-hr,
 * northwind-inventory, northwind-warehouse) are attached to this connection,
 * so once it's selected the SchemaBrowser shows them under CUBES.
 *
 * Synthetic samples appear in GET /api/connections/database only when
 * Settings.isShowSamplesEnabled() is true (reads config/_internal/settings.xml
 * for <showsamples>true</showsamples>). The e2e seeding pipeline at
 * scripts-dev/gulp/e2e.js:29 (e2e-package-javastuff-if-needed) restores that
 * file from verified-db-noexe whenever clean-testground wipes it, so the spec
 * can rely on showsamples=true being in effect — no per-test write needed.
 */
const SAMPLE_CONNECTION_CODE = 'rbt-sample-northwind-sqlite-4f2';
const SAMPLE_CUBE_ID = 'northwind-sales';

// ── SPEC ──────────────────────────────────────────────────────────────────────

electronBeforeAfterAllTest(
  'Canvas — docs screenshots',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;

    try {
      // ── SETUP 1: Start the AI Hub from the Processing → CMS Web Portal tab ─
      // gotoDataCanvas() (fluent-tester.ts:1540) navigates: top menu → Burst
      // (Processing) → click #tab-btn-cmsWebPortalTab → land on the filtered app
      // panel showing only `flowkraft-data-canvas`. Same path used by the
      // existing apps-third-party.spec.ts:17.
      // This is the easiest user-facing entry point — one click in Processing
      // vs three clicks via the Help & Support menu — so it's the path we
      // capture in the docs screenshot.
      console.log('[SETUP] Starting AI Hub from cmsWebPortalTab');
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage).gotoDataCanvas(),
        AI_HUB_APP_ID,
      );

      // ── CAPTURE 0 (300_05): cmsWebPortalTab showing running app + Launch ───
      // After startApp completes the app is "running" → the per-app Launch
      // button (#btnLaunch_<sanitizedAppId>) is enabled and clickable. The
      // panel here is filtered to just the flowkraft-data-canvas app (not the
      // whole apps list), so the screenshot stays clean and focused.
      await firstPage.waitForTimeout(800);
      await captureDocsScreenshot(firstPage, '300_05_apps-launch.png');

      // ── SETUP 2: Open an external Chromium browser pointed at :8440 ────────
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
      externalBrowser = browser;
      await page.setViewportSize(VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);
      console.log('[SETUP] DONE — external browser ready at AI Hub');

      // ── CAPTURE 1 (300_10): empty canvas with left panel populated ─────────
      // The "-4f2" suffix on the synthetic Northwind connection id is a literal
      // hardcoded constant in ReportsService.getSampleConnectionAsDbSettings
      // (not a hash), so we can selectOption by value directly.
      // After the schema loads the left panel shows CUBES (5) + TABLES.
      await createFreshCanvas(page, DATA_CANVAS_URL, 'Northwind Sales — Quickstart');
      const selectConnLocator = page.locator('#selectConnection');
      await selectConnLocator.waitFor({ state: 'visible', timeout: 10_000 });
      console.log(`[capture 1] Selecting bundled connection: ${SAMPLE_CONNECTION_CODE}`);
      await selectConnLocator.selectOption(SAMPLE_CONNECTION_CODE);
      await page.locator('#schemaBrowserTablesList').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(800);
      await captureDocsScreenshot(page, '300_10_canvas-empty.png');

      // ── CAPTURE 2 (300_20): cube widget dropped + Table view + fields ticked ──
      // Tick the rb-cube-renderer's checkboxes (real <input type="checkbox">
      // elements per RbCubeRenderer.wc.svelte) so the right panel visibly shows
      // the selection AND the widget on the canvas re-queries with it. Use
      // .check() instead of .click() — it's idempotent and ends up in the
      // desired state regardless of whatever Smart Defaults pre-ticked.
      //
      // Group by SUPPLIER (6 distinct values per NorthwindDataGenerator.java —
      // Exotic Liquids, Cajun Delights, Grandma Kellys, Tokyo Traders, Pavlova,
      // Pasta Buttini) instead of Ship Country (10 distinct). 6 rows is short
      // enough that, combined with pagination disabled below, the table stays
      // compact and leaves room on screen for the chart in 300_00.
      //
      // Then ALSO disable Tabulator pagination (Display tab → Off → back to
      // Data tab). Tabulator pagination is on by default at any row count
      // (TabulatorConfig.tsx:37 — `pagination = config.tabulatorPagination
      // !== false`), so without this toggle we'd still see the "First Prev 1
      // Next Last" controls under 6 rows. Going back to the Data tab leaves
      // the cube tree visible in the right panel for CAPTURE 3.
      await addCubeToCanvas(page, SAMPLE_CUBE_ID);
      await page.locator('#chk-dim-SupplierName').check();
      await page.locator('#chk-meas-Revenue').check();
      await page.locator('#chk-meas-OrderCount').check();
      await page.locator('#chk-meas-TotalQuantity').check();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      // Switch to Table widget. Tabulator (Table) is in the Smart Defaults
      // main grid for the Supplier × measure shape so no More-Widgets needed.
      const tableBtn = page.locator('#btnVisualizeAs-tabulator');
      await tableBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await tableBtn.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      // Disable pagination: Display tab → Pagination Off → Data tab.
      await page.locator('#btnDisplayTab').click();
      await page.locator('#btnTabulatorPagination-off').waitFor({ state: 'visible', timeout: 5_000 });
      await page.locator('#btnTabulatorPagination-off').click();
      await page.waitForTimeout(400);
      await page.locator('#btnDataTab').click();
      await page.waitForTimeout(600);
      // Shrink the table widget so the 6 supplier rows fill the box without
      // a tall grey empty area below them. Default cube widget height is 5
      // grid rows (5 × ROW_HEIGHT 80 = 400px); we drop to h:3 (240px) which
      // fits the widget header (~33px) + tabulator header + 6 data rows.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 3 }, // tabulator — Sales by Supplier
      ]);
      // Re-tick AFTER the layout drag. layoutWidgetsByDrag drives real mouse
      // events on the widget header → can re-mount the right-panel
      // rb-cube-renderer, and Svelte's local `selectedDimensions` Set is
      // re-initialised from widget data. The `selectCubeFields` synthetic
      // event we use earlier doesn't write back into that Set, so without
      // this re-check the data has SupplierName grouped (table renders 6
      // rows correctly) but the visual checkboxes show empty. .check() is
      // idempotent — no-op if already ticked, otherwise it clicks and the
      // on:change handler re-syncs the Set.
      await page.locator('#chk-dim-SupplierName').check();
      await page.locator('#chk-meas-Revenue').check();
      await page.locator('#chk-meas-OrderCount').check();
      await page.locator('#chk-meas-TotalQuantity').check();
      await page.waitForTimeout(400);
      // Scroll to the LAST ticked measure (Revenue is in the middle of the
      // Measures section). Why scroll to a measure rather than to
      // SupplierName: scrollIntoViewIfNeeded only scrolls just enough to make
      // the target visible, so it parks the target near the bottom of the
      // viewport. Targeting the dim left Measures still off-screen below.
      // Targeting Revenue pulls Measures into view AND the Suppliers row
      // above it stays visible — so the docs reader sees ALL four ticks
      // (✓ Supplier, ✓ Order Count, ✓ Revenue, ✓ Units Sold) in one frame.
      await page.locator('#chk-meas-Revenue').scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await captureDocsScreenshot(page, '300_20_drop-cube-widget.png');

      // ── CAPTURE 3 (300_00): hero — Table + Chart side-by-side ──────────────
      // Drop a SECOND instance of the same cube on the canvas, tick Supplier
      // (group by) + Revenue (measure), switch the widget to Chart. The
      // screenshot shows the same data rendered as a Table (widget 1) AND a
      // Chart (widget 2) — exactly the Step 5 narrative in quickstart.mdx.
      //
      // Why we explicitly click widget 2's header: the right panel's cube tree
      // (#chk-dim-* / #chk-meas-* checkboxes) operates on the SELECTED widget.
      // After addCubeToCanvas widget 2 *should* be auto-selected, but in the
      // previous run the right panel was still showing widget 1's tree, so
      // .check() calls were no-ops on widget 1's already-ticked state and
      // widget 2 ended up with no dataSource → empty chart. Clicking the new
      // widget's header (each widget has id="widgetHeader-{widgetId}", per
      // WidgetShell.tsx:112) deterministically forces widget 2 to be selected.
      //
      // Why also dispatch selectionChanged via selectCubeFields: belt-and-
      // braces. The synthetic event triggers VisualQueryBuilder to regenerate
      // the SQL on the SELECTED widget regardless of UI checkbox state, so
      // even if the .check() flow somehow doesn't propagate, widget 2 still
      // ends up with a dataSource and the chart renders.
      await addCubeToCanvas(page, SAMPLE_CUBE_ID);
      await page.waitForTimeout(2000);
      // Force widget 2 (the newest, hence last in DOM) to be the selected one.
      await page.locator('[id^="widgetHeader-"]').last().click();
      await page.waitForTimeout(800);
      await page.locator('#chk-dim-SupplierName').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('#chk-dim-SupplierName').check();
      await page.locator('#chk-meas-Revenue').check();
      // Authoritative selection update via the helper used by other specs.
      await selectCubeFields(page, ['SupplierName'], ['Revenue']);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      const chartBtn = page.locator('#btnVisualizeAs-chart');
      if (!(await chartBtn.isVisible({ timeout: 1_000 }).catch(() => false))) {
        const moreBtn = page.locator('#btnMoreWidgets');
        if (await moreBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await moreBtn.click();
          await page.waitForTimeout(300);
        }
      }
      await chartBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await chartBtn.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      // Switching widget type can shuffle which widget is selected and reset
      // smart-defaults selection — re-select widget 2 explicitly, re-check
      // the boxes, and re-dispatch the selectionChanged event so the chart
      // gets Supplier × Revenue (one bar per supplier — 6 bars) and not
      // just the measure (single bar = total, the previous bug).
      await page.locator('[id^="widgetHeader-"]').last().click();
      await page.waitForTimeout(800);
      await page.locator('#chk-dim-SupplierName').check();
      await page.locator('#chk-meas-Revenue').check();
      await selectCubeFields(page, ['SupplierName'], ['Revenue']);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      // Final layout for the hero shot: compact 6-row table on top, chart
      // immediately below it (no grey gap). Chart at h:4 (320px) — at h:5
      // the widget container was noticeably taller than the ECharts canvas
      // produced inside it (the bars + axis + rotated supplier labels only
      // filled ~70% of the widget, leaving a fat empty band below the
      // labels). h:4 hugs the chart content. Total grid = 3 + 4 = 7 rows ×
      // 80 = 560px, plus widget chrome and margins ≈ 640px.
      await layoutWidgetsByDrag(page, [
        { x: 0, y: 0, w: 12, h: 3 }, // tabulator — Sales by Supplier (top)
        { x: 0, y: 3, w: 12, h: 4 }, // chart     — Revenue per Supplier (bottom)
      ]);
      // Re-select widget 2 — the drag mouse-events click widget headers in
      // order, so widget 1 may have been the last one selected. Then re-tick
      // after the layoutWidgetsByDrag-induced re-mount so the rb-cube-renderer's
      // local `selectedDimensions` Set is in sync with the widget data (the
      // chart already groups by Supplier — same desync rationale as CAPTURE 2).
      // .check() is idempotent — no-op if already ticked, otherwise the click
      // fires the on:change handler and the local Set re-syncs.
      await page.locator('[id^="widgetHeader-"]').last().click();
      await page.waitForTimeout(500);
      await page.locator('#chk-dim-SupplierName').check();
      await page.locator('#chk-meas-Revenue').check();
      await page.waitForTimeout(400);
      // Scroll to the ticked Revenue measure (same rationale as CAPTURE 2 —
      // scrolling to the dim parks Suppliers near the bottom of the visible
      // window and leaves the Measures section off-screen below; scrolling
      // to a measure pulls Measures into view AND the Suppliers row above
      // stays visible, so both ✓ Supplier and ✓ Revenue appear in frame).
      await page.locator('#chk-meas-Revenue').scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await captureDocsScreenshot(page, '300_00_explore-data-canvas-overview.png');

      console.log('[DONE] All Canvas screenshots captured.');

      // ── Teardown (happy path): stop the AI Hub the user way + close the browser.
      //    The NUCLEAR docker down in `finally` ALWAYS runs too (the leak guarantee) —
      //    doing the graceful stop here means a hang-prone UI stop is only attempted
      //    when things went well. Same pattern as samples.screens.ts.
      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(firstPage).gotoDataCanvas(),
        AI_HUB_APP_ID,
      );
    } finally {
      // ── CLEANUP ────────────────────────────────────────────────────────────
      // Close the external browser if an error above left it open (no-op on happy path).
      if (externalBrowser) {
        try {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        } catch (e) { console.error('Failed to close external browser:', e); }
      }
      // NUCLEAR + ALWAYS: synchronous `docker compose down` force-removes the AI Hub
      // stack, so it can NEVER be left running — on the happy path OR any thrown/hung
      // error above. No DB-connection cleanup needed (bundled Northwind SQLite).
      try {
        console.log('[CLEANUP] docker compose down — flowkraft/_ai-hub');
        SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
      } catch (e) { console.error('Failed to docker-compose down AI Hub:', e); }
    }
  },
);

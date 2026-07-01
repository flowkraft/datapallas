// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — docs/samples.mdx  (DataPallas "Samples — Try All")
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures every screenshot referenced from content/docs/samples.mdx. The Samples
// gallery shots are pure DataPallas Electron UI (no backend, no Docker); the
// dashboard / pivot-table / BI-app / document-portal shots drive a sample end to
// end and capture the live result in an external (Edge) browser — exactly the way
// the matching feature specs do (e2e/specs/features/samples.spec.ts +
// apps-grails-nextjs*.spec.ts + apps-cms-wordpress.spec.ts).
//
// Each docs target is its own `electronBeforeAfterAllTest` block so new ones can be
// added (or a flaky heavy one skipped) without disturbing the others. Every title
// starts with "Samples — " so a single grep runs the whole file, or one block:
//     E2E_GREP="Samples —"                       (all blocks)
//     E2E_GREP="Samples — gallery"               (just the cheap gallery block)
//     E2E_GREP="Samples — Sales Dashboard"       (just sample #18)
//
// ── WHAT THIS FILE CAPTURES ─────────────────────────────────────────────────────
//
//   BLOCK 1 — Samples gallery (Electron only; cheap, robust)
//     003_00_samples.png                The Samples table (overview of all samples)
//     003_00_samples-learn-more.png     The "Learn More" modal (View Configuration ringed)
//     003_00_samples-try-it.png         The "Try It" confirmation dialog
//
//   BLOCK 2 — Sales Dashboard, sample #18 (external browser; needs the RB backend)
//     bi-analytics/093-rb-dash-northwind-try-it.png       The sample's table row (cropped)
//     bi-analytics/095-rb-dash-northwind-final-browser.png The live dashboard, Country=Germany
//
//   BLOCK 3 — Sales PivotTable, sample #19 (external browser; needs the RB backend)
//     bi-analytics/036-rb-pivottable-duckdb-try-it.png    The sample's table row (cropped)
//     bi-analytics/037-rb-pivottable-duckdb.png           The live DuckDB pivot table
//
//   BLOCK 4 — BI Analytics App (Docker: flowkraft-grails playground)
//     bi-analytics/015-bi-analytics-app-started.png       The app card, running (cropped)
//     100_10_web-components-dashboard-example.png         The CFO dashboard (rb-* web components)
//
//   BLOCK 5 — Document Portal (Docker: cms-webportal / WordPress)
//     webportal/010-quickstart-tab-webportal-2.png        The WebPortal app card (cropped)
//     webportal/045-quickstart-portal-my-documents-paystubs.png  Employee "My Documents" page
//
// NOTE — shared assets. BLOCKS 4 & 5 (and the dashboard/pivot browser frames in
// BLOCKS 2 & 3) regenerate images that ALSO appear in the bi-analytics and
// document-portal docs. They live here because samples.mdx references them and the
// flows ARE the sample #18/#19 + "BI solution" + "self-service portal" stories. If
// a dedicated bi-analytics.screens.ts / document-portal.screens.ts is ever added,
// these blocks could move there and samples.mdx would simply reuse the PNGs (same
// "CONSIDER CONSOLIDATING" note as learn.screens.ts).
//
// Output dir: DOCS_IMAGES_DIR (…/reportburster.com/public/images/docs/), with the
// bi-analytics/ and webportal/ sub-folders for the prefixed shots. Every shot is
// written next to its original as `<name>-dp.png` (e.g. 003_00_samples.png →
// 003_00_samples-dp.png) so samples.mdx can show the old/new pair side by side;
// drop the `-dp` suffix once approved — same convention as quickstart.screens.ts.
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # set E2E_SPEC="samples.screens.ts" and E2E_GREP as above in
//   # custom:start-server-and-e2e-electron-screens-grep
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, Browser } from '@playwright/test';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import { assertDashboardRendersCorrectly } from '../../../helpers/dashboard-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotOfElement,
  captureDocsScreenshotWithHighlights,
  waitForRbChartsRendered,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── OUTPUT SUB-DIRS ───────────────────────────────────────────────────────────
// The prefixed shots live under bi-analytics/ and webportal/ in the docs repo.
const BI_DIR = path.join(DOCS_IMAGES_DIR, 'bi-analytics');
const WEBPORTAL_DIR = path.join(DOCS_IMAGES_DIR, 'webportal');

// ── SAMPLE IDS (must match samplesService ids — see samples.spec.ts) ────────────
// The gallery's Learn More / Try It shots feature sample #14 (Customer Invoices) to
// match the original committed 003_00_samples* screenshots — which SELECT this row
// and open its modals. Change FEATURED_SAMPLE / _NAME to feature a different one.
const FEATURED_SAMPLE = 'GENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML'; // #14
const FEATURED_SAMPLE_NAME = 'Customer Invoices';
const SAMPLE_DASHBOARD = 'NORTHWIND-SALES-DASHBOARD';   // #18 Sales Dashboard
const SAMPLE_PIVOTTABLE = 'NORTHWIND-SALES-PIVOTTABLE'; // #19 Sales PivotTable

// ── LIVE DASHBOARD URLS (served by the RB backend on 9090 — see samples.spec.ts) ─
const DASHBOARD_URL = 'http://localhost:9090/dashboard/g-dashboard';
const PIVOTTABLE_URL = 'http://localhost:9090/dashboard/g-pivottable';

// ── BI ANALYTICS APP ────────────────────────────────────────────────────────────
// The original 015/100_10 shots are the "DataPallas Grails App" (the default-stack
// frontend — formerly "Frontend App (Dashboards & Portals)"): its card lives on the
// Customer Portal tab, and it serves the CFO dashboard at GRAILS_BASE_URL/dashboards
// (the exact web-components dashboard 100_10 shows). Switch to APP_ID_NEXT /
// NEXT_BASE_URL for the alternative-stack Next.js playground (same /dashboards page).
const BI_APP_ID = SelfServicePortalsTestHelper.APP_ID_GRAILS;
const BI_APP_BASE_URL = SelfServicePortalsTestHelper.GRAILS_BASE_URL;
const BI_APP_DASHBOARDS_URL = `${BI_APP_BASE_URL}/dashboards`;

// ── DOCUMENT PORTAL (WordPress cms-webportal) ───────────────────────────────────
const WP_APP_ID = SelfServicePortalsTestHelper.APP_ID_WORDPRESS;

// Standard external-browser viewport for the live web-app captures — big enough
// that the dashboards / pivot table / portal fill the frame the docs expect.
const EXT_VIEWPORT = { width: 1600, height: 1000 };

// Every shot is saved next to its original as `<name>-dp.png` so the docs can show
// the old/new pair side by side; drop the `-dp` once approved (quickstart.screens.ts
// convention). Sub-folder shots get the suffix on the base name — the folder comes
// from each capture's outDir (BI_DIR / WEBPORTAL_DIR).
const dp = (base: string) => `${base}-dp.png`;

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — Samples gallery: table, Learn More modal, Try It confirmation
// ─────────────────────────────────────────────────────────────────────────────
// Pure Electron UI — no backend, no Docker. We reach the Samples page the
// screenshot-mode-safe way: the "Samples" button on the Burst Reports toolbar
// (#btnBurstSamples), NOT the left-menu item (#leftMenuSamples is zero-size while
// the Processing sidebar stays collapsed in screenshot mode). Both route to the
// same /processing/samplesMenuSelected page — quickstart.screens.ts does the same.
electronBeforeAfterAllTest(
  'Samples — gallery, Learn More & Try It (samples.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);

    // ── Open the Samples page, bring the featured sample's row into view, and
    //    SELECT it (click the row → bg-primary/10 highlight) — matching the original
    //    003_00_samples.png, which shows sample #14 selected.
    await ft
      .gotoBurstScreen()
      .waitOnElementToBecomeVisible('#btnBurstSamples')
      .click('#btnBurstSamples')
      .waitOnElementToBecomeVisible('#samplesTable')
      .scrollIntoViewIfNeeded(`#tr${FEATURED_SAMPLE}`)
      .waitOnElementToContainText(`#td${FEATURED_SAMPLE}`, FEATURED_SAMPLE_NAME)
      .click(`#tr${FEATURED_SAMPLE}`);
    await hideToastsForScreenshots(firstPage);

    // Scroll the selected row to just below the sticky column header (the
    // #samplesTable thead is `position: sticky` — styles.scss) so the row leads the
    // shot with the header still pinned above it, matching the original framing.
    await firstPage.evaluate((sel) => {
      const row = document.querySelector(sel) as HTMLElement | null;
      const table = document.getElementById('samplesTable');
      const scroller = table?.parentElement as HTMLElement | null;
      const thead = table?.querySelector('thead') as HTMLElement | null;
      if (!row || !scroller) return;
      const headH = thead ? thead.getBoundingClientRect().height : 40;
      scroller.scrollTop +=
        row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - headH - 6;
    }, `#tr${FEATURED_SAMPLE}`);
    await firstPage.waitForTimeout(400);

    // ── 003_00_samples — the gallery overview with sample #14 selected (Name /
    //    What It Does / Input / Expected Output / Actions columns, Learn More +
    //    Try It buttons per row).
    await captureDocsScreenshot(firstPage, dp('003_00_samples'));
    console.log(`[capture] ${dp('003_00_samples')}`);

    // ── Open the Learn More modal for the featured sample ───────────────────────
    await ft
      .click(`#btnSamplesLearnMode${FEATURED_SAMPLE}`)
      .waitOnElementToBecomeVisible('dp-dialog')
      .waitOnElementToBecomeVisible('#modalInputDetails')
      .waitOnElementToBecomeVisible('#modalOutputDetails')
      .waitOnElementToBecomeVisible(`#div${FEATURED_SAMPLE}`)
      .waitOnElementToBecomeVisible(`#btnViewConfigurationFile${FEATURED_SAMPLE}`);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400); // let the modal finish painting

    // ── 003_00_samples-learn-more — ring the SAME block the original boxes: the
    //    Notes section AND the View Configuration button below it.
    await captureDocsScreenshotWithHighlights(firstPage, dp('003_00_samples-learn-more'), [
      `#div${FEATURED_SAMPLE}`,                       // Notes section
      `#btnViewConfigurationFile${FEATURED_SAMPLE}`,  // View Configuration button
    ]);
    console.log(`[capture] ${dp('003_00_samples-learn-more')}`);

    // ── Close the modal ─────────────────────────────────────────────────────────
    await ft
      .click('#btnCloseSamplesLearnMoreModal')
      .waitOnElementToBecomeInvisible('#btnCloseSamplesLearnMoreModal');

    // ── Click "Try It" → the confirmation dialog ("OK and I'll click Burst…" /
    //    "No, I'll do it later"). Capture it, then dismiss with No so nothing runs.
    await ft
      .click(`#btnSampleTryIt${FEATURED_SAMPLE}`)
      .waitOnConfirmDialogToBecomeVisible();
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshot(firstPage, dp('003_00_samples-try-it'));
    console.log(`[capture] ${dp('003_00_samples-try-it')}`);

    await ft.clickNoDontDoThis().waitOnConfirmDialogToBecomeInvisible();
    console.log('[DONE] Samples gallery screenshots captured.');
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — Sales Dashboard (sample #18): row crop + live dashboard (Germany)
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors samples.spec.ts "(18_northwind_sales_dashboard)". The dashboard is served
// by the RB backend on :9090 (no Docker). Try It provisions g-dashboard and opens
// the system browser; we ALSO open our own Edge browser at the same URL to capture.
electronBeforeAfterAllTest(
  'Samples — Sales Dashboard sample #18 (samples.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);
    let externalBrowser: Browser | null = null;

    try {
      // ── Navigate to Samples and bring the Dashboard sample row into view ──────
      await ft
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#btnBurstSamples')
        .click('#btnBurstSamples')
        .waitOnElementToBecomeVisible('#samplesTable')
        .scrollIntoViewIfNeeded(`#tr${SAMPLE_DASHBOARD}`)
        .waitOnElementToContainText(`#td${SAMPLE_DASHBOARD}`, 'Sales Dashboard');
      await hideToastsForScreenshots(firstPage);

      // ── 093 — the sample's table row, cropped (shows badge, input, output, Try It).
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('093-rb-dash-northwind-try-it'),
        `#tr${SAMPLE_DASHBOARD}`,
        { outDir: BI_DIR },
      );
      console.log(`[capture] bi-analytics/${dp('093-rb-dash-northwind-try-it')}`);

      // ── Try It → provisions + opens the dashboard (no burst/confirm flow for
      //    dashboards; matches samples.spec.ts test 18).
      await ft
        .click(`#tr${SAMPLE_DASHBOARD}`)
        .click(`#btnSampleTryIt${SAMPLE_DASHBOARD}`);

      // ── Open our own browser at the live dashboard URL ────────────────────────
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: EXT_VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page = ext.page;

      await SelfServicePortalsTestHelper.waitForServerReady(page, DASHBOARD_URL, 30, 2000);
      await page.goto(DASHBOARD_URL, { timeout: 30000, waitUntil: 'networkidle' });
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });

      // ── Exercise the Country filter → Germany (the frame the doc shows) ───────
      await page.selectOption('#country', 'Germany');
      await page.click('#btnReloadDashboard');
      await expect(page.locator('#btnConfirmReload')).toBeVisible({ timeout: 5000 });
      await page.click('#btnConfirmReload');
      await page.waitForTimeout(3000);

      // ASSERT the "meat": Germany-filtered data rendered across all components,
      // then make sure the Chart.js canvases have actually painted before capture.
      await assertDashboardRendersCorrectly(page, 'g-dashboard', 'Germany');
      await waitForRbChartsRendered(page);

      // ── 095 — the live Northwind Sales Dashboard, Country=Germany.
      await captureDocsScreenshot(page, dp('095-rb-dash-northwind-final-browser'), BI_DIR);
      console.log(`[capture] bi-analytics/${dp('095-rb-dash-northwind-final-browser')}`);
    } finally {
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] Failed to close external browser:', e),
        );
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — Sales PivotTable (sample #19): row crop + live DuckDB pivot table
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors samples.spec.ts "(19_northwind_sales_pivottable)". Served by the RB
// backend on :9090 (no Docker). The saved g-pivottable already carries its layout
// (customer_country × year_quarter, Sum net_revenue), so we just open and capture.
electronBeforeAfterAllTest(
  'Samples — Sales PivotTable sample #19 (samples.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);
    let externalBrowser: Browser | null = null;

    try {
      await ft
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#btnBurstSamples')
        .click('#btnBurstSamples')
        .waitOnElementToBecomeVisible('#samplesTable')
        .scrollIntoViewIfNeeded(`#tr${SAMPLE_PIVOTTABLE}`)
        .waitOnElementToContainText(`#td${SAMPLE_PIVOTTABLE}`, 'Sales PivotTable');
      await hideToastsForScreenshots(firstPage);

      // ── 036 — the sample's table row, cropped.
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('036-rb-pivottable-duckdb-try-it'),
        `#tr${SAMPLE_PIVOTTABLE}`,
        { outDir: BI_DIR },
      );
      console.log(`[capture] bi-analytics/${dp('036-rb-pivottable-duckdb-try-it')}`);

      // ── Try It → provisions + opens the pivot table.
      await ft
        .click(`#tr${SAMPLE_PIVOTTABLE}`)
        .click(`#btnSampleTryIt${SAMPLE_PIVOTTABLE}`);

      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: EXT_VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page = ext.page;

      await SelfServicePortalsTestHelper.waitForServerReady(page, PIVOTTABLE_URL, 30, 2000);
      await page.goto(PIVOTTABLE_URL, { timeout: 30000, waitUntil: 'networkidle' });

      // ASSERT the "meat": the pivot host + the DuckDB pivot table actually rendered.
      await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Northwind Sales PivotTable')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 15000 });
      await page.waitForTimeout(2500); // let the grid finish aggregating server-side

      // ── 037 — the live DuckDB pivot table.
      await captureDocsScreenshot(page, dp('037-rb-pivottable-duckdb'), BI_DIR);
      console.log(`[capture] bi-analytics/${dp('037-rb-pivottable-duckdb')}`);
    } finally {
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] Failed to close external browser:', e),
        );
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — BI Analytics App: app card running + the web-components dashboard
// ─────────────────────────────────────────────────────────────────────────────
// REALLY starts the flowkraft-grails playground (needs Docker). Mirrors
// apps-grails-nextjs-dashboards.spec.ts: start the app from its Customer Portal tab
// card (the original 015 shot's source tab), then open an external browser at
// GRAILS_BASE_URL/dashboards (the CFO dashboard — KPI cards, rb-chart panels, an
// rb-tabulator). Graceful stop on the happy path + nuclear down in finally.
electronBeforeAfterAllTest(
  'Samples — BI Analytics App dashboards (samples.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let externalBrowser: Browser | null = null;

    try {
      // ── Navigate to the Customer Portal tab (where the Grails app card lives) and
      //    start it the user way — matching the original 015 shot's source tab.
      //    startApp asserts Docker is up + boots the container, waiting for "running".
      await new FluentTester(firstPage)
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#tab-btn-customerPortalTab')
        .click('#tab-btn-customerPortalTab')
        .waitOnElementToBecomeVisible(`#appName_${BI_APP_ID}`);
      await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage), BI_APP_ID);
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${BI_APP_ID}`);
      await hideToastsForScreenshots(firstPage);

      // ── 015 — the app card, running & ready to launch (cropped to just the card).
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('015-bi-analytics-app-started'),
        `#appPanel_${BI_APP_ID}`,
        { outDir: BI_DIR },
      );
      console.log(`[capture] bi-analytics/${dp('015-bi-analytics-app-started')}`);

      // ── Open the live dashboards page in an external browser ──────────────────
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: EXT_VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page = ext.page;

      await SelfServicePortalsTestHelper.waitForServerReady(page, BI_APP_BASE_URL);
      await page.goto(BI_APP_DASHBOARDS_URL, { timeout: 30000, waitUntil: 'networkidle' });

      // ASSERT the "meat": the dashboard selector + a KPI card are present, then
      // wait for the Chart.js canvases to paint before capture.
      await expect(page.locator('#dashboard-select')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#kpi-revenue')).toBeVisible({ timeout: 15000 });
      await waitForRbChartsRendered(page);
      await page.waitForTimeout(800);

      // ── 100_10 — the web-components dashboard (charts, table, pivot). Root docs dir.
      await captureDocsScreenshot(page, dp('100_10_web-components-dashboard-example'));
      console.log(`[capture] ${dp('100_10_web-components-dashboard-example')}`);

      // ── Teardown (happy path): close the browser, then stop the app the user way.
      //    The nuclear `docker compose down -v` in finally ALWAYS runs too — the same
      //    belt-and-suspenders teardown connections.spec.ts / quickstart.screens.ts use.
      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(firstPage).gotoApps(),
        BI_APP_ID,
      );
    } finally {
      // Close the external browser if an error above left it open.
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] Failed to close external browser:', e),
        );
      }
      // NUCLEAR STOP — ALWAYS runs (happy path OR any exception above, incl. a dead
      // Electron renderer): a synchronous `docker compose down -v` in
      // _apps/flowkraft/grails-playground force-removes the flowkraft-grails container
      // + volumes, so the BI app can NEVER be left running after this spec. Keeps the
      // image so re-runs don't rebuild.
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage('flowkraft/grails-playground');
      } catch (e) {
        console.error('[CLEANUP] Nuclear flowkraft-grails docker compose down failed:', e);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — Document Portal: WebPortal app card + the employee "My Documents" page
// ─────────────────────────────────────────────────────────────────────────────
// REALLY starts the cms-webportal (WordPress) playground (needs Docker). Mirrors
// apps-cms-wordpress.spec.ts: reach the CMS Web Portal tab, start the app, then open
// an external browser and log in as an EMPLOYEE (clyde.grew) to show the self-service
// "My Documents" paystubs page — the doc's "users log in to view their private
// documents" story. (Log in as the admin u2changeme + assertWpMyDocumentsAsAdmin for
// the all-documents unfiltered view instead.) Graceful stopApp in finally.
electronBeforeAfterAllTest(
  'Samples — Document Portal / WordPress (samples.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let externalBrowser: Browser | null = null;

    try {
      // ── Reach the CMS Web Portal tab and start WordPress (boots the container;
      //    waits for "running"). We capture the card AFTER it's running so the shot
      //    shows the Stop button + the "Try the demo logins" panel — exactly the
      //    running-state card the docs image shows.
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage).gotoCmsWebPortal(),
        WP_APP_ID,
      );
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#appPanel_${WP_APP_ID}`);
      await hideToastsForScreenshots(firstPage);

      // ── 010 — the WebPortal / Customer Portal app card, running (cropped).
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('010-quickstart-tab-webportal-2'),
        `#appPanel_${WP_APP_ID}`,
        { outDir: WEBPORTAL_DIR },
      );
      console.log(`[capture] webportal/${dp('010-quickstart-tab-webportal-2')}`);

      // ── Open an external browser, wait for WordPress to answer, log in as the
      //    employee, and land on My Documents.
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: EXT_VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page = ext.page;

      await SelfServicePortalsTestHelper.waitForServerReady(
        page,
        SelfServicePortalsTestHelper.WP_LOGIN_URL,
        30,
        2000,
      );
      await SelfServicePortalsTestHelper.wpLoginFrontend(
        page,
        SelfServicePortalsTestHelper.WP_ADMIN_USER,
        SelfServicePortalsTestHelper.WP_ADMIN_PASSWORD,
      );

      // ASSERT the "meat": the admin sees ALL employees' paystubs (unfiltered) — the
      // 3-paystub "My Documents" view the original 045 screenshot shows. (For the
      // single-employee filtered view instead, log in as 'clyde.grew' / 'demo1234'
      // and use assertWpMyDocumentsAsEmployee(page, 'Clyde Grew', [...]).)
      await SelfServicePortalsTestHelper.assertWpMyDocumentsAsAdmin(page);
      await page.waitForTimeout(800);

      // ── 045 — the employee's "My Documents" paystubs page.
      await captureDocsScreenshot(
        page,
        dp('045-quickstart-portal-my-documents-paystubs'),
        WEBPORTAL_DIR,
      );
      console.log(`[capture] webportal/${dp('045-quickstart-portal-my-documents-paystubs')}`);

      // ── Teardown (happy path): close the browser, then stop the app the user way.
      //    The nuclear `docker compose down -v` in finally ALWAYS runs too.
      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(
        new FluentTester(firstPage).gotoCmsWebPortal(),
        WP_APP_ID,
      );
    } finally {
      // Close the external browser if an error above left it open.
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch((e) =>
          console.error('[CLEANUP] Failed to close external browser:', e),
        );
      }
      // NUCLEAR STOP — ALWAYS runs (happy path OR any exception above): a synchronous
      // `docker compose down -v` in _apps/cms-webportal-playground force-removes the
      // WordPress container + volumes, so it can NEVER be left running after this
      // spec. Keeps the image so re-runs don't rebuild. Same guaranteed net the
      // apps-cms-wordpress.spec.ts flow relies on.
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage('cms-webportal-playground');
      } catch (e) {
        console.error('[CLEANUP] Nuclear cms-webportal docker compose down failed:', e);
      }
    }
  },
);

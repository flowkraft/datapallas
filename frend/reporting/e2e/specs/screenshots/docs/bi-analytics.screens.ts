// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — BI Analytics: Grails playground demo pages + app lifecycle
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures the screenshots referenced from the bi-analytics docs MDX that live on
// the DataPallas "Grails App" playground (the default-stack frontend that serves
// the rb-* web-component demo pages) and its app-card lifecycle in the DataPallas
// Electron UI.
//
// REALLY starts the flowkraft-grails playground container (needs Docker). The app
// is started ONCE per block and ALWAYS stopped at the end — graceful Stop the
// user way, then a nuclear `docker compose down` in `finally`, with the
// scream-on-cleanup-failure guard so a leaked/still-running container fails the
// run RED. Same teardown contract as samples.screens.ts BLOCK 4 and
// reporting.screens.ts BLOCK 2.
//
// ── WHAT THIS FILE CAPTURES (all as <orig>-dp.png — old/new side-by-side) ────────
//
//   BLOCK 1 — App lifecycle (grails-next-apps.mdx) — DataPallas Electron app card
//     bi-analytics/000-bi-analytics-app-not-started-dp.png   card, stopped
//     bi-analytics/005-bi-analytics-app-start-confirmation-dp.png  Start confirm dialog
//     bi-analytics/010-bi-analytics-app-starting-dp.png      card, "starting"
//     (015 running-state + 100_10 dashboard already come from samples.screens.ts
//      BLOCK 4 — not re-shot here to avoid duplication.)
//
//   BLOCK 2 — Web-component demo pages (index/parameters/reports.mdx) — external
//   browser at GRAILS_BASE_URL, each shot element-cropped to one component:
//     bi-analytics/025-rb-tabulator-dp.png        /tabulator     → one example card
//     bi-analytics/030-rb-chart-dp.png            /charts        → one chart card
//     bi-analytics/035-rb-pivottable-dp.png       /pivot-tables  → the Sales Overview pivot
//     bi-analytics/040-rb-report-parameters-dp.png /report-parameters → Parameter Form card
//     bi-analytics/045-rb-report-dp.png           /reports       → the payslip card
//
// The 040/045 crops target NEW wrapper ids added to the Grails GSPs
// (#parameterFormCard, #reportDemoCard). Because the grails-playground image
// BAKES its GSPs at build time (build: dockerfile), those ids only exist in a
// freshly built image — rebuild after editing:
//     cd frend/reporting/testground/e2e/_apps/flowkraft/grails-playground
//     docker compose build grails-playground
//
// Output: writes into the docs repo at …/public/images/docs/bi-analytics/.
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # E2E_SPEC=bi-analytics.screens.ts, E2E_GREP="BI Analytics" in
//   # custom:start-server-and-e2e-electron-screens-grep
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect, Browser, Page } from '@playwright/test';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotOfElement,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── OUTPUT SUB-DIR ────────────────────────────────────────────────────────────
const BI_DIR = path.join(DOCS_IMAGES_DIR, 'bi-analytics');

// Every shot is saved next to its original as `<name>-dp.png` (drop the suffix
// once approved — same convention as the other screens specs).
const dp = (base: string) => `${base}-dp.png`;

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
// The Grails playground app: its card lives on the Customer Portal tab, and it
// serves the demo pages at GRAILS_BASE_URL (:8400).
const BI_APP_ID = SelfServicePortalsTestHelper.APP_ID_GRAILS; // 'flowkraft-grails'
const BI_APP_BASE_URL = SelfServicePortalsTestHelper.GRAILS_BASE_URL;

// External-browser viewport — wide enough that the cropped component fills a
// docs-friendly frame.
const EXT_VIEWPORT = { width: 1500, height: 950 };

// One representative example id per demo page (each `_example.gsp` emits
// `#example-<id>`; the pivot/report/params pages use their own single-component
// ids). Swap these to feature a different example without touching the flow.
const TABULATOR_EXAMPLE = '#example-virtualDomVertical';
const CHART_EXAMPLE = '#example-monthlySalesTrend';

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — App lifecycle: not-started → Start confirm → starting (grails-next-apps.mdx)
// ─────────────────────────────────────────────────────────────────────────────
// Pure DataPallas Electron UI — crops the app CARD through its start states. We
// drive the raw button/dialog here (rather than startApp) so we can capture the
// intermediate frames; a nuclear compose-down in `finally` guarantees the
// container never leaks even though this block never calls the graceful stopApp.
electronBeforeAfterAllTest(
  'BI Analytics — app lifecycle (grails-next-apps.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let started = false;
    let bodySucceeded = false;

    try {
      // ── Reach the Customer Portal tab where the Grails app card lives ────────
      await new FluentTester(firstPage)
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#tab-btn-customerPortalTab')
        .click('#tab-btn-customerPortalTab')
        .waitOnElementToBecomeVisible(`#appName_${BI_APP_ID}`)
        .waitOnElementToContainText(`#appState_${BI_APP_ID}`, 'stopped');
      await hideToastsForScreenshots(firstPage);

      // ── 000 — the app card, STOPPED (cropped to just the card) ──────────────
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('000-bi-analytics-app-not-started'),
        `#appPanel_${BI_APP_ID}`,
        { outDir: BI_DIR },
      );
      console.log(`[capture] bi-analytics/${dp('000-bi-analytics-app-not-started')}`);

      // ── Click Start → the confirmation dialog ("Be patient — first start…") ──
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled(`#btnStartStop_${BI_APP_ID}`)
        .click(`#btnStartStop_${BI_APP_ID}`)
        .confirmDialogShouldBeVisible();
      await firstPage.waitForTimeout(300);

      // ── 005 — the Start confirmation dialog (full viewport: dialog + dimmed card).
      await captureDocsScreenshot(firstPage, dp('005-bi-analytics-app-start-confirmation'), BI_DIR);
      console.log(`[capture] bi-analytics/${dp('005-bi-analytics-app-start-confirmation')}`);

      // ── Confirm Yes → the card flips to "starting" (spinner + progress log) ──
      // From here the container is booting — `started=true` so the finally
      // ALWAYS composes it down, even if the "starting" crop below throws.
      await new FluentTester(firstPage).clickYesDoThis();
      started = true;
      await firstPage
        .locator(`#appState_${BI_APP_ID}`)
        .filter({ hasText: /starting/i })
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .catch(() => console.log('[010] "starting" state not observed — Docker booted fast; capturing as-is'));
      await hideToastsForScreenshots(firstPage);
      await firstPage.waitForTimeout(300);

      // ── 010 — the app card, STARTING (cropped to the card).
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('010-bi-analytics-app-starting'),
        `#appPanel_${BI_APP_ID}`,
        { outDir: BI_DIR },
      );
      console.log(`[capture] bi-analytics/${dp('010-bi-analytics-app-starting')}`);

      console.log('[DONE] App lifecycle screenshots captured.');
      bodySucceeded = true;
    } finally {
      // ── CLEANUP — the app must NEVER be left running. Scream on failure. ─────
      const cleanupErrors: string[] = [];

      // Graceful UI stop first (best-effort) — but only meaningful once the app
      // actually began starting; if it never started there's nothing to stop.
      if (started) {
        try {
          await SelfServicePortalsTestHelper.stopApp(
            new FluentTester(firstPage).gotoBurstScreen(),
            BI_APP_ID,
          );
        } catch (e) {
          cleanupErrors.push(`graceful stopApp: ${e}`);
        }
      }
      // Nuclear down — ALWAYS runs, removes the container + volumes even if the
      // graceful stop above failed or the renderer died mid-start.
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage('flowkraft/grails-playground');
      } catch (e) {
        cleanupErrors.push(`docker compose down grails-playground: ${e}`);
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(
            `Cleanup failed — the Grails app may still be running:\n${cleanupErrors.join('\n')}`,
          );
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — Web-component demo pages (index/parameters/reports.mdx)
// ─────────────────────────────────────────────────────────────────────────────
// Starts the Grails app the user way (startApp), opens an external browser at
// GRAILS_BASE_URL, walks each demo page and element-crops one representative
// component. Graceful stopApp + nuclear down in `finally`, scream on failure.
electronBeforeAfterAllTest(
  'BI Analytics — web-component demo pages (web-components docs)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;
    let started = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: start the Grails app (asserts Docker, boots, waits "running") ─
      await new FluentTester(firstPage)
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#tab-btn-customerPortalTab')
        .click('#tab-btn-customerPortalTab')
        .waitOnElementToBecomeVisible(`#appName_${BI_APP_ID}`);
      await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage), BI_APP_ID);
      started = true;
      await new FluentTester(firstPage).waitOnElementToBecomeVisible(`#btnLaunch_${BI_APP_ID}`);

      // ── Open external browser + wait for the Grails server to answer ─────────
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: EXT_VIEWPORT,
      });
      externalBrowser = ext.browser;
      const page: Page = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(page, BI_APP_BASE_URL);

      // ── 025 — /tabulator, one example card ──────────────────────────────────
      await page.goto(`${BI_APP_BASE_URL}/tabulator`, { timeout: 30_000, waitUntil: 'networkidle' });
      await expect(page.locator('rb-tabulator').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.tabulator-row').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await captureDocsScreenshotOfElement(page, dp('025-rb-tabulator'), TABULATOR_EXAMPLE, { outDir: BI_DIR });
      console.log(`[capture] bi-analytics/${dp('025-rb-tabulator')}`);

      // ── 030 — /charts, one chart card (wait for the Chart.js canvas to paint) ─
      await page.goto(`${BI_APP_BASE_URL}/charts`, { timeout: 30_000, waitUntil: 'networkidle' });
      await expect(page.locator(`${CHART_EXAMPLE} canvas`)).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1_000);
      await captureDocsScreenshotOfElement(page, dp('030-rb-chart'), CHART_EXAMPLE, { outDir: BI_DIR });
      console.log(`[capture] bi-analytics/${dp('030-rb-chart')}`);

      // ── 035 — /pivot-tables, the Sales Overview pivot grid ──────────────────
      await page.goto(`${BI_APP_BASE_URL}/pivot-tables`, { timeout: 30_000, waitUntil: 'networkidle' });
      await expect(page.locator('#demoPivot')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.pvtTable, .pvtUi, .pvtRendererArea').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1_000);
      await captureDocsScreenshotOfElement(page, dp('035-rb-pivottable'), '#demoPivot', { outDir: BI_DIR });
      console.log(`[capture] bi-analytics/${dp('035-rb-pivottable')}`);

      // ── 040 — /report-parameters, the Parameter Form card (#parameterFormCard) ─
      await page.goto(`${BI_APP_BASE_URL}/report-parameters`, { timeout: 30_000, waitUntil: 'networkidle' });
      await expect(page.locator('#parameterFormCard')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('#demoParams')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1_000); // let rb-parameters render its date fields
      await captureDocsScreenshotOfElement(page, dp('040-rb-report-parameters'), '#parameterFormCard', { outDir: BI_DIR });
      console.log(`[capture] bi-analytics/${dp('040-rb-report-parameters')}`);

      // ── 045 — /reports, the payslip card after selecting an employee ────────
      // The payslip is display:none until an employee card is clicked; click one
      // (EMP001, matching assertRbReportComponent), wait for the rb-report iframe.
      await page.goto(`${BI_APP_BASE_URL}/reports`, { timeout: 30_000, waitUntil: 'networkidle' });
      await expect(page.locator('.employee-card').first()).toBeVisible({ timeout: 10_000 });
      await page.click('.employee-card[data-code="EMP001"]');
      await expect(page.locator('rb-report#demoReport')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('rb-report iframe, rb-report object').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1_500); // let the payslip HTML paint inside the iframe
      await captureDocsScreenshotOfElement(page, dp('045-rb-report'), '#reportDemoCard', { outDir: BI_DIR });
      console.log(`[capture] bi-analytics/${dp('045-rb-report')}`);

      console.log('[DONE] Web-component demo-page screenshots captured.');
      bodySucceeded = true;
    } finally {
      // ── CLEANUP — close browser, graceful stop, nuclear down. Scream on fail. ─
      const cleanupErrors: string[] = [];

      if (externalBrowser) {
        try {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        } catch (e) {
          cleanupErrors.push(`close external browser: ${e}`);
        }
      }
      if (started) {
        try {
          await SelfServicePortalsTestHelper.stopApp(
            new FluentTester(firstPage).gotoBurstScreen(),
            BI_APP_ID,
          );
        } catch (e) {
          cleanupErrors.push(`graceful stopApp: ${e}`);
        }
      }
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage('flowkraft/grails-playground');
      } catch (e) {
        cleanupErrors.push(`docker compose down grails-playground: ${e}`);
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(
            `Cleanup failed — the Grails app may still be running:\n${cleanupErrors.join('\n')}`,
          );
        }
      }
    }
  },
);

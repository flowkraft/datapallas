// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS / VIDEO FRAMES — the "Bills Portal" custom app (0015-document-portal)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures the frames the 0015-document-portal Remotion video (Leo + Hermes) consumes as
// its ShotScene assets. TWO capture blocks, each a self-contained electronBeforeAfterAllTest:
//
//   BLOCK 1 (billing) — the FOCUSED billing-portal-grails custom app (dp_* frames): the real,
//     branded, authenticated billing portal the video's Act 3 walks (login → invoices → pay →
//     admin). NOT the old WordPress webportal (that stays in samples.screens.ts BLOCK 5). Only
//     the Grails app is captured; the Next app is a visual mirror, so one set of frames serves it.
//
//   BLOCK 2 (demo) — the built-in "kitchen-sink" grails-playground demo (q2_054-060 frames): ONE
//     app that ships a document web portal AND analytics/dashboards AND an admin back office, which
//     the video's Act 2 opens on. Continues the q2_050-053 sequence quickstart.screens.ts captures.
//
// Both blocks share the title prefix below, so one grep runs the pair:
//
//     E2E_GREP="Document Portal — video frames"
//
// ── This file is the PROVEN e2e, with the assertions swapped for captures ──────────
// Every driving step below — scaffold, start, Burst, and (crucially) the portal login
// + navigation — is copied VERBATIM from the fully-passing functional spec
// e2e/specs/features/apps-custom.spec.ts (Grails half). The one thing that must NOT be
// paraphrased is the login: it uses `waitForNavigation` (never
// `Promise.all([page.waitForLoadState('networkidle'), click])`). waitForLoadState
// resolves instantly on an already-idle page, returns while the login POST is still in
// flight, and the next page.goto() CANCELS it — so the session is never established and
// EVERY later portal page silently bounces to /login. That is exactly what made the
// previous version of this file capture login pages where invoices should have been.
//
// ── FRAME → state (written to cli-remotion/.../0015-document-portal/) ───────────────
//   dp_10_seed-data-pick.png       Seed Data ▸ Example — the "Bills Portal (Grails)" template, dropdown expanded + ringed
//   dp_15_seed-run.png             Seed Data ▸ My Script — the seed script loaded, the Run button ringed
//   dp_20_app-card-appears.png     Apps Manager — the Bills Portal card (cropped), the "Custom App" badge ringed
//   dp_30_app-running.png          The Bills Portal card, running after Launch (cropped)
//   dp_40_report-selected.png      Generate Reports — "Bills Portal (Grails)" push report selected
//   dp_50_burst-done.png           After the Burst — DataPallas pushed the invoices, no errors
//   dp_60_portal-login.png         The customer portal login page (external browser)
//   dp_70_portal-invoices.png      Alice's invoice list — PAID + OVERDUE badges, her Pay button ringed
//   dp_80_invoice-detail.png       A single invoice (self-contained doc in #invoiceFrame), the Print button ringed
//   dp_90_pay.png                  The unauthenticated pay page (pay-by-token)
//   dp_95_pay-success.png          Payment confirmed
//   dp_100_admin.png               /admin/invoices — the Invoices sidebar link ringed
//
// It boots real Docker (the billing-portal-grails container), so it is heavy and long —
// one `electronBeforeAfterAllTest` block, guarded teardown (nuclear `docker compose
// down -v`). Output dir is derived from DOCS_IMAGES_DIR exactly like reporting.screens.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Browser, Page } from '@playwright/test';
import * as path from 'path';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { DockerTestHelper } from '../../../helpers/docker-test-helper';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotOfElement,
  captureDocsScreenshotOfElementWithHighlight,
  captureDocsScreenshotWithHighlights,
  waitForRbChartsRendered,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// cli-remotion assets dir for the 0015 video (same 4-hops-up idiom as reporting.screens.ts:
// …/public/images/docs → …/www, then into cli-remotion).
const VIDEO_ASSETS_DIR = path.resolve(
  DOCS_IMAGES_DIR, '..', '..', '..', '..',
  'cli-remotion', 'public', 'assets', 'rb', '0015-document-portal',
);

// ── The app under capture (Grails; Next is its visual mirror) — matches apps-custom.spec.ts ─────
const APP_ID = 'billing-portal-grails';
// Teardown cd's to `_apps/<APP_STACK>` — it MUST be the real compose dir (FlowKraft examples live
// under _apps/flowkraft/xx-custom/_examples/), NOT the bare app id, or `docker compose down` silently
// no-ops and the container LEAKS on the error path.
const APP_STACK = `flowkraft/xx-custom/_examples/${APP_ID}`;
const SEED_TEMPLATE_ID = 'app-billing-portal-grails'; // GenericSeedExecutor id in #seedTemplateSelect
const SEED_MARKER = 'billing-portal-grails';          // appears in the app-seed source (APP_ID line)
const REPORT_LABEL = 'Bills Portal (Grails)';         // settings.xml <template> → Generate Reports option
const PORT = 8500;
const BASE_URL = `http://localhost:${PORT}`;

// The sample connection the push report runs against (sqlite: the bundled Northwind sample DB).
const SAMPLE_CONNECTION_CODE = 'rbt-sample-northwind-sqlite-4f2';
const SAMPLE_VENDOR = 'sqlite';

// Deterministic BootStrap/self-seed data (see billing-portal-grails/_custom/README.md).
const LOGIN = {
  admin: { user: 'admin', pass: 'admin123' },
  alice: { user: 'alice@demo.io', pass: 'demo1234' },
};
const INV = {
  alicePaid: 'INV-DEMO-0001',    // Alice's PAID demo invoice — the dp_70 list + dp_80 detail subject
  aliceOverdue: 'INV-DEMO-0002', // Alice's OVERDUE demo invoice — the 2nd badge in dp_70
};
const PAY_TOKEN = 'demo-pay-token-0005'; // Carol's INV-DEMO-0005 payable — the unauthenticated pay link

// ── PROVEN getElementById helpers — copied verbatim from apps-custom.spec.ts ────────────────────
// The portal ships the SAME DOM ids on both stacks; these go through page.evaluate(getElementById)
// exactly as the functional spec does, so a frame is never captured against a mislocated element.
const exists = (page: Page, id: string) =>
  page.evaluate((i) => !!document.getElementById(i), id);
const textOf = (page: Page, id: string) =>
  page.evaluate((i) => (document.getElementById(i)?.textContent || '').trim(), id);
const setValue = (page: Page, id: string, val: string) =>
  page.evaluate(({ i, v }) => {
    const el = document.getElementById(i) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { i: id, v: val });
const clickById = (page: Page, id: string) =>
  page.evaluate((i) => (document.getElementById(i) as HTMLElement).click(), id);
async function waitForId(page: Page, id: string, timeout = 15000) {
  await page.waitForFunction((i) => !!document.getElementById(i), id, { timeout });
}
// Click an element that NAVIGATES, and wait for the navigation to actually commit. NEVER
// waitForLoadState here — see the file header.
async function clickAndNavigate(page: Page, id: string, timeout = 15_000) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout }),
    clickById(page, id),
  ]);
}
// Sign in — waits for the submit to actually NAVIGATE (see the file header on why waitForLoadState
// silently cancels the POST). Fails loudly if a login that was meant to work is rejected, so a
// broken login surfaces HERE, not three frames later as a login page where invoices should be.
async function login(page: Page, who: { user: string; pass: string }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForId(page, 'btn-login');
  await setValue(page, 'login-username', who.user);
  await setValue(page, 'login-password', who.pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 }),
    clickById(page, 'btn-login'),
  ]);
  if (await exists(page, 'login-error')) {
    throw new Error(`Login failed for '${who.user}': ${await textOf(page, 'login-error')}`);
  }
}

// Capture a native <select> shown EXPANDED as an inline listbox with one option highlighted — the
// only way to screenshot a native dropdown's choices (its real OS popup is not in the page).
// Borrowed from connections.screens.ts's db-type trick: `size` expands every <option> inline; an
// injected <style> defeats daisyUI's fixed height + appearance:none clip, floats the listbox
// popup-style over the fields below, paints the options with the app's (dark) theme tokens,
// neutralises the native selection, and paints the TARGET option selection-blue. Both the size
// attribute and the style are reverted after the shot, so the live UI is left untouched.
async function captureSelectExpanded(
  page: Page, filename: string, selectId: string, optionValue: string, outDir: string,
): Promise<void> {
  await page.locator(`#${selectId}`).scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(({ id, val }) => {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    const width = Math.round(sel.getBoundingClientRect().width);
    sel.dataset.prevSize = String(sel.size ?? 0);
    sel.size = sel.options.length;            // expand every option inline
    const style = document.createElement('style');
    style.id = '__sel_open_hl';
    style.textContent =
      `#${id}{appearance:auto !important;-webkit-appearance:auto !important;` +
        `height:auto !important;min-height:0 !important;max-height:340px !important;` +
        `overflow-y:auto !important;background-image:none !important;` +
        `position:absolute !important;z-index:50 !important;width:${width}px !important;` +
        `box-shadow:0 10px 26px rgba(0,0,0,0.6) !important;}` +
      `#${id} option{background-color:var(--color-base-100,#1d232a);` +
        `color:var(--color-base-content,#a6adbb);padding:3px 10px}` +
      `#${id} option:checked{background:var(--color-base-100,#1d232a) !important;` +
        `color:var(--color-base-content,#a6adbb) !important}` +
      `#${id} option[value="${val}"]{background:#0f6cbd !important;color:#fff !important}`;
    document.head.appendChild(style);
    // The seed dropdown has many options and sits low in the modal, so a full-height
    // expansion clips the custom-app rows (the target among them) below the fold. Cap the
    // height (above), select the target, and scroll it into the visible part of the popup.
    sel.value = val;
    (sel.querySelector(`option[value="${val}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'center' });
  }, { id: selectId, val: optionValue });
  await page.waitForTimeout(250);
  await captureDocsScreenshot(page, filename, outDir);
  await page.evaluate((id) => {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (sel) { sel.size = Number(sel.dataset.prevSize ?? '0') || 0; delete sel.dataset.prevSize; }
    document.getElementById('__sel_open_hl')?.remove();
  }, selectId);
}

electronBeforeAfterAllTest(
  'Document Portal — video frames — 0015 (Bills Portal one-run magic)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const T = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    let externalBrowser: Browser | null = null;

    try {
      // Clean slate for the app's container/image.
      SelfServicePortalsTestHelper.dockerComposeDownRmi(APP_STACK);
      await hideToastsForScreenshots(firstPage);

      // NO seeding step: the push report is a ds.scriptfile over the BUNDLED Northwind sample DB, so
      // its input already exists. The scaffold below is the FIRST thing that touches the connection.

      // ── FRAME dp_10 + scaffold — the SAME sub-flows ConnectionsTestHelper.scaffoldCustomApp-
      //    ViaConnectionDetails composes, split so the frame lands between "example loaded" and
      //    "Run". Composing the public sub-helpers (NOT hand-inlining the chain) keeps every guard
      //    the real scaffold relies on — an inlined copy has dropped those guards and mis-timed the
      //    Seed-Data tab twice before. NOT wrapped in try/catch: this IS the scaffold; if loading
      //    the example fails there is no script to Run, so it must fail loudly, here.
      let ft = ConnectionsTestHelper.openSeedDataTabAndTestConnection(
        new FluentTester(firstPage), SAMPLE_CONNECTION_CODE, SAMPLE_VENDOR, T,
      );
      ft = ConnectionsTestHelper.loadExampleAndPasteIntoMyScript(ft, SEED_TEMPLATE_ID, SEED_MARKER);
      await ft;
      // ── FRAME dp_10: the Example picker OPEN, "Bills Portal (Grails)" highlighted. loadExample…
      //    ends on the My Script sub-tab (it pastes there), so re-open the Examples sub-tab — the
      //    picker still carries the value it selected. #seedTemplateSelect is a NATIVE <select> (its
      //    OS popup can't be screenshot), so captureSelectExpanded borrows connections.screens.ts's
      //    size-expand-inline trick and rings the chosen option. Switch BACK to My Script after, so
      //    the seed still Runs from where the helper left it (#btnRunCustomSeed lives on that tab).
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#tab-btn-seedTabExample')
        .click('#tab-btn-seedTabExample')
        .waitOnElementToBecomeVisible('#seedTemplateSelect');
      await captureSelectExpanded(firstPage, 'dp_10_seed-data-pick.png', 'seedTemplateSelect', SEED_TEMPLATE_ID, VIDEO_ASSETS_DIR);
      console.log('[frame] dp_10_seed-data-pick.png');
      await new FluentTester(firstPage)
        .click('#tab-btn-seedTabMyScript')
        .waitOnElementToBecomeVisible('#seedCustomScriptEditor');

      // ── FRAME dp_15: the seed script now loaded in My Script, the Run button ringed — "run this
      //    one script and the whole billing portal is scaffolded for you." #btnRunCustomSeed is the
      //    very button runMyScriptAndWait clicks next, so this is the exact "ready to run" state.
      await new FluentTester(firstPage).waitOnElementToBecomeEnabled('#btnRunCustomSeed');
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshotWithHighlights(firstPage, 'dp_15_seed-run.png', [{ selector: '#btnRunCustomSeed', inset: true }], VIDEO_ASSETS_DIR);
      console.log('[frame] dp_15_seed-run.png');

      // Run the app-seed (copies blueprint + overrides, writes the Customer Invoices push report
      // bound to the sample connection, flips app.json visible:true), then close the modal.
      ft = ConnectionsTestHelper.runMyScriptAndWait(new FluentTester(firstPage), SEED_TEMPLATE_ID, T);
      ft = ConnectionsTestHelper.closeConnectionDetailsModal(ft);
      await ft;

      // ── FRAME dp_20: the app card revealed by the seed (Apps Manager, cropped to the card) ─────
      await new FluentTester(firstPage).gotoApps().waitOnElementToBecomeVisible(`#appPanel_${APP_ID}`);
      await firstPage.waitForTimeout(400);
      // Crop to the card AND ring the "Custom App" source badge — the proof this is YOUR app,
      // scaffolded by the seed, not one of ours or a third party.
      await captureDocsScreenshotOfElementWithHighlight(
        firstPage, 'dp_20_app-card-appears.png',
        `#appPanel_${APP_ID}`, `#appSourceBadge_${APP_ID}`, { outDir: VIDEO_ASSETS_DIR },
      );
      console.log('[frame] dp_20_app-card-appears.png');

      // ── Start the app (Docker), then FRAME dp_30: the running card ─────────────────────────────
      await SelfServicePortalsTestHelper.startApp(new FluentTester(firstPage).gotoApps(), APP_ID);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotOfElement(firstPage, 'dp_30_app-running.png', `#appPanel_${APP_ID}`, { outDir: VIDEO_ASSETS_DIR });
      console.log('[frame] dp_30_app-running.png');

      // Bring up an external browser now so curl has a live portal target for the Burst.
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser();
      externalBrowser = ext.browser;
      const page = ext.page;
      await page.setViewportSize({ width: 1440, height: 900 });   // consistent video-frame size
      await SelfServicePortalsTestHelper.waitForServerReady(page, `${BASE_URL}/login`, 60, 2000);

      // ── FRAME dp_40: the push report selected on the Generate Reports tab (first half of the
      //    proven burstPushReport chain) ──────────────────────────────────────────────────────────
      await new FluentTester(firstPage)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${REPORT_LABEL}")`)
        .click(`span.ng-option-label:has-text("${REPORT_LABEL}")`)
        .waitOnElementToBecomeEnabled('#btnGenerateReports');
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, 'dp_40_report-selected.png', VIDEO_ASSETS_DIR);
      console.log('[frame] dp_40_report-selected.png');

      // ── Burst (second half of burstPushReport): DataPallas renders each invoice to JSON and
      //    curl-POSTs it to the portal. Then FRAME dp_50: the finished, no-errors state ────────────
      //
      // CLEAR LOGS FIRST — mandatory. Starting the portal above pumped the whole Docker build into
      // the logs, so blockedByDirtyLogs() REFUSES every job with an info dialog and never reaches
      // confirmAndStartJob — no '.java-started' toast, waitOnProcessingToStart() hangs on a Burst
      // that was never allowed to run. The first click/Yes pair only dismisses that dialog.
      await new FluentTester(firstPage)
        .click('#btnGenerateReports')
        .clickYesDoThis()                                   // dismiss the dirty-logs info dialog
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')     // logs clean → jobs allowed again
        .click('#btnGenerateReports')                       // the REAL Burst
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, 'dp_50_burst-done.png', VIDEO_ASSETS_DIR);
      console.log('[frame] dp_50_burst-done.png');

      // ── PORTAL frames (external browser) ────────────────────────────────────────────────────────
      // dp_60: the login page — no session yet.
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await waitForId(page, 'btn-login');
      await captureDocsScreenshot(page, 'dp_60_portal-login.png', VIDEO_ASSETS_DIR);
      console.log('[frame] dp_60_portal-login.png');

      // dp_70: Alice logs in and sees ONLY her invoices — PAID (INV-DEMO-0001) + OVERDUE
      // (INV-DEMO-0002). The proven login is what makes this land on the list rather than /login.
      await login(page, LOGIN.alice);
      await page.goto(`${BASE_URL}/portal/invoices`, { waitUntil: 'networkidle' });
      await waitForId(page, `invoice-status-${INV.alicePaid}`);
      await waitForId(page, `invoice-status-${INV.aliceOverdue}`);
      // Ring the Pay button on her OVERDUE invoice (isPayable() = status != 'PAID') — the "she can
      // settle it right here, the moment she signs in" beat.
      await waitForId(page, `btn-pay-${INV.aliceOverdue}`);
      await captureDocsScreenshotWithHighlights(page, 'dp_70_portal-invoices.png', [`#btn-pay-${INV.aliceOverdue}`], VIDEO_ASSETS_DIR);
      console.log('[frame] dp_70_portal-invoices.png');

      // dp_80: open one invoice — the self-contained document renders in #invoiceFrame. Reached via
      // the SAME #btn-view-<number> link the functional spec drives (not a generic row anchor), and
      // clickAndNavigate waits for the real navigation, so the frame reliably shows the document.
      await clickAndNavigate(page, `btn-view-${INV.alicePaid}`);
      await waitForId(page, 'invoiceFrame');
      await waitForId(page, 'btn-print-invoice');
      await page.waitForTimeout(400);
      // Ring the Print button — it sits OUTSIDE #invoiceFrame (on the page), so it prints the
      // self-contained document without printing itself.
      await captureDocsScreenshotWithHighlights(page, 'dp_80_invoice-detail.png', ['#btn-print-invoice'], VIDEO_ASSETS_DIR);
      console.log('[frame] dp_80_invoice-detail.png');

      // dp_90 / dp_95: the UNAUTHENTICATED pay-by-token flow (the "she doesn't even need to log in"
      // beat). Clear the session first so it is genuinely the anonymous checkout, then pay.
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}/portal/pay?token=${PAY_TOKEN}`, { waitUntil: 'networkidle' });
      await waitForId(page, 'pay-amount');
      await captureDocsScreenshot(page, 'dp_90_pay.png', VIDEO_ASSETS_DIR);
      console.log('[frame] dp_90_pay.png');
      await clickAndNavigate(page, 'btn-pay');
      await waitForId(page, 'pay-success');
      await captureDocsScreenshot(page, 'dp_95_pay-success.png', VIDEO_ASSETS_DIR);
      console.log('[frame] dp_95_pay-success.png');

      // dp_100: the admin back office — the Invoices list, reached the admin way via the Invoices
      // sidebar link, which is ringed.
      await page.context().clearCookies();
      await login(page, LOGIN.admin);
      await page.goto(`${BASE_URL}/admin/invoices`, { waitUntil: 'networkidle' });
      await waitForId(page, 'adminNavInvoices');
      await waitForId(page, `invoice-row-${INV.alicePaid}`);
      await page.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(page, 'dp_100_admin.png', ['#adminNavInvoices'], VIDEO_ASSETS_DIR);
      console.log('[frame] dp_100_admin.png');

      console.log('[DONE] All 0015-document-portal video frames captured.');

      await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
      externalBrowser = null;
      await SelfServicePortalsTestHelper.stopApp(new FluentTester(firstPage).gotoApps(), APP_ID);
    } finally {
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(() => {});
      }
      // Nuclear cleanup — always runs. APP_STACK (the real compose dir) so the container is actually
      // stopped + removed even when the run failed before the happy-path stopApp.
      try { SelfServicePortalsTestHelper.dockerComposeDownRmi(APP_STACK); } catch (e) {
        console.error(`[CLEANUP] ${APP_ID} down failed:`, e);
      }
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECOND BLOCK — the "kitchen-sink" demo portal (grails-playground / flowkraft-grails)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The block above captures the FOCUSED billing-portal-grails app (dp_* frames). This one
// captures the built-in DEMO app — grails-playground (app id `flowkraft-grails`, stack
// `flowkraft/grails-playground`, port 8400, NO login) — DataPallas's "kitchen sink": ONE app
// that ships a document web portal (Payslips + Invoices) AND analytics/dashboards (live
// <rb-chart> / <rb-tabulator>, the CFO dashboard) AND an admin back office, all behind one top
// menu. The 0015 video's demo beat (Leo + Hermes) opens on these frames before the billing story.
//
// It boots the SAME app quickstart.screens.ts BLOCK F boots (q2_050-053), the proven way:
// Processing screen → Customer Portal tab → Start. These frames CONTINUE that q2_* sequence.
//
// ── FRAME → state (written to cli-remotion/.../0015-document-portal/) ───────────────
//   q2_054_portal-landing-dp.png        /portal — the just-launched landing + full top menu (clean)
//   q2_055_menu-payslips-dp.png         /portal — top menu, the Payslips link ringed
//   q2_056_menu-invoices-dp.png         /portal — top menu, the Invoices link ringed
//   q2_057_menu-analytics-dp.png        /portal — top menu, the Analytics link ringed
//   q2_058_menu-admin-dp.png            /portal — top menu, the Admin link ringed
//   q2_059_admin-dashboard-dp.png       /admin  — the back office: invoices + payments (revenue) counts
//   q2_060_analytics-dashboards-dp.png  /dashboards — the CFO analytics dashboard (charts + tables)
//
// The landing + four menu frames all sit on the SAME just-launched /portal hero, so Hermes can
// introduce the menu one item at a time (Payslips → Invoices → Analytics → Admin).
//
// #portalNavPayslips / #portalNavInvoices were added to grails-playground/layouts/portal.gsp to
// match the pre-existing #portalNavAnalytics / #portalNavAdmin — so the grails-playground image
// must be REBUILT once to pick them up, which the dockerComposeDownRmi at the start forces. Once
// the image carries the ids, that start line can be relaxed to dockerComposeDownKeepImage for
// faster re-runs.
//
// Leak-safe: graceful stopApp on the happy path + nuclear `docker compose down -v` (keeping the
// image) in finally — the container is never left running, on success OR error.
// ═══════════════════════════════════════════════════════════════════════════════
electronBeforeAfterAllTest(
  'Document Portal — video frames — 0015 (kitchen-sink demo portal)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);
    const GRAILS_APP = 'flowkraft-grails';
    const GRAILS_STACK = 'flowkraft/grails-playground';
    const PORTAL = SelfServicePortalsTestHelper.GRAILS_BASE_URL; // http://localhost:8400
    let browser: Browser | undefined;

    try {
      // Really boots the Grails container — fail fast + loud if Docker is down.
      DockerTestHelper.assertDockerRunning('Document Portal — kitchen-sink demo frames');

      // Force a clean rebuild so the app picks up the two new portal-nav ids
      // (#portalNavPayslips / #portalNavInvoices). Reusing a stale image would ring nothing
      // on the two left-hand menu frames — the capture would silently come out ring-less.
      SelfServicePortalsTestHelper.dockerComposeDownRmi(GRAILS_STACK);
      await hideToastsForScreenshots(firstPage);

      // Reach the built-in Customer Portal app on the Processing screen and start it — the SAME
      // lifecycle quickstart.screens.ts BLOCK F drives (really boots Docker, leak-safe).
      await ft
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#tab-btn-customerPortalTab')
        .click('#tab-btn-customerPortalTab')
        .waitOnElementToBecomeVisible('#appName_flowkraft-grails');
      await SelfServicePortalsTestHelper.startApp(ft, GRAILS_APP);

      // External browser at a consistent video-frame size; wait for the live portal to boot
      // (the app reports "running" before Grails has finished serving pages).
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: { width: 1500, height: 1000 },
      });
      browser = ext.browser;
      const web = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(web, `${PORTAL}/portal`);

      // ── The "just launched" landing — the top menu, walked one item at a time ─────────
      // Same /portal hero every frame; the first is clean, then each rings ONE nav item so
      // Hermes can introduce Payslips → Invoices → Analytics → Admin in turn. The document
      // portal lives on the left (Payslips/Invoices); the analytics + admin business app, right.
      await web.goto(`${PORTAL}/portal`, { waitUntil: 'networkidle' });
      await web.waitForSelector('#portalNavAdmin', { timeout: 15_000 });

      await captureDocsScreenshot(web, 'q2_054_portal-landing-dp.png', VIDEO_ASSETS_DIR);
      console.log('[frame] q2_054_portal-landing-dp.png');
      await captureDocsScreenshotWithHighlights(web, 'q2_055_menu-payslips-dp.png', ['#portalNavPayslips'], VIDEO_ASSETS_DIR);
      console.log('[frame] q2_055_menu-payslips-dp.png');
      await captureDocsScreenshotWithHighlights(web, 'q2_056_menu-invoices-dp.png', ['#portalNavInvoices'], VIDEO_ASSETS_DIR);
      console.log('[frame] q2_056_menu-invoices-dp.png');
      await captureDocsScreenshotWithHighlights(web, 'q2_057_menu-analytics-dp.png', ['#portalNavAnalytics'], VIDEO_ASSETS_DIR);
      console.log('[frame] q2_057_menu-analytics-dp.png');
      await captureDocsScreenshotWithHighlights(web, 'q2_058_menu-admin-dp.png', ['#portalNavAdmin'], VIDEO_ASSETS_DIR);
      console.log('[frame] q2_058_menu-admin-dp.png');

      // ── q2_059 — /admin: the back office. One desk for invoices AND payments (the Revenue +
      //    Pending counters), plus the New/View quick actions. NO login on the demo app.
      await web.goto(`${PORTAL}/admin`, { waitUntil: 'networkidle' });
      await web.waitForSelector('#admin-stats-grid', { timeout: 15_000 });
      await captureDocsScreenshot(web, 'q2_059_admin-dashboard-dp.png', VIDEO_ASSETS_DIR);
      console.log('[frame] q2_059_admin-dashboard-dp.png');

      // ── q2_060 — /dashboards: the analytics side — the CFO dashboard, live <rb-chart> +
      //    <rb-tabulator> components. Wait for Chart.js to actually PAINT, or the charts capture
      //    blank (they render async across animation frames after mount).
      await web.goto(`${PORTAL}/dashboards`, { waitUntil: 'networkidle' });
      await web.waitForSelector('#panel-revenueTrend', { timeout: 15_000 });
      await waitForRbChartsRendered(web);
      await captureDocsScreenshot(web, 'q2_060_analytics-dashboards-dp.png', VIDEO_ASSETS_DIR);
      console.log('[frame] q2_060_analytics-dashboards-dp.png');

      console.log('[DONE] All 0015 kitchen-sink demo-portal frames captured.');

      await SelfServicePortalsTestHelper.closeExternalBrowser(browser);
      browser = undefined;
      await SelfServicePortalsTestHelper.stopApp(ft, GRAILS_APP);
    } finally {
      if (browser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(browser).catch(() => {});
      }
      // Nuclear cleanup — ALWAYS runs: stop + remove the container (keeping the image so a re-run
      // doesn't rebuild). The container is never left running, on success OR error.
      try { SelfServicePortalsTestHelper.dockerComposeDownKeepImage(GRAILS_STACK); } catch (e) {
        console.error(`[CLEANUP] ${GRAILS_APP} down failed:`, e);
      }
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// THIRD BLOCK — cms-webportal "Hey AI" prompts, for the docs (payslips.mdx refresh)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Regenerates the four "🚨 REMOVED" shots in content/docs/document-portal/payslips.mdx.
// The step was NOT removed: the three "Web Portal / CMS (WordPress)" prompts are served by
// the backend AiPromptRegistry (GET /api/system/ai-prompts) and rendered by the AI Manager.
// There is no dedicated cms-webportal opener button in the current build, so these are
// reached the way a user does — open a Connection Details modal (its footer hosts the
// standalone <dburst-ai-manager>), open the AI Prompts library, click the "Web Portal / CMS
// (WordPress)" category, then each prompt. Backend-only — NO Docker/WordPress boot needed.
//
// Every id below is one the PASSING functional specs already drive (so no guessed selectors):
//   ConnectionsTestHelper.openSeedDataTabAndTestConnection — opens the modal (same as BLOCK 1)
//   #btnAiDropdownToggle → #btnAiPromptsModal              — standalone AI Manager launcher
//   #aiPromptExpandedText / #btnCopyPromptText / #btnCloseAiCopilotModal — the AI Copilot modal
//     (reporting.screens.ts:1651-1689 + connections-test-helper.ts:1700-1787 use these same ids)
// The category <li> and prompt <a> have no ids, so they are clicked by their visible text —
// a real user's path; the titles come verbatim from the backend PromptDefinition.create()s.
//
// ── shot → docs image (written to WEBPORTAL_DIR = …/public/images/docs/webportal/) ──────
//   051-…-hey-ai-prompts-dp.png     AI Manager, "Web Portal / CMS (WordPress)" category, the 3 prompts listed
//   070-…-prompt-single-dp.png      "Generate Single Document Template" expanded
//   075-…-prompt-list-dp.png        "Generate My Documents List Template" expanded
//   080-…-prompt-groovy-curl-dp.png "Generate Groovy Script to Publish Documents…" expanded
//
// Run only this block:  E2E_GREP="Document Portal — webportal AI prompts"
// ═══════════════════════════════════════════════════════════════════════════════
const WEBPORTAL_DIR = path.join(DOCS_IMAGES_DIR, 'webportal');
// Stable prefix, NOT the full "Web Portal / CMS (WordPress)": the sidebar <li> visually
// truncates the "(WordPress)" suffix and the backend string has been renamed before, so a
// prefix :has-text is robust to both. Still unique — no other category contains it.
const WP_CATEGORY = 'Web Portal / CMS';
// prompt title (verbatim from the backend PromptDefinition) → docs filename base.
const WP_PROMPTS = [
  { title: 'Generate Single Document Template',           base: '070-ai-driven-portal-setup-customizations-prompt-single' },
  { title: 'Generate My Documents List Template',         base: '075-ai-driven-portal-setup-customizations-prompt-list' },
  { title: 'Generate Groovy Script to Publish Documents', base: '080-ai-driven-portal-setup-customizations-prompt-groovy-curl' },
];

electronBeforeAfterAllTest(
  'Document Portal — webportal AI prompts (payslips.mdx refresh)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const T = Constants.DELAY_FIVE_THOUSANDS_SECONDS;

    await hideToastsForScreenshots(firstPage);

    // Open the Connection Details modal on the bundled Northwind sample — its footer hosts
    // the standalone AI Manager. Same proven opener BLOCK 1 uses (leaves the modal open,
    // schema tested). Composing the public helper keeps every guard it relies on.
    let ft = ConnectionsTestHelper.openSeedDataTabAndTestConnection(
      new FluentTester(firstPage), SAMPLE_CONNECTION_CODE, SAMPLE_VENDOR, T,
    );
    await ft;

    // Open the AI Prompts library from the footer AI Manager (standalone split-button: the
    // caret toggles the dropdown, "AI Prompts" opens the modal). Scope the launcher to the
    // connection modal so a stray AI Manager elsewhere can't be matched instead.
    await new FluentTester(firstPage)
      .click('#modalDbConnection #btnAiDropdownToggle')
      .waitOnElementToBecomeVisible('#btnAiPromptsModal')
      .click('#btnAiPromptsModal')
      .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal');

    // Navigate to the WordPress category like a user (the modal opens on "Database Schema").
    // The category name lives only on the sidebar <li>; each prompt card also prints
    // "Category: …" so scope the click to <li> to hit the sidebar entry, not a card.
    await new FluentTester(firstPage)
      .click(`li:has-text("${WP_CATEGORY}")`)
      .waitOnElementToBecomeVisible(`a:has-text("${WP_PROMPTS[0].title}")`);
    await firstPage.waitForTimeout(300);

    // 051 — the entry shot: the 3 WordPress prompts listed under the category.
    await captureDocsScreenshot(firstPage, '051-ai-driven-portal-setup-customizations-hey-ai-prompts-dp.png', WEBPORTAL_DIR);
    console.log('[capture] webportal/051-…-hey-ai-prompts-dp.png');

    // 070 / 075 / 080 — each prompt expanded, its full text in #aiPromptExpandedText.
    for (const p of WP_PROMPTS) {
      await new FluentTester(firstPage)
        .click(`a:has-text("${p.title}")`)
        .waitOnElementToBecomeVisible('#aiPromptExpandedText')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        // the promptText loads async (list endpoint is metadata-only); all three start
        // with this sentence, so it proves the expanded text has actually populated.
        .waitOnElementToContainText('#aiPromptExpandedText', 'You are an experienced');
      // show the prompt from its top (the <pre> scrolls internally).
      await firstPage.evaluate(() => {
        const el = document.getElementById('aiPromptExpandedText');
        if (el) el.scrollTop = 0;
      });
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, `${p.base}-dp.png`, WEBPORTAL_DIR);
      console.log(`[capture] webportal/${p.base}-dp.png`);
      // Back to the (still WordPress-filtered) list for the next prompt.
      await new FluentTester(firstPage)
        .click('button:has-text("Back to List")')
        .waitOnElementToBecomeVisible(`a:has-text("${p.title}")`);
    }

    // Close the AI Copilot modal, then the Connection Details modal.
    await new FluentTester(firstPage)
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');
    await ConnectionsTestHelper.closeConnectionDetailsModal(new FluentTester(firstPage));

    console.log('[DONE] webportal AI-prompt docs shots captured → WEBPORTAL_DIR.');
  },
);

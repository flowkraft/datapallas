// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Connections area (for datapallas.com docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures Connections-area screenshots referenced from the docs MDX. Each
// docs target is its own `electronBeforeAfterAllTest` block so new ones can
// be added without disturbing existing flows. All captures live inside the
// DataPallas Electron Angular UI (Configuration → Connections), so we work
// from the Electron Page (`firstPage`) — no external browser needed.
//
// Currently captures:
//
//   "Seed Data — docs screenshots for large-scale.mdx"
//     - 045_80_seed-data-example-tab.png   (Example sub-tab + Invoice Seeder loaded)
//     - 045_82_seed-data-my-script.png     (My Script sub-tab with script pasted)
//
// To add screenshots for another Connections-area docs page, append a new
// `electronBeforeAfterAllTest` block below — keep the per-block setup
// (create connection) / teardown (delete connection) pattern so blocks remain
// independently runnable.
//
// Output: writes directly into the docs repo at
//   c:\Projects\kraft-src-company-biz\flowkraft\www\reportburster.com\public\images\docs\
//
// HOW TO RUN
//     cd frend/reporting
//     npx cross-env TEST_ENV=electron TEST_LICENSE_KEY=51b0aa18f2bbc066efdca8b53c2dacc8 ^
//       RUNNING_IN_E2E=true PORTABLE_EXECUTABLE_DIR=testground/e2e ^
//       playwright test -c e2e/playwright.config.ts ^
//       e2e/specs/screenshots/connections.screens.ts
//
//   Or via the gulp wrapper (set E2E_GREP="Connections — docs"):
//     npm run custom:start-server-and-e2e-electron-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test } from '@playwright/test';
import * as _ from 'lodash';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { captureDocsScreenshot, captureDocsScreenshotWithHighlights } from '../../../utils/docs-screenshot-helper';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
//
// SQLite chosen for screenshot specs: file-based, no Docker, fastest startup.
// The Seed Data tab UI is vendor-agnostic — the screenshots look the same
// regardless of the underlying DB.
const DB_VENDOR = 'sqlite';

// Bundled invoice seeder template id — must match the option value the
// Connection Details Seed Data tab populates from the backend's
// /api/system/seed-templates list (resolved from
// asbl/.../db-template/db/scripts/invoice-seeder.groovy).
const INVOICE_SEEDER_TEMPLATE_ID = 'invoice-seeder';

// A marker we expect to see inside the Invoice Seeder script — used to
// confirm the example loaded into the editor before we capture, and that
// the paste landed in My Script.
const INVOICE_SEEDER_MARKER = 'seed_inv_';

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — Seed Data: large-scale.mdx
// ─────────────────────────────────────────────────────────────────────────────

electronBeforeAfterAllTest(
  'Connections — docs screenshots — Seed Data (large-scale.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Use a unique connection name so multiple screenshot runs do not collide.
    // toConnectionCode logic is duplicated inline (kebab-case + vendor suffix)
    // because the helper is not exported from connections-test-helper.
    const CONNECTION_NAME = 'Northwind Sample Seeding';
    const connectionCode = `db-${_.kebabCase(CONNECTION_NAME)}-${DB_VENDOR}`;
    const connFileSel = `#${connectionCode}\\.xml`;

    let connectionCreated = false;

    try {
      // ── SETUP: create a fresh sqlite connection so the modal opens cleanly ──
      // We deliberately create rather than reuse a sample connection: a fresh
      // connection has the user-facing edit experience the docs describe (no
      // "Sample connections are read-only" footer banner cluttering the shot).
      console.log(`[SETUP] Creating ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        CONNECTION_NAME,
        DB_VENDOR,
      );
      connectionCreated = true;

      // Hide any transient toasts so they don't leak into screenshots
      // (mirrors the technique from cubes.screens.ts).
      await firstPage.evaluate(() => {
        const style = document.createElement('style');
        style.id = '__hide_toasts_for_screenshots';
        style.textContent = `.toast { display: none !important; }`;
        document.head.appendChild(style);
      });

      // ── Open the connection in Edit mode → Seed Data tab → Test Connection ──
      // FluentTester implements PromiseLike<void> — every chain MUST be
      // awaited so its queued operations actually flush before the next
      // synchronous step (in particular, before any captureDocsScreenshot).
      // Without await, the chain just sits queued and the screenshot fires
      // on stale page state (the cause of the empty Connections-list shots
      // we saw before this fix).
      await new FluentTester(firstPage)
        .gotoConnections()
        .waitOnElementToBecomeVisible(connFileSel)
        .clickAndSelectTableRow(connFileSel)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeVisible('#tab-btn-seedDataTab')
        .click('#tab-btn-seedDataTab');

      // Before testing the connection the Seed Data tab shows a placeholder
      // with a single button that routes to Connection Details to test first.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#btnTestDbConnectionSeedData')
        .click('#btnTestDbConnectionSeedData')
        .waitOnElementToBecomeVisible('#btnTestDbConnection')
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeEnabled('#btnTestDbConnection', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .click('#tab-btn-seedDataTab')
        .waitOnElementToBecomeVisible('#seedTemplateSelect');

      // ── Switch to Example sub-tab and pick "Invoice Seeder" ─────────────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#tab-btn-seedTabExample')
        .click('#tab-btn-seedTabExample')
        .waitOnElementToBecomeEnabled('#seedTemplateSelect')
        .waitOnElementToBecomeVisible(
          `#seedTemplateSelect option[value="${INVOICE_SEEDER_TEMPLATE_ID}"]`,
        )
        .dropDownSelectOptionHavingValue('#seedTemplateSelect', INVOICE_SEEDER_TEMPLATE_ID)
        .waitOnConfirmDialogToBecomeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#seedExampleEditor')
        .codeJarShouldContainText('#seedExampleEditor', INVOICE_SEEDER_MARKER);

      // Brief settle so codejar finishes painting and the editor is fully
      // styled (syntax highlighting + line numbers) before we capture.
      await firstPage.waitForTimeout(1500);

      // ── CAPTURE 1 (045_80): Example sub-tab with Invoice Seeder loaded ──────
      // This is THE key frame for the doc — Step 3 ("Pick the Invoice Seeder
      // Template") references it. The frame shows: Connection Details modal
      // open, Seed Data tab active, Example sub-tab visible with the read-only
      // Groovy script editor, the Template dropdown on the right showing
      // "Invoice Seeder" selected, and the Copy button on the left.
      await captureDocsScreenshot(firstPage, '045_80_seed-data-example-tab.png');
      console.log('[capture 1] 045_80_seed-data-example-tab.png');

      // ── Click Copy, switch to My Script, paste ──────────────────────────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnCopyExampleSeedScript')
        .click('#btnCopyExampleSeedScript')
        .clipboardShouldContainText(INVOICE_SEEDER_MARKER)
        .waitOnElementToBecomeVisible('#tab-btn-seedTabMyScript')
        .click('#tab-btn-seedTabMyScript')
        .waitOnElementToBecomeVisible('#seedCustomScriptEditor')
        .pasteClipboardIntoCodeJar('#seedCustomScriptEditor')
        .codeJarShouldContainText('#seedCustomScriptEditor', INVOICE_SEEDER_MARKER);

      // Settle so the codejar finishes painting the pasted content.
      await firstPage.waitForTimeout(1500);

      // ── CAPTURE 2 (045_82): My Script sub-tab with pasted script ────────────
      // Step 4 ("Paste, Set Volume, Run") references this frame. Shows the
      // "ready to run" moment — pasted Groovy in My Script + the Run Script
      // button visible. Deliberately NOT clicking Run: the doc describes
      // what to click, capturing pre-click is enough. Ring the "Hey AI, Help
      // Me…" button (#btnAskAiSeed) so the reader's eye lands on the AI helper
      // — this frame feeds the video's "Hey AI builds the seed script" scene.
      await captureDocsScreenshotWithHighlights(firstPage, '045_82_seed-data-my-script.png', [
        '#btnAskAiSeed',
      ]);
      console.log('[capture 2] 045_82_seed-data-my-script.png');

      console.log('[DONE] All Seed Data screenshots captured.');
    } finally {
      // ── CLEANUP: close the modal if open + delete the connection ────────────
      try {
        const modalCloseBtn = firstPage.locator('#btnCloseDbConnectionModal');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await firstPage
            .locator('#btnCloseDbConnectionModal')
            .waitFor({ state: 'hidden', timeout: 5_000 })
            .catch(() => {});
        }
      } catch (e) {
        console.error('[CLEANUP] Failed to close modal:', e);
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${connectionCode}\\.xml`,
            DB_VENDOR,
          );
        } catch (e) {
          console.error('[CLEANUP] Failed to delete connection:', e);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — (placeholder for future Connections-area docs targets)
// ─────────────────────────────────────────────────────────────────────────────
//
// To add screenshots for another Connections-area docs page (e.g. ER Diagram
// tab, Domain-Grouped Schema, Ubiquitous Language), append a new
// `electronBeforeAfterAllTest('Connections — docs screenshots — <name>', …)`
// block here. Reuse the SETUP / CLEANUP pattern above so blocks remain
// independently runnable and don't share state.

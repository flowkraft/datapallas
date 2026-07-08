// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Cubes / Semantic Layer (for datapallas.com docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures the 4 PNGs referenced from the docs MDX:
//   - 200_00_cubes-left-menu.png        (cubes list with sample cubes — index.mdx)
//   - 200_10_cube-create-modal.png      (Create Cube modal, fields filled — quickstart Step 2)
//   - 200_15_cube-dsl-editor.png        (Cube modal with DSL + preview tree — index.mdx)
//   - 200_20_cube-renderer-preview.png  (Cube modal with selections + Show SQL — quickstart Step 4)
//
// These all live inside the DataPallas Electron Angular UI (Reports, Connections
// & Cubes → Cubes / Semantic Layer), so we capture from the Electron Page
// (`firstPage`) — no external browser, no AI Hub.
//
// Output: writes directly into the docs repo at
//   c:\Projects\kraft-src-company-biz\flowkraft\www\datapallas.com\public\images\docs\
//
// HOW TO RUN
//     cd frend/reporting
//     npx cross-env TEST_ENV=electron TEST_LICENSE_KEY=51b0aa18f2bbc066efdca8b53c2dacc8 ^
//       RUNNING_IN_E2E=true PORTABLE_EXECUTABLE_DIR=testground/e2e ^
//       playwright test -c e2e/playwright.config.ts ^
//       e2e/specs/screenshots/cubes.screens.ts
//
//   Or via the gulp wrapper:
//     npm run custom:start-server-and-e2e-electron-grep -- --grep "Cubes — docs screenshots"
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test } from '@playwright/test';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { toConnectionCode } from '../../../helpers/explore-data-test-helper';
import {
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlights,
} from '../../../utils/docs-screenshot-helper';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

/** A SQLite Northwind connection we create up front so the cube modal's
 *  Database Connection dropdown shows something selected (matching the
 *  original 200_10 / 200_15 / 200_20 manual screenshots). Cleaned up in finally. */
const CONNECTION_NAME = 'Northwind Sample';
const DB_VENDOR = 'sqlite';


/**
 * DSL pasted into the cube editor — chosen to reproduce *exactly* the cube
 * shown in the original manual 200_20 screenshot (orders + customers join).
 *
 * The fields ticked in CAPTURE 4 (order_id, status, customer_name, country)
 * combined with this DSL produce the same Generated SQL the original PNG
 * displays:
 *   SELECT id as order_id, status as status,
 *          customers.company_name as customer_name,
 *          customers.country as country
 *   FROM "public.orders"
 *   JOIN customers ON "public.orders".customer_id = customers.id
 *
 * generate-sql is pure text generation from DSL + selection — it does not
 * execute against a real DB, so using `sql_table 'public.orders'` is fine
 * even though the Northwind sample is SQLite (different actual table names).
 */
const SAMPLE_CUBE_DSL = `// Cube with dimensions from main + joined table
cube {
  sql_table 'public.orders'
  title 'Orders'
  description 'Customer orders with revenue analysis'

  // Primary key
  dimension { name 'order_id'; title 'Order ID'; sql 'id'; type 'number'; primary_key true }

  // Dimensions from main table (orders)
  dimension { name 'status'; title 'Order Status'; sql 'status'; type 'string' }
  dimension { name 'created_at'; title 'Created At'; sql 'created_at'; type 'time' }

  // Dimensions from joined table (customers)
  dimension { name 'customer_name'; title 'Customer'; sql 'customers.company_name'; type 'string' }
  dimension { name 'country'; title 'Country'; sql 'customers.country'; type 'string' }
  dimension { name 'region'; title 'Region'; sql 'customers.region'; type 'string' }
  dimension { name 'city'; title 'City'; sql 'customers.city'; type 'string' }

  // Join
  join { name 'customers'; sql '\${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }
}`;

// ── SPEC ──────────────────────────────────────────────────────────────────────
//
// Single test captures all 4 screenshots in one Electron-app session.
// Setup is driven by the existing FluentTester chain — no new infrastructure.
// Mirrors the structure of cubes-definitions.spec.ts §4.3 ("View SQL" test).

electronBeforeAfterAllTest(
  'Cubes — docs screenshots',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    const ft = new FluentTester(firstPage);
    const connectionCode = toConnectionCode(CONNECTION_NAME, DB_VENDOR);

    try {
      // ── SETUP: Create the Northwind Sample SQLite connection ────────────────
      // We need this so the cube modal's Database Connection dropdown shows
      // something selected (the original screenshots show "Northwind Sample
      // (SQLite) (rbt-sample-north..." in that field — empty looks broken).
      console.log(`[SETUP] Creating ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage), CONNECTION_NAME, DB_VENDOR,
      );

      // ── CAPTURE 1: cubes list (plain — current UI) ──────────────────────────
      // No annotation overlay: the show/hide-samples control has moved (it now
      // lives under Configuration → More Settings), so the docs page carries
      // that as a Note beside the image rather than a baked-in gear/arrow.
      await ft
        .gotoCubeDefinitions()
        .waitOnElementToBecomeVisible('#northwind-customers')
        .waitOnElementToBecomeVisible('#northwind-sales');

      // Hide any transient toasts globally for the rest of the test.
      // Without this, the "Connection 'Northwind Sample' saved successfully"
      // toast from SETUP leaks into capture #1 (default lasts ~5s, our settle
      // is only 800ms). One CSS rule, applied once, no need to restore.
      await firstPage.evaluate(() => {
        const style = document.createElement('style');
        style.id = '__hide_toasts_for_screenshots';
        style.textContent = `.toast { display: none !important; }`;
        document.head.appendChild(style);
      });

      // Brief settle so any tooltip/spinner from navigation has cleared.
      await firstPage.waitForTimeout(800);
      await captureDocsScreenshot(firstPage, '200_00_cubes-left-menu-dp.png');

      // ── CAPTURE 2: Create-Cube modal with name + description + connection ────
      // This is the FIRST moment the user sees the empty cube editor — the
      // best place to highlight the "Hey AI, Help Me..." button and reassure
      // them they don't need to write the cube DSL by hand.
      await ft
        .click('#btnCreateCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText('Orders Overview')
        .click('#cubeDescription')
        .typeText('Customer orders with revenue analysis');
      // Pick the connection we created in SETUP — uses the native HTML <select>,
      // so Playwright's selectOption is the right tool (FluentTester doesn't
      // wrap selectOption).
      await firstPage.selectOption('#cubeConnectionId', connectionCode);
      await firstPage.waitForTimeout(500);
      // Ring the "Hey AI, Help Me..." button. It sits flush against the modal's
      // left edge and the adjacent "Expand Code Editor" button, so an OUTSIDE
      // ring gets clipped/overpainted — the INSET ring is painted just inside the
      // button's edges instead, so all four sides stay visible (same approach as
      // the 200_15 capture below).
      await captureDocsScreenshotWithHighlights(
        firstPage,
        '200_10_cube-create-modal-dp.png',
        [{ selector: '#btnAiHelpCubeDsl', inset: true }],
      );

      // ── CAPTURE 3: same modal, DSL pasted in → preview tree renders ──────────
      // The DSL produces 7 dimensions: order_id (PK), status, created_at, then
      // joined-table dimensions customer_name, country, region, city.
      // Before capturing, we highlight the "Hey AI, Help Me ..." button and add
      // a reassurance callout — the docs reader sees the cube DSL code and
      // could freak out thinking they need to write Groovy by hand. The
      // highlight + label make it instantly clear that the AI drafts the cube
      // for them. Box + label removed after the capture so they don't leak
      // into 200_20.
      await ft
        .setCodeJarContentSingleShot('#cubeDslEditor', SAMPLE_CUBE_DSL)
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        .waitOnElementToBecomeVisible('#dim-order_id')
        .waitOnElementToBecomeVisible('#dim-status')
        .waitOnElementToBecomeVisible('#dim-customer_name')
        .waitOnElementToBecomeVisible('#dim-country');
      await firstPage.waitForTimeout(800);

      // Ring the "Hey AI, Help Me..." button. It sits flush against the adjacent
      // "Expand Code Editor" button and the modal footer, so an OUTSIDE ring gets
      // overpainted on those two sides. The INSET ring is painted just inside the
      // button's edges instead, so all four sides are always fully visible (the
      // same trick the connections docs use for flush-against-boundary targets).
      await captureDocsScreenshotWithHighlights(
        firstPage,
        '200_15_cube-dsl-editor-dp.png',
        [{ selector: '#btnAiHelpCubeDsl', inset: true }],
      );

      // ── CAPTURE 4: same modal — tick 4 fields, click Show SQL, REPOSITION ────
      // Replicates the exact selection from the manual 200_20:
      //   ✓ Order ID, ✓ Order Status, ☐ Created At
      //   ✓ Customer (customers.company_name), ✓ Country (customers.country)
      //   ☐ Region, ☐ City
      // After the SQL popup appears we drag it to the bottom-left of the cube
      // modal so the reader sees BOTH the ticked fields (right side) AND the
      // generated SQL (bottom-left) AND the "Show SQL" button (right side
      // bottom) in the same screenshot — making the cause/effect explicit.
      await ft
        .click('#chk-dim-order_id')
        .click('#chk-dim-status')
        .click('#chk-dim-customer_name')
        .click('#chk-dim-country')
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult');

      // Reposition the SQL popup's .modal-dialog to the bottom-left and dim
      // its backdrop so the underlying cube modal stays bright. Pure DOM
      // manipulation — no post-processing needed.
      await firstPage.evaluate(() => {
        const sqlPre = document.getElementById('cubeSqlResult');
        const dialog = sqlPre?.closest('.modal-dialog') as HTMLElement | null;
        if (dialog) {
          dialog.setAttribute('style', `
            position: fixed !important;
            left: 30px !important;
            bottom: 40px !important;
            top: auto !important;
            margin: 0 !important;
            width: 600px !important;
            max-width: 600px !important;
            z-index: 1060 !important;
          `);
        }
        // Find the backdrop with the highest z-index (the SQL popup's, at 1055)
        // and fade it so the cube modal beneath remains readable.
        const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
        const sqlBackdrop = backdrops
          .map((b) => ({ el: b as HTMLElement, z: parseInt(getComputedStyle(b as HTMLElement).zIndex || '0', 10) }))
          .sort((a, b) => b.z - a.z)[0];
        if (sqlBackdrop) {
          sqlBackdrop.el.style.opacity = '0';
        }
      });
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, '200_20_cube-renderer-preview.png');

      // Tidy: close the SQL popup FIRST (its modal-backdrop intercepts clicks
      // on the underlying cube modal's Close button), then close the cube modal.
      // No draft is saved. Mirrors the teardown in cubes-definitions.spec.ts §4.3.
      await ft
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        .click('#btnCloseCubeModal');

      console.log('[DONE] All Cubes screenshots captured.');
      return ft;
    } finally {
      // ── CLEANUP — delete the connection we created in SETUP ─────────────────
      try {
        const connFilePattern = `${connectionCode}\\.xml`;
        console.log(`[CLEANUP] Deleting connection ${connFilePattern}`);
        await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          new FluentTester(firstPage), connFilePattern, DB_VENDOR,
        );
      } catch (e) { console.error('Failed to delete connection:', e); }
    }
  },
);

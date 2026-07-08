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
//   "Database Connections — docs screenshots for database-connections.mdx"
//     Thirteen `-dp.png` shots of the Connection Details modal tabs (one of which,
//     the filled Connection Details tab, also feeds dashboards.mdx). The `-dp`
//     suffix differentiates these automated captures from the existing manual
//     042_* images (e.g. 042_00_ai-driven-db-conn-new-dp.png). See the block
//     below for the per-shot mapping and the known caveats (native <select>,
//     kroki.io network dependency, Electron new-page limits).
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
import { captureDocsScreenshot, captureDocsScreenshotWithHighlights, captureDocsScreenshotOfElement } from '../../../utils/docs-screenshot-helper';

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
// BLOCK 1 — Database Connections: database-connections.mdx (042_*-dp.png) — tabs left→right
// ─────────────────────────────────────────────────────────────────────────────
//
// Captures the eleven Connection Details modal shots referenced from
// database-connections.mdx. Each PNG is written with the SAME name as the
// existing manual image plus a `-dp` suffix, into the SAME docs folder, so the
// automated capture sits next to the original (042_00_..-new.png alongside
// 042_00_..-new-dp.png) for easy side-by-side comparison / swap.
//
// The flows are ported verbatim from the proven headless flows in
// connections.spec.ts (Database Schema / Domain-Grouped Schema / ER Diagram /
// Ubiquitous Language tabs). Crucially, the two "AI result" shots do NOT call a
// live AI provider — the "Generate with AI" buttons only build a copyable
// prompt, and the populated Domain-Grouped Schema + ER diagram are produced by
// pasting the pre-baked fixtures below (exactly as connections.spec.ts does).
//
// Shot → state mapping:
//   042_00_..-new-dp                  Create modal, DB-type list expanded (see note A)
//   042_00_..-details-dp              Connection Details tab, filled (no dialog) — dashboards.mdx
//   042_00_..-test-fetch-db-schema-dp "Test database connection?" confirm dialog
//   042_05_..-schema-dp               Database Schema tab, schema loaded
//   042_10_..-domain-grouped-schema-dp            DGS tab, empty state
//   042_10_..-domain-grouped-schema-ai-prompt-dp  DGS AI-prompt modal + "copied" dialog
//   042_15_..-domain-grouped-schema-dp            DGS result (fixture pasted)
//   042_18_..-er-diagram-dp           ER Diagram tab, empty state
//   042_20_..-ai-generate-er-diagram-dp           ER AI-prompt modal
//   042_25_..-er-diagram-dp           ER diagram rendered in-modal (see note B)
//   042_30_..-er-diagram-view-in-browser-dp       ER diagram full page (see note C)
//   042_35_..-ubiquitous-language-dp  Ubiquitous Language tab
//   042_40_..-chat2db-config-dp   Explore Data tab (toolsTab: Chat2DB / Data Canvas)
//
// Caveats:
//   A) #dbType is a native <select>; its real open popup is an OS overlay that
//      Playwright can't rasterize. To reproduce the open list "as native as
//      possible" we expand the REAL element inline (set `size` = option count)
//      and force the selected row to the native selection blue — this is the
//      genuine control, not hand-built HTML, so styling/fonts match exactly.
//   B) The rendered diagram is an <iframe src="https://kroki.io/...">. We wait
//      for the SVG inside the cross-origin frame to paint before capturing;
//      needs internet at capture time (blank iframe if offline).
//   C) "View In Browser" is an <a target="_blank" href="kroki.io/..."> that
//      opens externally. We try a fresh Playwright page on that URL; if the
//      Electron context forbids new pages we fall back to an element-scoped
//      capture of the in-modal iframe (diagram on white — same visual).
//
// ── FIXTURES ────────────────────────────────────────────────────────────────
// Pre-baked "AI outputs" so the docs shots never depend on a live provider.
// Structure copied from the proven connections.spec.ts flows (known to render);
// domain labels tuned to match the wording in database-connections.mdx.
const NORTHWIND_DGS_EXAMPLE = `{
  "originalSchema": [
    {
      "tableName": "Customers",
      "columns": [
        { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true },
        { "name": "CompanyName", "dataType": "NVARCHAR(40)" },
        { "name": "ContactName", "dataType": "NVARCHAR(30)" },
        { "name": "Country", "dataType": "NVARCHAR(15)" }
      ]
    },
    {
      "tableName": "Orders",
      "columns": [
        { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" },
        { "name": "OrderDate", "dataType": "DATETIME" },
        { "name": "ShipCountry", "dataType": "NVARCHAR(15)" }
      ]
    },
    {
      "tableName": "Order Details",
      "columns": [
        { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" },
        { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" },
        { "name": "UnitPrice", "dataType": "MONEY" },
        { "name": "Quantity", "dataType": "SMALLINT" }
      ]
    },
    {
      "tableName": "Products",
      "columns": [
        { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "ProductName", "dataType": "NVARCHAR(40)" },
        { "name": "SupplierID", "dataType": "INT", "isForeignKey": true, "references": "Suppliers" },
        { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" },
        { "name": "UnitPrice", "dataType": "MONEY" }
      ]
    },
    {
      "tableName": "Categories",
      "columns": [
        { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "CategoryName", "dataType": "NVARCHAR(15)" },
        { "name": "Description", "dataType": "NTEXT" }
      ]
    }
  ],
  "domainGroupedSchema": [
    {
      "label": "Customer Management",
      "children": [
        {
          "tableName": "Customers",
          "columns": [
            { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true },
            { "name": "CompanyName", "dataType": "NVARCHAR(40)" },
            { "name": "ContactName", "dataType": "NVARCHAR(30)" },
            { "name": "Country", "dataType": "NVARCHAR(15)" }
          ]
        }
      ]
    },
    {
      "label": "Sales & Fulfillment",
      "children": [
        {
          "tableName": "Orders",
          "columns": [
            { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" },
            { "name": "OrderDate", "dataType": "DATETIME" },
            { "name": "ShipCountry", "dataType": "NVARCHAR(15)" }
          ]
        },
        {
          "tableName": "Order Details",
          "columns": [
            { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" },
            { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" },
            { "name": "UnitPrice", "dataType": "MONEY" },
            { "name": "Quantity", "dataType": "SMALLINT" }
          ]
        }
      ]
    },
    {
      "label": "Product Catalog",
      "children": [
        {
          "tableName": "Products",
          "columns": [
            { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "ProductName", "dataType": "NVARCHAR(40)" },
            { "name": "SupplierID", "dataType": "INT", "isForeignKey": true, "references": "Suppliers" },
            { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" },
            { "name": "UnitPrice", "dataType": "MONEY" }
          ]
        },
        {
          "tableName": "Categories",
          "columns": [
            { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "CategoryName", "dataType": "NVARCHAR(15)" },
            { "name": "Description", "dataType": "NTEXT" }
          ]
        }
      ]
    }
  ]
}`;

const NORTHWIND_ER_DIAGRAM_PUML = `@startuml
entity "Categories" {
  +CategoryID : INTEGER
  CategoryName : VARCHAR
  Description : CLOB
  Picture : BLOB
}
entity "Customers" {
  +CustomerID : VARCHAR
  PostalCode : VARCHAR
  City : VARCHAR
  Country : VARCHAR
  Region : VARCHAR
  Phone : VARCHAR
  ContactName : VARCHAR
  ContactTitle : VARCHAR
  CompanyName : VARCHAR
  Address : VARCHAR
}
entity "Employees" {
  BirthDate : DATE
  +EmployeeID : INTEGER
  HireDate : DATE
  ReportsTo : INTEGER
  FirstName : VARCHAR
  LastName : VARCHAR
  Title : VARCHAR
}
entity "Order Details" {
  Discount : NUMERIC
  +OrderID : INTEGER
  +ProductID : INTEGER
  Quantity : SMALLINT
  UnitPrice : NUMERIC
}
entity "Orders" {
  EmployeeID : INTEGER
  Freight : NUMERIC
  +OrderID : INTEGER
  ShipVia : INTEGER
  CustomerID : VARCHAR
  OrderDate : TIMESTAMP
  ShippedDate : TIMESTAMP
  ShipCountry : VARCHAR
}
entity "Products" {
  CategoryID : INTEGER
  Discontinued : BOOLEAN
  +ProductID : INTEGER
  SupplierID : INTEGER
  UnitPrice : NUMERIC
  UnitsInStock : SMALLINT
  ProductName : VARCHAR
}
entity "Shippers" {
  +ShipperID : INTEGER
  Phone : VARCHAR
  CompanyName : VARCHAR
}
entity "Suppliers" {
  +SupplierID : INTEGER
  Country : VARCHAR
  Phone : VARCHAR
  ContactName : VARCHAR
  CompanyName : VARCHAR
  Address : VARCHAR
}

Orders }o--|| Customers : "CustomerID"
Orders }o--|| Employees : "EmployeeID"
Orders }o--|| Shippers : "ShipVia"
"Order Details" }|--|| Orders : "OrderID"
"Order Details" }|--|| Products : "ProductID"
Products }o--|| Categories : "CategoryID"
Products }o--|| Suppliers : "SupplierID"
Employees }o--|| Employees : "ReportsTo"
@enduml`;

electronBeforeAfterAllTest(
  'Connections — docs screenshots — Database Connections (database-connections.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // SQLite: file-based, no Docker, and the modal tabs are vendor-agnostic —
    // the Connection Details / Schema / DGS / ER / Ubiquitous UI looks the same
    // regardless of the underlying DB. Northwind DB matches the doc's wording.
    const CONNECTION_NAME = 'Northwind DB';
    const connectionCode = `db-${_.kebabCase(CONNECTION_NAME)}-${DB_VENDOR}`;
    const connFileSel = `#${connectionCode}\\.xml`;

    let connectionCreated = false;

    try {
      // ── SETUP: open the New Database Connection modal ───────────────────────
      // Fields default to the Oracle/server layout on open — capture 042_00 at
      // this default (matches the manual image) BEFORE switching to sqlite.
      console.log(`[SETUP] Opening New Database Connection modal for "${CONNECTION_NAME}"`);
      await new FluentTester(firstPage)
        .gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText(CONNECTION_NAME);

      // ── CAPTURE 042_00: Create modal with the DB-type list expanded ─────────
      // Show the REAL <select> expanded as a native listbox, KEEPING daisyUI's
      // `.select` class so the popup inherits the app's (dark) theme instead of
      // the OS's white listbox. daisyUI pins a fixed height + `appearance:none`
      // that clips a size-expanded listbox to ~1 row — override exactly those
      // two (appearance:auto + height:auto) via an injected #dbType rule, float
      // it over the fields below (absolute), paint the options with the theme
      // tokens and the selected row native-blue. Only the injected <style> and
      // the `size` attribute are touched; both are reverted after the shot.
      await firstPage.evaluate(() => {
        const sel = document.getElementById('dbType') as HTMLSelectElement | null;
        if (!sel) return;
        const width = Math.round(sel.getBoundingClientRect().width);
        sel.dataset.prevSize = String(sel.size ?? 0);
        sel.size = sel.options.length;            // expand every option inline
        const style = document.createElement('style');
        style.id = '__dbtype_open_hl';
        style.textContent =
          // Defeat the daisyUI clip + float it over the fields below, popup-style.
          '#dbType{' +
            'appearance:auto !important;-webkit-appearance:auto !important;' +
            'height:auto !important;min-height:0 !important;max-height:none !important;' +
            'overflow:visible !important;background-image:none !important;' +
            'position:absolute !important;z-index:50 !important;' +
            'width:' + width + 'px !important;' +
            'box-shadow:0 10px 26px rgba(0,0,0,0.6) !important;' +
          '}' +
          // Options follow the app theme (dark now) so the popup matches the
          // modal; selected row uses the native listbox selection blue.
          '#dbType option{background-color:var(--color-base-100,#1d232a);' +
            'color:var(--color-base-content,#a6adbb);padding:3px 10px}' +
          '#dbType option:checked{background:#0f6cbd !important;color:#fff !important}';
        document.head.appendChild(style);
      });
      await firstPage.waitForTimeout(250);
      await captureDocsScreenshot(firstPage, '042_00_ai-driven-db-conn-new-dp.png');
      await firstPage.evaluate(() => {
        const sel = document.getElementById('dbType') as HTMLSelectElement | null;
        if (sel) {
          sel.size = Number(sel.dataset.prevSize ?? '0') || 0;
          delete sel.dataset.prevSize;
        }
        document.getElementById('__dbtype_open_hl')?.remove();
      });
      console.log('[capture] 042_00_ai-driven-db-conn-new-dp.png');

      // ── Switch to sqlite + pick the bundled Northwind sample file ───────────
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dbType', DB_VENDOR)
        .waitOnElementToBecomeEnabled('#btnBrowseSqliteFile')
        .click('#btnBrowseSqliteFile')
        .waitOnElementToBecomeEnabled('#childDirLinksample-northwind-sqlite')
        .click('#childDirLinksample-northwind-sqlite')
        .waitOnElementToBecomeVisible('#tdFileNamenorthwind\\.db')
        .click('#tdFileNamenorthwind\\.db')
        .waitOnElementToBecomeEnabled('#btnSelectFileExplorer')
        .click('#btnSelectFileExplorer')
        .waitOnElementToBecomeInvisible('#btnSelectFileExplorer')
        .waitOnInputValueToContainText('#dbName', '/db/sample-northwind-sqlite/northwind.db')
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
        .click('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(connFileSel);
      connectionCreated = true;

      // ── Reopen in Edit mode (all remaining shots show "Update ...") ──────────
      await new FluentTester(firstPage)
        .clickAndSelectTableRow(connFileSel)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .inputShouldHaveValue('#dbConnectionName', CONNECTION_NAME);

      // Hide transient toasts so they don't leak into any shot.
      await firstPage.evaluate(() => {
        if (document.getElementById('__hide_toasts_for_screenshots')) return;
        const style = document.createElement('style');
        style.id = '__hide_toasts_for_screenshots';
        style.textContent = `.toast { display: none !important; }`;
        document.head.appendChild(style);
      });

      // ── CAPTURE 042_00 (details): filled Connection Details tab, no dialog ───
      // The Northwind SQLite connection filled in, Connection Details tab active,
      // toasts hidden, no dialog — the "configure your database connection" shot
      // dashboards.mdx (Approach 2, Step 1) uses. Taken BEFORE the Test-connection
      // dialog pops so the big "Test Connection & Fetch Database Schema" button
      // stays fully visible.
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_00_ai-driven-db-conn-details-dp.png');
      console.log('[capture] 042_00_ai-driven-db-conn-details-dp.png');

      // ── CAPTURE 042_00 (test-fetch): "Test database connection?" dialog ─────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible();
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_00_ai-driven-db-conn-test-fetch-db-schema-dp.png');
      console.log('[capture] 042_00_ai-driven-db-conn-test-fetch-db-schema-dp.png');

      // Confirm the test → schema fetch. File-based resolves fast; the button
      // re-enabling is the reliable "done" signal.
      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeEnabled('#btnTestDbConnection', Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      // ── CAPTURE 042_05: Database Schema tab, schema loaded ──────────────────
      await new FluentTester(firstPage)
        .click('#tab-btn-databaseSchemaTab')
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
      await firstPage.waitForTimeout(600);

      // Expand one table so its columns show beneath it (per the manual image).
      // Match the "Categories" row by its visible label in the source panel and
      // only click its toggle when collapsed.
      try {
        // tree-node emits #treenode-toggle-<slug> per node (see nodeSlug()).
        const tableToggle = firstPage.locator('#treenode-toggle-Categories');
        await tableToggle.waitFor({ state: 'visible', timeout: 5_000 });
        if ((await tableToggle.getAttribute('aria-expanded')) === 'false') {
          await tableToggle.click();
          await firstPage.waitForTimeout(300);
        }
      } catch (e) {
        console.warn('[042_05] could not expand table "Categories":', e);
      }
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_05_ai-driven-db-conn-schema-dp.png');
      console.log('[capture] 042_05_ai-driven-db-conn-schema-dp.png');

      // ── CAPTURE 042_10: Domain-Grouped Schema tab, empty state ──────────────
      await new FluentTester(firstPage)
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeVisible('#noDomainGroupedSchemaAvailable')
        .waitOnElementToBecomeEnabled('#btnGenerateWithAIDomainGroupedSchema');
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, '042_10_ai-driven-db-conn-ai-generate-domain-grouped-schema-dp.png');
      console.log('[capture] 042_10_ai-driven-db-conn-ai-generate-domain-grouped-schema-dp.png');

      // ── CAPTURE 042_10 (ai-prompt): AI-prompt modal + "copied" dialog ───────
      // "Generate with AI" only builds a copyable prompt — no provider needed.
      await new FluentTester(firstPage)
        .click('#btnGenerateWithAIDomainGroupedSchema')
        .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeEnabled('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .click('#btnCopyPromptText')
        .waitOnConfirmDialogToBecomeVisible();
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_10_ai-driven-db-conn-ai-generate-domain-grouped-schema-ai-prompt-dp.png');
      console.log('[capture] 042_10_ai-driven-db-conn-ai-generate-domain-grouped-schema-ai-prompt-dp.png');
      // The "Prompt copied to clipboard!" popup is a dburst-info-dialog (OK-only),
      // NOT a confirm dialog — its OK button carries #btnInfoDialogOK (and still
      // the shared .dburst-button-question-confirm class the proven specs click).
      await new FluentTester(firstPage)
        .click('#btnInfoDialogOK')
        .waitOnConfirmDialogToBecomeInvisible()
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // ── CAPTURE 042_15: DGS result (fixture pasted → picklist renders) ──────
      await new FluentTester(firstPage)
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
        .waitOnElementToBecomeEnabled('#domainGroupedCodeEditor')
        .setCodeJarContentSingleShot('#domainGroupedCodeEditor', NORTHWIND_DGS_EXAMPLE)
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeInvisible('#domainGroupedCodeEditor')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist');
      await firstPage.waitForTimeout(600);

      // Expand two domains so the shot reveals the tables grouped under them
      // (matches the manual image, which shows the domains opened, not just their
      // labels). The domains render in the picklist's SOURCE panel; match each
      // row by its visible label (avoids depending on the node-key/`&`-escaping)
      // and click its tree toggle only when it's currently collapsed.
      for (const domain of ['Sales & Fulfillment', 'Product Catalog']) {
        // tree-node emits #treenode-toggle-<slug>; slug mirrors nodeSlug() in
        // tree-node.component.ts (non-alphanumerics -> '-', trimmed).
        const slug = domain.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        try {
          const toggle = firstPage.locator(`#treenode-toggle-${slug}`);
          await toggle.waitFor({ state: 'visible', timeout: 5_000 });
          if ((await toggle.getAttribute('aria-expanded')) === 'false') {
            await toggle.click();
            await firstPage.waitForTimeout(250);
          }
        } catch (e) {
          console.warn(`[042_15] could not expand domain "${domain}":`, e);
        }
      }
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_15_ai-driven-db-conn-domain-grouped-schema-dp.png');
      console.log('[capture] 042_15_ai-driven-db-conn-domain-grouped-schema-dp.png');

      // ── CAPTURE 042_18: ER Diagram tab, empty state ─────────────────────────
      await new FluentTester(firstPage)
        .click('#tab-btn-databaseDiagramTab')
        .waitOnElementToBecomeVisible('#noErDiagramAvailable')
        .waitOnElementToBecomeVisible('#btnGenerateWithAIErDiagram');
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, '042_18_ai-driven-db-conn-er-diagram-dp.png');
      console.log('[capture] 042_18_ai-driven-db-conn-er-diagram-dp.png');

      // ── CAPTURE 042_20: ER AI-prompt modal ──────────────────────────────────
      await new FluentTester(firstPage)
        .click('#btnGenerateWithAIErDiagram')
        .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeEnabled('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeVisible('#btnCopyPromptText');
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, '042_20_ai-driven-db-conn-ai-generate-er-diagram-dp.png');
      console.log('[capture] 042_20_ai-driven-db-conn-ai-generate-er-diagram-dp.png');
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // ── CAPTURE 042_25: ER diagram rendered in-modal (kroki iframe) ─────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#btnDatabaseDiagramShowCode')
        .waitOnElementToBecomeEnabled('#btnDatabaseDiagramShowCode')
        .click('#btnDatabaseDiagramShowCode')
        .waitOnElementToBecomeVisible('#plantUmlEditor')
        .waitOnElementToBecomeEnabled('#plantUmlEditor')
        .setCodeJarContentSingleShot('#plantUmlEditor', NORTHWIND_ER_DIAGRAM_PUML)
        .click('#btnDatabaseDiagramViewDiagram')
        .waitOnElementToBecomeInvisible('#plantUmlEditor')
        .waitOnElementToBecomeVisible('#plantUmlDiagram')
        .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewInBrowserLink');

      // The diagram is an <iframe src="https://kroki.io/..."> — wait for the SVG
      // inside the cross-origin frame to actually paint before capturing.
      try {
        await firstPage
          .frameLocator('#plantUmlDiagram')
          .locator('svg')
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await firstPage.waitForTimeout(800);
      } catch (e) {
        console.warn('[042_25] kroki iframe SVG not visible (offline?) — capturing as-is:', e);
      }
      await captureDocsScreenshot(firstPage, '042_25_ai-driven-db-conn-er-diagram-dp.png');
      console.log('[capture] 042_25_ai-driven-db-conn-er-diagram-dp.png');

      // ── CAPTURE 042_30: ER diagram "View In Browser" (external kroki page) ──
      // Preferred: open the kroki href in a fresh Playwright page. Electron
      // contexts often forbid newPage() — fall back to an element-scoped capture
      // of the in-modal iframe (diagram on white, same visual message).
      const krokiHref = await firstPage
        .locator('#btnDatabaseDiagramViewInBrowserLink')
        .getAttribute('href');
      try {
        if (!krokiHref) throw new Error('no href on #btnDatabaseDiagramViewInBrowserLink');
        const browserPage = await firstPage.context().newPage();
        try {
          await browserPage.goto(krokiHref, { waitUntil: 'load', timeout: 30_000 });
          await browserPage.locator('svg').first().waitFor({ state: 'visible', timeout: 30_000 });
          await browserPage.waitForTimeout(500);
          await captureDocsScreenshot(browserPage, '042_30_ai-driven-db-conn-er-diagram-view-in-browser-dp.png');
        } finally {
          await browserPage.close().catch(() => {});
        }
      } catch (e) {
        console.warn('[042_30] new-page path unavailable — element-capturing the in-modal iframe instead:', e);
        await captureDocsScreenshotOfElement(
          firstPage,
          '042_30_ai-driven-db-conn-er-diagram-view-in-browser-dp.png',
          '#plantUmlDiagram',
          { targetWidth: 520 },
        );
      }
      console.log('[capture] 042_30_ai-driven-db-conn-er-diagram-view-in-browser-dp.png');

      // ── CAPTURE 042_35: Ubiquitous Language tab (empty / intro state) ───────
      await new FluentTester(firstPage)
        .click('#tab-btn-databaseUbiquitousLanguageTab')
        .waitOnElementToBecomeVisible('#noUbiquitousLanguageContentInfo')
        .waitOnElementToBecomeVisible('#btnUbiquitousLanguageStartEditing');
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshot(firstPage, '042_35_ai-driven-db-conn-ubiquitous-language-dp.png');
      console.log('[capture] 042_35_ai-driven-db-conn-ubiquitous-language-dp.png');

      // ── CAPTURE 042_40: Explore Data tab (Chat2DB / Data Canvas launcher) ────
      // Tab 6, left-to-right. The toolsTab renders the apps-manager (Data Canvas
      // launcher) plus the Chat2DB label — from here users chat with their
      // database in plain English or build dashboards over the same data.
      await new FluentTester(firstPage)
        .click('#tab-btn-toolsTab')
        .waitOnElementToBecomeVisible('#exploreDataPanel');
      await firstPage.waitForTimeout(2000); // let the apps-manager render its card
      await captureDocsScreenshot(firstPage, '042_40_ai-driven-db-conn-chat2db-config-dp.png');
      console.log('[capture] 042_40_ai-driven-db-conn-chat2db-config-dp.png');

      console.log('[DONE] All Database Connections docs screenshots captured.');
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
// BLOCK 2 — Seed Data: large-scale.mdx (runs last — Seed Data is the rightmost tab)
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
        // w-full button — an outside ring's left/right bars would clip at the
        // container edges; inset keeps all four sides visible.
        { selector: '#btnAskAiSeed', inset: true },
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
// BLOCK 3 — (placeholder for future Connections-area docs targets)
// ─────────────────────────────────────────────────────────────────────────────
//
// Append another `electronBeforeAfterAllTest('Connections — docs screenshots —
// <name>', …)` block here, reusing the SETUP / CLEANUP pattern above so blocks
// remain independently runnable and don't share state.

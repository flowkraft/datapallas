// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Remotion video 0020-datapallas-learn2 ("The Path of the
//               DataPallas Apprentice")  (DataPallas UI, default theme)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures the "navigate to and start a DB starter pack" frames the video needs.
// The walkthrough is production-faithful — no shortcuts, no deep-links: we drive
// the exact clicks a real user makes.
//
//   Run DataPallas.exe                                  (firstPage — app is up)
//     → Explore Data & Build Dashboards tab             (#tab-btn-cmsWebPortalTab)
//       → ring the tab + the "Explore More Apps That Go Well Together with
//         DataPallas" button, capture                   ── 00-explore-data-other-apps.png
//       → click that button → Apps / Starter Packs area (/help/appsMenuSelected),
//         lands on the Apps tab                          (#tab-btn-appsTab)
//         → search "cloudbeaver"                         (#appSearch)
//           → ring the Apps tab title + the matched CloudBeaver app card so the
//             reader sees which tab it lives in, capture ── 00b-cloudbeaver-app.png
//         → DB Starter Packs tab                         (#tab-btn-starterPacksTab)
//           → search "PostgreSQL"                        (#packSearch)
//             → ring the tab title + the matched Northwind (PostgreSQL) pack
//               card, capture                            ── 01-db-starter-pack-northwind.png
//
// BLOCK 2 — the Connections AI workflow (vendor: postgres, connection "Northwind").
// A consecutive "story" the video walks through: spin up the postgres starter
// pack, create a connection, Test it so the schema is auto-discovered, then use
// the AI affordances to group the tables into business domains and draw an ER
// diagram, and finally show the CloudBeaver start/stop control. Mirrors the
// proven flow in e2e/specs/areas/connections.spec.ts — the AI steps don't call a
// real LLM: we ring the "Generate … with AI" button, then inject the result via
// the "Show Code" editor (exactly what the user does when pasting AI output back).
//
// NOTE — the Seed Data screenshots this story would otherwise also want
// (Connection Details ▸ Seed Data ▸ Example / My Script) are ALREADY captured by
// e2e/specs/screenshots/docs/connections.screens.ts:
//     045_80_seed-data-example-tab.png   (Example sub-tab + Invoice Seeder loaded)
//     045_82_seed-data-my-script.png     (My Script sub-tab with script pasted)
// so there is no need to re-take them here — reuse those PNGs in the video.
//
// CONSIDER CONSOLIDATING — this whole block is really a Connections-area concern,
// not a video-specific one. It (and the BLOCK 1 starter-pack flow above, which is
// also Connections-adjacent) would arguably live more cohesively alongside the
// Seed Data captures in connections.screens.ts, with the video simply referencing
// the resulting PNGs. Left here for now because the output targets the video's
// asset folder; revisit if a single Connections screenshot home is preferred.
//
//   db-conn-01-connection-details.png   Connection Details filled, Test ringed
//   db-conn-02-schema-discovered.png    Database Schema tab — auto-discovered tables
//   db-conn-03-domain-grouped-ai-cta.png  Domain-Grouped empty, "Generate … with AI Help" ringed
//   db-conn-04-domain-grouped-result.png  tables grouped into business domains
//   db-conn-05-er-diagram-ai-cta.png    ER Diagram empty, "Generate with AI" ringed
//   db-conn-06-er-diagram-result.png    rendered ER diagram
//   db-conn-07-cloudbeaver.png          CloudBeaver start/stop control ringed (modal footer)
//
// Output dir: VIDEO_ASSETS_DIR — the Remotion project's static-asset folder for
// this video (…/cli-remotion/public/assets/rb/0020-datapallas-learn2/). The
// video reads them via `staticFile("assets/rb/0020-datapallas-learn2/<file>")`
// (see SCREEN_INSERTS in that video's index.tsx, the `pendingFile` slots).
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # set E2E_GREP="DataPallas Learn2" in custom:start-server-and-e2e-electron-screens-grep
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── OUTPUT DIR ──────────────────────────────────────────────────────────────
// Derived from DOCS_IMAGES_DIR (…/reportburster.com/public/images/docs) so we
// don't re-count `..` hops: up 4 levels to `…/www`, then sideways into the
// Remotion project's static-asset folder for this video.
const VIDEO_ASSETS_DIR = path.resolve(
  DOCS_IMAGES_DIR,
  '..', '..', '..', '..',
  'cli-remotion', 'public', 'assets', 'rb', '0020-datapallas-learn2',
);

// The PostgreSQL Northwind starter pack (starter-packs.service.ts):
//   id 'db-northwind-postgres' → card #starterPack_db-northwind-postgres,
//   displayName "Northwind DB (PostgreSQL)". PostgreSQL is the engine we promote
//   for learning, so the starter-pack screenshot showcases it.
const POSTGRES_PACK_ID = 'db-northwind-postgres';
const POSTGRES_PACK_CARD = `#starterPack_${POSTGRES_PACK_ID}`;

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK — Navigate to and find the SQL Server DB starter pack
// ─────────────────────────────────────────────────────────────────────────────
electronBeforeAfterAllTest(
  'DataPallas Learn2 — DB starter pack navigation',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);

    // ── 00 — Explore Data & Build Dashboards: ring the tab + the "Explore More
    // Apps That Go Well Together with DataPallas" button (the door to the
    // Apps / Starter Packs area). Land on the burst screen first so the
    // Explore Data tab is in the DOM, then open it.
    await ft
      .gotoBurstScreen()
      .click('#tab-btn-cmsWebPortalTab')
      .waitOnElementToBecomeVisible('#btnExploreCmsWebPortalApps');
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      '00-explore-data-other-apps.png',
      [
        { selector: '#tab-btn-cmsWebPortalTab', inset: true }, // tab flush under the sticky header → inset ring
        '#btnExploreCmsWebPortalApps',
      ],
      VIDEO_ASSETS_DIR,
    );

    // ── Press the button → Apps / Starter Packs area. The production route
    // (/help/appsMenuSelected) lands on the Apps tab, whose search box mounting
    // confirms the tab is active.
    await ft
      .click('#btnExploreCmsWebPortalApps')
      .waitOnElementToBecomeVisible('#appSearch');

    // ── 00b — Apps tab: search "cloudbeaver" and ring the Apps tab title so the
    // reader sees WHICH tab CloudBeaver lives in. The search box debounces
    // 300ms; settle a touch longer, then confirm the CloudBeaver app card
    // surfaced (id 'cloudbeaver' → #appName_cloudbeaver / #appPanel_cloudbeaver).
    await ft
      .setValue('#appSearch', 'cloudbeaver')
      .sleep(600)
      .waitOnElementToBecomeVisible('#appName_cloudbeaver');

    // ASSERT the "meat": the matched card is really the CloudBeaver app.
    await ft.elementShouldContainText('#appName_cloudbeaver', 'CloudBeaver');

    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      '00b-cloudbeaver-app.png',
      [
        '#tab-btn-appsTab', // Help-area tab: outer ring (the active tab's fill hides an inset ring); has headroom above so the outer ring isn't clipped
        '#appSearch',
        { selector: '#appPanel_cloudbeaver', inset: true }, // full-width card → outer ring's left/right verticals get clipped; inset keeps all four sides visible
      ],
      VIDEO_ASSETS_DIR,
    );

    // ── DB Starter Packs tab — switch to it and wait for its search box to
    // confirm the pack list is mounted.
    await ft
      .click('#tab-btn-starterPacksTab')
      .waitOnElementToBecomeVisible('#packSearch');

    // ── Search "PostgreSQL" — displayName "Northwind DB (PostgreSQL)" matches,
    // and it's the only pack that does, so the list narrows to the single
    // Northwind (PostgreSQL) card. The search box debounces 300ms; settle a
    // touch longer before reading the filtered list.
    await ft
      .setValue('#packSearch', 'PostgreSQL')
      .sleep(600)
      .waitOnElementToBecomeVisible(POSTGRES_PACK_CARD);

    // ASSERT the "meat": the matched card is really the PostgreSQL pack.
    await ft.elementShouldContainText(POSTGRES_PACK_CARD, 'PostgreSQL');

    // ── 01 — ring the Starter Packs tab title + the search box + the matched
    // PostgreSQL pack card (Start button included so the reader sees where they
    // spin it up), capture.
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      '01-db-starter-pack-northwind.png',
      [
        '#tab-btn-starterPacksTab', // Help-area tab: outer ring (the active tab's fill hides an inset ring); has headroom above so the outer ring isn't clipped
        '#packSearch',
        { selector: POSTGRES_PACK_CARD, inset: true }, // card's left edge sits against the content-panel boundary → outer ring's left vertical clips; inset keeps all four sides visible
      ],
      VIDEO_ASSETS_DIR,
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — Connections AI workflow (postgres + Northwind)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The AI steps mirror e2e/specs/areas/connections.spec.ts: no real LLM is
// called — we ring the "Generate … with AI" button, then inject the result
// through the "Show Code" editor (the same thing a user does when pasting AI
// output back). Postgres is server-based, so the postgres starter pack is
// started for the test and stopped + docker-composed-down in `finally`.

const DB_VENDOR = 'postgres';
const CONNECTION_NAME = 'Northwind';
const CONNECTION_CODE = `db-${_.kebabCase(CONNECTION_NAME)}-${DB_VENDOR}`;

// Domain-Grouped Schema the "AI" produces — three business domains over the
// Northwind tables. Pasted into #domainGroupedCodeEditor (postgres keeps the
// space in "Order Details"). Trimmed copy of the fixture in connections.spec.ts.
const NORTHWIND_DGS_JSON = `{
  "originalSchema": [
    { "tableName": "Customers", "columns": [ { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true }, { "name": "CompanyName", "dataType": "NVARCHAR(40)" }, { "name": "Country", "dataType": "NVARCHAR(15)" } ] },
    { "tableName": "Orders", "columns": [ { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true }, { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" }, { "name": "OrderDate", "dataType": "DATETIME" } ] },
    { "tableName": "Order Details", "columns": [ { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" }, { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" }, { "name": "Quantity", "dataType": "SMALLINT" } ] },
    { "tableName": "Products", "columns": [ { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true }, { "name": "ProductName", "dataType": "NVARCHAR(40)" }, { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" } ] },
    { "tableName": "Categories", "columns": [ { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true }, { "name": "CategoryName", "dataType": "NVARCHAR(15)" } ] }
  ],
  "domainGroupedSchema": [
    { "label": "Customer Management", "children": [ { "tableName": "Customers", "columns": [ { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true }, { "name": "CompanyName", "dataType": "NVARCHAR(40)" }, { "name": "Country", "dataType": "NVARCHAR(15)" } ] } ] },
    { "label": "Sales & Orders", "children": [ { "tableName": "Orders", "columns": [ { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true }, { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" }, { "name": "OrderDate", "dataType": "DATETIME" } ] }, { "tableName": "Order Details", "columns": [ { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" }, { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" }, { "name": "Quantity", "dataType": "SMALLINT" } ] } ] },
    { "label": "Product Catalog", "children": [ { "tableName": "Products", "columns": [ { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true }, { "name": "ProductName", "dataType": "NVARCHAR(40)" }, { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" } ] }, { "tableName": "Categories", "columns": [ { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true }, { "name": "CategoryName", "dataType": "NVARCHAR(15)" } ] } ] }
  ]
}`;

// ER diagram the "AI" produces — full Northwind PlantUML (Crow's Foot). Pasted
// into #plantUmlEditor, then rendered via kroki into #plantUmlDiagram. Copied
// from the proven fixture in connections.spec.ts.
const NORTHWIND_ER_PUML = `@startuml
entity "Categories" {
  +CategoryID : INTEGER
  CategoryName : VARCHAR
  Description : CLOB
}
entity "CustomerCustomerDemo" {
  +CustomerID : VARCHAR
  +CustomerTypeID : VARCHAR
}
entity "CustomerDemographics" {
  +CustomerTypeID : VARCHAR
  CustomerDesc : CLOB
}
entity "Customers" {
  +CustomerID : VARCHAR
  CompanyName : VARCHAR
  ContactName : VARCHAR
  Country : VARCHAR
  City : VARCHAR
}
entity "Employees" {
  +EmployeeID : INTEGER
  LastName : VARCHAR
  FirstName : VARCHAR
  Title : VARCHAR
  ReportsTo : INTEGER
}
entity "Order Details" {
  +OrderID : INTEGER
  +ProductID : INTEGER
  UnitPrice : NUMERIC
  Quantity : SMALLINT
  Discount : NUMERIC
}
entity "Orders" {
  +OrderID : INTEGER
  CustomerID : VARCHAR
  EmployeeID : INTEGER
  OrderDate : TIMESTAMP
  ShipVia : INTEGER
  ShipCountry : VARCHAR
}
entity "Products" {
  +ProductID : INTEGER
  ProductName : VARCHAR
  SupplierID : INTEGER
  CategoryID : INTEGER
  UnitPrice : NUMERIC
}
entity "Shippers" {
  +ShipperID : INTEGER
  CompanyName : VARCHAR
  Phone : VARCHAR
}
entity "Suppliers" {
  +SupplierID : INTEGER
  CompanyName : VARCHAR
  Country : VARCHAR
}

Orders }o--|| Customers : "CustomerID"
Orders }o--|| Employees : "EmployeeID"
Orders }o--|| Shippers : "ShipVia"
"Order Details" }|--|| Orders : "OrderID"
"Order Details" }|--|| Products : "ProductID"
Products }o--|| Categories : "CategoryID"
Products }o--|| Suppliers : "SupplierID"
Employees }o--|| Employees : "ReportsTo"
CustomerCustomerDemo }|--|| Customers : "CustomerID"
CustomerCustomerDemo }|--|| CustomerDemographics : "CustomerTypeID"
@enduml`;

electronBeforeAfterAllTest(
  'DataPallas Learn2 — Connections AI workflow (postgres)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let ft = new FluentTester(firstPage);

    try {
      // ── SETUP: postgres is server-based → start its Northwind starter pack so
      // Test Connection actually reaches a live database.
      ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, DB_VENDOR, 'start');

      // ── Open New Database Connection and fill "Northwind"/postgres details
      // (modal stays open, not yet saved — exactly the connections.spec flow).
      await ft
        .gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName');
      ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(ft, CONNECTION_NAME, DB_VENDOR);
      await ft.waitOnElementToBecomeEnabled('#btnTestDbConnection');
      await hideToastsForScreenshots(firstPage);

      // ── db-conn-01 — Connection Details filled, ring the Test Connection CTA.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-01-connection-details.png',
        // w-full button → inset so all four ring sides survive the container edges
        [{ selector: '#btnTestDbConnection', inset: true }],
        VIDEO_ASSETS_DIR,
      );

      // ── Test Connection → schema auto-discovery. Server-vendor dance mirrors
      // connections.spec.ts: first click pops the info dialog + clear-logs step,
      // a second click then asks to save, which runs the test.
      await ft
        .click('#btnTestDbConnection')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogsDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestDbConnection')
        .waitOnElementToContainText(
          '#confirmDialog .modal-box',
          'The connection must be saved before being able to test it. Save now?',
        )
        .clickYesDoThis()
        .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
        .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');

      // ── db-conn-02 — Database Schema tab: the tables DataPallas auto-discovered.
      await ft
        .click('#tab-btn-databaseSchemaTab')
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-02-schema-discovered.png',
        [{ selector: '#tab-btn-databaseSchemaTab', inset: true }],
        VIDEO_ASSETS_DIR,
      );

      // ── db-conn-03 — Domain-Grouped Schema empty state: ring the tab + the
      // "Generate Domain Schema with AI Help" CTA.
      await ft
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeVisible('#noDomainGroupedSchemaAvailable')
        .waitOnElementToBecomeEnabled('#btnGenerateWithAIDomainGroupedSchema');
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-03-domain-grouped-ai-cta.png',
        [
          { selector: '#tab-btn-domainGroupedDatabaseSchemaTab', inset: true },
          // w-full CTA → inset so all four ring sides survive the container edges
          { selector: '#btnGenerateWithAIDomainGroupedSchema', inset: true },
        ],
        VIDEO_ASSETS_DIR,
      );

      // ── Inject the AI result via "Show Code", then toggle back to the picklist.
      await ft
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
        .waitOnElementToBecomeEnabled('#domainGroupedCodeEditor')
        .setCodeJarContentSingleShot('#domainGroupedCodeEditor', NORTHWIND_DGS_JSON)
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeInvisible('#domainGroupedCodeEditor')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist');

      // Expand each business-domain group so its tables are visible — the whole
      // point of this screen. Target each domain by its STABLE node id (keys are
      // auto-generated as `domain_<label, spaces→underscores>`, then lowercased by
      // the tree-node host id getter) and click its toggler. We use [id="…"] not
      // "#id" because "Sales & Orders" produces an "&" in the id, which a CSS
      // "#id" selector can't match. After each toggle we wait on a known child
      // table row so a failed expand fails LOUDLY (no silent catch).
      const domainsToExpand: { id: string; childTable: string }[] = [
        {
          id: 'treeNodedomain_customer_managementsourceTreedomainGroupedSchemaPicklist',
          childTable: 'Customers',
        },
        {
          id: 'treeNodedomain_sales_&_orderssourceTreedomainGroupedSchemaPicklist',
          childTable: 'Orders',
        },
        {
          id: 'treeNodedomain_product_catalogsourceTreedomainGroupedSchemaPicklist',
          childTable: 'Products',
        },
      ];
      for (const { id, childTable } of domainsToExpand) {
        await firstPage
          .locator(`[id="${id}"] .p-tree-node-toggle-button`)
          .first()
          .click();
        await firstPage
          .locator(
            `[id="treeNode${childTable.toLowerCase()}sourceTreedomainGroupedSchemaPicklist"]`,
          )
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
      }
      await firstPage.waitForTimeout(300);

      // ── db-conn-04 — tables now grouped into business domains.
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-04-domain-grouped-result.png',
        [{ selector: '#tab-btn-domainGroupedDatabaseSchemaTab', inset: true }],
        VIDEO_ASSETS_DIR,
      );

      // ── db-conn-05 — ER Diagram empty state: ring the tab + the "Generate with
      // AI" CTA.
      await ft
        .click('#tab-btn-databaseDiagramTab')
        .waitOnElementToBecomeVisible('#noErDiagramAvailable')
        .waitOnElementToBecomeVisible('#btnGenerateWithAIErDiagram');
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-05-er-diagram-ai-cta.png',
        [
          { selector: '#tab-btn-databaseDiagramTab', inset: true },
          // w-full CTA → inset so all four ring sides survive the container edges
          { selector: '#btnGenerateWithAIErDiagram', inset: true },
        ],
        VIDEO_ASSETS_DIR,
      );

      // ── Inject the AI PlantUML via "Show Code", then render the diagram.
      // #plantUmlDiagram is a kroki.io iframe, so give the SVG time to load
      // before capturing.
      await ft
        .click('#btnDatabaseDiagramShowCode')
        .waitOnElementToBecomeVisible('#plantUmlEditor')
        .waitOnElementToBecomeEnabled('#plantUmlEditor')
        .setCodeJarContentSingleShot('#plantUmlEditor', NORTHWIND_ER_PUML)
        .click('#btnDatabaseDiagramViewDiagram')
        .waitOnElementToBecomeInvisible('#plantUmlEditor')
        .waitOnElementToBecomeVisible('#plantUmlDiagram')
        .sleep(5000); // kroki.io renders the SVG into the iframe — let it paint before capture

      // ── db-conn-06 — the rendered ER diagram.
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshot(firstPage, 'db-conn-06-er-diagram-result.png', VIDEO_ASSETS_DIR);

      // ── db-conn-07 — the CloudBeaver start/stop control in the modal footer
      // (<dburst-apps-manager [inputAppsToShow]="['cloudbeaver','vscode']">). Its
      // toggle shows "CloudBeaver (Database Manager) <state> ▲" and opens the
      // start/stop menu.
      await ft.waitOnElementToBecomeVisible('#appsManagerDropdownToggle');
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'db-conn-07-cloudbeaver.png',
        ['#appsManagerDropdownToggle'],
        VIDEO_ASSETS_DIR,
      );

      // No graceful UI stop here on purpose: it would mean navigating the top
      // menu away from the still-open connection modal, which races/closes the
      // Electron renderer (page-closed errors during teardown). The nuclear
      // `docker compose down -v` in `finally` tears postgres down reliably
      // instead — see below.
    } finally {
      // ── CLEANUP: close the modal, delete the connection, stop the pack, and
      // nuke the container so the next run starts clean.
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

      try {
        await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          new FluentTester(firstPage),
          `${CONNECTION_CODE}\\.xml`,
          DB_VENDOR,
        );
      } catch (e) {
        console.error('[CLEANUP] Failed to delete connection:', e);
      }

      // ── NUCLEAR STOP — runs no matter what (happy path OR any exception above).
      // `docker compose down -v` in the db/ folder force-stops and removes the
      // postgres container + volumes, so postgres can NEVER be left running after
      // this spec. Same guaranteed teardown the connections.spec.ts finally uses
      // for server-based vendors. Synchronous (spawnSync), so no await needed.
      try {
        ConnectionsTestHelper.dockerComposeDownInDbFolder();
      } catch (e) {
        console.error('[CLEANUP] Nuclear docker compose down failed:', e);
      }
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — Create a database connection INSIDE CloudBeaver (the real web app)
// ═══════════════════════════════════════════════════════════════════════════════
//
// BLOCK 1/2 screenshot DataPallas's OWN Electron UI. CloudBeaver, by contrast, is
// a SEPARATE web app served on http://localhost:8978. We drive it exactly like the
// WordPress / Grails web-app specs (apps-cms-wordpress.spec.ts): start the app from
// DataPallas's Apps tab, then open a real Playwright (Edge) browser pointed at the
// app URL and click through ITS DOM.
//
// We start the Northwind postgres pack so there's a LIVE DB to hit, then in
// CloudBeaver create a PRIVATE PostgreSQL connection to it (host.docker.internal:
// 5432 / Northwind / postgres / postgres — CB reaches the host-exposed DB via
// host.docker.internal because it runs in its own container), and finally PROVE
// the connection works by running `SELECT count(1) FROM "Customers"` in a SQL
// editor. Two screenshots into VIDEO_ASSETS_DIR:
//   db-conn-08-cloudbeaver-create-connection.png  — the filled connection form
//   db-conn-09-cloudbeaver-query-result.png       — the query result grid (count)
//
// Private vs Shared: a Private connection (visible only to this user, no admin /
// sharing) is the right choice for a single user on their own laptop.
//
// ⚠️ SELECTOR NOTE: CloudBeaver (dbeaver/cloudbeaver:25.2.5) ships almost no stable
// data-testids, so the steps drive it by visible text / ARIA role / field label —
// all pulled from the CloudBeaver source (eval-hand-drawn-whiteboard/cloudbeaver:
// WizardStepper.tsx + plugin-connections / plugin-projects / plugin-sql-editor
// locales). Still BEST-EFFORT against the live 25.2.5 UI: run headed, watch the
// Edge window, and adjust the helpers if a step misses.
// ═══════════════════════════════════════════════════════════════════════════════

const CB_URL = 'http://localhost:8978';
// Full Playwright trace of the EXTERNAL CloudBeaver browser (the Electron-page
// trace does NOT cover this separate context). Replay with:
//   npx playwright show-trace e2e/cb-debug/cloudbeaver-trace.zip
const CB_TRACE_PATH = path.resolve(
  __dirname, '..', '..', '..', 'cb-debug', 'cloudbeaver-trace.zip',
);
// Target the Northwind postgres starter pack (db-northwind-postgres). CloudBeaver
// runs in its own container, so it reaches the host-exposed DB via
// host.docker.internal (NOT localhost). Details mirror
// ConnectionsTestHelper.dbServerConnDefaults('postgres'), host-rewritten for CB.
const CB_CONN = {
  driver: 'PostgreSQL',
  host: 'host.docker.internal',
  port: '5432',
  database: 'Northwind',
  username: 'postgres',
  password: 'postgres',
};
// Proof query. Northwind tables are quoted PascalCase in Postgres (see
// SCHEMA_TABLES_OLTP / NorthwindDataGenerator), so it MUST be "Customers" — an
// unquoted `customers` folds to lowercase and 404s.
const CB_QUERY = 'SELECT count(1) FROM "Customers"';

electronBeforeAfterAllTest(
  'DataPallas Learn2 — CloudBeaver create connection',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser = null;
    let externalContext: BrowserContext | null = null;
    try {
      // ── 0) Make sure CloudBeaver is fully STOPPED, then wipe its persisted
      //      workspace so the first-run wizard starts truly fresh. A running
      //      container holds the H2 security DB (cb.h2v2.dat.mv.db) open, so the
      //      wipe would fail on Windows with the file locked; and a prior run's
      //      `admin` user otherwise makes finish fail ("User 'admin' already exists").
      SelfServicePortalsTestHelper.dockerComposeDownKeepImage('cloudbeaver');
      wipeCloudBeaverWorkspace();

      // ── 1) Start CloudBeaver from DataPallas's Apps tab — do this FIRST, on the
      //      freshly-launched app. gotoApps() lands on the Apps sub-tab by default
      //      (#appSearch visible). If a starter pack is started first, the Starter
      //      Packs sub-tab stays active and gotoApps() does NOT re-click the Apps
      //      sub-tab → #appSearch is hidden and navigation fails.
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage).gotoApps(),
        'cloudbeaver',
      );

      // ── 2) Start the Northwind postgres pack so the connection reaches a LIVE DB
      //      with data. setStarterPackStateForVendor → gotoStarterPacks explicitly
      //      clicks the Starter Packs sub-tab, so it's order-robust (runs fine after
      //      the Apps-tab navigation above).
      await ConnectionsTestHelper.setStarterPackStateForVendor(
        new FluentTester(firstPage),
        'postgres',
        'start',
      );

      // ── 2) Open a real browser at the CloudBeaver URL, wait for it to answer.
      const { browser, context, page } =
        await SelfServicePortalsTestHelper.createExternalBrowser(false, {
          viewport: { width: 1600, height: 1000 },
          deviceScaleFactor: 2,
        });
      externalBrowser = browser;
      externalContext = context;
      // The Playwright runner's `trace` config auto-starts tracing on every new
      // context (incl. this external one) — and without screenshots. Stop+discard
      // that, then start OUR own trace with screenshots + DOM snapshots so the
      // CloudBeaver UI is fully replayable. (`.catch` covers the no-trace case.)
      await context.tracing.stop().catch(() => {});
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      await SelfServicePortalsTestHelper.waitForServerReady(page, CB_URL, 30, 2000);
      await page.goto(CB_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      // ── 3) A fresh workspace may show CloudBeaver's first-run config wizard —
      //      best-effort walk-through; no-op if it's not shown.
      await dismissCloudBeaverFirstRun(page);

      // ── 3b) After the wizard CloudBeaver sits on /#/admin behind a Local login.
      //       Go to the main app root and sign in as the admin we just created so
      //       the New-Connection flow (custom connections) is available.
      await page.goto(CB_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await loginIfPrompted(page);
      await page.waitForTimeout(1500);

      // ── 4) New Connection → PostgreSQL → fill the Main tab. The "Project" field
      //      auto-locks to "Private" (disabled) on single-user CE — exactly the
      //      right scope for a laptop user, so there's nothing to select.
      await openNewPostgresConnection(page);
      await fillCbField(page, ['host'], CB_CONN.host, /host/i);
      await fillCbField(page, ['port'], CB_CONN.port, /port/i);
      await fillCbField(page, ['databaseName'], CB_CONN.database, /database/i);
      await fillCbField(page, ['userName', 'user'], CB_CONN.username, /user ?name|^user$/i);
      await fillCbField(page, ['userPassword', 'password'], CB_CONN.password, /password/i);
      // Tick "Save credentials" so the connection STORES the DB creds — then
      // opening it for the proof query (db-conn-09) won't pop a re-auth dialog.
      // It's a styled checkbox whose real <input> is a hidden 1px span, so a
      // force-check on it doesn't toggle React state; click its label instead.
      const saveCreds = page
        .getByText('Save credentials for the current user', { exact: true })
        .first();
      if (await saveCreds.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveCreds.click({ timeout: 4000 }).catch(() => {});
      }
      const saveCredsChecked = await page
        .evaluate(() => {
          const el = document.querySelector('input[name="saveCredentials"]') as HTMLInputElement | null;
          return el ? el.checked : null;
        })
        .catch(() => null);
      console.log(`[cb-conn] saveCredentials checked=${saveCredsChecked}`);
      await page.waitForTimeout(600);

      // ── 5) Capture the filled "Create Connection" dialog.
      await captureDocsScreenshot(
        page,
        'db-conn-08-cloudbeaver-create-connection.png',
        VIDEO_ASSETS_DIR,
      );

      // ── 6) Save the connection (Create), then PROVE it works: open a SQL
      //      editor, run count(1) FROM "Customers", capture the result grid.
      await page
        .getByRole('button', { name: 'Create', exact: true })
        .first()
        .click({ timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(2500);

      await runCustomersCountQuery(page);
      await captureDocsScreenshot(
        page,
        'db-conn-09-cloudbeaver-query-result.png',
        VIDEO_ASSETS_DIR,
      );
    } finally {
      // Write the CloudBeaver trace BEFORE closing the browser (happy path OR any
      // failure above), so a stuck/failed run is always replayable.
      if (externalContext) {
        try {
          await externalContext.tracing.stop({ path: CB_TRACE_PATH });
          console.log(`[cloudbeaver] external trace → ${CB_TRACE_PATH}`);
        } catch (e) {
          console.error('[CLEANUP] Failed to write CloudBeaver trace:', e);
        }
      }
      // Close the external browser first (independent of Electron).
      if (externalBrowser) {
        await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser).catch(
          (e) => console.error('[CLEANUP] Failed to close external browser:', e),
        );
      }

      // NOTE: no graceful UI stop here — after the Starter Packs sub-tab was
      // activated (step 2), gotoApps() can't re-show #appSearch, so a UI stop is
      // unreliable. We trust the nuclear `docker compose down` below instead —
      // the same deliberate choice BLOCK 2 makes for the postgres pack.

      // ── NUCLEAR STOP — the 101% guarantee. Runs no matter what (happy path OR
      // ANY exception/crash above, incl. a dead Electron renderer): a synchronous
      // `docker compose down -v` in _apps/cloudbeaver force-stops and removes the
      // `rb-cloudbeaver` container + volumes, so CloudBeaver can NEVER be left
      // running after this spec. Keeps the image so re-runs don't re-pull. Same
      // guaranteed-teardown idiom BLOCK 2 uses for the postgres pack.
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage('cloudbeaver');
      } catch (e) {
        console.error('[CLEANUP] Nuclear CloudBeaver docker compose down failed:', e);
      }

      // ── NUCLEAR STOP for the Northwind postgres pack — same guarantee: a
      // synchronous `docker compose down -v` in the db/ folder, so the pack can
      // never be left running after this spec (identical to BLOCK 2's teardown).
      try {
        ConnectionsTestHelper.dockerComposeDownInDbFolder();
      } catch (e) {
        console.error('[CLEANUP] Nuclear postgres pack docker compose down failed:', e);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// CloudBeaver helpers (text/role-based — no stable test-ids in the CB frontend)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete CloudBeaver's first-run "Initial Server Configuration" wizard.
 *
 * A fresh workspace boots into #/setup/configuration: Welcome → Server
 * Configuration → Confirmation. The advance control (WizardStepper.tsx) is a
 * single `<Button>` labelled `Next` on intermediate steps and `Finish` on the
 * last. BUT the "Server Configuration" step has THREE required admin inputs
 * (ServerConfigurationAdminForm.tsx: name="adminName" / "adminPassword" /
 * "adminPasswordRepeat", the last two must match), and `service.next()` won't
 * advance until they're valid — so we fill them whenever they appear, then
 * advance. We deliberately leave "Allowed Server URLs" EMPTY (empty = all URLs
 * allowed); anonymous access defaults ON for the local provider, so there's no
 * post-wizard login.
 *
 * Once finished, CloudBeaver writes its config into the bind-mounted
 * ./workspace, which survives `docker compose down -v` (bind mounts aren't
 * volumes) — so subsequent runs skip the wizard and this is a no-op.
 */
// Admin user for the wizard. NOTE: the name must NOT be "admin" — CloudBeaver
// ships a built-in team with subjectId "admin" (config/core/initial-data.conf),
// and validateAndCreateUser rejects a user whose id collides with an existing
// user OR team ("User or team 'admin' already exists"). Password must satisfy
// the policy (min length + upper & lower case + digit + special char), else the
// field is invalid and Next silently refuses to advance.
const CB_ADMIN = { name: 'cbadmin', password: 'Cloudbeaver1!' };

/**
 * Delete CloudBeaver's persisted workspace data so the first-run wizard starts
 * truly fresh. Users/config live in the bind-mounted workspace/.data, which
 * `docker compose down -v` does NOT remove (it's a bind mount, not a volume) —
 * so a prior run's `admin` user lingers and the wizard's finish then fails with
 * "User 'admin' already exists". Best-effort; never throws.
 */
function wipeCloudBeaverWorkspace(): void {
  // Deterministic path from this spec's location (cwd/env-agnostic): up 4 levels
  // (docs → screenshots → specs → e2e) lands on frend/reporting, then into the
  // testground CloudBeaver workspace.
  const ws = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'testground',
    'e2e',
    '_apps',
    'cloudbeaver',
    'workspace',
    '.data',
  );
  const existedBefore = fs.existsSync(ws);
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch (e) {
    console.log('[cloudbeaver] workspace wipe error:', String(e));
  }
  // stillExists MUST be false after a successful wipe — if it's true, the H2 was
  // locked (CloudBeaver still running) and we'd hit "admin already exists" again.
  console.log(
    `[cloudbeaver] wiped ${ws} (existedBefore=${existedBefore}, stillExists=${fs.existsSync(ws)})`,
  );
}

async function dismissCloudBeaverFirstRun(page: Page): Promise<void> {
  const clickAdvance = async (label: 'Next' | 'Finish'): Promise<boolean> => {
    for (const loc of [
      page.getByRole('button', { name: label, exact: true }).first(),
      page.locator(`button:has-text("${label}")`).first(),
    ]) {
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loc.click().catch(() => {});
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < 10; i++) {
    const url = page.url();
    console.log(`[cb-wizard] iter ${i} url=${url}`);
    if (!url.includes('/setup')) {
      console.log('[cb-wizard] off /setup → wizard complete');
      break;
    }

    // Confirmation step: click Finish ONCE and wait for the server config to
    // apply + the SPA to navigate away. Re-clicking re-runs configureServer,
    // which then fails ("User 'admin' already exists") and wedges the wizard.
    if (url.includes('/setup/finish')) {
      await clickAdvance('Finish');
      console.log('[cb-wizard] clicked Finish (once) — waiting for apply/redirect');
      await page
        .waitForFunction(() => !window.location.hash.includes('/setup'), null, { timeout: 30000 })
        .catch(() => console.log('[cb-wizard] still on /setup after Finish — apply may have errored'));
      break;
    }

    // Fill the required admin credentials when the Server Configuration step is
    // showing (stable name= attributes). Without these, Next never advances.
    const adminName = page.locator('input[name="adminName"]').first();
    const hasAdmin = await adminName.isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`[cb-wizard] adminName field visible=${hasAdmin}`);
    if (hasAdmin) {
      await adminName.fill(CB_ADMIN.name).catch((e) => console.log('[cb-wizard] adminName fill err:', String(e)));
      await page.locator('input[name="adminPassword"]').first().fill(CB_ADMIN.password).catch((e) => console.log('[cb-wizard] adminPassword fill err:', String(e)));
      await page.locator('input[name="adminPasswordRepeat"]').first().fill(CB_ADMIN.password).catch((e) => console.log('[cb-wizard] adminPasswordRepeat fill err:', String(e)));
      // Enable custom/private connections — default OFF hides the whole
      // connection-create menu (configureServer.customConnectionsEnabled). It's a
      // Reakit <Switch> whose value lands on the input's `id` (id={id||value||name}),
      // NOT a `name` attr — so query by #id and toggle via its visible label
      // "Enable private connections". Verify against the real checked state.
      const cbState = () =>
        page
          .evaluate(() => {
            const el = document.querySelector('#customConnectionsEnabled') as HTMLInputElement | null;
            return el ? el.checked : null;
          })
          .catch(() => null);
      const before = await cbState();
      console.log(`[cb-wizard] customConn before=${before}`);
      if (before !== true) {
        const lbl = page.getByText('Enable private connections', { exact: true }).first();
        if (await lbl.isVisible({ timeout: 2000 }).catch(() => false)) {
          await lbl.click().catch((e) => console.log('[cb-wizard] switch label click err:', String(e)));
        } else {
          console.log('[cb-wizard] "Enable private connections" label NOT visible');
        }
      }
      console.log(`[cb-wizard] customConnectionsEnabled after=${await cbState()}`);
      await page.waitForTimeout(500);
      // Read back what's actually in the inputs (catches controlled-input/validation issues).
      const dump = await page
        .evaluate(() =>
          ['adminName', 'adminPassword', 'adminPasswordRepeat']
            .map((n) => `${n}=${(document.querySelector(`input[name="${n}"]`) as HTMLInputElement)?.value ?? '∅'}`)
            .join(' '),
        )
        .catch(() => '(eval failed)');
      console.log(`[cb-wizard] after fill: ${dump}`);
    }

    if (await clickAdvance('Next')) {
      console.log('[cb-wizard] clicked Next');
      await page.waitForTimeout(1500);
      continue;
    }
    console.log('[cb-wizard] no Next button found → break');
    break;
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * If CloudBeaver's Local login dialog is showing (it appears after the first-run
 * wizard, on /#/admin), sign in as the admin created during the wizard. The
 * Local provider's credential inputs are name="user"/name="password" and the
 * submit button is labelled "Login". No-op if no login is prompted.
 */
async function loginIfPrompted(page: Page): Promise<void> {
  const userField = page.locator('input[name="user"]').first();
  const visible = await userField.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[cb-login] login form visible=${visible}`);
  if (!visible) return;
  await userField.fill(CB_ADMIN.name).catch(() => {});
  await page.locator('input[name="password"]').first().fill(CB_ADMIN.password).catch(() => {});
  for (const loc of [
    page.getByRole('button', { name: 'Login', exact: true }).first(),
    page.locator('button:has-text("Login")').first(),
  ]) {
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click().catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(2500);
  console.log(`[cb-login] after login url=${page.url()}`);
}

/**
 * Open the New-Connection flow and pick the PostgreSQL driver. Labels are from
 * the CloudBeaver source (plugin-connections locale): the toolbar "+" menu item
 * is "New Connection", the driver dialog (title "New connection") has a "Search"
 * box, and drivers are listed by name ("PostgreSQL").
 */
async function openNewPostgresConnection(page: Page): Promise<void> {
  // Debug: dump the visible toolbar buttons so the log reveals the exact
  // title/aria-label/text of the "Connection" menu (plug+chevron icon).
  const btns = (await page
    .evaluate(() => {
      return Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"],a'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const e = el as HTMLElement;
          return [e.getAttribute('title'), e.getAttribute('aria-label'), (e.textContent || '').trim().slice(0, 24)]
            .filter(Boolean)
            .join(' | ');
        })
        .filter((s) => s.length)
        .slice(0, 50);
    })
    .catch(() => [])) as string[];
  console.log('[cb-conn] visible buttons:\n  ' + btns.join('\n  '));

  // 1) Open the top-toolbar "Connection" menu (plugin_connections_menu_connections_label).
  for (const loc of [
    page.getByTitle('Connection', { exact: true }).first(),
    page.getByRole('button', { name: 'Connection', exact: true }).first(),
    page.getByTitle(/create a new connection/i).first(),
    page.getByRole('button', { name: /new connection/i }).first(),
  ]) {
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click().catch(() => {});
      console.log('[cb-conn] opened Connection menu');
      break;
    }
  }
  await page.waitForTimeout(800);

  // 2) Click "New Connection" (ACTION_CONNECTION_CUSTOM → driver-selection dialog).
  for (const loc of [
    page.getByRole('menuitem', { name: /new connection/i }).first(),
    page.getByText('New Connection', { exact: true }).first(),
    page.getByTitle(/create a new connection/i).first(),
  ]) {
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click().catch(() => {});
      console.log('[cb-conn] clicked New Connection');
      break;
    }
  }
  await page.waitForTimeout(1200);

  // 3) Driver dialog: narrow with the ItemListSearch box (placeholder "Type
  //    driver name..."), then pick the PostgreSQL ListItem (ListItemName text).
  const search = page.getByPlaceholder(/driver name|search/i).first();
  if (await search.isVisible({ timeout: 4000 }).catch(() => false)) {
    await search.fill(CB_CONN.driver);
    await page.waitForTimeout(900);
    console.log('[cb-conn] filled driver search');
  } else {
    console.log('[cb-conn] driver search box NOT visible (dialog may not have opened)');
  }
  // The driver row is a <ListItem title="PostgreSQL standard driver"> wrapping a
  // <ListItemName>PostgreSQL</ListItemName>; the inner name div doesn't receive
  // the click (the row intercepts pointer events), so click the row itself (by its
  // title=description), falling back to a force-click on the name text.
  const driverRow = page.getByTitle(/postgresql.*driver|postgresql/i).first();
  if (await driverRow.isVisible({ timeout: 4000 }).catch(() => false)) {
    await driverRow.click({ timeout: 10000 }).catch(() => {});
    console.log('[cb-conn] clicked PostgreSQL driver row');
  } else {
    await page.getByText(CB_CONN.driver, { exact: true }).first().click({ timeout: 10000, force: true });
    console.log('[cb-conn] force-clicked PostgreSQL name');
  }
  await page.waitForTimeout(1200);

  // Selecting a driver for the FIRST time is slow: CloudBeaver loads/downloads the
  // JDBC driver before rendering the connection form. Wait for the Host field to
  // exist before the caller fills — otherwise every field is "NOT FOUND".
  await page
    .locator('input[name="host"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })
    .then(() => console.log('[cb-conn] connection form rendered (Host visible)'))
    .catch(() => console.log('[cb-conn] Host field did NOT appear within 60s'));
}

/**
 * Open a SQL editor on the just-created connection, run the proof query, and
 * leave the result grid on screen for the caller to screenshot.
 *
 * Selectors are from the CloudBeaver source (plugin-sql-editor locale):
 *   - open    → toolbar action tooltip "Open SQL Editor"
 *   - type    → the CodeMirror editor surface (.cm-content)
 *   - execute → Ctrl+Enter (per the editor placeholder "Execute query with
 *               Ctrl+Enter to see results"), with the "Execute SQL Statement"
 *               toolbar button as a fallback.
 * Best-effort: CloudBeaver has no test-ids, so verify on the live UI.
 */
async function runCustomersCountQuery(page: Page): Promise<void> {
  // Open the SQL editor for the active connection.
  const openSql = page.getByRole('button', { name: /open sql editor/i }).first();
  if (await openSql.isVisible({ timeout: 5000 }).catch(() => false)) {
    await openSql.click({ timeout: 8000 }).catch(() => {});
  } else {
    await page.getByTitle(/open sql editor/i).first().click().catch(() => {});
    await page.getByText('SQL Editor', { exact: true }).first().click().catch(() => {});
  }
  await page.waitForTimeout(1500);

  // Type the query into the CodeMirror surface.
  const editor = page.locator('.cm-content, .CodeMirror, [class*="editor"]').first();
  await editor.click({ timeout: 8000 }).catch(() => {});
  await page.keyboard.type(CB_QUERY);
  await page.waitForTimeout(400);

  // Execute via the toolbar "Execute SQL Statement" (▶) button, Ctrl+Enter as
  // backup. The first use of the connection pops a "Database Authentication"
  // dialog (creds weren't saved) — sign in, then run once more to be sure.
  const clickExecute = async () => {
    const execBtn = page.getByTitle(/execute sql statement/i).first();
    if (await execBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await execBtn.click({ timeout: 5000 }).catch(() => {});
    } else {
      await page.keyboard.press('Control+Enter').catch(() => {});
    }
  };
  await clickExecute();
  await handleDbAuthDialog(page);
  await clickExecute();

  // Wait for the result to actually render (the "Status:" footer appears once the
  // data grid has data) so the screenshot proves the query returned. Time-boxed.
  await page
    .getByText(/Status:/i)
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => console.log('[cb-query] result rendered (Status: visible)'))
    .catch(() => console.log('[cb-query] result Status: not detected within 30s'));
  await page.waitForTimeout(1500);
}

/**
 * If CloudBeaver's "Database Authentication" dialog is showing (first use of a
 * connection whose credentials weren't saved), sign in with the DB credentials.
 * The dialog reuses the auth-model property inputs (userName/userPassword) and a
 * "Login" button (authentication_login). No-op if the dialog isn't shown.
 */
async function handleDbAuthDialog(page: Page): Promise<void> {
  const userField = page.locator('input[name="userName"]').first();
  if (!(await userField.isVisible({ timeout: 2500 }).catch(() => false))) return;
  console.log('[cb-query] Database Authentication dialog → signing in');
  await userField.fill(CB_CONN.username, { timeout: 5000 }).catch(() => {});
  await page
    .locator('input[name="userPassword"]')
    .first()
    .fill(CB_CONN.password, { timeout: 5000 })
    .catch(() => {});
  await page.getByRole('button', { name: 'Login', exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

/** Fill a CloudBeaver form field, trying label → placeholder association. */
async function fillCbField(
  page: Page,
  names: string[],
  value: string,
  fallbackRe?: RegExp,
): Promise<void> {
  // Prefer the stable `name=` attribute — CloudBeaver's <InputField> sets it on
  // the real <input> (host/port/databaseName from ParametersForm; user/password
  // are the auth-model property ids). Fall back to label/placeholder text only
  // if no name matches.
  for (const n of names) {
    const byName = page.locator(`input[name="${n}"]`).first();
    if (await byName.isVisible({ timeout: 1000 }).catch(() => false)) {
      await byName.fill(value, { timeout: 5000 }).catch((e) => console.log(`[cb-field] name="${n}" fill err:`, String(e)));
      console.log(`[cb-field] filled name="${n}"`);
      return;
    }
  }
  if (fallbackRe) {
    for (const loc of [page.getByLabel(fallbackRe).first(), page.getByPlaceholder(fallbackRe).first()]) {
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loc.fill(value, { timeout: 5000 }).catch(() => {});
        console.log(`[cb-field] filled by ${fallbackRe}`);
        return;
      }
    }
  }
  console.log(`[cb-field] NOT FOUND names=[${names.join(',')}] fallback=${fallbackRe} — needs live-UI tweak`);
}

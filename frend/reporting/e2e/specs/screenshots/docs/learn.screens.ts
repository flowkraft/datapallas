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
//           → search "SQL Server"                        (#packSearch)
//             → ring the tab title + the matched Northwind (SQL Server) pack
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

import { test } from '@playwright/test';
import * as path from 'path';
import * as _ from 'lodash';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
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

// The SQL Server Northwind starter pack (starter-packs.service.ts):
//   id 'db-northwind-sqlserver' → card #starterPack_db-northwind-sqlserver,
//   displayName "Northwind DB (SQL Server)".
const SQLSERVER_PACK_ID = 'db-northwind-sqlserver';
const SQLSERVER_PACK_CARD = `#starterPack_${SQLSERVER_PACK_ID}`;

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

    // ── Search "SQL Server" — displayName "Northwind DB (SQL Server)" matches,
    // and it's the only pack that does, so the list narrows to the single
    // Northwind (SQL Server) card. The search box debounces 300ms; settle a
    // touch longer before reading the filtered list.
    await ft
      .setValue('#packSearch', 'SQL Server')
      .sleep(600)
      .waitOnElementToBecomeVisible(SQLSERVER_PACK_CARD);

    // ASSERT the "meat": the matched card is really the SQL Server pack.
    await ft.elementShouldContainText(SQLSERVER_PACK_CARD, 'SQL Server');

    // ── 01 — ring the Starter Packs tab title + the search box + the matched
    // SQL Server pack card (Start button included so the reader sees where they
    // spin it up), capture.
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      '01-db-starter-pack-northwind.png',
      [
        '#tab-btn-starterPacksTab', // Help-area tab: outer ring (the active tab's fill hides an inset ring); has headroom above so the outer ring isn't clipped
        '#packSearch',
        { selector: SQLSERVER_PACK_CARD, inset: true }, // card's left edge sits against the content-panel boundary → outer ring's left vertical clips; inset keeps all four sides visible
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
        ['#btnTestDbConnection'],
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
          '#btnGenerateWithAIDomainGroupedSchema',
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
          '#btnGenerateWithAIErDiagram',
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

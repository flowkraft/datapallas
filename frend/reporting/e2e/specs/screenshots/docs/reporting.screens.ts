// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — Reporting area (for datapallas.com docs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Captures Reporting-module screenshots referenced from the docs MDX. Each docs
// target is its own `electronBeforeAfterAllTest` block so new ones can be added
// without disturbing existing flows. All captures live inside the DataPallas
// Electron Angular UI (Configuration → Reports / Reporting Settings), so we
// work from the Electron Page (`firstPage`) — no external browser needed.
//
// This file is the home for ALL reporting-surface docs pages — dashboards.mdx
// today; report-generation.mdx, report-bursting.mdx, report-distribution-email/
// -qa/-upload.mdx next. They all walk the same surface (create report → tabs),
// so future blocks reuse the exact flow below with different payloads/filenames:
// append a new `electronBeforeAfterAllTest('Reporting — docs screenshots —
// <page>', …)` block, keeping the per-block setup (create connection + report)
// / teardown (delete report + connection) pattern so blocks stay independently
// runnable.
//
// ── BLOCK 2 (at a glance) — dashboards.mdx, Approach 1 Step 1 ─────────────────
// 300_07_canvas-landing.png — the /explore-data landing page (dashboards list
// with the two bundled samples). Needs Docker (AI Hub); see the block.
//
// ── BLOCK 1 — dashboards.mdx, "Approach 2: Fully Configure Every Aspect" ──────
//
// Builds the Northwind Sales Dashboard report exactly as the doc describes —
// same scripts and component configurations as the shipped Sales Dashboard
// sample (config/samples/g-dashboard/*, the source of truth for the payloads
// embedded below), against the bundled Northwind SQLite database.
//
// Every PNG is written with the SAME name as the existing manual image plus a
// `-dp` suffix, into the SAME docs sub-folder (bi-analytics/), so the automated
// capture sits next to the original for side-by-side comparison / swap — the
// established convention (see connections.screens.ts, samples.screens.ts).
//
// Shot → state mapping (all under bi-analytics/):
//   060-rb-dash-northwind-create-report-dp      Create Report modal, name typed,
//                                               Report Generation capability
//                                               checked + ringed (#spanCap…)
//   065-rb-dash-northwind-datasource-script-dp  DataSource tab — Input Type =
//                                               "Script (for fetching dashboard
//                                               data)", Northwind connection
//                                               selected, data script in editor
//   067-rb-dash-northwind-parameters-config-dp  Report Parameters sub-tab with the
//                                               country dropdown-filter DSL
//   075-rb-dash-northwind-tabulator-config-dp   Tabulator tab — topCustomers config
//   080-rb-dash-northwind-chart-config-dp       Chart tab — revenueTrend +
//                                               revenueByCategory configs
//   085-rb-dash-northwind-pivot-config-dp       Pivot Table tab — orderExplorer config
//   070-rb-dash-northwind-template-preview-dp   Output Template tab — Dashboard
//                                               output type (locked), HTML template
//                                               with the live preview pane open
//   090-rb-dash-northwind-template-alt-dp       Same tab, "View In Browser" ringed
//   100-rb-dash-northwind-usage-share-dp        Usage tab — rb-dashboard embed
//                                               snippet + shareable dashboard URL
//
// PLUS one shot to the ROOT docs dir for web-components/index.mdx Step 2:
//   100_05_web-components-data-driven-configuration-dp = the 075 Tabulator-config
//     frame, but ringing the 4 config TABS as a group (injected overlay box) +
//     the Hey AI button — reproducing that page's original two-box annotation.
//   (web-components/index.mdx Step 1's "100_00" Create Report shot is not a
//    separate capture — it reuses the 060 file directly.)
//
// Every shot whose screen shows a "Hey AI, Help Me ..." button RINGS it — the
// docs repeatedly tell readers to click these (same pattern as the 045_82
// seed-data shot in connections.screens.ts):
//   065 → #btnHelpWithScriptAI               070 → #btnAskAiForHelpOutput
//   067 → #btnAiHelpParamsSpecScriptInTab    075 → #btnAiHelpTabulatorConfig
//   080 → #btnAiHelpChartConfig              085 → #btnAiHelpPivotTableConfig
// Exceptions: 060/100 have no AI button on screen (060 rings the Report
// Generation capability checkbox group; 100 rings the "Shareable Dashboard URL"
// section — #divUsageShareableDashboardUrl — matching the manual shot's box);
// 090 deliberately rings ONLY #btnViewHtmlInBrowser — that shot's whole story
// is the View-in-Browser button (its screen does show #btnAskAiForHelpOutput,
// but a second ring would muddle the message; 070 already carries the AI ring).
//
// Capture order deliberately differs from the doc order: the three component
// configs (075/080/085) are pasted BEFORE the template-preview shots (070/090)
// so the debounced auto-save has flushed every script/config server-side by the
// time the preview pane's rb-* components fetch their data.
//
// NOT captured here (already produced elsewhere — dashboards.mdx reuses them):
//   042_00/042_05 connection shots           → connections.screens.ts
//   q2_023 apps-manager shot                 → quickstart.screens.ts
//   093/095 live-dashboard browser shots     → samples.screens.ts
//   300_* canvas build walkthrough           → canvas-dashboard.screens.ts
//
// Output: writes directly into the docs repo at
//   …/reportburster.com/public/images/docs/bi-analytics/
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # set E2E_SPEC="reporting.screens.ts" and E2E_GREP="Reporting — docs" in
//   # custom:start-server-and-e2e-electron-screens-grep
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Browser } from '@playwright/test';
import * as path from 'path';
import * as _ from 'lodash';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { ConfTemplatesTestHelper } from '../../../helpers/areas/conf-templates-test-helper';
import { ConfigurationTestHelper } from '../../../helpers/areas/configuration-test-helper';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── OUTPUT SUB-DIR ────────────────────────────────────────────────────────────
// All dashboards.mdx Approach-2 shots live under bi-analytics/ in the docs repo.
const BI_DIR = path.join(DOCS_IMAGES_DIR, 'bi-analytics');

// Every shot is saved next to its original as `<name>-dp.png` so the docs can
// show the old/new pair side by side; drop the `-dp` once approved (same
// convention as quickstart.screens.ts / samples.screens.ts).
const dp = (base: string) => `${base}-dp.png`;

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
//
// SQLite: file-based, no Docker, and the bundled Northwind sample DB is exactly
// the database dashboards.mdx builds against. Named plain "Northwind" so the
// datasource dropdown renders "Northwind (default)" — the doc's wording.
const DB_VENDOR = 'sqlite';
const CONNECTION_NAME = 'Northwind';
const CONNECTION_CODE = `db-${_.kebabCase(CONNECTION_NAME)}-${DB_VENDOR}`;

// The report the doc builds. Folder name (kebab) doubles as the report code the
// rb-* web components reference via report-id.
const REPORT_NAME = 'Northwind Sales Dashboard';
const REPORT_CODE = _.kebabCase(REPORT_NAME); // northwind-sales-dashboard

// ── AI HUB / EXPLORE DATA (BLOCK 2) ───────────────────────────────────────────
// Same constants as canvas-dashboard.screens.ts — the Explore Data Canvas app
// served by the AI Hub on :8440; VIEWPORT matches so the landing shot frames
// consistently with the 300_2x..300_90 canvas-build series.
const AI_HUB_APP_ID = 'flowkraft-data-canvas';
const AI_HUB_BASE_URL = 'http://localhost:8440';
const DATA_CANVAS_URL = `${AI_HUB_BASE_URL}/explore-data`;
const CANVAS_VIEWPORT = { width: 1500, height: 900 };

// ── PAYLOAD FIXTURES ──────────────────────────────────────────────────────────
// Copied from the shipped Sales Dashboard sample — the on-disk source of truth:
//   asbl/.../db-template/config/samples/g-dashboard/g-dashboard-script.groovy
//   asbl/.../db-template/config/samples/g-dashboard/g-dashboard-report-parameters-spec.groovy
//   asbl/.../db-template/config/samples/g-dashboard/g-dashboard-template.html
//   asbl/.../db-template/config/samples/g-dashboard/g-dashboard-{tabulator,chart,pivot}-config.groovy
// Only deviation: the template's report-id points at THIS report (not
// g-dashboard) so the live preview fetches the report we just configured.
// The Groovy GString \${country} occurrences are escaped for the TS literal.

/** Data script — one `if (!componentId || componentId == '…')` block per
 *  dashboard component: atomicValues (KPIs), revenueTrend + revenueByCategory
 *  (charts), topCustomers (tabulator), orderExplorer (pivot). */
const DASHBOARD_DATA_SCRIPT = `import groovy.sql.Sql

def dbSql = ctx.dbSql
def componentId = ctx.variables?.get('componentId')

// Get filter parameters from ctx.variables (the correct API for accessing report parameters)
// Note: ctx.token may be null during data fetch, so use empty string as fallback
def userVars = ctx.variables.getUserVariables(ctx.token ?: '')
def country = userVars?.get('country')?.toString()
def filterByCountry = country && country != 'null' && country != 'All' && country != '-- All --' && country.trim() != ''

log.info("Dashboard params - componentId: {}, country: {}, filterByCountry: {}", componentId, country, filterByCountry)

// KPI base query (shared WHERE clause)
def kpiBase = """
    FROM Orders o
    JOIN "Order Details" od ON o.OrderID = od.OrderID
"""
if (filterByCountry) kpiBase += " WHERE o.ShipCountry = '\${country}'"

// Component: atomicValues — single query returning all 4 KPI values as columns
if (!componentId || componentId == 'atomicValues') {
    def data = dbSql.rows("""
        SELECT
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue,
            COUNT(DISTINCT o.OrderID) AS orders,
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)) / COUNT(DISTINCT o.OrderID), 0) AS avgOrderValue,
            COUNT(DISTINCT o.CustomerID) AS customers
    """ + kpiBase)
    ctx.reportData('atomicValues', data)
}

// Component: revenueTrend (Chart — monthly revenue)
if (!componentId || componentId == 'revenueTrend') {
    def sql = """
        SELECT
            STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') AS month,
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue
        FROM Orders o
        JOIN "Order Details" od ON o.OrderID = od.OrderID
        WHERE o.OrderDate IS NOT NULL
    """
    if (filterByCountry) sql += " AND o.ShipCountry = '\${country}'"
    sql += " GROUP BY STRFTIME('%Y-%m', o.OrderDate / 1000, 'unixepoch') ORDER BY month"
    def data = dbSql.rows(sql)
    ctx.reportData('revenueTrend', data)
}

// Component: revenueByCategory (Chart — revenue per product category)
if (!componentId || componentId == 'revenueByCategory') {
    def sql = """
        SELECT
            c.CategoryName AS category,
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 0) AS revenue
        FROM "Order Details" od
        JOIN Products p ON od.ProductID = p.ProductID
        JOIN Categories c ON p.CategoryID = c.CategoryID
        JOIN Orders o ON od.OrderID = o.OrderID
    """
    if (filterByCountry) sql += " WHERE o.ShipCountry = '\${country}'"
    sql += " GROUP BY c.CategoryName ORDER BY revenue DESC"
    def data = dbSql.rows(sql)
    ctx.reportData('revenueByCategory', data)
}

// Component: topCustomers (Tabulator — top 10 by revenue)
if (!componentId || componentId == 'topCustomers') {
    def sql = """
        SELECT
            cu.CompanyName AS company,
            cu.Country AS country,
            cu.ContactName AS contact,
            COUNT(DISTINCT o.OrderID) AS orders,
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue
        FROM Customers cu
        JOIN Orders o ON cu.CustomerID = o.CustomerID
        JOIN "Order Details" od ON o.OrderID = od.OrderID
    """
    if (filterByCountry) sql += " WHERE o.ShipCountry = '\${country}'"
    sql += " GROUP BY cu.CustomerID, cu.CompanyName, cu.Country, cu.ContactName ORDER BY revenue DESC LIMIT 10"
    def data = dbSql.rows(sql)
    ctx.reportData('topCustomers', data)
}

// Component: orderExplorer (Pivot Table — orders by country, category, year)
if (!componentId || componentId == 'orderExplorer') {
    def sql = """
        SELECT
            o.ShipCountry AS country,
            c.CategoryName AS category,
            STRFTIME('%Y', o.OrderDate / 1000, 'unixepoch') AS year,
            ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS revenue,
            SUM(od.Quantity) AS quantity
        FROM Orders o
        JOIN "Order Details" od ON o.OrderID = od.OrderID
        JOIN Products p ON od.ProductID = p.ProductID
        JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE o.OrderDate IS NOT NULL
    """
    if (filterByCountry) sql += " AND o.ShipCountry = '\${country}'"
    sql += " GROUP BY o.ShipCountry, c.CategoryName, STRFTIME('%Y', o.OrderDate / 1000, 'unixepoch') ORDER BY country, category, year"
    def data = dbSql.rows(sql)
    ctx.reportData('orderExplorer', data)
}
`;

/** Country dropdown filter — options populated live from the database. */
const PARAMS_SPEC = `reportParameters {
    parameter(
        id: 'country',
        type: String,
        label: 'Country',
        defaultValue: '-- All --'
    ) {
        constraints(required: false)
        ui(
            control: 'select',
            options: "SELECT '-- All --' AS ShipCountry UNION ALL SELECT DISTINCT ShipCountry FROM Orders WHERE ShipCountry IS NOT NULL ORDER BY ShipCountry"
        )
    }
}
`;

const TABULATOR_CONFIG = `tabulator('topCustomers') {
  layout "fitColumns"
  columns {
    column { title "Company"; field "company"; headerFilter "input"; widthGrow 2 }
    column { title "Country"; field "country"; headerFilter "list" }
    column { title "Contact"; field "contact" }
    column { title "Orders"; field "orders"; hozAlign "right"; sorter "number" }
    column { title "Revenue"; field "revenue"; hozAlign "right"; sorter "number"; formatter "money"; formatterParams([thousand: ',', symbol: '$', precision: 2]) }
  }
}
`;

const CHART_CONFIG = `chart('revenueTrend') {
  type 'line'

  data {
    labelField 'month'

    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        backgroundColor 'rgba(15, 118, 110, 0.1)'
        borderColor '#0f766e'
        borderWidth 2
        fill true
        tension 0.3
        pointRadius 3
        pointBackgroundColor '#0f766e'
      }
    }
  }

  options {
    plugins {
      legend { display false }
    }
    scales {
      y {
        beginAtZero true
        title { display true; text 'Revenue ($)' }
      }
      x {
        title { display true; text 'Month' }
      }
    }
  }
}
chart('revenueByCategory') {
  type 'doughnut'

  data {
    labelField 'category'

    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        backgroundColor(['#0f766e', '#e15759', '#4e79a7', '#f28e2b', '#76b7b2', '#59a14f', '#edc949', '#af7aa1'])
        borderColor '#ffffff'
        borderWidth 2
      }
    }
  }

  options {
    plugins {
      legend { position 'right' }
    }
  }
}
`;

const PIVOT_CONFIG = `pivotTable('orderExplorer') {
  rows 'country'
  cols 'year'
  vals 'revenue'
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
}
`;

/** Dashboard HTML template — the sample's template with report-id pointed at
 *  THIS report so the live preview resolves against the config we just built. */
const DASHBOARD_TEMPLATE_HTML = `<meta charset="utf-8">
<div class="rb-dashboard-root">
  <style>
    .rb-dashboard-root {
      all: initial;
      display: block;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      box-sizing: border-box;
      color: #1e293b;
      background: #f8fafc;
      padding: 24px;
    }
    .rb-dashboard-root *, .rb-dashboard-root *::before, .rb-dashboard-root *::after {
      box-sizing: inherit;
    }

    /* Color palette — warm teal for a wholesale/trade feel */
    .rb-dashboard-root {
      --accent: #0f766e;
      --accent-light: #ccfbf1;
      --accent-dark: #064e3b;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --radius: 10px;
    }

    /* Header */
    .rb-dashboard-root .dash-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--accent);
    }
    .rb-dashboard-root .dash-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.3px;
      margin: 0;
    }
    .rb-dashboard-root .dash-subtitle {
      font-size: 13px;
      color: var(--text-secondary);
      margin: 4px 0 0 0;
      font-weight: 400;
    }

    /* Parameters */
    .rb-dashboard-root .params-bar {
      margin-bottom: 24px;
    }

    /* KPI row */
    .rb-dashboard-root .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    .rb-dashboard-root .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 22px;
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
    }
    .rb-dashboard-root .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: var(--accent);
    }
    .rb-dashboard-root .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
      margin: 0 0 6px 0;
    }
    .rb-dashboard-root .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--accent-dark);
      margin: 0;
      line-height: 1.1;
    }

    /* Charts row */
    .rb-dashboard-root .charts-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    .rb-dashboard-root .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .rb-dashboard-root .card-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 16px 0;
      letter-spacing: -0.2px;
    }

    /* Table section */
    .rb-dashboard-root .table-section {
      margin-bottom: 28px;
    }

    /* Pivot section */
    .rb-dashboard-root .pivot-section {
      margin-bottom: 12px;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .rb-dashboard-root .kpi-row { grid-template-columns: repeat(2, 1fr); }
      .rb-dashboard-root .charts-row { grid-template-columns: 1fr; }
    }
    @media (max-width: 500px) {
      .rb-dashboard-root .kpi-row { grid-template-columns: 1fr; }
      .rb-dashboard-root { padding: 12px; }
    }
  </style>

  <!-- Header -->
  <div class="dash-header">
    <div>
      <h1 class="dash-title">Northwind Sales Dashboard</h1>
      <p class="dash-subtitle">Wholesale distribution - revenue, customers &amp; product performance</p>
    </div>
  </div>

  <!-- Parameters -->
  <div class="params-bar">
    <rb-parameters report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" show-reload="true"></rb-parameters>
  </div>

  <!-- KPI Cards — all 4 share component-id="atomicValues" (1 fetch, cached), each picks a different field -->
  <div class="kpi-row">
    <div class="kpi-card">
      <p class="kpi-label">Revenue</p>
      <p class="kpi-value">
        <rb-value report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="atomicValues" field="revenue" format="currency"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Orders</p>
      <p class="kpi-value">
        <rb-value report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="atomicValues" field="orders" format="number"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Avg Order Value</p>
      <p class="kpi-value">
        <rb-value report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="atomicValues" field="avgOrderValue" format="currency"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Customers</p>
      <p class="kpi-value">
        <rb-value report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="atomicValues" field="customers" format="number"></rb-value>
      </p>
    </div>
  </div>

  <!-- Charts -->
  <div class="charts-row">
    <div class="card">
      <h2 class="card-title">Revenue Trend</h2>
      <rb-chart report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="revenueTrend"></rb-chart>
    </div>
    <div class="card">
      <h2 class="card-title">Revenue by Category</h2>
      <rb-chart report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="revenueByCategory"></rb-chart>
    </div>
  </div>

  <!-- Top Customers Table -->
  <div class="table-section">
    <div class="card">
      <h2 class="card-title">Top 10 Customers</h2>
      <rb-tabulator report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="topCustomers"></rb-tabulator>
    </div>
  </div>

  <!-- Order Explorer Pivot -->
  <div class="pivot-section">
    <div class="card">
      <h2 class="card-title">Order Explorer</h2>
      <rb-pivot-table report-id="${REPORT_CODE}" api-base-url="http://localhost:9090/api" component-id="orderExplorer"></rb-pivot-table>
    </div>
  </div>
</div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — Northwind Sales Dashboard, Approach 2 (dashboards.mdx)
// ─────────────────────────────────────────────────────────────────────────────

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — Northwind Sales Dashboard Approach 2 (dashboards.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: create the Northwind SQLite connection ────────────────────────
      // fillNewDatabaseConnectionDetails picks the bundled
      // /db/sample-northwind-sqlite/northwind.db automatically for sqlite.
      // First connection after a clean state is auto-default, so the DataSource
      // tab's dropdown will render it as "Northwind (default)" — the doc's exact
      // wording.
      console.log(`[SETUP] Creating ${DB_VENDOR} connection "${CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        CONNECTION_NAME,
        DB_VENDOR,
      );
      connectionCreated = true;

      // Hide transient toasts (Saved, Connection created, …) for every shot.
      // Deliberately NOT hiding the status bar's "Ups... View Error(s)" button:
      // if an error happens during the run it must show up loud in the shots so
      // it gets seen and fixed, never masked. The collapse-before-paste flow in
      // the template step below prevents the known benign trigger at its root.
      await hideToastsForScreenshots(firstPage);

      // ── CAPTURE 060: Create Report modal, name + Report Generation checked ──
      // Same flow as ConfTemplatesTestHelper.createNewTemplate, inlined so the
      // shot can be taken while the modal is still open. The ring goes around
      // #spanCapReportGenerationMailMerge — the checkbox + its "Report
      // Generation & Dashboards" label as one group — so the reader's eye lands
      // on the capability the step is about.
      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(REPORT_NAME);
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('060-rb-dash-northwind-create-report'),
        ['#spanCapReportGenerationMailMerge'],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('060-rb-dash-northwind-create-report')}`);
      // NOTE: web-components/index.mdx's "100_00" Create Report shot is the SAME
      // frame as 060 — that page reuses this file directly, so no separate
      // capture is written here.

      // Confirm creation → report list shows the new report.
      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // ── Load the report, open Reporting Settings ─────────────────────────────
      await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), REPORT_CODE)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes');

      // ── CAPTURE 065: DataSource — "Script (for fetching dashboard data)" ─────
      // Selecting ds.dashboard also locks the output type to Dashboard and sets
      // the burst filename to dashboard.html (onDataSourceTypeChange).
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.dashboard')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .waitOnElementToContainText('#databaseConnection', CONNECTION_NAME)
        .setCodeJarContentSingleShot('#groovyScriptEditor', DASHBOARD_DATA_SCRIPT)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('065-rb-dash-northwind-datasource-script'),
        // "Hey AI, Help Me Build This Dashboard ..." — inset ring: the button's
        // left edge is flush with the grid column and its right edge abuts the
        // ▼ dropdown toggle, so an outside ring would clip/overlap.
        [{ selector: '#btnHelpWithScriptAI', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('065-rb-dash-northwind-datasource-script')}`);

      // ── CAPTURE 067: Report Parameters sub-tab, country filter DSL ───────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#tab-btn-tabScriptReportParameters')
        .click('#tab-btn-tabScriptReportParameters')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeVisible('#paramsSpecEditor')
        .setCodeJarContentSingleShot('#paramsSpecEditor', PARAMS_SPEC)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('067-rb-dash-northwind-parameters-config'),
        // "Hey AI, Help Me Configure These Report Parameters ..." — inset ring:
        // w-full button, flush against both container edges.
        [{ selector: '#btnAiHelpParamsSpecScriptInTab', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('067-rb-dash-northwind-parameters-config')}`);

      // Back to the script sub-tab so the datasource state is left clean.
      await new FluentTester(firstPage)
        .click('#tab-btn-tabScriptCode')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .sleep(Constants.DELAY_ONE_SECOND);

      // ── CAPTURE 075: Tabulator tab → Tabulator Options, topCustomers config ──
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnElementToBecomeVisible('#tab-btn-tabulatorOptionsTab')
        .click('#tab-btn-tabulatorOptionsTab')
        .waitOnElementToBecomeVisible('#tabulatorConfigEditor')
        .setCodeJarContentSingleShot('#tabulatorConfigEditor', TABULATOR_CONFIG)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('075-rb-dash-northwind-tabulator-config'),
        // "Hey AI, Help Me Configure This Tabulator Table ..." — inset ring:
        // w-full button, flush against both container edges.
        [{ selector: '#btnAiHelpTabulatorConfig', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('075-rb-dash-northwind-tabulator-config')}`);

      // ── ALSO 100_05: same Tabulator-config screen, for web-components/index.mdx ─
      // Reproduces the manual shot's TWO annotation boxes: (1) one ring around
      // the four web-component config TABS as a group — Tabulator, Chart, Pivot
      // Table, Usage — and (2) the "Hey AI" button. The tab-group box is a single
      // overlay div injected around the union bounding-rect of the four tab
      // buttons (DOM injection, per project convention — crisp + resolution-
      // independent, unlike a sharp-drawn rectangle). It persists through the
      // WithHighlights capture below (which rings the Hey AI button), then is
      // removed. Written to the ROOT docs dir under that page's filename.
      const TAB_GROUP = [
        '#tab-btn-reportingTabulatorTab',
        '#tab-btn-reportingChartTab',
        '#tab-btn-reportingPivotTableTab',
        '#tab-btn-reportingUsageTab',
      ];
      await firstPage.evaluate((sels) => {
        const rects = sels
          .map((s) => document.querySelector(s))
          .filter((el): el is HTMLElement => !!el)
          .map((el) => el.getBoundingClientRect());
        if (!rects.length) return;
        const left = Math.min(...rects.map((r) => r.left));
        const top = Math.min(...rects.map((r) => r.top));
        const right = Math.max(...rects.map((r) => r.right));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        const box = document.createElement('div');
        box.id = '__tabgroup_hl_100_05';
        // Same DataPallas-orange ring + soft glow as captureDocsScreenshotWithHighlights.
        box.style.cssText =
          `position:fixed;left:${left - 6}px;top:${top - 6}px;` +
          `width:${right - left + 12}px;height:${bottom - top + 12}px;` +
          `border:3px solid #d18361;border-radius:6px;` +
          `box-shadow:0 0 14px rgba(209,131,97,0.45);` +
          `z-index:9999;pointer-events:none;`;
        document.body.appendChild(box);
      }, TAB_GROUP);
      await firstPage.waitForTimeout(150);

      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('100_05_web-components-data-driven-configuration'),
        [{ selector: '#btnAiHelpTabulatorConfig', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('100_05_web-components-data-driven-configuration')}`);

      await firstPage.evaluate(() =>
        document.getElementById('__tabgroup_hl_100_05')?.remove(),
      );

      // ── CAPTURE 080: Chart tab → Chart Options, both chart configs ───────────
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingChartTab')
        .waitOnElementToBecomeVisible('#tab-btn-chartOptionsTab')
        .click('#tab-btn-chartOptionsTab')
        .waitOnElementToBecomeVisible('#chartConfigEditor')
        .setCodeJarContentSingleShot('#chartConfigEditor', CHART_CONFIG)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('080-rb-dash-northwind-chart-config'),
        // "Hey AI, Help Me Configure This Chart ..." — inset ring: w-full
        // button, flush against both container edges.
        [{ selector: '#btnAiHelpChartConfig', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('080-rb-dash-northwind-chart-config')}`);

      // ── CAPTURE 085: Pivot Table tab → Pivot Table Options, orderExplorer ────
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingPivotTableTab')
        .waitOnElementToBecomeVisible('#tab-btn-pivotTableOptionsTab')
        .click('#tab-btn-pivotTableOptionsTab')
        .waitOnElementToBecomeVisible('#pivotTableConfigEditor')
        .setCodeJarContentSingleShot('#pivotTableConfigEditor', PIVOT_CONFIG)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('085-rb-dash-northwind-pivot-config'),
        // "Hey AI, Help Me Configure This Pivot Table ..." — inset ring: w-full
        // button, flush against both container edges.
        [{ selector: '#btnAiHelpPivotTableConfig', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('085-rb-dash-northwind-pivot-config')}`);

      // ── CAPTURE 070: Output Template tab — Dashboard (locked) + live preview ─
      // Output type is already locked to Dashboard by ds.dashboard, so we do NOT
      // touch #reportOutputType (the Dashboard <option> only exists while
      // locked). The preview pane is OPEN BY DEFAULT for dashboard output
      // (reportPreviewVisible = true), so #btnToggleHtmlPreviewShow does not
      // exist on entry — and pasting while the preview is live reloads the
      // iframe srcdoc on every editor update, aborting the in-flight
      // rb-webcomponents.umd.js request (ClientAbortException noise in
      // errors.log). So: collapse the preview FIRST (state-aware), paste into
      // the editor-only view, then reopen the preview once — a single clean
      // iframe load against the final template, fed by the scripts/configs
      // auto-saved in the steps above.
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(Constants.DELAY_ONE_SECOND);

      const hidePreviewToggle = firstPage.locator('#btnToggleHtmlPreviewHide');
      if (await hidePreviewToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await hidePreviewToggle.click();
        await firstPage
          .locator('#btnToggleHtmlPreviewShow')
          .waitFor({ state: 'visible', timeout: 10_000 });
      }

      await new FluentTester(firstPage)
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', DASHBOARD_TEMPLATE_HTML)
        .sleep(2 * Constants.DELAY_ONE_SECOND) // let the debounced template save flush
        .click('#btnToggleHtmlPreviewShow')
        .waitOnElementToBecomeVisible('#reportPreviewPane')
        .waitOnElementToBecomeVisible('#btnViewHtmlInBrowser');
      await firstPage.waitForTimeout(5000); // rb-* components fetch + Chart.js paint
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('070-rb-dash-northwind-template-preview'),
        // "Hey AI, Help Me Build This DASHBOARD Template!" — inset ring: w-full
        // button in the last grid column, flush right; the outside ring's right
        // bar was clipped off the frame.
        [{ selector: '#btnAskAiForHelpOutput', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('070-rb-dash-northwind-template-preview')}`);

      // ── CAPTURE 090: same tab, "View In Browser" button ringed ───────────────
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('090-rb-dash-northwind-template-alt'),
        // Inset ring: w-full button at the bottom edge of the preview
        // split-pane, flush right + bottom — an outside ring would be clipped.
        [{ selector: '#btnViewHtmlInBrowser', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('090-rb-dash-northwind-template-alt')}`);

      // ── CAPTURE 100: Usage tab — rb-dashboard embed + shareable URL ──────────
      // Ring the whole "2. Shareable Dashboard URL" section (heading + URL well
      // + Copy URL + ${dashboard_url} note) — the manual 100 shot boxes exactly
      // this block. Inset: the wrapper div spans the card-body width.
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingUsageTab')
        .pageShouldContainText('Shareable Dashboard URL')
        .pageShouldContainText('rb-dashboard')
        .sleep(Constants.DELAY_ONE_SECOND);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('100-rb-dash-northwind-usage-share'),
        [{ selector: '#divUsageShareableDashboardUrl', inset: true }],
        BI_DIR,
      );
      console.log(`[capture] bi-analytics/${dp('100-rb-dash-northwind-usage-share')}`);

      console.log('[DONE] All dashboards.mdx Approach 2 screenshots captured.');
      bodySucceeded = true;
    } finally {
      // ── CLEANUP — a failure here MUST fail the test, never pass silently:
      // every step runs independently, errors are collected, and (when the test
      // body itself succeeded) rethrown at the end. A green run can therefore
      // never leave a leaked report or connection behind.
      const cleanupErrors: string[] = [];

      // Close the Create Report modal if the run died with it open — its
      // overlay would block the cleanup navigations below (same pattern as
      // connections.screens.ts).
      try {
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

      // Leave the Configuration area via a neutral screen BEFORE deleteTemplate.
      // Coming straight from the config tabs, the top-menu Configuration
      // dropdown stays open (daisyUI keeps it open via :focus-within — see the
      // q2_020 comments in quickstart.screens.ts) and swallows the first-row
      // click inside gotoConfigurationReports; the retry then DOUBLE-clicks the
      // row (select + deselect), the 'info' class never appears, deleteTemplate
      // times out 2×100s and the report leaks. Blurring the dropdown trigger and
      // hopping to the Burst screen first reproduces the state the proven
      // reporting.spec.ts flows call deleteTemplate from.
      if (reportCreated || connectionCreated) {
        try {
          await firstPage.evaluate(() =>
            (document.activeElement as HTMLElement | null)?.blur(),
          );
          await new FluentTester(firstPage).gotoBurstScreen();
        } catch (e) {
          cleanupErrors.push(`neutral navigation before cleanup: ${e}`);
        }
      }

      if (reportCreated) {
        try {
          await ConfTemplatesTestHelper.deleteTemplate(
            new FluentTester(firstPage),
            REPORT_CODE,
          );
        } catch (e) {
          cleanupErrors.push(`delete report ${REPORT_CODE}: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${CONNECTION_CODE}\\.xml`,
            DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        // Only rethrow when the body succeeded — otherwise the original test
        // failure stays the reported one and cleanup errors are just logged.
        if (bodySucceeded) {
          throw new Error(
            `Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`,
          );
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — Explore Data landing page (dashboards.mdx, Approach 1 Step 1)
// ─────────────────────────────────────────────────────────────────────────────
//
// 300_07_canvas-landing.png (root docs images dir, alongside the other 300_*
// canvas shots — a NEW image, so no -dp suffix): the /explore-data landing page
// listing all dashboards (the two bundled samples on a fresh install) —
// exactly the state dashboards.mdx describes around "Click + New Canvas".
// No other spec captures it: canvas.screens.ts'
// 300_10 and the whole canvas-dashboard.screens.ts walkthrough shoot AFTER
// createFreshCanvas has already clicked + New Canvas. Startup/teardown mirrors
// those two specs (AI Hub app on :8440 — needs Docker).

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — Explore Data landing page (dashboards.mdx)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let externalBrowser: Browser | null = null;
    let bodySucceeded = false;

    try {
      // ── SETUP: AI Hub + external Chromium pointed at :8440 ─────────────────
      console.log('[SETUP] Starting AI Hub from cmsWebPortalTab');
      await SelfServicePortalsTestHelper.startApp(
        new FluentTester(firstPage).gotoDataCanvas(),
        AI_HUB_APP_ID,
      );
      const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
      externalBrowser = browser;
      await page.setViewportSize(CANVAS_VIEWPORT);
      await SelfServicePortalsTestHelper.waitForServerReady(page, AI_HUB_BASE_URL);
      console.log('[SETUP] external browser ready at AI Hub');

      // ── CAPTURE 300_07: the landing page ────────────────────────────────────
      // #btnNewCanvas visible = the landing rendered (same signal
      // createFreshCanvas waits on before clicking it); the extra settle lets
      // the dashboards list finish painting its rows. No ring on the button —
      // it's the only button in the middle of the screen, the eye finds it.
      await page.goto(DATA_CANVAS_URL);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.locator('#btnNewCanvas').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(2_000);
      await captureDocsScreenshot(page, '300_07_canvas-landing.png');
      console.log('[capture] 300_07_canvas-landing.png');

      console.log('[DONE] Explore Data landing screenshot captured.');
      bodySucceeded = true;
    } finally {
      // ── CLEANUP — a failure here MUST fail the test, never pass silently:
      // the AI Hub keeps running (the exact leak this guards against) if the
      // stop/compose-down steps break. Errors are collected and, when the test
      // body itself succeeded, rethrown so the run goes RED on a leak.
      const cleanupErrors: string[] = [];

      if (externalBrowser) {
        try {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        } catch (e) {
          cleanupErrors.push(`close external browser: ${e}`);
        }
      }
      try {
        console.log('[CLEANUP] Stopping AI Hub');
        await SelfServicePortalsTestHelper.stopApp(
          new FluentTester(firstPage).gotoDataCanvas(),
          AI_HUB_APP_ID,
        );
      } catch (e) {
        cleanupErrors.push(`stop AI Hub app: ${e}`);
      }
      try {
        console.log('[CLEANUP] docker compose down — flowkraft/_ai-hub');
        SelfServicePortalsTestHelper.dockerComposeDownRmi('flowkraft/_ai-hub');
      } catch (e) {
        cleanupErrors.push(`docker compose down flowkraft/_ai-hub: ${e}`);
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        // Only rethrow when the body succeeded — otherwise the original test
        // failure stays the reported one and cleanup errors are just logged.
        if (bodySucceeded) {
          throw new Error(
            `Cleanup failed — the AI Hub may still be running:\n${cleanupErrors.join('\n')}`,
          );
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — (placeholder for the next Reporting-area docs targets)
// ─────────────────────────────────────────────────────────────────────────────
//
// report-generation.mdx, report-bursting.mdx, report-distribution-email.mdx,
// report-distribution-qa.mdx and report-distribution-upload.mdx walk the SAME
// surface captured above (create report → DataSource → Parameters → Output
// Template) plus their page-specific tabs (Generate/Burst screens, Email
// Settings, QA, Upload). Append one `electronBeforeAfterAllTest('Reporting —
// docs screenshots — <page>', …)` block per docs page, reusing the SETUP /
// CLEANUP pattern above so blocks remain independently runnable.

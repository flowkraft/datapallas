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

import { test, Browser, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { ConfTemplatesTestHelper } from '../../../helpers/areas/conf-templates-test-helper';
import { ConfigurationTestHelper } from '../../../helpers/areas/configuration-test-helper';
import * as PATHS from '../../../utils/paths';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotOfElement,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
  clearErrorLogsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── OUTPUT SUB-DIR ────────────────────────────────────────────────────────────
// All dashboards.mdx Approach-2 shots live under bi-analytics/ in the docs repo.
const BI_DIR = path.join(DOCS_IMAGES_DIR, 'bi-analytics');

// Every shot is saved next to its original as `<name>-dp.png` so the docs can
// show the old/new pair side by side; drop the `-dp` once approved (same
// convention as quickstart.screens.ts / samples.screens.ts).
const dp = (base: string) => `${base}-dp.png`;

// Scroll the expanded AI-Copilot prompt so its first highlighted `[ ... ]` placeholder is
// centered in the prompt's own scroll box — the customizable section is often below the fold
// (the prompt `<pre>` is `overflow-y: auto`). No-op when there is no prompt / no placeholder.
async function scrollPromptPlaceholderIntoView(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pre = document.getElementById('aiPromptExpandedText');
    const mark = pre?.querySelector('mark.ai-prompt-placeholder') as HTMLElement | null;
    if (!pre || !mark) return;
    const p = pre.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    pre.scrollTop += (m.top - p.top) - pre.clientHeight / 2 + m.height / 2;
  });
}

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
      await clearErrorLogsForScreenshots(firstPage);

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
// BLOCK 3 — report-generation.mdx  ("Employee Hires" walkthrough)
// ─────────────────────────────────────────────────────────────────────────────
//
// Re-captures the CURRENT-look app screenshots on
//   content/docs/report-generation.mdx
// as `<orig>-dp.png` written next to the manual originals in the docs ROOT images
// dir, so the page can show old/new side by side (same `-dp` swap convention as
// BLOCK 1 and connections.screens.ts). Built on the SAME proven flow as
// reporting.spec.ts `configureAndRunReportGeneration2` — one "Employee Hires"
// report against the bundled SQLite Northwind DB (no Docker), driven across every
// surface the page documents, capturing along the way.
//
// APP SCREENS ONLY. The page's non-app images are deliberately NOT reproduced
// here (there is no app screen to capture): the Microsoft Create gallery
// (045_47), Adobe Color (045_55), the Template Gallery shots (045_45/50) and the
// pure AI-prompt-TEXT panels (045_00/31/37/39/60/70, 045_29; 043_20 + 044_05 are
// captured in BLOCK 3b instead).
// 042_15 already has a -dp from connections.screens.ts and is reused as-is.
//
// Shot → state mapping (all written to the docs ROOT images dir):
//   045_05_create-report-generation-template-dp   Create Report modal, name typed,
//                                                  Report Generation capability ringed
//   045_10_reporting-configuration-dp             Reporting Settings landing (DataSource
//                                                  + Output/Template tabs)
//   045_15_reporting-datasource-csv-file-dp        CSV data-source options panel
//   045_20_reporting-datasource-fixed-width-file-dp Fixed-Width options panel
//   045_25_reporting-datasource-excel-file-dp       Excel options panel
//   043_07_ai-driven-fetch-data-script-datasource-dp Script data source, Groovy in editor
//                                                     + "Hey AI, Help Me…" script button ringed
//   043_17_ai-driven-fetch-data-generate-script-dp   AI copilot modal — generate script
//                                                     from the domain-grouped schema
//   043_05_ai-driven-fetch-data-sql-query-dp        SQL Query data source, SQL in editor
//                                                     + "Hey AI, Help Me…" SQL button ringed
//   043_25_ai-driven-fetch-data-report-parameters-dp Report Parameters sub-tab DSL editor
//   045_28_reporting-datasource-more-options-data-transformations-dp
//                                                    "Show More Options" → Additional
//                                                    Data Transformation editor
//   043_10_ai-driven-fetch-data-generate-sql-using-domain-grouped-schema-dp
//                                                    Domain-grouped schema picklist + the
//                                                    "Generate SQL Query with Help From AI"
//                                                    button (entry point, BEFORE the copilot)
//   045_30_reporting-output-pdf-html-dp            Output = PDF (HTML→PDF), HTML template
//   045_35_reporting-output-xlsx-dp                Output = Excel (xlsx)
//   045_40_reporting-output-html-dp                Output = HTML
//   045_42_reporting-output-docx-dp                Output = Word (docx) template selector
//   045_43_reporting-output-any-format-dp          Output = XML/JSON/any text format
//   045_32_reporting-output-pdf-fop-dp             Output = PDF via XSL-FO, FOP template
//   045_65_reporting-generate-reports-dp           Generate Reports screen, report picked
//   043_35_ai-driven-fetch-data-report-params-dp   Runtime Report Parameters form (element)
//
// Capture order differs from doc order on purpose: the file-based data-source
// panels (CSV/Fixed-Width/Excel) and the Script data source are captured BEFORE
// the SQL Query data source, so the report ends configured as SQL-with-parameters
// — the state the Generate screen + runtime-parameters form (045_65 / 043_35)
// need. The Output-format shots settle LAST on FOP2PDF with a template pasted, so
// the report is left generate-ready.
//
// HOW TO RUN (only this block): set E2E_SPEC="reporting.screens.ts" and
// E2E_GREP="Reporting — docs screenshots — report-generation.mdx" in
// custom:start-server-and-e2e-electron-screens-grep, then run it.

const RG_CONNECTION_NAME = 'Northwind';
const RG_DB_VENDOR = 'sqlite';
const RG_CONNECTION_CODE = `db-${_.kebabCase(RG_CONNECTION_NAME)}-${RG_DB_VENDOR}`; // db-northwind-sqlite
const RG_REPORT_NAME = 'Employee Hires';
const RG_REPORT_CODE = _.kebabCase(RG_REPORT_NAME); // employee-hires

// Domain-grouped schema seed (Northwind Sales / Products / Customers) — copied
// from reporting.spec.ts `createDbConnection` so the "Generate … with AI
// (domain-grouped schema)" copilot shots (043_10 / 043_17) have real business
// domains to generate from.
const RG_DOMAIN_GROUPED_JSON = JSON.stringify(
  {
    domainGroups: [
      {
        // First + used by the AI shots (043_10/043_17) — matches the "Employee Hires" report.
        label: 'Human Resources',
        tables: [
          { tableName: 'Employees', columns: [{ name: 'EmployeeID' }, { name: 'FirstName' }, { name: 'LastName' }, { name: 'Title' }, { name: 'HireDate' }] },
        ],
      },
      {
        label: 'Sales',
        tables: [
          { tableName: 'Orders', columns: [{ name: 'OrderID' }, { name: 'CustomerID' }, { name: 'OrderDate' }] },
          { tableName: 'Order Details', columns: [{ name: 'OrderID' }, { name: 'ProductID' }, { name: 'Quantity' }] },
        ],
      },
      {
        label: 'Products',
        tables: [
          { tableName: 'Products', columns: [{ name: 'ProductID' }, { name: 'ProductName' }, { name: 'SupplierID' }, { name: 'CategoryID' }] },
          { tableName: 'Categories', columns: [{ name: 'CategoryID' }, { name: 'CategoryName' }] },
        ],
      },
      {
        label: 'Customers',
        tables: [{ tableName: 'Customers', columns: [{ name: 'CustomerID' }, { name: 'CompanyName' }, { name: 'ContactName' }] }],
      },
    ],
  },
  null,
  2,
);

// "Employee Hires" SQL — bundled SQLite Northwind, parametrised on hire date.
const RG_EMPLOYEE_HIRES_SQL = `SELECT
    "EmployeeID",
    "FirstName",
    "LastName",
    date("HireDate"/1000, 'unixepoch', 'localtime') AS "HireDate"
FROM "Employees"
WHERE date("HireDate"/1000, 'unixepoch', 'localtime') BETWEEN :startDate AND :endDate
ORDER BY "HireDate"
`;

// Report Parameters DSL — a start/end date pair (drives the runtime form shot).
const RG_PARAMS_SPEC = `import java.time.LocalDate

reportParameters {
  parameter(
    id:           'startDate',
    type:         LocalDate,
    label:        'Start Date',
    description:  'Report start date',
    defaultValue: LocalDate.now().minusDays(30)
  ) {
    constraints(required: true, min: LocalDate.now().minusDays(36500), max: endDate)
    ui(control: 'date', format: 'yyyy-MM-dd')
  }

  parameter(
    id:           'endDate',
    type:         LocalDate,
    label:        'End Date',
    defaultValue: LocalDate.now()
  ) {
    constraints(required: true, min: startDate, max: LocalDate.now())
    ui(control: 'date', format: 'yyyy-MM-dd')
  }
}
`;

// Additional data transformation — keep only employees hired after mid-1992.
const RG_TRANSFORM = `import java.util.stream.Collectors

log.info("Filtering for HireDate after June 1992...")

def filteredData = ctx.reportData.stream()
    .filter { row ->
        def hireDate = row['HireDate']?.toString()
        hireDate && hireDate > '1992-06-30'
    }
    .collect(Collectors.toList())

ctx.reportData = filteredData
if (!filteredData.isEmpty()) {
    ctx.reportColumnNames = new ArrayList<>(filteredData.get(0).keySet())
}
`;

// Groovy script data source — same Employees data via a script (for the 043_07
// "Script data source" shot).
const RG_GROOVY_SCRIPT = `import groovy.sql.Sql
import java.util.LinkedHashMap

def dbSql = ctx.dbSql

def sql = """
    SELECT
        "EmployeeID",
        "FirstName",
        "LastName",
        date("HireDate"/1000, 'unixepoch', 'localtime') AS "HireDate"
    FROM "Employees"
    ORDER BY "HireDate"
"""
def rows = dbSql.rows(sql)

def result = []
rows.each { row ->
  def m = new LinkedHashMap<String, Object>()
  m.putAll(row)
  result.add(m)
}
ctx.reportData = result
ctx.reportColumnNames = result.isEmpty() ? [] : new ArrayList<>(result[0].keySet())
`;

// Simple HTML template — used for the PDF(HTML)/XLSX/HTML output shots.
const RG_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Employee Hires</title>
  <style>
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #000; padding: 4px; text-align: center; }
    th { background: #f2f2f2; }
    .report-title { font-size: 16pt; font-weight: bold; text-align: center; margin: 15pt 0; }
  </style>
</head>
<body>
  <div class="report-title">Employee Hires</div>
  <table>
    <tr><th>Employee ID</th><th>First Name</th><th>Last Name</th><th>Hire Date</th></tr>
    <tr>
      <td>\${EmployeeID!}</td>
      <td>\${FirstName!}</td>
      <td>\${LastName!}</td>
      <td>\${HireDate!}</td>
    </tr>
  </table>
</body>
</html>
`;

// XSL-FO template — used for the FOP2PDF output shot (045_32).
const RG_FOP_TEMPLATE = `<fo:root xmlns:fo="http://www.w3.org/1999/XSL/Format">
  <fo:layout-master-set>
    <fo:simple-page-master master-name="A4"
      page-height="29.7cm" page-width="21cm"
      margin-top="1cm" margin-bottom="1cm" margin-left="1.5cm" margin-right="1.5cm">
      <fo:region-body/>
    </fo:simple-page-master>
  </fo:layout-master-set>
  <fo:page-sequence master-reference="A4">
    <fo:flow flow-name="xsl-region-body">
      <fo:block font-size="16pt" font-weight="bold" text-align="center" space-after="15pt">
        Employee Hires
      </fo:block>
      <fo:table table-layout="fixed" width="100%" font-size="10pt">
        <fo:table-column column-width="4cm"/>
        <fo:table-column column-width="5cm"/>
        <fo:table-column column-width="5cm"/>
        <fo:table-column column-width="4cm"/>
        <fo:table-body>
          <fo:table-row background-color="#f2f2f2">
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block font-weight="bold" text-align="center">Employee ID</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block font-weight="bold" text-align="center">First Name</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block font-weight="bold" text-align="center">Last Name</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block font-weight="bold" text-align="center">Hire Date</fo:block></fo:table-cell>
          </fo:table-row>
          <fo:table-row>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block text-align="center">\${EmployeeID!}</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block>\${FirstName!}</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block>\${LastName!}</fo:block></fo:table-cell>
            <fo:table-cell border="1pt solid black" padding="4pt"><fo:block>\${HireDate!}</fo:block></fo:table-cell>
          </fo:table-row>
        </fo:table-body>
      </fo:table>
    </fo:flow>
  </fo:page-sequence>
</fo:root>
`;

// FreeMarker → XML/any-text template for the output.any shot (045_43), so the editor
// shows a real template instead of the empty placeholder comment.
const RG_ANY_TEMPLATE = `<#-- FreeMarker template — XML output for the Employee Hires report -->
<Employee>
  <EmployeeID>\${EmployeeID!}</EmployeeID>
  <FirstName>\${FirstName!}</FirstName>
  <LastName>\${LastName!}</LastName>
  <Title>\${Title!}</Title>
  <HireDate>\${HireDate!}</HireDate>
</Employee>
`;

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — report-generation.mdx (Employee Hires)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;
    // A DOCX template we drop into the report's own folder just for the docx shot (045_42),
    // then remove in cleanup. DOCX templates are matched only from config/templates/reports/
    // <folder>/, so a fresh report has none; this gives the picker a real, correctly-named one.
    let injectedDocxPath: string | null = null;

    try {
      // ── SETUP: create a domain-grouped SQLite Northwind connection ───────────
      // (domain-grouped seed → the AI copilot "generate from domain-grouped
      // schema" shots have real Sales/Products/Customers domains). Mirrors
      // reporting.spec.ts createDbConnection('dbcon-domaingrouped-schema').
      console.log(`[SETUP] Creating ${RG_DB_VENDOR} connection "${RG_CONNECTION_NAME}" (domain-grouped)`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        RG_CONNECTION_NAME,
        RG_DB_VENDOR,
      );
      connectionCreated = true;

      await new FluentTester(firstPage)
        .clickAndSelectTableRow(`#${RG_CONNECTION_CODE}\\.xml`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnTestDbConnection', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnTestDbConnection', Constants.DELAY_HUNDRED_SECONDS)
        .sleep(Constants.DELAY_ONE_SECOND)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .waitOnElementToBecomeVisible('#tab-btn-domainGroupedDatabaseSchemaTab')
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeInvisible(
          'span:has-text("To load the schema, please ensure your connection details are configured")',
        )
        .waitOnElementToBecomeVisible('#btnToggleDomainGroupedCodeView')
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
        .setCodeJarContentSingleShot('#domainGroupedCodeEditor', RG_DOMAIN_GROUPED_JSON)
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
        .click('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── CAPTURE 045_05: Create Report modal, Report Generation capability ────
      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(RG_REPORT_NAME);
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('045_05_create-report-generation-template'),
        ['#spanCapReportGenerationMailMerge'],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('045_05_create-report-generation-template')}`);

      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // Drop a DOCX template into the report's OWN folder (real-life convention:
      // <report-folder>-template.docx, mirroring payslips/payslips-template.docx) BEFORE the
      // config loads, so the docx picker (045_42) finds + lists it naturally. Removed in cleanup.
      {
        const portableDir = process.env.PORTABLE_EXECUTABLE_DIR as string;
        const srcDocx = path.join(portableDir, 'samples', 'reports', 'payslips', 'payslips-template.docx');
        const destDir = path.join(portableDir, 'templates', 'reports', RG_REPORT_CODE);
        const destDocx = path.join(destDir, `${RG_REPORT_CODE}-template.docx`);
        try {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(srcDocx, destDocx);
          injectedDocxPath = destDocx;
          console.log(`[SETUP] injected docx template for the docx shot: ${destDocx}`);
        } catch (e) {
          console.warn('[SETUP] could not inject docx template (045_42 may show "no templates"):', e);
        }
      }

      // ── Load the report, open Reporting Settings ─────────────────────────────
      await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), RG_REPORT_CODE)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes');

      // ── CAPTURE 045_10: Reporting Settings landing — ring the top Configuration
      // menu + the left Reporting menu (matches the original's point). The top one is
      // inset (it sits flush against the sticky header edge, which clips an outer ring).
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('045_10_reporting-configuration'),
        [{ selector: '#topMenuConfiguration', inset: true }, '#leftMenuReportingSettings'],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('045_10_reporting-configuration')}`);

      // ── CAPTURE 045_15 / 045_20 / 045_25: file-based data-source panels ──────
      // Done BEFORE SQL so the report ends configured as SQL-with-parameters.
      // CSV: expand "Show More CSV Options" so the extra options (Quotation/Escape
      // Char, Strict/Ignore Quotations, Trim Whitespaces) are visible — matches the
      // original's point.
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.csvfile')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#lblShowMoreCsvOptions')
        .waitOnElementToBecomeVisible('#quotationChar')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_15_reporting-datasource-csv-file'));
      console.log(`[capture] ${dp('045_15_reporting-datasource-csv-file')}`);

      // Fixed-Width: expand "Show More Fixed Width Options" (ID Column, Trim Whitespaces).
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.fixedwidthfile')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#lblShowMoreFixedWidthOptions')
        .waitOnElementToBecomeVisible('#fixedWidthIdColumn')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_20_reporting-datasource-fixed-width-file'));
      console.log(`[capture] ${dp('045_20_reporting-datasource-fixed-width-file')}`);

      // Excel: expand "Show More Excel Options" (ID Column, Trim Whitespaces, Use Formula Results).
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.excelfile')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#lblShowMoreExcelOptions')
        .waitOnElementToBecomeVisible('#excelIdColumn')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_25_reporting-datasource-excel-file'));
      console.log(`[capture] ${dp('045_25_reporting-datasource-excel-file')}`);

      // ── CAPTURE 043_07: Script data source + "Hey AI" script button ──────────
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .waitOnElementToContainText('#databaseConnection', RG_CONNECTION_NAME)
        .setCodeJarContentSingleShot('#groovyScriptEditor', RG_GROOVY_SCRIPT)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('043_07_ai-driven-fetch-data-script-datasource'),
        [{ selector: '#btnHelpWithScriptAI', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('043_07_ai-driven-fetch-data-script-datasource')}`);

      // ── CAPTURE 043_17: AI copilot — generate script from domain-grouped ─────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnHelpWithScriptAI')
        .click('#btnHelpWithScriptAI')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
        .waitOnElementToBecomeVisible('#chooseTableLabelDomainGroupedSchema')
        .click('#treeNodedomain_human_resourcessourceTreedomainGroupedSchemaPicklist')
        .click('#btnMoveToTargetdomainGroupedSchemaPicklist')
        .waitOnElementToBecomeInvisible('#chooseTableLabelDomainGroupedSchema')
        .waitOnElementToBecomeEnabled('#btnGenerateSqlQueryWithAIDomainGroupedSchema')
        .click('#btnGenerateSqlQueryWithAIDomainGroupedSchema')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .sleep(Constants.DELAY_ONE_SECOND);
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('043_17_ai-driven-fetch-data-generate-script'));
      console.log(`[capture] ${dp('043_17_ai-driven-fetch-data-generate-script')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText')
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      // ── CAPTURE 043_05: SQL Query data source + "Hey AI" SQL button ──────────
      // SQL is set LAST among data sources so the report is left as SQL-with-params.
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery')
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .waitOnElementToContainText('#databaseConnection', RG_CONNECTION_NAME)
        .setCodeJarContentSingleShot('#sqlQueryEditor', RG_EMPLOYEE_HIRES_SQL)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('043_05_ai-driven-fetch-data-sql-query'),
        [{ selector: '#btnHelpWithSqlQueryAI', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('043_05_ai-driven-fetch-data-sql-query')}`);

      // ── CAPTURE 043_25: Report Parameters sub-tab ────────────────────────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#tab-btn-tabSqlReportParameters')
        .click('#tab-btn-tabSqlReportParameters')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeVisible('#paramsSpecEditor')
        .setCodeJarContentSingleShot('#paramsSpecEditor', RG_PARAMS_SPEC)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('043_25_ai-driven-fetch-data-report-parameters'),
        [{ selector: '#btnAiHelpParamsSpecSqlInTab', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('043_25_ai-driven-fetch-data-report-parameters')}`);
      await new FluentTester(firstPage)
        .click('#tab-btn-tabSqlCode')
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .sleep(Constants.DELAY_ONE_SECOND);

      // ── CAPTURE 045_28: BOTH "Show More SQL Options" AND "Additional Data
      // Transformation" expanded — the shot's point is "advanced options &
      // transformations", so both panels must be open. ────────────────────────
      await new FluentTester(firstPage)
        .click('#lblShowMoreSqlOptions')
        .waitOnElementToBecomeVisible('#sqlIdColumn')
        .click('#lblShowAdditionalTransformation')
        .waitOnElementToBecomeVisible('#transformationCodeEditor')
        .setCodeJarContentSingleShot('#transformationCodeEditor', RG_TRANSFORM)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_28_reporting-datasource-more-options-data-transformations'));
      console.log(`[capture] ${dp('045_28_reporting-datasource-more-options-data-transformations')}`);

      // ── CAPTURE 045_29: the AI Copilot prompt for "Additional Data Transformation"
      // (Script Writing Assistance → the Groovy transformation prompt, expanded). ──
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnHelpWithTransformationAI')
        .click('#btnHelpWithTransformationAI')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .sleep(Constants.DELAY_ONE_SECOND);
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_29_reporting-datasource-data-transformations-ai-prompt'));
      console.log(`[capture] ${dp('045_29_reporting-datasource-data-transformations-ai-prompt')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // ── CAPTURE 043_10: domain-grouped schema picklist + "Generate SQL Query
      // with Help From AI" button (the entry point — BEFORE the copilot opens; the
      // copilot prompt modal itself is 043_17). Matches the original's point. ─────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnHelpWithSqlQueryAI')
        .click('#btnHelpWithSqlQueryAI')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
        .waitOnElementToBecomeVisible('#chooseTableLabelDomainGroupedSchema')
        .click('#treeNodedomain_human_resourcessourceTreedomainGroupedSchemaPicklist')
        .click('#btnMoveToTargetdomainGroupedSchemaPicklist')
        .waitOnElementToBecomeInvisible('#chooseTableLabelDomainGroupedSchema')
        .waitOnElementToBecomeEnabled('#btnGenerateSqlQueryWithAIDomainGroupedSchema')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('043_10_ai-driven-fetch-data-generate-sql-using-domain-grouped-schema'),
        [{ selector: '#btnGenerateSqlQueryWithAIDomainGroupedSchema', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('043_10_ai-driven-fetch-data-generate-sql-using-domain-grouped-schema')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      // ── Output Template tab — capture every output format ────────────────────
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .sleep(Constants.DELAY_ONE_SECOND);

      // 045_30 — PDF (HTML → PDF); paste an HTML template so the editor isn't empty
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.pdf')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', RG_HTML_TEMPLATE)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_30_reporting-output-pdf-html'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_30_reporting-output-pdf-html')}`);

      // 045_31 — the AI Copilot prompt gallery for PDF (opened via "Hey AI, Help Me
      // Build This..." on the PDF output; lands on "PDF Generation (from HTML)"). ──
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnAskAiForHelpOutput')
        .click('#btnAskAiForHelpOutput')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .sleep(Constants.DELAY_ONE_SECOND);
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_31_reporting-output-pdf-ai-prompts'));
      console.log(`[capture] ${dp('045_31_reporting-output-pdf-ai-prompts')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // 045_35 — Excel (xlsx)
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.xlsx')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_35_reporting-output-xlsx'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_35_reporting-output-xlsx')}`);

      // 045_37 — the Excel AI prompt, expanded, with its [ ... ] customization
      // placeholders auto-highlighted in-app (a single shot that replaces the old
      // orig+custom pair 045_37/045_39 — no manual Notepad++ marking needed).
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnAskAiForHelpOutput')
        .click('#btnAskAiForHelpOutput')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .waitOnElementToBecomeVisible('#aiPromptExpandedText')
        .sleep(Constants.DELAY_ONE_SECOND);
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_37_reporting-output-xlsx-ai-prompt'));
      console.log(`[capture] ${dp('045_37_reporting-output-xlsx-ai-prompt')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // 045_40 — HTML
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.html')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_40_reporting-output-html'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_40_reporting-output-html')}`);

      // 045_42 — Word (docx): select the real DOCX template we dropped into the report
      // folder at setup, so the selector + its theme-styled path render as a configured
      // docx report (the earlier white-on-white path is fixed by theme-aware styling).
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.docx')
        .waitOnElementToBecomeVisible('#selectTemplateFile')
        .click('#selectTemplateFile')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${RG_REPORT_CODE}-template.docx")`)
        .click(`span.ng-option-label:has-text("${RG_REPORT_CODE}-template.docx")`)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_42_reporting-output-docx'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_42_reporting-output-docx')}`);

      // 045_43 — XML / JSON / any text format: paste a real FreeMarker template so the
      // editor shows content (not just the empty placeholder comment).
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.any')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', RG_ANY_TEMPLATE)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_43_reporting-output-any-format'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_43_reporting-output-any-format')}`);

      // 045_32 — PDF via XSL-FO (settle here so the report is left generate-ready)
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.fop2pdf')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(2 * Constants.DELAY_ONE_SECOND)
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', RG_FOP_TEMPLATE)
        .sleep(2 * Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(firstPage, dp('045_32_reporting-output-pdf-fop'), [{ selector: '#btnAskAiForHelpOutput', inset: true }], DOCS_IMAGES_DIR);
      console.log(`[capture] ${dp('045_32_reporting-output-pdf-fop')}`);

      // ── CAPTURE 045_65 / 043_35: Generate Reports screen + runtime params ────
      await new FluentTester(firstPage)
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${RG_REPORT_NAME} (input SQL Query)")`)
        .click(`span.ng-option-label:has-text("${RG_REPORT_NAME} (input SQL Query)")`)
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#startDate')
        .setValue('#startDate', '1991-01-01')
        .sleep(Constants.DELAY_ONE_SECOND)
        // Clear the leftover setup logs (connection test / schema fetch) so the Info Log
        // Preview is clean in the shot.
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('045_65_reporting-generate-reports'));
      console.log(`[capture] ${dp('045_65_reporting-generate-reports')}`);

      await captureDocsScreenshotOfElement(
        firstPage,
        dp('043_35_ai-driven-fetch-data-report-params'),
        '#formReportParameters',
        { targetWidth: 900 },
      );
      console.log(`[capture] ${dp('043_35_ai-driven-fetch-data-report-params')}`);

      console.log('[DONE] All report-generation.mdx screenshots captured.');
      bodySucceeded = true;
    } finally {
      // ── CLEANUP — mirror BLOCK 1: neutral nav, delete report + connection,
      // rethrow only when the body succeeded so a real failure stays reported.
      const cleanupErrors: string[] = [];

      // Remove the DOCX template we dropped in for the docx shot (deleteTemplate below
      // removes the whole report folder anyway, but unlink first so it's gone even if
      // report deletion is skipped).
      if (injectedDocxPath) {
        try { fs.unlinkSync(injectedDocxPath); } catch (e) { /* already gone / folder removed */ }
      }

      try {
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

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
          await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), RG_REPORT_CODE);
        } catch (e) {
          cleanupErrors.push(`delete report ${RG_REPORT_CODE}: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${RG_CONNECTION_CODE}\\.xml`,
            RG_DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${RG_CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(`Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3b — ai-powered-reporting.mdx  ("Employee Hires" AI walkthrough)
// ─────────────────────────────────────────────────────────────────────────────
//
// Re-captures the app screenshots UNIQUE to
//   content/docs/report-generation/ai-powered-reporting.mdx
// that BLOCK 3 does not already produce. This page tells the same Employee Hires
// story but ACTUALLY RUNS the report, so this block drives the full SQL flow
// (test query → Tabulator results → generate → output files) exactly like
// reporting.spec.ts `configureAndRunReportGeneration2` and captures along the way.
//
// Shared with BLOCK 3 (NOT re-captured here — the page reuses those -dp files):
//   043_05 (SQL data source), 043_10 (AI generate SQL / domain-grouped),
//   043_25 (Report Parameters), 043_35 (runtime parameters form).
// The "Hey AI, Help Me..." button (041_00) is now the reusable dark-theme SVG
//   /images/common/hey-ai-button.svg — no screenshot needed.
// Shot → state mapping (docs ROOT images dir):
//   043_00_ai-driven-fetch-data-report-new-dp        Create Report modal (capability ringed)
//   043_15_ai-driven-fetch-data-generate-sql-dp      AI copilot modal — generate SQL from the
//                                                    (plain) database schema
//   043_20_ai-driven-fetch-data-generate-sql-ai-prompt-custom-dp
//                                                    Same prompt, scrolled to its editable placeholder
//   043_30_ai-driven-fetch-data-test-sql-query-dp    "Test SQL Query" confirmation dialog
//   043_40_ai-driven-fetch-data-tabulator-query-results-dp
//                                                    Tabulator tab — the parametrised query rows
//   044_00_ai-driven-template-dp                     Output Template tab — output type + template
//   044_05_ai-driven-template-ai-prompt-template-generation-dp
//                                                    Output-template AI prompt (auto-expanded)
//   044_10_ai-driven-report-execution-dp             Generate Reports — Burst run + View Data
//                                                    (the fetched-rows grid + the run's logs)
//
// HOW TO RUN (only this block): set E2E_SPEC="reporting.screens.ts" and
// E2E_GREP="Reporting — docs screenshots — ai-powered-reporting.mdx".

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — ai-powered-reporting.mdx (Employee Hires)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: domain-grouped SQLite Northwind connection (same as BLOCK 3) ──
      console.log(`[SETUP] Creating ${RG_DB_VENDOR} connection "${RG_CONNECTION_NAME}" (domain-grouped)`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        RG_CONNECTION_NAME,
        RG_DB_VENDOR,
      );
      connectionCreated = true;

      await new FluentTester(firstPage)
        .clickAndSelectTableRow(`#${RG_CONNECTION_CODE}\\.xml`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnTestDbConnection', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnTestDbConnection', Constants.DELAY_HUNDRED_SECONDS)
        .sleep(Constants.DELAY_ONE_SECOND)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .waitOnElementToBecomeVisible('#tab-btn-domainGroupedDatabaseSchemaTab')
        .click('#tab-btn-domainGroupedDatabaseSchemaTab')
        .waitOnElementToBecomeInvisible(
          'span:has-text("To load the schema, please ensure your connection details are configured")',
        )
        .waitOnElementToBecomeVisible('#btnToggleDomainGroupedCodeView')
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
        .setCodeJarContentSingleShot('#domainGroupedCodeEditor', RG_DOMAIN_GROUPED_JSON)
        .click('#btnToggleDomainGroupedCodeView')
        .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
        .click('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── CAPTURE 043_00: Create Report modal ──────────────────────────────────
      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(RG_REPORT_NAME);
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('043_00_ai-driven-fetch-data-report-new'),
        ['#spanCapReportGenerationMailMerge'],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('043_00_ai-driven-fetch-data-report-new')}`);

      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // ── Load report, Reporting Settings, SQL data source + parameters ────────
      await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), RG_REPORT_CODE)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery')
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .waitOnElementToContainText('#databaseConnection', RG_CONNECTION_NAME)
        .setCodeJarContentSingleShot('#sqlQueryEditor', RG_EMPLOYEE_HIRES_SQL)
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeEnabled('#tab-btn-tabSqlReportParameters')
        .click('#tab-btn-tabSqlReportParameters')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeVisible('#paramsSpecEditor')
        .setCodeJarContentSingleShot('#paramsSpecEditor', RG_PARAMS_SPEC)
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-tabSqlCode')
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .sleep(Constants.DELAY_ONE_SECOND);

      // ── CAPTURE 043_15: AI copilot — generate SQL from the database schema ───
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnHelpWithSqlQueryAI')
        .click('#btnHelpWithSqlQueryAI')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .click('#tab-btn-databaseSchemaTab')
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer')
        .waitOnElementToBecomeVisible('#btnGenerateWithAIDbSchema')
        .elementShouldBeDisabled('#btnGenerateWithAIDbSchema')
        .click('#treeNodecategoriessourceTreedatabaseSchemaPicklist')
        .click('#treeNodeproductssourceTreedatabaseSchemaPicklist')
        .click('#btnMoveToTargetdatabaseSchemaPicklist')
        .waitOnElementToBecomeInvisible('#chooseTableLabelDbSchema')
        .waitOnElementToBecomeEnabled('#btnGenerateWithAIDbSchema')
        .click('#btnGenerateWithAIDbSchema')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .sleep(Constants.DELAY_ONE_SECOND);
      // Scroll the generated prompt so its amber [ ... ] placeholder is in view —
      // the customizable part the legacy shot boxed by hand. Without this the
      // capture lands on the prompt's top and the placeholder sits below the fold.
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('043_15_ai-driven-fetch-data-generate-sql'));
      console.log(`[capture] ${dp('043_15_ai-driven-fetch-data-generate-sql')}`);

      // ── CAPTURE 043_20: same copilot, scrolled to the customizable [ ... ] ───
      // placeholder — the new UI auto-highlights it in amber (mark.ai-prompt-
      // placeholder), the latest-UI equivalent of the legacy shot's hand-drawn box
      // around the business requirement. Full-window, like 043_15 / 043_17.
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, dp('043_20_ai-driven-fetch-data-generate-sql-ai-prompt-custom'));
      console.log(`[capture] ${dp('043_20_ai-driven-fetch-data-generate-sql-ai-prompt-custom')}`);

      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText')
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      // ── CAPTURE 043_30: "Test SQL Query" confirmation dialog ─────────────────
      // The FIRST Test click only raises the "Log files are not empty — press
      // Clear Logs first" info dialog, so dismiss it, clear the logs, then click
      // Test AGAIN — THAT raises the real "test the SQL query?" confirmation,
      // which is the shot the doc wants (not the clear-logs notice).
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#btnTestSqlQuery')
        .click('#btnTestSqlQuery')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestSqlQuery')
        .confirmDialogShouldBeVisible();
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, dp('043_30_ai-driven-fetch-data-test-sql-query'));
      console.log(`[capture] ${dp('043_30_ai-driven-fetch-data-test-sql-query')}`);

      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeVisible('#btnTestQueryRun')
        .waitOnElementToBecomeEnabled('#startDate')
        .setValue('#startDate', '1991-01-01')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeEnabled('#btnTestQueryRun')
        .click('#btnTestQueryRun');

      // ── CAPTURE 043_40: Tabulator tab — parametrised query results ───────────
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveData()
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, dp('043_40_ai-driven-fetch-data-tabulator-query-results'));
      console.log(`[capture] ${dp('043_40_ai-driven-fetch-data-tabulator-query-results')}`);

      // ── CAPTURE 044_00: Output Template tab — output type + template ─────────
      await new FluentTester(firstPage)
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.fop2pdf')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(2 * Constants.DELAY_ONE_SECOND)
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', RG_FOP_TEMPLATE)
        .sleep(2 * Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('044_00_ai-driven-template'),
        // Ring the "Hey AI, Help Me Build This FOP2PDF Template!" button — inset
        // because it sits flush at the top-right of the tab (an outside ring clips).
        [{ selector: '#btnAskAiForHelpOutput', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('044_00_ai-driven-template')}`);

      // ── CAPTURE 044_05: the output-template AI prompt ────────────────────────
      // "Hey AI, Help Me..." on the Output Template tab launches the AI Copilot
      // with the PDF (XSL-FO) "Sample A4 Payslip" template prompt auto-expanded
      // (askAiForHelp → launchWithConfiguration sets isModalVisible +
      // initialExpandedPromptId=PDF_SAMPLE_A4_PAYSLIP_XSLFO). Scroll the amber
      // placeholder into view, capture the full copilot view (title + prompt), close.
      await new FluentTester(firstPage)
        .click('#btnAskAiForHelpOutput')
        .waitOnElementToBecomeVisible('#aiPromptExpandedText')
        .waitOnElementToBecomeVisible('#btnCopyPromptText')
        .sleep(Constants.DELAY_ONE_SECOND);
      await scrollPromptPlaceholderIntoView(firstPage);
      await firstPage.waitForTimeout(300);
      await captureDocsScreenshot(firstPage, dp('044_05_ai-driven-template-ai-prompt-template-generation'));
      console.log(`[capture] ${dp('044_05_ai-driven-template-ai-prompt-template-generation')}`);
      await new FluentTester(firstPage)
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCopyPromptText');

      // ── CAPTURE 044_10: Generate Reports — View Data (rows grid + logs) ───────
      // Match the legacy shot (the fetched rows + the Info Log Preview). View Data
      // refuses to run while the log file is non-empty: the FIRST click raises a
      // "clear the logs first" notice, so dismiss it, Clear Logs, then View Data
      // again — now the rows fill the grid and the query-run logs fill the preview.
      // Proven flow, lifted verbatim from reporting.spec.ts `testViewData`.
      // (NOTE: because View Data insists on an empty log, a data grid and PRIOR
      // burst logs can't share one shot — these are View Data's own run logs. The
      // old 044_15 "output files" shot is dropped: it's a static file list.)
      await new FluentTester(firstPage)
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${RG_REPORT_NAME} (input SQL Query)")`)
        .click(`span.ng-option-label:has-text("${RG_REPORT_NAME} (input SQL Query)")`)
        .waitOnElementToBecomeEnabled('#startDate')
        .setValue('#startDate', '1991-01-01')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeEnabled('#btnViewData')
        .click('#btnViewData')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnViewData')
        .clickYesDoThis()
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveData()
        .sleep(2 * Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(600);
      await captureDocsScreenshot(firstPage, dp('044_10_ai-driven-report-execution'));
      console.log(`[capture] ${dp('044_10_ai-driven-report-execution')}`);

      console.log('[DONE] All ai-powered-reporting.mdx screenshots captured.');
      bodySucceeded = true;
    } finally {
      const cleanupErrors: string[] = [];

      try {
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

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
          await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), RG_REPORT_CODE);
        } catch (e) {
          cleanupErrors.push(`delete report ${RG_REPORT_CODE}: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${RG_CONNECTION_CODE}\\.xml`,
            RG_DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${RG_CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(`Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — VIDEO frames for the 0010-report-generation video (Customer Invoices → PDF)
// ─────────────────────────────────────────────────────────────────────────────
//
// Feeds the `0010-report-generation` Remotion video (Zeus teaches Leo to
// configure & generate a report). Unlike the docs -dp shots above, these are
// NEAR-FULL-FRAME captures with NO annotation rings — in the video the character
// heads + camera zoom do the pointing. They are written into the cli-remotion
// assets folder, not the docs repo.
//
// Story payoff = the bundled "Customer Invoices" sample (Northwind Orders for the two
// sample customers ALFKI + ANATR — no seeding, runs against the bundled Northwind DB)
// but with a professional Apache FOP PDF output (output.fop2pdf) instead of the plain
// HTML template. The script maps Northwind into the field shape the large-scale
// "Northwind Traders" invoice design expects, so that polished design renders on our
// own data. Shipped sources:
//   e2e/_resources/screenshots/docs/invoice-report-script.groovy  (Northwind → invoice fields)
//   e2e/_resources/screenshots/docs/invoice-fop-template.xsl      (large-scale FOP design)
//
// Frame → state mapping (written to cli-remotion/.../0010-report-generation/):
//   rg_10_create-invoice-report.png     Create Report modal, "Customer Invoices"
//   rg_18_datasource-tab.png            The DataSource TAB button itself, ringed
//   rg_20_invoice-script-datasource.png Script data source with the invoice master-details Groovy
//   rg_21_datasource-inputtype-expanded.png  Input Type (#dsTypes) list OPEN — every supported source
//   rg_22_datasource-inputtype-database.png  Datasource tab — Input Type (#dsTypes) + Database (#databaseConnection) ringed
//   rg_24_datasource-hey-ai.png         Datasource tab — "Hey AI, Help Me With This Groovy Script" ringed
//   rg_26_datasource-run-test-script.png  Datasource tab — "Run / Test Script" (#btnTestScript) ringed
//   rg_28_output-type-expanded.png      Output Type (#reportOutputType) list OPEN — every supported output
//   rg_30_invoice-output-pdf.png        Output Template tab — output = PDF (Apache FOP), XSL-FO template
//   rg_32_output-fop-hey-ai.png         Output Template tab — "Hey AI, Help Me …" ringed
//   rg_35_invoice-template-preview.png  Output Template tab, editor scrolled to the invoice table/totals
//   rg_40_invoice-generate.png          Generate Reports screen, report picked, ready
//   rg_50_invoice-viewdata.png          View Data — the invoice rows in the grid
//   rg_60_invoice-output-files.png      The Generate screen right after the run — the LOGS pane, populated.
//                                       (Historic name: it does NOT show the output files. The video uses it
//                                        as the "logs stream live" beat, which is what it actually shows.)
//
// The video ALSO needs frames this block does not produce yet: rg_64 (a real
// generated invoice PDF, opened) and the Samples set rg_70/72/74/76/78/80.
// Until they exist the video draws a labelled placeholder naming each file.
//
// HOW TO RUN (only this block): set E2E_SPEC="reporting.screens.ts" and
// E2E_GREP="Reporting — video frames — report-generation".

// cli-remotion assets dir for the 0010 video. DOCS_IMAGES_DIR is
// …/reportburster.com/public/images/docs → 4 hops up land on …/www, then across
// into cli-remotion.
const VIDEO_ASSETS_DIR = path.resolve(
  DOCS_IMAGES_DIR, '..', '..', '..', '..',
  'cli-remotion', 'public', 'assets', 'rb', '0010-report-generation',
);

const RG_INVOICE_REPORT_NAME = 'Customer Invoices';
const RG_INVOICE_REPORT_CODE = _.kebabCase(RG_INVOICE_REPORT_NAME); // customer-invoices

// Resource files carrying the verbatim large-scale invoice assets from
// blog/mysql-large-scale-report-generation.mdx. Kept as files (not TS literals) so
// their FreeMarker ${…} needs no escaping and they can't silently drift from the doc.
const RG_RES_DIR = path.resolve(__dirname, '..', '..', '..', '_resources', 'screenshots', 'docs');

// The invoice report's Groovy data script — reads Northwind Orders/Customers/Order
// Details for the two sample customers (ALFKI + ANATR), nests each order's line items,
// and emits the field names the professional Apache FOP invoice template expects. No
// seeding needed: it runs against the bundled Northwind sample DB. See the resource file.
const RG_INVOICE_SCRIPT = fs.readFileSync(
  path.join(RG_RES_DIR, 'invoice-report-script.groovy'),
  'utf8',
);

// The invoice OUTPUT template — Apache FOP (XSL-FO), the output.fop2pdf path.
// The professional "Northwind Traders" invoice design from the large-scale blog
// (SVG logo, Bill To, striped line-item table, totals + TOTAL DUE, payment info),
// fed by RG_INVOICE_SCRIPT above which supplies exactly these fields from Northwind.
// FreeMarker runs first (${…}/<#…> per invoice token), then Apache FOP renders to PDF.
const RG_INVOICE_TEMPLATE = fs.readFileSync(
  path.join(RG_RES_DIR, 'invoice-fop-template.xsl'),
  'utf8',
);

/* Expand a NATIVE <select> INLINE so a screenshot can actually see its options.

   A native <select>'s dropdown is painted by the OS, outside the page — no
   screenshot can ever capture it. The fix (lifted from connections.screens.ts,
   which solved this for #dbType) is to turn the control into an inline listbox
   via `size`, and defeat the two daisyUI rules that would clip that to ~1 row:
   `.select` pins a fixed height and `appearance:none`. The options are painted
   with the theme tokens so the listbox matches the dark app, and it is floated
   over the fields below so it still reads as a popup.

   Only the injected <style> and the `size` attribute are touched — always pair
   this with restoreNativeSelectAfterShot so later frames see a normal control. */
async function expandNativeSelectForShot(page: Page, id: string) {
  await page.evaluate((selId) => {
    const sel = document.getElementById(selId) as HTMLSelectElement | null;
    if (!sel) return;
    const width = Math.round(sel.getBoundingClientRect().width);
    sel.dataset.prevSize = String(sel.size ?? 0);
    sel.size = sel.options.length; // expand every option inline
    const style = document.createElement('style');
    style.id = `__${selId}_open_hl`;
    style.textContent =
      `#${selId}{` +
        'appearance:auto !important;-webkit-appearance:auto !important;' +
        'height:auto !important;min-height:0 !important;max-height:none !important;' +
        'overflow:visible !important;background-image:none !important;' +
        'position:absolute !important;z-index:50 !important;' +
        `width:${width}px !important;` +
        'box-shadow:0 10px 26px rgba(0,0,0,0.6) !important;' +
      '}' +
      `#${selId} option{background-color:var(--color-base-100,#1d232a);` +
        'color:var(--color-base-content,#a6adbb);padding:3px 10px}' +
      `#${selId} option:checked{background:#0f6cbd !important;color:#fff !important}`;
    document.head.appendChild(style);
  }, id);
}

/* Undo expandNativeSelectForShot — restores the original `size` and drops the
   injected rule, so the control behaves normally for every later interaction. */
async function restoreNativeSelectAfterShot(page: Page, id: string) {
  await page.evaluate((selId) => {
    const sel = document.getElementById(selId) as HTMLSelectElement | null;
    if (sel) {
      sel.size = Number(sel.dataset.prevSize ?? '0') || 0;
      delete sel.dataset.prevSize;
    }
    document.getElementById(`__${selId}_open_hl`)?.remove();
  }, id);
}

electronBeforeAfterAllTest(
  'Reporting — video frames — report-generation (Customer Invoices → PDF Apache FOP)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: plain SQLite Northwind connection (the script uses ctx.dbSql
      // directly, so no cached schema / domain groups are needed) ──────────────
      console.log(`[SETUP] Creating ${RG_DB_VENDOR} connection "${RG_CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        RG_CONNECTION_NAME,
        RG_DB_VENDOR,
      );
      connectionCreated = true;

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── FRAME rg_10: Create Report modal ─────────────────────────────────────
      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(RG_INVOICE_REPORT_NAME);
      await firstPage.waitForTimeout(300);
      // Ring the Report Generation capability — the one step people miss, and the
      // one that decides whether this is a report at all. The ring goes on the
      // WRAPPER SPAN, not #btnCapReportGenerationMailMerge: the id is on the bare
      // <input>, so ringing it would draw a ring around a 13px box and leave the
      // "Report Generation & Dashboards" label outside it. The span holds both.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_10_create-invoice-report.png',
        [{ selector: '#spanCapReportGenerationMailMerge' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_10_create-invoice-report.png');

      await new FluentTester(firstPage)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // ── Load the report — STEP BY STEP, because the video teaches it that way ─
      // This mirrors ConfigurationTestHelper.loadConfiguration's non-'burst'
      // branch EXACTLY (row → Load invite → Yes), guard for guard. It is spelled
      // out rather than called because the video needs a frame BETWEEN the
      // confirm appearing and the Yes being pressed, which the helper's single
      // chain gives no seam for. If that helper's flow ever changes, this must
      // change with it.
      const RG_ROW = `#${RG_INVOICE_REPORT_CODE}_${PATHS.SETTINGS_CONFIG_FILE}`;
      const RG_LOAD_INVITE = `#btnLoadInvite_${RG_INVOICE_REPORT_CODE}_${PATHS.SETTINGS_CONFIG_FILE}`;
      const RG_LOAD_YES = `#btnLoadConfirmYes_${RG_INVOICE_REPORT_CODE}_${PATHS.SETTINGS_CONFIG_FILE}`;

      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click(RG_ROW)
        .waitOnElementToBecomeVisible(RG_LOAD_INVITE)
        .click(RG_LOAD_INVITE)
        .waitOnElementToBecomeVisible(RG_LOAD_YES);
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
      await firstPage.waitForTimeout(300);

      // ── FRAME rg_14: the reports list, our report picked, "Load? Yes/No" up ──
      // Zeus tells Leo which menu got him here and to press Yes.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_14_load-report-confirm.png',
        [{ selector: RG_LOAD_YES }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_14_load-report-confirm.png');

      await new FluentTester(firstPage)
        .click(RG_LOAD_YES)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND);
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      await new FluentTester(firstPage)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes');
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
      await firstPage.waitForTimeout(400);

      // ── FRAME rg_16: the left "Reporting" entry, ALREADY OPEN ───────────────
      // The payoff of ticking Report Generation in the Create modal: this entry
      // only exists because of it. Shot AFTER the click, so the frame shows the
      // settings it opens rather than whatever screen preceded it.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_16_reporting-left-menu.png',
        [{ selector: '#leftMenuReportingSettings' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_16_reporting-left-menu.png');

      // ── FRAME rg_19: the Input Type field, ringed and still CLOSED ──────────
      // Zeus names the field before opening it — the progression skips no step.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_19_datasource-inputtype-closed.png',
        [{ selector: '#dsTypes' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_19_datasource-inputtype-closed.png');

      // ── FRAME rg_18: the DataSource TAB, on the DEFAULT screen ──────────────
      // Captured BEFORE anything is configured: the video introduces the tab
      // before its contents, so the frame must show what DataPallas shows on
      // first open — not a finished screen.
      // INSET ring, not the outer one: the outer ring gets CLIPPED here — the
      // sticky top-menu header overpaints its top edge and only 2 of the 4 sides
      // survive. docs-screenshot-helper documents the tab buttons as exactly this
      // case ("targets flush against a clipping boundary the outside ring can't
      // escape"), and inset is always fully visible.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_18_datasource-tab.png',
        [{ selector: '#tab-btn-reportingDataSourceDataTablesTab', inset: true }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_18_datasource-tab.png');

      // ── Pick Script FIRST, so the open list highlights OUR value ─────────────
      // The expanded <select> paints its currently-SELECTED option blue. If we
      // expand while the default (CSV) is selected, the video zooms onto a choice
      // we never make. So we choose Script now: the list still shows every source
      // (the "everything you would expect" line holds), but the highlighted row is
      // Script — the one we are actually configuring.
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .waitOnElementToContainText('#databaseConnection', RG_CONNECTION_NAME);
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── FRAME rg_21: the Input Type list OPEN — Script highlighted, all sources
      // still visible. #dsTypes is a NATIVE <select> whose dropdown the OS paints
      // (a screenshot can never see it), so we expand the listbox INLINE via
      // `size` (the connections.screens.ts trick), then undo it.
      await expandNativeSelectForShot(firstPage, 'dsTypes');
      await firstPage.waitForTimeout(250);
      await captureDocsScreenshot(firstPage, 'rg_21_datasource-inputtype-expanded.png', VIDEO_ASSETS_DIR);
      await restoreNativeSelectAfterShot(firstPage, 'dsTypes');
      console.log('[frame] rg_21_datasource-inputtype-expanded.png');
      await firstPage.waitForTimeout(400);

      // ── FRAME rg_22: Input Type ALONE ───────────────────────────────────────
      // Split from the old combined shot: one ring per idea, so the camera can
      // land on the thing being talked about instead of on a frame wearing two
      // rings while only one is being discussed. Editor still empty on purpose —
      // this beat is "we pick Script", the script itself is the NEXT beat.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_22_datasource-inputtype.png',
        [{ selector: '#dsTypes' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_22_datasource-inputtype.png');

      // ── Paste the invoice script ────────────────────────────────────────────
      await new FluentTester(firstPage)
        .setCodeJarContentSingleShot('#groovyScriptEditor', RG_INVOICE_SCRIPT)
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, 'rg_20_invoice-script-datasource.png', VIDEO_ASSETS_DIR);
      console.log('[frame] rg_20_invoice-script-datasource.png');

      // ── FRAME rg_24: datasource tab, "Hey AI, Help Me With This Groovy Script" ──
      // ringed on its own (inset — the button is wide, an outside ring would clip).
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_24_datasource-hey-ai.png',
        [{ selector: '#btnHelpWithScriptAI', inset: true }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_24_datasource-hey-ai.png');

      // ── FRAME rg_26: "Run / Test Script" ringed ──────────────────────────────
      // Zeus's point: you can prove the script works before generating anything,
      // and pressing it is safe because a report only reads.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_26_datasource-run-test-script.png',
        [{ selector: '#btnTestScript', inset: true }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_26_datasource-run-test-script.png');

      // ── FRAME rg_23: the Database Connection ALONE ──────────────────────────
      // The other half of the old combined rg_22. Captured LAST of the datasource
      // set so the script is already filled in: this beat plays after the script
      // beats, and a frame with an empty editor here would read as going backwards.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_23_datasource-database.png',
        [{ selector: '#databaseConnection' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_23_datasource-database.png');

      // ── FRAME rg_30: Output Template tab — output = PDF (Apache FOP) + the pro
      // "Northwind Traders" XSL-FO invoice template (verbatim from the large-scale
      // blog). This matches large-scale.mdx, whose output is Apache FOP PDF.
      // ── The Output Template tab — same progressive teach as the DataSource:
      //    the tab as it opens → the field, untouched → the field, open → the
      //    choice. Nothing is configured until the video has said why.
      await new FluentTester(firstPage)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType');
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
      await firstPage.waitForTimeout(400);

      // ── FRAME rg_27: the Output / Template tab, exactly as it opens ──────────
      // INSET ring for the same reason as rg_18: the sticky header clips an
      // outer ring on the tab strip.
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_27_output-tab.png',
        [{ selector: '#tab-btn-reportingTemplateOutputTab', inset: true }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_27_output-tab.png');

      // (No separate "Output Type untouched" capture — rg_27 already shows the tab
      // with Output Type = None, so a second ringed-but-untouched frame said the
      // same thing. The video dropped that beat; we no longer shoot it.)

      // ── Pick Apache FOP FIRST, so the open list highlights OUR value ─────────
      // Same reasoning as rg_21: the expanded <select> paints its SELECTED option
      // blue, so we choose FOP before opening the list. Every output type still
      // shows (the "everything you would expect" line holds), but the highlighted
      // row is PDF FOP Docs — the one we are configuring.
      await new FluentTester(firstPage)
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.fop2pdf')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor');
      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── FRAME rg_29: the Output Type list OPEN — PDF FOP highlighted, all types
      // still visible. Same native-<select> inline-expand trick as rg_21.
      await expandNativeSelectForShot(firstPage, 'reportOutputType');
      await firstPage.waitForTimeout(250);
      await captureDocsScreenshot(firstPage, 'rg_29_output-type-expanded.png', VIDEO_ASSETS_DIR);
      await restoreNativeSelectAfterShot(firstPage, 'reportOutputType');
      console.log('[frame] rg_29_output-type-expanded.png');

      await new FluentTester(firstPage)
        .sleep(2 * Constants.DELAY_ONE_SECOND)
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', RG_INVOICE_TEMPLATE)
        .sleep(2 * Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      // Ring the Output Type: this beat IS about that choice ("we choose Apache FOP").
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_30_invoice-output-pdf.png',
        [{ selector: '#reportOutputType' }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_30_invoice-output-pdf.png');

      // ── FRAME rg_32: Output Template tab (Apache FOP filled) with "Hey AI, Help
      // Me …" ringed on its own (inset — the button is full-width).
      await captureDocsScreenshotWithHighlights(
        firstPage,
        'rg_32_output-fop-hey-ai.png',
        [{ selector: '#btnAskAiForHelpOutput', inset: true }],
        VIDEO_ASSETS_DIR,
      );
      console.log('[frame] rg_32_output-fop-hey-ai.png');

      // ── FRAME rg_35: a second look at the Apache FOP invoice template — the editor
      // scrolled to the line-item table / totals. output.fop2pdf has no in-app live
      // preview (FOP renders only at generation time), so the rendered invoice PDF
      // itself is the generation payoff — see rg_60 / the output folder.
      await firstPage.evaluate(() => {
        const ed = document.getElementById('codeJarHtmlTemplateEditor');
        if (ed) ed.scrollTop = Math.floor(ed.scrollHeight * 0.55);
      });
      await firstPage.waitForTimeout(500);
      await captureDocsScreenshot(firstPage, 'rg_35_invoice-template-preview.png', VIDEO_ASSETS_DIR);
      console.log('[frame] rg_35_invoice-template-preview.png');

      // ── FRAME rg_40: Generate Reports screen, report picked ──────────────────
      await new FluentTester(firstPage)
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${RG_INVOICE_REPORT_NAME} (input Script File)")`)
        .click(`span.ng-option-label:has-text("${RG_INVOICE_REPORT_NAME} (input Script File)")`)
        .waitOnElementToBecomeEnabled('#btnViewData')
        .waitOnElementToBecomeEnabled('#btnGenerateReports');
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, 'rg_40_invoice-generate.png', VIDEO_ASSETS_DIR);
      console.log('[frame] rg_40_invoice-generate.png');

      // ── FRAME rg_50: View Data — the invoice rows ────────────────────────────
      await new FluentTester(firstPage)
        .click('#btnViewData')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnViewData')
        .clickYesDoThis()
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveData()
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(firstPage, 'rg_50_invoice-viewdata.png', VIDEO_ASSETS_DIR);
      console.log('[frame] rg_50_invoice-viewdata.png');

      // ── FRAME rg_60: generate the invoice PDFs, capture the output ───────────
      // Both processing gates are file-based (CHECK_PROCESSING_LOGS) rather than the
      // UI-banner CHECK_PROCESSING_JAVA: Clear Logs truncates info.log on disk
      // (LogsService.emptyFile), so the start gate waits for THIS run's "Program
      // Started" and the finish gate for its "Execution Ended". This in-process
      // SQLite→FOP run is fast enough that the `.java-started` banner can appear and
      // vanish before Playwright catches it visible — which would hang the start gate.
      await new FluentTester(firstPage)
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_LOGS)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();
      await firstPage.waitForTimeout(600);
      await captureDocsScreenshot(firstPage, 'rg_60_invoice-output-files.png', VIDEO_ASSETS_DIR);
      console.log('[frame] rg_60_invoice-output-files.png');

      // ── FRAME rg_64: one of the invoices we just made, actually opened ──────
      // The payoff of the whole video. Note rg_60 above is the app screen with the
      // logs — it shows no document; this is the first frame in which the viewer
      // sees an invoice. ONE file is the beat: the run makes many and they differ
      // only by data. See FluentTester.screenshotOneGeneratedPdf for why this
      // needs a headed browser.
      await new FluentTester(firstPage).screenshotOneGeneratedPdf(
        path.join(VIDEO_ASSETS_DIR, 'rg_64_invoice-pdf-opened.png'),
      );
      console.log('[frame] rg_64_invoice-pdf-opened.png');

      console.log('[DONE] All 0010-report-generation video frames captured.');
      bodySucceeded = true;
    } finally {
      const cleanupErrors: string[] = [];

      try {
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

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
          await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), RG_INVOICE_REPORT_CODE);
        } catch (e) {
          cleanupErrors.push(`delete report ${RG_INVOICE_REPORT_CODE}: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${RG_CONNECTION_CODE}\\.xml`,
            RG_DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${RG_CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(`Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5b — VIDEO frames for 0010: the Samples shelf (Category-Region Crosstab)
// ─────────────────────────────────────────────────────────────────────────────
//
// The last act of the 0010 video: Leo asks "invoices are one thing — what about
// Excel, Cross Tab, HTML?", and Zeus walks him along the bundled Samples shelf.
// The featured sample is #15 Category-Region Crosstab (script → HTML) — literally
// the Cross Tab report Leo asks for. Flow + selectors mirror samples.spec.ts
// "(15_generate_category_region_crosstab_script2html)"; the capture pattern
// mirrors samples.screens.ts BLOCK 1.
//
// Pure Electron UI — no backend, no Docker, and nothing is created, so there is
// nothing to clean up (same as samples.screens.ts BLOCK 1).
//
// A SEPARATE test from BLOCK 5 on purpose: it shares none of the invoice report's
// setup, and bolting it on would couple two unrelated flows. Both titles start
// "Reporting — video frames — ", so ONE grep still regenerates every frame:
//   E2E_SPEC="reporting.screens.ts"  E2E_GREP="Reporting — video frames"
//
//   rg_70_samples-button.png             Burst screen — "Samples" (#btnBurstSamples) ringed
//   rg_72_samples-crosstab-selected.png  Samples table — the Crosstab row selected
//   rg_74_samples-learn-more-button.png  That row's "Learn More" ringed
//   rg_76_samples-view-configuration-button.png  Learn More modal — "View Configuration" ringed ALONE
//   rg_80_samples-try-it.png             That row's "Try It" ringed
//   rg_78_samples-configuration-open.png The sample's OWN config, on Reporting Settings
//
// ORDER NOTE: rg_78 is captured LAST although the video plays it before rg_80.
// "View Configuration" ROUTES AWAY to /configuration (processing.component.ts
// doSampleViewConfigurationFile), so everything still needed on the Samples page
// must be shot before it.

const RG_CROSSTAB_SAMPLE = 'GENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML'; // #15
const RG_CROSSTAB_SAMPLE_NAME = 'Category-Region Crosstab';

electronBeforeAfterAllTest(
  'Reporting — video frames — samples shelf (Category-Region Crosstab)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);

    // ── FRAME rg_70: the "Samples" button, before we press it ────────────────
    // Reached the screenshot-mode-safe way: the Samples button on the Burst
    // Reports toolbar, NOT #leftMenuSamples — the left menu is zero-size while
    // the Processing sidebar stays collapsed in screenshot mode.
    await ft.gotoBurstScreen().waitOnElementToBecomeVisible('#btnBurstSamples');
    await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      'rg_70_samples-button.png',
      [{ selector: '#btnBurstSamples' }],
      VIDEO_ASSETS_DIR,
    );
    console.log('[frame] rg_70_samples-button.png');

    // ── Open the shelf and select the Crosstab sample ────────────────────────
    await ft
      .click('#btnBurstSamples')
      .waitOnElementToBecomeVisible('#samplesTable')
      .scrollIntoViewIfNeeded(`#tr${RG_CROSSTAB_SAMPLE}`)
      .waitOnElementToContainText(`#td${RG_CROSSTAB_SAMPLE}`, RG_CROSSTAB_SAMPLE_NAME)
      .click(`#tr${RG_CROSSTAB_SAMPLE}`);
    await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

    // Park the selected row just under the sticky thead (#samplesTable thead is
    // position:sticky) so the row leads the frame with the header pinned above.
    await firstPage.evaluate((sel) => {
      const row = document.querySelector(sel) as HTMLElement | null;
      const table = document.getElementById('samplesTable');
      const scroller = table?.parentElement as HTMLElement | null;
      const thead = table?.querySelector('thead') as HTMLElement | null;
      if (!row || !scroller) return;
      const headH = thead ? thead.getBoundingClientRect().height : 40;
      scroller.scrollTop +=
        row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - headH - 6;
    }, `#tr${RG_CROSSTAB_SAMPLE}`);
    await firstPage.waitForTimeout(400);

    // ── FRAME rg_72: the shelf, with the Cross Tab sample selected ───────────
    await captureDocsScreenshot(firstPage, 'rg_72_samples-crosstab-selected.png', VIDEO_ASSETS_DIR);
    console.log('[frame] rg_72_samples-crosstab-selected.png');

    // ── FRAME rg_74: that row's "Learn More" ────────────────────────────────
    await captureDocsScreenshotWithHighlights(
      firstPage,
      'rg_74_samples-learn-more-button.png',
      [{ selector: `#btnSamplesLearnMode${RG_CROSSTAB_SAMPLE}` }],
      VIDEO_ASSETS_DIR,
    );
    console.log('[frame] rg_74_samples-learn-more-button.png');

    // ── FRAME rg_76: the Learn More modal, "View Configuration" ringed ALONE ─
    // (samples.screens.ts rings Notes + this button together for the docs; the
    // video's line is only about View Configuration, so only it is ringed.)
    await ft
      .click(`#btnSamplesLearnMode${RG_CROSSTAB_SAMPLE}`)
      .waitOnElementToBecomeVisible('dp-dialog')
      .waitOnElementToBecomeVisible('#modalInputDetails')
      .waitOnElementToBecomeVisible('#modalOutputDetails')
      .waitOnElementToBecomeVisible(`#div${RG_CROSSTAB_SAMPLE}`)
      .waitOnElementToBecomeVisible(`#btnViewConfigurationFile${RG_CROSSTAB_SAMPLE}`);
    await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400); // let the modal finish painting
    await captureDocsScreenshotWithHighlights(
      firstPage,
      'rg_76_samples-view-configuration-button.png',
      [{ selector: `#btnViewConfigurationFile${RG_CROSSTAB_SAMPLE}` }],
      VIDEO_ASSETS_DIR,
    );
    console.log('[frame] rg_76_samples-view-configuration-button.png');

    // ── FRAME rg_80: "Try It" on the shelf ──────────────────────────────────
    // Captured BEFORE View Configuration, because that one routes away.
    await ft
      .click('#btnCloseSamplesLearnMoreModal')
      .waitOnElementToBecomeInvisible('#btnCloseSamplesLearnMoreModal');
    await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(
      firstPage,
      'rg_80_samples-try-it.png',
      [{ selector: `#btnSampleTryIt${RG_CROSSTAB_SAMPLE}` }],
      VIDEO_ASSETS_DIR,
    );
    console.log('[frame] rg_80_samples-try-it.png');

    // ── FRAME rg_78: the sample's OWN configuration, opened ──────────────────
    // View Configuration routes to /configuration/generalSettingsMenuSelected/…,
    // which lands on GENERAL. The video's line is "you see exactly how the sample
    // was built — its data source, its template", so we step on to Reporting
    // Settings, where those actually live. Otherwise the frame would show a
    // General tab while Zeus talks about data sources.
    await ft
      .click(`#btnSamplesLearnMode${RG_CROSSTAB_SAMPLE}`)
      .waitOnElementToBecomeVisible(`#btnViewConfigurationFile${RG_CROSSTAB_SAMPLE}`)
      .click(`#btnViewConfigurationFile${RG_CROSSTAB_SAMPLE}`)
      .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
      .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
      .sleep(2 * Constants.DELAY_ONE_SECOND)
      .click('#leftMenuReportingSettings')
      .waitOnElementToBecomeVisible('#dsTypes')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, 'rg_78_samples-configuration-open.png', VIDEO_ASSETS_DIR);
    console.log('[frame] rg_78_samples-configuration-open.png');

    console.log('[DONE] 0010 samples-shelf video frames captured.');
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 6 — template-gallery.mdx  (Template Examples Gallery, code-highlighted)
// ─────────────────────────────────────────────────────────────────────────────
//
// Re-captures the Template Gallery screenshots on
//   content/docs/report-generation/template-gallery.mdx
// as `<orig>-dp.png`, replacing the OLD hand-drawn-in-Paint highlight boxes with
// crisp code-driven rings on real semantic IDs (the DataPallas-orange ring recipe
// from captureDocsScreenshotWithHighlights). The gallery modal + output tab are
// already richly instrumented; the only new IDs this needed were the footer
// action-bar container (#templateGalleryFooter) and the tags row
// (#templateGalleryTags), added in templates-gallery-modal.template.html.
//
// Non-app images on the page are NOT reproduced (external sites): Microsoft
// Create gallery (045_47) and Adobe Color (045_55).
//
// Shot → state / ring mapping (docs ROOT images dir):
//   045_45_reporting-template-gallery-dp        Output tab HTML Template row —
//                                               rings #btnAskAiForHelpOutput + #btnOpenTemplateGallery
//   045_50_reporting-template-ai-prompts-dp      Gallery modal (a template previewed) —
//                                               rings the whole action bar #templateGalleryFooter
//   045_00_generate-reports-ai-prompts-dp        Element-scoped crop of #templateGalleryFooter
//   045_70_reporting-ai-templates-approaches-prompt1-dp
//                                               "Get AI Prompt → modify" view, rings #aiPromptContent
//   045_60_reporting-template-ai-prompt-create-html-scratch-prompt2-dp
//                                               "Get AI Prompt → rebuild (from scratch)", rings #aiPromptContent
//
// HOW TO RUN (only this block): set E2E_SPEC="reporting.screens.ts" and
// E2E_GREP="Reporting — docs screenshots — template-gallery.mdx".

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — template-gallery.mdx (Template Examples Gallery)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: plain SQLite Northwind connection + a report ──────────────────
      // The gallery + template editor render off the OUTPUT type alone (no data
      // source needed), so a plain connection + report is enough.
      console.log(`[SETUP] Creating ${RG_DB_VENDOR} connection "${RG_CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        RG_CONNECTION_NAME,
        RG_DB_VENDOR,
      );
      connectionCreated = true;

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      const GALLERY_REPORT_NAME = 'Template Gallery';
      const GALLERY_REPORT_CODE = _.kebabCase(GALLERY_REPORT_NAME); // template-gallery

      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(GALLERY_REPORT_NAME)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // ── Output Template tab, PDF output (HTML-based → gallery + AI help show) ─
      await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), GALLERY_REPORT_CODE)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.pdf')
        .waitOnElementToBecomeVisible('#reportTemplateContainer')
        .waitOnElementToBecomeVisible('#btnAskAiForHelpOutput')
        .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
        .sleep(Constants.DELAY_ONE_SECOND);

      // ── CAPTURE 045_45: HTML Template row — ring ONLY "Examples (Gallery)".
      // inset ring: the button sits flush against the left panel edge, so an outer
      // ring's left side gets clipped — inset paints the ring inside the edges.
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('045_45_reporting-template-gallery'),
        [{ selector: '#btnOpenTemplateGallery', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('045_45_reporting-template-gallery')}`);

      // ── Open the gallery modal, land on a previewed template ─────────────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeEnabled('#btnOpenTemplateGallery')
        .click('#btnOpenTemplateGallery');
      // Some output types show a one-time AI-instructions splash first — confirm it
      // if present, then wait for the carousel.
      const confirmInstructions = firstPage.locator('#btnConfirmAiGalleryInstructions');
      if (await confirmInstructions.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmInstructions.click();
      }
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('.dp-carousel-next')
        .waitOnElementToBecomeEnabled('.dp-carousel-next')
        .waitOnElementToBecomeVisible('#templateGalleryFooter')
        .sleep(2 * Constants.DELAY_ONE_SECOND); // let the iframe preview paint

      // ── CAPTURE 045_50: gallery modal, ring the whole action bar ─────────────
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('045_50_reporting-template-ai-prompts'),
        [{ selector: '#templateGalleryFooter', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('045_50_reporting-template-ai-prompts')}`);

      // ── CAPTURE 045_00: open the "Get AI Prompt To…" dropdown (click the ▲ toggle)
      // so both approaches show, and ring "prompt 1" (modify). ────────────────────
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#btnAiPromptDropdownToggle')
        .click('#btnAiPromptDropdownToggle')
        .waitOnElementToBecomeVisible('#btnAiPromptModify')
        .waitOnElementToBecomeVisible('#btnAiPromptRebuild')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.waitForTimeout(400);
      await captureDocsScreenshotWithHighlights(
        firstPage,
        dp('045_00_generate-reports-ai-prompts'),
        [{ selector: '#btnAiPromptModify', inset: true }],
        DOCS_IMAGES_DIR,
      );
      console.log(`[capture] ${dp('045_00_generate-reports-ai-prompts')}`);
      // close the dropdown so it doesn't linger over the next capture
      await firstPage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      // ── CAPTURE 045_70: "Get AI Prompt → modify" view. Mirrors the proven
      // configuration.spec.ts flow (changeSaveLoadAssertSavedConfiguration): after the
      // view opens, wait for #aiPromptSteps to contain its rendered text — this confirms
      // the markdown view fully painted, avoiding the faded mid-render capture. Scroll
      // the prompt to the top so it reads from the start.
      await new FluentTester(firstPage)
        .waitOnElementToBecomeVisible('#btnGetAiPrompt')
        .click('#btnGetAiPrompt')
        .waitOnElementToBecomeVisible('#aiPromptContainer')
        .waitOnElementToBecomeVisible('#aiPromptContent')
        .waitOnElementToContainText('#aiPromptSteps', 'Tailor Customization Instructions')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.evaluate(() => { const c = document.getElementById('aiPromptContainer'); if (c) c.scrollTop = 0; });
      await firstPage.waitForTimeout(400);
      // Capture the element itself (element.screenshot) — NOT a WithHighlights full-viewport shot.
      // This dialog is a native <dialog showModal> (top layer + ::backdrop); the highlight helper's
      // z-index:20 pulls only the ringed element above the backdrop and leaves the rest dimmed.
      // element.screenshot renders the element's own pixels, bypassing the backdrop entirely.
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('045_70_reporting-ai-templates-approaches-prompt1'),
        '#aiPromptContainer',
        { targetWidth: 1200 },
      );
      console.log(`[capture] ${dp('045_70_reporting-ai-templates-approaches-prompt1')}`);

      // ── CAPTURE 045_60: "Get AI Prompt → rebuild (from scratch)" view. Same as the
      // helper: Back lands on the carousel, then dropdown → Rebuild → wait for the
      // rebuild steps text to render before capturing.
      await new FluentTester(firstPage)
        .click('#btnBackToTemplate')
        .waitOnElementToBecomeVisible('#galleryTemplateCarousel')
        .waitOnElementToBecomeVisible('#btnAiPromptDropdownToggle')
        .click('#btnAiPromptDropdownToggle')
        .waitOnElementToBecomeVisible('#btnAiPromptRebuild')
        .click('#btnAiPromptRebuild')
        .waitOnElementToBecomeVisible('#aiPromptContainer')
        .waitOnElementToBecomeVisible('#aiPromptContent')
        .waitOnElementToContainText('#aiPromptSteps', 'tailor the prompt')
        .sleep(Constants.DELAY_ONE_SECOND);
      await firstPage.evaluate(() => { const c = document.getElementById('aiPromptContainer'); if (c) c.scrollTop = 0; });
      await firstPage.waitForTimeout(400);
      // Element screenshot (see 045_70 note) — clean, no backdrop dimming.
      await captureDocsScreenshotOfElement(
        firstPage,
        dp('045_60_reporting-template-ai-prompt-create-html-scratch-prompt2'),
        '#aiPromptContainer',
        { targetWidth: 1200 },
      );
      console.log(`[capture] ${dp('045_60_reporting-template-ai-prompt-create-html-scratch-prompt2')}`);

      // Close the gallery.
      await new FluentTester(firstPage)
        .click('#btnBackToTemplate')
        .waitOnElementToBecomeVisible('#btnCloseTemplateGallery')
        .click('#btnCloseTemplateGallery')
        .waitOnElementToBecomeInvisible('#templateGalleryModal');

      console.log('[DONE] All template-gallery.mdx screenshots captured.');
      bodySucceeded = true;
    } finally {
      const cleanupErrors: string[] = [];

      try {
        const galleryClose = firstPage.locator('#btnCloseTemplateGallery');
        if (await galleryClose.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await galleryClose.click().catch(() => {});
        }
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

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
          await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), _.kebabCase('Template Gallery'));
        } catch (e) {
          cleanupErrors.push(`delete report template-gallery: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${RG_CONNECTION_CODE}\\.xml`,
            RG_DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${RG_CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(`Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3d — large-scale.mdx  (Step 5: Generate Your Reports — 10,000 seeded invoices)
//
// Re-captures the one screenshot large-scale.mdx still shows in the OLD light UI:
//   25-large-scale-invoices-generate-dp   Processing → Generate Reports → View Data,
//                                         the data grid of 10,000 seeded invoices.
//
// Flow — mirrors exactly what the doc's own Steps 2–5 tell the reader to do:
//   1. Create a plain SQLite Northwind connection (file-based, no Docker, fastest).
//   2. Seed 10,000 invoices with the built-in **Invoice Seeder** — the exact Seed-Data
//      tab flow from Steps 2–4, via ConnectionsTestHelper.seedInvoicesViaConnectionDetails
//      (opens the connection's Seed Data tab → Test Connection → picks the "Invoice
//      Seeder" template → pastes into My Script → Run Script → waits for the run to
//      finish → verifies seed_inv_* appear → closes the modal). The seeder hard-codes
//      N=10000, so the grid shows "Total Rows: 10000".
//   3. Create the report "LargeScaleInvReport" (Report Generation capability) →
//      Reporting Settings → Script (Groovy) datasource → the blog's master query over
//      seed_inv_invoice JOIN seed_inv_customer. The grid's first visible columns match
//      the legacy shot (invoice_id, invoice_date, due_date, status, freight, notes,
//      customer_id, company_name), the rest reachable via the horizontal scroll.
//   4. Processing → Generate Reports → View Data → capture the grid.
//
// The -dp lands NEXT TO the legacy blog image (…/public/images/blog/database-connections/
// mysql-large-scale/), so the docs can show old/new side by side. Once approved, swap the
// <img src> in large-scale.mdx from 25-large-scale-invoices-generate.png → …-dp.png
// (and ideally switch <img> → <Image>).
//
// HOW TO RUN (only this block): set E2E_SPEC="reporting.screens.ts" and
// E2E_GREP="Reporting — docs screenshots — large-scale.mdx".
// ─────────────────────────────────────────────────────────────────────────────

// The -dp saves next to the legacy blog asset, not in public/images/docs/.
const LARGE_SCALE_BLOG_DIR = path.resolve(
  DOCS_IMAGES_DIR,
  '..',
  'blog',
  'database-connections',
  'mysql-large-scale',
);

// A flat report over the seeded invoices — no master/detail, just the rows the
// Generate-Reports "View Data" grid shows. The SELECT + emitted columns match the
// legacy screenshot exactly. Reuses RG_CONNECTION_* (the SQLite Northwind connection
// the seeder ran against) — `ctx.dbSql` is that same connection, so seed_inv_* is there.
const LS_REPORT_NAME = 'LargeScaleInvReport'; // matches the blog's report name → the picker reads "LargeScaleInvReport (input Script File)"
const LS_REPORT_CODE = _.kebabCase(LS_REPORT_NAME); // large-scale-inv-report
const LS_INVOICE_SCRIPT = `
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

def dbSql = ctx.dbSql
def DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd")

// SQLite returns DATE columns as epoch-millis Longs; format them to yyyy-MM-dd so the grid
// reads like the legacy MySQL shot (MySQL returned java.sql.Date, which the grid formats
// automatically). Handles Number (epoch) / Date / already-a-date-string defensively so the
// same script works if this is ever pointed at another vendor.
def toDateStr = { v ->
    if (v == null) return ""
    if (v instanceof Number)         return Instant.ofEpochMilli(((Number) v).longValue()).atZone(ZoneId.systemDefault()).toLocalDate().format(DATE_FMT)
    if (v instanceof java.sql.Date)  return ((java.sql.Date) v).toLocalDate().format(DATE_FMT)
    if (v instanceof java.util.Date) return ((java.util.Date) v).toInstant().atZone(ZoneId.systemDefault()).toLocalDate().format(DATE_FMT)
    def s = v.toString()
    return s.length() >= 10 ? s.substring(0, 10) : s
}

log.info("Large-scale report: reading seeded seed_inv_invoice rows...")

// The master query straight from the MySQL large-scale blog — the flat invoice + bill-to
// columns the Generate-Reports "View Data" grid shows, in the SAME order (so the grid's
// first visible columns are invoice_id … company_name, with the rest behind a horizontal
// scroll, exactly like the legacy shot). The blog's full script also loops line items to
// add Subtotal/Tax/GrandTotal, but those feed the Apache FOP PDF template — NOT this grid
// — so they're omitted here, keeping the 10k-row fetch to a single fast query.
def rows = dbSql.rows("""
    SELECT i.invoice_id, i.invoice_date, i.due_date, i.status, i.freight, i.notes,
           c.customer_id, c.company_name, c.contact_name, c.address, c.city, c.country, c.email
    FROM seed_inv_invoice i
    JOIN seed_inv_customer c ON i.customer_id = c.customer_id
    ORDER BY i.invoice_id
""")

def data = rows.collect { r ->
    def m = new LinkedHashMap<String, Object>(r)
    m.put("invoice_date", toDateStr(m.get("invoice_date")))
    m.put("due_date",     toDateStr(m.get("due_date")))
    m
}
ctx.reportData = data
ctx.reportColumnNames = data ? new ArrayList<>(data[0].keySet()) : []
log.info("Prepared {} invoice rows for the Generate-Reports grid.", data.size())
`;

electronBeforeAfterAllTest(
  'Reporting — docs screenshots — large-scale.mdx (Step 5: 10k invoices)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    let connectionCreated = false;
    let reportCreated = false;
    let bodySucceeded = false;

    try {
      // ── SETUP: plain SQLite Northwind connection ─────────────────────────────
      console.log(`[SETUP] Creating ${RG_DB_VENDOR} connection "${RG_CONNECTION_NAME}"`);
      await ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        new FluentTester(firstPage),
        RG_CONNECTION_NAME,
        RG_DB_VENDOR,
      );
      connectionCreated = true;

      // ── SEED 10,000 invoices via the built-in Invoice Seeder ─────────────────
      // Self-contained: opens the connection's Seed Data tab, Tests it, picks the
      // "Invoice Seeder" template, pastes into My Script, Runs it, waits for the run
      // to finish (Run-Script button re-enable), verifies seed_inv_* appear in the
      // schema tree, closes the modal. N=10000 is hard-coded in invoice-seeder.groovy.
      console.log('[SEED] Seeding 10,000 invoices (invoice-seeder, N=10000)…');
      await ConnectionsTestHelper.seedInvoicesViaConnectionDetails(
        new FluentTester(firstPage),
        RG_CONNECTION_CODE,
        RG_DB_VENDOR,
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      );

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── Create the report (Report Generation capability) ─────────────────────
      await new FluentTester(firstPage)
        .gotoConfigurationReports()
        .click('#btnNew')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnInputValueToContainText('#templateHowTo', 'folder-name')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#templateName')
        .typeText(LS_REPORT_NAME)
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#burstFileName');
      reportCreated = true;

      // ── Reporting Settings → Script (Groovy) datasource over seed_inv_invoice ─
      await ConfigurationTestHelper.loadConfiguration(new FluentTester(firstPage), LS_REPORT_CODE)
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .waitOnElementToContainText('#databaseConnection', RG_CONNECTION_NAME)
        .setCodeJarContentSingleShot('#groovyScriptEditor', LS_INVOICE_SCRIPT)
        .sleep(Constants.DELAY_ONE_SECOND);

      await hideToastsForScreenshots(firstPage);
      await clearErrorLogsForScreenshots(firstPage);

      // ── CAPTURE: Generate Reports → View Data — the 10k-invoice grid ─────────
      // Proven View-Data flow (verbatim from 044_10 / rg_50): the double View-Data
      // with a Clear-Logs in between forces the grid to (re)render its rows.
      await new FluentTester(firstPage)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${LS_REPORT_NAME} (input Script File)")`)
        .click(`span.ng-option-label:has-text("${LS_REPORT_NAME} (input Script File)")`)
        .waitOnElementToBecomeEnabled('#btnViewData')
        .click('#btnViewData')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnViewData')
        .clickYesDoThis()
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveData()
        .sleep(Constants.DELAY_ONE_SECOND);

      await firstPage.waitForTimeout(400);
      await captureDocsScreenshot(
        firstPage,
        dp('25-large-scale-invoices-generate'),
        LARGE_SCALE_BLOG_DIR,
      );
      console.log(`[capture] ${dp('25-large-scale-invoices-generate')} → ${LARGE_SCALE_BLOG_DIR}`);

      bodySucceeded = true;
      console.log('[DONE] large-scale.mdx Step 5 screenshot captured.');
    } finally {
      const cleanupErrors: string[] = [];

      try {
        const modalCloseBtn = firstPage.locator('#btnClose');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await modalCloseBtn.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        }
      } catch (e) {
        cleanupErrors.push(`close open modal: ${e}`);
      }

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
          await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), LS_REPORT_CODE);
        } catch (e) {
          cleanupErrors.push(`delete report ${LS_REPORT_CODE}: ${e}`);
        }
      }

      if (connectionCreated) {
        try {
          await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
            new FluentTester(firstPage),
            `${RG_CONNECTION_CODE}\\.xml`,
            RG_DB_VENDOR,
          );
        } catch (e) {
          cleanupErrors.push(`delete connection ${RG_CONNECTION_CODE}: ${e}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('[CLEANUP] FAILED:\n' + cleanupErrors.join('\n'));
        if (bodySucceeded) {
          throw new Error(`Cleanup failed — resources may be leaked:\n${cleanupErrors.join('\n')}`);
        }
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — (placeholder for the remaining Reporting-area docs targets)
// ─────────────────────────────────────────────────────────────────────────────
//
// report-bursting.mdx, report-distribution-email.mdx, report-distribution-qa.mdx
// and report-distribution-upload.mdx walk the SAME surface plus their
// page-specific tabs (Burst screen, Email Settings, QA, Upload). Append one
// `electronBeforeAfterAllTest('Reporting — docs screenshots — <page>', …)` block
// per docs page, reusing the SETUP / CLEANUP pattern above.

import { test, expect } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConfTemplatesTestHelper } from '../../helpers/areas/conf-templates-test-helper';
import _ from 'lodash';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { assertDashboardRendersCorrectly } from '../../helpers/dashboard-test-helper';

// ─────────────────────────────────────────────────────────────────────────────
// This test follows and asserts the step-by-step tutorial described at:
//   https://datapallas.com/docs/bi-analytics/dashboards
//
// The tutorial source lives at:
//   C:\Projects\kraft-src-company-biz\flowkraft\www\DataPallas.com\content\docs\bi-analytics\dashboards.mdx
//
// The code snippets below (DASHBOARD_SCRIPT, PARAMS_SPEC, DASHBOARD_HTML,
// TABULATOR_DSL, CHART_DSL, PIVOT_DSL) must be 101% identical to the code
// blocks in dashboards.mdx (except for JS template literal escaping of
// `${...}` → `\${...}` and report-code "my-dashboard" vs "dashboard-test").
//
// The test phases mirror the tutorial steps in chronological order so that
// a user manually following the tutorial will hit the same UI flow this test
// exercises:
//   Step 1 → createDbConnection (Test Connection & Fetch Schema)
//   Step 2 → ConfTemplatesTestHelper.createNewTemplate
//   Step 3 → Set datasource type + paste DASHBOARD_SCRIPT
//   Step 4 → Paste PARAMS_SPEC
//   Step 5 → Paste DASHBOARD_HTML
//   Step 6 → Paste TABULATOR_DSL, CHART_DSL, PIVOT_DSL
//   Step 7 → Assert dashboard renders (shareable URL + view in browser)
//   Step 8 → (Share — not automated, visual only)
//
// When updating dashboards.mdx, always cross-check the snippets here and
// vice versa.
// ─────────────────────────────────────────────────────────────────────────────

// ── Inlined config from dashboards.mdx tutorial ──

const DASHBOARD_SCRIPT = `import groovy.sql.Sql

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
}`;

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
}`;

const TABULATOR_DSL = `tabulator('topCustomers') {
  layout "fitColumns"
  columns {
    column { title "Company"; field "company"; headerFilter "input"; widthGrow 2 }
    column { title "Country"; field "country"; headerFilter "list" }
    column { title "Contact"; field "contact" }
    column { title "Orders"; field "orders"; hozAlign "right"; sorter "number" }
    column { title "Revenue"; field "revenue"; hozAlign "right"; sorter "number"; formatter "money"; formatterParams([thousand: ',', symbol: '$', precision: 2]) }
  }
}`;

const CHART_DSL = `chart('revenueTrend') {
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
}`;

const PIVOT_DSL = `pivotTable('orderExplorer') {
  rows 'country'
  cols 'year'
  vals 'revenue'
  aggregatorName 'Sum'
  rendererName 'Table Heatmap'
  rowOrder 'value_z_to_a'
}`;

// Dashboard HTML template — same as dashboard-test but with report-id="my-dashboard"
const DASHBOARD_HTML = `<meta charset="utf-8">
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
    <rb-parameters report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" show-reload="true"></rb-parameters>
  </div>

  <!-- KPI Cards — all 4 share component-id="atomicValues" (1 fetch, cached), each picks a different field -->
  <div class="kpi-row">
    <div class="kpi-card">
      <p class="kpi-label">Revenue</p>
      <p class="kpi-value">
        <rb-value report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="atomicValues" field="revenue" format="currency"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Orders</p>
      <p class="kpi-value">
        <rb-value report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="atomicValues" field="orders" format="number"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Avg Order Value</p>
      <p class="kpi-value">
        <rb-value report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="atomicValues" field="avgOrderValue" format="currency"></rb-value>
      </p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Customers</p>
      <p class="kpi-value">
        <rb-value report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="atomicValues" field="customers" format="number"></rb-value>
      </p>
    </div>
  </div>

  <!-- Charts -->
  <div class="charts-row">
    <div class="card">
      <h2 class="card-title">Revenue Trend</h2>
      <rb-chart report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="revenueTrend"></rb-chart>
    </div>
    <div class="card">
      <h2 class="card-title">Revenue by Category</h2>
      <rb-chart report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="revenueByCategory"></rb-chart>
    </div>
  </div>

  <!-- Top Customers Table -->
  <div class="table-section">
    <div class="card">
      <h2 class="card-title">Top 10 Customers</h2>
      <rb-tabulator report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="topCustomers"></rb-tabulator>
    </div>
  </div>

  <!-- Order Explorer Pivot -->
  <div class="pivot-section">
    <div class="card">
      <h2 class="card-title">Order Explorer</h2>
      <rb-pivot-table report-id="my-dashboard" api-base-url="http://localhost:9090/api/reports" component-id="orderExplorer"></rb-pivot-table>
    </div>
  </div>
</div>`;

const DASHBOARD_BASE_URL = 'http://localhost:9090';

// ── Test Suite ──

test.describe('DataPallas - Dashboard Report E2E', async () => {

  FluentTester.setGlobalClickWaitMs(Constants.DELAY_ONE_SECOND);

  electronBeforeAfterAllTest(
    '(sqlite) should create, configure, and verify a Northwind Sales Dashboard end-to-end',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage);

      // ── Step 1: Configure the Database Connection ──
      // Connection name matches the tutorial: "Northwind"

      const connectionName = 'Northwind';
      ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
        ft,
        connectionName,
        'sqlite',
      );

      // Test Connection & Fetch Database Schema (as described in the tutorial)
      const connectionFileId = `db-${_.kebabCase(connectionName)}-sqlite\\.xml`;
      ft = ft
        .clickAndSelectTableRow(`#${connectionFileId}`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnTestDbConnection')
        .click('#btnTestDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnTestDbConnection')
        .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'fa-spin')
        .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'fa-spin')
        .waitOnToastToBecomeVisible(
          'success',
          'Successfully connected to the database',
          Constants.DELAY_HUNDRED_SECONDS,
        )
        // Navigate to Database Schema tab to verify schema was loaded (as shown in tutorial)
        .click('#databaseSchemaTab-link')
        .waitOnElementToBecomeInvisible(
          'span:has-text("To load the schema, please ensure your connection details are configured")',
        )
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer')
        .waitOnElementToContainText('#databaseSchemaPicklistContainer', 'Orders')
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      ft = ConfTemplatesTestHelper.createNewTemplate(ft, 'My Dashboard', 'enableMailMergeCapability');

      // ── Phase 2: Configure Report ──
      // Already on My Dashboard config page after template creation

      ft = ft
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes');

      // Set datasource type to Dashboard (auto-sets output type to output.dashboard)
      ft = ft.dropDownSelectOptionHavingValue('#dsTypes', 'ds.dashboard');

      // Set the groovy data-fetching script
      ft = ft
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .setCodeJarContentSingleShot('#groovyScriptEditor', DASHBOARD_SCRIPT);

      // Set report parameters spec (country filter)
      ft = ft
        .waitOnElementToBecomeEnabled('#tabScriptReportParameters-link')
        .click('#tabScriptReportParameters-link')
        .sleep(Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeVisible('#paramsSpecEditor')
        .setCodeJarContentSingleShot('#paramsSpecEditor', PARAMS_SPEC)
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tabScriptCode-link')
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .sleep(Constants.DELAY_ONE_SECOND);

      // Test the groovy script — first click shows "logs not empty" info dialog (logs exist
      // from DB connection test), then params modal appears; second run executes the script
      ft = ft
        .waitOnElementToBecomeVisible('#btnTestScript')
        .click('#btnTestScript')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestScript')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#btnTestQueryRun')
        .click('#btnTestQueryRun')
        .sleep(5 * Constants.DELAY_ONE_SECOND)
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // Configure the dashboard HTML template
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#reportingTemplateOutputTab-link')
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .setCodeJarContentSingleShot('#codeJarHtmlTemplateEditor', DASHBOARD_HTML);

      // Step 6: Configure Tabulator DSL — click main Tabulator tab, then "Tabulator Options" sub-tab
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#reportingTabulatorTab-link')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tabulatorOptionsTab-link')
        .waitOnElementToBecomeVisible('#tabulatorConfigEditor')
        .setCodeJarContentSingleShot('#tabulatorConfigEditor', TABULATOR_DSL);

      // Step 6: Configure Chart DSL — click main Chart tab, then "Chart Options" sub-tab
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#reportingChartTab-link')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#chartOptionsTab-link')
        .waitOnElementToBecomeVisible('#chartConfigEditor')
        .setCodeJarContentSingleShot('#chartConfigEditor', CHART_DSL);

      // Step 6: Configure Pivot Table DSL — click main Pivot Table tab, then "Pivot Table Options" sub-tab
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#reportingPivotTableTab-link')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#pivotTableOptionsTab-link')
        .waitOnElementToBecomeVisible('#pivotTableConfigEditor')
        .setCodeJarContentSingleShot('#pivotTableConfigEditor', PIVOT_DSL);

      // Wait for all configs to save
      ft = ft.sleep(3 * Constants.DELAY_ONE_SECOND);

      // ── Phase 3: Assert Dashboard Works ──

      // 3a. Assert via Shareable Dashboard URL
      ft.actions.push(async () => {
        const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();

        try {
          await SelfServicePortalsTestHelper.waitForServerReady(
            page,
            `${DASHBOARD_BASE_URL}/dashboard/my-dashboard`,
            30,
            2000,
          );

          await page.goto(`${DASHBOARD_BASE_URL}/dashboard/my-dashboard`, {
            timeout: 30000,
            waitUntil: 'networkidle',
          });

          // Assert page title matches report code
          await expect(page).toHaveTitle('my-dashboard');

          // Assert rb-dashboard web component is present
          await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });

          // Run shared dashboard assertions — default "-- All --" (unfiltered)
          await assertDashboardRendersCorrectly(page, 'my-dashboard');

          // ── Exercise the country parameter filter ──

          // Select "Germany" in the country dropdown
          await page.selectOption('#country', 'Germany');

          // Click Reload → cancel (click No) — dashboard should NOT refresh
          await page.click('#btnReloadDashboard');
          await expect(page.locator('#btnCancelReload')).toBeVisible({ timeout: 5000 });
          await page.click('#btnCancelReload');

          // Click Reload again → confirm (click Yes) — dashboard refreshes with Germany filter
          await page.click('#btnReloadDashboard');
          await expect(page.locator('#btnConfirmReload')).toBeVisible({ timeout: 5000 });
          await page.click('#btnConfirmReload');

          // Wait for filtered data to load
          await page.waitForTimeout(5000);

          // Assert Germany-filtered data across all components
          await assertDashboardRendersCorrectly(page, 'my-dashboard', 'Germany');
        } finally {
          await SelfServicePortalsTestHelper.closeExternalBrowser(browser);
        }
      });

      // 3b. Assert via "View in Browser" (template preview URL)
      ft.actions.push(async () => {
        const { browser, page } = await SelfServicePortalsTestHelper.createExternalBrowser();

        try {
          const viewUrl = `${DASHBOARD_BASE_URL}/api/reports/view-template?path=templates/reports/my-dashboard/my-dashboard-dashboard.html`;

          await SelfServicePortalsTestHelper.waitForServerReady(
            page,
            viewUrl,
            30,
            2000,
          );

          await page.goto(viewUrl, {
            timeout: 30000,
            waitUntil: 'networkidle',
          });

          // Run shared dashboard assertions (DOM + API)
          await assertDashboardRendersCorrectly(page, 'my-dashboard');
        } finally {
          await SelfServicePortalsTestHelper.closeExternalBrowser(browser);
        }
      });

      // ── Phase 4: Cleanup ──

      ft = ConfTemplatesTestHelper.deleteTemplate(ft, 'my-dashboard');

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(connectionName)}-sqlite\\.xml`,
        'sqlite',
      );

      return ft;
    },
  );
});


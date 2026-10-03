// Dashboard Demo 01, Executive Overview: what a person does in the Canvas to rebuild it (section 9.3).
// Generated from the shipped canvas and DSL files of g-dd-executive-overview, then reviewed; the data is the recipe,
// recipe-runner.ts is what knows the controls.
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

export const recipe: Recipe = {
  id: 'dd-executive-overview',
  nn: 1,
  title: 'Executive Overview',
  steps: [
    {
      kind: 'filters',
      via: 'dsl',
      params: [],
      dsl: `reportParameters {
  parameter(id: 'year', type: 'Date', label: 'Year', defaultValue: '{dataToday:startOf year}') {
    constraints(required: true)
    ui(control: 'select', options: 'SELECT DISTINCT CAST(date_trunc(\\'year\\', order_ts) AS VARCHAR) AS value, CAST(year(order_ts) AS VARCHAR) AS label FROM dash_demo.orders ORDER BY value DESC')
  }
}
`,
      shot: {
        title: 'The dashboard\'s filters',
        caption: 'Open **Filters**, switch to the code view and paste the filters (Year).',
      },
    },
    {
      kind: 'addElement',
      element: 'text',
      key: 'w-dd01-text-title',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      text: `## Executive Overview

Revenue is up about 18% on the same nine months last year, and everything is on target except APAC sales and receivables.`,
      shot: { title: 'Add a text', caption: 'From **Elements**, add a text and write its words.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-revenue',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT date_trunc('year', o.order_ts) AS year_start,
       round(sum(o.total_amount), 2) AS revenue
FROM dash_demo.orders o
WHERE o.status <> 'cancelled'
  AND year(o.order_ts) >= year(least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))) - 1
  AND CAST(o.order_ts AS DATE) <= CASE WHEN year(o.order_ts) = year(least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))) THEN least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a)) ELSE least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 1 YEAR END
GROUP BY 1
ORDER BY 1`,
      shot: {
        title: 'The query for revenue',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'trend',
      shot: { title: 'Show revenue as trend', caption: 'Under **Visualize as**, choose **trend**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'trend',
      config: {
        dateField: 'year_start',
        valueField: 'revenue',
        format: 'currency',
        label: 'Revenue YTD vs last year',
      },
      shot: {
        title: 'Set up revenue',
        caption: 'On the **Display** tab, set the trend\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-revenue-vs-target',
      table: 'dash_demo.orders',
      grid: { x: 3, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round((SELECT sum(o.total_amount) FROM dash_demo.orders o
                WHERE o.status <> 'cancelled'
                  AND year(o.order_ts) = year(CAST(\${year} AS DATE)))
       / (SELECT sum(t.revenue_target) FROM dash_demo.sales_targets t
          WHERE year(t.month) = year(CAST(\${year} AS DATE))), 4) AS pct_of_target`,
      shot: {
        title: 'The query for revenue vs target',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'progress',
      shot: {
        title: 'Show revenue vs target as progress',
        caption: 'Under **Visualize as**, choose **progress**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'progress',
      config: { field: 'pct_of_target', goal: 1, label: 'Revenue vs annual target', format: 'percent' },
      shot: {
        title: 'Set up revenue vs target',
        caption: 'On the **Display** tab, set the progress\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-mrr',
      table: 'dash_demo.subscriptions',
      grid: { x: 6, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on subscriptions',
        caption: 'In the schema browser, pick **subscriptions**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(s.mrr), 2) AS mrr
FROM dash_demo.subscriptions s
WHERE s.start_date <= least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))
  AND (s.cancel_date IS NULL OR s.cancel_date > least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a)))`,
      shot: {
        title: 'The query for mrr',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show mrr as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'mrr', numberLabel: 'MRR', numberFormat: 'currency' },
      shot: {
        title: 'Set up mrr',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-dso',
      table: 'dash_demo.invoices',
      grid: { x: 9, y: 1, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on invoices',
        caption: 'In the schema browser, pick **invoices**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(365.0
       * (SELECT sum(i.amount + i.tax_amount) FROM dash_demo.invoices i
          WHERE i.issue_date <= least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))
            AND (i.last_paid_date IS NULL OR i.last_paid_date > least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))))
       / (SELECT sum(i.amount + i.tax_amount) FROM dash_demo.invoices i
          WHERE i.issue_date > least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a)) - INTERVAL 365 DAY
            AND i.issue_date <= least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))), 2) AS dso_days`,
      shot: {
        title: 'The query for dso',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show dso as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'dso_days', numberLabel: 'DSO, days', numberFormat: 'number' },
      shot: {
        title: 'Set up dso',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-on-time',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 3, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(1.0 * count(CASE WHEN CAST(o.delivered_ts AS DATE) <= o.promised_date THEN 1 END) / count(*), 4) AS on_time_pct
FROM dash_demo.orders o
WHERE o.delivered_ts IS NOT NULL
  AND year(o.delivered_ts) = year(CAST(\${year} AS DATE))`,
      shot: {
        title: 'The query for on time',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: { title: 'Show on time as gauge', caption: 'Under **Visualize as**, choose **gauge**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'on_time_pct',
        min: 0,
        max: 1,
        label: 'On-time delivery %',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 0.925, color: '#c62828' }, { to: 1, color: '#2e7d32' }],
      },
      shot: {
        title: 'Set up on time',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-headcount',
      table: 'dash_demo.employees',
      grid: { x: 3, y: 3, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on employees',
        caption: 'In the schema browser, pick **employees**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT count(*) AS headcount
FROM dash_demo.employees e
WHERE e.hire_date <= least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a))
  AND (e.termination_date IS NULL OR e.termination_date > least(make_date(year(CAST(\${year} AS DATE)), 12, 31), (SELECT a.as_of FROM dash_demo.as_of a)))`,
      shot: {
        title: 'The query for headcount',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: { title: 'Show headcount as number', caption: 'Under **Visualize as**, choose **number**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'headcount', numberLabel: 'Headcount', numberFormat: 'number' },
      shot: {
        title: 'Set up headcount',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-gross-margin',
      table: 'dash_demo.order_lines',
      grid: { x: 6, y: 3, w: 3, h: 2 },
      shot: {
        title: 'Start a widget on order_lines',
        caption: 'In the schema browser, pick **order_lines**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(sum(l.line_amount - l.line_cost) / sum(l.line_amount), 4) AS gross_margin_pct
FROM dash_demo.order_lines l
JOIN dash_demo.orders o USING (order_id)
WHERE o.status <> 'cancelled'
  AND year(o.order_ts) = year(CAST(\${year} AS DATE))`,
      shot: {
        title: 'The query for gross margin',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'number',
      shot: {
        title: 'Show gross margin as number',
        caption: 'Under **Visualize as**, choose **number**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'number',
      config: { numberField: 'gross_margin_pct', numberLabel: 'Gross margin %', numberFormat: 'percent' },
      shot: {
        title: 'Set up gross margin',
        caption: 'On the **Display** tab, set the number\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-kpi-sla-met',
      table: 'dash_demo.support_tickets',
      grid: { x: 9, y: 3, w: 3, h: 3 },
      shot: {
        title: 'Start a widget on support_tickets',
        caption: 'In the schema browser, pick **support_tickets**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT round(1.0 * count(CASE WHEN NOT t.sla_breached THEN 1 END) / count(*), 4) AS sla_met_pct
FROM dash_demo.support_tickets t
WHERE year(t.opened_ts) = year(CAST(\${year} AS DATE))`,
      shot: {
        title: 'The query for sla met',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'gauge',
      shot: { title: 'Show sla met as gauge', caption: 'Under **Visualize as**, choose **gauge**.' },
    },
    {
      kind: 'displayConfig',
      widget: 'gauge',
      config: {
        field: 'sla_met_pct',
        min: 0,
        max: 1,
        label: 'SLA met %',
        gaugeFormat: 'percent',
        gaugeBands: [{ to: 0.9, color: '#c62828' }, { to: 1, color: '#2e7d32' }],
      },
      shot: {
        title: 'Set up sla met',
        caption: 'On the **Display** tab, set the gauge\'s fields, label and format.',
      },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-chart-revenue-vs-target',
      table: 'dash_demo.orders',
      grid: { x: 0, y: 6, w: 12, h: 4 },
      shot: {
        title: 'Start a widget on orders',
        caption: 'In the schema browser, pick **orders**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'sql',
      sql: `SELECT strftime(a.month, '%Y-%m') AS month,
       round(a.revenue, 2) AS revenue,
       round(t.revenue_target, 2) AS revenue_target
FROM (SELECT date_trunc('month', o.order_ts) AS month, sum(o.total_amount) AS revenue
      FROM dash_demo.orders o
      WHERE o.status <> 'cancelled'
        AND year(o.order_ts) = year(CAST(\${year} AS DATE))
      GROUP BY 1) a
LEFT JOIN (SELECT s.month AS month, sum(s.revenue_target) AS revenue_target
           FROM dash_demo.sales_targets s
           WHERE year(s.month) = year(CAST(\${year} AS DATE))
           GROUP BY 1) t ON t.month = a.month
ORDER BY a.month`,
      shot: {
        title: 'The query for revenue vs target',
        caption: 'Open Finetune → SQL and paste the query. It needs more than the Visual tab offers, so this one is SQL: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'chart',
      shot: {
        title: 'Show revenue vs target as chart',
        caption: 'Under **Visualize as**, choose **chart**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'chart',
      config: {
        dslConfig: {
          type: 'bar',
          data: {
            labelField: 'month',
            datasets: [
              { field: 'revenue', label: 'Revenue', type: 'bar' },
              { field: 'revenue_target', label: 'Target', type: 'line' },
            ],
          },
          options: { plugins: { title: { display: true, text: 'Revenue actual vs target per month' } } },
        },
      },
      dsl: `chart {
  type 'bar'
  data {
    labelField 'month'
    datasets {
      dataset {
        field 'revenue'
        label 'Revenue'
        type 'bar'
      }
      dataset {
        field 'revenue_target'
        label 'Target'
        type 'line'
      }
    }
  }
  options {
    plugins {
      title {
        display true
        text 'Revenue actual vs target per month'
      }
    }
  }
}
`,
      shot: {
        title: 'Set up revenue vs target',
        caption: 'On the **Display** tab, set the chart\'s type, axes, title and legend (the code view says it in one paste).',
      },
    },
    {
      kind: 'addElement',
      element: 'divider',
      key: 'w-dd01-divider',
      grid: { x: 0, y: 10, w: 12, h: 1 },
      shot: { title: 'Add a divider', caption: 'From **Elements**, add a divider.' },
    },
    {
      kind: 'pickTable',
      key: 'w-dd01-table-off-target',
      table: 'dash_demo.as_of',
      grid: { x: 0, y: 11, w: 12, h: 3 },
      shot: {
        title: 'Start a widget on as_of',
        caption: 'In the schema browser, pick **as_of**: any table will do, the query below replaces it.',
      },
    },
    {
      kind: 'script',
      script: `// One row per area: the KPI the board judges it on, its target from kpi_targets, and on or off
// track. Ten KPIs are ten different questions, which is why this widget asks them itself instead of
// being one query.
def selectedYear = (year && year.length() >= 4) ? (year.substring(0, 4) as Integer)
        : (dbSql.firstRow("SELECT year(as_of) AS y FROM dash_demo.as_of").y as Integer)

// The day the year is read at: its last day, or the data's today while the year is still running.
def cutoff = dbSql.firstRow("SELECT least(make_date(?, 12, 31), (SELECT as_of FROM dash_demo.as_of)) AS d",
        [selectedYear]).d

def one = { String sql, List binds -> def row = dbSql.firstRow(sql, binds); row == null ? null : row[0] }

// Revenue against plan, per region, from the monthly targets.
def attainment = [:]
dbSql.eachRow("""SELECT t.region AS region,
       round(100.0 * sum(o.actual) / sum(t.revenue_target), 2) AS pct
FROM dash_demo.sales_targets t
LEFT JOIN (SELECT date_trunc('month', o.order_ts) AS m, g.region AS region, sum(o.total_amount) AS actual
           FROM dash_demo.orders o
           JOIN dash_demo.geo_cities g USING (city_id)
           WHERE o.status <> 'cancelled'
           GROUP BY 1, 2) o ON o.m = t.month AND o.region = t.region
WHERE year(t.month) = ?
GROUP BY 1""", [selectedYear]) { row -> attainment[row.region] = row.pct }

def grossMargin = one("""SELECT round(100.0 * sum(l.line_amount - l.line_cost) / sum(l.line_amount), 2)
FROM dash_demo.order_lines l
JOIN dash_demo.orders o USING (order_id)
WHERE o.status <> 'cancelled'
  AND year(o.order_ts) = ?""", [selectedYear])

def dso = one("""SELECT round(365.0
       * (SELECT sum(amount + tax_amount) FROM dash_demo.invoices
          WHERE issue_date <= ? AND (last_paid_date IS NULL OR last_paid_date > ?))
       / (SELECT sum(amount + tax_amount) FROM dash_demo.invoices
          WHERE issue_date > ? - INTERVAL 365 DAY AND issue_date <= ?), 2)""",
        [cutoff, cutoff, cutoff, cutoff])

def onTime = one("""SELECT round(100.0 * count(CASE WHEN CAST(delivered_ts AS DATE) <= promised_date THEN 1 END) / count(*), 2)
FROM dash_demo.orders
WHERE delivered_ts IS NOT NULL
  AND year(delivered_ts) = ?""", [selectedYear])

def slaMet = one("""SELECT round(100.0 * count(CASE WHEN NOT sla_breached THEN 1 END) / count(*), 2)
FROM dash_demo.support_tickets
WHERE year(opened_ts) = ?""", [selectedYear])

// Churn: the average of the months in which a subscription was cancelled, each against the
// subscriptions that were live when that month began.
def churn = one("""SELECT round(avg(pct), 2) FROM (
    SELECT 100.0 * count(*) /
           (SELECT count(*) FROM dash_demo.subscriptions s2
            WHERE s2.start_date < m AND (s2.cancel_date IS NULL OR s2.cancel_date >= m)) AS pct
    FROM (SELECT DISTINCT date_trunc('month', cancel_date) AS m FROM dash_demo.subscriptions
          WHERE year(cancel_date) = ?) months
    JOIN dash_demo.subscriptions s ON date_trunc('month', s.cancel_date) = months.m
    GROUP BY m)""", [selectedYear])

// Attrition: the people who left over the twelve months to the cutoff, against the people employed at it.
def attrition = one("""SELECT round(100.0 * (SELECT count(*) FROM dash_demo.employees
       WHERE termination_date >= ? - INTERVAL 365 DAY AND termination_date <= ?)
     / (SELECT count(*) FROM dash_demo.employees
        WHERE hire_date <= ? AND (termination_date IS NULL OR termination_date > ?)), 2)""",
        [cutoff, cutoff, cutoff, cutoff])

def measured = [
    'EMEA|revenue_vs_plan'      : attainment['EMEA'],
    'NA|revenue_vs_plan'        : attainment['NA'],
    'APAC|revenue_vs_plan'      : attainment['APAC'],
    'LATAM|revenue_vs_plan'     : attainment['LATAM'],
    'Company|gross_margin'      : grossMargin,
    'Finance|days_sales_outstanding': dso,
    'Operations|on_time_delivery'   : onTime,
    'Support|sla_met'           : slaMet,
    'Company|monthly_churn'     : churn,
    'People|yearly_attrition'   : attrition,
]

def rows = []
dbSql.eachRow("SELECT area, kpi, target, direction, unit FROM dash_demo.kpi_targets") { target ->
    def actual = measured[target.area + '|' + target.kpi]
    def higherIsBetter = target.direction == 'higher_is_better'
    def onTrack = actual == null ? null
            : (higherIsBetter ? actual >= target.target : actual <= target.target)
    rows << [
        'Area'   : target.area,
        'KPI'    : target.kpi.replace('_', ' '),
        'Actual' : actual,
        'Target' : target.target,
        'Unit'   : target.unit,
        'Status' : onTrack == null ? 'no reading' : (onTrack ? 'on track' : 'off target'),
    ]
}

// The areas off target first: they are what the reader came for.
rows.sort { a, b -> (a.Status == 'off target' ? 0 : 1) <=> (b.Status == 'off target' ? 0 : 1) ?: a.Area <=> b.Area }
rows`,
      shot: {
        title: 'The script for off target',
        caption: 'Open Finetune → Script and paste the script. It needs more than the Visual tab offers, so this one is a script: copy it.',
      },
    },
    {
      kind: 'visualizeAs',
      widget: 'tabulator',
      shot: {
        title: 'Show off target as tabulator',
        caption: 'Under **Visualize as**, choose **tabulator**.',
      },
    },
    {
      kind: 'displayConfig',
      widget: 'tabulator',
      config: { dslConfig: { layout: 'fitColumns', autoColumns: true, theme: 'modern' } },
      shot: {
        title: 'Set up off target',
        caption: 'On the **Display** tab, set the table\'s layout, page size and columns.',
      },
    },
    {
      kind: 'layout',
      grids: [
        { x: 0, y: 0, w: 12, h: 1 },
        { x: 0, y: 1, w: 3, h: 2 },
        { x: 3, y: 1, w: 3, h: 2 },
        { x: 6, y: 1, w: 3, h: 2 },
        { x: 9, y: 1, w: 3, h: 2 },
        { x: 0, y: 3, w: 3, h: 3 },
        { x: 3, y: 3, w: 3, h: 2 },
        { x: 6, y: 3, w: 3, h: 2 },
        { x: 9, y: 3, w: 3, h: 3 },
        { x: 0, y: 6, w: 12, h: 4 },
        { x: 0, y: 10, w: 12, h: 1 },
        { x: 0, y: 11, w: 12, h: 3 },
      ],
      shot: { title: 'Arrange the dashboard', caption: 'Drag and resize each tile to its place.' },
    },
    {
      kind: 'publish',
      shot: {
        title: 'Publish',
        caption: 'Press **Publish** and confirm. The dashboard has its own page.',
      },
    },
  ],
};

export default recipe;
